// backend/elevenlabs.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const fetch = require("node-fetch");

// Load voice IDs from .env
const VOICES = {
  gladys: process.env.ELEVENLABS_VOICE_ID_GLADYS,
  bella: process.env.ELEVENLABS_VOICE_ID_BELLA,
  jasmin: process.env.ELEVENLABS_VOICE_ID_JASMIN,
};

// Debug check
console.log("▶ ElevenLabs voices loaded:", VOICES);

async function speak(text, voiceKey) {
  const voiceId = VOICES[voiceKey];
  if (!voiceId) {
    throw new Error(`Voice key "${voiceKey}" not found in .env`);
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1", // default model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status} - ${response.statusText}`);
    }

    const buffer = await response.buffer();
    return buffer;
  } catch (err) {
    console.error("❌ Error in elevenlabs.speak:", err.message);
    throw err;
  }
}

module.exports = { speak, VOICES };
