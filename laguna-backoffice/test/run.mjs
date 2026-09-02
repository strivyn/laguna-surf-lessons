// Tests against a real Postgres. No mocks — the things worth testing here are
// the race on a slot and the race on a gift card balance, and a mock cannot
// lose either race.
//
//   DATABASE_URL=postgres://... node test/run.mjs

import assert from 'node:assert/strict';
import { raw, sql, closeDb } from '../lib/db.js';
import { todayLocal, addDays, timesFor, localToInstant, priceBooking } from '../lib/availability.js';

process.env.ADMIN_PASSWORD ||= 'test-password';
process.env.ADMIN_SECRET   ||= 'test-secret-that-is-long-enough';
process.env.CALENDAR_TOKEN ||= 'test-calendar-token-value';

let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(['ok', name]); }
  catch (err) { fail++; results.push(['FAIL', name + ' — ' + err.message]); }
}

// ---------------------------------------------------------------- harness
function mockRes() {
  const res = {
    statusCode: 0, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
  };
  return res;
}
function mockReq(opts = {}) {
  return {
    method: opts.method || 'GET',
    query: opts.query || {},
    body: opts.body || {},
    headers: Object.assign({ 'user-agent': 'test' }, opts.headers || {}),
    socket: { remoteAddress: '127.0.0.1' },
  };
}
async function call(mod, opts) {
  const handler = (await import(mod)).default;
  const req = mockReq(opts), res = mockRes();
  await handler(req, res);
  return res;
}

// A signed-in cookie for the admin endpoints.
const { issueToken } = await import('../lib/auth.js');
const adminCookie = { cookie: `lsl_admin=${issueToken()}` };

async function reset() {
  await raw(`TRUNCATE gift_card_ledger, gift_cards, waivers, participants,
             bookings, sessions, customers, audit_log RESTART IDENTITY CASCADE`);
}

function futureDate() {
  // Far enough out to clear the 12-hour lead time, and on a day Troy teaches.
  let d = addDays(todayLocal(), 3);
  for (let i = 0; i < 7 && timesFor(d).length === 0; i++) d = addDays(d, 1);
  return d;
}

// ---------------------------------------------------------------- pure logic
await t('lesson length is ninety minutes on a two-hour grid', async () => {
  const { SCHEDULE } = await import('../lib/availability.js');
  assert.equal(SCHEDULE.durationMin, 90);
  const all = [...SCHEDULE.timesAllYear, ...SCHEDULE.timesInSeason];
  assert.deepEqual(all, ['7:00 AM', '9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM']);
  // consecutive slots are two hours apart
  const d = '2026-07-15';
  const mins = all.map(x => localToInstant(d, x).getTime());
  for (let i = 1; i < mins.length; i++) {
    assert.equal((mins[i] - mins[i - 1]) / 60000, 120, `${all[i - 1]} -> ${all[i]}`);
  }
});

await t('group lessons are gone from the price list', async () => {
  const { LESSONS } = await import('../lib/availability.js');
  assert.deepEqual(Object.keys(LESSONS).sort(), ['advanced', 'pgroup', 'private']);
  assert.equal(LESSONS.group, undefined);
});

await t('Tuesdays are closed and winter has no afternoon', async () => {
  assert.deepEqual(timesFor('2026-09-08'), []);                  // a Tuesday
  assert.equal(timesFor('2026-01-15').length, 3);                // January
  assert.equal(timesFor('2026-07-15').length, 5);                // July
});

await t('price is computed from the keys, never the client', async () => {
  const p = priceBooking({ lessonKey: 'pgroup', partySize: 4, addons: ['photo', 'gopro'] });
  assert.equal(p.subtotalCents, 52000);
  assert.equal(p.addonsCents, 7000);
  assert.equal(p.totalCents, 59000);
  // party size is clamped to the lesson's own limits
  assert.equal(priceBooking({ lessonKey: 'private', partySize: 9 }).partySize, 1);
  assert.equal(priceBooking({ lessonKey: 'pgroup', partySize: 99 }).partySize, 5);
});

// ---------------------------------------------------------------- availability
let day, slotId;
await t('availability materialises slots and offers only open ones', async () => {
  await reset();
  day = futureDate();
  const res = await call('../api/availability.js', { query: { from: day, to: day } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.days.length, 1);
  const slots = res.body.days[0].slots;
  assert.equal(slots.length, timesFor(day).length);
  assert.ok(slots.every(s => s.open));
  slotId = slots[0].id;
});

await t('nothing inside the lead time is offered', async () => {
  const res = await call('../api/availability.js', { query: { from: todayLocal(), to: todayLocal() } });
  const today = res.body.days.find(d => d.date === todayLocal());
  const soon = new Date(Date.now() + 12 * 3600 * 1000);
  if (today) {
    for (const s of today.slots) assert.ok(new Date(s.startsAt) >= soon, `${s.time} is inside the cutoff`);
  }
});

// ---------------------------------------------------------------- booking
function bookingBody(extra = {}) {
  return Object.assign({
    sessionId: slotId,
    lessonKey: 'private',
    partySize: 1,
    addons: ['gopro'],
    email: 'sam@example.com',
    phone: '9495550100',
    name: 'Sam Reed',
    participants: [{ name: 'Sam Reed', age: 34, height: `5'9"`, weight: '165 lb' }],
    waiver: { signedByName: 'Sam Reed', signerRole: 'adult', agreed: true },
  }, extra);
}

let bookedRef, cancelToken;
await t('a booking is taken, priced server-side, and stored with its waiver', async () => {
  const res = await call('../api/book.js', { method: 'POST', body: bookingBody({ totalCents: 1 }) });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.totalCents, 18500);          // 160 + 25, not the 1 they sent
  bookedRef = res.body.ref;
  cancelToken = res.body.cancelToken;

  const w = await sql`SELECT * FROM waivers`;
  assert.equal(w.length, 1);
  assert.equal(w[0].signed_by_name, 'Sam Reed');
  const years = new Date(w[0].expires_at).getUTCFullYear() - new Date(w[0].signed_at).getUTCFullYear();
  assert.equal(years, 1, 'waiver is valid for one year');
});

await t('the booked slot is no longer bookable on the site', async () => {
  const res = await call('../api/availability.js', { query: { from: day, to: day } });
  const slot = res.body.days[0].slots.find(s => s.id === slotId);
  assert.ok(slot, 'the slot should still be listed');
  assert.equal(slot.open, false, 'but it must not be open');
  assert.equal(slot.reason, 'booked');
});

await t('a second booking on the same slot is refused with 409', async () => {
  const res = await call('../api/book.js', { method: 'POST', body: bookingBody({ email: 'other@example.com' }) });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /just took that time/i);
});

await t('ten simultaneous bookings on one slot: exactly one wins', async () => {
  await reset();
  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  const id = Number(rows[0].id);

  const attempts = Array.from({ length: 10 }, (_, i) =>
    call('../api/book.js', {
      method: 'POST',
      body: bookingBody({ sessionId: id, email: `racer${i}@example.com` }),
    })
  );
  const settled = await Promise.all(attempts);
  const created = settled.filter(r => r.statusCode === 201).length;
  const refused = settled.filter(r => r.statusCode === 409).length;
  assert.equal(created, 1, `expected 1 winner, got ${created}`);
  assert.equal(refused, 9, `expected 9 refusals, got ${refused}`);

  const s = await sql`SELECT booked_count FROM sessions WHERE id = ${id}`;
  assert.equal(s[0].booked_count, 1);
});

await t('a waiver is missing for nobody — every booking has one', async () => {
  const res = await call('../api/admin/waivers.js', { headers: adminCookie });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.missing.length, 0);
  assert.ok(res.body.waivers.length >= 1);
});

// ---------------------------------------------------------------- cancellation
await t('cancelling releases the slot and the site can sell it again', async () => {
  await reset();
  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const openCount = async () => (await call('../api/availability.js', { query: { from: d, to: d } }))
    .body.days[0].slots.filter(s => s.open).length;
  const before = await openCount();
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  const id = Number(rows[0].id);

  const made = await call('../api/book.js', { method: 'POST', body: bookingBody({ sessionId: id }) });
  assert.equal(made.statusCode, 201);
  assert.equal(await openCount(), before - 1);

  const off = await call('../api/cancel.js', {
    method: 'POST', body: { ref: made.body.ref, token: made.body.cancelToken },
  });
  assert.equal(off.statusCode, 200);
  assert.equal(await openCount(), before, 'the slot should be back');
});

await t('a wrong cancel token cannot cancel anything', async () => {
  const d = futureDate();
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  const made = await call('../api/book.js', {
    method: 'POST', body: bookingBody({ sessionId: Number(rows[0].id), email: 'keep@example.com' }),
  });
  const res = await call('../api/cancel.js', { method: 'POST', body: { ref: made.body.ref, token: 'nope' } });
  assert.equal(res.statusCode, 404);
  const still = await sql`SELECT status FROM bookings WHERE ref = ${made.body.ref}`;
  assert.equal(still[0].status, 'confirmed');
});

// ---------------------------------------------------------------- gift cards
let code;
await t('a gift card is issued with a ledger entry', async () => {
  const res = await call('../api/giftcard.js', {
    method: 'POST',
    body: { amountCents: 32000, recipientName: 'Jo', recipientEmail: 'jo@example.com', purchaserName: 'Sam' },
  });
  assert.equal(res.statusCode, 201);
  code = res.body.code;
  assert.match(code, /^LSL-GIFT-[A-Z2-9]{4}$/);
  const led = await sql`SELECT * FROM gift_card_ledger WHERE code = ${code}`;
  assert.equal(led.length, 1);
  assert.equal(led[0].delta_cents, 32000);
});

await t('gift card amounts outside the range are refused', async () => {
  const low = await call('../api/giftcard.js', {
    method: 'POST', body: { amountCents: 100, recipientName: 'Jo', recipientEmail: 'jo@example.com' },
  });
  assert.equal(low.statusCode, 400);
});

await t('a gift card covers a booking and the rest is owed', async () => {
  await reset();
  const issued = await call('../api/giftcard.js', {
    method: 'POST',
    body: { amountCents: 10000, recipientName: 'Jo', recipientEmail: 'jo@example.com' },
  });
  const gcode = issued.body.code;

  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;

  const made = await call('../api/book.js', {
    method: 'POST',
    body: bookingBody({ sessionId: Number(rows[0].id), addons: [], giftCode: gcode }),
  });
  assert.equal(made.statusCode, 201);
  assert.equal(made.body.giftCents, 10000);
  assert.equal(made.body.totalCents, 6000, '$160 lesson less a $100 card');

  const card = await sql`SELECT balance_cents, status FROM gift_cards WHERE code = ${gcode}`;
  assert.equal(card[0].balance_cents, 0);
  assert.equal(card[0].status, 'spent');
});

await t('cancelling a booking puts the gift card balance back', async () => {
  const b = await sql`SELECT ref, gift_code, cancel_token FROM bookings ORDER BY id DESC LIMIT 1`;
  const res = await call('../api/cancel.js', {
    method: 'POST', body: { ref: b[0].ref, token: b[0].cancel_token },
  });
  assert.equal(res.statusCode, 200);
  const card = await sql`SELECT balance_cents, status FROM gift_cards WHERE code = ${b[0].gift_code}`;
  assert.equal(card[0].balance_cents, 10000);
  assert.equal(card[0].status, 'active');
});

await t('a card cannot be spent twice by two racing checkouts', async () => {
  await reset();
  const issued = await call('../api/giftcard.js', {
    method: 'POST', body: { amountCents: 16000, recipientName: 'Jo', recipientEmail: 'jo@example.com' },
  });
  const gcode = issued.body.code;
  const { redeem } = await import('../lib/giftcards.js');

  const tries = Array.from({ length: 6 }, () =>
    redeem({ code: gcode, requestCents: 16000, reason: 'race' }).catch(e => ({ error: e.code }))
  );
  const out = await Promise.all(tries);
  const applied = out.reduce((sum, r) => sum + (r.appliedCents || 0), 0);
  assert.equal(applied, 16000, `a $160 card paid out ${applied / 100}`);

  const card = await sql`SELECT balance_cents FROM gift_cards WHERE code = ${gcode}`;
  assert.equal(card[0].balance_cents, 0);
});

await t('Troy can redeem a card by hand and see the ledger', async () => {
  await reset();
  const issued = await call('../api/admin/giftcards.js', {
    method: 'POST', headers: adminCookie,
    body: { action: 'issue', amountCents: 20000, recipientName: 'Walk-up', recipientEmail: 'w@example.com' },
  });
  assert.equal(issued.statusCode, 201);
  const c = issued.body.card.code;

  const red = await call('../api/admin/giftcards.js', {
    method: 'POST', headers: adminCookie,
    body: { action: 'redeem', code: c, amountCents: 16000 },
  });
  assert.equal(red.statusCode, 200);
  assert.equal(red.body.appliedCents, 16000);
  assert.equal(red.body.balanceCents, 4000);

  const look = await call('../api/admin/giftcards.js', { query: { code: c }, headers: adminCookie });
  assert.equal(look.body.ledger.length, 2);
  assert.equal(look.body.ledger[1].actor, 'troy');
});

await t('a voided card stops working', async () => {
  const cards = await sql`SELECT code FROM gift_cards LIMIT 1`;
  await call('../api/admin/giftcards.js', {
    method: 'POST', headers: adminCookie, body: { action: 'void', code: cards[0].code },
  });
  const res = await call('../api/admin/giftcards.js', {
    method: 'POST', headers: adminCookie,
    body: { action: 'redeem', code: cards[0].code, amountCents: 1000 },
  });
  assert.equal(res.statusCode, 409);
});

// ---------------------------------------------------------------- back office
await t('every admin endpoint refuses an unsigned request', async () => {
  const mods = [
    ['../api/admin/bookings.js', 'GET'], ['../api/admin/giftcards.js', 'GET'],
    ['../api/admin/waivers.js', 'GET'],  ['../api/admin/settings.js', 'GET'],
    ['../api/admin/waivers-csv.js', 'GET'], ['../api/admin/waiver-pdf.js', 'GET'],
    ['../api/admin/blackout.js', 'POST'], ['../api/admin/booking.js', 'POST'],
    ['../api/admin/giftcards.js', 'POST'],
  ];
  for (const [mod, method] of mods) {
    const res = await call(mod, { method, query: { id: 1 } });
    assert.equal(res.statusCode, 401, `${mod} (${method}) let an anonymous request through`);
  }
});

await t('the password gate issues a cookie and rejects a wrong password', async () => {
  const good = await call('../api/admin/login.js', { method: 'POST', body: { password: 'test-password' } });
  assert.equal(good.statusCode, 200);
  assert.match(good.headers['set-cookie'], /lsl_admin=/);
  assert.match(good.headers['set-cookie'], /HttpOnly/);
  const bad = await call('../api/admin/login.js', { method: 'POST', body: { password: 'wrong' } });
  assert.equal(bad.statusCode, 401);
});

await t('a forged admin cookie does not work', async () => {
  const res = await call('../api/admin/settings.js', {
    headers: { cookie: 'lsl_admin=99999999999999.notarealsignature' },
  });
  assert.equal(res.statusCode, 401);
});

await t('blocking a slot takes it off the site, and it can be opened again', async () => {
  await reset();
  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  const id = Number(rows[0].id);
  const openCount = async () => (await call('../api/availability.js', { query: { from: d, to: d } }))
    .body.days[0].slots.filter(s => s.open).length;
  const before = await openCount();

  const off = await call('../api/admin/blackout.js', {
    method: 'POST', headers: adminCookie, body: { sessionId: id, blocked: true, note: 'dentist' },
  });
  assert.equal(off.statusCode, 200);
  assert.equal(await openCount(), before - 1);
  const marked = (await call('../api/availability.js', { query: { from: d, to: d } }))
    .body.days[0].slots.find(s => s.id === id);
  assert.equal(marked.reason, 'blocked');

  await call('../api/admin/blackout.js', {
    method: 'POST', headers: adminCookie, body: { sessionId: id, blocked: false },
  });
  assert.equal(await openCount(), before);
});

await t('a slot with a booking in it cannot be blocked out from under the customer', async () => {
  await reset();
  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  const id = Number(rows[0].id);
  await call('../api/book.js', { method: 'POST', body: bookingBody({ sessionId: id }) });
  const res = await call('../api/admin/blackout.js', {
    method: 'POST', headers: adminCookie, body: { sessionId: id, blocked: true },
  });
  assert.equal(res.statusCode, 409);
});

await t('Troy calling off the surf frees the slot', async () => {
  const b = await sql`SELECT ref, session_id FROM bookings ORDER BY id DESC LIMIT 1`;
  const res = await call('../api/admin/booking.js', {
    method: 'POST', headers: adminCookie, body: { ref: b[0].ref, action: 'weather' },
  });
  assert.equal(res.statusCode, 200);
  const s = await sql`SELECT booked_count FROM sessions WHERE id = ${b[0].session_id}`;
  assert.equal(s[0].booked_count, 0);
  const st = await sql`SELECT status FROM bookings WHERE ref = ${b[0].ref}`;
  assert.equal(st[0].status, 'weather_cancelled');
});

await t('the back office shows a lesson with its surfers, sizes and contact', async () => {
  await reset();
  const d = futureDate();
  await call('../api/availability.js', { query: { from: d, to: d } });
  const rows = await sql`SELECT id FROM sessions WHERE local_date = ${d} ORDER BY starts_at LIMIT 1`;
  await call('../api/book.js', {
    method: 'POST',
    body: bookingBody({
      sessionId: Number(rows[0].id), lessonKey: 'pgroup', partySize: 2,
      participants: [
        { name: 'Sam Reed', age: 34, height: `5'9"`, weight: '165 lb' },
        { name: 'Ada Reed', age: 11, height: `4'6"`, weight: '80 lb' },
      ],
    }),
  });
  const res = await call('../api/admin/bookings.js', {
    query: { from: d, to: d }, headers: adminCookie,
  });
  assert.equal(res.statusCode, 200);
  const b = res.body.bookings[0];
  assert.equal(b.participants.length, 2);
  assert.equal(b.participants[1].name, 'Ada Reed');
  assert.equal(b.participants[1].height, `4'6"`);
  assert.equal(b.phone, '9495550100');
  assert.ok(b.waiver, 'the waiver should come back with the booking');
});

// ---------------------------------------------------------------- waiver PDF
await t('a signed waiver renders as a real PDF', async () => {
  const w = await sql`SELECT id FROM waivers ORDER BY id DESC LIMIT 1`;
  const res = await call('../api/admin/waiver-pdf.js', {
    query: { id: Number(w[0].id) }, headers: adminCookie,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /attachment; filename="waiver-LSL-/);
  const buf = res.body;
  assert.ok(Buffer.isBuffer(buf) && buf.length > 2000, 'PDF looks empty');
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
});

await t('the CSV export has a header and a row per waiver', async () => {
  const res = await call('../api/admin/waivers-csv.js', { headers: adminCookie });
  assert.equal(res.statusCode, 200);
  const lines = String(res.body).trim().split('\n');
  assert.match(lines[0], /^Booking,Date,Time,Lesson,Participants,Signed by/);
  assert.ok(lines.length >= 2);
});

// ---------------------------------------------------------------- calendar
await t('the calendar feed is valid ICS and needs the token', async () => {
  const denied = await call('../api/calendar/[token].js', { query: { token: 'wrong' } });
  assert.equal(denied.statusCode, 404);

  const res = await call('../api/calendar/[token].js', {
    query: { token: process.env.CALENDAR_TOKEN },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/calendar; charset=utf-8');
  const ics = String(res.body);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.match(ics, /SUMMARY:/);
  assert.match(ics, /LOCATION:Thalia Street Beach/);
  // every line folded to the spec
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line) <= 75, 'unfolded line: ' + line.slice(0, 40));
  }
});

await t('a cancelled booking is published as cancelled so it leaves the phone', async () => {
  const b = await sql`SELECT ref, cancel_token FROM bookings WHERE status = 'confirmed' ORDER BY id DESC LIMIT 1`;
  await call('../api/cancel.js', { method: 'POST', body: { ref: b[0].ref, token: b[0].cancel_token } });
  const res = await call('../api/calendar/[token].js', { query: { token: process.env.CALENDAR_TOKEN } });
  const ics = String(res.body);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, new RegExp('UID:' + b[0].ref));
});

// ---------------------------------------------------------------- report
console.log('');
for (const [status, name] of results) {
  console.log(`  ${status === 'ok' ? '✓' : '✗'} ${name}`);
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
await closeDb();
process.exit(fail ? 1 : 0);
