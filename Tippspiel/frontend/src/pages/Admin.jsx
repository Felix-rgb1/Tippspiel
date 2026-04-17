import { useState, useEffect } from 'react';
import { adminAPI, matchAPI } from '../api';
import './Admin.css';

function Admin() {
  const roundOptions = [
    '1. Spieltag',
    '2. Spieltag',
    '3. Spieltag',
    'Achtelfinale',
    'Viertelfinale',
    'Halbfinale',
    'Spiel um Platz 3',
    'Finale'
  ];

  const [activeTab, setActiveTab] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [round, setRound] = useState('');
  const [matchId, setMatchId] = useState('');
  const [homeGoals, setHomeGoals] = useState('');
  const [awayGoals, setAwayGoals] = useState('');
  const [editMatchId, setEditMatchId] = useState('');
  const [editHomeTeam, setEditHomeTeam] = useState('');
  const [editAwayTeam, setEditAwayTeam] = useState('');
  const [editMatchDate, setEditMatchDate] = useState('');
  const [editRound, setEditRound] = useState('');
  const [resetResult, setResetResult] = useState(false);

  useEffect(() => {
    if (activeTab === 'matches') {
      fetchMatches();
    } else {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const response = await matchAPI.getAll();
      setMatches(response.data);
    } catch (err) {
      setError('Fehler beim Laden der Spiele');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data);
    } catch (err) {
      setError('Fehler beim Laden der Benutzer');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await adminAPI.createMatch(homeTeam, awayTeam, matchDate, round);
      setHomeTeam('');
      setAwayTeam('');
      setMatchDate('');
      setRound('');
      setSuccess('Spiel erstellt!');
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Erstellen');
    }
  };

  const toDateTimeLocal = (date) => {
    const parsedDate = new Date(date);
    const timezoneOffset = parsedDate.getTimezoneOffset() * 60000;
    return new Date(parsedDate.getTime() - timezoneOffset).toISOString().slice(0, 16);
  };

  const handleEditMatchSelect = (selectedMatchId) => {
    setEditMatchId(selectedMatchId);
    setResetResult(false);

    if (!selectedMatchId) {
      setEditHomeTeam('');
      setEditAwayTeam('');
      setEditMatchDate('');
      setEditRound('');
      return;
    }

    const selectedMatch = matches.find((m) => m.id === parseInt(selectedMatchId, 10));

    if (!selectedMatch) {
      return;
    }

    setEditHomeTeam(selectedMatch.home_team);
    setEditAwayTeam(selectedMatch.away_team);
    setEditMatchDate(toDateTimeLocal(selectedMatch.match_date));
    setEditRound(selectedMatch.round || '');
  };

  const handleUpdateMatch = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!editMatchId || !editHomeTeam || !editAwayTeam || !editMatchDate) {
      setError('Bitte alle Felder fuer die Spielbearbeitung ausfuellen');
      return;
    }

    try {
      await adminAPI.updateMatch(
        editMatchId,
        editHomeTeam,
        editAwayTeam,
        editMatchDate,
        editRound,
        resetResult
      );
      setSuccess('Spiel aktualisiert!');
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Bearbeiten des Spiels');
    }
  };

  const handleUpdateResult = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!matchId || homeGoals === '' || awayGoals === '') {
      setError('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      await adminAPI.updateMatchResult(matchId, parseInt(homeGoals), parseInt(awayGoals));
      setMatchId('');
      setHomeGoals('');
      setAwayGoals('');
      setSuccess('Ergebnis aktualisiert!');
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Benutzer wirklich löschen?')) return;

    try {
      await adminAPI.deleteUser(userId);
      setSuccess('Benutzer gelöscht!');
      fetchUsers();
    } catch (err) {
      setError('Fehler beim Löschen');
    }
  };

  const handleSyncMatches = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');
      const response = await adminAPI.syncMatches();
      setSuccess(response.data.message || 'Synchronisierung abgeschlossen');
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="container">
      <div className="page-title">
        <h1>🛠️ Admin Panel</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveTab('matches')}
        >
          Spiele verwalten
        </button>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Benutzer verwalten
        </button>
      </div>

      {activeTab === 'matches' && (
        <div className="admin-section">
          <div className="admin-hero card">
            <h2>Match Center</h2>
            <p>Automatisiere den Import oder bearbeite Spiele manuell vor dem Anpfiff.</p>
          </div>

          <div className="card">
            <h2>Automatischer Import</h2>
            <p className="admin-hint">
              Importiert Spiele und aktualisiert Ergebnisse automatisch ueber football-data.org.
            </p>
            <button type="button" className="btn-primary" onClick={handleSyncMatches} disabled={syncing}>
              {syncing ? 'Synchronisiert...' : 'Spiele und Ergebnisse synchronisieren'}
            </button>
          </div>

          <div className="card">
            <h2>Neues Spiel erstellen</h2>
            <form onSubmit={handleCreateMatch}>
              <div className="form-row">
                <div className="form-group">
                  <label>Heimmannschaft</label>
                  <input
                    type="text"
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Gastmannschaft</label>
                  <input
                    type="text"
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Spieltermin</label>
                <input
                  type="datetime-local"
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Runde / Spieltag</label>
                <select value={round} onChange={(e) => setRound(e.target.value)}>
                  <option value="">-- optional --</option>
                  {roundOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">Spiel erstellen</button>
            </form>
          </div>

          <div className="card">
            <h2>Spiel bearbeiten</h2>
            <form onSubmit={handleUpdateMatch}>
              <div className="form-group">
                <label>Spiel waehlen</label>
                <select value={editMatchId} onChange={(e) => handleEditMatchSelect(e.target.value)} required>
                  <option value="">-- Spiel waehlen --</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {match.home_team} vs {match.away_team} ({formatDate(match.match_date)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Heimmannschaft</label>
                  <input
                    type="text"
                    value={editHomeTeam}
                    onChange={(e) => setEditHomeTeam(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Gastmannschaft</label>
                  <input
                    type="text"
                    value={editAwayTeam}
                    onChange={(e) => setEditAwayTeam(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Spieltermin</label>
                <input
                  type="datetime-local"
                  value={editMatchDate}
                  onChange={(e) => setEditMatchDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Runde / Spieltag</label>
                <select value={editRound} onChange={(e) => setEditRound(e.target.value)}>
                  <option value="">-- optional --</option>
                  {roundOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={resetResult}
                  onChange={(e) => setResetResult(e.target.checked)}
                />
                Ergebnis zuruecksetzen (falls bereits eingetragen)
              </label>

              <button type="submit" className="btn-primary">Spiel speichern</button>
            </form>
          </div>

          <div className="card">
            <h2>Ergebnis eintragen</h2>
            <form onSubmit={handleUpdateResult}>
              <div className="form-group">
                <label>Spiel auswählen</label>
                <select
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  required
                >
                  <option value="">-- Spiel wählen --</option>
                  {matches.filter(m => !m.finished).map(match => (
                    <option key={match.id} value={match.id}>
                      {match.home_team} vs {match.away_team} ({formatDate(match.match_date)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Heimtore</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={homeGoals}
                    onChange={(e) => setHomeGoals(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Gasttore</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={awayGoals}
                    onChange={(e) => setAwayGoals(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary">Ergebnis speichern</button>
            </form>
          </div>

          <div className="card">
            <h2>Alle Spiele</h2>
            {loading ? (
              <p>Lädt...</p>
            ) : (
              <div className="matches-list">
                {matches.map(match => (
                  <div key={match.id} className="match-item">
                    <div>
                      <strong>{match.home_team} vs {match.away_team}</strong>
                      <div className="match-info">{formatDate(match.match_date)}{match.round ? ` · ${match.round}` : ''}</div>
                    </div>
                    <div className="match-result">
                      {match.finished ? (
                        <span className="finished">{match.home_goals}:{match.away_goals}</span>
                      ) : (
                        <span className="pending">Ausstehend</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="admin-section">
          <div className="card">
            <h2>Benutzer ({users.length})</h2>
            {loading ? (
              <p>Lädt...</p>
            ) : (
              <div className="users-list">
                {users.map(user => (
                  <div key={user.id} className="user-item">
                    <div>
                      <strong>{user.username}</strong>
                      <div className="user-info">{user.email}</div>
                      <div className="user-role">{user.role === 'admin' ? '👑 Admin' : 'Benutzer'}</div>
                    </div>
                    <button
                      className="btn-danger"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Löschen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
