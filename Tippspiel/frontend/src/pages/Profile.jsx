import { useState, useEffect } from 'react';
import { userAPI, leaderboardAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

function Profile() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const profileResponse = await userAPI.getProfile();
      setUsername(profileResponse.data.username);
      setEmail(profileResponse.data.email);

      const statsResponse = await leaderboardAPI.getUserStats(user.id);
      setStats(statsResponse.data);
    } catch (err) {
      setError('Fehler beim Laden des Profils');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await userAPI.updateProfile(username, email);
      setSuccess('Profil aktualisiert!');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    try {
      await userAPI.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Passwort geändert!');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Ändern des Passworts');
    }
  };

  if (loading) return <div className="container"><p>Lädt...</p></div>;

  return (
    <div className="container">
      <div className="page-title">
        <h1>Mein Profil</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="profile-grid">
        <div className="card">
          <h2>Benutzerinformationen</h2>
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>Benutzername</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary">Speichern</button>
          </form>
        </div>

        <div className="card">
          <h2>Passwort ändern</h2>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Altes Passwort</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Neues Passwort</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Passwort wiederholen</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">Passwort ändern</button>
          </form>
        </div>

        {stats && (
          <div className="card stats-card">
            <h2>Meine Statistik</h2>
            <div className="stat-item">
              <span>Tipps abgegeben:</span>
              <strong>{stats.tips_submitted || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Punkte:</span>
              <strong>{stats.total_points || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Exakte Treffer:</span>
              <strong>{stats.exact_matches || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Trend-Treffer:</span>
              <strong>{stats.trend_matches || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Bonuspunkte:</span>
              <strong>{stats.bonus_points || 0}</strong>
            </div>
            <div className="activity-block">
              <div className="activity-label">
                <span>Aktivität</span>
                <strong>{stats.activity_rate || 0}%</strong>
              </div>
              <div className="activity-bar">
                <div className="activity-fill" style={{ width: `${stats.activity_rate || 0}%` }} />
              </div>
              <p>{stats.tips_submitted || 0} von {stats.total_matches || 0} Spielen getippt</p>
            </div>
          </div>
        )}

        {stats && (
          <div className="card chart-card">
            <h2>Formkurve (letzte 5 Spiele)</h2>
            <div className="form-chart">
              {(stats.form_last_five || []).map((item) => (
                <div key={`form-${item.id}`} className="form-bar-wrap">
                  <div
                    className={`form-bar points-${item.points || 0}`}
                    style={{ height: `${Math.max(18, ((item.points || 0) / 3) * 90)}px` }}
                    title={`${item.home_team} vs ${item.away_team}: ${item.points || 0} Punkte`}
                  >
                    {item.points || 0}
                  </div>
                </div>
              ))}
            </div>
            {(stats.form_last_five || []).length === 0 && <p>Noch keine abgeschlossenen Tipps.</p>}
          </div>
        )}

        {stats && (
          <div className="card chart-card">
            <h2>Punkte pro Runde</h2>
            <div className="round-points-list">
              {(stats.round_points || []).map((row) => (
                <div key={`round-${row.round}`} className="round-points-item">
                  <span>{row.round}</span>
                  <strong>{row.points || 0} Punkte</strong>
                </div>
              ))}
            </div>
            {(stats.round_points || []).length === 0 && <p>Noch keine abgeschlossenen Runden.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
