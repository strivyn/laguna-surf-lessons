// Signed waivers: the list, and the "booked today, still unsigned" check.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { todayLocal, addDays } from '../../lib/availability.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  const today = todayLocal();
  const from = String(req.query?.from || addDays(today, -30));
  const to = String(req.query?.to || addDays(today, 180));

  const waivers = await sql`
    SELECT w.id, w.booking_id, w.participant_names, w.signed_by_name, w.signer_role,
           w.signed_at, w.expires_at, w.waiver_version,
           b.ref, b.lesson_name, s.local_date::text AS local_date, s.local_time,
           c.email, c.phone
      FROM waivers w
      JOIN bookings b  ON b.id = w.booking_id
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
     WHERE s.local_date >= ${from} AND s.local_date <= ${to}
     ORDER BY s.starts_at DESC`;

  const missing = await sql`
    SELECT b.ref, s.local_date::text AS local_date, s.local_time, c.name, c.email
      FROM bookings b
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
      LEFT JOIN waivers w ON w.booking_id = b.id
     WHERE w.id IS NULL AND b.status = 'confirmed'
       AND s.local_date >= ${from} AND s.local_date <= ${to}
     ORDER BY s.starts_at`;

  res.status(200).json({
    from, to,
    waivers: waivers.map(w => ({ ...w, id: Number(w.id), booking_id: Number(w.booking_id) })),
    missing,
  });
}
