const {
  fetchFlashscoreTournamentFixtures,
  fetchFlashscoreMatchesByDate,
  fetchFlashscoreMatchDetails
} = require('./rapidApi');

const LIVE_CACHE_HOT_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_HOT_MS || '90000', 10);
const LIVE_CACHE_COLD_MS = Number.parseInt(process.env.LIVE_SCORE_CACHE_COLD_MS || '300000', 10);
const LIVE_MATCH_TIME_TOLERANCE_MS = Number.parseInt(process.env.LIVE_MATCH_TIME_TOLERANCE_MS || '43200000', 10);

const flashscoreCacheByTournament = new Map();
const flashscoreInFlightByTournament = new Map();

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
    awayGoals,
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
    // Debug: log available keys in details object
    if (details && typeof details === 'object') {
      const keys = Object.keys(details);
      console.debug('[extractIncidents] No incidents found.');
      console.debug('[extractIncidents] All available keys:', keys);
      
      // Log nested structure for common containers
      if (details.data) console.debug('[extractIncidents] details.data keys:', Object.keys(details.data));
      if (details.match) console.debug('[extractIncidents] details.match keys:', Object.keys(details.match));
      if (details.statistics) console.debug('[extractIncidents] details.statistics keys:', Object.keys(details.statistics));
    }
    return [];
  }

  return candidates
    .map((inc) => {
      if (!inc || typeof inc !== 'object') return null;

      // Normalise type – Flashscore uses various naming conventions
      const rawType = String(
        inc.incident_type || inc.type || inc.event_type || inc.event_category || ''
      ).toLowerCase().replace(/[_\s-]/g, '');

      let type = null;
      if (/goal|score|gol/.test(rawType) && !/own/.test(rawType) && !/missed|penalty_missed/.test(rawType)) {
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
        inc.player_name || inc.player || inc.name || inc.player_text || inc.description 
        || inc.scorer || inc.goal_scorer || inc.person || inc.actor || ''
      ).trim();

      if (!player && type !== 'own_goal') {
        return null; // Skip events without player info (unless own goal)
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

      return { type, minute, player, isHome };
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
        const best = findBestCandidateForMatch(match, fixtures);
        if (!best) {
          continue;
        }

        let live = toLiveCandidate(best);

        // Always try to fetch details to get complete incident/goal scorer data
        // and better status info
        if (best?.match_id) {
          try {
            const details = await fetchFlashscoreMatchDetails(best.match_id);
            if (details) {
              console.log(`[MATCH-${match.id}] Full details response:`, JSON.stringify(details, null, 2).substring(0, 2000));
              
              // Check nested structures for goal scorer data
              console.log('[NESTED] home_team:', details.home_team ? Object.keys(details.home_team) : 'null');
              console.log('[NESTED] away_team:', details.away_team ? Object.keys(details.away_team) : 'null');
              console.log('[NESTED] scores:', details.scores ? Object.keys(details.scores) : 'null');
              if (details.scores?.home) console.log('[NESTED] scores.home:', Object.keys(details.scores.home));
              if (details.scores?.away) console.log('[NESTED] scores.away:', Object.keys(details.scores.away));
            }
            const detailsLive = toLiveCandidateFromDetails(details);
            if (detailsLive) {
              console.log(`[MATCH-${match.id}] Extracted incidents:`, detailsLive.incidents);
              // Merge details with live data, preferring details for completeness
              live = {
                ...live,
                ...detailsLive,
                homeGoals: detailsLive.homeGoals ?? live.homeGoals,
                awayGoals: detailsLive.awayGoals ?? live.awayGoals,
                statusText: detailsLive.statusText || live.statusText,
                isLive: detailsLive.isLive || live.isLive,
                isFinished: detailsLive.isFinished || live.isFinished,
                incidents: detailsLive.incidents?.length ? detailsLive.incidents : live.incidents
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

        if (live.homeGoals !== null && live.awayGoals !== null) {
          updates[match.id] = {
            ...live,
            incidents: Array.isArray(live.incidents) ? live.incidents : [],
            fetchedAt: fixturesResult.fetchedAt
          };

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
