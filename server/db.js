const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=disable')
      ? false
      : process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withClient };
