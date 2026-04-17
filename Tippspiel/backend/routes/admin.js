const express = require('express');
const pool = require('../db');
const { adminMiddleware } = require('../middleware/auth');
const { syncMatchesFromFootballData } = require('../services/footballData');

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
