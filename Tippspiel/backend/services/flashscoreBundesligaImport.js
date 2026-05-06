const {
  fetchFlashscoreTournamentFixtures,
  fetchFlashscoreTournamentResults,
  fetchFlashscoreMatchDetails,
  isRapidApiConfigured
} = require('./rapidApi');

const DEFAULT_TOURNAMENT_URL = '/football/germany/bundesliga/';
const EXTERNAL_SOURCE = 'flashscore-bundesliga';

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
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
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

async function findSpecificExistingRound(pool, normalizedMatch) {
  const nearbyCandidates = await pool.query(
    `SELECT id, home_team, away_team, match_date, round, external_source, external_id
     FROM matches
     WHERE ABS(EXTRACT(EPOCH FROM (match_date - $1::timestamp))) <= 86400
     ORDER BY created_at ASC`,
    [normalizedMatch.matchDate]
  );

  const sameMatchCandidates = nearbyCandidates.rows.filter((row) => {
    const sameHome = teamNamesMatch(row.home_team, normalizedMatch.homeTeam);
    const sameAway = teamNamesMatch(row.away_team, normalizedMatch.awayTeam);
    return sameHome && sameAway;
  });

  const specificRoundCandidate = sameMatchCandidates.find((row) => !isGenericRoundLabel(row.round));

  return {
    sameMatchCandidates,
    specificRound: specificRoundCandidate?.round || null
  };
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

  return {
    homeTeam,
    awayTeam,
    matchDate,
    round: toRoundLabel(match, fallbackRound),
    finished,
    homeGoals: finished ? homeGoals : null,
    awayGoals: finished ? awayGoals : null,
    externalId,
    sourceMatchId
  };
}

function mapTournamentNameToRound(tournamentName) {
  const normalized = String(tournamentName || '').trim().toLowerCase();
  if (!normalized) return null;

  const roundMatch = normalized.match(/\bround\s*(\d+)\b/);
  if (roundMatch) {
    const roundNumber = Number.parseInt(roundMatch[1], 10);
    if (Number.isFinite(roundNumber) && roundNumber >= 1 && roundNumber <= 3) {
      return `${roundNumber}. Spieltag`;
    }
  }

  if (normalized.includes('round of 16') || normalized.includes('last 16')) {
    return 'Achtelfinale';
  }
  if (normalized.includes('quarter-final')) {
    return 'Viertelfinale';
  }
  if (normalized.includes('semi-final')) {
    return 'Halbfinale';
  }
  if (normalized.includes('3rd place') || normalized.includes('third place')) {
    return 'Spiel um Platz 3';
  }
  if (normalized.endsWith('final') || normalized.includes(' final')) {
    return 'Finale';
  }

  return null;
}

async function enrichWmRoundsFromDetails(matches) {
  const maxRequestsRaw = Number.parseInt(process.env.FLASHSCORE_WM_DETAILS_MAX_REQUESTS || '60', 10);
  const maxRequests = Number.isFinite(maxRequestsRaw) && maxRequestsRaw > 0 ? maxRequestsRaw : 60;

  const genericRoundMatches = matches.filter((match) => isGenericRoundLabel(match.round) && match.sourceMatchId);
  const bySourceMatchId = new Map();

  for (const match of genericRoundMatches) {
    if (!bySourceMatchId.has(match.sourceMatchId)) {
      bySourceMatchId.set(match.sourceMatchId, []);
    }
    bySourceMatchId.get(match.sourceMatchId).push(match);
  }

  const targetMatchIds = Array.from(bySourceMatchId.keys()).slice(0, maxRequests);
  let resolvedCount = 0;

  for (const sourceMatchId of targetMatchIds) {
    try {
      const details = await fetchFlashscoreMatchDetails(sourceMatchId);
      const roundLabel = mapTournamentNameToRound(details?.tournament?.name);
      if (!roundLabel) {
        continue;
      }

      const linkedMatches = bySourceMatchId.get(sourceMatchId) || [];
      linkedMatches.forEach((match) => {
        match.round = roundLabel;
        resolvedCount += 1;
      });
    } catch (error) {
      // Detail endpoint is best effort only.
    }
  }

  return {
    requested: targetMatchIds.length,
    resolvedCount,
    remainingGeneric: matches.filter((match) => isGenericRoundLabel(match.round)).length
  };
}

async function upsertMatch(pool, normalizedMatch) {
  const existing = await pool.query(
    'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
    [EXTERNAL_SOURCE, normalizedMatch.externalId]
  );

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
           updated_at = NOW()
       WHERE external_source = $8 AND external_id = $9`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        normalizedMatch.round,
        normalizedMatch.homeGoals,
        normalizedMatch.awayGoals,
        normalizedMatch.finished,
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
      external_source,
      external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      normalizedMatch.homeTeam,
      normalizedMatch.awayTeam,
      normalizedMatch.matchDate,
      normalizedMatch.round,
      normalizedMatch.homeGoals,
      normalizedMatch.awayGoals,
      normalizedMatch.finished,
      EXTERNAL_SOURCE,
      normalizedMatch.externalId
    ]
  );

  return 'created';
}

async function importFlashscoreBundesligaMatches(pool, options = {}) {
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
    const action = await upsertMatch(pool, match);
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

  // Load all unfinished DB matches to update
  const dbResult = await pool.query(
    `SELECT id, home_team, away_team, match_date, external_source, external_id
     FROM matches
     WHERE finished = false OR finished IS NULL
     ORDER BY match_date ASC`
  );
  const dbMatches = dbResult.rows;

  let updatedCount = 0;
  let skippedCount = 0;

  for (const apiMatch of finishedApiMatches) {
    let dbMatch = null;

    // First: exact match by external_id
    if (apiMatch.externalId) {
      dbMatch = dbMatches.find(
        (m) => m.external_source === EXTERNAL_SOURCE && m.external_id === apiMatch.externalId
      );
    }

    // Fallback: fuzzy match by team names + date (±24 h)
    if (!dbMatch) {
      const apiTs = new Date(apiMatch.matchDate).getTime();

      dbMatch = dbMatches.find((m) => {
        const dbTs = new Date(m.match_date).getTime();
        const nameMatch = teamNamesMatch(m.home_team, apiMatch.homeTeam)
          && teamNamesMatch(m.away_team, apiMatch.awayTeam);
        return nameMatch && Math.abs(apiTs - dbTs) <= 24 * 60 * 60 * 1000;
      });
    }

    if (!dbMatch) {
      skippedCount += 1;
      continue;
    }

    await pool.query(
      `UPDATE matches
       SET home_goals = $1,
           away_goals = $2,
           finished = true,
           updated_at = NOW()
       WHERE id = $3`,
      [apiMatch.homeGoals, apiMatch.awayGoals, dbMatch.id]
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
const DEFAULT_WM_TOURNAMENT_URL = '/football/world/world-cup-2026/';

async function upsertMatchWithSource(pool, normalizedMatch, externalSource) {
  const existing = await pool.query(
    'SELECT id, round FROM matches WHERE external_source = $1 AND external_id = $2',
    [externalSource, normalizedMatch.externalId]
  );

  const resolvedExistingRound = isGenericRoundLabel(normalizedMatch.round)
    ? ((existing.rows[0]?.round && !isGenericRoundLabel(existing.rows[0].round)) ? existing.rows[0].round : normalizedMatch.round)
    : normalizedMatch.round;

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
           updated_at = NOW()
       WHERE external_source = $8 AND external_id = $9`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        resolvedExistingRound,
        normalizedMatch.homeGoals,
        normalizedMatch.awayGoals,
        normalizedMatch.finished,
        externalSource,
        normalizedMatch.externalId
      ]
    );
    return 'updated';
  }

  const { sameMatchCandidates, specificRound } = await findSpecificExistingRound(pool, normalizedMatch);
  const resolvedRound = isGenericRoundLabel(normalizedMatch.round)
    ? (specificRound || normalizedMatch.round)
    : normalizedMatch.round;

  if (sameMatchCandidates.length > 0) {
    const targetMatch = sameMatchCandidates.find((row) => row.external_source !== externalSource) || sameMatchCandidates[0];

    await pool.query(
      `UPDATE matches
       SET home_team = $1,
           away_team = $2,
           match_date = $3,
           round = $4,
           home_goals = $5,
           away_goals = $6,
           finished = $7,
           external_source = $8,
           external_id = $9,
           updated_at = NOW()
       WHERE id = $10`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        resolvedRound,
        normalizedMatch.homeGoals,
        normalizedMatch.awayGoals,
        normalizedMatch.finished,
        externalSource,
        normalizedMatch.externalId,
        targetMatch.id
      ]
    );

    const duplicateIds = sameMatchCandidates
      .map((row) => row.id)
      .filter((id) => id !== targetMatch.id);

    for (const duplicateId of duplicateIds) {
      await pool.query(
        `INSERT INTO tips (user_id, match_id, home_goals, away_goals, created_at, updated_at)
         SELECT user_id, $2, home_goals, away_goals, created_at, updated_at
         FROM tips
         WHERE match_id = $1
         ON CONFLICT (user_id, match_id) DO NOTHING`,
        [duplicateId, targetMatch.id]
      );

      await pool.query('DELETE FROM tips WHERE match_id = $1', [duplicateId]);
      await pool.query('DELETE FROM matches WHERE id = $1', [duplicateId]);
    }

    return 'updated';
  }

  await pool.query(
    `INSERT INTO matches (
      home_team, away_team, match_date, round,
      home_goals, away_goals, finished, external_source, external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      normalizedMatch.homeTeam,
      normalizedMatch.awayTeam,
      normalizedMatch.matchDate,
      resolvedRound,
      normalizedMatch.homeGoals,
      normalizedMatch.awayGoals,
      normalizedMatch.finished,
      externalSource,
      normalizedMatch.externalId
    ]
  );
  return 'created';
}

function toNormalizedMatchWithRound(match, defaultRound) {
  const normalized = toNormalizedMatch(match, defaultRound);
  if (!normalized) return null;
  return normalized;
}

async function importFlashscoreWMMatches(pool, options = {}) {
  if (!isRapidApiConfigured()) {
    const error = new Error('RapidAPI ist nicht konfiguriert. Bitte RAPIDAPI_KEY und RAPIDAPI_HOST setzen.');
    error.statusCode = 400;
    throw error;
  }

  const requestedTournamentUrl = options.tournamentUrl || process.env.FLASHSCORE_TOURNAMENT_URL;
  const candidateTournamentUrls = [
    requestedTournamentUrl,
    '/football/world/world-cup/',
    '/football/world/world-cup-2026/'
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  const defaultRound = options.defaultRound || 'WM';
  let tournamentUrl = requestedTournamentUrl || DEFAULT_WM_TOURNAMENT_URL;
  let allRaw = [];
  let lastError = null;

  for (const candidateTournamentUrl of candidateTournamentUrls) {
    try {
      // useConfiguredIds: false -> Stage-ID wird immer dynamisch von der API geholt.
      // Damit werden auch Achtelfinale, Viertelfinale etc. importiert sobald sie
      // von Flashscore als aktive Stage zurueckgegeben werden.
      const [fixturesPayload, resultsPayload] = await Promise.all([
        fetchFlashscoreTournamentFixtures(candidateTournamentUrl, { useConfiguredIds: false }),
        fetchFlashscoreTournamentResults(candidateTournamentUrl, { useConfiguredIds: false })
      ]);

      const combinedRaw = [
        ...toMatchList(fixturesPayload),
        ...toMatchList(resultsPayload)
      ];

      if (combinedRaw.length > 0) {
        tournamentUrl = candidateTournamentUrl;
        allRaw = combinedRaw;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!allRaw.length) {
    const error = new Error(
      lastError?.message
      || `Keine WM-Spiele von Flashscore erhalten. Gepruefte tournamentUrl-Werte: ${candidateTournamentUrls.join(', ')}`
    );
    error.statusCode = lastError?.statusCode || 502;
    throw error;
  }

  // Deduplicate by externalId
  const seen = new Set();
  const normalizedMatches = allRaw
    .map((m) => toNormalizedMatchWithRound(m, defaultRound))
    .filter(Boolean)
    .filter((m) => {
      if (seen.has(m.externalId)) return false;
      seen.add(m.externalId);
      return true;
    });

  if (!normalizedMatches.length) {
    const error = new Error('Flashscore hat Spiele geliefert, aber kein Match hatte ein verwertbares Format.');
    error.statusCode = 502;
    throw error;
  }

  const detailsRoundStats = await enrichWmRoundsFromDetails(normalizedMatches);

  let createdCount = 0;
  let updatedCount = 0;

  for (const match of normalizedMatches) {
    const action = await upsertMatchWithSource(pool, match, WM_EXTERNAL_SOURCE);
    if (action === 'created') {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  return {
    tournamentUrl,
    externalSource: WM_EXTERNAL_SOURCE,
    totalFetched: allRaw.length,
    totalProcessed: normalizedMatches.length,
    createdCount,
    updatedCount,
    detailsRoundStats
  };
}

module.exports = {
  importFlashscoreBundesligaMatches,
  importFlashscoreWMMatches,
  syncBundesligaResults
};
