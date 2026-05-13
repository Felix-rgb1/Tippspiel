require('dotenv').config({ override: true });
const pool = require('./db');
const { getLiveScoresForMatches } = require('./services/liveScores');

(async () => {
  try {
    console.log('\n=== LIVE-API VERBINDUNGSTEST ===\n');
    
    // Hole die nächsten bald stattfindenden Matches
    const nextMatches = await pool.query(
      `SELECT id, home_team, away_team, match_date, external_source, external_id, finished
       FROM matches
       WHERE finished = false
       AND external_source IN ('flashscore-wm', 'flashscore-bundesliga')
       AND match_date > NOW()
       ORDER BY match_date ASC
       LIMIT 5`
    );
    
    if (nextMatches.rows.length === 0) {
      console.log('❌ Keine zukünftigen Matches gefunden\n');
      await pool.end();
      return;
    }
    
    console.log(`📅 Teste mit ${nextMatches.rows.length} nächsten Matches:\n`);
    nextMatches.rows.forEach(m => {
      const date = new Date(m.match_date).toLocaleString('de-DE');
      console.log(`  • [${m.id}] ${m.home_team} vs ${m.away_team}`);
      console.log(`    Datum: ${date}`);
      console.log(`    Quelle: ${m.external_source}\n`);
    });
    
    console.log('🔄 Rufe Live-Scores ab...\n');
    const startTime = Date.now();
    const result = await getLiveScoresForMatches(nextMatches.rows, pool);
    const duration = Date.now() - startTime;
    
    console.log(`✅ API-Anruf erfolgreich in ${duration}ms\n`);
    
    console.log(`📊 Ergebnisse:\n`);
    console.log(`  ✅ Updates: ${Object.keys(result.updates).length} Matches mit Live-Daten`);
    console.log(`  📍 Provider verwendet: ${result.usedProvider ? 'JA (Flashscore)' : 'NEIN'}`);
    console.log(`  ⏱️  Nächster Poll in: ${result.nextPollInMs}ms`);
    console.log(`  🕐 Abrufdatum: ${result.fetchedAt}\n`);
    
    // Detailansicht der Updates
    if (Object.keys(result.updates).length > 0) {
      console.log('📈 Live-Score Details:\n');
      Object.entries(result.updates).forEach(([matchId, data]) => {
        const match = nextMatches.rows.find(m => m.id.toString() === matchId);
        if (match) {
          console.log(`  Match #${matchId}: ${match.home_team} vs ${match.away_team}`);
          console.log(`    Status: ${data.statusText}`);
          console.log(`    Ergebnis: ${data.homeGoals}:${data.awayGoals}`);
          console.log(`    Minute: ${data.minute || 'N/A'}`);
          if (data.isLive) console.log(`    🔴 LIVE JETZT`);
          if (data.isFinished) console.log(`    ✅ BEENDET`);
          if (data.incidents && data.incidents.length > 0) {
            console.log(`    Ereignisse: ${data.incidents.length}`);
            data.incidents.slice(0, 2).forEach(inc => {
              console.log(`      - ${inc.type}: ${inc.player} (${inc.minute}')`);
            });
          }
          console.log();
        }
      });
    } else {
      console.log('⚠️  Keine Live-Daten verfügbar');
      console.log('Gründe können sein:');
      console.log('  • Matches sind zu weit in der Zukunft (>12h)');
      console.log('  • API-Ratelimit erreicht');
      console.log('  • Spiele sind bereits beendet\n');
    }
    
    console.log('=== DIAGNOSE ABGESCHLOSSEN ===\n');
    
  } catch (err) {
    console.error('❌ Fehler beim API-Test:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
})();
