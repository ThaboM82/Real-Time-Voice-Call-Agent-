"use client";
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
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function TranscriptViewer() {
  const [transcripts, setTranscripts] = useState([]);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [confirmModal, setConfirmModal] = useState({ open: false, transcript: null, tag: "" });

  useEffect(() => {
    fetch("/api/transcripts")
      .then((res) => res.json())
      .then((data) => {
        const tagged = data.map((t) => ({ ...t, tags: [] }));
        setTranscripts(tagged);
      })
      .catch((err) => console.error("❌ Error loading transcripts:", err));
  }, []);

  const filtered = transcripts.filter((t) => {
    const matchesSearch = t.transcripts?.some((line) =>
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
    const updated = transcripts.map((item) =>
      item === t ? { ...item, tags: [...item.tags, tag] } : item
    );
    setTranscripts(updated);
  };

  const confirmRemoveTag = (t, tag) => {
    setConfirmModal({ open: true, transcript: t, tag });
  };

  const removeTag = () => {
    const { transcript, tag } = confirmModal;
    const updated = transcripts.map((item) =>
      item === transcript ? { ...item, tags: item.tags.filter((tg) => tg !== tag) } : item
    );
    setTranscripts(updated);
    setConfirmModal({ open: false, transcript: null, tag: "" });
  };

  const tagBadgeClass = (tag) => {
    switch (tag) {
      case "appointment":
        return "bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1";
      case "error":
        return "bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1";
      case "greeting":
        return "bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1";
      default:
        return "bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1";
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">📊 Transcript Viewer Dashboard</h2>
      <input
        type="text"
        placeholder="Search transcripts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full border rounded px-3 py-2"
      />

      <div className="mb-4 space-x-2">
        <strong>Filter by Tag:</strong>
        <button onClick={() => setActiveTag("")} className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">
          All
        </button>
        <button onClick={() => setActiveTag("appointment")} className="px-2 py-1 bg-blue-100 rounded hover:bg-blue-200">
          Appointment
        </button>
        <button onClick={() => setActiveTag("error")} className="px-2 py-1 bg-red-100 rounded hover:bg-red-200">
          Error
        </button>
        <button onClick={() => setActiveTag("greeting")} className="px-2 py-1 bg-green-100 rounded hover:bg-green-200">
          Greeting
        </button>
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
          <div key={idx} className="mb-12">
            <h3 className="text-lg font-semibold">
              🗂️ File: {t.metadata.startTime} — {t.metadata.status}
            </h3>
            <p className="text-sm text-gray-600">⏱️ Duration: {getDuration(t)}</p>

            <div className="mb-4 space-x-2">
              <strong>Tags:</strong>
              {t.tags.length > 0 ? (
                t.tags.map((tag, i) => (
                  <span key={i} className={tagBadgeClass(tag)}>
                    {tag}
                    <button
                      onClick={() => confirmRemoveTag(t, tag)}
                      title="Click ✖ to remove"
                      className="ml-1 text-xs font-bold hover:text-black"
                    >
                      ✖
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-gray-500">None</span>
              )}
              <button onClick={() => addTag(t, "appointment")} className="ml-2 px-2 py-1 bg-blue-100 rounded hover:bg-blue-200">
                + Appointment
              </button>
              <button onClick={() => addTag(t, "error")} className="px-2 py-1 bg-red-100 rounded hover:bg-red-200">
                + Error
              </button>
              <button onClick={() => addTag(t, "greeting")} className="px-2 py-1 bg-green-100 rounded hover:bg-green-200">
                + Greeting
              </button>
            </div>

            <div className="flex gap-8 mb-8">
              <div className="w-1/2">
                <Bar data={barData} />
              </div>
              <div className="w-1/2">
                <Line data={lineData} />
              </div>
            </div>

            <table className="w-full border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1">Timestamp</th>
                  <th className="border px-2 py-1">Transcript</th>
                </tr>
              </thead>
              <tbody>
                {t.transcripts.map((line, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="border px-2 py-1">{line.timestamp}</td>
                    <td className="border px-2 py-1">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

                    {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h4 className="text-lg font-semibold mb-4">Confirm Removal</h4>
            <p className="text-sm mb-4">
              Are you sure you want to remove the tag{" "}
              <span className="font-bold">{confirmModal.tag}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() =>
                  setConfirmModal({ open: false, transcript: null, tag: "" })
                }
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={removeTag}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
