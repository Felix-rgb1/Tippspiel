# Tippspiel WM - Webseite

Ein Full-Stack Tippspiel für die Fußball-Weltmeisterschaft mit Benutzerregistrierung, Tipps, Leaderboard und Admin Panel.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Datenbank**: PostgreSQL (Supabase)
- **Auth**: JWT
- **Hosting**: Netlify (Frontend) + Render/Heroku (Backend)

## Setup

### Voraussetzungen
- Node.js 16+
- npm oder yarn
- PostgreSQL Account (Supabase)

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# .env mit Supabase Credentials oder DATABASE_URL füllen
# optional fuer automatischen Import:
# FOOTBALL_DATA_API_KEY=...
# FOOTBALL_DATA_COMPETITION_CODE=WC
# optional fuer RapidAPI-Tests:
# RAPIDAPI_KEY=...
# RAPIDAPI_HOST=...
# RAPIDAPI_TEST_PATH=/status
# RAPIDAPI_ODDS_PATH=/odds
# alternativ direkt via API-FOOTBALL Dashboard:
# APIFOOTBALL_KEY=...
# APIFOOTBALL_BASE_URL=https://v3.football.api-sports.io
npm start
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Datenbank

Supabase-Projekt erstellen und SQL-Datei importieren.

## Struktur

```
Tippspiel/
├── backend/          # Node.js Express API
├── frontend/         # React Vite App
└── database/         # SQL Schemas
```

## Features

### 👤 Benutzer & Authentifizierung
- Registrierung & Login mit JWT
- Profilseite mit wählbarem Avatar-Emoji
- Passwort ändern

### 🎯 Tippen
- Ergebnistipps für alle WM-Spiele (Heim- und Auswärtstore)
- **Deadline:** 60 Minuten vor Spielstart – danach gesperrt
- Inline-Tipp direkt auf dem Dashboard, Änderung bis zur Deadline möglich
- Tipps anderer Spieler werden erst nach Deadline sichtbar

### ⭐ Bonusfragen
- Tipp auf **Weltmeister** und **Vizemeister** vor Turnierstart
- Gesperrt sobald das erste Spiel beginnt
- Extraspunkte: Weltmeister (konfigurierbar, Standard 20 Pkt.), Vizemeister (Standard 15 Pkt.)

### 🏆 Punktesystem
| Tipp | Punkte |
|---|---|
| Exaktes Ergebnis | **3 Punkte** |
| Richtige Tendenz (Sieg/Niederlage/Unentschieden) | **1 Punkt** |
| Falsch | 0 Punkte |

Tiebreaker bei Gleichstand: 1. Exakte Treffer · 2. Richtige Tendenzen · 3. Früher ersten Tipp abgegeben

### 📊 Rangliste (Leaderboard)
- Gesamtrangliste mit Punkte, Bonus, exakte Treffer, Tendenzen, Tipp-Quote
- Trend-Anzeige (↑↓) basierend auf dem letzten Spieltag
- Eigene Statistikseite pro Spieler (letzte 5 Tipps, Bonus-Tipp, Verlauf)

### 📺 Live-Scores
- Live-Ergebnisse während laufender Spiele via **Flashscore (RapidAPI)**
- SSE-Stream (Server-Sent Events) mit Polling-Fallback
- Anzeige: aktueller Spielstand, Minute, Rote Karten
- Automatischer Sync abgeschlossener Spiele beim Öffnen des Dashboards (max. alle 3 Min.)

### 🔍 Spiel-Detailseite
- Statistiken für laufende/beendete Spiele (Ballbesitz, Schüsse, Ecken, Fouls)
- Live-Ereignisse (Tore, Rote Karten mit Spielername & Minute)
- Head-to-Head Vergleich der beiden Teams
- Quoten-Anzeige (sofern aktiviert)

### 🛠️ Admin-Panel
- Spiele anlegen, bearbeiten, Ergebnisse eintragen
- WM- und Bundesliga-Ergebnisse manuell synchronisieren (via Flashscore API)
- Bonus-Auswertung setzen (Weltmeister, Vizemeister, Punktezahl konfigurierbar)
- Alle Tipps als Excel-Datei exportieren
- Nutzer verwalten
