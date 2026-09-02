import { checkPassword, issueToken, cookieHeader, clearCookieHeader } from '../../lib/auth.js';
import { readBody, methodGuard } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST', 'DELETE')) return;

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookieHeader());
    return res.status(200).json({ ok: true });
  }

  const { password } = readBody(req);
  try {
    if (!checkPassword(password)) {
      // Slow a guesser down without holding the function open long.
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: 'that password is not right' });
    }
  } catch (err) {
    console.error('login misconfigured', err);
    return res.status(500).json({ error: 'the back office is not configured yet' });
  }
  res.setHeader('Set-Cookie', cookieHeader(issueToken()));
  res.status(200).json({ ok: true });
}
