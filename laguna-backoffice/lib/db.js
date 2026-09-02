// One query interface, two drivers.
//
// In production DATABASE_URL points at Neon and we use its HTTP driver, which
// suits serverless: no pool to keep warm, no connection to leak. Locally the
// same code runs against a plain Postgres over the wire so the tests exercise
// real SQL rather than a mock.
//
// Both are reached through the same tagged template:
//
//   const rows = await sql`SELECT * FROM bookings WHERE ref = ${ref}`
//
// Values are always parameterised. There is no string interpolation path in
// here on purpose.

let driver = null;

function isNeon(url) {
  return /neon\.tech|neon\.build/.test(url || '');
}

async function getDriver() {
  if (driver) return driver;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  if (isNeon(url)) {
    const { neon } = await import('@neondatabase/serverless');
    const q = neon(url);
    driver = {
      kind: 'neon',
      async query(text, values) {
        return await q.query(text, values);
      },
    };
  } else {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: url, max: 3 });
    driver = {
      kind: 'pg',
      async query(text, values) {
        const res = await pool.query(text, values);
        return res.rows;
      },
      async end() {
        await pool.end();
      },
    };
  }
  return driver;
}

/** Tagged template: sql`SELECT ... ${value}` -> rows */
export async function sql(strings, ...values) {
  let text = '';
  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < values.length) text += '$' + (i + 1);
  });
  const d = await getDriver();
  return await d.query(text, values);
}

/** For statements built elsewhere (migrations). */
export async function raw(text, values = []) {
  const d = await getDriver();
  return await d.query(text, values);
}

export async function closeDb() {
  if (driver && driver.end) await driver.end();
  driver = null;
}
