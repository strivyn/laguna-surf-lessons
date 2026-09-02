// Actions on one booking: cancel, weather-cancel, leave a note.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { releaseSlot } from '../../lib/availability.js';
import { refund } from '../../lib/giftcards.js';
import { readBody, methodGuard } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  const { ref, action, note } = readBody(req);
  if (!ref) return res.status(400).json({ error: 'which booking?' });

  const rows = await sql`
    SELECT id, session_id, status, gift_code, gift_cents
      FROM bookings WHERE ref = ${String(ref).trim().toUpperCase()}`;
  const b = rows[0];
  if (!b) return res.status(404).json({ error: 'no such booking' });

  if (action === 'note') {
    await sql`UPDATE bookings SET notes = ${String(note || '').slice(0, 2000)} WHERE id = ${b.id}`;
    return res.status(200).json({ ok: true });
  }

  if (action === 'cancel' || action === 'weather') {
    if (b.status !== 'confirmed') return res.status(200).json({ ok: true, alreadyCancelled: true });
    const status = action === 'weather' ? 'weather_cancelled' : 'cancelled';
    await sql`
      UPDATE bookings
         SET status = ${status}, cancelled_at = now(), cancel_reason = ${action === 'weather' ? 'surf called off' : 'cancelled by Troy'}
       WHERE id = ${b.id}`;
    await releaseSlot(b.session_id);
    if (b.gift_code && b.gift_cents > 0) {
      await refund({ code: b.gift_code, cents: b.gift_cents, bookingId: b.id });
    }
    await sql`
      INSERT INTO audit_log (actor, action, subject)
      VALUES ('troy', ${'booking.' + status}, ${String(ref).toUpperCase()})`;
    return res.status(200).json({ ok: true });
  }

  res.status(400).json({ error: 'unknown action' });
}
