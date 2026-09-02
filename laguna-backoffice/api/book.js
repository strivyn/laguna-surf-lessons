// Take a booking.
//
// Order matters here. The slot is claimed before anything else is written, and
// the price is recomputed from the lesson key rather than trusted from the
// client. A client sending totalCents: 1 still owes $160.

import crypto from 'node:crypto';
import { sql } from '../lib/db.js';
import { claimSlot, releaseSlot, priceBooking, SCHEDULE } from '../lib/availability.js';
import { redeem } from '../lib/giftcards.js';
import { readBody, methodGuard, clientIp, bookingRef } from '../lib/http.js';

const WAIVER_VERSION = '2026-08';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const body = readBody(req);

  const {
    sessionId, lessonKey, partySize, addons = [],
    email, phone, name, smsOptIn = true, marketingOptIn = false,
    participants = [], waiver = {}, giftCode = null,
  } = body;

  // ---- validate before touching anything
  if (!sessionId) return res.status(400).json({ error: 'pick a time' });
  if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'we need a valid email' });
  if (String(phone || '').replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'we need a phone number' });

  let priced;
  try {
    priced = priceBooking({ lessonKey, partySize, addons });
  } catch {
    return res.status(400).json({ error: 'unknown lesson' });
  }

  const signedBy = String(waiver.signedByName || '').trim();
  const role = waiver.signerRole === 'guardian' ? 'guardian' : 'adult';
  if (!signedBy) return res.status(400).json({ error: 'the waiver needs a signature' });
  if (waiver.agreed !== true) return res.status(400).json({ error: 'the waiver has to be agreed to' });

  const people = (Array.isArray(participants) ? participants : [])
    .map(p => ({
      name: String(p?.name || '').trim(),
      age: Number.isFinite(Number(p?.age)) ? Number(p.age) : null,
      height: String(p?.height || '').trim() || null,
      weight: String(p?.weight || '').trim() || null,
    }))
    .filter(p => p.name);
  if (people.length === 0) return res.status(400).json({ error: 'tell us who is surfing' });

  // ---- claim the slot first
  let slot;
  try {
    slot = await claimSlot(sessionId);
  } catch (err) {
    console.error('claim failed', err);
    return res.status(500).json({ error: 'could not hold that time' });
  }
  if (!slot) {
    return res.status(409).json({ error: 'Someone just took that time. Pick another and we will hold it.' });
  }

  let bookingId = null;
  let appliedGift = 0;
  try {
    // ---- customer
    const custRows = await sql`
      INSERT INTO customers (email, phone, name, sms_opt_in, marketing_opt_in)
      VALUES (${String(email).trim()}, ${String(phone).trim()}, ${String(name || people[0].name).trim()},
              ${!!smsOptIn}, ${!!marketingOptIn})
      ON CONFLICT (lower(email)) DO UPDATE
        SET phone = EXCLUDED.phone,
            name  = COALESCE(EXCLUDED.name, customers.name),
            sms_opt_in = EXCLUDED.sms_opt_in,
            marketing_opt_in = customers.marketing_opt_in OR EXCLUDED.marketing_opt_in
      RETURNING id`;
    const customerId = custRows[0].id;

    // ---- booking
    const ref = bookingRef();
    const cancelToken = crypto.randomBytes(24).toString('base64url');
    const bookRows = await sql`
      INSERT INTO bookings
        (ref, session_id, customer_id, lesson_key, lesson_name, party_size, addons,
         subtotal_cents, addons_cents, gift_cents, total_cents, gift_code, cancel_token)
      VALUES (${ref}, ${slot.id}, ${customerId}, ${lessonKey}, ${priced.lesson.name},
              ${priced.partySize}, ${JSON.stringify(priced.addons)},
              ${priced.subtotalCents}, ${priced.addonsCents}, 0, ${priced.totalCents},
              ${null}, ${cancelToken})
      RETURNING id, ref`;
    bookingId = bookRows[0].id;

    // ---- participants
    for (const p of people) {
      await sql`
        INSERT INTO participants (booking_id, name, age, height, weight)
        VALUES (${bookingId}, ${p.name}, ${p.age}, ${p.height}, ${p.weight})`;
    }

    // ---- waiver
    const signedAt = new Date();
    const expires = new Date(signedAt.getTime());
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    await sql`
      INSERT INTO waivers
        (booking_id, participant_names, signed_by_name, signer_role, waiver_version,
         signed_at, expires_at, ip, user_agent)
      VALUES (${bookingId}, ${people.map(p => p.name).join(', ')}, ${signedBy}, ${role},
              ${WAIVER_VERSION}, ${signedAt.toISOString()}, ${expires.toISOString()},
              ${clientIp(req)}, ${String(req.headers['user-agent'] || '').slice(0, 400)})`;

    // ---- gift card, if they brought one
    if (giftCode) {
      try {
        const out = await redeem({
          code: giftCode, requestCents: priced.totalCents,
          bookingId, reason: 'applied at checkout', actor: 'customer',
        });
        appliedGift = out.appliedCents;
      } catch (err) {
        // A bad code should not lose the booking — it just does not discount it.
        console.warn('gift card not applied', err.code || err.message);
      }
    }

    const owed = Math.max(0, priced.totalCents - appliedGift);
    await sql`
      UPDATE bookings
         SET gift_cents = ${appliedGift},
             total_cents = ${owed},
             gift_code = ${appliedGift > 0 ? String(giftCode).trim().toUpperCase() : null}
       WHERE id = ${bookingId}`;

    await sql`
      INSERT INTO audit_log (actor, action, subject, detail)
      VALUES ('customer', 'booking.created', ${ref},
              ${JSON.stringify({ sessionId: Number(slot.id), owed, appliedGift })})`;

    res.status(201).json({
      ref,
      cancelToken,
      when: { date: slot.local_date, time: slot.local_time, startsAt: slot.starts_at },
      durationMin: SCHEDULE.durationMin,
      lesson: priced.lesson.name,
      partySize: priced.partySize,
      subtotalCents: priced.subtotalCents,
      addonsCents: priced.addonsCents,
      giftCents: appliedGift,
      totalCents: owed,
      meetingPoint: 'Bottom of the Thalia Street stairs',
    });
  } catch (err) {
    console.error('booking failed after claim', err);
    // Give the slot back rather than leaving a hole in the calendar.
    try { await releaseSlot(slot.id); } catch {}
    res.status(500).json({ error: 'could not complete that booking' });
  }
}
