const http = require('https');
const fs = require('fs');
const path = require('path');

// Basic dotenv implementation
const envPath = path.join(process.cwd(), '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    }
});

const host = env.RAPIDAPI_HOST;
const key = env.RAPIDAPI_KEY;

function request(url, headers) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
    });
}

async function run() {
    console.log('--- Step 1: Node snippet with dotenv ---');
    console.log('RAPIDAPI_HOST: ' + host);
    if (key) {
        const masked = key.slice(0, 6) + '...' + key.slice(-6);
        const nonAlNum = /[^a-zA-Z0-9]/.test(key);
        console.log('Key length: ' + key.length);
        console.log('Key (masked): ' + masked);
        console.log('Contains non-alnum: ' + nonAlNum);
    } else {
        console.log('RAPIDAPI_KEY not found in .env');
    }

    console.log('\n--- Step 2: Single request (PascalCase headers) ---');
    try {
        const res2 = await request('https://sofascore.p.rapidapi.com/tournaments/list?categoryId=1', {
            'X-RapidAPI-Key': key,
            'X-RapidAPI-Host': host
        });
        console.log('Status: ' + res2.status);
        console.log('Body (200 chars): ' + res2.data.slice(0, 200));
    } catch (e) { console.log('Error: ' + e.message); }

    console.log('\n--- Step 3: Single request (lowercase headers) ---');
    try {
        const res3 = await request('https://sofascore.p.rapidapi.com/tournaments/list?categoryId=1', {
            'x-rapidapi-key': key,
            'x-rapidapi-host': host
        });
        console.log('Status: ' + res3.status);
    } catch (e) { console.log('Error: ' + e.message); }

    console.log('\n--- Step 4: Search request (lowercase headers) ---');
    try {
        const res4 = await request('https://sofascore.p.rapidapi.com/search?q=Mexico&type=all&page=0', {
            'x-rapidapi-key': key,
            'x-rapidapi-host': host
        });
        console.log('Status: ' + res4.status);
        console.log('Body (160 chars): ' + res4.data.slice(0, 160));
    } catch (e) { console.log('Error: ' + e.message); }
}

run();
