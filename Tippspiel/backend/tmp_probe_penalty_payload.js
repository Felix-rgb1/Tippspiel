const { fetchFlashscoreMatchDetails, fetchFlashscoreMatchPenalties } = require('./services/rapidApi');

async function main() {
  const matchId = process.argv[2] || 'S0MygXWj';

  const details = await fetchFlashscoreMatchDetails(matchId);
  const penalties = await fetchFlashscoreMatchPenalties(matchId);

  console.log('MATCH_ID', matchId);
  console.log('DETAILS_KEYS', Object.keys(details || {}));
  console.log('DETAILS', JSON.stringify(details, null, 2));
  console.log('PENALTIES_KEYS', Object.keys(penalties || {}));
  console.log('PENALTIES', JSON.stringify(penalties, null, 2));
}

main().catch((e) => {
  console.error('ERR', e.message || e);
  if (e.details) {
    console.error(JSON.stringify(e.details, null, 2));
  }
  process.exitCode = 1;
});
