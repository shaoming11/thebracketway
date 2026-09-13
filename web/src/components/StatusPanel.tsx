"use client";

import { TaskState } from "@/lib/taskSequencer";

interface StatusPanelProps {
  state: TaskState | null;
  connected: boolean;
}

const STEP_LABELS = [
  "Pull toaster lever",
  "Pick up lettuce",
  "Place lettuce on bread",
  "Pick bread & plate",
  "Navigate to user",
];

export default function StatusPanel({ state, connected }: StatusPanelProps) {
  if (!state) {
    return (
      <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6">
        <p className="text-gray-400">Connecting...</p>
      </div>
    );
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6 space-y-4">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Current action */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
          Current Action
        </p>
        <p className="text-lg font-semibold text-white">{state.stepLabel}</p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{Math.round(state.progress * 100)}%</span>
          <span>ETA: {formatTime(state.estimatedTimeLeft)}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${state.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-2">
        {STEP_LABELS.map((label, i) => {
          const isActive = i === state.stepIndex;
          const isDone = i < state.stepIndex || state.currentStep === "done";
          return (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  isDone
                    ? "bg-green-500 border-green-500 text-white"
                    : isActive
                    ? "border-blue-400 text-blue-400 animate-pulse"
                    : "border-gray-700 text-gray-600"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-sm ${
                  isDone
                    ? "text-green-400 line-through"
                    : isActive
                    ? "text-white font-medium"
                    : "text-gray-600"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
