#!/usr/bin/env python3
"""Convert the BracketBot URDF to MuJoCo MJCF XML.

MuJoCo can compile URDF directly, but we need to:
1. Resolve package:// paths to local filesystem paths
2. Save the compiled model as MJCF for inspection/editing

Usage:
    python convert_urdf.py
"""

import os
import re
import shutil
import tempfile

import mujoco

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
URDF_SRC = os.path.join(PROJECT_ROOT, "chopped_urdf_v2", "urdf", "chopped_urdf_v2.urdf")
MESH_DIR = os.path.join(PROJECT_ROOT, "chopped_urdf_v2", "meshes")
OUTPUT_MJCF = os.path.join(SCRIPT_DIR, "robot.xml")


def resolve_package_paths(urdf_text: str, mesh_dest: str) -> str:
    """Replace package://chopped_urdf_v2/meshes/... with relative paths."""
    return re.sub(
        r'filename="package://chopped_urdf_v2/meshes/([^"]+)"',
        lambda m: f'filename="meshes/{m.group(1)}"',
        urdf_text,
    )


def main():
    # Read the URDF
    with open(URDF_SRC) as f:
        urdf_text = f.read()

    # Create a temp directory with the resolved URDF + meshes
    with tempfile.TemporaryDirectory() as tmpdir:
        # Copy meshes
        mesh_dest = os.path.join(tmpdir, "meshes")
        shutil.copytree(MESH_DIR, mesh_dest)

        # Write resolved URDF
        resolved = resolve_package_paths(urdf_text, mesh_dest)
        urdf_path = os.path.join(tmpdir, "robot.urdf")
        with open(urdf_path, "w") as f:
            f.write(resolved)

        # Load into MuJoCo
        model = mujoco.MjModel.from_xml_path(urdf_path)

        # Save as MJCF
        mujoco.mj_saveLastXML(os.path.join(tmpdir, "robot.xml"), model)

        # Copy the output
        shutil.copy(os.path.join(tmpdir, "robot.xml"), OUTPUT_MJCF)

    print(f"Saved MJCF to {OUTPUT_MJCF}")
    print(f"Model has {model.nq} qpos, {model.nv} qvel, {model.nu} actuators, {model.njnt} joints")


if __name__ == "__main__":
    main()
