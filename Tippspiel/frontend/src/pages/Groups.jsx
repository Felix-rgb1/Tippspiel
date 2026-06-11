import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchAPI, tipAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import BallLoader from '../components/BallLoader';
import { formatDateTimeDe, parseDateTimeLocal, toTimestamp } from '../utils/dateTime';
import './Groups.css';

const TEAM_ISO_MAP = {
  algeria: 'DZ', argentina: 'AR', argentinien: 'AR',
  austria: 'AT', oesterreich: 'AT',
  jordan: 'JO',
  australia: 'AU', australien: 'AU',
  paraguay: 'PY',
  turkey: 'TR', tuerkei: 'TR',
  usa: 'US', 'united states': 'US',
  belgium: 'BE', belgien: 'BE',
  egypt: 'EG', aegypten: 'EG',
  iran: 'IR',
  'new zealand': 'NZ', neuseeland: 'NZ',
  'bosnia & herzegovina': 'BA', 'bosnia-herzegovina': 'BA', bosnien: 'BA',
  canada: 'CA', kanada: 'CA',
  qatar: 'QA', katar: 'QA',
  switzerland: 'CH', schweiz: 'CH',
  brazil: 'BR', brasilien: 'BR',
  haiti: 'HT',
  morocco: 'MA', marokko: 'MA',
  scotland: 'GB-SCT', schottland: 'GB-SCT',
  'cape verde': 'CV', 'cape verde islands': 'CV', kapverden: 'CV',
  'saudi arabia': 'SA', 'saudi-arabien': 'SA',
  spain: 'ES', spanien: 'ES',
  uruguay: 'UY',
  colombia: 'CO', kolumbien: 'CO',
  'dr congo': 'CD', 'd.r. congo': 'CD', 'dr. congo': 'CD', 'congo dr': 'CD',
  portugal: 'PT',
  uzbekistan: 'UZ', usbekistan: 'UZ',
  croatia: 'HR', kroatien: 'HR',
  england: 'GB-ENG',
  ghana: 'GH',
  panama: 'PA',
  curacao: 'CW',
  ecuador: 'EC',
  germany: 'DE', deutschland: 'DE',
  'ivory coast': 'CI', elfenbeinkueste: 'CI',
  'czech republic': 'CZ', tschechien: 'CZ',
  mexico: 'MX', mexiko: 'MX',
  'south africa': 'ZA', suedafrika: 'ZA',
  'south korea': 'KR', suedkorea: 'KR',
  france: 'FR', frankreich: 'FR',
  iraq: 'IQ', irak: 'IQ',
  norway: 'NO', norwegen: 'NO',
  senegal: 'SN',
  japan: 'JP',
  netherlands: 'NL', niederlande: 'NL',
  sweden: 'SE', schweden: 'SE',
  tunisia: 'TN', tunesien: 'TN',
};

function getFlag(teamName) {
  const iso = TEAM_ISO_MAP[teamName.toLowerCase()];
  if (!iso) return null;
  return `https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;
}

export default function Groups() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [savedTips, setSavedTips] = useState({});
  const [standings, setStandings] = useState({});
  const [teamToGroup, setTeamToGroup] = useState({});
  const [loading, setLoading] = useState(true);
  const [standingsError, setStandingsError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('A');
  const inputRefs = useRef({});

  useEffect(() => {
    Promise.allSettled([
      matchAPI.getAll(),
      tipAPI.getUserTips(user.id),
      matchAPI.getGroupStandings(),
    ])
      .then(([matchResult, tipResult, standingsResult]) => {
        if (matchResult.status === 'fulfilled') {
          setMatches(matchResult.value.data || []);
        }
        if (tipResult.status === 'fulfilled') {
          const tipsMap = {};
          (tipResult.value.data || []).forEach((t) => {
            tipsMap[t.match_id] = { home_goals: t.home_goals, away_goals: t.away_goals };
          });
          setTips(tipsMap);
          setSavedTips(tipsMap);
        }
        if (standingsResult.status === 'fulfilled' && standingsResult.value.data?.groups) {
          setStandings(standingsResult.value.data.groups);
          setTeamToGroup(standingsResult.value.data.teamToGroup || {});
        } else if (standingsResult.status === 'rejected') {
          setStandingsError('Tabellen konnten nicht geladen werden');
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleTipChange = (matchId, field, value) => {
    setTips((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: parseInt(value) || 0 },
    }));
  };

  const handleTipStep = (matchId, field, delta) => {
    setTips((prev) => {
      const current = prev[matchId] || { home_goals: 0, away_goals: 0 };
      return { ...prev, [matchId]: { ...current, [field]: Math.max(0, Math.min(20, (current[field] ?? 0) + delta)) } };
    });
  };

  const handleSubmitTip = async (matchId) => {
    try {
      const tip = tips[matchId] || {};
      const homeGoals = tip.home_goals ?? 0;
      const awayGoals = tip.away_goals ?? 0;
      await tipAPI.submit(matchId, homeGoals, awayGoals);
      setSavedTips((prev) => ({ ...prev, [matchId]: { home_goals: homeGoals, away_goals: awayGoals } }));
      setSuccess('Tipp gespeichert!');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
      setTimeout(() => setError(''), 3000);
    }
  };

  const isDeadlinePassed = (matchDate) => {
    const parsedDate = parseDateTimeLocal(matchDate);
    if (!parsedDate) return false;
    const deadline = new Date(parsedDate.getTime() - 60 * 60 * 1000);
    return new Date() > deadline;
  };

  const formatDate = (date) => formatDateTimeDe(date, true);

  const getTipSaveState = (matchId) => {
    const current = tips[matchId];
    const persisted = savedTips[matchId];
    if (!current && !persisted) return { hasSavedTip: false, isDirty: true, buttonLabel: 'Tipp speichern' };
    const currentHome = Number(current?.home_goals ?? persisted?.home_goals ?? 0);
    const currentAway = Number(current?.away_goals ?? persisted?.away_goals ?? 0);
    const savedHome = Number(persisted?.home_goals ?? 0);
    const savedAway = Number(persisted?.away_goals ?? 0);
    const isDirty = !persisted || currentHome !== savedHome || currentAway !== savedAway;
    return {
      hasSavedTip: Boolean(persisted),
      isDirty,
      buttonLabel: !persisted ? 'Tipp speichern' : isDirty ? 'Änderungen speichern' : 'Gespeichert ✓',
    };
  };

  if (loading) {
    return (
      <div className="container groups-loading">
        <BallLoader />
      </div>
    );
  }

  const groupLetters = Object.keys(standings).length > 0
    ? Object.keys(standings).sort()
    : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  const activeStandings = standings[activeTab] || [];

  // Filter matches for active group using teamToGroup mapping
  const groupMatches = matches
    .filter((m) => teamToGroup[m.home_team] === activeTab || teamToGroup[m.away_team] === activeTab)
    .sort((a, b) => toTimestamp(a.match_date) - toTimestamp(b.match_date));

  return (
    <div className="container">
      <div className="page-title">
        <h1>🌍 Gruppenphase</h1>
        <p>Tabellen und Spiele der WM 2026 Gruppen</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="groups-tabs">
        {groupLetters.map((letter) => (
          <button
            key={letter}
            className={`groups-tab${activeTab === letter ? ' groups-tab--active' : ''}`}
            onClick={() => setActiveTab(letter)}
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="groups-panel card">
        <h2 className="groups-panel-title">Gruppe {activeTab}</h2>
        {standingsError ? (
          <p className="groups-standings-error">{standingsError}</p>
        ) : (
          <div className="groups-table-wrapper">
            <table className="groups-table">
              <thead>
                <tr>
                  <th className="col-pos">#</th>
                  <th className="col-team">Mannschaft</th>
                  <th title="Spiele">Sp</th>
                  <th title="Siege">S</th>
                  <th title="Unentschieden">U</th>
                  <th title="Niederlagen">N</th>
                  <th title="Tore">Tore</th>
                  <th title="Tordifferenz">TD</th>
                  <th title="Punkte">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {activeStandings.map((row, idx) => {
                  const flagUrl = getFlag(row.name);
                  const isQualified = idx < 3;
                  const gd = row.gd ?? (row.gf - row.ga);
                  return (
                    <tr key={row.name} className={isQualified ? 'row-qualified' : ''}>
                      <td className="col-pos">
                        <span className={`pos-badge pos-${idx + 1}`}>{idx + 1}</span>
                      </td>
                      <td className="col-team">
                        {flagUrl && (
                          <img src={flagUrl} alt={row.name} className="team-flag"
                            onError={(e) => { e.target.style.display = 'none'; }} />
                        )}
                        <span>{row.name}</span>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.won}</td>
                      <td>{row.drawn}</td>
                      <td>{row.lost}</td>
                      <td>{row.gf}:{row.ga}</td>
                      <td className={gd > 0 ? 'td-positive' : gd < 0 ? 'td-negative' : ''}>
                        {gd > 0 ? `+${gd}` : gd}
                      </td>
                      <td><strong>{row.points}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="groups-legend">
          <span className="legend-qualified" /> Qualifiziert (Top 3)
        </p>
      </div>

      {/* Group Matches */}
      <div className="groups-matches-section">
        <h3 className="groups-matches-title">Spiele – Gruppe {activeTab}</h3>
        <div className="groups-matches-list">
          {groupMatches.map((match) => {
            const deadlinePassed = isDeadlinePassed(match.match_date);
            const tip = tips[match.id] || { home_goals: 0, away_goals: 0 };
            const tipSaveState = getTipSaveState(match.id);
            const homeFlagUrl = getFlag(match.home_team);
            const awayFlagUrl = getFlag(match.away_team);

            return (
              <div key={match.id} className={`gm-card card${match.finished ? ' gm-card--finished' : deadlinePassed ? ' gm-card--locked' : ''}`}>
                <div className="gm-meta">
                  <span>{formatDate(match.match_date)}</span>
                  {match.round && <span className="gm-round">{match.round}</span>}
                  <span className={`gm-status ${match.finished ? 'status-finished' : deadlinePassed ? 'status-locked' : 'status-open'}`}>
                    {match.finished ? 'Abgeschlossen' : deadlinePassed ? 'Gesperrt' : 'Offen'}
                  </span>
                </div>

                <div className="gm-teams"
                  role="button" tabIndex={0}
                  onClick={() => navigate(`/match/${match.id}`, { state: { match } })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/match/${match.id}`, { state: { match } }); } }}
                >
                  <div className="gm-team">
                    {homeFlagUrl && <img src={homeFlagUrl} alt={match.home_team} className="team-flag" onError={(e) => { e.target.style.display = 'none'; }} />}
                    <span>{match.home_team}</span>
                  </div>
                  <div className="gm-score">
                    {match.finished ? (
                      <strong>{match.home_goals}:{match.away_goals}</strong>
                    ) : (
                      <span>vs</span>
                    )}
                  </div>
                  <div className="gm-team gm-team--away">
                    {awayFlagUrl && <img src={awayFlagUrl} alt={match.away_team} className="team-flag" onError={(e) => { e.target.style.display = 'none'; }} />}
                    <span>{match.away_team}</span>
                  </div>
                </div>

                {match.finished ? (
                  savedTips[match.id] ? (
                    <div className="gm-tip-result">
                      Dein Tipp: <strong>{savedTips[match.id].home_goals}:{savedTips[match.id].away_goals}</strong>
                    </div>
                  ) : (
                    <div className="gm-tip-result gm-tip-result--none">Kein Tipp abgegeben</div>
                  )
                ) : (
                  <div className="gm-tip-row">
                    <div className="gm-tip-inputs">
                      <div className="tip-stepper">
                        <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', -1)} disabled={deadlinePassed}>−</button>
                        <input type="number" min="0" max="20"
                          value={tip.home_goals}
                          onChange={(e) => handleTipChange(match.id, 'home_goals', e.target.value)}
                          disabled={deadlinePassed}
                          ref={(el) => { if (!inputRefs.current[match.id]) inputRefs.current[match.id] = {}; inputRefs.current[match.id].home = el; }}
                        />
                        <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'home_goals', 1)} disabled={deadlinePassed}>+</button>
                      </div>
                      <span className="gm-colon">:</span>
                      <div className="tip-stepper">
                        <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', -1)} disabled={deadlinePassed}>−</button>
                        <input type="number" min="0" max="20"
                          value={tip.away_goals}
                          onChange={(e) => handleTipChange(match.id, 'away_goals', e.target.value)}
                          disabled={deadlinePassed}
                          ref={(el) => { if (!inputRefs.current[match.id]) inputRefs.current[match.id] = {}; inputRefs.current[match.id].away = el; }}
                        />
                        <button type="button" className="tip-stepper-btn" onClick={() => handleTipStep(match.id, 'away_goals', 1)} disabled={deadlinePassed}>+</button>
                      </div>
                    </div>
                    {deadlinePassed ? (
                      <div className="gm-deadline-note">Deadline abgelaufen</div>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary gm-submit"
                        onClick={() => handleSubmitTip(match.id)}
                        disabled={!tipSaveState.isDirty}
                      >
                        {tipSaveState.buttonLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {groupMatches.length === 0 && (
            <p className="groups-no-matches">Keine Spiele für diese Gruppe gefunden.</p>
          )}
        </div>
      </div>
    </div>
  );
}

