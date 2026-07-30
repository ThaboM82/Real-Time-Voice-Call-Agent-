// backend/tts/listVoices.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { ElevenLabsClient } = require("elevenlabs");
const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

(async () => {
  try {
    const voices = await eleven.voices.list(); // ✅ correct method
    console.log("🎤 Available voices:");
    voices.forEach(v => {
      console.log(`- ${v.name} (ID: ${v.voice_id})`);
    });
  } catch (err) {
    console.error("❌ Error fetching voices:", err.message);
  }
})();
