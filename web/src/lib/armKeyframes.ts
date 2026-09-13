export type ArmPose = Record<string, number>;

export interface KeyframeStep {
  name: string;
  pose: ArmPose;
  duration: number; // seconds
  gripperAttached?: boolean; // bread follows gripper
}

// Left arm joints: lj0 (prismatic, -1.03 to 0), lj1-lj6 (revolute, -2.09 to 2.09)
// left_left_gripper: 0 = open, 0.8 = closed

const REST: ArmPose = {
  lj0: 0,
  lj1: 0,
  lj2: 0,
  lj3: 0,
  lj4: 0,
  lj5: 0,
  lj6: 0,
  left_left_gripper: 0,
};

// These are approximate starting values — tune with the joint slider panel
export const TOAST_SEQUENCE: KeyframeStep[] = [
  {
    name: "rest_holding_bread",
    pose: { ...REST, left_left_gripper: 0.8 },
    duration: 0.8,
    gripperAttached: true,
  },
  {
    name: "lift_arm",
    pose: {
      lj0: -0.4,
      lj1: 0.3,
      lj2: -0.5,
      lj3: 0.8,
      lj4: 0,
      lj5: 0.3,
      lj6: 0,
      left_left_gripper: 0.8,
    },
    duration: 1.5,
    gripperAttached: true,
  },
  {
    name: "over_toaster",
    pose: {
      lj0: -0.5,
      lj1: 0.6,
      lj2: -0.8,
      lj3: 1.0,
      lj4: 0,
      lj5: 0.5,
      lj6: 0,
      left_left_gripper: 0.8,
    },
    duration: 2.0,
    gripperAttached: true,
  },
  {
    name: "into_toaster_slot",
    pose: {
      lj0: -0.3,
      lj1: 0.6,
      lj2: -0.8,
      lj3: 0.6,
      lj4: 0,
      lj5: 0.5,
      lj6: 0,
      left_left_gripper: 0.8,
    },
    duration: 1.5,
    gripperAttached: true,
  },
  {
    name: "release_bread",
    pose: {
      lj0: -0.3,
      lj1: 0.6,
      lj2: -0.8,
      lj3: 0.6,
      lj4: 0,
      lj5: 0.5,
      lj6: 0,
      left_left_gripper: 0,
    },
    duration: 0.5,
    gripperAttached: false,
  },
  {
    name: "move_to_lever",
    pose: {
      lj0: -0.5,
      lj1: 0.8,
      lj2: -0.6,
      lj3: 0.9,
      lj4: 0.3,
      lj5: 0.4,
      lj6: 0.2,
      left_left_gripper: 0,
    },
    duration: 1.5,
  },
  {
    name: "push_lever_down",
    pose: {
      lj0: -0.3,
      lj1: 0.8,
      lj2: -0.6,
      lj3: 0.5,
      lj4: 0.3,
      lj5: 0.4,
      lj6: 0.2,
      left_left_gripper: 0,
    },
    duration: 1.0,
  },
  {
    name: "return_to_rest",
    pose: REST,
    duration: 2.0,
  },
];
