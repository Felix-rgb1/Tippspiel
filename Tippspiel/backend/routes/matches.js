const express = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getMatchInsights } = require('../services/footballData');
const { getLiveScoresForMatches, getMatchStatsWithCache } = require('../services/liveScores');
const { syncWMResults } = require('../services/flashscoreBundesligaImport');
const { fetchFlashscoreGroupStandings, fetchFlashscoreTournamentFixtures, isRapidApiConfigured } = require('../services/rapidApi');

const router = express.Router();

const RESULT_SYNC_MIN_INTERVAL_MS = Number.parseInt(process.env.ON_OPEN_RESULT_SYNC_MIN_INTERVAL_MS || '180000', 10);
let lastOnOpenResultSyncAt = 0;
let ongoingOnOpenResultSync = null;

async function runResultSyncJob() {
  // Set the timestamp immediately so rapid-retry is throttled even when this job throws.
  lastOnOpenResultSyncAt = Date.now();

  const backfillWindowHoursRaw = Number.parseInt(process.env.ON_OPEN_RESULT_SYNC_BACKFILL_HOURS || '72', 10);
  const backfillWindowHours = Number.isFinite(backfillWindowHoursRaw)
    ? Math.max(6, Math.min(336, backfillWindowHoursRaw))
    : 72;

  const backfillLimitRaw = Number.parseInt(process.env.ON_OPEN_RESULT_SYNC_BACKFILL_LIMIT || '200', 10);
  const backfillLimit = Number.isFinite(backfillLimitRaw)
    ? Math.max(20, Math.min(1000, backfillLimitRaw))
    : 200;

  const unfinishedResult = await pool.query(
    `SELECT id, home_team, away_team, match_date, finished, external_source, external_id
     FROM matches
     WHERE (finished = false OR finished IS NULL)
       AND external_source LIKE 'flashscore%'
       AND match_date >= NOW() - ($1::int * INTERVAL '1 hour')
       AND match_date <= NOW() + INTERVAL '6 hours'
     ORDER BY match_date DESC
     LIMIT $2`,
    [backfillWindowHours, backfillLimit]
  );

  const liveBackfillPayload = await getLiveScoresForMatches(unfinishedResult.rows, pool, {
    forceCheckAll: true
  });

  const liveBackfillUpdates = Object.values(liveBackfillPayload?.updates || {});
  const backfillFinishedCount = liveBackfillUpdates.filter(
    (entry) => Boolean(entry?.isFinished) && Number.isFinite(Number(entry?.homeGoals)) && Number.isFinite(Number(entry?.awayGoals))
  ).length;

  const [wmResult] = await Promise.allSettled([
    syncWMResults(pool)
  ]);

  const wm = wmResult.status === 'fulfilled'
    ? { ok: true, ...wmResult.value }
    : { ok: false, error: wmResult.reason?.message || 'WM Sync fehlgeschlagen' };

  const bundesliga = {
    ok: false,
    skipped: true,
    reason: 'Bundesliga Sync deaktiviert (WM-only Betrieb).'
  };

  const now = Date.now();

  return {
    executed: true,
    cached: false,
    syncedAt: new Date(now).toISOString(),
    backfill: {
      checkedCount: unfinishedResult.rows.length,
      providerUpdates: liveBackfillUpdates.length,
      finishedUpdates: backfillFinishedCount,
      fetchedAt: liveBackfillPayload?.fetchedAt || null
    },
    wm,
    bundesliga
  };
}

function parseLiveMatchIds(rawIdsValue) {
  return String(rawIdsValue || '')
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
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
  if (homeTarget && homeName && (homeTarget === homeName || homeTarget.includes(homeName) || homeName.includes(homeTarget))) {
    score += 2;
  }
  if (awayTarget && awayName && (awayTarget === awayName || awayTarget.includes(awayName) || awayName.includes(awayTarget))) {
    score += 2;
  }

  const targetTs = new Date(targetMatch.match_date).getTime();
  const fixtureTs = typeof fixture?.timestamp === 'number' ? fixture.timestamp * 1000 : Number.NaN;
  const timeDiff = Number.isFinite(targetTs) && Number.isFinite(fixtureTs)
    ? Math.abs(targetTs - fixtureTs)
    : Number.MAX_SAFE_INTEGER;

  if (timeDiff <= 30 * 60 * 1000) {
    score += 1;
  } else if (timeDiff > 120 * 60 * 1000) {
    score = -1;
  }

  return { score, timeDiff };
}

async function resolveFlashscoreMatchIdForStats(match, liveInfo = null, options = {}) {
  const debugEnabled = options.debug === true;
  const mappedSourceMatchId = liveInfo?.updates?.[match.id]?.sourceMatchId;
  if (mappedSourceMatchId) {
    return {
      sourceMatchId: String(mappedSourceMatchId),
      resolution: {
        method: 'live-mapping',
        timeDiffMinutes: null
      }
    };
  }

  const externalIdRaw = String(match.external_id || '').trim();
  if (/^\d+$/.test(externalIdRaw) && externalIdRaw.length <= 11) {
    return {
      sourceMatchId: externalIdRaw,
      resolution: {
        method: 'external-id-direct',
        timeDiffMinutes: null
      }
    };
  }

  const tournamentUrl = process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/';
  const fixturesPayload = await fetchFlashscoreTournamentFixtures(tournamentUrl, { useConfiguredIds: false });
  const fixtures = Array.isArray(fixturesPayload)
    ? (fixturesPayload.some((entry) => Array.isArray(entry?.matches))
      ? fixturesPayload.flatMap((entry) => (Array.isArray(entry?.matches) ? entry.matches : []))
      : fixturesPayload)
    : [];

  const candidates = fixtures
    .map((fixture) => {
      const metrics = scoreFixtureCandidate(match, fixture);
      return {
        fixture,
        ...metrics,
        matchId: fixture?.match_id || fixture?.id || fixture?.event_id || null
      };
    })
    .filter((entry) => entry.matchId && entry.score >= 4)
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
        timeDiffMinutes: Number.isFinite(best.timeDiff)
          ? Number((best.timeDiff / 60000).toFixed(1))
          : null,
        fixtureTimestamp: best.fixture?.timestamp || null,
        fixtureHomeTeam: best.fixture?.home_team?.name || null,
        fixtureAwayTeam: best.fixture?.away_team?.name || null,
        ...(debugEnabled
          ? {
              candidateCount: candidates.length,
              topCandidates: candidates.slice(0, 3).map((entry) => ({
                matchId: entry.matchId,
                score: entry.score,
                timeDiffMinutes: Number.isFinite(entry.timeDiff)
                  ? Number((entry.timeDiff / 60000).toFixed(1))
                  : null,
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
      reason: 'No fixture candidate passed score/time thresholds.'
    }
  };
}

async function buildLivePayload(rawIds) {
  if (!rawIds.length) {
    return {
      updates: {},
      fetchedAt: new Date().toISOString(),
      nextPollInMs: 60000,
      usedProvider: false
    };
  }

  const result = await pool.query(
    `SELECT id, home_team, away_team, match_date, finished, external_source, external_id
     FROM matches
     WHERE id = ANY($1::int[])`,
    [rawIds]
  );

  return getLiveScoresForMatches(result.rows, pool);
}

// English → German team name mapping for Flashscore standings
const EN_TO_DE_TEAM = {
  'Czech Republic': 'Tschechien', 'Mexico': 'Mexiko', 'South Africa': 'Suedafrika',
  'South Korea': 'Suedkorea', 'Switzerland': 'Schweiz', 'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
  'Canada': 'Kanada', 'Qatar': 'Katar', 'Scotland': 'Schottland', 'Brazil': 'Brasilien',
  'Haiti': 'Haiti', 'Morocco': 'Marokko', 'Turkey': 'Tuerkei', 'Paraguay': 'Paraguay',
  'USA': 'USA', 'Australia': 'Australien', 'Germany': 'Deutschland', 'Ecuador': 'Ecuador',
  'Ivory Coast': 'Elfenbeinkueste', 'Curacao': 'Curacao', 'Sweden': 'Schweden',
  'Netherlands': 'Niederlande', 'Tunisia': 'Tunesien', 'Japan': 'Japan',
  'Belgium': 'Belgien', 'Egypt': 'Aegypten', 'Iran': 'Iran', 'New Zealand': 'Neuseeland',
  'Spain': 'Spanien', 'Uruguay': 'Uruguay', 'Cape Verde': 'Cape Verde Islands',
  'Saudi Arabia': 'Saudi-Arabien', 'France': 'Frankreich', 'Norway': 'Norwegen',
  'Senegal': 'Senegal', 'Iraq': 'Irak', 'Austria': 'Oesterreich', 'Argentina': 'Argentinien',
  'Algeria': 'Algeria', 'Jordan': 'Jordan', 'Portugal': 'Portugal', 'Colombia': 'Kolumbien',
  'D.R. Congo': 'Congo DR', 'Uzbekistan': 'Usbekistan', 'Croatia': 'Kroatien',
  'England': 'England', 'Ghana': 'Ghana', 'Panama': 'Panama'
};

// Get live group standings from Flashscore
router.get('/group-standings', authMiddleware, async (req, res) => {
  try {
    if (!isRapidApiConfigured()) {
      return res.status(503).json({ error: 'Standings-Provider nicht konfiguriert' });
    }

    const tournamentUrl = process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/';
    const forceRefresh = req.query.refresh === '1';
    const grouped = await fetchFlashscoreGroupStandings(tournamentUrl, { forceRefresh });

    if (!grouped) {
      return res.status(502).json({ error: 'Konnte Standings nicht laden' });
    }

    // Build teamToGroup: map both English (DB) and German names → group letter
    const translatedGroups = {};
    const teamToGroup = {};
    for (const [letter, teams] of Object.entries(grouped)) {
      translatedGroups[letter] = teams.map((row) => {
        const deName = EN_TO_DE_TEAM[row.name] || row.name;
        teamToGroup[row.name] = letter;   // English name (matches DB)
        teamToGroup[deName] = letter;     // German name (fallback)
        return { ...row, name: deName, name_en: row.name };
      });
    }

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ groups: translatedGroups, teamToGroup });
  } catch (err) {
    console.error('[group-standings]', err.message || err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Fehler beim Laden der Standings' });
  }
});

// Get all matches
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM matches ORDER BY match_date ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Get live score updates for selected matches
router.get('/live', async (req, res) => {
  try {
    const rawIds = parseLiveMatchIds(req.query.ids);
    const liveResult = await buildLivePayload(rawIds);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(liveResult);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch live scores' });
  }
});

// Stream live score updates (SSE)
router.get('/live/stream', async (req, res) => {
  const rawIds = parseLiveMatchIds(req.query.ids);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let stopped = false;
  let timer = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const send = (payload) => {
    if (stopped) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const scheduleNext = (delayMs) => {
    if (stopped) return;
    const delay = Math.max(5000, Math.min(300000, Number(delayMs) || 60000));
    timer = setTimeout(runTick, delay);
  };

  const runTick = async () => {
    try {
      const payload = await buildLivePayload(rawIds);
      send(payload);
      scheduleNext(payload?.nextPollInMs || 60000);
    } catch {
      scheduleNext(60000);
    }
  };

  // Keep-alive comment so proxies do not close idle stream.
  const keepAlive = setInterval(() => {
    if (!stopped) {
      res.write(': keep-alive\n\n');
    }
  }, 25000);

  req.on('close', () => {
    stopped = true;
    clearTimer();
    clearInterval(keepAlive);
    res.end();
  });

  runTick();
});

// Trigger result sync when users open the dashboard.
router.post('/sync-results-on-open', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    const minIntervalMs = Number.isFinite(RESULT_SYNC_MIN_INTERVAL_MS)
      ? Math.max(30000, RESULT_SYNC_MIN_INTERVAL_MS)
      : 180000;

    if (ongoingOnOpenResultSync) {
      const result = await ongoingOnOpenResultSync;
      return res.json({ ...result, fromInFlight: true });
    }

    if (now - lastOnOpenResultSyncAt < minIntervalMs) {
      return res.json({
        executed: false,
        cached: true,
        syncedAt: new Date(lastOnOpenResultSyncAt).toISOString(),
        nextAllowedSyncAt: new Date(lastOnOpenResultSyncAt + minIntervalMs).toISOString()
      });
    }

    ongoingOnOpenResultSync = runResultSyncJob();
    const result = await ongoingOnOpenResultSync;
    res.json(result);
  } catch (err) {
    console.error('[ON-OPEN-RESULT-SYNC] Fehler:', err.message || err);
    res.status(err.statusCode || 500).json({ error: err.message || 'On-open Ergebnis-Sync fehlgeschlagen' });
  } finally {
    ongoingOnOpenResultSync = null;
  }
});

// Get single match
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM matches WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// DEBUG: Get raw Flashscore match details to inspect incidents structure
router.get('/:id/debug-flashscore', async (req, res) => {
  try {
    const matchResult = await pool.query(
      'SELECT id, home_team, away_team, external_id, external_source FROM matches WHERE id = $1',
      [req.params.id]
    );
    
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const match = matchResult.rows[0];
    if (!String(match.external_source || '').includes('flashscore')) {
      return res.status(400).json({ error: 'Match is not a Flashscore source' });
    }

    const { fetchFlashscoreMatchDetails } = require('../services/rapidApi');
    const details = await fetchFlashscoreMatchDetails(match.external_id);

    res.json({
      match: {
        id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        external_id: match.external_id
      },
      details_keys: Object.keys(details || {}),
      incidents_field_exists: Boolean(details?.incidents),
      events_field_exists: Boolean(details?.events),
      match_incidents_field_exists: Boolean(details?.match_incidents),
      full_details: details
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get live stats for a match (only on demand from MatchInfo page)
router.get('/:id/live-stats', authMiddleware, async (req, res) => {
  try {
    const debug = ['1', 'true', 'yes', 'on'].includes(String(req.query.debug || '').toLowerCase());

    const matchResult = await pool.query(
      'SELECT id, home_team, away_team, match_date, finished, external_source, external_id FROM matches WHERE id = $1',
      [req.params.id]
    );
    
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const match = matchResult.rows[0];
    if (!String(match.external_source || '').includes('flashscore')) {
      return res.status(400).json({ error: 'Match is not a Flashscore source' });
    }

    // Get current live info to extract sourceMatchId from Flashscore
    const liveInfo = await getLiveScoresForMatches([match], pool);
    const resolved = await resolveFlashscoreMatchIdForStats(match, liveInfo, { debug });
    const sourceMatchId = resolved?.sourceMatchId;

    if (!sourceMatchId) {
      return res.status(400).json({
        error: 'Could not find live match in Flashscore',
        details: 'No sourceMatchId from live mapping, external_id is not a direct provider id, and fixture fallback could not resolve a match id.',
        ...(debug
          ? {
              debug: {
                match: {
                  id: match.id,
                  home_team: match.home_team,
                  away_team: match.away_team,
                  match_date: match.match_date,
                  external_source: match.external_source,
                  external_id: match.external_id
                },
                resolution: resolved?.resolution || null
              }
            }
          : {})
      });
    }

    // Fetch stats using the real Flashscore match ID
    const stats = await getMatchStatsWithCache(sourceMatchId);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      stats,
      fetchedAt: new Date().toISOString(),
      ...(debug
        ? {
            debug: {
              match: {
                id: match.id,
                home_team: match.home_team,
                away_team: match.away_team,
                match_date: match.match_date,
                external_source: match.external_source,
                external_id: match.external_id
              },
              sourceMatchId,
              resolution: resolved?.resolution || null
            }
          }
        : {})
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch live stats' });
  }
});

// Get match insights (team form, recent games, estimated win probabilities)
router.get('/:id/insights', authMiddleware, async (req, res) => {
  try {
    const insights = await getMatchInsights(pool, req.params.id);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(insights);
  } catch (err) {
    console.error(err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to fetch match insights' });
  }
});

module.exports = router;
