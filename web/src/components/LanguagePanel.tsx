"use client";

import { useState, useRef, useCallback } from "react";
import type { WorkflowState } from "@/lib/useDataBridge";

interface LanguagePanelProps {
  workflow: WorkflowState | null;
}

interface Message {
  role: "user" | "system";
  text: string;
  timestamp: number;
}

export default function LanguagePanel({ workflow }: LanguagePanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", text: 'Say "make me a sandwich" or type a command.', timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const addMessage = useCallback((role: "user" | "system", text: string) => {
    setMessages((prev) => [...prev, { role, text, timestamp: Date.now() }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    addMessage("user", input.trim());
    if (input.toLowerCase().includes("sandwich")) {
      addMessage("system", "Starting sandwich workflow...");
    } else {
      addMessage("system", `Unknown: "${input.trim()}"`);
    }
    setInput("");
  }, [input, addMessage]);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addMessage("system", "Speech not supported."); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      addMessage("user", text);
      if (text.toLowerCase().includes("sandwich")) addMessage("system", "Starting sandwich workflow...");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }, [listening, addMessage]);

  const lastStepRef = useRef<string>("");
  if (workflow && workflow.step !== lastStepRef.current) {
    lastStepRef.current = workflow.step;
    if (workflow.step !== "idle") {
      setTimeout(() => addMessage("system", workflow.step_label), 0);
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--canvas)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] px-2.5 py-1 text-[11px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--accent-wash)] text-[var(--ink)] border-l-2 border-[var(--accent)]"
                  : "text-[var(--ink-light)]"
              }`}
            >
              {msg.role === "system" && <span className="text-[var(--ink-ghost)] mr-1">&gt;</span>}
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-2 py-2 border-t border-[var(--panel-border)] flex gap-1.5">
        <button
          type="button"
          onClick={toggleListening}
          className={`w-7 h-7 shrink-0 flex items-center justify-center transition-all border ${
            listening
              ? "bg-red-50 border-red-300 text-red-500"
              : "bg-[var(--canvas)] border-[var(--panel-border)] text-[var(--ink-ghost)] hover:text-[var(--ink-faint)]"
          }`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command..."
          className="flex-1 bg-transparent border border-[var(--panel-border)] px-2.5 py-1 text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-ghost)] focus:outline-none focus:border-[var(--accent)]"
        />
      </form>
    </div>
  );
}
