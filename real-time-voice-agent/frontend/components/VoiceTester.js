"use client";
import React, { useState } from "react";
import { speak } from "../services/api";
import AudioPlayer from "./AudioPlayer";

function VoiceTester() {
  const [audio, setAudio] = useState(null);
  const [loadingVoice, setLoadingVoice] = useState(null);
  const [toasts, setToasts] = useState([]);

  async function handleSpeak(voiceKey) {
    try {
      setLoadingVoice(voiceKey);
      const blob = await speak("Hello Percy, testing " + voiceKey, voiceKey);
      setAudio(URL.createObjectURL(blob));
      triggerToast(`${voiceKey} voice ready!`, "success");
    } catch (err) {
      console.error("Error speaking:", err);
      triggerToast("Error generating voice", "error");
    } finally {
      setLoadingVoice(null);
    }
  }

  function triggerToast(message, type) {
    const id = Date.now();
    const newToast = {
      id,
      message,
      type,
      fadeOut: false,
      progress: 100,
      paused: false,
      expanded: false,
      timestamp: new Date().toLocaleTimeString(),
    };
    setToasts((prev) => [...prev, newToast]);

    // Play a short sound
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(type === "success" ? 880 : 220, audioCtx.currentTime);
    oscillator.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);

    // Trigger vibration (if supported)
    if (navigator.vibrate) {
      navigator.vibrate(type === "success" ? 100 : [200, 100, 200]);
    }

    // Progress bar countdown (3s total)
    let interval = setInterval(() => {
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id && !t.paused
            ? { ...t, progress: Math.max(t.progress - 5, 0) }
            : t
        )
      );
    }, 150);

    // Fade out after 2.5s, remove at 3s
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, fadeOut: true } : t))
      );
    }, 2500);
    setTimeout(() => {
      clearInterval(interval);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  const voices = ["roger", "brian", "daniel"];

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-semibold">Voice Tester</h2>
      <div className="flex gap-3">
        {voices.map((voice) => (
          <button
            key={voice}
            onClick={() => handleSpeak(voice)}
            disabled={loadingVoice === voice}
            className={`px-3 py-1 rounded flex items-center gap-2 ${
              loadingVoice === voice
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-brand text-white hover:bg-brand-dark"
            }`}
          >
            {loadingVoice === voice ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Loading…
              </>
            ) : (
              `Test ${voice}`
            )}
          </button>
        ))}
      </div>
      {audio && <AudioPlayer src={audio} />}

      {/* Stacked Toast Notifications */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            onMouseEnter={() =>
              setToasts((prev) =>
                prev.map((t) => (t.id === toast.id ? { ...t, paused: true } : t))
              )
            }
            onMouseLeave={() =>
              setToasts((prev) =>
                prev.map((t) => (t.id === toast.id ? { ...t, paused: false } : t))
              )
            }
            onClick={() =>
              setToasts((prev) =>
                prev.map((t) =>
                  t.id === toast.id ? { ...t, expanded: !t.expanded } : t
                )
              )
            }
            className={`px-4 py-2 rounded shadow-lg flex flex-col gap-2 cursor-pointer transform transition-all duration-500 ${
              toast.fadeOut ? "opacity-0 translate-x-20 translate-y-4" : "opacity-100 translate-x-0 translate-y-0"
            } ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
            style={{ transitionDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {toast.type === "success" ? "✅" : "⚠️"} {toast.message}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="text-white font-bold hover:text-gray-200"
              >
                ×
              </button>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-gray-800 h-1 rounded">
              <div
                className="h-1 rounded transition-all duration-150"
                style={{
                  width: `${toast.progress}%`,
                  backgroundColor: toast.type === "success" ? "#22c55e" : "#ef4444",
                }}
              ></div>
            </div>
            {/* Expanded Details with Copy Button (error only) */}
            {toast.expanded && (
              <div className="text-sm text-gray-200 mt-1 flex flex-col gap-1">
                <p>Timestamp: {toast.timestamp}</p>
                <p>Debug ID: {toast.id}</p>
                {toast.type === "error" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(
                        `Timestamp: ${toast.timestamp}, Debug ID: ${toast.id}`
                      );
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs self-start"
                  >
                    Copy Debug Info
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VoiceTester;
