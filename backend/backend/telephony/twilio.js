// backend/telephony/twilio.js

require('dotenv').config();
const twilio = require('twilio');

// Validate environment variables early
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  throw new Error("Missing Twilio environment variables. Check .env file.");
}

const client = twilio(accountSid, authToken);

// Place an outbound call
async function makeCall(toNumber) {
  try {
    const call = await client.calls.create({
      url: 'http://demo.twilio.com/docs/voice.xml', // Twilio demo XML for testing
      to: toNumber,
      from: fromNumber
    });
    console.log("✅ Call initiated:", call.sid);
    return call.sid;
  } catch (err) {
    console.error("❌ Error making call:", err.message);
    throw err;
  }
}

module.exports = { makeCall };
