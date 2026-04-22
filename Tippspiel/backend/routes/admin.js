const express = require('express');
const pool = require('../db');
const { adminMiddleware } = require('../middleware/auth');
const { syncMatchesFromFootballData } = require('../services/footballData');
const { areBonusFeaturesAvailable, isMissingRelationError } = require('../services/bonusFeatures');

const router = express.Router();

router.post('/matches/sync', adminMiddleware, async (req, res) => {
  try {
    const syncResult = await syncMatchesFromFootballData(pool);
    res.json({
      message: `Synchronisierung abgeschlossen: ${syncResult.createdCount} neu, ${syncResult.updatedCount} aktualisiert.`,
      ...syncResult
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Synchronisierung fehlgeschlagen' });
  }
});

// Get current tournament bonus result settings
router.get('/bonus-result', adminMiddleware, async (req, res) => {
  try {
    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    if (!bonusFeaturesAvailable) {
      return res.json(null);
    }

    const result = await pool.query(
      `SELECT id, champion_team, runner_up_team, champion_points, runner_up_points, updated_at
       FROM tournament_bonus_result
       WHERE id = 1`
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.json(null);
    }
    res.status(500).json({ error: 'Failed to fetch bonus result config' });
  }
});

// Set tournament bonus result settings
router.put('/bonus-result', adminMiddleware, async (req, res) => {
  try {
    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    if (!bonusFeaturesAvailable) {
      return res.status(503).json({ error: 'Bonus-Auswertung ist noch nicht aktiviert. Migration fehlt.' });
    }

    const {
      champion_team,
      runner_up_team,
      champion_points,
      runner_up_points
    } = req.body;

    if (!champion_team || !runner_up_team) {
      return res.status(400).json({ error: 'Weltmeister und Vizemeister sind erforderlich' });
    }

    if (champion_team === runner_up_team) {
      return res.status(400).json({ error: 'Weltmeister und Vizemeister müssen unterschiedlich sein' });
    }

    const championPoints = Number.isInteger(champion_points) ? champion_points : 5;
    const runnerUpPoints = Number.isInteger(runner_up_points) ? runner_up_points : 3;

    const result = await pool.query(
      `INSERT INTO tournament_bonus_result (id, champion_team, runner_up_team, champion_points, runner_up_points)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id)
       DO UPDATE SET champion_team = EXCLUDED.champion_team,
                     runner_up_team = EXCLUDED.runner_up_team,
                     champion_points = EXCLUDED.champion_points,
                     runner_up_points = EXCLUDED.runner_up_points,
                     updated_at = NOW()
       RETURNING id, champion_team, runner_up_team, champion_points, runner_up_points, updated_at`,
      [champion_team, runner_up_team, championPoints, runnerUpPoints]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.status(503).json({ error: 'Bonus-Auswertung ist noch nicht aktiviert. Migration fehlt.' });
    }
    res.status(500).json({ error: 'Failed to update bonus result config' });
  }
});

// Create match
router.post('/matches', adminMiddleware, async (req, res) => {
  try {
    const { home_team, away_team, match_date, round } = req.body;

    if (!home_team || !away_team || !match_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      'INSERT INTO matches (home_team, away_team, match_date, round) VALUES ($1, $2, $3, $4) RETURNING *',
      [home_team, away_team, match_date, round || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// Update match details
router.put('/matches/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { home_team, away_team, match_date, round, reset_result } = req.body;

    if (!home_team || !away_team || !match_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let result;

    if (reset_result) {
      result = await pool.query(
        `UPDATE matches
         SET home_team = $1,
             away_team = $2,
             match_date = $3,
             round = $4,
             home_goals = NULL,
             away_goals = NULL,
             finished = false,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [home_team, away_team, match_date, round || null, id]
      );
    } else {
      result = await pool.query(
        `UPDATE matches
         SET home_team = $1,
             away_team = $2,
             match_date = $3,
             round = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [home_team, away_team, match_date, round || null, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// Update match result
router.put('/matches/:id/result', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { home_goals, away_goals } = req.body;

    if (home_goals === undefined || away_goals === undefined) {
      return res.status(400).json({ error: 'Missing goals' });
    }

    const result = await pool.query(
      'UPDATE matches SET home_goals = $1, away_goals = $2, finished = true, updated_at = NOW() WHERE id = $3 RETURNING *',
      [home_goals, away_goals, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

// Get all users (admin only)
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related tips first (foreign key constraint)
    await pool.query('DELETE FROM tips WHERE user_id = $1', [id]);
    
    // Delete user
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
