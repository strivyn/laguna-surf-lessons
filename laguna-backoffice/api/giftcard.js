// Public gift card endpoints: buy one, or check what is left on one.

import { issue, lookup, MIN_CENTS, MAX_CENTS } from '../lib/giftcards.js';
import { readBody, methodGuard } from '../lib/http.js';

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
