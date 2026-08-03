"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export default function StatusPanel() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    // Connect to backend WebSocket server
    const socket = io("http://localhost:3001"); // adjust port if needed

    // Listen for status updates
    socket.on("statusUpdate", (data) => {
      setStatus(data);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  if (!status) {
    return <div className="p-4 shadow-card">Waiting for live status...</div>;
  }

  return (
    <div className="p-4 shadow-card bg-white dark:bg-gray-900">
      <h2 className="text-xl font-sans text-brand-dark">Agent Status</h2>
      <p>
        Online:{" "}
        <span className={status.agentOnline ? "text-green-600" : "text-red-600"}>
          {status.agentOnline ? "Yes" : "No"}
        </span>
      </p>
      <p>Current Call: {status.currentCall || "None"}</p>
      <p>Queue Length: {status.queueLength}</p>
    </div>
  );
}
