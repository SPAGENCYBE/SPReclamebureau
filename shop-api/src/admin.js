// Eenvoudige beheerpagina: /admin?key=ADMIN_KEY
// Toont de laatste bestellingen; bij een overschrijving klik je "Betaling ontvangen"
// en dan gaat de bestelling automatisch naar Probo.

export function adminPage() {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Bestellingen | SP Reclamebureau</title>
<style>
body{font-family:Inter,Arial,sans-serif;background:#0e141b;color:#edf2f8;margin:0;padding:24px}
h1{margin:0 0 4px}.muted{color:#9eabb9}
.card{background:#151d28;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px 18px;margin:12px 0}
.row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#26303b}
.badge.awaiting_transfer{background:#7a4a00}.badge.sent_to_supplier{background:#14532d}.badge.supplier_error,.badge.amount_mismatch,.badge.supplier_rejected{background:#7f1d1d}
button{background:#f45b00;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}
ul{margin:8px 0;padding-left:18px}.err{color:#ff8080;font-size:13px;white-space:pre-wrap}
</style></head><body>
<h1>Webshopbestellingen</h1><p class="muted" id="info">Laden…</p><div id="list"></div>
<script>
const key=new URLSearchParams(location.search).get('key');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const eur=n=>'€ '+Number(n||0).toFixed(2).replace('.',',');
const labels={awaiting_transfer:'Wacht op overschrijving',awaiting_payment:'Wacht op online betaling',paid:'Betaald',sent_to_supplier:'Bij Probo',supplier_error:'Fout bij Probo',supplier_rejected:'Geweigerd door Probo',amount_mismatch:'Bedrag klopt niet',payment_canceled:'Betaling geannuleerd',payment_expired:'Betaling verlopen',payment_failed:'Betaling mislukt'};
async function load(){
  const [h,o]=await Promise.all([fetch('/api/health').then(r=>r.json()),fetch('/api/admin/orders?key='+encodeURIComponent(key)).then(r=>r.json())]);
  document.getElementById('info').textContent='Probo: '+h.probo+' · betaling: '+h.payment+' · '+o.orders.length+' bestellingen';
  document.getElementById('list').innerHTML=o.orders.map(x=>'<div class="card"><div class="row"><strong>'+esc(x.id)+'</strong><span class="badge '+esc(x.status)+'">'+esc(labels[x.status]||x.status)+(x.supplier_status?' · Probo: '+esc(x.supplier_status):'')+'</span></div>'
   +'<div class="muted">'+new Date(x.created_at).toLocaleString('nl-BE')+' · '+esc(x.name)+' · '+esc(x.customer)+'</div>'
   +'<ul>'+x.lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>'
   +'<div class="row"><span>Klant betaalt <b>'+eur(x.total_incl)+'</b> · inkoop Probo '+eur(x.purchase_excl)+' excl.'+(x.reference?' · mededeling <b>'+esc(x.reference)+'</b>':'')+'</span>'
   +(['awaiting_transfer','supplier_error'].includes(x.status)?'<button data-id="'+esc(x.id)+'">'+(x.status==='supplier_error'?'Opnieuw naar Probo sturen':'Betaling ontvangen → naar Probo')+'</button>':'')+'</div>'
   +(x.probo_error?'<div class="err">'+esc(JSON.stringify(x.probo_error,null,1))+'</div>':'')+'</div>').join('');
}
document.addEventListener('click',async e=>{const id=e.target.dataset&&e.target.dataset.id;if(!id)return;
  if(!confirm('Bestelling '+id+' als betaald markeren en naar Probo sturen?'))return;
  e.target.disabled=true;const r=await fetch('/api/admin/mark-paid?key='+encodeURIComponent(key)+'&order='+encodeURIComponent(id),{method:'POST'}).then(r=>r.json());
  if(r.error)alert(r.error);load();});
load().catch(()=>document.getElementById('info').textContent='Geen toegang of niet bereikbaar.');
</script></body></html>`;
}
