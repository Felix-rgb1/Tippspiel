import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { matchAPI } from '../api';
import './MatchInfo.css';

function formatDate(dateValue) {
  if (!dateValue) {
    return '-';
  }

  return new Date(dateValue).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function outcomeLabel(outcome) {
  if (outcome === 'S') return 'Sieg';
  if (outcome === 'U') return 'Unentschieden';
  return 'Niederlage';
}

function MatchInfo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await matchAPI.getInsights(id);
        setInsights(response.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Match-Infos konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [id]);

  const sourceLabel = useMemo(() => {
    if (!insights?.source) return 'lokale Daten';
    return insights.source === 'football-data' ? 'football-data API' : 'lokale Daten';
  }, [insights]);

  if (loading) {
    return (
      <div className="container match-info-page">
        <div className="card">
          <p>Lade Match-Infos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container match-info-page">
        <div className="alert alert-error">{error}</div>
        <button type="button" className="btn-primary" onClick={() => navigate(-1)}>
          Zurueck
        </button>
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  return (
    <div className="container match-info-page">
      <div className="page-title">
        <h1>{insights.match.home_team} vs {insights.match.away_team}</h1>
        <p>
          {formatDate(insights.match.match_date)}
          {insights.match.round ? ` · ${insights.match.round}` : ''}
        </p>
      </div>

      <div className="match-info-actions">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Zurueck</button>
        <Link to="/" className="btn-primary">Dashboard</Link>
      </div>

      <div className="card probabilities-card">
        <h2>Geschaetzte Siegchancen</h2>
        <p className="muted">Basis: {sourceLabel}. {insights.probabilities.note}</p>
        <div className="probabilities-grid">
          <div>
            <span>{insights.match.home_team}</span>
            <strong>{insights.probabilities.homeWin}%</strong>
          </div>
          <div>
            <span>Unentschieden</span>
            <strong>{insights.probabilities.draw}%</strong>
          </div>
          <div>
            <span>{insights.match.away_team}</span>
            <strong>{insights.probabilities.awayWin}%</strong>
          </div>
        </div>
      </div>

      <div className="match-insights-grid">
        <div className="card">
          <h2>Letzte Spiele: {insights.homeTeam.name}</h2>
          <ul className="recent-list">
            {insights.homeTeam.recentMatches.length === 0 && <li>Keine Spiele verfuegbar.</li>}
            {insights.homeTeam.recentMatches.map((match, index) => (
              <li key={`home-${index}`}>
                <span>{formatDate(match.date)} · gegen {match.opponent}</span>
                <strong>{match.ownGoals}:{match.opponentGoals} ({outcomeLabel(match.outcome)})</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Letzte Spiele: {insights.awayTeam.name}</h2>
          <ul className="recent-list">
            {insights.awayTeam.recentMatches.length === 0 && <li>Keine Spiele verfuegbar.</li>}
            {insights.awayTeam.recentMatches.map((match, index) => (
              <li key={`away-${index}`}>
                <span>{formatDate(match.date)} · gegen {match.opponent}</span>
                <strong>{match.ownGoals}:{match.opponentGoals} ({outcomeLabel(match.outcome)})</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Direkte Duelle</h2>
        <ul className="recent-list">
          {insights.headToHead.length === 0 && <li>Keine direkten Duelle verfuegbar.</li>}
          {insights.headToHead.map((match, index) => (
            <li key={`h2h-${index}`}>
              <span>{formatDate(match.date)} · {match.homeTeam} vs {match.awayTeam}</span>
              <strong>{match.score}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default MatchInfo;
