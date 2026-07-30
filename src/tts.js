// src/tts.js
import fetch from "node-fetch";
import { config } from "./config.js";
import createLogger from "./logger.js";

const logger = createLogger("TTS");

/**
 * Synthesize speech using ElevenLabs TTS.
 * @param {string} text - The text to convert into speech.
 * @param {string} voiceId - The ElevenLabs voice ID (default: Roger).
 * @returns {Promise<Buffer>} - Audio data buffer.
 */
export async function synthesizeSpeech(text, voiceId = config.tts.voices.roger) {
  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": config.tts.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!resp.ok) {
      throw new Error(`TTS request failed: ${resp.status} ${resp.statusText}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    logger.info(`Synthesized speech (${text.length} chars) with voice ${voiceId}`);
    return audioBuffer;
  } catch (err) {
    logger.error("Error synthesizing speech: " + err.message);
    return Buffer.alloc(0); // return empty buffer on failure
  }
}
