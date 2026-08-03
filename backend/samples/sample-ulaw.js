const fs = require("fs");
const mulaw = require("mulaw-js");

// Generate 1 second of silence (PCM16 at 8kHz)
const samples = new Int16Array(8000).fill(0);

// Encode to µ-law
const ulawBuffer = Buffer.from(mulaw.encode(samples));

// Save to file
fs.writeFileSync("sample.ulaw", ulawBuffer);
console.log("? sample.ulaw created");
