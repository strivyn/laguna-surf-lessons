// Bulk export: every signed waiver in a date range, as a spreadsheet. The PDFs
// are the record; this is for reconciling against a season.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { todayLocal, addDays } from '../../lib/availability.js';

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  const today = todayLocal();
  const from = String(req.query?.from || addDays(today, -365));
  const to = String(req.query?.to || addDays(today, 180));

  const rows = await sql`
    SELECT b.ref, s.local_date::text AS local_date, s.local_time, b.lesson_name,
           w.participant_names, w.signed_by_name, w.signer_role,
           w.signed_at, w.expires_at, w.waiver_version, w.ip,
           c.email, c.phone
      FROM waivers w
      JOIN bookings b  ON b.id = w.booking_id
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
     WHERE s.local_date >= ${from} AND s.local_date <= ${to}
     ORDER BY s.starts_at`;

  const head = ['Booking', 'Date', 'Time', 'Lesson', 'Participants', 'Signed by',
                'Signer role', 'Signed at', 'Valid until', 'Version', 'IP', 'Email', 'Phone'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.ref, r.local_date, r.local_time, r.lesson_name, r.participant_names,
      r.signed_by_name, r.signer_role, r.signed_at, r.expires_at,
      r.waiver_version, r.ip, r.email, r.phone,
    ].map(cell).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="waivers-${from}-to-${to}.csv"`);
  res.status(200).send(lines.join('\n'));
}
