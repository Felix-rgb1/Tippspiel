require('dotenv').config();

// Patch node-fetch in require cache BEFORE loading rapidApi
const originalNodeFetch = require('node-fetch');
const patchedFetch = async (url, options) => {
  const res = await originalNodeFetch(url, options);
  return res;
};
const nodeFetchMod = require.resolve('node-fetch');
require.cache[nodeFetchMod].exports = patchedFetch;
patchedFetch.default = patchedFetch;

const { fetchRapidApiProbabilities } = require('./services/rapidApi');

async function main() {
  const homeTeam = 'USA';
  const awayTeam = 'Paraguay';
  const matchDate = '2026-06-13T01:00:00.000Z';

  try {
    const result = await fetchRapidApiProbabilities(homeTeam, awayTeam, matchDate, {
      tournamentUrl: process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/',
      useConfiguredIds: false,
    });
    if (result) {
      console.log('SUCCESS:', JSON.stringify(result, null, 2));
    } else {
      console.log('RESULT: null (kein Ergebnis)');
    }
  } catch (err) {
    console.error('FEHLER:', err.message);
  }

  process.exit(0);
}

main();
