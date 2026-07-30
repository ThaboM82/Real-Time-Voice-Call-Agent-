const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

/**
 * Start a persistent Deepgram STT stream
 * @param {WebSocket} clientWs - Twilio WebSocket connection
 * @param {string} apiKey - Deepgram API key
 */
function startSTTStream(clientWs, apiKey) {
  if (!apiKey) {
    console.error("❌ Deepgram API key missing");
    return;
  }

  // Create transcript log directory
  const logDir = path.join(__dirname, "data", "transcripts");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Create JSON transcript file with metadata
  const logFile = path.join(logDir, `transcript-${Date.now()}.json`);
  const transcriptData = {
    metadata: {
      startTime: new Date().toISOString(),
      callerId: "TestStream123", // replace with Twilio caller info if available
      status: "active",
    },
    transcripts: [],
  };
  fs.writeFileSync(logFile, JSON.stringify(transcriptData, null, 2));

  // Connect once per Twilio call
  const dgWs = new WebSocket(
    "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000",
    {
      headers: { Authorization: `Token ${apiKey}` },
    }
  );

  dgWs.on("open", () => {
    console.log("✅ Connected to Deepgram STT");
  });

  dgWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.channel?.alternatives?.[0]) {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript && transcript.length > 0) {
          console.log("📝 Transcript:", transcript);

          // Append transcript line to JSON file
          transcriptData.transcripts.push({
            timestamp: new Date().toISOString(),
            text: transcript,
          });
          fs.writeFileSync(logFile, JSON.stringify(transcriptData, null, 2));

          // Optionally send transcript back to Twilio client
          clientWs.send(JSON.stringify({ event: "transcript", text: transcript }));
        }
      }
    } catch (err) {
      console.error("❌ Error parsing Deepgram message:", err.message);
    }
  });

  dgWs.on("close", () => {
    console.log("❌ Deepgram STT connection closed");
    transcriptData.metadata.status = "ended";
    transcriptData.metadata.endTime = new Date().toISOString();
    fs.writeFileSync(logFile, JSON.stringify(transcriptData, null, 2));
  });

  dgWs.on("error", (err) => {
    console.error("⚠️ Deepgram STT error:", err.message);
  });

  // Return a function to push audio chunks
  return (payload) => {
    if (dgWs.readyState === WebSocket.OPEN) {
      const audioBuffer = Buffer.from(payload, "base64");
      dgWs.send(audioBuffer);
    }
  };
}

module.exports = { startSTTStream };
