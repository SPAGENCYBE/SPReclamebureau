// Optionele e-mailmelding via Resend (https://resend.com, gratis tot 3000 mails/maand).
// Zonder RESEND_API_KEY wordt er niets verstuurd; Mollie stuurt de klant dan nog altijd
// een betaalbevestiging en je ziet de bestelling in Mollie en Probo.

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function send(env, to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'SP Reclamebureau <shop@spreclamebureau.be>', reply_to: env.OWNER_EMAIL || 'info@sp-agency.be', to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export const mailEnabled = (env) => !!env.RESEND_API_KEY;

export async function sendMail(env, to, subject, html) {
  if (!mailEnabled(env)) throw new Error('E-mail is niet ingesteld');
  await send(env, to, subject, html);
}

export async function notifyPaid(env, order) {
  if (!env.RESEND_API_KEY) return;
  const rows = order.lines
    .map((l) => `<tr><td>${esc(l.title)}<br><small>${esc(l.summary)}</small></td><td align="right">€ ${l.incl.toFixed(2)}</td></tr>`)
    .join('');
  const table = `<table width="100%" cellpadding="6" style="border-collapse:collapse;font-family:Arial">${rows}
    <tr><td><b>Totaal (incl. verzending en btw)</b></td><td align="right"><b>€ ${order.totals.total_incl.toFixed(2)}</b></td></tr></table>`;
  const a = order.address;

  await send(
    env,
    order.customer.email,
    `Bedankt voor je bestelling ${order.id}`,
    `<p>Hallo ${esc(a.first_name)},</p><p>We hebben je betaling ontvangen. Je bestelling <b>${esc(order.id)}</b> gaat nu in productie.</p>${table}
     <p>Leveradres: ${esc(a.street)} ${esc(a.house_number)}, ${esc(a.postal_code)} ${esc(a.city)}</p>
     <p>Vragen? Antwoord gewoon op deze mail of mail naar info@sp-agency.be.</p><p>SP Reclamebureau</p>`,
  );
  if (env.OWNER_EMAIL) {
    await send(
      env,
      env.OWNER_EMAIL,
      `Nieuwe webshopbestelling ${order.id} (${order.status})`,
      `<p>Klant: ${esc(a.first_name)} ${esc(a.last_name)} ${a.company ? '(' + esc(a.company) + ')' : ''} — ${esc(order.customer.email)}</p>${table}
       <p>Status: <b>${esc(order.status)}</b>${order.probo_error ? '<br>Probo-fout: ' + esc(JSON.stringify(order.probo_error)) : ''}</p>`,
    );
  }
}

export async function notifyNewTransfer(env, order) {
  if (!env.RESEND_API_KEY) return;
  const p = order.payment;
  const amount = order.totals.total_incl.toFixed(2).replace('.', ',');
  await send(
    env,
    order.customer.email,
    `Je bestelling ${order.id}: betaalgegevens`,
    `<p>Hallo ${esc(order.address.first_name)},</p><p>Bedankt voor je bestelling <b>${esc(order.id)}</b>. Schrijf <b>€ ${amount}</b> over naar:</p>
     <p>Rekening: <b>${esc(p.iban)}</b>${p.bic ? ` (BIC ${esc(p.bic)})` : ''}<br>Op naam van: ${esc(p.name)}<br>Mededeling: <b>${esc(p.reference)}</b></p>
     <p>Zodra je betaling binnen is, gaat je bestelling in productie.</p><p>SP Reclamebureau</p>`,
  );
  if (env.OWNER_EMAIL) {
    await send(env, env.OWNER_EMAIL, `Nieuwe bestelling ${order.id} — wacht op overschrijving (€ ${amount})`,
      `<p>${esc(order.address.first_name)} ${esc(order.address.last_name)} — ${esc(order.customer.email)}<br>Mededeling: <b>${esc(p.reference)}</b></p>
       <p>Bevestig de betaling in de beheerpagina (/admin?key=…) om de order naar Probo te sturen.</p>`);
  }
}
