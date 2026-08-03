import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export function useTranscriptFeed({ url }) {
  const [status, setStatus] = useState("🔴 Offline");
  const [transcripts, setTranscripts] = useState([]);

  useEffect(() => {
    const socket = io(url, { transports: ["websocket"] });

    socket.on("server-start", () => {
      setStatus("🟢 Online");
    });

    socket.on("transcript-saved", (payload) => {
      setTranscripts((prev) => [...prev, payload.data]);
    });

    socket.on("disconnect", () => {
      setStatus("🔴 Offline");
    });

    return () => socket.disconnect();
  }, [url]);

  return { status, transcripts };
}
