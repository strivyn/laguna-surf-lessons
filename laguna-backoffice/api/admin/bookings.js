// The Today and Calendar views come from here.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { todayLocal, addDays } from '../../lib/availability.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  const today = todayLocal();
  const from = String(req.query?.from || today);
  const to = String(req.query?.to || addDays(from, 6));

  const slots = await sql`
    SELECT id, local_date::text AS local_date, local_time, starts_at, status, booked_count, capacity, note
      FROM sessions
     WHERE local_date >= ${from} AND local_date <= ${to}
     ORDER BY starts_at`;

  const bookings = await sql`
    SELECT b.id, b.ref, b.session_id, b.lesson_key, b.lesson_name, b.party_size,
           b.subtotal_cents, b.addons_cents, b.gift_cents, b.total_cents,
           b.gift_code, b.status, b.notes, b.addons, b.created_at,
           s.local_date::text AS local_date, s.local_time, s.starts_at,
           c.name AS customer_name, c.email, c.phone,
           w.id AS waiver_id, w.signed_by_name, w.signer_role, w.signed_at, w.expires_at
      FROM bookings b
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
      LEFT JOIN waivers w ON w.booking_id = b.id
     WHERE s.local_date >= ${from} AND s.local_date <= ${to}
     ORDER BY s.starts_at`;

  const ids = bookings.map(b => Number(b.id));
  let people = [];
  if (ids.length) {
    people = await sql`
      SELECT booking_id, name, age, height, weight
        FROM participants
       WHERE booking_id = ANY(${ids})
       ORDER BY id`;
  }
  const byBooking = new Map();
  for (const p of people) {
    const k = Number(p.booking_id);
    if (!byBooking.has(k)) byBooking.set(k, []);
    byBooking.get(k).push(p);
  }

  res.status(200).json({
    from, to,
    slots: slots.map(s => ({ ...s, id: Number(s.id) })),
    bookings: bookings.map(b => ({
      ...b,
      id: Number(b.id),
      session_id: Number(b.session_id),
      participants: byBooking.get(Number(b.id)) || [],
      waiver: b.waiver_id ? {
        id: Number(b.waiver_id),
        signedByName: b.signed_by_name,
        signerRole: b.signer_role,
        signedAt: b.signed_at,
        expiresAt: b.expires_at,
      } : null,
    })),
  });
}
