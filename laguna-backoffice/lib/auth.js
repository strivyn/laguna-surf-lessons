// Back office access.
//
// One shared password for Troy, exchanged for a signed, expiring cookie. No
// user table, because there is one user. The password is never stored in the
// cookie and the cookie cannot be forged without ADMIN_SECRET.

import crypto from 'node:crypto';

const COOKIE = 'lsl_admin';
const TTL_MS = 30 * 24 * 3600 * 1000;   // a month; Troy checks this on a phone

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 16) throw new Error('ADMIN_SECRET is missing or too short');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueToken(now = Date.now()) {
  const payload = String(now + TTL_MS);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return false;
  const payload = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = sign(payload);
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Number(payload) > now;
}

export function checkPassword(given) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) throw new Error('ADMIN_PASSWORD is not set');
  const a = Buffer.from(crypto.createHash('sha256').update(String(given || '')).digest());
  const b = Buffer.from(crypto.createHash('sha256').update(real).digest());
  return crypto.timingSafeEqual(a, b);
}

export function cookieHeader(token) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (process.env.VERCEL) bits.push('Secure');
  return bits.join('; ');
}

export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Guard for every /api/admin/* handler. Returns true if the request may proceed. */
export function requireAdmin(req, res) {
  const token = readCookie(req, COOKIE);
  if (verifyToken(token)) return true;
  res.status(401).json({ error: 'not signed in' });
  return false;
}
