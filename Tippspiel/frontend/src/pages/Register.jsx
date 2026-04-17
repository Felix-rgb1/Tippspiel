import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';
import './Auth.css';

function getRegistrationErrorMessage(err) {
  if (err.response?.data?.error) {
    return err.response.data.error;
  }

  if (err.code === 'ERR_NETWORK') {
    return 'Backend nicht erreichbar. Prüfe API-URL und Server-Status.';
  }

  if (err.response?.status >= 500) {
    return 'Serverfehler bei der Registrierung. Prüfe die Backend-Logs.';
  }

  return 'Registrierung fehlgeschlagen';
}

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.register(username, password);
      login(response.data.user, response.data.token);
      navigate('/');
    } catch (err) {
      setError(getRegistrationErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Registrieren</h1>
        
        {error && <div className="alert alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Benutzername</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Lädt...' : 'Registrieren'}
          </button>
        </form>

        <p className="auth-link">
          Bereits registriert? <Link to="/login">Hier anmelden</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
