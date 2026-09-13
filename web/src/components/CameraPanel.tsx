"use client";

import { useEffect, useRef, useState } from "react";

interface CameraPanelProps {
  label: string;
  cameraIndex?: number;
}

export default function CameraPanel({ label, cameraIndex = 0 }: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setActive(true);
        }
      } catch {
        setError(true);
      }
    }

    startCamera();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [cameraIndex]);

  return (
    <div className="w-full h-full relative bg-[var(--canvas-warm)] overflow-hidden">
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[10px] text-[var(--ink-ghost)] uppercase tracking-[0.2em]">No signal</p>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: cameraIndex === 0 ? "scaleX(-1)" : "none",
            filter: cameraIndex === 1 ? "hue-rotate(15deg) saturate(1.05)" : cameraIndex === 2 ? "hue-rotate(-15deg) saturate(0.95)" : "none",
          }}
        />
      )}

      {/* Label — top-left, minimal */}
      <div className="absolute top-0 left-0 px-2 py-1 bg-[var(--canvas)]/80 border-r border-b border-[var(--panel-border)]">
        <span className="flex items-center gap-1.5">
          {active && (
            <span className="inline-block w-[4px] h-[4px] rounded-full bg-red-500 animate-live" />
          )}
          <span className="text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">{label}</span>
        </span>
      </div>

      {active && (
        <div className="absolute bottom-0 right-0 px-1.5 py-0.5 bg-[var(--canvas)]/80 border-l border-t border-[var(--panel-border)]">
          <span className="text-[8px] tabular-nums text-[var(--ink-ghost)]">30fps</span>
        </div>
      )}
    </div>
  );
}
