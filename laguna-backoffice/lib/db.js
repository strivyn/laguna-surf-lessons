// One query interface for the whole app.
//
//   const rows = await sql`SELECT * FROM bookings WHERE ref = ${ref}`
//
// Values are always parameterised. There is no string interpolation path in
// here on purpose.
//
// The driver is node-postgres, which talks to Neon over TCP with TLS exactly as
// it would to any other Postgres. An earlier version branched to Neon's HTTP
// driver in production and plain pg locally; that meant the code running on
// Vercel was not the code the tests exercised, and it broke twice — once on
// `date` columns coming back as strings from one driver and Date objects from
// the other, once on an API that only one of them had. One driver, tested.

import pg from 'pg';

let pool = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new pg.Pool({
    connectionString: url,
    // Neon terminates TLS at its proxy with a certificate chain Node does not
    // ship a root for; the connection is still encrypted.
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('idle client error', err.message));
  return pool;
}

/** Tagged template: sql`SELECT ... ${value}` -> rows */
export async function sql(strings, ...values) {
  let text = '';
  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < values.length) text += '$' + (i + 1);
  });
  const res = await getPool().query(text, values);
  return res.rows;
}

/** For statements built elsewhere (the slot materialiser, migrations). */
export async function raw(text, values = []) {
  const res = await getPool().query(text, values);
  return res.rows;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
}
