require('dotenv').config({ override: true });
const { Pool } = require('pg');

const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const requiredDbEnvVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingDbEnvVars = requiredDbEnvVars.filter((envVar) => !process.env[envVar]);

if (!jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

if (!databaseUrl && missingDbEnvVars.length > 0) {
  throw new Error(
    `Missing database configuration. Set DATABASE_URL or provide: ${missingDbEnvVars.join(', ')}`
  );
}

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;