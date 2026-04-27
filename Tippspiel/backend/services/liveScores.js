const { fetchFlashscoreTournamentFixtures } = require('./rapidApi');

const LIVE_CACHE_HOT_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_HOT_MS || '60000', 10);
const LIVE_CACHE_COLD_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_COLD_MS || '240000', 10);
const LIVE_MATCH_TIME_TOLERANCE_MS = Number.parseInt(process.env.LIVE_MATCH_TIME_TOLERANCE_MS || '43200000', 10);

const flashscoreCacheByTournament = new Map();

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function toMatchEntries(fixturesPayload) {
  const entries = Array.isArray(fixturesPayload) ? fixturesPayload : [];
  if (entries.some((entry) => Array.isArray(entry?.matches))) {
    return entries.flatMap((entry) => (Array.isArray(entry?.matches) ? entry.matches : []));
  }
  return entries;
}

function isFlashscoreLiveStatus(rawStatus) {
  const text = String(rawStatus || '').trim().toUpperCase();
  if (!text) return false;

  if (text.includes('LIVE')) return true;
  if (/^(1H|2H|HT|ET|PEN|INT|BREAK)$/.test(text)) return true;
  if (/^\d{1,3}'?$/.test(text)) return true;

  return false;
}

function isFlashscoreFinishedStatus(rawStatus) {
  const text = String(rawStatus || '').trim().toUpperCase();
  if (!text) return false;

  return ['FT', 'FINISHED', 'AET', 'AFTER ET', 'PEN', 'AWARDED'].includes(text);
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractMinute(rawStatus) {
  const text = String(rawStatus || '').trim();
  const match = text.match(/(\d{1,3})\s*'?/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getStatusText(candidate) {
  return candidate?.status_type
    || candidate?.status
    || candidate?.status_description
    || candidate?.event_stage_type
    || candidate?.event_stage
    || '';
}

function toLiveCandidate(candidate) {
  const statusText = getStatusText(candidate);
  const homeGoals = parseNumeric(candidate?.scores?.home);
  const awayGoals = parseNumeric(candidate?.scores?.away);

  const isLive = isFlashscoreLiveStatus(statusText);
  const isFinished = isFlashscoreFinishedStatus(statusText);

  return {
    sourceMatchId: candidate?.match_id || null,
    isLive,
    isFinished,
    statusText,
    minute: extractMinute(statusText),
    homeGoals,
    awayGoals
  };
}

function scoreCandidate(targetMatch, candidate) {
  const homeTarget = normalizeName(targetMatch.home_team);
  const awayTarget = normalizeName(targetMatch.away_team);

  const homeName = normalizeName(candidate?.home_team?.name);
  const awayName = normalizeName(candidate?.away_team?.name);

  let score = 0;
  if (homeTarget && homeName && (homeTarget === homeName || homeTarget.includes(homeName) || homeName.includes(homeTarget))) {
    score += 2;
  }
  if (awayTarget && awayName && (awayTarget === awayName || awayTarget.includes(awayName) || awayName.includes(awayTarget))) {
    score += 2;
  }

  const targetTs = new Date(targetMatch.match_date).getTime();
  const candidateTs = typeof candidate?.timestamp === 'number' ? candidate.timestamp * 1000 : Number.NaN;
  const timeDiff = Number.isFinite(targetTs) && Number.isFinite(candidateTs)
    ? Math.abs(targetTs - candidateTs)
    : Number.MAX_SAFE_INTEGER;

  if (timeDiff <= 2 * 60 * 60 * 1000) {
    score += 1;
  }

  return { score, timeDiff };
}

function findBestCandidateForMatch(targetMatch, fixtures) {
  const candidates = fixtures
    .map((fixture) => {
      const metrics = scoreCandidate(targetMatch, fixture);
      return { fixture, ...metrics };
    })
    .filter((entry) => entry.score >= 4)
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      return first.timeDiff - second.timeDiff;
    });

  return candidates[0]?.fixture || null;
}

function getRapidOptionsForMatch(match) {
  const externalSource = String(match?.external_source || '').toLowerCase();

  if (externalSource === 'flashscore-bundesliga') {
    return {
      tournamentUrl: process.env.FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL || '/football/germany/bundesliga/',
      useConfiguredIds: false,
      cacheKey: 'flashscore:bundesliga'
    };
  }

  return {
    tournamentUrl: process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/',
    useConfiguredIds: true,
    cacheKey: 'flashscore:default'
  };
}

async function getTournamentFixturesCached(rapidOptions) {
  const cacheKey = rapidOptions.cacheKey;
  const now = Date.now();
  const cached = flashscoreCacheByTournament.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const fixturesPayload = await fetchFlashscoreTournamentFixtures(rapidOptions.tournamentUrl, {
    useConfiguredIds: rapidOptions.useConfiguredIds
  });

  const fixtures = toMatchEntries(fixturesPayload);
  const data = {
    fixtures,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: now + LIVE_CACHE_COLD_MS,
    hadLiveMatch: false
  };

  flashscoreCacheByTournament.set(cacheKey, data);
  return data;
}

function patchCacheLiveness(rapidOptions, hadLiveMatch) {
  const cached = flashscoreCacheByTournament.get(rapidOptions.cacheKey);
  if (!cached) return;

  const now = Date.now();
  cached.hadLiveMatch = hadLiveMatch;
  cached.expiresAt = now + (hadLiveMatch ? LIVE_CACHE_HOT_MS : LIVE_CACHE_COLD_MS);
}

function shouldCheckLiveForMatch(match) {
  if (!match || match.finished) return false;

  const source = String(match.external_source || '').toLowerCase();
  if (!source.includes('flashscore')) return false;

  const matchTs = new Date(match.match_date).getTime();
  if (!Number.isFinite(matchTs)) return false;

  return Math.abs(Date.now() - matchTs) <= LIVE_MATCH_TIME_TOLERANCE_MS;
}

async function getLiveScoresForMatches(matches) {
  const candidates = (Array.isArray(matches) ? matches : []).filter(shouldCheckLiveForMatch);

  if (!candidates.length) {
    return {
      updates: {},
      fetchedAt: new Date().toISOString(),
      nextPollInMs: LIVE_CACHE_COLD_MS,
      usedProvider: false
    };
  }

  const groups = new Map();
  candidates.forEach((match) => {
    const options = getRapidOptionsForMatch(match);
    if (!groups.has(options.cacheKey)) {
      groups.set(options.cacheKey, { options, matches: [] });
    }
    groups.get(options.cacheKey).matches.push(match);
  });

  const updates = {};
  let hasLiveMatch = false;
  let usedProvider = false;
  let latestFetchedAt = null;

  for (const group of groups.values()) {
    try {
      const fixturesResult = await getTournamentFixturesCached(group.options);
      const fixtures = fixturesResult.fixtures;
      usedProvider = true;
      latestFetchedAt = fixturesResult.fetchedAt;

      group.matches.forEach((match) => {
        const best = findBestCandidateForMatch(match, fixtures);
        if (!best) return;

        const live = toLiveCandidate(best);
        if (live.isLive) {
          hasLiveMatch = true;
        }

        if (live.homeGoals !== null && live.awayGoals !== null) {
          updates[match.id] = {
            ...live,
            fetchedAt: fixturesResult.fetchedAt
          };
        }
      });

      patchCacheLiveness(group.options, hasLiveMatch);
    } catch (error) {
      // Provider is optional; continue with other groups.
    }
  }

  return {
    updates,
    fetchedAt: latestFetchedAt || new Date().toISOString(),
    nextPollInMs: hasLiveMatch ? LIVE_CACHE_HOT_MS : LIVE_CACHE_COLD_MS,
    usedProvider
  };
}

module.exports = {
  getLiveScoresForMatches
};
