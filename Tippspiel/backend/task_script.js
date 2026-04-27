const pool = require("./db");
const { getMatchInsights } = require("./services/footballData");

async function run() {
  try {
    const res = await pool.query("SELECT id FROM matches WHERE external_source='flashscore-bundesliga' LIMIT 1");
    if (res.rows.length === 0) {
      console.log("Kein Match mit flashscore-bundesliga gefunden.");
      process.exit(0);
    }
    const matchId = res.rows[0].id;
    const insights = await getMatchInsights(pool, matchId);
    
    console.log("SUCCESS");
    console.log("source:", insights.source);
    console.log("homeTeam.recentMatches:", insights.homeTeam?.recentMatches?.length || 0);
    console.log("awayTeam.recentMatches:", insights.awayTeam?.recentMatches?.length || 0);
    console.log("headToHead:", insights.headToHead?.length || 0);
    console.log("note:", insights.probabilities?.note || "null");
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    await pool.end();
  }
}

run();
