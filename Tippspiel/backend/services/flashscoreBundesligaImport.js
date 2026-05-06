const { fetchFlashscoreTournamentFixtures, isRapidApiConfigured } = require('./rapidApi');

const DEFAULT_TOURNAMENT_URL = '/football/germany/bundesliga/';
const EXTERNAL_SOURCE = 'flashscore-bundesliga';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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

function toRoundLabel(match) {
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

  return 'Bundesliga';
}

function toNormalizedMatch(match) {
  const externalId = toExternalId(
    match?.match_id
    || match?.id
    || match?.event_id
    || match?.eventId
  );

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
    round: toRoundLabel(match),
    finished,
    homeGoals: finished ? homeGoals : null,
    awayGoals: finished ? awayGoals : null,
    externalId
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
    .map(toNormalizedMatch)
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

  const fixturesPayload = await fetchFlashscoreTournamentFixtures(tournamentUrl, {
    useConfiguredIds: false
  });

  const rawMatches = toMatchList(fixturesPayload);

  if (!rawMatches.length) {
    return { updatedCount: 0, skippedCount: 0, totalFetched: 0, finishedFromApi: 0, tournamentUrl };
  }

  const finishedApiMatches = rawMatches
    .map(toNormalizedMatch)
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
      const homeNorm = normalizeName(apiMatch.homeTeam);
      const awayNorm = normalizeName(apiMatch.awayTeam);
      const apiTs = new Date(apiMatch.matchDate).getTime();

      dbMatch = dbMatches.find((m) => {
        const dbHome = normalizeName(m.home_team);
        const dbAway = normalizeName(m.away_team);
        const dbTs = new Date(m.match_date).getTime();
        const nameMatch = (
          (dbHome === homeNorm || dbHome.includes(homeNorm) || homeNorm.includes(dbHome)) &&
          (dbAway === awayNorm || dbAway.includes(awayNorm) || awayNorm.includes(dbAway))
        );
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

module.exports = {
  importFlashscoreBundesligaMatches,
  syncBundesligaResults
};
