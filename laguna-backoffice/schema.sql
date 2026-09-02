-- Laguna Surf Lessons — booking + back office schema
-- Postgres 16. Safe to run more than once.

CREATE TABLE IF NOT EXISTS customers (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL,
  phone         text,
  name          text,
  sms_opt_in    boolean NOT NULL DEFAULT true,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_key ON customers (lower(email));

-- One row per bookable slot. A slot is Troy: it holds exactly one lesson,
-- however many surfers are in that lesson.
CREATE TABLE IF NOT EXISTS sessions (
  id            bigserial PRIMARY KEY,
  starts_at     timestamptz NOT NULL,
  local_date    date NOT NULL,
  local_time    text NOT NULL,           -- '7:00 AM'
  duration_min  integer NOT NULL DEFAULT 90,
  capacity      integer NOT NULL DEFAULT 1,
  booked_count  integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'open',  -- open | blocked
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_capacity_ck CHECK (booked_count >= 0 AND booked_count <= capacity)
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_slot_key ON sessions (starts_at);
CREATE INDEX IF NOT EXISTS sessions_date_idx ON sessions (local_date);

CREATE TABLE IF NOT EXISTS bookings (
  id            bigserial PRIMARY KEY,
  ref           text NOT NULL UNIQUE,          -- LSL-XXXX
  session_id    bigint NOT NULL REFERENCES sessions(id),
  customer_id   bigint NOT NULL REFERENCES customers(id),
  lesson_key    text NOT NULL,                 -- private | pgroup | advanced
  lesson_name   text NOT NULL,
  party_size    integer NOT NULL DEFAULT 1,
  addons        jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents integer NOT NULL,
  addons_cents  integer NOT NULL DEFAULT 0,
  gift_cents    integer NOT NULL DEFAULT 0,    -- covered by a gift card
  total_cents   integer NOT NULL,              -- what the customer owes after gift card
  gift_code     text,
  status        text NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | weather_cancelled
  cancel_token  text NOT NULL,
  cancelled_at  timestamptz,
  cancel_reason text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_session_idx ON bookings (session_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx  ON bookings (status);

CREATE TABLE IF NOT EXISTS participants (
  id            bigserial PRIMARY KEY,
  booking_id    bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name          text NOT NULL,
  age           integer,
  height        text,
  weight        text
);
CREATE INDEX IF NOT EXISTS participants_booking_idx ON participants (booking_id);

-- Signed at booking. Valid one year from signing, per the release document.
CREATE TABLE IF NOT EXISTS waivers (
  id                bigserial PRIMARY KEY,
  booking_id        bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  participant_names text NOT NULL,
  signed_by_name    text NOT NULL,
  signer_role       text NOT NULL DEFAULT 'adult',  -- adult | guardian
  waiver_version    text NOT NULL DEFAULT '2026-08',
  signed_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  ip                text,
  user_agent        text
);
CREATE INDEX IF NOT EXISTS waivers_booking_idx ON waivers (booking_id);
CREATE INDEX IF NOT EXISTS waivers_signed_idx  ON waivers (signed_at);

CREATE TABLE IF NOT EXISTS gift_cards (
  code            text PRIMARY KEY,             -- LSL-GIFT-XXXX
  initial_cents   integer NOT NULL,
  balance_cents   integer NOT NULL,
  purchaser_name  text,
  purchaser_email text,
  recipient_name  text,
  recipient_email text,
  message         text,
  send_on         date,
  sent_at         timestamptz,
  status          text NOT NULL DEFAULT 'active',  -- active | spent | void
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_balance_ck CHECK (balance_cents >= 0 AND balance_cents <= initial_cents)
);
CREATE INDEX IF NOT EXISTS gift_status_idx ON gift_cards (status);

-- Every movement on a card. The balance column is a cache of this.
CREATE TABLE IF NOT EXISTS gift_card_ledger (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL REFERENCES gift_cards(code) ON DELETE CASCADE,
  delta_cents integer NOT NULL,          -- negative = redeemed
  booking_id  bigint REFERENCES bookings(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  actor       text NOT NULL DEFAULT 'customer',  -- customer | troy
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_ledger_code_idx ON gift_card_ledger (code, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  actor      text NOT NULL,
  action     text NOT NULL,
  subject    text,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);
