"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorkflowState } from "@/lib/useDataBridge";

interface LiveTableSceneProps {
  workflow: WorkflowState | null;
}

function Toaster({ position, leverDown }: { position: [number, number, number]; leverDown: boolean }) {
  const leverRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!leverRef.current) return;
    const target = leverDown ? 0.04 : 0.1;
    leverRef.current.position.y += (target - leverRef.current.position.y) * 0.06;
  });

  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.08]} />
        <meshStandardMaterial color="#c4c0b8" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={leverRef} castShadow position={[0.07, 0.1, 0]}>
        <boxGeometry args={[0.015, 0.04, 0.015]} />
        <meshStandardMaterial color="#666" />
      </mesh>
      <mesh position={[0, 0.125, -0.015]}>
        <boxGeometry args={[0.08, 0.005, 0.02]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      <mesh position={[0, 0.125, 0.015]}>
        <boxGeometry args={[0.08, 0.005, 0.02]} />
        <meshStandardMaterial color="#888" />
      </mesh>
    </group>
  );
}

function AnimatedObject({
  from, to, visible, animating, children,
}: {
  from: [number, number, number]; to: [number, number, number];
  visible: boolean; animating: boolean; children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const target = animating ? to : from;
    groupRef.current.position.x += (target[0] - groupRef.current.position.x) * 0.04;
    groupRef.current.position.y += (target[1] - groupRef.current.position.y) * 0.04;
    groupRef.current.position.z += (target[2] - groupRef.current.position.z) * 0.04;
  });

  if (!visible) return null;
  return <group ref={groupRef} position={from}>{children}</group>;
}

export default function LiveTableScene({ workflow }: LiveTableSceneProps) {
  const step = workflow?.step ?? "idle";
  const tablePos: [number, number, number] = [0.35, 0, 0];

  const leverDown = step !== "idle";
  const showBreadInToaster = step === "idle" || step === "pulling_toaster" || step === "picking_lettuce" || step === "placing_lettuce";
  const showBreadOnPlate = step === "picking_bread" || step === "navigating" || step === "done";
  const lettuceAnimating = step === "placing_lettuce" || step === "picking_bread" || step === "navigating" || step === "done";

  return (
    <group position={tablePos}>
      {/* Table — warm wood */}
      <mesh receiveShadow position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.5, 0.02, 0.4]} />
        <meshStandardMaterial color="#b8a68e" roughness={0.85} />
      </mesh>
      {([[-0.22, 0.175, -0.17], [0.22, 0.175, -0.17], [-0.22, 0.175, 0.17], [0.22, 0.175, 0.17]] as [number, number, number][]).map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <boxGeometry args={[0.02, 0.35, 0.02]} />
          <meshStandardMaterial color="#a0907a" />
        </mesh>
      ))}

      <Toaster position={[-0.12, 0.36, 0]} leverDown={leverDown} />

      <mesh receiveShadow position={[0.12, 0.365, 0]}>
        <cylinderGeometry args={[0.08, 0.09, 0.01, 32]} />
        <meshStandardMaterial color="#e8e4de" roughness={0.3} />
      </mesh>

      {showBreadInToaster && (
        <mesh castShadow position={[-0.12, 0.44, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.01]} />
          <meshStandardMaterial color="#d4a054" roughness={0.9} />
        </mesh>
      )}

      <AnimatedObject from={[-0.12, 0.5, 0]} to={[0.12, 0.38, 0]} visible={showBreadOnPlate} animating={showBreadOnPlate}>
        <mesh castShadow>
          <boxGeometry args={[0.08, 0.015, 0.08]} />
          <meshStandardMaterial color="#d4a054" roughness={0.9} />
        </mesh>
      </AnimatedObject>

      <AnimatedObject from={[0.0, 0.4, 0.12]} to={[0.12, 0.4, 0]} visible={true} animating={lettuceAnimating}>
        <mesh castShadow>
          <sphereGeometry args={[0.04, 16, 12]} />
          <meshStandardMaterial color="#7ab648" roughness={0.8} />
        </mesh>
      </AnimatedObject>
    </group>
  );
}
