"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import URDFLoader from "urdf-loader";
import { useArmAnimation } from "@/hooks/useArmAnimation";
import { TOAST_SEQUENCE } from "@/lib/armKeyframes";
import { TaskState } from "@/lib/taskSequencer";

export interface RobotTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export type JointValues = Record<string, number>;

interface URDFRobotProps {
  transform: RobotTransform;
  state: TaskState | null;
  manualJoints?: JointValues | null; // from tuning panel
  simJoints?: JointValues | null;    // from MuJoCo simulation
}

// Map MuJoCo joint names to URDF joint names
const MUJOCO_TO_URDF: Record<string, string> = {
  rj0: "rj0", rj1: "rj1", rj2: "rj2", rj3: "rj3",
  rj4: "rj4", rj5: "rj5", rj6: "rj6",
  r_gripper: "right_left_gripper",
  lj0: "lj0", lj1: "lj1", lj2: "lj2", lj3: "lj3",
  lj4: "lj4", lj5: "lj5", lj6: "lj6",
  l_gripper: "left_left_gripper",
};

export default function URDFRobot({ transform, state, manualJoints, simJoints }: URDFRobotProps) {
  const groupRef = useRef<THREE.Group>(null);
  const robotRef = useRef<THREE.Object3D | null>(null);
  const breadRef = useRef<THREE.Mesh>(null);
  const breadVisibleRef = useRef(false);

  const handleGripperPos = useCallback((pos: THREE.Vector3, attached: boolean) => {
    if (breadRef.current) {
      if (attached) {
        breadRef.current.position.copy(pos);
        breadRef.current.visible = true;
      } else {
        breadRef.current.visible = false;
      }
    }
    breadVisibleRef.current = attached;
  }, []);

  const { play, stop } = useArmAnimation(robotRef, TOAST_SEQUENCE, handleGripperPos);

  // Trigger animation on task step change
  const prevStepRef = useRef<string>("idle");
  useEffect(() => {
    const step = state?.currentStep;
    if (step === "pulling_toaster" && prevStepRef.current === "idle") {
      play();
    }
    if (step === "idle") {
      stop();
    }
    prevStepRef.current = step ?? "idle";
  }, [state?.currentStep, play, stop]);

  useEffect(() => {
    const loader = new URDFLoader();
    loader.packages = { chopped_urdf_v2: "/robot" };

    loader.load("/robot/urdf/chopped_urdf_v2.urdf", (robot) => {
      robot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.6;
            mat.metalness = 0.2;
          }
        }
      });

      // Log joint names for debugging
      console.log("URDF joints:", Object.keys((robot as any).joints));

      robotRef.current = robot;
      if (groupRef.current) {
        groupRef.current.add(robot);
      }
    });
  }, []);

  // Apply transform + manual joint overrides
  useFrame(() => {
    const robot = robotRef.current as any;
    if (!robot) return;

    robot.position.set(...transform.position);
    robot.rotation.set(...transform.rotation);
    robot.scale.set(...transform.scale);

    // Priority: simJoints (from MuJoCo) > manualJoints (tuning panel) > animation
    if (simJoints && robot.joints) {
      for (const [mujocoName, value] of Object.entries(simJoints)) {
        const urdfName = MUJOCO_TO_URDF[mujocoName] ?? mujocoName;
        if (robot.joints[urdfName]) {
          robot.joints[urdfName].setJointValue(value);
        }
      }
    } else if (manualJoints && robot.joints) {
      for (const [name, value] of Object.entries(manualJoints)) {
        if (robot.joints[name]) {
          robot.joints[name].setJointValue(value);
        }
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Bread that follows gripper while attached */}
      <mesh ref={breadRef} visible={false} castShadow>
        <boxGeometry args={[0.06, 0.04, 0.01]} />
        <meshStandardMaterial color="#d4a054" roughness={0.9} />
      </mesh>
    </group>
  );
}
