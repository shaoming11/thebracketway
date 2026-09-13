#!/usr/bin/env python3
"""
Replay keyframes recorded from the web app in MuJoCo.

Reads keyframes.json (saved by the web app), then plays them back:
  - In the MuJoCo viewer (native window on your Mac)
  - Optionally streams to the web app via WebSocket

Usage:
    python play_keyframes.py                  # viewer only
    python play_keyframes.py --ws             # viewer + stream to web app
    python play_keyframes.py --file custom.json
"""

import argparse
import json
import os
import time

import numpy as np
import mujoco

try:
    import mujoco.viewer as mjviewer
    HAS_VIEWER = True
except ImportError:
    HAS_VIEWER = False

try:
    import websockets.sync.client
    HAS_WS = True
except ImportError:
    HAS_WS = False

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCENE_PATH = os.path.join(SCRIPT_DIR, "scene.xml")
KEYFRAMES_PATH = os.path.join(SCRIPT_DIR, "keyframes.json")
WS_URL = "ws://localhost:8080"

# Map from web app joint names to MuJoCo joint names
JOINT_NAME_MAP = {
    "rj0": "rj0", "rj1": "rj1", "rj2": "rj2", "rj3": "rj3",
    "rj4": "rj4", "rj5": "rj5", "rj6": "rj6",
    "right_left_gripper": "right_left_gripper",
    "lj0": "lj0", "lj1": "lj1", "lj2": "lj2", "lj3": "lj3",
    "lj4": "lj4", "lj5": "lj5", "lj6": "lj6",
    "left_left_gripper": "left_left_gripper",
}

# Map joint names to actuator names
ACT_NAME_MAP = {
    "rj0": "act_rj0", "rj1": "act_rj1", "rj2": "act_rj2", "rj3": "act_rj3",
    "rj4": "act_rj4", "rj5": "act_rj5", "rj6": "act_rj6",
    "right_left_gripper": "act_r_grip",
    "lj0": "act_lj0", "lj1": "act_lj1", "lj2": "act_lj2", "lj3": "act_lj3",
    "lj4": "act_lj4", "lj5": "act_lj5", "lj6": "act_lj6",
    "left_left_gripper": "act_l_grip",
}


def main():
    parser = argparse.ArgumentParser(description="Play keyframes in MuJoCo")
    parser.add_argument("--file", default=KEYFRAMES_PATH, help="Keyframes JSON file")
    parser.add_argument("--ws", action="store_true", help="Stream to web app via WebSocket")
    parser.add_argument("--no-viewer", action="store_true", help="Run without viewer")
    parser.add_argument("--loop", action="store_true", help="Loop the keyframe sequence")
    args = parser.parse_args()

    # Load keyframes
    with open(args.file) as f:
        keyframes = json.load(f)

    print(f"Loaded {len(keyframes)} keyframes from {args.file}")
    for i, kf in enumerate(keyframes):
        print(f"  [{i}] {kf['name']} ({kf['duration']}s)")

    # Load MuJoCo model
    model = mujoco.MjModel.from_xml_path(SCENE_PATH)
    data = mujoco.MjData(model)
    mujoco.mj_resetData(model, data)
    mujoco.mj_forward(model, data)

    # Build actuator ID map
    act_ids = {}
    joint_ids = {}
    for web_name, mj_name in JOINT_NAME_MAP.items():
        jid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, mj_name)
        if jid >= 0:
            joint_ids[web_name] = jid
        act_name = ACT_NAME_MAP.get(web_name)
        if act_name:
            aid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, act_name)
            if aid >= 0:
                act_ids[web_name] = aid

    print(f"Mapped {len(act_ids)} actuators")

    # WebSocket
    ws = None
    if args.ws and HAS_WS:
        try:
            ws = websockets.sync.client.connect(WS_URL)
            ws.send(json.dumps({"type": "simStart", "data": {"totalSteps": len(keyframes)}}))
            print(f"Connected to {WS_URL}")
        except Exception as e:
            print(f"WebSocket connection failed: {e}")

    # Viewer
    viewer_handle = None
    if not args.no_viewer and HAS_VIEWER:
        print("Launching MuJoCo viewer...")
        viewer_handle = mjviewer.launch_passive(model, data)

    def get_joint_pos(jname):
        if jname in joint_ids:
            qadr = model.jnt_qposadr[joint_ids[jname]]
            return float(data.qpos[qadr])
        return 0.0

    def send_state(step_idx, progress):
        if not ws:
            return
        angles = {}
        for jname, jid in joint_ids.items():
            qadr = model.jnt_qposadr[jid]
            angles[jname] = float(data.qpos[qadr])
        try:
            ws.send(json.dumps({
                "type": "simState",
                "data": {
                    "jointAngles": angles,
                    "step": keyframes[min(step_idx, len(keyframes)-1)]["name"],
                    "stepIndex": step_idx,
                    "progress": progress,
                    "time": float(data.time),
                }
            }))
        except Exception:
            pass

    dt = model.opt.timestep
    wall_start = time.perf_counter()

    def play_once():
        nonlocal wall_start
        wall_start = time.perf_counter()

        for ki, kf in enumerate(keyframes):
            duration = kf["duration"]
            n_steps = int(duration / dt)
            send_interval = max(1, n_steps // 30)

            # Get current positions as start
            start = {jname: get_joint_pos(jname) for jname in kf["pose"]}
            target = kf["pose"]

            print(f"  Playing [{ki}] {kf['name']} ({duration}s, {n_steps} steps)")

            for i in range(n_steps):
                t = min(1.0, i / max(1, n_steps - 1))
                t_smooth = 0.5 * (1 - np.cos(np.pi * t))

                for jname, tgt in target.items():
                    if jname in act_ids:
                        s = start.get(jname, 0.0)
                        data.ctrl[act_ids[jname]] = s + (tgt - s) * t_smooth

                mujoco.mj_step(model, data)

                if viewer_handle:
                    viewer_handle.sync()

                # Real-time sync
                elapsed_wall = time.perf_counter() - wall_start
                sleep_time = data.time - elapsed_wall
                if sleep_time > 0:
                    time.sleep(sleep_time)

                if i % send_interval == 0:
                    progress = (ki + t) / len(keyframes)
                    send_state(ki, progress)

        send_state(len(keyframes), 1.0)

    try:
        while True:
            print("\nPlaying keyframe sequence...")
            play_once()
            print("Sequence complete!")

            if not args.loop:
                break

            print("Looping...")
            mujoco.mj_resetData(model, data)
            mujoco.mj_forward(model, data)

    except KeyboardInterrupt:
        print("\nStopped.")

    if ws:
        ws.send(json.dumps({"type": "simComplete", "data": {}}))
        ws.close()

    if viewer_handle:
        print("Viewer open — close window to exit.")
        while viewer_handle.is_running():
            time.sleep(0.1)


if __name__ == "__main__":
    main()
