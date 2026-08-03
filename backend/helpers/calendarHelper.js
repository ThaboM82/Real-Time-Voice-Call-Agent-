import { google } from 'googleapis';
import dotenv from 'dotenv';
import * as chrono from 'chrono-node';

dotenv.config();

function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'http://localhost:5000/oauth2callback'
  );

  oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

const calendar = google.calendar({ version: 'v3', auth: getOAuthClient() });

/**
 * Parse natural language into ISO start/end times
 * @param {string} text - e.g. "tomorrow at 3 PM for 2 hours"
 * @returns { startISO, endISO }
 */
export function parseNaturalTime(text) {
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (results.length === 0) throw new Error("Could not parse time from input");

  const startDate = results[0].start.date();
  let endDate;

  if (results[0].end) {
    endDate = results[0].end.date();
  } else {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 hour
  }

  return {
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
  };
}

/**
 * Create a calendar event
 */
export async function createEvent(summary, description, startDateTime, endDateTime) {
  const event = {
    summary,
    description,
    start: { dateTime: startDateTime, timeZone: 'Africa/Johannesburg' },
    end: { dateTime: endDateTime, timeZone: 'Africa/Johannesburg' },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return response.data;
}

/**
 * Reschedule an existing event
 */
export async function rescheduleEvent(eventId, newStartISO, newEndISO) {
  const response = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    resource: {
      start: { dateTime: newStartISO, timeZone: 'Africa/Johannesburg' },
      end: { dateTime: newEndISO, timeZone: 'Africa/Johannesburg' },
    },
  });

  return response.data;
}

/**
 * Cancel (delete) an event
 */
export async function cancelEvent(eventId) {
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
  return { success: true, message: `Event ${eventId} cancelled.` };
}

/**
 * List upcoming events
 */
export async function listUpcomingEvents(maxResults = 5) {
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    link: event.htmlLink,
  }));
}

/**
 * List events filtered by natural language phrase
 */
export async function listEventsByPhrase(phrase, maxResults = 5) {
  const { startISO, endISO } = parseNaturalTime(phrase);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startISO,
    timeMax: endISO,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    link: event.htmlLink,
  }));
}

/**
 * Format events into spoken sentences for Twilio <Say>
 */
export function formatEventsForSpeech(events) {
  if (!events || events.length === 0) {
    return "You have no upcoming events.";
  }

  let speech = "Here are your next " + events.length + " events. ";
  events.forEach((event, i) => {
    const start = new Date(event.start);
    const options = { weekday: 'long', hour: 'numeric', minute: 'numeric' };
    const formattedTime = start.toLocaleString('en-ZA', options);

    speech += `Event ${i + 1}: ${event.summary} on ${formattedTime}. `;
  });

  return speech.trim();
}
