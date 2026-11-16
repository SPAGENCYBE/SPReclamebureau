// Probo Reseller API — https://api.proboprints.com
// Authenticatie: header "Authorization: Basic <bearer-code die Probo je geeft>"

export class ProboError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function baseUrl(env) {
  return (env.PROBO_BASE_URL || 'https://api.proboprints.com').replace(/\/$/, '');
}

async function call(env, method, path, body) {
  if (!env.PROBO_TOKEN) throw new ProboError('PROBO_TOKEN ontbreekt', 500);
  const res = await fetch(baseUrl(env) + path, {
    method,
    headers: {
      Authorization: `Basic ${env.PROBO_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': 'nl',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new ProboError(`Probo ${path} gaf ${res.status}`, res.status, data);
  return data;
}

export function listProducts(env, params) {
  const q = new URLSearchParams();
  for (const k of ['page', 'per_page', 'search']) if (params && params.get(k)) q.set(k, params.get(k));
  return call(env, 'GET', '/products' + (q.toString() ? `?${q}` : ''));
}

/** options = [{code, value?}, ...] in volgorde van keuze */
export async function configure(env, code, options) {
  const data = await call(env, 'POST', '/products/configure', {
    products: [{ code, options: options || [] }],
  });
  const product = (data.products && data.products[0]) || null;
  if (!product) throw new ProboError('Probo gaf geen product terug', 502, data);
  return { product, calculation_id: data.calculation_id ?? null };
}

/**
 * Bestelling plaatsen bij Probo.
 * Formaat volgens https://apidocs.proboprints.com/examples/order (getest met order_type "test").
 */
export function buildOrderPayload(order, env) {
  const a = order.address;
  return {
    id: order.id,
    reference: order.id,
    contact_email: env.PROBO_CONTACT_EMAIL || 'info@sp-agency.be',
    order_type: env.PROBO_ORDER_TYPE === 'production' ? 'production' : 'test',
    callback_urls: [`${env.WORKER_URL}/api/probo/callback?sig=${order.callback_sig}`],
    error_email_addresses: [env.OWNER_EMAIL || env.PROBO_CONTACT_EMAIL || 'info@sp-agency.be'],
    deliveries: [
      {
        address: {
          company_name: a.company || '',
          first_name: a.first_name,
          last_name: a.last_name,
          street: a.street,
          house_number: a.house_number,
          addition: a.addition || '',
          postal_code: a.postal_code,
          city: a.city,
          country: a.country || 'BE',
          email: order.customer.email,
          phone: order.customer.phone || '',
        },
        // Goedkoopste levertijd + verzending; de verkoopprijs gaat ook uit van de goedkoopste productie-optie.
        delivery_date_preset: env.PROBO_DELIVERY_PRESET || 'cheapest',
        shipping_method_preset: env.PROBO_SHIPPING_PRESET || 'cheapest',
      },
    ],
    products: order.lines.map((l, i) => ({
      id: i + 1,
      code: l.code,
      options: l.options,
      files: l.files.map((f) => ({ uri: f.uri, side: f.side || 'front' })),
    })),
  };
}

/** Beheer: ruwe GET of configure-antwoord, om velden te onderzoeken. */
export const rawGet = (env, path) => call(env, 'GET', path);
export const rawConfigure = (env, code, options) => call(env, 'POST', '/products/configure', { products: [{ code, options: options || [] }] });

export const getProduct = (env, code) => call(env, 'GET', `/products/product/${encodeURIComponent(code)}`);

export const placeOrder = (env, payload) => call(env, 'POST', '/order', payload);
