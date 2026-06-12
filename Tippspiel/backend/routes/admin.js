const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const ExcelJS = require('exceljs');
const { adminMiddleware } = require('../middleware/auth');
const { areBonusFeaturesAvailable, isMissingRelationError } = require('../services/bonusFeatures');
const { testRapidApi, isRapidApiConfigured, fetchFlashscoreLiveMatches } = require('../services/rapidApi');
const { getLiveScoresForMatches } = require('../services/liveScores');
const {
  importFlashscoreBundesligaMatches,
  importFlashscoreWMMatches,
  syncWMResults,
  syncBundesligaResults
} = require('../services/flashscoreBundesligaImport');
const { importLiveTodayMatches } = require('../importLiveToday');

const router = express.Router();

function isLikelyRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.statusCode === 429 || message.includes('429') || message.includes('rate-limit') || message.includes('rate limit');
}

router.get('/integrations/live/health', adminMiddleware, async (req, res) => {
  const startedAt = Date.now();

  try {
    const host = String(process.env.RAPIDAPI_HOST || '').trim();
    const provider = String(process.env.RAPIDAPI_PROVIDER || 'rapidapi').trim().toLowerCase();
    const timezone = String(process.env.FLASHSCORE_TIMEZONE || 'Europe/Berlin').trim();
    const tournamentUrl = String(process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/').trim();

    const hostLooksFlashscore = host.includes('flashscore');
    const configured = isRapidApiConfigured();

    const payload = {
      ok: false,
      timestamp: new Date().toISOString(),
      durationMs: null,
      checks: {
        configuration: {
          configured,
          host: host || null,
          provider,
          timezone,
          tournamentUrl,
          hostLooksFlashscore
        },
        liveEndpoint: {
          ok: false,
          statusCode: null,
          rateLimited: false,
          liveMatchCount: 0,
          sampleMatchIds: []
        },
        wmMapping: {
          ok: false,
          checkedDbMatches: 0,
          mappedUpdates: 0,
          mappingCoverage: 0,
          sampleUnmappedDbIds: []
        }
      },
      status: 'fail',
      recommendations: []
    };

    if (!configured) {
      payload.recommendations.push('Setze RAPIDAPI_KEY und RAPIDAPI_HOST.');
    }

    if (!hostLooksFlashscore) {
      payload.recommendations.push('Setze RAPIDAPI_HOST auf einen Flashscore-Host (z.B. flashscore4.p.rapidapi.com).');
    }

    let liveMatches = [];
    try {
      liveMatches = await fetchFlashscoreLiveMatches({ sportId: 1, timezone });
      payload.checks.liveEndpoint = {
        ok: true,
        statusCode: 200,
        rateLimited: false,
        liveMatchCount: Array.isArray(liveMatches) ? liveMatches.length : 0,
        sampleMatchIds: (Array.isArray(liveMatches) ? liveMatches : [])
          .map((m) => m?.match_id || m?.id || m?.event_id)
          .filter(Boolean)
          .slice(0, 8)
      };
    } catch (error) {
      payload.checks.liveEndpoint = {
        ok: false,
        statusCode: error?.statusCode || null,
        rateLimited: isLikelyRateLimitError(error),
        liveMatchCount: 0,
        sampleMatchIds: [],
        error: error?.message || 'Live endpoint failed'
      };
    }

    const wmDbResult = await pool.query(
      `SELECT id, home_team, away_team, match_date, finished, external_source, external_id
       FROM matches
       WHERE external_source = 'flashscore-wm'
         AND (finished = false OR finished IS NULL)
         AND match_date >= NOW() - INTERVAL '6 hours'
         AND match_date <= NOW() + INTERVAL '72 hours'
       ORDER BY match_date ASC
       LIMIT 30`
    );

    const wmCandidates = wmDbResult.rows;
    let mappedUpdates = 0;
    let sampleUnmappedDbIds = [];

    if (wmCandidates.length > 0) {
      try {
        const mapping = await getLiveScoresForMatches(wmCandidates, pool, { forceCheckAll: true });
        const updates = mapping?.updates || {};
        mappedUpdates = Object.keys(updates).length;
        sampleUnmappedDbIds = wmCandidates
          .filter((match) => !Object.prototype.hasOwnProperty.call(updates, String(match.id)))
          .map((match) => match.id)
          .slice(0, 8);

        payload.checks.wmMapping = {
          ok: true,
          checkedDbMatches: wmCandidates.length,
          mappedUpdates,
          mappingCoverage: wmCandidates.length > 0
            ? Number((mappedUpdates / wmCandidates.length).toFixed(3))
            : 0,
          sampleUnmappedDbIds
        };
      } catch (error) {
        payload.checks.wmMapping = {
          ok: false,
          checkedDbMatches: wmCandidates.length,
          mappedUpdates: 0,
          mappingCoverage: 0,
          sampleUnmappedDbIds: wmCandidates.map((match) => match.id).slice(0, 8),
          error: error?.message || 'WM mapping check failed'
        };
      }
    } else {
      payload.checks.wmMapping = {
        ok: true,
        checkedDbMatches: 0,
        mappedUpdates: 0,
        mappingCoverage: 0,
        sampleUnmappedDbIds: []
      };
      payload.recommendations.push('Keine unverarbeiteten WM-Spiele im 72h-Fenster gefunden.');
    }

    const endpointFailed = !payload.checks.liveEndpoint.ok;
    const rateLimited = Boolean(payload.checks.liveEndpoint.rateLimited);
    const mappingFailed = !payload.checks.wmMapping.ok;

    if (endpointFailed || rateLimited || mappingFailed || !configured || !hostLooksFlashscore) {
      payload.status = 'fail';
      payload.ok = false;
    } else {
      const lowCoverage = payload.checks.wmMapping.checkedDbMatches > 0
        && payload.checks.wmMapping.mappedUpdates === 0
        && payload.checks.liveEndpoint.liveMatchCount > 0;

      if (lowCoverage) {
        payload.status = 'warn';
        payload.ok = true;
        payload.recommendations.push('Live-Daten vorhanden, aber kein WM-Mapping. Prüfe external_id und Teamschreibweise in der DB.');
      } else {
        payload.status = 'ok';
        payload.ok = true;
      }
    }

    if (payload.checks.liveEndpoint.rateLimited) {
      payload.recommendations.push('Rate-Limit aktiv: Polling-Intervall erhöhen oder später erneut pruefen.');
    }

    payload.durationMs = Date.now() - startedAt;
    const statusCode = payload.status === 'fail' ? 503 : 200;
    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error('[LIVE-HEALTHCHECK]', err.message || err);
    return res.status(500).json({
      ok: false,
      status: 'fail',
      error: err.message || 'Live healthcheck failed',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt
    });
  }
});

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

router.post('/matches/import/wm', adminMiddleware, (req, res) => {
  // Fire-and-forget: Render hat ein 30s Request-Timeout, der Import dauert ~2 Minuten.
  // Wir starten den Import im Hintergrund und antworten sofort mit 202.
  importFlashscoreWMMatches(pool)
    .then((importResult) => {
      const roundStats = importResult.detailsRoundStats || {};
      console.log(`[WM-IMPORT] Abgeschlossen: ${importResult.createdCount} neu, ${importResult.updatedCount} aktualisiert, ${importResult.totalFetched} von API. Runden aufgelöst: ${roundStats.resolvedCount || 0}`);
    })
    .catch((err) => {
      console.error('[WM-IMPORT] Fehler:', err.message || err);
    });

  res.status(202).json({
    message: 'WM-Import gestartet. Dies kann 2-3 Minuten dauern. Bitte Seite danach neu laden.'
  });
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

router.post('/matches/import/live-today', adminMiddleware, async (req, res) => {
  try {
    const source = String(req.body?.source || 'any').trim().toLowerCase();
    const max = Number.parseInt(String(req.body?.max || '1'), 10);
    const tournamentUrl = String(req.body?.tournamentUrl || '').trim();

    const importResult = await importLiveTodayMatches({
      source,
      max: Number.isFinite(max) && max > 0 ? max : 1,
      tournamentUrl
    });

    const first = importResult.selected?.[0];
    const firstLabel = first ? `${first.homeTeam} vs ${first.awayTeam}` : null;

    res.json({
      message: firstLabel
        ? `Live-Testspiel importiert: ${firstLabel}`
        : 'Keine passenden Spiele fuer heute gefunden.',
      ...importResult
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Live-Test-Import fehlgeschlagen' });
  }
});

router.post('/matches/sync-results/bundesliga', adminMiddleware, async (req, res) => {
  try {
    const syncResult = await syncBundesligaResults(pool);
    res.json({
      message: `Bundesliga-Ergebnisse aktualisiert: ${syncResult.updatedCount} Spiele eingetragen, ${syncResult.skippedCount} nicht zugeordnet (${syncResult.finishedFromApi} abgeschlossene Spiele von API erhalten).`,
      ...syncResult
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Ergebnis-Synchronisierung fehlgeschlagen' });
  }
});

router.post('/matches/sync-results/wm', adminMiddleware, async (req, res) => {
  try {
    const syncResult = await syncWMResults(pool);
    const noResultsYet = Number(syncResult.finishedFromApi || 0) === 0;
    res.json({
      message: noResultsYet
        ? 'Aktuell sind bei Flashscore noch keine abgeschlossenen WM-Spiele vorhanden.'
        : `WM-Ergebnisse aktualisiert: ${syncResult.updatedCount} aktualisiert, ${syncResult.createdCount} neu angelegt (${syncResult.finishedFromApi} abgeschlossene Spiele von API erhalten).`,
      ...syncResult
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || 'WM-Ergebnis-Synchronisierung fehlgeschlagen' });
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
      'SELECT id, username, email, role, avatar, created_at FROM users ORDER BY created_at DESC'
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
    const { username, email, role, avatar } = req.body;
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

    // Validate avatar if provided
    if (avatar !== undefined && avatar !== null) {
      if (typeof avatar !== 'string') {
        return res.status(400).json({ error: 'Invalid avatar' });
      }
      if (avatar.startsWith('data:')) {
        if (!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(avatar)) {
          return res.status(400).json({ error: 'Invalid avatar image format' });
        }
        if (avatar.length > 200000) {
          return res.status(400).json({ error: 'Avatar image too large (max ~150 KB)' });
        }
      } else if (avatar.length > 20) {
        return res.status(400).json({ error: 'Invalid avatar' });
      }
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
           avatar = COALESCE($4, avatar),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, role, avatar, created_at`,
      [usernameNormalized, emailNormalized, roleNormalized, avatar || null, id]
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
