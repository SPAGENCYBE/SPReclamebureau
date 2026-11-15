// Opslag van drukbestanden.
// Met R2 (binding FILES): tot 100 MB per bestand.
// Zonder R2: tijdelijk in KV (binding ORDERS), max. 25 MB per bestand, 90 dagen bewaard.

export const usingR2 = (env) => !!env.FILES;
export const maxUpload = (env) => (usingR2(env) ? 100 : 25) * 1024 * 1024;

export async function putFile(env, key, file, meta) {
  if (usingR2(env)) {
    await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: meta });
    return;
  }
  await env.ORDERS.put(`file:${key}`, await file.arrayBuffer(), {
    expirationTtl: 60 * 60 * 24 * 90,
    metadata: { contentType: file.type, ...meta },
  });
}

export async function hasFile(env, key) {
  if (usingR2(env)) return !!(await env.FILES.head(key));
  const { value } = await env.ORDERS.getWithMetadata(`file:${key}`, { type: 'stream' });
  if (value) await value.cancel();
  return !!value;
}

export async function getFile(env, key) {
  if (usingR2(env)) {
    const obj = await env.FILES.get(key);
    return obj ? { body: obj.body, contentType: obj.httpMetadata?.contentType } : null;
  }
  const { value, metadata } = await env.ORDERS.getWithMetadata(`file:${key}`, { type: 'stream' });
  return value ? { body: value, contentType: metadata && metadata.contentType } : null;
}
