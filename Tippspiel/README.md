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

- ✅ User Registration & Login
- ✅ User Profiles
- ✅ Match Tipping (Deadline: 1h vor Spiel)
- ✅ Leaderboard
- ✅ Admin Panel
