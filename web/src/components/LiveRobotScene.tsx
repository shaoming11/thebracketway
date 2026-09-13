"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import LiveURDFRobot from "./LiveURDFRobot";
import LiveTableScene from "./LiveTableScene";
import type { UrdfJoints, WorkflowState } from "@/lib/useDataBridge";

interface LiveRobotSceneProps {
  urdfJoints: UrdfJoints | null;
  workflow: WorkflowState | null;
}

export default function LiveRobotScene({ urdfJoints, workflow }: LiveRobotSceneProps) {
  return (
    <div className="w-full h-full bg-[var(--canvas)]">
      <Canvas
        camera={{ position: [0.8, 1.0, 1.6], fov: 40, up: [0, 1, 0] }}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        {/* Match the bracket bot image: warm off-white background */}
        <color attach="background" args={["#f0eeea"]} />

        {/* Soft diffuse lighting — no dramatic directional, like a product shoot */}
        <ambientLight intensity={0.7} color="#f5f0eb" />
        <directionalLight
          position={[4, 8, 5]}
          intensity={0.8}
          color="#ffffff"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#e0ecf5" />
        {/* Subtle blue rim light for that watercolor glow */}
        <pointLight position={[-1, 2, 3]} intensity={0.15} color="#87CEEB" distance={8} />

        <Suspense fallback={null}>
          <LiveURDFRobot urdfJoints={urdfJoints} workflow={workflow} />
          <LiveTableScene workflow={workflow} />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={0.4}
          maxDistance={5}
          target={[0.15, 0.55, 0]}
        />

        {/* Subtle ground — nearly invisible, just catches shadows */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#ece9e3" roughness={1} metalness={0} />
        </mesh>
      </Canvas>
    </div>
  );
}
