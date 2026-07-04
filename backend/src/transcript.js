// src/transcript.js
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import createLogger from "./logger.js";

const logger = createLogger("TRANSCRIPT");

/**
 * Save transcript and summary for a call.
 * @param {string} callId - Unique identifier for the call.
 * @param {string} transcript - Full transcript text.
 * @param {string} summary - Short summary of the call.
 */
export function saveTranscript(callId, transcript, summary) {
  try {
    const dir = config.storage.transcriptPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created transcript directory: ${dir}`);
    }

    const filePath = path.join(dir, `${callId}.json`);
    const payload = {
      callId,
      timestamp: new Date().toISOString(),
      transcript,
      summary,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    logger.info(`Transcript saved: ${filePath}`);
  } catch (err) {
    logger.error("Error saving transcript: " + err.message);
  }
}
