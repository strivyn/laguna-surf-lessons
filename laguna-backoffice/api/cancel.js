// Customer cancellation by token. Frees the slot so the site can sell it again.

import { sql } from '../lib/db.js';
import { releaseSlot } from '../lib/availability.js';
import { refund } from '../lib/giftcards.js';
import { readBody, methodGuard } from '../lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const { ref, token } = readBody(req);
  if (!ref || !token) return res.status(400).json({ error: 'missing booking reference' });

  const rows = await sql`
    SELECT id, session_id, status, gift_code, gift_cents
      FROM bookings
     WHERE ref = ${String(ref).trim().toUpperCase()} AND cancel_token = ${token}`;
  const booking = rows[0];
  if (!booking) return res.status(404).json({ error: 'we could not find that booking' });
  if (booking.status !== 'confirmed') {
    return res.status(200).json({ ok: true, alreadyCancelled: true });
  }

  await sql`
    UPDATE bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'customer'
     WHERE id = ${booking.id}`;
  await releaseSlot(booking.session_id);
  if (booking.gift_code && booking.gift_cents > 0) {
    await refund({ code: booking.gift_code, cents: booking.gift_cents, bookingId: booking.id });
  }
  await sql`
    INSERT INTO audit_log (actor, action, subject)
    VALUES ('customer', 'booking.cancelled', ${String(ref).toUpperCase()})`;

  res.status(200).json({ ok: true });
}
