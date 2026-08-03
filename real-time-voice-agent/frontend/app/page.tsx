"use client";

import { useEffect, useState } from "react";
import { CallWithUser } from "../types/calls";
import CallsTable from "../components/CallsTable";
import { USE_MOCK } from "../config";

export default function Page() {
  const [calls, setCalls] = useState<CallWithUser[]>([]);

  useEffect(() => {
    if (USE_MOCK) {
      setCalls([
        {
          id: "1",
          userId: "u001",
          userName: "Alice",
          phoneNumber: "+27123456789",
          startTime: new Date(Date.now() - 3600000).toISOString(),
          endTime: null,
          status: "active",
        },
        {
          id: "2",
          userId: "u002",
          userName: "Bob",
          phoneNumber: "+27198765432",
          startTime: new Date(Date.now() - 7200000).toISOString(),
          endTime: new Date().toISOString(),
          status: "completed",
        },
      ]);
    } else {
      fetch("/api/calls-with-users")
        .then((res) => res.json())
        .then((data: CallWithUser[]) => setCalls(data));
    }
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <h1>Calls with Users</h1>
      <CallsTable calls={calls} />
    </div>
  );
}
