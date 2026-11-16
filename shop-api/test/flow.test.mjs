// End-to-end test van de Worker met nagebootste Probo, Mollie, KV en R2.
// Uitvoeren:  node shop-api/test/flow.test.mjs
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const kv = new Map(), r2 = new Map();
const ORDERS = {
  getWithMetadata: async (k) => kv.has(k) ? { value: new Response(kv.get(k).v ?? kv.get(k)).body, metadata: kv.get(k).m ?? null } : { value: null, metadata: null },
  get: async (k) => kv.get(k) ?? null,
  put: async (k, v, o) => void kv.set(k, v instanceof ArrayBuffer ? { v, m: o && o.metadata } : v),
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }),
};
const FILES = {
  put: async (k, stream, meta) => void r2.set(k, { body: await new Response(stream).arrayBuffer(), ...meta }),
  head: async (k) => (r2.has(k) ? {} : null),
  get: async (k) => (r2.has(k) ? { body: r2.get(k).body, httpMetadata: r2.get(k).httpMetadata } : null),
};
const env = {
  ORDERS, FILES: process.env.NO_R2 ? undefined : FILES, SITE_URL: 'https://spreclamebureau.be', WORKER_URL: 'https://api.test',
  ALLOWED_ORIGINS: 'https://spreclamebureau.be', PROBO_TOKEN: 'tok', MOLLIE_API_KEY: 'test_x',
  SIGNING_SECRET: 's3cret', ADMIN_KEY: 'adm', MARGIN_PERCENT: '40', MIN_MARGIN_EUR: '7.5', SHIPPING_EUR: '9.95',
};

let proboOrders = [], molliePayment = null, catalogCalls = 0, sentMails = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), body = init.body ? JSON.parse(init.body) : null;
  if (u === 'https://api.proboprints.com/products/configure') {
    assert.equal(init.headers.Authorization, 'Basic tok');
    const opts = body.products[0].options.map((o) => o.code);
    const done = opts.includes('cut');
    return Response.json({ status: 'ok', products: [{
      code: body.products[0].code, can_order: done, amount: 2, width: 40, height: 60,
      available_options: done ? [] : [{ code: 'finishing', children: [{ type_code: 'radio', code: 'cut', name: 'Snijden' }] }],
      selected_options: body.products[0].options.map((o) => ({ ...o, name: o.code })),
      uploaders: done ? [{ type: body.products[0].options.some((o) => o.code === 'double') ? 'double' : 'single', amount: 2, width: 40, height: 60, minimal_dpi: 72, bleed_top: 1, bleed_right: 1, bleed_bottom: 1, bleed_left: 1 }] : [],
      prices_total: done ? { '18': { purchase_price: 0 }, '24': { purchase_price: 30.0 }, '48': { purchase_price: 20.0 } } : undefined,
    }], calculation_id: 1 });
  }
  if (u.startsWith('https://api.proboprints.com/products/product/')) {
    const code = decodeURIComponent(u.split('/').pop());
    return Response.json({ code, images: code === 'tiewraps' ? [] : [{ language: 'all', url: `https://cdn.print-uploader.com/2026/1/${code}abcdefgh.jpg` }] });
  }
  if (u.startsWith('https://cdn.print-uploader.com/')) return new Response(new Uint8Array([255, 216, 255, 1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  if (u.startsWith('https://api.proboprints.com/products?')) {
    const page = Number(new URL(u).searchParams.get('page'));
    const mk = (code, nl, group = 'Composed product', active = true) => ({ code, active, article_group_name: group, translations: { nl: { title: nl, description: nl } } });
    const pages = [
      [mk('banner', 'Spandoek'), mk('flyers', 'Flyers'), mk('tiewraps', 'Tiewraps'), mk('pole-flag', 'Mastvlag')],
      [mk('vinyl-sticker', 'Vinyl sticker'), mk('old-thing', 'Oud', 'Composed product', false), mk('pvc-sheet', 'PVC', 'Material'), mk('dibond', 'Dibond®')],
    ];
    catalogCalls++;
    return Response.json({ meta: { page, pages: 2, items: 8, per_page: 100 }, data: pages[page - 1] });
  }
  if (u === 'https://api.resend.com/emails') { sentMails.push(body); return Response.json({ id: 'm1' }); }
  if (u === 'https://api.proboprints.com/order') { proboOrders.push(body); return Response.json({ status: 'queued', order: { id: body.id } }); }
  if (u === 'https://api.mollie.com/v2/payments') {
    molliePayment = { id: 'tr_1', status: 'open', amount: body.amount, metadata: body.metadata, _links: { checkout: { href: 'https://mollie.test/pay' } } };
    return Response.json(molliePayment, { status: 201 });
  }
  if (u === 'https://api.mollie.com/v2/payments/tr_1') return Response.json(molliePayment);
  throw new Error('Onverwachte fetch: ' + u);
};

const call = (path, init) => worker.fetch(new Request('https://api.test' + path, { headers: { Origin: 'https://spreclamebureau.be' }, ...init }), env);
const post = (path, data) => call(path, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', Origin: 'https://spreclamebureau.be' } });

// 1. catalogus
let r = await (await call('/api/products')).json();
const codes = r.products.map((p) => p.code);
assert.deepEqual(codes.slice(0, 4), ['flyers', 'banner', 'dibond', 'vinyl-sticker'], 'uitgelichte producten eerst, in vaste volgorde');
assert.deepEqual(r.categories.map((c) => [c.key, c.count]), [['drukwerk', 1], ['stickers', 1], ['borden', 1], ['spandoeken', 1], ['vlaggen', 1], ['montage', 1]]);
assert.ok(codes.includes('tiewraps') && codes.includes('pole-flag'));
assert.ok(!codes.includes('old-thing') && !codes.includes('pvc-sheet'), 'inactief en materialen niet tonen');
const cat = Object.fromEntries(r.products.map((p) => [p.code, p.category]));
assert.equal(cat.tiewraps, 'Montage & toebehoren'); assert.equal(cat['pole-flag'], 'Vlaggen & beachflags'); assert.equal(cat.flyers, 'Drukwerk');
assert.equal(cat['vinyl-sticker'], 'Stickers & folie'); assert.equal(cat.dibond, 'Borden & platen'); assert.equal(cat.banner, 'Spandoeken & doeken');
await call('/api/products');
assert.equal(catalogCalls, 2, 'catalogus wordt bewaard, niet telkens opnieuw opgehaald');

// 2. configureren: eerst onvolledig, dan volledig met prijs. Inkoop 20 -> marge max(8, 7.5)=8 -> 28 excl -> 33.88 incl
r = await (await post('/api/configure', { code: 'banner', options: [{ code: 'width', value: 40 }] })).json();
assert.equal(r.can_order, false); assert.equal(r.price, null);
const options = [{ code: 'width', value: 40 }, { code: 'height', value: 60 }, { code: 'amount', value: 2 }, { code: 'cut' }];
r = await (await post('/api/configure', { code: 'banner', options })).json();
assert.equal(r.can_order, true); assert.deepEqual([r.price.excl, r.price.incl, r.price.production_key], [28, 33.88, '48']);
assert.equal(r._purchase, undefined, 'inkoopprijs mag niet naar de browser');

// 3. ongeldig product / opties geweigerd
assert.equal((await post('/api/configure', { code: 'iets-anders', options: [] })).status, 400);
assert.equal((await post('/api/configure', { code: 'banner', options: [{ code: '<script>' }] })).status, 400);

// 4. upload
const fd = new FormData();
fd.append('file', new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }), 'banner.pdf');
r = await (await call('/api/upload', { method: 'POST', body: fd })).json();
assert.match(r.key, /\.pdf$/);
const fileKey = r.key;
const bad = new FormData(); bad.append('file', new Blob(['x'], { type: 'text/html' }), 'x.html');
assert.equal((await call('/api/upload', { method: 'POST', body: bad })).status, 400);

// 5. checkout — de browser stuurt een valse prijs mee, die wordt genegeerd
const checkout = {
  items: [{ code: 'banner', options, files: [{ key: fileKey, name: 'banner.pdf' }], price: 0.01 }],
  customer: { email: 'klant@example.be', phone: '0470000000' },
  address: { first_name: 'Jan', last_name: 'Peeters', street: 'Kerkstraat', house_number: '1', postal_code: '9280', city: 'Lebbeke', country: 'BE' },
  accept_terms: true,
};
r = await (await post('/api/checkout', checkout)).json();
assert.equal(r.checkout_url, 'https://mollie.test/pay');
// 28 + 9.95 = 37.95 excl, btw 7.97 -> 45.92
assert.equal(molliePayment.amount.value, '45.92');
const orderId = r.order_id;
const stored = JSON.parse(kv.get('order:' + orderId));
assert.equal(stored.status, 'awaiting_payment');

// 6. webhook terwijl nog niet betaald -> geen Probo-order
const hook = () => { const f = new FormData(); f.append('id', 'tr_1'); return call('/api/mollie/webhook', { method: 'POST', body: f }); };
await hook(); assert.equal(proboOrders.length, 0);

// 7. betaald -> precies één Probo-order, ook als Mollie de webhook twee keer stuurt
molliePayment.status = 'paid';
await hook(); await hook();
assert.equal(proboOrders.length, 1);
const po = proboOrders[0];
assert.equal(po.order_type, 'test');
assert.equal(po.id, orderId);
assert.equal(po.products[0].code, 'banner');
assert.match(po.products[0].files[0].uri, /^https:\/\/api\.test\/api\/files\/.+\?sig=[0-9a-f]{40}$/);
assert.equal(po.products[0].files[0].amount, 2, 'amount = oplage');
assert.equal(po.products[0].files[0].side, 'front');
assert.equal(JSON.parse(kv.get('order:' + orderId)).status, 'sent_to_supplier');

// 8. Probo kan het bestand downloaden met de handtekening, zonder niet
const fileUrl = new URL(po.products[0].files[0].uri);
assert.equal((await call(fileUrl.pathname + fileUrl.search)).status, 200);
assert.equal((await call(fileUrl.pathname + '?sig=fout')).status, 403);

// 9. Probo-callback met juiste en foute handtekening
const cb = new URL(po.callback_urls[0]);
assert.equal((await post(cb.pathname + '?sig=fout', { status: 'accepted', order: { id: 1, reference: orderId } })).status, 403);
assert.equal((await post(cb.pathname + cb.search, { status: 'accepted', order: { id: 1, reference: orderId, supplier_order_number: 'P123' } })).status, 200);

// 10. status voor de bedankpagina (alleen met token)
const tok = stored.token;
assert.equal((await call(`/api/order/${orderId}?t=fout`)).status, 404);
r = await (await call(`/api/order/${orderId}?t=${tok}`)).json();
assert.equal(r.supplier_status, 'accepted');

// 11. beheer
assert.equal((await call('/api/admin/orders?key=fout')).status, 403);
r = await (await call('/api/admin/orders?key=adm')).json();
assert.equal(r.orders[0].id, orderId); assert.equal(r.orders[0].purchase_excl, 20);

// 12. checkout zonder bestand of voorwaarden geweigerd
assert.equal((await post('/api/checkout', { ...checkout, accept_terms: false })).status, 400);
assert.equal((await post('/api/checkout', { ...checkout, items: [{ code: 'banner', options, files: [] }] })).status, 400);

console.log('Alle tests geslaagd ✔  (order', orderId, ')');

// ---------- overschrijving ----------
import { structuredReference } from '../src/index.js';
for (let i = 0; i < 200; i++) {
  const ref = structuredReference();
  assert.match(ref, /^\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+$/);
  const d = ref.replace(/\D/g, '');
  assert.equal(Number(BigInt(d.slice(0, 10)) % 97n) || 97, Number(d.slice(10)));
}
env.PAYMENT_MODE = 'transfer'; env.BANK_IBAN = 'BE68 5390 0754 7034';
proboOrders = [];
r = await (await post('/api/checkout', checkout)).json();
assert.match(r.checkout_url, /bedankt\.html\?order=/);
const tId = r.order_id, tTok = JSON.parse(kv.get('order:' + tId)).token;
r = await (await call(`/api/order/${tId}?t=${tTok}`)).json();
assert.equal(r.status, 'awaiting_transfer'); assert.equal(r.payment.iban, 'BE68 5390 0754 7034'); assert.equal(r.payment.amount, 45.92);
assert.equal(proboOrders.length, 0, 'nog niets naar Probo voor betaling');
assert.equal((await call(`/api/admin/mark-paid?key=fout&order=${tId}`, { method: 'POST' })).status, 403);
r = await (await call(`/api/admin/mark-paid?key=adm&order=${tId}`, { method: 'POST' })).json();
assert.equal(r.status, 'sent_to_supplier'); assert.equal(proboOrders.length, 1);
assert.equal((await call(`/api/admin/mark-paid?key=adm&order=${tId}`, { method: 'POST' })).status, 400, 'niet twee keer');
assert.equal(proboOrders.length, 1);
assert.equal((await call('/admin?key=adm')).status, 200);
assert.equal((await call('/admin?key=fout')).status, 403);

// ---------- testbetaling ----------
env.PAYMENT_MODE = 'test'; proboOrders = [];
r = await (await post('/api/checkout', checkout)).json();
assert.equal(proboOrders.length, 1); assert.equal(proboOrders[0].order_type, 'test');
// testbetaling mag nooit samen met echte Probo-orders: valt terug op overschrijving
env.PROBO_ORDER_TYPE = 'production'; proboOrders = [];
r = await (await post('/api/checkout', checkout)).json();
assert.equal(proboOrders.length, 0);
assert.equal(JSON.parse(kv.get('order:' + r.order_id)).status, 'awaiting_transfer');
console.log('Overschrijving + testbetaling ✔');

// ---------- productfoto's ----------
r = await (await call('/api/admin/fill-images?key=adm&limit=3')).json();
assert.equal(r.done, 3); assert.ok(r.remaining > 0);
r = await (await call('/api/admin/fill-images?key=adm')).json();
assert.equal(r.remaining, 0, 'alle foto\'s verwerkt');
r = await (await call('/api/products')).json();
const ban = r.products.find((p) => p.code === 'banner');
assert.match(ban.image, /^https:\/\/api\.test\/api\/img\/banner\?v=/);
assert.equal(r.products.find((p) => p.code === 'tiewraps').image, undefined, 'geen foto → geen image');
const img = await call('/api/img/banner');
assert.equal(img.status, 200); assert.equal(img.headers.get('Content-Type'), 'image/jpeg');
assert.equal((await call('/api/img/onbekend')).status, 404);
assert.equal((await call('/api/admin/fill-images?key=fout')).status, 403);
console.log('Productfoto\'s ✔');

// ---------- bestandsregels (Probo) ----------
import { checkFiles, proboFiles } from '../src/files.js';
const pdf = { key: 'x/a.pdf', side: 'front', uri: 'u/a.pdf' }, png = { key: 'x/b.png', side: 'front', uri: 'u/b.png' }, pngBack = { key: 'x/c.png', side: 'back', uri: 'u/c.png' };
assert.equal(checkFiles('single', [png], 'T'), null);
assert.ok(checkFiles('single', [png, pngBack], 'T'));
assert.ok(checkFiles('double', [png], 'T'), 'dubbelzijdig met één afbeelding geweigerd');
assert.equal(checkFiles('double', [pdf], 'T'), null);
assert.equal(checkFiles('double', [png, pngBack], 'T'), null);
assert.deepEqual(proboFiles({ amount: 1500, uploader_type: 'double', options: [], files: [png, pngBack] }),
  [{ uri: 'u/b.png', side: 'front', amount: 1500 }, { uri: 'u/c.png', side: 'back', amount: 1500 }]);
assert.deepEqual(proboFiles({ amount: 250, uploader_type: 'double', options: [], files: [pdf] }),
  [{ uri: 'u/a.pdf', pages: [{ page: 1, side: 'front', amount: 250 }, { page: 2, side: 'back', amount: 250 }] }]);
assert.deepEqual(proboFiles({ amount: 3, options: [], files: [png] }), [{ uri: 'u/b.png', side: 'front', amount: 3 }]);

// dubbelzijdig product met één png wordt bij afrekenen geweigerd
env.PROBO_ORDER_TYPE = 'test'; env.PAYMENT_MODE = 'test';
const dbl = [...options.slice(0, 3), { code: 'double' }, { code: 'cut' }];
let res = await post('/api/checkout', { ...checkout, items: [{ code: 'banner', options: dbl, files: [{ key: fileKey, name: 'a.pdf' }] }] });
assert.equal(res.status, 200, 'pdf mag voor dubbelzijdig');
// bedankpagina: alleen toegelaten sites
res = await (await post('/api/checkout', { ...checkout, return_url: 'https://spreclamebureau.be/sub/bedankt.html' })).json();
assert.match(res.checkout_url, /^https:\/\/spreclamebureau\.be\/sub\/bedankt\.html\?order=/);
res = await (await post('/api/checkout', { ...checkout, return_url: 'https://evil.example/bedankt.html' })).json();
assert.match(res.checkout_url, /^https:\/\/spreclamebureau\.be\/bedankt\.html\?order=/);
console.log('Bestandsregels + bedankpagina ✔');

// ---------- klantenaccounts ----------
{
  ORDERS.delete = async (k) => void kv.delete(k);
  const authed = (path, token, init = {}) => call(path, { ...init, headers: { 'Content-Type': 'application/json', Origin: 'https://spreclamebureau.be', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  let r = await post('/api/auth/register', { email: 'Klant@Example.be', password: 'kort' });
  assert.equal(r.status, 400, 'te kort wachtwoord');
  r = await (await post('/api/auth/register', { email: 'Klant@Example.be', password: 'geheim123', first_name: 'An', company: 'Bakkerij An' })).json();
  assert.match(r.token, /^[0-9a-f]{48}$/); assert.equal(r.user.email, 'klant@example.be'); assert.equal(r.user.profile.company, 'Bakkerij An');
  assert.equal((await post('/api/auth/register', { email: 'klant@example.be', password: 'anders123' })).status, 400, 'geen dubbel account');
  assert.equal((await post('/api/auth/login', { email: 'klant@example.be', password: 'fout12345' })).status, 401);
  r = await (await post('/api/auth/login', { email: 'KLANT@example.be', password: 'geheim123' })).json();
  const tok = r.token;
  assert.equal((await call('/api/account')).status, 401, 'zonder token geen toegang');
  r = await (await authed('/api/account', tok)).json();
  assert.equal(r.user.has_password, true);
  r = await (await authed('/api/account', tok, { method: 'PUT', body: JSON.stringify({ profile: { vat_number: 'BE0123456789', phone: '0470' }, addresses: [{ label: 'Winkel', street: 'Markt', house_number: '1', postal_code: '9280', city: 'Lebbeke', country: 'BE' }] }) })).json();
  assert.equal(r.user.profile.vat_number, 'BE0123456789'); assert.equal(r.user.addresses[0].label, 'Winkel');

  // bestellen terwijl ingelogd -> gekoppeld aan account, adres bewaard
  env.PAYMENT_MODE = 'test'; env.PROBO_ORDER_TYPE = 'test';
  r = await (await authed('/api/checkout', tok, { method: 'POST', body: JSON.stringify({ ...checkout, items: [{ ...checkout.items[0], steps: ['Formaat', 'Formaat', 'Aantal', 'Afwerking'] }], save_details: true }) })).json();
  const myOrder = r.order_id;
  r = await (await authed('/api/account/orders', tok)).json();
  assert.equal(r.orders[0].id, myOrder); assert.equal(r.orders[0].status_label, 'In productie');
  assert.deepEqual(r.orders[0].lines[0].steps, ['Formaat', 'Formaat', 'Aantal', 'Afwerking']);
  assert.match(r.orders[0].lines[0].files[0].url, /\/api\/files\/.+\?sig=/);
  r = await (await authed('/api/account', tok)).json();
  assert.equal(r.user.addresses.length, 2, 'nieuw leveradres bewaard');

  // factuur: zonder ondernemingsnummer = bestelbevestiging, met = factuur met nummer
  const ord = JSON.parse(kv.get('order:' + myOrder));
  let html = await (await call(`/api/order/${myOrder}/invoice?t=${ord.token}`)).text();
  assert.match(html, /Bestelbevestiging/); assert.doesNotMatch(html, /Factuur 20/);
  assert.equal((await call(`/api/order/${myOrder}/invoice?t=fout`)).status, 404);
  env.SELLER_VAT = 'BE0999999999';
  r = await (await authed('/api/checkout', tok, { method: 'POST', body: JSON.stringify(checkout) })).json();
  const o2 = JSON.parse(kv.get('order:' + r.order_id));
  assert.match(o2.invoice_no, /^\d{4}-0001$/);
  html = await (await call(`/api/order/${r.order_id}/invoice?t=${o2.token}`)).text();
  assert.match(html, /Factuur \d{4}-0001/); assert.match(html, /BE0999999999/);
  delete env.SELLER_VAT;

  // inloggen met code
  assert.equal((await post('/api/auth/code', { email: 'nieuw@example.be' })).status, 503, 'zonder mail geen code');
  env.RESEND_API_KEY = 're_test';
  assert.equal((await post('/api/auth/code', { email: 'nieuw@example.be' })).status, 200);
  assert.equal((await post('/api/auth/code', { email: 'nieuw@example.be' })).status, 429, 'niet te snel opnieuw');
  const code = /(\d{6})/.exec(sentMails[sentMails.length - 1].subject)[1];
  assert.equal((await post('/api/auth/verify', { email: 'nieuw@example.be', code: '000000' })).status, 401);
  r = await (await post('/api/auth/verify', { email: 'nieuw@example.be', code })).json();
  assert.match(r.token, /^[0-9a-f]{48}$/); assert.equal(r.user.has_password, false);
  assert.equal((await post('/api/auth/verify', { email: 'nieuw@example.be', code })).status, 401, 'code maar één keer bruikbaar');
  // wachtwoord instellen na inloggen met code
  r = await authed('/api/account/password', r.token, { method: 'POST', body: JSON.stringify({ new_password: 'nieuwwacht1' }) });
  assert.equal(r.status, 200);
  assert.equal((await post('/api/auth/login', { email: 'nieuw@example.be', password: 'nieuwwacht1' })).status, 200);
  // uitloggen
  await authed('/api/auth/logout', tok, { method: 'POST', body: '{}' });
  assert.equal((await authed('/api/account', tok)).status, 401);
  delete env.RESEND_API_KEY;
  console.log('Klantenaccounts ✔');
}
