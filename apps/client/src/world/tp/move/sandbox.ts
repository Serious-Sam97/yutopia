import { type AvatarLayers, DEFAULT_AVATAR, Grid } from "@yutopia/shared";
import {
  type Body,
  dodging,
  type Footing,
  GRIP,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveSpec,
  newBody,
  type StepEvents,
  speedOf,
  stepBody,
} from "@yutopia/shared/move";
import * as T3 from "three";
import * as C from "../../chars";
// (the input chunk's parts, not its index: its marker counts the world's chunk for the budget)
import { keyLabel, learnLayout, padLabel } from "../../input/bindings";
import { afterFirstStep, MoveControls } from "../../input/controls";

// /dev/move — the sandbox (docs/plan/29-the-move.md, phase 1): walk, run,
// jump, vault, climb, roll and slide on a test pad made to try each thing —
// a ladder of tops to get over, a platform with gaps to jump, a strip of each
// footing (floor, path, snow, deep snow, ice), pillars to slide along, a
// corridor, a ring to circle — with the body's state on graphs and every
// number on a slider, to sign off the feel on the keys and on a pad.

// ── the pad (tiles; the floor's x east, y south: three's X, Z) ───────────────
const W = 76;
const H = 50;
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
  { x0: 46, x1: 76, f: "ice", col: "#a9c3d8", name: "ice" },
];
const SPLIT = 18; // y: above it the obstacles, below it the strips
const SPEED: Partial<Record<Footing, number>> = { deep: 0.6, snow: 0.85, rock: 0.7 };
const footingAt = (x: number, y: number): Footing =>
  y < SPLIT ? "floor" : (STRIPS.find((s) => x >= s.x0 && x < s.x1)?.f ?? "floor");

const LADDER = [0.3, 0.5, 0.7, 0.9, 1.2, 1.6];
const START = { x: 10, y: 15 };

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
  for (const s of STRIPS) ground(s.x0, SPLIT, s.x1, H, s.col);
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
  for (const [x, y, h] of tops) {
    const solid = !Number.isFinite(h);
    const m = new T3.Mesh(box, solid ? wall : stand);
    const hh = solid ? 2.2 : h;
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
  g.textAlign = "center";
  g.fillText(text.toUpperCase(), 256, 86);
  const t = new T3.CanvasTexture(cv);
  t.colorSpace = T3.SRGBColorSpace;
  const s = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(2.2 * scale, 0.55 * scale, 1);
  s.position.set(x, 2.9, z);
  return s;
}

// ── the camera (M5): chase behind where you go, over the shoulder aiming, or your eyes ──
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
  const spec: MoveSpec = structuredClone(MOVE);
  const env: MoveEnv = { grid, footing: footingAt, speed: (x, y) => SPEED[footingAt(x, y)] ?? 1 };

  // ── the body and its look
  let body: Body = newBody(START.x, START.y, 0, 0);
  let prev: Body = { ...body };
  const factory = new C.CharFactory();
  const model = new C.PersonModel(factory, opts.avatar ?? DEFAULT_AVATAR, 0);
  model.root.traverse((o) => {
    o.castShadow = true;
  });
  scene.add(model.root);
  const loco = new C.Locomotion(spec);
  const clock = new MoveClock();
  const controls = new MoveControls();

  // ── the camera
  const cam = new T3.PerspectiveCamera(62, Wpx() / Hpx(), 0.05, 300);
  let mode: CamMode = "chase";
  let camYaw = 0; // where it faces on the floor (atan2(y, x))
  let camPitch = 0.42; // down > 0
  let shoulder = 1;
  let manualAt = -10;
  let aheadFor = 0;
  let fov = 62;
  const target = new T3.Vector3(START.x, 1.15, START.y);
  let dragging = false;
  let locked = false;
  let aimPitch = 0;

  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.target instanceof HTMLInputElement) return;
    if (down && e.code === "KeyT") reset();
    if (down && e.code === "KeyR") {
      body = newBody(body.x, body.y, body.z, body.yaw);
      prev = { ...body };
    }
    if (!down) controls.up(e.code);
    else if (controls.down(e.code)) e.preventDefault();
  };
  const kd = (e: KeyboardEvent) => {
    if (!e.repeat) onKey(e, true);
    else if (["Space", "AltLeft", "AltRight"].includes(e.code)) e.preventDefault();
  };
  const ku = (e: KeyboardEvent) => onKey(e, false);
  const md = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-panel]")) return;
    if (e.button === 0 && !locked) dragging = true;
    controls.down(`Mouse${e.button}`);
  };
  const mu = (e: MouseEvent) => {
    if (e.button === 0) dragging = false;
    controls.up(`Mouse${e.button}`);
  };
  const mm = (e: MouseEvent) => {
    if (!dragging && !locked) return;
    camYaw = wrap(camYaw + e.movementX * 0.0032);
    camPitch = Math.max(-0.6, Math.min(1.1, camPitch + e.movementY * 0.0026));
    manualAt = performance.now() / 1000;
  };
  const ctx = (e: MouseEvent) => e.preventDefault();
  const blur = () => controls.clear();
  const lockChange = () => {
    locked = document.pointerLockElement === renderer.domElement;
  };
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  renderer.domElement.addEventListener("mousedown", md);
  window.addEventListener("mouseup", mu);
  window.addEventListener("mousemove", mm);
  renderer.domElement.addEventListener("contextmenu", ctx);
  window.addEventListener("blur", blur);
  document.addEventListener("pointerlockchange", lockChange);
  const resize = () => {
    renderer.setSize(Wpx(), Hpx());
    cam.aspect = Wpx() / Hpx();
    cam.updateProjectionMatrix();
    C.inkResolution(Wpx(), Hpx());
  };
  window.addEventListener("resize", resize);

  function reset() {
    body = newBody(START.x, START.y, 0, 0);
    prev = { ...body };
    zShow = 0;
    camYaw = 0;
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
  const hud = panel(el, spec, {
    reset,
    copy: () => JSON.stringify({ MOVE: spec, GRIP }, null, 2),
    crouchHold: (v) => {
      controls.b.crouchHold = v;
    },
  });

  // ── the loop
  let raf = 0;
  let last = performance.now();
  let speedWas = 0;
  let accel = 0;
  let yawWas = 0;
  let zShow = 0;
  const shown = new T3.Vector3(START.x, 0, START.y);
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    factory.pump(8);
    model.update();

    const p = controls.pad;
    // the look: the right stick, and with Z the mouse locked to it
    const pr = p.right;
    if (pr.mag > 0) {
      camYaw = wrap(camYaw + pr.x * 2.8 * dt);
      camPitch = Math.max(-0.6, Math.min(1.1, camPitch + pr.y * 1.8 * dt));
      manualAt = now / 1000;
    }
    const { move, presses } = controls.read(camYaw, camYaw);
    if (presses.has("look")) {
      if (locked) document.exitPointerLock();
      else void renderer.domElement.requestPointerLock();
    }
    if (presses.has("camera")) mode = mode === "chase" ? "first" : "chase";
    if (presses.has("shoulder")) shoulder = -shoulder;

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
      if (e.landed !== undefined && e.landed > 0.3) p.rumble(0.25 * e.landed, 0.5 * e.landed, 90);
      if (e.verb === "roll" || e.verb === "slide") p.rumble(0.1, 0.35, 120);
    }

    // its pose
    const speed = speedOf(body);
    accel += ((speed - speedWas) / Math.max(dt, 1e-3) - accel) * Math.min(1, dt * 10);
    speedWas = speed;
    const turn = wrap(iyaw - yawWas) / Math.max(dt, 1e-3);
    yawWas = iyaw;
    const lv = C.localVel(body);
    if (move.aim) aimPitch += (-(camPitch - 0.1) * 0.9 - aimPitch) * Math.min(1, dt * 14);
    const mo = loco.update(dt, {
      dist,
      speed,
      ahead: lv.ahead,
      left: lv.left,
      crouch: body.gait === "crouch" || (move.crouch && speed < 0.2 && !body.verb),
      aim: move.aim && !body.verb,
      pitch: aimPitch,
      yaw: wrap(camYaw - body.yaw),
      turn,
      accel,
      up: body.up,
      jump: C.jumpNowOf(body, spec),
      landed,
      verb: body.verb ? { kind: body.verb.kind, t: C.verbT(body, spec) } : null,
      reduced: false,
    });
    model.root.position.set(ix, iz, iy);
    model.root.rotation.y = Math.PI / 2 - iyaw;
    model.setPose(mo.pose, mo.lift);
    model.setFace(0, 0);
    model.root.visible = mode !== "first";
    cross.style.display = move.aim ? "block" : "none";

    // the camera
    const t = now / 1000;
    const aiming = move.aim && mode === "chase";
    const goYaw = Math.atan2(body.vy, body.vx);
    const inYaw = Math.atan2(move.y, move.x);
    const ahead = Math.hypot(move.x, move.y) > 0.3 && Math.cos(inYaw - camYaw) > Math.cos((25 * Math.PI) / 180);
    aheadFor = ahead && speed > 0.8 ? aheadFor + dt : 0;
    const onIce = !body.up && footingAt(body.x, body.y) === "ice";
    if (mode === "chase" && !aiming && aheadFor > 0.4 && t - manualAt > 1.2 && !onIce && Math.abs(lv.left) < 1) {
      const rate = 1.4 * Math.min(1.6, speed / spec.jog);
      camYaw = wrap(camYaw + wrap(goYaw - camYaw) * Math.min(1, rate * dt));
    }
    const look = new T3.Vector3(ix + body.vx * 0.25, iz + 1.15, iy + body.vy * 0.25);
    target.lerp(look, 1 - Math.exp(-10 * dt));
    fov += ((aiming ? 52 : speed > spec.jog + 1 ? 66 : 62) - fov) * Math.min(1, dt * 7);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const fx = Math.cos(camYaw);
    const fz = Math.sin(camYaw);
    if (mode === "first") {
      cam.position.set(ix + fx * 0.12, iz + 1.5, iy + fz * 0.12);
      cam.lookAt(
        cam.position.x + fx * Math.cos(camPitch),
        cam.position.y - Math.sin(camPitch),
        cam.position.z + fz * Math.cos(camPitch),
      );
    } else {
      // (our people's heads are big: the shoulder is further out than a shooter's 0.45)
      const d = aiming ? 2.6 : 5.4;
      const side = aiming ? 0.8 * shoulder : 0;
      const up = aiming ? 0.35 : 0;
      const cp = Math.cos(camPitch);
      cam.position.set(
        target.x - fx * d * cp - fz * side,
        Math.max(0.3, target.y + up + d * Math.sin(camPitch)),
        target.z - fz * d * cp + fx * side,
      );
      cam.lookAt(target.x - fz * side, target.y + up, target.z + fx * side);
    }
    sun.position.set(ix - 6, 14, iy + 8);
    sun.target.position.set(ix, 0, iy);
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
    });
  };
  raf = requestAnimationFrame(frame);
  // for tests and shots: the body, put somewhere, the camera pointed
  (window as unknown as { __move?: unknown }).__move = {
    body: () => body,
    model,
    place(x: number, y: number, yaw = 0) {
      body = newBody(x, y, 0, yaw);
      prev = { ...body };
      zShow = 0;
      target.set(x, 1.15, y);
    },
    camera(yaw: number, pitch = camPitch) {
      camYaw = yaw;
      camPitch = pitch;
      manualAt = performance.now() / 1000;
    },
  };

  return () => {
    cancelAnimationFrame(raf);
    delete (window as unknown as { __move?: unknown }).__move;
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    window.removeEventListener("mouseup", mu);
    window.removeEventListener("mousemove", mm);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", resize);
    document.removeEventListener("pointerlockchange", lockChange);
    hud.dispose();
    cross.remove();
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
}
interface PanelCtx {
  reset(): void;
  copy(): string;
  crouchHold(v: boolean): void;
}

function panel(host: HTMLElement, spec: MoveSpec, ctx: PanelCtx) {
  const tele = document.createElement("canvas");
  const TW = 440;
  const TH = 330;
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
  row(
    `<b style='color:#ffb24a'>MOVE SANDBOX</b><br>` +
      `${k("KeyW")}${k("KeyA")}${k("KeyS")}${k("KeyD")} move · ${k("ShiftLeft")} sprint · ${k("AltLeft")} walk<br>` +
      `${k("Space")} jump (tap/hold) · vault · climb<br>` +
      `${k("KeyC")} crouch (toggle; sprinting: slide) · ${k("KeyQ")} roll<br>` +
      `${k("Mouse2")} aim · ${k("KeyV")} shoulder · ${k("KeyY")} 1st/3rd · ${k("KeyZ")} mouse look<br>` +
      `drag: orbit · ${k("KeyT")} back to start · ${k("KeyR")} stop<br>` +
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
  num(jump, sp, "airTurn", 0, 12, 0.5, "air turn (rad/s)");
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
        .map((e) => (e.jumped ? `↑${e.jumped}` : e.verb ? e.verb : e.landed !== undefined ? "land" : ""))
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
        [MOVE.walk, "walk"],
        [MOVE.jog, "jog"],
        [MOVE.sprint, "sprint"],
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
      const lines = [
        `${r.gait.padEnd(7)} ${r.speed.toFixed(2)} t/s · ${r.footing}${r.crouched ? " · crouched" : ""}${r.aiming ? " · aiming" : ""}`,
        `z ${b.z.toFixed(2)}${b.up ? " (air)" : ""} · coyote ${(b.coyote * 1000).toFixed(0)} ms · buffer ${(b.buffer * 1000).toFixed(0)} ms`,
        `${b.verb ? `${b.verb.kind} ${((b.verb.t / b.verb.len) * 100).toFixed(0)}%${r.dodge ? " · DODGING" : ""}` : b.takeoff >= 0 ? "taking off" : "—"} · ${r.pad ? "pad" : "keys"} ${(r.stick * 100).toFixed(0)}%`,
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
