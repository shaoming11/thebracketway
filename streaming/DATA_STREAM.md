# BracketBot Data Stream: reference for visualizers

This document describes everything the **bbos data bridge** streams from a BracketBot robot over HTTP and WebSocket. Use it to build a visualizer: a 3D robot model with live joint angles, camera feeds, IMU and base telemetry, VR teleop poses, audio levels, point clouds, and so on.

The bridge runs on the robot (`~/bbapps/data_bridge/main.py`). It reads the robot's shared-memory IPC channels and **never writes to them**, so it cannot move the robot.

```
uv run ~/bbapps/data_bridge/main.py            # default: 0.0.0.0:8765, 60 Hz WebSocket push
uv run ~/bbapps/data_bridge/main.py --port 9000 --hz 30
```

Base URL: `http://localhost:8765` on the robot, or `http://<hostname>.local:8765` from another machine on the LAN (for example `http://bracketbot-0181.local:8765`). CORS is open (`*`), so a web app on any origin can connect.

---

## 1. Quick start

1. `GET /api/schema`: every channel, its fields, dtypes and shapes, measured rate, plus the robot description (URDF URL, joint names, frames).
2. Open `ws://HOST:8765/ws`. You receive one `schema` message, then `update` messages with the latest value of every channel that changed.
3. Load `/urdf/robot.urdf` (meshes resolve to `/urdf/meshes/*.stl`) and apply `derived.urdf_joints.joints` to it on every update to animate both arms.
4. Show cameras with `<img src="http://HOST:8765/camera/head.mjpeg">` (also `left` and `right`).

```js
const HOST = "http://bracketbot-0181.local:8765";
const ws = new WebSocket(HOST.replace("http", "ws") + "/ws?hz=30");
const latest = {};
let schema = null;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "schema") schema = m;           // re-sent whenever channels appear/disappear
  else Object.assign(latest, m.channels);         // m.channels: { "<channel>": {...}, ... }
};
// e.g. latest["derived.urdf_joints"].joints.lj3, latest["imu.orientation"].rpy[1]
```

---

## 2. Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/` | Debug page: all camera feeds and a live dump of every channel |
| GET | `/api/schema` | Schema JSON (section 3) |
| GET | `/api/latest` | `{server_time, channels: {name: data}}` with the latest value of every JSON channel and derived channel |
| GET | `/api/latest?channels=imu.*,derived.arm_left` | Same, filtered by comma-separated glob patterns |
| GET | `/api/latest/{channel}` | The latest data object for one channel |
| GET | `/api/raw/{channel}/{field}` | Raw little-endian bytes of one field (section 6) |
| GET | `/camera/{cam}.mjpeg` | MJPEG stream (`multipart/x-mixed-replace`), usable directly as `<img src>` |
| GET | `/camera/{cam}.jpg` | One JPEG frame |
| WS | `/ws?channels=<globs>&hz=<rate>` | JSON push stream (section 4) |
| WS | `/ws/points?channel=camera.points` | Binary point-cloud stream (section 6.2) |
| GET | `/urdf/robot.urdf` | Robot URDF with mesh paths rewritten to `meshes/<file>.stl` |
| GET | `/urdf/meshes/{file}` | STL meshes |

`{cam}` is `head`, `left`, or `right`. The full channel name (`camera.head.jpeg`) also works.

---

## 3. Schema (`GET /api/schema`, and the first WS message)

```jsonc
{
  "type": "schema",                  // present only on the WS message
  "hostname": "bracketbot-0181",
  "server_time": 1789277618.67,      // unix seconds
  "schema_version": 7,               // increments when channels appear, disappear, or reconnect
  "channels": {
    "arm_left.state": {
      "name": "arm_left.state",
      "kind": "struct",              // "struct" | "jpeg" | "points" | "audio"
      "owner": "arm_left/daemon.py", // the process that writes it
      "period_ms": 15,               // nominal publish period (null = publishes on change)
      "measured_hz": 65.4,           // actual rate over the last 2 s
      "connected": true,
      "heavy": false,                // true = large samples, copied only on demand (section 6)
      "stale_s": 0.01,               // seconds since the last publish (null = none seen)
      "fields": [
        {"name": "pos", "dtype": "<f4", "shape": [8], "encoding": "json"},
        {"name": "timestamp", "dtype": "<M8[ns]", "shape": [], "encoding": "timestamp_ns"}
      ]
    }
  },
  "derived": ["derived.arm_left", "derived.arm_right", "derived.urdf_joints"],
  "robot": {
    "urdf_url": "/urdf/robot.urdf",
    "root_link": "root",
    "T_root_arm_base": [[1,0,0,0],[0,1,0,0],[0,0,1,0.0304],[0,0,0,1]],  // 4x4
    "movable_joints": [{"name": "lj0", "type": "prismatic", "lower": -1.03, "upper": 0.0}, ...],
    "mimic_joints": {"left_right_gripper": {"joint": "left_left_gripper", "multiplier": 1, "offset": 0}, ...},
    "arms": {
      "arm_left": {"joint_names": ["lj0",...,"lj6","left_left_gripper"], "ee_link": "left_eef",
                   "home_motor_turns": [...], "ik_sign": [...], "wheel_radius_m": 0.0465, "gripper_sign": -1}
    }
  }
}
```

Field `encoding` tells you where a field shows up:
- `json`: included in WS and `/api/latest` data as a number, or as nested arrays matching `shape`.
- `string`: fixed-width bytes decoded to text. If the text is JSON, it is parsed into an object.
- `binary`: more than 4096 elements. Left out of JSON; fetch it with `/api/raw` (or the camera and point endpoints).
- `timestamp_ns`: every channel has one. It appears in data as `timestamp_ns` (int, unix nanoseconds, written when the sample was published).

**Channels are discovered at runtime.** The set depends on which daemons and apps are running: SLAM, depth, and mapping only appear when those daemons run, and `arm_*.ctrl`, `arm_*.target`, and `dataset.flag` only while a teleop app runs. Build the UI from the schema, and re-read it whenever a new `schema` message arrives.

---

## 4. WebSocket `/ws`

Query parameters:
- `channels`: comma-separated glob patterns (`arm_*.state,derived.*,imu.orientation`). Omit to get everything.
- `hz`: push rate. Default is the server's `--hz` (60).

Messages (text JSON):

```jsonc
{"type": "schema", ...}                        // on connect and on any schema change
{"type": "update", "server_time": 1789277618.67,
 "channels": {"imu.orientation": {"timestamp_ns": 1789277618952807599, "rpy": [0.03, 5.36, -5.10]},
              "derived.arm_left": {...}}}
```

Each tick sends only channels that published since the previous tick, and only their latest sample. At `hz=30`, a 100 Hz channel is decimated to 30 Hz. Use `timestamp_ns` rather than arrival time when you plot time series.

---

## 5. Channel reference

Units and meanings below come from the daemon source (`~/bbos/bbos/daemons/*/constants.py`) and were checked against live data. Entries marked *(unverified)* are best guesses.

Arrays for the arms are indexed by joint: `[J0 lift, J1, J2, J3, J4, J5, J6, J7 gripper]`.

### 5.1 Arms: `arm_left.*`, `arm_right.*`

#### `arm_{left,right}.state` · ~66 Hz · from the arm daemon

| Field | Shape | Units | Meaning |
|---|---|---|---|
| `pos` | [8] | motor turns | Measured position. **Not** URDF angles; use `derived.*` for those |
| `vel` | [8] | turns/s | Measured velocity |
| `torque` | [8] | servo units *(unverified, roughly Nm)* | Estimated torque |
| `temp` | [8] | °C | Motor temperature. Firmware trips at 55 °C |
| `current` | [8] | A | Phase current |

#### `arm_{left,right}.ctrl` · ~66 Hz · written by a controlling app (teleop). Present only while one runs

| Field | Shape | Units | Meaning |
|---|---|---|---|
| `pos` | [8] | motor turns | Commanded position (compare with `state.pos` to show tracking error) |
| `vel` | [8] | turns/s | Commanded velocity |
| `tau` | [8] | Nm | Feed-forward or torque-mode command |
| `alpha` | scalar | 0–1 | Command smoothing factor |

#### `arm_{left,right}.target` · 50 Hz · teleop's Cartesian goal before IK

| Field | Shape | Units | Meaning |
|---|---|---|---|
| `xyz` | [3] | m | End-effector target in the **arm_base frame** (section 7) |
| `quat` | [4] | xyzw | Target orientation |
| `grip` | scalar | 0–1 | Gripper command |
| `tracking` | bool | | True only while teleop is actively driving IK |

Draw it as a goal marker next to `derived.arm_*.ee_arm_base` to show IK error.

#### `arm_{left,right}.torque` · published on change

`enable` [8] bool (per-joint torque on; false means the joint is limp), `tau_mode` [8] bool, and scalar bools `compliance_mode`, `axis_aligned`, `force_only`, `j0_homing`, `calibrating`.

### 5.2 Derived arm data (computed by the bridge)

#### `derived.arm_left` / `derived.arm_right` · same rate as `arm_*.state`

```jsonc
{
  "timestamp_ns": 1789277638949185012,           // copied from arm_*.state
  "joint_names": ["lj0","lj1","lj2","lj3","lj4","lj5","lj6","left_left_gripper"],
  "motor_pos_turns": [2e-05, -0.0326, ...],       // = arm_*.state.pos
  "urdf_q": [-6e-06, -0.2045, 0.0942, 2.0793, 0.2493, -0.1833, -0.5745, 0.7992],
  "urdf_joints": {"lj0": -6e-06, ..., "left_left_gripper": 0.7992, "left_right_gripper": 0.7992},
  "gripper": 0.7992,                              // rad, = urdf_q[7]
  "ee_link": "left_eef",
  "ee_arm_base": {"pos": [0.3023, 0.0687, 0.9938], "quat_xyzw": [-0.784, 0.037, -0.611, -0.100]},
  "ee_root":     {"pos": [...], "quat_xyzw": [...]}
}
```

- `urdf_q`: joint values in URDF space, using the daemon's own `q2urdf`. `lj0`/`rj0` is the **prismatic lift in meters** (range −1.03 to 0; 0 is the top). J1–J6 are radians. Index 7 is the gripper in radians.
- `urdf_joints`: the same values keyed by URDF joint name, including the mimic joint for the second gripper finger (`*_right_gripper`).
- `ee_arm_base`: end-effector pose from the robot's IK solver's forward kinematics, in the `arm_base` frame. This is the frame used by `arm_*.target` and teleop, so the two are directly comparable. Note that `q` and `-q` are the same rotation.
- `ee_root`: the same pose in the URDF root link frame (`T_root_arm_base` applied). Use this when you attach markers to a rendered URDF.

#### `derived.urdf_joints`

`{"timestamp_ns", "joints": {<every movable URDF joint of both arms>: value}}`. This is the one-stop input for animating the URDF (section 7).

### 5.3 Cameras

| Channel | Kind | Rate | Content |
|---|---|---|---|
| `camera.head.jpeg` | jpeg | 30 Hz | Head **stereo** camera, 2560×960 **side-by-side**. Left eye is x∈[0,1280), right eye is x∈[1280,2560) |
| `camera.left.jpeg` | jpeg | 30 Hz | Left wrist camera, 640×480 |
| `camera.right.jpeg` | jpeg | 30 Hz | Right wrist camera, 640×480 |
| `camera.head.rgb` | struct, heavy | 30 Hz | Uncompressed head frame, `rgb` uint8 [960, 2560, 3]. Binary only, 7.4 MB per frame; prefer the JPEG |
| `camera.{head,left,right}.status` | struct | 1 Hz | `streaming` (1 = publishing), `fps` (frames/s reaching shared memory) |

JSON data for jpeg channels contains only `jpeg_len` (bytes) and `timestamp_ns`. Use `/camera/{cam}.mjpeg` or `/camera/{cam}.jpg` for pixels.

To show only the head camera's left eye, crop in the browser: draw the `<img>` onto a canvas with `drawImage(img, 0, 0, img.naturalWidth/2, img.naturalHeight, ...)`, or put it in a container with `overflow:hidden` and set the image to `width:200%`.

### 5.4 IMU and base

| Channel | Rate | Fields |
|---|---|---|
| `imu.orientation` | 100 Hz | `rpy` [3]: fused **roll, pitch, yaw in degrees**. The source comment says radians, but live values are degrees (a pitch of 5.4 matches the accelerometer tilt). Positive pitch = top of the robot leaning forward |
| `imu.raw` | 100 Hz | `accel` [3] m/s² (bias-corrected, ≈[0,0,9.8] upright), `gyro` [3] rad/s |
| `imu.diagnostics` | 1 Hz | `words` [24] uint32: opaque firmware timing counters |
| `drive.state` | 100 Hz | Per wheel, index `[axis0, axis1]` (axis0 = right wheel, axis1 = left wheel): `pos` [2] *(wheel turns, unverified)*, `vel` [2] *(turns/s)*, `torque` [2] Nm, `ff` [2] friction feed-forward Nm, `ctrl` [2] controller output, `iq` [2] motor current A, `gains` [2]; plus scalars `pos_estimate` and `yaw_error` |
| `drive.ctrl` | 100 Hz | Written by a driving app: `twist` [2] = [linear m/s, angular rad/s], `twist_torque` [2] |
| `drive.status` | 0.1 Hz | `voltage` = **battery bus voltage (V)**, `errors` [2] ODrive error codes per axis, `loop_hz` |
| `base.health` | 1 Hz | STM counters: `control_tick`, `missed_deadlines`, `exec_cycles`, `axis0_error`, `axis1_error`, `can_rx_lost`, `can_rx_fifo_full`, `can_hb_stale`, `flags`, `link_crc_errors` |

Robot geometry for a top-down base view: wheel diameter 0.165 m, track width 0.3275 m, max 0.3 m/s linear and 0.9 rad/s angular. This is not streamed; it comes from `bbos/daemons/base/constants.py`.

### 5.5 Meta Quest teleop

#### `quest.controllers` · 50 Hz

| Field | Shape | Meaning |
|---|---|---|
| `T_head` | [4,4] | Headset pose, 4×4 homogeneous, row-major. Translation is `T_head[i][3]` (m). Column 2 of the rotation is the head's forward direction; column 1 is up |
| `left_pose`, `right_pose` | [7] | `[x, y, z, qx, qy, qz, qw]`. Controller pose **re-centered on the head** (XY and yaw relative to the head, absolute Z height in m). Robot axes: x forward, y left, z up |
| `left_trigger`, `right_trigger`, `left_squeeze`, `right_squeeze` | scalar | 0–1 |
| `left_thumbstick`, `right_thumbstick` | [2] | −1..1 |
| `left_thumbstick_click`, `left_a`, `left_b`, `right_*` (same) | scalar | 0 or 1. On the left controller, `left_a` = X and `left_b` = Y |

Teleop converts a hand pose into an arm target by keeping XY and remapping height: `z_target = z − head_height_at_start + 1.265` (1.265 m = robot shoulder height). The result is `arm_*.target`.

Other Quest channels: `quest.link` (`connected` 0/1, 2 Hz), `quest.joystick` (`left` [2] and `right` [2] thumbsticks, published by teleop), and `quest.haptic` (last haptic command: `hand` 0=L/1=R/2=both, `frequency` Hz, `amplitude` 0–1, `duration` s).

### 5.6 Audio and LED

| Channel | Rate | Fields |
|---|---|---|
| `mic.audio` | 10 Hz | `audio` [1600, 1] int16 PCM, mono, 16 kHz (100 ms chunks). Bridge-added: `rms_dbfs` and `peak_dbfs` (dBFS, 0 = full scale, around −60 = silence) |
| `mic.ref_level` | 10 Hz | `dbfs`: level of the speaker echo reference. −240 means the speaker is silent |
| `speaker.audio` | on playback | `audio` int16 chunks being played (only while something plays) |
| `led.state` | 5 Hz | `rgb` [3] uint8: the color currently on the status LED |
| `wakeword.state` | 1 Hz | `active` bool: wake phrase detected since the previous publish |

### 5.7 Misc

- `dataset.flag` (50 Hz while teleop runs): `prefix`, `name` (dataset or episode name), `text`, `toggle_episode` (bool), `drop_episode` (bool). Useful for a recording indicator.
- `usb.tree` (on change): `json` is an object `{"usb-a-1": {"<port>": {"device": {...}|null, "over_current", "errors"}}, "usb_c": ...}` describing which physical USB port has which device. `shape_hash` is a digest.

### 5.8 Perception channels (present only when those daemons run)

These were **not running when this document was written**. Their layouts come from the source; check field details with `/api/schema` when they appear.

| Channel | Rate | Fields |
|---|---|---|
| `camera.points` | 10 Hz | Depth point cloud: `num_points` int32, `points` float16 [N,3] (m; drawn z-up, so most likely the base frame), `colors` uint8 [N,3] RGB, `idx_2d` int32 [N] (pixel index in the 512×384 depth image). N max = 196,608. Stream with `/ws/points` |
| `camera.depth` | 10 Hz | `depth`, `depth_raw` uint16 [384, 512] *(likely mm)* |
| `camera.rect` | 10 Hz | `left` uint8 [384, 512, 3]: rectified left eye |
| `slam.pose` | 30 Hz | `pos` [3] m, `quat` [4] (map frame, pose-graph optimized), `vo_pos` [3] and `vo_quat` [4] (raw visual odometry), `pgo_count` (increments when the map is re-optimized) |
| `slam.health` | on change | bools `degraded`, `stalled`, `vo_lost`, `localized`, `relocalized`; `last_gap_ms` |
| `slam.history_generation` | 2 Hz | `generation`, `num_poses`, `pgo_count` |
| `mapping.grid2d` | 5 Hz | `grid` uint8 [1500,1500] top-down occupancy grid, 3 cm cells (45 m square; cell value meaning unverified), `origin` [2] m, `robot_pos` [2] m, `robot_heading` rad |
| `mapping.voxels` | 2 Hz | `num_voxels`, `coords` float32 [1e6,3] m (3 cm voxels), `colors` uint8 [1e6,3], `labels` int8 (semantic class), `info` int32 [1e6,4], `num_holes`, `holes_xy`, `holes_info`, `origin`, `robot_pos`, `robot_heading` |
| `slam.trace`, `mapping.rebuild`, `mapping.reproject` | | Debug channels (opaque payloads and rebuild progress) |

The head camera's pose relative to the base is fixed: 1.55 m high, pitched 33° down, −1° roll (`bbos/daemons/depth/constants.py`).

---

## 6. Binary data

### 6.1 `/api/raw/{channel}/{field}`

The response body is the field's raw bytes, C-order, little-endian. Headers:
- `X-Dtype`: numpy dtype string: `<f4` float32, `<f2` float16, `|u1` uint8, `<i2` int16, `<i4` int32, `<f8` float64, `|b1` bool
- `X-Shape`: comma-separated shape, for example `960,2560,3`
- `X-Timestamp-Ns`: sample timestamp

For count-prefixed channels (`camera.points`, `mapping.voxels`) the full fixed-capacity buffer is returned. Slice to `num_*`, which is available from the JSON data.

```js
const r = await fetch(`${HOST}/api/raw/camera.head.rgb/rgb`);
const shape = r.headers.get("X-Shape").split(",").map(Number);   // [960, 2560, 3]
const px = new Uint8Array(await r.arrayBuffer());
```

**Heavy channels** (sample > 256 KB: cameras, depth, mapping) are only copied while someone is asking for them. Any `/api/raw`, camera, or `/ws/points` request keeps a channel "hot" for 3 s. After a cold start the first request can take up to one publish period. `measured_hz` stays accurate either way.

### 6.2 `/ws/points` (point cloud)

Each binary message is one cloud, little-endian:

| Offset | Size | Type | Content |
|---|---|---|---|
| 0 | 4 | int32 | `N` = number of points |
| 4 | 8 | int64 | `timestamp_ns` |
| 12 | 6·N | float16 × 3N | `x,y,z` per point, meters |
| 12+6N | 3·N | uint8 × 3N | `r,g,b` per point |

```js
const ws = new WebSocket(`${HOST.replace("http","ws")}/ws/points`);
ws.binaryType = "arraybuffer";
ws.onmessage = ({data}) => {
  const dv = new DataView(data), n = dv.getInt32(0, true);
  const xyz16 = new Uint16Array(data.slice(12, 12 + 6*n));   // float16: decode (or Float16Array where supported)
  const rgb = new Uint8Array(data, 12 + 6*n, 3*n);
};
```

Decoding float16 in JS (from `bbapps/examples/view_depth.py`):
```js
const f16 = h => { const s=(h&0x8000)?-1:1, e=(h>>10)&0x1f, f=h&0x3ff;
  return e===0 ? s*2**-14*(f/1024) : e===31 ? (f?NaN:s*Infinity) : s*2**(e-15)*(1+f/1024); };
```

---

## 7. Rendering the robot (arms)

**Model.** `GET /urdf/robot.urdf` is one URDF for the whole robot (mast, base, both arms, head), 53 joints, with STL meshes at `/urdf/meshes/`. Load it with `urdf-loader` (three.js), `ros3d`, or similar, and pass `http://HOST:8765/urdf/` as the package or base path.

**Movable joints.**

| Joint | Type | Meaning |
|---|---|---|
| `lj0`, `rj0` | prismatic (m) | Vertical lift carriage, −1.03 to 0 m (0 = top) |
| `lj1`…`lj6`, `rj1`…`rj6` | revolute (rad) | Arm joints, shoulder to wrist |
| `left_left_gripper`, `right_left_gripper` | revolute (rad) | Gripper jaw |
| `left_right_gripper`, `right_right_gripper` | revolute, mimic (×1) | Second jaw. Already included in `derived.urdf_joints` |

**Animate.** On every update:
```js
for (const [name, value] of Object.entries(latest["derived.urdf_joints"].joints))
  robot.joints[name]?.setJointValue(value);
```
Do **not** apply `arm_*.state.pos` directly. Those are motor turns with per-joint signs and a lift gear ratio. The bridge converts them with the robot's own `q2urdf`:
`q = turns·2π; q[0] *= 0.0465 (right arm: −0.0465); q[7] *= gripper_sign; q[0:7] *= ik_sign`.
The signs are listed in `schema.robot.arms.*`. To visualize *commanded* poses from `arm_*.ctrl.pos`, apply the same formula.

**Frames.**
- URDF `root` link: robot base. The arm IK frame `arm_base` is `root` shifted +3 cm in z (`schema.robot.T_root_arm_base`).
- `arm_base` / teleop / IK frame: **x forward, y left, z up**, meters, origin at the base. Shoulder height is about 1.265 m. `arm_*.target.xyz`, `quest.controllers.*_pose`, and `derived.arm_*.ee_arm_base` all use this frame.
- three.js is y-up. Rotate the URDF root by −90° about X, or set `camera.up = (0,0,1)` as the bbos examples do.
- Quaternions are **xyzw** everywhere in this stream. (viser and some libraries want wxyz.)

**Useful overlays** (the examples in `bbapps/examples` do these):
- End-effector frames: `derived.arm_*.ee_root` as an axes gizmo.
- IK goal: `arm_*.target.xyz` / `quat` (arm_base frame) as a sphere + axes, shown only when `tracking` is true.
- Commanded "ghost" arm from `arm_*.ctrl.pos`, next to the measured arm.
- Joint heat: color each link by `arm_*.state.temp` (warn at 50 °C, trip at 55 °C) or by `current`.
- Torque enabled: grey out joints where `arm_*.torque.enable[i]` is false.
- VR: head sphere at `T_head` translation; controller spheres at `*_pose`; button and trigger bars.

---

## 8. Suggested dashboard layout

| Panel | Channels |
|---|---|
| 3D robot | `/urdf/robot.urdf` + `derived.urdf_joints`, `derived.arm_*.ee_root`, `arm_*.target` |
| Cameras | `/camera/head.mjpeg` (stereo, or crop the left eye), `/camera/left.mjpeg`, `/camera/right.mjpeg`, with fps from `camera.*.status` |
| Joint table / plots | `derived.arm_*.urdf_q`, `arm_*.state.vel`, `temp`, `current`; commanded vs. measured from `arm_*.ctrl.pos` |
| Attitude | `imu.orientation.rpy` (artificial horizon); `imu.raw` plots |
| Base | `drive.state.vel` / `torque` per wheel, `drive.ctrl.twist`, battery `drive.status.voltage`, `base.health` error counters |
| Teleop | `quest.link.connected`, `quest.controllers` poses and buttons, `dataset.flag` recording state |
| Audio | `mic.audio.rms_dbfs` meter or waveform from `audio`; `wakeword.state.active` flash |
| Status | Every schema channel with `measured_hz`, `stale_s`, `connected`; `led.state.rgb` swatch; `usb.tree` |
| Perception (if present) | `/ws/points` cloud, `slam.pose` trajectory, `mapping.grid2d` image, `slam.health` badges |

---

## 9. Notes and limits

- Bridge CPU is about half of one Jetson core with all channels live and teleop running.
- JSON floats are rounded to 6 decimals. NaN and Inf become `null`.
- A channel whose writer process dies stays in the schema with `connected: false` until its shared-memory file is removed. A restarted writer is reconnected automatically.
- Arrays with more than 4096 elements are never sent as JSON.
- The bridge is read-only by design. Commanding the robot means using bbos Writers (`arm_*.ctrl`, `drive.ctrl`, `led.ctrl`, ...) from a bbos app on the robot; that is outside this stream.
