const pool = require('./db');
const { fetchFlashscoreMatchDetails } = require('./services/rapidApi');

function parseIntSafe(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const q = await pool.query(`
    SELECT id, home_team, away_team, match_date, home_goals, away_goals,
           external_source, external_id, flashscore_match_id, finished
    FROM matches
    WHERE external_source LIKE 'flashscore%'
      AND finished = true
    ORDER BY match_date DESC
    LIMIT 120
  `);

  const mismatches = [];
  let checked = 0;

  for (const row of q.rows) {
    const matchId = String(row.flashscore_match_id || '').trim();
    if (!matchId) continue;

    try {
      const details = await fetchFlashscoreMatchDetails(matchId);
      const home = parseIntSafe(details?.scores?.home);
      const away = parseIntSafe(details?.scores?.away);
      const extraHome = parseIntSafe(details?.scores?.home_extra_time) ?? 0;
      const extraAway = parseIntSafe(details?.scores?.away_extra_time) ?? 0;
      const afterExtraHome = home !== null ? home + extraHome : null;
      const afterExtraAway = away !== null ? away + extraAway : null;
      const isAfterET = Boolean(details?.match_status?.is_finished_after_extra_time);
      const isAfterPens = Boolean(details?.match_status?.is_finished_after_penalties);

      checked += 1;

      if ((afterExtraHome !== null || afterExtraAway !== null) && (extraHome > 0 || extraAway > 0 || isAfterET)) {
        const dbHome = parseIntSafe(row.home_goals);
        const dbAway = parseIntSafe(row.away_goals);

        if (dbHome !== afterExtraHome || dbAway !== afterExtraAway) {
          mismatches.push({
            id: row.id,
            home_team: row.home_team,
            away_team: row.away_team,
            db_home: dbHome,
            db_away: dbAway,
            details_home: home,
            details_away: away,
            extra_home: extraHome,
            extra_away: extraAway,
            expected_after_extra_home: afterExtraHome,
            expected_after_extra_away: afterExtraAway,
            is_after_et: isAfterET,
            is_after_pens: isAfterPens,
            flashscore_match_id: matchId
          });
        }
      }
    } catch (e) {
      // ignore single match errors
    }
  }

  console.log('CHECKED', checked);
  console.log('MISMATCHES', mismatches.length);
  console.log(JSON.stringify(mismatches.slice(0, 30), null, 2));
}

main()
  .catch((e) => {
    console.error('ERR', e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
