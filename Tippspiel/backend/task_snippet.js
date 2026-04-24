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
    
    if (data.events && data.events.length > 0) {
      const e = data.events[0];
      console.log('homeScore:', JSON.stringify(e.homeScore));
      console.log('awayScore:', JSON.stringify(e.awayScore));
    } else {
      console.log('No events found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}
run();
