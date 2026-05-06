const pool = require('./db');

async function main() {
  const all = await pool.query(
    "SELECT home_team, away_team, match_date, round FROM matches WHERE external_source = 'flashscore-wm' ORDER BY round, match_date"
  );

  const byRound = {};
  all.rows.forEach(r => {
    const key = r.round || '(kein round)';
    if (!byRound[key]) byRound[key] = [];
    byRound[key].push(r);
  });

  Object.entries(byRound).forEach(([round, rows]) => {
    console.log(`\n=== ${round} (${rows.length} Spiele) ===`);
    rows.forEach(r => console.log(`  ${String(r.match_date).slice(0,10)} | ${r.home_team} vs ${r.away_team}`));
  });
  console.log('\nGesamt:', all.rows.length);

  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
