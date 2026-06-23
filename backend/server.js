// Real-Time Voice Agent Backend
// Provides appointment booking, transcripts, Twilio integration,
// ElevenLabs voices, GPT-4o responses, Google Calendar events,
// and now real-time SSE broadcast for dashboards.

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import morgan from "morgan";
import fetch from "node-fetch";

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import * as chrono from "chrono-node";
import cron from "node-cron";
import twilio from "twilio";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import OpenAI from "openai";
import { createEvent } from "./calendarHelper.js";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fetch = require("node-fetch");
const expressWs = require("express-ws")(express());
const { startSTTStream } = require("./stt");

const app = expressWs.app;
app.use(bodyParser.json());
app.use(cors());

// ✅ Voice IDs from .env
const VOICES = {
  roger: process.env.ELEVENLABS_VOICE_ID_ROGER,
  brian: process.env.ELEVENLABS_VOICE_ID_BRIAN,
  daniel: process.env.ELEVENLABS_VOICE_ID_DANIEL,
};

function log(level, message, meta = {}) {
  const ts = new Date().toISOString();
  console.log(JSON.stringify({ ts, level, message, ...meta }));
}

function validateEnv() {
  const required = [
    "OPENAI_API_KEY",
    "DOMAIN",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    "ELEVENLABS_API_KEY"
  ];
  required.forEach((key) => {
    if (!process.env[key]) {
      log("error", "Missing environment variable", { key });
      process.exit(1);
    }
  });
}
validateEnv();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(bodyParser.json());
app.use(morgan("dev"));

app.get("/", (req, res) => res.send("Voice Agent backend running ✅"));
// Twilio call route (returns TwiML XML)
app.post("/twilio/call", (req, res) => {
  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${process.env.DOMAIN}/media-stream" />
      </Start>
      <Say>Connecting you to the voice agent...</Say>
    </Response>
  `);
});

// ----------------------
// Database Setup
// ----------------------
let db;
async function initDB() {
  db = await open({
    filename: "./voice_agent.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      time TEXT,
      status TEXT,
      phone TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  log("info", "SQLite initialized");
}
initDB();
// ----------------------
// Intent Router
// ----------------------
async function handleIntent(text) {
  const cleaned = cleanTranscript(text);

  if (cleaned.includes("book")) return await bookingIntent(cleaned);
  if (cleaned.includes("cancel")) return await cancelIntent(cleaned);
  if (cleaned.includes("reschedule")) return await rescheduleIntent(cleaned);
  if (cleaned.includes("lookup")) return await lookupIntent(cleaned);
  if (cleaned.includes("list")) return await listIntent(cleaned);

  return fallbackIntent(cleaned);
}

// ----------------------
// Booking Intent
// ----------------------
async function bookingIntent(text) {
  log("info", "Booking intent triggered", { text });

  const title = "Appointment";
  const time = extractDateTime(text);
  const status = "booked";
  const phone = process.env.USER_PHONE || "+1234567890";

  await db.run(
    "INSERT INTO appointments (title, time, status, phone) VALUES (?, ?, ?, ?)",
    [title, time, status, phone]
  );

  return `Okay, I booked your appointment at ${time}.`;
}

// ----------------------
// Cancel Intent
// ----------------------
async function cancelIntent(text) {
  log("info", "Cancel intent triggered", { text });

  const id = extractAppointmentId(text);
  if (!id) return "Please specify which appointment to cancel (e.g., cancel #2).";

  await db.run("UPDATE appointments SET status = ? WHERE id = ?", ["canceled", id]);

  return `Got it, I canceled appointment #${id}.`;
}

// ----------------------
// Reschedule Intent
// ----------------------
async function rescheduleIntent(text) {
  log("info", "Reschedule intent triggered", { text });

  const id = extractAppointmentId(text);
  const newTime = extractDateTime(text);

  if (!id) return "Please specify which appointment to reschedule (e.g., reschedule #2 to tomorrow at 3 PM).";

  await db.run("UPDATE appointments SET time = ?, status = ? WHERE id = ?", [
    newTime,
    "rescheduled",
    id
  ]);

  return `Sure, I rescheduled appointment #${id} to ${newTime}.`;
}

// ----------------------
// Lookup Intent
// ----------------------
async function lookupIntent(text) {
  log("info", "Lookup intent triggered", { text });

  const id = extractAppointmentId(text);
  if (!id) return "Please specify which appointment to lookup (e.g., lookup #2).";

  const row = await db.get("SELECT * FROM appointments WHERE id = ?", [id]);

  if (!row) return `No appointment found with ID ${id}.`;
  return `Appointment #${row.id}: ${row.title} at ${row.time} [${row.status}].`;
}

// ----------------------
// List Intent
// ----------------------
async function listIntent(text) {
  log("info", "List intent triggered", { text });

  const rows = await db.all("SELECT * FROM appointments ORDER BY time ASC");

  if (rows.length === 0) return "You have no upcoming appointments.";

  return rows.map(r => `#${r.id}: ${r.title} at ${r.time} [${r.status}]`).join("\n");
}

// ----------------------
// Fallback Intent
// ----------------------
function fallbackIntent(text) {
  log("warn", "Fallback intent triggered", { text });
  return "Sorry, I didn’t understand that. Can you rephrase?";
}

// ----------------------
// Utility Functions
// ----------------------
function cleanTranscript(text) {
  return text.toLowerCase().trim();
}

function extractDateTime(text) {
  const parsed = chrono.parseDate(text);
  if (!parsed) return "unspecified time";
  return parsed.toISOString();
}

function extractAppointmentId(text) {
  const match = text.match(/#(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
// ----------------------
// Real-Time SSE Broadcast
// ----------------------
let sseClients = [];
let callsBuffer = [];

app.get("/api/calls/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send current buffer immediately
  res.write(`data: ${JSON.stringify(callsBuffer)}\n\n`);

  const client = { res };
  sseClients.push(client);

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== client);
    res.end();
  });
});

// Helper: broadcast new events instantly
function broadcastCalls() {
  const payload = JSON.stringify(callsBuffer);
  sseClients.forEach((client) => {
    client.res.write(`data: ${payload}\n\n`);
  });
}
// ----------------------
// Twilio Voice Webhook
// ----------------------
app.post("/voice", (req, res) => {
  const { From, To, CallStatus, CallDuration } = req.body;

  const callEvent = {
    from: From,
    to: To,
    status: CallStatus,
    duration: parseInt(CallDuration || "0", 10),
    timestamp: Date.now(),
  };

  callsBuffer.push(callEvent);
  if (callsBuffer.length > 1000) callsBuffer = callsBuffer.slice(-500);

  // Broadcast immediately to SSE clients
  broadcastCalls();

  res.send("<Response><Say>Call logged</Say></Response>");
});
// ----------------------
// Speech-to-Text (Whisper)
// ----------------------
async function transcribeAudio(buffer) {
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: buffer
    });
    const result = await response.json();
    return result.text || "";
  } catch (err) {
    log("error", "STT error", { error: err.message });
    return "";
  }
}

// ----------------------
// Text-to-Speech (ElevenLabs)
// ----------------------
async function synthesizeSpeech(text, voiceKey = "roger") {
  const voiceId = VOICES[voiceKey];
  if (!voiceId) {
    log("error", "Missing voiceId", { voiceKey });
    return Buffer.from("");
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
        model_id: "eleven_monolingual_v1"
      }),
    });

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer);
  } catch (err) {
    log("error", "ElevenLabs TTS error", { error: err.message });
    return Buffer.from("");
  }
}

// ----------------------
// Twilio SMS Reminder System
// ----------------------
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

cron.schedule("* * * * *", async () => {
  log("info", "Reminder job running...");

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const rows = await db.all(
    "SELECT * FROM appointments WHERE time <= ? AND status = ?",
    [oneHourLater, "booked"]
  );

  for (const appt of rows) {
    log("info", "Reminder triggered", { id: appt.id, time: appt.time });

    if (appt.phone) {
      try {
        await twilioClient.messages.create({
          body: `Reminder: Appointment #${appt.id} at ${appt.time}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: appt.phone
        });
        log("info", "SMS sent", { to: appt.phone });
      } catch (err) {
        log("error", "SMS failed", { error: err.message });
      }
    }

    await db.run("UPDATE appointments SET status = ? WHERE id = ?", [
      "reminded",
      appt.id
    ]);
  }
});

// ----------------------
// ElevenLabs Voice Routes
// ----------------------
app.get("/voices/test", async (req, res) => {
  const results = {};
  for (const [name, voiceId] of Object.entries(VOICES)) {
console.log("▶ Env check:", {
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ? "Loaded" : "Missing",
  ROGER: VOICES.roger,
  BRIAN: VOICES.brian,
  DANIEL: VOICES.daniel,
});

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ status: "✅ Backend running" });
});

// ✅ Voices test route
app.get("/voices/test", async (req, res) => {
  const results = {};
  for (const [name, voiceId] of Object.entries(VOICES)) {
    console.log(`▶ Testing voiceId for ${name}: ${voiceId}`);
    if (!voiceId) {
      results[name] = "Missing voiceId";
      continue;
    }
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: `Hello from ${name}` }),
      });
      results[name] = response.ok ? "OK" : `Error ${response.status}`;
    } catch (err) {
      results[name] = "Error";
      console.error(`❌ ElevenLabs error for ${name}:`, err.message);
    }
  }
  res.json({ message: "✅ Voices tested", voices: results });
});

// ✅ Speak route
app.post("/speak", async (req, res) => {
  const { text, voiceKey } = req.body;
  const voiceId = VOICES[voiceKey];
  if (!voiceId) {
    return res.status(400).json({ error: "Invalid voiceKey" });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

    const buffer = await response.buffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    console.error("❌ Error in /speak:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------
// Settings Routes
// ----------------------
const settingsPath = path.join(process.cwd(), "settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch (err) {
    log("error", "Error loading settings", { error: err.message });
  }
  return {};
}
// ✅ Settings routes
const settingsPath = path.join(__dirname, "settings.json");

app.post("/api/settings", (req, res) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.log("✅ User settings updated");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving settings:", err.message);
    res.status(500).send("Error saving settings");
  }
});

app.get("/api/settings", (req, res) => {
  try {
    if (!fs.existsSync(settingsPath)) return res.json({});
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    res.json(settings);
  } catch (err) {
    console.error("❌ Error loading settings:", err.message);
    res.status(500).send("Error loading settings");
  }
});

// ----------------------
// Transcripts API
// ----------------------
app.get("/api/transcripts", async (req, res) => {
  try {
    const { sessionId, role, search, page = 1, limit = 50 } = req.query;
    let query = "SELECT session_id, role, content, timestamp FROM transcripts WHERE 1=1";
    const params = [];

    if (sessionId) {
      query += " AND session_id = ?";
      params.push(sessionId);
    }
    if (role) {
      query += " AND role = ?";
      params.push(role);
    }
    if (search) {
      query += " AND content LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY timestamp ASC LIMIT ? OFFSET ?";
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const rows = await db.all(query, params);
    res.json({ success: true, transcripts: rows });
  } catch (err) {
    log("error", "Error fetching transcripts", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/transcripts/:sessionId/export", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = "json" } = req.query;

    const rows = await db.all(
      "SELECT role, content, timestamp FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC",
      [sessionId]
    );

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(rows, null, 2));
    }

    if (format === "txt") {
      const text = rows.map(r => `[${r.timestamp}] ${r.role}: ${r.content}`).join("\n");
      res.setHeader("Content-Type", "text/plain");
      return res.send(text);
    }

    if (format === "csv") {
      const header = "Role,Content,Timestamp\n";
      const csv = rows.map(r => `${r.role},"${r.content.replace(/"/g, '""')}",${r.timestamp}`).join("\n");
      res.setHeader("Content-Type", "text/csv");
      return res.send(header + csv);
    }

    res.status(400).json({ success: false, error: "Invalid format" });
  } catch (err) {
    log("error", "Error exporting transcripts", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// WebSocket Handling
// ----------------------
wss.on("connection", (ws) => {
  log("info", "Twilio connected");

  const sessionId = randomUUID();

  let conversationHistory = [
    { role: "system", content: "You are a helpful voice agent that assists with appointments and general conversation." }
  ];

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.event) {
        case "start":
          log("info", "Media stream started", { start: data.start });
          break;

        case "media":
          const audioBuffer = Buffer.from(data.media.payload, "base64");

          // 🔧 Speech-to-Text
          const transcript = await transcribeAudio(audioBuffer);
          log("info", "Transcript", { transcript });

          if (transcript) {
            // Save user input
            await db.run(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)",
              [sessionId, "user", transcript]
            );
            conversationHistory.push({ role: "user", content: transcript });

            // 🔧 GPT‑4o reply
            let responseText = await generateLLMReply(conversationHistory);

            if (!responseText) {
              responseText = await handleIntent(transcript);
            }

            // Save assistant reply
            await db.run(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)",
              [sessionId, "assistant", responseText]
            );
            conversationHistory.push({ role: "assistant", content: responseText });

            // 🔧 TTS
            const settings = loadSettings();
            const voiceKey = settings.voiceKey || "roger";
            const ttsAudio = await synthesizeSpeech(responseText, voiceKey);

            // Send audio back to Twilio
            ws.send(JSON.stringify({
              event: "media",
              media: { payload: ttsAudio.toString("base64") }
            }));

            // 🔧 Broadcast transcript to frontend listeners
            wss.clients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  event: "transcript",
                  sessionId,
                  role: "assistant",
                  content: responseText,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          }
          break;

        case "stop":
          log("info", "Media stream stopped");
          break;

        default:
          log("warn", "Unknown event", { event: data.event });
      }
    } catch (err) {
      log("error", "WebSocket message error", { error: err.message });
    }
  });

  ws.on("close", () => log("info", "Twilio disconnected"));
});
// ----------------------
// Google Calendar Route
// ----------------------
app.get("/book-test-event", async (req, res) => {
  try {
    const link = await createEvent(
      "Voice Agent Booking",
      "Created via server.js integration",
      "2026-06-18T15:00:00+02:00",
      "2026-06-18T16:00:00+02:00"
    );

    res.send(`Event created: <a href="${link}" target="_blank">${link}</a>`);
  } catch (err) {
    res.status(500).send("Error creating event: " + err.message);
  }
});
// ----------------------
// Server Start
// ----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
// ✅ Transcript handling
const transcriptsPath = path.join(__dirname, "transcripts.json");
const tagsDictPath = path.join(__dirname, "tags.json");

// Cache layers
let transcriptCache = [];
let tagDictionary = {};

// Load transcripts into cache
function loadTranscripts() {
  try {
    if (fs.existsSync(transcriptsPath)) {
      transcriptCache = JSON.parse(fs.readFileSync(transcriptsPath, "utf-8"));
    } else {
      transcriptCache = [];
    }
    console.log("🔄 Transcript cache loaded. Total sessions:", transcriptCache.length);
  } catch (err) {
    console.error("❌ Error loading transcripts:", err.message);
    transcriptCache = [];
  }
}

// Load tags into cache
function loadTags() {
  try {
    if (fs.existsSync(tagsDictPath)) {
      tagDictionary = JSON.parse(fs.readFileSync(tagsDictPath, "utf-8"));
    } else {
      tagDictionary = {};
    }
    console.log("🔄 Tags dictionary loaded:", Object.keys(tagDictionary));
  } catch (err) {
    console.error("❌ Error loading tags.json:", err.message);
    tagDictionary = {};
  }
}

// Initial loads
loadTranscripts();
loadTags();

// Watchers for hot reload
fs.watch(transcriptsPath, (eventType) => {
  if (eventType === "change") loadTranscripts();
});
fs.watch(tagsDictPath, (eventType) => {
  if (eventType === "change") loadTags();
});

// Auto-tagging using dictionary cache
function autoTagTranscript(text) {
  try {
    const tags = [];
    const lower = text.toLowerCase();
    for (const [tag, keywords] of Object.entries(tagDictionary)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        tags.push(tag);
      }
    }
    return tags.length > 0 ? tags : ["uncategorized"];
  } catch (err) {
    console.error("❌ Auto-tagging error:", err.message);
    return ["uncategorized"];
  }
}

// ✅ Transcript routes
app.get("/api/transcripts", (req, res) => {
  res.json(transcriptCache);
});

app.post("/api/transcripts", (req, res) => {
  try {
    const { id, transcripts, tags, metadata } = req.body;
    if (!id || !transcripts) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newTranscript = {
      id,
      transcripts,
      tags: tags || [],
      metadata: metadata || { startTime: new Date().toISOString() },
    };

    transcriptCache.push(newTranscript);
    fs.writeFileSync(transcriptsPath, JSON.stringify(transcriptCache, null, 2));

    res.status(201).json(newTranscript);
  } catch (err) {
    console.error("❌ Error saving transcript:", err.message);
    res.status(500).send("Error saving transcript");
  }
});

app.put("/api/transcripts/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { transcripts, tags, metadata } = req.body;

    const index = transcriptCache.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    if (transcripts) transcriptCache[index].transcripts = transcripts;
    if (tags) transcriptCache[index].tags = tags;
    if (metadata) transcriptCache[index].metadata = metadata;

    fs.writeFileSync(transcriptsPath, JSON.stringify(transcriptCache, null, 2));

    res.json({ message: "Transcript updated", updated: transcriptCache[index] });
  } catch (err) {
    console.error("❌ Error updating transcript:", err.message);
    res.status(500).send("Error updating transcript");
  }
});

app.delete("/api/transcripts/:id", (req, res) => {
  try {
    const { id } = req.params;
    const index = transcriptCache.findIndex((t) => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    const deleted = transcriptCache.splice(index, 1);
    fs.writeFileSync(transcriptsPath, JSON.stringify(transcriptCache, null, 2));

    res.json({ message: "Transcript deleted", deleted });
  } catch (err) {
    console.error("❌ Error deleting transcript:", err.message);
    res.status(500).send("Error deleting transcript");
  }
});

// ✅ Twilio call webhook
app.post("/twilio-call", (req, res) => {
  res.type("text/xml");
  res.send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${req.hostname}/twilio-stream" />
      </Connect>
    </Response>
  `);
});

// ✅ Twilio WebSocket handler with batching + auto-tagging
app.ws("/twilio-stream", (ws) => {
  console.log("▶ Twilio stream connected");

  let transcriptBuffer = [];
  const sessionId = Date.now().toString();

  const pushAudio = startSTTStream(ws, process.env.DEEPGRAM_API_KEY, (transcriptChunk) => {
    transcriptBuffer.push({ text: transcriptChunk });
    console.log("🎧 Transcript chunk:", transcriptChunk.substring(0, 50) + "...");
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === "media") {
        pushAudio(data.media.payload);
      } else {
        console.log("ℹ️ Non-media event:", data.event);
      }
    } catch (err) {
      console.error("❌ Error parsing WS message:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio stream closed");

    try {
      const fullText = transcriptBuffer.map((t) => t.text).join(" ");
      const tags = autoTagTranscript(fullText);

      const newTranscript = {
        id: sessionId,
        transcripts: transcriptBuffer,
        tags,
        metadata: { startTime: new Date().toISOString() },
      };

      transcriptCache.push(newTranscript);
      fs.writeFileSync(transcriptsPath, JSON.stringify(transcriptCache, null, 2));

      console.log("✅ Full transcript saved with tags:", tags);
    } catch (err) {
      console.error("❌ Error saving full transcript:", err.message);
    }
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
