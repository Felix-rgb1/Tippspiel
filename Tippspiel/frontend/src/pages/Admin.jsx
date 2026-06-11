import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { adminAPI, matchAPI, tipAPI } from '../api';
import { formatDateTimeDe, toDateTimeLocalInputValue, toTimestamp } from '../utils/dateTime';
import { getMatchThemeStyle } from '../utils/teamTheme';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

const PRESET_AVATARS = [
  '⚽', '🏆', '🥅', '🎯', '🔥', '⚡', '💪', '🦁',
  '🐯', '🦊', '🐺', '🦅', '🐉', '🌟', '💎', '🚀',
  '🎸', '🎲', '🤖', '👾', '🍕', '🌮', '🍺', '☕',
  '🌈', '❄️', '🌊', '🌙', '☀️', '🎃', '👻', '💀',
];

function AvatarDisplay({ value, size = '2rem' }) {
  if (value && value.startsWith('data:')) {
    return <img src={value} alt="Avatar" className="admin-avatar-img" style={{ width: size, height: size }} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{value || '⚽'}</span>;
}

function resizeImageToBase64(file, maxSize = 80) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Admin() {
  const { user: currentUser } = useAuth();
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
  const [importingWM, setImportingWM] = useState(false);
  const [syncingWMResults, setSyncingWMResults] = useState(false);
  const [importingBundesliga, setImportingBundesliga] = useState(false);
  const [importingLiveToday, setImportingLiveToday] = useState(false);
  const [syncingBundesligaResults, setSyncingBundesligaResults] = useState(false);
  const [exportingTips, setExportingTips] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [savingBonusResult, setSavingBonusResult] = useState(false);
  const adminAvatarFileRef = useRef(null);
  const [adminAvatarUploadError, setAdminAvatarUploadError] = useState('');

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

  const [userEditForm, setUserEditForm] = useState({
    username: '',
    email: '',
    role: 'user',
    newPassword: ''
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

  const toDateTimeLocal = (date) => toDateTimeLocalInputValue(date);

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
    if (String(currentUser?.id) === String(userId)) {
      setError('Du kannst deinen eigenen Account nicht löschen');
      return;
    }

    if (!window.confirm('Benutzer wirklich löschen?')) return;

    try {
      await adminAPI.deleteUser(userId);
      setSuccess('Benutzer gelöscht!');
      fetchUsers();
    } catch (err) {
      setError('Fehler beim Löschen');
    }
  };

  const startEditUser = (user) => {
    setEditingUserId(user.id);
    setUserEditForm({
      username: user.username || '',
      email: user.email || '',
      role: user.role || 'user',
      newPassword: '',
      avatar: user.avatar || '⚽',
    });
    setAdminAvatarUploadError('');
    setError('');
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setUserEditForm({
      username: '',
      email: '',
      role: 'user',
      newPassword: '',
      avatar: '⚽',
    });
    setAdminAvatarUploadError('');
  };

  const handleAdminAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAdminAvatarUploadError('');
    if (!file.type.startsWith('image/')) {
      setAdminAvatarUploadError('Nur Bilddateien erlaubt');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAdminAvatarUploadError('Bild zu groß (max. 5 MB)');
      return;
    }
    try {
      const dataUrl = await resizeImageToBase64(file, 80);
      setUserEditForm((prev) => ({ ...prev, avatar: dataUrl }));
    } catch {
      setAdminAvatarUploadError('Fehler beim Verarbeiten des Bildes');
    }
    e.target.value = '';
  };

  const handleSaveUser = async (userId) => {
    if (!userEditForm.username || !userEditForm.email) {
      setError('Benutzername und E-Mail sind erforderlich');
      return;
    }

    if (String(currentUser?.id) === String(userId) && userEditForm.role !== 'admin') {
      setError('Du kannst dir die Admin-Rolle nicht selbst entziehen');
      return;
    }

    try {
      setSavingUser(true);
      setError('');
      await adminAPI.updateUser(
        userId,
        userEditForm.username,
        userEditForm.email,
        userEditForm.role,
        userEditForm.avatar
      );
      setSuccess('Benutzer aktualisiert');
      setTimeout(() => setSuccess(''), 2500);
      await fetchUsers();
      cancelEditUser();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren des Benutzers');
    } finally {
      setSavingUser(false);
    }
  };

  const handleResetUserPassword = async (userId) => {
    if (!userEditForm.newPassword || userEditForm.newPassword.length < 6) {
      setError('Neues Passwort muss mindestens 6 Zeichen haben');
      return;
    }

    try {
      setResettingPassword(true);
      setError('');
      await adminAPI.resetUserPassword(userId, userEditForm.newPassword);
      setSuccess('Passwort zurückgesetzt');
      setTimeout(() => setSuccess(''), 2500);
      setUserEditForm((prev) => ({ ...prev, newPassword: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Zurücksetzen des Passworts');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleImportWMMatches = async () => {
    try {
      setImportingWM(true);
      setError('');
      const response = await adminAPI.importWMMatches();
      const data = response.data || {};
      setSuccess(
        data.message
        || 'WM-Import gestartet. Bitte Seite in 2-3 Minuten neu laden.'
      );
      setTimeout(() => setSuccess(''), 15000);
    } catch (err) {
      setError(err.response?.data?.error || 'WM-Import fehlgeschlagen');
    } finally {
      setImportingWM(false);
    }
  };

  const handleImportBundesliga = async () => {
    try {
      setImportingBundesliga(true);
      setError('');
      const response = await adminAPI.importBundesliga();
      const data = response.data || {};
      setSuccess(
        data.message
        || `Bundesliga-Import abgeschlossen: ${data.createdCount || 0} neu, ${data.updatedCount || 0} aktualisiert, ${data.totalFetched || 0} von API erhalten.`
      );
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Bundesliga-Import fehlgeschlagen');
    } finally {
      setImportingBundesliga(false);
    }
  };

  const handleImportLiveToday = async () => {
    try {
      setImportingLiveToday(true);
      setError('');
      const response = await adminAPI.importLiveToday('any', 1);
      const data = response.data || {};
      setSuccess(data.message || 'Live-Testspiel importiert');
      setTimeout(() => setSuccess(''), 5000);
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Live-Test-Import fehlgeschlagen');
    } finally {
      setImportingLiveToday(false);
    }
  };

  const handleSyncWMResults = async () => {
    try {
      setSyncingWMResults(true);
      setError('');
      const response = await adminAPI.syncWMResults();
      const data = response.data || {};
      setSuccess(
        data.message
        || `WM-Ergebnisse aktualisiert: ${data.updatedCount || 0} Spiele eingetragen.`
      );
      setTimeout(() => setSuccess(''), 5000);
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'WM-Ergebnis-Synchronisierung fehlgeschlagen');
    } finally {
      setSyncingWMResults(false);
    }
  };

  const handleSyncBundesligaResults = async () => {
    try {
      setSyncingBundesligaResults(true);
      setError('');
      const response = await adminAPI.syncBundesligaResults();
      const data = response.data || {};
      setSuccess(
        data.message
        || `Ergebnisse aktualisiert: ${data.updatedCount || 0} Spiele eingetragen.`
      );
      setTimeout(() => setSuccess(''), 5000);
      fetchMatches();
    } catch (err) {
      setError(err.response?.data?.error || 'Ergebnis-Synchronisierung fehlgeschlagen');
    } finally {
      setSyncingBundesligaResults(false);
    }
  };

  const extractApiErrorMessage = async (err, fallbackMessage) => {
    const responseData = err?.response?.data;

    if (responseData instanceof Blob) {
      try {
        const text = await responseData.text();
        const parsed = JSON.parse(text);
        return parsed?.error || fallbackMessage;
      } catch {
        return fallbackMessage;
      }
    }

    return responseData?.error || fallbackMessage;
  };

  const downloadTipsExcelInBrowser = async () => {
    const usersResponse = await adminAPI.getUsers();
    const users = usersResponse.data || [];

    const tipsPerUser = await Promise.all(
      users.map(async (user) => {
        const tipsResponse = await tipAPI.getUserTips(user.id);
        return (tipsResponse.data || []).map((tip) => ({
          tipId: tip.id,
          username: user.username,
          email: user.email,
          round: tip.round || '-',
          matchDate: tip.match_date,
          homeTeam: tip.home_team,
          awayTeam: tip.away_team,
          homeGoals: tip.home_goals,
          awayGoals: tip.away_goals,
          createdAt: tip.created_at,
          updatedAt: tip.updated_at
        }));
      })
    );

    const rows = tipsPerUser
      .flat()
      .sort((a, b) => {
        const dateA = toTimestamp(a.matchDate);
        const dateB = toTimestamp(b.matchDate);
        if (dateA !== dateB) return dateA - dateB;
        return a.username.localeCompare(b.username, 'de');
      })
      .map((row) => ({
        'Tipp-ID': row.tipId,
        Benutzername: row.username,
        'E-Mail': row.email,
        Runde: row.round,
        Spieldatum: formatDate(row.matchDate),
        Heimteam: row.homeTeam,
        Gastteam: row.awayTeam,
        'Tipp Heimtore': row.homeGoals,
        'Tipp Gasttore': row.awayGoals,
        'Erstellt am': formatDate(row.createdAt),
        'Aktualisiert am': formatDate(row.updatedAt)
      }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tipps');

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    XLSX.writeFile(workbook, `tipps-export-${yyyy}-${mm}-${dd}.xlsx`);
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
      try {
        await downloadTipsExcelInBrowser();
        setSuccess('Excel-Export wurde per Browser-Fallback heruntergeladen');
        setTimeout(() => setSuccess(''), 3000);
      } catch (fallbackErr) {
        const msg = await extractApiErrorMessage(err, 'Fehler beim Export der Tipps');
        const fallbackMsg = await extractApiErrorMessage(fallbackErr, msg);
        setError(fallbackMsg);
      }
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

  const formatDate = (date) => formatDateTimeDe(date, false);

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
              onClick={handleImportWMMatches}
              disabled={importingWM}
            >
              {importingWM ? '⏳ WM-Import läuft (~90s)...' : '🌍 WM-Spiele importieren'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleImportBundesliga}
              disabled={importingBundesliga}
            >
              {importingBundesliga ? '⏳ Import läuft...' : '🏆 Bundesliga von Flashscore importieren'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleImportLiveToday}
              disabled={importingLiveToday}
            >
              {importingLiveToday ? '⏳ Import läuft...' : '🧪 Heutiges Live-Testspiel importieren'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSyncWMResults}
              disabled={syncingWMResults}
            >
              {syncingWMResults ? '⏳ Aktualisiert...' : '🌍 WM-Ergebnisse aktualisieren'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSyncBundesligaResults}
              disabled={syncingBundesligaResults}
            >
              {syncingBundesligaResults ? '⏳ Aktualisiert...' : '⚽ Bundesliga-Ergebnisse aktualisieren'}
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
                    {editingUserId === user.id ? (
                      <div className="user-edit-form">
                        <div className="user-edit-row">
                          <label>Benutzername</label>
                          <input
                            type="text"
                            value={userEditForm.username}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, username: e.target.value }))}
                          />
                        </div>
                        <div className="user-edit-row">
                          <label>E-Mail</label>
                          <input
                            type="email"
                            value={userEditForm.email}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                        <div className="user-edit-row">
                          <label>Rolle</label>
                          <select
                            value={userEditForm.role}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, role: e.target.value }))}
                            disabled={String(currentUser?.id) === String(user.id)}
                          >
                            <option value="user">Spieler</option>
                            <option value="admin">Admin</option>
                          </select>
                          {String(currentUser?.id) === String(user.id) && (
                            <small className="self-protection-hint">Eigener Account muss Admin bleiben.</small>
                          )}
                        </div>
                        <div className="user-edit-row">
                          <label>Neues Passwort (Reset)</label>
                          <input
                            type="password"
                            value={userEditForm.newPassword}
                            onChange={(e) => setUserEditForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                            placeholder="Mindestens 6 Zeichen"
                          />
                        </div>
                        <div className="user-edit-row">
                          <label>Profilbild</label>
                          <div className="admin-avatar-preview">
                            <AvatarDisplay value={userEditForm.avatar} size="2.5rem" />
                          </div>
                          <div className="admin-avatar-upload-row">
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => adminAvatarFileRef.current?.click()}
                            >
                              📷 Bild hochladen
                            </button>
                            {userEditForm.avatar && userEditForm.avatar.startsWith('data:') && (
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => setUserEditForm((prev) => ({ ...prev, avatar: '⚽' }))}
                              >
                                ✕ Entfernen
                              </button>
                            )}
                            <input
                              ref={adminAvatarFileRef}
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={handleAdminAvatarUpload}
                            />
                          </div>
                          {adminAvatarUploadError && (
                            <small style={{ color: '#dc2626' }}>{adminAvatarUploadError}</small>
                          )}
                          <div className="admin-avatar-grid">
                            {PRESET_AVATARS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className={`admin-avatar-option${userEditForm.avatar === emoji ? ' admin-avatar-option--selected' : ''}`}
                                onClick={() => setUserEditForm((prev) => ({ ...prev, avatar: emoji }))}
                                aria-label={emoji}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="user-actions">
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => handleSaveUser(user.id)}
                            disabled={savingUser}
                          >
                            {savingUser ? 'Speichert...' : 'Speichern'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleResetUserPassword(user.id)}
                            disabled={resettingPassword}
                          >
                            {resettingPassword ? 'Setzt zurück...' : 'Passwort zurücksetzen'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={cancelEditUser}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="user-item-info">
                          <div className="user-item-avatar">
                            <AvatarDisplay value={user.avatar} size="2rem" />
                          </div>
                          <div>
                            <strong>{user.username}</strong>
                            <div className="user-info">{user.email}</div>
                            <div className="user-role">{user.role === 'admin' ? '👑 Admin' : 'Spieler'}</div>
                          </div>
                        </div>
                        <div className="user-actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => startEditUser(user)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            className="btn-danger"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={String(currentUser?.id) === String(user.id)}
                            title={String(currentUser?.id) === String(user.id) ? 'Eigener Account kann nicht gelöscht werden' : ''}
                          >
                            Löschen
                          </button>
                        </div>
                      </>
                    )}
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
