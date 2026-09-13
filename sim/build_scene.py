#!/usr/bin/env python3
"""
Build the MuJoCo scene by:
1. Patching the URDF to add collision geometry (copied from visual)
2. Compiling via MuJoCo to get a proper MJCF with correct kinematics
3. Injecting the robot into a scene with table, toaster, bread, lettuce, actuators

Usage: python build_scene.py
"""

import os
import re
import tempfile
import mujoco

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
URDF_SRC = os.path.join(SCRIPT_DIR, "..", "chopped_urdf_v2", "urdf", "chopped_urdf_v2.urdf")
MESH_DIR = os.path.join(SCRIPT_DIR, "..", "chopped_urdf_v2", "meshes")
OUTPUT = os.path.join(SCRIPT_DIR, "scene.xml")


def patch_urdf(urdf_text: str) -> str:
    """Add collision tags mirroring visual tags, and resolve package:// paths."""
    # Resolve package:// paths
    urdf_text = re.sub(
        r'filename="package://chopped_urdf_v2/meshes/([^"]+)"',
        lambda m: f'filename="meshes/{m.group(1)}"',
        urdf_text,
    )

    # For each <visual>...</visual>, insert a matching <collision>...</collision>
    def add_collision(match):
        visual_block = match.group(0)
        # Extract origin and geometry from visual
        origin = re.search(r'(<origin[^/]*/\s*>)', visual_block)
        geometry = re.search(r'(<geometry>.*?</geometry>)', visual_block, re.DOTALL)
        if origin and geometry:
            collision = f"    <collision>\n            {origin.group(1)}\n            {geometry.group(1)}\n        </collision>"
            return visual_block + "\n        " + collision
        return visual_block

    urdf_text = re.sub(r'<visual>.*?</visual>', add_collision, urdf_text, flags=re.DOTALL)
    return urdf_text


def compile_urdf_to_mjcf(urdf_text: str) -> str:
    """Compile URDF to MJCF using MuJoCo."""
    with tempfile.TemporaryDirectory() as tmp:
        # Symlink meshes
        os.symlink(os.path.abspath(MESH_DIR), os.path.join(tmp, "meshes"))

        urdf_path = os.path.join(tmp, "robot.urdf")
        with open(urdf_path, "w") as f:
            f.write(urdf_text)

        model = mujoco.MjModel.from_xml_path(urdf_path)
        print(f"Compiled URDF: {model.njnt} joints, {model.nbody} bodies, {model.ngeom} geoms")

        out_path = os.path.join(tmp, "robot.xml")
        mujoco.mj_saveLastXML(out_path, model)

        with open(out_path) as f:
            return f.read()


def build_scene(robot_mjcf: str) -> str:
    """Wrap the compiled robot MJCF in a full scene with environment objects."""

    # Extract the <worldbody> content from the compiled robot (the body tree)
    wb_match = re.search(r'<worldbody>\s*(.*?)\s*</worldbody>', robot_mjcf, re.DOTALL)
    if not wb_match:
        raise ValueError("No <worldbody> found in compiled MJCF")
    robot_bodies = wb_match.group(1)

    # Extract mesh assets from compiled MJCF and fix paths
    # The compiled MJCF has file="meshes/Foo.stl" but our meshdir already points
    # to the meshes folder, so strip the "meshes/" prefix
    asset_match = re.search(r'<asset>\s*(.*?)\s*</asset>', robot_mjcf, re.DOTALL)
    robot_assets = asset_match.group(1) if asset_match else ""
    robot_assets = robot_assets.replace('file="meshes/', 'file="')

    scene = f"""<mujoco model="bracketway_sandwich">
  <compiler angle="radian" meshdir="../chopped_urdf_v2/meshes/" autolimits="true"/>

  <option gravity="0 0 -9.81" timestep="0.002" integrator="implicitfast"/>

  <default>
    <joint damping="2" armature="0.1"/>
    <geom condim="4" friction="1 0.5 0.01"/>
    <motor ctrlrange="-10 10" ctrllimited="true"/>
  </default>

  <asset>
    {robot_assets}

    <!-- Environment materials -->
    <material name="wood" rgba="0.55 0.35 0.2 1" specular="0.1"/>
    <material name="bread_mat" rgba="0.83 0.63 0.33 1" specular="0.1"/>
    <material name="lettuce_mat" rgba="0.3 0.7 0.3 1" specular="0.2"/>
    <material name="plate_mat" rgba="0.95 0.95 0.95 1" specular="0.5"/>
    <material name="toaster_body_mat" rgba="0.55 0.55 0.55 1" specular="0.7" shininess="0.5"/>
    <material name="toaster_lever_mat" rgba="0.2 0.2 0.2 1"/>
    <material name="floor_mat" rgba="0.4 0.4 0.45 1"/>
  </asset>

  <worldbody>
    <!-- Ground plane -->
    <geom name="floor" type="plane" size="3 3 0.01" material="floor_mat"/>
    <light pos="1 0 3" dir="-0.3 0 -1" diffuse="0.8 0.8 0.8" specular="0.3 0.3 0.3"/>
    <light pos="-1 2 2.5" dir="0.2 -0.5 -1" diffuse="0.5 0.5 0.5"/>

    <!-- ==================== ROBOT ==================== -->
    <!-- Robot base: the URDF root is at the arm_base_frame which is on the
         main extrusion. The arms start at ~1.4m height in the URDF frame.
         URDF convention: Y-forward, Z-up for the arms.
         We place the robot at the origin. -->
    <body name="robot_root" pos="0 0 0">
      {robot_bodies}
    </body>

    <!-- ==================== TABLE ==================== -->
    <body name="table" pos="0.45 0 0">
      <geom name="table_top" type="box" size="0.3 0.25 0.01" pos="0 0 0.74" material="wood"/>
      <geom type="box" size="0.02 0.02 0.37" pos="-0.26 -0.21 0.37" material="wood"/>
      <geom type="box" size="0.02 0.02 0.37" pos="0.26 -0.21 0.37" material="wood"/>
      <geom type="box" size="0.02 0.02 0.37" pos="-0.26 0.21 0.37" material="wood"/>
      <geom type="box" size="0.02 0.02 0.37" pos="0.26 0.21 0.37" material="wood"/>
    </body>

    <!-- ==================== TOASTER ==================== -->
    <body name="toaster" pos="0.3 0 0.75">
      <geom name="toaster_body" type="box" size="0.06 0.04 0.06" pos="0 0 0.06" material="toaster_body_mat"/>
      <geom type="box" size="0.04 0.01 0.002" pos="0 -0.015 0.122" material="toaster_lever_mat"/>
      <geom type="box" size="0.04 0.01 0.002" pos="0 0.015 0.122" material="toaster_lever_mat"/>
      <body name="toaster_lever" pos="0.065 0 0.1">
        <joint name="toaster_lever_joint" type="slide" axis="0 0 1" range="-0.06 0" damping="5" stiffness="20"/>
        <geom name="lever_geom" type="box" size="0.008 0.008 0.02" material="toaster_lever_mat"/>
        <site name="lever_top" pos="0 0 0.02" size="0.005" rgba="1 1 0 1"/>
      </body>
    </body>

    <!-- ==================== BREAD (in toaster) ==================== -->
    <body name="bread_in_toaster" pos="0.3 0 0.82">
      <joint name="bread_free" type="free"/>
      <geom name="bread_geom" type="box" size="0.035 0.005 0.04" mass="0.03" material="bread_mat"/>
      <site name="bread_center" size="0.005" rgba="1 0.5 0 1"/>
    </body>

    <!-- ==================== LETTUCE ==================== -->
    <body name="lettuce" pos="0.5 0.12 0.77">
      <joint name="lettuce_free" type="free"/>
      <geom name="lettuce_geom" type="sphere" size="0.035" mass="0.05" material="lettuce_mat"/>
      <site name="lettuce_center" size="0.005" rgba="0 1 0 1"/>
    </body>

    <!-- ==================== PLATE ==================== -->
    <body name="plate" pos="0.55 -0.05 0.75">
      <geom name="plate_geom" type="cylinder" size="0.08 0.005" material="plate_mat"/>
      <site name="plate_center" pos="0 0 0.01" size="0.005" rgba="0.9 0.9 0.9 1"/>
    </body>

    <!-- ==================== BREAD ON TABLE ==================== -->
    <body name="bread_on_table" pos="0.55 -0.05 0.76">
      <geom name="bread_slice" type="box" size="0.04 0.04 0.007" material="bread_mat"/>
      <site name="bread_top" pos="0 0 0.008" size="0.005" rgba="1 0.7 0.3 1"/>
    </body>
  </worldbody>

  <!-- ==================== ACTUATORS ==================== -->
  <actuator>
    <!-- Right arm position controllers -->
    <position name="act_rj0" joint="rj0" kp="100" kv="10"/>
    <position name="act_rj1" joint="rj1" kp="50" kv="5"/>
    <position name="act_rj2" joint="rj2" kp="50" kv="5"/>
    <position name="act_rj3" joint="rj3" kp="50" kv="5"/>
    <position name="act_rj4" joint="rj4" kp="30" kv="3"/>
    <position name="act_rj5" joint="rj5" kp="30" kv="3"/>
    <position name="act_rj6" joint="rj6" kp="20" kv="2"/>
    <position name="act_r_grip" joint="right_left_gripper" kp="20" kv="2"/>

    <!-- Left arm position controllers -->
    <position name="act_lj0" joint="lj0" kp="100" kv="10"/>
    <position name="act_lj1" joint="lj1" kp="50" kv="5"/>
    <position name="act_lj2" joint="lj2" kp="50" kv="5"/>
    <position name="act_lj3" joint="lj3" kp="50" kv="5"/>
    <position name="act_lj4" joint="lj4" kp="30" kv="3"/>
    <position name="act_lj5" joint="lj5" kp="30" kv="3"/>
    <position name="act_lj6" joint="lj6" kp="20" kv="2"/>
    <position name="act_l_grip" joint="left_left_gripper" kp="20" kv="2"/>
  </actuator>

</mujoco>
"""
    return scene


def main():
    print("Reading URDF...")
    with open(URDF_SRC) as f:
        urdf_text = f.read()

    print("Patching URDF with collision geometry...")
    patched = patch_urdf(urdf_text)

    print("Compiling URDF -> MJCF via MuJoCo...")
    robot_mjcf = compile_urdf_to_mjcf(patched)

    print("Building full scene...")
    scene = build_scene(robot_mjcf)

    with open(OUTPUT, "w") as f:
        f.write(scene)

    # Verify it loads
    model = mujoco.MjModel.from_xml_path(OUTPUT)
    print(f"\nScene saved to {OUTPUT}")
    print(f"  {model.njnt} joints, {model.nbody} bodies, {model.ngeom} geoms, {model.nu} actuators")


if __name__ == "__main__":
    main()
