const path = require('node:path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./initDb');
const { query } = require('./db');
const { registerSchema, voteSchema, ingestStateSchema } = require('./validation');
const { requireRelaySecret } = require('./auth');

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
  app.disable('etag');

  const corsOrigins = parseCorsOrigins();
  app.use(
    cors({
      origin: corsOrigins || true,
      credentials: false,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/sf/ingest-state', requireRelaySecret, async (req, res) => {
    const parsed = ingestStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
    const payload = req.body;

    const contestObj = payload && typeof payload === 'object' ? payload.contest : null;
    const contestId =
      payload?.contestId ||
      (contestObj && typeof contestObj === 'object' ? contestObj.Id || contestObj.id : null) ||
      null;

    await query('INSERT INTO sf_state_raw (contest_id, payload) VALUES ($1, $2::jsonb)', [
      contestId,
      JSON.stringify(payload),
    ]);

    await query(
      `UPDATE sf_app_state
       SET active_contest_id = COALESCE($1, active_contest_id),
           contest_snapshot_json = $2::jsonb,
           updated_at = now()
       WHERE id = 1`,
      [contestId, JSON.stringify(payload)]
    );

    res.json({ ok: true });
  });

  app.post('/api/internal/contest-snapshot', requireRelaySecret, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    const contestId = body?.contestId || null;
    const snapshot = body?.snapshot ?? null;
    if (!contestId || !snapshot) {
      return res.status(400).json({ error: 'Missing contestId or snapshot' });
    }

    await query(
      `UPDATE sf_app_state
       SET active_contest_id = $1,
           contest_snapshot_json = $2::jsonb,
           updated_at = now()
       WHERE id = 1`,
      [contestId, JSON.stringify(snapshot)]
    );

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

  app.get('/api/current-state', async (req, res) => {
    const result = await query(
      'SELECT active_contest_id, contest_snapshot_json FROM sf_app_state WHERE id = 1'
    );
    const row = result.rows[0] || {};
    res.json({
      activeContestId: row.active_contest_id ?? null,
      snapshot: row.contest_snapshot_json ?? null,
    });
  });

  app.get('/api/public/state', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const result = await query(
      `SELECT
         active_contest_id,
         contest_snapshot_json
       FROM sf_app_state
       WHERE id = 1`
    );

    const row = result.rows[0] || {};

    res.json({
      activeContestId: row.active_contest_id ?? null,
      snapshot: row.contest_snapshot_json ?? null,
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

    const appState = await query('SELECT contest_snapshot_json FROM sf_app_state WHERE id = 1');
    const snapshot = appState.rows[0]?.contest_snapshot_json || null;
    const activeShowdown = snapshot?.activeShowdown || null;
    const activeShowdownId = activeShowdown?.id || null;
    const status = activeShowdown?.status || null;

    if (!activeShowdownId || activeShowdownId !== showdownId) {
      return res.status(400).json({ error: 'INVALID_SHOWDOWN' });
    }
    if (status !== 'VOTING_OPEN') {
      return res.status(400).json({ error: 'VOTING_CLOSED' });
    }

    const user = await query('SELECT id FROM audience_user WHERE id=$1', [userId]);
    if (!user.rows[0]) return res.status(400).json({ error: 'INVALID_USER' });

    const existing = await query(
      'SELECT choice FROM vote_sf WHERE showdown_id=$1 AND audience_user_id=$2',
      [showdownId, userId]
    );
    if (existing.rows[0]) {
      return res.json({ ok: true, status: 'ALREADY_VOTED', existingChoice: existing.rows[0].choice });
    }

    await query(
      `INSERT INTO vote_sf (showdown_id, audience_user_id, choice)
       VALUES ($1, $2, $3)`,
      [showdownId, userId, choice]
    );
    res.json({ ok: true, status: 'CAST' });
  });

  app.get('/api/results/:showdownId', async (req, res) => {
    const showdownId = req.params.showdownId;
    if (!showdownId || showdownId.length < 15 || showdownId.length > 18) {
      return res.status(400).json({ error: 'INVALID_SHOWDOWN' });
    }
    const counts = await query(
      `SELECT
         SUM(CASE WHEN choice='RED' THEN 1 ELSE 0 END)::int AS red,
         SUM(CASE WHEN choice='BLUE' THEN 1 ELSE 0 END)::int AS blue
       FROM vote_sf WHERE showdown_id=$1`,
      [showdownId]
    );
    const row = counts.rows[0] || { red: 0, blue: 0 };
    res.json({ red: row.red || 0, blue: row.blue || 0 });
  });

  // Serve frontend
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(
    express.static(distPath, {
      etag: false,
      lastModified: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    })
  );
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
