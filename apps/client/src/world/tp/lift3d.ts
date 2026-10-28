import { type LiftMotion, liftFloorName } from "@yutopia/shared";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from "three";
import { HIDDEN_LAYER } from "./below-cull";
import type { Pick3 } from "./build";
import { mergeStatic, shadowProxy } from "./merge-static";

// The elevator, made properly (docs/plan/26-floor-transitions.md, phase 0):
// one stop of a car on a floor, in tiles (1 tile ≈ 1 m), three.js axes —
// x the stop's x, z its y, y up. The stop's corner is the origin, its 2 × 2
// footprint x 0..2, z 0..2, the doors on its north edge (z = 0, in the wall
// that runs there, WALL_T thick) facing −z, where the landing is.
//
//  · the landing: a stone surround on the wall, a brushed-steel portal,
//    centre-opening doors that slide into the wall, a hall lantern (▲ ▼) and a
//    dot-matrix floor display over them, a call plate beside them;
//  · the car (where it is): brushed-steel side panels, a smoked mirror at the
//    back, a walnut handrail, a stone floor, a backlit ceiling, its own doors
//    (they move with the landing's), the control panel by the doors, a light
//    that spills out onto the landing as the doors open.
//
// Everything that moves is set from outside (phase, the doors' opening 0..1,
// the lantern, the display, a button lit): the server's timestamps drive it, so
// everyone sees the same thing.

export const DOOR_W = 1.1; // the opening
export const DOOR_H = 2.2;
export const CAR_H = 2.5; // the car's inside, floor to ceiling
const WALL_H = 3.27;
const WALL_T = 0.2;
const X0 = 1 - DOOR_W / 2; // the opening's sides
const X1 = 1 + DOOR_W / 2;

// ── surfaces (drawn once, shared) ───────────────────────────────────────────
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d") as CanvasRenderingContext2D };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(c: HTMLCanvasElement, rx = 1, ry = 1, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// brushed steel: a fine grain along one way (the colour, and the roughness it gives)
function brushed(vertical: boolean): { map: CanvasTexture; rough: CanvasTexture } {
  const S = 256;
  const a = canvas(S, S);
  const b = canvas(S, S);
  const r = rng(vertical ? 7 : 11);
  a.g.fillStyle = "#c9ced2";
  a.g.fillRect(0, 0, S, S);
  b.g.fillStyle = "#5e5e5e";
  b.g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3200; i++) {
    const p = r() * S;
    const q = r() * S;
    const len = 40 + r() * 200;
    const l = 185 + Math.floor(r() * 50);
    a.g.strokeStyle = `rgba(${l},${l + 3},${l + 6},${0.06 + r() * 0.1})`;
    const k = 80 + Math.floor(r() * 50);
    b.g.strokeStyle = `rgba(${k},${k},${k},0.18)`;
    for (const g of [a.g, b.g]) {
      g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath();
      if (vertical) {
        g.moveTo(p, q);
        g.lineTo(p + (r() - 0.5) * 0.6, q + len);
      } else {
        g.moveTo(q, p);
        g.lineTo(q + len, p + (r() - 0.5) * 0.6);
      }
      g.stroke();
    }
  }
  return { map: tex(a.c), rough: tex(b.c, 1, 1, false) };
}

// a stone: soft cloud, fine grain, faint banding; `panels` large-format joints
// (rows × cols over the texture), `tiles` a grid of floor tiles
function stone(base: string, vein: string, seed: number, tiles = 0, panels: [number, number] = [0, 0]): CanvasTexture {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${r() * 0.025})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 20 + r() * 60, 4 + r() * 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + r() * 0.05})`;
    g.fillRect(r() * S, r() * S, 1, 1);
  }
  g.strokeStyle = vein;
  for (let i = 0; i < 3; i++) {
    g.lineWidth = 0.5 + r() * 0.6;
    g.globalAlpha = 0.12 + r() * 0.1;
    g.beginPath();
    let x = 0;
    let y = r() * S;
    g.moveTo(x, y);
    while (x < S) {
      x += 14 + r() * 26;
      y += (r() - 0.5) * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  if (tiles)
    for (let i = 1; i < tiles; i++) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect((i * S) / tiles - 1, 0, 2, S);
      g.fillRect(0, (i * S) / tiles - 1, S, 2);
    }
  const [rows, cols] = panels;
  g.fillStyle = "rgba(60,50,40,0.28)";
  for (let i = 1; i < rows; i++) g.fillRect(0, (i * S) / rows - 0.75, S, 1.5);
  for (let i = 1; i < cols; i++) g.fillRect((i * S) / cols - 0.75, 0, 1.5, S);
  return tex(c);
}

// the floor display: amber dots on black (a 5 × 7 font, the lit ones glowing)
const FONT: Record<string, string[]> = {
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "▲": ["00000", "00100", "01110", "11111", "00000", "00000", "00000"],
  "▼": ["00000", "00000", "00000", "11111", "01110", "00100", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
export class DotMatrix {
  readonly texture: CanvasTexture;
  private cv = canvas(176, 64);
  private shown = "";
  constructor() {
    this.texture = new CanvasTexture(this.cv.c);
    this.texture.colorSpace = SRGBColorSpace;
    this.set("");
  }
  set(text: string) {
    if (text === this.shown) return;
    this.shown = text;
    const { g } = this.cv;
    g.fillStyle = "#0b0806";
    g.fillRect(0, 0, 176, 64);
    const cells = 5;
    const chars = text.padEnd(3).slice(0, 3).split("");
    const P = 7; // px a dot
    chars.forEach((ch, k) => {
      const rows = FONT[ch] ?? FONT[" "];
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < cells; x++) {
          const on = rows[y][x] === "1";
          const cx = 10 + k * (cells * P + 18) + x * P + P / 2;
          const cy = 8 + y * P + P / 2;
          g.fillStyle = on ? "#ffb347" : "#2a1b10";
          if (on) {
            g.shadowColor = "#ff9a1f";
            g.shadowBlur = 6;
          }
          g.beginPath();
          g.arc(cx, cy, P * 0.36, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
    });
    this.texture.needsUpdate = true;
  }
}

// a label drawn on a small canvas (the panel's buttons), one texture a label
const labels = new Map<string, CanvasTexture>();
function label(text: string, size = 64, fg = "#1b1f22"): CanvasTexture {
  const key = `${text}|${size}|${fg}`;
  const had = labels.get(key);
  if (had) return had;
  const t = drawLabel(text, size, fg);
  labels.set(key, t);
  return t;
}
function drawLabel(text: string, size: number, fg: string): CanvasTexture {
  const { c, g } = canvas(size, size);
  g.clearRect(0, 0, size, size);
  g.fillStyle = fg;
  g.font = `600 ${Math.round(size * 0.55)}px "Space Grotesk", Inter, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, size / 2, size / 2 + size * 0.03);
  return tex(c);
}

// a button's face (its label), one material a label, shared by every car
const faces = new Map<string, MeshBasicMaterial>();
function faceMat(k: string): MeshBasicMaterial {
  let m = faces.get(k);
  if (!m) {
    m = new MeshBasicMaterial({ map: label(k, 64), transparent: true, side: DoubleSide });
    faces.set(k, m);
  }
  return m;
}

export interface LiftMats {
  steel: MeshStandardMaterial; // brushed, horizontal grain
  steelV: MeshStandardMaterial; // brushed, vertical grain (the doors)
  darkSteel: MeshStandardMaterial;
  mirror: MeshStandardMaterial;
  surround: MeshStandardMaterial;
  carFloor: MeshStandardMaterial;
  walnut: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  reveal: MeshStandardMaterial;
  ceiling: MeshBasicMaterial;
  lamp: MeshBasicMaterial; // a lit button, a lantern arrow
  lampOff: MeshStandardMaterial;
}

let shared: { mats: LiftMats; textures: Texture[] } | null = null;
export function liftMats(): LiftMats {
  if (shared) return shared.mats;
  const h = brushed(false);
  const v = brushed(true);
  const steel = new MeshStandardMaterial({
    color: "#e6eaed",
    map: h.map,
    roughnessMap: h.rough,
    metalness: 0.78,
    roughness: 0.3,
  });
  const steelV = new MeshStandardMaterial({
    color: "#e1e5e8",
    map: v.map,
    roughnessMap: v.rough,
    metalness: 0.8,
    roughness: 0.28,
  });
  const surroundTex = stone("#d9d0c1", "#a39580", 3, 0, [3, 1]);
  const floorTex = stone("#3b3733", "#7a7064", 9, 2);
  const mats: LiftMats = {
    steel,
    steelV,
    darkSteel: new MeshStandardMaterial({ color: "#3c4146", metalness: 0.8, roughness: 0.45 }),
    mirror: new MeshStandardMaterial({ color: "#9aa0a6", metalness: 1, roughness: 0.06 }),
    surround: new MeshStandardMaterial({ map: surroundTex, roughness: 0.42, metalness: 0 }),
    carFloor: new MeshStandardMaterial({ map: floorTex, roughness: 0.3, metalness: 0 }),
    walnut: new MeshStandardMaterial({ color: "#6b4126", roughness: 0.38, metalness: 0 }),
    glass: new MeshStandardMaterial({ color: "#111315", roughness: 0.08, metalness: 0.2 }),
    reveal: new MeshStandardMaterial({ color: "#16191b", roughness: 0.7 }),
    ceiling: new MeshBasicMaterial({ color: "#fff6e6" }),
    lamp: new MeshBasicMaterial({ color: "#ffb347", toneMapped: false }),
    lampOff: new MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.3, metalness: 0.1 }),
  };
  shared = { mats, textures: [h.map, h.rough, v.map, v.rough, surroundTex, floorTex] };
  return mats;
}

// The car's own copies of its lit materials: the 3D view lights the landings
// as the rooms round them (dark after dark, tp/view.ts); the car has its own
// lamp, and stays lit.
let carShared: LiftMats | null = null;
export function liftCarMats(): LiftMats {
  if (carShared) return carShared;
  const m = liftMats();
  const own = { ...m };
  for (const k of Object.keys(m) as (keyof LiftMats)[])
    if (m[k] instanceof MeshStandardMaterial) (own as Record<string, unknown>)[k] = m[k].clone();
  carShared = own;
  return carShared;
}

const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// ── one stop: the landing's side ─────────────────────────────────────────────
export class LiftLanding {
  readonly root = new Group();
  readonly display = new DotMatrix();
  private leaves: Mesh[] = [];
  private up: Mesh;
  private down: Mesh;
  private callUp: Mesh;
  private callDown: Mesh;

  constructor(mats = liftMats(), opts: { floor?: string } = {}) {
    const m = mats;
    const face = -WALL_T / 2; // the wall's landing face
    const t = 0.035; // the surround's thickness, proud of the wall
    // the stone surround: both sides of the opening and over it, wall height
    const side = X0;
    this.root.add(box(side, WALL_H, t, m.surround, side / 2, WALL_H / 2, face - t / 2));
    this.root.add(box(2 - X1, WALL_H, t, m.surround, X1 + (2 - X1) / 2, WALL_H / 2, face - t / 2));
    this.root.add(box(DOOR_W, WALL_H - DOOR_H, t, m.surround, 1, DOOR_H + (WALL_H - DOOR_H) / 2, face - t / 2));
    // the portal: a steel architrave round the opening, its reveals into the wall
    const a = 0.07;
    const pd = t + 0.03;
    this.root.add(box(a, DOOR_H + a, pd, m.steel, X0 - a / 2, (DOOR_H + a) / 2, face - pd / 2));
    this.root.add(box(a, DOOR_H + a, pd, m.steel, X1 + a / 2, (DOOR_H + a) / 2, face - pd / 2));
    this.root.add(box(DOOR_W + 2 * a, a, pd, m.steel, 1, DOOR_H + a / 2, face - pd / 2));
    for (const x of [X0, X1])
      this.root.add(box(0.012, DOOR_H, WALL_T, m.steel, x + (x === X0 ? 0.006 : -0.006), DOOR_H / 2, 0));
    this.root.add(box(DOOR_W, 0.012, WALL_T, m.steel, 1, DOOR_H - 0.006, 0));
    // the sill: brushed aluminium, a groove for the leaves
    this.root.add(box(DOOR_W + 0.1, 0.012, WALL_T + 0.12, m.darkSteel, 1, 0.006, -0.02));
    this.root.add(box(DOOR_W, 0.014, 0.012, m.reveal, 1, 0.007, -0.05));
    // the doors: two leaves, vertical grain, a fine meeting line
    for (const s of [-1, 1]) {
      const leaf = box(DOOR_W / 2, DOOR_H - 0.01, 0.035, m.steelV, 1 + (s * DOOR_W) / 4, DOOR_H / 2, -0.05);
      this.leaves.push(leaf);
      this.root.add(leaf);
    }
    // over the doors: the display (where the car is) and the lantern (▲ ▼)
    const dy = DOOR_H + 0.42;
    this.root.add(box(0.62, 0.22, 0.03, m.glass, 1, dy, face - t - 0.015));
    const disp = new Mesh(
      new PlaneGeometry(0.56, 0.18),
      new MeshBasicMaterial({ map: this.display.texture, toneMapped: false }),
    );
    disp.position.set(1, dy, face - t - 0.031);
    disp.rotation.y = Math.PI;
    this.root.add(disp);
    this.root.add(box(0.3, 0.13, 0.025, m.steel, 1, DOOR_H + 0.18, face - t - 0.012));
    const tri = (dir: 1 | -1) => {
      const sh = new Shape();
      sh.moveTo(-0.04, -0.03 * dir);
      sh.lineTo(0.04, -0.03 * dir);
      sh.lineTo(0, 0.035 * dir);
      sh.closePath();
      const tr = new Mesh(new ShapeGeometry(sh), m.lampOff);
      tr.rotation.y = Math.PI;
      tr.position.set(1 + dir * 0.065, DOOR_H + 0.18, face - t - 0.026);
      this.root.add(tr);
      return tr;
    };
    this.up = tri(1);
    this.down = tri(-1);
    // the call plate, at hand height beside the doors: up and down, light rings
    const px = X1 + 0.22;
    this.root.add(box(0.11, 0.3, 0.012, m.steel, px, 1.08, face - t - 0.006));
    const button = (y: number) => {
      const ring = new Mesh(new CylinderGeometry(0.03, 0.03, 0.006, 24), m.lampOff);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, y, face - t - 0.015);
      const cap = new Mesh(new CylinderGeometry(0.022, 0.022, 0.012, 24), m.steel);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(px, y, face - t - 0.02);
      this.root.add(ring, cap);
      return ring;
    };
    this.callUp = button(1.15);
    this.callDown = button(1.01);
    // the floor's number on the jamb (engraved: a dark plate)
    if (opts.floor) {
      const plate = new Mesh(
        new PlaneGeometry(0.1, 0.1),
        new MeshBasicMaterial({ map: label(opts.floor, 64, "#e7e2d8") }),
      );
      plate.position.set(px, 1.5, face - t - 0.001);
      plate.rotation.y = Math.PI;
      this.root.add(box(0.12, 0.12, 0.008, m.darkSteel, px, 1.5, face - t + 0.004), plate);
    }
    this.setDoors(0);
  }

  /** What moves or lights here (the rest may be merged: merge-static.ts). */
  moving(): Object3D[] {
    return [...this.leaves, this.up, this.down, this.callUp, this.callDown];
  }

  /** 0 shut … 1 open (the leaves slide into the wall either side). */
  setDoors(open: number) {
    const k = Math.max(0, Math.min(1, open));
    this.leaves.forEach((leaf, i) => {
      const s = i === 0 ? -1 : 1;
      leaf.position.x = 1 + (s * DOOR_W) / 4 + s * k * (DOOR_W / 2 + 0.02);
    });
  }

  /** The lantern: which way the car here is going (0: neither), lit or not. */
  setLantern(dir: -1 | 0 | 1, lit: boolean) {
    const m = liftMats();
    this.up.material = lit && dir > 0 ? m.lamp : m.lampOff;
    this.down.material = lit && dir < 0 ? m.lamp : m.lampOff;
  }

  /** The call plate's buttons, lit while a call is waiting. */
  setCalls(up: boolean, down: boolean) {
    const m = liftMats();
    this.callUp.material = up ? m.lamp : m.lampOff;
    this.callDown.material = down ? m.lamp : m.lampOff;
  }
}

// ── the car (inside, where it is) ────────────────────────────────────────────
export class LiftCar {
  readonly root = new Group();
  private leaves: Mesh[] = [];
  readonly buttons = new Map<string, Mesh>(); // the panel's, by label (their light rings)
  readonly display = new DotMatrix();
  readonly light: PointLight;
  readonly spill: SpotLight;
  private mats: LiftMats;

  /** `cut`: the iso view's cut-away — the back and the sides low, no ceiling
   *  (the iso camera looks into the car from behind it). */
  constructor(
    floors: string[] = ["4", "3", "2", "1", "G"],
    mats = liftMats(),
    opts: { cut?: boolean; lights?: boolean } = {},
  ) {
    const m = mats;
    this.mats = mats;
    const cut = !!opts.cut;
    const lights = opts.lights !== false;
    const WH = cut ? 0.35 : CAR_H; // the walls' height
    // the inner faces: well clear of the shaft's walls (the map's, WALL_T thick
    // with their skirting, and the posts at the corners), or they show through
    const i0 = 0.18;
    const i1 = 1.82;
    const front = WALL_T / 2 + 0.02;
    const back = 1.8;
    const w = i1 - i0;
    // the floor
    const fl = new Mesh(new PlaneGeometry(w, back - front), m.carFloor);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(1, 0.004, (front + back) / 2);
    fl.receiveShadow = true;
    this.root.add(fl);
    // the walls: steel panels with dark reveals (three a side), the back a mirror
    const panels = (x: number, face: 1 | -1) => {
      const n = 3;
      const len = back - front;
      for (let i = 0; i < n; i++) {
        const z0 = front + (len * i) / n + 0.006;
        const z1 = front + (len * (i + 1)) / n - 0.006;
        this.root.add(box(0.02, WH - 0.12, z1 - z0, m.steel, x - face * 0.01, 0.06 + (WH - 0.12) / 2, (z0 + z1) / 2));
      }
      this.root.add(box(0.012, WH, len, m.reveal, x - face * 0.002, WH / 2, (front + back) / 2));
      // a kick plate at the bottom
      this.root.add(box(0.025, 0.12, len, m.darkSteel, x - face * 0.012, 0.06, (front + back) / 2));
    };
    panels(i0, -1);
    panels(i1, 1);
    this.root.add(box(w, WH, 0.02, m.steel, 1, WH / 2, back + 0.01));
    if (!cut) {
      const mirror = box(w - 0.3, CAR_H - 0.95, 0.012, m.mirror, 1, 0.95 + (CAR_H - 0.95) / 2 - 0.08, back - 0.006);
      mirror.castShadow = false;
      this.root.add(mirror);
    }
    this.root.add(box(w, 0.12, 0.03, m.darkSteel, 1, 0.06, back - 0.015));
    // the handrail: walnut, round, on the back and both sides, on brackets
    const rail = (len: number, x: number, z: number, along: "x" | "z") => {
      const r = new Mesh(new CylinderGeometry(0.022, 0.022, len, 16), m.walnut);
      r.rotation[along === "x" ? "z" : "x"] = Math.PI / 2;
      r.position.set(x, 0.92, z);
      r.castShadow = true;
      this.root.add(r);
    };
    rail(w - 0.24, 1, back - 0.07, "x");
    rail(back - front - 0.5, i0 + 0.07, (front + back) / 2 + 0.15, "z");
    rail(back - front - 0.5, i1 - 0.07, (front + back) / 2 + 0.15, "z");
    for (const [x, z] of [
      [0.35, back - 0.035],
      [1.65, back - 0.035],
      [i0 + 0.035, 0.75],
      [i0 + 0.035, 1.6],
      [i1 - 0.035, 0.75],
      [i1 - 0.035, 1.6],
    ])
      this.root.add(box(0.03, 0.03, 0.03, m.steel, x, 0.92, z));
    // the ceiling: a steel frame round a backlit panel, and the car's light
    if (!cut) {
      this.root.add(box(w, 0.04, back - front, m.darkSteel, 1, CAR_H + 0.02, (front + back) / 2));
      const glow = new Mesh(new PlaneGeometry(w - 0.4, back - front - 0.4), m.ceiling);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(1, CAR_H - 0.002, (front + back) / 2);
      this.root.add(glow);
    }
    // (the game leaves them out: every light costs every surface in the scene;
    // the backlit ceiling and the room's light map carry it there)
    this.light = new PointLight("#fff1dc", lights ? 2.3 : 0, 4.2, 1.6);
    this.light.visible = lights;
    this.light.position.set(1, CAR_H - 0.25, (front + back) / 2);
    this.light.castShadow = lights;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.002;
    this.root.add(this.light);
    // its light out onto the landing, as wide as the doors are open
    this.spill = new SpotLight("#ffeacc", 0, 6, 0.7, 0.6, 1.4);
    this.spill.visible = lights;
    this.spill.position.set(1, CAR_H - 0.3, 1.3);
    this.spill.target.position.set(1, 0, -2.2);
    this.root.add(this.spill, this.spill.target);
    // the front: returns either side of the doors, a transom over them
    this.root.add(box(X0 - i0, CAR_H, 0.03, m.steel, (i0 + X0) / 2, CAR_H / 2, front + 0.015));
    this.root.add(box(i1 - X1, CAR_H, 0.03, m.steel, (X1 + i1) / 2, CAR_H / 2, front + 0.015));
    this.root.add(box(DOOR_W, CAR_H - DOOR_H, 0.03, m.steel, 1, DOOR_H + (CAR_H - DOOR_H) / 2, front + 0.015));
    // the car's doors, just inside the landing's
    for (const s of [-1, 1]) {
      const leaf = box(DOOR_W / 2, DOOR_H - 0.01, 0.03, m.steelV, 1 + (s * DOOR_W) / 4, DOOR_H / 2, front - 0.005);
      this.leaves.push(leaf);
      this.root.add(leaf);
    }
    // the control panel on the right-hand return (seen from inside: the left
    // as you face the doors): a display, the floors' buttons, open / close, alarm
    const px = (X1 + i1) / 2;
    const pz = front + 0.035;
    const ph = 0.86;
    this.root.add(box(0.26, ph, 0.012, m.steel, px, 1.22, pz));
    const disp = new Mesh(
      new PlaneGeometry(0.2, 0.07),
      new MeshBasicMaterial({ map: this.display.texture, toneMapped: false }),
    );
    disp.position.set(px, 1.56, pz + 0.007);
    this.root.add(box(0.21, 0.08, 0.004, m.glass, px, 1.56, pz + 0.004), disp);
    const keys = [...floors, "◀▶", "▶◀"];
    keys.forEach((k, i) => {
      const col = i < floors.length ? 0 : i - floors.length;
      const row = i < floors.length ? i : floors.length;
      const x = i < floors.length ? px : px - 0.05 + col * 0.1;
      const y = 1.45 - row * 0.085;
      const ring = new Mesh(new CylinderGeometry(0.028, 0.028, 0.006, 24), m.lampOff);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, pz + 0.008);
      const cap = new Mesh(new CylinderGeometry(0.022, 0.022, 0.012, 24), m.steel);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, y, pz + 0.012);
      const face = new Mesh(new PlaneGeometry(0.036, 0.036), faceMat(k));
      face.position.set(x, y, pz + 0.0185);
      this.root.add(ring, cap, face);
      this.buttons.set(k, ring);
    });
    this.setDoors(0);
  }

  /** What moves or lights here (the rest may be merged: merge-static.ts). */
  moving(): Object3D[] {
    return [...this.leaves, ...this.buttons.values(), this.light, this.spill, this.spill.target];
  }

  /** 0 shut … 1 open. */
  setDoors(open: number) {
    const k = Math.max(0, Math.min(1, open));
    this.leaves.forEach((leaf, i) => {
      const s = i === 0 ? -1 : 1;
      leaf.position.x = 1 + (s * DOOR_W) / 4 + s * k * (DOOR_W / 2 - 0.02);
    });
    if (this.spill.visible) this.spill.intensity = 7 * k;
  }

  /** A button lit (a floor picked; open held), or none. */
  setLit(keys: string[]) {
    const m = this.mats;
    for (const [k, ring] of this.buttons) ring.material = keys.includes(k) ? m.lamp : m.lampOff;
  }
}

// (the motion's maths is shared with the iso view and the server: shared lift.ts)
export { doorEase, rideAt } from "@yutopia/shared";

// ── in the game: every stop on the floors drawn ─────────────────────────────
export interface LiftStop3 {
  o: { id: string; x: number; y: number; rot?: number };
  off: { x: number; y: number; h: number }; // its floor from mine
  motion: LiftMotion;
  floors: string[]; // the car's buttons, top down
  floor: string; // this stop's floor (on the jamb)
  mine: boolean; // on my floor (its car's buttons can be pressed)
  shown: boolean; // drawn (the floors above mine are kept, hidden: ready for going up)
  inside: boolean; // I'm in its car (it's here, whatever the props still say)
  sway: number; // the car swaying as it travels (tiles)
  rise: number; // the car I'm in, up from this floor on its way up the shaft (tiles)
}

interface StopView {
  shown: boolean;
  outer: Group;
  landing: LiftLanding;
  car: LiftCar;
  floorsKey: string;
}

/** The elevators of the 3D view (tp/view.ts): the new landing and car for each
 *  stop, moved every frame from the shared motion (doors, display, lantern). */
export class Lifts3 {
  readonly root = new Group();
  picks: Pick3[] = [];
  private views = new Map<string, StopView>();
  private env: Texture | null = null;

  constructor(renderer: WebGLRenderer) {
    // metal needs something to reflect, for the lifts' own materials (the rest
    // of the scene keeps its light as it is): a soft gradient — a light
    // ceiling, a darker floor — never brighter than white, so no reflection
    // ever crosses the bloom's threshold (a room environment's lamps did, as a
    // white blaze at some angles in the car)
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, "#d8d6d2");
    grd.addColorStop(0.45, "#a9a7a3");
    grd.addColorStop(0.55, "#77736d");
    grd.addColorStop(1, "#3a3733");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 32);
    const sky = new CanvasTexture(c);
    sky.mapping = EquirectangularReflectionMapping;
    sky.colorSpace = SRGBColorSpace;
    const pm = new PMREMGenerator(renderer);
    this.env = pm.fromEquirectangular(sky).texture;
    pm.dispose();
    sky.dispose();
    const m = liftMats();
    for (const mat of Object.values(m))
      if (mat instanceof MeshStandardMaterial) {
        mat.envMap = this.env;
        mat.envMapIntensity = 0.55;
        mat.needsUpdate = true;
      }
    // (the game's light is brighter than the prototype's, and blooms above a
    // luminance of 0.72 at night: the steel a little darker and its sheen
    // spread — the room's bright panels made hot spots on it at some angles —
    // the mirror smoky, the ceiling's panel well under the threshold)
    m.steel.color.multiplyScalar(0.72);
    m.steelV.color.multiplyScalar(0.72);
    m.steel.roughness = m.steelV.roughness = 0.44;
    m.mirror.roughness = 0.24;
    m.mirror.color.multiplyScalar(0.7);
    m.ceiling.color.set("#a39b8e");
  }

  // the car's buttons where a click finds them (`${stop id}|btn|${label}`): looked
  // at before anything else, the car's own box round you included
  buttonPicks: Pick3[] = [];
  private v = new Vector3();

  sync(stops: LiftStop3[]) {
    const seen = new Set<string>();
    this.picks = [];
    this.buttonPicks = [];
    for (const s of stops) {
      seen.add(s.o.id);
      const key = `${s.floors.join(",")}|${s.floor}`;
      let v = this.views.get(s.o.id);
      if (v && v.floorsKey !== key) {
        this.drop(s.o.id, v);
        v = undefined;
      }
      if (!v) {
        const outer = new Group();
        const inner = new Group();
        inner.position.set(-1, 0, -1);
        const landing = new LiftLanding(liftMats(), { floor: s.floor });
        const car = new LiftCar(s.floors, liftCarMats(), { lights: false });
        // (the car's still pieces one mesh a material: a hundred-odd draws fewer. Not the
        // landing's: its frame and the wall round it lie in one plane, and merged they meet
        // differently there — docs/plan/38-the-lag.md)
        mergeStatic(car.root, car.moving());
        // (their shadows in a draw or two each — not what moves: the doors)
        shadowProxy(landing.root, HIDDEN_LAYER, landing.moving());
        shadowProxy(car.root, HIDDEN_LAYER, car.moving());
        inner.add(landing.root, car.root);
        outer.add(inner);
        this.root.add(outer);
        v = { shown: s.shown, outer, landing, car, floorsKey: key };
        this.views.set(s.o.id, v);
      }
      const { o, off, motion } = s;
      v.shown = s.shown;
      v.outer.visible = s.shown || this.warming;
      v.outer.position.set(o.x + 1 + off.x, off.h, o.y + 1 + off.y);
      v.outer.rotation.y = -((o.rot ?? 0) & 3) * (Math.PI / 2);
      const shown = `${liftFloorName(Math.round(motion.car))}${motion.dir > 0 ? "▲" : motion.dir < 0 ? "▼" : ""}`;
      v.landing.setDoors(motion.doors);
      v.landing.display.set(shown);
      v.landing.setLantern(motion.dir, motion.here && motion.doors > 0.02);
      // (the car I'm in is here: arriving, the server's word may be a moment behind me)
      const here = motion.here || s.inside;
      v.car.root.visible = here;
      v.car.root.position.y = here ? s.sway + s.rise : 0;
      v.car.setDoors(motion.doors);
      v.car.display.set(shown);
      v.car.setLit(
        motion.phase === "moving" || motion.phase === "closing" ? [liftFloorName(Math.round(motion.to))] : [],
      );
      if (here && s.mine) {
        v.outer.updateMatrixWorld(true);
        const r = 0.04;
        for (const [label, ring] of v.car.buttons) {
          ring.getWorldPosition(this.v);
          this.buttonPicks.push({
            id: `${o.id}|btn|${label}`,
            use: true,
            x0: this.v.x - r,
            x1: this.v.x + r,
            y0: this.v.z - r,
            y1: this.v.z + r,
            z0: this.v.y - r,
            z1: this.v.y + r,
          });
        }
      }
      // where a click finds it: the doors and the car behind them
      if (!s.shown) continue;
      const r = (o.rot ?? 0) & 3;
      const x0 = o.x + off.x;
      const y0 = o.y + off.y;
      this.picks.push({
        id: o.id,
        use: true,
        x0: r === 3 ? x0 - 0.25 : x0,
        x1: r === 1 ? x0 + 2.25 : x0 + 2,
        y0: r === 0 ? y0 - 0.25 : y0,
        y1: r === 2 ? y0 + 2.25 : y0 + 2,
        z0: off.h,
        z1: off.h + 2.6,
      });
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.drop(id, v);
  }

  /** Every stop drawn for a moment (the view's warm-up: on the GPU ahead). */
  private warming = false;
  showAll(on: boolean) {
    this.warming = on;
    for (const v of this.views.values()) v.outer.visible = on || v.shown;
  }

  private drop(id: string, v: StopView) {
    this.root.remove(v.outer);
    v.outer.traverse((x) => {
      if (x instanceof Mesh) x.geometry.dispose();
    });
    this.views.delete(id);
  }

  dispose() {
    for (const [id, v] of this.views) this.drop(id, v);
    this.env?.dispose();
  }
}
