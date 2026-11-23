// Factuur / bestelbevestiging als afdrukbare HTML (de klant kan "Opslaan als PDF" kiezen).
// Zolang SELLER_VAT (ondernemingsnummer) niet ingesteld is, is dit een bestelbevestiging en geen factuur.
// Gegevens van de verkoper: SELLER_NAME, SELLER_ADDRESS, SELLER_VAT, SELLER_IBAN, SELLER_EMAIL.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const eur = (n) => '€ ' + Number(n || 0).toFixed(2).replace('.', ',');
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export function invoiceHtml(order, envIn) {
  // Een uitgereikte factuur toont altijd de verkoper van op het moment van facturatie (ook na de overstap naar de CommV).
  const env = order.invoice_seller ? { ...envIn, SELLER_NAME: order.invoice_seller.name, SELLER_LEGAL: order.invoice_seller.legal, SELLER_ADDRESS: order.invoice_seller.address, SELLER_VAT: order.invoice_seller.vat } : envIn;
  const isInvoice = !!(env.SELLER_VAT && order.invoice_no);
  const who = `${esc(env.SELLER_NAME || 'SP Reclamebureau')}${env.SELLER_LEGAL ? `<br>${esc(env.SELLER_LEGAL)}` : ''}`;
  const title = isInvoice ? `Factuur ${order.invoice_no}` : `Bestelbevestiging ${order.id}`;
  const a = order.address;
  const c = order.customer;
  const t = order.totals;
  const ex = !!t.vat_exempt;
  const vcol = ex ? '' : '<td class="r">21%</td>';
  const rows = order.lines.map((l) => `
    <tr><td><strong>${esc(l.title)}</strong><br><small>${esc(l.summary)}</small></td>
    <td class="r">${esc(l.amount)}</td><td class="r">${eur(l.excl)}</td>${vcol}<td class="r">${eur(l.excl)}</td></tr>`).join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} | SP Reclamebureau</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:0;background:#f3f4f6}
.page{max-width:820px;margin:24px auto;background:#fff;padding:48px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
.brand{font-size:26px;font-weight:900;letter-spacing:-.02em}.brand span{color:#f45b00}
h1{font-size:22px;margin:28px 0 4px}.muted{color:#6b7280}.r{text-align:right}
.cols{display:flex;gap:40px;margin:24px 0}.cols div{flex:1;font-size:14px;line-height:1.55}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:10px}th{text-align:left;border-bottom:2px solid #1f2933;padding:8px 6px}
td{border-bottom:1px solid #e5e7eb;padding:10px 6px;vertical-align:top}td small{color:#6b7280}
.tot{margin-left:auto;width:300px;margin-top:16px;font-size:14px}.tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .big{font-size:18px;font-weight:900;border-top:2px solid #1f2933;margin-top:6px;padding-top:8px}
.note{margin-top:28px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px}
.foot{margin-top:36px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px}
.print{position:fixed;right:20px;bottom:20px;background:#f45b00;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:0}.print{display:none}}
</style></head><body>
<div class="page">
  <div class="top">
    <div><div class="brand">SP <span>Reclamebureau</span></div><div class="muted" style="font-size:13px">prints &amp; designs</div></div>
    <div style="font-size:13px;line-height:1.55" class="r">${who}<br>${esc(env.SELLER_ADDRESS || '')}${env.SELLER_VAT ? `<br>BTW ${esc(env.SELLER_VAT)}` : ''}<br>${esc(env.SELLER_EMAIL || 'info@sp-agency.be')}</div>
  </div>
  <h1>${esc(title)}</h1>
  <div class="muted" style="font-size:14px">${isInvoice ? `Factuurdatum: ${date(order.invoice_date)} · ` : ''}Bestelnummer: ${esc(order.id)} · Besteld op ${date(order.created_at)}</div>
  <div class="cols">
    <div><strong>Klant</strong><br>${esc(a.company ? a.company + '<br>' : '')}${esc(a.first_name)} ${esc(a.last_name)}<br>${esc(a.street)} ${esc(a.house_number)}${a.addition ? ' bus ' + esc(a.addition) : ''}<br>${esc(a.postal_code)} ${esc(a.city)}<br>${esc(a.country)}${c.vat_number ? `<br>BTW ${esc(c.vat_number)}` : ''}</div>
    <div><strong>Leveradres</strong><br>${esc(a.first_name)} ${esc(a.last_name)}<br>${esc(a.street)} ${esc(a.house_number)}${a.addition ? ' bus ' + esc(a.addition) : ''}<br>${esc(a.postal_code)} ${esc(a.city)}</div>
  </div>
  <table><thead><tr><th>Omschrijving</th><th class="r">Aantal</th><th class="r">${ex ? 'Prijs' : 'Prijs excl.'}</th>${ex ? '' : '<th class="r">Btw</th>'}<th class="r">${ex ? 'Totaal' : 'Totaal excl.'}</th></tr></thead>
  <tbody>${rows}
    <tr><td>Verzending</td><td class="r">1</td><td class="r">${eur(t.shipping_excl)}</td>${vcol}<td class="r">${eur(t.shipping_excl)}</td></tr>
  </tbody></table>
  <div class="tot">
    ${ex ? '' : `<div><span>Totaal excl. btw</span><span>${eur(t.subtotal_excl + t.shipping_excl)}</span></div>
    <div><span>Btw 21%</span><span>${eur(t.vat)}</span></div>`}
    <div class="big"><span>Totaal</span><span>${eur(t.total_incl)}</span></div>
  </div>
  ${order.paid_at ? `<p style="font-size:14px;margin-top:18px">Betaald op ${date(order.paid_at)}.</p>` : `<p style="font-size:14px;margin-top:18px">Nog te betalen.</p>`}
  ${ex ? '<p style="font-size:13px;margin-top:14px">Bijzondere vrijstellingsregeling kleine ondernemingen.</p>' : ''}
  ${isInvoice ? '' : '<div class="note">Dit is een <strong>bestelbevestiging</strong>, geen factuur. De factuur volgt na verwerking van je bestelling.</div>'}
  <div class="foot">${esc(env.SELLER_NAME || 'SP Reclamebureau')}${env.SELLER_LEGAL ? ' (' + esc(env.SELLER_LEGAL) + ')' : ''}${env.SELLER_VAT ? ' · BTW ' + esc(env.SELLER_VAT) : ''}${env.SELLER_IBAN ? ' · IBAN ' + esc(env.SELLER_IBAN) : ''} · spreclamebureau.be</div>
</div>
<button class="print" onclick="window.print()">Opslaan als PDF / afdrukken</button>
</body></html>`;
}
