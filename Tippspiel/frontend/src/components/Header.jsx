import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Header.css';

function Header() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="header">
      <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px' }}>
        <Link to="/" className="logo">
          ⚽ WM Tippspiel
        </Link>
        
        {user && (
          <nav className="nav">
            <Link to="/">Dashboard</Link>
            <Link to="/leaderboard">Rangliste</Link>
            {user.role === 'admin' && <Link to="/admin">Admin</Link>}
            <Link to="/profile">Profil</Link>
            <button onClick={handleLogout} className="btn-primary">Abmelden</button>
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
