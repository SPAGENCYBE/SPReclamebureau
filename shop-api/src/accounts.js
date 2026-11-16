// Klantenaccounts: inloggen met wachtwoord of met een code per e-mail.
// Alles in KV:
//   user:{email}     profiel, adressen, wachtwoord-hash, bestellingen
//   session:{token}  inlogsessie (30 dagen), via Authorization: Bearer <token>
//   code:{email}     inlogcode (10 minuten, max. 5 pogingen)
import { sendMail, mailEnabled } from './mail.js';

const SESSION_TTL = 60 * 60 * 24 * 30;
const CODE_TTL = 60 * 10;
const PBKDF2_ITER = 100000; // maximum dat Cloudflare Workers toelaat

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s) || s.length > 160) throw new AuthError('Ongeldig e-mailadres');
  return s;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw new AuthError('Kies een wachtwoord van minstens 8 tekens');
  if (p.length > 200) throw new AuthError('Wachtwoord is te lang');
}

export async function getUser(env, email) {
  const raw = await env.ORDERS.get(`user:${email}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveUser(env, user) {
  user.updated_at = new Date().toISOString();
  await env.ORDERS.put(`user:${user.email}`, JSON.stringify(user));
}

function newUser(email) {
  return { id: rnd(8), email, pass: null, profile: { first_name: '', last_name: '', company: '', vat_number: '', phone: '' }, addresses: [], orders: [], created_at: new Date().toISOString() };
}

async function createSession(env, user, via) {
  const token = rnd(24);
  await env.ORDERS.put(`session:${token}`, JSON.stringify({ email: user.email, via, at: Date.now() }), { expirationTtl: SESSION_TTL });
  return token;
}

/** Ingelogde gebruiker uit de Authorization-header, of null. */
export async function sessionUser(env, req) {
  const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const raw = await env.ORDERS.get(`session:${m[1]}`);
  if (!raw) return null;
  const s = JSON.parse(raw);
  const user = await getUser(env, s.email);
  return user ? { user, session: s, token: m[1] } : null;
}

export function publicUser(user) {
  return { email: user.email, has_password: !!user.pass, profile: user.profile, addresses: user.addresses || [] };
}

// ---------- acties ----------

export async function register(env, body) {
  const email = normEmail(body.email);
  checkPassword(body.password);
  let user = await getUser(env, email);
  if (user && user.pass) throw new AuthError('Er bestaat al een account met dit e-mailadres. Log in of vraag een code aan.');
  if (user && !user.pass && user.verified) throw new AuthError('Dit e-mailadres heeft al een account. Log in met een code en stel daarna een wachtwoord in.');
  user = user || newUser(email);
  const salt = rnd(16);
  user.pass = { salt, hash: await hashPassword(body.password, salt) };
  for (const k of ['first_name', 'last_name', 'company']) if (body[k]) user.profile[k] = String(body[k]).trim().slice(0, 80);
  await saveUser(env, user);
  return { token: await createSession(env, user, 'password'), user: publicUser(user) };
}

export async function login(env, body) {
  const email = normEmail(body.email);
  const user = await getUser(env, email);
  const failKey = `fail:${email}`;
  const fails = Number((await env.ORDERS.get(failKey)) || 0);
  if (fails >= 10) throw new AuthError('Te veel mislukte pogingen. Probeer over 15 minuten opnieuw of log in met een code.', 429);
  const ok = user && user.pass && safeEqual(await hashPassword(String(body.password || ''), user.pass.salt), user.pass.hash);
  if (!ok) {
    await env.ORDERS.put(failKey, String(fails + 1), { expirationTtl: 60 * 15 });
    throw new AuthError('E-mailadres of wachtwoord klopt niet', 401);
  }
  return { token: await createSession(env, user, 'password'), user: publicUser(user) };
}

export async function requestCode(env, body) {
  if (!mailEnabled(env)) throw new AuthError('Inloggen met een code is binnenkort beschikbaar. Log voorlopig in met je wachtwoord.', 503);
  const email = normEmail(body.email);
  const prev = JSON.parse((await env.ORDERS.get(`code:${email}`)) || 'null');
  if (prev && Date.now() - prev.at < 60 * 1000) throw new AuthError('Er is net een code verstuurd. Wacht een minuutje voor je een nieuwe aanvraagt.', 429);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const salt = rnd(8);
  await env.ORDERS.put(`code:${email}`, JSON.stringify({ salt, hash: await hashPassword(code, salt), at: Date.now(), tries: 0 }), { expirationTtl: CODE_TTL });
  await sendMail(env, email, `Je inlogcode: ${code}`,
    `<p>Hallo,</p><p>Je inlogcode voor SP Reclamebureau is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>De code is 10 minuten geldig. Heb je dit niet aangevraagd? Dan mag je deze mail negeren.</p><p>SP Reclamebureau</p>`);
  return { ok: true };
}

export async function verifyCode(env, body) {
  const email = normEmail(body.email);
  const rec = JSON.parse((await env.ORDERS.get(`code:${email}`)) || 'null');
  if (!rec) throw new AuthError('De code is verlopen. Vraag een nieuwe aan.', 401);
  if (rec.tries >= 5) throw new AuthError('Te veel pogingen. Vraag een nieuwe code aan.', 429);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!safeEqual(await hashPassword(code, rec.salt), rec.hash)) {
    rec.tries += 1;
    await env.ORDERS.put(`code:${email}`, JSON.stringify(rec), { expirationTtl: CODE_TTL });
    throw new AuthError('De code klopt niet', 401);
  }
  await env.ORDERS.delete(`code:${email}`);
  const user = (await getUser(env, email)) || newUser(email);
  user.verified = true;
  await saveUser(env, user);
  return { token: await createSession(env, user, 'code'), user: publicUser(user) };
}

export async function logout(env, auth) {
  if (auth) await env.ORDERS.delete(`session:${auth.token}`);
  return { ok: true };
}

const clean = (v, n = 80) => String(v ?? '').trim().slice(0, n);

export async function updateAccount(env, auth, body) {
  const { user } = auth;
  if (body.profile) {
    for (const k of ['first_name', 'last_name', 'company', 'vat_number', 'phone']) {
      if (body.profile[k] !== undefined) user.profile[k] = clean(body.profile[k], k === 'company' ? 120 : 60);
    }
  }
  if (Array.isArray(body.addresses)) {
    user.addresses = body.addresses.slice(0, 10).map((a) => ({
      id: /^[0-9a-f]{8}$/.test(a.id || '') ? a.id : rnd(4),
      label: clean(a.label, 40),
      company: clean(a.company, 120),
      first_name: clean(a.first_name, 60),
      last_name: clean(a.last_name, 60),
      street: clean(a.street, 120),
      house_number: clean(a.house_number, 15),
      addition: clean(a.addition, 15),
      postal_code: clean(a.postal_code, 12),
      city: clean(a.city, 80),
      country: ['BE', 'NL', 'LU', 'FR', 'DE'].includes(a.country) ? a.country : 'BE',
    }));
  }
  await saveUser(env, user);
  return { user: publicUser(user) };
}

export async function setPassword(env, auth, body) {
  const { user, session } = auth;
  checkPassword(body.new_password);
  const viaFreshCode = session.via === 'code' && Date.now() - session.at < 30 * 60 * 1000;
  if (user.pass && !viaFreshCode) {
    const ok = safeEqual(await hashPassword(String(body.current_password || ''), user.pass.salt), user.pass.hash);
    if (!ok) throw new AuthError('Je huidige wachtwoord klopt niet', 401);
  }
  const salt = rnd(16);
  user.pass = { salt, hash: await hashPassword(body.new_password, salt) };
  await saveUser(env, user);
  return { ok: true };
}

/** Koppelt een bestelling aan het account (bij afrekenen terwijl ingelogd). */
export async function linkOrder(env, user, orderId) {
  user.orders = [orderId, ...(user.orders || []).filter((o) => o !== orderId)].slice(0, 500);
  await saveUser(env, user);
}
