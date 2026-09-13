"use client";


function PanelHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="panel-header">
      <span>{label}</span>
      <span className="flex items-center gap-3">
        {right}
        <span className="grip">
          <span /><span /><span />
          <span /><span /><span />
        </span>
      </span>
    </div>
  );
}

function StatusDot({ color }: { color: "green" | "red" | "blue" }) {
  const colors = {
    green: "bg-status-green",
    red: "bg-status-red",
    blue: "bg-status-blue",
  };
  return <span className={`status-dot ${colors[color]}`} />;
}

const POLICIES = [
  {
    id: "toaster_knob",
    label: "Pull toaster knob",
    method: "VLA",
    desc: "Learned policy controls the gripper to press and hold the toaster lever.",
  },
  {
    id: "bread_plate",
    label: "Bread to plate",
    method: "VLA",
    desc: "Learned policy grasps bread from the toaster slot and places it on the plate.",
  },
  {
    id: "mayo",
    label: "Apply mayo",
    method: "VLA",
    desc: "Learned policy squeezes and spreads mayo across the bread surface.",
  },
  {
    id: "lettuce",
    label: "Place lettuce",
    method: "IK",
    desc: "IK solver computes joint angles to pick and place lettuce onto the sandwich.",
  },
];

export default function Home() {
  return (
    <div className="landing-page">
      <div className="relative z-10 min-h-screen">
        {/* Top bar */}
        <nav className="sticky top-0 z-40 bg-bg/80 backdrop-blur-sm px-4 sm:px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs tracking-wider uppercase text-text-secondary">
                The Brackey Way
              </span>
              <span className="text-text-tertiary text-xs font-mono">]</span>
            </div>
          </div>
        </nav>

        {/* Content — single column, vertical scroll */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4"
        >

          {/* Hero panel */}
          <div className="panel animate-enter">
            <PanelHeader label="Overview" />
            <div className="p-6 sm:p-10">
              <div className="max-w-2xl">
                <h1 className="text-3xl sm:text-[2.75rem] font-semibold tracking-tight leading-[1.1] mb-5 text-text">
                  Make me a sandwich.
                </h1>
                <p className="text-base sm:text-lg leading-relaxed text-text-secondary mb-8 max-w-xl">
                  A self-balancing robot with dual 7-DOF arms assembles a
                  sandwich end-to-end, driven by pi0.5 VLA policies trained on
                  ~50 demonstrations each.
                </p>
                <div className="flex items-center gap-6 font-mono text-xs text-text-tertiary">
                  <span>BracketBot</span>
                  <span className="text-rule">/</span>
                  <span>pi0.5 VLA</span>
                  <span className="text-rule">/</span>
                  <span>2x 7-DOF Arms</span>
                </div>
              </div>
            </div>
          </div>

          {/* Policy sequence panel */}
          <div className="panel animate-enter animate-enter-1">
            <PanelHeader
              label="Actions"
              right={
                <span className="flex items-center gap-2 text-text-tertiary font-mono text-[0.65rem]">
                  100%
                </span>
              }
            />
            <div className="progress-track">
              <div className="progress-fill" style={{ width: "100%" }} />
            </div>
            <div className="p-4 sm:p-5">
              <ul className="space-y-0">
                {POLICIES.map((p, i) => (
                  <li key={p.id}>
                    <div className="action-row flex items-start gap-3 py-3 pl-1">
                      <span className="flex items-center gap-2 pt-0.5 flex-shrink-0">
                        <svg
                          className="w-3.5 h-3.5 text-status-blue"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 2a6 6 0 100 12A6 6 0 008 2z" />
                          <circle cx="8" cy="8" r="3" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-sm text-text line-through decoration-text-tertiary/40">
                            {p.label}
                          </span>
                          <span
                            className={`font-mono text-[0.6rem] uppercase tracking-wider ${
                              p.method === "VLA"
                                ? "text-status-blue"
                                : "text-status-green"
                            }`}
                          >
                            {p.method === "VLA" ? "pi0.5" : "IK"}
                          </span>
                        </div>
                        <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                          {p.desc}
                        </p>
                      </div>
                    </div>
                    {i < POLICIES.length - 1 && <div className="divider ml-8" />}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Lettuce detection panel */}
          <div className="panel animate-enter animate-enter-2">
            <PanelHeader label="Lettuce Detection" right={<span className="font-mono text-[0.6rem] text-status-green">detector.py</span>} />
            <div className="p-4 sm:p-5 space-y-5">
              {/* Finding green */}
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-wider text-text mb-3">
                  1. Finding Green
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-green flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Convert each frame to <span className="text-text">HSV</span> (hue, saturation, brightness) to separate colour from lighting
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-green flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Green range: hue <span className="text-text">35&ndash;78</span>, with minimum saturation + brightness thresholds. Upper limit at 78 excludes teal/cyan
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-green flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Cleanup: remove specks, fill small holes, group into blobs. Blobs &lt;<span className="text-text">1500 px</span> are discarded
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-green flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Split handling: blobs within <span className="text-text">40 px</span> merge into one object &mdash; a gripper occluding a leaf doesn&rsquo;t create two detections
                    </span>
                  </div>
                </div>
              </div>
              <div className="divider" />
              {/* Head camera to table position */}
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-wider text-text mb-3">
                  2. Head Camera &rarr; Table Position
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      <span className="text-text">HeadModel</span> maps pixel coordinates from the head camera to 3D table-frame positions
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Detected blob centroid is projected through the model to get the lettuce footprint on the table surface
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      IK solver receives the table-frame coordinates and computes the pick-and-place trajectory
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VLA pipeline panel */}
          <div className="panel animate-enter animate-enter-3">
            <PanelHeader label="VLA Pipeline" right={<span className="font-mono text-[0.6rem] text-status-blue">pi0.5</span>} />
            <div className="p-4 sm:p-5 space-y-5">
              {/* Data collection */}
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-wider text-text mb-3">
                  Data Collection
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      ~50 teleoperated demonstrations per policy, collected via leader-follower arms
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Home-position reset after every run &mdash; arms return to a fixed starting pose
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Toaster and plates are manually repositioned between episodes for variation
                    </span>
                  </div>
                </div>
              </div>
              <div className="divider" />
              {/* Training */}
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-wider text-text mb-3">
                  Training
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Demonstrations are uploaded and fine-tuned on an external <span className="text-text">GPU server</span>
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Training completes in &lt;1 hour per policy
                    </span>
                  </div>
                </div>
              </div>
              <div className="divider" />
              {/* Inference */}
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-wider text-text mb-3">
                  Inference
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-red flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      pi0.5 is too large to run on the onboard <span className="text-text">Jetson</span>
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Inference runs on a remote <span className="text-text">GPU endpoint</span> called over the network
                    </span>
                  </div>
                  <div className="action-row flex gap-2 py-1 pl-1">
                    <span className="text-status-blue flex-shrink-0">&#9656;</span>
                    <span className="text-text-secondary">
                      Robot streams wrist camera frames to the server, receives action vectors back in real time
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry panel */}
          <div className="panel animate-enter animate-enter-4">
            <PanelHeader
              label="Telemetry"
              right={
                <span className="flex items-center gap-1.5">
                  <StatusDot color="green" />
                </span>
              }
            />
            <div className="p-4 font-mono text-xs">
              {[
                { label: "Model", value: "pi0.5" },
                { label: "Episodes / Policy", value: "~50" },
                { label: "Training / Policy", value: "<1hr" },
                { label: "Learned Policies", value: "3" },
                { label: "IK Policies", value: "1" },
                { label: "Arms", value: "2x 7-DOF" },
              ].map((row, i, arr) => (
                <div key={row.label}>
                  <div className="telem-row flex items-center justify-between py-2">
                    <span className="text-text-secondary uppercase tracking-wider text-[0.6rem]">
                      {row.label}
                    </span>
                    <span className="text-text">{row.value}</span>
                  </div>
                  {i < arr.length - 1 && <div className="divider" />}
                </div>
              ))}
            </div>
          </div>

          {/* System architecture panel */}
          <div className="panel animate-enter animate-enter-3">
            <PanelHeader label="System" />
            <div className="p-4 font-mono text-xs space-y-4">
              {[
                {
                  name: "BracketBot",
                  items: ["7-DOF Arms + Grippers", "Depth + RGB Camera", "Balancing Controller"],
                },
                {
                  name: "Server",
                  items: ["Policy Sequencer", "pi0.5 Inference", "IK Solver", "WebSocket Relay"],
                },
                {
                  name: "Web App",
                  items: ["3D Visualization", "Camera Feeds", "Action Map", "Status Panel"],
                },
              ].map((block) => (
                <div key={block.name}>
                  <div className="text-text font-medium uppercase tracking-wider text-[0.65rem] mb-2">
                    {block.name}
                  </div>
                  <div className="space-y-1">
                    {block.items.map((item) => (
                      <div
                        key={item}
                        className="sys-item text-text-tertiary pl-3 border-l border-panel-border"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline panel */}
          <div className="panel animate-enter animate-enter-4">
            <PanelHeader label="Pipeline" />
            <div className="p-4 font-mono text-xs">
              {[
                { step: "Collect", detail: "~50 episodes" },
                { step: "Train", detail: "<1 hour" },
                { step: "Deploy", detail: "On-robot" },
                { step: "Evaluate", detail: "Real-world" },
              ].map((item, i) => (
                <div key={item.step}>
                  <div className="telem-row flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-status-blue w-4 text-right">{i + 1}</span>
                      <span className="text-text">{item.step}</span>
                    </div>
                    <span className="text-text-tertiary">{item.detail}</span>
                  </div>
                  {i < 3 && <div className="divider" />}
                </div>
              ))}
              <div className="mt-3 text-[0.6rem] text-text-tertiary uppercase tracking-wider">
                Home-position resets between episodes
              </div>
            </div>
          </div>

          {/* Log / reflections panel */}
          <div className="panel animate-enter animate-enter-5">
            <PanelHeader label="Log" />
            <div className="p-4 sm:p-5 font-mono text-xs leading-relaxed space-y-2">
              <div className="action-row flex gap-2 py-1 pl-1">
                <span className="text-status-green flex-shrink-0">&gt;</span>
                <span className="text-text-secondary">
                  Training: &lt;1hr per policy. Trained all 3 VLA policies in one session.
                </span>
              </div>
              <div className="action-row flex gap-2 py-1 pl-1">
                <span className="text-status-green flex-shrink-0">&gt;</span>
                <span className="text-text-secondary">
                  Data collection: home-position resets between episodes. Consistent initial state.
                </span>
              </div>
              <div className="action-row flex gap-2 py-1 pl-1">
                <span className="text-status-green flex-shrink-0">&gt;</span>
                <span className="text-text-secondary">
                  Episodes per policy: ~50 teleoperated demonstrations.
                </span>
              </div>
              <div className="divider my-3" />
              <div className="action-row flex gap-2 py-1 pl-1">
                <span className="text-status-red flex-shrink-0">&gt;</span>
                <span className="text-text-secondary">
                  TODO: autonomous navigation + mapping. SLAM or visual-nav for delivery.
                </span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between py-4 px-1 font-mono text-xs animate-enter animate-enter-6">
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary">The Brackey Way</span>
            </div>
            <div className="flex items-center gap-4">
              {["pi0.5", "Next.js", "Three.js", "R3F", "WebSocket"].map((t) => (
                <span key={t} className="text-text-tertiary">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
