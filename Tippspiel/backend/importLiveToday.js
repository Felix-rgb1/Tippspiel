require('dotenv').config({ override: true });
const pool = require('./db');
const { fetchFlashscoreTournamentFixtures, fetchFlashscoreMatchesByDate } = require('./services/rapidApi');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    source: 'wm',
    max: 3,
    tournamentUrl: ''
  };

  args.forEach((arg) => {
    if (arg.startsWith('--source=')) {
      parsed.source = String(arg.split('=')[1] || 'wm').toLowerCase();
    }
    if (arg.startsWith('--max=')) {
      const value = Number.parseInt(arg.split('=')[1] || '', 10);
      if (Number.isFinite(value) && value > 0) {
        parsed.max = value;
      }
    }
    if (arg.startsWith('--tournamentUrl=')) {
      parsed.tournamentUrl = String(arg.split('=')[1] || '').trim();
    }
  });

  return parsed;
}

function getSourceConfig(source, tournamentUrlFromArg) {
  if (source === 'any') {
    return {
      mode: 'by-date',
      tournamentUrl: null,
      externalSource: 'flashscore-live-test-day',
      roundLabel: 'Flashscore Today'
    };
  }

  if (source === 'custom') {
    const customUrl = tournamentUrlFromArg || '/football/europe/uefa-europa-conference-league/';
    return {
      mode: 'tournament',
      tournamentUrl: customUrl,
      externalSource: 'flashscore-live-test-day',
      roundLabel: 'Flashscore Custom'
    };
  }

  if (source === 'bundesliga') {
    return {
      mode: 'tournament',
      tournamentUrl: process.env.FLASHSCORE_BUNDESLIGA_TOURNAMENT_URL || '/football/germany/bundesliga/',
      externalSource: 'flashscore-bundesliga',
      roundLabel: 'Bundesliga'
    };
  }

  return {
    mode: 'tournament',
    tournamentUrl: process.env.FLASHSCORE_TOURNAMENT_URL || '/football/world/world-cup/',
    externalSource: 'flashscore-wm',
    roundLabel: 'WM'
  };
}

function listMatches(payload) {
  const entries = Array.isArray(payload) ? payload : [];
  if (entries.some((entry) => Array.isArray(entry?.matches))) {
    return entries.flatMap((entry) => Array.isArray(entry?.matches) ? entry.matches : []);
  }
  return entries;
}

function isSameBerlinDate(unixTsSeconds, referenceDate = new Date()) {
  if (!Number.isFinite(unixTsSeconds)) return false;

  const toBerlinDateString = (date) => date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
  const matchDate = new Date(unixTsSeconds * 1000);
  return toBerlinDateString(matchDate) === toBerlinDateString(referenceDate);
}

function normalizeStatus(match) {
  return String(match?.status_type || match?.status || match?.status_description || '').trim().toUpperCase();
}

function isLiveStatus(status) {
  if (!status) return false;
  if (status.includes('LIVE')) return true;
  if (/^(1H|2H|HT|ET|PEN|INT|BREAK)$/.test(status)) return true;
  if (/^\d{1,3}'?$/.test(status)) return true;
  return false;
}

function isFinishedStatus(status) {
  if (!status) return false;
  return ['FT', 'FINISHED', 'AET', 'AFTER ET', 'PEN', 'AWARDED'].includes(status);
}

function getTimeDistanceScore(timestampMs, nowMs) {
  if (!Number.isFinite(timestampMs)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(timestampMs - nowMs);
}

function parseNumeric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumericExternalId(rawMatchId) {
  const asNumber = Number.parseInt(String(rawMatchId || '').trim(), 10);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  // Deterministic hash -> positive safe integer for BIGINT column usage.
  let hash = 1469598103934665603n;
  const prime = 1099511628211n;
  const input = String(rawMatchId || '');

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash *= prime;
  }

  const maxSafe = 9007199254740991n;
  const normalized = (hash < 0n ? -hash : hash) % maxSafe;
  return Number(normalized || 1n);
}

async function upsertMatch(match, config) {
  const matchId = String(match?.match_id || '').trim();
  if (!matchId) return { action: 'skipped', reason: 'missing-match-id' };
  const externalId = toNumericExternalId(matchId);

  const homeTeam = String(match?.home_team?.name || '').trim();
  const awayTeam = String(match?.away_team?.name || '').trim();
  const timestamp = Number(match?.timestamp);

  if (!homeTeam || !awayTeam || !Number.isFinite(timestamp)) {
    return { action: 'skipped', reason: 'invalid-team-or-date' };
  }

  const status = normalizeStatus(match);
  const nowMs = Date.now();
  const matchMs = timestamp * 1000;
  const live = isLiveStatus(status);
  const finished = isFinishedStatus(status) || (!live && Number.isFinite(matchMs) && matchMs < (nowMs - 4 * 60 * 60 * 1000));
  const homeGoals = parseNumeric(match?.scores?.home);
  const awayGoals = parseNumeric(match?.scores?.away);

  const existing = await pool.query(
    'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
    [config.externalSource, externalId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE matches
       SET home_team = $1,
           away_team = $2,
           match_date = $3,
           round = $4,
           home_goals = $5,
           away_goals = $6,
           finished = $7,
           updated_at = NOW()
       WHERE external_source = $8 AND external_id = $9`,
      [
        homeTeam,
        awayTeam,
        new Date(timestamp * 1000).toISOString(),
        `${config.roundLabel} Live-Test`,
        homeGoals,
        awayGoals,
        finished,
        config.externalSource,
        externalId
      ]
    );

    return { action: 'updated', matchId, homeTeam, awayTeam, status, live };
  }

  const insert = await pool.query(
    `INSERT INTO matches (
      home_team, away_team, match_date, round, home_goals, away_goals, finished, external_source, external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      homeTeam,
      awayTeam,
      new Date(timestamp * 1000).toISOString(),
      `${config.roundLabel} Live-Test`,
      homeGoals,
      awayGoals,
      finished,
      config.externalSource,
      externalId
    ]
  );

  return { action: 'created', id: insert.rows[0].id, matchId, homeTeam, awayTeam, status, live };
}

async function importLiveTodayMatches(options = {}) {
  const normalizedOptions = {
    source: options.source || 'any',
    max: Number.isFinite(Number(options.max)) && Number(options.max) > 0 ? Number(options.max) : 1,
    tournamentUrl: options.tournamentUrl || ''
  };

  const config = getSourceConfig(normalizedOptions.source, normalizedOptions.tournamentUrl);

  const todayBerlin = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  const logs = [];
  const pushLog = (line) => {
    logs.push(line);
    if (typeof options.logger === 'function') {
      options.logger(line);
    }
  };

  if (config.mode === 'by-date') {
    pushLog(`Suche heutige Spiele global fuer Datum ${todayBerlin} (Flashscore list-by-date)`);
  } else {
    pushLog(`Suche heutige Spiele fuer: ${config.tournamentUrl}`);
  }

  const fixturesPayload = config.mode === 'by-date'
    ? await fetchFlashscoreMatchesByDate(todayBerlin)
    : await fetchFlashscoreTournamentFixtures(config.tournamentUrl, {
        useConfiguredIds: false
      });

  const allMatches = listMatches(fixturesPayload);
  const todaysMatches = allMatches.filter((match) => isSameBerlinDate(Number(match?.timestamp)));

  if (!todaysMatches.length) {
    pushLog('Keine Spiele fuer heute gefunden.');
    return {
      ...normalizedOptions,
      mode: config.mode,
      externalSource: config.externalSource,
      tournamentUrl: config.tournamentUrl,
      totalToday: 0,
      selected: [],
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      logs
    };
  }

  // Bereits importierte externe IDs laden, damit keine Duplikate gewählt werden
  const existingResult = await pool.query(
    'SELECT external_id FROM matches WHERE external_source = $1',
    [config.externalSource]
  );
  const existingIds = new Set(existingResult.rows.map((r) => String(r.external_id)));

  const nowMs = Date.now();
  const withPriority = todaysMatches
    .map((match) => ({
      match,
      status: normalizeStatus(match),
      live: isLiveStatus(normalizeStatus(match)),
      ts: Number(match?.timestamp) || 0
    }))
    .filter((entry) => {
      const numId = String(toNumericExternalId(String(entry.match?.match_id || '')));
      if (existingIds.has(numId)) return false;
      const matchMs = entry.ts ? entry.ts * 1000 : Number.NaN;
      // Keep live matches always, plus matches around "now" for reliable live polling tests.
      return entry.live || getTimeDistanceScore(matchMs, nowMs) <= 12 * 60 * 60 * 1000;
    })
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return getTimeDistanceScore(a.ts * 1000, nowMs) - getTimeDistanceScore(b.ts * 1000, nowMs);
    });

  // Fallback: alle heutigen noch-nicht-importierten Spiele, wenn kein zeitnahes gefunden
  const fallbackPool = todaysMatches
    .map((match) => ({
      match,
      status: normalizeStatus(match),
      live: isLiveStatus(normalizeStatus(match)),
      ts: Number(match?.timestamp) || 0
    }))
    .filter((entry) => {
      const numId = String(toNumericExternalId(String(entry.match?.match_id || '')));
      return !existingIds.has(numId);
    })
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return a.ts - b.ts;
    });

  const selectedPool = withPriority.length ? withPriority : fallbackPool;

  if (!selectedPool.length) {
    pushLog(`Alle heutigen Spiele (${todaysMatches.length}) sind bereits in der Datenbank importiert. Keine neuen Spiele verfuegbar.`);
    return {
      ...normalizedOptions,
      mode: config.mode,
      externalSource: config.externalSource,
      tournamentUrl: config.tournamentUrl,
      totalToday: todaysMatches.length,
      selected: [],
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      logs
    };
  }

  const selected = selectedPool.slice(0, normalizedOptions.max);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const selectedMatches = [];

  for (const item of selected) {
    const result = await upsertMatch(item.match, config);
    if (result.action === 'created') {
      createdCount += 1;
      pushLog(`CREATED  ${result.homeTeam} vs ${result.awayTeam} (${result.status || 'N/A'}) live=${result.live ? 'yes' : 'no'}`);
      selectedMatches.push({
        homeTeam: result.homeTeam,
        awayTeam: result.awayTeam,
        status: result.status || 'N/A',
        live: Boolean(result.live),
        action: result.action
      });
    } else if (result.action === 'updated') {
      updatedCount += 1;
      pushLog(`UPDATED  ${result.homeTeam} vs ${result.awayTeam} (${result.status || 'N/A'}) live=${result.live ? 'yes' : 'no'}`);
      selectedMatches.push({
        homeTeam: result.homeTeam,
        awayTeam: result.awayTeam,
        status: result.status || 'N/A',
        live: Boolean(result.live),
        action: result.action
      });
    } else {
      skippedCount += 1;
    }
  }

  pushLog(`Fertig. Gesamt heute: ${todaysMatches.length}, ausgewaehlt: ${selected.length}, neu: ${createdCount}, aktualisiert: ${updatedCount}, uebersprungen: ${skippedCount}`);
  pushLog(`Hinweis: Live-Polling nutzt /matches/live und erkennt Quelle '${config.externalSource}'.`);

  return {
    ...normalizedOptions,
    mode: config.mode,
    externalSource: config.externalSource,
    tournamentUrl: config.tournamentUrl,
    totalToday: todaysMatches.length,
    selected: selectedMatches,
    createdCount,
    updatedCount,
    skippedCount,
    logs
  };
}

if (require.main === module) {
  const cliOptions = parseArgs();
  importLiveTodayMatches({
    ...cliOptions,
    logger: (line) => console.log(line)
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Import fehlgeschlagen:', error.message || error);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  importLiveTodayMatches
};
