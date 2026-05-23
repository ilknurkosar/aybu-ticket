const { Pool } = require('pg');
const { env } = require('../config/env');

let pool;

function getPool() {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
    });
  }

  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getPool, query, withTransaction };
