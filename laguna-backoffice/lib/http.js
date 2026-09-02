// Small helpers so every handler reads the same way.

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function bad(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
  return null;
}

export function methodGuard(req, res, ...allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'method not allowed' });
  return false;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export function money(cents) {
  return '$' + (Math.round(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** LSL-XXXX booking references. Unambiguous alphabet, same as the gift codes. */
export function bookingRef() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `LSL-${s}`;
}
