// Block a slot out, or open it back up. Troy taps a free slot to close it.

import { sql } from '../../lib/db.js';
import { requireAdmin } from '../../lib/auth.js';
import { readBody, methodGuard } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  const { sessionId, blocked, note } = readBody(req);
  if (!sessionId) return res.status(400).json({ error: 'which slot?' });

  if (blocked) {
    const rows = await sql`
      UPDATE sessions SET status = 'blocked', note = ${String(note || '').slice(0, 200) || null}
       WHERE id = ${sessionId} AND booked_count = 0
      RETURNING id`;
    if (!rows.length) return res.status(409).json({ error: 'that slot has a booking in it' });
  } else {
    await sql`UPDATE sessions SET status = 'open', note = NULL WHERE id = ${sessionId}`;
  }
  await sql`
    INSERT INTO audit_log (actor, action, subject)
    VALUES ('troy', ${blocked ? 'slot.blocked' : 'slot.opened'}, ${String(sessionId)})`;
  res.status(200).json({ ok: true });
}
