require('dotenv').config();
const pool = require('./db');
const https = require('https');

function fetchOdds(apiKey) {
    return new Promise((resolve, reject) => {
        const url = 'https://api.odds-api.io/v3/events?sport=football&api_key=' + apiKey;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function analyze() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    console.log('Fetching Odds from API...');
    const oddsResponse = await fetchOdds(apiKey);
    
    // DEBUG: Look for matches with team names containing parts of DB names
    const searchTerms = ['Mexiko', 'Mexico', 'South Africa', 'Suedafrika', 'Korea', 'Czech', 'Kanada', 'Canada', 'Bosnia', 'USA', 'Switzerland', 'Schweiz', 'Brazil', 'Brasil', 'Japan', 'Germany', 'Deutschland'];
    
    const oddsEvents = oddsResponse.data || [];
    console.log('Fetched ' + oddsEvents.length + ' events from Odds API.');

    if (oddsEvents.length === 0) {
        console.log('API returned 0 events. Analysis cannot proceed with real data.');
    }

    console.log('Fetching next 40 matches from DB...');
    const matchesRes = await pool.query(
      'SELECT id, home_team, away_team, match_date FROM matches WHERE match_date >= NOW() ORDER BY match_date ASC LIMIT 40'
    );
    const matches = matchesRes.rows;
    console.log('Found ' + matches.length + ' matches in DB.');

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

analyze();
