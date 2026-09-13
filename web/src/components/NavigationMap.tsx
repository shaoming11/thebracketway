"use client";

import { TaskState } from "@/lib/taskSequencer";

interface NavigationMapProps {
  state: TaskState | null;
}

export default function NavigationMap({ state }: NavigationMapProps) {
  if (!state) return null;

  const scale = 30; // px per unit
  const robotX = state.robotPosition.x * scale;
  const robotY = state.robotPosition.y * scale;
  const userX = state.userPosition.x * scale;
  const userY = state.userPosition.y * scale;

  const isNavigating = state.currentStep === "navigating";
  const isDone = state.currentStep === "done";

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
        Navigation Map
      </p>
      <div className="relative w-full h-[300px] bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/50">
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width={scale} height={scale} patternUnits="userSpaceOnUse">
              <path d={`M ${scale} 0 L 0 0 0 ${scale}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Path line */}
          {(isNavigating || isDone) && (
            <line
              x1={robotX}
              y1={robotY}
              x2={userX}
              y2={userY}
              stroke={isDone ? "#22c55e" : "#3b82f6"}
              strokeWidth="2"
              strokeDasharray={isDone ? "none" : "6 4"}
              className={isNavigating ? "animate-pulse" : ""}
            />
          )}
        </svg>

        {/* Table marker */}
        <div
          className="absolute w-16 h-10 bg-amber-900/40 border border-amber-700/50 rounded flex items-center justify-center text-[10px] text-amber-500"
          style={{ left: 2 * scale - 32, top: 2 * scale - 20 }}
        >
          TABLE
        </div>

        {/* Robot */}
        <div
          className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-blue-300 shadow-lg shadow-blue-500/50 transition-all duration-500"
          style={{
            left: robotX - 8,
            top: robotY - 8,
          }}
        />
        <span
          className="absolute text-[10px] text-blue-400 font-bold transition-all duration-500"
          style={{ left: robotX - 12, top: robotY + 10 }}
        >
          ROBOT
        </span>

        {/* User */}
        <div
          className="absolute w-4 h-4 rounded-full bg-green-500 border-2 border-green-300 shadow-lg shadow-green-500/50"
          style={{ left: userX - 8, top: userY - 8 }}
        />
        <span
          className="absolute text-[10px] text-green-400 font-bold"
          style={{ left: userX - 8, top: userY + 10 }}
        >
          YOU
        </span>
      </div>
    </div>
  );
}
