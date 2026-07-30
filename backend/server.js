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
import cors from "cors";
import Database from "better-sqlite3";   // ✅ switched to better-sqlite3
import * as chrono from "chrono-node";
import cron from "node-cron";
import twilio from "twilio";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import expressWs from "express-ws";
import { startSTTStream } from "./stt.js";
import { createEvent } from "./calendarHelper.js";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Express + WebSocket
const { app } = expressWs(express());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(morgan("dev"));

// ✅ Health check route for Render
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

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
// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ status: "✅ Backend running" });
});

// ✅ Twilio call route (returns TwiML XML)
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

// ✅ Twilio Voice Webhook
app.post("/voice", (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Hello Percy, your real-time voice agent is live!");
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Error handling /voice webhook:", err);
    res.status(500).send("Internal Server Error");
  }
});
// ----------------------
// Database Setup
// ----------------------
let db;
function initDB() {
  db = new Database("./voice_agent.db");

  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      time TEXT,
      status TEXT,
      phone TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      role TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  log("info", "SQLite initialized with better-sqlite3");
}
initDB();
// ----------------------
// Intent Router
// ----------------------
async function handleIntent(text) {
  const cleaned = cleanTranscript(text);

  if (cleaned.includes("book")) return bookingIntent(cleaned);
  if (cleaned.includes("cancel")) return cancelIntent(cleaned);
  if (cleaned.includes("reschedule")) return rescheduleIntent(cleaned);
  if (cleaned.includes("lookup")) return lookupIntent(cleaned);
  if (cleaned.includes("list")) return listIntent(cleaned);

  return fallbackIntent(cleaned);
}

// ----------------------
// Booking Intent
// ----------------------
function bookingIntent(text) {
  log("info", "Booking intent triggered", { text });

  const title = "Appointment";
  const time = extractDateTime(text);
  const status = "booked";
  const phone = process.env.USER_PHONE || "+1234567890";

  db.prepare(
    "INSERT INTO appointments (title, time, status, phone) VALUES (?, ?, ?, ?)"
  ).run(title, time, status, phone);

  return `Okay, I booked your appointment at ${time}.`;
}

// ----------------------
// Cancel Intent
// ----------------------
function cancelIntent(text) {
  log("info", "Cancel intent triggered", { text });

  const id = extractAppointmentId(text);
  if (!id) return "Please specify which appointment to cancel (e.g., cancel #2).";

  db.prepare("UPDATE appointments SET status = ? WHERE id = ?")
    .run("canceled", id);

  return `Got it, I canceled appointment #${id}.`;
}

// ----------------------
// Reschedule Intent
// ----------------------
function rescheduleIntent(text) {
  log("info", "Reschedule intent triggered", { text });

  const id = extractAppointmentId(text);
  const newTime = extractDateTime(text);

  if (!id) return "Please specify which appointment to reschedule (e.g., reschedule #2 to tomorrow at 3 PM).";

  db.prepare("UPDATE appointments SET time = ?, status = ? WHERE id = ?")
    .run(newTime, "rescheduled", id);

  return `Sure, I rescheduled appointment #${id} to ${newTime}.`;
}

// ----------------------
// Lookup Intent
// ----------------------
function lookupIntent(text) {
  log("info", "Lookup intent triggered", { text });

  const id = extractAppointmentId(text);
  if (!id) return "Please specify which appointment to lookup (e.g., lookup #2).";

  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);

  if (!row) return `No appointment found with ID ${id}.`;
  return `Appointment #${row.id}: ${row.title} at ${row.time} [${row.status}].`;
}

// ----------------------
// List Intent
// ----------------------
function listIntent(text) {
  log("info", "List intent triggered", { text });

  const rows = db.prepare("SELECT * FROM appointments ORDER BY time ASC").all();

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
// Twilio Voice Webhook (Call Logging)
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

  res.type("text/xml");
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

cron.schedule("* * * * *", () => {
  log("info", "Reminder job running...");

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const rows = db.prepare(
    "SELECT * FROM appointments WHERE time <= ? AND status = ?"
  ).all(oneHourLater, "booked");

  for (const appt of rows) {
    log("info", "Reminder triggered", { id: appt.id, time: appt.time });

    if (appt.phone) {
      try {
        twilioClient.messages.create({
          body: `Reminder: Appointment #${appt.id} at ${appt.time}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: appt.phone
        });
        log("info", "SMS sent", { to: appt.phone });
      } catch (err) {
        log("error", "SMS failed", { error: err.message });
      }
    }

    db.prepare("UPDATE appointments SET status = ? WHERE id = ?")
      .run("reminded", appt.id);
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
app.post("/api/settings", (req, res) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
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
// Transcripts API (SQLite)
// ----------------------
app.get("/api/transcripts", (req, res) => {
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

    const rows = db.prepare(query).all(...params);
    res.json({ success: true, transcripts: rows });
  } catch (err) {
    log("error", "Error fetching transcripts", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/transcripts/:sessionId/export", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = "json" } = req.query;

    const rows = db.prepare(
      "SELECT role, content, timestamp FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(sessionId);

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
            db.prepare(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)"
            ).run(sessionId, "user", transcript);
            conversationHistory.push({ role: "user", content: transcript });

            // 🔧 GPT‑4o reply
            let responseText = await generateLLMReply(conversationHistory);

            if (!responseText) {
              responseText = await handleIntent(transcript);
            }

            // Save assistant reply
            db.prepare(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)"
            ).run(sessionId, "assistant", responseText);
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
  console.log(`🚀 Backend running on port ${PORT}`);
});

// ✅ Transcript handling (JSON cache + tags)
const transcriptsPath = path.join(process.cwd(), "transcripts.json");
const tagsDictPath = path.join(process.cwd(), "tags.json");

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

// ✅ Transcript routes (JSON cache)
app.get("/api/transcripts-cache", (req, res) => {
  res.json(transcriptCache);
});

app.post("/api/transcripts-cache", (req, res) => {
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

app.put("/api/transcripts-cache/:id", (req, res) => {
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

app.delete("/api/transcripts-cache/:id", (req, res) => {
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

// ✅ Twilio call webhook (alternate stream)
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
// ----------------------
// Appointment REST API
// ----------------------

// Create appointment
app.post("/api/appointments", (req, res) => {
  try {
    const { title, time, phone } = req.body;
    if (!title || !time) {
      return res.status(400).json({ success: false, error: "Missing title or time" });
    }

    const status = "booked";
    const stmt = db.prepare(
      "INSERT INTO appointments (title, time, status, phone) VALUES (?, ?, ?, ?)"
    );
    const result = stmt.run(title, time, status, phone);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    log("error", "Error creating appointment", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all appointments
app.get("/api/appointments", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM appointments ORDER BY time ASC").all();
    res.json({ success: true, appointments: rows });
  } catch (err) {
    log("error", "Error fetching appointments", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single appointment
app.get("/api/appointments/:id", (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, appointment: row });
  } catch (err) {
    log("error", "Error fetching appointment", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update appointment
app.put("/api/appointments/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { time, status } = req.body;
    db.prepare("UPDATE appointments SET time = ?, status = ? WHERE id = ?")
      .run(time, status, id);
    res.json({ success: true });
  } catch (err) {
    log("error", "Error updating appointment", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete appointment
app.delete("/api/appointments/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    log("error", "Error deleting appointment", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Analytics API
// ----------------------
app.get("/api/analytics", (req, res) => {
  try {
    // Total calls logged
    const totalCalls = db.prepare("SELECT COUNT(*) AS count FROM calls").get().count;

    // Average call duration
    const avgDuration = db.prepare("SELECT AVG(duration) AS avg FROM calls").get().avg || 0;

    // Upcoming appointments
    const upcomingAppointments = db.prepare(
      "SELECT COUNT(*) AS count FROM appointments WHERE time > ? AND status = ?"
    ).get(new Date().toISOString(), "booked").count;

    // Completed appointments
    const completedAppointments = db.prepare(
      "SELECT COUNT(*) AS count FROM appointments WHERE status = ?"
    ).get("completed").count;

    // Reminder stats
    const remindedAppointments = db.prepare(
      "SELECT COUNT(*) AS count FROM appointments WHERE status = ?"
    ).get("reminded").count;

    res.json({
      success: true,
      stats: {
        totalCalls,
        avgDuration,
        upcomingAppointments,
        completedAppointments,
        remindedAppointments
      }
    });
  } catch (err) {
    log("error", "Error fetching analytics", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Admin Dashboard Routes
// ----------------------

// Get system overview
app.get("/api/admin/overview", (req, res) => {
  try {
    const totalTranscripts = db.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count;
    const totalAppointments = db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count;
    const totalCalls = db.prepare("SELECT COUNT(*) AS count FROM calls").get().count;

    res.json({
      success: true,
      overview: {
        transcripts: totalTranscripts,
        appointments: totalAppointments,
        calls: totalCalls
      }
    });
  } catch (err) {
    log("error", "Error fetching admin overview", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manage tags dictionary
app.get("/api/admin/tags", (req, res) => {
  res.json({ success: true, tags: tagDictionary });
});

app.post("/api/admin/tags", (req, res) => {
  try {
    const { tag, keywords } = req.body;
    if (!tag || !keywords) {
      return res.status(400).json({ success: false, error: "Missing tag or keywords" });
    }
    tagDictionary[tag] = keywords;
    fs.writeFileSync(tagsDictPath, JSON.stringify(tagDictionary, null, 2));
    res.json({ success: true, tags: tagDictionary });
  } catch (err) {
    log("error", "Error updating tags", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manage settings
app.get("/api/admin/settings", (req, res) => {
  try {
    const settings = loadSettings();
    res.json({ success: true, settings });
  } catch (err) {
    log("error", "Error fetching settings", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/settings", (req, res) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true, settings: req.body });
  } catch (err) {
    log("error", "Error updating settings", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Authentication & RBAC
// ----------------------
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

// Middleware: verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ success: false, error: "Invalid token" });
    req.user = user;
    next();
  });
}

// Middleware: check role
function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    next();
  };
}

// Login route (for demo purposes)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  // 🔧 Replace with real user lookup
  if (username === "admin" && password === "password123") {
    const user = { username, role: "admin" };
    const token = jwt.sign(user, SECRET_KEY, { expiresIn: "1h" });
    return res.json({ success: true, token });
  }

  if (username === "user" && password === "password123") {
    const user = { username, role: "user" };
    const token = jwt.sign(user, SECRET_KEY, { expiresIn: "1h" });
    return res.json({ success: true, token });
  }

  res.status(401).json({ success: false, error: "Invalid credentials" });
});

// Protect admin routes
app.use("/api/admin", authenticateToken, authorizeRole("admin"));
// ----------------------
// User Management API
// ----------------------

// Create user
app.post("/api/users", (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Missing username or password" });
    }

    const stmt = db.prepare(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
    );
    const result = stmt.run(username, password, role || "user");

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    log("error", "Error creating user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all users
app.get("/api/users", (req, res) => {
  try {
    const rows = db.prepare("SELECT id, username, role FROM users").all();
    res.json({ success: true, users: rows });
  } catch (err) {
    log("error", "Error fetching users", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single user
app.get("/api/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: row });
  } catch (err) {
    log("error", "Error fetching user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update user
app.put("/api/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    db.prepare("UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?")
      .run(username, password, role, id);

    res.json({ success: true });
  } catch (err) {
    log("error", "Error updating user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete user
app.delete("/api/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err) {
    log("error", "Error deleting user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Password Hashing & Security
// ----------------------
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 10;

// Create user with hashed password
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Missing username or password" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const stmt = db.prepare(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
    );
    const result = stmt.run(username, hashedPassword, role || "user");

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    log("error", "Error creating user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update user with hashed password
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }

    db.prepare("UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?")
      .run(username, hashedPassword, role, id);

    res.json({ success: true });
  } catch (err) {
    log("error", "Error updating user", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Secure login with bcrypt password check
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const token = jwt.sign({ username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ success: true, token });
  } catch (err) {
    log("error", "Error during login", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Audit Logging
// ----------------------

// Ensure audit_logs table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    user TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Helper function to log actions
function logAudit(action, user, details) {
  db.prepare("INSERT INTO audit_logs (action, user, details) VALUES (?, ?, ?)")
    .run(action, user || "system", JSON.stringify(details));
}

// Example: log login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user) {
      logAudit("login_failed", username, { reason: "User not found" });
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logAudit("login_failed", username, { reason: "Wrong password" });
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const token = jwt.sign({ username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "1h" });
    logAudit("login_success", username, { role: user.role });
    res.json({ success: true, token });
  } catch (err) {
    log("error", "Error during login", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Example: log appointment creation
app.post("/api/appointments", (req, res) => {
  try {
    const { title, time, phone } = req.body;
    const status = "booked";
    const stmt = db.prepare("INSERT INTO appointments (title, time, status, phone) VALUES (?, ?, ?, ?)");
    const result = stmt.run(title, time, status, phone);

    logAudit("appointment_created", req.user?.username, { id: result.lastInsertRowid, title, time });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    log("error", "Error creating appointment", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch audit logs (admin only)
app.get("/api/admin/audit", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100").all();
    res.json({ success: true, logs: rows });
  } catch (err) {
    log("error", "Error fetching audit logs", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
// ----------------------
// Error Monitoring & Alerts
// ----------------------
const nodemailer = require("nodemailer");
const twilio = require("twilio");

// Email setup (SendGrid or SMTP)
const transporter = nodemailer.createTransport({
  service: "gmail", // or "SendGrid"
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Helper: send alert
function sendAlert(subject, message) {
  // Email alert
  transporter.sendMail({
    from: process.env.ALERT_EMAIL_USER,
    to: process.env.ALERT_EMAIL_TARGET,
    subject,
    text: message
  }, (err) => {
    if (err) log("error", "Failed to send email alert", { error: err.message });
  });

  // SMS alert
  twilioClient.messages.create({
    body: `[ALERT] ${subject}: ${message}`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.ALERT_SMS_TARGET
  }).catch(err => log("error", "Failed to send SMS alert", { error: err.message }));
}

// Global error handler
app.use((err, req, res, next) => {
  log("error", "Unhandled error", { error: err.message });
  sendAlert("Critical Backend Error", `Route: ${req.originalUrl}\nError: ${err.message}`);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
