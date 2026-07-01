const {
  fetchFlashscoreTournamentFixtures,
  fetchFlashscoreTournamentResults,
  fetchFlashscoreMatchDetails,
  fetchFlashscoreMatchPenalties,
  isRapidApiConfigured
} = require('./rapidApi');

const DEFAULT_TOURNAMENT_URL = '/football/germany/bundesliga/';
const EXTERNAL_SOURCE = 'flashscore-bundesliga';
const IMPORT_TIMEZONE = process.env.FLASHSCORE_TIMEZONE || process.env.APP_TIMEZONE || 'Europe/Berlin';

let penaltySchemaReadyPromise = null;

async function ensurePenaltyColumnsSchema(pool) {
  if (!penaltySchemaReadyPromise) {
    penaltySchemaReadyPromise = (async () => {
      await pool.query(`
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS penalty_decided BOOLEAN DEFAULT false;
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS penalty_winner VARCHAR(10) DEFAULT NULL CHECK (penalty_winner IS NULL OR penalty_winner IN ('home', 'away'));
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_goals_90 INTEGER DEFAULT NULL;
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_goals_90 INTEGER DEFAULT NULL;
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_elfmeter_scored INTEGER DEFAULT NULL;
        ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_elfmeter_scored INTEGER DEFAULT NULL;
      `);

      await pool.query('CREATE INDEX IF NOT EXISTS idx_matches_penalty_decided ON matches(penalty_decided)');
    })().catch((error) => {
      penaltySchemaReadyPromise = null;
      throw error;
    });
  }

  await penaltySchemaReadyPromise;
}

function toBerlinSqlTimestamp(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IMPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const findPart = (type) => parts.find((part) => part.type === type)?.value;

  const year = findPart('year');
  const month = findPart('month');
  const day = findPart('day');
  const hour = findPart('hour');
  const minute = findPart('minute');
  const second = findPart('second');

  if (!year || !month || !day || !hour || !minute || !second) {
    return null;
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeLocalDateTimeString(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const TEAM_NAME_CANONICAL_MAP = {
  sudkorea: 'southkorea',
  suedkorea: 'southkorea',
  southkorea: 'southkorea',
  czechia: 'czechrepublic',
  czechrepublic: 'czechrepublic',
  tschechien: 'czechrepublic',
  bosniaherzegovina: 'bosniaherzegovina',
  bosniaandherzegovina: 'bosniaherzegovina',
  bosnienherzegowina: 'bosniaherzegovina',
  bosnienhercegowina: 'bosniaherzegovina',
  bosnienherz: 'bosniaherzegovina',
  switzerland: 'switzerland',
  schweiz: 'switzerland',
  mexico: 'mexico',
  mexiko: 'mexico',
  southafrica: 'southafrica',
  suedafrika: 'southafrica',
  qatar: 'qatar',
  katar: 'qatar',
  usa: 'unitedstates',
  unitedstates: 'unitedstates',
  vereinigtestaaten: 'unitedstates'
};

function canonicalizeTeamName(value) {
  const normalized = normalizeName(value);
  return TEAM_NAME_CANONICAL_MAP[normalized] || normalized;
}

function teamNamesMatch(a, b) {
  const left = canonicalizeTeamName(a);
  const right = canonicalizeTeamName(b);

  if (!left || !right) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}

function toMatchList(payload) {
  const collected = [];
  const visited = new Set();

  function walk(value) {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((entry) => walk(entry));
      return;
    }

    const hasTeams = Boolean(
      (value.home_team || value.homeTeam || value.home || value.team_home || value.home_name)
      && (value.away_team || value.awayTeam || value.away || value.team_away || value.away_name)
    );
    const hasParticipants = Array.isArray(value.participants) && value.participants.length >= 2;
    const hasId = value.match_id || value.id || value.event_id || value.eventId;

    if (hasId && (hasTeams || hasParticipants)) {
      collected.push(value);
    }

    Object.values(value).forEach((child) => walk(child));
  }

  walk(payload);
  return collected;
}

function toTimestampDate(value) {
  if (typeof value === 'string') {
    const localDateTime = normalizeLocalDateTimeString(value);
    if (localDateTime) {
      return localDateTime;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toBerlinSqlTimestamp(parsed);
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return toBerlinSqlTimestamp(new Date(milliseconds));
}

function parseGoals(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDeterministicBigintString(value) {
  const input = String(value || '').trim();
  if (!input) {
    return null;
  }

  let hash = 1469598103934665603n;
  const prime = 1099511628211n;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash *= prime;
  }

  const positive63Bit = hash & 0x7fffffffffffffffn;
  return positive63Bit.toString();
}

function toExternalId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    return raw;
  }

  return toDeterministicBigintString(raw);
}

function pickTeamName(match, side) {
  const teamObjectCandidates = side === 'home'
    ? [match?.home_team, match?.homeTeam, match?.team_home]
    : [match?.away_team, match?.awayTeam, match?.team_away];

  const directNameCandidates = side === 'home'
    ? [match?.home, match?.home_name, match?.homeName]
    : [match?.away, match?.away_name, match?.awayName];

  for (const candidate of teamObjectCandidates) {
    const name = String(candidate?.name || candidate?.team_name || candidate?.shortName || '').trim();
    if (name) {
      return name;
    }
  }

  for (const candidate of directNameCandidates) {
    const name = String(candidate || '').trim();
    if (name) {
      return name;
    }
  }

  const participants = Array.isArray(match?.participants) ? match.participants : [];
  const normalizedSide = side.toLowerCase();
  const byRole = participants.find((entry) => {
    const role = String(entry?.homeAway || entry?.role || entry?.position || '').toLowerCase();
    return role.includes(normalizedSide);
  });

  if (byRole) {
    const name = String(byRole?.name || byRole?.team_name || '').trim();
    if (name) {
      return name;
    }
  }

  if (participants.length >= 2) {
    const fallback = side === 'home' ? participants[0] : participants[1];
    const name = String(fallback?.name || fallback?.team_name || '').trim();
    if (name) {
      return name;
    }
  }

  return '';
}

function hasFinishedStatus(match) {
  const stateValues = [
    match?.status,
    match?.status_type,
    match?.event_stage_type,
    match?.eventStageType,
    match?.state
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (stateValues.some((value) => value.includes('finished') || value.includes('ended') || value.includes('after penalties') || value.includes('awarded'))) {
    return true;
  }

  const home = parseGoals(match?.scores?.home);
  const away = parseGoals(match?.scores?.away);
  return home !== null && away !== null;
}

// Extract penalty shootout information from match details
function extractPenaltyInfo(match) {
  // Check for explicit penalty finished status
  const stateValues = [
    match?.status,
    match?.status_type,
    match?.event_stage_type,
    match?.eventStageType,
    match?.state,
    match?.match_status?.stage,
    match?.match_status?.live_time
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const hasPenaltyFlag = Boolean(
    match?.match_status?.is_finished_after_penalties
    || match?.match_status?.final_winner
  );
  const hasPenaltyScoreInScores = parseGoals(match?.scores?.home_penalties) !== null || parseGoals(match?.scores?.away_penalties) !== null;
  const hasExplicitPenalty = hasPenaltyFlag || hasPenaltyScoreInScores || stateValues.some((value) => value.includes('penalties') || value.includes('penalty shootout'));

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

  if (homeGoals90 === null || awayGoals90 === null) {
    const regularHome = parseGoals(match?.scores?.home);
    const regularAway = parseGoals(match?.scores?.away);
    if (regularHome !== null && regularAway !== null) {
      homeGoals90 = regularHome;
      awayGoals90 = regularAway;
    }
  }

  // Extract penalty shootout goals scored by each team
  let homeElfmeterScored = null;
  let awayElfmeterScored = null;

  // Try multiple possible field names for penalty goals
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
      match?.scores?.home_penalties,
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
      match?.scores?.away_penalties,
      match?.extra_time_result?.penalties?.away,
      match?.extra_time_result?.penalty_goals?.away
    ]
  };

  // Search for home penalties
  for (const candidate of elfmeterCandidates.home) {
    const parsed = parseGoals(candidate);
    if (parsed !== null) {
      homeElfmeterScored = parsed;
      break;
    }
  }

  // Search for away penalties
  for (const candidate of elfmeterCandidates.away) {
    const parsed = parseGoals(candidate);
    if (parsed !== null) {
      awayElfmeterScored = parsed;
      break;
    }
  }

  const hasPenaltyScores = homeElfmeterScored !== null || awayElfmeterScored !== null;
  const penaltyDecided = Boolean(hasExplicitPenalty || hasPenaltyScores);

  return {
    penaltyDecided,
    penaltyStatusDetected: hasExplicitPenalty,
    penaltyWinner,
    homeGoals90,
    awayGoals90,
    homeElfmeterScored,
    awayElfmeterScored
  };
}

function toRoundLabel(match, fallbackRound = null) {
  const candidates = [
    match?.round_name,
    match?.round,
    match?.stage_name,
    match?.tournament_stage_name,
    match?.tournament_round_name
  ].filter(Boolean);

  if (candidates.length > 0) {
    return String(candidates[0]);
  }

  return fallbackRound;
}

function isGenericRoundLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'wm' || normalized === 'bundesliga';
}

function resolveRoundLabelFromDetails(details) {
  const candidates = [
    details?.round_name,
    details?.stage_name,
    details?.tournament_stage_name,
    details?.tournament_round_name,
    details?.tournament?.name,
    details?.tournament?.round_name,
    details?.tournament?.stage_name,
    details?.stage?.name,
    details?.round?.name,
    details?.event?.round_name,
    details?.event?.stage_name
  ].filter(Boolean);

  for (const candidate of candidates) {
    const label = mapWMRoundName(candidate);
    if (label) {
      return label;
    }
  }

  return null;
}

function toNormalizedMatch(match, fallbackRound = null) {
  const sourceMatchId = String(
    match?.match_id
    || match?.id
    || match?.event_id
    || match?.eventId
    || ''
  ).trim();
  const externalId = toExternalId(sourceMatchId);

  if (!externalId) {
    return null;
  }

  const homeTeam = pickTeamName(match, 'home');
  const awayTeam = pickTeamName(match, 'away');
  const matchDate = toTimestampDate(
    match?.timestamp
    || match?.start_timestamp
    || match?.startTime
    || match?.start_date
    || match?.date
  );

  if (!homeTeam || !awayTeam || !matchDate) {
    return null;
  }

  const finished = hasFinishedStatus(match);
  const homeGoals = parseGoals(
    match?.scores?.home
    ?? match?.home_score
    ?? match?.homeScore
    ?? match?.result?.home
  );
  const awayGoals = parseGoals(
    match?.scores?.away
    ?? match?.away_score
    ?? match?.awayScore
    ?? match?.result?.away
  );

  // Extract penalty information
  const penaltyInfo = extractPenaltyInfo(match);

  return {
    homeTeam,
    awayTeam,
    matchDate,
    round: toRoundLabel(match, fallbackRound),
    finished,
    homeGoals: finished ? homeGoals : null,
    awayGoals: finished ? awayGoals : null,
    externalId,
    sourceMatchId,
    penaltyDecided: penaltyInfo.penaltyDecided,
    penaltyStatusDetected: penaltyInfo.penaltyStatusDetected,
    penaltyWinner: penaltyInfo.penaltyWinner,
    homeGoals90: penaltyInfo.homeGoals90,
    awayGoals90: penaltyInfo.awayGoals90,
    homeElfmeterScored: penaltyInfo.homeElfmeterScored,
    awayElfmeterScored: penaltyInfo.awayElfmeterScored
  };
}

function calculateFinalGoals(match) {
  let finalHomeGoals = match.homeGoals;
  let finalAwayGoals = match.awayGoals;

  if (match.penaltyDecided && (match.homeElfmeterScored !== null || match.awayElfmeterScored !== null)) {
    const baseHome = match.homeGoals90 ?? match.homeGoals;
    const baseAway = match.awayGoals90 ?? match.awayGoals;

    if (baseHome !== null && match.homeElfmeterScored !== null) {
      finalHomeGoals = baseHome + match.homeElfmeterScored;
    }
    if (baseAway !== null && match.awayElfmeterScored !== null) {
      finalAwayGoals = baseAway + match.awayElfmeterScored;
    }
  }

  return {
    finalHomeGoals,
    finalAwayGoals
  };
}

async function enrichPenaltyDataFromEndpoint(match) {
  if (!match?.sourceMatchId) {
    return match;
  }

  const hasPenaltyGoals = match.homeElfmeterScored !== null || match.awayElfmeterScored !== null;
  const isFinishedDraw = Boolean(
    match.finished
    && match.homeGoals !== null
    && match.awayGoals !== null
    && match.homeGoals === match.awayGoals
  );
  const shouldFetchPenaltyDetails = !hasPenaltyGoals && (match.penaltyStatusDetected || isFinishedDraw);

  if (!shouldFetchPenaltyDetails) {
    return match;
  }

  try {
    const detailsPayload = await fetchFlashscoreMatchDetails(match.sourceMatchId);
    const penaltyInfo = extractPenaltyInfo(detailsPayload || {});
    const hasEndpointPenaltyGoals = penaltyInfo.homeElfmeterScored !== null || penaltyInfo.awayElfmeterScored !== null;
    if (!hasEndpointPenaltyGoals) {
      const penaltiesPayload = await fetchFlashscoreMatchPenalties(match.sourceMatchId);
      const endpointPenaltyInfo = extractPenaltyInfo(penaltiesPayload || {});

      if (endpointPenaltyInfo.homeElfmeterScored === null && endpointPenaltyInfo.awayElfmeterScored === null) {
        return match;
      }

      return {
        ...match,
        penaltyDecided: true,
        penaltyWinner: match.penaltyWinner ?? endpointPenaltyInfo.penaltyWinner ?? null,
        homeGoals90: match.homeGoals90 ?? endpointPenaltyInfo.homeGoals90 ?? match.homeGoals,
        awayGoals90: match.awayGoals90 ?? endpointPenaltyInfo.awayGoals90 ?? match.awayGoals,
        homeElfmeterScored: endpointPenaltyInfo.homeElfmeterScored,
        awayElfmeterScored: endpointPenaltyInfo.awayElfmeterScored
      };
    }

    return {
      ...match,
      penaltyDecided: true,
      penaltyWinner: match.penaltyWinner ?? penaltyInfo.penaltyWinner ?? null,
      homeGoals90: match.homeGoals90 ?? penaltyInfo.homeGoals90 ?? match.homeGoals,
      awayGoals90: match.awayGoals90 ?? penaltyInfo.awayGoals90 ?? match.awayGoals,
      homeElfmeterScored: penaltyInfo.homeElfmeterScored,
      awayElfmeterScored: penaltyInfo.awayElfmeterScored
    };
  } catch (error) {
    console.warn(`[PENALTIES] Konnte Elfmeterdaten fuer Match ${match.sourceMatchId} nicht laden:`, error?.message || error);
    return match;
  }
}

async function upsertMatch(pool, normalizedMatch) {
  const existing = await pool.query(
    'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
    [EXTERNAL_SOURCE, normalizedMatch.externalId]
  );

  const { finalHomeGoals, finalAwayGoals } = calculateFinalGoals(normalizedMatch);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE matches
       SET home_team = $1,
           away_team = $2,
           match_date = $3,
           round = $4,
           home_goals = $5,
           away_goals = $6,
           finished = $7,
           penalty_decided = $8,
           penalty_winner = $9,
           home_goals_90 = $10,
           away_goals_90 = $11,
           home_elfmeter_scored = $12,
           away_elfmeter_scored = $13,
           updated_at = NOW()
       WHERE external_source = $14 AND external_id = $15`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        normalizedMatch.round,
        finalHomeGoals,
        finalAwayGoals,
        normalizedMatch.finished,
        normalizedMatch.penaltyDecided ?? false,
        normalizedMatch.penaltyWinner ?? null,
        normalizedMatch.homeGoals90 ?? normalizedMatch.homeGoals,
        normalizedMatch.awayGoals90 ?? normalizedMatch.awayGoals,
        normalizedMatch.homeElfmeterScored ?? null,
        normalizedMatch.awayElfmeterScored ?? null,
        EXTERNAL_SOURCE,
        normalizedMatch.externalId
      ]
    );

    return 'updated';
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
      penalty_decided,
      penalty_winner,
      home_goals_90,
      away_goals_90,
      home_elfmeter_scored,
      away_elfmeter_scored,
      external_source,
      external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      normalizedMatch.homeTeam,
      normalizedMatch.awayTeam,
      normalizedMatch.matchDate,
      normalizedMatch.round,
      finalHomeGoals,
      finalAwayGoals,
      normalizedMatch.finished,
      normalizedMatch.penaltyDecided ?? false,
      normalizedMatch.penaltyWinner ?? null,
      normalizedMatch.homeGoals90 ?? normalizedMatch.homeGoals,
      normalizedMatch.awayGoals90 ?? normalizedMatch.awayGoals,
      normalizedMatch.homeElfmeterScored ?? null,
      normalizedMatch.awayElfmeterScored ?? null,
      EXTERNAL_SOURCE,
      normalizedMatch.externalId
    ]
  );

  return 'created';
}

async function importFlashscoreBundesligaMatches(pool, options = {}) {
  await ensurePenaltyColumnsSchema(pool);

  if (!isRapidApiConfigured()) {
    const error = new Error('RapidAPI ist nicht konfiguriert. Bitte RAPIDAPI_KEY und RAPIDAPI_HOST setzen.');
    error.statusCode = 400;
    throw error;
  }

  const tournamentUrl = options.tournamentUrl
    || process.env.FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL
    || DEFAULT_TOURNAMENT_URL;

  const fixturesPayload = await fetchFlashscoreTournamentFixtures(tournamentUrl, {
    useConfiguredIds: false
  });

  const rawMatches = toMatchList(fixturesPayload);
  if (!rawMatches.length) {
    const error = new Error(`Keine Bundesliga-Spiele von Flashscore erhalten (tournamentUrl=${tournamentUrl}).`);
    error.statusCode = 502;
    throw error;
  }

  const normalizedMatches = rawMatches
    .map((match) => toNormalizedMatch(match, 'Bundesliga'))
    .filter(Boolean);

  if (!normalizedMatches.length) {
    const sample = rawMatches.slice(0, 3).map((entry) => Object.keys(entry || {}));
    const error = new Error(`Flashscore hat Spiele geliefert, aber kein Match hatte ein verwertbares Format (ID/Team/Datum fehlend). Beispiel-Keys: ${JSON.stringify(sample)}`);
    error.statusCode = 502;
    throw error;
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const match of normalizedMatches) {
    const enrichedMatch = await enrichPenaltyDataFromEndpoint(match);
    const action = await upsertMatch(pool, enrichedMatch);
    if (action === 'created') {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  return {
    tournamentUrl,
    externalSource: EXTERNAL_SOURCE,
    totalFetched: rawMatches.length,
    totalProcessed: normalizedMatches.length,
    createdCount,
    updatedCount
  };
}

async function syncBundesligaResults(pool, options = {}) {
  await ensurePenaltyColumnsSchema(pool);

  if (!isRapidApiConfigured()) {
    const error = new Error('RapidAPI ist nicht konfiguriert. Bitte RAPIDAPI_KEY und RAPIDAPI_HOST setzen.');
    error.statusCode = 400;
    throw error;
  }

  const tournamentUrl = options.tournamentUrl
    || process.env.FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL
    || DEFAULT_TOURNAMENT_URL;

  // Use the results endpoint – it returns already-played matches with scores
  const fixturesPayload = await fetchFlashscoreTournamentResults(tournamentUrl, {
    useConfiguredIds: false
  });

  const rawMatches = toMatchList(fixturesPayload);

  if (!rawMatches.length) {
    return { updatedCount: 0, skippedCount: 0, totalFetched: 0, finishedFromApi: 0, tournamentUrl };
  }

  const finishedApiMatches = rawMatches
    .map((match) => toNormalizedMatch(match, 'Bundesliga'))
    .filter(Boolean)
    .filter((m) => m.finished && m.homeGoals !== null && m.awayGoals !== null);

  if (!finishedApiMatches.length) {
    return { updatedCount: 0, skippedCount: 0, totalFetched: rawMatches.length, finishedFromApi: 0, tournamentUrl };
  }

  // Load all Bundesliga DB matches so already finished rows can also be corrected
  const dbResult = await pool.query(
    `SELECT id, home_team, away_team, match_date, external_source, external_id
     FROM matches
     WHERE external_source = $1
     ORDER BY match_date ASC`,
    [EXTERNAL_SOURCE]
  );
  const dbMatches = dbResult.rows;

  let updatedCount = 0;
  let skippedCount = 0;

  for (const apiMatch of finishedApiMatches) {
    const enrichedApiMatch = await enrichPenaltyDataFromEndpoint(apiMatch);
    let dbMatch = null;

    // First: exact match by external_id
    if (enrichedApiMatch.externalId) {
      dbMatch = dbMatches.find(
        (m) => m.external_source === EXTERNAL_SOURCE && m.external_id === enrichedApiMatch.externalId
      );
    }

    // Fallback: fuzzy match by team names + date (±24 h)
    if (!dbMatch) {
      const apiTs = new Date(enrichedApiMatch.matchDate).getTime();

      dbMatch = dbMatches.find((m) => {
        const dbTs = new Date(m.match_date).getTime();
        const nameMatch = teamNamesMatch(m.home_team, enrichedApiMatch.homeTeam)
          && teamNamesMatch(m.away_team, enrichedApiMatch.awayTeam);
        return nameMatch && Math.abs(apiTs - dbTs) <= 24 * 60 * 60 * 1000;
      });
    }

    if (!dbMatch) {
      skippedCount += 1;
      continue;
    }

    const { finalHomeGoals, finalAwayGoals } = calculateFinalGoals(enrichedApiMatch);

    await pool.query(
      `UPDATE matches
       SET home_goals = $1,
           away_goals = $2,
           finished = true,
           penalty_decided = $3,
           penalty_winner = $4,
           home_goals_90 = $5,
           away_goals_90 = $6,
           home_elfmeter_scored = $7,
           away_elfmeter_scored = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [
        finalHomeGoals,
        finalAwayGoals,
        enrichedApiMatch.penaltyDecided ?? false,
        enrichedApiMatch.penaltyWinner ?? null,
        enrichedApiMatch.homeGoals90 ?? enrichedApiMatch.homeGoals,
        enrichedApiMatch.awayGoals90 ?? enrichedApiMatch.awayGoals,
        enrichedApiMatch.homeElfmeterScored ?? null,
        enrichedApiMatch.awayElfmeterScored ?? null,
        dbMatch.id
      ]
    );
    updatedCount += 1;
  }

  return {
    tournamentUrl,
    totalFetched: rawMatches.length,
    finishedFromApi: finishedApiMatches.length,
    updatedCount,
    skippedCount
  };
}

const WM_EXTERNAL_SOURCE = 'flashscore-wm';
const WM_FALLBACK_TOURNAMENT_URLS = [
  '/football/world/world-cup/',
  '/football/world/world-cup-2026/'
];

function normalizeTournamentUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Defensive: some deployments accidentally set
  // FLASHSCORE_TOURNAMENT_URL=FLASHSCORE_TOURNAMENT_URL=/football/world/world-cup/
  // as value.
  const withoutPrefix = raw.includes('=') ? raw.slice(raw.lastIndexOf('=') + 1).trim() : raw;
  if (!withoutPrefix) return null;

  const withLeadingSlash = withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function isRateLimitError(error) {
  const message = String(error?.message || '');
  return error?.statusCode === 429 || message.includes('429');
}

// Extracts a WM match from a raw Flashscore API object.
// Returns null if any required field is missing.
function extractWMMatch(raw) {
  const matchId = String(
    raw?.match_id || raw?.id || raw?.event_id || raw?.eventId || ''
  ).trim();
  if (!matchId) return null;

  const homeTeam = pickTeamName(raw, 'home');
  const awayTeam = pickTeamName(raw, 'away');
  if (!homeTeam || !awayTeam) return null;

  const matchDate = toTimestampDate(
    raw?.timestamp || raw?.start_timestamp || raw?.startTime || raw?.start_date || raw?.date
  );
  if (!matchDate) return null;

  const externalId = toExternalId(matchId);
  if (!externalId) return null;

  const finished = hasFinishedStatus(raw);
  const homeGoals = finished
    ? parseGoals(raw?.scores?.home ?? raw?.home_score ?? raw?.homeScore ?? raw?.result?.home)
    : null;
  const awayGoals = finished
    ? parseGoals(raw?.scores?.away ?? raw?.away_score ?? raw?.awayScore ?? raw?.result?.away)
    : null;

  const penaltyInfo = extractPenaltyInfo(raw);

  return {
    matchId,
    externalId,
    homeTeam,
    awayTeam,
    matchDate,
    homeGoals,
    awayGoals,
    finished,
    round: null,
    penaltyDecided: penaltyInfo.penaltyDecided,
    penaltyStatusDetected: penaltyInfo.penaltyStatusDetected,
    penaltyWinner: penaltyInfo.penaltyWinner,
    homeGoals90: penaltyInfo.homeGoals90,
    awayGoals90: penaltyInfo.awayGoals90,
    homeElfmeterScored: penaltyInfo.homeElfmeterScored,
    awayElfmeterScored: penaltyInfo.awayElfmeterScored
  };
}

// Maps a Flashscore tournament name like "World Cup - Round 1" to a German label.
function mapWMRoundName(tournamentName) {
  const s = String(tournamentName || '').toLowerCase().trim();
  if (!s) return null;

  const roundNum = s.match(/\bround\s*(\d+)\b/);
  if (roundNum) {
    const n = parseInt(roundNum[1], 10);
    if (n >= 1 && n <= 3) return `${n}. Spieltag`;
  }

  if (
    s.includes('round of 16')
    || s.includes('last 16')
    || s.includes('1/16')
    || s.includes('16th final')
    || s.includes('sixteenth final')
    || s.includes('eighth final')
  ) {
    return '16tel Finale';
  }
  if (s.includes('quarter-final') || s.includes('quarterfinal')) return 'Viertelfinale';
  if (s.includes('semi-final') || s.includes('semifinal')) return 'Halbfinale';
  if (s.includes('3rd place') || s.includes('third place')) return 'Spiel um Platz 3';
  if (s.endsWith('final') || s.includes(' final')) return 'Finale';

  return null;
}

// Fetches fixtures + results for a tournament URL, deduplicates by match_id.
async function fetchAllWMRawMatches(tournamentUrl) {
  const endpointDelayMsRaw = Number.parseInt(process.env.FLASHSCORE_IMPORT_ENDPOINT_DELAY_MS || '900', 10);
  const endpointDelayMs = Number.isFinite(endpointDelayMsRaw) && endpointDelayMsRaw >= 0 ? endpointDelayMsRaw : 900;

  let fixturesPayload = [];
  let resultsPayload = [];
  let fixturesRateLimited = false;
  let resultsRateLimited = false;
  let fixturesError = null;
  let resultsError = null;

  try {
    fixturesPayload = await fetchFlashscoreTournamentFixtures(tournamentUrl, { useConfiguredIds: false });
  } catch (error) {
    fixturesError = error;
    if (isRateLimitError(error)) {
      fixturesRateLimited = true;
      fixturesPayload = [];
    } else {
      throw error;
    }
  }

  if (endpointDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, endpointDelayMs));
  }

  try {
    resultsPayload = await fetchFlashscoreTournamentResults(tournamentUrl, { useConfiguredIds: false });
  } catch (error) {
    resultsError = error;
    if (isRateLimitError(error)) {
      resultsRateLimited = true;
      resultsPayload = [];
    } else {
      throw error;
    }
  }

  if (fixturesRateLimited && resultsRateLimited) {
    const msgA = String(fixturesError?.message || 'fixtures-call rate-limited');
    const msgB = String(resultsError?.message || 'results-call rate-limited');
    const err = new Error(`Flashscore-Aufrufe fehlgeschlagen fuer ${tournamentUrl}: ${msgA} | ${msgB}`);
    err.statusCode = 429;
    throw err;
  }

  const seen = new Set();
  const combined = [];
  for (const raw of [...toMatchList(fixturesPayload), ...toMatchList(resultsPayload)]) {
    const id = String(raw?.match_id || raw?.id || raw?.event_id || '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      combined.push(raw);
    }
  }
  return combined;
}

// Calls the match details endpoint for each match without a round label.
// Rate-limited via FLASHSCORE_WM_DETAILS_DELAY_MS (default 1200ms).
async function enrichWMRoundsViaDetails(matches) {
  const maxRequests = Math.max(1, parseInt(process.env.FLASHSCORE_WM_DETAILS_MAX_REQUESTS || '80', 10) || 80);
  const delayMs = Math.max(0, parseInt(process.env.FLASHSCORE_WM_DETAILS_DELAY_MS || '1200', 10) || 1200);

  const needsRound = matches.filter((m) => !m.round || isGenericRoundLabel(m.round)).slice(0, maxRequests);
  let resolved = 0;

  for (let i = 0; i < needsRound.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const details = await fetchFlashscoreMatchDetails(needsRound[i].matchId);
      const label = resolveRoundLabelFromDetails(details);
      if (label) {
        needsRound[i].round = label;
        resolved++;
      }
    } catch (err) {
      if (err?.statusCode === 429 || String(err?.message || '').includes('429')) break;
      // best-effort: continue on other errors
    }
  }

  return { requested: needsRound.length, resolved };
}

// Upserts a single WM match into the DB.
// Preserves an existing specific round label if the new round is null.
async function upsertWMMatch(pool, match) {
  const existing = await pool.query(
    'SELECT id, round FROM matches WHERE external_source = $1 AND external_id = $2',
    [WM_EXTERNAL_SOURCE, match.externalId]
  );

  const round = match.round || existing.rows[0]?.round || null;

  const { finalHomeGoals, finalAwayGoals } = calculateFinalGoals(match);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE matches
         SET home_team = $1, away_team = $2, match_date = $3, round = $4,
             home_goals = $5, away_goals = $6, finished = $7,
             penalty_decided = $8, penalty_winner = $9,
             home_goals_90 = $10, away_goals_90 = $11,
             home_elfmeter_scored = $12, away_elfmeter_scored = $13,
             updated_at = NOW()
       WHERE external_source = $14 AND external_id = $15`,
      [
        match.homeTeam, match.awayTeam, match.matchDate, round,
        finalHomeGoals, finalAwayGoals, match.finished,
        match.penaltyDecided ?? false, match.penaltyWinner ?? null,
        match.homeGoals90 ?? match.homeGoals, match.awayGoals90 ?? match.awayGoals,
        match.homeElfmeterScored ?? null, match.awayElfmeterScored ?? null,
        WM_EXTERNAL_SOURCE, match.externalId
      ]
    );
    return 'updated';
  }

  await pool.query(
    `INSERT INTO matches
       (home_team, away_team, match_date, round, home_goals, away_goals, finished,
        penalty_decided, penalty_winner, home_goals_90, away_goals_90,
        home_elfmeter_scored, away_elfmeter_scored,
        external_source, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      match.homeTeam, match.awayTeam, match.matchDate, round,
      finalHomeGoals, finalAwayGoals, match.finished,
      match.penaltyDecided ?? false, match.penaltyWinner ?? null,
      match.homeGoals90 ?? match.homeGoals, match.awayGoals90 ?? match.awayGoals,
      match.homeElfmeterScored ?? null, match.awayElfmeterScored ?? null,
      WM_EXTERNAL_SOURCE, match.externalId
    ]
  );
  return 'created';
}

async function importFlashscoreWMMatches(pool) {
  await ensurePenaltyColumnsSchema(pool);

  if (!isRapidApiConfigured()) {
    const err = new Error('RapidAPI ist nicht konfiguriert. Bitte RAPIDAPI_KEY und RAPIDAPI_HOST setzen.');
    err.statusCode = 400;
    throw err;
  }

  const configuredUrl = normalizeTournamentUrl(process.env.FLASHSCORE_TOURNAMENT_URL);
  const urlsToTry = [configuredUrl, ...WM_FALLBACK_TOURNAMENT_URLS.map(normalizeTournamentUrl)]
    .filter((u, i, arr) => u && arr.indexOf(u) === i);

  let rawMatches = [];
  let usedUrl = urlsToTry[0];
  let lastError = null;

  for (const url of urlsToTry) {
    try {
      const fetched = await fetchAllWMRawMatches(url);
      if (fetched.length > 0) {
        rawMatches = fetched;
        usedUrl = url;
        break;
      }
    } catch (err) {
      lastError = err;

      // Give RapidAPI a short cool-down before trying the next tournament URL.
      if (isRateLimitError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  if (!rawMatches.length) {
    const err = new Error(lastError?.message || `Keine WM-Spiele von Flashscore erhalten (URLs: ${urlsToTry.join(', ')})`);
    if (isRateLimitError(lastError)) {
      err.message = 'RapidAPI Rate-Limit erreicht. Bitte in 1-2 Minuten erneut versuchen.';
      err.statusCode = 429;
    } else {
      err.statusCode = lastError?.statusCode || 502;
    }
    throw err;
  }

  const matches = rawMatches.map(extractWMMatch).filter(Boolean);
  if (!matches.length) {
    const sampleKeys = rawMatches.slice(0, 2).map((r) => Object.keys(r || {}));
    const err = new Error(
      `API lieferte ${rawMatches.length} Eintraege, aber keiner hatte verwertbares Format. Beispiel-Keys: ${JSON.stringify(sampleKeys)}`
    );
    err.statusCode = 502;
    throw err;
  }

  const roundStats = await enrichWMRoundsViaDetails(matches);

  let createdCount = 0;
  let updatedCount = 0;
  for (const match of matches) {
    const enrichedMatch = await enrichPenaltyDataFromEndpoint(match);
    const action = await upsertWMMatch(pool, enrichedMatch);
    if (action === 'created') createdCount++;
    else updatedCount++;
  }

  return {
    tournamentUrl: usedUrl,
    externalSource: WM_EXTERNAL_SOURCE,
    totalFetched: rawMatches.length,
    totalProcessed: matches.length,
    createdCount,
    updatedCount,
    detailsRoundStats: roundStats
  };
}

async function syncWMResults(pool) {
  await ensurePenaltyColumnsSchema(pool);

  if (!isRapidApiConfigured()) {
    const err = new Error('RapidAPI ist nicht konfiguriert. Bitte RAPIDAPI_KEY und RAPIDAPI_HOST setzen.');
    err.statusCode = 400;
    throw err;
  }

  const configuredUrl = normalizeTournamentUrl(process.env.FLASHSCORE_TOURNAMENT_URL);
  const urlsToTry = [configuredUrl, ...WM_FALLBACK_TOURNAMENT_URLS.map(normalizeTournamentUrl)]
    .filter((u, i, arr) => u && arr.indexOf(u) === i);

  let rawMatches = [];
  let usedUrl = urlsToTry[0];
  let lastError = null;

  for (const url of urlsToTry) {
    try {
      const payload = await fetchFlashscoreTournamentResults(url, { useConfiguredIds: false });
      rawMatches = toMatchList(payload);
      usedUrl = url;
      if (rawMatches.length > 0) {
        break;
      }
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      throw err;
    }
  }

  if (!rawMatches.length) {
    if (isRateLimitError(lastError)) {
      const err = new Error('RapidAPI Rate-Limit erreicht. Bitte in 1-2 Minuten erneut versuchen.');
      err.statusCode = 429;
      throw err;
    }

    return {
      tournamentUrl: usedUrl,
      externalSource: WM_EXTERNAL_SOURCE,
      totalFetched: 0,
      finishedFromApi: 0,
      createdCount: 0,
      updatedCount: 0,
      emptyReason: 'no-results-yet'
    };
  }

  const finishedMatches = rawMatches
    .map(extractWMMatch)
    .filter(Boolean)
    .filter((m) => m.finished && m.homeGoals !== null && m.awayGoals !== null);

  if (!finishedMatches.length) {
    return {
      tournamentUrl: usedUrl,
      externalSource: WM_EXTERNAL_SOURCE,
      totalFetched: rawMatches.length,
      finishedFromApi: 0,
      createdCount: 0,
      updatedCount: 0
    };
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const match of finishedMatches) {
    const enrichedMatch = await enrichPenaltyDataFromEndpoint(match);
    const action = await upsertWMMatch(pool, enrichedMatch);
    if (action === 'created') createdCount++;
    else updatedCount++;
  }

  return {
    tournamentUrl: usedUrl,
    externalSource: WM_EXTERNAL_SOURCE,
    totalFetched: rawMatches.length,
    finishedFromApi: finishedMatches.length,
    createdCount,
    updatedCount
  };
}

module.exports = {
  ensurePenaltyColumnsSchema,
  importFlashscoreBundesligaMatches,
  importFlashscoreWMMatches,
  syncWMResults,
  syncBundesligaResults
};
