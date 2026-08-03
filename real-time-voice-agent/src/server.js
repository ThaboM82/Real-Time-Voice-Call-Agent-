// src/server.js
import express from "express";
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import createLogger from "./logger.js";
import { transcribeAudio } from "./stt.js";
import { getLLMResponse } from "./openai.js";
import { synthesizeSpeech } from "./tts.js";
import { saveTranscript } from "./transcript.js";

const logger = createLogger("SERVER");
const app = express();
app.use(express.json());

// Twilio webhook endpoint
app.post("/voice", async (req, res) => {
  try {
    logger.info("Incoming call webhook received");

    const audioBuffer = Buffer.from(req.body.audio, "base64");

    const transcriptText = await transcribeAudio(audioBuffer);
    const llmResponse = await getLLMResponse(transcriptText);
    const audioOut = await synthesizeSpeech(llmResponse);

    const callId = `call-${Date.now()}`;
    saveTranscript(callId, transcriptText, llmResponse);

    res.send({
      message: "Call handled successfully",
      transcript: transcriptText,
      response: llmResponse,
      audioLength: audioOut.length,
    });
  } catch (err) {
    logger.error("Error handling call: " + err.message);
    res.status(500).send("Error processing call");
  }
});

// Frontend text-to-speech
app.post("/voice-audio", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || !voice) {
      return res.status(400).send("Missing text or voice");
    }

    const audioOut = await synthesizeSpeech(text, config.tts.voices[voice]);
    logger.info(`Generated audio for frontend: ${text.length} chars, voice=${voice}`);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioOut);
  } catch (err) {
    logger.error("Error generating frontend audio: " + err.message);
    res.status(500).send("Error generating audio");
  }
});

// Fetch transcripts with pagination + sorting
app.get("/api/transcripts", (req, res) => {
  const dir = config.storage.transcriptPath;
  try {
    if (!fs.existsSync(dir)) {
      logger.debug("Transcript directory not found, returning empty list");
      return res.json({ transcripts: [], total: 0 });
    }

    const { page = 1, limit = 10, sort = "newest" } = req.query;
    const files = fs.readdirSync(dir);

    let transcripts = files.map((file) => {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      return JSON.parse(content);
    });

    // Sorting
    if (sort === "newest") {
      transcripts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (sort === "oldest") {
      transcripts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (sort === "callId") {
      transcripts.sort((a, b) => a.callId.localeCompare(b.callId));
    }

    // Pagination
    const total = transcripts.length;
    const start = (page - 1) * limit;
    const paginated = transcripts.slice(start, start + parseInt(limit));

    logger.info(`Served ${paginated.length}/${total} transcripts (page ${page}, sort=${sort})`);
    res.json({ transcripts: paginated, total });
  } catch (err) {
    logger.error("Error reading transcripts: " + err.message);
    res.status(500).send("Error loading transcripts");
  }
});

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
