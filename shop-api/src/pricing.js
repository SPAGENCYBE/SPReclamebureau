// Prijsberekening: Probo-inkoopprijs + jouw marge + verzending + btw.
// Alle bedragen worden ALTIJD op de server berekend; de browser stuurt nooit een prijs door.

const VAT = 0.21;
// Vrijstellingsregeling kleine ondernemingen (VAT_EXEMPT="1"): geen btw aanrekenen,
// maar de btw die Probo aanrekent is niet aftrekbaar en telt dus mee als kost.
export const isExempt = (env) => String(env.VAT_EXEMPT || '') === '1';
export const vatRate = (env) => (isExempt(env) ? 0 : VAT);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Kiest uit `prices_total` (sleutels zoals "18", "24", ... = productie-opties bij Probo)
 * de goedkoopste geldige prijs. Geeft { key, purchase } terug of null.
 */
export function pickPurchasePrice(product) {
  const totals = product && product.prices_total;
  if (!totals || typeof totals !== 'object') return null;
  let best = null;
  for (const [key, p] of Object.entries(totals)) {
    if (!p || typeof p !== 'object') continue;
    const purchase = num(p.purchase_price);
    if (purchase <= 0) continue;
    if (!best || purchase < best.purchase) best = { key, purchase };
  }
  return best;
}

/**
 * Verkoopprijs voor één geconfigureerd product.
 * env.MARGIN_PERCENT  (bv. "40")  marge bovenop inkoop
 * env.MIN_MARGIN_EUR  (bv. "7.5") minimale marge per regel
 */
export function salesPrice(purchaseExcl, env) {
  const marginPct = num(env.MARGIN_PERCENT ?? 40) / 100;
  const minMargin = num(env.MIN_MARGIN_EUR ?? 7.5);
  const cost = isExempt(env) ? purchaseExcl * (1 + VAT) : purchaseExcl;
  const margin = Math.max(cost * marginPct, minMargin);
  const excl = round2(cost + margin);
  return { excl, incl: round2(excl * (1 + vatRate(env))) };
}

export function orderTotals(lines, env) {
  const shippingExcl = round2(num(env.SHIPPING_EUR ?? 9.95));
  const subtotalExcl = round2(lines.reduce((s, l) => s + l.excl, 0));
  const totalExcl = round2(subtotalExcl + shippingExcl);
  const vat = round2(totalExcl * vatRate(env));
  return {
    vat_exempt: isExempt(env),
    subtotal_excl: subtotalExcl,
    shipping_excl: shippingExcl,
    vat,
    total_incl: round2(totalExcl + vat),
  };
}
