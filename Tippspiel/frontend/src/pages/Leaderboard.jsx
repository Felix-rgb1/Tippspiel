import { useState, useEffect } from 'react';
import { leaderboardAPI } from '../api';
import './Leaderboard.css';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await leaderboardAPI.getAll();
      setLeaderboard(response.data);
    } catch (err) {
      setError('Fehler beim Laden der Rangliste');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="container"><p>Lädt...</p></div>;

  return (
    <div className="container">
      <div className="page-title">
        <h1>🏆 Rangliste</h1>
        <p>Aktuelle Punktestand</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="leaderboard-table">
        <div className="table-header">
          <div className="col-rank">Platz</div>
          <div className="col-name">Spieler</div>
          <div className="col-tips">Tipps</div>
          <div className="col-points">Punkte</div>
        </div>

        {leaderboard.map((entry, index) => (
          <div key={entry.id} className="table-row">
            <div className="col-rank">
              {index === 0 && '🥇'}
              {index === 1 && '🥈'}
              {index === 2 && '🥉'}
              {index > 2 && `${index + 1}.`}
            </div>
            <div className="col-name">{entry.username}</div>
            <div className="col-tips">{entry.tips_submitted || 0}</div>
            <div className="col-points">
              <strong>{entry.total_points || 0}</strong>
            </div>
          </div>
        ))}

        {leaderboard.length === 0 && (
          <div className="table-empty">Noch keine Spieler</div>
        )}
      </div>
    </div>
  );
}

export default Leaderboard;
