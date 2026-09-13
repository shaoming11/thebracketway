"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import URDFLoader from "urdf-loader";
import type { UrdfJoints, WorkflowState } from "@/lib/useDataBridge";

interface LiveURDFRobotProps {
  urdfJoints: UrdfJoints | null;
  workflow: WorkflowState | null;
}

const LERP_FACTOR = 0.12;

export default function LiveURDFRobot({ urdfJoints }: LiveURDFRobotProps) {
  const groupRef = useRef<THREE.Group>(null);
  const robotRef = useRef<THREE.Object3D | null>(null);
  const currentJoints = useRef<Record<string, number>>({});

  useEffect(() => {
    const loader = new URDFLoader();
    loader.packages = { chopped_urdf_v2: "/robot" };

    loader.load("/robot/urdf/chopped_urdf_v2.urdf", (robot) => {
      robot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color("#7ec8e3"),
              roughness: 0.25,
              metalness: 0.0,
              transparent: true,
              opacity: 0.55,
              transmission: 0.3,
              thickness: 0.5,
              clearcoat: 0.1,
              clearcoatRoughness: 0.4,
              side: THREE.DoubleSide,
              depthWrite: true,
            });
            child.material = mat;
          }
        }
      });

      robotRef.current = robot;
      if (groupRef.current) {
        groupRef.current.add(robot);
      }
    });
  }, []);

  useFrame(() => {
    const robot = robotRef.current as any;
    if (!robot?.joints) return;

    robot.position.set(0, 0, 0);
    robot.rotation.set(1.548, 3.138, 3.138);
    robot.scale.set(0.5, 0.5, 0.5);

    if (!urdfJoints?.joints) return;

    for (const [name, targetValue] of Object.entries(urdfJoints.joints)) {
      const current = currentJoints.current[name] ?? 0;
      const smoothed = current + (targetValue - current) * LERP_FACTOR;
      currentJoints.current[name] = smoothed;

      if (robot.joints[name]) {
        robot.joints[name].setJointValue(smoothed);
      }
    }
  });

  return <group ref={groupRef} />;
}
