const pool = require('./db');

async function main() {
  const q = `
    SELECT id, home_team, away_team, round, external_source, external_id, flashscore_match_id,
           finished, home_goals, away_goals, penalty_decided, home_elfmeter_scored, away_elfmeter_scored
    FROM matches
    WHERE finished = true
      AND (
        penalty_decided = true
        OR (
          home_goals = away_goals
          AND round ILIKE ANY(ARRAY['%final%', '%halb%', '%viertel%', '%16tel%', '%achtel%', '%k.o.%'])
        )
      )
    ORDER BY match_date DESC
    LIMIT 30
  `;

  const r = await pool.query(q);
  console.log('rows', r.rows.length);
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
