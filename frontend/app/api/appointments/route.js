export async function GET() {
  const appointments = [
    { id: 1, date: "2026-06-21", time: "10:00 AM", client: "John Doe" },
    { id: 2, date: "2026-06-22", time: "2:00 PM", client: "Jane Smith" },
    { id: 3, date: "2026-06-23", time: "4:30 PM", client: "Michael Brown" }
  ];

  return new Response(JSON.stringify(appointments), {
    headers: { "Content-Type": "application/json" },
  });
}
