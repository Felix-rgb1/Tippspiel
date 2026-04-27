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

    const liveResult = await getLiveScoresForMatches(result.rows);

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
