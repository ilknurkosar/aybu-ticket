const bcrypt = require('bcryptjs');
const { getPool } = require('./pool');
const { env } = require('../config/env');
const { logger } = require('../logger');

async function seed() {
  const pool = getPool();
  const passwordHash = await bcrypt.hash(env.adminPassword, 12);

  await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, email_verified)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         password_hash = EXCLUDED.password_hash,
          role = 'admin',
          email_verified = true`,
    [env.adminEmail.toLowerCase(), env.adminFullName, passwordHash]
  );

  const demoTitle = 'AYBU Spring Cinema Night';
  const existingEvent = await pool.query('SELECT id FROM events WHERE title = $1 LIMIT 1', [demoTitle]);
  let eventId = existingEvent.rows[0]?.id;
  if (!eventId) {
    const eventResult = await pool.query(
      `INSERT INTO events (title, description, venue, starts_at, poster_url)
       VALUES ($1, $2, $3, now() + interval '10 days', $4)
       RETURNING id`,
      [
        demoTitle,
        'A campus movie night with limited seats and real-time reservations.',
        'AYBU Main Auditorium',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80'
      ]
    );
    eventId = eventResult.rows[0]?.id;
  }

  if (eventId) {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const row of rows) {
      for (let seat = 1; seat <= 10; seat += 1) {
        await pool.query(
          `INSERT INTO seats (event_id, row_label, seat_number)
           VALUES ($1, $2, $3)
           ON CONFLICT (event_id, row_label, seat_number) DO NOTHING`,
          [eventId, row, seat]
        );
      }
    }
  }

  logger.info('seed_completed');
  await pool.end();
}

if (require.main === module) {
  seed().catch((error) => {
    logger.error({ error }, 'seed_failed');
    process.exit(1);
  });
}

module.exports = { seed };
