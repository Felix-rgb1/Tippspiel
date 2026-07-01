const pool = require('./db');

async function main() {
  const r = await pool.query(`
    SELECT id, home_team, away_team, home_goals, away_goals,
           penalty_decided, home_elfmeter_scored, away_elfmeter_scored,
           updated_at
    FROM matches
    WHERE id IN (657, 659)
    ORDER BY id ASC
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
