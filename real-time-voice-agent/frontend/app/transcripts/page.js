import NavBar from "../../components/NavBar";
import TranscriptViewer from "../../components/TranscriptViewer";

export default function TranscriptsPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <NavBar />
      <h1>Transcript Dashboard</h1>
      <TranscriptViewer />
    </main>
  );
}
