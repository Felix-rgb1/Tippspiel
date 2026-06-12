const {
  fetchFlashscoreTournamentFixtures,
  fetchFlashscoreTournamentResults,
  fetchFlashscoreMatchesByDate
} = require('./rapidApi');

let ensureFlashscoreMatchIdColumnPromise = null;

async function ensureFlashscoreMatchIdColumn(pool) {
  if (!ensureFlashscoreMatchIdColumnPromise) {
    ensureFlashscoreMatchIdColumnPromise = (async () => {
      await pool.query('ALTER TABLE matches ADD COLUMN IF NOT EXISTS flashscore_match_id VARCHAR(64)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_matches_flashscore_match_id ON matches(flashscore_match_id)');
    })().catch((error) => {
      ensureFlashscoreMatchIdColumnPromise = null;
      throw error;
    });
  }

  return ensureFlashscoreMatchIdColumnPromise;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function scoreFixtureCandidate(targetMatch, fixture) {
  const homeTarget = normalizeName(targetMatch.home_team);
  const awayTarget = normalizeName(targetMatch.away_team);

  const homeName = normalizeName(fixture?.home_team?.name);
  const awayName = normalizeName(fixture?.away_team?.name);

  let score = 0;
  const homeMatch = Boolean(homeTarget && homeName && (homeTarget === homeName || homeTarget.includes(homeName) || homeName.includes(homeTarget)));
  const awayMatch = Boolean(awayTarget && awayName && (awayTarget === awayName || awayTarget.includes(awayName) || awayName.includes(awayTarget)));

  if (homeMatch) score += 2;
  if (awayMatch) score += 2;

  const targetTs = new Date(targetMatch.match_date).getTime();
  const fixtureTs = typeof fixture?.timestamp === 'number' ? fixture.timestamp * 1000 : Number.NaN;
  const timeDiff = Number.isFinite(targetTs) && Number.isFinite(fixtureTs)
    ? Math.abs(targetTs - fixtureTs)
    : Number.MAX_SAFE_INTEGER;

  if (timeDiff <= 30 * 60 * 1000) {
    score += 1;
  } else if (timeDiff <= 6 * 60 * 60 * 1000) {
    score += 0;
  } else if (timeDiff <= 24 * 60 * 60 * 1000) {
    score -= 1;
  } else {
    score -= 2;
  }

  return {
    score,
    timeDiff,
    exactTeamPair: homeMatch && awayMatch
  };
}

function toMatchEntries(payload) {
  const entries = Array.isArray(payload) ? payload : [];
  if (entries.some((entry) => Array.isArray(entry?.matches))) {
    return entries.flatMap((entry) => (Array.isArray(entry?.matches) ? entry.matches : []));
  }
  return entries;
}

function dedupeBySourceMatchId(matches) {
  const byId = new Map();
  for (const fixture of matches) {
    const id = fixture?.match_id || fixture?.id || fixture?.event_id;
    if (id) {
      byId.set(String(id), fixture);
    }
  }
  return Array.from(byId.values());
}

async function resolveFlashscoreMatchIdForMatch(match, options = {}) {
  const debugEnabled = options.debug === true;
  const liveInfo = options.liveInfo || null;
  const mappedSourceMatchId = liveInfo?.updates?.[match.id]?.sourceMatchId;

  if (mappedSourceMatchId) {
    return {
      sourceMatchId: String(mappedSourceMatchId),
      resolution: { method: 'live-mapping', timeDiffMinutes: null }
    };
  }

  const storedProviderId = String(match.flashscore_match_id || '').trim();
  if (storedProviderId) {
    return {
      sourceMatchId: storedProviderId,
      resolution: { method: 'stored-provider-id', timeDiffMinutes: null }
    };
  }

  const externalIdRaw = String(match.external_id || '').trim();
  if (/^\d+$/.test(externalIdRaw) && externalIdRaw.length <= 11) {
    return {
      sourceMatchId: externalIdRaw,
      resolution: { method: 'external-id-direct', timeDiffMinutes: null }
    };
  }

  const configuredTournamentUrl = process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/';
  const tournamentUrls = Array.from(new Set([
    configuredTournamentUrl,
    '/football/world/world-cup/',
    '/football/world/world-cup-2026/'
  ]));

  const tournamentPayloads = await Promise.all(
    tournamentUrls.map(async (url) => {
      const [fixtures, results] = await Promise.all([
        fetchFlashscoreTournamentFixtures(url, { useConfiguredIds: false }).catch(() => []),
        fetchFlashscoreTournamentResults(url, { useConfiguredIds: false }).catch(() => [])
      ]);
      return { url, fixtures, results };
    })
  );

  const fixturesPayload = tournamentPayloads.flatMap((entry) => toMatchEntries(entry.fixtures));
  const resultsPayload = tournamentPayloads.flatMap((entry) => toMatchEntries(entry.results));

  const matchDate = new Date(match.match_date);
  const timezone = process.env.FLASHSCORE_TIMEZONE || 'Europe/Berlin';
  const baseDateBerlin = Number.isNaN(matchDate.getTime())
    ? null
    : matchDate.toLocaleDateString('en-CA', { timeZone: timezone });

  const dateVariants = [];
  if (baseDateBerlin) {
    const baseDate = new Date(`${baseDateBerlin}T00:00:00Z`);
    const prev = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const curr = baseDate.toISOString().slice(0, 10);
    const next = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dateVariants.push(prev, curr, next);
  }

  const uniqueDateVariants = Array.from(new Set(dateVariants));
  const byDatePayloads = uniqueDateVariants.length
    ? await Promise.all(uniqueDateVariants.map((dateOnly) => fetchFlashscoreMatchesByDate(dateOnly, { timezone }).catch(() => [])))
    : [];

  const fixtures = dedupeBySourceMatchId([
    ...fixturesPayload,
    ...resultsPayload,
    ...byDatePayloads.flatMap((payload) => toMatchEntries(payload))
  ]);

  const candidates = fixtures
    .map((fixture) => {
      const metrics = scoreFixtureCandidate(match, fixture);
      return {
        fixture,
        ...metrics,
        matchId: fixture?.match_id || fixture?.id || fixture?.event_id || null
      };
    })
    .filter((entry) => {
      if (!entry.matchId) return false;
      if (entry.score >= 3) return true;
      return entry.exactTeamPair && Number.isFinite(entry.timeDiff) && entry.timeDiff <= 48 * 60 * 60 * 1000;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeDiff - b.timeDiff;
    });

  if (candidates[0]?.matchId) {
    const best = candidates[0];
    return {
      sourceMatchId: String(best.matchId),
      resolution: {
        method: 'fixture-fallback',
        score: best.score,
        timeDiffMinutes: Number.isFinite(best.timeDiff) ? Number((best.timeDiff / 60000).toFixed(1)) : null,
        fixtureTimestamp: best.fixture?.timestamp || null,
        fixtureHomeTeam: best.fixture?.home_team?.name || null,
        fixtureAwayTeam: best.fixture?.away_team?.name || null,
        ...(debugEnabled
          ? {
              candidateCount: candidates.length,
              searchedDates: uniqueDateVariants,
              tournamentUrlsTried: tournamentUrls,
              sourcePoolSizes: {
                fixtures: fixturesPayload.length,
                results: resultsPayload.length,
                byDate: byDatePayloads.reduce((sum, payload) => sum + toMatchEntries(payload).length, 0),
                mergedUnique: fixtures.length
              },
              topCandidates: candidates.slice(0, 3).map((entry) => ({
                matchId: entry.matchId,
                score: entry.score,
                timeDiffMinutes: Number.isFinite(entry.timeDiff) ? Number((entry.timeDiff / 60000).toFixed(1)) : null,
                exactTeamPair: entry.exactTeamPair,
                homeTeam: entry.fixture?.home_team?.name || null,
                awayTeam: entry.fixture?.away_team?.name || null,
                timestamp: entry.fixture?.timestamp || null
              }))
            }
          : {})
      }
    };
  }

  return {
    sourceMatchId: null,
    resolution: {
      method: 'not-found',
      candidateCount: candidates.length,
      reason: 'No fixture candidate passed score/time thresholds.',
      searchedDates: uniqueDateVariants,
      tournamentUrlsTried: tournamentUrls,
      sourcePoolSizes: {
        fixtures: fixturesPayload.length,
        results: resultsPayload.length,
        byDate: byDatePayloads.reduce((sum, payload) => sum + toMatchEntries(payload).length, 0),
        mergedUnique: fixtures.length
      }
    }
  };
}

async function persistFlashscoreMatchId(pool, matchDbId, sourceMatchId) {
  const normalized = String(sourceMatchId || '').trim();
  if (!normalized) return false;

  await ensureFlashscoreMatchIdColumn(pool);
  const result = await pool.query(
    `UPDATE matches
     SET flashscore_match_id = $1, updated_at = NOW()
     WHERE id = $2 AND COALESCE(flashscore_match_id, '') <> $1`,
    [normalized, matchDbId]
  );

  return result.rowCount > 0;
}

module.exports = {
  ensureFlashscoreMatchIdColumn,
  resolveFlashscoreMatchIdForMatch,
  persistFlashscoreMatchId
};