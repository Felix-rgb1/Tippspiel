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

  return {
    matchId,
    externalId,
    homeTeam,
    awayTeam,
    matchDate,
    homeGoals,
    awayGoals,
    finished,
    round: null
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

  if (s.includes('round of 16') || s.includes('last 16')) return 'Achtelfinale';
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

  const needsRound = matches.filter((m) => !m.round).slice(0, maxRequests);
  let resolved = 0;

  for (let i = 0; i < needsRound.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const details = await fetchFlashscoreMatchDetails(needsRound[i].matchId);
      const label = mapWMRoundName(details?.tournament?.name);
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

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE matches
         SET home_team = $1, away_team = $2, match_date = $3, round = $4,
             home_goals = $5, away_goals = $6, finished = $7, updated_at = NOW()
       WHERE external_source = $8 AND external_id = $9`,
      [
        match.homeTeam, match.awayTeam, match.matchDate, round,
        match.homeGoals, match.awayGoals, match.finished,
        WM_EXTERNAL_SOURCE, match.externalId
      ]
    );
    return 'updated';
  }

  await pool.query(
    `INSERT INTO matches
       (home_team, away_team, match_date, round, home_goals, away_goals, finished, external_source, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      match.homeTeam, match.awayTeam, match.matchDate, round,
      match.homeGoals, match.awayGoals, match.finished,
      WM_EXTERNAL_SOURCE, match.externalId
    ]
  );
  return 'created';
}

async function importFlashscoreWMMatches(pool) {
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
    const action = await upsertWMMatch(pool, match);
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
    const action = await upsertWMMatch(pool, match);
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
  importFlashscoreBundesligaMatches,
  importFlashscoreWMMatches,
  syncWMResults,
  syncBundesligaResults
};
