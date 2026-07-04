"use client";

import React, { useEffect, useState, useRef } from "react";
import NavBar from "../../components/NavBar";
import { Line, Pie, Bar } from "react-chartjs-2";
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
import JSZip from "jszip";
import { saveAs } from "file-saver";

// Register chart.js components
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
  // State
  const [metrics, setMetrics] = useState([]);
  const [calls, setCalls] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  const [transcripts, setTranscripts] = useState([]);
  const [viewMode, setViewMode] = useState("weekly"); // toggle weekly/monthly
  const [selectedTags, setSelectedTags] = useState([]);

  // Chart refs
  const lineChartRef = useRef(null);
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const stackedChartRef = useRef(null);

  // SSE connection to backend
  useEffect(() => {
    setLoading(true);
    const source = new EventSource(`/api/calls/stream?days=${days}`);

    source.onmessage = (event) => {
      try {
        const callsData = JSON.parse(event.data);
        setCalls(callsData);

        const totalCalls = callsData.length;
        const avgDuration =
          callsData.reduce((sum, c) => sum + c.duration, 0) / (totalCalls || 1);
        const successRate =
          (callsData.filter((c) => c.status === "success").length /
            (totalCalls || 1)) *
          100;

        setMetrics([
          { label: "Total Calls", value: totalCalls },
          {
            label: "Average Duration",
            value: `${Math.round(avgDuration / 60)}m ${Math.round(
              avgDuration % 60
            )}s`,
          },
          { label: "Success Rate", value: `${Math.round(successRate)}%` },
        ]);

        setLastUpdated(new Date().toLocaleString());
        setLoading(false);
      } catch (err) {
        console.error("❌ SSE parse error:", err);
      }
    };

    source.onerror = (err) => {
      console.error("❌ SSE connection error:", err);
      source.close();
      setLoading(false);
    };

    return () => {
      source.close();
    };
  }, [days]);

  // Fetch transcripts for tag/word analytics
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
    "#FF6384",
    "#36A2EB",
    "#FFCE56",
    "#4BC0C0",
    "#9966FF",
    "#FF9F40",
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
    getTranscriptVolumeByTag(viewMode, Object.keys(tagDist)[0] || "")
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
      x: { stacked: true },
      y: { stacked: true },
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
        backgroundColor: colors,
      },
    ],
  };

  // Call charts
  const lineData = {
    labels: calls.map((c) =>
      new Date(c.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    ),
    datasets: [
      {
        label: "Duration (s)",
        data: calls.map((c) => c.duration),
        borderColor: "blue",
        backgroundColor: "rgba(54, 162, 235, 0.2)",
      },
    ],
  };

  const successCount = calls.filter((c) => c.status === "success").length;
  const failCount = calls.length - successCount;

  const callPieData = {
    labels: ["Success", "Failed"],
    datasets: [
      {
        data: [successCount, failCount],
        backgroundColor: ["green", "red"],
      },
    ],
  };

  const hourlyCounts = Array.from({ length: 24 }, (_, h) =>
    calls.filter((c) => new Date(c.timestamp).getHours() === h).length
  );

  const hourlyBarData = {
    labels: Array.from({ length: 24 }, (_, h) => `${h}:00`),
    datasets: [
      {
        label: "Calls per Hour",
        data: hourlyCounts,
        backgroundColor: "orange",
      },
    ],
  };

  const trendData = lineData;

  // Helper: download all charts zipped
  const downloadAllCharts = () => {
    const zip = new JSZip();
    const charts = [
      { ref: lineChartRef, filename: "call-durations.png" },
      { ref: pieChartRef, filename: "success-vs-failed.png" },
      { ref: barChartRef, filename: "hourly-calls.png" },
      { ref: trendChartRef, filename: "daily-trend.png" },
      { ref: stackedChartRef, filename: "calls-per-caller.png" },
    ];

    charts.forEach(({ ref, filename }) => {
      if (ref.current) {
        const imgData = ref.current.toBase64Image().split(",")[1];
        zip.file(filename, imgData, { base64: true });
      }
    });

        zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "analytics-charts.zip");
    });
  };

  return (
    <main className={`${darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"} relative p-6 min-h-screen`}>
      <NavBar />
      <h1 className="text-2xl font-bold mb-4">📊 Analytics Dashboard</h1>

      {/* Metrics summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
            <h2 className="text-sm font-semibold">{m.label}</h2>
            <p className="text-2xl font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Call Durations */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Call Durations</h2>
          <Line ref={lineChartRef} data={lineData} />
        </div>

        {/* Success vs Failed */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Success vs Failed</h2>
          <Pie ref={pieChartRef} data={callPieData} />
        </div>

        {/* Hourly Calls */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Hourly Calls</h2>
          <Bar ref={barChartRef} data={hourlyBarData} />
        </div>

        {/* Daily Trend */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Daily Trend</h2>
          <Line ref={trendChartRef} data={trendData} />
        </div>

        {/* Calls per Caller (stacked bar) */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4 col-span-2`}>
          <h2 className="text-sm font-semibold mb-2">Calls per Caller</h2>
          <Bar ref={stackedChartRef} data={stackedBarData} options={stackedBarOptions} />
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          className="bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 text-sm"
          onClick={downloadAllCharts}
        >
          Download All Charts
        </button>
        <button
          className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 text-sm"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </main>
  );
}
