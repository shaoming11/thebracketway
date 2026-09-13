"use client";

import { useState, useRef, useCallback } from "react";

interface VoiceButtonProps {
  onCommand: () => void;
  disabled?: boolean;
}

export default function VoiceButton({ onCommand, disabled }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript.toLowerCase();
      setTranscript(text);

      if (result.isFinal && text.includes("sandwich")) {
        setListening(false);
        onCommand();
      }
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setTranscript("");
  }, [onCommand]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl transition-all ${
          disabled
            ? "bg-gray-600 cursor-not-allowed"
            : listening
            ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/50"
            : "bg-blue-500 hover:bg-blue-400 shadow-lg shadow-blue-500/30"
        }`}
      >
        {listening ? "⏹" : "🎤"}
      </button>
      <p className="text-sm text-gray-400 text-center h-5">
        {listening
          ? transcript || 'Say "Make me a sandwich!"'
          : disabled
          ? "Task in progress..."
          : "Tap to speak"}
      </p>
    </div>
  );
}
