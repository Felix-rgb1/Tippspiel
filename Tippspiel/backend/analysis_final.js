require('dotenv').config();
const pool = require('./db');
const https = require('https');

function fetchOdds(apiKey) {
    return new Promise((resolve, reject) => {
        // v3 events endpoint
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

function normalize(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/-/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

function isExact(m, e) {
    const mh = normalize(m.home_team);
    const ma = normalize(m.away_team);
    const eh = normalize(e.home_team);
    const ea = normalize(e.away_team);
    return (mh === eh && ma === ea) || (mh === ea && ma === eh);
}

function isFuzzy(m, e) {
    const mh = normalize(m.home_team);
    const ma = normalize(m.away_team);
    const eh = normalize(e.home_team);
    const ea = normalize(e.away_team);
    const match = (a, b) => (a && b) && (a.includes(b) || b.includes(a));
    return (match(mh, eh) && match(ma, ea)) || (match(mh, ea) && match(ma, eh));
}

async function analyze() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    console.log('Fetching Odds from API...');
    const oddsResponse = await fetchOdds(apiKey);
    
    // Fallback Mocking if API stays empty to demonstrate matching logic
    let oddsEvents = oddsResponse.data || [];
    console.log('Fetched ' + oddsEvents.length + ' events from Odds API.');
    
    if (oddsEvents.length === 0) {
        console.log('--- Warning: API returned 0 events. Analysis reflects no available odds data. ---');
    }

    console.log('Fetching next 40 matches from DB...');
    const matchesRes = await pool.query(
      'SELECT id, home_team, away_team, match_date FROM matches WHERE match_date >= NOW() ORDER BY match_date ASC LIMIT 40'
    );
    const matches = matchesRes.rows;
    console.log('Found ' + matches.length + ' matches in DB.');

    let exactHits = [];
    let fuzzyOnlyHits = [];
    let noHits = [];

    for (const m of matches) {
        let exactFound = false;
        let fuzzyFound = null;

        for (const e of oddsEvents) {
            if (isExact(m, e)) {
                exactFound = true;
                break;
            }
            if (!fuzzyFound && isFuzzy(m, e)) {
                fuzzyFound = e;
            }
        }

        if (exactFound) {
            exactHits.push(m);
        } else if (fuzzyFound) {
            fuzzyOnlyHits.push({ match: m, event: fuzzyFound });
        } else {
            noHits.push(m);
        }
    }

    console.log('\n--- Statistik ---');
    console.log('Anzahl exactHit: ' + exactHits.length);
    console.log('Anzahl nur fuzzyHit: ' + fuzzyOnlyHits.length);
    console.log('Anzahl kein Treffer: ' + noHits.length);

    console.log('\n--- 10 Beispiele: kein Treffer ---');
    noHits.slice(0, 10).forEach(m => console.log('Match: ' + m.home_team + ' vs ' + m.away_team + ' (' + m.match_date + ')'));

    console.log('\n--- 10 Beispiele: nur fuzzyHit ---');
    fuzzyOnlyHits.slice(0, 10).forEach(h => {
        console.log('Match: ' + h.match.home_team + ' vs ' + h.match.away_team + ' | Event: ' + h.event.home_team + ' vs ' + h.event.away_team);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

analyze();
