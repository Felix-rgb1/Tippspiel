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
# .env mit Supabase Credentials füllen
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
