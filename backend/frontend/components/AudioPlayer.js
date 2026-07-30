"use client";
import React from "react";

function AudioPlayer({ src }) {
  return (
    <div>
      <audio controls src={src}></audio>
    </div>
  );
}

export default AudioPlayer;
