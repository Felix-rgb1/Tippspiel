require('dotenv').config({ override: true });
const pool = require('./db');

// Letzte Bundesliga-Spiele für Test-Daten (Spieltag 34 von 34, Mai 2025)
const bundesligaMatches = [
  {
    home_team: 'Bayern München',
    away_team: 'Bayer Leverkusen',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 2,
    away_goals: 1,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_1'
  },
  {
    home_team: 'Borussia Dortmund',
    away_team: 'RB Leipzig',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 3,
    away_goals: 2,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_2'
  },
  {
    home_team: 'VfB Stuttgart',
    away_team: 'Eintracht Frankfurt',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 2,
    away_goals: 2,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_3'
  },
  {
    home_team: 'Werder Bremen',
    away_team: 'Schalke 04',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 1,
    away_goals: 0,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_4'
  },
  {
    home_team: 'Borussia Mönchengladbach',
    away_team: 'Mainz 05',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 4,
    away_goals: 1,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_5'
  },
  {
    home_team: 'TSG Hoffenheim',
    away_team: 'Freiburg',
    match_date: '2025-05-17 18:30:00',
    round: 'Bundesliga MD34',
    home_goals: 0,
    away_goals: 2,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_6'
  },
  {
    home_team: 'FC Augsburg',
    away_team: 'Union Berlin',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 1,
    away_goals: 2,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_7'
  },
  {
    home_team: 'Wolfsburg',
    away_team: 'Hertha BSC',
    match_date: '2025-05-17 15:30:00',
    round: 'Bundesliga MD34',
    home_goals: 2,
    away_goals: 0,
    finished: true,
    external_source: 'test-bundesliga',
    external_id: 'test_bl_8'
  }
];

async function importTestMatches() {
  try {
    console.log('📥 Importiere Bundesliga Test-Daten...\n');

    for (const match of bundesligaMatches) {
      // Check if match already exists
      const existing = await pool.query(
        'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
        [match.external_source, match.external_id]
      );

      if (existing.rows.length > 0) {
        console.log(`⏭️  ${match.home_team} vs ${match.away_team} (${match.external_id}) - existiert bereits`);
        continue;
      }

      await pool.query(
        `INSERT INTO matches (
          home_team, away_team, match_date, round, 
          home_goals, away_goals, finished, 
          external_source, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          match.home_team,
          match.away_team,
          match.match_date,
          match.round,
          match.home_goals,
          match.away_goals,
          match.finished,
          match.external_source,
          match.external_id
        ]
      );

      console.log(`✅ ${match.home_team} ${match.home_goals}:${match.away_goals} ${match.away_team}`);
    }

    console.log(`\n✅ ${bundesligaMatches.length} Bundesliga Test-Matches importiert!`);
    console.log('💡 Zum Löschen: node deleteTestMatches.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Import fehlgeschlagen:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

importTestMatches();
