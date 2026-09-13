"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense } from "react";
import URDFRobot, { RobotTransform, JointValues } from "./URDFRobot";
import TableScene from "./TableScene";
import { TaskState } from "@/lib/taskSequencer";

interface RobotSceneProps {
  state: TaskState | null;
  robotTransform: RobotTransform;
  manualJoints?: JointValues | null;
  simJoints?: JointValues | null;
}

export default function RobotScene({ state, robotTransform, manualJoints, simJoints }: RobotSceneProps) {
  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-gray-700 bg-gray-900/50">
      <Canvas
        camera={{ position: [0.5, 0.8, 1.2], fov: 50 }}
        shadows
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[3, 5, 2]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-2, 3, -1]} intensity={0.3} color="#4fc3f7" />

        <Suspense fallback={null}>
          <URDFRobot transform={robotTransform} state={state} manualJoints={manualJoints} simJoints={simJoints} />
          <TableScene state={state} />
          <Environment preset="city" />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          minDistance={0.5}
          maxDistance={5}
        />

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>
      </Canvas>
    </div>
  );
}
