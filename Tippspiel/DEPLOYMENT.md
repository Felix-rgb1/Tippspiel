# Deployment Guide

## 1. Datenbank (Supabase) Setup

1. Melde dich auf [supabase.com](https://supabase.com) an
2. Erstelle ein neues Projekt
3. Gehe zu "SQL Editor"
4. Führe den Code aus [database/schema.sql](../database/schema.sql) aus
5. Kopiere deine `Database URL` von "Database" → "Connection string" (psycopg2 Option)

## 2. Backend Deployment auf Render

### Vorbereitung
1. Erstelle einen Account auf [render.com](https://render.com)
2. Pushe das Backend-Verzeichnis zu GitHub
3. Gehe zu "New +" → "Web Service"
4. Verbinde dein GitHub Repository

### Konfiguration
1. **Name**: `tippspiel-api`
2. **Environment**: Node
3. **Build Command**: `cd backend && npm install`
4. **Start Command**: `cd backend && npm start`
5. **Environment Variables**:
   ```
   DATABASE_URL=<dein-supabase-connection-string>
   JWT_SECRET=<generiere-einen-zufälligen-string>
   NODE_ENV=production
   FRONTEND_URL=https://<deine-netlify-url>
   ```

   Alternativ zu `DATABASE_URL` funktionieren auch die Einzelvariablen `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` und `DB_PASSWORD`.

## 3. Frontend Deployment auf Netlify

### Vorbereitung
1. Pushe das Frontend-Verzeichnis zu GitHub
2. Gehe zu [netlify.com](https://netlify.com)
3. Klicke "Connect Git"
4. Wähle dein Repository

### Konfiguration
1. **Build Command**: `cd frontend && npm run build`
2. **Publish Directory**: `frontend/dist`
3. **Environment Variables**:
   ```
   VITE_API_URL=https://<dein-render-url>/api
   ```

## Umgebungsvariablen generieren

```bash
# JWT_SECRET generieren
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Lokale Entwicklung

```bash
# Backend starten
cd backend
npm install
cp .env.example .env
# .env mit Werten füllen
npm run dev

# Frontend (neues Terminal)
cd frontend
npm install
cp .env.example .env
# .env mit API_URL=http://localhost:5000/api füllen
npm run dev
```

## Admin-Benutzer erstellen

Aktuell muss der erste Admin manuell in der Datenbank erstellt werden:

```sql
INSERT INTO users (username, email, password, role) 
VALUES ('admin', 'admin@example.com', '<bcrypt-hash>', 'admin');
```

Oder: Admin-Flag in der Registrierungslogik temporär auf 'admin' setzen und Normal-Benutzer zurückändern.

## Erste Schritte nach dem Deployment

1. Registriere einen Admin-Benutzer
2. Ändere dessen Role in der Datenbank auf 'admin'
3. Melde dich an und gehe zum Admin Panel
4. Erstelle die Spiele für die WM

## Tipps

- Regelmäßige Backups von Supabase machen
- Überwache die API Logs auf Render
- Testen Sie die Deadline-Logik (1h vor Spielstart)
