"use client";

import { useState } from "react";
import { JointValues } from "./URDFRobot";

export interface Keyframe {
  name: string;
  pose: JointValues;
  duration: number;
}

interface KeyframeRecorderProps {
  jointValues: JointValues;
  onJointChange: (joints: JointValues) => void;
  onPlay: (keyframes: Keyframe[]) => void;
  onSave: (keyframes: Keyframe[]) => void;
  onLoad: () => void;
  keyframes: Keyframe[];
  setKeyframes: (kf: Keyframe[]) => void;
  playing: boolean;
}

const ALL_JOINT_DEFS: { name: string; label: string; min: number; max: number; group: string }[] = [
  // Right arm
  { name: "rj0", label: "rj0", min: -1.03, max: 0, group: "Right Arm" },
  { name: "rj1", label: "rj1", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "rj2", label: "rj2", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "rj3", label: "rj3", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "rj4", label: "rj4", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "rj5", label: "rj5", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "rj6", label: "rj6", min: -2.09, max: 2.09, group: "Right Arm" },
  { name: "right_left_gripper", label: "grip", min: 0, max: 1, group: "Right Arm" },
  // Left arm
  { name: "lj0", label: "lj0", min: -1.03, max: 0, group: "Left Arm" },
  { name: "lj1", label: "lj1", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "lj2", label: "lj2", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "lj3", label: "lj3", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "lj4", label: "lj4", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "lj5", label: "lj5", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "lj6", label: "lj6", min: -2.09, max: 2.09, group: "Left Arm" },
  { name: "left_left_gripper", label: "grip", min: 0, max: 1, group: "Left Arm" },
];

export default function KeyframeRecorder({
  jointValues,
  onJointChange,
  onPlay,
  onSave,
  onLoad,
  keyframes,
  setKeyframes,
  playing,
}: KeyframeRecorderProps) {
  const [kfName, setKfName] = useState("");
  const [kfDuration, setKfDuration] = useState(1.5);
  const [activeArm, setActiveArm] = useState<"Right Arm" | "Left Arm">("Right Arm");
  const [expanded, setExpanded] = useState(true);

  const addKeyframe = () => {
    const name = kfName.trim() || `pose_${keyframes.length}`;
    setKeyframes([
      ...keyframes,
      { name, pose: { ...jointValues }, duration: kfDuration },
    ]);
    setKfName("");
  };

  const removeKeyframe = (i: number) => {
    setKeyframes(keyframes.filter((_, idx) => idx !== i));
  };

  const loadKeyframe = (kf: Keyframe) => {
    onJointChange({ ...kf.pose });
  };

  const moveKeyframe = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= keyframes.length) return;
    const copy = [...keyframes];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setKeyframes(copy);
  };

  const filteredJoints = ALL_JOINT_DEFS.filter((jd) => jd.group === activeArm);

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          Keyframe Recorder
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-700/50 text-gray-400 border border-gray-700"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {expanded && (
        <>
          {/* Arm selector tabs */}
          <div className="flex gap-1">
            {(["Right Arm", "Left Arm"] as const).map((arm) => (
              <button
                key={arm}
                onClick={() => setActiveArm(arm)}
                className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  activeArm === arm
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-gray-800 text-gray-500 border border-gray-700"
                }`}
              >
                {arm}
              </button>
            ))}
          </div>

          {/* Joint sliders */}
          <div className="space-y-1">
            {filteredJoints.map((jd) => (
              <div key={jd.name} className="flex items-center gap-2">
                <label className="text-[10px] text-gray-500 w-6 font-mono shrink-0">
                  {jd.label}
                </label>
                <input
                  type="range"
                  min={jd.min}
                  max={jd.max}
                  step={0.01}
                  value={jointValues[jd.name] ?? 0}
                  onChange={(e) =>
                    onJointChange({
                      ...jointValues,
                      [jd.name]: parseFloat(e.target.value),
                    })
                  }
                  className="flex-1 h-1 accent-blue-500"
                />
                <input
                  type="number"
                  value={parseFloat((jointValues[jd.name] ?? 0).toFixed(3))}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onJointChange({ ...jointValues, [jd.name]: v });
                  }}
                  step={0.01}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono text-gray-300"
                />
              </div>
            ))}
          </div>

          {/* Save keyframe controls */}
          <div className="border-t border-gray-700 pt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Keyframe name..."
                value={kfName}
                onChange={(e) => setKfName(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder:text-gray-600"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={kfDuration}
                  onChange={(e) => setKfDuration(parseFloat(e.target.value) || 1)}
                  step={0.1}
                  min={0.1}
                  className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs font-mono text-gray-300"
                />
                <span className="text-[10px] text-gray-600">s</span>
              </div>
            </div>
            <button
              onClick={addKeyframe}
              className="w-full py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-700/30 rounded text-[10px] text-green-400 uppercase tracking-wider font-bold transition-colors"
            >
              + Save Keyframe
            </button>
          </div>

          {/* Keyframe list */}
          {keyframes.length > 0 && (
            <div className="border-t border-gray-700 pt-3 space-y-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                Keyframes ({keyframes.length})
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {keyframes.map((kf, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 bg-gray-800/50 rounded px-2 py-1 group"
                  >
                    <span className="text-[10px] text-gray-500 w-4 font-mono">
                      {i}
                    </span>
                    <button
                      onClick={() => loadKeyframe(kf)}
                      className="flex-1 text-left text-xs text-gray-300 hover:text-blue-400 transition-colors truncate"
                      title="Click to load this pose"
                    >
                      {kf.name}
                    </button>
                    <span className="text-[10px] text-gray-600 font-mono">
                      {kf.duration}s
                    </span>
                    <button
                      onClick={() => moveKeyframe(i, -1)}
                      className="text-[10px] text-gray-600 hover:text-gray-300 px-0.5"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveKeyframe(i, 1)}
                      className="text-[10px] text-gray-600 hover:text-gray-300 px-0.5"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeKeyframe(i)}
                      className="text-[10px] text-red-500/50 hover:text-red-400 px-0.5"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="border-t border-gray-700 pt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => onPlay(keyframes)}
              disabled={keyframes.length === 0 || playing}
              className="py-1.5 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700/30 rounded text-[10px] text-blue-400 uppercase tracking-wider font-bold transition-colors disabled:opacity-30"
            >
              {playing ? "Playing..." : "Play"}
            </button>
            <button
              onClick={() => onSave(keyframes)}
              disabled={keyframes.length === 0}
              className="py-1.5 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/30 rounded text-[10px] text-purple-400 uppercase tracking-wider font-bold transition-colors disabled:opacity-30"
            >
              Save to File
            </button>
            <button
              onClick={onLoad}
              className="py-1.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/30 rounded text-[10px] text-amber-400 uppercase tracking-wider font-bold transition-colors"
            >
              Load from File
            </button>
            <button
              onClick={() => {
                const allZero: JointValues = {};
                ALL_JOINT_DEFS.forEach((jd) => (allZero[jd.name] = 0));
                onJointChange(allZero);
              }}
              className="py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 uppercase tracking-wider font-bold transition-colors"
            >
              Reset All
            </button>
          </div>
        </>
      )}
    </div>
  );
}
