const { initDb } = require('./initDb');
const { query } = require('./db');

async function seed() {
  await initDb();

  const red = process.env.SEED_RED || 'Red Team';
  const blue = process.env.SEED_BLUE || 'Blue Team';
  const status = process.env.SEED_STATUS || 'OPEN';
  const showdown = await query(
    `INSERT INTO showdown (red_name, blue_name, status)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [red, blue, status]
  );
  const id = showdown.rows[0].id;
  await query('UPDATE app_state SET active_showdown_id=$1, updated_at=now() WHERE id=1', [id]);
  console.log(id);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
