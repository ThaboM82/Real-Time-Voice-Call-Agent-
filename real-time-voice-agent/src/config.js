// src/config.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
  stt: {
    apiKey: process.env.DEEPGRAM_API_KEY,
  },
  tts: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voices: {
      roger: process.env.VOICE_ROGER || "default-roger-id",
      brian: process.env.VOICE_BRIAN || "default-brian-id",
      daniel: process.env.VOICE_DANIEL || "default-daniel-id",
    },
  },
  storage: {
    transcriptPath: process.env.TRANSCRIPT_PATH || "data/transcripts",
  },
};
