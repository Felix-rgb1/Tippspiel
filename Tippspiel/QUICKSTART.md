# Quick Start Guide

## Projektstruktur

```
Tippspiel/
├── backend/              # Node.js + Express API
│   ├── routes/          # API Routes
│   ├── middleware/      # Auth Middleware
│   ├── package.json
│   ├── server.js        # Hauptserver
│   └── .env.example
├── frontend/            # React + Vite
│   ├── src/
│   │   ├── components/  # React Components
│   │   ├── pages/       # Seiten
│   │   ├── context/     # Auth Context
│   │   ├── api.js       # API Client
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── database/
│   └── schema.sql       # Datenbank-Schema
├── README.md
└── DEPLOYMENT.md        # Deployment Anleitung
```

## Lokales Setup (5 Minuten)

### 1. Supabase Projekt erstellen
- Gehe zu https://supabase.com
- Neues Projekt erstellen
- Gehe zu "SQL Editor"
- Kopiere & führe aus: [database/schema.sql](database/schema.sql)
- Kopiere die Connection String von "Database" → "Settings"

### 2. Backend starten

```bash
cd backend
npm install

# .env erstellen
cp .env.example .env

# .env bearbeiten und folgendes eintragen:
# DB_HOST=xxx.supabase.co
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=dein-passwort
# JWT_SECRET=beliebig (z.B. "test123")

npm run dev
# Server läuft auf http://localhost:5000
```

### 3. Frontend starten (neues Terminal)

```bash
cd frontend
npm install

# .env erstellen
cp .env.example .env
# VITE_API_URL=http://localhost:5000/api

npm run dev
# Frontend läuft auf http://localhost:5173
```

## Benutzer erstellen & Admin setzen

1. **Registriere einen Benutzer** über die Webseite
2. **Admin-Rechte geben** (in Supabase SQL):
```sql
UPDATE users SET role = 'admin' WHERE username = 'dein-username';
```

## Features testen

- ✅ **Registrierung/Login**: Neue Benutzer registrieren
- ✅ **Spiele erstellen**: Admin → "Spiele verwalten"
- ✅ **Tipps abgeben**: Dashboard → Tipps eintragen (bis 1h vor Spiel)
- ✅ **Ergebnisse eintragen**: Admin → Ergebnisse eintragen
- ✅ **Leaderboard**: Punkte werden automatisch berechnet
- ✅ **Profile**: Benutzer können ihr Profil und Passwort ändern

## Punktesystem

- **Exakte Treffer**: 3 Punkte (z.B. 2:1 getippt, 2:1 Endergebnis)
- **Trend-Treffer**: 1 Punkt (nur Gewinner/Unentschieden richtig)
- **Fehlschlag**: 0 Punkte

## Wichtige Dateien

- **Backend API**: [backend/server.js](backend/server.js)
- **Auth Routes**: [backend/routes/auth.js](backend/routes/auth.js)
- **Datenbank Schema**: [database/schema.sql](database/schema.sql)
- **Main App**: [frontend/src/App.jsx](frontend/src/App.jsx)

## Häufige Probleme

**Q: "Cannot GET /api/auth/login"**
- Backend läuft nicht → `npm run dev` im backend-Ordner ausführen

**Q: CORS Fehler**
- Backend CORS nicht richtig konfiguriert
- Prüfe `FRONTEND_URL` in .env

**Q: Tipps können nicht abgegeben werden**
- Deadline-Logik prüfen (1h vor Spielstart)
- Match-Datum muss in der Zukunft liegen

## Nächste Schritte für Production

1. Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für Deployment auf Render + Netlify
2. Supabase Backup-Plan erstellen
3. Admin-Benutzer initial erstellen
4. Spiele für WM hinzufügen
