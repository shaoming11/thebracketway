"use client";

import { RobotTransform, JointValues } from "./URDFRobot";

interface RobotConfigPanelProps {
  transform: RobotTransform;
  onChange: (t: RobotTransform) => void;
  locked: boolean;
  onToggleLock: () => void;
  jointValues: JointValues;
  onJointChange: (joints: JointValues) => void;
  jointTuning: boolean;
  onToggleJointTuning: () => void;
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-gray-500 w-6 font-mono shrink-0">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="flex-1 h-1 accent-blue-500 disabled:opacity-30"
      />
      <input
        type="number"
        value={parseFloat(value.toFixed(3))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        disabled={disabled}
        step={step}
        className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono text-gray-300 disabled:opacity-30"
      />
    </div>
  );
}

function Vec3Control({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
}) {
  const axes = ["X", "Y", "Z"] as const;
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      {axes.map((axis, i) => (
        <Slider
          key={axis}
          label={axis}
          value={value[i]}
          onChange={(v) => {
            const next = [...value] as [number, number, number];
            next[i] = v;
            onChange(next);
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

const JOINT_DEFS: { name: string; label: string; min: number; max: number }[] =
  [
    { name: "lj0", label: "lj0", min: -1.03, max: 0 },
    { name: "lj1", label: "lj1", min: -2.09, max: 2.09 },
    { name: "lj2", label: "lj2", min: -2.09, max: 2.09 },
    { name: "lj3", label: "lj3", min: -2.09, max: 2.09 },
    { name: "lj4", label: "lj4", min: -2.09, max: 2.09 },
    { name: "lj5", label: "lj5", min: -2.09, max: 2.09 },
    { name: "lj6", label: "lj6", min: -2.09, max: 2.09 },
    { name: "left_left_gripper", label: "grip", min: 0, max: 1 },
  ];

export default function RobotConfigPanel({
  transform,
  onChange,
  locked,
  onToggleLock,
  jointValues,
  onJointChange,
  jointTuning,
  onToggleJointTuning,
}: RobotConfigPanelProps) {
  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          Robot Transform
        </p>
        <button
          onClick={onToggleLock}
          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
            locked
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
          }`}
        >
          {locked ? "Locked" : "Unlocked"}
        </button>
      </div>

      <Vec3Control
        label="Position"
        value={transform.position}
        onChange={(position) => onChange({ ...transform, position })}
        min={-3}
        max={3}
        step={0.01}
        disabled={locked}
      />

      <Vec3Control
        label="Rotation (rad)"
        value={transform.rotation}
        onChange={(rotation) => onChange({ ...transform, rotation })}
        min={-Math.PI}
        max={Math.PI}
        step={0.01}
        disabled={locked}
      />

      <Vec3Control
        label="Scale"
        value={transform.scale}
        onChange={(scale) => onChange({ ...transform, scale })}
        min={0.01}
        max={5}
        step={0.01}
        disabled={locked}
      />

      <button
        onClick={() => {
          const code = `Position: [${transform.position.map((v) => v.toFixed(3)).join(", ")}]\nRotation: [${transform.rotation.map((v) => v.toFixed(3)).join(", ")}]\nScale: [${transform.scale.map((v) => v.toFixed(3)).join(", ")}]`;
          navigator.clipboard.writeText(code);
        }}
        className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 uppercase tracking-wider transition-colors"
      >
        Copy Transform
      </button>

      {/* Joint Tuning Section */}
      <div className="border-t border-gray-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Joint Tuning
          </p>
          <button
            onClick={onToggleJointTuning}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              jointTuning
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-gray-700/50 text-gray-500 border border-gray-700"
            }`}
          >
            {jointTuning ? "Active" : "Off"}
          </button>
        </div>

        {jointTuning && (
          <div className="space-y-1.5">
            {JOINT_DEFS.map((jd) => (
              <Slider
                key={jd.name}
                label={jd.label}
                value={jointValues[jd.name] ?? 0}
                onChange={(v) =>
                  onJointChange({ ...jointValues, [jd.name]: v })
                }
                min={jd.min}
                max={jd.max}
                step={0.01}
                disabled={false}
              />
            ))}

            <button
              onClick={() => {
                const poseStr = JSON.stringify(jointValues, null, 2);
                navigator.clipboard.writeText(poseStr);
              }}
              className="w-full py-1.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/30 rounded text-[10px] text-amber-400 uppercase tracking-wider transition-colors"
            >
              Copy Pose
            </button>

            <button
              onClick={() => {
                const reset: JointValues = {};
                JOINT_DEFS.forEach((jd) => (reset[jd.name] = 0));
                onJointChange(reset);
              }}
              className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 uppercase tracking-wider transition-colors"
            >
              Reset Joints
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
