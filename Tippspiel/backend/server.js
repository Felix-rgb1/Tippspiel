require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
require('./db');
const pool = require('./db');
const { warmUpApiFootballInsightsCache } = require('./services/footballData');
const { ensureBonusFeaturesSchema } = require('./services/bonusFeatures');

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  ensureBonusFeaturesSchema(pool)
    .then(() => {
      console.log('[BONUS] Bonus-Features sind bereit.');
    })
    .catch((error) => {
      console.warn('[BONUS] Bonus-Features konnten nicht initialisiert werden:', error.message);
    });

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
});
