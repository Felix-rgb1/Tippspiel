const express = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { areBonusFeaturesAvailable, isMissingRelationError } = require('../services/bonusFeatures');

const router = express.Router();
const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.FLASHSCORE_TIMEZONE || 'Europe/Berlin';

// Submit a tip
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { match_id, home_goals, away_goals } = req.body;
    const user_id = req.user.id;

    // Check if match exists
    const matchResult = await pool.query(
      `SELECT
         match_date,
         (match_date - INTERVAL '1 hour') <= (NOW() AT TIME ZONE $2) AS is_locked
       FROM matches
       WHERE id = $1`,
      [match_id, APP_TIMEZONE]
    );

    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Check if deadline passed (1 hour before match)
    if (Boolean(matchResult.rows[0].is_locked)) {
      return res.status(400).json({ error: 'Deadline for this match has passed' });
    }

    // Check if tip already exists
    const existingTip = await pool.query(
      'SELECT id FROM tips WHERE user_id = $1 AND match_id = $2',
      [user_id, match_id]
    );

    if (existingTip.rows.length > 0) {
      // Update existing tip
      await pool.query(
        'UPDATE tips SET home_goals = $1, away_goals = $2, updated_at = NOW() WHERE user_id = $3 AND match_id = $4',
        [home_goals, away_goals, user_id, match_id]
      );
    } else {
      // Create new tip
      await pool.query(
        'INSERT INTO tips (user_id, match_id, home_goals, away_goals) VALUES ($1, $2, $3, $4)',
        [user_id, match_id, home_goals, away_goals]
      );
    }

    res.json({ message: 'Tip submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit tip' });
  }
});

// Get user's tips
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT t.*, m.home_team, m.away_team, m.match_date, m.home_goals as final_home_goals, m.away_goals as final_away_goals
       FROM tips t
       JOIN matches m ON t.match_id = m.id
       WHERE t.user_id = $1
       ORDER BY m.match_date ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tips' });
  }
});

// Get visible tips from all players for matches whose deadline has passed
router.get('/visible', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.match_id,
         t.user_id,
         u.username,
         t.home_goals,
         t.away_goals,
         t.created_at,
         t.updated_at,
         m.match_date
       FROM tips t
       JOIN users u ON u.id = t.user_id
       JOIN matches m ON m.id = t.match_id
       WHERE (m.match_date - INTERVAL '1 hour') <= (NOW() AT TIME ZONE $1)
       ORDER BY m.match_date ASC, u.username ASC`
      ,
      [APP_TIMEZONE]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visible tips' });
  }
});

// Get current user's bonus tips
router.get('/bonus/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    if (!bonusFeaturesAvailable) {
      return res.json({
        bonusTip: null,
        deadline: null,
        locked: false,
        unavailable: true
      });
    }

    const bonusResult = await pool.query(
      'SELECT champion_team, runner_up_team, created_at, updated_at FROM bonus_tips WHERE user_id = $1',
      [userId]
    );

    const firstMatchResult = await pool.query('SELECT MIN(match_date) AS first_match_date FROM matches');
    const firstMatchDate = firstMatchResult.rows[0]?.first_match_date;
    // Bonusfrage locked after first match starts (not 1 hour before)
    const locked = firstMatchDate ? new Date() > new Date(firstMatchDate) : false;

    res.json({
      bonusTip: bonusResult.rows[0] || null,
      deadline: firstMatchDate ? new Date(firstMatchDate).toISOString() : null,
      locked
    });
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.json({
        bonusTip: null,
        deadline: null,
        locked: false,
        unavailable: true
      });
    }
    res.status(500).json({ error: 'Failed to fetch bonus tips' });
  }
});

// Get all bonus tips once the deadline has passed
router.get('/bonus/visible', authMiddleware, async (req, res) => {
  try {
    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    if (!bonusFeaturesAvailable) {
      return res.json({
        tips: [],
        deadline: null,
        locked: false,
        unavailable: true
      });
    }

    const firstMatchResult = await pool.query('SELECT MIN(match_date) AS first_match_date FROM matches');
    const firstMatchDate = firstMatchResult.rows[0]?.first_match_date;
    const locked = firstMatchDate ? new Date() > new Date(firstMatchDate) : false;

    if (!locked) {
      return res.json({
        tips: [],
        deadline: firstMatchDate ? new Date(firstMatchDate).toISOString() : null,
        locked: false
      });
    }

    const result = await pool.query(
      `SELECT
         bt.user_id,
         u.username,
         COALESCE(u.avatar, '⚽') AS avatar,
         bt.champion_team,
         bt.runner_up_team,
         bt.created_at,
         bt.updated_at
       FROM bonus_tips bt
       JOIN users u ON u.id = bt.user_id
       ORDER BY LOWER(u.username) ASC, u.username ASC`
    );

    res.json({
      tips: result.rows,
      deadline: firstMatchDate ? new Date(firstMatchDate).toISOString() : null,
      locked: true
    });
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.json({
        tips: [],
        deadline: null,
        locked: false,
        unavailable: true
      });
    }
    res.status(500).json({ error: 'Failed to fetch visible bonus tips' });
  }
});

// Submit or update bonus tips (Weltmeister / Vizemeister)
router.post('/bonus', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { champion_team, runner_up_team } = req.body;

    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    if (!bonusFeaturesAvailable) {
      return res.status(503).json({ error: 'Bonusfragen sind noch nicht aktiviert. Migration fehlt.' });
    }

    if (!champion_team || !runner_up_team) {
      return res.status(400).json({ error: 'Bitte Weltmeister und Vizemeister angeben' });
    }

    if (champion_team === runner_up_team) {
      return res.status(400).json({ error: 'Weltmeister und Vizemeister müssen unterschiedlich sein' });
    }

    const firstMatchResult = await pool.query('SELECT MIN(match_date) AS first_match_date FROM matches');
    const firstMatchDate = firstMatchResult.rows[0]?.first_match_date;
    // Bonusfrage locked after first match starts (not 1 hour before)
    const locked = firstMatchDate ? new Date() > new Date(firstMatchDate) : false;

    if (locked) {
      return res.status(400).json({ error: 'Deadline für Bonusfragen ist abgelaufen' });
    }

    await pool.query(
      `INSERT INTO bonus_tips (user_id, champion_team, runner_up_team)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET champion_team = EXCLUDED.champion_team,
                     runner_up_team = EXCLUDED.runner_up_team,
                     updated_at = NOW()`,
      [userId, champion_team, runner_up_team]
    );

    res.json({ message: 'Bonusfragen gespeichert' });
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.status(503).json({ error: 'Bonusfragen sind noch nicht aktiviert. Migration fehlt.' });
    }
    res.status(500).json({ error: 'Failed to save bonus tips' });
  }
});

module.exports = router;
