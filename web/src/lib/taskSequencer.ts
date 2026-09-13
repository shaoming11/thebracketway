export type TaskStep =
  | "idle"
  | "pulling_toaster"
  | "picking_lettuce"
  | "placing_lettuce"
  | "picking_bread"
  | "navigating"
  | "done";

export interface TaskState {
  currentStep: TaskStep;
  stepIndex: number;
  totalSteps: number;
  stepLabel: string;
  estimatedTimeLeft: number; // seconds
  progress: number; // 0-1
  robotPosition: { x: number; y: number };
  userPosition: { x: number; y: number };
}

const STEPS: { step: TaskStep; label: string; duration: number }[] = [
  { step: "pulling_toaster", label: "Loading & toasting bread", duration: 12 },
  { step: "picking_lettuce", label: "Picking up lettuce", duration: 6 },
  { step: "placing_lettuce", label: "Placing lettuce on bread", duration: 7 },
  { step: "picking_bread", label: "Picking bread from toaster & plating", duration: 10 },
  { step: "navigating", label: "Navigating to user", duration: 15 },
];

export class TaskSequencer {
  private state: TaskState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private elapsed = 0;
  private onUpdate: (state: TaskState) => void;

  constructor(onUpdate: (state: TaskState) => void) {
    this.onUpdate = onUpdate;
    this.state = {
      currentStep: "idle",
      stepIndex: -1,
      totalSteps: STEPS.length,
      stepLabel: "Waiting for command...",
      estimatedTimeLeft: STEPS.reduce((a, s) => a + s.duration, 0),
      progress: 0,
      robotPosition: { x: 2, y: 2 },
      userPosition: { x: 8, y: 8 },
    };
  }

  getState() {
    return { ...this.state };
  }

  start() {
    this.elapsed = 0;
    this.advanceStep(0);
  }

  updateUserPosition(x: number, y: number) {
    this.state.userPosition = { x, y };
    this.onUpdate(this.getState());
  }

  private advanceStep(index: number) {
    if (index >= STEPS.length) {
      this.state = {
        ...this.state,
        currentStep: "done",
        stepIndex: STEPS.length,
        stepLabel: "Sandwich delivered!",
        estimatedTimeLeft: 0,
        progress: 1,
      };
      this.onUpdate(this.getState());
      if (this.timer) clearInterval(this.timer);
      return;
    }

    const step = STEPS[index];
    this.elapsed = 0;
    this.state = {
      ...this.state,
      currentStep: step.step,
      stepIndex: index,
      stepLabel: step.label,
      estimatedTimeLeft: STEPS.slice(index).reduce((a, s) => a + s.duration, 0),
      progress: index / STEPS.length,
    };
    this.onUpdate(this.getState());

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.elapsed += 0.5;
      const step = STEPS[index];

      // Simulate robot moving toward user during navigation
      if (this.state.currentStep === "navigating") {
        const t = this.elapsed / step.duration;
        this.state.robotPosition = {
          x: 2 + (this.state.userPosition.x - 2) * Math.min(t, 1),
          y: 2 + (this.state.userPosition.y - 2) * Math.min(t, 1),
        };
      }

      const stepProgress = Math.min(this.elapsed / step.duration, 1);
      this.state.progress = (index + stepProgress) / STEPS.length;
      this.state.estimatedTimeLeft = Math.max(
        0,
        STEPS.slice(index).reduce((a, s) => a + s.duration, 0) - this.elapsed
      );
      this.onUpdate(this.getState());

      if (this.elapsed >= step.duration) {
        this.advanceStep(index + 1);
      }
    }, 500);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.state.currentStep = "idle";
    this.state.stepLabel = "Waiting for command...";
    this.state.progress = 0;
    this.state.stepIndex = -1;
    this.onUpdate(this.getState());
  }
}
