// End-to-end test van de Worker met nagebootste Probo, Mollie, KV en R2.
// Uitvoeren:  node shop-api/test/flow.test.mjs
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const kv = new Map(), r2 = new Map();
const ORDERS = {
  get: async (k) => kv.get(k) ?? null,
  put: async (k, v) => void kv.set(k, v),
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) }),
};
const FILES = {
  put: async (k, stream, meta) => void r2.set(k, { body: await new Response(stream).arrayBuffer(), ...meta }),
  head: async (k) => (r2.has(k) ? {} : null),
  get: async (k) => (r2.has(k) ? { body: r2.get(k).body, httpMetadata: r2.get(k).httpMetadata } : null),
};
const env = {
  ORDERS, FILES, SITE_URL: 'https://spreclamebureau.be', WORKER_URL: 'https://api.test',
  ALLOWED_ORIGINS: 'https://spreclamebureau.be', PROBO_TOKEN: 'tok', MOLLIE_API_KEY: 'test_x',
  SIGNING_SECRET: 's3cret', ADMIN_KEY: 'adm', MARGIN_PERCENT: '40', MIN_MARGIN_EUR: '7.5', SHIPPING_EUR: '9.95',
};

let proboOrders = [], molliePayment = null;
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
      uploaders: done ? [{ type: 'single', amount: 2, width: 40, height: 60, minimal_dpi: 72, bleed_top: 1, bleed_right: 1, bleed_bottom: 1, bleed_left: 1 }] : [],
      prices_total: done ? { '18': { purchase_price: 0 }, '24': { purchase_price: 30.0 }, '48': { purchase_price: 20.0 } } : undefined,
    }], calculation_id: 1 });
  }
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
assert.ok(r.products.find((p) => p.code === 'banner-510'));

// 2. configureren: eerst onvolledig, dan volledig met prijs. Inkoop 20 -> marge max(8, 7.5)=8 -> 28 excl -> 33.88 incl
r = await (await post('/api/configure', { code: 'banner-510', options: [{ code: 'width', value: 40 }] })).json();
assert.equal(r.can_order, false); assert.equal(r.price, null);
const options = [{ code: 'width', value: 40 }, { code: 'height', value: 60 }, { code: 'amount', value: 2 }, { code: 'cut' }];
r = await (await post('/api/configure', { code: 'banner-510', options })).json();
assert.equal(r.can_order, true); assert.deepEqual([r.price.excl, r.price.incl, r.price.production_key], [28, 33.88, '48']);
assert.equal(r._purchase, undefined, 'inkoopprijs mag niet naar de browser');

// 3. ongeldig product / opties geweigerd
assert.equal((await post('/api/configure', { code: 'iets-anders', options: [] })).status, 400);
assert.equal((await post('/api/configure', { code: 'banner-510', options: [{ code: '<script>' }] })).status, 400);

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
  items: [{ code: 'banner-510', options, files: [{ key: fileKey, name: 'banner.pdf' }], price: 0.01 }],
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
assert.equal(po.products[0].code, 'banner-510');
assert.match(po.products[0].files[0].uri, /^https:\/\/api\.test\/api\/files\/.+\?sig=[0-9a-f]{40}$/);
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
assert.equal((await post('/api/checkout', { ...checkout, items: [{ code: 'banner-510', options, files: [] }] })).status, 400);

console.log('Alle tests geslaagd ✔  (order', orderId, ')');
