require('dotenv').config();

// Patch node-fetch in require cache BEFORE loading rapidApi
const originalNodeFetch = require('node-fetch');
const patchedFetch = async (url, options) => {
  console.log(`\n→ REQUEST: ${url}`);
  const res = await originalNodeFetch(url, options);
  const cloned = res.clone();
  const text = await cloned.text();
  console.log(`← STATUS ${res.status}:`, text.slice(0, 600));
  // Return original (not cloned) so the caller can still read it
  return res;
};

// Patch the cached module so rapidApi.js picks up patchedFetch
const nodeFetchMod = require.resolve('node-fetch');
require.cache[nodeFetchMod].exports = patchedFetch;
patchedFetch.default = patchedFetch;

const {
  fetchRapidApiProbabilities,
} = require('./services/rapidApi');

async function main() {
  const homeTeam = 'USA';
  const awayTeam = 'Paraguay';
  const matchDate = '2026-06-13T01:00:00.000Z';

  console.log('=== Teste fetchRapidApiProbabilities ===');
  console.log(`Home: ${homeTeam}, Away: ${awayTeam}, Date: ${matchDate}`);
  console.log(`RAPIDAPI_HOST: ${process.env.RAPIDAPI_HOST}`);
  console.log(`RAPIDAPI_KEY: ${process.env.RAPIDAPI_KEY ? process.env.RAPIDAPI_KEY.slice(0, 8) + '...' : 'FEHLT'}`);
  console.log(`FLASHSCORE_TOURNAMENT_URL: ${process.env.FLASHSCORE_TOURNAMENT_URL}`);
  console.log('');

  try {
    const result = await fetchRapidApiProbabilities(homeTeam, awayTeam, matchDate, {
      tournamentUrl: process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/',
      useConfiguredIds: false,
    });
    console.log('Ergebnis:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Fehler:', err.message);
  }

  process.exit(0);
}

main();
