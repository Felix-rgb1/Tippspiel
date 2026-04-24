import { useState, useEffect } from 'react';
import { adminAPI, matchAPI } from '../api';
import { getMatchThemeStyle } from '../utils/teamTheme';
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
  const [exportingTips, setExportingTips] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [savingBonusResult, setSavingBonusResult] = useState(false);

  // Quick edit form
  const [editForm, setEditForm] = useState({
    homeTeam: '',
    awayTeam: '',
    matchDate: '',
    round: '',
    homeGoals: '',
    awayGoals: '',
    resetResult: false
  });

  // New match form
  const [newMatch, setNewMatch] = useState({
    homeTeam: '',
    awayTeam: '',
    matchDate: '',
    round: ''
  });

  const [bonusResult, setBonusResult] = useState({
    championTeam: '',
    runnerUpTeam: '',
    championPoints: 5,
    runnerUpPoints: 3
  });


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
      const [matchesResult, bonusConfigResult] = await Promise.allSettled([
        matchAPI.getAll(),
        adminAPI.getBonusResult()
      ]);

      if (matchesResult.status !== 'fulfilled') {
        throw matchesResult.reason;
      }

      setMatches(matchesResult.value.data);
      setEditingId(null);

      if (bonusConfigResult.status === 'fulfilled' && bonusConfigResult.value.data) {
        setBonusResult({
          championTeam: bonusConfigResult.value.data.champion_team || '',
          runnerUpTeam: bonusConfigResult.value.data.runner_up_team || '',
          championPoints: bonusConfigResult.value.data.champion_points || 5,
          runnerUpPoints: bonusConfigResult.value.data.runner_up_points || 3
        });
      }
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

  const toDateTimeLocal = (date) => {
    const parsedDate = new Date(date);
    const timezoneOffset = parsedDate.getTimezoneOffset() * 60000;
    return new Date(parsedDate.getTime() - timezoneOffset).toISOString().slice(0, 16);
  };

  const startEdit = (match) => {
    setEditingId(match.id);
    setEditForm({
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      matchDate: toDateTimeLocal(match.match_date),
      round: match.round || '',
      homeGoals: match.home_goals || '',
      awayGoals: match.away_goals || '',
      resetResult: false
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      homeTeam: '',
      awayTeam: '',
      matchDate: '',
      round: '',
      homeGoals: '',
      awayGoals: '',
      resetResult: false
    });
  };

  const handleSaveMatch = async (matchId) => {
    if (!editForm.homeTeam || !editForm.awayTeam || !editForm.matchDate) {
      setError('Bitte Heimteam, Gastteam und Datum ausfüllen');
      return;
    }

    try {
      setError('');
      await adminAPI.updateMatch(
        matchId,
        editForm.homeTeam,
        editForm.awayTeam,
        editForm.matchDate,
        editForm.round,
        editForm.resetResult
      );

      // Update result if provided
      if ((editForm.homeGoals !== '' || editForm.awayGoals !== '') && editForm.homeGoals !== '' && editForm.awayGoals !== '') {
        await adminAPI.updateMatchResult(matchId, parseInt(editForm.homeGoals), parseInt(editForm.awayGoals));
      }

      setSuccess('Spiel gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
      fetchMatches();
      cancelEdit();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleCreateNewMatch = async (e) => {
    e.preventDefault();
    if (!newMatch.homeTeam || !newMatch.awayTeam || !newMatch.matchDate) {
      setError('Bitte Heimteam, Gastteam und Datum ausfüllen');
      return;
    }

    try {
      setError('');
      await adminAPI.createMatch(newMatch.homeTeam, newMatch.awayTeam, newMatch.matchDate, newMatch.round);
      setSuccess('Spiel erstellt!');
      setNewMatch({ homeTeam: '', awayTeam: '', matchDate: '', round: '' });
      setTimeout(() => setSuccess(''), 3000);
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Erstellen');
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
      const response = await adminAPI.syncMatches();
      setSuccess(response.data.message || 'Synchronisierung abgeschlossen');
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportTipsExcel = async () => {
    try {
      setExportingTips(true);
      setError('');

      const response = await adminAPI.exportTipsExcel();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const contentDisposition = response.headers?.['content-disposition'] || '';
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] || 'tipps-export.xlsx';

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Excel-Export wurde heruntergeladen');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Export der Tipps');
    } finally {
      setExportingTips(false);
    }
  };

  const handleSaveBonusResult = async () => {
    if (!bonusResult.championTeam || !bonusResult.runnerUpTeam) {
      setError('Bitte Weltmeister und Vizemeister setzen');
      return;
    }

    if (bonusResult.championTeam === bonusResult.runnerUpTeam) {
      setError('Weltmeister und Vizemeister müssen unterschiedlich sein');
      return;
    }

    try {
      setSavingBonusResult(true);
      setError('');
      await adminAPI.updateBonusResult(
        bonusResult.championTeam,
        bonusResult.runnerUpTeam,
        Number(bonusResult.championPoints) || 5,
        Number(bonusResult.runnerUpPoints) || 3
      );
      setSuccess('Bonus-Auswertung gespeichert');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern der Bonus-Auswertung');
    } finally {
      setSavingBonusResult(false);
    }
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const allTeams = Array.from(
    new Set(matches.flatMap((match) => [match.home_team, match.away_team]).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'de'));

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
          Spiele
        </button>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Benutzer
        </button>
      </div>

      {activeTab === 'matches' && (
        <div className="admin-section">
          <div className="admin-actions">
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleSyncMatches} 
              disabled={syncing}
            >
              {syncing ? '⏳ Synchronisiert...' : '🔄 Spiele synchronisieren'}
            </button>
            <button
              type="button"
              className="btn-success"
              onClick={handleExportTipsExcel}
              disabled={exportingTips}
            >
              {exportingTips ? '⏳ Export läuft...' : '📥 Tipps als Excel herunterladen'}
            </button>
          </div>

          <div className="card">
            <h2>Bonus-Auswertung (Weltmeister / Vizemeister)</h2>
            <div className="bonus-admin-grid">
              <div>
                <label>Weltmeister</label>
                <select
                  value={bonusResult.championTeam}
                  onChange={(e) => setBonusResult((prev) => ({ ...prev, championTeam: e.target.value }))}
                >
                  <option value="">-- wählen --</option>
                  {allTeams.map((team) => (
                    <option key={`bonus-champion-${team}`} value={team}>{team}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Vizemeister</label>
                <select
                  value={bonusResult.runnerUpTeam}
                  onChange={(e) => setBonusResult((prev) => ({ ...prev, runnerUpTeam: e.target.value }))}
                >
                  <option value="">-- wählen --</option>
                  {allTeams.map((team) => (
                    <option key={`bonus-runner-${team}`} value={team}>{team}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Punkte Weltmeister</label>
                <input
                  type="number"
                  min="0"
                  value={bonusResult.championPoints}
                  onChange={(e) => setBonusResult((prev) => ({ ...prev, championPoints: e.target.value }))}
                />
              </div>
              <div>
                <label>Punkte Vizemeister</label>
                <input
                  type="number"
                  min="0"
                  value={bonusResult.runnerUpPoints}
                  onChange={(e) => setBonusResult((prev) => ({ ...prev, runnerUpPoints: e.target.value }))}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveBonusResult}
                disabled={savingBonusResult}
              >
                {savingBonusResult ? 'Speichert...' : 'Bonus-Auswertung speichern'}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Neues Spiel</h2>
            <form onSubmit={handleCreateNewMatch} className="quick-form">
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Heimteam"
                  value={newMatch.homeTeam}
                  onChange={(e) => setNewMatch({...newMatch, homeTeam: e.target.value})}
                  required
                />
                <span className="vs">vs</span>
                <input
                  type="text"
                  placeholder="Gastteam"
                  value={newMatch.awayTeam}
                  onChange={(e) => setNewMatch({...newMatch, awayTeam: e.target.value})}
                  required
                />
              </div>
              <div className="form-row">
                <input
                  type="datetime-local"
                  value={newMatch.matchDate}
                  onChange={(e) => setNewMatch({...newMatch, matchDate: e.target.value})}
                  required
                />
                <select 
                  value={newMatch.round} 
                  onChange={(e) => setNewMatch({...newMatch, round: e.target.value})}
                >
                  <option value="">-- Runde --</option>
                  {roundOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">Erstellen</button>
            </form>
          </div>

          <div className="card">
            <h2>Spiele ({matches.length})</h2>
            {loading ? (
              <p>Lädt...</p>
            ) : (
              <div className="matches-table">
                {matches.map(match => (
                  <div key={match.id} className="match-row" style={getMatchThemeStyle(match.home_team, match.away_team)}>
                    {editingId === match.id ? (
                      <>
                        <div className="match-edit-form">
                          <div className="edit-row">
                            <input
                              type="text"
                              value={editForm.homeTeam}
                              onChange={(e) => setEditForm({...editForm, homeTeam: e.target.value})}
                              placeholder="Heimteam"
                            />
                            <span className="vs">vs</span>
                            <input
                              type="text"
                              value={editForm.awayTeam}
                              onChange={(e) => setEditForm({...editForm, awayTeam: e.target.value})}
                              placeholder="Gastteam"
                            />
                          </div>
                          <div className="edit-row">
                            <input
                              type="datetime-local"
                              value={editForm.matchDate}
                              onChange={(e) => setEditForm({...editForm, matchDate: e.target.value})}
                            />
                            <select 
                              value={editForm.round} 
                              onChange={(e) => setEditForm({...editForm, round: e.target.value})}
                            >
                              <option value="">-- Runde --</option>
                              {roundOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                          {!match.finished && (
                            <div className="edit-row">
                              <label>Ergebnis:</label>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                value={editForm.homeGoals}
                                onChange={(e) => setEditForm({...editForm, homeGoals: e.target.value})}
                                placeholder="H-Tore"
                                style={{width: '60px'}}
                              />
                              <span>:</span>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                value={editForm.awayGoals}
                                onChange={(e) => setEditForm({...editForm, awayGoals: e.target.value})}
                                placeholder="G-Tore"
                                style={{width: '60px'}}
                              />
                            </div>
                          )}
                          <label className="checkbox-line">
                            <input
                              type="checkbox"
                              checked={editForm.resetResult}
                              onChange={(e) => setEditForm({...editForm, resetResult: e.target.checked})}
                            />
                            Ergebnis zurücksetzen
                          </label>
                          <div className="edit-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleSaveMatch(match.id)}
                            >
                              💾 Speichern
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={cancelEdit}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="match-info">
                          <div className="match-teams">
                            <strong>{match.home_team}</strong>
                            <span>vs</span>
                            <strong>{match.away_team}</strong>
                          </div>
                          <div className="match-meta">
                            {formatDate(match.match_date)}
                            {match.round && <span className="badge">{match.round}</span>}
                          </div>
                        </div>
                        <div className="match-status">
                          {match.finished ? (
                            <span className="result-badge">{match.home_goals}:{match.away_goals}</span>
                          ) : (
                            <span className="status-badge">Ausstehend</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => startEdit(match)}
                        >
                          ✏️ Bearbeiten
                        </button>
                      </>
                    )}
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
                      <div className="user-role">{user.role === 'admin' ? '👑 Admin' : 'Spieler'}</div>
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
