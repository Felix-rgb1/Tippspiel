const { fetchFlashscoreTournamentResults } = require('./services/rapidApi');

async function main() {
  const payload = await fetchFlashscoreTournamentResults('/football/world/world-cup/', { useConfiguredIds: false });
  const hits = payload.filter((m) => {
    const home = String(m?.home_team?.name || m?.home || m?.home_name || m?.homeTeam?.name || '').toLowerCase();
    const away = String(m?.away_team?.name || m?.away || m?.away_name || m?.awayTeam?.name || '').toLowerCase();
    return (home.includes('netherlands') && away.includes('morocco'))
      || (home.includes('germany') && away.includes('paraguay'));
  });

  console.log('TOTAL', payload.length);
  console.log('HITS', hits.length);
  console.log(JSON.stringify(hits, null, 2));
}

main().catch((e) => {
  console.error('ERR', e.message || e);
  if (e.details) {
    console.error(JSON.stringify(e.details, null, 2));
  }
  process.exitCode = 1;
});
