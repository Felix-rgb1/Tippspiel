# Elfmeterschießen-Migration - Runbook

## Beschreibung
Diese Migration fügt Unterstützung für Elfmeterschießen zum System hinzu. Wenn ein Spiel durch Elfmeterschießen entschieden wird, erhält der Sieger automatisch +1 Tor in der Endtabelle.

**Beispiel:**
- 90 Min: 2:2 (Remis)
- Verlängerung: 2:2 (Remis)
- Elfmeterschießen: Heimteam gewinnt
- **Endergebnis im System: 3:2** (Heimteam bekommt +1)

## Schritte zur Ausführung

### 1. Migration ausführen (einmalig)

Wenn Sie Zugriff auf die Datenbank haben, führen Sie aus:

```bash
cd backend
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool();

(async () => {
  const sql = fs.readFileSync('../database/add_penalty_columns.sql', 'utf8');
  try {
    const result = await pool.query(sql);
    console.log('✓ Migration erfolgreich ausgeführt');
    console.log('  - penalty_decided Spalte hinzugefügt');
    console.log('  - penalty_winner Spalte hinzugefügt');
    console.log('  - home_goals_90 Spalte hinzugefügt');
    console.log('  - away_goals_90 Spalte hinzugefügt');
  } catch(e) {
    console.error('✗ Migration fehlgeschlagen:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
"
```

### 2. Backend neu starten

Nach der Migration den Backend-Server neu starten:

```bash
npm start
```

oder wenn Sie eine Supervisor-Software verwenden:

```bash
# z.B. für pm2:
pm2 restart all

# oder manuell:
pkill -f "node.*server.js"
node server.js
```

### 3. System-Verhalten nach der Migration

- **Für neue Matches:** Elfmeter-Info wird automatisch aus der API extrahiert und die Tore angepasst
- **Für bestehende Matches:** Keine automatische Anpassung (API muss die neuen Felder liefern)
- **Tip-Bewertung:** Tipps werden automatisch gegen die angepassten Endergebnisse bewertet

### 4. Verifizierung

Führen Sie diesen Check aus, um zu bestätigen, dass die Spalten vorhanden sind:

```bash
cd backend
node -e "
const { Pool } = require('pg');
const pool = new Pool();

(async () => {
  try {
    const result = await pool.query(
      \"SELECT column_name FROM information_schema.columns WHERE table_name = 'matches' AND column_name IN ('penalty_decided', 'penalty_winner', 'home_goals_90', 'away_goals_90') ORDER BY column_name;\"
    );
    if (result.rows.length === 4) {
      console.log('✓ Alle Elfmeter-Spalten vorhanden:');
      result.rows.forEach(r => console.log('  -', r.column_name));
    } else {
      console.log('✗ Fehler: Nicht alle Spalten vorhanden');
      console.log('  Gefunden:', result.rows.map(r => r.column_name).join(', '));
    }
  } catch(e) {
    console.error('✗ Fehler:', e.message);
  } finally {
    await pool.end();
  }
})();
"
```

## Änderungen im Code

### backend/services/flashscoreBundesligaImport.js

#### Neue Funktion: `extractPenaltyInfo(match)`
- Extrahiert Elfmeter-Informationen aus der API
- Sucht nach verschiedenen möglichen API-Feldnamen
- Gibt `penaltyDecided`, `penaltyWinner`, `homeGoals90`, `awayGoals90` zurück

#### Angepasste Funktion: `toNormalizedMatch(match, fallbackRound)`
- Ruft `extractPenaltyInfo()` auf
- Gibt Elfmeter-Felder im Match-Objekt zurück

#### Angepasste Funktionen: `upsertMatch()` und `upsertWMMatch()`
- Berechnen das finale Endergebnis mit Elfmeter-Anpassung
- Speichern alle 4 neuen Spalten

### database/add_penalty_columns.sql

Migration, die folgende Spalten hinzufügt:
- `penalty_decided` (BOOLEAN, default false): War das Spiel Elfmeterschießen?
- `penalty_winner` (VARCHAR): 'home' oder 'away'
- `home_goals_90` (INTEGER): Tore nach 90 Min (vor Elfmeter)
- `away_goals_90` (INTEGER): Tore nach 90 Min (vor Elfmeter)

Index: `idx_matches_penalty_decided` für bessere Query-Performance

## Frontend-Behavior

Die Frontend-Komponente `Dashboard.jsx` zeigt automatisch die korrekten Endergebnisse an, da diese bereits im Backend berechnet wurden.

Die Tip-Bewertung funktioniert automatisch korrekt, da die `tips.js` Route gegen die finalen (angepassten) Tore prüft.

## Bekannte Limitationen

1. **API-Abhängigkeit:** Die Elfmeter-Gewinner-Information muss von der Flashscore-API kommen. Je nach API-Format können nicht alle Spiele korrekt erkannt werden.

2. **Rückwirkende Updates:** Bereits gestörte Ergebnisse werden nicht automatisch angepasst. Falls nachträglich Elfmeter-Informationen verfügbar werden, muss ein Re-Sync durchgeführt werden.

3. **90-Minuten-Ergebnis:** Falls die API das 90-Minuten-Ergebnis nicht bereitstellt, wird das aktuelle Endergebnis als 90-Minuten-Ergebnis gespeichert.

## Rollback

Falls Sie diese Feature rückgängig machen möchten:

```sql
ALTER TABLE matches DROP COLUMN IF EXISTS penalty_decided;
ALTER TABLE matches DROP COLUMN IF EXISTS penalty_winner;
ALTER TABLE matches DROP COLUMN IF EXISTS home_goals_90;
ALTER TABLE matches DROP COLUMN IF EXISTS away_goals_90;
DROP INDEX IF EXISTS idx_matches_penalty_decided;
```

Dann Backend-Code auf die vorherige Version zurückspulen.
