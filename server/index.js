const path = require('node:path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./initDb');
const { query } = require('./db');
const { registerSchema, voteSchema, sfIngestSchema } = require('./validation');
const { requireRelayKey } = require('./auth');

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

  app.post('/api/sf/contest-state-changed', requireRelayKey, async (req, res) => {
    const parsed = sfIngestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' });
    const { contest, showdown } = parsed.data;

    await query(
      `INSERT INTO sf_contest (id, name, status__c, current_round__c, active_showdown__c, judging_model__c, results_visibility__c, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name,
         status__c=EXCLUDED.status__c,
         current_round__c=EXCLUDED.current_round__c,
         active_showdown__c=EXCLUDED.active_showdown__c,
         judging_model__c=EXCLUDED.judging_model__c,
         results_visibility__c=EXCLUDED.results_visibility__c,
         updated_at=now()`,
      [
        contest.id,
        contest.name || null,
        contest.status || null,
        contest.currentRound || null,
        contest.activeShowdownId || showdown.id,
        contest.judgingModel || null,
        contest.resultsVisibility || null,
      ]
    );

    await query('UPDATE sf_app_state SET active_contest_id=$1, updated_at=now() WHERE id=1', [contest.id]);

    const openTime = showdown.voteOpenTime ? new Date(showdown.voteOpenTime).toISOString() : null;
    const closeTime = showdown.voteCloseTime ? new Date(showdown.voteCloseTime).toISOString() : null;

    await query(
      `INSERT INTO sf_showdown (
         id, contest__c, status__c, round__c, match_number__c,
         vote_open_time__c, vote_close_time__c,
         red_couple__c, blue_couple__c,
         red_audience_votes__c, blue_audience_votes__c,
         winner__c, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (id) DO UPDATE SET
         contest__c=EXCLUDED.contest__c,
         status__c=EXCLUDED.status__c,
         round__c=EXCLUDED.round__c,
         match_number__c=EXCLUDED.match_number__c,
         vote_open_time__c=EXCLUDED.vote_open_time__c,
         vote_close_time__c=EXCLUDED.vote_close_time__c,
         red_couple__c=EXCLUDED.red_couple__c,
         blue_couple__c=EXCLUDED.blue_couple__c,
         red_audience_votes__c=EXCLUDED.red_audience_votes__c,
         blue_audience_votes__c=EXCLUDED.blue_audience_votes__c,
         winner__c=EXCLUDED.winner__c,
         updated_at=now()`,
      [
        showdown.id,
        contest.id,
        showdown.status || null,
        showdown.round || null,
        showdown.matchNumber || null,
        openTime,
        closeTime,
        showdown.red.coupleId || null,
        showdown.blue.coupleId || null,
        showdown.redAudienceVotes ?? null,
        showdown.blueAudienceVotes ?? null,
        showdown.winner || null,
      ]
    );

    async function upsertSide(side) {
      if (!side.coupleId) return;
      await query(
        `INSERT INTO sf_couple (id, contest__c, lead__c, follow__c, lead_name, follow_name, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())
         ON CONFLICT (id) DO UPDATE SET
           contest__c=EXCLUDED.contest__c,
           lead__c=EXCLUDED.lead__c,
           follow__c=EXCLUDED.follow__c,
           lead_name=COALESCE(EXCLUDED.lead_name, sf_couple.lead_name),
           follow_name=COALESCE(EXCLUDED.follow_name, sf_couple.follow_name),
           updated_at=now()`,
        [
          side.coupleId,
          contest.id,
          side.leadId || null,
          side.followId || null,
          side.leadName || null,
          side.followName || null,
        ]
      );

      if (side.leadId && side.leadName) {
        await query(
          `INSERT INTO sf_dancer (id, name, updated_at)
           VALUES ($1,$2, now())
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, updated_at=now()`,
          [side.leadId, side.leadName]
        );
      }
      if (side.followId && side.followName) {
        await query(
          `INSERT INTO sf_dancer (id, name, updated_at)
           VALUES ($1,$2, now())
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, updated_at=now()`,
          [side.followId, side.followName]
        );
      }
    }

    await upsertSide(showdown.red);
    await upsertSide(showdown.blue);

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
    const state = await query('SELECT active_contest_id FROM sf_app_state WHERE id=1');
    const activeContestId = state.rows[0]?.active_contest_id || null;
    if (!activeContestId) return res.json({ contest: null, showdown: null });

    const c = await query(
      'SELECT id, name, status__c, current_round__c, judging_model__c, results_visibility__c, active_showdown__c FROM sf_contest WHERE id=$1',
      [activeContestId]
    );
    const contest = c.rows[0];
    if (!contest) return res.json({ contest: null, showdown: null });

    const showdownId = contest.active_showdown__c || null;
    if (!showdownId) {
      return res.json({
        contest: {
          id: contest.id,
          name: contest.name,
          status: contest.status__c,
          currentRound: contest.current_round__c,
          judgingModel: contest.judging_model__c,
          resultsVisibility: contest.results_visibility__c,
        },
        showdown: null,
      });
    }

    const s = await query(
      `SELECT id, status__c, round__c, match_number__c, vote_open_time__c, vote_close_time__c,
              red_couple__c, blue_couple__c, winner__c
         FROM sf_showdown WHERE id=$1`,
      [showdownId]
    );
    const showdown = s.rows[0];
    if (!showdown) {
      return res.json({
        contest: {
          id: contest.id,
          name: contest.name,
          status: contest.status__c,
          currentRound: contest.current_round__c,
          judgingModel: contest.judging_model__c,
          resultsVisibility: contest.results_visibility__c,
        },
        showdown: null,
      });
    }

    async function loadCouple(coupleId) {
      if (!coupleId) return { coupleId: null, leadName: null, followName: null };
      const r = await query('SELECT id, lead__c, follow__c, lead_name, follow_name FROM sf_couple WHERE id=$1', [
        coupleId,
      ]);
      const row = r.rows[0];
      if (!row) return { coupleId, leadName: null, followName: null };

      async function dancerName(id, fallback) {
        if (fallback) return fallback;
        if (!id) return null;
        const d = await query('SELECT name FROM sf_dancer WHERE id=$1', [id]);
        return d.rows[0]?.name || null;
      }

      return {
        coupleId: row.id,
        leadName: await dancerName(row.lead__c, row.lead_name),
        followName: await dancerName(row.follow__c, row.follow_name),
      };
    }

    const red = await loadCouple(showdown.red_couple__c);
    const blue = await loadCouple(showdown.blue_couple__c);

    res.json({
      contest: {
        id: contest.id,
        name: contest.name,
        status: contest.status__c,
        currentRound: contest.current_round__c,
        judgingModel: contest.judging_model__c,
        resultsVisibility: contest.results_visibility__c,
      },
      showdown: {
        id: showdown.id,
        status: showdown.status__c,
        round: showdown.round__c,
        matchNumber: showdown.match_number__c,
        voteOpenTime: showdown.vote_open_time__c,
        voteCloseTime: showdown.vote_close_time__c,
        red,
        blue,
        winner: showdown.winner__c,
      },
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

    const showdown = await query(
      'SELECT status__c, vote_open_time__c, vote_close_time__c FROM sf_showdown WHERE id=$1',
      [showdownId]
    );
    if (!showdown.rows[0]) return res.status(400).json({ error: 'INVALID_SHOWDOWN' });

    const s = showdown.rows[0];
    const now = Date.now();
    const opens = s.vote_open_time__c ? new Date(s.vote_open_time__c).getTime() : null;
    const closes = s.vote_close_time__c ? new Date(s.vote_close_time__c).getTime() : null;
    const inWindow =
      (opens === null || now >= opens) &&
      (closes === null || now <= closes);

    const statusAllows = s.status__c === 'VOTING_OPEN';
    if (!statusAllows || !inWindow) return res.status(400).json({ error: 'VOTING_CLOSED' });

    const user = await query('SELECT id FROM audience_user WHERE id=$1', [userId]);
    if (!user.rows[0]) return res.status(400).json({ error: 'INVALID_USER' });

    await query(
      `INSERT INTO vote_sf (showdown_id, audience_user_id, choice)
       VALUES ($1, $2, $3)
       ON CONFLICT (showdown_id, audience_user_id)
       DO UPDATE SET choice = EXCLUDED.choice, created_at = now()` ,
      [showdownId, userId, choice]
    );
    res.json({ ok: true });
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
