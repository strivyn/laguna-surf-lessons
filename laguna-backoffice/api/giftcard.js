// Public gift card endpoints: buy one, or check what is left on one.

import { issue, lookup, MIN_CENTS, MAX_CENTS } from '../lib/giftcards.js';
import { readBody, methodGuard } from '../lib/http.js';
import { sql } from '../lib/db.js';
import { paymentsOn, createCheckout, SITE } from '../lib/stripe.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    const card = await lookup(req.query?.code);
    if (!card || card.status === 'void') return res.status(404).json({ error: 'no such gift card' });
    return res.status(200).json({
      code: card.code,
      balanceCents: card.balance_cents,
      initialCents: card.initial_cents,
      status: card.status,
    });
  }

  const b = readBody(req);
  if (!/^\S+@\S+\.\S+$/.test(String(b.recipientEmail || ''))) {
    return res.status(400).json({ error: 'we need the recipient email' });
  }
  if (!String(b.recipientName || '').trim()) {
    return res.status(400).json({ error: 'we need the recipient name' });
  }
  try {
    const card = await issue({
      amountCents: b.amountCents,
      purchaserName: b.purchaserName,
      purchaserEmail: b.purchaserEmail,
      recipientName: b.recipientName,
      recipientEmail: b.recipientEmail,
      message: b.message,
      sendOn: b.sendOn || null,
    });
    if (paymentsOn()) {
      let session;
      try {
        session = await createCheckout({
          name: `Laguna Surf Lessons gift card, $${card.initial_cents / 100}`,
          description: `For ${card.recipient_name}. Good for any lesson with Troy.`,
          amountCents: card.initial_cents,
          email: b.purchaserEmail || undefined,
          metadata: { gift: card.code },
          successUrl: `${SITE}/?giftpaid=${card.code}&cs={CHECKOUT_SESSION_ID}#gift`,
          cancelUrl: `${SITE}/?giftunpaid=1#gift`,
        });
      } catch (err) {
        console.error('gift checkout failed', err.message);
        await sql`UPDATE gift_cards SET status = 'void' WHERE code = ${card.code}`;
        return res.status(502).json({ error: 'Card payment is not working right now. Text Troy at 949-280-5818.' });
      }
      await sql`UPDATE gift_cards SET stripe_session_id = ${session.id} WHERE code = ${card.code}`;
      return res.status(201).json({ checkoutUrl: session.url });
    }
    res.status(201).json({
      code: card.code,
      amountCents: card.initial_cents,
      sendOn: card.send_on,
      recipientName: card.recipient_name,
      recipientEmail: card.recipient_email,
    });
  } catch (err) {
    if (err.code === 'AMOUNT_RANGE') {
      return res.status(400).json({
        error: `pick an amount between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}`,
      });
    }
    console.error('gift card issue failed', err);
    res.status(500).json({ error: 'could not create that gift card' });
  }
}
