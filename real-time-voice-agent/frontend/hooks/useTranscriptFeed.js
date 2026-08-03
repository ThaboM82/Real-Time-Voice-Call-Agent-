import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export function useTranscriptFeed({ url }) {
  const [status, setStatus] = useState("⏳ Connecting…");
  const [transcripts, setTranscripts] = useState([]);

  useEffect(() => {
    const socket = io(url, { transports: ["websocket"] });

    socket.on("connect", () => {
      setStatus("🟢 Online");
    });

    socket.on("server-start", () => {
      setStatus("🟢 Online");
    });

    socket.on("transcript-saved", (payload) => {
      const timestamp = new Date().toLocaleTimeString();
      setTranscripts((prev) => [
        ...prev,
        {
          text: payload.data.text,
          speaker: payload.data.speaker || "unknown",
          time: timestamp
        }
      ]);
    });

    socket.on("disconnect", () => {
      setStatus("🔴 Offline");
    });

    return () => socket.disconnect();
  }, [url]);

  return { status, transcripts };
}
