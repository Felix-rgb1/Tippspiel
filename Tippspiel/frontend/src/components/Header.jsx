import { Link, NavLink } from 'react-router-dom';
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
              <NavLink to="/" className={({ isActive }) => (isActive ? 'is-active' : '')}>Dashboard</NavLink>
              <NavLink to="/leaderboard" className={({ isActive }) => (isActive ? 'is-active' : '')}>Rangliste</NavLink>
              <NavLink to="/groups" className={({ isActive }) => (isActive ? 'is-active' : '')}>Gruppen</NavLink>
              <NavLink to="/rules" className={({ isActive }) => (isActive ? 'is-active' : '')}>Regeln</NavLink>
              {user.role === 'admin' && (
                <NavLink to="/admin" className={({ isActive }) => (isActive ? 'is-active' : '')}>Admin</NavLink>
              )}
              <NavLink to="/profile" className={({ isActive }) => (isActive ? 'is-active' : '')}>Profil</NavLink>
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
