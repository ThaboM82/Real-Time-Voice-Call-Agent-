// frontend/services/api.js

/**
 * Send text to backend for speech synthesis.
 * @param {string} text - The text to speak.
 * @param {string} voice - Voice key (roger, brian, daniel).
 * @returns {Promise<Blob>} - Audio blob returned from backend.
 */
export async function speak(text, voice) {
  try {
    const resp = await fetch("/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceKey: voice }),
    });

    if (!resp.ok) {
      throw new Error(`Speak request failed: ${resp.status} ${resp.statusText}`);
    }

    return await resp.blob();
  } catch (err) {
    console.error("Error in speak():", err);
    throw err;
  }
}

/**
 * Fetch transcripts from backend with pagination and sorting.
 * @param {number} page - Page number (default 1).
 * @param {number} limit - Number of transcripts per page (default 10).
 * @param {string} sort - Sort order: "newest", "oldest", "voice".
 * @returns {Promise<{transcripts: Array, total: number}>}
 */
export async function getTranscripts(page = 1, limit = 10, sort = "newest") {
  try {
    const resp = await fetch(`/api/transcripts?page=${page}&limit=${limit}&sort=${sort}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch transcripts: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
  } catch (err) {
    console.error("Error in getTranscripts():", err);
    return { transcripts: [], total: 0 };
  }
}

/**
 * Save user settings to backend.
 * @param {object} settings - Settings object (e.g. { showFullDateTime: true, defaultVoice: "roger", entriesPerPage: 5 }).
 * @returns {Promise<object>}
 */
export async function saveSettings(settings) {
  try {
    const resp = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return await resp.json();
  } catch (err) {
    console.error("Error saving settings:", err);
    return { success: false };
  }
}

/**
 * Load user settings from backend.
 * @returns {Promise<object>}
 */
export async function loadSettings() {
  try {
    const resp = await fetch("/api/settings");
    if (!resp.ok) {
      throw new Error(`Failed to load settings: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
  } catch (err) {
    console.error("Error loading settings:", err);
    return {};
  }
}
