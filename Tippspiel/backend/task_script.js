const pool = require("./db");
const { getMatchInsights } = require("./services/footballData");

async function run() {
  try {
    const query = "SELECT id, home_team, away_team, match_date FROM matches WHERE external_source IN ('football-data', 'flashscore-bundesliga') AND match_date >= NOW() AND match_date <= NOW() + INTERVAL '21 days' ORDER BY match_date ASC LIMIT 3";
    const res = await pool.query(query);
    const matches = res.rows;

    if (matches.length === 0) {
      console.log("Keine Matches gefunden.");
    }

    for (const match of matches) {
      const insights = await getMatchInsights(pool, match.id);
      console.log("Match ID:", match.id);
      console.log("Teams:", match.home_team + " vs " + match.away_team);
      if (insights && insights.probabilities) {
        console.log("Probabilities:", JSON.stringify(insights.probabilities));
      } else {
        console.log("Keine Quoten/Probabilities geliefert.");
      }
      console.log("---");
    }
  } catch (err) {
    console.error("Fehler:", err);
  } finally {
    await pool.end();
  }
}
run();
