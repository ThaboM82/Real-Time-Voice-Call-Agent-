// backend/list-voices.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const fetch = require("node-fetch");

(async () => {
  try {
    // Debug check: confirm API key is loaded
    console.log("ELEVENLABS_API_KEY loaded:", !!process.env.ELEVENLABS_API_KEY);
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is missing. Check your .env file.");
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log("🎤 Available voices:");
    data.voices.forEach(v => {
      console.log(`- ${v.name} (ID: ${v.voice_id})`);
    });
  } catch (err) {
    console.error("❌ Error fetching voices:", err.message);
  }
})();
