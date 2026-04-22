const express = require('express');
const pool = require('../db');
const { areBonusFeaturesAvailable, isMissingRelationError } = require('../services/bonusFeatures');

const router = express.Router();

// Get leaderboard
router.get('/', async (req, res) => {
  try {
    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    const leaderboardQuery = bonusFeaturesAvailable ? `
      WITH scored_tips AS (
        SELECT
          t.user_id,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS points,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
            ELSE 0
          END AS exact_hit,
          CASE
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS trend_hit
        FROM tips t
        JOIN matches m ON m.id = t.match_id
        WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
      ),
      scored_totals AS (
        SELECT
          user_id,
          SUM(points) AS match_points,
          SUM(exact_hit) AS exact_matches,
          SUM(trend_hit) AS trend_matches
        FROM scored_tips
        GROUP BY user_id
      ),
      tips_totals AS (
        SELECT
          user_id,
          COUNT(*) AS tips_submitted,
          MIN(created_at) AS first_tip_submitted_at
        FROM tips
        GROUP BY user_id
      ),
      bonus_totals AS (
        SELECT
          bt.user_id,
          (
            CASE WHEN bt.champion_team = cfg.champion_team THEN cfg.champion_points ELSE 0 END +
            CASE WHEN bt.runner_up_team = cfg.runner_up_team THEN cfg.runner_up_points ELSE 0 END
          ) AS bonus_points
        FROM bonus_tips bt
        JOIN tournament_bonus_result cfg ON cfg.id = 1
      )
      SELECT 
        u.id,
        u.username,
        COALESCE(tt.tips_submitted, 0) AS tips_submitted,
        COALESCE(st.match_points, 0) AS match_points,
        COALESCE(bt.bonus_points, 0) AS bonus_points,
        COALESCE(st.match_points, 0) + COALESCE(bt.bonus_points, 0) AS total_points,
        COALESCE(st.exact_matches, 0) AS exact_matches,
        COALESCE(st.trend_matches, 0) AS trend_matches,
        tt.first_tip_submitted_at
      FROM users u
      LEFT JOIN tips_totals tt ON tt.user_id = u.id
      LEFT JOIN scored_totals st ON st.user_id = u.id
      LEFT JOIN bonus_totals bt ON bt.user_id = u.id
      ORDER BY total_points DESC,
               exact_matches DESC,
               trend_matches DESC,
               tt.first_tip_submitted_at ASC NULLS LAST,
               u.username ASC
    ` : `
      WITH scored_tips AS (
        SELECT
          t.user_id,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS points,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
            ELSE 0
          END AS exact_hit,
          CASE
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS trend_hit
        FROM tips t
        JOIN matches m ON m.id = t.match_id
        WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
      ),
      scored_totals AS (
        SELECT
          user_id,
          SUM(points) AS match_points,
          SUM(exact_hit) AS exact_matches,
          SUM(trend_hit) AS trend_matches
        FROM scored_tips
        GROUP BY user_id
      ),
      tips_totals AS (
        SELECT
          user_id,
          COUNT(*) AS tips_submitted,
          MIN(created_at) AS first_tip_submitted_at
        FROM tips
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.username,
        COALESCE(tt.tips_submitted, 0) AS tips_submitted,
        COALESCE(st.match_points, 0) AS match_points,
        0 AS bonus_points,
        COALESCE(st.match_points, 0) AS total_points,
        COALESCE(st.exact_matches, 0) AS exact_matches,
        COALESCE(st.trend_matches, 0) AS trend_matches,
        tt.first_tip_submitted_at
      FROM users u
      LEFT JOIN tips_totals tt ON tt.user_id = u.id
      LEFT JOIN scored_totals st ON st.user_id = u.id
      ORDER BY total_points DESC,
               exact_matches DESC,
               trend_matches DESC,
               tt.first_tip_submitted_at ASC NULLS LAST,
               u.username ASC
    `;

    const result = await pool.query(leaderboardQuery);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.status(500).json({ error: 'Bonus-Migration fehlt. Bitte Backend aktualisieren.' });
    }
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get matchday leaderboard (Spieltagwertung)
router.get('/matchday', async (req, res) => {
  try {
    const roundsResult = await pool.query(`
      SELECT round
      FROM matches
      WHERE finished = true AND round IS NOT NULL
      GROUP BY round
      ORDER BY MIN(match_date) ASC
    `);

    const rounds = roundsResult.rows.map((row) => row.round);
    const selectedRound = req.query.round || rounds[0] || null;

    if (!selectedRound) {
      return res.json({ rounds: [], selectedRound: null, entries: [] });
    }

    const result = await pool.query(`
      WITH round_scored_tips AS (
        SELECT
          t.user_id,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS points,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
            ELSE 0
          END AS exact_hit,
          CASE
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS trend_hit
        FROM tips t
        JOIN matches m ON m.id = t.match_id
        WHERE m.finished = true
          AND m.round = $1
          AND m.home_goals IS NOT NULL
          AND m.away_goals IS NOT NULL
      )
      SELECT
        u.id,
        u.username,
        COALESCE(SUM(rst.points), 0) AS round_points,
        COALESCE(COUNT(rst.points), 0) AS tips_count,
        COALESCE(SUM(rst.exact_hit), 0) AS exact_matches,
        COALESCE(SUM(rst.trend_hit), 0) AS trend_matches
      FROM users u
      LEFT JOIN round_scored_tips rst ON rst.user_id = u.id
      GROUP BY u.id, u.username
      ORDER BY round_points DESC, exact_matches DESC, trend_matches DESC, u.username ASC
    `, [selectedRound]);

    res.json({
      rounds,
      selectedRound,
      entries: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matchday leaderboard' });
  }
});

// Get user stats
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const bonusFeaturesAvailable = await areBonusFeaturesAvailable(pool);

    const statsQuery = bonusFeaturesAvailable ? `
      WITH scored_tips AS (
        SELECT
          t.user_id,
          m.id AS match_id,
          m.round,
          m.match_date,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS points,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
            ELSE 0
          END AS exact_hit,
          CASE
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS trend_hit
        FROM tips t
        JOIN matches m ON t.match_id = m.id
        WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
      ),
      user_scored AS (
        SELECT * FROM scored_tips WHERE user_id = $1
      ),
      bonus_points AS (
        SELECT
          bt.user_id,
          (
            CASE WHEN bt.champion_team = cfg.champion_team THEN cfg.champion_points ELSE 0 END +
            CASE WHEN bt.runner_up_team = cfg.runner_up_team THEN cfg.runner_up_points ELSE 0 END
          ) AS points
        FROM bonus_tips bt
        JOIN tournament_bonus_result cfg ON cfg.id = 1
        WHERE bt.user_id = $1
      )
      SELECT 
        u.id,
        u.username,
        u.created_at,
        COALESCE((SELECT COUNT(*) FROM tips t WHERE t.user_id = u.id), 0) AS tips_submitted,
        COALESCE((SELECT SUM(points) FROM user_scored), 0) + COALESCE((SELECT points FROM bonus_points), 0) AS total_points,
        COALESCE((SELECT SUM(points) FROM user_scored), 0) AS match_points,
        COALESCE((SELECT points FROM bonus_points), 0) AS bonus_points,
        COALESCE((SELECT SUM(exact_hit) FROM user_scored), 0) AS exact_matches,
        COALESCE((SELECT SUM(trend_hit) FROM user_scored), 0) AS trend_matches,
        (SELECT COUNT(*) FROM matches) AS total_matches,
        (
          SELECT COALESCE(
            ROUND((COUNT(*) FILTER (WHERE t.user_id = u.id)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1),
            0
          )
          FROM matches m
          LEFT JOIN tips t ON t.match_id = m.id AND t.user_id = u.id
        ) AS activity_rate
      FROM users u
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.created_at
    ` : `
      WITH scored_tips AS (
        SELECT
          t.user_id,
          m.id AS match_id,
          m.round,
          m.match_date,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS points,
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 1
            ELSE 0
          END AS exact_hit,
          CASE
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END AS trend_hit
        FROM tips t
        JOIN matches m ON t.match_id = m.id
        WHERE m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
      ),
      user_scored AS (
        SELECT * FROM scored_tips WHERE user_id = $1
      )
      SELECT
        u.id,
        u.username,
        u.created_at,
        COALESCE((SELECT COUNT(*) FROM tips t WHERE t.user_id = u.id), 0) AS tips_submitted,
        COALESCE((SELECT SUM(points) FROM user_scored), 0) AS total_points,
        COALESCE((SELECT SUM(points) FROM user_scored), 0) AS match_points,
        0 AS bonus_points,
        COALESCE((SELECT SUM(exact_hit) FROM user_scored), 0) AS exact_matches,
        COALESCE((SELECT SUM(trend_hit) FROM user_scored), 0) AS trend_matches,
        (SELECT COUNT(*) FROM matches) AS total_matches,
        (
          SELECT COALESCE(
            ROUND((COUNT(*) FILTER (WHERE t.user_id = u.id)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1),
            0
          )
          FROM matches m
          LEFT JOIN tips t ON t.match_id = m.id AND t.user_id = u.id
        ) AS activity_rate
      FROM users u
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.created_at
    `;

    const statsResult = await pool.query(statsQuery, [userId]);

    if (statsResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const roundPointsResult = await pool.query(`
      SELECT
        m.round,
        SUM(
          CASE
            WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
            WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
                 (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
                 (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
            ELSE 0
          END
        ) AS points
      FROM tips t
      JOIN matches m ON t.match_id = m.id
      WHERE t.user_id = $1
        AND m.finished = true
        AND m.round IS NOT NULL
      GROUP BY m.round
      ORDER BY MIN(m.match_date)
    `, [userId]);

    const formResult = await pool.query(`
      SELECT
        m.id,
        m.home_team,
        m.away_team,
        m.match_date,
        CASE
          WHEN t.home_goals = m.home_goals AND t.away_goals = m.away_goals THEN 3
          WHEN (t.home_goals > t.away_goals AND m.home_goals > m.away_goals) OR
               (t.home_goals < t.away_goals AND m.home_goals < m.away_goals) OR
               (t.home_goals = t.away_goals AND m.home_goals = m.away_goals) THEN 1
          ELSE 0
        END AS points
      FROM tips t
      JOIN matches m ON t.match_id = m.id
      WHERE t.user_id = $1
        AND m.finished = true
      ORDER BY m.match_date DESC
      LIMIT 5
    `, [userId]);

    let bonusTipResult = { rows: [] };

    if (bonusFeaturesAvailable) {
      bonusTipResult = await pool.query(
        'SELECT champion_team, runner_up_team FROM bonus_tips WHERE user_id = $1',
        [userId]
      );
    }

    res.json({
      ...statsResult.rows[0],
      round_points: roundPointsResult.rows,
      form_last_five: formResult.rows.reverse(),
      bonus_tip: bonusTipResult.rows[0] || null
    });
  } catch (err) {
    console.error(err);
    if (isMissingRelationError(err)) {
      return res.status(500).json({ error: 'Bonus-Migration fehlt. Bitte Backend aktualisieren.' });
    }
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

module.exports = router;
