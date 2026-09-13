"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";

interface PanelConfig {
  id: string;
  title: string;
  content: ReactNode;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

interface PanelState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

interface DraggableLayoutProps {
  panels: PanelConfig[];
  children?: ReactNode;
}

function DraggablePanel({
  config,
  state,
  onDragStart,
  onBringToFront,
}: {
  config: PanelConfig;
  state: PanelState;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onBringToFront: (id: string) => void;
}) {
  return (
    <div
      className="absolute select-none"
      style={{
        left: state.x,
        top: state.y,
        width: state.w,
        height: state.h,
        zIndex: state.z,
        animation: "fade-up 0.3s ease-out both",
      }}
      onPointerDownCapture={() => onBringToFront(state.id)}
    >
      <div className="w-full h-full flex flex-col overflow-hidden border border-[var(--panel-border)] bg-[var(--panel-bg)] backdrop-blur-sm">
        {/* Drag handle — stark, technical */}
        <div
          className="flex items-center justify-between px-3 py-[5px] border-b border-[var(--panel-border)] cursor-grab active:cursor-grabbing shrink-0"
          onPointerDown={(e) => onDragStart(state.id, e)}
        >
          <span className="text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
            {config.title}
          </span>
          <svg width="14" height="6" viewBox="0 0 14 6" className="text-[var(--ink-ghost)]">
            <line x1="0" y1="1" x2="14" y2="1" stroke="currentColor" strokeWidth="0.5" />
            <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="0.5" />
            <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="0.5" />
          </svg>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {config.content}
        </div>
      </div>
    </div>
  );
}

export default function DraggableLayout({ panels }: DraggableLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelStates, setPanelStates] = useState<PanelState[]>([]);
  const [maxZ, setMaxZ] = useState(10);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    panelStartX: number;
    panelStartY: number;
  } | null>(null);

  useEffect(() => {
    if (panelStates.length > 0) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const g = 10;
    const states: PanelState[] = [];

    const layouts = [
      // 3D Sim — large, top-left
      { x: g, y: g, w: Math.floor(rect.width * 0.57), h: Math.floor(rect.height * 0.64) },
      // Head camera — top-right
      { x: Math.floor(rect.width * 0.57) + g * 2, y: g, w: Math.floor(rect.width * 0.41) - g * 2, h: Math.floor(rect.height * 0.22) },
      // Left camera — mid-right
      { x: Math.floor(rect.width * 0.57) + g * 2, y: Math.floor(rect.height * 0.22) + g * 2, w: Math.floor(rect.width * 0.205) - g, h: Math.floor(rect.height * 0.21) },
      // Right camera — next to left
      { x: Math.floor(rect.width * 0.775) + g, y: Math.floor(rect.height * 0.22) + g * 2, w: Math.floor(rect.width * 0.205) - g, h: Math.floor(rect.height * 0.21) },
      // Language — bottom-left
      { x: g, y: Math.floor(rect.height * 0.64) + g * 2, w: Math.floor(rect.width * 0.34), h: Math.floor(rect.height * 0.34) - g * 4 },
      // Actions — bottom-center
      { x: Math.floor(rect.width * 0.34) + g * 2, y: Math.floor(rect.height * 0.64) + g * 2, w: Math.floor(rect.width * 0.26), h: Math.floor(rect.height * 0.34) - g * 4 },
      // Telemetry — right column lower
      { x: Math.floor(rect.width * 0.60) + g * 3, y: Math.floor(rect.height * 0.43) + g * 2, w: Math.floor(rect.width * 0.38) - g * 4, h: Math.floor(rect.height * 0.55) - g * 4 },
    ];

    panels.forEach((panel, i) => {
      const layout = layouts[i] || { x: g + i * 20, y: g + i * 20, w: panel.defaultWidth, h: panel.defaultHeight };
      states.push({ id: panel.id, x: layout.x, y: layout.y, w: layout.w, h: layout.h, z: 10 + i });
    });

    setPanelStates(states);
    setMaxZ(10 + panels.length);
  }, [panels, panelStates.length]);

  const handleDragStart = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = panelStates.find((p) => p.id === id);
    if (!panel) return;

    dragRef.current = { id, startX: e.clientX, startY: e.clientY, panelStartX: panel.x, panelStartY: panel.y };

    const handleMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      setPanelStates((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, x: dragRef.current!.panelStartX + me.clientX - dragRef.current!.startX, y: dragRef.current!.panelStartY + me.clientY - dragRef.current!.startY }
            : p
        )
      );
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [panelStates]);

  const bringToFront = useCallback((id: string) => {
    setMaxZ((z) => {
      const newZ = z + 1;
      setPanelStates((prev) => prev.map((p) => (p.id === id ? { ...p, z: newZ } : p)));
      return newZ;
    });
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {panelStates.map((state) => {
        const config = panels.find((p) => p.id === state.id);
        if (!config) return null;
        return (
          <DraggablePanel
            key={state.id}
            config={config}
            state={state}
            onDragStart={handleDragStart}
            onBringToFront={bringToFront}
          />
        );
      })}
    </div>
  );
}
