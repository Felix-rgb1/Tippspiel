const pool = require('./db');

async function main() {
  const r = await pool.query(`
    SELECT id, home_team, away_team, round, match_date,
           external_source, external_id, flashscore_match_id,
           home_goals, away_goals, penalty_decided,
           home_elfmeter_scored, away_elfmeter_scored
    FROM matches
    WHERE (home_team = 'Netherlands' AND away_team = 'Morocco')
       OR (home_team = 'Germany' AND away_team = 'Paraguay')
    ORDER BY match_date ASC
  `);

  console.log(JSON.stringify(r.rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
