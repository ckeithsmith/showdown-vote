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

    const contestObj = payload.contest && typeof payload.contest === 'object' ? payload.contest : null;
    const contestId = contestObj?.Id || contestObj?.id || null;

    await query('INSERT INTO sf_state_raw (contest_id, payload) VALUES ($1, $2::jsonb)', [
      contestId,
      JSON.stringify(payload),
    ]);

    if (contestId) {
      const name = contestObj?.Name ?? contestObj?.name ?? null;
      const status = contestObj?.Status__c ?? contestObj?.status__c ?? contestObj?.status ?? null;
      const currentRound =
        contestObj?.Current_Round__c ?? contestObj?.current_round__c ?? contestObj?.currentRound ?? null;
      const activeShowdownId =
        contestObj?.Active_Showdown__c ?? contestObj?.active_showdown__c ?? contestObj?.activeShowdownId ?? null;
      const judgingModel =
        contestObj?.Judging_Model__c ?? contestObj?.judging_model__c ?? contestObj?.judgingModel ?? null;
      const resultsVisibility =
        contestObj?.Results_Visibility__c ?? contestObj?.results_visibility__c ?? contestObj?.resultsVisibility ?? null;
      const judgePanelSize =
        contestObj?.Judge_Panel_Size__c ?? contestObj?.judge_panel_size__c ?? contestObj?.judgePanelSize ?? null;
      const eventId = contestObj?.Event__c ?? contestObj?.event__c ?? contestObj?.eventId ?? null;

      await query(
        `INSERT INTO sf_contest (
           id, name, status__c, current_round__c, active_showdown__c, judging_model__c,
           judge_panel_size__c, event__c, results_visibility__c, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name,
           status__c=EXCLUDED.status__c,
           current_round__c=EXCLUDED.current_round__c,
           active_showdown__c=EXCLUDED.active_showdown__c,
           judging_model__c=EXCLUDED.judging_model__c,
           judge_panel_size__c=EXCLUDED.judge_panel_size__c,
           event__c=EXCLUDED.event__c,
           results_visibility__c=EXCLUDED.results_visibility__c,
           updated_at=now()`,
        [
          contestId,
          name,
          status,
          currentRound,
          activeShowdownId,
          judgingModel,
          judgePanelSize,
          eventId,
          resultsVisibility,
        ]
      );

      await query('UPDATE sf_app_state SET active_contest_id=$1, updated_at=now() WHERE id=1', [contestId]);
    }

    function normalizeShowdown(s) {
      if (!s || typeof s !== 'object') return null;
      const id = s.Id || s.id || null;
      if (!id) return null;
      return {
        id,
        contestId: s.Contest__c || s.contest__c || contestId || null,
        name: s.Name || s.name || null,
        status: s.Status__c || s.status__c || s.status || null,
        round: s.Round__c || s.round__c || s.round || null,
        matchNumber: s.Match_Number__c ?? null,
        voteOpenTime: s.Vote_Open_Time__c || s.vote_open_time__c || s.voteOpenTime || null,
        voteCloseTime: s.Vote_Close_Time__c || s.vote_close_time__c || s.voteCloseTime || null,
        redCoupleId: s.Red_Couple__c || s.red_couple__c || null,
        blueCoupleId: s.Blue_Couple__c || s.blue_couple__c || null,
        redAudienceVotes: s.Red_Audience_Votes__c ?? s.red_audience_votes__c ?? null,
        blueAudienceVotes: s.Blue_Audience_Votes__c ?? s.blue_audience_votes__c ?? null,
        winner: s.Winner__c || s.winner__c || s.winner || null,
      };
    }

    async function upsertShowdown(norm) {
      if (!norm) return;
      await query(
        `INSERT INTO sf_showdown (
           id, contest__c, name, status__c, round__c, match_number__c,
           vote_open_time__c, vote_close_time__c,
           red_couple__c, blue_couple__c,
           red_audience_votes__c, blue_audience_votes__c,
           winner__c, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
         ON CONFLICT (id) DO UPDATE SET
           contest__c=EXCLUDED.contest__c,
           name=EXCLUDED.name,
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
          norm.id,
          norm.contestId,
          norm.name,
          norm.status,
          norm.round,
          norm.matchNumber,
          norm.voteOpenTime ? new Date(norm.voteOpenTime).toISOString() : null,
          norm.voteCloseTime ? new Date(norm.voteCloseTime).toISOString() : null,
          norm.redCoupleId,
          norm.blueCoupleId,
          norm.redAudienceVotes,
          norm.blueAudienceVotes,
          norm.winner,
        ]
      );
    }

    const activeShowdownObj =
      (payload.activeShowdown && typeof payload.activeShowdown === 'object' && payload.activeShowdown) || null;
    const activeShowdown = normalizeShowdown(activeShowdownObj);
    await upsertShowdown(activeShowdown);

    const bracket = Array.isArray(payload.bracket) ? payload.bracket : [];
    for (const s of bracket) {
      await upsertShowdown(normalizeShowdown(s));
    }

    async function upsertCouple(c) {
      if (!c || typeof c !== 'object') return;
      const id = c.Id || c.id || null;
      if (!id) return;
      const leadId = c.Lead__c || c.lead__c || null;
      const followId = c.Follow__c || c.follow__c || null;
      const leadName = c.leadName ?? c.LeadName ?? c.lead_name ?? null;
      const followName = c.followName ?? c.FollowName ?? c.follow_name ?? null;
      const contestRef = c.Contest__c || c.contest__c || contestId || null;

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
        [id, contestRef, leadId, followId, leadName, followName]
      );
    }

    const pairings = Array.isArray(payload.pairings) ? payload.pairings : [];
    for (const c of pairings) {
      await upsertCouple(c);
    }

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
      'SELECT id, name, status__c, current_round__c, judging_model__c, judge_panel_size__c, event__c, results_visibility__c, active_showdown__c FROM sf_contest WHERE id=$1',
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
          judgePanelSize: contest.judge_panel_size__c,
          eventId: contest.event__c,
          resultsVisibility: contest.results_visibility__c,
        },
        showdown: null,
      });
    }

    const s = await query(
      `SELECT id, name, status__c, round__c, match_number__c, vote_open_time__c, vote_close_time__c,
              red_couple__c, blue_couple__c, red_audience_votes__c, blue_audience_votes__c, winner__c
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
          judgePanelSize: contest.judge_panel_size__c,
          eventId: contest.event__c,
          resultsVisibility: contest.results_visibility__c,
        },
        showdown: null,
      });
    }

    async function loadCouple(coupleId) {
      if (!coupleId) return { coupleId: null, leadName: null, followName: null };
      const r = await query('SELECT id, lead_name, follow_name FROM sf_couple WHERE id=$1', [coupleId]);
      const row = r.rows[0];
      if (!row) return { coupleId, leadName: null, followName: null };
      return { coupleId: row.id, leadName: row.lead_name || null, followName: row.follow_name || null };
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
        judgePanelSize: contest.judge_panel_size__c,
        eventId: contest.event__c,
        resultsVisibility: contest.results_visibility__c,
      },
      showdown: {
        id: showdown.id,
        status: showdown.status__c,
        round: showdown.round__c,
        matchNumber: showdown.match_number__c || showdown.name || null,
        voteOpenTime: showdown.vote_open_time__c,
        voteCloseTime: showdown.vote_close_time__c,
        red,
        blue,
        redAudienceVotes: showdown.red_audience_votes__c,
        blueAudienceVotes: showdown.blue_audience_votes__c,
        winner: showdown.winner__c,
      },
    });
  });

  app.get('/api/public/state', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const state = await query('SELECT active_contest_id FROM sf_app_state WHERE id=1');
    const activeContestId = state.rows[0]?.active_contest_id || null;
    if (!activeContestId) {
      return res.json({
        contest: null,
        contestStatus: null,
        currentRound: null,
        activeShowdown: null,
        pairings: [],
        bracket: [],
        raw: null,
      });
    }

    const c = await query(
      `SELECT id, name, status__c, current_round__c, active_showdown__c,
              judging_model__c, judge_panel_size__c, event__c, results_visibility__c
         FROM sf_contest WHERE id=$1`,
      [activeContestId]
    );
    const contest = c.rows[0];
    if (!contest) {
      return res.json({
        contest: null,
        contestStatus: null,
        currentRound: null,
        activeShowdown: null,
        pairings: [],
        bracket: [],
        raw: null,
      });
    }

    const raw = await query(
      'SELECT payload FROM sf_state_raw WHERE contest_id=$1 ORDER BY received_at DESC LIMIT 1',
      [contest.id]
    );

    const couples = await query(
      'SELECT id, lead_name, follow_name FROM sf_couple WHERE contest__c=$1 ORDER BY id ASC',
      [contest.id]
    );

    const showdowns = await query(
      `SELECT id, name, status__c, round__c, match_number__c, red_couple__c, blue_couple__c, winner__c,
              red_audience_votes__c, blue_audience_votes__c
         FROM sf_showdown WHERE contest__c=$1`,
      [contest.id]
    );

    const coupleById = new Map(
      couples.rows.map((r) => [r.id, { coupleId: r.id, leadName: r.lead_name || null, followName: r.follow_name || null }])
    );

    function couple(coupleId) {
      if (!coupleId) return { coupleId: null, leadName: null, followName: null };
      return coupleById.get(coupleId) || { coupleId, leadName: null, followName: null };
    }

    const bracket = showdowns.rows.map((s) => ({
      id: s.id,
      status: s.status__c,
      round: s.round__c,
      matchNumber: s.match_number__c || s.name || null,
      red: couple(s.red_couple__c),
      blue: couple(s.blue_couple__c),
      winner: s.winner__c,
      redAudienceVotes: s.red_audience_votes__c,
      blueAudienceVotes: s.blue_audience_votes__c,
    }));

    const activeShowdownId = contest.active_showdown__c || null;
    const active = bracket.find((b) => b.id === activeShowdownId) || null;

    res.json({
      contest: {
        id: contest.id,
        name: contest.name,
        status: contest.status__c,
        currentRound: contest.current_round__c,
        judgingModel: contest.judging_model__c,
        judgePanelSize: contest.judge_panel_size__c,
        eventId: contest.event__c,
        resultsVisibility: contest.results_visibility__c,
        activeShowdownId,
      },
      contestStatus: contest.status__c,
      currentRound: contest.current_round__c,
      activeShowdown: active,
      pairings: couples.rows.map((r) => ({
        coupleId: r.id,
        leadName: r.lead_name || null,
        followName: r.follow_name || null,
      })),
      bracket,
      raw: raw.rows[0]?.payload || null,
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

    const showdown = await query('SELECT status__c FROM sf_showdown WHERE id=$1', [showdownId]);
    if (!showdown.rows[0]) return res.status(400).json({ error: 'INVALID_SHOWDOWN' });

    const s = showdown.rows[0];
    const statusAllows = s.status__c === 'VOTING_OPEN';
    if (!statusAllows) return res.status(400).json({ error: 'VOTING_CLOSED' });

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
