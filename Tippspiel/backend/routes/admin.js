const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const ExcelJS = require('exceljs');
const { adminMiddleware } = require('../middleware/auth');
const { syncMatchesFromFootballData } = require('../services/footballData');
const { areBonusFeaturesAvailable, isMissingRelationError } = require('../services/bonusFeatures');
const { testRapidApi, isRapidApiConfigured } = require('../services/rapidApi');
const { importFlashscoreBundesligaMatches } = require('../services/flashscoreBundesligaImport');

const router = express.Router();

router.get('/integrations/rapidapi/test', adminMiddleware, async (req, res) => {
  try {
    if (!isRapidApiConfigured()) {
      return res.status(400).json({
        error: 'API-FOOTBALL ist nicht konfiguriert',
        requiredEnvEither: [
          ['RAPIDAPI_KEY', 'RAPIDAPI_HOST'],
          ['APIFOOTBALL_KEY']
        ],
        optionalEnv: ['APIFOOTBALL_BASE_URL', 'RAPIDAPI_TEST_PATH', 'RAPIDAPI_ODDS_PATH']
      });
    }

    const path = req.query.path || process.env.RAPIDAPI_TEST_PATH || process.env.RAPIDAPI_ODDS_PATH;
    if (!path) {
      return res.status(400).json({
        error: 'Kein Testpfad gesetzt. Uebergib ?path=/... oder setze RAPIDAPI_TEST_PATH'
      });
    }

    const queryParams = { ...req.query };
    delete queryParams.path;

    const result = await testRapidApi(path, queryParams);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.message || 'RapidAPI Test fehlgeschlagen',
      details: err.details || null
    });
  }
});

router.get('/tips/export', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.id,
         u.username,
         u.email,
         m.round,
         m.match_date,
         m.home_team,
         m.away_team,
         t.home_goals,
         t.away_goals,
         t.created_at,
         t.updated_at
       FROM tips t
       JOIN users u ON u.id = t.user_id
       JOIN matches m ON m.id = t.match_id
       ORDER BY m.match_date ASC, u.username ASC`
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WM Tippspiel';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Tipps');
    worksheet.columns = [
      { header: 'Tipp-ID', key: 'tip_id', width: 10 },
      { header: 'Benutzername', key: 'username', width: 24 },
      { header: 'E-Mail', key: 'email', width: 30 },
      { header: 'Runde', key: 'round', width: 18 },
      { header: 'Spieldatum', key: 'match_date', width: 20 },
      { header: 'Heimteam', key: 'home_team', width: 20 },
      { header: 'Gastteam', key: 'away_team', width: 20 },
      { header: 'Tipp Heimtore', key: 'home_goals', width: 14 },
      { header: 'Tipp Gasttore', key: 'away_goals', width: 14 },
      { header: 'Erstellt am', key: 'created_at', width: 20 },
      { header: 'Aktualisiert am', key: 'updated_at', width: 20 }
    ];

    const dateFormat = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'medium'
    });

    result.rows.forEach((row) => {
      worksheet.addRow({
        tip_id: row.id,
        username: row.username,
        email: row.email,
        round: row.round || '-',
        match_date: dateFormat.format(new Date(row.match_date)),
        home_team: row.home_team,
        away_team: row.away_team,
        home_goals: row.home_goals,
        away_goals: row.away_goals,
        created_at: dateFormat.format(new Date(row.created_at)),
        updated_at: dateFormat.format(new Date(row.updated_at))
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length }
    };

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const fileName = `tipps-export-${yyyy}-${mm}-${dd}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fehler beim Erstellen des Excel-Exports' });
  }
});

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

router.post('/matches/import/bundesliga', adminMiddleware, async (req, res) => {
  try {
    const importResult = await importFlashscoreBundesligaMatches(pool);
    res.json({
      message: `Bundesliga-Import abgeschlossen: ${importResult.createdCount} neu, ${importResult.updatedCount} aktualisiert, ${importResult.totalFetched} von API erhalten, ${importResult.totalProcessed} verarbeitet.`,
      ...importResult
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Bundesliga-Import fehlgeschlagen' });
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

// Update user profile data (admin only)
router.put('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role } = req.body;
    const currentAdminId = String(req.user?.id || '');
    const targetUserId = String(id);

    const usernameNormalized = String(username || '').trim();
    const emailNormalized = String(email || '').trim().toLowerCase();
    const roleNormalized = String(role || '').trim().toLowerCase();

    if (!usernameNormalized || !emailNormalized || !roleNormalized) {
      return res.status(400).json({ error: 'Benutzername, E-Mail und Rolle sind erforderlich' });
    }

    if (!['user', 'admin'].includes(roleNormalized)) {
      return res.status(400).json({ error: 'Ungültige Rolle' });
    }

    if (currentAdminId && currentAdminId === targetUserId && roleNormalized !== 'admin') {
      return res.status(400).json({ error: 'Du kannst dir die Admin-Rolle nicht selbst entziehen' });
    }

    const duplicateResult = await pool.query(
      `SELECT id
       FROM users
       WHERE (username = $1 OR email = $2)
         AND id <> $3
       LIMIT 1`,
      [usernameNormalized, emailNormalized, id]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(400).json({ error: 'Benutzername oder E-Mail ist bereits vergeben' });
    }

    const result = await pool.query(
      `UPDATE users
       SET username = $1,
           email = $2,
           role = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, username, email, role, created_at`,
      [usernameNormalized, emailNormalized, roleNormalized, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password (admin only)
router.post('/users/:id/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    const result = await pool.query(
      `UPDATE users
       SET password = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [hashedPassword, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Passwort wurde zurückgesetzt' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const currentAdminId = String(req.user?.id || '');
    const targetUserId = String(id);

    if (currentAdminId && currentAdminId === targetUserId) {
      return res.status(400).json({ error: 'Du kannst deinen eigenen Account nicht löschen' });
    }

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
