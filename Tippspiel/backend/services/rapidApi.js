const fetch = require('node-fetch');
const pool = require('../db');

const RAPIDAPI_CACHE_TTL_MS = Number.parseInt(process.env.RAPIDAPI_CACHE_TTL_MS || '120000', 10);
const APIFOOTBALL_DAILY_MAX_REQUESTS = Number.parseInt(process.env.APIFOOTBALL_DAILY_MAX_REQUESTS || '80', 10);
const APIFOOTBALL_ENFORCE_DAILY_LIMIT = (process.env.APIFOOTBALL_ENFORCE_DAILY_LIMIT || 'true').toLowerCase() !== 'false';
const ODDS_API_BASE_URL = process.env.ODDS_API_BASE_URL || 'https://api.odds-api.io/v3';
const APIFOOTBALL_USAGE_PROVIDER_KEY = 'api-football';
const rapidApiCache = new Map();
let apiUsageTableReadyPromise = null;
let providerDailyLimitBlockedUntil = null;

const TEAM_NAME_SEARCH_ALIAS = {
  Deutschland: 'Germany',
  Argentinien: 'Argentina',
  Australien: 'Australia',
  Oesterreich: 'Austria',
  Belgien: 'Belgium',
  Bolivien: 'Bolivia',
  Brasilien: 'Brazil',
  Kanada: 'Canada',
  Chile: 'Chile',
  China: 'China',
  Elfenbeinkueste: 'Ivory Coast',
  Kamerun: 'Cameroon',
  Kolumbien: 'Colombia',
  Kroatien: 'Croatia',
  Daenemark: 'Denmark',
  Ecuador: 'Ecuador',
  Aegypten: 'Egypt',
  England: 'England',
  Spanien: 'Spain',
  Frankreich: 'France',
  Ghana: 'Ghana',
  Griechenland: 'Greece',
  Ungarn: 'Hungary',
  Iran: 'Iran',
  Irak: 'Iraq',
  Island: 'Iceland',
  Israel: 'Israel',
  Italien: 'Italy',
  Jamaika: 'Jamaica',
  Japan: 'Japan',
  Suedkorea: 'South Korea',
  'Saudi-Arabien': 'Saudi Arabia',
  Marokko: 'Morocco',
  Mexiko: 'Mexico',
  Niederlande: 'Netherlands',
  Nigeria: 'Nigeria',
  Norwegen: 'Norway',
  Neuseeland: 'New Zealand',
  Panama: 'Panama',
  Paraguay: 'Paraguay',
  Peru: 'Peru',
  Polen: 'Poland',
  Portugal: 'Portugal',
  Katar: 'Qatar',
  Rumaenien: 'Romania',
  Schottland: 'Scotland',
  Senegal: 'Senegal',
  Serbien: 'Serbia',
  Schweiz: 'Switzerland',
  Slowakei: 'Slovakia',
  Schweden: 'Sweden',
  Suedafrika: 'South Africa',
  Tschechien: 'Czech Republic',
  Tuerkei: 'Turkey',
  Tunesien: 'Tunisia',
  Ukraine: 'Ukraine',
  Uruguay: 'Uruguay',
  USA: 'United States',
  Venezuela: 'Venezuela',
  Wales: 'Wales',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Cape Verde Islands': 'Cape Verde',
  'Costa Rica': 'Costa Rica'
};

const TEAM_NAME_CANONICAL_MAP = {
  bosniaandherzegovina: 'bosniaherzegovina',
  bosniahercegovina: 'bosniaherzegovina',
  bosniaherzegovina: 'bosniaherzegovina',
  capeverde: 'capeverdeislands',
  capeverdeislands: 'capeverdeislands',
  czechia: 'czechrepublic',
  czechrepublic: 'czechrepublic',
  curacao: 'curacao',
  iriran: 'iran',
  unitedstates: 'unitedstates',
  usa: 'unitedstates'
};

function isRapidApiConfigured() {
  return Boolean((process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_HOST) || isApiSportsDirectMode() || isOddsApiMode());
}

function getProviderMode() {
  const mode = (process.env.RAPIDAPI_PROVIDER || '').trim().toLowerCase();
  if (mode === 'api-football-direct' || mode === 'direct') {
    return 'api-football-direct';
  }
  if (mode === 'odds-api' || mode === 'oddsapi') {
    return 'odds-api';
  }
  return 'rapidapi';
}

function isApiFootballHost() {
  return isApiSportsDirectMode() ||
    (process.env.RAPIDAPI_HOST || '').toLowerCase().includes('api-football');
}

function isSofascoreHost() {
  return (process.env.RAPIDAPI_HOST || '').toLowerCase().includes('sofascore');
}

function isFlashscoreHost() {
  return (process.env.RAPIDAPI_HOST || '').toLowerCase().includes('flashscore');
}

function isApiSportsDirectMode() {
  return getProviderMode() === 'api-football-direct' && Boolean(process.env.APIFOOTBALL_KEY);
}

function isOddsApiMode() {
  return getProviderMode() === 'odds-api' && Boolean(process.env.ODDS_API_KEY);
}

function shouldEnforceApiFootballDailyLimit() {
  return APIFOOTBALL_ENFORCE_DAILY_LIMIT && isApiFootballHost();
}

function getNextUtcDayStart(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function shouldShortCircuitOnProviderLimit(now = Date.now()) {
  return providerDailyLimitBlockedUntil instanceof Date && providerDailyLimitBlockedUntil.getTime() > now;
}

function markProviderDailyLimitReached(now = Date.now()) {
  providerDailyLimitBlockedUntil = getNextUtcDayStart(now);
}

function buildProviderDailyLimitError() {
  const err = new Error('API-FOOTBALL Provider-Tageslimit erreicht.');
  err.statusCode = 429;
  return err;
}

async function ensureApiUsageTable() {
  if (!apiUsageTableReadyPromise) {
    apiUsageTableReadyPromise = pool.query(
      `CREATE TABLE IF NOT EXISTS api_request_usage (
        provider TEXT NOT NULL,
        usage_date DATE NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (provider, usage_date)
      )`
    ).catch((error) => {
      apiUsageTableReadyPromise = null;
      throw error;
    });
  }

  await apiUsageTableReadyPromise;
}

async function registerApiFootballRequestUsage() {
  if (!shouldEnforceApiFootballDailyLimit() || !Number.isFinite(APIFOOTBALL_DAILY_MAX_REQUESTS) || APIFOOTBALL_DAILY_MAX_REQUESTS <= 0) {
    return;
  }

  await ensureApiUsageTable();

  const usageResult = await pool.query(
    `INSERT INTO api_request_usage (provider, usage_date, request_count, updated_at)
     VALUES ($1, CURRENT_DATE, 1, NOW())
     ON CONFLICT (provider, usage_date)
     DO UPDATE SET
       request_count = api_request_usage.request_count + 1,
       updated_at = NOW()
     WHERE api_request_usage.request_count < $2
     RETURNING request_count`,
    [APIFOOTBALL_USAGE_PROVIDER_KEY, APIFOOTBALL_DAILY_MAX_REQUESTS]
  );

  if (!usageResult.rows.length) {
    const err = new Error(`API-FOOTBALL Tageslimit erreicht (${APIFOOTBALL_DAILY_MAX_REQUESTS} Requests/Tag).`);
    err.statusCode = 429;
    throw err;
  }
}

function normalizeComparableName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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

function toDateOnly(matchDate) {
  const date = new Date(matchDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function isWithinDaysFromNow(matchDate, days) {
  const date = new Date(matchDate);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const diffMs = Math.abs(date.getTime() - Date.now());
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

function getApiFootballSeasonCandidates(matchDate) {
  const referenceDate = matchDate ? new Date(matchDate) : new Date();
  const referenceYear = Number.isNaN(referenceDate.getTime())
    ? new Date().getUTCFullYear()
    : referenceDate.getUTCFullYear();

  return [referenceYear - 1, referenceYear - 2, referenceYear];
}

function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace('%', '').replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toCanonicalTeamName(value) {
  const normalized = normalizeComparableName(value);
  return TEAM_NAME_CANONICAL_MAP[normalized] || normalized;
}

function normalizeTeamCandidates(teamName) {
  return [teamName, TEAM_NAME_SEARCH_ALIAS[teamName]]
    .filter(Boolean)
    .map((candidate) => toCanonicalTeamName(candidate));
}

function toLooseComparableTeamName(value) {
  return normalizeComparableName(value)
    .replace(/(women|ladies|u23|u21|u20|u19|u18)$/g, '')
    .replace(/(fc|sc|cf|afc)$/g, '');
}

function buildTeamMatchingData(teamName) {
  const baseCandidates = [teamName, TEAM_NAME_SEARCH_ALIAS[teamName]].filter(Boolean);
  const canonical = new Set(baseCandidates.map((name) => toCanonicalTeamName(name)));
  const loose = new Set(baseCandidates.map((name) => toLooseComparableTeamName(name)));

  return { canonical, loose };
}

function isLikelyTeamMatch(teamData, eventTeamName) {
  const eventCanonical = toCanonicalTeamName(eventTeamName);
  if (teamData.canonical.has(eventCanonical)) {
    return 2;
  }

  const eventLoose = toLooseComparableTeamName(eventTeamName);
  for (const candidate of teamData.loose) {
    if (candidate === eventLoose) {
      return 2;
    }

    if (candidate.length >= 6 && eventLoose.length >= 6 && (candidate.includes(eventLoose) || eventLoose.includes(candidate))) {
      return 1;
    }
  }

  return 0;
}

function listFlashscoreMatches(payload) {
  const entries = Array.isArray(payload) ? payload : [];
  if (entries.some((entry) => Array.isArray(entry?.matches))) {
    return entries.flatMap((entry) => Array.isArray(entry?.matches) ? entry.matches : []);
  }

  return entries;
}

function findBestFlashscoreMatch(tournaments, homeTeam, awayTeam, matchDate) {
  const homeMatchingData = buildTeamMatchingData(homeTeam);
  const awayMatchingData = buildTeamMatchingData(awayTeam);
  const matchDateTime = matchDate ? new Date(matchDate).getTime() : null;

  const candidates = listFlashscoreMatches(tournaments)
    .map((match) => {
      const directHomeScore = isLikelyTeamMatch(homeMatchingData, match?.home_team?.name);
      const directAwayScore = isLikelyTeamMatch(awayMatchingData, match?.away_team?.name);
      const swappedHomeScore = isLikelyTeamMatch(homeMatchingData, match?.away_team?.name);
      const swappedAwayScore = isLikelyTeamMatch(awayMatchingData, match?.home_team?.name);

      const directScore = directHomeScore + directAwayScore;
      const swappedScore = swappedHomeScore + swappedAwayScore;
      const score = Math.max(directScore, swappedScore);

      if (score < 2) {
        return null;
      }

      const eventTime = typeof match?.timestamp === 'number' ? match.timestamp * 1000 : Number.NaN;
      const timeDiff = Number.isFinite(matchDateTime) && Number.isFinite(eventTime)
        ? Math.abs(eventTime - matchDateTime)
        : Number.MAX_SAFE_INTEGER;

      return { match, score, timeDiff };
    })
    .filter(Boolean)
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }
      return first.timeDiff - second.timeDiff;
    });

  return candidates[0]?.match || null;
}

function toFlashscoreIsoDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function mapFlashscoreMatchToRecentMatch(match, teamId) {
  const homeId = match?.home_team?.team_id;
  const awayId = match?.away_team?.team_id;
  if (homeId !== teamId && awayId !== teamId) {
    return null;
  }

  const homeGoals = parseNumeric(match?.scores?.home);
  const awayGoals = parseNumeric(match?.scores?.away);
  if (homeGoals === null || awayGoals === null) {
    return null;
  }

  const isHomeTeam = homeId === teamId;
  const ownGoals = isHomeTeam ? homeGoals : awayGoals;
  const opponentGoals = isHomeTeam ? awayGoals : homeGoals;

  return {
    date: toFlashscoreIsoDate(match?.timestamp),
    opponent: isHomeTeam ? match?.away_team?.name : match?.home_team?.name,
    ownGoals,
    opponentGoals,
    outcome: getOutcome(ownGoals, opponentGoals, true)
  };
}

function mapFlashscoreMatchToHeadToHead(match) {
  const homeGoals = parseNumeric(match?.scores?.home);
  const awayGoals = parseNumeric(match?.scores?.away);
  if (homeGoals === null || awayGoals === null) {
    return null;
  }

  return {
    date: toFlashscoreIsoDate(match?.timestamp),
    homeTeam: match?.home_team?.name,
    awayTeam: match?.away_team?.name,
    score: `${homeGoals}:${awayGoals}`
  };
}

function dedupeFlashscoreMatches(matches) {
  const byId = new Map();

  matches.forEach((match) => {
    const matchId = match?.match_id || `${match?.timestamp || 'na'}:${match?.home_team?.team_id || 'na'}:${match?.away_team?.team_id || 'na'}`;
    if (matchId) {
      byId.set(matchId, match);
    }
  });

  return Array.from(byId.values());
}

function getConfiguredFlashscoreTournamentUrl() {
  return process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/';
}

async function fetchFlashscoreTournamentIds(tournamentUrl = getConfiguredFlashscoreTournamentUrl(), options = {}) {
  const useConfiguredIds = options.useConfiguredIds !== false;

  if (useConfiguredIds && process.env.FLASHSCORE_TOURNAMENT_ID && process.env.FLASHSCORE_TOURNAMENT_STAGE_ID && process.env.FLASHSCORE_TOURNAMENT_TEMPLATE_ID && process.env.FLASHSCORE_SEASON_ID) {
    return {
      tournament_id: process.env.FLASHSCORE_TOURNAMENT_ID,
      tournament_stage_id: process.env.FLASHSCORE_TOURNAMENT_STAGE_ID,
      tournament_template_id: process.env.FLASHSCORE_TOURNAMENT_TEMPLATE_ID,
      season_id: process.env.FLASHSCORE_SEASON_ID
    };
  }

  const payload = await rapidApiRequest('/api/flashscore/v2/tournaments/ids', {
    tournament_url: tournamentUrl
  });

  if (!payload?.tournament_id || !payload?.tournament_template_id || !payload?.season_id) {
    return null;
  }

  return payload;
}

async function fetchFlashscoreTournamentFixtures(tournamentUrl = getConfiguredFlashscoreTournamentUrl(), options = {}) {
  const ids = await fetchFlashscoreTournamentIds(tournamentUrl, options);
  if (!ids?.tournament_template_id || !ids?.season_id) {
    return [];
  }

  const payload = await rapidApiRequest('/api/flashscore/v2/tournaments/fixtures', {
    tournament_template_id: ids.tournament_template_id,
    season_id: ids.season_id
  });

  return Array.isArray(payload) ? payload : [];
}

async function findFlashscoreFixture(homeTeam, awayTeam, matchDate) {
  const fixtures = await fetchFlashscoreTournamentFixtures();
  if (!fixtures.length) {
    return null;
  }

  return findBestFlashscoreMatch(fixtures, homeTeam, awayTeam, matchDate);
}

async function fetchFlashscoreRawTeamResults(teamId) {
  const payload = await rapidApiRequest('/api/flashscore/v2/teams/results', {
    team_id: teamId
  });

  return dedupeFlashscoreMatches(listFlashscoreMatches(payload))
    .sort((first, second) => (second?.timestamp || 0) - (first?.timestamp || 0));
}

function buildFlashscoreHeadToHead(homeTeamId, awayTeamId, homeResults, awayResults, last = 5) {
  return dedupeFlashscoreMatches([...homeResults, ...awayResults])
    .filter((match) => {
      const ids = [match?.home_team?.team_id, match?.away_team?.team_id];
      return ids.includes(homeTeamId) && ids.includes(awayTeamId);
    })
    .sort((first, second) => (second?.timestamp || 0) - (first?.timestamp || 0))
    .map(mapFlashscoreMatchToHeadToHead)
    .filter(Boolean)
    .slice(0, last);
}

async function fetchFlashscoreProbabilities(homeTeam, awayTeam, matchDate) {
  const fixture = await findFlashscoreFixture(homeTeam, awayTeam, matchDate);
  if (fixture?.match_id) {
    const oddsPayload = await rapidApiRequest('/api/flashscore/v2/matches/odds', {
      match_id: fixture.match_id
    });

    const bookmaker = (Array.isArray(oddsPayload) ? oddsPayload : []).find((entry) => Array.isArray(entry?.odds) && entry.odds.length > 0);
    const market = bookmaker?.odds?.find((entry) => {
      return entry?.bettingType === 'HOME_DRAW_AWAY' && entry?.bettingScope === 'FULL_TIME' && Array.isArray(entry?.odds) && entry.odds.length >= 3;
    });

    if (market) {
      const homeOdd = market.odds.find((entry) => entry?.name === '1' || /home/i.test(String(entry?.name || '')))?.odd;
      const drawOdd = market.odds.find((entry) => entry?.name === 'X' || /draw/i.test(String(entry?.name || '')))?.odd;
      const awayOdd = market.odds.find((entry) => entry?.name === '2' || /away/i.test(String(entry?.name || '')))?.odd;
      const probabilities = normalizeFromDecimalOdds(homeOdd, drawOdd, awayOdd);

      if (probabilities) {
        return {
          ...probabilities,
          note: 'Wahrscheinlichkeiten von FlashScore Match Odds (1X2).'
        };
      }
    }
  }

  if (!isWithinDaysFromNow(matchDate, 7)) {
    return null;
  }

  const dateOnly = toDateOnly(matchDate);
  if (!dateOnly) {
    return null;
  }

  const payload = await rapidApiRequest('/api/flashscore/v2/matches/list-by-date', {
    sport_id: 1,
    date: dateOnly,
    timezone: process.env.FLASHSCORE_TIMEZONE || 'Europe/Berlin'
  });

  const match = findBestFlashscoreMatch(payload, homeTeam, awayTeam, matchDate);
  if (!match?.odds) {
    return null;
  }

  const probabilities = normalizeFromDecimalOdds(match.odds['1'], match.odds.X, match.odds['2']);
  if (!probabilities) {
    return null;
  }

  return {
    ...probabilities,
    note: 'Wahrscheinlichkeiten von FlashScore Odds (1X2).'
  };
}

function normalizePercent(value) {
  const numeric = parseNumeric(value);
  if (numeric === null) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return Math.round(numeric * 100);
  }

  if (numeric >= 0 && numeric <= 100) {
    return Math.round(numeric);
  }

  return null;
}

function normalizeFromDecimalOdds(homeOdds, drawOdds, awayOdds) {
  const h = parseNumeric(homeOdds);
  const d = parseNumeric(drawOdds);
  const a = parseNumeric(awayOdds);

  if (!h || !d || !a || h <= 1 || d <= 1 || a <= 1) {
    return null;
  }

  const invHome = 1 / h;
  const invDraw = 1 / d;
  const invAway = 1 / a;
  const sum = invHome + invDraw + invAway;

  if (!sum) {
    return null;
  }

  const home = Math.round((invHome / sum) * 100);
  const draw = Math.round((invDraw / sum) * 100);
  const away = Math.max(0, 100 - home - draw);

  return { homeWin: home, draw, awayWin: away };
}

function tryExtractProbabilities(payload) {
  // Shape 0: API-FOOTBALL prediction percentages
  const apiFootballPrediction = payload?.response?.[0]?.predictions;
  if (apiFootballPrediction?.percent) {
    const home = normalizePercent(apiFootballPrediction.percent.home);
    const draw = normalizePercent(apiFootballPrediction.percent.draw);
    const away = normalizePercent(apiFootballPrediction.percent.away);

    if (home !== null && draw !== null && away !== null) {
      return { homeWin: home, draw, awayWin: away };
    }
  }

  // Shape 1: explicit percentages
  if (payload && payload.probabilities) {
    const home = normalizePercent(payload.probabilities.home ?? payload.probabilities.homeWin);
    const draw = normalizePercent(payload.probabilities.draw ?? payload.probabilities.tie);
    const away = normalizePercent(payload.probabilities.away ?? payload.probabilities.awayWin);

    if (home !== null && draw !== null && away !== null) {
      return { homeWin: home, draw, awayWin: away };
    }
  }

  // Shape 2: top-level fields
  if (payload) {
    const home = normalizePercent(payload.homeWinProbability ?? payload.homeWin);
    const draw = normalizePercent(payload.drawProbability ?? payload.draw);
    const away = normalizePercent(payload.awayWinProbability ?? payload.awayWin);

    if (home !== null && draw !== null && away !== null) {
      return { homeWin: home, draw, awayWin: away };
    }
  }

  // Shape 3: odds fields
  if (payload && payload.odds) {
    const normalized = normalizeFromDecimalOdds(
      payload.odds.home ?? payload.odds.homeWin,
      payload.odds.draw,
      payload.odds.away ?? payload.odds.awayWin
    );
    if (normalized) {
      return normalized;
    }
  }

  // Shape 4: nested under data[0]
  if (payload?.data?.length) {
    const first = payload.data[0];
    const nestedTry = tryExtractProbabilities(first);
    if (nestedTry) {
      return nestedTry;
    }

    if (first?.bookmakers?.length) {
      const firstBookmaker = first.bookmakers[0];
      const firstBet = firstBookmaker?.bets?.[0];
      if (firstBet?.values?.length >= 3) {
        // Expected labels: Home/Draw/Away with decimal odds in "odd".
        const homeOdd = firstBet.values.find((entry) => /home|1/i.test(entry.value))?.odd;
        const drawOdd = firstBet.values.find((entry) => /draw|x/i.test(entry.value))?.odd;
        const awayOdd = firstBet.values.find((entry) => /away|2/i.test(entry.value))?.odd;
        const normalized = normalizeFromDecimalOdds(homeOdd, drawOdd, awayOdd);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  // Shape 5: odds-api.io bookmaker markets
  if (payload?.bookmakers && typeof payload.bookmakers === 'object') {
    const bookmakerEntries = Object.values(payload.bookmakers)
      .filter(Array.isArray)
      .flat();

    const market = bookmakerEntries.find((entry) => {
      const marketName = String(entry?.name || '').toUpperCase();
      return marketName === 'ML' || marketName === '1X2' || marketName === 'MATCH_WINNER';
    });

    const firstOdds = market?.odds?.[0];
    if (firstOdds) {
      const normalized = normalizeFromDecimalOdds(firstOdds.home, firstOdds.draw, firstOdds.away);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

async function rapidApiRequest(path, queryParams = {}) {
  if (!isRapidApiConfigured()) {
    const err = new Error('RapidAPI ist nicht konfiguriert');
    err.statusCode = 400;
    throw err;
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = (isApiSportsDirectMode() || isOddsApiMode())
    ? (safePath.replace(/^\/v3(?=\/|$)/, '') || '/')
    : safePath;
  const baseUrl = isApiSportsDirectMode()
    ? (process.env.APIFOOTBALL_BASE_URL || 'https://v3.football.api-sports.io')
    : isOddsApiMode()
      ? ODDS_API_BASE_URL
    : `https://${process.env.RAPIDAPI_HOST}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  if (isOddsApiMode() && !url.searchParams.has('apiKey')) {
    url.searchParams.set('apiKey', process.env.ODDS_API_KEY);
  }

  const cacheKey = url.toString();
  const cached = rapidApiCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  if (shouldShortCircuitOnProviderLimit(now) && isApiFootballHost()) {
    throw buildProviderDailyLimitError();
  }

  await registerApiFootballRequestUsage();

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: isApiSportsDirectMode()
      ? {
        'x-apisports-key': process.env.APIFOOTBALL_KEY
      }
      : isOddsApiMode()
        ? {}
      : {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
      }
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (isJson && isApiFootballHost()) {
    const providerErrors = payload?.errors;
    const providerErrorText = typeof providerErrors?.requests === 'string'
      ? providerErrors.requests
      : '';
    if (providerErrorText.toLowerCase().includes('request limit for the day')) {
      markProviderDailyLimitReached(now);
      throw buildProviderDailyLimitError();
    }
  }

  if (!response.ok) {
    if (response.status === 429 && cached?.payload) {
      return cached.payload;
    }

    const err = new Error(`RapidAPI Fehler: ${response.status}`);
    err.statusCode = 502;
    err.details = payload;
    throw err;
  }

  rapidApiCache.set(cacheKey, {
    payload,
    expiresAt: now + RAPIDAPI_CACHE_TTL_MS
  });

  return payload;
}

async function findApiFootballTeamId(teamName) {
  const candidates = [teamName, TEAM_NAME_SEARCH_ALIAS[teamName]].filter(Boolean);

  for (const candidate of candidates) {
    const payload = await rapidApiRequest('/v3/teams', { search: candidate });
    const responseTeams = payload?.response || [];

    if (!responseTeams.length) {
      continue;
    }

    const normalizedTarget = normalizeComparableName(candidate);
    const nationalTeams = responseTeams.filter((entry) => entry?.team?.national === true);
    const exactNationalNameMatch = nationalTeams.find((entry) => {
      const name = normalizeComparableName(entry?.team?.name);
      return name === normalizedTarget;
    });

    if (exactNationalNameMatch?.team?.id) {
      return exactNationalNameMatch.team.id;
    }

    const exactNationalCountryMatch = nationalTeams.find((entry) => {
      const country = normalizeComparableName(entry?.team?.country);
      return country === normalizedTarget;
    });

    if (exactNationalCountryMatch?.team?.id) {
      return exactNationalCountryMatch.team.id;
    }

    const exactMatch = responseTeams.find((entry) => {
      const name = normalizeComparableName(entry?.team?.name);
      return name === normalizedTarget;
    });

    if (exactMatch?.team?.id) {
      return exactMatch.team.id;
    }

    if (nationalTeams.length === 1 && nationalTeams[0]?.team?.id) {
      return nationalTeams[0].team.id;
    }
  }

  return null;
}

function findFixtureIdInList(fixtures, homeTeamId, awayTeamId) {
  const directMatch = fixtures.find((entry) => {
    const homeId = entry?.teams?.home?.id;
    const awayId = entry?.teams?.away?.id;
    return homeId === homeTeamId && awayId === awayTeamId;
  });

  if (directMatch?.fixture?.id) {
    return directMatch.fixture.id;
  }

  const swappedMatch = fixtures.find((entry) => {
    const homeId = entry?.teams?.home?.id;
    const awayId = entry?.teams?.away?.id;
    return homeId === awayTeamId && awayId === homeTeamId;
  });

  return swappedMatch?.fixture?.id || null;
}

function mapFixtureToRecentMatch(entry, teamId) {
  const homeId = entry?.teams?.home?.id;
  const isHomeTeam = homeId === teamId;
  const ownGoals = isHomeTeam ? entry?.goals?.home : entry?.goals?.away;
  const opponentGoals = isHomeTeam ? entry?.goals?.away : entry?.goals?.home;

  if (ownGoals === null || ownGoals === undefined || opponentGoals === null || opponentGoals === undefined) {
    return null;
  }

  return {
    date: entry?.fixture?.date,
    opponent: isHomeTeam ? entry?.teams?.away?.name : entry?.teams?.home?.name,
    ownGoals,
    opponentGoals,
    outcome: getOutcome(ownGoals, opponentGoals, true)
  };
}

function mapFixtureToHeadToHead(entry) {
  const homeGoals = entry?.goals?.home;
  const awayGoals = entry?.goals?.away;

  if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) {
    return null;
  }

  return {
    date: entry?.fixture?.date,
    homeTeam: entry?.teams?.home?.name,
    awayTeam: entry?.teams?.away?.name,
    score: `${homeGoals}:${awayGoals}`
  };
}

function normalizeSofascoreTeamResult(result) {
  const entity = result?.entity;
  if (!entity || entity?.sport?.slug !== 'football') {
    return null;
  }

  if (typeof entity.id !== 'number') {
    return null;
  }

  if (typeof entity.national !== 'boolean') {
    return null;
  }

  return {
    id: entity.id,
    name: entity.name,
    country: entity?.country?.name || null
  };
}

function getSofascoreScoreValue(scoreObject) {
  if (!scoreObject || typeof scoreObject !== 'object') {
    return null;
  }

  const direct = parseNumeric(scoreObject.current);
  if (direct !== null) {
    return direct;
  }

  const display = parseNumeric(scoreObject.display);
  if (display !== null) {
    return display;
  }

  return null;
}

function mapSofascoreEventToRecentMatch(event, teamId) {
  const homeId = event?.homeTeam?.id;
  const awayId = event?.awayTeam?.id;
  if (homeId !== teamId && awayId !== teamId) {
    return null;
  }

  const isHomeTeam = homeId === teamId;
  const homeGoals = getSofascoreScoreValue(event?.homeScore);
  const awayGoals = getSofascoreScoreValue(event?.awayScore);
  if (homeGoals === null || awayGoals === null) {
    return null;
  }

  const ownGoals = isHomeTeam ? homeGoals : awayGoals;
  const opponentGoals = isHomeTeam ? awayGoals : homeGoals;

  return {
    date: event?.startTimestamp ? new Date(event.startTimestamp * 1000).toISOString() : null,
    opponent: isHomeTeam ? event?.awayTeam?.name : event?.homeTeam?.name,
    ownGoals,
    opponentGoals,
    outcome: getOutcome(ownGoals, opponentGoals, true)
  };
}

function mapSofascoreEventToHeadToHead(event) {
  const homeGoals = getSofascoreScoreValue(event?.homeScore);
  const awayGoals = getSofascoreScoreValue(event?.awayScore);
  if (homeGoals === null || awayGoals === null) {
    return null;
  }

  return {
    date: event?.startTimestamp ? new Date(event.startTimestamp * 1000).toISOString() : null,
    homeTeam: event?.homeTeam?.name,
    awayTeam: event?.awayTeam?.name,
    score: `${homeGoals}:${awayGoals}`
  };
}

function buildTeamSearchCandidates(teamName) {
  return [teamName, TEAM_NAME_SEARCH_ALIAS[teamName]].filter(Boolean);
}

async function findSofascoreTeam(teamName) {
  const candidates = buildTeamSearchCandidates(teamName);

  for (const candidate of candidates) {
    const payload = await rapidApiRequest('/search', {
      q: candidate,
      type: 'all',
      page: 0
    });

    const normalizedTarget = normalizeComparableName(candidate);
    const teams = (payload?.results || [])
      .map(normalizeSofascoreTeamResult)
      .filter(Boolean);

    if (!teams.length) {
      continue;
    }

    const exactMatch = teams.find((entry) => {
      const name = normalizeComparableName(entry.name);
      const country = normalizeComparableName(entry.country || '');
      return name === normalizedTarget || country === normalizedTarget;
    });

    if (exactMatch) {
      return exactMatch;
    }

    return teams[0];
  }

  return null;
}

async function fetchSofascoreRawLastMatches(teamId) {
  const payload = await rapidApiRequest('/teams/get-last-matches', {
    teamId,
    pageIndex: 0
  });

  return payload?.events || [];
}

async function fetchSofascoreRecentMatchesForTeam(teamName, last = 5) {
  const team = await findSofascoreTeam(teamName);
  if (!team?.id) {
    return [];
  }

  const events = await fetchSofascoreRawLastMatches(team.id);
  return events
    .map((event) => mapSofascoreEventToRecentMatch(event, team.id))
    .filter(Boolean)
    .slice(0, last);
}

async function fetchSofascoreHeadToHead(homeTeam, awayTeam, last = 5) {
  const home = await findSofascoreTeam(homeTeam);
  const away = await findSofascoreTeam(awayTeam);
  if (!home?.id || !away?.id) {
    return [];
  }

  const [homeEvents, awayEvents] = await Promise.all([
    fetchSofascoreRawLastMatches(home.id),
    fetchSofascoreRawLastMatches(away.id)
  ]);

  const allEventsById = new Map();
  [...homeEvents, ...awayEvents].forEach((event) => {
    if (event?.id) {
      allEventsById.set(event.id, event);
    }
  });

  const h2hEvents = Array.from(allEventsById.values())
    .filter((event) => {
      const ids = [event?.homeTeam?.id, event?.awayTeam?.id];
      return ids.includes(home.id) && ids.includes(away.id);
    })
    .sort((first, second) => (second?.startTimestamp || 0) - (first?.startTimestamp || 0));

  return h2hEvents
    .map(mapSofascoreEventToHeadToHead)
    .filter(Boolean)
    .slice(0, last);
}

function buildSofascoreHeadToHeadFromEvents(homeTeamId, awayTeamId, homeEvents, awayEvents, last = 5) {
  const allEventsById = new Map();
  [...homeEvents, ...awayEvents].forEach((event) => {
    if (event?.id) {
      allEventsById.set(event.id, event);
    }
  });

  return Array.from(allEventsById.values())
    .filter((event) => {
      const ids = [event?.homeTeam?.id, event?.awayTeam?.id];
      return ids.includes(homeTeamId) && ids.includes(awayTeamId);
    })
    .sort((first, second) => (second?.startTimestamp || 0) - (first?.startTimestamp || 0))
    .map(mapSofascoreEventToHeadToHead)
    .filter(Boolean)
    .slice(0, last);
}

async function findApiFootballFixtureId(homeTeamId, awayTeamId, matchDate) {
  const dateOnly = toDateOnly(matchDate);
  if (!dateOnly) {
    return null;
  }

  const homePayload = await rapidApiRequest('/v3/fixtures', {
    date: dateOnly,
    team: homeTeamId
  });
  const homeFixtures = homePayload?.response || [];
  const directFromHomeQuery = findFixtureIdInList(homeFixtures, homeTeamId, awayTeamId);
  if (directFromHomeQuery) {
    return directFromHomeQuery;
  }

  const awayPayload = await rapidApiRequest('/v3/fixtures', {
    date: dateOnly,
    team: awayTeamId
  });
  const awayFixtures = awayPayload?.response || [];
  return findFixtureIdInList(awayFixtures, homeTeamId, awayTeamId);
}

async function fetchApiFootballProbabilities(homeTeam, awayTeam, matchDate) {
  const homeTeamId = await findApiFootballTeamId(homeTeam);
  const awayTeamId = await findApiFootballTeamId(awayTeam);

  if (!homeTeamId || !awayTeamId) {
    return null;
  }

  const fixtureId = await findApiFootballFixtureId(homeTeamId, awayTeamId, matchDate);
  if (!fixtureId) {
    return null;
  }

  const predictionPath = process.env.RAPIDAPI_ODDS_PATH || '/v3/predictions';
  const payload = await rapidApiRequest(predictionPath, { fixture: fixtureId });
  const probabilities = tryExtractProbabilities(payload);

  if (!probabilities) {
    return null;
  }

  return {
    ...probabilities,
    note: 'Wahrscheinlichkeiten von API-FOOTBALL (RapidAPI Predictions).'
  };
}

async function fetchApiFootballRecentMatchesForTeam(teamName, last = 5, matchDate) {
  const teamId = await findApiFootballTeamId(teamName);

  return fetchApiFootballRecentMatchesForTeamId(teamId, last, matchDate);
}

async function fetchApiFootballRecentMatchesForTeamId(teamId, last = 5, matchDate) {
  if (!teamId) {
    return [];
  }

  const fixturesById = new Map();

  for (const season of getApiFootballSeasonCandidates(matchDate)) {
    const payload = await rapidApiRequest('/v3/fixtures', {
      team: teamId,
      season,
      status: 'FT'
    });

    const fixtures = payload?.response || [];
    fixtures.forEach((entry) => {
      const fixtureId = entry?.fixture?.id;
      if (fixtureId) {
        fixturesById.set(fixtureId, entry);
      }
    });

    if (fixturesById.size >= last) {
      break;
    }
  }

  return Array.from(fixturesById.values())
    .sort((first, second) => new Date(second?.fixture?.date || 0) - new Date(first?.fixture?.date || 0))
    .map((entry) => mapFixtureToRecentMatch(entry, teamId))
    .filter(Boolean)
    .slice(0, last);
}

async function fetchApiFootballHeadToHead(homeTeam, awayTeam, last = 5) {
  const homeTeamId = await findApiFootballTeamId(homeTeam);
  const awayTeamId = await findApiFootballTeamId(awayTeam);

  return fetchApiFootballHeadToHeadByTeamIds(homeTeamId, awayTeamId, last);
}

async function fetchApiFootballHeadToHeadByTeamIds(homeTeamId, awayTeamId, last = 5) {

  if (!homeTeamId || !awayTeamId) {
    return [];
  }

  const payload = await rapidApiRequest('/v3/fixtures/headtohead', {
    h2h: `${homeTeamId}-${awayTeamId}`,
    status: 'FT'
  });

  const fixtures = payload?.response || [];
  return fixtures
    .map(mapFixtureToHeadToHead)
    .filter(Boolean)
    .slice(0, last);
}

async function fetchRapidApiMatchInsights(homeTeam, awayTeam, matchDate) {
  if (isApiFootballHost()) {
    const [homeTeamId, awayTeamId] = await Promise.all([
      findApiFootballTeamId(homeTeam),
      findApiFootballTeamId(awayTeam)
    ]);

    const [homeRecentMatchesResult, awayRecentMatchesResult, headToHeadResult] = await Promise.allSettled([
      fetchApiFootballRecentMatchesForTeamId(homeTeamId, 5, matchDate),
      fetchApiFootballRecentMatchesForTeamId(awayTeamId, 5, matchDate),
      fetchApiFootballHeadToHeadByTeamIds(homeTeamId, awayTeamId, 5)
    ]);

    const homeRecentMatches = homeRecentMatchesResult.status === 'fulfilled'
      ? homeRecentMatchesResult.value
      : [];
    const awayRecentMatches = awayRecentMatchesResult.status === 'fulfilled'
      ? awayRecentMatchesResult.value
      : [];
    const headToHead = headToHeadResult.status === 'fulfilled'
      ? headToHeadResult.value
      : [];

    return { homeRecentMatches, awayRecentMatches, headToHead };
  }

  if (isFlashscoreHost()) {
    const fixture = await findFlashscoreFixture(homeTeam, awayTeam, matchDate);
    const homeTeamId = fixture?.home_team?.team_id;
    const awayTeamId = fixture?.away_team?.team_id;

    if (!homeTeamId || !awayTeamId) {
      return {
        homeRecentMatches: [],
        awayRecentMatches: [],
        headToHead: []
      };
    }

    const [homeResultsResult, awayResultsResult] = await Promise.allSettled([
      fetchFlashscoreRawTeamResults(homeTeamId),
      fetchFlashscoreRawTeamResults(awayTeamId)
    ]);

    const homeResults = homeResultsResult.status === 'fulfilled' ? homeResultsResult.value : [];
    const awayResults = awayResultsResult.status === 'fulfilled' ? awayResultsResult.value : [];

    const homeRecentMatches = homeResults
      .map((entry) => mapFlashscoreMatchToRecentMatch(entry, homeTeamId))
      .filter(Boolean)
      .slice(0, 5);

    const awayRecentMatches = awayResults
      .map((entry) => mapFlashscoreMatchToRecentMatch(entry, awayTeamId))
      .filter(Boolean)
      .slice(0, 5);

    const headToHead = buildFlashscoreHeadToHead(homeTeamId, awayTeamId, homeResults, awayResults, 5);

    return { homeRecentMatches, awayRecentMatches, headToHead };
  }

  if (isSofascoreHost()) {
    const home = await findSofascoreTeam(homeTeam);
    const away = await findSofascoreTeam(awayTeam);

    if (!home?.id || !away?.id) {
      return {
        homeRecentMatches: [],
        awayRecentMatches: [],
        headToHead: []
      };
    }

    const [homeEventsResult, awayEventsResult] = await Promise.allSettled([
      fetchSofascoreRawLastMatches(home.id),
      fetchSofascoreRawLastMatches(away.id)
    ]);

    const homeEvents = homeEventsResult.status === 'fulfilled' ? homeEventsResult.value : [];
    const awayEvents = awayEventsResult.status === 'fulfilled' ? awayEventsResult.value : [];

    const homeRecentMatches = homeEvents
      .map((event) => mapSofascoreEventToRecentMatch(event, home.id))
      .filter(Boolean)
      .slice(0, 5);

    const awayRecentMatches = awayEvents
      .map((event) => mapSofascoreEventToRecentMatch(event, away.id))
      .filter(Boolean)
      .slice(0, 5);

    const headToHead = buildSofascoreHeadToHeadFromEvents(home.id, away.id, homeEvents, awayEvents, 5);

    return { homeRecentMatches, awayRecentMatches, headToHead };
  }

  return {
    homeRecentMatches: [],
    awayRecentMatches: [],
    headToHead: []
  };
}

async function fetchRapidApiProbabilities(homeTeam, awayTeam, matchDate) {
  if (isApiFootballHost()) {
    return fetchApiFootballProbabilities(homeTeam, awayTeam, matchDate);
  }

  if (isFlashscoreHost()) {
    return fetchFlashscoreProbabilities(homeTeam, awayTeam, matchDate);
  }

  if (isOddsApiMode()) {
    const sport = process.env.ODDS_API_SPORT || 'football';
    const bookmakers = process.env.ODDS_API_BOOKMAKERS || 'Bet365';
    const eventsPath = process.env.ODDS_API_EVENTS_PATH || '/events';
    const oddsPath = process.env.ODDS_API_ODDS_PATH || '/odds';

    const eventsPayload = await rapidApiRequest(eventsPath, { sport });
    const events = Array.isArray(eventsPayload)
      ? eventsPayload
      : (eventsPayload?.response || []);

    if (!events.length) {
      return null;
    }

    const homeMatchingData = buildTeamMatchingData(homeTeam);
    const awayMatchingData = buildTeamMatchingData(awayTeam);
    const matchDateTime = matchDate ? new Date(matchDate).getTime() : null;

    const candidates = events
      .map((event) => {
        const directHomeScore = isLikelyTeamMatch(homeMatchingData, event?.home);
        const directAwayScore = isLikelyTeamMatch(awayMatchingData, event?.away);
        const swappedHomeScore = isLikelyTeamMatch(homeMatchingData, event?.away);
        const swappedAwayScore = isLikelyTeamMatch(awayMatchingData, event?.home);

        const directScore = directHomeScore + directAwayScore;
        const swappedScore = swappedHomeScore + swappedAwayScore;
        const score = Math.max(directScore, swappedScore);

        if (score < 2) {
          return null;
        }

        const eventTime = new Date(event?.date || 0).getTime();
        const timeDiff = Number.isFinite(matchDateTime) ? Math.abs(eventTime - matchDateTime) : Number.MAX_SAFE_INTEGER;
        return { event, timeDiff, score };
      })
      .filter(Boolean)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }
        return first.timeDiff - second.timeDiff;
      });

    const selectedEvent = candidates[0]?.event;
    if (!selectedEvent?.id) {
      return null;
    }

    const payload = await rapidApiRequest(oddsPath, {
      eventId: selectedEvent.id,
      bookmakers
    });

    const probabilities = tryExtractProbabilities(payload);
    if (!probabilities) {
      return null;
    }

    return {
      ...probabilities,
      note: 'Wahrscheinlichkeiten von Odds API.'
    };
  }

  const path = process.env.RAPIDAPI_ODDS_PATH;
  if (!path) {
    return null;
  }

  const payload = await rapidApiRequest(path, {
    home: homeTeam,
    away: awayTeam,
    date: matchDate
  });

  const probabilities = tryExtractProbabilities(payload);
  if (!probabilities) {
    return null;
  }

  return {
    ...probabilities,
    note: 'Wahrscheinlichkeiten von RapidAPI (bzw. daraus ausgelesenen Quoten).'
  };
}

async function testRapidApi(path, queryParams = {}) {
  const payload = await rapidApiRequest(path, queryParams);
  const probabilities = tryExtractProbabilities(payload);

  return {
    configured: isRapidApiConfigured(),
    mode: isApiSportsDirectMode()
      ? 'api-sports-direct'
      : isOddsApiMode()
        ? 'odds-api-direct'
        : `rapidapi:${process.env.RAPIDAPI_HOST || 'unknown-host'}`,
    host: process.env.RAPIDAPI_HOST,
    baseUrl: isApiSportsDirectMode()
      ? (process.env.APIFOOTBALL_BASE_URL || 'https://v3.football.api-sports.io')
      : isOddsApiMode()
        ? ODDS_API_BASE_URL
      : `https://${process.env.RAPIDAPI_HOST}`,
    path,
    extractedProbabilities: probabilities,
    sample: payload
  };
}

module.exports = {
  isRapidApiConfigured,
  fetchRapidApiProbabilities,
  fetchRapidApiMatchInsights,
  fetchFlashscoreTournamentFixtures,
  testRapidApi
};
