import { WebSocketServer, WebSocket } from "ws";
import { TaskSequencer, TaskState } from "../src/lib/taskSequencer";
import * as fs from "fs";
import * as path from "path";

const KEYFRAMES_PATH = path.resolve(__dirname, "..", "..", "sim", "keyframes.json");

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

const clients = new Set<WebSocket>();

function broadcast(type: string, data: unknown) {
  const msg = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// Track whether a MuJoCo sim is connected and driving state
let simConnected = false;
let latestSimState: unknown = null;

const sequencer = new TaskSequencer((state: TaskState) => {
  // Only broadcast sequencer state if no sim is connected
  if (!simConnected) {
    broadcast("taskState", state);
  }
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`Client connected (${clients.size} total)`);

  // Send current state on connect
  if (latestSimState) {
    ws.send(JSON.stringify({ type: "simState", data: latestSimState }));
  }
  ws.send(JSON.stringify({ type: "taskState", data: sequencer.getState() }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case "startTask":
          console.log("Starting sandwich task...");
          sequencer.start();
          break;
        case "stopTask":
          console.log("Stopping task.");
          sequencer.stop();
          break;
        case "userPosition":
          sequencer.updateUserPosition(msg.data.x, msg.data.y);
          break;

        // MuJoCo sim messages — forwarded to all browser clients
        case "simState":
          simConnected = true;
          latestSimState = msg.data;
          broadcast("simState", msg.data);
          break;
        case "simStart":
          simConnected = true;
          console.log("MuJoCo sim started");
          broadcast("simStart", msg.data);
          break;
        case "simComplete":
          console.log("MuJoCo sim complete");
          broadcast("simComplete", msg.data);
          simConnected = false;
          latestSimState = null;
          break;

        // Keyframe recording
        case "saveKeyframes":
          try {
            fs.writeFileSync(KEYFRAMES_PATH, JSON.stringify(msg.data, null, 2));
            console.log(`Saved ${msg.data.length} keyframes to ${KEYFRAMES_PATH}`);
            ws.send(JSON.stringify({ type: "keyframesSaved", data: { count: msg.data.length } }));
          } catch (e) {
            console.error("Failed to save keyframes:", e);
          }
          break;
        case "loadKeyframes":
          try {
            if (fs.existsSync(KEYFRAMES_PATH)) {
              const data = JSON.parse(fs.readFileSync(KEYFRAMES_PATH, "utf-8"));
              console.log(`Loaded ${data.length} keyframes from ${KEYFRAMES_PATH}`);
              ws.send(JSON.stringify({ type: "keyframesLoaded", data }));
            } else {
              ws.send(JSON.stringify({ type: "keyframesLoaded", data: [] }));
            }
          } catch (e) {
            console.error("Failed to load keyframes:", e);
            ws.send(JSON.stringify({ type: "keyframesLoaded", data: [] }));
          }
          break;

        default:
          console.log("Unknown message type:", msg.type);
      }
    } catch (e) {
      console.error("Bad message:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`Client disconnected (${clients.size} total)`);
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
