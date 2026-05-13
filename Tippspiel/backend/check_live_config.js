const pool = require('./db');

(async () => {
  try {
    // Alle Matches mit external_source
    const allMatches = await pool.query(
      'SELECT id, home_team, away_team, match_date, external_source, external_id, finished, round FROM matches ORDER BY external_source, match_date DESC'
    );
    
    console.log('\n=== ALLE MATCHES NACH QUELLE ===\n');
    const bySource = {};
    allMatches.rows.forEach(m => {
      if (!bySource[m.external_source || 'NULL']) {
        bySource[m.external_source || 'NULL'] = [];
      }
      bySource[m.external_source || 'NULL'].push(m);
    });
    
    Object.entries(bySource).forEach(([source, matches]) => {
      console.log(`📍 ${source}: ${matches.length} Matches`);
      matches.slice(0, 3).forEach(m => {
        const date = new Date(m.match_date).toLocaleString('de-DE');
        const status = m.finished ? '✅ FINISHED' : '⏳ PENDING';
        console.log(`  - [${m.id}] ${m.home_team} vs ${m.away_team} (${date}) ${status}`);
      });
      if (matches.length > 3) console.log(`  ... und ${matches.length - 3} weitere`);
    });
    
    // WM-Matches spezifisch
    console.log('\n=== WM-MATCHES (flashscore-wm) ===\n');
    const wmMatches = await pool.query(
      'SELECT id, home_team, away_team, match_date, external_id, finished, round FROM matches WHERE external_source = \'flashscore-wm\' ORDER BY match_date ASC'
    );
    console.log(`Gefunden: ${wmMatches.rows.length} WM-Matches`);
    wmMatches.rows.forEach(m => {
      const date = new Date(m.match_date).toLocaleString('de-DE');
      const futureOrLive = new Date(m.match_date) > new Date() ? '🔴 LIVE/FUTURE' : '✅ PAST';
      console.log(`  [${m.id}] ${m.home_team} vs ${m.away_team} | ${date} | external_id: ${m.external_id} | ${futureOrLive}`);
    });
    
    // Bundesliga-Matches spezifisch
    console.log('\n=== BUNDESLIGA-MATCHES (flashscore-bundesliga) ===\n');
    const blMatches = await pool.query(
      'SELECT id, home_team, away_team, match_date, external_id, finished, round FROM matches WHERE external_source = \'flashscore-bundesliga\' ORDER BY match_date DESC LIMIT 5'
    );
    console.log(`Gefunden: ${blMatches.rowCount} neuste Bundesliga-Matches`);
    blMatches.rows.forEach(m => {
      const date = new Date(m.match_date).toLocaleString('de-DE');
      const futureOrLive = new Date(m.match_date) > new Date() ? '🔴 LIVE/FUTURE' : '✅ PAST';
      console.log(`  [${m.id}] ${m.home_team} vs ${m.away_team} | ${date} | external_id: ${m.external_id} | ${futureOrLive}`);
    });
    
    // Fehlerdiagnose
    console.log('\n=== DIAGNOSE ===\n');
    const noSource = await pool.query(
      'SELECT COUNT(*) as cnt FROM matches WHERE external_source IS NULL'
    );
    const noExtId = await pool.query(
      'SELECT COUNT(*) as cnt FROM matches WHERE external_source IS NOT NULL AND external_id IS NULL'
    );
    
    console.log(`❌ Matches ohne external_source: ${noSource.rows[0].cnt}`);
    console.log(`❌ Matches mit source aber ohne external_id: ${noExtId.rows[0].cnt}`);
    
    if (wmMatches.rows.length === 0) {
      console.log('⚠️  WARNUNG: Keine WM-Matches gefunden! Live-Funktionen können nicht aktiviert werden.');
    } else {
      console.log('✅ WM-Matches vorhanden - Live-Funktionen sollten funktionieren');
    }
    
  } catch (err) {
    console.error('Fehler:', err.message);
  } finally {
    await pool.end();
  }
})();
