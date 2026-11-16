// Productfoto's van Probo (GET /products/product/{code} → images[0].url).
// De originelen zijn tot 4000×4000 px; we bewaren één keer een lichte versie (600 px, WebP) in KV
// en serveren die via /api/img/{code}. Ontbrekende foto's worden per uur aangevuld (cron) of via
// /api/admin/fill-images?key=ADMIN_KEY.
import { getProduct } from './probo.js';
import { getCatalog } from './catalog.js';

const META = 'thumbs:index'; // { code: { v: versie, none?: true } }
const PER_RUN = 14; // free plan: max. 50 verzoeken per aanroep (3 per product: detail, foto, verkleinen)

async function readIndex(env) {
  return JSON.parse((await env.ORDERS.get(META)) || '{}');
}

export async function thumbIndex(env) {
  return readIndex(env);
}

async function resize(env, res) {
  if (env.IMAGES) {
    const out = await env.IMAGES.input(res.body)
      .transform({ width: 600, height: 600, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 78 });
    return { body: await out.response().arrayBuffer(), type: 'image/webp' };
  }
  return { body: await res.arrayBuffer(), type: res.headers.get('content-type') || 'image/jpeg' };
}

export async function fillImages(env, limit = PER_RUN) {
  const index = await readIndex(env);
  const { products } = await getCatalog(env);
  const todo = products.filter((p) => !index[p.code]).slice(0, limit);
  const errors = [];
  for (const p of todo) {
    try {
      const d = await getProduct(env, p.code);
      const url = d && d.images && d.images[0] && d.images[0].url;
      if (!url) { index[p.code] = { none: true }; continue; }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`foto ${res.status}`);
      const img = await resize(env, res);
      await env.ORDERS.put(`thumb:${p.code}`, img.body, { metadata: { type: img.type } });
      index[p.code] = { v: url.split('/').slice(-1)[0].slice(0, 8) };
    } catch (e) {
      errors.push(`${p.code}: ${e.message}`);
    }
  }
  await env.ORDERS.put(META, JSON.stringify(index));
  const remaining = products.filter((p) => !index[p.code]).length;
  return { done: todo.length - errors.length, remaining, errors: errors.slice(0, 5), resized: !!env.IMAGES };
}

export async function serveThumb(env, code) {
  if (!/^[a-z0-9_.-]{1,80}$/i.test(code)) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.ORDERS.getWithMetadata(`thumb:${code}`, { type: 'stream' });
  if (!value) return new Response('Not found', { status: 404 });
  return new Response(value, {
    headers: {
      'Content-Type': (metadata && metadata.type) || 'image/webp',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
