"use client";

import { useEffect, useState } from "react";

export default function AppointmentsTable() {
  const [calls, setCalls] = useState([]);

  useEffect(() => {
    fetch("/api/calls/stream?days=7")
      .then((res) => res.json())
      .then((data) => setCalls(data))
      .catch((err) => console.error("Error fetching calls:", err));
  }, []);

  return (
    <div className="overflow-x-auto rounded-lg shadow-md bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">ID</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Duration (s)</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Timestamp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {calls.map((call) => (
            <tr key={call.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-sm text-gray-800">{call.id}</td>
              <td className="px-4 py-2 text-sm text-gray-800">{call.duration}</td>
              <td className="px-4 py-2 text-sm">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    call.status === "success"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {call.status}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {new Date(call.timestamp).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
