const fs = require('node:fs/promises');
const path = require('node:path');
const { query } = require('./db');

async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  const sqlPath = path.join(__dirname, 'migrations.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await query(sql);
}

module.exports = { initDb };
