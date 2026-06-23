export default function NavBar() {
  return (
    <nav style={{ padding: "1rem", background: "#f0f0f0" }}>
      <ul style={{ display: "flex", gap: "1rem", listStyle: "none" }}>
        <li><a href="/">Home</a></li>
        <li><a href="/analytics">Analytics</a></li>
        <li><a href="/transcripts">Transcripts</a></li>
        <li><a href="/appointments">Appointments</a></li>
      </ul>
    </nav>
  );
}
