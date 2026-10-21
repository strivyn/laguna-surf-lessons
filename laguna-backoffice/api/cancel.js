// Customer cancellation by token. Frees the slot so the site can sell it again.

import { sql } from '../lib/db.js';
import { releaseSlot } from '../lib/availability.js';
import { refund } from '../lib/giftcards.js';
import { readBody, methodGuard } from '../lib/http.js';
import { refundBookingCard, expireBooking, bookingView, alertTroy } from '../lib/payments.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const { ref, token } = readBody(req);
  if (!ref || !token) return res.status(400).json({ error: 'missing booking reference' });

  const rows = await sql`
    SELECT b.id, b.session_id, b.status, b.gift_code, b.gift_cents, b.paid_cents, s.starts_at
      FROM bookings b JOIN sessions s ON s.id = b.session_id
     WHERE b.ref = ${String(ref).trim().toUpperCase()} AND b.cancel_token = ${token}`;
  const booking = rows[0];
  if (!booking) return res.status(404).json({ error: 'we could not find that booking' });
  // Came back from Checkout without paying: let the slot go straight away.
  if (booking.status === 'pending_payment') {
    await expireBooking(String(ref).trim().toUpperCase(), 'left checkout');
    return res.status(200).json({ ok: true, released: true });
  }
  if (booking.status !== 'confirmed') {
    return res.status(200).json({ ok: true, alreadyCancelled: true });
  }

  // Policy: full refund with 24 hours' notice. Inside that, Troy decides,
  // so a paid booking cannot self-cancel and the customer is told to text him.
  const hoursOut = (new Date(booking.starts_at).getTime() - Date.now()) / 3600000;
  if (booking.paid_cents > 0 && hoursOut < 24) {
    return res.status(409).json({ error: 'Your lesson is less than 24 hours away. Text Troy at 949-280-5818 to change it.' });
  }

  await sql`
    UPDATE bookings
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'customer'
     WHERE id = ${booking.id}`;
  await releaseSlot(booking.session_id);
  if (booking.gift_code && booking.gift_cents > 0) {
    await refund({ code: booking.gift_code, cents: booking.gift_cents, bookingId: booking.id });
  }
  let refundedCents = 0;
  try { ({ refundedCents } = await refundBookingCard(booking.id, 'customer')); }
  catch (err) { console.error('card refund failed', err.message); }
  await sql`
    INSERT INTO audit_log (actor, action, subject)
    VALUES ('customer', 'booking.cancelled', ${String(ref).toUpperCase()})`;

  try { await alertTroy('cancelled', await bookingView(String(ref).trim().toUpperCase())); } catch {}
  res.status(200).json({ ok: true, refundedCents });
}
