export async function GET() {
  const transcripts = [
    { caller: "John Doe", text: "Hello, I need help with my account." },
    { caller: "Agent", text: "Sure, let me check that for you." },
    { caller: "Jane Smith", text: "Can I reschedule my appointment?" },
    { caller: "Agent", text: "Yes, let’s find a new time." }
  ];

  return new Response(JSON.stringify(transcripts), {
    headers: { "Content-Type": "application/json" },
  });
}
