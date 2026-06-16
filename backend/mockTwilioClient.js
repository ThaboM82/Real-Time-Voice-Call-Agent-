const WebSocket = require("ws");
const fs = require("fs");

// Connect to your backend WebSocket endpoint
const ws = new WebSocket("ws://localhost:5000/twilio-stream");

ws.on("open", () => {
  console.log("✅ Connected to backend WebSocket");

  // Load the µ-law audio file you generated earlier
  const audio = fs.readFileSync("sample.ulaw");

  // Split into 320-byte chunks (≈20ms of audio at 8kHz µ-law)
  const chunkSize = 320;
  let offset = 0;

  const interval = setInterval(() => {
    if (offset >= audio.length) {
      clearInterval(interval);
      console.log("🎙️ Finished sending audio");
      ws.close();
      return;
    }

    const chunk = audio.slice(offset, offset + chunkSize);
    offset += chunkSize;

    // Simulate Twilio's media message format
    const message = {
      event: "media",
      streamSid: "TestStream123",
      media: {
        payload: chunk.toString("base64"),
      },
    };

    ws.send(JSON.stringify(message));
    console.log("📤 Sent audio chunk");
  }, 20); // send every 20ms
});

ws.on("message", (data) => {
  console.log("📩 Received from backend:", data.toString());
});

ws.on("close", () => {
  console.log("❌ Connection closed");
});

ws.on("error", (err) => {
  console.error("⚠️ WebSocket error:", err);
});
