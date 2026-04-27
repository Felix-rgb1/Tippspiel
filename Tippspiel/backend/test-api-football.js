require("dotenv").config({ path: "./.env" });
const fetch = require("node-fetch");

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY;
const APIFOOTBALL_BASE_URL = process.env.APIFOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

console.log("APIFOOTBALL_KEY:", APIFOOTBALL_KEY ? "***" + APIFOOTBALL_KEY.slice(-4) : "NOT SET");
console.log("APIFOOTBALL_BASE_URL:", APIFOOTBALL_BASE_URL);

async function test() {
  const url = new URL(`${APIFOOTBALL_BASE_URL}/teams`);
  url.searchParams.set("search", "Germany");

  console.log("\nRequest URL:", url.toString());
  console.log("Headers: x-apisports-key:", APIFOOTBALL_KEY ? "***" : "MISSING");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-apisports-key": APIFOOTBALL_KEY
      }
    });

    console.log("\nResponse Status:", response.status);
    const text = await response.text();
    console.log("Response (Raw):", text.slice(0, 500));
    
    try {
        const data = JSON.parse(text);
        console.log("Response (JSON):", JSON.stringify(data, null, 2).slice(0, 500));
    } catch (e) {
        console.log("Response is not JSON");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
