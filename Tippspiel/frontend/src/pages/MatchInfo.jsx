import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
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

function normalizeTeamName(teamName) {
  return String(teamName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatTeamName(teamName) {
  const normalized = normalizeTeamName(teamName);
  if (
    normalized === 'd r congo' ||
    normalized === 'dr congo' ||
    normalized === 'congo dr' ||
    normalized === 'congo rd' ||
    normalized === 'democratic republic of congo' ||
    normalized === 'democratic republic of the congo'
  ) {
    return 'DR Kongo';
  }

  return teamName;
}

function getTickerClock() {
  return new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildTickerEvent(type, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text,
    clock: getTickerClock()
  };
}

function MatchInfo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [tickerEvents, setTickerEvents] = useState([]);
  const previousLiveRef = useRef(null);
  // Pre-fill basic match data passed via navigation state for instant display
  const matchPreview = locationState?.match || null;

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

  useEffect(() => {
    if (!insights?.match || insights?.match?.finished) {
      return undefined;
    }

    let stopped = false;
    let timer = null;

    const scheduleNextPoll = (delayMs) => {
      if (stopped) {
        return;
      }
      timer = setTimeout(runPoll, delayMs);
    };

    const runPoll = async () => {
      try {
        const response = await matchAPI.getLive([Number(id)]);
        const payload = response?.data || {};
        const updates = payload?.updates || {};
        const nextLiveUpdate = updates[id] || updates[String(id)] || null;

        if (nextLiveUpdate && !stopped) {
          setLiveUpdate(nextLiveUpdate);

          // Debug logging
          console.log('[DEBUG] Live update received:', {
            incidents: nextLiveUpdate.incidents,
            incidentCount: Array.isArray(nextLiveUpdate.incidents) ? nextLiveUpdate.incidents.length : 0,
            goals: Array.isArray(nextLiveUpdate.incidents) ? nextLiveUpdate.incidents.filter(inc => inc.type === 'goal') : []
          });

          const previous = previousLiveRef.current;
          const nextHome = Number(nextLiveUpdate.homeGoals);
          const nextAway = Number(nextLiveUpdate.awayGoals);
          const previousHome = Number(previous?.homeGoals);
          const previousAway = Number(previous?.awayGoals);

          setTickerEvents((prevEvents) => {
            const nextEvents = [...prevEvents];

            if (nextLiveUpdate.isLive && !previous?.isLive) {
              nextEvents.unshift(buildTickerEvent('start', 'Anpfiff - das Spiel laeuft jetzt live.'));
            }

            if (
              Number.isFinite(nextHome)
              && Number.isFinite(nextAway)
              && Number.isFinite(previousHome)
              && Number.isFinite(previousAway)
              && (nextHome !== previousHome || nextAway !== previousAway)
            ) {
              nextEvents.unshift(buildTickerEvent('goal', `Neuer Spielstand: ${nextHome}:${nextAway}`));
            }

            if (nextLiveUpdate.isFinished && !previous?.isFinished) {
              const finalText = Number.isFinite(nextHome) && Number.isFinite(nextAway)
                ? `Abpfiff - Endstand ${nextHome}:${nextAway}`
                : 'Abpfiff - Spiel beendet.';
              nextEvents.unshift(buildTickerEvent('end', finalText));
            }

            return nextEvents.slice(0, 14);
          });

          previousLiveRef.current = nextLiveUpdate;
        }

        const nextPollInMs = Number(payload?.nextPollInMs) || 180000;
        const delay = Math.max(30000, Math.min(300000, nextPollInMs));
        scheduleNextPoll(delay);
      } catch {
        scheduleNextPoll(180000);
      }
    };

    runPoll();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, insights]);

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

  const showLiveTicker = Boolean(liveUpdate?.isLive || liveUpdate?.isFinished || tickerEvents.length > 0);
  const LIVE_SPECIAL_STAGES = ['HT', 'ET', 'PEN', 'BREAK', 'INT', 'AET'];
  const rawLiveStatus = String(liveUpdate?.statusText || '').trim().toUpperCase();
  const liveMinuteText = LIVE_SPECIAL_STAGES.includes(rawLiveStatus)
    ? rawLiveStatus
    : (Number.isFinite(Number(liveUpdate?.minute)) && Number(liveUpdate.minute) > 0 ? `${Number(liveUpdate.minute)}'` : '');
  const liveScore = Number.isFinite(Number(liveUpdate?.homeGoals)) && Number.isFinite(Number(liveUpdate?.awayGoals))
    ? `${Number(liveUpdate.homeGoals)}:${Number(liveUpdate.awayGoals)}`
    : '-:-';

  if (loading) {
    return (
      <div className="container match-info-page">
        {matchPreview && (
          <section className="match-hero card">
            <div className="match-hero-copy">
              <div className="match-hero-kicker">Match Intelligence</div>
              <h1>{formatTeamName(matchPreview.home_team)} vs {formatTeamName(matchPreview.away_team)}</h1>
              <p className="match-hero-subtitle">
                {formatDate(matchPreview.match_date)}
                {matchPreview.round ? ` · ${matchPreview.round}` : ''}
              </p>
            </div>
          </section>
        )}
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
          <h1>{formatTeamName(insights.match.home_team)} vs {formatTeamName(insights.match.away_team)}</h1>
          <p className="match-hero-subtitle">
            {formatDate(insights.match.match_date)}
            {insights.match.round ? ` · ${insights.match.round}` : ''}
          </p>
        </div>


      </section>

      <div className="match-info-actions">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Zurueck</button>
        <Link to="/" className="btn-primary">Dashboard</Link>
      </div>

      {showLiveTicker && (
        <section className="card live-ticker-card">
          <div className="section-heading compact">
            <div>
              <span className="section-eyebrow">Live</span>
              <h2>Liveticker</h2>
            </div>
            <div className={`live-badge ${liveUpdate?.isLive ? 'is-live' : (liveUpdate?.isFinished ? 'is-finished' : '')}`}>
              {liveUpdate?.isLive ? `LIVE ${liveMinuteText}`.trim() : (liveUpdate?.isFinished ? 'Abgeschlossen' : 'Aktualisierung laeuft')}
            </div>
          </div>

          <div className="live-scoreline">
            <strong>{formatTeamName(insights.match.home_team)}</strong>
            <span>{liveScore}</span>
            <strong>{formatTeamName(insights.match.away_team)}</strong>
          </div>

          {Array.isArray(liveUpdate?.incidents) && liveUpdate.incidents.length > 0 && (
            <div className="live-incidents">
              <div className="live-incidents-col live-incidents-home">
                {liveUpdate.incidents
                  .filter((inc) => inc.isHome === true)
                  .map((inc, i) => (
                    <div key={i} className={`live-incident live-incident-${inc.type}`}>
                      <span className="live-incident-icon">
                        {inc.type === 'goal' && '⚽'}
                        {inc.type === 'own_goal' && '⚽'}
                        {inc.type === 'yellow' && '🟨'}
                        {inc.type === 'yellow_red' && '🟨🟥'}
                        {inc.type === 'red' && '🟥'}
                        {inc.type === 'penalty_missed' && '❌'}
                      </span>
                      <span className="live-incident-player">{inc.player || '–'}</span>
                      {inc.minute != null && <span className="live-incident-minute">{inc.minute}'</span>}
                      {inc.type === 'own_goal' && <span className="live-incident-tag">ET</span>}
                    </div>
                  ))}
              </div>
              <div className="live-incidents-col live-incidents-away">
                {liveUpdate.incidents
                  .filter((inc) => inc.isHome === false)
                  .map((inc, i) => (
                    <div key={i} className={`live-incident live-incident-${inc.type}`}>
                      {inc.type === 'own_goal' && <span className="live-incident-tag">ET</span>}
                      {inc.minute != null && <span className="live-incident-minute">{inc.minute}'</span>}
                      <span className="live-incident-player">{inc.player || '–'}</span>
                      <span className="live-incident-icon">
                        {inc.type === 'goal' && '⚽'}
                        {inc.type === 'own_goal' && '⚽'}
                        {inc.type === 'yellow' && '🟨'}
                        {inc.type === 'yellow_red' && '🟨🟥'}
                        {inc.type === 'red' && '🟥'}
                        {inc.type === 'penalty_missed' && '❌'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <ul className="ticker-list">
            {tickerEvents.length === 0 && (
              <li className="ticker-item ticker-item-muted">
                <span className="ticker-clock">jetzt</span>
                <span>Warte auf Live-Ereignisse von Flashscore...</span>
              </li>
            )}
            {tickerEvents.map((event) => (
              <li key={event.id} className={`ticker-item ticker-item-${event.type}`}>
                <span className="ticker-clock">{event.clock}</span>
                <span>{event.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
