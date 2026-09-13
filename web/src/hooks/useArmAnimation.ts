"use client";

import { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { KeyframeStep, ArmPose } from "@/lib/armKeyframes";

interface AnimationState {
  playing: boolean;
  keyframeIndex: number;
  elapsed: number;
  prevPose: ArmPose;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpPose(a: ArmPose, b: ArmPose, t: number): ArmPose {
  const result: ArmPose = {};
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const from = a[key] ?? 0;
    const to = b[key] ?? 0;
    result[key] = from + (to - from) * t;
  }
  return result;
}

export function useArmAnimation(
  robotRef: React.RefObject<THREE.Object3D | null>,
  sequence: KeyframeStep[],
  onGripperPosition?: (pos: THREE.Vector3, attached: boolean) => void
) {
  const stateRef = useRef<AnimationState>({
    playing: false,
    keyframeIndex: 0,
    elapsed: 0,
    prevPose: sequence[0]?.pose ?? {},
  });

  const play = useCallback(() => {
    stateRef.current = {
      playing: true,
      keyframeIndex: 0,
      elapsed: 0,
      prevPose: sequence[0]?.pose ?? {},
    };
  }, [sequence]);

  const stop = useCallback(() => {
    stateRef.current.playing = false;
  }, []);

  useFrame((_, delta) => {
    const robot = robotRef.current as any;
    const s = stateRef.current;
    if (!robot?.joints || !s.playing) return;

    const step = sequence[s.keyframeIndex];
    if (!step) {
      s.playing = false;
      return;
    }

    s.elapsed += delta;
    const rawT = Math.min(s.elapsed / step.duration, 1);
    const t = easeInOut(rawT);

    // Interpolate all joints
    const interpolated = lerpPose(s.prevPose, step.pose, t);
    for (const [name, value] of Object.entries(interpolated)) {
      if (robot.joints[name]) {
        robot.joints[name].setJointValue(value);
      }
    }

    // Report gripper world position for bread tracking
    if (onGripperPosition) {
      const eef =
        robot.frames?.["left_eef"] ??
        robot.links?.["left_eef"] ??
        robot.joints?.["left_eef_frame"]?.child;

      if (eef) {
        const worldPos = new THREE.Vector3();
        eef.getWorldPosition(worldPos);
        onGripperPosition(worldPos, step.gripperAttached ?? false);
      }
    }

    // Advance to next keyframe
    if (rawT >= 1) {
      s.prevPose = { ...step.pose };
      s.keyframeIndex += 1;
      s.elapsed = 0;
      if (s.keyframeIndex >= sequence.length) {
        s.playing = false;
      }
    }
  });

  return { play, stop, stateRef };
}
