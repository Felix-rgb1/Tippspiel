import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { matchAPI } from '../api';
import { formatDateTimeDe } from '../utils/dateTime';
import './MatchInfo.css';

function formatDate(dateValue) {
  if (!dateValue) {
    return '-';
  }

  return formatDateTimeDe(dateValue, true);
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

function normalizeLiveStatus(statusText) {
  return String(statusText || '').trim().toUpperCase();
}

function getLiveStageLabel(rawStatus, minute) {
  const map = {
    HT: 'Halbzeit',
    'HALF TIME': 'Halbzeit',
    HALFTIME: 'Halbzeit',
    PAUSE: 'Halbzeit',
    BREAK: 'Halbzeit',
    INT: 'Unterbrechung',
    '1H': '1. Halbzeit',
    '2H': '2. Halbzeit',
    ET: 'Verlaengerung',
    AET: 'Verlaengerung',
    PEN: 'Elfmeterschiessen'
  };

  if (map[rawStatus]) {
    return map[rawStatus];
  }

  if (Number.isFinite(Number(minute)) && Number(minute) > 0) {
    return `LIVE ${Number(minute)}'`;
  }

  return 'LIVE';
}

function getTickerStatusText(rawStatus) {
  const map = {
    HT: 'Halbzeit.',
    'HALF TIME': 'Halbzeit.',
    HALFTIME: 'Halbzeit.',
    PAUSE: 'Halbzeit.',
    BREAK: 'Halbzeit.',
    INT: 'Spiel unterbrochen.',
    '1H': '1. Halbzeit laeuft.',
    '2H': '2. Halbzeit laeuft.',
    ET: 'Verlaengerung laeuft.',
    AET: 'Nach Verlaengerung.',
    PEN: 'Elfmeterschiessen laeuft.'
  };

  return map[rawStatus] || null;
}

function extractKeyStats(statsData) {
  if (!statsData || typeof statsData !== 'object') return null;

  // Extract "match" (full-game) stats
  const matchStats = Array.isArray(statsData.match) ? statsData.match : [];
  const stats = {};

  for (const item of matchStats) {
    const name = String(item.name || '').toLowerCase();
    const homeVal = item.home_team;
    const awayVal = item.away_team;

    if (name.includes('possession')) {
      stats.possession = { home: homeVal, away: awayVal };
    } else if (name === 'total shots') {
      stats.shots = { home: homeVal, away: awayVal };
    } else if (name === 'shots on target') {
      stats.shotsOnTarget = { home: homeVal, away: awayVal };
    } else if (name.includes('corner')) {
      stats.corners = { home: homeVal, away: awayVal };
    } else if (name === 'fouls') {
      stats.fouls = { home: homeVal, away: awayVal };
    }
  }

  return Object.keys(stats).length > 0 ? stats : null;
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
  const [liveConnectionMode, setLiveConnectionMode] = useState('idle');
  const [lastLiveEventAt, setLastLiveEventAt] = useState(null);
  const [liveStats, setLiveStats] = useState(null);
  const [liveStatsLoading, setLiveStatsLoading] = useState(false);
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
    let eventSource = null;

    const applyPayload = (payload) => {
      const updates = payload?.updates || {};
      const nextLiveUpdate = updates[id] || updates[String(id)] || null;

      if (!nextLiveUpdate || stopped) {
        return;
      }

      setLastLiveEventAt(new Date());
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
        const previousStatus = normalizeLiveStatus(previous?.statusText);
        const nextStatus = normalizeLiveStatus(nextLiveUpdate?.statusText);
        const statusEventText = getTickerStatusText(nextStatus);

        if (statusEventText && nextStatus && previousStatus && nextStatus !== previousStatus) {
          nextEvents.unshift(buildTickerEvent('status', statusEventText));
        }

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
    };

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
        setLiveConnectionMode('polling');
        applyPayload(payload);

        const nextPollInMs = Number(payload?.nextPollInMs) || 180000;
        const delay = Math.max(30000, Math.min(300000, nextPollInMs));
        scheduleNextPoll(delay);
      } catch {
        scheduleNextPoll(180000);
      }
    };

    const startPollingFallback = (initialDelayMs = 0) => {
      if (stopped) {
        return;
      }
      if (initialDelayMs > 0) {
        scheduleNextPoll(initialDelayMs);
      } else {
        runPoll();
      }
    };

    const supportsSSE = typeof window !== 'undefined' && typeof window.EventSource !== 'undefined';
    const streamUrl = matchAPI.getLiveStreamUrl([Number(id)]);

    if (supportsSSE && streamUrl) {
      setLiveConnectionMode('connecting');
      eventSource = new window.EventSource(streamUrl);

      eventSource.onopen = () => {
        setLiveConnectionMode('sse');
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          setLiveConnectionMode('sse');
          applyPayload(payload);
        } catch {
          // Ignore malformed stream event and keep connection alive.
        }
      };

      eventSource.onerror = () => {
        setLiveConnectionMode('polling');
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        startPollingFallback(5000);
      };
    } else {
      setLiveConnectionMode('polling');
      startPollingFallback();
    }

    return () => {
      stopped = true;
      if (eventSource) {
        eventSource.close();
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, insights]);

  // Load live stats when match is live or just finished (load on demand, not on every update)
  useEffect(() => {
    // Only load stats if match is live or was just finished; don't load for matches that finished long ago
    const isLiveOrJustFinished = liveUpdate?.isLive || liveUpdate?.isFinished;
    if (!isLiveOrJustFinished) {
      return undefined;
    }

    let stopped = false;
    let timer = null;

    const fetchStats = async () => {
      if (stopped) return;
      try {
        setLiveStatsLoading(true);
        const response = await matchAPI.getLiveStats(id);
        if (!stopped) {
          setLiveStats(response.data?.stats || null);
        }
      } catch (err) {
        console.warn('Failed to fetch live stats:', err.message);
        // Don't show error, just silently fail for stats
      } finally {
        if (!stopped) {
          setLiveStatsLoading(false);
        }
      }
    };

    const scheduleNextFetch = () => {
      if (stopped) return;
      // Update less frequently once match is finished (every 90s)
      const interval = liveUpdate?.isLive ? 60000 : 90000;
      timer = setTimeout(fetchStats, interval);
    };

    // Initial fetch
    fetchStats();
    scheduleNextFetch();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, liveUpdate?.isLive, liveUpdate?.isFinished]);

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
  const rawLiveStatus = normalizeLiveStatus(liveUpdate?.statusText);
  const isHalfTime = ['HT', 'HALF TIME', 'HALFTIME', 'PAUSE', 'BREAK'].includes(rawLiveStatus);
  const liveMinuteText = LIVE_SPECIAL_STAGES.includes(rawLiveStatus)
    ? rawLiveStatus
    : (Number.isFinite(Number(liveUpdate?.minute)) && Number(liveUpdate.minute) > 0 ? `${Number(liveUpdate.minute)}'` : '');
  const liveBadgeText = liveUpdate?.isLive
    ? getLiveStageLabel(rawLiveStatus, liveUpdate?.minute)
    : (liveUpdate?.isFinished ? 'Abgeschlossen' : 'Aktualisierung laeuft');
  const liveConnectionText = (() => {
    if (liveConnectionMode === 'sse') return 'Live verbunden (SSE)';
    if (liveConnectionMode === 'polling') return 'Live verbunden (Fallback)';
    if (liveConnectionMode === 'connecting') return 'Live verbindet...';
    return 'Live inaktiv';
  })();
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
              {liveBadgeText}
            </div>
          </div>

          <div className={`live-connection-indicator is-${liveConnectionMode}`}>
            <span className="dot" aria-hidden="true" />
            <span>{liveConnectionText}</span>
            {lastLiveEventAt && (
              <span className="ts">letztes Update {lastLiveEventAt.toLocaleTimeString('de-DE')}</span>
            )}
          </div>

          <div className="live-scoreline">
            <span className="live-scoreline-team">
              <strong>{formatTeamName(insights.match.home_team)}</strong>
              {Number(liveUpdate?.homeRedCards) > 0 && (
                <span className="live-scoreline-redcards" title={`${liveUpdate.homeRedCards} Rote Karte${liveUpdate.homeRedCards > 1 ? 'n' : ''}`}>
                  {'🟥'.repeat(Number(liveUpdate.homeRedCards))}
                </span>
              )}
            </span>
            <span>{liveScore}</span>
            <span className="live-scoreline-team live-scoreline-team-away">
              {Number(liveUpdate?.awayRedCards) > 0 && (
                <span className="live-scoreline-redcards" title={`${liveUpdate.awayRedCards} Rote Karte${liveUpdate.awayRedCards > 1 ? 'n' : ''}`}>
                  {'🟥'.repeat(Number(liveUpdate.awayRedCards))}
                </span>
              )}
              <strong>{formatTeamName(insights.match.away_team)}</strong>
            </span>
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

      {liveStats && (function() {
        const keyStats = extractKeyStats(liveStats);
        return keyStats ? (
          <section className="card live-stats-card">
            <div className="section-heading compact">
              <div>
                <span className="section-eyebrow">Live</span>
                <h2>Spielstatistiken</h2>
              </div>
              {liveStatsLoading && <span className="muted">wird aktualisiert...</span>}
            </div>

            <div className="live-stats-grid">
              {keyStats.possession && (
                <div className="stat-panel">
                  <div className="stat-label">Ballbesitz</div>
                  <div className="stat-bar-container">
                    <div className="stat-bar">
                      <div className="stat-fill home" style={{ width: String(keyStats.possession.home).replace('%', '') + '%' }} />
                      <div className="stat-fill away" style={{ width: String(keyStats.possession.away).replace('%', '') + '%' }} />
                    </div>
                    <div className="stat-values">
                      <span className="home-val">{keyStats.possession.home}</span>
                      <span className="away-val">{keyStats.possession.away}</span>
                    </div>
                  </div>
                </div>
              )}

              {keyStats.shots && (
                <div className="stat-panel">
                  <div className="stat-label">Schüsse</div>
                  <div className="stat-values-simple">
                    <span className="home-val">{keyStats.shots.home}</span>
                    <span className="divider">:</span>
                    <span className="away-val">{keyStats.shots.away}</span>
                  </div>
                </div>
              )}

              {keyStats.shotsOnTarget && (
                <div className="stat-panel">
                  <div className="stat-label">Schüsse aufs Tor</div>
                  <div className="stat-values-simple">
                    <span className="home-val">{keyStats.shotsOnTarget.home}</span>
                    <span className="divider">:</span>
                    <span className="away-val">{keyStats.shotsOnTarget.away}</span>
                  </div>
                </div>
              )}

              {keyStats.corners && (
                <div className="stat-panel">
                  <div className="stat-label">Ecken</div>
                  <div className="stat-values-simple">
                    <span className="home-val">{keyStats.corners.home}</span>
                    <span className="divider">:</span>
                    <span className="away-val">{keyStats.corners.away}</span>
                  </div>
                </div>
              )}

              {keyStats.fouls && (
                <div className="stat-panel">
                  <div className="stat-label">Fouls</div>
                  <div className="stat-values-simple">
                    <span className="home-val">{keyStats.fouls.home}</span>
                    <span className="divider">:</span>
                    <span className="away-val">{keyStats.fouls.away}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null;
      })()}

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
