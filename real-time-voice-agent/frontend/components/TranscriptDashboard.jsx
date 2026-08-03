"use client";
import { useState, useEffect } from "react";
import { useTranscriptFeed } from "../hooks/useTranscriptFeed";

export default function TranscriptDashboard() {
  const feedUrl =
    process.env.NEXT_PUBLIC_TRANSCRIPT_FEED_URL ||
    "https://theology-trunks-dining.ngrok-free.dev";

  const { status, transcripts } = useTranscriptFeed({ url: feedUrl });

  const [toasts, setToasts] = useState([]);

  const badgeClass = (speaker) => {
    switch (speaker) {
      case "user":
        return "bg-green-600 text-white px-2 py-1 rounded text-xs font-semibold";
      case "agent":
        return "bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold";
      default:
        return "bg-gray-600 text-white px-2 py-1 rounded text-xs font-semibold";
    }
  };

  const envBadgeClass = feedUrl.includes("ngrok")
    ? "bg-green-200 text-green-800 px-2 py-1 rounded text-xs font-semibold"
    : "bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs font-semibold";

  // Toast creator with type-based duration
  const addToast = (message, type = "success") => {
    const id = Date.now();
    let duration = 2000;
    if (type === "info") duration = 3000;
    if (type === "warning") duration = 4000;
    if (type === "error") duration = 6000;

    setToasts((prev) => [...prev, { id, message, type, duration, visible: true }]);

    setTimeout(() => {
      // trigger slide-out by setting visible=false
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
      );
      // remove after animation
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 500); // match animation duration
    }, duration);
  };

  const dismissToast = (id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 500);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(feedUrl);
    addToast("✅ Feed URL copied!", "success");
  };

  // Example: trigger error/info/warning toasts based on backend status
  useEffect(() => {
    if (status === "disconnected") {
      addToast("❌ Backend disconnected!", "error");
    } else if (status === "connecting") {
      addToast("ℹ️ Connecting to backend…", "info");
    } else if (status === "slow") {
      addToast("⚠️ Backend response is slow!", "warning");
    }
  }, [status]);

  // Inline Toast component
  const Toast = ({ id, message, type = "success", visible, onDismiss }) => {
    let bgColor = "bg-green-600";
    let textColor = "text-white";
    if (type === "error") bgColor = "bg-red-600";
    if (type === "info") bgColor = "bg-blue-600";
    if (type === "warning") {
      bgColor = "bg-yellow-500";
      textColor = "text-black";
    }

    return (
      <div
        className={`${bgColor} ${textColor} px-3 py-2 rounded shadow-lg text-sm flex items-center gap-2 transition-all duration-500 ${
          visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"
        }`}
      >
        {message}
        <button
          onClick={() => onDismiss(id)}
          className="ml-2 font-bold hover:opacity-75"
        >
          ✖
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 relative">
      <h3 className="text-lg font-bold flex items-center gap-2">
        📡 Backend Status: {status}
        <span className={envBadgeClass} title={feedUrl}>
          {feedUrl.includes("ngrok") ? "Dev (ngrok)" : "Prod"}
        </span>
      </h3>
      <h3 className="text-lg font-bold">📝 Live Transcripts</h3>
      {transcripts.length === 0 ? (
        <p className="text-gray-500">No transcripts yet…</p>
      ) : (
        <ul className="space-y-2">
          {transcripts.map((t, i) => (
            <li key={i} className="flex items-center space-x-2">
              <span className={badgeClass(t.speaker)}>{t.speaker}</span>
              <span className="text-gray-400 text-sm">[{t.time}]</span>
              <span className="text-gray-800">{t.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer line showing full URL with copy button */}
      <div className="text-xs text-gray-500 mt-4 flex items-center gap-2">
        Active feed URL: <span className="font-mono">{feedUrl}</span>
        <button
          onClick={copyUrl}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs font-semibold"
        >
          Copy
        </button>
      </div>

      {/* Toast stack */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            visible={toast.visible}
            onDismiss={dismissToast}
          />
        ))}
      </div>
    </div>
  );
}
