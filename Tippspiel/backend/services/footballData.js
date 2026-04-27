const fetch = require('node-fetch');
const { fetchRapidApiProbabilities, fetchRapidApiMatchInsights } = require('./rapidApi');

const API_BASE_URL = process.env.FOOTBALL_DATA_API_URL || 'https://api.football-data.org/v4';
const COMPETITION_CODE = process.env.FOOTBALL_DATA_COMPETITION_CODE || 'WC';
const SEASON = process.env.FOOTBALL_DATA_SEASON;

const COUNTRY_NAME_DE_BY_TLA = {
  ARG: 'Argentinien',
  AUS: 'Australien',
  AUT: 'Oesterreich',
  BEL: 'Belgien',
  BOL: 'Bolivien',
  BRA: 'Brasilien',
  CAN: 'Kanada',
  CHI: 'Chile',
  CHN: 'China',
  CIV: 'Elfenbeinkueste',
  CMR: 'Kamerun',
  COL: 'Kolumbien',
  CRC: 'Costa Rica',
  CRO: 'Kroatien',
  CZE: 'Tschechien',
  DEN: 'Daenemark',
  ECU: 'Ecuador',
  EGY: 'Aegypten',
  ENG: 'England',
  ESP: 'Spanien',
  FRA: 'Frankreich',
  GER: 'Deutschland',
  GHA: 'Ghana',
  GRE: 'Griechenland',
  HUN: 'Ungarn',
  IRN: 'Iran',
  IRQ: 'Irak',
  ISL: 'Island',
  ISR: 'Israel',
  ITA: 'Italien',
  JAM: 'Jamaika',
  JPN: 'Japan',
  KOR: 'Suedkorea',
  KSA: 'Saudi-Arabien',
  MAR: 'Marokko',
  MEX: 'Mexiko',
  NED: 'Niederlande',
  NGA: 'Nigeria',
  NOR: 'Norwegen',
  NZL: 'Neuseeland',
  PAN: 'Panama',
  PAR: 'Paraguay',
  PER: 'Peru',
  POL: 'Polen',
  POR: 'Portugal',
  QAT: 'Katar',
  ROU: 'Rumaenien',
  RSA: 'Suedafrika',
  SCO: 'Schottland',
  SEN: 'Senegal',
  SRB: 'Serbien',
  SUI: 'Schweiz',
  SVK: 'Slowakei',
  SWE: 'Schweden',
  TUR: 'Tuerkei',
  TUN: 'Tunesien',
  UKR: 'Ukraine',
  URU: 'Uruguay',
  USA: 'USA',
  VEN: 'Venezuela',
  WAL: 'Wales'
};

const COUNTRY_NAME_DE_BY_EN_NAME = {
  Argentina: 'Argentinien',
  Australia: 'Australien',
  Austria: 'Oesterreich',
  Belgium: 'Belgien',
  Bolivia: 'Bolivien',
  Brazil: 'Brasilien',
  Cameroon: 'Kamerun',
  Canada: 'Kanada',
  Chile: 'Chile',
  China: 'China',
  Colombia: 'Kolumbien',
  'Costa Rica': 'Costa Rica',
  Croatia: 'Kroatien',
  Czechia: 'Tschechien',
  'Czech Republic': 'Tschechien',
  Denmark: 'Daenemark',
  Ecuador: 'Ecuador',
  Egypt: 'Aegypten',
  England: 'England',
  France: 'Frankreich',
  Germany: 'Deutschland',
  Ghana: 'Ghana',
  Greece: 'Griechenland',
  Hungary: 'Ungarn',
  Iran: 'Iran',
  'IR Iran': 'Iran',
  Iraq: 'Irak',
  Iceland: 'Island',
  Israel: 'Israel',
  Italy: 'Italien',
  'Ivory Coast': 'Elfenbeinkueste',
  Jamaica: 'Jamaika',
  Japan: 'Japan',
  Mexico: 'Mexiko',
  Morocco: 'Marokko',
  Netherlands: 'Niederlande',
  'New Zealand': 'Neuseeland',
  Nigeria: 'Nigeria',
  Norway: 'Norwegen',
  Panama: 'Panama',
  Paraguay: 'Paraguay',
  Peru: 'Peru',
  Poland: 'Polen',
  Portugal: 'Portugal',
  Qatar: 'Katar',
  Romania: 'Rumaenien',
  'Saudi Arabia': 'Saudi-Arabien',
  Scotland: 'Schottland',
  Senegal: 'Senegal',
  Serbia: 'Serbien',
  Slovakia: 'Slowakei',
  Slovenia: 'Slowenien',
  'South Africa': 'Suedafrika',
  'South Korea': 'Suedkorea',
  Spain: 'Spanien',
  Sweden: 'Schweden',
  Switzerland: 'Schweiz',
  Tunisia: 'Tunesien',
  Turkey: 'Tuerkei',
  Ukraine: 'Ukraine',
  Uruguay: 'Uruguay',
  USA: 'USA',
  'United States': 'USA',
  Venezuela: 'Venezuela',
  Wales: 'Wales'
};

function createConfigError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getRoundLabel(match) {
  const stageMap = {
    LAST_16: 'Achtelfinale',
    QUARTER_FINALS: 'Viertelfinale',
    SEMI_FINALS: 'Halbfinale',
    THIRD_PLACE: 'Spiel um Platz 3',
    FINAL: 'Finale'
  };

  if (match.stage === 'GROUP_STAGE' && match.matchday) {
    return `${match.matchday}. Spieltag`;
  }

  return stageMap[match.stage] || match.stage || null;
}

function translateTeamNameToGerman(team) {
  if (!team || !team.name) {
    return null;
  }

  const tla = typeof team.tla === 'string' ? team.tla.trim().toUpperCase() : '';
  if (tla && COUNTRY_NAME_DE_BY_TLA[tla]) {
    return COUNTRY_NAME_DE_BY_TLA[tla];
  }

  const englishName = team.name.trim();
  if (COUNTRY_NAME_DE_BY_EN_NAME[englishName]) {
    return COUNTRY_NAME_DE_BY_EN_NAME[englishName];
  }

  return englishName;
}

async function fetchCompetitionMatches() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!apiKey) {
    throw createConfigError('FOOTBALL_DATA_API_KEY fehlt');
  }

  const url = new URL(`${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches`);

  if (SEASON) {
    url.searchParams.set('season', SEASON);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'X-Auth-Token': apiKey
    }
  });

  if (!response.ok) {
    const responseText = await response.text();
    const error = new Error(`football-data API Fehler: ${response.status} ${responseText}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  return payload.matches || [];
}

async function syncMatchesFromFootballData(pool) {
  const matches = await fetchCompetitionMatches();
  let createdCount = 0;
  let updatedCount = 0;

  for (const match of matches) {
    const normalizedMatch = {
      homeTeam: translateTeamNameToGerman(match.homeTeam),
      awayTeam: translateTeamNameToGerman(match.awayTeam),
      matchDate: match.utcDate,
      round: getRoundLabel(match),
      externalSource: 'football-data',
      externalId: match.id,
      homeGoals: match.score?.fullTime?.home,
      awayGoals: match.score?.fullTime?.away,
      finished: match.status === 'FINISHED' || match.status === 'AWARDED'
    };

    if (!normalizedMatch.homeTeam || !normalizedMatch.awayTeam || !normalizedMatch.matchDate || !normalizedMatch.externalId) {
      continue;
    }

    const existingMatch = await pool.query(
      'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
      [normalizedMatch.externalSource, normalizedMatch.externalId]
    );

    if (existingMatch.rows.length > 0) {
      await pool.query(
        `UPDATE matches
         SET home_team = $1,
             away_team = $2,
             match_date = $3,
             round = $4,
             home_goals = $5,
             away_goals = $6,
             finished = $7,
             updated_at = NOW()
         WHERE external_source = $8 AND external_id = $9`,
        [
          normalizedMatch.homeTeam,
          normalizedMatch.awayTeam,
          normalizedMatch.matchDate,
          normalizedMatch.round,
          normalizedMatch.finished ? normalizedMatch.homeGoals : null,
          normalizedMatch.finished ? normalizedMatch.awayGoals : null,
          normalizedMatch.finished,
          normalizedMatch.externalSource,
          normalizedMatch.externalId
        ]
      );
      updatedCount += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO matches (
        home_team,
        away_team,
        match_date,
        round,
        home_goals,
        away_goals,
        finished,
        external_source,
        external_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        normalizedMatch.round,
        normalizedMatch.finished ? normalizedMatch.homeGoals : null,
        normalizedMatch.finished ? normalizedMatch.awayGoals : null,
        normalizedMatch.finished,
        normalizedMatch.externalSource,
        normalizedMatch.externalId
      ]
    );
    createdCount += 1;
  }

  return {
    totalFetched: matches.length,
    createdCount,
    updatedCount
  };
}

function getOutcome(homeGoals, awayGoals, isHomeTeam) {
  if (homeGoals === awayGoals) {
    return 'U';
  }

  if (isHomeTeam) {
    return homeGoals > awayGoals ? 'S' : 'N';
  }

  return awayGoals > homeGoals ? 'S' : 'N';
}

function toTeamRecentMatch(row, teamName) {
  const isHomeTeam = row.home_team === teamName;
  const ownGoals = isHomeTeam ? row.home_goals : row.away_goals;
  const opponentGoals = isHomeTeam ? row.away_goals : row.home_goals;

  return {
    date: row.match_date,
    opponent: isHomeTeam ? row.away_team : row.home_team,
    ownGoals,
    opponentGoals,
    outcome: getOutcome(row.home_goals, row.away_goals, isHomeTeam)
  };
}

function buildRecentMatches(rows, teamName, limit = 5) {
  return rows
    .filter((row) => row.home_team === teamName || row.away_team === teamName)
    .sort((first, second) => new Date(second.match_date) - new Date(first.match_date))
    .slice(0, limit)
    .map((row) => toTeamRecentMatch(row, teamName));
}

function calculateFormScore(recentMatches) {
  if (!recentMatches.length) {
    return 0;
  }

  return recentMatches.reduce((sum, match) => {
    if (match.outcome === 'S') return sum + 3;
    if (match.outcome === 'U') return sum + 1;
    return sum;
  }, 0);
}

function calculateWinProbabilities(homeRecentMatches, awayRecentMatches) {
  if (!homeRecentMatches.length && !awayRecentMatches.length) {
    return {
      homeWin: 33,
      draw: 34,
      awayWin: 33,
      note: 'Keine ausreichenden Daten, daher neutrale Schätzung.'
    };
  }

  const homeFormScore = calculateFormScore(homeRecentMatches);
  const awayFormScore = calculateFormScore(awayRecentMatches);
  const homeStrength = homeFormScore + 2.2; // leichter Heimvorteil
  const awayStrength = awayFormScore + 1.8;
  const strengthDiff = Math.abs(homeStrength - awayStrength);
  const drawProbability = Math.max(0.18, 0.28 - Math.min(0.12, strengthDiff * 0.012));
  const remainingProbability = 1 - drawProbability;
  const homeWinProbability = remainingProbability * (homeStrength / (homeStrength + awayStrength));
  const awayWinProbability = remainingProbability * (awayStrength / (homeStrength + awayStrength));

  const homeWin = Math.round(homeWinProbability * 100);
  const draw = Math.round(drawProbability * 100);
  const awayWin = Math.max(0, 100 - homeWin - draw);

  return {
    homeWin,
    draw,
    awayWin,
    note: 'Schätzung auf Basis der letzten Spiele und Heimvorteil.'
  };
}

async function fetchLocalFinishedMatches(pool, homeTeam, awayTeam) {
  const result = await pool.query(
    `SELECT home_team, away_team, match_date, home_goals, away_goals
     FROM matches
     WHERE finished = true
       AND home_goals IS NOT NULL
       AND away_goals IS NOT NULL
       AND (
         home_team = $1 OR away_team = $1 OR
         home_team = $2 OR away_team = $2
       )
     ORDER BY match_date DESC
     LIMIT 120`,
    [homeTeam, awayTeam]
  );

  return result.rows;
}

function toNormalizedRowsFromFootballData(matches) {
  return matches
    .filter((match) => match.status === 'FINISHED' || match.status === 'AWARDED')
    .map((match) => {
      const homeGoals = match.score?.fullTime?.home;
      const awayGoals = match.score?.fullTime?.away;

      if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) {
        return null;
      }

      return {
        home_team: translateTeamNameToGerman(match.homeTeam),
        away_team: translateTeamNameToGerman(match.awayTeam),
        match_date: match.utcDate,
        home_goals: homeGoals,
        away_goals: awayGoals
      };
    })
    .filter(Boolean);
}

async function getMatchInsights(pool, matchId) {
  const matchResult = await pool.query(
    'SELECT id, home_team, away_team, match_date, round FROM matches WHERE id = $1',
    [matchId]
  );

  if (!matchResult.rows.length) {
    const error = new Error('Match not found');
    error.statusCode = 404;
    throw error;
  }

  const match = matchResult.rows[0];
  let source = 'local';
  let normalizedRows;

  try {
    const externalMatches = await fetchCompetitionMatches();
    normalizedRows = toNormalizedRowsFromFootballData(externalMatches);
    source = 'football-data';
  } catch (err) {
    normalizedRows = await fetchLocalFinishedMatches(pool, match.home_team, match.away_team);
  }

  const homeRecentMatches = buildRecentMatches(normalizedRows, match.home_team, 5);
  const awayRecentMatches = buildRecentMatches(normalizedRows, match.away_team, 5);

  const headToHead = normalizedRows
    .filter((row) => {
      const teams = [row.home_team, row.away_team];
      return teams.includes(match.home_team) && teams.includes(match.away_team);
    })
    .sort((first, second) => new Date(second.match_date) - new Date(first.match_date))
    .slice(0, 5)
    .map((row) => ({
      date: row.match_date,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      score: `${row.home_goals}:${row.away_goals}`
    }));

  try {
    if (homeRecentMatches.length === 0 || awayRecentMatches.length === 0 || headToHead.length === 0) {
      const rapidInsights = await fetchRapidApiMatchInsights(match.home_team, match.away_team, match.match_date);

      if (homeRecentMatches.length === 0 && rapidInsights.homeRecentMatches.length > 0) {
        homeRecentMatches.push(...rapidInsights.homeRecentMatches);
      }

      if (awayRecentMatches.length === 0 && rapidInsights.awayRecentMatches.length > 0) {
        awayRecentMatches.push(...rapidInsights.awayRecentMatches);
      }

      if (headToHead.length === 0 && rapidInsights.headToHead.length > 0) {
        headToHead.push(...rapidInsights.headToHead);
      }

      if (rapidInsights.homeRecentMatches.length > 0 || rapidInsights.awayRecentMatches.length > 0 || rapidInsights.headToHead.length > 0) {
        source = 'rapidapi';
      }
    }
  } catch (err) {
    // Keep existing data when RapidAPI fallback is unavailable.
  }

  const probabilities = calculateWinProbabilities(homeRecentMatches, awayRecentMatches);

  try {
    if (homeRecentMatches.length === 0 && awayRecentMatches.length === 0) {
      const rapidApiProbabilities = await fetchRapidApiProbabilities(
        match.home_team,
        match.away_team,
        match.match_date
      );
      if (rapidApiProbabilities) {
        probabilities.homeWin = rapidApiProbabilities.homeWin;
        probabilities.draw = rapidApiProbabilities.draw;
        probabilities.awayWin = rapidApiProbabilities.awayWin;
        probabilities.note = rapidApiProbabilities.note;
      }
    }
  } catch (err) {
    // Keep fallback probabilities if RapidAPI is unavailable or mapping fails.
  }

  return {
    match,
    source,
    homeTeam: {
      name: match.home_team,
      recentMatches: homeRecentMatches
    },
    awayTeam: {
      name: match.away_team,
      recentMatches: awayRecentMatches
    },
    headToHead,
    probabilities
  };
}

async function warmUpApiFootballInsightsCache(pool, options = {}) {
  const maxMatches = Number.parseInt(options.maxMatches || process.env.APIFOOTBALL_WARMUP_MATCH_LIMIT || '4', 10);
  const horizonDays = Number.parseInt(options.horizonDays || process.env.APIFOOTBALL_WARMUP_HORIZON_DAYS || '14', 10);

  if (!Number.isFinite(maxMatches) || maxMatches <= 0) {
    return { warmedMatches: 0, attempted: 0 };
  }

  const fromDate = new Date();
  const toDate = new Date(fromDate.getTime() + Math.max(1, horizonDays) * 24 * 60 * 60 * 1000);

  const upcomingMatchesResult = await pool.query(
    `SELECT id, home_team, away_team, match_date
     FROM matches
     WHERE finished = false
       AND match_date >= $1
       AND match_date <= $2
     ORDER BY match_date ASC
     LIMIT $3`,
    [fromDate.toISOString(), toDate.toISOString(), maxMatches]
  );

  let warmedMatches = 0;

  for (const match of upcomingMatchesResult.rows) {
    try {
      await fetchRapidApiMatchInsights(match.home_team, match.away_team, match.match_date);
      await fetchRapidApiProbabilities(match.home_team, match.away_team, match.match_date);
      warmedMatches += 1;
    } catch (err) {
      // Continue with next match if API provider is unavailable or quota is reached.
    }
  }

  return {
    warmedMatches,
    attempted: upcomingMatchesResult.rows.length
  };
}

module.exports = { syncMatchesFromFootballData, getMatchInsights, warmUpApiFootballInsightsCache };