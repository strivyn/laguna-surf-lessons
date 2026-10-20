// Stripe webhook. The event body is used only for the session id: the
// session is then read back from Stripe with our key, so a forged event can
// at most make us re-check a real session. No signing secret to manage.

import { methodGuard, readBody } from '../lib/http.js';
import { settle } from '../lib/payments.js';
import { paymentsOn } from '../lib/stripe.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const ev = readBody(req);
  const id = ev?.data?.object?.id;
  if (!paymentsOn() || !/^checkout\.session\./.test(String(ev?.type)) || !/^cs_(live|test)_/.test(String(id))) {
    return res.status(200).json({ ignored: true });
  }
  try {
    const out = await settle(id);
    res.status(200).json({ ok: true, kind: out.kind });
  } catch (err) {
    console.error('webhook settle failed', err.message);
    res.status(500).json({ error: 'retry' });
  }
}
