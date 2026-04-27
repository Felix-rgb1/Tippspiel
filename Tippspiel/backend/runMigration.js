require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  try {
    console.log('🔄 Starting migration for bonus features...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/add_bonus_features.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('Bonus features are now activated.');
    
    // Verify tables were created
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bonus_tips', 'tournament_bonus_result')
    `);
    
    console.log(`📊 Created tables: ${tablesCheck.rows.map(r => r.table_name).join(', ')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
