const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');
const { logger } = require('../logger');

async function migrate() {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (alreadyApplied.rowCount) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      logger.info({ migration: file }, 'migration_applied');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  await pool.end();
}

if (require.main === module) {
  migrate().catch((error) => {
    logger.error({ error }, 'migration_failed');
    process.exit(1);
  });
}

module.exports = { migrate };
