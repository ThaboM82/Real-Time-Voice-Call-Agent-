// ======================================================
// Section 1: Imports & Setup
// ======================================================

// Core server modules
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

// Environment and utilities
import dotenv from "dotenv";
import bodyParser from "body-parser";
import morgan from "morgan";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Database and scheduling
import Database from "better-sqlite3";
import * as chrono from "chrono-node";
import cron from "node-cron";

// External APIs
import twilio from "twilio";
import expressWs from "express-ws";

// Local helper modules
import { startSTTStream } from "./stt.js";
import { speakText } from "./tts.js";          
import { createEvent } from "./calendarHelper.js";

// Load environment variables
dotenv.config();
// Express + WebSocket
const app = express();
expressWs(app);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Initialize OpenAI
import openai from "./llm.js";

/**
 * Generate an AI reply from transcript text
 * @param {string} transcript - Caller’s speech transcript
 * @returns {string} - AI-generated reply text
 */
export async function generateAIReply(transcript) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful real-time voice assistant." },
        { role: "user", content: transcript },
      ],
      max_tokens: 100,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("AI reply error:", err.message);
    return "Sorry, I had trouble generating a response.";
  }
}

// SQLite
const db = new Database("./voice_agent.db");
db.prepare(`
  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    transcript TEXT,
    ai_reply TEXT
  )
`).run();

export function logTranscript(transcript, aiReply) {
  try {
    const stmt = db.prepare(`
      INSERT INTO transcripts (id, transcript, ai_reply)
      VALUES (?, ?, ?)
    `);
    stmt.run(randomUUID(), transcript, aiReply);
    console.log("💾 Logged transcript + AI reply");
  } catch (err) {
    console.error("DB insert error:", err.message);
  }
}

// Middleware setup
app.use(bodyParser.json());
app.use(cors());
app.use(morgan("dev"));

// Structured startup logging
console.log("========================================");
console.log(" Voice Agent Backend Initialization ");
console.log("========================================");
console.log("Environment loaded:", process.env.NODE_ENV || "development");
console.log("Database driver: better-sqlite3");
console.log("OpenAI client initialized:", !!process.env.OPENAI_API_KEY);
console.log("Twilio client configured:", !!process.env.TWILIO_ACCOUNT_SID);
console.log("========================================");
// ======================================================
// Section 2: Health & Twilio Greeting
// ======================================================

// Basic health check endpoints
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "Backend running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Twilio call entry point: starts media stream
app.post("/twilio/call", (req, res) => {
  try {
    res.type("text/xml");
    res.send(`
      <Response>
        <Start>
          <Stream url="wss://${process.env.DOMAIN}/media-stream" />
        </Start>
        <Say>Hello Percy, your real-time voice agent is live! You can speak now, and I will respond.</Say>
      </Response>
    `);
  } catch (err) {
    console.error("Twilio call setup failed:", err.message);
    res.status(500).send("Internal Server Error");
  }
});
// ======================================================
// Section: Twilio Media Stream Handler
// ======================================================

wss.on("connection", (ws) => {
  console.log("🔗 Twilio stream connected");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "media") {
        const audioPayload = data.media.payload;

        // Step 1: STT
        const transcript = await startSTTStream(audioPayload);

        if (transcript) {
          console.log("📝 Transcript:", transcript);

          // Step 2: AI reply
          const aiReply = await generateAIReply(transcript);

          // Step 3: TTS
          const audioBuffer = await speakText(
            aiReply,
            process.env.ELEVENLABS_VOICE_ID,
            process.env.ELEVENLABS_API_KEY
          );

          // Step 4: Send audio back to Twilio
          if (audioBuffer) {
            ws.send(
              JSON.stringify({
                event: "media",
                media: { payload: audioBuffer.toString("base64") },
              })
            );
            console.log("🔊 Sent TTS audio back to caller");
          }
        }
      }

      if (data.event === "stop") {
        console.log("❌ Twilio stream stopped");
        ws.close();
      }
    } catch (err) {
      console.error("⚠️ Error in Twilio stream handler:", err.message);
    }
  });
});


// Twilio voice greeting route
app.post("/voice", (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();

    // Initial greeting
    twiml.say("Hello Percy, your real-time voice agent is live!");
    twiml.pause({ length: 1 });
    twiml.say("You can speak now, and I will respond.");

    // ✅ Open a media stream to your backend WebSocket
    twiml.connect().stream({
      url: "wss://your-server-domain/stream" // replace with your backend WebSocket endpoint
    });

    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Voice greeting failed:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

// Alternate greeting route for testing
app.get("/voice/test", (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("This is a test greeting from your backend.");
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Voice test route failed:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

// ======================================================
// Section 3: Database Setup
// ======================================================

function initDB() {

  // Appointments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'booked',
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transcripts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Calls table (fixed reserved words)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_number TEXT,
      to_number TEXT,
      status TEXT,
      duration INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL,
      keywords TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Database initialized with tables: appointments, transcripts, calls, audit_logs, settings, tags");
}

initDB();

// ======================================================
// Section 4: Real-Time SSE Broadcast
// ======================================================

// Connected SSE clients
let sseClients = [];

// Buffer of recent call events
let callsBuffer = [];

// SSE endpoint for streaming call events
app.get("/api/calls/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Immediately send current buffer
  res.write(`data: ${JSON.stringify(callsBuffer)}\n\n`);

  const client = { res };
  sseClients.push(client);

  console.log("New SSE client connected. Total clients:", sseClients.length);

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== client);
    console.log("SSE client disconnected. Remaining clients:", sseClients.length);
    res.end();
  });
});

// Broadcast helper
function broadcastCalls() {
  const payload = JSON.stringify(callsBuffer);
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error("Failed to write SSE payload:", err.message);
    }
  });
}

// Extended broadcast: allows filtering by status
function broadcastFiltered(status) {
  const filtered = callsBuffer.filter(c => c.status === status);
  const payload = JSON.stringify(filtered);
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error("Failed to write filtered SSE payload:", err.message);
    }
  });
}

// Endpoint to trigger manual broadcast
app.post("/api/calls/broadcast", (req, res) => {
  try {
    broadcastCalls();
    res.json({ success: true, message: "Broadcast triggered" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to broadcast only active calls
app.post("/api/calls/broadcast/active", (req, res) => {
  try {
    broadcastFiltered("in-progress");
    res.json({ success: true, message: "Active calls broadcast triggered" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 5: Twilio Voice Logging Route
// ======================================================

// Endpoint to log Twilio call events
app.post("/voice-log", (req, res) => {
  try {
    const { From, To, CallStatus, CallDuration } = req.body;

    const callEvent = {
      from: From || "unknown",
      to: To || "unknown",
      status: CallStatus || "unknown",
      duration: parseInt(CallDuration || "0", 10),
      timestamp: new Date().toISOString(),
    };

    // Insert into database
    db.prepare(
      "INSERT INTO calls (from, to, status, duration, timestamp) VALUES (?, ?, ?, ?, ?)"
    ).run(
      callEvent.from,
      callEvent.to,
      callEvent.status,
      callEvent.duration,
      callEvent.timestamp
    );

    // Push into buffer
    callsBuffer.push(callEvent);
    if (callsBuffer.length > 1000) {
      callsBuffer = callsBuffer.slice(-500);
    }

    // Broadcast to SSE clients
    broadcastCalls();

    // Log to audit table
    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run(
      "voice-log",
      callEvent.from,
      `Call to ${callEvent.to} with status ${callEvent.status}`
    );

    // Respond with TwiML
    res.type("text/xml");
    res.send("<Response><Say>Call logged successfully</Say></Response>");
  } catch (err) {
    console.error("Voice log failed:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

// Endpoint to fetch recent calls
app.get("/api/calls/recent", (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const rows = db.prepare(
      "SELECT * FROM calls ORDER BY timestamp DESC LIMIT ?"
    ).all(limit);
    res.json({ success: true, calls: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to search calls by status
app.get("/api/calls/search", (req, res) => {
  try {
    const { status } = req.query;
    if (!status) {
      return res.status(400).json({ success: false, error: "Missing status" });
    }
    const rows = db.prepare(
      "SELECT * FROM calls WHERE status = ? ORDER BY timestamp DESC"
    ).all(status);
    res.json({ success: true, calls: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to export calls in CSV format
app.get("/api/calls/export", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM calls ORDER BY timestamp DESC").all();
    const header = "From,To,Status,Duration,Timestamp\n";
    const csv = rows.map(r =>
      `${r.from},${r.to},${r.status},${r.duration},${r.timestamp}`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.send(header + csv);
  } catch (err) {
    res.status(500).send("Export failed");
  }
});

// Second export endpoint
app.get("/export", async (req, res) => {
  try {

  } catch (err) {
    res.status(500).send("Export failed");
  }
});

// ======================================================
// Section 6: Twilio SMS Reminder System
// ======================================================

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Cron job: runs every minute to check for upcoming appointments
cron.schedule("* * * * *", () => {
  try {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    // Find appointments scheduled within the next hour that are still "booked"
    const rows = db.prepare(
      "SELECT * FROM appointments WHERE time <= ? AND status = ?"
    ).all(oneHourLater, "booked");

    for (const appt of rows) {
      if (appt.phone) {
        try {
          // Send SMS reminder
          twilioClient.messages.create({
            body: `Reminder: Appointment #${appt.id} (${appt.title}) scheduled at ${appt.time}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: appt.phone
          });

          // Log reminder in audit table
          db.prepare(
            "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
          ).run(
            "sms-reminder",
            "system",
            `Sent reminder for appointment ${appt.id} to ${appt.phone}`
          );

        } catch (err) {
          console.error("SMS failed:", err.message);
          db.prepare(
            "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
          ).run(
            "sms-error",
            "system",
            `Failed to send reminder for appointment ${appt.id}: ${err.message}`
          );
        }
      }

      // Update appointment status to "reminded"
      db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?")
        .run("reminded", new Date().toISOString(), appt.id);
    }
  } catch (err) {
    console.error("Reminder cron job failed:", err.message);
  }
});

// Endpoint to manually trigger reminders
app.post("/api/reminders/send", (req, res) => {
  try {
    const { appointmentId } = req.body;
    const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(appointmentId);

    if (!appt) {
      return res.status(404).json({ success: false, error: "Appointment not found" });
    }

    if (!appt.phone) {
      return res.status(400).json({ success: false, error: "No phone number on record" });
    }

    twilioClient.messages.create({
      body: `Manual Reminder: Appointment #${appt.id} (${appt.title}) scheduled at ${appt.time}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: appt.phone
    });

    db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?")
      .run("reminded", new Date().toISOString(), appt.id);

    res.json({ success: true, message: "Reminder sent successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to list reminded appointments
app.get("/api/reminders", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM appointments WHERE status = ? ORDER BY time ASC")
      .all("reminded");
    res.json({ success: true, reminders: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 7: Transcripts API
// ======================================================

// Fetch transcripts with filters and pagination
app.get("/api/transcripts", (req, res) => {
  try {
    const { sessionId, role, search, page = 1, limit = 50 } = req.query;
    let query = "SELECT session_id, role, content, timestamp FROM transcripts WHERE 1=1";
    const params = [];

    if (sessionId) { query += " AND session_id = ?"; params.push(sessionId); }
    if (role) { query += " AND role = ?"; params.push(role); }
    if (search) { query += " AND content LIKE ?"; params.push(`%${search}%`); }

    query += " ORDER BY timestamp ASC LIMIT ? OFFSET ?";
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const rows = db.prepare(query).all(...params);
    res.json({ success: true, transcripts: rows });
  } catch (err) {
    console.error("Transcript fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export transcripts for a given session in multiple formats
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
    console.error("Transcript export failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to delete transcripts for a session
app.delete("/api/transcripts/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    db.prepare("DELETE FROM transcripts WHERE session_id = ?").run(sessionId);

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("transcripts-delete", "admin", `Deleted transcripts for session ${sessionId}`);

    res.json({ success: true, message: "Transcripts deleted" });
  } catch (err) {
    console.error("Transcript deletion failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to tag transcripts
app.post("/api/transcripts/:sessionId/tag", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ success: false, error: "Missing tag" });
    }

    db.prepare(
      "INSERT INTO tags (tag, keywords) VALUES (?, ?)"
    ).run(tag, `session:${sessionId}`);

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("transcripts-tag", "admin", `Tagged session ${sessionId} with ${tag}`);

    res.json({ success: true, message: `Session ${sessionId} tagged with ${tag}` });
  } catch (err) {
    console.error("Transcript tagging failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 8: WebSocket Handling
// ======================================================

wss.on("connection", (ws) => {
  const sessionId = randomUUID();

  console.log(`New WebSocket connection established. Session ID: ${sessionId}`);

  let conversationHistory = [
    { role: "system", content: "You are a helpful voice agent that assists with appointments and general conversation." }
  ];

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.event) {
        case "start":
          console.log(`[${sessionId}] Media stream started`);
          break;

        case "media":
          const audioBuffer = Buffer.from(data.media.payload, "base64");
          const transcript = await transcribeAudio(audioBuffer);

          if (transcript) {
            console.log(`[${sessionId}] User said: ${transcript}`);

            // Save transcript to DB
            db.prepare(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)"
            ).run(sessionId, "user", transcript);

            conversationHistory.push({ role: "user", content: transcript });

            // Generate LLM reply
            let responseText = await generateLLMReply(conversationHistory);
            if (!responseText) {
              responseText = await handleIntent(transcript);
            }

            console.log(`[${sessionId}] Assistant replied: ${responseText}`);

            // Save assistant reply
            db.prepare(
              "INSERT INTO transcripts (session_id, role, content) VALUES (?, ?, ?)"
            ).run(sessionId, "assistant", responseText);

            conversationHistory.push({ role: "assistant", content: responseText });

            // Convert reply to audio
            const ttsAudio = await synthesizeSpeech(responseText, "roger");

            ws.send(JSON.stringify({
              event: "media",
              media: { payload: ttsAudio.toString("base64") }
            }));

            // Log to audit table
            db.prepare(
              "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
            ).run("websocket-reply", "assistant", `Session ${sessionId} reply: ${responseText}`);
          }
          break;

        case "stop":
          console.log(`[${sessionId}] Media stream stopped`);
          break;

        default:
          console.log(`[${sessionId}] Unknown event: ${data.event}`);
      }
    } catch (err) {
      console.error(`[${sessionId}] WebSocket error:`, err.message);
      db.prepare(
        "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
      ).run("websocket-error", "system", `Error in session ${sessionId}: ${err.message}`);
    }
  });

  ws.on("close", () => {
    console.log(`[${sessionId}] WebSocket disconnected`);
    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("websocket-close", "system", `Session ${sessionId} disconnected`);
  });
});
// ======================================================
// Section 9: Appointment REST API
// ======================================================

// Create a new appointment
app.post("/api/appointments", (req, res) => {
  try {
    const { title, time, phone } = req.body;
    if (!title || !time) {
      return res.status(400).json({ success: false, error: "Missing title or time" });
    }

    const stmt = db.prepare(
      "INSERT INTO appointments (title, time, status, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const result = stmt.run(title, time, "booked", phone, new Date().toISOString(), new Date().toISOString());

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointment-create", "admin", `Created appointment ${title} at ${time}`);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error("Appointment creation failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all appointments
app.get("/api/appointments", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM appointments ORDER BY time ASC").all();
    res.json({ success: true, appointments: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search appointments by title
app.get("/api/appointments/search", (req, res) => {
  try {
    const { q } = req.query;
    const rows = db.prepare("SELECT * FROM appointments WHERE title LIKE ? ORDER BY time ASC")
      .all(`%${q}%`);
    res.json({ success: true, appointments: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get appointment by ID
app.get("/api/appointments/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, appointment: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update appointment
app.put("/api/appointments/:id", (req, res) => {
  try {
    const { time, status } = req.body;
    db.prepare("UPDATE appointments SET time = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(time, status, new Date().toISOString(), req.params.id);

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointment-update", "admin", `Updated appointment ${req.params.id} to status ${status}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete appointment
app.delete("/api/appointments/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM appointments WHERE id = ?").run(req.params.id);

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointment-delete", "admin", `Deleted appointment ${req.params.id}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export appointments in CSV format
app.get("/api/appointments/export", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM appointments ORDER BY time ASC").all();
    const header = "ID,Title,Time,Status,Phone,CreatedAt,UpdatedAt\n";
    const csv = rows.map(r =>
      `${r.id},"${r.title.replace(/"/g, '""')}",${r.time},${r.status},${r.phone},${r.created_at},${r.updated_at}`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.send(header + csv);
  } catch (err) {
    res.status(500).send("Export failed");
  }
});
// ======================================================
// Section 10: Analytics & Admin Dashboard
// ======================================================

// Analytics endpoint: provides stats about calls and appointments
app.get("/api/analytics", (req, res) => {
  try {
    const totalCalls = db.prepare("SELECT COUNT(*) AS count FROM calls").get().count;
    const avgDuration = db.prepare("SELECT AVG(duration) AS avg FROM calls").get().avg || 0;
    const upcomingAppointments = db.prepare(
      "SELECT COUNT(*) AS count FROM appointments WHERE time > ? AND status = ?"
    ).get(new Date().toISOString(), "booked").count;
    const completedAppointments = db.prepare(
      "SELECT COUNT(*) AS count FROM appointments WHERE status = ?"
    ).get("completed").count;
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
    console.error("Analytics endpoint failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin overview: quick summary of system data
app.get("/api/admin/overview", (req, res) => {
  try {
    const totalTranscripts = db.prepare("SELECT COUNT(*) AS count FROM transcripts").get().count;
    const totalAppointments = db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count;
    const totalCalls = db.prepare("SELECT COUNT(*) AS count FROM calls").get().count;
    const totalAuditLogs = db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get().count;

    res.json({
      success: true,
      overview: {
        transcripts: totalTranscripts,
        appointments: totalAppointments,
        calls: totalCalls,
        auditLogs: totalAuditLogs
      }
    });
  } catch (err) {
    console.error("Admin overview failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin tags management
const tagsDictPath = "./tags.json";
let tagDictionary = fs.existsSync(tagsDictPath)
  ? JSON.parse(fs.readFileSync(tagsDictPath))
  : {};

// Get tags
app.get("/api/admin/tags", (req, res) => {
  res.json({ success: true, tags: tagDictionary });
});

// Add or update tags
app.post("/api/admin/tags", (req, res) => {
  try {
    const { tag, keywords } = req.body;
    if (!tag || !keywords) {
      return res.status(400).json({ success: false, error: "Missing tag or keywords" });
    }
    tagDictionary[tag] = keywords;
    fs.writeFileSync(tagsDictPath, JSON.stringify(tagDictionary, null, 2));

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("tags-update", "admin", `Updated tag ${tag} with keywords`);

    res.json({ success: true, tags: tagDictionary });
  } catch (err) {
    console.error("Tag update failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin settings management
const settingsPath = "./settings.json";
function loadSettings() {
  return fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath))
    : {};
}

// Get settings
app.get("/api/admin/settings", (req, res) => {
  try {
    const settings = loadSettings();
    res.json({ success: true, settings });
  } catch (err) {
    console.error("Settings fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update settings
app.put("/api/admin/settings", (req, res) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("settings-update", "admin", "Updated system settings");

    res.json({ success: true, settings: req.body });
  } catch (err) {
    console.error("Settings update failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin audit logs endpoint
app.get("/api/admin/audit-logs", (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const rows = db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
    res.json({ success: true, logs: rows });
  } catch (err) {
    console.error("Audit logs fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 11: Authentication & RBAC
// ======================================================

import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

// Middleware: verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(403).json({ success: false, error: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

// Middleware: enforce role-based access
function authorizeRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      console.warn(`RBAC violation: required role ${role}, got ${req.user?.role}`);
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    next();
  };
}

// Demo login route (replace with real user lookup in production)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "password123") {
    const user = { username, role: "admin" };
    const token = jwt.sign(user, SECRET_KEY, { expiresIn: "1h" });

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("login-success", username, "Admin logged in successfully");

    res.json({ success: true, token });
  } else {
    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("login-failure", username || "unknown", "Invalid credentials attempt");

    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

// Protected route example: admin-only
app.get("/api/admin/secure-data", authenticateToken, authorizeRole("admin"), (req, res) => {
  try {
    const sensitiveInfo = {
      systemStatus: "All services operational",
      activeUsers: 42,
      lastBackup: new Date().toISOString()
    };

    res.json({ success: true, data: sensitiveInfo });
  } catch (err) {
    console.error("Secure data fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Protected route example: user role
app.get("/api/user/profile", authenticateToken, authorizeRole("user"), (req, res) => {
  try {
    const profile = {
      username: req.user.username,
      role: req.user.role,
      lastLogin: new Date().toISOString()
    };

    res.json({ success: true, profile });
  } catch (err) {
    console.error("Profile fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 12: Server Start
// ======================================================

const PORT = process.env.PORT || 5000;

// Graceful shutdown handler
function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down server...`);
  try {
    db.close();
    console.log("Database connection closed.");
  } catch (err) {
    console.error("Error closing database:", err.message);
  }
  process.exit(0);
}

// Attach signal handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start server
server.listen(PORT, () => {
  console.log("========================================");
  console.log(`🚀 Voice Agent Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("========================================");
});
// ======================================================
// Section 13: Helper Stubs (STT, TTS, Intent, Calendar Sync)
// ======================================================

// Speech-to-Text (STT) stub
async function transcribeAudio(audioBuffer) {
  try {
    console.log("STT invoked with buffer length:", audioBuffer.length);
    return "Hello, this is a placeholder transcript.";
  } catch (err) {
    console.error("STT error:", err.message);
    return null;
  }
}

// Text-to-Speech (TTS) stub
async function synthesizeSpeech(text, voice = "roger") {
  try {
    console.log(`TTS invoked with voice=${voice}, text="${text}"`);
    return Buffer.from("dummy-audio");
  } catch (err) {
    console.error("TTS error:", err.message);
    return Buffer.from("");
  }
}

// Intent classification stub
async function handleIntent(transcript) {
  try {
    console.log("Intent handler invoked with transcript:", transcript);
    if (/appointment/i.test(transcript)) return "Would you like me to schedule an appointment?";
    if (/cancel/i.test(transcript)) return "Do you want to cancel an existing appointment?";
    return "Iâ€™m not sure what you mean, could you clarify?";
  } catch (err) {
    console.error("Intent handler error:", err.message);
    return "Sorry, I couldnâ€™t process that request.";
  }
}

// LLM reply generator stub
async function generateLLMReply(conversationHistory) {
  try {
    console.log("LLM reply generator invoked with history length:", conversationHistory.length);
    const lastUserMessage = conversationHistory.findLast(m => m.role === "user");
    if (!lastUserMessage) return "Hello, how can I assist you today?";
    return `You said: "${lastUserMessage.content}". This is a placeholder reply.`;
  } catch (err) {
    console.error("LLM reply generator error:", err.message);
    return null;
  }
}

// Calendar sync stub
async function syncCalendarEvent(appointment) {
  try {
    console.log("Calendar sync invoked for appointment:", appointment);
    return { success: true, eventId: randomUUID() };
  } catch (err) {
    console.error("Calendar sync error:", err.message);
    return { success: false, error: err.message };
  }
}
// ======================================================
// Section 14: Extended Appointment Endpoints
// ======================================================

// Filter appointments by date range
app.get("/api/appointments/filter", (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: "Missing start or end date" });
    }
    const rows = db.prepare(
      "SELECT * FROM appointments WHERE time BETWEEN ? AND ? ORDER BY time ASC"
    ).all(start, end);
    res.json({ success: true, appointments: rows });
  } catch (err) {
    console.error("Appointment filter failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk import appointments
app.post("/api/appointments/import", (req, res) => {
  try {
    const { appointments } = req.body;
    if (!Array.isArray(appointments)) {
      return res.status(400).json({ success: false, error: "Invalid format" });
    }

    const stmt = db.prepare(
      "INSERT INTO appointments (title, time, status, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const now = new Date().toISOString();
    for (const appt of appointments) {
      stmt.run(appt.title, appt.time, appt.status || "booked", appt.phone, now, now);
    }

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointments-import", "admin", `Imported ${appointments.length} appointments`);

    res.json({ success: true, count: appointments.length });
  } catch (err) {
    console.error("Appointment import failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk export appointments (JSON or CSV)
app.get("/api/appointments/export/bulk", (req, res) => {
  try {
    const { format = "json" } = req.query;
    const rows = db.prepare("SELECT * FROM appointments ORDER BY time ASC").all();

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(rows, null, 2));
    }

    if (format === "csv") {
      const header = "ID,Title,Time,Status,Phone,CreatedAt,UpdatedAt\n";
      const csv = rows.map(r =>
        `${r.id},"${r.title.replace(/"/g, '""')}",${r.time},${r.status},${r.phone},${r.created_at},${r.updated_at}`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      return res.send(header + csv);
    }

    res.status(400).json({ success: false, error: "Invalid format" });
  } catch (err) {
    console.error("Bulk export failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Recurring appointment creation
app.post("/api/appointments/recurring", (req, res) => {
  try {
    const { title, startTime, frequency, occurrences, phone } = req.body;
    if (!title || !startTime || !frequency || !occurrences) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const stmt = db.prepare(
      "INSERT INTO appointments (title, time, status, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const now = new Date().toISOString();
    let created = 0;
    let current = new Date(startTime);

    for (let i = 0; i < occurrences; i++) {
      stmt.run(title, current.toISOString(), "booked", phone, now, now);
      created++;

      // Advance current date based on frequency
      if (frequency === "daily") current.setDate(current.getDate() + 1);
      if (frequency === "weekly") current.setDate(current.getDate() + 7);
      if (frequency === "monthly") current.setMonth(current.getMonth() + 1);
    }

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointments-recurring", "admin", `Created ${created} recurring appointments`);

    res.json({ success: true, created });
  } catch (err) {
    console.error("Recurring appointment creation failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to cancel all future recurring appointments by title
app.delete("/api/appointments/recurring/cancel", (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: "Missing title" });
    }

    const result = db.prepare(
      "UPDATE appointments SET status = ? WHERE title = ? AND time > ?"
    ).run("cancelled", title, new Date().toISOString());

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("appointments-recurring-cancel", "admin", `Cancelled recurring appointments for ${title}`);

    res.json({ success: true, updated: result.changes });
  } catch (err) {
    console.error("Recurring appointment cancel failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 15: Transcript Utilities
// ======================================================

// Keyword search across transcripts
app.get("/api/transcripts/keywords", (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ success: false, error: "Missing keyword" });
    }

    const rows = db.prepare(
      "SELECT session_id, role, content, timestamp FROM transcripts WHERE content LIKE ? ORDER BY timestamp ASC"
    ).all(`%${keyword}%`);

    res.json({ success: true, keyword, results: rows });
  } catch (err) {
    console.error("Transcript keyword search failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sentiment analysis stub
app.get("/api/transcripts/sentiment/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const rows = db.prepare(
      "SELECT role, content, timestamp FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(sessionId);

    // Placeholder sentiment scoring
    const analyzed = rows.map(r => {
      let sentiment = "neutral";
      if (/happy|great|good/i.test(r.content)) sentiment = "positive";
      if (/sad|bad|angry/i.test(r.content)) sentiment = "negative";
      return { ...r, sentiment };
    });

    res.json({ success: true, sessionId, analysis: analyzed });
  } catch (err) {
    console.error("Transcript sentiment analysis failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Merge transcripts from multiple sessions
app.post("/api/transcripts/merge", (req, res) => {
  try {
    const { sessionIds, newSessionId } = req.body;
    if (!Array.isArray(sessionIds) || !newSessionId) {
      return res.status(400).json({ success: false, error: "Missing sessionIds or newSessionId" });
    }

    const merged = [];
    for (const sid of sessionIds) {
      const rows = db.prepare(
        "SELECT role, content, timestamp FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC"
      ).all(sid);
      merged.push(...rows);
    }

    const stmt = db.prepare(
      "INSERT INTO transcripts (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)"
    );
    for (const row of merged) {
      stmt.run(newSessionId, row.role, row.content, row.timestamp);
    }

    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("transcripts-merge", "admin", `Merged sessions ${sessionIds.join(", ")} into ${newSessionId}`);

    res.json({ success: true, mergedCount: merged.length });
  } catch (err) {
    console.error("Transcript merge failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Transcript word frequency analysis
app.get("/api/transcripts/frequency/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const rows = db.prepare(
      "SELECT content FROM transcripts WHERE session_id = ?"
    ).all(sessionId);

    const wordCounts = {};
    for (const row of rows) {
      const words = row.content.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (!wordCounts[w]) wordCounts[w] = 0;
        wordCounts[w]++;
      }
    }

    const sorted = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => ({ word, count }));

    res.json({ success: true, sessionId, frequency: sorted });
  } catch (err) {
    console.error("Transcript frequency analysis failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Transcript export with sentiment summary
app.get("/api/transcripts/:sessionId/summary", (req, res) => {
  try {
    const { sessionId } = req.params;
    const rows = db.prepare(
      "SELECT role, content FROM transcripts WHERE session_id = ?"
    ).all(sessionId);

    let positive = 0, negative = 0, neutral = 0;
    for (const r of rows) {
      if (/happy|great|good/i.test(r.content)) positive++;
      else if (/sad|bad|angry/i.test(r.content)) negative++;
      else neutral++;
    }

    res.json({
      success: true,
      sessionId,
      summary: { positive, negative, neutral, total: rows.length }
    });
  } catch (err) {
    console.error("Transcript summary failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 16: Analytics Deep-Dive
// ======================================================

// Daily call statistics
app.get("/api/analytics/calls/daily", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DATE(timestamp) AS day, COUNT(*) AS total, AVG(duration) AS avgDuration
      FROM calls
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `).all();

    res.json({ success: true, dailyStats: rows });
  } catch (err) {
    console.error("Daily call stats failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Call duration histogram
app.get("/api/analytics/calls/histogram", (req, res) => {
  try {
    const rows = db.prepare("SELECT duration FROM calls").all();
    const buckets = { "0-30": 0, "31-60": 0, "61-120": 0, "121-300": 0, "301+": 0 };

    for (const r of rows) {
      if (r.duration <= 30) buckets["0-30"]++;
      else if (r.duration <= 60) buckets["31-60"]++;
      else if (r.duration <= 120) buckets["61-120"]++;
      else if (r.duration <= 300) buckets["121-300"]++;
      else buckets["301+"]++;
    }

    res.json({ success: true, histogram: buckets });
  } catch (err) {
    console.error("Call histogram failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Appointment completion rates
app.get("/api/analytics/appointments/completion", (req, res) => {
  try {
    const total = db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count;
    const completed = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = ?").get("completed").count;
    const cancelled = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = ?").get("cancelled").count;
    const reminded = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = ?").get("reminded").count;

    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;
    const reminderRate = total > 0 ? (reminded / total) * 100 : 0;

    res.json({
      success: true,
      rates: {
        completionRate: completionRate.toFixed(2),
        cancellationRate: cancellationRate.toFixed(2),
        reminderRate: reminderRate.toFixed(2),
        totalAppointments: total
      }
    });
  } catch (err) {
    console.error("Appointment completion rates failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Per-day appointment stats
app.get("/api/analytics/appointments/daily", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DATE(time) AS day,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
             SUM(CASE WHEN status = 'reminded' THEN 1 ELSE 0 END) AS reminded
      FROM appointments
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `).all();

    res.json({ success: true, dailyAppointments: rows });
  } catch (err) {
    console.error("Daily appointment stats failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Transcript activity per day
app.get("/api/analytics/transcripts/daily", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DATE(timestamp) AS day,
             COUNT(*) AS total,
             SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS userMessages,
             SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS assistantMessages
      FROM transcripts
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `).all();

    res.json({ success: true, dailyTranscripts: rows });
  } catch (err) {
    console.error("Daily transcript stats failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ======================================================
// Section 17: Admin Extras
// ======================================================

// System health check
app.get("/api/admin/health", (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const dbStatus = db ? "connected" : "disconnected";

    res.json({
      success: true,
      health: {
        uptimeSeconds: uptime,
        memory: memoryUsage,
        database: dbStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("Health check failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache flush endpoint
let cache = {};
app.post("/api/admin/cache/flush", (req, res) => {
  try {
    cache = {};
    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("cache-flush", "admin", "Cache flushed successfully");

    res.json({ success: true, message: "Cache flushed" });
  } catch (err) {
    console.error("Cache flush failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Database vacuum endpoint
app.post("/api/admin/db/vacuum", (req, res) => {
  try {
    db.prepare("VACUUM").run();
    db.prepare(
      "INSERT INTO audit_logs (action, actor, details) VALUES (?, ?, ?)"
    ).run("db-vacuum", "admin", "Database vacuum executed");

    res.json({ success: true, message: "Database vacuum executed" });
  } catch (err) {
    console.error("DB vacuum failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin system info
app.get("/api/admin/system-info", (req, res) => {
  try {
    const info = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV || "development"
    };
    res.json({ success: true, system: info });
  } catch (err) {
    console.error("System info fetch failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Second export endpoint: export all calls in JSON or CSV format
app.get("/export", (req, res) => {
  try {
    const { format = "json" } = req.query;
    const rows = db.prepare("SELECT * FROM calls ORDER BY timestamp DESC").all();

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(rows, null, 2));
    }

    if (format === "csv") {
      const header = "From,To,Status,Duration,Timestamp\n";
      const csv = rows.map(r =>
        `${r.from},${r.to},${r.status},${r.duration},${r.timestamp}`
      ).join("\n");
      res.setHeader("Content-Type", "text/csv");
      return res.send(header + csv);
    }

    res.status(400).json({ success: false, error: "Invalid format" });
  } catch (err) {
    console.error("Export failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
