import React, { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000"); // backend WebSocket

function Transcripts() {
  const [transcripts, setTranscripts] = useState([]);

  useEffect(() => {
    socket.on("transcript", (data) => {
      setTranscripts((prev) => [...prev, data]);
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2>Live Transcripts</h2>
      <ul style={{ listStyleType: "none", padding: 0 }}>
        {transcripts.map((t, i) => (
          <li key={i} style={{ marginBottom: "0.5rem" }}>
            <strong>{t.role}</strong> [{t.timestamp}]: {t.content}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Transcripts;
