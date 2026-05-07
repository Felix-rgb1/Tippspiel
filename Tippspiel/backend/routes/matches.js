const express = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getMatchInsights } = require('../services/footballData');
const { getLiveScoresForMatches } = require('../services/liveScores');

const router = express.Router();

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
    const rawIds = String(req.query.ids || '')
      .split(',')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!rawIds.length) {
      return res.json({
        updates: {},
        fetchedAt: new Date().toISOString(),
        nextPollInMs: 180000,
        usedProvider: false
      });
    }

    const result = await pool.query(
      `SELECT id, home_team, away_team, match_date, finished, external_source
       FROM matches
       WHERE id = ANY($1::int[])`,
      [rawIds]
    );

    const liveResult = await getLiveScoresForMatches(result.rows, pool);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(liveResult);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch live scores' });
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
