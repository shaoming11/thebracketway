"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TaskState } from "@/lib/taskSequencer";

interface TableSceneProps {
  state: TaskState | null;
}

function Toaster({
  position,
  leverDown,
}: {
  position: [number, number, number];
  leverDown: boolean;
}) {
  const leverRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!leverRef.current) return;
    const target = leverDown ? 0.04 : 0.1;
    leverRef.current.position.y += (target - leverRef.current.position.y) * 0.08;
  });

  return (
    <group position={position}>
      {/* Body */}
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.08]} />
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Lever — animated */}
      <mesh ref={leverRef} castShadow position={[0.07, 0.1, 0]}>
        <boxGeometry args={[0.015, 0.04, 0.015]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Slots */}
      <mesh position={[0, 0.125, -0.015]}>
        <boxGeometry args={[0.08, 0.005, 0.02]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, 0.125, 0.015]}>
        <boxGeometry args={[0.08, 0.005, 0.02]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function AnimatedObject({
  from,
  to,
  visible,
  animating,
  children,
}: {
  from: [number, number, number];
  to: [number, number, number];
  visible: boolean;
  animating: boolean;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const target = animating ? to : from;
    groupRef.current.position.x += (target[0] - groupRef.current.position.x) * 0.05;
    groupRef.current.position.y += (target[1] - groupRef.current.position.y) * 0.05;
    groupRef.current.position.z += (target[2] - groupRef.current.position.z) * 0.05;
  });

  if (!visible) return null;

  return (
    <group ref={groupRef} position={from}>
      {children}
    </group>
  );
}

function Bread({ color = "#d4a054" }: { color?: string }) {
  return (
    <mesh castShadow>
      <boxGeometry args={[0.08, 0.015, 0.08]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function Lettuce() {
  return (
    <mesh castShadow>
      <sphereGeometry args={[0.04, 16, 12]} />
      <meshStandardMaterial color="#4caf50" roughness={0.8} />
    </mesh>
  );
}

function Plate({ position }: { position: [number, number, number] }) {
  return (
    <mesh receiveShadow position={position}>
      <cylinderGeometry args={[0.08, 0.09, 0.01, 32]} />
      <meshStandardMaterial color="#eee" roughness={0.3} />
    </mesh>
  );
}

export default function TableScene({ state }: TableSceneProps) {
  const step = state?.currentStep ?? "idle";

  const tablePos: [number, number, number] = [0.35, 0, 0];

  // Toaster lever is down after pulling
  const leverDown =
    step !== "idle";

  // Lettuce: starts on table, animates to bread position
  const showLettuce =
    step !== "done" || true; // always visible, just moves
  const lettuceOnTable =
    step === "idle" || step === "pulling_toaster";
  const lettuceAnimating =
    step === "placing_lettuce" ||
    step === "picking_bread" ||
    step === "navigating" ||
    step === "done";

  // Bread in toaster: visible until picked
  const showBreadInToaster =
    step === "idle" ||
    step === "pulling_toaster" ||
    step === "picking_lettuce" ||
    step === "placing_lettuce";

  // Bread on plate: appears when picking_bread step starts, animates from toaster to plate
  const showBreadOnPlate =
    step === "picking_bread" ||
    step === "navigating" ||
    step === "done";
  const breadAnimating =
    step === "picking_bread" ||
    step === "navigating" ||
    step === "done";

  return (
    <group position={tablePos}>
      {/* Table top */}
      <mesh receiveShadow position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.5, 0.02, 0.4]} />
        <meshStandardMaterial color="#5d4037" roughness={0.8} />
      </mesh>
      {/* Table legs */}
      {(
        [
          [-0.22, 0.175, -0.17],
          [0.22, 0.175, -0.17],
          [-0.22, 0.175, 0.17],
          [0.22, 0.175, 0.17],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <boxGeometry args={[0.02, 0.35, 0.02]} />
          <meshStandardMaterial color="#4e342e" />
        </mesh>
      ))}

      {/* Toaster with animated lever */}
      <Toaster position={[-0.12, 0.36, 0]} leverDown={leverDown} />
      <Plate position={[0.12, 0.365, 0]} />

      {/* Bread in toaster (static, disappears when picked) */}
      {showBreadInToaster && (
        <mesh castShadow position={[-0.12, 0.44, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.01]} />
          <meshStandardMaterial color="#d4a054" roughness={0.9} />
        </mesh>
      )}

      {/* Bread on plate — animates from toaster area to plate */}
      <AnimatedObject
        from={[-0.12, 0.5, 0]}
        to={[0.12, 0.38, 0]}
        visible={showBreadOnPlate}
        animating={breadAnimating}
      >
        <Bread />
      </AnimatedObject>

      {/* Lettuce — animates from table position to on top of bread on plate */}
      <AnimatedObject
        from={[0.0, 0.4, 0.12]}
        to={[0.12, 0.4, 0]}
        visible={true}
        animating={lettuceAnimating}
      >
        <Lettuce />
      </AnimatedObject>
    </group>
  );
}
