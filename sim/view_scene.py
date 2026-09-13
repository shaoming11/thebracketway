#!/usr/bin/env python3
"""Launch the MuJoCo interactive viewer to inspect the scene.

Usage:
    python view_scene.py
"""

import os
import mujoco
import mujoco.viewer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCENE_PATH = os.path.join(SCRIPT_DIR, "scene.xml")

model = mujoco.MjModel.from_xml_path(SCENE_PATH)
data = mujoco.MjData(model)
mujoco.mj_forward(model, data)

print("Launching MuJoCo viewer... Close the window to exit.")
mujoco.viewer.launch(model, data)
