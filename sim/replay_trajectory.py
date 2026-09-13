#!/usr/bin/env python3
"""Replay a recorded trajectory to the web app via WebSocket.

Usage:
    python replay_trajectory.py                    # replay trajectory.json
    python replay_trajectory.py --file custom.json  # replay custom file
    python replay_trajectory.py --speed 2.0        # 2x speed
"""

import argparse
import json
import os
import time

try:
    import websockets.sync.client
except ImportError:
    print("Install websockets: pip install websockets")
    raise SystemExit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WS_URL = "ws://localhost:8080"


def main():
    parser = argparse.ArgumentParser(description="Replay MuJoCo trajectory to web app")
    parser.add_argument("--file", default=os.path.join(SCRIPT_DIR, "trajectory.json"))
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--ws-url", default=WS_URL)
    args = parser.parse_args()

    with open(args.file) as f:
        trajectory = json.load(f)

    print(f"Loaded {len(trajectory)} frames from {args.file}")

    ws = websockets.sync.client.connect(args.ws_url)
    print(f"Connected to {args.ws_url}")

    ws.send(json.dumps({"type": "simStart", "data": {"totalSteps": 4}}))

    prev_time = 0.0
    for i, frame in enumerate(trajectory):
        # Compute delay from sim timestamps
        frame_time = frame.get("time", 0)
        dt = max(0, (frame_time - prev_time) / args.speed)
        prev_time = frame_time

        if dt > 0 and dt < 1.0:
            time.sleep(dt)

        ws.send(json.dumps({"type": "simState", "data": frame}))

        if i % 100 == 0:
            step = frame.get("step", "?")
            progress = frame.get("progress", 0)
            print(f"  Frame {i}/{len(trajectory)}: {step} ({progress*100:.0f}%)")

    ws.send(json.dumps({"type": "simComplete", "data": {}}))
    ws.close()
    print("Replay complete!")


if __name__ == "__main__":
    main()
