import { useState, useEffect } from 'react';
import { matchAPI, tipAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { getMatchThemeStyle } from '../utils/teamTheme';
import BallLoader from '../components/BallLoader';
import './Dashboard.css';

function Dashboard() {
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [visibleTipsByMatch, setVisibleTipsByMatch] = useState({});
  const [expandedTipsMatches, setExpandedTipsMatches] = useState({});
  const [nextTipSavedByMatch, setNextTipSavedByMatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeRound, setActiveRound] = useState('Alle');
  const [matchStatusFilter, setMatchStatusFilter] = useState('Alle');
  const [bonusTip, setBonusTip] = useState({ champion_team: '', runner_up_team: '' });
  const [bonusLocked, setBonusLocked] = useState(false);
  const [bonusDeadline, setBonusDeadline] = useState(null);
  const [savingBonus, setSavingBonus] = useState(false);
  const [now, setNow] = useState(new Date());
  const { user } = useAuth();

  useEffect(() => {
    fetchMatches();
  }, [user]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const [matchesResult, bonusResult] = await Promise.allSettled([
        matchAPI.getAll(),
        tipAPI.getBonusTip()
      ]);

      if (matchesResult.status !== 'fulfilled') {
        throw matchesResult.reason;
      }

      setMatches(matchesResult.value.data);

      // Fetch user's tips
      const [tipsResponse, visibleTipsResponse] = await Promise.all([
        tipAPI.getUserTips(user.id),
        tipAPI.getVisibleTips()
      ]);
      const tipsMap = {};
      tipsResponse.data.forEach(tip => {
        tipsMap[tip.match_id] = {
          home_goals: tip.home_goals,
          away_goals: tip.away_goals
        };
      });
      setTips(tipsMap);

      const groupedVisibleTips = {};
      visibleTipsResponse.data.forEach((tip) => {
        if (!groupedVisibleTips[tip.match_id]) {
          groupedVisibleTips[tip.match_id] = [];
        }

        groupedVisibleTips[tip.match_id].push(tip);
      });
      setVisibleTipsByMatch(groupedVisibleTips);

      if (bonusResult.status === 'fulfilled' && bonusResult.value?.data) {
        setBonusLocked(Boolean(bonusResult.value.data.locked));
        setBonusDeadline(bonusResult.value.data.deadline);
        setBonusTip({
          champion_team: bonusResult.value.data.bonusTip?.champion_team || '',
          runner_up_team: bonusResult.value.data.bonusTip?.runner_up_team || ''
        });
      } else {
        setBonusLocked(true);
        setBonusDeadline(null);
        setBonusTip({ champion_team: '', runner_up_team: '' });
      }
    } catch (err) {
      setError('Fehler beim Laden der Spiele');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBonusTipSubmit = async () => {
    if (bonusLocked) {
      setError('Die Deadline für Bonusfragen ist bereits abgelaufen');
      return;
    }

    if (!bonusTip.champion_team || !bonusTip.runner_up_team) {
      setError('Bitte Weltmeister und Vizemeister auswählen');
      return;
    }

    if (bonusTip.champion_team === bonusTip.runner_up_team) {
      setError('Weltmeister und Vizemeister müssen unterschiedlich sein');
      return;
    }

    try {
      setSavingBonus(true);
      setError('');
      await tipAPI.submitBonusTip(bonusTip.champion_team, bonusTip.runner_up_team);
      setSuccess('Bonusfragen gespeichert!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern der Bonusfragen');
    } finally {
      setSavingBonus(false);
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

  const handleSubmitTip = async (matchId, source = 'default') => {
    try {
      const tip = tips[matchId] || {};
      const homeGoals = tip.home_goals ?? 0;
      const awayGoals = tip.away_goals ?? 0;
      await tipAPI.submit(matchId, homeGoals, awayGoals);
      setSuccess('Tipp abgegeben!');

      setNextTipSavedByMatch((prev) => ({ ...prev, [matchId]: true }));
      setTimeout(() => {
        setNextTipSavedByMatch((prev) => ({ ...prev, [matchId]: false }));
      }, source === 'next' ? 1600 : 1400);

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

  const getCountdown = (matchDate) => {
    const deadline = new Date(new Date(matchDate).getTime() - 60 * 60 * 1000);
    const diff = deadline - now;
    if (diff <= 0 || diff > 2 * 60 * 60 * 1000) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const toggleVisibleTips = (matchId) => {
    setExpandedTipsMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const getMatchStatus = (match) => {
    if (match.finished) {
      return { label: 'Abgeschlossen', className: 'status-finished' };
    }

    if (isDeadlinePassed(match.match_date)) {
      return { label: 'Gesperrt', className: 'status-locked' };
    }

    return { label: 'Offen', className: 'status-open' };
  };

  const allTeams = Array.from(
    new Set(matches.flatMap((match) => [match.home_team, match.away_team]).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'de'));



  const rounds = ['Alle', ...Array.from(
    new Set(matches.map(m => m.round).filter(Boolean))
  )];

  const roundFilteredMatches = activeRound === 'Alle'
    ? matches
    : matches.filter((match) => match.round === activeRound);

  const statusFilteredMatches = matchStatusFilter === 'Alle'
    ? roundFilteredMatches
    : roundFilteredMatches.filter((match) =>
      matchStatusFilter === 'Offen' ? !match.finished : Boolean(match.finished)
    );

  const visibleMatches = statusFilteredMatches.slice().sort((firstMatch, secondMatch) => {
    if (matchStatusFilter === 'Alle' && firstMatch.finished !== secondMatch.finished) {
      return firstMatch.finished ? 1 : -1;
    }

    return new Date(firstMatch.match_date) - new Date(secondMatch.match_date);
  });

  const finishedCount = matches.filter((m) => m.finished).length;
  const openCount = matches.length - finishedCount;
  const submittedTipsCount = Object.keys(tips).length;
  const upcomingMatches = matches
    .filter((match) => !match.finished)
    .slice()
    .sort((firstMatch, secondMatch) => new Date(firstMatch.match_date) - new Date(secondMatch.match_date))
    .slice(0, 3);

  const missingTipsCount = matches.filter(
    m => !m.finished && !isDeadlinePassed(m.match_date) && !tips[m.id]
  ).length;

  return (
    <BallLoader loading={loading} title="Dashboard wird geladen" subtitle="Spiele und Tipps werden vorbereitet...">
    <div className="container">
      <div className="page-title">
        <h1>Dashboard</h1>
        <p>Geben Sie Ihre Tipps ab!</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {missingTipsCount > 0 && (
        <div className="missing-tips-banner">
          ⚠️ Du hast noch <strong>{missingTipsCount}</strong> {missingTipsCount === 1 ? 'Spiel' : 'Spiele'} ohne Tipp!
        </div>
      )}

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="label">Spiele gesamt</span>
          <span className="value">{matches.length}</span>
        </div>
        <div className="stat-card">
          <span className="label">Noch offen</span>
          <span className="value">{openCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Abgeschlossen</span>
          <span className="value">{finishedCount}</span>
        </div>
        <div className="stat-card">
          <span className="label">Meine Tipps</span>
          <span className="value">{submittedTipsCount}</span>
        </div>
      </div>

      {upcomingMatches.length > 0 && (
        <div className="next-matches-panel">
          <div className="next-matches-headline">
            <h2>Heute / Als Nächstes</h2>
            <span>{upcomingMatches.length} Spiele</span>
          </div>
          <div className="next-matches-list">
            {upcomingMatches.map((match) => {
              const status = getMatchStatus(match);
              const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
              const deadlinePasssed = isDeadlinePassed(match.match_date);
              const savedInline = Boolean(nextTipSavedByMatch[match.id]);

              return (
                <div key={`next-${match.id}`} className="next-match-card">
                  <div className="next-match-teams">{match.home_team} vs {match.away_team}</div>
                  <div className="next-match-meta">
                    <span>{formatDate(match.match_date)}</span>
                    {match.round && <span>{match.round}</span>}
                    {getCountdown(match.match_date) && (
                      <span className="countdown-badge">⏱ {getCountdown(match.match_date)}</span>
                    )}
                  </div>
                  <span className={`match-status-badge ${status.className}`}>{status.label}</span>
                  {!match.finished && (
                    <div className="next-match-tip-row">
                      <div className="next-tip-inputs">
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
                        <div className="next-tip-locked">Deadline verpasst</div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`btn-primary next-tip-submit${savedInline ? ' tip-submit-saved' : ''}`}
                            onClick={() => handleSubmitTip(match.id, 'next')}
                          >
                            {tips[match.id] ? 'Tipp bearbeiten' : 'Tipp abgeben'}
                          </button>
                          {savedInline && <span className="next-tip-saved">Tipp gespeichert</span>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bonus-card">
        <h2>⭐ Bonusfragen</h2>
        <p>
          Tipp auf Weltmeister und Vizemeister für Extrapunkte.
          {bonusDeadline && (
            <span className="bonus-deadline">
              {' '}Deadline: {formatDate(bonusDeadline)}
            </span>
          )}
        </p>
        <div className="bonus-grid">
          <div>
            <label>Weltmeister</label>
            <select
              value={bonusTip.champion_team}
              disabled={bonusLocked || savingBonus}
              onChange={(e) => setBonusTip((prev) => ({ ...prev, champion_team: e.target.value }))}
            >
              <option value="">-- wählen --</option>
              {allTeams.map((team) => (
                <option key={`champ-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Vizemeister</label>
            <select
              value={bonusTip.runner_up_team}
              disabled={bonusLocked || savingBonus}
              onChange={(e) => setBonusTip((prev) => ({ ...prev, runner_up_team: e.target.value }))}
            >
              <option value="">-- wählen --</option>
              {allTeams.map((team) => (
                <option key={`runner-${team}`} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleBonusTipSubmit}
            disabled={bonusLocked || savingBonus}
          >
            {bonusLocked ? 'Deadline abgelaufen' : (savingBonus ? 'Speichert...' : 'Bonusfragen speichern')}
          </button>
        </div>
      </div>

      <div className="round-filter">
        {['Alle', 'Offen', 'Abgeschlossen'].map((status) => (
          <button
            key={status}
            className={`round-btn${matchStatusFilter === status ? ' active' : ''}`}
            onClick={() => setMatchStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      {rounds.length > 1 && (
        <div className="round-filter">
          {rounds.map(r => (
            <button
              key={r}
              className={`round-btn${activeRound === r ? ' active' : ''}`}
              onClick={() => setActiveRound(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="matches-grid">
        {visibleMatches.map(match => {
          const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
          const deadlinePasssed = isDeadlinePassed(match.match_date);
          const status = getMatchStatus(match);
          const visibleTips = (visibleTipsByMatch[match.id] || []).slice().sort((firstTip, secondTip) => {
            if (firstTip.user_id === user.id && secondTip.user_id !== user.id) {
              return -1;
            }

            if (firstTip.user_id !== user.id && secondTip.user_id === user.id) {
              return 1;
            }

            return firstTip.username.localeCompare(secondTip.username, 'de');
          });
          const isTipsExpanded = Boolean(expandedTipsMatches[match.id]);
          const countdown = getCountdown(match.match_date);
          const savedInline = Boolean(nextTipSavedByMatch[match.id]);

          return (
            <div key={match.id} className="match-card" style={getMatchThemeStyle(match.home_team, match.away_team)}>
              <div className="match-topline">
                <div className="match-date">
                  {formatDate(match.match_date)}{match.round ? ` · ${match.round}` : ''}
                  {countdown && <span className="countdown-badge">⏱ {countdown}</span>}
                </div>
                <span className={`match-status-badge ${status.className}`}>{status.label}</span>
              </div>
              
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
                    <div className="tip-submit-wrap">
                      <button
                        className={`btn-primary${savedInline ? ' tip-submit-saved' : ''}`}
                        onClick={() => handleSubmitTip(match.id)}
                      >
                        {tips[match.id] ? 'Tipp bearbeiten' : 'Tipp abgeben'}
                      </button>
                      {savedInline && <span className="tip-saved-chip">✓ Gespeichert</span>}
                    </div>
                  )}
                </>
              )}

              {match.finished && tip.home_goals !== undefined && (
                <div className="submitted-tip">
                  Mein Tipp: {tip.home_goals}:{tip.away_goals}
                </div>
              )}

              {deadlinePasssed && visibleTips.length > 0 && (
                <div className="visible-tips-panel">
                  <button
                    type="button"
                    className="visible-tips-toggle"
                    onClick={() => toggleVisibleTips(match.id)}
                  >
                    <span className="visible-tips-title">Tipps aller Spieler</span>
                    <span className="visible-tips-meta">
                      {visibleTips.length} {visibleTips.length === 1 ? 'Tipp' : 'Tipps'} {isTipsExpanded ? 'ausblenden' : 'anzeigen'}
                    </span>
                  </button>
                  {isTipsExpanded && (
                    <div className="visible-tips-list">
                      {visibleTips.map((visibleTip) => (
                        <div
                          key={`${match.id}-${visibleTip.user_id}`}
                          className={`visible-tip-row${visibleTip.user_id === user.id ? ' own-tip-row' : ''}`}
                        >
                          <span className="visible-tip-user">
                            {visibleTip.username}
                            {visibleTip.user_id === user.id && <span className="visible-tip-badge">Du</span>}
                          </span>
                          <strong className="visible-tip-score">{visibleTip.home_goals}:{visibleTip.away_goals}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </BallLoader>
  );
}

export default Dashboard;
