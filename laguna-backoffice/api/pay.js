// The customer's return from Stripe Checkout. Reads the session back from
// Stripe (never trusts the URL) and settles it, then returns what the
// confirmation panel needs.

import { methodGuard } from '../lib/http.js';
import { settle, publicBooking } from '../lib/payments.js';
import { paymentsOn } from '../lib/stripe.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;
  const cs = String(req.query?.cs || '');
  if (!paymentsOn() || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(cs)) return res.status(400).json({ error: 'bad session' });
  try {
    const out = await settle(cs);
    if (out.kind === 'booking' && out.booking) {
      return res.status(200).json({ kind: 'booking', paid: out.session.payment_status === 'paid', booking: publicBooking(out.booking) });
    }
    if (out.kind === 'gift' && out.gift) {
      const g = out.gift;
      return res.status(200).json({
        kind: 'gift', paid: g.status === 'active',
        gift: { code: g.code, amountCents: g.initial_cents, recipientName: g.recipient_name, recipientEmail: g.recipient_email, sendOn: g.send_on },
      });
    }
    res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error('pay settle failed', err.message);
    res.status(502).json({ error: 'could not check that payment' });
  }
}
