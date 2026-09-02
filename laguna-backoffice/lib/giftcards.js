// Gift cards.
//
// The ledger is the record; `balance_cents` is a cache of it. That matters the
// first time Troy has to explain to someone why their card is short — he can
// show them every movement rather than a number.

import { sql } from './db.js';
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no I, O, 0, 1

export function newCode() {
  const bytes = crypto.randomBytes(4);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `LSL-GIFT-${out}`;
}

export const MIN_CENTS = 5000;
export const MAX_CENTS = 100000;

export async function issue({
  amountCents, purchaserName, purchaserEmail,
  recipientName, recipientEmail, message, sendOn, actor = 'customer',
}) {
  const cents = Math.round(Number(amountCents));
  if (!Number.isFinite(cents) || cents < MIN_CENTS || cents > MAX_CENTS) {
    const err = new Error('amount out of range');
    err.code = 'AMOUNT_RANGE';
    throw err;
  }

  // Retry on the vanishingly unlikely collision rather than trusting luck.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      const rows = await sql`
        INSERT INTO gift_cards
          (code, initial_cents, balance_cents, purchaser_name, purchaser_email,
           recipient_name, recipient_email, message, send_on)
        VALUES (${code}, ${cents}, ${cents}, ${purchaserName || null}, ${purchaserEmail || null},
                ${recipientName || null}, ${recipientEmail || null}, ${message || null},
                ${sendOn || null})
        RETURNING *`;
      await sql`
        INSERT INTO gift_card_ledger (code, delta_cents, reason, actor)
        VALUES (${code}, ${cents}, 'issued', ${actor})`;
      return rows[0];
    } catch (err) {
      if (String(err.message).includes('duplicate key')) continue;
      throw err;
    }
  }
  throw new Error('could not allocate a gift card code');
}

export async function lookup(code) {
  const rows = await sql`SELECT *, send_on::text AS send_on FROM gift_cards WHERE code = ${String(code || '').trim().toUpperCase()}`;
  return rows[0] || null;
}

export async function ledger(code) {
  return await sql`
    SELECT l.*, b.ref AS booking_ref
      FROM gift_card_ledger l
      LEFT JOIN bookings b ON b.id = l.booking_id
     WHERE l.code = ${code}
     ORDER BY l.created_at, l.id`;
}

/**
 * Take up to `requestCents` off a card. Conditional UPDATE, same shape as the
 * slot claim: if two checkouts race the same card, the second sees the balance
 * the first left behind, not the one it read a moment ago.
 *
 * Returns how much was actually applied — a card smaller than the lesson covers
 * what it covers and the rest is charged.
 */
export async function redeem({ code, requestCents, bookingId = null, reason = 'redeemed', actor = 'customer' }) {
  const card = await lookup(code);
  if (!card) {
    const err = new Error('no such gift card'); err.code = 'NOT_FOUND'; throw err;
  }
  if (card.status === 'void') {
    const err = new Error('gift card is void'); err.code = 'VOID'; throw err;
  }
  if (card.balance_cents <= 0) {
    const err = new Error('gift card has no balance left'); err.code = 'EMPTY'; throw err;
  }

  const want = Math.max(0, Math.round(Number(requestCents) || 0));
  const apply = Math.min(want, card.balance_cents);
  if (apply === 0) return { appliedCents: 0, balanceCents: card.balance_cents };

  const rows = await sql`
    UPDATE gift_cards
       SET balance_cents = balance_cents - ${apply},
           status = CASE WHEN balance_cents - ${apply} = 0 THEN 'spent' ELSE status END
     WHERE code = ${card.code}
       AND status <> 'void'
       AND balance_cents >= ${apply}
    RETURNING balance_cents, status`;

  if (!rows.length) {
    const err = new Error('gift card balance changed, try again');
    err.code = 'RACED';
    throw err;
  }

  await sql`
    INSERT INTO gift_card_ledger (code, delta_cents, booking_id, reason, actor)
    VALUES (${card.code}, ${-apply}, ${bookingId}, ${reason}, ${actor})`;

  return { appliedCents: apply, balanceCents: rows[0].balance_cents, status: rows[0].status };
}

/** Put value back — used when a booking that spent a card is cancelled. */
export async function refund({ code, cents, bookingId = null, reason = 'booking cancelled', actor = 'troy' }) {
  const add = Math.max(0, Math.round(Number(cents) || 0));
  if (!add) return null;
  const rows = await sql`
    UPDATE gift_cards
       SET balance_cents = LEAST(balance_cents + ${add}, initial_cents),
           status = CASE WHEN status = 'spent' THEN 'active' ELSE status END
     WHERE code = ${code}
    RETURNING balance_cents, status`;
  if (!rows.length) return null;
  await sql`
    INSERT INTO gift_card_ledger (code, delta_cents, booking_id, reason, actor)
    VALUES (${code}, ${add}, ${bookingId}, ${reason}, ${actor})`;
  return rows[0];
}

export async function setStatus(code, status, actor = 'troy') {
  if (!['active', 'void', 'spent'].includes(status)) throw new Error('bad status');
  const rows = await sql`
    UPDATE gift_cards SET status = ${status} WHERE code = ${code} RETURNING *`;
  if (rows.length) {
    await sql`
      INSERT INTO gift_card_ledger (code, delta_cents, reason, actor)
      VALUES (${code}, 0, ${'status set to ' + status}, ${actor})`;
  }
  return rows[0] || null;
}

export async function list({ status = null, limit = 200 } = {}) {
  if (status) {
    return await sql`
      SELECT * FROM gift_cards WHERE status = ${status}
       ORDER BY created_at DESC LIMIT ${limit}`;
  }
  return await sql`SELECT * FROM gift_cards ORDER BY created_at DESC LIMIT ${limit}`;
}
