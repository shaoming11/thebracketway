#!/usr/bin/env python3
"""
BracketWay MuJoCo Sandwich-Making Simulation

Runs the full sandwich task sequence in MuJoCo with the BracketBot URDF:
  1. Pull down toaster lever (right arm)
  2. Pick up lettuce (left arm)
  3. Place lettuce on bread (left arm)
  4. Pick bread from toaster & place on plate (right arm)

Opens the MuJoCo viewer by default so you can watch the robot.
Streams joint states via WebSocket to the web app for live 3D replay.

Usage:
    python run_sim.py                # viewer + web app streaming
    python run_sim.py --no-viewer    # headless, streams to web app only
    python run_sim.py --fast         # no real-time sync (for recording)
    python run_sim.py --record       # save trajectory to JSON
"""

import argparse
import json
import time
import os

import numpy as np
import mujoco

# Optional imports
try:
    import mujoco.viewer as mjviewer
    HAS_VIEWER = True
except ImportError:
    HAS_VIEWER = False

try:
    import websockets
    import websockets.sync.client
    HAS_WS = True
except ImportError:
    HAS_WS = False

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCENE_PATH = os.path.join(SCRIPT_DIR, "scene.xml")
WS_URL = "ws://localhost:8080"

# Joint name -> actuator index mapping (built at runtime)
# We use short aliases in the task code for readability
JOINT_NAMES = {
    "right": ["rj0", "rj1", "rj2", "rj3", "rj4", "rj5", "rj6", "r_gripper"],
    "left":  ["lj0", "lj1", "lj2", "lj3", "lj4", "lj5", "lj6", "l_gripper"],
}

# Map short aliases to actual URDF/MJCF joint names
JOINT_ALIAS = {
    "r_gripper": "right_left_gripper",
    "l_gripper": "left_left_gripper",
}

# Map short aliases to actuator names
ACT_NAME_MAP = {
    "r_gripper": "act_r_grip",
    "l_gripper": "act_l_grip",
}


class SandwichSim:
    def __init__(self, use_viewer=True, realtime=True, record=False, ws_url=None):
        self.model = mujoco.MjModel.from_xml_path(SCENE_PATH)
        self.data = mujoco.MjData(self.model)
        self.use_viewer = use_viewer and HAS_VIEWER
        self.realtime = realtime
        self.record = record
        self.ws_url = ws_url
        self.ws = None
        self.trajectory = []
        self.viewer_handle = None

        # Build joint/actuator index maps
        self.joint_ids = {}
        self.act_ids = {}
        for arm, names in JOINT_NAMES.items():
            for jname in names:
                # Resolve alias (e.g. r_gripper -> right_left_gripper)
                real_jname = JOINT_ALIAS.get(jname, jname)
                jid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, real_jname)
                if jid >= 0:
                    self.joint_ids[jname] = jid
                # Actuator (check override map first)
                act_name = ACT_NAME_MAP.get(jname, f"act_{jname}")
                aid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_ACTUATOR, act_name)
                if aid >= 0:
                    self.act_ids[jname] = aid

        print(f"Loaded scene: {self.model.nq} qpos, {self.model.nv} qvel, {self.model.nu} actuators")
        print(f"Joint IDs: {self.joint_ids}")
        print(f"Actuator IDs: {self.act_ids}")

    def connect_ws(self):
        """Connect to the Node WebSocket server."""
        if not HAS_WS or not self.ws_url:
            return
        try:
            self.ws = websockets.sync.client.connect(self.ws_url)
            print(f"Connected to WebSocket at {self.ws_url}")
        except Exception as e:
            print(f"Could not connect to WebSocket: {e}")
            self.ws = None

    def send_state(self, step_name="idle", step_index=-1, progress=0.0):
        """Send current joint states + task state to the web app."""
        joint_angles = {}
        for jname, jid in self.joint_ids.items():
            qadr = self.model.jnt_qposadr[jid]
            joint_angles[jname] = float(self.data.qpos[qadr])

        state = {
            "type": "simState",
            "data": {
                "jointAngles": joint_angles,
                "step": step_name,
                "stepIndex": step_index,
                "progress": progress,
                "time": float(self.data.time),
            }
        }

        if self.ws:
            try:
                self.ws.send(json.dumps(state))
            except Exception:
                pass

        if self.record:
            self.trajectory.append(state["data"])

    def set_joint_targets(self, targets: dict):
        """Set position control targets for named joints."""
        for jname, target in targets.items():
            if jname in self.act_ids:
                self.data.ctrl[self.act_ids[jname]] = target

    def get_joint_pos(self, jname: str) -> float:
        """Get current joint position."""
        if jname in self.joint_ids:
            qadr = self.model.jnt_qposadr[self.joint_ids[jname]]
            return float(self.data.qpos[qadr])
        return 0.0

    def get_site_pos(self, site_name: str) -> np.ndarray:
        """Get site position in world frame."""
        sid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_SITE, site_name)
        if sid >= 0:
            return self.data.site_xpos[sid].copy()
        return np.zeros(3)

    def get_body_pos(self, body_name: str) -> np.ndarray:
        """Get body position in world frame."""
        bid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_BODY, body_name)
        if bid >= 0:
            return self.data.body(body_name).xpos.copy()
        return np.zeros(3)

    def step_sim(self, n=1):
        """Step the simulation n times, syncing to real-time and updating viewer."""
        for _ in range(n):
            sim_time_before = self.data.time
            mujoco.mj_step(self.model, self.data)

            # Sync viewer
            if self.viewer_handle is not None:
                self.viewer_handle.sync()

            # Real-time pacing: sleep to match sim time to wall time
            if self.realtime:
                dt = self.model.opt.timestep
                elapsed_wall = time.perf_counter() - self._wall_start
                sim_time = self.data.time
                sleep_time = sim_time - elapsed_wall
                if sleep_time > 0:
                    time.sleep(sleep_time)

    def run_to_targets(self, targets: dict, duration: float, step_name: str,
                       step_index: int, progress_base: float, progress_range: float):
        """Smoothly move joints to targets over duration seconds."""
        dt = self.model.opt.timestep
        n_steps = int(duration / dt)
        send_interval = max(1, n_steps // 60)  # ~60 WS updates over the motion

        # Get starting positions
        start_pos = {jname: self.get_joint_pos(jname) for jname in targets}

        for i in range(n_steps):
            t = min(1.0, i / max(1, n_steps - 1))
            # Smooth ease-in-out
            t_smooth = 0.5 * (1 - np.cos(np.pi * t))

            interpolated = {}
            for jname, target in targets.items():
                interpolated[jname] = start_pos[jname] + (target - start_pos[jname]) * t_smooth

            self.set_joint_targets(interpolated)
            self.step_sim()

            if i % send_interval == 0:
                progress = progress_base + progress_range * t
                self.send_state(step_name, step_index, progress)

    def move_body(self, body_name: str, target_pos: np.ndarray):
        """Teleport a free body to target position (for object manipulation)."""
        bid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_BODY, body_name)
        if bid < 0:
            return
        jid = self.model.body_jntadr[bid]
        if jid < 0:
            return
        qadr = self.model.jnt_qposadr[jid]
        self.data.qpos[qadr:qadr+3] = target_pos
        # Zero velocity
        vadr = self.model.jnt_dofadr[jid]
        self.data.qvel[vadr:vadr+6] = 0

    # ==================== TASK IMPLEMENTATIONS ====================

    def task_pull_toaster(self):
        """Task 1: Right arm reaches toward toaster lever and pushes it down."""
        print("\n--- Task 1: Pulling toaster lever ---")

        # Phase 1: Move right arm to approach the toaster lever (pre-grasp)
        approach = {
            "rj0": -0.3,
            "rj1": 0.4,
            "rj2": -0.6,
            "rj3": 0.8,
            "rj4": 0.0,
            "rj5": -0.3,
            "rj6": 0.0,
            "r_gripper": 0.8,  # open gripper
        }
        self.run_to_targets(approach, 2.0, "pulling_toaster", 0, 0.0, 0.1)

        # Phase 2: Reach to lever
        reach = {
            "rj0": -0.5,
            "rj1": 0.6,
            "rj2": -0.8,
            "rj3": 1.2,
            "rj4": 0.2,
            "rj5": -0.5,
            "rj6": 0.1,
            "r_gripper": 0.3,
        }
        self.run_to_targets(reach, 2.0, "pulling_toaster", 0, 0.1, 0.1)

        # Phase 3: Push lever down
        push_down = dict(reach)
        push_down["rj0"] = -0.8
        push_down["rj3"] = 1.5
        push_down["r_gripper"] = 0.1
        self.run_to_targets(push_down, 2.0, "pulling_toaster", 0, 0.2, 0.05)

        # Actually push the lever down via the joint
        lever_jid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, "toaster_lever_joint")
        if lever_jid >= 0:
            qadr = self.model.jnt_qposadr[lever_jid]
            self.data.qpos[qadr] = -0.05

        # Phase 4: Retract
        retract = {
            "rj0": -0.2,
            "rj1": 0.2,
            "rj2": -0.3,
            "rj3": 0.5,
            "rj4": 0.0,
            "rj5": 0.0,
            "rj6": 0.0,
            "r_gripper": 0.5,
        }
        self.run_to_targets(retract, 1.5, "pulling_toaster", 0, 0.25, 0.0)
        print("  Done!")

    def task_pick_lettuce(self):
        """Task 2: Left arm picks up lettuce from the table."""
        print("\n--- Task 2: Picking up lettuce ---")

        approach = {
            "lj0": -0.3,
            "lj1": -0.4,
            "lj2": 0.6,
            "lj3": -0.8,
            "lj4": 0.0,
            "lj5": 0.3,
            "lj6": 0.0,
            "l_gripper": 0.9,
        }
        self.run_to_targets(approach, 2.0, "picking_lettuce", 1, 0.25, 0.08)

        lower = {
            "lj0": -0.6,
            "lj1": -0.6,
            "lj2": 0.8,
            "lj3": -1.2,
            "lj4": 0.1,
            "lj5": 0.5,
            "lj6": -0.1,
            "l_gripper": 0.9,
        }
        self.run_to_targets(lower, 1.5, "picking_lettuce", 1, 0.33, 0.05)

        grasp = dict(lower)
        grasp["l_gripper"] = 0.05
        self.run_to_targets(grasp, 0.8, "picking_lettuce", 1, 0.38, 0.03)

        lift = dict(grasp)
        lift["lj0"] = -0.3
        lift["lj3"] = -0.6
        self.run_to_targets(lift, 1.5, "picking_lettuce", 1, 0.41, 0.07)

        hand_pos = self.get_body_pos("l_hand")
        if hand_pos is not None:
            self.move_body("lettuce", hand_pos + np.array([0, 0, -0.05]))

        print("  Done!")

    def task_place_lettuce(self):
        """Task 3: Left arm places lettuce on bread on the plate."""
        print("\n--- Task 3: Placing lettuce on bread ---")

        over_bread = {
            "lj0": -0.4,
            "lj1": -0.3,
            "lj2": 0.5,
            "lj3": -1.0,
            "lj4": -0.2,
            "lj5": 0.4,
            "lj6": 0.1,
            "l_gripper": 0.05,
        }
        self.run_to_targets(over_bread, 2.0, "placing_lettuce", 2, 0.5, 0.08)

        hand_pos = self.get_body_pos("l_hand")
        if hand_pos is not None:
            self.move_body("lettuce", hand_pos + np.array([0, 0, -0.05]))

        place = dict(over_bread)
        place["lj0"] = -0.6
        place["lj3"] = -1.3
        self.run_to_targets(place, 1.5, "placing_lettuce", 2, 0.58, 0.05)

        bread_top = self.get_site_pos("bread_top")
        self.move_body("lettuce", bread_top + np.array([0, 0, 0.035]))

        release = dict(place)
        release["l_gripper"] = 0.9
        self.run_to_targets(release, 0.5, "placing_lettuce", 2, 0.63, 0.02)

        retract = {
            "lj0": -0.2,
            "lj1": -0.2,
            "lj2": 0.3,
            "lj3": -0.5,
            "lj4": 0.0,
            "lj5": 0.0,
            "lj6": 0.0,
            "l_gripper": 0.5,
        }
        self.run_to_targets(retract, 1.5, "placing_lettuce", 2, 0.65, 0.1)
        print("  Done!")

    def task_pick_bread_and_plate(self):
        """Task 4: Right arm picks bread from toaster and places on plate."""
        print("\n--- Task 4: Picking bread & plating ---")

        approach = {
            "rj0": -0.4,
            "rj1": 0.5,
            "rj2": -0.7,
            "rj3": 1.0,
            "rj4": 0.0,
            "rj5": -0.4,
            "rj6": 0.0,
            "r_gripper": 0.9,
        }
        self.run_to_targets(approach, 2.0, "picking_bread", 3, 0.75, 0.05)

        reach = {
            "rj0": -0.7,
            "rj1": 0.7,
            "rj2": -0.9,
            "rj3": 1.4,
            "rj4": 0.1,
            "rj5": -0.6,
            "rj6": 0.0,
            "r_gripper": 0.9,
        }
        self.run_to_targets(reach, 1.5, "picking_bread", 3, 0.8, 0.03)

        grasp = dict(reach)
        grasp["r_gripper"] = 0.05
        self.run_to_targets(grasp, 0.8, "picking_bread", 3, 0.83, 0.02)

        lift = dict(grasp)
        lift["rj0"] = -0.3
        lift["rj3"] = 0.8
        self.run_to_targets(lift, 1.5, "picking_bread", 3, 0.85, 0.03)

        hand_pos = self.get_body_pos("r_hand")
        if hand_pos is not None:
            self.move_body("bread_in_toaster", hand_pos + np.array([0, 0, -0.05]))

        over_plate = {
            "rj0": -0.4,
            "rj1": 0.3,
            "rj2": -0.5,
            "rj3": 1.0,
            "rj4": -0.3,
            "rj5": -0.3,
            "rj6": 0.0,
            "r_gripper": 0.05,
        }
        self.run_to_targets(over_plate, 2.0, "picking_bread", 3, 0.88, 0.05)

        hand_pos = self.get_body_pos("r_hand")
        if hand_pos is not None:
            self.move_body("bread_in_toaster", hand_pos + np.array([0, 0, -0.05]))

        lower = dict(over_plate)
        lower["rj0"] = -0.6
        lower["rj3"] = 1.3
        self.run_to_targets(lower, 1.5, "picking_bread", 3, 0.93, 0.03)

        plate_pos = self.get_site_pos("plate_center")
        self.move_body("bread_in_toaster", plate_pos + np.array([0, 0, 0.02]))

        release = dict(lower)
        release["r_gripper"] = 0.9
        self.run_to_targets(release, 0.5, "picking_bread", 3, 0.96, 0.01)

        home = {
            "rj0": 0.0, "rj1": 0.0, "rj2": 0.0, "rj3": 0.0,
            "rj4": 0.0, "rj5": 0.0, "rj6": 0.0, "r_gripper": 0.5,
        }
        self.run_to_targets(home, 2.0, "picking_bread", 3, 0.97, 0.03)
        print("  Done!")

    def run(self):
        """Run the full sandwich-making sequence."""
        self.connect_ws()

        # Reset
        mujoco.mj_resetData(self.model, self.data)
        mujoco.mj_forward(self.model, self.data)

        # Notify web app we're starting
        if self.ws:
            self.ws.send(json.dumps({
                "type": "simStart",
                "data": {"totalSteps": 4}
            }))

        self.send_state("idle", -1, 0.0)

        # Start wall clock for real-time sync
        self._wall_start = time.perf_counter()

        if self.use_viewer:
            print("\nLaunching MuJoCo viewer...")
            self.viewer_handle = mjviewer.launch_passive(self.model, self.data)

        print("Running sandwich task sequence in real-time...\n")

        self._run_tasks()

        # Save trajectory if recording
        if self.record and self.trajectory:
            traj_path = os.path.join(SCRIPT_DIR, "trajectory.json")
            with open(traj_path, "w") as f:
                json.dump(self.trajectory, f)
            print(f"\nSaved {len(self.trajectory)} frames to {traj_path}")

        self.send_state("done", 4, 1.0)

        if self.ws:
            self.ws.send(json.dumps({
                "type": "simComplete",
                "data": {}
            }))
            self.ws.close()

        elapsed = time.perf_counter() - self._wall_start
        print(f"\nSandwich complete! (took {elapsed:.1f}s wall time)")

        # Keep viewer open until user closes it
        if self.viewer_handle is not None:
            print("Viewer still open — close the window to exit.")
            while self.viewer_handle.is_running():
                time.sleep(0.1)

    def _run_tasks(self):
        """Execute all 4 tasks in sequence."""
        self.task_pull_toaster()
        self.task_pick_lettuce()
        self.task_place_lettuce()
        self.task_pick_bread_and_plate()


def main():
    parser = argparse.ArgumentParser(description="BracketWay MuJoCo Sandwich Sim")
    parser.add_argument("--no-viewer", action="store_true", help="Run without MuJoCo viewer")
    parser.add_argument("--fast", action="store_true", help="No real-time sync (run as fast as possible)")
    parser.add_argument("--record", action="store_true", help="Record trajectory to JSON")
    parser.add_argument("--no-ws", action="store_true", help="Disable WebSocket streaming")
    parser.add_argument("--ws-url", default=WS_URL, help="WebSocket server URL")
    args = parser.parse_args()

    ws_url = None if args.no_ws else args.ws_url

    sim = SandwichSim(
        use_viewer=not args.no_viewer and not args.fast,
        realtime=not args.fast,
        record=args.record,
        ws_url=ws_url,
    )
    sim.run()


if __name__ == "__main__":
    main()
