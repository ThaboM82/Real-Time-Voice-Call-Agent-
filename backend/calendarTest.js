// backend/calendarTest.js
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function insertTestEvent() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  // Set up OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'http://localhost:5000/oauth2callback' // redirect URI from your client_secret.json
  );

  // Use the refresh token
  oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  // Initialize Calendar API
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // Create a test event
  const event = {
    summary: 'Voice Agent Test Event',
    description: 'Created via Node.js + OAuth2',
    start: {
      dateTime: '2026-06-18T10:00:00+02:00', // Adjust to your timezone
      timeZone: 'Africa/Johannesburg',
    },
    end: {
      dateTime: '2026-06-18T11:00:00+02:00',
      timeZone: 'Africa/Johannesburg',
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    console.log('Event created: %s', response.data.htmlLink);
  } catch (err) {
    console.error('Error creating event:', err);
  }
}

insertTestEvent();
