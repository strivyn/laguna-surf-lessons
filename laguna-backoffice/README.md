# Laguna Surf Lessons

The public site and Troy's back office, in one Vercel deployment.

- `index.html` — the site. Single file: markup, styles, fonts and photographs
  are all inlined, so there is one request and nothing to go missing.
- `admin.html` — the back office, served at `/admin`.
- `api/` — Vercel serverless functions.
- `lib/` — the schedule, the database, gift cards, waivers, auth.
- `schema.sql` — run once against the database.
- `test/` — the suite, and a local stand-in for Vercel.

## The one rule

The page never invents a slot. It asks `/api/availability` and renders exactly
what comes back, and booking claims capacity with a single conditional UPDATE.
That is what stops two people ending up in the same lesson, and it is the
reason none of the availability logic lives in the browser.

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables), for
Production and Preview:

| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `ADMIN_PASSWORD` | the password Troy types at `/admin` |
| `ADMIN_SECRET` | long random string; signs the admin cookie |
| `CALENDAR_TOKEN` | long random string; the private calendar URL |

Generate the two secrets with `openssl rand -base64 32`. Changing
`ADMIN_SECRET` signs everyone out. Changing `CALENDAR_TOKEN` breaks the
calendar Troy has already subscribed to, so pick one and leave it.

## First run

```bash
psql "$DATABASE_URL" -f schema.sql
```

Slots are created on demand from `SCHEDULE` in `lib/availability.js` the first
time a date range is asked for, so there is nothing to seed.

## The schedule

Ninety-minute lessons every two hours: 7:00, 9:00 and 11:00 all year, plus 1:00
and 3:00 from April to September. Tuesdays off. Twelve hours' notice, and the
diary opens 120 days ahead. All of it is data at the top of
`lib/availability.js` — change it there, not in the page.

## Tests

```bash
DATABASE_URL=postgres://... node test/run.mjs
```

31 checks against a real PostgreSQL. The two that matter most are the ten
simultaneous bookings on one slot (exactly one wins) and the six simultaneous
redemptions of one gift card (it pays out its balance exactly once).

To drive it in a browser:

```bash
DATABASE_URL=... ADMIN_PASSWORD=... ADMIN_SECRET=... CALENDAR_TOKEN=... \
  node test/serve.mjs 3000
```

## Still to come

Stripe. Bookings record what is owed and gift cards come off the total, but no
money moves yet. The Payment Element goes in the last step of both forms, and
the amount it charges must come from the server, never the page.
