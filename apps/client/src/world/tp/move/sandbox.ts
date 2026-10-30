import { type AvatarLayers, DEFAULT_AVATAR, Grid } from "@yutopia/shared";
import {
  type Body,
  dodging,
  type Footing,
  flowLook,
  GRIP,
  KH_FEEL,
  KH_MOVE,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveSpec,
  newBody,
  SPIN_LEN,
  type StepEvents,
  speedOf,
  stepBody,
} from "@yutopia/shared/move";
import * as T3 from "three";
import * as C from "../../chars";
import type { LookAt } from "../../chars/anim/hero";
// (the input chunk's parts, not its index: its marker counts the world's chunk for the budget)
import { isMac, keyLabel, khBindings, learnLayout, padLabel, plan29Bindings, walkKeys } from "../../input/bindings";
import { afterFirstStep, camLook, MoveControls } from "../../input/controls";
import { type CamTune, type Follow, FollowCam } from "../follow-cam";
import { joltPad, LAND, onPadLand, WALL_H, YARD } from "./jolt-pad";

// /dev/move — the sandbox (docs/plan/29-the-move.md, phase 1): walk, run,
// jump, vault, climb, roll and slide on a test pad made to try each thing —
// a ladder of tops to get over, a platform with gaps to jump, a strip of each
// footing (floor, path, snow, deep snow, ice), pillars to slide along, a
// corridor, a ring to circle — with the body's state on graphs and every
// number on a slider, to sign off the feel on the keys and on a pad.
// Plan 56's phase 1 (docs/plan/56-the-controls.md): the KH body and camera by
// default (KH_MOVE, follow-cam.ts, the KH keys; the mouse is the camera, no pointer), today's a click away
// on the panel (or ?today=1) to compare; a tower to double-jump, wide gaps to
// air-dash, and dummies to lock on to. On Jolt (phase 1b, H.1): the world's own
// character and questions (jolt-pad.ts), ramps, a hill, posts, a fence, a thin
// wall and balls to knock about; ?grid=1 for the old grid's way.

// ── the pad (tiles; the floor's x east, y south: three's X, Z) ───────────────
const W = 96;
const H = 98;
const STRIP_END = YARD.z0; // the footings' strips end at the yard; past it the land
interface Strip {
  x0: number;
  x1: number;
  f: Footing;
  col: string;
  name: string;
}
// the lower half: a strip of each footing, side by side
const STRIPS: Strip[] = [
  { x0: 0, x1: 16, f: "floor", col: "#b8ab95", name: "floor" },
  { x0: 16, x1: 26, f: "path", col: "#d9dfe4", name: "path" },
  { x0: 26, x1: 36, f: "snow", col: "#f1f4f7", name: "snow" },
  { x0: 36, x1: 46, f: "deep", col: "#fbfdff", name: "deep snow" },
  { x0: 46, x1: W, f: "ice", col: "#a9c3d8", name: "ice" },
];
const SPLIT = 18; // y: above it the obstacles, below it the strips
const SPEED: Partial<Record<Footing, number>> = { deep: 0.6, snow: 0.85, rock: 0.7 };
const footingAt = (x: number, y: number): Footing =>
  y >= SPLIT && y < STRIP_END
    ? (STRIPS.find((s) => x >= s.x0 && x < s.x1)?.f ?? "floor")
    : onPadLand(x, y)
      ? "path"
      : "floor";

const LADDER = [0.3, 0.5, 0.7, 0.9, 1.2, 1.6];
const START = { x: 10, y: 15 };
// the tower's tops (a double jump's), the long gaps (an air dash's), the dummies (lock-on)
const TOWER = [1.6, 2.2, 2.8];
const DUMMIES: [number, number][] = [
  [5, 22],
  [14, 25],
  [3, 31],
  [21, 30],
  [11, 40],
];
const LOCK_RANGE = 14;

function buildPad(): { grid: Grid; tops: [number, number, number][] } {
  const g = new Grid(W, H);
  g.walk.fill(1);
  g.top.fill(0);
  const tops: [number, number, number][] = [];
  const block = (x: number, y: number, h: number) => {
    g.block(x, y, h);
    tops.push([x, y, h]);
  };
  // the ladder: walls across the way north, each a tile thick and three wide, to get over
  LADDER.forEach((h, i) => {
    for (let x = 0; x < 3; x++) block(8 + i * 4 + x, 5, h);
  });
  // a long top at a desk's height (onto it, off it)
  for (let x = 32; x < 36; x++) for (let y = 3; y < 7; y++) block(x, y, 0.64);
  // a platform 0.6 up with gaps of 1, 2, 3 and 4 tiles to jump
  let x = 40;
  for (const gap of [1, 2, 3, 4]) {
    for (let i = 0; i < 3; i++, x++) for (let y = 3; y < 7; y++) block(x, y, 0.6);
    x += gap;
  }
  for (let i = 0; i < 3; i++, x++) for (let y = 3; y < 7; y++) block(x, y, 0.6);
  // stairs straight ahead of where you start, five wide, walked up and down without a jump:
  // 0.12 risers up to a landing and 0.24 ones down; then 0.25 ones up and 0.12 ones down
  const flight = (x0: number, rises: number[]) => {
    rises.forEach((h, i) => {
      for (let y = 13; y < 18; y++) block(x0 + i, y, h);
    });
  };
  flight(13, [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.72, 0.72, 0.48, 0.24]);
  flight(25, [0.25, 0.5, 0.75, 1.0, 1.0, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28, 0.16, 0.04]);
  // a stepped pyramid: up from any side
  for (let ring = 0; ring < 4; ring++)
    for (let x2 = 62 + ring; x2 <= 70 - ring; x2++)
      for (let y = 10 + ring; y <= 18 - ring - 1; y++) block(x2, y, 0.12 * (ring + 1));
  // the tower: three tops a jump and a jump in the air high
  TOWER.forEach((h, i) => {
    for (let x2 = 0; x2 < 3; x2++) for (let y = 3; y < 6; y++) block(78 + i * 5 + x2, y, h);
  });
  // a platform a metre up with gaps of 5 and 6 (a jump and an air dash)
  for (const [x0, w] of [
    [76, 3],
    [84, 3],
    [93, 2],
  ])
    for (let x2 = x0; x2 < x0 + w; x2++) for (let y = 10; y < 14; y++) block(x2, y, 1);
  // the dummies to lock on to
  for (const [x2, y] of DUMMIES) block(x2, y, Number.POSITIVE_INFINITY);
  // pillars to slide along, a corridor a body wide
  for (let i = 0; i < 6; i++) block(26 + i * 2, 11, Number.POSITIVE_INFINITY);
  for (let x2 = 40; x2 < 60; x2++) {
    block(x2, 10, Number.POSITIVE_INFINITY);
    block(x2, 12, Number.POSITIVE_INFINITY);
  }
  // the edges: walls
  for (let i = 0; i < W; i++) {
    block(i, 0, Number.POSITIVE_INFINITY);
    block(i, H - 1, Number.POSITIVE_INFINITY);
  }
  for (let j = 0; j < H; j++) {
    block(0, j, Number.POSITIVE_INFINITY);
    block(W - 1, j, Number.POSITIVE_INFINITY);
  }
  return { grid: g, tops };
}

function padMesh(tops: [number, number, number][]): T3.Object3D {
  const root = new T3.Group();
  const ground = (x0: number, z0: number, x1: number, z1: number, col: string) => {
    const m = new T3.Mesh(new T3.PlaneGeometry(x1 - x0, z1 - z0), new T3.MeshLambertMaterial({ color: col }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  ground(0, 0, W, SPLIT, "#b8ab95");
  for (const s of STRIPS) ground(s.x0, SPLIT, s.x1, STRIP_END, s.col);
  ground(0, STRIP_END, W, LAND.z0, "#b8ab95");
  ground(LAND.x1, LAND.z0, W, H, "#b8ab95");
  // the floor's grid of tiles
  const grid = new T3.GridHelper(W, W, "#8d806b", "#a0937d");
  (grid.material as T3.Material).opacity = 0.35;
  (grid.material as T3.Material).transparent = true;
  grid.scale.set(1, 1, H / W);
  grid.position.set(W / 2, 0.005, H / 2);
  root.add(grid);
  const box = new T3.BoxGeometry(1, 1, 1);
  const stand = new T3.MeshLambertMaterial({ color: "#9a8b76" });
  const wall = new T3.MeshLambertMaterial({ color: "#5d6670" });
  const isDummy = (x: number, y: number) => DUMMIES.some(([dx, dy]) => dx === x && dy === y);
  for (const [x, y, h] of tops) {
    if (isDummy(x, y)) continue;
    const solid = !Number.isFinite(h);
    const m = new T3.Mesh(box, solid ? wall : stand);
    const hh = solid ? WALL_H : h;
    m.scale.set(1, hh, 1);
    m.position.set(x + 0.5, hh / 2, y + 0.5);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  // a ring to walk the diagonal on (the camera mustn't spin)
  const ring = new T3.Mesh(
    new T3.RingGeometry(5.9, 6.1, 96),
    new T3.MeshBasicMaterial({ color: "#d8423a", side: T3.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(8, 0.01, 34);
  root.add(ring);
  for (const [i, h] of LADDER.entries()) root.add(label(`${h}`, 9.5 + i * 4, 4, 1.2));
  root.add(label("0.64", 34, 2, 1.2));
  root.add(label("gaps 1·2·3·4", 52, 2, 1.6));
  root.add(label("stairs 0.12", 17, 12, 1.2));
  root.add(label("stairs 0.25", 29, 12, 1.2));
  root.add(label("pyramid", 66, 9, 1.2));
  root.add(label("pillars", 31, 9, 1.2));
  root.add(label("corridor", 50, 9, 1.4));
  for (const s of STRIPS) root.add(label(s.name, (s.x0 + s.x1) / 2, SPLIT + 1.5, 1.6));
  root.add(label("ring", 8, 27, 1.2));
  root.add(label("tower 1.6·2.2·2.8", 86, 2, 1.6));
  root.add(label("gaps 5·6", 86, 9, 1.4));
  // the dummies: a post with a head, in the colours of a target
  const dummy = new T3.MeshLambertMaterial({ color: "#c0563c" });
  const head = new T3.MeshLambertMaterial({ color: "#efe3cf" });
  for (const [x, y] of DUMMIES) {
    const post = new T3.Mesh(new T3.CylinderGeometry(0.3, 0.38, 1.4, 16), dummy);
    post.position.set(x + 0.5, 0.7, y + 0.5);
    const h = new T3.Mesh(new T3.SphereGeometry(0.26, 16, 12), head);
    h.position.set(x + 0.5, 1.62, y + 0.5);
    post.castShadow = h.castShadow = true;
    root.add(post, h);
  }
  root.add(label("dummies", 12, 21, 1.2));
  return root;
}

function label(text: string, x: number, z: number, scale: number): T3.Object3D {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "rgba(20,24,28,0.7)";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#ffb24a";
  g.font = "700 64px Helvetica, Arial";
  // (a long one smaller, to fit)
  const w = g.measureText(text.toUpperCase()).width;
  if (w > 480) g.font = `700 ${Math.floor((64 * 480) / w)}px Helvetica, Arial`;
  g.textAlign = "center";
  g.fillText(text.toUpperCase(), 256, 86);
  const t = new T3.CanvasTexture(cv);
  t.colorSpace = T3.SRGBColorSpace;
  const s = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(2.2 * scale, 0.55 * scale, 1);
  s.position.set(x, 2.9, z);
  return s;
}

// ── the camera: the KH one (follow-cam.ts), or today's chase (plan 29 M5) to compare; your eyes ──
type CamMode = "chase" | "first";
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export async function runMoveSandbox(el: HTMLElement, opts: { avatar?: AvatarLayers } = {}): Promise<() => void> {
  await learnLayout();
  const Wpx = () => el.clientWidth || window.innerWidth;
  const Hpx = () => el.clientHeight || window.innerHeight;
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(Wpx(), Hpx());
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  C.inkResolution(Wpx(), Hpx());
  C.INK.px.value = 2;
  const scene = new T3.Scene();
  scene.background = new T3.Color("#cfe0ea");
  scene.fog = new T3.Fog("#cfe0ea", 40, 110);
  scene.add(new T3.HemisphereLight("#f4f6f8", "#8d8572", 1.6));
  const sun = new T3.DirectionalLight("#fff4e6", 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const { grid, tops } = buildPad();
  scene.add(padMesh(tops));
  // on Jolt, as the world (?grid=1: the old grid's way, to compare)
  const jolt =
    new URLSearchParams(location.search).get("grid") === "1" ? null : await joltPad(tops, { w: W, h: H }, DUMMIES);
  if (jolt) {
    scene.add(jolt.mesh);
    for (const [t, x, z] of jolt.labels) scene.add(label(t, x, z, 1.3));
  }
  // KH (plan 56) or today's (plan 29), switched on the panel: the body, the keys, the camera
  let kh = new URLSearchParams(location.search).get("today") !== "1";
  let spec: MoveSpec = structuredClone(kh ? KH_MOVE : MOVE);
  const speedAt = (x: number, y: number) => SPEED[footingAt(x, y)] ?? 1;
  const env: MoveEnv = jolt
    ? { grid: jolt.collider, mover: jolt.mover, footing: footingAt, speed: speedAt, flow: jolt.flow }
    : { grid, footing: footingAt, speed: speedAt };

  // ── the body and its look
  let body: Body = newBody(START.x, START.y, 0, -Math.PI / 2);
  let prev: Body = { ...body };
  const factory = new C.CharFactory();
  const model = new C.PersonModel(factory, opts.avatar ?? DEFAULT_AVATAR, 0);
  model.root.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(model.root);
  let loco = new C.Locomotion(spec);
  // plan 58's animations (docs/plan/58-the-animation.md, phase 0): on here, against the old with
  // the panel's box; the mood from day (0) to the dark (1)
  const anim: { v2: boolean; tension: number; shown?: () => void; changed?: () => void } = {
    v2: new URLSearchParams(location.search).get("v2") !== "0",
    tension: 0,
  };
  // …and with them, the body with weight (plan 58 G.A: KH_FEEL's ramp, arcs, facing where it goes);
  // off, today's KH body. Heavier in the dark: slower to speed and to stop, wider turns.
  const feel = () => {
    if (!kh) return;
    const T = anim.tension;
    if (anim.v2) {
      spec.grip = (KH_FEEL.grip ?? 1) * (1 - 0.3 * T);
      spec.gripStop = (KH_FEEL.gripStop ?? 1) * (1 - 0.25 * T);
      spec.turnRun = (KH_FEEL.turnRun ?? spec.turn) * (1 - 0.3 * T);
      spec.faceWay = KH_FEEL.faceWay;
    } else {
      spec.grip = KH_MOVE.grip;
      spec.gripStop = undefined;
      spec.turnRun = undefined;
      spec.faceWay = undefined;
    }
  };
  anim.changed = feel;
  feel();
  const clock = new MoveClock();
  let controls = new MoveControls(kh ? khBindings() : plan29Bindings());

  // ── the camera
  const cam = new T3.PerspectiveCamera(62, Wpx() / Hpx(), 0.05, 300);
  const follow = new FollowCam();
  follow.snap(-Math.PI / 2);
  let mode: CamMode = "chase";
  let camYaw = -Math.PI / 2; // where it faces on the floor (atan2(y, x)): today's
  let camPitch = 0.42; // down > 0
  let shoulder = 1;
  let manualAt = -10;
  let aheadFor = 0;
  let fov = 62;
  const target = new T3.Vector3(START.x, 1.15, START.y);
  const footAt = new T3.Vector3();
  // s into a flow jump's spin (chars/moves.ts spinPose), or none
  let spinT: number | null = null;
  let aimPitch = 0;

  // ── lock-on: the dummies
  let locked: number | null = null;
  let flickWas = 0;
  const ring = new T3.Mesh(
    new T3.RingGeometry(0.75, 0.86, 48),
    new T3.MeshBasicMaterial({ color: "#f1d79a", side: T3.DoubleSide, depthTest: false, transparent: true }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 10;
  ring.visible = false;
  scene.add(ring);
  const lockTag = document.createElement("div");
  Object.assign(lockTag.style, {
    position: "fixed",
    left: "50%",
    top: "14px",
    transform: "translateX(-50%)",
    padding: "4px 12px",
    borderRadius: "999px",
    background: "rgba(23,24,29,0.88)",
    color: "#f1d79a",
    font: "12px ui-monospace, monospace",
    pointerEvents: "none",
    display: "none",
  });
  el.appendChild(lockTag);
  const at = (i: number) => ({ x: DUMMIES[i][0] + 0.5, y: DUMMIES[i][1] + 0.5 });
  // the best one ahead of the camera (near, and near the middle of the view)
  const pickLock = (): number | null => {
    let best: number | null = null;
    let bestS = Number.POSITIVE_INFINITY;
    DUMMIES.forEach((_, i) => {
      const d = at(i);
      const dist = Math.hypot(d.x - body.x, d.y - body.y);
      const off = Math.abs(wrap(Math.atan2(d.y - body.y, d.x - body.x) - follow.yaw));
      if (dist > LOCK_RANGE || off > 1.1) return;
      const sc = dist * (1 + off * 1.5);
      if (sc < bestS) {
        bestS = sc;
        best = i;
      }
    });
    return best;
  };
  // the next one that way (-1: left, 1: right) from the one locked, as seen from me
  const nextLock = (side: number): number | null => {
    if (locked === null) return null;
    const c = at(locked);
    const a0 = Math.atan2(c.y - body.y, c.x - body.x);
    let best: number | null = null;
    let bestOff = Number.POSITIVE_INFINITY;
    DUMMIES.forEach((_, i) => {
      if (i === locked) return;
      const d = at(i);
      if (Math.hypot(d.x - body.x, d.y - body.y) > LOCK_RANGE) return;
      const off = wrap(Math.atan2(d.y - body.y, d.x - body.x) - a0) * side;
      if (off > 0.05 && off < bestOff) {
        bestOff = off;
        best = i;
      }
    });
    return best ?? locked;
  };

  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.target instanceof HTMLInputElement) return;
    if (down && e.code === "Backspace") reset();
    if (!down) controls.up(e.code);
    else if (controls.down(e.code)) e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => {
    // plan 58: N new / old, M the mood round day → dusk → the dark
    if (!e.repeat && (e.code === "KeyN" || e.code === "KeyM")) {
      if (e.code === "KeyN") anim.v2 = !anim.v2;
      else anim.tension = anim.tension < 0.25 ? 0.5 : anim.tension < 0.75 ? 1 : 0;
      feel();
      anim.shown?.();
      return;
    }
    if (!e.repeat) onKey(e, true);
    else if (["Space", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "ArrowUp", "ArrowDown"].includes(e.code))
      e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => onKey(e, false);
  const blur = () => controls.clear();
  // the mouse is the camera (plan 56 A): the pointer locked to the page — a click takes it, Esc
  // lets it go; RMB aims, the wheel moves the camera in and out. No clicking on things.
  let mouseOn = false;
  let flickX = 0;
  const md = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-panel]")) return;
    if (!mouseOn) {
      void renderer.domElement.requestPointerLock();
      return;
    }
    // (the wheel's button: no autoscroll)
    if (e.button === 1) e.preventDefault();
    controls.down(`Mouse${e.button}`);
  };
  const mu = (e: MouseEvent) => controls.up(`Mouse${e.button}`);
  const mm = (e: MouseEvent) => {
    if (!mouseOn) return;
    if (kh) {
      follow.mouse(e.movementX, e.movementY, locked !== null);
      if (locked !== null && Math.abs(e.movementX) < 400) flickX += e.movementX;
    } else if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
      camYaw = wrap(camYaw + e.movementX * 0.0024);
      camPitch = Math.max(-0.6, Math.min(1.1, camPitch + e.movementY * 0.0019));
      manualAt = performance.now() / 1000;
    }
  };
  const wheel = (e: WheelEvent) => {
    if ((e.target as HTMLElement).closest("[data-panel]")) return;
    e.preventDefault();
    follow.tune.dist = Math.max(2.5, Math.min(8, follow.tune.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
  };
  const ctx = (e: MouseEvent) => e.preventDefault();
  const lockChange = () => {
    mouseOn = document.pointerLockElement === renderer.domElement;
    mouseHint.style.display = mouseOn ? "none" : "block";
    if (!mouseOn) controls.up("Mouse2");
  };
  const mouseHint = document.createElement("div");
  mouseHint.textContent = "click to use the mouse as the camera · Esc lets it go";
  Object.assign(mouseHint.style, {
    position: "fixed",
    left: "50%",
    bottom: "18px",
    transform: "translateX(-50%)",
    padding: "6px 14px",
    borderRadius: "999px",
    background: "rgba(23,24,29,0.85)",
    color: "#f1d79a",
    font: "12px ui-monospace, monospace",
    pointerEvents: "none",
  });
  el.appendChild(mouseHint);
  renderer.domElement.addEventListener("mousedown", md);
  window.addEventListener("mouseup", mu);
  window.addEventListener("mousemove", mm);
  renderer.domElement.addEventListener("wheel", wheel, { passive: false });
  renderer.domElement.addEventListener("contextmenu", ctx);
  document.addEventListener("pointerlockchange", lockChange);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("blur", blur);
  const resize = () => {
    renderer.setSize(Wpx(), Hpx());
    cam.aspect = Wpx() / Hpx();
    cam.updateProjectionMatrix();
    C.inkResolution(Wpx(), Hpx());
  };
  window.addEventListener("resize", resize);

  function reset() {
    body = newBody(START.x, START.y, 0, -Math.PI / 2);
    prev = { ...body };
    zShow = 0;
    camYaw = -Math.PI / 2;
    follow.snap(-Math.PI / 2);
    locked = null;
  }

  // where you aim
  const cross = document.createElement("div");
  Object.assign(cross.style, {
    position: "fixed",
    left: "50%",
    top: "50%",
    width: "6px",
    height: "6px",
    margin: "-3px 0 0 -3px",
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 0 0 1.5px rgba(0,0,0,0.6)",
    pointerEvents: "none",
    display: "none",
  });
  el.appendChild(cross);

  // ── the readouts and the knobs
  const makePanel = () =>
    panel(el, spec, follow.tune, kh, {
      reset,
      copy: () => JSON.stringify({ MOVE: spec, GRIP, CAMERA: follow.tune }, null, 2),
      anim,
      crouchHold: (v) => {
        controls.b.crouchHold = v;
      },
      preset: (k) => {
        kh = k;
        spec = structuredClone(k ? KH_MOVE : MOVE);
        feel();
        loco = new C.Locomotion(spec);
        controls = new MoveControls(k ? khBindings() : plan29Bindings());
        locked = null;
        hud.dispose();
        hud = makePanel();
      },
    });
  let hud = makePanel();

  // ── the loop
  let raf = 0;
  let last = performance.now();
  let speedWas = 0;
  let accel = 0;
  let yawWas = 0;
  let zShow = 0;
  // (3e: who she looks at, when nothing's locked on)
  let looks: LookAt | null = null;
  const ballsWas: [number, number][] = [];
  // (the feet on the ground's last: what footPlant saw, for /dev/move's probes)
  let planted: { under: number[]; sole: number[]; drop: number } | null = null;
  const shown = new T3.Vector3(START.x, 0, START.y);
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    factory.pump(8);
    model.update();

    const p = controls.pad;
    const viewYaw = kh ? follow.yaw : camYaw;
    const lockAt = locked === null ? null : at(locked);
    const lockYaw = lockAt ? Math.atan2(lockAt.y - body.y, lockAt.x - body.x) : viewYaw;
    const { move, presses } = controls.read(viewYaw, lockAt ? lockYaw : viewYaw);
    // locked on: I face it, and go round it at my own speed
    if (lockAt && !move.aim) move.faceLook = true;
    if (presses.has("camera")) mode = mode === "chase" ? "first" : "chase";
    if (presses.has("shoulder")) shoulder = -shoulder;
    const look = kh ? camLook(controls) : { x: 0, y: 0 };
    if (kh && presses.has("lock")) locked = locked === null ? pickLock() : null;
    // switching: a flick of the stick, or ← → (the edge of a push past 0.7), or the mouse's (a quick
    // 140 px sideways)
    const flick = Math.abs(look.x) > 0.7 ? Math.sign(look.x) : 0;
    if (locked !== null && flick && flick !== flickWas) locked = nextLock(flick);
    flickWas = flick;
    if (locked !== null && Math.abs(flickX) > 140) {
      locked = nextLock(Math.sign(flickX));
      flickX = 0;
    }
    flickX *= Math.exp(-dt * 8);
    if (locked !== null) {
      const d = at(locked);
      if (Math.hypot(d.x - body.x, d.y - body.y) > LOCK_RANGE + 4) locked = null;
    }

    // the body's fixed steps
    const events: StepEvents[] = [];
    let first = true;
    const alpha = clock.advance(dt, () => {
      prev = { ...body, verb: body.verb ? { ...body.verb } : null };
      events.push(stepBody(body, move, env, spec));
      if (first) {
        afterFirstStep(move);
        first = false;
      }
    });
    jolt?.step(dt);
    const ix = prev.x + (body.x - prev.x) * alpha;
    const iy = prev.y + (body.y - prev.y) * alpha;
    const feet = prev.z + (body.z - prev.z) * alpha;
    // up or down a step the feet are on it at once; the body eases there
    zShow = !body.up && !body.verb ? zShow + (feet - zShow) * Math.min(1, dt * 16) : feet;
    const iz = zShow;
    const iyaw = prev.yaw + wrap(body.yaw - prev.yaw) * alpha;
    const dist = Math.hypot(ix - shown.x, iy - shown.z);
    shown.set(ix, iz, iy);
    const landed = events.reduce<number | undefined>(
      (m, e) => (e.landed === undefined ? m : Math.max(m ?? 0, e.landed)),
      undefined,
    );
    for (const e of events) {
      // (off a Flowmotion move with a jump: its spin, over the arc)
      if (e.flowEnd === "jump") spinT = 0;
      if (e.landed !== undefined && e.landed > 0.3) p.rumble(0.25 * e.landed, 0.5 * e.landed, 90);
      if (e.verb === "roll" || e.verb === "slide" || e.airDash) p.rumble(0.1, 0.35, 120);
      // (the crouch press that slid isn't a crouch: out of the slide you're up)
      if (e.verb === "slide") controls.stand();
      if (e.airJump) p.rumble(0.05, 0.25, 70);
    }

    // its pose
    const speed = speedOf(body);
    accel += ((speed - speedWas) / Math.max(dt, 1e-3) - accel) * Math.min(1, dt * 10);
    speedWas = speed;
    const turn = wrap(iyaw - yawWas) / Math.max(dt, 1e-3);
    yawWas = iyaw;
    if (spinT !== null) {
      spinT += dt;
      if (!body.up || body.flow || body.verb || spinT > SPIN_LEN) spinT = null;
    }
    const lv = C.localVel(body);
    const swing = body.flow?.kind === "swing" ? body.flow : null;
    const pitchNow = kh ? follow.pitch : camPitch;
    if (move.aim) aimPitch += (-(pitchNow - 0.1) * 0.9 - aimPitch) * Math.min(1, dt * 14);
    loco.v2 = anim.v2;
    loco.tension = anim.tension;
    loco.seed = 3;
    // (G.D: whoever's locked on is looked at — from the facing, + to the left: the floor's y south;
    // else (3e) someone near — a dummy, a ball rolling by — that she can see: Jolt's ray)
    const H0 = anim.v2 ? C.heroNow() : null;
    if (H0 && !looks) looks = new H0.LookAt(3);
    const seen = [
      ...DUMMIES.map(([x, y], i) => ({ id: `d${i}`, x: x + 0.5, y: y + 0.5, z: 1.5, speed: 0 })),
      // (the balls: three's place — x, up, the floor's y — their speed from the last frame)
      ...(jolt?.balls() ?? []).map(([x, z, y], i) => {
        const was = ballsWas[i];
        ballsWas[i] = [x, y];
        const speed = was && dt > 0 ? Math.hypot(x - was[0], y - was[1]) / dt : 0;
        return { id: `b${i}`, x, y, z, speed };
      }),
    ];
    const eye = zShow + 1.35;
    const sees = (o: { x: number; y: number; z: number }) => {
      if (!jolt) return true;
      const dx = o.x - body.x;
      const dy = o.y - body.y;
      const dz = o.z - eye;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-3) return true;
      const hit = jolt.ray(body.x, eye, body.y, dx / d, dz / d, dy / d, Math.max(0, d - 0.45));
      return hit === null;
    };
    const gazeAt = lockAt
      ? { yaw: -wrap(Math.atan2(lockAt.y - body.y, lockAt.x - body.x) - body.yaw), pitch: 0 }
      : (looks?.update(dt, { x: body.x, y: body.y, yaw: body.yaw, eye }, seen, sees) ?? null);
    // (plan 58's idle, once its chunk's in: Locomotion asks for it)
    const H = anim.v2 ? C.heroNow() : null;
    const standing = H ? H.idle2Pose(now / 1000, anim.tension, 3, true, loco.life()) : undefined;
    const mo = loco.update(
      dt,
      {
        dist,
        speed,
        ahead: lv.ahead,
        left: lv.left,
        crouch: body.gait === "crouch" || (move.crouch && speed < 0.2 && !body.verb),
        aim: move.aim && !body.verb,
        pitch: aimPitch,
        yaw: wrap(viewYaw - body.yaw),
        turn,
        accel,
        up: body.up,
        jump: body.flow ? null : C.jumpNowOf(body, spec),
        landed,
        verb: body.verb
          ? { kind: body.verb.kind, t: C.verbT(body, spec) }
          : body.airDash && spec.airDash
            ? { kind: "adash", t: 1 - body.airDash / spec.airDash.len }
            : null,
        flow: spinT === null ? flowLook(body, spec) : { kind: "spin", t: spinT / SPIN_LEN, side: 1, speed: 0 },
        look: gazeAt,
        reduced: false,
      },
      standing,
    );
    model.root.position.set(ix, iz, iy);
    model.root.rotation.y = Math.PI / 2 - iyaw;
    model.setPose(mo.pose, mo.lift);
    // plan 58 G.G: the feet on Jolt's ground — the heights under each foot (and a step ahead and
    // behind it, for the slope), the hips let down, the knees bent to meet them
    if (H && jolt && !body.up && !body.verb && !body.flow) {
      model.root.updateMatrixWorld(true);
      const rootY = model.root.position.y;
      const under: [number, number] = [0, 0];
      const sole: [number, number] = [0, 0];
      const slope: [number, number] = [0, 0];
      const fx = Math.cos(body.yaw);
      const fy = Math.sin(body.yaw);
      // (a foot's own spot, not a body's width: round a whole body it found the tops of things beside
      // the foot, or started inside them — 0.72 m under a foot on the flat, a leg jerked up)
      const ground = (x: number, y: number) => env.grid.groundAt(x, y, rootY + 0.6, 0.04);
      (["L", "R"] as const).forEach((S, i) => {
        model.bones[`ankle${S}`].getWorldPosition(footAt);
        under[i] = ground(footAt.x, footAt.z) - rootY;
        sole[i] = footAt.y - C.ANKLE - rootY;
        const up = ground(footAt.x + fx * 0.12, footAt.z + fy * 0.12);
        const down = ground(footAt.x - fx * 0.12, footAt.z - fy * 0.12);
        slope[i] = Math.max(-1, Math.min(1, (up - down) / 0.24));
      });
      const lift0 = mo.lift[1];
      H.footPlant(mo, { under, sole, slope });
      planted = { under: [...under], sole: [...sole], drop: mo.lift[1] - lift0 };
      model.setPose(mo.pose, mo.lift);
    }
    // (plan 58 phase 2d: the springs, after the pose)
    model.step(dt);
    // (plan 58 G.D: the gaze's eyes and blink)
    const gz = loco.gazeOut;
    model.setFace(gz?.blink ?? 0, 0);
    model.setEyes(gz?.eyes[0] ?? 0, gz?.eyes[1] ?? 0);
    model.root.visible = mode !== "first";
    cross.style.display = move.aim ? "block" : "none";

    // the camera
    const aiming = move.aim && mode === "chase";
    const onIce = !body.up && footingAt(body.x, body.y) === "ice";
    if (kh) {
      follow.update({
        dt,
        look,
        recenter: presses.has("recenter"),
        yaw: body.yaw,
        vx: body.vx,
        vy: body.vy,
        air: body.up ? Math.max(0, body.z - env.grid.groundAt(body.x, body.y, body.z)) : 0,
        run: spec.jog,
        dash: spec.sprint,
        lock: lockAt ? { dx: lockAt.x - body.x, dy: lockAt.y - body.y } : null,
        still: aiming,
        hold: !!swing,
      });
    } else {
      // today's: the right stick, and the chase in behind going roughly ahead (plan 29 M5)
      const pr = p.right;
      if (pr.mag > 0) {
        camYaw = wrap(camYaw + pr.x * 2.8 * dt);
        camPitch = Math.max(-0.6, Math.min(1.1, camPitch + pr.y * 1.8 * dt));
        manualAt = now / 1000;
      }
      const goYaw = Math.atan2(body.vy, body.vx);
      const inYaw = Math.atan2(move.y, move.x);
      const ahead = Math.hypot(move.x, move.y) > 0.3 && Math.cos(inYaw - camYaw) > Math.cos((25 * Math.PI) / 180);
      aheadFor = ahead && speed > 0.8 ? aheadFor + dt : 0;
      if (
        mode === "chase" &&
        !aiming &&
        aheadFor > 0.4 &&
        now / 1000 - manualAt > 1.2 &&
        !onIce &&
        Math.abs(lv.left) < 1
      ) {
        const rate = 1.4 * Math.min(1.6, speed / spec.jog);
        camYaw = wrap(camYaw + wrap(goYaw - camYaw) * Math.min(1, rate * dt));
      }
    }
    const yawC = kh ? follow.yaw : camYaw;
    const pitchC = kh ? follow.pitch : camPitch;
    // (locked on: the look-at point a third of the way to it, so both are in frame; round a pole:
    // the pole, so the view holds still while she goes round it)
    const lx = lockAt ? (lockAt.x - ix) * 0.35 : body.vx * 0.25;
    const ly = lockAt ? (lockAt.y - iy) * 0.35 : body.vy * 0.25;
    const lookAt = swing ? new T3.Vector3(swing.cx, iz + 1.15, swing.cy) : new T3.Vector3(ix + lx, iz + 1.15, iy + ly);
    target.lerp(lookAt, 1 - Math.exp(-10 * dt));
    const dashK = Math.max(0, Math.min(1, (speed - spec.jog) / Math.max(0.1, spec.sprint - spec.jog)));
    fov += ((aiming ? 52 : kh ? 62 + 5 * dashK : speed > spec.jog + 1 ? 66 : 62) - fov) * Math.min(1, dt * 7);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const fx = Math.cos(yawC);
    const fz = Math.sin(yawC);
    if (mode === "first") {
      cam.position.set(ix + fx * 0.12, iz + 1.5, iy + fz * 0.12);
      cam.lookAt(
        cam.position.x + fx * Math.cos(pitchC),
        cam.position.y - Math.sin(pitchC),
        cam.position.z + fz * Math.cos(pitchC),
      );
    } else {
      // (our people's heads are big: the shoulder is further out than a shooter's 0.45)
      const d = aiming ? 2.6 : kh ? follow.dist : 5.4;
      const side = aiming ? 0.8 * shoulder : 0;
      const up = aiming ? 0.35 : 0;
      const cp = Math.cos(pitchC);
      cam.position.set(
        target.x - fx * d * cp - fz * side,
        Math.max(0.3, target.y + up + d * Math.sin(pitchC)),
        target.z - fz * d * cp + fx * side,
      );
      // on Jolt: kept out of whatever's solid between me and it (walls, the hill, the trunk: H.6)
      if (jolt) {
        const ox = target.x - fz * side;
        const oy = target.y + up;
        const oz = target.z + fx * side;
        const dir = cam.position.clone().sub(new T3.Vector3(ox, oy, oz));
        const len = dir.length();
        if (len > 1e-3) {
          dir.divideScalar(len);
          // (round a pole the look's from inside it: the ray starts out past its side)
          const from = swing ? Math.max(0, swing.r - 0.25) : 0;
          const hit = jolt.ray(
            ox + dir.x * from,
            oy + dir.y * from,
            oz + dir.z * from,
            dir.x,
            dir.y,
            dir.z,
            len - from,
          );
          if (hit !== null) cam.position.set(ox, oy, oz).addScaledVector(dir, Math.max(0.3, from + hit - 0.25));
        }
      }
      cam.lookAt(target.x - fz * side, target.y + up, target.z + fx * side);
    }
    sun.position.set(ix - 6, 14, iy + 8);
    sun.target.position.set(ix, 0, iy);
    // the lock's ring at its feet, turning
    ring.visible = lockAt !== null;
    if (lockAt) {
      ring.position.set(lockAt.x, 0.03, lockAt.y);
      ring.rotation.z = now / 600;
      lockTag.textContent = `LOCKED · dummy ${(locked ?? 0) + 1} · ← → / flick: next`;
    }
    lockTag.style.display = lockAt ? "block" : "none";
    renderer.render(scene, cam);

    hud.update(dt, body, {
      speed,
      gait: body.gait,
      footing: footingAt(body.x, body.y),
      events,
      stick: p.live ? p.left.mag : Math.hypot(move.x, move.y),
      pad: p.live,
      dodge: dodging(body, spec),
      crouched: controls.crouched,
      aiming: move.aim,
      cam: { yaw: yawC, pitch: pitchC, dist: kh ? follow.dist : 5.4 },
    });
  };
  raf = requestAnimationFrame(frame);
  // for tests and shots: the body, put somewhere, the camera pointed
  (window as unknown as { __move?: unknown }).__move = {
    body: () => body,
    spec: () => spec,
    jolt: !!jolt,
    balls: () => jolt?.balls() ?? [],
    follow,
    cam,
    loco: () => loco,
    planted: () => planted,
    locked: () => locked,
    model,
    place(x: number, y: number, yaw = 0) {
      body = newBody(x, y, 0, yaw);
      prev = { ...body };
      zShow = 0;
      target.set(x, 1.15, y);
      follow.snap(yaw);
    },
    camera(yaw: number, pitch = camPitch) {
      camYaw = yaw;
      camPitch = pitch;
      follow.yaw = yaw;
      follow.pitch = pitch;
      manualAt = performance.now() / 1000;
    },
  };

  return () => {
    cancelAnimationFrame(raf);
    delete (window as unknown as { __move?: unknown }).__move;
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    window.removeEventListener("blur", blur);
    window.removeEventListener("mouseup", mu);
    window.removeEventListener("mousemove", mm);
    document.removeEventListener("pointerlockchange", lockChange);
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    mouseHint.remove();
    window.removeEventListener("resize", resize);
    hud.dispose();
    jolt?.dispose();
    cross.remove();
    lockTag.remove();
    model.dispose();
    factory.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// ── the readouts (left) and the knobs (right) ───────────────────────────────
interface Readout {
  speed: number;
  gait: string;
  footing: Footing;
  events: StepEvents[];
  stick: number;
  pad: boolean;
  dodge: boolean;
  crouched: boolean;
  aiming: boolean;
  cam: { yaw: number; pitch: number; dist: number };
}
interface PanelCtx {
  reset(): void;
  copy(): string;
  crouchHold(v: boolean): void;
  /** KH (true) or today's */
  preset(kh: boolean): void;
  /** plan 58's animations on, and the mood (0 day … 1 the dark) */
  anim: { v2: boolean; tension: number; shown?: () => void; changed?: () => void };
}

function panel(host: HTMLElement, spec: MoveSpec, cam: CamTune, kh: boolean, ctx: PanelCtx) {
  const tele = document.createElement("canvas");
  const TW = 440;
  const TH = 350;
  tele.width = TW * 2;
  tele.height = TH * 2;
  Object.assign(tele.style, {
    position: "fixed",
    left: "8px",
    top: "8px",
    width: `${TW}px`,
    height: `${TH}px`,
    pointerEvents: "none",
  });
  host.appendChild(tele);
  const g = tele.getContext("2d") as CanvasRenderingContext2D;
  g.scale(2, 2);
  // the last 4 s, a sample a frame
  const hist: { t: number; v: number; z: number; ev: string; land: number }[] = [];
  let t = 0;

  const box = document.createElement("div");
  box.dataset.panel = "1";
  Object.assign(box.style, {
    position: "fixed",
    right: "8px",
    top: "8px",
    width: "300px",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
    background: "rgba(14,16,18,0.84)",
    color: "#ddd",
    font: "12px/1.5 ui-monospace, monospace",
    padding: "10px",
    borderRadius: "6px",
  });
  host.appendChild(box);
  const row = (html: string) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    box.appendChild(d);
    return d;
  };
  const k = (code: string) => `<b style="color:#ffd27a">${keyLabel(code)}</b>`;
  const which = row(
    `<b style='color:#ffb24a'>MOVE SANDBOX</b> · ` +
      `<button data-kh="1"${kh ? " disabled" : ""}>KH (plan 56)</button> <button data-kh="0"${kh ? "" : " disabled"}>today (plan 29)</button>`,
  );
  for (const b of which.querySelectorAll("button"))
    (b as HTMLButtonElement).onclick = () => ctx.preset((b as HTMLButtonElement).dataset.kh === "1");
  // plan 58 (docs/plan/58-the-animation.md): the new animations against the old, and the mood —
  // on the panel and on keys (N, M), so they're compared while playing
  const anim = row(
    `<div style="margin:8px 0 10px;padding:8px;border:1px solid #ffb24a66;border-radius:5px">` +
      `<b style="color:#ffb24a">ANIMATION · plan 58</b><br>` +
      `<label><input type=checkbox data-a58> new animations</label> · ${k("KeyN")} new / old<br>` +
      `<span data-mood></span> · ${k("KeyM")} day / dusk / dark<br>` +
      `<input type=range min=0 max=1 step=0.05 data-moodr style="width:100%"><br>` +
      `<span style="color:#aaa">stand still: the idle · ${k(walkKeys(isMac())[0])}+${k("KeyW")} walk · ${k("KeyW")} run · ${k("ShiftLeft")} sprint · ${k("Space")} jump (running: the flip)</span>` +
      `</div>`,
  );
  const a58 = anim.querySelector("[data-a58]") as HTMLInputElement;
  const moodL = anim.querySelector("[data-mood]") as HTMLElement;
  const moodR = anim.querySelector("[data-moodr]") as HTMLInputElement;
  const showAnim = () => {
    a58.checked = ctx.anim.v2;
    moodR.value = String(ctx.anim.tension);
    const t = ctx.anim.tension;
    moodL.textContent = `mood: ${t < 0.25 ? "day" : t < 0.75 ? "dusk" : "the dark"} (${t.toFixed(2)})`;
    moodR.disabled = !ctx.anim.v2;
  };
  a58.onchange = () => {
    ctx.anim.v2 = a58.checked;
    ctx.anim.changed?.();
    showAnim();
  };
  moodR.oninput = () => {
    queueMicrotask(() => ctx.anim.changed?.());
    ctx.anim.tension = Number(moodR.value);
    showAnim();
  };
  // (the keys change them too: shown again then)
  ctx.anim.shown = showAnim;
  showAnim();
  row(
    kh
      ? `${k("KeyW")}${k("KeyA")}${k("KeyS")}${k("KeyD")} move (run) · ${k(walkKeys(isMac())[0])} walk<br>` +
          `${k("Space")} jump · again in the air: double jump<br>` +
          `${k("ShiftLeft")} run fast (held) · ${k("KeyQ")} roll · in the air: air dash<br>` +
          `${k("KeyC")} crouch (running fast: slide) · ${k("Mouse2")} / ${k("KeyZ")} aim · ${k("KeyV")} shoulder<br>` +
          `mouse / ${k("ArrowLeft")}${k("ArrowUp")}${k("ArrowDown")}${k("ArrowRight")} camera · wheel: in/out · ${k("KeyR")} behind me<br>` +
          `${k("KeyF")} / wheel click: focus (lock on) (← → or a flick: next) · ${k("KeyY")} 1st/3rd · ${k("Backspace")} back to start<br>` +
          `click: the mouse is the camera (no pointer) · Esc lets it go<br>` +
          `on Jolt, as the world (?grid=1: the old grid) · south: the yard, the ramps, the hill<br>` +
          `Flowmotion (the yard): jump at a wall in the air, or roll into it: a kick · run fast into the tall wall: run up it · run fast at a wall slantwise: run along it · roll or run fast into the pole or the trunk, hold Shift: swing, let go: flung · land on a rail: grind, jump off · fall at a ledge too high: hang, forward: up<br>` +
          `pad: left stick (tilt = speed) · right stick camera · ${padLabel(0)} jump · ${padLabel(2)} dodge/dash · ${padLabel(1)} crouch · ${padLabel(5)} lock · ${padLabel(11)} behind me · ${padLabel(6)} aim · ${padLabel(8)} camera`
      : `${k("KeyW")}${k("KeyA")}${k("KeyS")}${k("KeyD")} / arrows move · ${k("ShiftLeft")} sprint · ${k("AltLeft")} walk<br>` +
          `${k("Space")} jump (tap/hold) · vault · climb<br>` +
          `${k("KeyC")} crouch (toggle; sprinting: slide) · ${k("KeyQ")} roll<br>` +
          `${k("KeyV")} shoulder · ${k("KeyY")} 1st/3rd · ${k("Backspace")} back to start<br>` +
          `click: the mouse turns the camera (today's Z look, always on) · Esc lets it go<br>` +
          `pad: stick (tilt = speed) · ${padLabel(10)} sprint · ${padLabel(0)} jump · ${padLabel(1)} crouch · ${padLabel(4)} roll · ${padLabel(6)} aim · ${padLabel(11)} shoulder · ${padLabel(3)} camera`,
  );
  const hold = row("<label><input type=checkbox> crouch: hold (not toggle)</label>");
  const hc = hold.querySelector("input") as HTMLInputElement;
  hc.onchange = () => ctx.crouchHold(hc.checked);
  const btns = row("<br><button>copy the numbers</button> <button>back to start</button>");
  const [copyB, resetB] = [...btns.querySelectorAll("button")];
  copyB.onclick = () => {
    void navigator.clipboard?.writeText(ctx.copy());
    copyB.textContent = "copied";
    setTimeout(() => {
      copyB.textContent = "copy the numbers";
    }, 1200);
  };
  resetB.onclick = () => ctx.reset();

  const group = (title: string, open = false) => {
    const d = document.createElement("details");
    d.open = open;
    const s = document.createElement("summary");
    s.innerHTML = `<b>${title}</b>`;
    d.appendChild(s);
    box.appendChild(d);
    return d;
  };
  const num = (
    host2: HTMLElement,
    obj: Record<string, unknown>,
    key: string,
    min: number,
    max: number,
    step: number,
    name = key,
  ) =>
    slider(
      host2,
      name,
      min,
      max,
      step,
      () => obj[key] as number,
      (v) => {
        obj[key] = v;
      },
    );
  const sp = spec as unknown as Record<string, unknown>;
  const gaits = group("Gaits (tiles/s)", true);
  num(gaits, sp, "walk", 1, 4, 0.1);
  num(gaits, sp, "jog", 2.5, 6, 0.1);
  num(gaits, sp, "sprint", 4, 10, 0.1);
  num(gaits, sp, "crouch", 0.8, 3, 0.1);
  num(gaits, sp, "aim", 1, 3.5, 0.1);
  num(gaits, sp, "turn", 4, 24, 0.5, "turn (rad/s)");
  const jump = group("Jump", true);
  num(jump, sp, "takeoff", 0, 0.15, 0.005, "take-off (s)");
  num(jump, sp, "coyote", 0, 0.25, 0.005, "coyote (s)");
  num(jump, sp, "buffer", 0, 0.3, 0.005, "buffer (s)");
  num(jump, sp, "fallBuffer", 0, 0.4, 0.005, "falling buffer (s)");
  num(jump, sp, "hopTap", 0.2, 1, 0.01, "hop: tap");
  num(jump, sp, "hop", 0.4, 1.4, 0.01, "hop: held");
  num(jump, sp, "flipTap", 0.6, 1.6, 0.01, "flip: tap");
  num(jump, sp, "flip", 0.8, 2, 0.01, "flip: held");
  num(jump, sp, "g", 10, 40, 0.5, "gravity");
  num(jump, sp, "stepUp", 0, 0.5, 0.01, "step up (no jump)");
  num(jump, sp, "air", 0, 1, 0.02, "air control");
  num(jump, sp, "airTurn", 0, 20, 0.5, "air turn (rad/s)");
  if (kh) {
    const air = group("KH: the air, the grip", true);
    num(air, sp, "gDown", 10, 70, 0.5, "gravity down");
    num(air, spec.hang as unknown as Record<string, unknown>, "band", 0, 4, 0.1, "hang: band (t/s)");
    num(air, spec.hang as unknown as Record<string, unknown>, "k", 0.2, 1, 0.05, "hang: gravity ×");
    num(air, sp, "fallCap", 6, 30, 0.5, "fastest fall (t/s)");
    num(air, sp, "airJumps", 0, 2, 1, "jumps in the air");
    num(air, sp, "airJump", 0.3, 2, 0.05, "air jump (tiles)");
    num(air, spec.airDash as unknown as Record<string, unknown>, "dist", 0, 6, 0.1, "air dash (tiles)");
    num(air, spec.airDash as unknown as Record<string, unknown>, "len", 0.08, 0.4, 0.01, "air dash (s)");
    num(air, sp, "grip", 0.5, 4, 0.05, "grip × (accel, decel)");
    // plan 58 G.A (the body with weight, on with the new animations)
    num(air, sp, "gripStop", 0.3, 3, 0.05, "grip × decel (plan 58)");
    num(air, sp, "turnRun", 4, 24, 0.5, "turn at a run, rad/s (plan 58)");
    if (spec.flow) {
      const fl = group("KH: Flowmotion", true);
      const fo = spec.flow as unknown as Record<string, unknown>;
      num(fl, fo, "kickUp", 0.3, 3, 0.05, "kick: up (tiles)");
      num(fl, fo, "kickOut", 1, 9, 0.1, "kick: out (t/s)");
      num(fl, fo, "runUp", 2, 10, 0.1, "wall run: up (t/s)");
      num(fl, fo, "runLen", 0.3, 2, 0.05, "wall run: for (s)");
      num(fl, fo, "swing", 4, 16, 0.25, "swing (t/s)");
      num(fl, fo, "fling", 4, 16, 0.25, "flung (t/s)");
      num(fl, fo, "grind", 3, 14, 0.25, "grind (t/s)");
      num(fl, fo, "jump", 0.8, 4, 0.05, "flow jump (tiles)");
      num(fl, fo, "reach", 0.2, 1.2, 0.05, "reach (tiles)");
    }
    const c = group("KH: the camera", true);
    const sel = document.createElement("div");
    sel.innerHTML = `follows: ${(["on", "gentle", "off"] as Follow[]).map((f) => `<label><input type=radio name=follow value=${f}${cam.follow === f ? " checked" : ""}> ${f}</label>`).join(" ")}`;
    for (const i of sel.querySelectorAll("input"))
      (i as HTMLInputElement).onchange = () => {
        cam.follow = (i as HTMLInputElement).value as Follow;
      };
    c.appendChild(sel);
    const cn = cam as unknown as Record<string, unknown>;
    num(c, cn, "rate", 0, 6, 0.1, "follow rate (1/s)");
    num(c, cn, "side", 0, 1, 0.05, "across the way ×");
    num(c, cn, "hold", 0, 2, 0.05, "wait after a turn (s)");
    num(c, cn, "across", 1, 8, 0.1, "turn across (rad/s)");
    num(c, cn, "upDown", 0.5, 5, 0.1, "turn up–down (rad/s)");
    num(c, cn, "curve", 1, 3, 0.05, "tilt curve");
    num(c, cn, "ramp", 0, 0.4, 0.01, "ramp in (s)");
    num(c, cn, "pitch", -0.15, 0.75, 0.01, "rests at (rad)");
    num(c, cn, "dist", 2, 8, 0.1, "distance");
    num(c, cn, "dashPull", 0, 3, 0.1, "back in a dash");
    num(c, cn, "airPull", 0, 3, 0.1, "back in the air");
    num(c, cn, "recenter", 0.05, 0.6, 0.01, "behind me in (s)");
    num(c, cn, "mouseSens", 0.2, 3, 0.05, "mouse ×");
    num(c, cn, "sens", 0.2, 3, 0.05, "stick / keys ×");
    const inv = document.createElement("div");
    inv.innerHTML =
      "<label><input type=checkbox> invert left–right</label> <label><input type=checkbox> invert up–down</label>";
    const [ix, iy] = [...inv.querySelectorAll("input")] as HTMLInputElement[];
    ix.checked = cam.invertX;
    iy.checked = cam.invertY;
    ix.onchange = () => {
      cam.invertX = ix.checked;
    };
    iy.onchange = () => {
      cam.invertY = iy.checked;
    };
    c.appendChild(inv);
  }
  const verbs = group("Verbs");
  num(verbs, spec.roll as unknown as Record<string, unknown>, "speed", 4, 14, 0.1, "roll speed");
  num(verbs, spec.roll as unknown as Record<string, unknown>, "len", 0.2, 0.7, 0.01, "roll length (s)");
  num(verbs, spec.slide as unknown as Record<string, unknown>, "boost", 0, 4, 0.1, "slide boost");
  num(verbs, spec.slide as unknown as Record<string, unknown>, "len", 0.4, 2, 0.05, "slide max (s)");
  num(verbs, spec.vault as unknown as Record<string, unknown>, "len", 0.3, 1, 0.01, "vault (s)");
  num(verbs, spec.vault as unknown as Record<string, unknown>, "reach", 0.3, 1.2, 0.01, "vault reach");
  num(verbs, spec.mantle as unknown as Record<string, unknown>, "len", 0.4, 1.4, 0.01, "mantle (s)");
  const grip = group("Grip by footing (tiles/s²)");
  for (const f of Object.keys(GRIP) as Footing[]) {
    const d = document.createElement("div");
    d.innerHTML = `<br><i>${f}</i>`;
    grip.appendChild(d);
    const o = GRIP[f] as unknown as Record<string, unknown>;
    num(grip, o, "accel", 1, 60, 0.5, `${f} accel`);
    num(grip, o, "decel", 1, 80, 0.5, `${f} decel`);
    num(grip, o, "slide", 0.5, 20, 0.1, `${f} slide`);
  }
  const state = row("");
  state.style.marginTop = "8px";

  return {
    update(dt: number, b: Body, r: Readout) {
      t += dt;
      const ev = r.events
        .map((e) =>
          e.flow
            ? `~${e.flow}`
            : e.airJump
              ? "↑↑air"
              : e.airDash
                ? "→dash"
                : e.jumped
                  ? `↑${e.jumped}`
                  : e.verb
                    ? e.verb
                    : e.landed !== undefined
                      ? "land"
                      : "",
        )
        .filter(Boolean)
        .join(" ");
      const land = r.events.reduce((m, e) => (e.landed === undefined ? m : Math.max(m, e.landed)), -1);
      hist.push({ t, v: r.speed, z: b.z, ev, land });
      while (hist.length && t - hist[0].t > 4) hist.shift();

      g.clearRect(0, 0, TW, TH);
      g.fillStyle = "rgba(14,16,18,0.78)";
      g.fillRect(0, 0, TW, TH);
      const x = (tt: number) => 10 + ((tt - (t - 4)) / 4) * (TW - 20);
      // speed (0..10): the gaits' lines behind it
      const sy = (v: number) => 140 - v * 12;
      g.font = "10px ui-monospace, monospace";
      for (const [v, n] of [
        [spec.walk, "walk"],
        [spec.jog, kh ? "run" : "jog"],
        [spec.sprint, kh ? "dash" : "sprint"],
      ] as const) {
        g.strokeStyle = "rgba(255,255,255,0.12)";
        g.beginPath();
        g.moveTo(10, sy(v));
        g.lineTo(TW - 10, sy(v));
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillText(n, TW - 44, sy(v) - 2);
      }
      const line = (col: string, f: (h: (typeof hist)[number]) => number) => {
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.beginPath();
        hist.forEach((h, i) => {
          if (i) g.lineTo(x(h.t), f(h));
          else g.moveTo(x(h.t), f(h));
        });
        g.stroke();
      };
      line("#7fd1ff", (h) => sy(h.v));
      // the feet's height (0..2)
      const zy = (z: number) => 250 - z * 40;
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.beginPath();
      g.moveTo(10, zy(0));
      g.lineTo(TW - 10, zy(0));
      g.stroke();
      line("#ffd27a", (h) => zy(h.z));
      // what happened
      for (const h of hist) {
        if (!h.ev) continue;
        g.fillStyle = h.land >= 0 ? `rgba(255,${Math.round(200 - h.land * 160)},90,0.9)` : "#9dffa8";
        g.fillRect(x(h.t) - 1, 150, 2, 110);
        g.fillText(h.ev, x(h.t) + 3, 160);
      }
      g.fillStyle = "#ddd";
      g.font = "12px ui-monospace, monospace";
      g.fillText("speed", 12, 22);
      g.fillText("feet", 12, 172);
      const air = kh
        ? ` · air ${b.airJumps ?? 0}/${spec.airJumps ?? 0}${b.dashed ? " dashed" : ""}${b.flow ? ` · ${b.flow.kind.toUpperCase()}` : ""}`
        : "";
      const lines = [
        `${r.gait.padEnd(7)} ${r.speed.toFixed(2)} t/s · ${r.footing}${r.crouched ? " · crouched" : ""}${r.aiming ? " · aiming" : ""}`,
        `z ${b.z.toFixed(2)}${b.up ? " (air)" : ""} · coyote ${(b.coyote * 1000).toFixed(0)} ms · buffer ${(b.buffer * 1000).toFixed(0)} ms`,
        `${b.verb ? `${b.verb.kind} ${((b.verb.t / b.verb.len) * 100).toFixed(0)}%${r.dodge ? " · DODGING" : ""}` : b.takeoff >= 0 ? "taking off" : "—"} · ${r.pad ? "pad" : "keys"} ${(r.stick * 100).toFixed(0)}%${air}`,
        `camera: pitch ${r.cam.pitch.toFixed(2)} · ${r.cam.dist.toFixed(1)} back`,
      ];
      lines.forEach((l, i) => {
        g.fillText(l, 12, 282 + i * 16);
      });
      state.textContent = "";
    },
    dispose() {
      tele.remove();
      box.remove();
    },
  };
}

function slider(
  host: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
) {
  const d = document.createElement("div");
  const l = document.createElement("div");
  const i = document.createElement("input");
  i.type = "range";
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  i.value = String(get());
  i.style.width = "100%";
  const show = () => {
    l.textContent = `${label}: ${Number(i.value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}`;
  };
  show();
  i.oninput = () => {
    set(Number(i.value));
    show();
  };
  d.append(l, i);
  host.appendChild(d);
}
