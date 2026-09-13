"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TaskState } from "./taskSequencer";

const WS_URL = "ws://localhost:8080";

export interface SimState {
  jointAngles: Record<string, number>;
  step: string;
  stepIndex: number;
  progress: number;
  time: number;
}

type MessageHandler = (msg: { type: string; data: unknown }) => void;

export function useWebSocket() {
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [simState, setSimState] = useState<SimState | null>(null);
  const [simActive, setSimActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, MessageHandler>>(new Map());

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case "taskState":
              setTaskState(msg.data as TaskState);
              break;
            case "simState":
              setSimState(msg.data as SimState);
              break;
            case "simStart":
              setSimActive(true);
              break;
            case "simComplete":
              setSimActive(false);
              break;
          }
          // Also call any registered one-shot handler
          const handler = handlersRef.current.get(msg.type);
          if (handler) {
            handlersRef.current.delete(msg.type);
            handler(msg);
          }
        } catch {}
      };
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const send = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  const sendAndWait = useCallback(
    (type: string, data: unknown, responseType: string): Promise<unknown> => {
      return new Promise((resolve) => {
        handlersRef.current.set(responseType, (msg) => resolve(msg.data));
        send(type, data);
        // Timeout after 5s
        setTimeout(() => {
          if (handlersRef.current.has(responseType)) {
            handlersRef.current.delete(responseType);
            resolve(null);
          }
        }, 5000);
      });
    },
    [send]
  );

  return { taskState, simState, simActive, connected, send, sendAndWait };
}
