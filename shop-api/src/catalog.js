// Volledige productcatalogus, rechtstreeks uit Probo, 24 uur bewaard in KV.
import { FEATURED, HIDDEN, CATEGORIES, categorize } from './config.js';
import { listProducts } from './probo.js';

const KEY = 'catalog:v2';
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
    const catKey = categorize(p.code, title);
    const cat = CATEGORIES.find((c) => c.key === catKey) || CATEGORIES[CATEGORIES.length - 1];
    const f = FEATURED[p.code];
    let description = clean(t.description);
    if (!description || description.toLowerCase() === title.toLowerCase()) description = '';
    items.push({
      code: p.code,
      title: f ? f.title : title,
      category: cat.name,
      category_key: cat.key,
      description: f ? f.description : description,
      featured: !!f,
    });
  }
  items.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.featured) return featuredOrder.indexOf(a.code) - featuredOrder.indexOf(b.code);
    const ca = CATEGORIES.findIndex((c) => c.key === a.category_key);
    const cb = CATEGORIES.findIndex((c) => c.key === b.category_key);
    return ca - cb || a.title.localeCompare(b.title, 'nl');
  });
  const categories = CATEGORIES.map((c) => ({ ...c, count: items.filter((i) => i.category_key === c.key).length })).filter((c) => c.count);
  const catalog = { built_at: new Date().toISOString(), categories, products: items };
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
