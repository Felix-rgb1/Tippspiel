require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
require('./db');
const pool = require('./db');
const { warmUpApiFootballInsightsCache } = require('./services/footballData');
const { ensureBonusFeaturesSchema } = require('./services/bonusFeatures');
const {
  ensurePenaltyColumnsSchema,
  importFlashscoreWMMatches,
  syncWMResults,
  syncBundesligaResults
} = require('./services/flashscoreBundesligaImport');

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  ...(process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL.replace(/\/$/, '')]
    : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const tipRoutes = require('./routes/tips');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

app.use('/api/auth', authRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/tips', tipRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Health check endpoints (for monitoring/uptime robots)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), service: 'tippspiel-api' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), service: 'tippspiel-api' });
});

function parseEnabledFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function startAutoResultSync(pool) {
  const enabled = parseEnabledFlag(process.env.AUTO_RESULT_SYNC_ENABLED, true);
  if (!enabled) {
    console.log('[AUTO-RESULT-SYNC] deaktiviert (AUTO_RESULT_SYNC_ENABLED=false).');
    return;
  }

  const intervalMinutesRaw = Number.parseInt(process.env.AUTO_RESULT_SYNC_INTERVAL_MINUTES || '10', 10);
  const intervalMinutes = Number.isFinite(intervalMinutesRaw) ? Math.max(3, intervalMinutesRaw) : 10;
  const intervalMs = intervalMinutes * 60 * 1000;

  let isRunning = false;

  const runSync = async () => {
    if (isRunning) {
      console.log('[AUTO-RESULT-SYNC] Lauf uebersprungen, vorheriger Durchlauf laeuft noch.');
      return;
    }

    isRunning = true;
    try {
      const [wmResult, bundesligaResult] = await Promise.allSettled([
        syncWMResults(pool),
        syncBundesligaResults(pool)
      ]);

      if (wmResult.status === 'fulfilled') {
        const r = wmResult.value;
        console.log(
          `[AUTO-RESULT-SYNC][WM] updated=${r.updatedCount || 0}, created=${r.createdCount || 0}, finishedFromApi=${r.finishedFromApi || 0}`
        );
      } else {
        console.warn('[AUTO-RESULT-SYNC][WM] Fehler:', wmResult.reason?.message || wmResult.reason);
      }

      if (bundesligaResult.status === 'fulfilled') {
        const r = bundesligaResult.value;
        console.log(
          `[AUTO-RESULT-SYNC][BL] updated=${r.updatedCount || 0}, skipped=${r.skippedCount || 0}, finishedFromApi=${r.finishedFromApi || 0}`
        );
      } else {
        console.warn('[AUTO-RESULT-SYNC][BL] Fehler:', bundesligaResult.reason?.message || bundesligaResult.reason);
      }
    } catch (error) {
      console.warn('[AUTO-RESULT-SYNC] Unerwarteter Fehler:', error.message);
    } finally {
      isRunning = false;
    }
  };

  runSync();
  setInterval(runSync, intervalMs);
  console.log(`[AUTO-RESULT-SYNC] aktiv, Intervall=${intervalMinutes} Minuten.`);
}

function startAutoWMImport(pool) {
  const enabled = parseEnabledFlag(process.env.AUTO_WM_IMPORT_ENABLED, true);
  if (!enabled) {
    console.log('[AUTO-WM-IMPORT] deaktiviert (AUTO_WM_IMPORT_ENABLED=false).');
    return;
  }

  const intervalMinutesRaw = Number.parseInt(process.env.AUTO_WM_IMPORT_INTERVAL_MINUTES || '60', 10);
  const intervalMinutes = Number.isFinite(intervalMinutesRaw) ? Math.max(15, intervalMinutesRaw) : 60;
  const intervalMs = intervalMinutes * 60 * 1000;

  let isRunning = false;

  const runImport = async () => {
    if (isRunning) {
      console.log('[AUTO-WM-IMPORT] Lauf uebersprungen, vorheriger Durchlauf laeuft noch.');
      return;
    }

    isRunning = true;
    try {
      const result = await importFlashscoreWMMatches(pool);
      console.log(
        `[AUTO-WM-IMPORT] created=${result.createdCount || 0}, updated=${result.updatedCount || 0}, totalProcessed=${result.totalProcessed || 0}`
      );
    } catch (error) {
      console.warn('[AUTO-WM-IMPORT] Fehler:', error.message || error);
    } finally {
      isRunning = false;
    }
  };

  runImport();
  setInterval(runImport, intervalMs);
  console.log(`[AUTO-WM-IMPORT] aktiv, Intervall=${intervalMinutes} Minuten.`);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  (async () => {
    try {
      await ensureBonusFeaturesSchema(pool);
      console.log('[BONUS] Bonus-Features sind bereit.');
    } catch (error) {
      console.warn('[BONUS] Bonus-Features konnten nicht initialisiert werden:', error.message);
    }

    try {
      await ensurePenaltyColumnsSchema(pool);
      console.log('[MATCH-SCHEMA] Penalty-Spalten sind bereit.');
    } catch (error) {
      console.warn('[MATCH-SCHEMA] Penalty-Spalten konnten nicht initialisiert werden:', error.message);
    }

    startAutoResultSync(pool);
    startAutoWMImport(pool);

    const warmupEnabled = (process.env.APIFOOTBALL_WARMUP_ENABLED || 'false').toLowerCase() === 'true';
    if (!warmupEnabled) {
      return;
    }

    const warmupIntervalMinutes = Number.parseInt(process.env.APIFOOTBALL_WARMUP_INTERVAL_MINUTES || '120', 10);
    const warmupIntervalMs = Math.max(5, warmupIntervalMinutes) * 60 * 1000;

    const runWarmup = async () => {
      try {
        const result = await warmUpApiFootballInsightsCache(pool);
        console.log(`[APIFOOTBALL-WARMUP] warmed=${result.warmedMatches}, attempted=${result.attempted}`);
      } catch (error) {
        console.warn('[APIFOOTBALL-WARMUP] failed:', error.message);
      }
    };

    runWarmup();
    setInterval(runWarmup, warmupIntervalMs);
  })();
});
