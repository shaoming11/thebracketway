"use client";

import type { ImuOrientation, ArmState, DriveStatus, LedState } from "@/lib/useDataBridge";

interface TelemetryPanelProps {
  connected: boolean;
  imu: ImuOrientation | null;
  armLeft: ArmState | null;
  armRight: ArmState | null;
  driveStatus: DriveStatus | null;
  led: LedState | null;
}

function Row({ label, value, unit, warn }: { label: string; value: string | number; unit?: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-[2px]">
      <span className="text-[10px] text-[var(--ink-ghost)] uppercase tracking-[0.1em]">{label}</span>
      <span className={`text-[11px] tabular-nums ${warn ? "text-amber-600" : "text-[var(--ink)]"}`}>
        {value}
        {unit && <span className="text-[var(--ink-ghost)] ml-0.5 text-[9px]">{unit}</span>}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-[0.3em] text-[var(--ink-ghost)] mb-1 pb-0.5 border-b border-[var(--panel-border)]">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function TelemetryPanel({ connected, imu, armLeft, armRight, driveStatus, led }: TelemetryPanelProps) {
  const maxTemp = (s: ArmState | null) => s ? Math.max(...s.temp) : 0;
  const avgCurrent = (s: ArmState | null) => s ? s.current.reduce((a, b) => a + b, 0) / s.current.length : 0;

  return (
    <div className="w-full h-full flex flex-col px-3 py-2.5 overflow-y-auto space-y-3 bg-[var(--canvas)]">
      {/* Status line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-[5px] h-[5px] rounded-full ${
              connected ? "bg-[var(--accent)] animate-live" : "bg-red-400"
            }`}
          />
          <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        {led && (
          <div
            className="w-2.5 h-2.5 rounded-full border border-[var(--panel-border)]"
            style={{ backgroundColor: `rgb(${led.rgb[0]}, ${led.rgb[1]}, ${led.rgb[2]})` }}
          />
        )}
      </div>

      <Group title="Orientation">
        <Row label="Roll" value={imu?.rpy[0]?.toFixed(1) ?? "--"} unit="deg" />
        <Row label="Pitch" value={imu?.rpy[1]?.toFixed(1) ?? "--"} unit="deg" />
        <Row label="Yaw" value={imu?.rpy[2]?.toFixed(1) ?? "--"} unit="deg" />
      </Group>

      <Group title="Left arm">
        <Row label="Temp" value={maxTemp(armLeft).toFixed(1)} unit="C" warn={maxTemp(armLeft) > 50} />
        <Row label="Current" value={avgCurrent(armLeft).toFixed(2)} unit="A" />
      </Group>

      <Group title="Right arm">
        <Row label="Temp" value={maxTemp(armRight).toFixed(1)} unit="C" warn={maxTemp(armRight) > 50} />
        <Row label="Current" value={avgCurrent(armRight).toFixed(2)} unit="A" />
      </Group>

      <Group title="Power">
        <Row label="Battery" value={driveStatus?.voltage?.toFixed(1) ?? "--"} unit="V" warn={(driveStatus?.voltage ?? 25) < 22} />
      </Group>
    </div>
  );
}
