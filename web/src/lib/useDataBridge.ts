"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface BridgeSchema {
  hostname: string;
  server_time: number;
  schema_version: number;
  channels: Record<string, unknown>;
  derived: string[];
  robot: Record<string, unknown>;
}

export interface WorkflowState {
  step: string;
  step_label: string;
  step_index: number;
  step_progress: number;
  overall_progress: number;
  robot_position: { x: number; y: number };
  user_position: { x: number; y: number };
  estimated_time_left: number;
}

export interface UrdfJoints {
  timestamp_ns: number;
  joints: Record<string, number>;
}

export interface ImuOrientation {
  rpy: [number, number, number];
}

export interface ArmState {
  timestamp_ns: number;
  pos: number[];
  vel: number[];
  torque: number[];
  temp: number[];
  current: number[];
}

export interface DriveStatus {
  voltage: number;
}

export interface LedState {
  rgb: [number, number, number];
}

export interface BridgeState {
  connected: boolean;
  schema: BridgeSchema | null;
  urdfJoints: UrdfJoints | null;
  workflow: WorkflowState | null;
  imu: ImuOrientation | null;
  armLeft: ArmState | null;
  armRight: ArmState | null;
  driveStatus: DriveStatus | null;
  led: LedState | null;
  serverTime: number;
}

const WS_URL = "ws://localhost:8765";

export function useDataBridge(): BridgeState {
  const [connected, setConnected] = useState(false);
  const [schema, setSchema] = useState<BridgeSchema | null>(null);
  const [urdfJoints, setUrdfJoints] = useState<UrdfJoints | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [imu, setImu] = useState<ImuOrientation | null>(null);
  const [armLeft, setArmLeft] = useState<ArmState | null>(null);
  const [armRight, setArmRight] = useState<ArmState | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [led, setLed] = useState<LedState | null>(null);
  const [serverTime, setServerTime] = useState(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "schema") {
            setSchema(msg);
            return;
          }

          if (msg.type === "update" && msg.channels) {
            setServerTime(msg.server_time);
            const ch = msg.channels;

            if (ch["derived.urdf_joints"]) {
              setUrdfJoints(ch["derived.urdf_joints"]);
            }
            if (ch["workflow.state"]) {
              setWorkflow(ch["workflow.state"]);
            }
            if (ch["imu.orientation"]) {
              setImu(ch["imu.orientation"]);
            }
            if (ch["arm_left.state"]) {
              setArmLeft(ch["arm_left.state"]);
            }
            if (ch["arm_right.state"]) {
              setArmRight(ch["arm_right.state"]);
            }
            if (ch["drive.status"]) {
              setDriveStatus(ch["drive.status"]);
            }
            if (ch["led.state"]) {
              setLed(ch["led.state"]);
            }
          }
        } catch {
          // ignore parse errors
        }
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return {
    connected,
    schema,
    urdfJoints,
    workflow,
    imu,
    armLeft,
    armRight,
    driveStatus,
    led,
    serverTime,
  };
}
