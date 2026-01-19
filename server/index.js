const path = require('node:path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./initDb');
const { query } = require('./db');
const { registerSchema, voteSchema } = require('./validation');

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return origins.length ? origins : null;
}

async function start() {
  await initDb();

  const app = express();
  app.disable('x-powered-by');

  const corsOrigins = parseCorsOrigins();
  app.use(
    cors({
      origin: corsOrigins || true,
      credentials: false,
    })
  );
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
    const { name, email } = parsed.data;

    const result = await query(
      `INSERT INTO audience_user (name, email)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id` ,
      [name, email]
    );

    res.json({ userId: result.rows[0].id });
  });

  app.get('/api/current-showdown', async (req, res) => {
    const state = await query('SELECT active_showdown_id FROM app_state WHERE id=1');
    const activeId = state.rows[0]?.active_showdown_id || null;
    if (!activeId) {
      return res.json({ showdownId: null, red: null, blue: null, status: 'CLOSED' });
    }
    const s = await query(
      'SELECT id, red_name, blue_name, status FROM showdown WHERE id=$1',
      [activeId]
    );
    if (!s.rows[0]) {
      return res.json({ showdownId: null, red: null, blue: null, status: 'CLOSED' });
    }
    const row = s.rows[0];
    return res.json({
      showdownId: row.id,
      red: row.red_name,
      blue: row.blue_name,
      status: row.status,
    });
  });

  const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.post('/api/vote', voteLimiter, async (req, res) => {
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
    const { userId, showdownId, choice } = parsed.data;

    const showdown = await query('SELECT status FROM showdown WHERE id=$1', [showdownId]);
    if (!showdown.rows[0]) return res.status(400).json({ error: 'INVALID_SHOWDOWN' });
    if (showdown.rows[0].status !== 'OPEN') {
      return res.status(400).json({ error: 'VOTING_CLOSED' });
    }

    const user = await query('SELECT id FROM audience_user WHERE id=$1', [userId]);
    if (!user.rows[0]) return res.status(400).json({ error: 'INVALID_USER' });

    await query(
      `INSERT INTO vote (showdown_id, audience_user_id, choice)
       VALUES ($1, $2, $3)
       ON CONFLICT (showdown_id, audience_user_id)
       DO UPDATE SET choice = EXCLUDED.choice, created_at = now()` ,
      [showdownId, userId, choice]
    );
    res.json({ ok: true });
  });

  app.get('/api/results/:showdownId', async (req, res) => {
    const showdownId = req.params.showdownId;
    if (!showdownId || !/^[0-9a-fA-F-]{36}$/.test(showdownId)) {
      return res.status(400).json({ error: 'INVALID_SHOWDOWN' });
    }
    const counts = await query(
      `SELECT
         SUM(CASE WHEN choice='RED' THEN 1 ELSE 0 END)::int AS red,
         SUM(CASE WHEN choice='BLUE' THEN 1 ELSE 0 END)::int AS blue
       FROM vote WHERE showdown_id=$1`,
      [showdownId]
    );
    const row = counts.rows[0] || { red: 0, blue: 0 };
    res.json({ red: row.red || 0, blue: row.blue || 0 });
  });

  // Serve frontend
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`showdown-vote listening on ${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
