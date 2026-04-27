require('dotenv').config({ override: true });
const pool = require('./db');

async function deleteTestMatches() {
  try {
    console.log('🗑️  Lösche Bundesliga Test-Daten...\n');

    // 1. Finde alle Test-Matches
    const testMatches = await pool.query(
      'SELECT id FROM matches WHERE external_source = $1',
      ['test-bundesliga']
    );

    if (testMatches.rows.length === 0) {
      console.log('ℹ️  Keine Test-Matches zum Löschen gefunden.\n');
      process.exit(0);
    }

    const testMatchIds = testMatches.rows.map(row => row.id);
    console.log(`Gefundene Test-Matches: ${testMatchIds.length}`);

    // 2. Lösche alle Tips für diese Matches
    const tipsDeleted = await pool.query(
      'DELETE FROM tips WHERE match_id = ANY($1)',
      [testMatchIds]
    );
    console.log(`✅ ${tipsDeleted.rowCount} Tips gelöscht`);

    // 3. Lösche die Matches selbst
    const matchesDeleted = await pool.query(
      'DELETE FROM matches WHERE external_source = $1',
      ['test-bundesliga']
    );
    console.log(`✅ ${matchesDeleted.rowCount} Matches gelöscht`);

    // 4. Lösche auch Cache-Einträge für diese Matches
    const cacheDeleted = await pool.query(
      `DELETE FROM api_match_insights_cache 
       WHERE (home_team, away_team) IN (
         SELECT DISTINCT home_team, away_team FROM 
         (SELECT 'Bayern München' as home_team, 'Bayer Leverkusen' as away_team
          UNION SELECT 'Borussia Dortmund', 'RB Leipzig'
          UNION SELECT 'VfB Stuttgart', 'Eintracht Frankfurt'
          UNION SELECT 'Werder Bremen', 'Schalke 04'
          UNION SELECT 'Borussia Mönchengladbach', 'Mainz 05'
          UNION SELECT 'TSG Hoffenheim', 'Freiburg'
          UNION SELECT 'FC Augsburg', 'Union Berlin'
          UNION SELECT 'Wolfsburg', 'Hertha BSC'
         ) as t
       )`
    ).catch(() => ({ rowCount: 0 })); // Cache-Tabelle könnte nicht existieren
    
    console.log(`✅ ${cacheDeleted.rowCount} Cache-Einträge gelöscht`);

    console.log(`\n✨ Alle Test-Daten wurden erfolgreich gelöscht!\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Fehler beim Löschen:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteTestMatches();
