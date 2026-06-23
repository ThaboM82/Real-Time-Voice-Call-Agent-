export default function handler(req, res) {
  res.status(200).json([
    { id: 1, duration: 180, status: "success", timestamp: "2026-06-20T10:00:00Z" },
    { id: 2, duration: 240, status: "failed", timestamp: "2026-06-20T11:00:00Z" },
    { id: 3, duration: 195, status: "success", timestamp: "2026-06-20T14:00:00Z" },
    { id: 4, duration: 300, status: "success", timestamp: "2026-06-20T15:30:00Z" }
  ]);
}
