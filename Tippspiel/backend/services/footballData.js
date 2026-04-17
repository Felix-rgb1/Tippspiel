const fetch = require('node-fetch');

const API_BASE_URL = process.env.FOOTBALL_DATA_API_URL || 'https://api.football-data.org/v4';
const COMPETITION_CODE = process.env.FOOTBALL_DATA_COMPETITION_CODE || 'WC';
const SEASON = process.env.FOOTBALL_DATA_SEASON;

function createConfigError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getRoundLabel(match) {
  const stageMap = {
    LAST_16: 'Achtelfinale',
    QUARTER_FINALS: 'Viertelfinale',
    SEMI_FINALS: 'Halbfinale',
    THIRD_PLACE: 'Spiel um Platz 3',
    FINAL: 'Finale'
  };

  if (match.stage === 'GROUP_STAGE' && match.matchday) {
    return `${match.matchday}. Spieltag`;
  }

  return stageMap[match.stage] || match.stage || null;
}

async function fetchCompetitionMatches() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!apiKey) {
    throw createConfigError('FOOTBALL_DATA_API_KEY fehlt');
  }

  const url = new URL(`${API_BASE_URL}/competitions/${COMPETITION_CODE}/matches`);

  if (SEASON) {
    url.searchParams.set('season', SEASON);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'X-Auth-Token': apiKey
    }
  });

  if (!response.ok) {
    const responseText = await response.text();
    const error = new Error(`football-data API Fehler: ${response.status} ${responseText}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  return payload.matches || [];
}

async function syncMatchesFromFootballData(pool) {
  const matches = await fetchCompetitionMatches();
  let createdCount = 0;
  let updatedCount = 0;

  for (const match of matches) {
    const normalizedMatch = {
      homeTeam: match.homeTeam?.name,
      awayTeam: match.awayTeam?.name,
      matchDate: match.utcDate,
      round: getRoundLabel(match),
      externalSource: 'football-data',
      externalId: match.id,
      homeGoals: match.score?.fullTime?.home,
      awayGoals: match.score?.fullTime?.away,
      finished: match.status === 'FINISHED' || match.status === 'AWARDED'
    };

    if (!normalizedMatch.homeTeam || !normalizedMatch.awayTeam || !normalizedMatch.matchDate || !normalizedMatch.externalId) {
      continue;
    }

    const existingMatch = await pool.query(
      'SELECT id FROM matches WHERE external_source = $1 AND external_id = $2',
      [normalizedMatch.externalSource, normalizedMatch.externalId]
    );

    if (existingMatch.rows.length > 0) {
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
          normalizedMatch.homeTeam,
          normalizedMatch.awayTeam,
          normalizedMatch.matchDate,
          normalizedMatch.round,
          normalizedMatch.finished ? normalizedMatch.homeGoals : null,
          normalizedMatch.finished ? normalizedMatch.awayGoals : null,
          normalizedMatch.finished,
          normalizedMatch.externalSource,
          normalizedMatch.externalId
        ]
      );
      updatedCount += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO matches (
        home_team,
        away_team,
        match_date,
        round,
        home_goals,
        away_goals,
        finished,
        external_source,
        external_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        normalizedMatch.homeTeam,
        normalizedMatch.awayTeam,
        normalizedMatch.matchDate,
        normalizedMatch.round,
        normalizedMatch.finished ? normalizedMatch.homeGoals : null,
        normalizedMatch.finished ? normalizedMatch.awayGoals : null,
        normalizedMatch.finished,
        normalizedMatch.externalSource,
        normalizedMatch.externalId
      ]
    );
    createdCount += 1;
  }

  return {
    totalFetched: matches.length,
    createdCount,
    updatedCount
  };
}

module.exports = { syncMatchesFromFootballData };