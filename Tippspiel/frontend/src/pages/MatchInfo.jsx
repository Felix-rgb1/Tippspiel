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

function outcomeClass(outcome) {
  if (outcome === 'S') return 'is-win';
  if (outcome === 'U') return 'is-draw';
  return 'is-loss';
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
    if (insights.source === 'football-data') return 'football-data API';
    if (insights.source === 'rapidapi') return 'RapidAPI / API-FOOTBALL';
    return 'lokale Daten';
  }, [insights]);

  const probabilityItems = useMemo(() => ([
    {
      key: 'home',
      label: insights?.match?.home_team,
      value: insights?.probabilities?.homeWin,
      tone: 'home'
    },
    {
      key: 'draw',
      label: 'Unentschieden',
      value: insights?.probabilities?.draw,
      tone: 'draw'
    },
    {
      key: 'away',
      label: insights?.match?.away_team,
      value: insights?.probabilities?.awayWin,
      tone: 'away'
    }
  ]), [insights]);

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
      <section className="match-hero card">
        <div className="match-hero-copy">
          <div className="match-hero-kicker">Match Intelligence</div>
          <h1>{insights.match.home_team} vs {insights.match.away_team}</h1>
          <p className="match-hero-subtitle">
            {formatDate(insights.match.match_date)}
            {insights.match.round ? ` · ${insights.match.round}` : ''}
          </p>
        </div>

        <div className="match-hero-meta">
          <div className="match-meta-pill">
            <span>Datenbasis</span>
            <strong>{sourceLabel}</strong>
          </div>
          <div className="match-meta-pill match-meta-pill-accent">
            <span>Insight-Status</span>
            <strong>{insights.headToHead.length > 0 ? 'Voll befuellt' : 'Live berechnet'}</strong>
          </div>
        </div>
      </section>

      <div className="match-info-actions">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Zurueck</button>
        <Link to="/" className="btn-primary">Dashboard</Link>
      </div>

      <div className="card probabilities-card">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Prognose</span>
            <h2>Geschaetzte Siegchancen</h2>
          </div>
          <p className="muted">Basis: {sourceLabel}. {insights.probabilities.note}</p>
        </div>

        <div className="probabilities-grid">
          {probabilityItems.map((item) => (
            <div key={item.key} className={`probability-panel probability-panel-${item.tone}`}>
              <div className="probability-panel-topline">
                <span>{item.label}</span>
                <strong>{item.value}%</strong>
              </div>
              <div className="probability-track" aria-hidden="true">
                <div className="probability-fill" style={{ width: `${item.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="match-insights-grid">
        <section className="card insight-panel">
          <div className="section-heading compact">
            <div>
              <span className="section-eyebrow">Form</span>
              <h2>Letzte Spiele: {insights.homeTeam.name}</h2>
            </div>
          </div>
          <ul className="recent-list">
            {insights.homeTeam.recentMatches.length === 0 && <li className="empty-state">Keine Spiele verfuegbar.</li>}
            {insights.homeTeam.recentMatches.map((match, index) => (
              <li key={`home-${index}`} className="recent-card">
                <div>
                  <span>{formatDate(match.date)} · gegen {match.opponent}</span>
                </div>
                <div className="recent-scoreline">
                  <strong>{match.ownGoals}:{match.opponentGoals}</strong>
                  <em className={`outcome-badge ${outcomeClass(match.outcome)}`}>{outcomeLabel(match.outcome)}</em>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card insight-panel">
          <div className="section-heading compact">
            <div>
              <span className="section-eyebrow">Form</span>
              <h2>Letzte Spiele: {insights.awayTeam.name}</h2>
            </div>
          </div>
          <ul className="recent-list">
            {insights.awayTeam.recentMatches.length === 0 && <li className="empty-state">Keine Spiele verfuegbar.</li>}
            {insights.awayTeam.recentMatches.map((match, index) => (
              <li key={`away-${index}`} className="recent-card">
                <div>
                  <span>{formatDate(match.date)} · gegen {match.opponent}</span>
                </div>
                <div className="recent-scoreline">
                  <strong>{match.ownGoals}:{match.opponentGoals}</strong>
                  <em className={`outcome-badge ${outcomeClass(match.outcome)}`}>{outcomeLabel(match.outcome)}</em>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card headtohead-panel">
        <div className="section-heading compact">
          <div>
            <span className="section-eyebrow">H2H</span>
            <h2>Direkte Duelle</h2>
          </div>
        </div>
        <ul className="recent-list">
          {insights.headToHead.length === 0 && <li className="empty-state">Keine direkten Duelle verfuegbar.</li>}
          {insights.headToHead.map((match, index) => (
            <li key={`h2h-${index}`} className="recent-card recent-card-h2h">
              <div>
                <span>{formatDate(match.date)}</span>
                <strong className="h2h-pairing">{match.homeTeam} vs {match.awayTeam}</strong>
              </div>
              <div className="recent-scoreline">
                <strong>{match.score}</strong>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default MatchInfo;
