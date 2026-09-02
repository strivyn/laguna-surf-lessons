// The schedule, and the only place that decides what is bookable.
//
// The public page never invents a slot. It asks for availability and renders
// exactly what comes back, which is what stops two people booking the same
// morning.
//
// A slot is Troy. It holds one lesson, whatever the party size — so capacity is
// 1 and "booked" means booked, not "three spots left". That changed when group
// lessons were dropped.

import { sql } from './db.js';

export const TZ = 'America/Los_Angeles';

export const SCHEDULE = {
  durationMin: 90,
  // Every two hours, so a ninety-minute lesson leaves thirty minutes to turn
  // the gear around.
  timesAllYear: ['7:00 AM', '9:00 AM', '11:00 AM'],
  timesInSeason: ['1:00 PM', '3:00 PM'],
  seasonMonths: [4, 5, 6, 7, 8, 9],   // April–September, 1-indexed
  daysOff: [2],                        // Tuesday (0 = Sunday)
  leadTimeHours: 12,
  horizonDays: 120,
};

export const LESSONS = {
  private:  { name: 'Private lesson',    cents: 16000, perPerson: false, min: 1, max: 1 },
  pgroup:   { name: 'Private group',     cents: 13000, perPerson: true,  min: 2, max: 5 },
  advanced: { name: 'Advanced coaching', cents: 16000, perPerson: false, min: 1, max: 1 },
};

export const ADDONS = {
  photo: { name: 'Photo & video package', cents: 4500 },
  gopro: { name: 'GoPro on the board',    cents: 2500 },
};

// ---------------------------------------------------------------- time

/** Offset of the given instant in the Laguna timezone, in minutes. */
function tzOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** '2026-09-04' + '7:00 AM' -> Date (the real instant) */
export function localToInstant(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(timeStr.trim());
  if (!match) throw new Error(`bad time: ${timeStr}`);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  const minute = Number(match[2]);

  // Guess with a fixed offset, then correct once — enough for everything except
  // the ambiguous hour at a DST boundary, and none of these times fall in it.
  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(guess);
    guess = new Date(Date.UTC(y, m - 1, d, hour, minute) - off * 60000);
  }
  return guess;
}

/** Today in Laguna, as 'YYYY-MM-DD'. */
export function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The times Troy teaches on a given local date — before any bookings. */
export function timesFor(dateStr) {
  if (SCHEDULE.daysOff.includes(weekdayOf(dateStr))) return [];
  const month = Number(dateStr.slice(5, 7));
  const times = [...SCHEDULE.timesAllYear];
  if (SCHEDULE.seasonMonths.includes(month)) times.push(...SCHEDULE.timesInSeason);
  return times;
}

// ---------------------------------------------------------------- slots

/**
 * Make sure every slot in the range exists as a row, then return the range.
 * Rows are created once and then owned by the database — blocking a slot or
 * booking it are updates, never re-derivations.
 */
export async function materialise(fromDate, toDate) {
  const wanted = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    for (const t of timesFor(d)) {
      wanted.push({ date: d, time: t, starts: localToInstant(d, t) });
    }
  }
  if (!wanted.length) return [];

  // One statement, ON CONFLICT DO NOTHING, so concurrent requests can race
  // safely and nobody ends up with duplicate slots.
  const values = [];
  const tuples = wanted.map((w, i) => {
    const b = i * 4;
    values.push(w.starts.toISOString(), w.date, w.time, SCHEDULE.durationMin);
    return `($${b + 1}::timestamptz, $${b + 2}::date, $${b + 3}, $${b + 4})`;
  });
  const { raw } = await import('./db.js');
  await raw(
    `INSERT INTO sessions (starts_at, local_date, local_time, duration_min)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (starts_at) DO NOTHING`,
    values
  );
  return wanted;
}

/**
 * What the site should show. Past slots and anything inside the lead time are
 * simply not returned — the widget cannot offer what it never receives.
 */
export async function availability(fromDate, toDate, now = new Date()) {
  await materialise(fromDate, toDate);
  const rows = await sql`
    SELECT id, starts_at, local_date::text AS local_date, local_time, capacity, booked_count, status
      FROM sessions
     WHERE local_date >= ${fromDate} AND local_date <= ${toDate}
     ORDER BY starts_at`;

  const cutoff = new Date(now.getTime() + SCHEDULE.leadTimeHours * 3600 * 1000);
  const byDate = new Map();
  for (const r of rows) {
    const starts = new Date(r.starts_at);
    if (starts < cutoff) continue;
    const open = r.status === 'open' && r.booked_count < r.capacity;
    if (!byDate.has(r.local_date)) byDate.set(r.local_date, []);
    byDate.get(r.local_date).push({
      id: Number(r.id),
      time: r.local_time,
      startsAt: starts.toISOString(),
      open,
      reason: open ? null : (r.status === 'blocked' ? 'blocked' : 'booked'),
    });
  }
  return [...byDate.entries()]
    .map(([date, slots]) => ({ date, slots }))
    .filter(d => d.slots.length > 0);
}

/**
 * Claim a slot. Atomic without a transaction, which matters because the Neon
 * HTTP driver cannot hold one across statements. Zero rows back means somebody
 * else got there first.
 */
export async function claimSlot(sessionId) {
  const rows = await sql`
    UPDATE sessions
       SET booked_count = booked_count + 1
     WHERE id = ${sessionId}
       AND status = 'open'
       AND booked_count + 1 <= capacity
    RETURNING id, local_date::text AS local_date, local_time, starts_at`;
  return rows[0] || null;
}

export async function releaseSlot(sessionId) {
  await sql`
    UPDATE sessions
       SET booked_count = GREATEST(booked_count - 1, 0)
     WHERE id = ${sessionId}`;
}

// ---------------------------------------------------------------- pricing

/** Price is always computed here, from the keys — never taken from the client. */
export function priceBooking({ lessonKey, partySize, addons = [] }) {
  const lesson = LESSONS[lessonKey];
  if (!lesson) throw new Error('unknown lesson');
  const size = Math.max(lesson.min, Math.min(lesson.max, Number(partySize) || lesson.min));
  const subtotal = lesson.perPerson ? lesson.cents * size : lesson.cents;
  let addonCents = 0;
  const applied = [];
  for (const key of addons) {
    const a = ADDONS[key];
    if (!a) continue;
    addonCents += a.cents;
    applied.push({ key, name: a.name, cents: a.cents });
  }
  return {
    lesson, partySize: size, subtotalCents: subtotal,
    addonsCents: addonCents, addons: applied,
    totalCents: subtotal + addonCents,
  };
}
