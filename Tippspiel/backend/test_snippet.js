const fetch = require('node-fetch');
require('dotenv').config();

async function run() {
  const host = 'sofascore.p.rapidapi.com';
  const url = 'https://' + host + '/teams/get-last-matches?teamId=4781';
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '9824c21988msh8be615ba051fc27p17eb51jsn3e851e5eaab0',
      'X-RapidAPI-Host': host
    }
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    console.log('status:', response.status);
    console.log('top-level keys:', Object.keys(data).join(', '));
    
    if (data.events && data.events.length > 0) {
      const e = data.events[0];
      console.log('first event keys:', Object.keys(e).join(', '));
      if (e.homeTeam) console.log('first event.homeTeam keys:', Object.keys(e.homeTeam).join(', '));
      if (e.awayTeam) console.log('first event.awayTeam keys:', Object.keys(e.awayTeam).join(', '));
      
      const scoreKeys = Object.keys(e).filter(k => 
        ['homescore', 'awayscore', 'current', 'display'].some(s => k.toLowerCase().includes(s))
      );
      console.log('score-related keys present:', scoreKeys.join(', '));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
run();
