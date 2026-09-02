// Gift cards in the back office: list, look one up, issue by hand, redeem,
// void. Redeeming here is how Troy takes money off a card for someone who
// walked up with it rather than booking online.

import { requireAdmin } from '../../lib/auth.js';
import { readBody, methodGuard } from '../../lib/http.js';
import { list, lookup, ledger, issue, redeem, setStatus } from '../../lib/giftcards.js';
import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    const code = req.query?.code;
    if (code) {
      const card = await lookup(code);
      if (!card) return res.status(404).json({ error: 'no such gift card' });
      return res.status(200).json({ card, ledger: await ledger(card.code) });
    }
    return res.status(200).json({ cards: await list({ status: req.query?.status || null }) });
  }

  const b = readBody(req);
  try {
    if (b.action === 'issue') {
      const card = await issue({
        amountCents: b.amountCents,
        purchaserName: b.purchaserName,
        purchaserEmail: b.purchaserEmail,
        recipientName: b.recipientName,
        recipientEmail: b.recipientEmail,
        message: b.message,
        sendOn: b.sendOn || null,
        actor: 'troy',
      });
      return res.status(201).json({ card });
    }

    if (b.action === 'redeem') {
      let bookingId = null;
      if (b.bookingRef) {
        const rows = await sql`SELECT id FROM bookings WHERE ref = ${String(b.bookingRef).trim().toUpperCase()}`;
        if (!rows.length) return res.status(404).json({ error: 'no such booking' });
        bookingId = rows[0].id;
      }
      const out = await redeem({
        code: b.code,
        requestCents: b.amountCents,
        bookingId,
        reason: b.reason || 'redeemed in person',
        actor: 'troy',
      });
      return res.status(200).json(out);
    }

    if (b.action === 'void' || b.action === 'unvoid') {
      const card = await setStatus(b.code, b.action === 'void' ? 'void' : 'active');
      if (!card) return res.status(404).json({ error: 'no such gift card' });
      return res.status(200).json({ card });
    }
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'no such gift card' });
    if (err.code === 'VOID')      return res.status(409).json({ error: 'that card is void' });
    if (err.code === 'EMPTY')     return res.status(409).json({ error: 'that card has nothing left on it' });
    if (err.code === 'RACED')     return res.status(409).json({ error: 'the balance just changed — look it up again' });
    if (err.code === 'AMOUNT_RANGE') return res.status(400).json({ error: 'amount out of range' });
    console.error('gift card admin failed', err);
    return res.status(500).json({ error: 'that did not work' });
  }

  res.status(400).json({ error: 'unknown action' });
}
