const express = require('express');
const pool = require('../server');

const router = express.Router();

// Get leaderboard
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(t.id) as tips_submitted,
        SUM(CASE 
          WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
          WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
               (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
               (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
          ELSE 0
        END) as total_points
      FROM users u
      LEFT JOIN tips t ON u.id = t.user_id
      LEFT JOIN matches m ON t.match_id = m.id AND m.home_goals IS NOT NULL
      GROUP BY u.id, u.username
      ORDER BY total_points DESC NULLS LAST
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user stats
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.created_at,
        COUNT(t.id) as tips_submitted,
        SUM(CASE 
          WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
          WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
               (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
               (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
          ELSE 0
        END) as total_points,
        SUM(CASE 
          WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
          ELSE 0
        END) as exact_matches,
        SUM(CASE 
          WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
               (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
               (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
          ELSE 0
        END) as trend_matches
      FROM users u
      LEFT JOIN tips t ON u.id = t.user_id
      LEFT JOIN matches m ON t.match_id = m.id AND m.home_goals IS NOT NULL
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.created_at
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

module.exports = router;
