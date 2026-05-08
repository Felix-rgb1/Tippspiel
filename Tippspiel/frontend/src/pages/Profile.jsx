import { useState, useEffect, useRef } from 'react';
import { userAPI, leaderboardAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import BallLoader from '../components/BallLoader';
import './Profile.css';

const PRESET_AVATARS = [
  '⚽', '🏆', '🥅', '🎯', '🔥', '⚡', '💪', '🦁',
  '🐯', '🦊', '🐺', '🦅', '🐉', '🌟', '💎', '🚀',
  '🎸', '🎲', '🤖', '👾', '🍕', '🌮', '🍺', '☕',
  '🌈', '❄️', '🌊', '🌙', '☀️', '🎃', '👻', '💀',
];

function AvatarDisplay({ value, size = '2rem', className = '' }) {
  if (value && value.startsWith('data:')) {
    return (
      <img
        src={value}
        alt="Avatar"
        className={`avatar-img ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{value || '⚽'}</span>;
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
        // Draw centered square crop
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

function Profile() {
  const { user, updateUser } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('⚽');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
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
      setAvatar(profileResponse.data.avatar || '⚽');

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
      const res = await userAPI.updateProfile(username, email, avatar);
      updateUser({ username: res.data.username, email: res.data.email, avatar: res.data.avatar });
      setSuccess('Profil aktualisiert!');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Aktualisieren');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Nur Bilddateien erlaubt (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Bild zu groß (max. 5 MB)');
      return;
    }
    try {
      const dataUrl = await resizeImageToBase64(file, 80);
      setAvatar(dataUrl);
    } catch {
      setUploadError('Fehler beim Verarbeiten des Bildes');
    }
    // Reset so the same file can be selected again
    e.target.value = '';
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



  return (
    <BallLoader loading={loading} title="Profil wird geladen" subtitle="Deine Daten und Statistiken kommen gleich...">
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
              <label>Avatar</label>
              <div className="avatar-current">
                <AvatarDisplay value={avatar} size="3.5rem" />
              </div>
              <div className="avatar-upload-row">
                <button
                  type="button"
                  className="btn-secondary avatar-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📷 Bild hochladen
                </button>
                {avatar && avatar.startsWith('data:') && (
                  <button
                    type="button"
                    className="btn-secondary avatar-upload-btn"
                    onClick={() => setAvatar('⚽')}
                  >
                    ✕ Bild entfernen
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>
              {uploadError && <p className="avatar-upload-error">{uploadError}</p>}
              <p className="avatar-picker-label">Oder Emoji wählen:</p>
              <div className="avatar-grid">
                {PRESET_AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`avatar-option${avatar === emoji ? ' avatar-option--selected' : ''}`}
                    onClick={() => setAvatar(emoji)}
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
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
    </BallLoader>
  );
}

export default Profile;
