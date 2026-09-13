"use client";

import { TaskState } from "@/lib/taskSequencer";

interface CameraFeedProps {
  state: TaskState | null;
  streamUrl?: string;
}

export default function CameraFeed({ state, streamUrl }: CameraFeedProps) {
  const isActive = state && state.currentStep !== "idle";

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
        Gripper Camera
      </p>
      <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden border border-gray-700/50">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt="Gripper camera feed"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className={`w-16 h-16 rounded-full border-2 flex items-center justify-center mb-2 ${
                isActive
                  ? "border-blue-500 text-blue-400"
                  : "border-gray-700 text-gray-600"
              }`}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-xs text-gray-500">
              {isActive
                ? "Camera feed unavailable"
                : "Waiting for task to start..."}
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              Connect robot to enable live feed
            </p>
          </div>
        )}

        {/* Recording indicator */}
        {isActive && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-red-400 font-mono">LIVE</span>
          </div>
        )}
      </div>
    </div>
  );
}
