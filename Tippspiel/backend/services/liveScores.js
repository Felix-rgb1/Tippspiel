const {
  fetchFlashscoreTournamentFixtures,
  fetchFlashscoreMatchesByDate,
  fetchFlashscoreMatchDetails
} = require('./rapidApi');

const LIVE_CACHE_HOT_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_HOT_MS || '10000', 10);
const LIVE_CACHE_COLD_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_COLD_MS || '60000', 10);
const LIVE_MATCH_TIME_TOLERANCE_MS = Number.parseInt(process.env.LIVE_MATCH_TIME_TOLERANCE_MS || '43200000', 10);
const MATCH_DETAILS_CACHE_MS = Number.parseInt(process.env.MATCH_DETAILS_CACHE_MS || '300000', 10); // 5 min default
const MATCH_DETAILS_LIVE_CACHE_MS = Number.parseInt(process.env.MATCH_DETAILS_LIVE_CACHE_MS || '20000', 10);
const LIVE_DEBUG_MATCH_ID = Number.parseInt(process.env.LIVE_DEBUG_MATCH_ID || '', 10);
const LIVE_DEBUG_EXTERNAL_ID = Number.parseInt(process.env.LIVE_DEBUG_EXTERNAL_ID || '', 10);
const LIVE_DEBUG_TEAM_QUERY = String(process.env.LIVE_DEBUG_TEAM_QUERY || '').trim().toLowerCase();

const flashscoreCacheByTournament = new Map();
const flashscoreInFlightByTournament = new Map();
const matchDetailsCache = new Map(); // Cache für Match-Details

function shouldDebugMatch(match) {
  if (!match) return false;

  const dbId = Number.parseInt(String(match.id || ''), 10);
  const externalId = Number.parseInt(String(match.external_id || ''), 10);
  const teams = `${String(match.home_team || '')} ${String(match.away_team || '')}`.toLowerCase();

  if (Number.isFinite(LIVE_DEBUG_MATCH_ID) && dbId === LIVE_DEBUG_MATCH_ID) return true;
  if (Number.isFinite(LIVE_DEBUG_EXTERNAL_ID) && externalId === LIVE_DEBUG_EXTERNAL_ID) return true;
  if (LIVE_DEBUG_TEAM_QUERY && teams.includes(LIVE_DEBUG_TEAM_QUERY)) return true;
  return false;
}

function logLiveDebug(match, label, payload = {}) {
  const id = match?.id ?? '?';
  const home = String(match?.home_team || '?');
  const away = String(match?.away_team || '?');
  const prefix = `[LIVE-DEBUG][${id}] ${home} vs ${away} :: ${label}`;
  console.log(prefix, payload);
}

function toNumericExternalId(rawMatchId) {
  const input = String(rawMatchId || '');
  if (!input) return null;

  const prime = 1099511628211n;
  let hash = 1469598103934665603n;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash *= prime;
  }

  const maxSafe = 9007199254740991n;
  const normalized = (hash < 0n ? -hash : hash) % maxSafe;
  return Number(normalized || 1n);
}

function normalizeExternalId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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

function toBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value || '').trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function extractMinute(rawStatus) {
  const text = String(rawStatus || '').trim();
  const match = text.match(/(\d{1,3})\s*'?/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getStatusText(candidate) {
  // Prefer detailed stage fields before generic status like "LIVE".
  return candidate?.status_type
    || candidate?.status_description
    || candidate?.event_stage_type
    || candidate?.event_stage
    || candidate?.match_status?.stage
    || candidate?.match_status?.live_time
    || candidate?.status
    || '';
}

function toLiveCandidate(candidate) {
  const statusText = getStatusText(candidate);
  const homeGoals = parseNumeric(candidate?.scores?.home ?? candidate?.home_score ?? candidate?.scores?.home_score);
  const awayGoals = parseNumeric(candidate?.scores?.away ?? candidate?.away_score ?? candidate?.scores?.away_score);

  const explicitFinished = Boolean(
    toBooleanFlag(candidate?.is_finished)
    || toBooleanFlag(candidate?.is_finished_after_extra_time)
    || toBooleanFlag(candidate?.is_finished_after_penalties)
    || toBooleanFlag(candidate?.match_status?.is_finished)
    || toBooleanFlag(candidate?.match_status?.is_finished_after_extra_time)
    || toBooleanFlag(candidate?.match_status?.is_finished_after_penalties)
  );

  const explicitLive = Boolean(
    toBooleanFlag(candidate?.is_live)
    || toBooleanFlag(candidate?.is_in_progress)
    || toBooleanFlag(candidate?.match_status?.is_in_progress)
    || (
      (toBooleanFlag(candidate?.is_started) || toBooleanFlag(candidate?.match_status?.is_started))
      && !explicitFinished
    )
  );

  const isFinished = explicitFinished || isFlashscoreFinishedStatus(statusText);
  const isLive = !isFinished && (explicitLive || isFlashscoreLiveStatus(statusText));

  const homeRedCards = parseNumeric(candidate?.home_team?.red_cards) ?? 0;
  const awayRedCards = parseNumeric(candidate?.away_team?.red_cards) ?? 0;

  return {
    sourceMatchId: candidate?.match_id || null,
    isLive,
    isFinished,
    statusText,
    minute: extractMinute(statusText),
    homeGoals,
    awayGoals,
    homeRedCards,
    awayRedCards,
    incidents: extractIncidents(candidate)
  };
}

function extractIncidents(details) {
  // Try multiple possible field names for incidents/events
  const candidates = Array.isArray(details?.incidents)
    ? details.incidents
    : Array.isArray(details?.events)
    ? details.events
    : Array.isArray(details?.match_incidents)
    ? details.match_incidents
    : Array.isArray(details?.data?.incidents)
    ? details.data.incidents
    : Array.isArray(details?.data?.events)
    ? details.data.events
    : Array.isArray(details?.goals)
    ? details.goals
    : Array.isArray(details?.goal_scorers)
    ? details.goal_scorers
    : Array.isArray(details?.scorers)
    ? details.scorers
    : [];

  if (!Array.isArray(candidates) || !candidates.length) {
    return [];
  }

  return candidates
    .map((inc) => {
      if (!inc || typeof inc !== 'object') return null;

      // Normalise type – Flashscore uses various naming conventions
      const rawType = String(
        inc.incident_type
        || inc.type
        || inc.event_type
        || inc.event_category
        || inc.event_name
        || inc.category
        || inc.action
        || ''
      ).toLowerCase().replace(/[_\s-]/g, '');

      const fallbackText = String(
        inc.description
        || inc.player_text
        || inc.text
        || inc.comment
        || ''
      ).toLowerCase();

      let type = null;
      const hasGoalHint = /goal|score|gol/.test(rawType)
        || toBooleanFlag(inc.is_goal)
        || toBooleanFlag(inc.goal)
        || fallbackText.includes('goal')
        || fallbackText.includes('tor');

      if (hasGoalHint && !/own/.test(rawType) && !/missed|penalty_missed/.test(rawType)) {
        type = 'goal';
      } else if (/owngoal|og/.test(rawType)) {
        type = 'own_goal';
      } else if (/yellowred|secondyellow|doubleyellow/.test(rawType)) {
        type = 'yellow_red';
      } else if (/yellowcard|yellow|tarjeta/.test(rawType)) {
        type = 'yellow';
      } else if (/redcard|red|rojadir/.test(rawType)) {
        type = 'red';
      } else if (/penaltymissed|missedpenalty/.test(rawType)) {
        type = 'penalty_missed';
      }

      if (!type) return null;

      // Extract minute/time – try multiple field names
      const minute = parseNumeric(
        inc.time ?? inc.minute ?? inc.elapsed ?? inc.injury_time ?? inc.period_time ?? inc.match_minute
      );

      // Extract player name – try multiple field names
      const player = String(
        inc.player_name
        || inc.player
        || inc.player?.name
        || inc.name
        || inc.player_text
        || inc.description
        || inc.scorer
        || inc.goal_scorer
        || inc.person
        || inc.actor
        || inc.athlete
        || inc.participant_name
        || ''
      ).trim();

      const allowWithoutPlayer = type === 'goal' || type === 'own_goal' || type === 'red' || type === 'yellow_red' || type === 'yellow';
      if (!player && !allowWithoutPlayer) {
        return null;
      }

      // Determine if home team scored – try multiple field name patterns
      let isHome = null;
      if (inc.is_home !== undefined) {
        isHome = Boolean(inc.is_home);
      } else if (inc.team === 'home' || inc.side === 'home' || inc.participant === 'home') {
        isHome = true;
      } else if (inc.team === 'away' || inc.side === 'away' || inc.participant === 'away') {
        isHome = false;
      } else if (inc.period_team_id !== undefined && inc.home_team_id !== undefined) {
        isHome = inc.period_team_id === inc.home_team_id;
      } else if (inc.team_id !== undefined && inc.home_id !== undefined) {
        isHome = inc.team_id === inc.home_id;
      }

      const fallbackPlayer = type === 'goal'
        ? 'Unbekannter Torschuetze'
        : (type === 'red' || type === 'yellow_red' || type === 'yellow')
        ? 'Spieler unbekannt'
        : '';

      return {
        type,
        minute,
        player: player || fallbackPlayer,
        isHome
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
}

function toLiveCandidateFromDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const matchStatus = details.match_status || {};
  const stage = String(matchStatus.stage || '').trim();
  const liveTime = String(matchStatus.live_time || '').trim();
  // Special stages (HT, ET, BREAK…) take priority over live_time to avoid "0'" at half time.
  const SPECIAL_STAGES = new Set(['HT', 'ET', 'PEN', 'BREAK', 'INT', 'AET', 'FT', 'FINISHED']);
  const statusText = SPECIAL_STAGES.has(stage.toUpperCase()) ? stage : (liveTime ? `${liveTime}'` : stage);

  const isFinished = Boolean(
    matchStatus.is_finished
    || matchStatus.is_finished_after_extra_time
    || matchStatus.is_finished_after_penalties
  );

  const isLive = Boolean(matchStatus.is_in_progress || (matchStatus.is_started && !isFinished));

  const scores = details.scores || {};
  const homeGoals = parseNumeric(
    scores.home_score
    ?? scores.home
    ?? scores.final?.home
    ?? scores.current?.home
  );
  const awayGoals = parseNumeric(
    scores.away_score
    ?? scores.away
    ?? scores.final?.away
    ?? scores.current?.away
  );

  return {
    sourceMatchId: details.match_id || null,
    isLive,
    isFinished,
    statusText,
    minute: extractMinute(statusText),
    homeGoals,
    awayGoals,
    incidents: extractIncidents(details)
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

  // Strict timestamp requirement: only ±30 minutes to avoid false matches on repeated fixtures
  if (timeDiff <= 30 * 60 * 1000) {
    score += 1;
  } else if (timeDiff > 120 * 60 * 1000) {
    // Penalize large time differences heavily to avoid cross-day matching
    score = -1;
  }

  return { score, timeDiff };
}

function findBestCandidateForMatch(targetMatch, fixtures) {
  const targetExternalId = normalizeExternalId(targetMatch?.external_id);

  if (targetExternalId) {
    const exact = fixtures.find((fixture) => {
      const fixtureRawId = fixture?.match_id || fixture?.id || fixture?.event_id;
      if (!fixtureRawId) return false;

      const numericFixtureId = normalizeExternalId(fixtureRawId);
      if (numericFixtureId && numericFixtureId === targetExternalId) {
        return true;
      }

      const hashedFixtureId = toNumericExternalId(fixtureRawId);
      return hashedFixtureId === targetExternalId;
    });

    if (exact) {
      return exact;
    }
  }

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

  if (externalSource === 'flashscore-live-test-day') {
    const todayBerlin = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
    return {
      mode: 'by-date',
      dateOnly: todayBerlin,
      cacheKey: `flashscore:by-date:${todayBerlin}`
    };
  }

  if (externalSource === 'flashscore-bundesliga') {
    return {
      mode: 'tournament',
      tournamentUrl: process.env.FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL || '/football/germany/bundesliga/',
      useConfiguredIds: false,
      cacheKey: 'flashscore:bundesliga'
    };
  }

  return {
    mode: 'tournament',
    tournamentUrl: process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/',
    useConfiguredIds: false,
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

  const inFlight = flashscoreInFlightByTournament.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    const fetchStartedAt = Date.now();
    const fixturesPayload = rapidOptions.mode === 'by-date'
      ? await fetchFlashscoreMatchesByDate(rapidOptions.dateOnly)
      : await fetchFlashscoreTournamentFixtures(rapidOptions.tournamentUrl, {
          useConfiguredIds: rapidOptions.useConfiguredIds
        });

    const fixtures = toMatchEntries(fixturesPayload);
    const data = {
      fixtures,
      fetchedAt: new Date(fetchStartedAt).toISOString(),
      expiresAt: fetchStartedAt + LIVE_CACHE_COLD_MS,
      hadLiveMatch: false
    };

    flashscoreCacheByTournament.set(cacheKey, data);
    return data;
  })();

  flashscoreInFlightByTournament.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    flashscoreInFlightByTournament.delete(cacheKey);
  }
}

async function getMatchDetailsWithCache(matchId, isLive = false) {
  const now = Date.now();
  const cached = matchDetailsCache.get(matchId);
  const ttlMs = isLive
    ? Math.max(5000, MATCH_DETAILS_LIVE_CACHE_MS)
    : Math.max(30000, MATCH_DETAILS_CACHE_MS);

  // Return cached data if still valid
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const freshDetails = await fetchFlashscoreMatchDetails(matchId);
    if (freshDetails) {
      matchDetailsCache.set(matchId, {
        data: freshDetails,
        expiresAt: Date.now() + ttlMs
      });
      return freshDetails;
    }
  } catch (err) {
    // Keep stale cache on fetch error to avoid breaking live status rendering.
    console.warn(`[MATCH-DETAILS-CACHE] Failed to refresh details for match ${matchId}:`, err.message);
  }

  // Return cached data (even if stale) or null if no cache exists
  return cached ? cached.data : null;
}

function hasImminentMatch(matches) {
  const now = Date.now();
  const window = 30 * 60 * 1000; // 30 minutes
  return matches.some((m) => {
    const ts = new Date(m.match_date).getTime();
    return Number.isFinite(ts) && Math.abs(ts - now) <= window;
  });
}

function patchCacheLiveness(rapidOptions, hadLiveMatch, groupMatches) {
  const cached = flashscoreCacheByTournament.get(rapidOptions.cacheKey);
  if (!cached) return;

  const now = Date.now();
  cached.hadLiveMatch = hadLiveMatch;
  const useHot = hadLiveMatch || (Array.isArray(groupMatches) && hasImminentMatch(groupMatches));
  cached.expiresAt = now + (useHot ? LIVE_CACHE_HOT_MS : LIVE_CACHE_COLD_MS);
}

function shouldCheckLiveForMatch(match) {
  if (!match || match.finished) return false;

  const source = String(match.external_source || '').toLowerCase();
  if (!source.includes('flashscore')) return false;

  const matchTs = new Date(match.match_date).getTime();
  if (!Number.isFinite(matchTs)) return false;

  return Math.abs(Date.now() - matchTs) <= LIVE_MATCH_TIME_TOLERANCE_MS;
}

async function getLiveScoresForMatches(matches, pool = null) {
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

      for (const match of group.matches) {
        const debugMatch = shouldDebugMatch(match);
        const best = findBestCandidateForMatch(match, fixtures);
        if (!best) {
          if (debugMatch) {
            logLiveDebug(match, 'no-candidate', {
              fixturesInGroup: fixtures.length,
              externalId: match.external_id || null
            });
          }
          continue;
        }

        let live = toLiveCandidate(best);

        if (debugMatch) {
          logLiveDebug(match, 'fixture-candidate', {
            fixtureMatchId: best.match_id || best.id || best.event_id || null,
            statusText: live.statusText,
            minute: live.minute,
            isLive: live.isLive,
            isFinished: live.isFinished,
            homeGoals: live.homeGoals,
            awayGoals: live.awayGoals
          });
        }

        // Only fetch details for live matches to reduce API usage
        // (Fixture data from tournament endpoint is good enough for non-live matches)
        // Use smart cache: return fast, update async if live
        if (best?.match_id && live.isLive) {
          try {
            const detailsCacheBefore = matchDetailsCache.get(best.match_id);
            const detailsCacheAgeMs = detailsCacheBefore
              ? Math.max(0, Date.now() - (detailsCacheBefore.expiresAt - Math.max(5000, MATCH_DETAILS_LIVE_CACHE_MS)))
              : null;

            const details = await getMatchDetailsWithCache(best.match_id, true);
            const detailsLive = toLiveCandidateFromDetails(details);

            if (debugMatch) {
              logLiveDebug(match, 'details-fetch', {
                matchId: best.match_id,
                hadCacheBefore: Boolean(detailsCacheBefore),
                cacheAgeMsApprox: detailsCacheAgeMs,
                detailsStatus: detailsLive?.statusText || null,
                detailsMinute: detailsLive?.minute ?? null,
                detailsIsLive: detailsLive?.isLive ?? null,
                detailsIsFinished: detailsLive?.isFinished ?? null,
                detailsHomeGoals: detailsLive?.homeGoals ?? null,
                detailsAwayGoals: detailsLive?.awayGoals ?? null
              });
            }

            if (detailsLive) {
              // Merge details with live data, preferring details for completeness
              live = {
                ...live,
                ...detailsLive,
                homeGoals: detailsLive.homeGoals ?? live.homeGoals,
                awayGoals: detailsLive.awayGoals ?? live.awayGoals,
                statusText: detailsLive.statusText || live.statusText,
                isLive: detailsLive.isLive || live.isLive,
                isFinished: detailsLive.isFinished || live.isFinished,
                // Keep fixture red card counts – details endpoint doesn't provide them
                homeRedCards: live.homeRedCards ?? 0,
                awayRedCards: live.awayRedCards ?? 0,
                // Keep fixture incidents as fallback when details endpoint has none.
                incidents: Array.isArray(detailsLive.incidents) && detailsLive.incidents.length > 0
                  ? detailsLive.incidents
                  : (Array.isArray(live.incidents) ? live.incidents : [])
              };
            }
          } catch (err) {
            // Details endpoint is optional fallback.
            console.warn(`Failed to fetch match details for ${match.id}:`, err.message);
          }
        }

        if (live.isLive) {
          hasLiveMatch = true;
        }

        if (debugMatch) {
          logLiveDebug(match, 'final-live-state', {
            statusText: live.statusText,
            minute: live.minute,
            isLive: live.isLive,
            isFinished: live.isFinished,
            homeGoals: live.homeGoals,
            awayGoals: live.awayGoals
          });
        }

        if (live.homeGoals !== null && live.awayGoals !== null) {
          updates[match.id] = {
            ...live,
            incidents: Array.isArray(live.incidents) ? live.incidents : [],
            fetchedAt: fixturesResult.fetchedAt
          };

          if (debugMatch) {
            logLiveDebug(match, 'sent-update', {
              sent: true,
              reason: 'has-score-values'
            });
          }

          // Debug logging for goalscorers
          if (Array.isArray(live.incidents) && live.incidents.length > 0) {
            const goals = live.incidents.filter(inc => inc.type === 'goal');
            if (goals.length > 0) {
              console.log(`[GOALSCORERS] Match ${match.id}: Found ${goals.length} goals`, JSON.stringify(goals, null, 2));
            }
          }

          // Auto-save finished match scores to database
          // Only update matches from external sources (live data), not manually entered ones
          if (live.isFinished && !match.finished && match.external_source && pool) {
            try {
              await pool.query(
                `UPDATE matches
                 SET home_goals = $1, away_goals = $2, finished = true, updated_at = NOW()
                 WHERE id = $3 AND finished = false AND external_source IS NOT NULL`,
                [live.homeGoals, live.awayGoals, match.id]
              );
            } catch (err) {
              console.warn(`Failed to save finished match scores for match ${match.id}:`, err.message);
            }
          }
        } else if (debugMatch) {
          logLiveDebug(match, 'not-sent-update', {
            sent: false,
            reason: 'missing-score-values',
            homeGoals: live.homeGoals,
            awayGoals: live.awayGoals,
            isLive: live.isLive,
            minute: live.minute
          });
        }
      }

      patchCacheLiveness(group.options, hasLiveMatch, group.matches);
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
