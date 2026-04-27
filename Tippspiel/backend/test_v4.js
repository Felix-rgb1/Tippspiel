require('dotenv').config();
const https = require('https');

function fetchOdds(apiKey) {
    return new Promise((resolve, reject) => {
        // v4 API check
        const url = 'https://api.the-odds-api.com/v4/sports/soccer/events?apiKey=' + apiKey + '&regions=eu';
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
    const apiKey = '0b577197599cd3ecb49564b663882b93d4296695216fcb6cf77faeaf553738ca'; // from .env
    console.log('Fetching Odds from V4 API...');
    const oddsEvents = await fetchOdds(apiKey);
    
    if (Array.isArray(oddsEvents)) {
        console.log('Fetched ' + oddsEvents.length + ' events.');
        if (oddsEvents.length > 0) {
            console.log('Example Event: ' + oddsEvents[0].home_team + ' vs ' + oddsEvents[0].away_team);
        }
    } else {
        console.log('Unexpected response:', oddsEvents);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}
analyze();
