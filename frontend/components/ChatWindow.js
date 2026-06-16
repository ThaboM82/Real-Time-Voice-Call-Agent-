"use client";
import React, { useState, useEffect, useRef } from "react";
import { speak, getTranscripts, saveSettings, loadSettings } from "../services/api";
import AudioPlayer from "./AudioPlayer";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function ChatWindow() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("roger");
  const [audio, setAudio] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("newest");
  const [tag, setTag] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [totalTranscripts, setTotalTranscripts] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showFullDateTime, setShowFullDateTime] = useState(true);
  const [entriesPerPage, setEntriesPerPage] = useState(5);

  const transcriptEndRef = useRef(null);

  // ✅ Load settings on mount
  useEffect(() => {
    async function fetchSettings() {
      const settings = await loadSettings();
      if (settings.defaultVoice) setVoice(settings.defaultVoice);
      if (settings.entriesPerPage) setEntriesPerPage(settings.entriesPerPage);
      if (settings.showFullDateTime !== undefined) {
        setShowFullDateTime(settings.showFullDateTime);
      }
    }
    fetchSettings();
  }, []);

  // ✅ Save settings whenever preferences change
  useEffect(() => {
    saveSettings({
      defaultVoice: voice,
      entriesPerPage,
      showFullDateTime,
    });
  }, [voice, entriesPerPage, showFullDateTime]);

  function formatDateTime(date) {
    if (showFullDateTime) {
      return date.toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } else {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
  }

  // ✅ Load transcripts whenever page or sort changes
  useEffect(() => {
    async function loadTranscriptsData() {
      try {
        const { transcripts, total } = await getTranscripts(
          currentPage,
          entriesPerPage,
          sortOrder
        );
        setTranscript(transcripts);
        setTotalTranscripts(total);
        setLastUpdated(formatDateTime(new Date()));
      } catch (err) {
        console.error("Error loading transcripts:", err);
      }
    }
    loadTranscriptsData();
  }, [currentPage, sortOrder, entriesPerPage, showFullDateTime]);

  // ✅ Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { transcripts, total } = await getTranscripts(
          currentPage,
          entriesPerPage,
          sortOrder
        );
        setTranscript(transcripts);
        setTotalTranscripts(total);
        setLastUpdated(formatDateTime(new Date()));
      } catch (err) {
        console.error("Error auto-refreshing transcripts:", err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage, sortOrder, entriesPerPage, showFullDateTime]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  async function handleSpeak() {
    if (!text.trim()) return;
    try {
      const blob = await speak(text, voice);
      setAudio(URL.createObjectURL(blob));
      setTranscript((prev) => [
        ...prev,
        {
          text,
          voice,
          tag: tag || "General",
          timestamp: formatDateTime(new Date()),
        },
      ]);
      setText("");
      setTag("");
    } catch (err) {
      console.error("Error speaking:", err);
    }
  }

  function clearTranscript() {
    setTranscript([]);
    setCurrentPage(1);
  }

  function exportTranscriptTxt() {
    const content = transcript
      .map(
        (entry) =>
          `${entry.timestamp} - ${entry.voice} [${entry.tag}]: ${entry.text}`
      )
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transcript.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTranscriptCsv() {
    const headers = ["Timestamp", "Voice", "Tag", "Text"];
    const rows = transcript.map((entry) => [
      entry.timestamp,
      entry.voice,
      entry.tag,
      `"${entry.text.replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transcript.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Analytics calculations
  const voiceCounts = transcript.reduce((acc, e) => {
    acc[e.voice] = (acc[e.voice] || 0) + 1;
    return acc;
  }, {});
  const tagCounts = transcript.reduce((acc, e) => {
    acc[e.tag] = (acc[e.tag] || 0) + 1;
    return acc;
  }, {});
  const wordCounts = transcript
    .flatMap((e) => e.text.split(/\s+/))
    .reduce((acc, w) => {
      const word = w.toLowerCase();
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Chart data
  const voiceData = {
    labels: Object.keys(voiceCounts),
    datasets: [
      {
        label: "Voice Usage",
        data: Object.values(voiceCounts),
        backgroundColor: "rgba(75,192,192,0.6)",
      },
    ],
  };
  const tagData = {
    labels: Object.keys(tagCounts),
    datasets: [
      {
        label: "Tag Usage",
        data: Object.values(tagCounts),
        backgroundColor: "rgba(153,102,255,0.6)",
      },
    ],
  };
  const wordData = {
    labels: topWords.map(([w]) => w),
    datasets: [
      {
        label: "Top Words",
        data: topWords.map(([_, c]) => c),
        backgroundColor: "rgba(255,159,64,0.6)",
      },
    ],
  };

  const totalPages = Math.ceil(totalTranscripts / entriesPerPage);

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2>Chat Window</h2>
      {/* Input area */}
      <textarea
        rows="3"
        cols="40"
        placeholder="Type something to speak..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <br />
      <label style={{ marginRight: "1rem" }}>
        Choose voice:
        <select value={voice} onChange={(e) => setVoice(e.target.value)}>
          <option value="roger">Roger</option>
          <option value="brian">Brian</option>
          <option value="daniel">Daniel</option>
        </select>
      </label>
      <label style={{ marginLeft: "1rem" }}>
        Tag:
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          style={{ marginLeft: "0.5rem" }}
        >
          <option value="">Custom...</option>
          <option value="Meeting">Meeting</option>
          <option value="Reminder">Reminder</option>
          <option value="Idea">Idea</option>
          <option value="Note">Note</option>
        </select>
      </label>
      {tag === "" && (
        <input
          type="text"
          placeholder="Custom tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          style={{ marginLeft: "0.5rem" }}
        />
      )}
            {showAnalytics && (
        <div style={{ marginTop: "2rem" }}>
          <h3>Analytics Dashboard</h3>
          <div style={{ maxWidth: "600px", marginBottom: "2rem" }}>
            <Bar
              data={voiceData}
              options={{ responsive: true }}
              ref={(chart) => (window.voiceChart = chart)}
            />
            <button
              style={{ marginTop: "0.5rem" }}
              onClick={() => {
                const url = window.voiceChart.toBase64Image();
                const link = document.createElement("a");
                link.href = url;
                link.download = "voice-analytics.png";
                link.click();
              }}
            >
              Download Voice Analytics
            </button>
          </div>
          <div style={{ maxWidth: "600px", marginBottom: "2rem" }}>
            <Bar
              data={tagData}
              options={{ responsive: true }}
              ref={(chart) => (window.tagChart = chart)}
            />
            <button
              style={{ marginTop: "0.5rem" }}
              onClick={() => {
                const url = window.tagChart.toBase64Image();
                const link = document.createElement("a");
                link.href = url;
                link.download = "tag-analytics.png";
                link.click();
              }}
            >
              Download Tag Analytics
            </button>
          </div>
          <div style={{ maxWidth: "600px", marginBottom: "2rem" }}>
            <Bar
              data={wordData}
              options={{ responsive: true }}
              ref={(chart) => (window.wordChart = chart)}
            />
            <button
              style={{ marginTop: "0.5rem" }}
              onClick={() => {
                const url = window.wordChart.toBase64Image();
                const link = document.createElement("a");
                link.href = url;
                link.download = "word-analytics.png";
                link.click();
              }}
            >
              Download Word Analytics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
