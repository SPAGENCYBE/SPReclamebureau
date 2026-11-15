// Mollie Payments API v2 — https://docs.mollie.com
// MOLLIE_API_KEY: begint met "test_" (testbetalingen) of "live_" (echte betalingen).

async function call(env, method, path, body) {
  if (!env.MOLLIE_API_KEY) throw new Error('MOLLIE_API_KEY ontbreekt');
  const res = await fetch(`https://api.mollie.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.MOLLIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Mollie ${path} gaf ${res.status}: ${data.detail || ''}`);
    err.body = data;
    throw err;
  }
  return data;
}

export function createPayment(env, { amount, description, redirectUrl, webhookUrl, metadata, email }) {
  return call(env, 'POST', '/payments', {
    amount: { currency: 'EUR', value: amount.toFixed(2) },
    description,
    redirectUrl,
    webhookUrl,
    metadata,
    locale: 'nl_BE',
    billingEmail: email,
  });
}

export const getPayment = (env, id) => call(env, 'GET', `/payments/${encodeURIComponent(id)}`);
