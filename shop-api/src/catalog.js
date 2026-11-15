// Volledige productcatalogus, rechtstreeks uit Probo, 24 uur bewaard in KV.
import { FEATURED, HIDDEN, categorize } from './config.js';
import { listProducts } from './probo.js';

const KEY = 'catalog:v1';
const TTL = 60 * 60 * 24;
let memo = null; // per Worker-instantie, vermijdt een KV-read per request

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function fetchAll(env) {
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const d = await listProducts(env, new URLSearchParams({ page: String(page), per_page: '100' }));
    all.push(...(d.data || []));
    if (!d.meta || page >= d.meta.pages) break;
  }
  return all;
}

export async function buildCatalog(env) {
  const raw = await fetchAll(env);
  const featuredOrder = Object.keys(FEATURED);
  const items = [];
  for (const p of raw) {
    if (!p.active || p.article_group_name !== 'Composed product' || HIDDEN.has(p.code)) continue;
    const t = (p.translations && (p.translations.nl || p.translations.en)) || {};
    const title = clean(t.title) || p.code;
    const cat = categorize(p.code, title);
    const f = FEATURED[p.code];
    let description = clean(t.description);
    if (!description || description.toLowerCase() === title.toLowerCase()) description = '';
    items.push({
      code: p.code,
      title: f ? f.title : title,
      category: cat.name,
      description: f ? f.description : description,
      image: cat.image,
      featured: !!f,
    });
  }
  items.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.featured) return featuredOrder.indexOf(a.code) - featuredOrder.indexOf(b.code);
    return a.category.localeCompare(b.category, 'nl') || a.title.localeCompare(b.title, 'nl');
  });
  const catalog = { built_at: new Date().toISOString(), products: items };
  await env.ORDERS.put(KEY, JSON.stringify(catalog), { expirationTtl: TTL });
  memo = { at: Date.now(), catalog };
  return catalog;
}

export async function getCatalog(env) {
  if (memo && Date.now() - memo.at < 10 * 60 * 1000) return memo.catalog;
  const raw = await env.ORDERS.get(KEY);
  if (raw) {
    const catalog = JSON.parse(raw);
    memo = { at: Date.now(), catalog };
    return catalog;
  }
  return buildCatalog(env);
}

export async function findCatalogItem(env, code) {
  if (typeof code !== 'string') return null;
  const { products } = await getCatalog(env);
  return products.find((p) => p.code === code) || null;
}

export function resetMemo() {
  memo = null;
}
