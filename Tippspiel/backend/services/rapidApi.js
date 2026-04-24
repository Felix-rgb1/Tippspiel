const fetch = require('node-fetch');

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
  return Boolean(process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_HOST);
}

function isApiFootballHost() {
  return (process.env.RAPIDAPI_HOST || '').toLowerCase().includes('api-football');
}

function normalizeComparableName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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
  const url = new URL(`https://${process.env.RAPIDAPI_HOST}${safePath}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const err = new Error(`RapidAPI Fehler: ${response.status}`);
    err.statusCode = 502;
    err.details = payload;
    throw err;
  }

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
    host: process.env.RAPIDAPI_HOST,
    path,
    extractedProbabilities: probabilities,
    sample: payload
  };
}

module.exports = {
  isRapidApiConfigured,
  fetchRapidApiProbabilities,
  testRapidApi
};
