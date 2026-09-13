#!/usr/bin/env python3
"""Mock data streamer that simulates a BracketBot running the sandwich workflow.

Streams data over WebSocket in the same format as the real bbos data bridge
(see DATA_STREAM.md), so the web visualizer can consume it identically.

Usage:
    pip install websockets
    python mock_stream.py [--port 8765] [--hz 30]
"""

import argparse
import asyncio
import json
import math
import random
import time
from typing import Any

import websockets
import websockets.server

# ---------------------------------------------------------------------------
# Workflow definition
# ---------------------------------------------------------------------------
WORKFLOW_STEPS = [
    {"name": "idle",             "label": "Waiting for command...",              "duration": 3.0},
    {"name": "pulling_toaster",  "label": "Loading & toasting bread",           "duration": 8.0},
    {"name": "picking_lettuce",  "label": "Picking up lettuce",                 "duration": 5.0},
    {"name": "placing_lettuce",  "label": "Placing lettuce on bread",           "duration": 5.0},
    {"name": "picking_bread",    "label": "Picking bread from toaster & plating","duration": 6.0},
    {"name": "navigating",       "label": "Navigating to user",                 "duration": 8.0},
    {"name": "done",             "label": "Sandwich delivered!",                "duration": 4.0},
]

TOTAL_DURATION = sum(s["duration"] for s in WORKFLOW_STEPS)

# ---------------------------------------------------------------------------
# Joint keyframes per workflow step  (URDF space, matching DATA_STREAM.md)
# Left arm: lj0 (prismatic -1.03..0), lj1-lj6 (revolute), left_left_gripper
# Right arm: rj0-rj6, right_left_gripper
# ---------------------------------------------------------------------------
ARM_POSES: dict[str, dict[str, float]] = {
    "idle": {
        "lj0": 0.0, "lj1": 0.0, "lj2": 0.0, "lj3": 0.0,
        "lj4": 0.0, "lj5": 0.0, "lj6": 0.0, "left_left_gripper": 0.0,
        "left_right_gripper": 0.0,
        "rj0": 0.0, "rj1": 0.0, "rj2": 0.0, "rj3": 0.0,
        "rj4": 0.0, "rj5": 0.0, "rj6": 0.0, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
    "pulling_toaster": {
        "lj0": -0.4, "lj1": 0.6, "lj2": -0.8, "lj3": 0.9,
        "lj4": 0.3, "lj5": 0.4, "lj6": 0.2, "left_left_gripper": 0.0,
        "left_right_gripper": 0.0,
        "rj0": 0.0, "rj1": 0.0, "rj2": 0.0, "rj3": 0.0,
        "rj4": 0.0, "rj5": 0.0, "rj6": 0.0, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
    "picking_lettuce": {
        "lj0": 0.0, "lj1": 0.0, "lj2": 0.0, "lj3": 0.0,
        "lj4": 0.0, "lj5": 0.0, "lj6": 0.0, "left_left_gripper": 0.0,
        "left_right_gripper": 0.0,
        "rj0": -0.3, "rj1": 0.5, "rj2": -0.6, "rj3": 1.2,
        "rj4": 0.0, "rj5": 0.3, "rj6": 0.0, "right_left_gripper": 0.8,
        "right_right_gripper": 0.8,
    },
    "placing_lettuce": {
        "lj0": 0.0, "lj1": 0.0, "lj2": 0.0, "lj3": 0.0,
        "lj4": 0.0, "lj5": 0.0, "lj6": 0.0, "left_left_gripper": 0.0,
        "left_right_gripper": 0.0,
        "rj0": -0.5, "rj1": 0.8, "rj2": -0.4, "rj3": 0.6,
        "rj4": 0.2, "rj5": 0.5, "rj6": -0.1, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
    "picking_bread": {
        "lj0": -0.5, "lj1": 0.6, "lj2": -0.8, "lj3": 0.6,
        "lj4": 0.0, "lj5": 0.5, "lj6": 0.0, "left_left_gripper": 0.8,
        "left_right_gripper": 0.8,
        "rj0": 0.0, "rj1": 0.0, "rj2": 0.0, "rj3": 0.0,
        "rj4": 0.0, "rj5": 0.0, "rj6": 0.0, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
    "navigating": {
        "lj0": -0.2, "lj1": 0.3, "lj2": -0.3, "lj3": 0.4,
        "lj4": 0.0, "lj5": 0.2, "lj6": 0.0, "left_left_gripper": 0.8,
        "left_right_gripper": 0.8,
        "rj0": -0.2, "rj1": 0.3, "rj2": -0.3, "rj3": 0.4,
        "rj4": 0.0, "rj5": 0.2, "rj6": 0.0, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
    "done": {
        "lj0": 0.0, "lj1": 0.0, "lj2": 0.0, "lj3": 0.0,
        "lj4": 0.0, "lj5": 0.0, "lj6": 0.0, "left_left_gripper": 0.0,
        "left_right_gripper": 0.0,
        "rj0": 0.0, "rj1": 0.0, "rj2": 0.0, "rj3": 0.0,
        "rj4": 0.0, "rj5": 0.0, "rj6": 0.0, "right_left_gripper": 0.0,
        "right_right_gripper": 0.0,
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ease_in_out(t: float) -> float:
    if t < 0.5:
        return 2 * t * t
    return 1 - (-2 * t + 2) ** 2 / 2


def lerp_dict(a: dict[str, float], b: dict[str, float], t: float) -> dict[str, float]:
    t = ease_in_out(max(0.0, min(1.0, t)))
    out = {}
    for k in set(list(a.keys()) + list(b.keys())):
        va = a.get(k, 0.0)
        vb = b.get(k, 0.0)
        out[k] = round(va + (vb - va) * t, 6)
    return out


def timestamp_ns() -> int:
    return int(time.time() * 1e9)


def round_dict(d: dict, decimals: int = 6) -> dict:
    return {k: round(v, decimals) if isinstance(v, float) else v for k, v in d.items()}


# ---------------------------------------------------------------------------
# Workflow state machine
# ---------------------------------------------------------------------------

class WorkflowSim:
    def __init__(self):
        self.start_time = time.time()
        self.loop = True

    def get_state(self, now: float) -> dict[str, Any]:
        elapsed = (now - self.start_time) % TOTAL_DURATION if self.loop else (now - self.start_time)

        # Find current step
        acc = 0.0
        step_idx = 0
        step_progress = 0.0
        current_step = WORKFLOW_STEPS[0]
        prev_step_name = "idle"

        for i, step in enumerate(WORKFLOW_STEPS):
            if elapsed < acc + step["duration"]:
                step_idx = i
                step_progress = (elapsed - acc) / step["duration"]
                current_step = step
                prev_step_name = WORKFLOW_STEPS[max(0, i - 1)]["name"]
                break
            acc += step["duration"]
        else:
            step_idx = len(WORKFLOW_STEPS) - 1
            step_progress = 1.0
            current_step = WORKFLOW_STEPS[-1]
            prev_step_name = WORKFLOW_STEPS[-2]["name"]

        # Interpolate joint angles between previous and current pose
        prev_pose = ARM_POSES.get(prev_step_name, ARM_POSES["idle"])
        curr_pose = ARM_POSES.get(current_step["name"], ARM_POSES["idle"])
        joints = lerp_dict(prev_pose, curr_pose, step_progress)

        # Add small noise to simulate real sensor jitter
        for k in joints:
            joints[k] += random.gauss(0, 0.001)
            joints[k] = round(joints[k], 6)

        # Overall progress
        total_elapsed = sum(s["duration"] for s in WORKFLOW_STEPS[:step_idx]) + step_progress * current_step["duration"]
        overall_progress = total_elapsed / TOTAL_DURATION

        # Robot position (moves during navigation)
        robot_x, robot_y = 2.0, 2.0
        user_x, user_y = 8.0, 8.0
        if current_step["name"] == "navigating":
            robot_x = 2.0 + (user_x - 2.0) * step_progress
            robot_y = 2.0 + (user_y - 2.0) * step_progress
        elif current_step["name"] == "done":
            robot_x, robot_y = user_x, user_y

        return {
            "step_name": current_step["name"],
            "step_label": current_step["label"],
            "step_index": step_idx,
            "step_progress": round(step_progress, 4),
            "overall_progress": round(overall_progress, 4),
            "joints": joints,
            "robot_position": {"x": round(robot_x, 2), "y": round(robot_y, 2)},
            "user_position": {"x": user_x, "y": user_y},
            "estimated_time_left": round(TOTAL_DURATION - total_elapsed, 1),
        }


# ---------------------------------------------------------------------------
# Build messages matching DATA_STREAM.md format
# ---------------------------------------------------------------------------

def build_schema() -> dict:
    """Matches the schema message from the real data bridge."""
    ts = time.time()
    return {
        "type": "schema",
        "hostname": "bracketbot-mock",
        "server_time": ts,
        "schema_version": 1,
        "channels": {
            "arm_left.state": {
                "name": "arm_left.state", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 15,
                "measured_hz": 66.0, "connected": True, "heavy": False,
                "stale_s": 0.01,
                "fields": [
                    {"name": "pos", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "vel", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "torque", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "temp", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "current", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "arm_right.state": {
                "name": "arm_right.state", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 15,
                "measured_hz": 66.0, "connected": True, "heavy": False,
                "stale_s": 0.01,
                "fields": [
                    {"name": "pos", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "vel", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "torque", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "temp", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "current", "dtype": "<f4", "shape": [8], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "imu.orientation": {
                "name": "imu.orientation", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 10,
                "measured_hz": 100.0, "connected": True, "heavy": False,
                "stale_s": 0.005,
                "fields": [
                    {"name": "rpy", "dtype": "<f4", "shape": [3], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "imu.raw": {
                "name": "imu.raw", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 10,
                "measured_hz": 100.0, "connected": True, "heavy": False,
                "stale_s": 0.005,
                "fields": [
                    {"name": "accel", "dtype": "<f4", "shape": [3], "encoding": "json"},
                    {"name": "gyro", "dtype": "<f4", "shape": [3], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "drive.state": {
                "name": "drive.state", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 10,
                "measured_hz": 100.0, "connected": True, "heavy": False,
                "stale_s": 0.005,
                "fields": [
                    {"name": "vel", "dtype": "<f4", "shape": [2], "encoding": "json"},
                    {"name": "torque", "dtype": "<f4", "shape": [2], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "drive.status": {
                "name": "drive.status", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 10000,
                "measured_hz": 0.1, "connected": True, "heavy": False,
                "stale_s": 5.0,
                "fields": [
                    {"name": "voltage", "dtype": "<f4", "shape": [], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "camera.head.jpeg": {
                "name": "camera.head.jpeg", "kind": "jpeg",
                "owner": "mock_stream.py", "period_ms": 33,
                "measured_hz": 30.0, "connected": True, "heavy": True,
                "stale_s": 0.02,
                "fields": [
                    {"name": "jpeg_len", "dtype": "<i4", "shape": [], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "camera.left.jpeg": {
                "name": "camera.left.jpeg", "kind": "jpeg",
                "owner": "mock_stream.py", "period_ms": 33,
                "measured_hz": 30.0, "connected": True, "heavy": True,
                "stale_s": 0.02,
                "fields": [
                    {"name": "jpeg_len", "dtype": "<i4", "shape": [], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "camera.right.jpeg": {
                "name": "camera.right.jpeg", "kind": "jpeg",
                "owner": "mock_stream.py", "period_ms": 33,
                "measured_hz": 30.0, "connected": True, "heavy": True,
                "stale_s": 0.02,
                "fields": [
                    {"name": "jpeg_len", "dtype": "<i4", "shape": [], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "led.state": {
                "name": "led.state", "kind": "struct",
                "owner": "mock_stream.py", "period_ms": 200,
                "measured_hz": 5.0, "connected": True, "heavy": False,
                "stale_s": 0.1,
                "fields": [
                    {"name": "rgb", "dtype": "|u1", "shape": [3], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
            "mic.audio": {
                "name": "mic.audio", "kind": "audio",
                "owner": "mock_stream.py", "period_ms": 100,
                "measured_hz": 10.0, "connected": True, "heavy": False,
                "stale_s": 0.05,
                "fields": [
                    {"name": "rms_dbfs", "dtype": "<f4", "shape": [], "encoding": "json"},
                    {"name": "peak_dbfs", "dtype": "<f4", "shape": [], "encoding": "json"},
                    {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"},
                ],
            },
        },
        "derived": ["derived.arm_left", "derived.arm_right", "derived.urdf_joints"],
        "robot": {
            "urdf_url": "/urdf/robot.urdf",
            "root_link": "root",
            "T_root_arm_base": [
                [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0.0304], [0, 0, 0, 1]
            ],
            "movable_joints": [
                {"name": "lj0", "type": "prismatic", "lower": -1.03, "upper": 0.0},
                {"name": "lj1", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "lj2", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "lj3", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "lj4", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "lj5", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "lj6", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "left_left_gripper", "type": "revolute", "lower": 0, "upper": 1},
                {"name": "rj0", "type": "prismatic", "lower": -1.03, "upper": 0.0},
                {"name": "rj1", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "rj2", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "rj3", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "rj4", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "rj5", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "rj6", "type": "revolute", "lower": -2.09, "upper": 2.09},
                {"name": "right_left_gripper", "type": "revolute", "lower": 0, "upper": 1},
            ],
            "mimic_joints": {
                "left_right_gripper": {"joint": "left_left_gripper", "multiplier": 1, "offset": 0},
                "right_right_gripper": {"joint": "right_left_gripper", "multiplier": 1, "offset": 0},
            },
            "arms": {},
        },
    }


def build_update(sim: WorkflowSim) -> dict:
    """Build an update message matching the real bridge format."""
    now = time.time()
    state = sim.get_state(now)
    ts = timestamp_ns()
    joints = state["joints"]

    # Extract per-arm joint arrays (motor turns — in mock we just use URDF values)
    left_pos = [joints.get(f"lj{i}", 0.0) for i in range(7)] + [joints.get("left_left_gripper", 0.0)]
    right_pos = [joints.get(f"rj{i}", 0.0) for i in range(7)] + [joints.get("right_left_gripper", 0.0)]

    # Small random velocities
    left_vel = [round(random.gauss(0, 0.05), 4) for _ in range(8)]
    right_vel = [round(random.gauss(0, 0.05), 4) for _ in range(8)]

    # Temperatures ~35-40°C
    left_temp = [round(35 + random.random() * 5, 1) for _ in range(8)]
    right_temp = [round(35 + random.random() * 5, 1) for _ in range(8)]

    # Currents ~0.1-0.5A
    left_current = [round(0.1 + random.random() * 0.4, 3) for _ in range(8)]
    right_current = [round(0.1 + random.random() * 0.4, 3) for _ in range(8)]

    # Torques
    left_torque = [round(random.gauss(0, 0.3), 3) for _ in range(8)]
    right_torque = [round(random.gauss(0, 0.3), 3) for _ in range(8)]

    # IMU — slight wobble for self-balancing
    imu_roll = round(random.gauss(0, 0.5), 2)
    imu_pitch = round(5.0 + random.gauss(0, 0.3), 2)  # slight forward lean
    imu_yaw = round(random.gauss(0, 1.0), 2)

    # Drive
    is_nav = state["step_name"] == "navigating"
    drive_vel = [round(0.2 + random.gauss(0, 0.02), 3), round(random.gauss(0, 0.05), 3)] if is_nav else [0.0, 0.0]

    # LED color based on step
    led_colors = {
        "idle": [0, 0, 50],
        "pulling_toaster": [255, 165, 0],
        "picking_lettuce": [0, 200, 0],
        "placing_lettuce": [0, 200, 100],
        "picking_bread": [255, 200, 0],
        "navigating": [0, 100, 255],
        "done": [0, 255, 0],
    }
    led = led_colors.get(state["step_name"], [100, 100, 100])

    channels: dict[str, Any] = {
        "arm_left.state": {
            "timestamp_ns": ts,
            "pos": [round(v, 6) for v in left_pos],
            "vel": left_vel,
            "torque": left_torque,
            "temp": left_temp,
            "current": left_current,
        },
        "arm_right.state": {
            "timestamp_ns": ts,
            "pos": [round(v, 6) for v in right_pos],
            "vel": right_vel,
            "torque": right_torque,
            "temp": right_temp,
            "current": right_current,
        },
        "derived.arm_left": {
            "timestamp_ns": ts,
            "joint_names": ["lj0", "lj1", "lj2", "lj3", "lj4", "lj5", "lj6", "left_left_gripper"],
            "motor_pos_turns": [round(v, 6) for v in left_pos],
            "urdf_q": [round(v, 6) for v in left_pos],
            "urdf_joints": {
                "lj0": joints.get("lj0", 0.0),
                "lj1": joints.get("lj1", 0.0),
                "lj2": joints.get("lj2", 0.0),
                "lj3": joints.get("lj3", 0.0),
                "lj4": joints.get("lj4", 0.0),
                "lj5": joints.get("lj5", 0.0),
                "lj6": joints.get("lj6", 0.0),
                "left_left_gripper": joints.get("left_left_gripper", 0.0),
                "left_right_gripper": joints.get("left_right_gripper", 0.0),
            },
            "gripper": joints.get("left_left_gripper", 0.0),
            "ee_link": "left_eef",
            "ee_arm_base": {"pos": [0.3, 0.07, 0.99], "quat_xyzw": [-0.78, 0.04, -0.61, -0.1]},
            "ee_root": {"pos": [0.3, 0.07, 1.02], "quat_xyzw": [-0.78, 0.04, -0.61, -0.1]},
        },
        "derived.arm_right": {
            "timestamp_ns": ts,
            "joint_names": ["rj0", "rj1", "rj2", "rj3", "rj4", "rj5", "rj6", "right_left_gripper"],
            "motor_pos_turns": [round(v, 6) for v in right_pos],
            "urdf_q": [round(v, 6) for v in right_pos],
            "urdf_joints": {
                "rj0": joints.get("rj0", 0.0),
                "rj1": joints.get("rj1", 0.0),
                "rj2": joints.get("rj2", 0.0),
                "rj3": joints.get("rj3", 0.0),
                "rj4": joints.get("rj4", 0.0),
                "rj5": joints.get("rj5", 0.0),
                "rj6": joints.get("rj6", 0.0),
                "right_left_gripper": joints.get("right_left_gripper", 0.0),
                "right_right_gripper": joints.get("right_right_gripper", 0.0),
            },
            "gripper": joints.get("right_left_gripper", 0.0),
            "ee_link": "right_eef",
            "ee_arm_base": {"pos": [0.3, -0.07, 0.99], "quat_xyzw": [-0.78, -0.04, -0.61, 0.1]},
            "ee_root": {"pos": [0.3, -0.07, 1.02], "quat_xyzw": [-0.78, -0.04, -0.61, 0.1]},
        },
        "derived.urdf_joints": {
            "timestamp_ns": ts,
            "joints": joints,
        },
        "imu.orientation": {
            "timestamp_ns": ts,
            "rpy": [imu_roll, imu_pitch, imu_yaw],
        },
        "imu.raw": {
            "timestamp_ns": ts,
            "accel": [
                round(random.gauss(0, 0.1), 3),
                round(random.gauss(0, 0.1), 3),
                round(9.81 + random.gauss(0, 0.05), 3),
            ],
            "gyro": [
                round(random.gauss(0, 0.02), 4),
                round(random.gauss(0, 0.02), 4),
                round(random.gauss(0, 0.02), 4),
            ],
        },
        "drive.state": {
            "timestamp_ns": ts,
            "vel": drive_vel,
            "torque": [round(random.gauss(0, 0.1), 3), round(random.gauss(0, 0.1), 3)],
        },
        "drive.status": {
            "timestamp_ns": ts,
            "voltage": round(24.0 + random.gauss(0, 0.3), 1),
        },
        "led.state": {
            "timestamp_ns": ts,
            "rgb": led,
        },
        "mic.audio": {
            "timestamp_ns": ts,
            "rms_dbfs": round(-40 + random.gauss(0, 5), 1),
            "peak_dbfs": round(-30 + random.gauss(0, 5), 1),
        },
    }

    # Also include workflow-level metadata as a custom channel
    channels["workflow.state"] = {
        "timestamp_ns": ts,
        "step": state["step_name"],
        "step_label": state["step_label"],
        "step_index": state["step_index"],
        "step_progress": state["step_progress"],
        "overall_progress": state["overall_progress"],
        "robot_position": state["robot_position"],
        "user_position": state["user_position"],
        "estimated_time_left": state["estimated_time_left"],
    }

    return {
        "type": "update",
        "server_time": now,
        "channels": channels,
    }


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------

async def handler(websocket: websockets.server.WebSocketServerProtocol):
    sim = WorkflowSim()
    print(f"[+] Client connected from {websocket.remote_address}")

    # Send schema first (per DATA_STREAM.md protocol)
    try:
        await websocket.send(json.dumps(build_schema()))
    except websockets.exceptions.ConnectionClosed:
        return

    hz = 30.0
    # Check query params for hz
    if websocket.request and hasattr(websocket.request, 'path'):
        path = str(websocket.request.path)
        if "hz=" in path:
            try:
                hz = float(path.split("hz=")[1].split("&")[0])
            except ValueError:
                pass

    period = 1.0 / hz
    print(f"[+] Streaming at {hz} Hz")

    try:
        while True:
            msg = build_update(sim)
            await websocket.send(json.dumps(msg))
            await asyncio.sleep(period)
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Client disconnected")


async def main(host: str, port: int, hz: float):
    print(f"[+] Mock data bridge on ws://{host}:{port}/ws  ({hz} Hz default)")
    print(f"[+] Workflow loops every {TOTAL_DURATION:.0f}s through {len(WORKFLOW_STEPS)} steps")

    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mock BracketBot data streamer")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--hz", type=float, default=30.0)
    args = parser.parse_args()
    asyncio.run(main(args.host, args.port, args.hz))
