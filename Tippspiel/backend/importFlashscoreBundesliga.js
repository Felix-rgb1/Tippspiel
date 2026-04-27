require('dotenv').config({ override: true });
const pool = require('./db');
const { importFlashscoreBundesligaMatches } = require('./services/flashscoreBundesligaImport');

async function importFlashscoreBundesliga() {
  console.log('Importiere offizielle Bundesliga-Spiele von Flashscore...');

  const result = await importFlashscoreBundesligaMatches(pool);
  console.log(`Turnier-URL: ${result.tournamentUrl}`);
  console.log(`Fertig. Gefunden: ${result.totalFetched}, verarbeitet: ${result.totalProcessed}, neu: ${result.createdCount}, aktualisiert: ${result.updatedCount}`);
  console.log(`Hinweis: Quelle in DB ist '${result.externalSource}'.`);
}

importFlashscoreBundesliga()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Import fehlgeschlagen:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
