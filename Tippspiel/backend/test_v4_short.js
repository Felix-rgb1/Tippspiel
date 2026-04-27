require('dotenv').config();
const https = require('https');

function fetchOdds(apiKey) {
    return new Promise((resolve, reject) => {
        // v4 API check
        // Using sports=upcoming to see if anything is there
        const url = 'https://api.the-odds-api.com/v4/sports/upcoming/odds?apiKey=' + apiKey + '&regions=eu&markets=h2h';
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
    const apiKey = '0b577197599cd3ecb49564b663882b93d4296695216fcb6cf77faeaf553738ca';
    console.log('Fetching Upcoming Odds from V4 API...');
    const result = await fetchOdds(apiKey);
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
analyze();
