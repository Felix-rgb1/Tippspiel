require('dotenv').config({ override: true });
const pool = require('./db');

// Beispiel-Ergebnisse für die Test-Matches
// Diese Ergebnisse können Sie anpassen und dann mit dem Skript setzen
const testResults = [
  { external_id: 'test_bl_1', home_goals: 2, away_goals: 1 },  // Bayern 2:1 Leverkusen
  { external_id: 'test_bl_2', home_goals: 3, away_goals: 2 },  // Dortmund 3:2 Leipzig
  { external_id: 'test_bl_3', home_goals: 1, away_goals: 1 },  // Stuttgart 1:1 Frankfurt
  { external_id: 'test_bl_4', home_goals: 2, away_goals: 0 },  // Bremen 2:0 Schalke
  { external_id: 'test_bl_5', home_goals: 4, away_goals: 1 },  // Gladbach 4:1 Mainz
  { external_id: 'test_bl_6', home_goals: 0, away_goals: 2 },  // Hoffenheim 0:2 Freiburg
  { external_id: 'test_bl_7', home_goals: 1, away_goals: 2 },  // Augsburg 1:2 Union
  { external_id: 'test_bl_8', home_goals: 3, away_goals: 0 }   // Wolfsburg 3:0 Hertha
];

async function setTestMatchResults() {
  try {
    console.log('📝 Setze Ergebnisse für Test-Matches...\n');

    for (const result of testResults) {
      // Finde das Match anhand der external_id
      const matchResult = await pool.query(
        'SELECT id, home_team, away_team FROM matches WHERE external_id = $1',
        [result.external_id]
      );

      if (!matchResult.rows.length) {
        console.log(`❌ ${result.external_id} nicht gefunden`);
        continue;
      }

      const match = matchResult.rows[0];

      // Update das Match mit Ergebnissen
      await pool.query(
        `UPDATE matches 
         SET home_goals = $1, 
             away_goals = $2, 
             finished = true,
             updated_at = NOW()
         WHERE id = $3`,
        [result.home_goals, result.away_goals, match.id]
      );

      console.log(
        `✅ ${match.home_team} ${result.home_goals}:${result.away_goals} ${match.away_team}`
      );
    }

    console.log(`\n✨ ${testResults.length} Ergebnisse gesetzt!`);
    console.log('📊 Die Tipps können jetzt bewertet werden.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fehler beim Setzen der Ergebnisse:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setTestMatchResults();
