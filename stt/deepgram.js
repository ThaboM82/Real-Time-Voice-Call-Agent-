// backend/stt/deepgram.js
require('dotenv').config();
const { Deepgram } = require('@deepgram/sdk');

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
const deepgram = new Deepgram(deepgramApiKey);

// Connect Twilio audio stream to Deepgram
function connectDeepgram(wsConnection) {
  const dgSocket = deepgram.transcription.live({
    punctuate: true,
    interim_results: true,
  });

  dgSocket.addListener('open', () => {
    console.log('✅ Deepgram connection opened');
  });

  dgSocket.addListener('transcriptReceived', transcript => {
    const text = transcript.channel.alternatives[0].transcript;
    if (text) console.log('📝 Transcript:', text);
  });

  dgSocket.addListener('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  dgSocket.addListener('close', () => {
    console.log('🔒 Deepgram connection closed');
  });

  // Pipe Twilio audio into Deepgram
  wsConnection.on('message', msg => {
    dgSocket.send(msg);
  });

  wsConnection.on('close', () => {
    dgSocket.finish();
  });
}

module.exports = { connectDeepgram };
