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

// ✅ Settings routes
const settingsPath = path.join(__dirname, "settings.json");

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
