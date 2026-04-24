const fetch = require('node-fetch');

const RAPIDAPI_CACHE_TTL_MS = Number.parseInt(process.env.RAPIDAPI_CACHE_TTL_MS || '120000', 10);
const rapidApiCache = new Map();

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
  Tuerkei: 'Turkey',
  Tunesien: 'Tunisia',
  Ukraine: 'Ukraine',
  Uruguay: 'Uruguay',
  USA: 'United States',
  Venezuela: 'Venezuela',
  Wales: 'Wales',
  'Costa Rica': 'Costa Rica'
};

function isRapidApiConfigured() {
  return Boolean((process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_HOST) || isApiSportsDirectMode());
}

function getProviderMode() {
  const mode = (process.env.RAPIDAPI_PROVIDER || '').trim().toLowerCase();
  if (mode === 'api-football-direct' || mode === 'direct') {
    return 'api-football-direct';
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

function isApiSportsDirectMode() {
  return getProviderMode() === 'api-football-direct' && Boolean(process.env.APIFOOTBALL_KEY);
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

  return null;
}

async function rapidApiRequest(path, queryParams = {}) {
  if (!isRapidApiConfigured()) {
    const err = new Error('RapidAPI ist nicht konfiguriert');
    err.statusCode = 400;
    throw err;
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = isApiSportsDirectMode()
    ? (safePath.replace(/^\/v3(?=\/|$)/, '') || '/')
    : safePath;
  const baseUrl = isApiSportsDirectMode()
    ? (process.env.APIFOOTBALL_BASE_URL || 'https://v3.football.api-sports.io')
    : `https://${process.env.RAPIDAPI_HOST}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const cacheKey = url.toString();
  const cached = rapidApiCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: isApiSportsDirectMode()
      ? {
        'x-apisports-key': process.env.APIFOOTBALL_KEY
      }
      : {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
      }
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

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
    const exactMatch = responseTeams.find((entry) => {
      const name = normalizeComparableName(entry?.team?.name);
      const country = normalizeComparableName(entry?.team?.country);
      return name === normalizedTarget || country === normalizedTarget;
    });

    const selected = exactMatch || responseTeams[0];
    if (selected?.team?.id) {
      return selected.team.id;
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

async function fetchApiFootballRecentMatchesForTeam(teamName, last = 5) {
  const teamId = await findApiFootballTeamId(teamName);
  if (!teamId) {
    return [];
  }

  const payload = await rapidApiRequest('/v3/fixtures', {
    team: teamId,
    last,
    status: 'FT'
  });

  const fixtures = payload?.response || [];
  return fixtures
    .map((entry) => mapFixtureToRecentMatch(entry, teamId))
    .filter(Boolean)
    .slice(0, last);
}

async function fetchApiFootballHeadToHead(homeTeam, awayTeam, last = 5) {
  const homeTeamId = await findApiFootballTeamId(homeTeam);
  const awayTeamId = await findApiFootballTeamId(awayTeam);

  if (!homeTeamId || !awayTeamId) {
    return [];
  }

  const payload = await rapidApiRequest('/v3/fixtures/headtohead', {
    h2h: `${homeTeamId}-${awayTeamId}`,
    last,
    status: 'FT'
  });

  const fixtures = payload?.response || [];
  return fixtures
    .map(mapFixtureToHeadToHead)
    .filter(Boolean)
    .slice(0, last);
}

async function fetchRapidApiMatchInsights(homeTeam, awayTeam) {
  if (isApiFootballHost()) {
    const [homeRecentMatches, awayRecentMatches, headToHead] = await Promise.all([
      fetchApiFootballRecentMatchesForTeam(homeTeam, 5),
      fetchApiFootballRecentMatchesForTeam(awayTeam, 5),
      fetchApiFootballHeadToHead(homeTeam, awayTeam, 5)
    ]);

    return { homeRecentMatches, awayRecentMatches, headToHead };
  }

  if (isSofascoreHost()) {
    const [homeRecentMatches, awayRecentMatches, headToHead] = await Promise.all([
      fetchSofascoreRecentMatchesForTeam(homeTeam, 5),
      fetchSofascoreRecentMatchesForTeam(awayTeam, 5),
      fetchSofascoreHeadToHead(homeTeam, awayTeam, 5)
    ]);

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
    mode: isApiSportsDirectMode() ? 'api-sports-direct' : `rapidapi:${process.env.RAPIDAPI_HOST || 'unknown-host'}`,
    host: process.env.RAPIDAPI_HOST,
    baseUrl: isApiSportsDirectMode()
      ? (process.env.APIFOOTBALL_BASE_URL || 'https://v3.football.api-sports.io')
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
  testRapidApi
};
