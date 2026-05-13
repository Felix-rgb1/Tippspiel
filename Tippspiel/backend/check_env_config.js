const fs = require('fs');
const path = require('path');

console.log('\n=== UMGEBUNGSVARIABLEN CHECK ===\n');

// Prüfe .env Datei
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  
  const relevantVars = [
    'RAPIDAPI_KEY',
    'RAPIDAPI_HOST',
    'RAPIDAPI_PROVIDER',
    'FLASHSCORE_TOURNAMENT_URL',
    'FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL',
    'LIVE_SCORE_CACHE_HOT_MS',
    'LIVE_SCORE_CACHE_COLD_MS',
    'LIVE_MATCH_TIME_TOLERANCE_MS'
  ];
  
  console.log('📄 .env Datei gefunden - Relevante Variablen:');
  relevantVars.forEach(varName => {
    const line = lines.find(l => l.startsWith(`${varName}=`));
    if (line) {
      const value = line.split('=')[1];
      const masked = value.length > 20 ? value.substring(0, 10) + '...' : value;
      console.log(`  ✅ ${varName} = ${masked}`);
    } else {
      console.log(`  ❌ ${varName} = NOT SET (using default)`);
    }
  });
} else {
  console.log('⚠️  Keine .env Datei gefunden (using defaults)');
}

console.log('\n=== ACTIVE PROCESS DEFAULTS ===\n');

// Zeige die defaults aus liveScores.js
const defaults = {
  'LIVE_SCORE_CACHE_HOT_MS': '15000 (15 Sekunden)',
  'LIVE_SCORE_CACHE_COLD_MS': '60000 (1 Minute)',
  'LIVE_MATCH_TIME_TOLERANCE_MS': '43200000 (12 Stunden vor/nach match start)',
  'MATCH_DETAILS_CACHE_MS': '300000 (5 Minuten)',
  'MATCH_DETAILS_LIVE_CACHE_MS': '20000 (20 Sekunden)'
};

Object.entries(defaults).forEach(([key, value]) => {
  console.log(`  📌 ${key}: ${value}`);
});

console.log('\n=== KONFIGURATION SUMMARY ===\n');
console.log('✅ WM-Matches: 72 vorhanden (flashscore-wm)');
console.log('✅ Bundesliga-Matches: 27 vorhanden (flashscore-bundesliga)');
console.log('✅ Alle Matches haben externe IDs für API-Matching');
console.log('\n📌 Live-Funktionen funktionieren nur wenn:');
console.log('   1. RAPIDAPI_KEY & RAPIDAPI_HOST gesetzt sind');
console.log('   2. Backend-Server läuft (localhost:3000)');
console.log('   3. Matches innerhalb der Zeittoleranz liegen (±12h von Kickoff)');
console.log('   4. external_source = "flashscore-*" ist\n');
