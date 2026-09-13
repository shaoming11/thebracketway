"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useDataBridge } from "@/lib/useDataBridge";
import DraggableLayout from "@/components/DraggableLayout";
import CameraPanel from "@/components/CameraPanel";
import LanguagePanel from "@/components/LanguagePanel";
import ActionMapPanel from "@/components/ActionMapPanel";
import TelemetryPanel from "@/components/TelemetryPanel";

const LiveRobotScene = dynamic(() => import("@/components/LiveRobotScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--canvas)]">
      <span className="text-[11px] tracking-[0.3em] uppercase text-[var(--ink-ghost)]">
        Loading scene
      </span>
    </div>
  ),
});

export default function Home() {
  const bridge = useDataBridge();

  const panels = useMemo(
    () => [
      {
        id: "sim",
        title: "Simulation",
        defaultWidth: 700,
        defaultHeight: 500,
        content: (
          <LiveRobotScene
            urdfJoints={bridge.urdfJoints}
            workflow={bridge.workflow}
          />
        ),
      },
      {
        id: "cam-head",
        title: "Head",
        defaultWidth: 400,
        defaultHeight: 200,
        content: <CameraPanel label="HEAD" cameraIndex={0} />,
      },
      {
        id: "cam-left",
        title: "Left wrist",
        defaultWidth: 200,
        defaultHeight: 180,
        content: <CameraPanel label="L. WRIST" cameraIndex={1} />,
      },
      {
        id: "cam-right",
        title: "Right wrist",
        defaultWidth: 200,
        defaultHeight: 180,
        content: <CameraPanel label="R. WRIST" cameraIndex={2} />,
      },
      {
        id: "language",
        title: "Language",
        defaultWidth: 350,
        defaultHeight: 260,
        content: <LanguagePanel workflow={bridge.workflow} />,
      },
      {
        id: "actions",
        title: "Actions",
        defaultWidth: 280,
        defaultHeight: 260,
        content: <ActionMapPanel workflow={bridge.workflow} />,
      },
      {
        id: "telemetry",
        title: "Telemetry",
        defaultWidth: 280,
        defaultHeight: 380,
        content: (
          <TelemetryPanel
            connected={bridge.connected}
            imu={bridge.imu}
            armLeft={bridge.armLeft}
            armRight={bridge.armRight}
            driveStatus={bridge.driveStatus}
            led={bridge.led}
          />
        ),
      },
    ],
    [bridge]
  );

  return (
    <div className="h-screen w-screen bg-[var(--canvas)] text-[var(--ink)] overflow-hidden flex flex-col">
      {/* Main workspace — full bleed, panels float over it */}
      <main className="flex-1 min-h-0 relative">
        <DraggableLayout panels={panels} />
      </main>

      {/* Bottom nav — matches the bracket bot site */}
      <footer className="absolute bottom-0 left-0 right-0 z-[100] flex items-end justify-between px-5 pb-4 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <NavPill label="[ bracket bot ]" bold />
          {bridge.workflow && bridge.workflow.step !== "idle" && bridge.workflow.step !== "done" && (
            <NavPill label={bridge.workflow.step_label} active />
          )}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {bridge.driveStatus && (
            <NavPill label={`${bridge.driveStatus.voltage.toFixed(1)}V`} />
          )}
          <NavPill
            label={bridge.connected ? "Data bridge" : "Connecting..."}
            dot={bridge.connected ? "live" : "off"}
          />
        </div>
      </footer>
    </div>
  );
}

function NavPill({
  label,
  bold,
  active,
  dot,
}: {
  label: string;
  bold?: boolean;
  active?: boolean;
  dot?: "live" | "off";
}) {
  return (
    <div
      className={`
        px-3 py-1.5 rounded-full border
        text-[11px] tracking-wide
        transition-colors duration-200
        ${active
          ? "bg-[var(--accent-wash)] border-[var(--accent-pale)] text-[var(--ink)]"
          : "bg-[var(--panel-bg)] border-[var(--panel-border)] text-[var(--ink-light)]"
        }
        ${bold ? "font-bold text-[var(--ink)] text-[13px] tracking-tight" : ""}
      `}
    >
      <span className="flex items-center gap-1.5">
        {dot && (
          <span
            className={`
              inline-block w-[5px] h-[5px] rounded-full
              ${dot === "live" ? "bg-[var(--accent)] animate-live" : "bg-[var(--ink-ghost)]"}
            `}
          />
        )}
        {label}
      </span>
    </div>
  );
}
