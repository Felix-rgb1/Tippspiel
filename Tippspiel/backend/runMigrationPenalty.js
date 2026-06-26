#!/usr/bin/env node
/**
 * Migration Runner für Elfmeterschießen-Feature
 * 
 * Verwendung:
 *   node backend/runMigrationPenalty.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool();

  try {
    console.log('🔄 Starte Elfmeterschießen-Migration...\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, '..', 'database', 'add_penalty_columns.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    console.log('📝 Führe Migration aus...');
    await pool.query(sql);

    // Verify columns
    console.log('✅ Migration erfolgreich!\n');
    console.log('📊 Verifiziere Spalten...');
    
    const result = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'matches' AND column_name IN ('penalty_decided', 'penalty_winner', 'home_goals_90', 'away_goals_90') ORDER BY column_name;"
    );

    if (result.rows.length === 4) {
      console.log('\n✓ Alle Elfmeter-Spalten erfolgreich hinzugefügt:\n');
      result.rows.forEach(row => {
        console.log(`  ✓ ${row.column_name} (${row.data_type})`);
      });
      console.log('\n✅ Migration abgeschlossen!\n');
      console.log('Nächste Schritte:');
      console.log('1. Backend-Server neu starten: npm start');
      console.log('2. Test durchführen mit neuen WM-Match-Importen\n');
    } else {
      console.error('\n❌ Fehler: Nicht alle Spalten vorhanden');
      console.error('Gefunden:', result.rows.map(r => r.column_name).join(', '));
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Migration fehlgeschlagen:');
    console.error('Fehler:', error.message);
    
    if (error.message.includes('already exists')) {
      console.error('\n💡 Tipp: Die Spalten existieren möglicherweise bereits.');
      console.error('   Sie können die Migration sicher erneut ausführen.\n');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
