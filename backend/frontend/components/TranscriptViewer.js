import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function TranscriptViewer() {
  const [transcripts, setTranscripts] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");

  useEffect(() => {
    fetch("/api/transcripts")
      .then((res) => res.json())
      .then((data) => {
        // Add empty tags array to each transcript file
        const tagged = data.map((t) => ({ ...t, tags: [] }));
        setTranscripts(tagged);
      })
      .catch((err) => console.error("❌ Error loading transcripts:", err));
  }, []);

  const filtered = transcripts.filter((t) => {
    const matchesSearch = t.transcripts.some((line) =>
      line.text.toLowerCase().includes(search.toLowerCase())
    );
    const matchesTag = activeTag ? t.tags.includes(activeTag) : true;
    return matchesSearch && matchesTag;
  });

  const getWordFrequency = (t) => {
    const freq = {};
    t.transcripts.forEach((line) => {
      line.text.split(/\s+/).forEach((word) => {
        const w = word.toLowerCase();
        if (!w) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  const getDuration = (t) => {
    if (!t.metadata.startTime || !t.metadata.endTime) return "N/A";
    const start = new Date(t.metadata.startTime);
    const end = new Date(t.metadata.endTime);
    const seconds = Math.floor((end - start) / 1000);
    return `${seconds} seconds`;
  };

  const addTag = (t, tag) => {
    t.tags.push(tag);
    setTranscripts([...transcripts]);
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>📊 Transcript Viewer Dashboard</h2>
      <input
        type="text"
        placeholder="Search transcripts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "1rem", width: "100%" }}
      />

      <div style={{ marginBottom: "1rem" }}>
        <strong>Filter by Tag:</strong>
        <button onClick={() => setActiveTag("")}>All</button>
        <button onClick={() => setActiveTag("appointment")}>Appointment</button>
        <button onClick={() => setActiveTag("error")}>Error</button>
        <button onClick={() => setActiveTag("greeting")}>Greeting</button>
      </div>

      {filtered.map((t, idx) => {
        const wordFreq = getWordFrequency(t);
        const barData = {
          labels: wordFreq.map(([w]) => w),
          datasets: [
            {
              label: "Word Frequency",
              data: wordFreq.map(([, c]) => c),
              backgroundColor: "rgba(75, 192, 192, 0.6)",
            },
          ],
        };

        const lineData = {
          labels: t.transcripts.map((line) => line.timestamp),
          datasets: [
            {
              label: "Transcript Timeline",
              data: t.transcripts.map((_, i) => i + 1),
              borderColor: "rgba(153, 102, 255, 0.8)",
              fill: false,
            },
          ],
        };

        return (
          <div key={idx} style={{ marginBottom: "3rem" }}>
            <h3>
              🗂️ File: {t.metadata.startTime} — {t.metadata.status}
            </h3>
            <p>⏱️ Duration: {getDuration(t)}</p>

            <div style={{ marginBottom: "1rem" }}>
              <strong>Tags:</strong> {t.tags.join(", ") || "None"}
              <button onClick={() => addTag(t, "appointment")}>+ Appointment</button>
              <button onClick={() => addTag(t, "error")}>+ Error</button>
              <button onClick={() => addTag(t, "greeting")}>+ Greeting</button>
            </div>

            <div style={{ display: "flex", gap: "2rem", marginBottom: "2rem" }}>
              <div style={{ width: "45%" }}>
                <Bar data={barData} />
              </div>
              <div style={{ width: "45%" }}>
                <Line data={lineData} />
              </div>
            </div>

            <table border="1" cellPadding="5" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Transcript</th>
                </tr>
              </thead>
              <tbody>
                {t.transcripts.map((line, i) => (
                  <tr key={i}>
                    <td>{line.timestamp}</td>
                    <td>{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
