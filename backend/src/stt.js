// src/stt.js
import fetch from "node-fetch";
import { config } from "./config.js";
import createLogger from "./logger.js";

const logger = createLogger("STT");

/**
 * Transcribe audio using Deepgram STT.
 * @param {Buffer} audioBuffer - Raw audio data (e.g., PCM/WAV).
 * @returns {Promise<string>} - Transcribed text.
 */
export async function transcribeAudio(audioBuffer) {
  try {
    const resp = await fetch("https://api.deepgram.com/v1/listen", {
      method: "POST",
      headers: {
        Authorization: `Token ${config.stt.apiKey}`,
        "Content-Type": "audio/wav", // adjust if using PCM/other formats
      },
      body: audioBuffer,
    });

    if (!resp.ok) {
      throw new Error(`Deepgram API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();

    if (
      !data.results ||
      !data.results.channels ||
      !data.results.channels[0].alternatives[0]
    ) {
      logger.error("No transcription results from Deepgram");
      return "";
    }

    const transcript = data.results.channels[0].alternatives[0].transcript;
    if (transcript && transcript.trim().length > 0) {
      logger.info(`Transcription: "${transcript}"`);
      return transcript;
    } else {
      logger.debug("Received empty transcript from Deepgram");
      return "";
    }
  } catch (err) {
    logger.error("Error transcribing audio: " + err.message);
    return "";
  }
}
