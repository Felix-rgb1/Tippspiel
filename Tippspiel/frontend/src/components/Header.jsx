import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Header.css';

function Header({ isDarkMode, onToggleTheme }) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">
          ⚽ WM Tippspiel
        </Link>

        <div className="header-actions">
          {user && (
            <nav className="nav">
              <Link to="/">Dashboard</Link>
              <Link to="/leaderboard">Rangliste</Link>
              <Link to="/rules">Regeln</Link>
              {user.role === 'admin' && <Link to="/admin">Admin</Link>}
              <Link to="/profile">Profil</Link>
              <button onClick={handleLogout} className="btn-primary">Abmelden</button>
            </nav>
          )}

          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-pressed={isDarkMode}
            title={isDarkMode ? 'Dark Mode deaktivieren' : 'Dark Mode aktivieren'}
          >
            {isDarkMode ? '☀️ Hell' : '🌙 Dunkel'}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
