"use client";

import { Line, Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from "chart.js";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState([]);
  const [calls, setCalls] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  // SSE connection to backend
  useEffect(() => {
    setLoading(true);
    const source = new EventSource(`/api/calls/stream?days=${days}`);

    source.onmessage = (event) => {
      const callsData = JSON.parse(event.data);
      setCalls(callsData);

      const totalCalls = callsData.length;
      const avgDuration =
        callsData.reduce((sum, c) => sum + c.duration, 0) / (totalCalls || 1);
      const successRate =
        (callsData.filter((c) => c.status === "success").length / (totalCalls || 1)) * 100;

      setMetrics([
        { label: "Total Calls", value: totalCalls },
        {
          label: "Average Duration",
          value: `${Math.round(avgDuration / 60)}m ${Math.round(avgDuration % 60)}s`,
        },
        { label: "Success Rate", value: `${Math.round(successRate)}%` },
      ]);

      setLastUpdated(new Date().toLocaleString());
      setLoading(false);
    };

    source.onerror = (err) => {
      console.error("SSE error:", err);
      source.close();
      setLoading(false);
    };

    return () => source.close();
  }, [days]);

  // Chart data definitions (example placeholders)
  const lineData = { labels: calls.map(c => new Date(c.timestamp).toLocaleTimeString()), datasets: [{ label: "Duration", data: calls.map(c => c.duration), borderColor: "blue" }] };
  const pieData = { labels: ["Success", "Failed"], datasets: [{ data: [calls.filter(c => c.status === "success").length, calls.filter(c => c.status !== "success").length], backgroundColor: ["green", "red"] }] };
  const barData = { labels: calls.map(c => new Date(c.timestamp).getHours()), datasets: [{ label: "Calls per Hour", data: calls.map(c => new Date(c.timestamp).getHours()), backgroundColor: "orange" }] };
  const trendData = lineData;
  const stackedData = barData;

  // Helper: download all charts zipped
  const downloadAllCharts = () => {
    const zip = new JSZip();
    const charts = [
      { id: "lineChart", filename: "call-durations.png" },
      { id: "pieChart", filename: "success-vs-failed.png" },
      { id: "barChart", filename: "hourly-calls.png" },
      { id: "trendChart", filename: "daily-trend.png" },
      { id: "stackedChart", filename: "calls-per-caller.png" },
    ];

    charts.forEach(({ id, filename }) => {
      const chartEl = document.getElementById(id);
      if (chartEl && chartEl.toBase64Image) {
        const imgData = chartEl.toBase64Image().split(",")[1];
        zip.file(filename, imgData, { base64: true });
      }
    });

    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "analytics-charts.zip");
    });
  };

  return (
    <main className={`${darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"} relative p-6 min-h-screen`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 z-50">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="flex gap-2">
          <button
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 text-sm"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            className="bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 text-sm"
            onClick={downloadAllCharts}
          >
            Download All Charts
          </button>
        </div>
      </div>

      {lastUpdated && (
        <div className="flex items-center gap-4 mb-6">
          <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
          <button
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 text-sm"
            onClick={() => window.location.reload()}
          >
            Refresh Now
          </button>
        </div>
      )}

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
          <Line id="lineChart" data={lineData} />
          <button className="mt-2 bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 text-xs"
            onClick={() => {
              const chart = document.getElementById("lineChart");
              const url = chart.toBase64Image();
              const link = document.createElement("a");
              link.href = url;
              link.download = "call-durations.png";
              link.click();
            }}>
            Download PNG
          </button>
        </div>

        {/* Success vs Failed */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Success vs Failed</h2>
          <Pie id="pieChart" data={pieData} />
          <button className="mt-2 bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 text-xs"
            onClick={() => {
              const chart = document.getElementById("pieChart");
              const url = chart.toBase64Image();
              const link = document.createElement("a");
              link.href = url;
              link.download = "success-vs-failed.png";
              link.click();
            }}>
            Download PNG
          </button>
        </div>

        {/* Hourly Calls */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Hourly Calls</h2>
          <Bar id="barChart" data={barData} />
          <button className="mt-2 bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 text-xs"
            onClick={() => {
              const chart = document.getElementById("barChart");
              const url = chart.toBase64Image();
              const link = document.createElement("a");
              link.href = url;
              link.download = "hourly-calls.png";
              link.click();
            }}>
            Download PNG
          </button>
        </div>

               {/* Daily Trend */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4`}>
          <h2 className="text-sm font-semibold mb-2">Daily Trend</h2>
          <Line id="trendChart" data={trendData} />
          <button
            className="mt-2 bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 text-xs"
            onClick={() => {
              const chart = document.getElementById("trendChart");
              const url = chart.toBase64Image();
              const link = document.createElement("a");
              link.href = url;
              link.download = "daily-trend.png";
              link.click();
            }}
          >
            Download PNG
          </button>
        </div>

        {/* Calls per Caller (stacked bar) */}
        <div className={`${darkMode ? "bg-gray-800" : "bg-white"} shadow rounded-lg p-4 col-span-2`}>
          <h2 className="text-sm font-semibold mb-2">Calls per Caller</h2>
          <Bar
            id="stackedChart"
            data={stackedData}
            options={{
              responsive: true,
              plugins: { legend: { position: "top" } },
              scales: { x: { stacked: true }, y: { stacked: true } },
            }}
          />
          <button
            className="mt-2 bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 text-xs"
            onClick={() => {
              const chart = document.getElementById("stackedChart");
              const url = chart.toBase64Image();
              const link = document.createElement("a");
              link.href = url;
              link.download = "calls-per-caller.png";
              link.click();
            }}
          >
            Download PNG
          </button>
        </div>
      </div>
    </main>
  );
}
