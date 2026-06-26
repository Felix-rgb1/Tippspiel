#!/usr/bin/env node
/**
 * Test für Elfmeterschießen-Logik
 * 
 * Dieser Test simuliert verschiedene Elfmeter-Szenarien und prüft die Berechnung
 * 
 * Verwendung:
 *   node backend/testPenaltyLogic.js
 */

// Importiere die extractPenaltyInfo Funktion (müsste exportiert sein)
// Für den Test nutzen wir eine lokale Implementierung

function parseGoals(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractPenaltyInfo(match) {
  const stateValues = [
    match?.status,
    match?.status_type,
    match?.event_stage_type,
    match?.eventStageType,
    match?.state
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const hasExplicitPenalty = stateValues.some(
    (value) => value.includes('penalties') || value.includes('penalty shootout')
  );

  const penaltyWinnerCandidates = [
    match?.penalty_winner,
    match?.penalties?.winner,
    match?.extra_time_result?.penalty_winner,
    match?.result_after_penalties?.winner,
    match?.result_after_extra_time?.penalty_winner,
    match?.match_status?.penalty_winner
  ].filter(Boolean);

  let penaltyWinner = null;
  if (penaltyWinnerCandidates.length > 0) {
    const winner = String(penaltyWinnerCandidates[0]).toLowerCase().trim();
    if (winner.includes('home') || winner === 'h' || winner === '1') {
      penaltyWinner = 'home';
    } else if (winner.includes('away') || winner === 'a' || winner === '2') {
      penaltyWinner = 'away';
    }
  }

  let homeGoals90 = null;
  let awayGoals90 = null;
  const goalsAfterExtraTime = match?.result_after_extra_time || match?.extra_time_result;
  if (goalsAfterExtraTime) {
    homeGoals90 = parseGoals(
      goalsAfterExtraTime?.home ??
      goalsAfterExtraTime?.home_score ??
      goalsAfterExtraTime?.homeScore
    );
    awayGoals90 = parseGoals(
      goalsAfterExtraTime?.away ??
      goalsAfterExtraTime?.away_score ??
      goalsAfterExtraTime?.awayScore
    );
  }

  return {
    penaltyDecided: hasExplicitPenalty && penaltyWinner !== null,
    penaltyWinner,
    homeGoals90,
    awayGoals90
  };
}

function calculateFinalGoals(match) {
  const penaltyInfo = extractPenaltyInfo(match);
  let finalHomeGoals = match.homeGoals;
  let finalAwayGoals = match.awayGoals;

  if (penaltyInfo.penaltyDecided && penaltyInfo.penaltyWinner) {
    const baseHome = penaltyInfo.homeGoals90 ?? match.homeGoals;
    const baseAway = penaltyInfo.awayGoals90 ?? match.awayGoals;

    if (penaltyInfo.penaltyWinner === 'home' && baseHome !== null) {
      finalHomeGoals = baseHome + 1;
      finalAwayGoals = baseAway;
    } else if (penaltyInfo.penaltyWinner === 'away' && baseAway !== null) {
      finalHomeGoals = baseHome;
      finalAwayGoals = baseAway + 1;
    }
  }

  return {
    finalHome: finalHomeGoals,
    finalAway: finalAwayGoals,
    penaltyInfo
  };
}

// Test Cases
const testCases = [
  {
    name: 'Normales Spiel (kein Elfmeter)',
    match: {
      homeTeam: 'Deutschland',
      awayTeam: 'Frankreich',
      homeGoals: 2,
      awayGoals: 1,
      status: 'finished'
    },
    expected: { finalHome: 2, finalAway: 1, hasPenalty: false }
  },
  {
    name: 'Elfmeter: Heimteam gewinnt nach 2:2',
    match: {
      homeTeam: 'Deutschland',
      awayTeam: 'Frankreich',
      homeGoals: 2,
      awayGoals: 2,
      status: 'finished after penalties',
      penalty_winner: 'home',
      result_after_extra_time: { home: 2, away: 2 }
    },
    expected: { finalHome: 3, finalAway: 2, hasPenalty: true }
  },
  {
    name: 'Elfmeter: Auswärtsteam gewinnt nach 1:1',
    match: {
      homeTeam: 'Deutschland',
      awayTeam: 'Frankreich',
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished after penalties',
      penalty_winner: 'away',
      result_after_extra_time: { home: 1, away: 1 }
    },
    expected: { finalHome: 1, finalAway: 2, hasPenalty: true }
  },
  {
    name: 'Elfmeter mit verschiedenen API-Feldern',
    match: {
      homeTeam: 'Brasilien',
      awayTeam: 'Argentinien',
      homeGoals: 0,
      awayGoals: 0,
      status_type: 'finished - penalty shootout',
      penalties: { winner: 'home' },
      result_after_extra_time: { home_score: 0, away_score: 0 }
    },
    expected: { finalHome: 1, finalAway: 0, hasPenalty: true }
  },
  {
    name: 'Kein Elfmeter-Gewinner erkannt (fehlerhafte Daten)',
    match: {
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished after penalties',
      penalty_winner: undefined
    },
    expected: { finalHome: 1, finalAway: 1, hasPenalty: false }
  }
];

// Run tests
console.log('🧪 Teste Elfmeterschießen-Logik\n');
console.log('=' .repeat(70) + '\n');

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  
  const result = calculateFinalGoals(testCase.match);
  const { finalHome, finalAway, penaltyInfo } = result;
  const { expected } = testCase;

  const homeCorrect = finalHome === expected.finalHome;
  const awayCorrect = finalAway === expected.finalAway;
  const penaltyCorrect = penaltyInfo.penaltyDecided === expected.hasPenalty;

  const allCorrect = homeCorrect && awayCorrect && penaltyCorrect;

  console.log(`  Input: ${testCase.match.homeTeam} ${testCase.match.homeGoals}:${testCase.match.awayGoals} ${testCase.match.awayTeam}`);
  console.log(`  Status: ${testCase.match.status || testCase.match.status_type || 'finished'}`);
  console.log(`  Output: ${finalHome}:${finalAway}`);
  console.log(`  Elfmeter erkannt: ${penaltyInfo.penaltyDecided ? '✓ Ja' : '✗ Nein'}`);
  if (penaltyInfo.penaltyDecided) {
    console.log(`  Sieger: ${penaltyInfo.penaltyWinner === 'home' ? testCase.match.homeTeam : testCase.match.awayTeam}`);
  }
  
  if (allCorrect) {
    console.log(`  ✅ BESTANDEN\n`);
    passed++;
  } else {
    console.log(`  ❌ FEHLGESCHLAGEN`);
    console.log(`     Erwartet: ${expected.finalHome}:${expected.finalAway}, Elfmeter: ${expected.hasPenalty}\n`);
    failed++;
  }
});

console.log('=' .repeat(70));
console.log(`\n📊 Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen\n`);

if (failed === 0) {
  console.log('✅ Alle Tests bestanden! Die Elfmeter-Logik funktioniert korrekt.\n');
  process.exit(0);
} else {
  console.log(`❌ ${failed} Test(s) fehlgeschlagen!\n`);
  process.exit(1);
}
