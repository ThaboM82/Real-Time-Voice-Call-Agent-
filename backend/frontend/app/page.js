import NavBar from "../components/NavBar";
import VoiceTester from "../components/VoiceTester";
import ChatWindow from "../components/ChatWindow";

export default function Page() {
  return (
    <main style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <NavBar />
      <h1>Real-Time Voice Agent UI</h1>
      <p>Click a button below to hear each voice:</p>
      <VoiceTester />
      <ChatWindow />
    </main>
  );
}
