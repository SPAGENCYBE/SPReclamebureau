// SP Reclamebureau — webshop-backend (Cloudflare Worker)
//
// Routes
//   GET  /api/health
//   GET  /api/products                 catalogus voor de webshop
//   POST /api/configure                {code, options} -> volgende keuzes + verkoopprijs
//   POST /api/upload                   multipart "file" -> {key, name, size}
//   GET  /api/files/:key?sig=          drukbestand downloaden (voor Probo)
//   POST /api/checkout                 winkelmand + klantgegevens -> Mollie-betaallink
//   POST /api/mollie/webhook           Mollie meldt betaalstatus -> bij "paid" order naar Probo
//   POST /api/probo/callback?sig=      Probo meldt orderstatus
//   GET  /api/order/:id?t=             status voor de bedankpagina
//   GET  /api/admin/probo-products?key=   volledige Probo-productlijst (beheer)
//   GET  /api/admin/orders?key=           laatste bestellingen (beheer)

import { getCatalog, buildCatalog, findCatalogItem } from './catalog.js';
import { pickPurchasePrice, salesPrice, orderTotals, round2, vatRate, isExempt } from './pricing.js';
import * as probo from './probo.js';
import * as mollie from './mollie.js';
import { notifyPaid, notifyNewTransfer } from './mail.js';
import { adminPage } from './admin.js';
import { checkFiles } from './files.js';
import * as accounts from './accounts.js';
import { invoiceHtml } from './invoice.js';
import { fillImages, serveThumb, thumbIndex } from './images.js';
import { putFile, hasFile, getFile, maxUpload } from './storage.js';

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// ---------- helpers ----------

function cors(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://spreclamebureau.be')
    .split(',')
    .map((s) => s.trim());
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) },
  });
}

function rid(len) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(env, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SIGNING_SECRET || 'dev-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function cleanOptions(options) {
  if (!Array.isArray(options) || options.length > 40) return null;
  const out = [];
  for (const o of options) {
    if (!o || typeof o.code !== 'string' || !/^[a-z0-9_.-]{1,80}$/i.test(o.code)) return null;
    const item = { code: o.code };
    if (o.value !== undefined && o.value !== null && o.value !== '') {
      const v = String(o.value);
      if (v.length > 40) return null;
      item.value = v;
    }
    out.push(item);
  }
  return out;
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max || 120) : '';
}

/**
 * PAYMENT_MODE: "mollie" (online betalen), "transfer" (overschrijving) of "test".
 * "test" wordt genegeerd zodra Probo op productie staat, zodat er nooit gratis echte orders kunnen vertrekken.
 */
function paymentMode(env) {
  const m = env.PAYMENT_MODE || 'mollie';
  if (m === 'test' && env.PROBO_ORDER_TYPE === 'production') return 'transfer';
  return ['mollie', 'transfer', 'test'].includes(m) ? m : 'mollie';
}

/** Belgische gestructureerde mededeling +++123/4567/89012+++ (10 cijfers + modulo 97). */
export function structuredReference() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  const base = String((a[0] % 100000) * 100000 + (a[1] % 100000)).padStart(10, '0');
  const check = Number(BigInt(base) % 97n) || 97;
  const s = base + String(check).padStart(2, '0');
  return `+++${s.slice(0, 3)}/${s.slice(3, 7)}/${s.slice(7)}+++`;
}

/** Bedankpagina op de site waar besteld werd (alleen toegelaten sites), anders de hoofdsite. */
function thanksBase(env, returnUrl) {
  try {
    const u = new URL(String(returnUrl || ''));
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    if (allowed.includes(u.origin) && /\/bedankt\.html$/.test(u.pathname)) return u.origin + u.pathname;
  } catch {
    /* ongeldige url */
  }
  return `${env.SITE_URL}/bedankt.html`;
}

const isAdmin = (env, url) => env.ADMIN_KEY && url.searchParams.get('key') === env.ADMIN_KEY;

async function getOrder(env, id) {
  const raw = await env.ORDERS.get(`order:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveOrder(env, order) {
  order.updated_at = new Date().toISOString();
  const isTest = (order.payment && order.payment.method === 'test') || env.PROBO_ORDER_TYPE !== 'production';
  if (order.paid_at && !order.invoice_no && env.SELLER_VAT && !isTest) {
    // Doorlopende factuurnummering per jaar en per onderneming: 2026-0001, 2026-0002, ...
    // Bij een nieuwe onderneming (ander btw-nummer, bv. de CommV) begint de nummering opnieuw.
    const year = order.paid_at.slice(0, 4);
    const ckey = `invoice:counter:${String(env.SELLER_VAT).replace(/\D/g, '')}:${year}`;
    const n = Number((await env.ORDERS.get(ckey)) || 0) + 1;
    await env.ORDERS.put(ckey, String(n));
    order.invoice_vat = env.SELLER_VAT;
    order.invoice_seller = { name: env.SELLER_NAME, legal: env.SELLER_LEGAL, address: env.SELLER_ADDRESS, vat: env.SELLER_VAT };
    order.invoice_no = `${year}-${String(n).padStart(4, '0')}`;
    order.invoice_date = order.paid_at.slice(0, 10);
  }
  await env.ORDERS.put(`order:${order.id}`, JSON.stringify(order));
}

/** Configureert bij Probo en zet de prijs om naar onze verkoopprijs. */
async function priced(env, code, options) {
  const { product } = await probo.configure(env, code, options);
  const result = {
    code,
    can_order: !!product.can_order,
    amount: product.amount,
    width: product.width,
    height: product.height,
    available_options: product.available_options || [],
    selected_options: product.selected_options || [],
    upload: product.upload ?? null,
    uploaders: (product.uploaders || []).map((u) => ({
      type: u.type,
      amount: u.amount,
      width: u.width,
      height: u.height,
      minimal_dpi: u.minimal_dpi,
      bleed: [u.bleed_top, u.bleed_right, u.bleed_bottom, u.bleed_left],
    })),
    price: null,
  };
  if (product.can_order) {
    const pick = pickPurchasePrice(product);
    if (pick) {
      const p = salesPrice(pick.purchase, env);
      result.price = { excl: p.excl, incl: p.incl, production_key: pick.key };
      result._purchase = pick.purchase; // intern, wordt niet naar de browser gestuurd
    }
  }
  return result;
}

// ---------- route handlers ----------

async function handleConfigure(req, env) {
  const body = await req.json().catch(() => null);
  const item = body && await findCatalogItem(env, body.code);
  if (!item) return json({ error: 'Onbekend product' }, 400);
  const options = cleanOptions(body.options || []);
  if (!options) return json({ error: 'Ongeldige opties' }, 400);
  const r = await priced(env, item.code, options);
  delete r._purchase;
  return json(r);
}

async function handleUpload(req, env) {
  const form = await req.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'Geen bestand ontvangen' }, 400);
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return json({ error: 'Alleen PDF, JPG of PNG' }, 400);
  const max = maxUpload(env);
  if (file.size > max) return json({ error: `Bestand is groter dan ${max / 1024 / 1024} MB` }, 400);
  const key = `${new Date().toISOString().slice(0, 10)}/${rid(12)}.${ext}`;
  await putFile(env, key, file, { name: str(file.name, 200) });
  return json({ key, name: str(file.name, 200), size: file.size });
}

async function handleFile(env, key, url) {
  if (!/^[0-9-]{10}\/[0-9a-f]{24}\.(pdf|jpg|png)$/.test(key)) return new Response('Not found', { status: 404 });
  if (url.searchParams.get('sig') !== (await hmac(env, `file:${key}`))) {
    return new Response('Forbidden', { status: 403 });
  }
  const obj = await getFile(env, key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.contentType || 'application/octet-stream' },
  });
}

async function registerOrder(env, order, d, auth) {
  await env.ORDERS.put(`recent:${d.getTime()}:${order.id}`, order.id, { expirationTtl: 60 * 60 * 24 * 365 });
  if (auth) await accounts.linkOrder(env, auth.user, order.id);
}

async function handleCheckout(req, env) {
  const auth = await accounts.sessionUser(env, req);
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return json({ error: 'Winkelmand is leeg of ongeldig' }, 400);
  }
  const c = body.customer || {};
  const a = body.address || {};
  const customer = { email: str(c.email, 160), phone: str(c.phone, 40), vat_number: str(c.vat_number, 30) };
  const address = {
    company: str(a.company),
    first_name: str(a.first_name, 60),
    last_name: str(a.last_name, 60),
    street: str(a.street),
    house_number: str(a.house_number, 15),
    addition: str(a.addition, 15),
    postal_code: str(a.postal_code, 12),
    city: str(a.city, 80),
    country: ['BE', 'NL', 'LU', 'FR', 'DE'].includes(a.country) ? a.country : 'BE',
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) return json({ error: 'Ongeldig e-mailadres' }, 400);
  for (const f of ['first_name', 'last_name', 'street', 'house_number', 'postal_code', 'city']) {
    if (!address[f]) return json({ error: 'Vul het volledige leveringsadres in' }, 400);
  }
  if (!body.accept_terms) return json({ error: 'Gelieve de algemene voorwaarden te aanvaarden' }, 400);

  // Elke regel opnieuw bij Probo prijzen: de browser bepaalt nooit de prijs.
  const lines = [];
  for (const it of body.items) {
    const item = await findCatalogItem(env, it && it.code);
    const options = cleanOptions(it && it.options);
    if (!item || !options) return json({ error: 'Ongeldig product in winkelmand' }, 400);
    const r = await priced(env, item.code, options);
    if (!r.can_order || !r.price) return json({ error: `${item.title} is niet volledig samengesteld` }, 400);
    const uploaderType = (r.uploaders && r.uploaders[0] && r.uploaders[0].type) || 'single';
    const files = Array.isArray(it.files) ? it.files.slice(0, 4) : [];
    const cleanFiles = [];
    for (const f of files) {
      const key = str(f && f.key, 80);
      if (!(await hasFile(env, key))) return json({ error: 'Een drukbestand is niet (meer) gevonden. Upload opnieuw.' }, 400);
      const sig = await hmac(env, `file:${key}`);
      cleanFiles.push({
        key,
        name: str(f.name, 200),
        side: f.side === 'back' ? 'back' : 'front',
        ...(f.swap ? { swap: true } : {}),
        uri: `${env.WORKER_URL}/api/files/${key}?sig=${sig}`,
      });
    }
    let uploader = null;
    if (it.uploader && it.uploader.id) {
      const s = await getUploader(env, it.uploader.id);
      if (!s || it.uploader.token !== (await hmac(env, `uploader:${s.id}`)) || s.code !== item.code || JSON.stringify(s.options) !== JSON.stringify(options)) {
        return json({ error: `De bestanden voor ${item.title} horen niet bij deze samenstelling. Upload opnieuw.` }, 400);
      }
      if (s.status === 'rejected') return json({ error: `De bestanden voor ${item.title} zijn afgekeurd. Upload opnieuw.` }, 400);
      const last = (s.callbacks || []).slice(-1)[0];
      const names = [];
      for (const pr of (last && last.data && last.data.products) || []) {
        for (const side of ['front_side', 'back_side']) {
          const f = pr[side] && pr[side].file;
          if (f && f.file_name) names.push({ side: side === 'back_side' ? 'back' : 'front', name: String(f.file_name).slice(0, 200), preview: f.preview_medium_url || f.preview_url || null });
        }
      }
      uploader = { id: s.id, external_id: s.external_id, status: s.status, files: names };
    } else {
      const fileError = checkFiles(uploaderType, cleanFiles, item.title);
      if (fileError) return json({ error: fileError }, 400);
    }
    lines.push({
      code: item.code,
      title: item.title,
      options,
      summary: (r.selected_options || [])
        .map((o) => (o.value !== undefined && o.value !== null && o.value !== '' ? `${o.name || o.code}: ${o.value}` : o.name || o.code))
        .join(' · ')
        .slice(0, 300),
      amount: r.amount,
      uploader_type: uploaderType,
      uploader,
      steps: Array.isArray(it.steps) ? it.steps.slice(0, 40).map((x) => str(x, 60)) : [],
      files: cleanFiles,
      purchase_excl: r._purchase,
      excl: r.price.excl,
      incl: r.price.incl,
      production_key: r.price.production_key,
    });
  }

  const totals = orderTotals(lines, env);
  const d = new Date();
  const id = `SP${d.toISOString().slice(2, 10).replace(/-/g, '')}-${rid(3).toUpperCase()}`;
  const order = {
    id,
    token: rid(16),
    status: 'awaiting_payment',
    created_at: d.toISOString(),
    customer,
    address,
    lines,
    totals,
    remarks: str(body.remarks, 1000),
    user_email: auth ? auth.user.email : null,
    history: [{ at: d.toISOString(), status: 'awaiting_payment' }],
  };
  if (auth && body.save_details) {
    // Gegevens en adres bewaren in het account
    const u = auth.user;
    for (const k of ['company', 'first_name', 'last_name']) if (!u.profile[k] && address[k]) u.profile[k] = address[k];
    if (!u.profile.phone && customer.phone) u.profile.phone = customer.phone;
    if (!u.profile.vat_number && customer.vat_number) u.profile.vat_number = customer.vat_number;
    const same = (a) => a.street === address.street && a.house_number === address.house_number && a.postal_code === address.postal_code;
    if (!(u.addresses || []).some(same)) u.addresses = [...(u.addresses || []), { id: rid(4), label: address.company || 'Leveradres', ...address }].slice(0, 10);
    await accounts.saveUser(env, u);
  }
  order.callback_sig = await hmac(env, `probo:${id}`);
  const thanksUrl = `${thanksBase(env, body.return_url)}?order=${id}&t=${order.token}`;
  const mode = paymentMode(env);

  if (mode === 'transfer') {
    // Betalen via overschrijving: bestelling wacht tot jij de betaling bevestigt in /admin.
    order.status = 'awaiting_transfer';
    order.payment = { method: 'transfer', iban: env.BANK_IBAN || '', bic: env.BANK_BIC || '', name: env.BANK_NAME || 'SP Reclamebureau', reference: structuredReference() };
    order.history[0].status = order.status;
    await saveOrder(env, order);
    await registerOrder(env, order, d, auth);
    await notifyNewTransfer(env, order).catch(() => {});
    return json({ order_id: id, checkout_url: thanksUrl });
  }

  if (mode === 'test') {
    // Testbetaling: meteen "betaald", alleen toegelaten zolang Probo in testmodus staat.
    order.payment = { method: 'test' };
    order.paid_at = new Date().toISOString();
    order.status = 'paid';
    order.history.push({ at: order.paid_at, status: 'paid (test)' });
    await saveOrder(env, order);
    await registerOrder(env, order, d, auth);
    await sendToProbo(env, order);
    await saveOrder(env, order);
    return json({ order_id: id, checkout_url: thanksUrl });
  }

  const payment = await mollie.createPayment(env, {
    amount: totals.total_incl,
    description: `SP Reclamebureau bestelling ${id}`,
    redirectUrl: thanksUrl,
    webhookUrl: `${env.WORKER_URL}/api/mollie/webhook`,
    metadata: { orderId: id },
    email: customer.email,
  });
  order.payment_id = payment.id;
  await saveOrder(env, order);
  await registerOrder(env, order, d, auth);

  return json({ order_id: id, checkout_url: payment._links.checkout.href });
}

async function sendToProbo(env, order) {
  if (order.probo_sent_at) return; // nooit twee keer bestellen
  order.probo_attempts = (order.probo_attempts || 0) + 1;
  const payload = probo.buildOrderPayload(order, env);
  try {
    const res = await probo.placeOrder(env, payload);
    order.probo_sent_at = new Date().toISOString();
    order.probo_response = res;
    order.status = 'sent_to_supplier';
  } catch (e) {
    order.status = 'supplier_error';
    order.probo_error = { message: e.message, status: e.status, body: e.body };
  }
  order.history.push({ at: new Date().toISOString(), status: order.status });
}

async function handleMollieWebhook(req, env) {
  const form = await req.formData().catch(() => null);
  const paymentId = form && form.get('id');
  if (!paymentId || typeof paymentId !== 'string') return new Response('ok');
  // Nooit de inhoud van de webhook vertrouwen: status zelf ophalen bij Mollie.
  const payment = await mollie.getPayment(env, paymentId);
  const orderId = payment.metadata && payment.metadata.orderId;
  const order = orderId && (await getOrder(env, orderId));
  if (!order || order.payment_id !== payment.id) return new Response('ok');

  if (payment.status === 'paid' && !order.paid_at) {
    if (String(payment.amount.value) !== order.totals.total_incl.toFixed(2)) {
      order.status = 'amount_mismatch';
    } else {
      order.paid_at = new Date().toISOString();
      order.status = 'paid';
      order.history.push({ at: order.paid_at, status: 'paid' });
      await saveOrder(env, order);
      await sendToProbo(env, order);
      await notifyPaid(env, order).catch(() => {});
    }
    await saveOrder(env, order);
  } else if (['canceled', 'expired', 'failed'].includes(payment.status) && !order.paid_at) {
    order.status = `payment_${payment.status}`;
    order.history.push({ at: new Date().toISOString(), status: order.status });
    await saveOrder(env, order);
  }
  return new Response('ok');
}

async function handleProboCallback(req, env, url) {
  const data = await req.json().catch(() => null);
  const id = data && data.order && (data.order.reference || data.order.id);
  const order = id && (await getOrder(env, String(id)));
  if (!order || url.searchParams.get('sig') !== order.callback_sig) return json({ ok: false }, 403);
  order.supplier_status = data.status;
  if (data.order.supplier_order_number) order.supplier_order_number = data.order.supplier_order_number;
  if (data.tracking_url || data.order.tracking_url) order.tracking_url = data.tracking_url || data.order.tracking_url;
  if (data.status === 'not_accepted') order.status = 'supplier_rejected';
  order.history.push({ at: new Date().toISOString(), status: `probo:${data.status}`, message: str(data.message, 300) });
  await saveOrder(env, order);
  return json({ ok: true });
}

async function handleOrderStatus(env, id, url) {
  const order = await getOrder(env, id);
  if (!order || url.searchParams.get('t') !== order.token) return json({ error: 'Niet gevonden' }, 404);
  return json({
    id: order.id,
    status: order.status,
    payment: order.status === 'awaiting_transfer' ? { ...order.payment, amount: order.totals.total_incl } : undefined,
    supplier_status: order.supplier_status || null,
    tracking_url: order.tracking_url || null,
    totals: order.totals,
    lines: order.lines.map((l) => ({ title: l.title, summary: l.summary, amount: l.amount, incl: l.incl })),
  });
}

async function handleAdminOrders(env) {
  const list = await env.ORDERS.list({ prefix: 'recent:', limit: 1000 });
  const ids = list.keys.map((k) => k.name.split(':')[2]).reverse().slice(0, 50);
  const orders = [];
  for (const id of ids) {
    const o = await getOrder(env, id);
    if (o) {
      orders.push({
        id: o.id,
        created_at: o.created_at,
        status: o.status,
        supplier_status: o.supplier_status || null,
        customer: o.customer.email,
        name: `${o.address.first_name} ${o.address.last_name}${o.address.company ? ' (' + o.address.company + ')' : ''}`,
        reference: o.payment && o.payment.reference ? o.payment.reference : null,
        lines: o.lines.map((l) => `${l.title}: ${l.summary}`),
        total_incl: o.totals.total_incl,
        purchase_excl: round2(o.lines.reduce((s, l) => s + (l.purchase_excl || 0), 0)),
        probo_error: o.probo_error || null,
      });
    }
  }
  return json({ orders });
}

async function handleMarkPaid(env, url) {
  const order = await getOrder(env, url.searchParams.get('order') || '');
  if (!order) return json({ error: 'Bestelling niet gevonden' }, 404);
  if (!['awaiting_transfer', 'supplier_error', 'supplier_rejected'].includes(order.status)) {
    return json({ error: `Bestelling heeft status ${order.status}` }, 400);
  }
  if (!order.paid_at) {
    order.paid_at = new Date().toISOString();
    order.history.push({ at: order.paid_at, status: 'paid (overschrijving bevestigd)' });
  }
  order.status = 'paid';
  delete order.probo_error;
  delete order.probo_sent_at; // opnieuw versturen toegelaten
  await saveOrder(env, order);
  await sendToProbo(env, order);
  await saveOrder(env, order);
  await notifyPaid(env, order).catch(() => {});
  return json({ ok: true, status: order.status, probo_error: order.probo_error || null });
}

async function withThumbs(env, catalog) {
  const index = await thumbIndex(env);
  return {
    ...catalog,
    products: catalog.products.map((p) => (index[p.code] && index[p.code].v ? { ...p, image: `${env.WORKER_URL}/api/img/${p.code}?v=${index[p.code].v}` } : p)),
  };
}

// ---------- klantenaccounts ----------
const STATUS_NL = {
  awaiting_payment: 'Wacht op betaling', awaiting_transfer: 'Wacht op overschrijving', paid: 'Betaald',
  sent_to_supplier: 'In productie', supplier_error: 'In behandeling', supplier_rejected: 'Probleem met bestand',
  amount_mismatch: 'In behandeling', payment_canceled: 'Betaling geannuleerd', payment_expired: 'Betaling verlopen', payment_failed: 'Betaling mislukt',
};

async function accountOrder(env, o) {
  const lines = [];
  for (const l of o.lines) {
    const files = [];
    for (const f of l.files || []) files.push({ name: f.name, side: f.side, url: `${env.WORKER_URL}/api/files/${f.key}?sig=${await hmac(env, `file:${f.key}`)}` });
    for (const f of (l.uploader && l.uploader.files) || []) files.push({ name: f.name, side: f.side, url: null });
    lines.push({ code: l.code, title: l.title, summary: l.summary, amount: l.amount, incl: l.incl, options: l.options, steps: l.steps || [], files });
  }
  const shipped = /^shipment|delivered/.test(o.supplier_status || '');
  return {
    id: o.id, token: o.token, created_at: o.created_at, status: o.status,
    status_label: shipped ? 'Verzonden' : STATUS_NL[o.status] || o.status,
    supplier_status: o.supplier_status || null, tracking_url: o.tracking_url || null,
    totals: o.totals, lines, invoice_no: o.invoice_no || null,
    payment: o.status === 'awaiting_transfer' ? { ...o.payment, amount: o.totals.total_incl } : null,
  };
}

async function handleAccount(req, env, p) {
  const body = req.method === 'POST' || req.method === 'PUT' ? await req.json().catch(() => ({})) : {};
  try {
    if (p === '/api/auth/register' && req.method === 'POST') return json(await accounts.register(env, body));
    if (p === '/api/auth/login' && req.method === 'POST') return json(await accounts.login(env, body));
    if (p === '/api/auth/code' && req.method === 'POST') return json(await accounts.requestCode(env, body));
    if (p === '/api/auth/verify' && req.method === 'POST') return json(await accounts.verifyCode(env, body));
    const auth = await accounts.sessionUser(env, req);
    if (p === '/api/auth/logout' && req.method === 'POST') return json(await accounts.logout(env, auth));
    if (!auth) return json({ error: 'Je bent niet (meer) ingelogd' }, 401);
    if (p === '/api/account' && req.method === 'GET') return json({ user: accounts.publicUser(auth.user), mail: !!env.RESEND_API_KEY });
    if (p === '/api/account' && req.method === 'PUT') return json(await accounts.updateAccount(env, auth, body));
    if (p === '/api/account/password' && req.method === 'POST') return json(await accounts.setPassword(env, auth, body));
    if (p === '/api/account/orders' && req.method === 'GET') {
      const out = [];
      for (const id of (auth.user.orders || []).slice(0, 100)) {
        const o = await getOrder(env, id);
        if (o) out.push(await accountOrder(env, o));
      }
      return json({ orders: out });
    }
    return json({ error: 'Niet gevonden' }, 404);
  } catch (e) {
    if (e instanceof accounts.AuthError) return json({ error: e.message }, e.status);
    throw e;
  }
}

async function handleInvoice(env, id, url) {
  const order = await getOrder(env, id);
  if (!order || url.searchParams.get('t') !== order.token) return new Response('Niet gevonden', { status: 404 });
  return new Response(invoiceHtml(order, env), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------- whitelabel-uploader van Probo ----------
const UPLOADER_OK = /approv|confirm|complet|accept|done|finish|ok/i;

async function handleUploaderCreate(req, env) {
  const body = await req.json().catch(() => null);
  const item = body && (await findCatalogItem(env, body.code));
  const options = body && cleanOptions(body.options || []);
  if (!item || !options) return json({ error: 'Ongeldig product' }, 400);
  const { product, calculation_id } = await probo.configure(env, item.code, options);
  if (!product.can_order || !calculation_id) return json({ error: 'Stel het product eerst volledig samen' }, 400);
  const res = await probo.createUploader(env, calculation_id, `${env.WORKER_URL}/api/probo/uploader-callback?sig=${await hmac(env, 'uploader-callback')}`);
  const u = res && res.uploaders && res.uploaders[0];
  if (!u || !u.url) throw new probo.ProboError('Probo gaf geen uploader terug', 502, res);
  const session = { id: String(u.id), external_id: String(u.external_id), url: u.url, code: item.code, options, status: 'open', created_at: new Date().toISOString() };
  await env.ORDERS.put(`uploader:${session.id}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 30 });
  return json({ id: session.id, url: session.url, token: await hmac(env, `uploader:${session.id}`) });
}

async function getUploader(env, id) {
  if (!/^\d{1,15}$/.test(String(id || ''))) return null;
  const raw = await env.ORDERS.get(`uploader:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function handleUploaderStatus(env, id, url) {
  const s = await getUploader(env, id);
  if (!s || url.searchParams.get('t') !== (await hmac(env, `uploader:${id}`))) return json({ error: 'Niet gevonden' }, 404);
  return json({ id: s.id, status: s.status, approved: s.status === 'approved', message: s.message || null });
}

async function handleUploaderCallback(req, env, url) {
  if (url.searchParams.get('sig') !== (await hmac(env, 'uploader-callback'))) return json({ ok: false }, 403);
  const data = await req.json().catch(() => ({}));
  const ids = new Set();
  const collect = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of ['id', 'uploader_id']) if (o[k] != null) ids.add(String(o[k]));
    for (const v of Object.values(o)) if (v && typeof v === 'object') collect(v);
  };
  collect(data);
  const statusText = String(data.status || (data.uploader && data.uploader.status) || data.message || '');
  for (const id of ids) {
    const s = await getUploader(env, id);
    if (!s) continue;
    s.callbacks = [...(s.callbacks || []), { at: new Date().toISOString(), data }].slice(-5);
    s.status = /reject|declin|cancel|fail|error/i.test(statusText) ? 'rejected' : UPLOADER_OK.test(statusText) ? 'approved' : s.status;
    s.message = String(data.message || '').slice(0, 300) || null;
    await env.ORDERS.put(`uploader:${s.id}`, JSON.stringify(s), { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return json({ ok: true });
}

// ---------- router ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fillImages(env).catch((e) => console.error('fillImages', e)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const p = url.pathname;
    try {
      let res;
      if (p === '/api/health') res = json({ ok: true, probo: env.PROBO_ORDER_TYPE === 'production' ? 'production' : 'test', payment: paymentMode(env) });
      else if (p === '/api/products' && req.method === 'GET') res = json({ ...(await withThumbs(env, await getCatalog(env))), settings: { shipping_excl: Number(env.SHIPPING_EUR ?? 9.95), vat: vatRate(env), vat_exempt: isExempt(env), payment: paymentMode(env), max_upload_mb: maxUpload(env) / 1024 / 1024 } });
      else if (p === '/api/configure' && req.method === 'POST') res = await handleConfigure(req, env);
      else if (p === '/api/upload' && req.method === 'POST') res = await handleUpload(req, env);
      else if (p.startsWith('/api/auth/') || p.startsWith('/api/account')) res = await handleAccount(req, env, p);
      else if (/^\/api\/order\/[^/]+\/invoice$/.test(p) && req.method === 'GET') return await handleInvoice(env, p.split('/')[3], url);
      else if (p === '/api/uploader' && req.method === 'POST') res = await handleUploaderCreate(req, env);
      else if (p.startsWith('/api/uploader/') && req.method === 'GET') res = await handleUploaderStatus(env, p.slice(14), url);
      else if (p === '/api/probo/uploader-callback' && req.method === 'POST') return await handleUploaderCallback(req, env, url);
      else if (p.startsWith('/api/img/') && req.method === 'GET') return await serveThumb(env, p.slice(9));
      else if (p === '/api/admin/fill-images') res = isAdmin(env, url) ? json(await fillImages(env, Math.min(Number(url.searchParams.get('limit')) || 14, 15))) : json({ error: 'Geen toegang' }, 403);
      else if (p.startsWith('/api/files/') && req.method === 'GET') return await handleFile(env, p.slice(11), url);
      else if (p === '/api/checkout' && req.method === 'POST') res = await handleCheckout(req, env);
      else if (p === '/api/mollie/webhook' && req.method === 'POST') return await handleMollieWebhook(req, env);
      else if (p === '/api/probo/callback' && req.method === 'POST') return await handleProboCallback(req, env, url);
      else if (p.startsWith('/api/order/') && req.method === 'GET') res = await handleOrderStatus(env, p.slice(11), url);
      else if (p === '/api/admin/probo-products') res = isAdmin(env, url) ? json(await probo.listProducts(env, url.searchParams)) : json({ error: 'Geen toegang' }, 403);
      else if (p === '/admin' && req.method === 'GET') return isAdmin(env, url) ? new Response(adminPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : new Response('Geen toegang', { status: 403 });
      else if (p === '/api/admin/mark-paid' && req.method === 'POST') res = isAdmin(env, url) ? await handleMarkPaid(env, url) : json({ error: 'Geen toegang' }, 403);
      else if (p === '/api/admin/configure' && req.method === 'POST') {
        if (!isAdmin(env, url)) res = json({ error: 'Geen toegang' }, 403);
        else {
          const b = await req.json().catch(() => ({}));
          try {
            const r = await priced(env, String(b.code || ''), cleanOptions(b.options || []) || []);
            res = json(r);
          } catch (e) {
            res = json({ error: e.message, status: e.status, body: e.body }, 200);
          }
        }
      }
      else if (p === '/api/admin/refresh-catalog') res = isAdmin(env, url) ? json({ ok: true, count: (await buildCatalog(env)).products.length }) : json({ error: 'Geen toegang' }, 403);
      else if (p === '/api/admin/probo-raw') {
        if (!isAdmin(env, url)) res = json({ error: 'Geen toegang' }, 403);
        else {
          const path = url.searchParams.get('path') || '';
          try {
            res = path === 'configure'
              ? json(await probo.rawConfigure(env, url.searchParams.get('code'), []))
              : /^\/[a-z0-9/_.?=&-]+$/i.test(path) ? json(await probo.rawGet(env, path)) : json({ error: 'pad' }, 400);
          } catch (e) { res = json({ error: e.message, status: e.status, body: e.body }); }
        }
      }
      else if (p === '/api/admin/resend-domain') {
        if (!isAdmin(env, url)) res = json({ error: 'Geen toegang' }, 403);
        else {
          const h = { Authorization: `Bearer ${env.RESEND_API_KEY}` };
          const list = await fetch('https://api.resend.com/domains', { headers: h }).then((r) => r.json());
          const d = (list.data || [])[0];
          res = json(d ? await fetch(`https://api.resend.com/domains/${d.id}${url.searchParams.get('verify') ? '/verify' : ''}`, { method: url.searchParams.get('verify') ? 'POST' : 'GET', headers: h }).then((r) => r.json()) : list);
        }
      }
      else if (p === '/api/admin/orders') res = isAdmin(env, url) ? await handleAdminOrders(env) : json({ error: 'Geen toegang' }, 403);
      else res = json({ error: 'Niet gevonden' }, 404);
      for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
      return res;
    } catch (e) {
      console.error(e && e.stack ? e.stack : e, e && e.body ? JSON.stringify(e.body) : '');
      const msg = e instanceof probo.ProboError ? 'De leverancier is even niet bereikbaar. Probeer het straks opnieuw.' : 'Er ging iets mis. Probeer het opnieuw.';
      return json({ error: msg }, 502, h);
    }
  },
};
