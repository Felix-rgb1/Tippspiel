import { useState, useEffect } from 'react';
import { matchAPI, tipAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function Dashboard() {
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    fetchMatches();
  }, [user]);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const response = await matchAPI.getAll();
      setMatches(response.data);

      // Fetch user's tips
      const tipsResponse = await tipAPI.getUserTips(user.id);
      const tipsMap = {};
      tipsResponse.data.forEach(tip => {
        tipsMap[tip.match_id] = {
          home_goals: tip.home_goals,
          away_goals: tip.away_goals
        };
      });
      setTips(tipsMap);
    } catch (err) {
      setError('Fehler beim Laden der Spiele');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTipChange = (matchId, field, value) => {
    setTips(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [field]: parseInt(value) || 0
      }
    }));
  };

  const handleSubmitTip = async (matchId) => {
    try {
      const tip = tips[matchId] || {};
      const homeGoals = tip.home_goals ?? 0;
      const awayGoals = tip.away_goals ?? 0;
      await tipAPI.submit(matchId, homeGoals, awayGoals);
      setSuccess('Tipp abgegeben!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Abgeben des Tipps');
    }
  };

  const isDeadlinePassed = (matchDate) => {
    const deadline = new Date(new Date(matchDate).getTime() - 60 * 60 * 1000);
    return new Date() > deadline;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="container"><p>Lädt...</p></div>;

  return (
    <div className="container">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Geben Sie Ihre Tipps ab!</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="matches-grid">
        {matches.map(match => {
          const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
          const deadlinePasssed = isDeadlinePassed(match.match_date);

          return (
            <div key={match.id} className="match-card">
              <div className="match-date">{formatDate(match.match_date)}</div>
              
              <div className="match-teams">
                <div className="team">{match.home_team}</div>
                <div className="score">
                  {match.finished ? (
                    <div className="final-score">
                      <span>{match.home_goals}</span>
                      <span>:</span>
                      <span>{match.away_goals}</span>
                    </div>
                  ) : (
                    <div>vs</div>
                  )}
                </div>
                <div className="team">{match.away_team}</div>
              </div>

              {!match.finished && (
                <>
                  <div className="tip-inputs">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={tip.home_goals}
                      onChange={(e) => handleTipChange(match.id, 'home_goals', e.target.value)}
                      disabled={deadlinePasssed}
                    />
                    <span>:</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={tip.away_goals}
                      onChange={(e) => handleTipChange(match.id, 'away_goals', e.target.value)}
                      disabled={deadlinePasssed}
                    />
                  </div>

                  {deadlinePasssed ? (
                    <div className="deadline-passed">Deadline verpasst</div>
                  ) : (
                    <button
                      className="btn-primary"
                      onClick={() => handleSubmitTip(match.id)}
                    >
                      Tipp abgeben
                    </button>
                  )}
                </>
              )}

              {match.finished && tip.home_goals !== undefined && (
                <div className="submitted-tip">
                  Mein Tipp: {tip.home_goals}:{tip.away_goals}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
