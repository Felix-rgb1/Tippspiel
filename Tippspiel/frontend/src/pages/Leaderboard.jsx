import { useState, useEffect } from 'react';
import { leaderboardAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import BallLoader from '../components/BallLoader';
import './Leaderboard.css';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [matchdayRounds, setMatchdayRounds] = useState([]);
  const [selectedRound, setSelectedRound] = useState('');
  const [matchdayEntries, setMatchdayEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const [response, matchdayResponse] = await Promise.all([
        leaderboardAPI.getAll(),
        leaderboardAPI.getMatchday()
      ]);
      setLeaderboard(response.data);
      setMatchdayRounds(matchdayResponse.data.rounds || []);
      setSelectedRound(matchdayResponse.data.selectedRound || '');
      setMatchdayEntries(matchdayResponse.data.entries || []);
    } catch (err) {
      setError('Fehler beim Laden der Rangliste');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatchday = async (round) => {
    try {
      const response = await leaderboardAPI.getMatchday(round);
      setMatchdayRounds(response.data.rounds || []);
      setSelectedRound(response.data.selectedRound || '');
      setMatchdayEntries(response.data.entries || []);
    } catch (err) {
      setError('Fehler beim Laden der Spieltagwertung');
    }
  };

  const exportLeaderboardToExcel = async () => {
    if (leaderboard.length === 0) {
      return;
    }

    try {
      setExporting(true);
      const XLSX = await import('xlsx');

      const exportData = leaderboard.map((entry, index) => ({
        Platz: index + 1,
        Spieler: entry.username,
        Tipps: entry.tips_submitted || 0,
        Spielpunkte: entry.match_points || 0,
        Bonuspunkte: entry.bonus_points || 0,
        Punkte: entry.total_points || 0,
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rangliste');

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `rangliste_${datePart}.xlsx`);
    } catch (err) {
      setError('Fehler beim Export der Excel-Datei');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };



  const topThree = leaderboard.slice(0, 3);
  const ownRankIndex = leaderboard.findIndex((entry) => String(entry.id) === String(user?.id));
  const ownRankEntry = ownRankIndex >= 0 ? leaderboard[ownRankIndex] : null;

  const matchdayRankMap = {};
  matchdayEntries.forEach((entry, idx) => {
    matchdayRankMap[String(entry.id)] = idx + 1;
  });

  return (
    <BallLoader loading={loading} title="Rangliste wird geladen" subtitle="Punkte und Spieltage werden berechnet...">
    <div className="container">
      <div className="page-title">
        <h1>🏆 Rangliste</h1>
        <p>Aktuelle Punktestand</p>
      </div>

      <div className="tie-breaker-box">
        <h3>Tiebreaker-Regeln</h3>
        <p>Bei Punktgleichstand entscheidet die Reihenfolge: 1) Exakte Tipps, 2) Richtige Tendenzen, 3) Frühere Tippabgabe.</p>
      </div>

      <div className="leaderboard-actions">
        <button
          type="button"
          className="btn-success"
          onClick={exportLeaderboardToExcel}
          disabled={leaderboard.length === 0 || exporting}
        >
          {exporting ? 'Export läuft...' : 'Excel herunterladen'}
        </button>
      </div>

      {topThree.length > 0 && (
        <div className="leaderboard-podium">
          {topThree.map((entry, index) => (
            <div key={`podium-${entry.id}`} className={`podium-card podium-${index + 1}`}>
              <div className="podium-rank">{index + 1 === 1 ? '🥇' : index + 1 === 2 ? '🥈' : '🥉'} Platz {index + 1}</div>
              <div className="podium-name">{entry.username}</div>
              <div className="podium-points">{entry.total_points || 0} Punkte</div>
            </div>
          ))}
        </div>
      )}

      {ownRankEntry && (
        <div className="my-rank-box">
          Dein Rang: <strong>{ownRankIndex + 1}</strong> · {ownRankEntry.total_points || 0} Punkte · {ownRankEntry.bonus_points || 0} Bonus
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="leaderboard-table">
        <div className="table-header">
          <div className="col-rank">Platz</div>
          <div className="col-name">Spieler</div>
          <div className="col-tips">Tipps</div>
          <div className="col-points">Bonus</div>
          <div className="col-points">Punkte</div>
        </div>

        {leaderboard.map((entry, index) => {
          const isOwnRow = String(entry.id) === String(user?.id);
          const overallRank = index + 1;
          const matchdayRank = matchdayRankMap[String(entry.id)];
          let trendEl = null;
          if (matchdayRank !== undefined) {
            if (matchdayRank < overallRank) trendEl = <span className="trend-up" title="Im letzten Spieltag besser">↑</span>;
            else if (matchdayRank > overallRank) trendEl = <span className="trend-down" title="Im letzten Spieltag schlechter">↓</span>;
            else trendEl = <span className="trend-stable" title="Unveränderter Trend">—</span>;
          }

          return (
          <div key={entry.id} className={`table-row${isOwnRow ? ' own-row' : ''}`}>
            <div className="col-rank">
              {index === 0 && '🥇'}
              {index === 1 && '🥈'}
              {index === 2 && '🥉'}
              {index > 2 && `${index + 1}.`}
              {trendEl}
            </div>
            <div className="col-name">
              {entry.username}
              {isOwnRow && <span className="own-pill">Du</span>}
            </div>
            <div className="col-tips">{entry.tips_submitted || 0}</div>
            <div className="col-points">{entry.bonus_points || 0}</div>
            <div className="col-points">
              <strong>{entry.total_points || 0}</strong>
            </div>
          </div>
          );
        })}

        {leaderboard.length === 0 && (
          <div className="table-empty">Noch keine Spieler</div>
        )}
      </div>

      <div className="matchday-board">
        <div className="matchday-header">
          <h2>Spieltagwertung</h2>
          {matchdayRounds.length > 0 && (
            <select value={selectedRound} onChange={(e) => fetchMatchday(e.target.value)}>
              {matchdayRounds.map((round) => (
                <option key={round} value={round}>{round}</option>
              ))}
            </select>
          )}
        </div>

        {matchdayEntries.length > 0 ? (
          <div className="leaderboard-table">
            <div className="table-header matchday-grid">
              <div className="col-rank">Platz</div>
              <div className="col-name">Spieler</div>
              <div className="col-points">Tipps</div>
              <div className="col-points">Punkte</div>
            </div>
            {matchdayEntries.map((entry, index) => (
              <div key={`matchday-${entry.id}`} className="table-row matchday-grid">
                <div className="col-rank">{index + 1}.</div>
                <div className="col-name">{entry.username}</div>
                <div className="col-points">{entry.tips_count || 0}</div>
                <div className="col-points"><strong>{entry.round_points || 0}</strong></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-empty">Noch keine abgeschlossenen Spieltage</div>
        )}
      </div>
    </div>
    </BallLoader>
  );
}

export default Leaderboard;
