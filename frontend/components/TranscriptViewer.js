import { useEffect, useState } from "react";

export default function TranscriptViewer() {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTranscripts() {
      try {
        const res = await fetch("/api/transcripts"); // backend route
        const data = await res.json();
        setTranscripts(data);
      } catch (err) {
        console.error("Failed to fetch transcripts:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTranscripts();
  }, []);

  if (loading) {
    return <p>Loading transcripts…</p>;
  }

  if (transcripts.length === 0) {
    return <p>No transcripts available.</p>;
  }

  return (
    <div>
      <h2>Transcript Viewer</h2>
      <ul>
        {transcripts.map((t, idx) => (
          <li key={idx}>
            <strong>{t.caller}</strong>: {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
