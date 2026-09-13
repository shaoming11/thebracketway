"use client";

import type { WorkflowState } from "@/lib/useDataBridge";

const STEPS = [
  { key: "idle",             label: "Idle" },
  { key: "pulling_toaster",  label: "Toast bread" },
  { key: "picking_lettuce",  label: "Pick lettuce" },
  { key: "placing_lettuce",  label: "Place lettuce" },
  { key: "picking_bread",    label: "Plate bread" },
  { key: "navigating",       label: "Navigate" },
  { key: "done",             label: "Done" },
];

interface ActionMapPanelProps {
  workflow: WorkflowState | null;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ActionMapPanel({ workflow }: ActionMapPanelProps) {
  const currentStep = workflow?.step ?? "idle";
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="w-full h-full flex flex-col p-3 overflow-y-auto bg-[var(--canvas)]">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-[9px] uppercase tracking-[0.15em] text-[var(--ink-ghost)] mb-1.5">
          <span>{Math.round((workflow?.overall_progress ?? 0) * 100)}%</span>
          <span>{formatTime(workflow?.estimated_time_left ?? 0)}</span>
        </div>
        <div className="w-full h-[3px] bg-[var(--canvas-warm)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-700 ease-out"
            style={{ width: `${(workflow?.overall_progress ?? 0) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps — vertical timeline */}
      <div className="flex-1 relative pl-4">
        {/* Timeline line */}
        <div className="absolute left-[5px] top-1 bottom-1 w-[1px] bg-[var(--panel-border)]" />

        <div className="space-y-0.5">
          {STEPS.map((step, i) => {
            const isActive = step.key === currentStep;
            const isDone = i < currentIdx || currentStep === "done";

            return (
              <div key={step.key} className="relative flex items-center gap-3 py-1">
                {/* Dot on timeline */}
                <div
                  className={`absolute -left-4 w-[9px] h-[9px] border transition-all ${
                    isDone
                      ? "bg-[var(--accent)] border-[var(--accent)]"
                      : isActive
                      ? "bg-[var(--canvas)] border-[var(--accent)] border-2"
                      : "bg-[var(--canvas)] border-[var(--panel-border)]"
                  }`}
                  style={{ borderRadius: "1px", transform: "rotate(45deg)" }}
                />
                <span
                  className={`text-[11px] transition-all ${
                    isDone
                      ? "text-[var(--ink-ghost)] line-through"
                      : isActive
                      ? "text-[var(--ink)] font-medium"
                      : "text-[var(--ink-ghost)]"
                  }`}
                >
                  {step.label}
                </span>
                {isActive && workflow && (
                  <span className="ml-auto text-[9px] tabular-nums text-[var(--accent)]">
                    {Math.round(workflow.step_progress * 100)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
