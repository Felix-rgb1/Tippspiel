const express = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Submit a tip
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { match_id, home_goals, away_goals } = req.body;
    const user_id = req.user.id;

    // Check if match exists
    const matchResult = await pool.query(
      'SELECT match_date FROM matches WHERE id = $1',
      [match_id]
    );

    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Check if deadline passed (1 hour before match)
    const matchDate = new Date(matchResult.rows[0].match_date);
    const deadline = new Date(matchDate.getTime() - 60 * 60 * 1000);
    
    if (new Date() > deadline) {
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

// Get current user's bonus tips
router.get('/bonus/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const bonusResult = await pool.query(
      'SELECT champion_team, runner_up_team, created_at, updated_at FROM bonus_tips WHERE user_id = $1',
      [userId]
    );

    const firstMatchResult = await pool.query('SELECT MIN(match_date) AS first_match_date FROM matches');
    const firstMatchDate = firstMatchResult.rows[0]?.first_match_date;
    const deadline = firstMatchDate
      ? new Date(new Date(firstMatchDate).getTime() - 60 * 60 * 1000)
      : null;

    const locked = deadline ? new Date() > deadline : false;

    res.json({
      bonusTip: bonusResult.rows[0] || null,
      deadline: deadline ? deadline.toISOString() : null,
      locked
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bonus tips' });
  }
});

// Submit or update bonus tips (Weltmeister / Vizemeister)
router.post('/bonus', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { champion_team, runner_up_team } = req.body;

    if (!champion_team || !runner_up_team) {
      return res.status(400).json({ error: 'Bitte Weltmeister und Vizemeister angeben' });
    }

    if (champion_team === runner_up_team) {
      return res.status(400).json({ error: 'Weltmeister und Vizemeister müssen unterschiedlich sein' });
    }

    const firstMatchResult = await pool.query('SELECT MIN(match_date) AS first_match_date FROM matches');
    const firstMatchDate = firstMatchResult.rows[0]?.first_match_date;
    const deadline = firstMatchDate
      ? new Date(new Date(firstMatchDate).getTime() - 60 * 60 * 1000)
      : null;

    if (deadline && new Date() > deadline) {
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
    res.status(500).json({ error: 'Failed to save bonus tips' });
  }
});

module.exports = router;
