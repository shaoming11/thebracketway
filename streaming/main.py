# /// script
# requires-python = "==3.10.*"
# dependencies = [
#   "bbos",
#   "fastapi",
#   "uvicorn",
#   "websockets",
#   "numpy<2",
# ]
# [tool.uv.sources]
# bbos = { path = "/home/bracketbot/bbos", editable = true }
# ///
"""Data bridge: stream every bbos IPC channel to a local web server.

Run:  uv run ~/bbapps/data_bridge/main.py [--port 8765] [--host 0.0.0.0] [--hz 60]
Open: http://localhost:8765/          (debug page)
Docs: ~/bbapps/data_bridge/DATA_STREAM.md

Read-only: opens no Writers, so it never commands the robot. Channels are discovered
from /dev/shm at runtime, so a daemon started later (slam, depth, mapping) shows up
without a restart.
"""
import argparse
import asyncio
import fnmatch
import json
import math
import re
import socket
import threading
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import uvicorn
from bbos import Config, Reader
from bbos.ipc import _lib
from bbos.time import Loop
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse

Loop._silent = True

SHM_DIR = Path("/dev/shm")
META_SIZE = 4096
RESCAN_S = 2.0
JSON_MAX_ELEMS = 4096        # fields larger than this are binary-only (/api/raw)
HEAVY_ITEM_BYTES = 256_000   # channels with bigger samples are copied only while someone wants them
DEMAND_S = 3.0               # how long one request keeps a heavy channel hot
FLOAT_DECIMALS = 6
ARMS = ("arm_left", "arm_right")
URDF_PATH = Path(Config("arm_left").urdf_path)
MESH_DIR = URDF_PATH.parent / "meshes"
PUSH_HZ = 60.0


# ============================================================================
# URDF helpers (fixed arm_base -> root transform, mimic joints)
# ============================================================================
def rpy_xyz_to_T(rpy, xyz):
    r, p, y = rpy
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    T = np.eye(4)
    T[:3, :3] = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
                 [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
                 [-sp, cp * sr, cp * cr]]
    T[:3, 3] = xyz
    return T


def quat_xyzw_to_R(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def R_to_quat_xyzw(R):
    w = math.sqrt(max(0.0, 1 + R[0, 0] + R[1, 1] + R[2, 2])) / 2
    x = math.copysign(math.sqrt(max(0.0, 1 + R[0, 0] - R[1, 1] - R[2, 2])) / 2, R[2, 1] - R[1, 2])
    y = math.copysign(math.sqrt(max(0.0, 1 - R[0, 0] + R[1, 1] - R[2, 2])) / 2, R[0, 2] - R[2, 0])
    z = math.copysign(math.sqrt(max(0.0, 1 - R[0, 0] - R[1, 1] + R[2, 2])) / 2, R[1, 0] - R[0, 1])
    return [x, y, z, w]


def load_urdf_info():
    root = ET.parse(URDF_PATH).getroot()
    by_child, mimics, movable = {}, {}, []
    for j in root.findall("joint"):
        o = j.find("origin")
        rpy = [float(v) for v in (o.get("rpy", "0 0 0") if o is not None else "0 0 0").split()]
        xyz = [float(v) for v in (o.get("xyz", "0 0 0") if o is not None else "0 0 0").split()]
        by_child[j.find("child").get("link")] = (j.get("type"), j.find("parent").get("link"), rpy_xyz_to_T(rpy, xyz))
        if j.get("type") != "fixed":
            lim = j.find("limit")
            get = lambda k: float(lim.get(k)) if lim is not None and lim.get(k) is not None else None
            movable.append({"name": j.get("name"), "type": j.get("type"), "lower": get("lower"), "upper": get("upper")})
        m = j.find("mimic")
        if m is not None:
            mimics[j.get("name")] = (m.get("joint"), float(m.get("multiplier", 1)), float(m.get("offset", 0)))
    # arm_base hangs off the fixed body, so its pose in the root link is constant.
    T, link = np.eye(4), "arm_base"
    while link in by_child:
        jtype, parent, Tj = by_child[link]
        if jtype != "fixed":
            raise RuntimeError(f"arm_base -> root passes through movable joint ({link})")
        T, link = Tj @ T, parent
    return {"root_link": link, "T_root_arm_base": T, "mimics": mimics, "movable_joints": movable}


# ============================================================================
# Channel discovery + reading
# ============================================================================
def shm_meta(path):
    """The bbos header ({"dtype", "period", "owner"}) of a /dev/shm file, or None."""
    try:
        with open(path, "rb") as f:
            head = f.read(META_SIZE)
    except OSError:
        return None
    i = head.find(b'{"caller"')
    if i < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(head[i:].split(b"\x00", 1)[0].decode())[0]
    except (ValueError, UnicodeDecodeError):
        return None


def classify(names):
    if "jpeg" in names and "jpeg_len" in names:
        return "jpeg"
    if {"num_points", "points", "colors"} <= set(names):
        return "points"
    if "audio" in names:
        return "audio"
    return "struct"


def field_spec(dtype):
    out = []
    for name in dtype.names:
        sub = dtype.fields[name][0]
        base, shape = (sub.base, list(sub.shape)) if sub.shape else (sub, [])
        n = int(np.prod(shape)) if shape else 1
        out.append({"name": name, "dtype": base.str, "shape": shape,
                    "encoding": "string" if base.kind == "S" else
                                "timestamp_ns" if base.kind == "M" else
                                "json" if n <= JSON_MAX_ELEMS else "binary"})
    return out


def to_json_value(arr):
    if arr.dtype.kind == "S":
        s = bytes(arr).rstrip(b"\x00").decode("utf-8", "replace")
        try:
            return json.loads(s) if s[:1] in ("{", "[") else s
        except ValueError:
            return s
    if arr.dtype.kind == "f":
        arr = np.round(arr.astype(np.float64), FLOAT_DECIMALS)
        if not np.isfinite(arr).all():
            return np.where(np.isfinite(arr), arr, None).tolist()
    return arr.tolist()


class Channel:
    def __init__(self, name, meta):
        self.name = name
        self.meta = meta
        self.reader = Reader(name, keeptime=False)
        self.dtype = None
        self.kind = None
        self.fields = []
        self.heavy = False
        self.last_seq = None
        self.last_check = 0.0
        self.pubs = []            # recent publish times, for the rate estimate
        self.raw = None           # latest np.void sample, kept for binary consumers
        self.json = None          # latest JSON-able dict
        self.version = 0
        self.demand_until = 0.0

    def describe(self):
        now = time.time()
        recent = [t for t in self.pubs if now - t < 2.0]
        hz = (len(recent) - 1) / (recent[-1] - recent[0]) if len(recent) > 1 and recent[-1] > recent[0] else 0.0
        return {"name": self.name, "kind": self.kind, "owner": self.meta.get("owner"),
                "period_ms": self.meta.get("period"), "measured_hz": round(hz, 1),
                "connected": bool(self.reader.readable), "heavy": self.heavy,
                "stale_s": round(now - self.pubs[-1], 2) if self.pubs else None,
                "fields": self.fields}

    def close(self):
        try:
            self.reader.__exit__(None, None, None)
        except Exception:
            pass


class Hub:
    def __init__(self):
        self.lock = threading.Lock()
        self.channels: dict[str, Channel] = {}
        self.derived: dict[str, dict] = {}
        self.derived_version: dict[str, int] = {}
        self.schema_version = 0
        self.urdf = load_urdf_info()
        self.arm_cfg = {}
        for arm in ARMS:
            try:
                cfg = Config(arm)
                cfg.ik.init()
                self.arm_cfg[arm] = cfg
            except Exception as e:
                print(f"[!] {arm}: no config/IK ({e}); derived arm data disabled", flush=True)

    # -- reading thread -------------------------------------------------------
    def want(self, name):
        ch = self.channels.get(name)
        if ch is not None:
            ch.demand_until = time.time() + DEMAND_S

    def rescan(self):
        present = {}
        for p in SHM_DIR.iterdir():
            if p.name in self.channels:
                present[p.name] = None
            elif p.is_file() and not p.name.startswith("sem.") and not p.name.endswith(".log"):
                meta = shm_meta(p)
                if meta and "dtype" in meta:
                    present[p.name] = meta
        changed = False
        for name, meta in present.items():
            if name not in self.channels:
                self.channels[name] = Channel(name, meta)
                changed = True
        for name in [n for n in self.channels if n not in present]:
            self.channels.pop(name).close()
            changed = True
        if changed:
            self.schema_version += 1

    def poll(self, ch: Channel, now):
        r = ch.reader
        if r.readable:
            # Peek the seqlock counter first: Reader.ready() memcpy's the whole sample,
            # which is megabytes for camera/depth/mapping channels.
            seq = _lib.ipc_seq_read(r._map)
            alive = True
            if now - ch.last_check > 0.5:
                ch.last_check = now
                alive = bool(_lib.ipc_check_pid(r._writer_pid)) and _lib.ipc_inode(ch.name.encode()) == r._inode
            if alive:
                if seq == ch.last_seq or seq & 1:
                    return
                ch.last_seq = seq
                ch.pubs.append(now)
                if len(ch.pubs) > 400:
                    del ch.pubs[:200]
                if ch.heavy and now > ch.demand_until:
                    return
        elif now - ch.last_check < 0.5:
            return
        else:
            ch.last_check = now
        was_readable = r.readable
        fresh = r.ready()
        if was_readable != r.readable:
            self.schema_version += 1
        if not r.readable:
            return
        if ch.dtype is None or ch.dtype != r._dtype:
            ch.dtype = r._dtype
            ch.kind = classify(ch.dtype.names)
            ch.fields = field_spec(ch.dtype)
            ch.heavy = ch.dtype.itemsize > HEAVY_ITEM_BYTES
            self.schema_version += 1
        ch.last_seq = _lib.ipc_seq_read(r._map)
        if fresh or ch.json is None:
            self.publish(ch, r.data)

    def publish(self, ch: Channel, data):
        out = {"timestamp_ns": int(data["timestamp"].view("i8"))}
        for f in ch.fields:
            if f["encoding"] in ("json", "string") and not (ch.kind == "jpeg" and f["name"] == "jpeg"):
                out[f["name"]] = to_json_value(data[f["name"]])
        if ch.kind == "audio":
            a = data["audio"].astype(np.float32)
            out["rms_dbfs"] = round(20 * math.log10(max(float(np.sqrt(np.mean(a ** 2))), 1e-9) / 32768), 2)
            out["peak_dbfs"] = round(20 * math.log10(max(float(np.max(np.abs(a))), 1e-9) / 32768), 2)
        with self.lock:
            ch.raw = data if (ch.kind in ("jpeg", "points") or ch.heavy) else None
            ch.json = out
            ch.version += 1
        if ch.name.endswith(".state") and ch.name[:-6] in self.arm_cfg:
            self.derive_arm(ch.name[:-6], data)

    def derive_arm(self, arm, data):
        cfg = self.arm_cfg[arm]
        motor = np.array(data["pos"], np.float64)
        q = cfg.q2urdf(motor.copy())
        joints = {n: float(q[i]) for i, n in enumerate(cfg.joint_names)}
        for jn, (src, mult, off) in self.urdf["mimics"].items():
            if src in joints:
                joints[jn] = joints[src] * mult + off
        pos, quat = cfg.ik.fk(list(q[:7]))
        T = self.urdf["T_root_arm_base"]
        pos_root = T[:3, :3] @ pos + T[:3, 3]
        quat_root = R_to_quat_xyzw(T[:3, :3] @ quat_xyzw_to_R(quat))
        r6 = lambda v: [round(float(x), FLOAT_DECIMALS) for x in v]
        ts = int(data["timestamp"].view("i8"))
        out = {
            "timestamp_ns": ts,
            "joint_names": list(cfg.joint_names),
            "motor_pos_turns": r6(motor),
            "urdf_q": r6(q),
            "urdf_joints": {k: round(v, FLOAT_DECIMALS) for k, v in joints.items()},
            "gripper": round(float(q[7]), FLOAT_DECIMALS),
            "ee_link": cfg.ee_frame,
            "ee_arm_base": {"pos": r6(pos), "quat_xyzw": r6(quat)},
            "ee_root": {"pos": r6(pos_root), "quat_xyzw": r6(quat_root)},
        }
        with self.lock:
            self.derived[f"derived.{arm}"] = out
            merged = {}
            for a in ARMS:
                merged.update(self.derived.get(f"derived.{a}", {}).get("urdf_joints", {}))
            self.derived["derived.urdf_joints"] = {"timestamp_ns": ts, "joints": merged}
            for n in (f"derived.{arm}", "derived.urdf_joints"):
                self.derived_version[n] = self.derived_version.get(n, 0) + 1

    def run(self):
        last_scan = 0.0
        while True:
            now = time.time()
            if now - last_scan > RESCAN_S:
                last_scan = now
                self.rescan()
            for ch in list(self.channels.values()):
                try:
                    self.poll(ch, now)
                except Exception as e:
                    print(f"[!] {ch.name}: {e!r}", flush=True)
                    ch.last_check = now
            time.sleep(0.001)

    # -- views ----------------------------------------------------------------
    def schema(self):
        return {
            "hostname": socket.gethostname(),
            "server_time": time.time(),
            "schema_version": self.schema_version,
            "channels": {n: c.describe() for n, c in sorted(self.channels.items()) if c.kind is not None},
            "derived": sorted(self.derived),
            "robot": {
                "urdf_url": "/urdf/robot.urdf",
                "root_link": self.urdf["root_link"],
                "T_root_arm_base": np.round(self.urdf["T_root_arm_base"], 9).tolist(),
                "movable_joints": self.urdf["movable_joints"],
                "mimic_joints": {k: {"joint": s, "multiplier": m, "offset": o}
                                 for k, (s, m, o) in self.urdf["mimics"].items()},
                "arms": {a: {"joint_names": list(c.joint_names), "ee_link": c.ee_frame,
                             "home_motor_turns": np.asarray(c.home).tolist(),
                             "ik_sign": np.asarray(c.ik_sign).tolist(), "wheel_radius_m": c.wheel_radius,
                             "gripper_sign": c.gripper_sign} for a, c in self.arm_cfg.items()},
            },
        }

    def snapshot(self, patterns=None, since=None):
        """({name: data}, {name: version}) for matching channels + derived, skipping versions in `since`."""
        out, versions = {}, {}
        with self.lock:
            items = [(n, c.version, c.json) for n, c in self.channels.items() if c.json is not None]
            items += [(n, self.derived_version[n], d) for n, d in self.derived.items()]
        for name, ver, data in items:
            if patterns and not any(fnmatch.fnmatch(name, p) for p in patterns):
                continue
            versions[name] = ver
            if since is None or since.get(name) != ver:
                out[name] = data
        return out, versions


hub = Hub()
app = FastAPI(title="bbos data bridge")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Dtype", "X-Shape", "X-Timestamp-Ns"])


def get_channel(name):
    ch = hub.channels.get(name)
    if ch is None or ch.kind is None:
        raise HTTPException(404, f"no channel {name}")
    return ch


async def wait_raw(ch, timeout=1.0):
    # A cold heavy channel still holds whatever sample it copied last; wait for a fresh one.
    cold = time.time() > ch.demand_until
    start_version = ch.version
    hub.want(ch.name)
    deadline = time.time() + timeout
    while (ch.raw is None or (cold and ch.version == start_version)) and time.time() < deadline:
        await asyncio.sleep(0.01)
    with hub.lock:
        return ch.raw, ch.version


@app.get("/api/schema")
async def api_schema():
    return JSONResponse(hub.schema())


@app.get("/api/latest")
async def api_latest(channels: str = ""):
    data, _ = hub.snapshot([p for p in channels.split(",") if p] or None)
    return JSONResponse({"server_time": time.time(), "channels": data})


@app.get("/api/latest/{name}")
async def api_latest_one(name: str):
    data, _ = hub.snapshot([name])
    if name not in data:
        raise HTTPException(404, f"no data for {name}")
    return JSONResponse(data[name])


@app.get("/api/raw/{name}/{field}")
async def api_raw(name: str, field: str):
    ch = get_channel(name)
    if field not in ch.dtype.names:
        raise HTTPException(404, f"{name} has no field {field}")
    if ch.raw is None and not ch.heavy and ch.kind not in ("jpeg", "points"):
        # Light channels keep no raw copy; rebuild the field from its JSON form.
        if ch.json is None or field not in ch.json:
            raise HTTPException(503, "no sample yet")
        arr = np.asarray(ch.json[field], dtype=ch.dtype.fields[field][0].base)
    else:
        sample, _ = await wait_raw(ch)
        if sample is None:
            raise HTTPException(503, "no sample yet")
        arr = np.ascontiguousarray(sample[field])
    return Response(arr.tobytes(), media_type="application/octet-stream", headers={
        "X-Dtype": arr.dtype.str, "X-Shape": ",".join(map(str, arr.shape)),
        "X-Timestamp-Ns": str(ch.json["timestamp_ns"] if ch.json else 0)})


def jpeg_channel(cam):
    return get_channel(cam if cam.endswith(".jpeg") else f"camera.{cam}.jpeg")


def jpeg_bytes(sample):
    return bytes(sample["jpeg"][:int(sample["jpeg_len"])])


@app.get("/camera/{cam}.jpg")
async def camera_frame(cam: str):
    sample, _ = await wait_raw(jpeg_channel(cam))
    if sample is None:
        raise HTTPException(503, "no frame yet")
    return Response(jpeg_bytes(sample), media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@app.get("/camera/{cam}.mjpeg")
async def camera_stream(cam: str):
    ch = jpeg_channel(cam)

    async def gen():
        seen = -1
        while True:
            hub.want(ch.name)
            with hub.lock:
                sample, ver = ch.raw, ch.version
            if sample is not None and ver != seen:
                seen = ver
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg_bytes(sample) + b"\r\n"
            await asyncio.sleep(0.01)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.websocket("/ws")
async def ws_state(ws: WebSocket, channels: str = "", hz: float = 0):
    await ws.accept()
    patterns = [p for p in channels.split(",") if p] or None
    period = 1.0 / (hz if hz > 0 else PUSH_HZ)
    seen, schema_seen = {}, -1
    try:
        while True:
            if hub.schema_version != schema_seen:
                schema_seen = hub.schema_version
                await ws.send_text(json.dumps({"type": "schema", **hub.schema()}))
            data, seen = hub.snapshot(patterns, seen)
            if data:
                await ws.send_text(json.dumps({"type": "update", "server_time": time.time(), "channels": data}))
            await asyncio.sleep(period)
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.websocket("/ws/points")
async def ws_points(ws: WebSocket, channel: str = "camera.points"):
    await ws.accept()
    seen = -1
    try:
        while True:
            ch = hub.channels.get(channel)
            if ch is not None:
                hub.want(channel)
                with hub.lock:
                    s, ver = ch.raw, ch.version
                if s is not None and ver != seen:
                    seen = ver
                    n = int(s["num_points"])
                    await ws.send_bytes(np.int32(n).tobytes() + np.int64(s["timestamp"].view("i8")).tobytes()
                                        + s["points"][:n].astype("<f2").tobytes()
                                        + s["colors"][:n].astype(np.uint8).tobytes())
            await asyncio.sleep(0.02)
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.get("/urdf/robot.urdf")
async def urdf_file():
    text = re.sub(r"package://[^/\"]+/meshes/", "meshes/", URDF_PATH.read_text())
    return Response(text, media_type="application/xml")


@app.get("/urdf/meshes/{fname}")
async def urdf_mesh(fname: str):
    p = (MESH_DIR / fname).resolve()
    if p.parent != MESH_DIR.resolve() or not p.is_file():
        raise HTTPException(404)
    return FileResponse(p, media_type="model/stl")


INDEX = """<!doctype html><html><head><meta charset="utf-8"><title>bbos data bridge</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:16px;background:#111;color:#ddd;font:13px monospace}a{color:#8ab4f8}
.cams{display:flex;flex-wrap:wrap;gap:8px}.cams img{height:180px;border-radius:4px;background:#222}
pre{white-space:pre-wrap;word-break:break-all}</style></head><body>
<h2>bbos data bridge</h2>
<p><a href="/api/schema">/api/schema</a> · <a href="/api/latest">/api/latest</a> · <a href="/urdf/robot.urdf">/urdf/robot.urdf</a></p>
<div class="cams" id="cams"></div><pre id="out">connecting...</pre>
<script>
const latest={};
const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws?hz=10');
ws.onmessage=e=>{const m=JSON.parse(e.data);
 if(m.type==='schema'){const c=document.getElementById('cams');c.innerHTML='';
  for(const [n,ch] of Object.entries(m.channels)) if(ch.kind==='jpeg'){const i=document.createElement('img');i.src='/camera/'+n+'.mjpeg';i.title=n;c.appendChild(i);}}
 else Object.assign(latest,m.channels);
 document.getElementById('out').textContent=Object.keys(latest).sort().map(k=>k+' '+JSON.stringify(latest[k])).join('\\n\\n');};
</script></body></html>"""


@app.get("/")
async def index():
    return HTMLResponse(INDEX)


def main():
    global PUSH_HZ
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--hz", type=float, default=PUSH_HZ, help="default /ws push rate")
    args = ap.parse_args()
    PUSH_HZ = args.hz
    threading.Thread(target=hub.run, daemon=True).start()
    print(f"[+] data bridge on http://localhost:{args.port}/  (http://{socket.gethostname()}.local:{args.port}/)", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
