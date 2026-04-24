const fetch = require('node-fetch');

async function runSearch() {
  const query = 'Mexico';
  const type = 'all';
  const page = 0;
  
  const url = new URL('https://sofascore.p.rapidapi.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('type', type);
  url.searchParams.set('page', page.toString());

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': '9824c21988msh8be615ba051fc27p17eb51jsn3e851e5eaab0',
        'X-RapidAPI-Host': 'sofascore.p.rapidapi.com'
      }
    });

    if (!response.ok) {
        console.error('API Error:', response.status, await response.text());
        return;
    }

    const data = await response.json();
    const results = (data.results || []).slice(0, 5);

    results.forEach(res => {
      const entity = res.entity || {};
      const output = {
        'entity.id': entity.id,
        'entity.name': entity.name,
        'entity.national': entity.national,
        'entity.sport.slug': entity.sport ? entity.sport.slug : undefined,
        'entity.country.name': entity.country ? entity.country.name : undefined,
        'participantTypes': res.participantTypes
      };
      console.log(JSON.stringify(output, null, 2));
    });

  } catch (error) {
    console.error('Fetch Error:', error);
  }
}

runSearch();
