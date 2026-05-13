const express = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getMatchInsights } = require('../services/footballData');
const { getLiveScoresForMatches, getMatchStatsWithCache } = require('../services/liveScores');

const router = express.Router();

function parseLiveMatchIds(rawIdsValue) {
  return String(rawIdsValue || '')
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
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
    const sourceMatchId = liveInfo?.updates?.[match.id]?.sourceMatchId;

    if (!sourceMatchId) {
      return res.status(400).json({ error: 'Could not find live match in Flashscore' });
    }

    // Fetch stats using the real Flashscore match ID
    const stats = await getMatchStatsWithCache(sourceMatchId);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      stats,
      fetchedAt: new Date().toISOString()
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
