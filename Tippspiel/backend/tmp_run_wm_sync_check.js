const pool = require('./db');
const { syncWMResults } = require('./services/flashscoreBundesligaImport');

async function main() {
  const result = await syncWMResults(pool);
  console.log('SYNC_RESULT', JSON.stringify(result, null, 2));

  const check = await pool.query(`
    SELECT id, home_team, away_team, round, flashscore_match_id,
           home_goals, away_goals,
           penalty_decided, home_elfmeter_scored, away_elfmeter_scored
    FROM matches
    WHERE id IN (657, 659)
    ORDER BY id ASC
  `);

  console.log('CHECK_ROWS', JSON.stringify(check.rows, null, 2));
}

main()
  .catch((e) => {
    console.error('ERR', e.message || e);
    if (e.details) {
      console.error(JSON.stringify(e.details, null, 2));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
