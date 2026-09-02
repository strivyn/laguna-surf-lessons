// One signed waiver, as a PDF.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { methodGuard } from '../../lib/http.js';
import { waiverPdf } from '../../lib/waiver-pdf.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  const id = Number(req.query?.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'which waiver?' });

  const rows = await sql`
    SELECT w.*, b.ref, b.lesson_name, s.local_date::text AS local_date, s.local_time, c.email, c.phone
      FROM waivers w
      JOIN bookings b  ON b.id = w.booking_id
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
     WHERE w.id = ${id}`;
  const w = rows[0];
  if (!w) return res.status(404).json({ error: 'no such waiver' });

  const bytes = await waiverPdf(w);
  const name = `waiver-${w.ref}-${String(w.participant_names).split(',')[0].trim().replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.status(200).send(Buffer.from(bytes));
}
