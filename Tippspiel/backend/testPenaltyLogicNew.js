#!/usr/bin/env node
/**
 * Test für Elfmeterschießen-Logik (aktualisiert)
 * 
 * Neuer Logik: Tore nach 120 Min + getroffene Elfmeter = Endergebnis
 * Beispiel: 1:1 nach 120 Min, Elfmeter 5:4 → Endergebnis 6:5
 * 
 * Verwendung:
 *   node backend/testPenaltyLogicNew.js
 */

function parseGoals(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Extract penalty shootout information from match details
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

  const hasExplicitPenalty = stateValues.some((value) => value.includes('penalties') || value.includes('penalty shootout'));

  // Try to extract penalty winner from various fields (for reference/logging)
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

  // Try to extract 90-minute goals (before penalties)
  let homeGoals90 = null;
  let awayGoals90 = null;
  const goalsAfterExtraTime = match?.result_after_extra_time || match?.extra_time_result;
  if (goalsAfterExtraTime) {
    homeGoals90 = parseGoals(
      goalsAfterExtraTime?.home ?? goalsAfterExtraTime?.home_score ?? goalsAfterExtraTime?.homeScore
    );
    awayGoals90 = parseGoals(
      goalsAfterExtraTime?.away ?? goalsAfterExtraTime?.away_score ?? goalsAfterExtraTime?.awayScore
    );
  }

  // Extract penalty shootout goals scored by each team
  let homeElfmeterScored = null;
  let awayElfmeterScored = null;

  const elfmeterCandidates = {
    home: [
      match?.penalties?.home_scored,
      match?.penalties?.home,
      match?.penalty_shootout?.home,
      match?.penalty_shootout?.home_score,
      match?.penalty_result?.home,
      match?.penalty_goals?.home,
      match?.result_after_penalties?.home,
      match?.result_after_penalties?.home_score,
      match?.extra_time_result?.penalties?.home,
      match?.extra_time_result?.penalty_goals?.home
    ],
    away: [
      match?.penalties?.away_scored,
      match?.penalties?.away,
      match?.penalty_shootout?.away,
      match?.penalty_shootout?.away_score,
      match?.penalty_result?.away,
      match?.penalty_goals?.away,
      match?.result_after_penalties?.away,
      match?.result_after_penalties?.away_score,
      match?.extra_time_result?.penalties?.away,
      match?.extra_time_result?.penalty_goals?.away
    ]
  };

  for (const candidate of elfmeterCandidates.home) {
    const parsed = parseGoals(candidate);
    if (parsed !== null) {
      homeElfmeterScored = parsed;
      break;
    }
  }

  for (const candidate of elfmeterCandidates.away) {
    const parsed = parseGoals(candidate);
    if (parsed !== null) {
      awayElfmeterScored = parsed;
      break;
    }
  }

  return {
    penaltyDecided: hasExplicitPenalty && (homeElfmeterScored !== null || awayElfmeterScored !== null),
    penaltyWinner,
    homeGoals90,
    awayGoals90,
    homeElfmeterScored,
    awayElfmeterScored
  };
}

function calculateFinalGoals(match) {
  const penaltyInfo = extractPenaltyInfo(match);
  let finalHomeGoals = match.homeGoals;
  let finalAwayGoals = match.awayGoals;

  // New logic: add penalty goals to 90-minute result
  if (penaltyInfo.penaltyDecided && (penaltyInfo.homeElfmeterScored !== null || penaltyInfo.awayElfmeterScored !== null)) {
    const baseHome = penaltyInfo.homeGoals90 ?? match.homeGoals;
    const baseAway = penaltyInfo.awayGoals90 ?? match.awayGoals;

    if (baseHome !== null && penaltyInfo.homeElfmeterScored !== null) {
      finalHomeGoals = baseHome + penaltyInfo.homeElfmeterScored;
    }
    if (baseAway !== null && penaltyInfo.awayElfmeterScored !== null) {
      finalAwayGoals = baseAway + penaltyInfo.awayElfmeterScored;
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
    name: 'Elfmeter: 1:1 nach 120 Min, Elfmeter 5:4 → Endergebnis 6:5',
    match: {
      homeTeam: 'Deutschland',
      awayTeam: 'Frankreich',
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished after penalties',
      penalty_winner: 'home',
      result_after_extra_time: { home: 1, away: 1 },
      penalties: { home_scored: 5, away_scored: 4 }
    },
    expected: { finalHome: 6, finalAway: 5, hasPenalty: true, homeElfmeter: 5, awayElfmeter: 4 }
  },
  {
    name: 'Elfmeter: 0:0 nach 120 Min, Elfmeter 3:1 → Endergebnis 3:1',
    match: {
      homeTeam: 'Brasilien',
      awayTeam: 'Argentinien',
      homeGoals: 0,
      awayGoals: 0,
      status: 'finished after penalties',
      penalty_winner: 'home',
      result_after_extra_time: { home: 0, away: 0 },
      penalties: { home: 3, away: 1 }
    },
    expected: { finalHome: 3, finalAway: 1, hasPenalty: true, homeElfmeter: 3, awayElfmeter: 1 }
  },
  {
    name: 'Elfmeter: 2:2 nach 120 Min, Elfmeter 4:2 → Endergebnis 6:4',
    match: {
      homeTeam: 'Spanien',
      awayTeam: 'Italien',
      homeGoals: 2,
      awayGoals: 2,
      status_type: 'finished - penalty shootout',
      penalty_winner: 'away',
      result_after_extra_time: { home_score: 2, away_score: 2 },
      penalty_shootout: { home_score: 4, away_score: 6 }
    },
    expected: { finalHome: 6, finalAway: 8, hasPenalty: true, homeElfmeter: 4, awayElfmeter: 6 }
  },
  {
    name: 'Kein Elfmeter-Tore erkannt (fehlerhafte Daten)',
    match: {
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      homeGoals: 1,
      awayGoals: 1,
      status: 'finished after penalties',
      penalty_winner: 'home'
    },
    expected: { finalHome: 1, finalAway: 1, hasPenalty: false }
  }
];

// Run tests
console.log('🧪 Teste Elfmeterschießen-Logik (NEUE VERSION)\n');
console.log('Logik: Tore nach 120 Min + getroffene Elfmeter = Endergebnis\n');
console.log('=' .repeat(80) + '\n');

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
    console.log(`  Elfmeter-Tore: ${penaltyInfo.homeElfmeterScored}:${penaltyInfo.awayElfmeterScored}`);
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

console.log('=' .repeat(80));
console.log(`\n📊 Ergebnisse: ${passed} bestanden, ${failed} fehlgeschlagen\n`);

if (failed === 0) {
  console.log('✅ Alle Tests bestanden! Die neue Elfmeter-Logik funktioniert korrekt.\n');
  process.exit(0);
} else {
  console.log(`❌ ${failed} Test(s) fehlgeschlagen!\n`);
  process.exit(1);
}
