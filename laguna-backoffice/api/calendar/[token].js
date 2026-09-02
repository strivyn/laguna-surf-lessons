// Troy's calendar subscription.
//
// One private URL he adds once in Apple or Google Calendar. Read-only and
// one-way on purpose: his phone shows what the site has taken, and nothing he
// does in Calendar can quietly change the booking system.
//
// Cancelled bookings are still emitted, with STATUS:CANCELLED, so they
// disappear from his calendar instead of sitting there as ghost lessons.

import crypto from 'node:crypto';
import { sql } from '../../lib/db.js';
import { SCHEDULE, todayLocal, addDays } from '../../lib/availability.js';

const DOMAIN = 'lagunasurflessons.com';

function esc(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function stamp(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 wants lines folded at 75 octets. */
function fold(line) {
  if (Buffer.byteLength(line) <= 74) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' ' + ch; }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out.join('\r\n');
}

function tokenOk(given) {
  const real = process.env.CALENDAR_TOKEN || '';
  if (!real || real.length < 16) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(String(given || '')).digest());
  const b = Buffer.from(crypto.createHash('sha256').update(real).digest());
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const raw = String(req.query?.token || '').replace(/\.ics$/i, '');
  if (!tokenOk(raw)) {
    res.status(404).send('Not found');
    return;
  }

  const today = todayLocal();
  const from = addDays(today, -60);
  const to = addDays(today, SCHEDULE.horizonDays);

  const rows = await sql`
    SELECT b.ref, b.lesson_name, b.party_size, b.status, b.notes,
           b.total_cents, b.gift_cents,
           s.starts_at, s.duration_min,
           c.name AS customer_name, c.email, c.phone
      FROM bookings b
      JOIN sessions s  ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
     WHERE s.local_date >= ${from} AND s.local_date <= ${to}
     ORDER BY s.starts_at`;

  const now = stamp(new Date());
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Laguna Surf Lessons//Booking//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Laguna Surf Lessons',
    'X-WR-TIMEZONE:America/Los_Angeles',
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
  ];

  for (const r of rows) {
    const start = new Date(r.starts_at);
    const end = new Date(start.getTime() + (r.duration_min || SCHEDULE.durationMin) * 60000);
    const cancelled = r.status !== 'confirmed';
    const who = r.customer_name || r.email;
    const title = cancelled
      ? `Cancelled — ${who}`
      : `${who} · ${r.lesson_name}${r.party_size > 1 ? ` (${r.party_size})` : ''}`;

    const desc = [
      `Booking ${r.ref}`,
      `${r.lesson_name} · ${r.party_size} surfer${r.party_size > 1 ? 's' : ''}`,
      r.phone ? `Phone ${r.phone}` : null,
      r.email ? `Email ${r.email}` : null,
      r.gift_cents > 0 ? `Gift card covered $${(r.gift_cents / 100).toFixed(2)}` : null,
      `Owed $${(r.total_cents / 100).toFixed(2)}`,
      r.notes ? `Note: ${r.notes}` : null,
      cancelled ? `CANCELLED (${r.status.replace('_', ' ')})` : null,
    ].filter(Boolean).join('\n');

    out.push(
      'BEGIN:VEVENT',
      `UID:${r.ref}@${DOMAIN}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(title)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      fold('LOCATION:Thalia Street Beach\\, Laguna Beach\\, CA'),
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      cancelled ? 'TRANSP:TRANSPARENT' : 'TRANSP:OPAQUE',
      'SEQUENCE:' + (cancelled ? 1 : 0),
      'END:VEVENT',
    );
  }

  out.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(out.join('\r\n') + '\r\n');
}
