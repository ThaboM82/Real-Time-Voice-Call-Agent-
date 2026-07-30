"use client";
import React, { useState } from "react";
import { speak } from "../services/api";
import AudioPlayer from "./AudioPlayer";

function VoiceTester() {
  const [audio, setAudio] = useState(null);

  async function handleSpeak(voiceKey) {
    try {
      const blob = await speak("Hello Percy, testing " + voiceKey, voiceKey);
      setAudio(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Error speaking:", err);
    }
  }

  return (
    <div>
      <h2>Voice Tester</h2>
      <button onClick={() => handleSpeak("roger")}>Test Roger</button>
      <button onClick={() => handleSpeak("brian")}>Test Brian</button>
      <button onClick={() => handleSpeak("daniel")}>Test Daniel</button>
      {audio && <AudioPlayer src={audio} />}
    </div>
  );
}

export default VoiceTester;
