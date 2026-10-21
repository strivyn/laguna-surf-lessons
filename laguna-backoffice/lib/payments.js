// Booking and gift card payment state. Every path that learns a Checkout
// session's outcome (the customer's return, the webhook, the sweep) funnels
// through settleBookingSession / settleGiftSession, and every state change is
// a guarded UPDATE, so running any of them twice does nothing the second time.

import { sql } from './db.js';
import { claimSlot, releaseSlot, SCHEDULE } from './availability.js';
import { refund as refundGift } from './giftcards.js';
import { getCheckout, refundPayment, paymentsOn, CHECKOUT_MINUTES } from './stripe.js';
import { sendConfirmation, sendGiftReceipt, sendGiftToRecipient, sendTroyAlert } from './email.js';
import { TZ } from './availability.js';

async function audit(actor, action, subject, detail) {
  await sql`
    INSERT INTO audit_log (actor, action, subject, detail)
    VALUES (${actor}, ${action}, ${subject}, ${detail ? JSON.stringify(detail) : null})`;
}

export async function bookingView(ref) {
  const rows = await sql`
    SELECT b.*, s.starts_at, s.local_date::text AS local_date, s.local_time,
           c.email, c.phone, c.name AS customer_name
      FROM bookings b
      JOIN sessions s ON s.id = b.session_id
      JOIN customers c ON c.id = b.customer_id
     WHERE b.ref = ${ref}`;
  const b = rows[0];
  if (!b) return null;
  const people = await sql`SELECT name FROM participants WHERE booking_id = ${b.id} ORDER BY id`;
  b.names = people.map(p => p.name);
  return b;
}

export async function alertTroy(kind, b) {
  try {
    const r = await sendTroyAlert(kind, b);
    await audit('system', r.ok ? 'email.sent' : 'email.failed', b.ref, { kind: 'troy ' + kind, ...r });
  } catch (err) {
    console.error('troy alert failed', err.message);
  }
}

export function publicBooking(b) {
  return {
    ref: b.ref,
    status: b.status,
    lesson: b.lesson_name,
    partySize: b.party_size,
    when: { date: b.local_date, time: b.local_time, startsAt: b.starts_at },
    durationMin: SCHEDULE.durationMin,
    giftCents: b.gift_cents,
    totalCents: b.total_cents,
    paidCents: b.paid_cents,
  };
}

export async function emailConfirmation(b) {
  try {
    const sent = await sendConfirmation(b.email, {
      ref: b.ref,
      lesson: b.lesson_name,
      startsAt: b.starts_at,
      names: b.names,
      addons: Array.isArray(b.addons) ? b.addons : [],
      giftCents: b.gift_cents,
      totalCents: b.total_cents,
      paidCents: b.paid_cents,
    });
    await audit('system', sent.ok ? 'email.sent' : 'email.failed', b.ref, sent);
    await alertTroy('booked', b);
    return sent.ok;
  } catch (err) {
    console.error('confirmation email failed', err);
    return false;
  }
}

/** Give back what a booking that never got paid was holding. */
export async function expireBooking(ref, why = 'checkout expired') {
  const rows = await sql`
    UPDATE bookings SET status = 'expired', cancelled_at = now(), cancel_reason = ${why}
     WHERE ref = ${ref} AND status = 'pending_payment'
     RETURNING id, session_id, gift_code, gift_cents`;
  const b = rows[0];
  if (!b) return false;
  await releaseSlot(b.session_id);
  if (b.gift_code && b.gift_cents > 0) {
    await refundGift({ code: b.gift_code, cents: b.gift_cents, bookingId: b.id, reason: 'checkout not completed', actor: 'system' });
  }
  await audit('system', 'booking.expired', ref, { why });
  return true;
}

/** Apply what Stripe says about a booking's Checkout session. */
export async function settleBookingSession(session) {
  const ref = session?.metadata?.ref;
  if (!ref) return null;
  const cur = await sql`SELECT id, status, session_id, stripe_session_id FROM bookings WHERE ref = ${ref}`;
  const row = cur[0];
  if (!row || row.stripe_session_id !== session.id) return null;

  if (session.payment_status === 'paid') {
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    let confirmed = await sql`
      UPDATE bookings
         SET status = 'confirmed', paid_cents = ${session.amount_total}, paid_at = now(),
             stripe_payment_intent = ${pi}
       WHERE id = ${row.id} AND status = 'pending_payment'
       RETURNING id`;

    // Paid after the hold lapsed. Take the slot back if it is still free,
    // otherwise refund in full: never keep money for a lesson we cannot give.
    if (!confirmed.length && row.status === 'expired') {
      const slot = await claimSlot(row.session_id);
      if (slot) {
        confirmed = await sql`
          UPDATE bookings
             SET status = 'confirmed', paid_cents = ${session.amount_total}, paid_at = now(),
                 stripe_payment_intent = ${pi}, cancelled_at = NULL, cancel_reason = NULL
           WHERE id = ${row.id} AND status = 'expired'
           RETURNING id`;
        if (!confirmed.length) await releaseSlot(row.session_id);
      } else {
        await refundPayment(pi, session.amount_total, { ref, reason: 'slot gone after late payment' });
        await sql`UPDATE bookings SET status = 'refunded', paid_cents = ${session.amount_total},
                    refunded_cents = ${session.amount_total}, stripe_payment_intent = ${pi}
                   WHERE id = ${row.id} AND status = 'expired'`;
        await audit('system', 'booking.late_payment_refunded', ref, { amount: session.amount_total });
        return bookingView(ref);
      }
    }

    const b = await bookingView(ref);
    if (confirmed.length) {
      await audit('stripe', 'booking.paid', ref, { amount: session.amount_total, pi });
      await emailConfirmation(b);
    }
    return b;
  }

  if (session.status === 'expired') await expireBooking(ref);
  return bookingView(ref);
}

export async function settleGiftSession(session) {
  const code = session?.metadata?.gift;
  if (!code) return null;
  if (session.payment_status === 'paid') {
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const buyer = session.customer_details?.email || null;
    const rows = await sql`
      UPDATE gift_cards SET status = 'active', stripe_payment_intent = ${pi},
             purchaser_email = COALESCE(purchaser_email, ${buyer})
       WHERE code = ${code} AND stripe_session_id = ${session.id} AND status = 'unpaid'
       RETURNING *`;
    if (rows.length) {
      const g = rows[0];
      await sql`INSERT INTO gift_card_ledger (code, delta_cents, reason, actor)
                VALUES (${code}, 0, 'paid by card', 'stripe')`;
      await audit('stripe', 'giftcard.paid', code, { amount: session.amount_total, pi });
      if (g.purchaser_email) {
        const r = await sendGiftReceipt(g.purchaser_email, g).catch(e => ({ ok: false, error: e.message }));
        await audit('system', r.ok ? 'email.sent' : 'email.failed', code, { kind: 'gift receipt', ...r });
      }
      await deliverDueGifts();
    }
  }
  const out = await sql`SELECT * FROM gift_cards WHERE code = ${code} AND stripe_session_id = ${session.id}`;
  return out[0] || null;
}

export async function settle(sessionId) {
  const s = await getCheckout(sessionId);
  if (s.metadata?.ref) return { kind: 'booking', session: s, booking: await settleBookingSession(s) };
  if (s.metadata?.gift) return { kind: 'gift', session: s, gift: await settleGiftSession(s) };
  return { kind: 'unknown', session: s };
}

/**
 * Clear out bookings whose checkout should be over by now. Called from the
 * availability endpoint so held slots come back without a cron job, and a
 * customer who paid then closed the tab still gets confirmed and emailed.
 */
export async function sweepPending(limit = 5) {
  if (!paymentsOn()) return;
  const rows = await sql`
    SELECT ref, stripe_session_id FROM bookings
     WHERE status = 'pending_payment'
       AND created_at < now() - make_interval(mins => ${CHECKOUT_MINUTES + 2})
     ORDER BY created_at LIMIT ${limit}`;
  for (const r of rows) {
    try {
      if (!r.stripe_session_id) { await expireBooking(r.ref, 'checkout never started'); continue; }
      const s = await getCheckout(r.stripe_session_id);
      if (s.payment_status === 'paid' || s.status === 'expired') await settleBookingSession(s);
    } catch (err) {
      console.error('sweep failed for', r.ref, err.message);
    }
  }
}

/** Refund the card part of a cancelled booking, if there was one. */
export async function refundBookingCard(id, actor) {
  const rows = await sql`SELECT ref, stripe_payment_intent, paid_cents, refunded_cents FROM bookings WHERE id = ${id}`;
  const b = rows[0];
  const owed = b ? b.paid_cents - b.refunded_cents : 0;
  if (!b || !b.stripe_payment_intent || owed <= 0) return { refundedCents: 0 };
  const r = await refundPayment(b.stripe_payment_intent, owed, { ref: b.ref, actor });
  await sql`UPDATE bookings SET refunded_cents = refunded_cents + ${owed} WHERE id = ${id}`;
  await audit(actor, 'booking.refunded', b.ref, { cents: owed, refund: r.id });
  return { refundedCents: owed };
}

/**
 * Email gift cards whose send date has come. Called on payment and from the
 * availability endpoint, so a card dated for a birthday goes out that morning
 * without a cron job. The sent_at guard stops a double send.
 */
export async function deliverDueGifts(limit = 5) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const due = await sql`
    UPDATE gift_cards SET sent_at = now()
     WHERE code IN (
       SELECT code FROM gift_cards
        WHERE status = 'active' AND sent_at IS NULL AND stripe_payment_intent IS NOT NULL
          AND recipient_email IS NOT NULL AND (send_on IS NULL OR send_on <= ${today})
        ORDER BY created_at LIMIT ${limit})
     RETURNING *`;
  for (const g of due) {
    const r = await sendGiftToRecipient(g).catch(e => ({ ok: false, error: e.message }));
    if (!r.ok) await sql`UPDATE gift_cards SET sent_at = NULL WHERE code = ${g.code}`;
    await audit('system', r.ok ? 'email.sent' : 'email.failed', g.code, { kind: 'gift delivery', ...r });
  }
}
