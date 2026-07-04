import NavBar from "../../components/NavBar";
import { useEffect, useState } from "react";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
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
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function AnalyticsPage() {
  const [transcripts, setTranscripts] = useState([]);
  const [viewMode, setViewMode] = useState("weekly"); // toggle: weekly/monthly for stacked bar
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    fetch("/api/transcripts")
      .then((res) => res.json())
      .then((data) => setTranscripts(data))
      .catch((err) => console.error("❌ Error loading transcripts:", err));
  }, []);

  // Word frequency across all transcripts
  const getGlobalWordFrequency = () => {
    const freq = {};
    transcripts.forEach((t) => {
      t.transcripts.forEach((line) => {
        line.text.split(/\s+/).forEach((word) => {
          const w = word.toLowerCase();
          if (!w) return;
          freq[w] = (freq[w] || 0) + 1;
        });
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  };

  // Tag distribution
  const getTagDistribution = () => {
    const tagCounts = {};
    transcripts.forEach((t) => {
      (t.tags || []).forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    return tagCounts;
  };

  // Transcript volume grouped by week/month per tag
  const getTranscriptVolumeByTag = (mode, tag) => {
    const volume = {};
    transcripts.forEach((t) => {
      if (!t.metadata?.startTime) return;
      if (tag && !(t.tags || []).includes(tag)) return;

      const date = new Date(t.metadata.startTime);

      let key;
      if (mode === "weekly") {
        key = `${date.getFullYear()}-W${Math.ceil(
          (date.getDate() - date.getDay() + 1) / 7
        )}`;
      } else if (mode === "monthly") {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
      }

      volume[key] = (volume[key] || 0) + 1;
    });
    return volume;
  };

  const wordFreq = getGlobalWordFrequency();
  const tagDist = getTagDistribution();

  const colors = [
    "rgba(255, 99, 132, 0.8)",
    "rgba(54, 162, 235, 0.8)",
    "rgba(255, 206, 86, 0.8)",
    "rgba(75, 192, 192, 0.8)",
    "rgba(153, 102, 255, 0.8)",
    "rgba(255, 159, 64, 0.8)",
  ];

  // Build stacked bar datasets per tag
  const stackedDatasets = Object.keys(tagDist).map((tag, idx) => {
    const volume = getTranscriptVolumeByTag(viewMode, tag);
    return {
      label: tag,
      data: Object.values(volume),
      backgroundColor: colors[idx % colors.length],
    };
  });

  const stackedLabels = Object.keys(
    getTranscriptVolumeByTag(viewMode, Object.keys(tagDist)[0])
  );

  const stackedBarData = {
    labels: stackedLabels,
    datasets: stackedDatasets,
  };

  const stackedBarOptions = {
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
    },
    responsive: true,
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
      },
    },
  };

  const barData = {
    labels: wordFreq.map(([w]) => w),
    datasets: [
      {
        label: "Top Words Across All Transcripts",
        data: wordFreq.map(([, c]) => c),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
      },
    ],
  };

  const pieData = {
    labels: Object.keys(tagDist),
    datasets: [
      {
        label: "Tag Distribution",
        data: Object.values(tagDist),
        backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"],
      },
    ],
  };

  return (
    <main style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <NavBar />
      <h1>📊 Analytics Dashboard</h1>
      <p>Overview of transcript trends and tag usage.</p>

      <div style={{ display: "flex", gap: "2rem", marginTop: "2rem" }}>
        <div style={{ width: "50%" }}>
          <Bar data={barData} />
        </div>
        <div style={{ width: "50%" }}>
          <Pie data={pieData} />
        </div>
      </div>

      <div style={{ marginTop: "3rem" }}>
        <h2>Stacked Bar Chart ({viewMode})</h2>
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            gap: "1rem",
          }}
        >
          {["weekly", "monthly"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                backgroundColor: viewMode === mode ? "#1e1e1e" : "#f9f9f9",
                color: viewMode === mode ? "#fff" : "#333",
                cursor: "pointer",
                fontWeight: viewMode === mode ? "bold" : "normal",
                transition: "all 0.2s ease",
              }}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <Bar data={stackedBarData} options={stackedBarOptions} />
      </div>
    </main>
  );
}
