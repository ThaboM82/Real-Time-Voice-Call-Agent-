const fetch = require("node-fetch");

async function speakText(text, voiceId, apiKey) {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);
    return await response.buffer();
  } catch (err) {
    console.error("? TTS error:", err.message);
    return null;
  }
}

module.exports = { speakText };
