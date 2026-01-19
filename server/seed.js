const { initDb } = require('./initDb');
const { query } = require('./db');

async function seed() {
  await initDb();

  const contestId = 'a03TESTCONTEST00001';
  const showdownId = 'a07TESTSHOWDOWN00001';
  const redCoupleId = 'a04TESTCOUPLE00001';
  const blueCoupleId = 'a04TESTCOUPLE00002';

  const contestName = process.env.SEED_CONTEST_NAME || 'Test Contest';
  const contestStatus = process.env.SEED_CONTEST_STATUS || 'ROUND_ACTIVE';
  const currentRound = process.env.SEED_CURRENT_ROUND || 'Finals';
  const judgingModel = process.env.SEED_JUDGING_MODEL || 'Judges_And_Audience';
  const judgePanelSize = process.env.SEED_JUDGE_PANEL_SIZE || '3';
  const resultsVisibility = process.env.SEED_RESULTS_VISIBILITY || 'PUBLIC';

  const redLead = process.env.SEED_RED_LEAD || 'Red Lead';
  const redFollow = process.env.SEED_RED_FOLLOW || 'Red Follow';
  const blueLead = process.env.SEED_BLUE_LEAD || 'Blue Lead';
  const blueFollow = process.env.SEED_BLUE_FOLLOW || 'Blue Follow';

  const showdownStatus = process.env.SEED_SHOWDOWN_STATUS || 'VOTING_OPEN';
  const showdownRound = process.env.SEED_SHOWDOWN_ROUND || currentRound;
  const showdownName = process.env.SEED_SHOWDOWN_NAME || 'Match 1';

  await query(
    `INSERT INTO sf_contest (
       id, name, status__c, current_round__c, active_showdown__c, judging_model__c,
       judge_panel_size__c, results_visibility__c
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name,
       status__c=EXCLUDED.status__c,
       current_round__c=EXCLUDED.current_round__c,
       active_showdown__c=EXCLUDED.active_showdown__c,
       judging_model__c=EXCLUDED.judging_model__c,
       judge_panel_size__c=EXCLUDED.judge_panel_size__c,
       results_visibility__c=EXCLUDED.results_visibility__c,
       updated_at=now()`,
    [
      contestId,
      contestName,
      contestStatus,
      currentRound,
      showdownId,
      judgingModel,
      judgePanelSize,
      resultsVisibility,
    ]
  );

  await query('UPDATE sf_app_state SET active_contest_id=$1, updated_at=now() WHERE id=1', [contestId]);

  await query(
    `INSERT INTO sf_couple (id, contest__c, lead_name, follow_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       contest__c=EXCLUDED.contest__c,
       lead_name=EXCLUDED.lead_name,
       follow_name=EXCLUDED.follow_name,
       updated_at=now()`,
    [redCoupleId, contestId, redLead, redFollow]
  );
  await query(
    `INSERT INTO sf_couple (id, contest__c, lead_name, follow_name)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       contest__c=EXCLUDED.contest__c,
       lead_name=EXCLUDED.lead_name,
       follow_name=EXCLUDED.follow_name,
       updated_at=now()`,
    [blueCoupleId, contestId, blueLead, blueFollow]
  );

  await query(
    `INSERT INTO sf_showdown (id, contest__c, name, status__c, round__c, red_couple__c, blue_couple__c)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
       contest__c=EXCLUDED.contest__c,
       name=EXCLUDED.name,
       status__c=EXCLUDED.status__c,
       round__c=EXCLUDED.round__c,
       red_couple__c=EXCLUDED.red_couple__c,
       blue_couple__c=EXCLUDED.blue_couple__c,
       updated_at=now()`,
    [showdownId, contestId, showdownName, showdownStatus, showdownRound, redCoupleId, blueCoupleId]
  );

  console.log(JSON.stringify({ contestId, showdownId }, null, 2));
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
