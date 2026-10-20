import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  Group,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  ShapeUtils,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as T from "./textures";
import { type Cluster, drawCluster, drawRadio } from "./vfd";

// The sedan (docs/plan/28-the-car.md): an 80s rear-wheel-drive saloon, in
// parts — the sprung body (it rolls and pitches on its springs), four doors on
// their hinges, four wheels that steer, spin and ride, the steering wheel, the
// wipers, the lamps, and a whole cabin: the VFD cluster, walnut and cream
// cloth, the radio-cassette, the gear lever and handbrake, the mirror and its
// pine tree.
//
// Units are metres (a tile). The car stands on the ground at y = 0, centred on
// its footprint, its nose to −x (as the lot's cars at rot 0); +z is its left,
// the driver's side. The profile is drawn in `u`, 0 at the nose to L at the tail.

export const SEDAN = {
  L: 4.9,
  W: 1.86,
  axleF: 0.95,
  axleR: 3.8,
  wheelR: 0.317,
  track: 0.76, // a wheel centre's distance off the middle
  belt: 0.965,
  roof: 1.53,
  steerRatio: 15.9, // the steering wheel's turn for the road wheels' (540° ↔ 34°)
};

// The bodies (docs/plan/28-the-car.md, phase 6: the 4x4): each its own profile and greenhouse,
// the same parts and the same cabin (moved and narrowed to fit). The module's dimensions are
// set to the body being built (the builder below is synchronous).
type P2 = [number, number];
type V3 = [number, number, number];
export type BodyKind = "sedan" | "offroad";
interface Body {
  kind: BodyKind;
  L: number;
  W: number;
  axleF: number;
  axleR: number;
  wheelR: number;
  track: number;
  belt: number;
  roof: number;
  XF: number; // the firewall, the windscreen's foot, the front doors' leading edge
  XB: number; // the B-pillar (the front doors' trailing edge)
  XR: number; // the rear seat's back
  HB: number; // the greenhouse's half-width at the beltline
  HR: number; // ... at the roof
  arch: number; // the wheel arches' radius, their centre's height
  archY: number;
  lower: P2[]; // the body below the glass, nose to tail along the bottom, back over the top
  top: P2[]; // its top line (the hood, the beltline, the boot)
  A1: P2; // the windscreen's top
  R1: P2; // the roof's back
  cabin: { dx: number; dy: number; sz: number }; // the sedan's cabin moved / narrowed to fit
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
const SEDAN_TOP: P2[] = [
  [0.0, 0.74],
  [0.04, 0.8],
  [0.12, 0.845],
  [0.4, 0.872],
  [1.2, 0.93],
  [1.62, 0.958],
  [3.0, 0.965],
  [3.95, 0.975],
  [4.89, 0.962],
];
const OFF_TOP: P2[] = [
  [0.0, 0.93],
  [0.02, 0.985],
  [0.08, 1.03],
  [0.3, 1.05],
  [1.18, 1.1],
  [1.3, 1.12],
  [3.76, 1.12],
];
const SHAPES: Record<BodyKind, Body> = {
  sedan: {
    kind: "sedan",
    L: 4.9,
    W: 1.86,
    axleF: 0.95,
    axleR: 3.8,
    wheelR: 0.317,
    track: 0.76,
    belt: 0.965,
    roof: 1.53,
    XF: 1.66,
    XB: 2.81,
    XR: 3.72,
    HB: 0.89,
    HR: 0.74,
    arch: 0.42,
    archY: 0.33,
    lower: [
      [0.03, 0.3],
      [0.53, 0.29],
      ...arc(0.95, 0.33, 0.42, Math.PI, 0, 18),
      [1.37, 0.25],
      [3.38, 0.25],
      ...arc(3.8, 0.33, 0.42, Math.PI, 0, 18),
      [4.22, 0.29],
      [4.84, 0.31],
      [4.9, 0.38],
      [4.92, 0.86],
      ...SEDAN_TOP.slice().reverse(),
      [0.0, 0.42],
    ],
    top: SEDAN_TOP,
    A1: [2.31, 1.51],
    R1: [3.42, 1.52],
    cabin: { dx: 0, dy: 0, sz: 1 },
  },
  offroad: {
    kind: "offroad",
    L: 3.8,
    W: 1.7,
    axleF: 0.75,
    axleR: 2.95,
    wheelR: 0.36,
    track: 0.71,
    belt: 1.12,
    roof: 1.73,
    XF: 1.24,
    XB: 2.46,
    XR: 3.3,
    HB: 0.79,
    HR: 0.71,
    arch: 0.47,
    archY: 0.38,
    lower: [
      [0.03, 0.47],
      [0.26, 0.45],
      ...arc(0.75, 0.38, 0.47, Math.PI, 0, 18),
      [1.24, 0.42],
      [2.46, 0.42],
      ...arc(2.95, 0.38, 0.47, Math.PI, 0, 18),
      [3.44, 0.45],
      [3.76, 0.47],
      [3.8, 0.52],
      [3.8, 1.06],
      ...OFF_TOP.slice().reverse(),
      [0.0, 0.5],
    ],
    top: OFF_TOP,
    A1: [1.6, 1.705],
    R1: [3.71, 1.715],
    cabin: { dx: 1.24 - 1.66 + (4.9 - 3.8) / 2, dy: 0.18, sz: 1.7 / 1.86 },
  },
};
let S: Body = SHAPES.sedan;
let L = S.L;
let W = S.W;
let XF = S.XF;
let XB = S.XB;
let XR = S.XR;
let HB = S.HB;
let HR = S.HR;
let BELT = S.belt;
let ROOF = S.roof;
let LOWER: P2[] = S.lower;
function useShape(k: BodyKind): Body {
  S = SHAPES[k];
  ({ L, W, XF, XB, XR, HB, HR } = S);
  BELT = S.belt;
  ROOF = S.roof;
  LOWER = S.lower;
  return S;
}
const DOOR_T = 0.06; // the doors' skin
const TUB = 0.15; // the rear wheel tubs' inner wall, in from the track (the bench sits between them)
const ux = (u: number) => u - L / 2;

/** [u0, u1] less the wheel arches (a strip along the flank at height y stops short of them). */
function clearOfArches(u0: number, u1: number, y: number): [number, number][] {
  const r = S.arch + 0.03;
  const d = Math.max(0, y - S.archY);
  if (d >= r) return [[u0, u1]];
  const h = Math.sqrt(r * r - d * d);
  let out: [number, number][] = [[u0, u1]];
  for (const a of [S.axleF, S.axleR])
    out = out.flatMap(([p, q]): [number, number][] =>
      (
        [
          [p, Math.min(q, a - h)],
          [Math.max(p, a + h), q],
        ] as [number, number][]
      ).filter(([x, z]) => z - x > 0.04),
    );
  return out;
}

/** The greenhouse's half-width at height y (it leans in: tumblehome). */
const hw = (y: number) => HB + (HR - HB) * Math.min(1, Math.max(0, (y - BELT) / (ROOF - 0.01 - BELT)));

/** The top of the body at u (the hood, the beltline, the boot lid). */
function topY(u: number): number {
  const top = S.top;
  for (let i = 0; i < top.length - 1; i++)
    if (u <= top[i + 1][0]) {
      const k = (u - top[i][0]) / (top[i + 1][0] - top[i][0]);
      return top[i][1] + (top[i + 1][1] - top[i][1]) * k;
    }
  return top[top.length - 1][1];
}

/** The part of a polygon between u0 and u1 (Sutherland–Hodgman, twice). */
function clipU(pts: P2[], u0: number, u1: number): P2[] {
  const clip = (p: P2[], keep: (q: P2) => boolean, at: number) => {
    const out: P2[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const ka = keep(a);
      const kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) {
        const t = (at - a[0]) / (b[0] - a[0]);
        out.push([at, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clip(
    clip(pts, (q) => q[0] >= u0, u0),
    (q) => q[0] <= u1,
    u1,
  );
}

/** A side profile extruded across z0..z1 (the bevel inside those bounds), in model coords. */
function slab(pts: P2[], z0: number, z1: number, bevel: number): BufferGeometry {
  const s = new Shape(pts.map(([u, y]) => new Vector2(u, y)));
  const g = new ExtrudeGeometry(s, {
    depth: Math.max(0.001, z1 - z0 - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(-L / 2, 0, z0 + bevel);
  return g;
}

const m4 = new Matrix4();
const va = new Vector3();
const vb = new Vector3();
const vd = new Vector3();
const vs = new Vector3();
const vn = new Vector3();
/** A bar from a to b (model coords), `w` across `side`, `h` across the third way. */
function beam(a: V3, b: V3, w: number, h: number, side: V3 = [0, 0, 1]): BufferGeometry {
  va.set(...a);
  vb.set(...b);
  vd.subVectors(vb, va);
  const len = vd.length();
  vd.normalize();
  vs.set(...side);
  vs.addScaledVector(vd, -vs.dot(vd));
  if (vs.lengthSq() < 1e-8) vs.set(1, 0, 0).addScaledVector(vd, -vd.x);
  vs.normalize();
  vn.crossVectors(vs, vd);
  const g = new BoxGeometry(w, len, h);
  m4.makeBasis(vs, vd, vn);
  m4.setPosition(va.add(vb).multiplyScalar(0.5));
  g.applyMatrix4(m4);
  return g;
}
const U = (u: number, y: number, z: number): V3 => [ux(u), y, z];
/** An axis-aligned box from its corners in profile coords. */
function cube(u0: number, u1: number, y0: number, y1: number, z0: number, z1: number): BufferGeometry {
  return new BoxGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate(
    ux((u0 + u1) / 2),
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  );
}
/** One-sided triangles from a fan of points (model coords). */
function faces(pts: V3[][], flip = false): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const poly of pts)
    for (let i = 1; i < poly.length - 1; i++) {
      const tri = flip ? [poly[0], poly[i + 1], poly[i]] : [poly[0], poly[i], poly[i + 1]];
      for (const p of tri) {
        pos.push(...p);
        uv.push(p[0], p[1]);
      }
    }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
/** A flat outline in the greenhouse's leaning side (glass, a frame), `inset` in from it. */
function sidePane(pts: P2[], side: 1 | -1, inset: number): BufferGeometry {
  const contour = pts.map(([u, y]) => new Vector2(u, y));
  const tris = ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const uv: number[] = [];
  for (const t of side > 0 ? tris : tris.map(([a, b, c]) => [a, c, b])) {
    for (const i of t) {
      const [u, y] = pts[i];
      pos.push(ux(u), y, side * (hw(y) - inset));
      uv.push(u, y);
    }
  }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
const onSide = (u: number, y: number, side: number, inset = 0): V3 => [ux(u), y, side * (hw(y) - inset)];

// ── materials, bucketed: one mesh per material per moving part ───────────────
class Parts {
  private by = new Map<Material, BufferGeometry[]>();
  add(m: Material, ...gs: BufferGeometry[]) {
    const a = this.by.get(m) ?? [];
    this.by.set(m, a);
    for (const g of gs) a.push(g);
  }
  build(into: Object3D, shadow = true): Mesh[] {
    const out: Mesh[] = [];
    for (const [m, gs] of this.by) {
      const ready = gs.map((g) => {
        let n = g.index ? g.toNonIndexed() : g;
        if (n !== g) g.dispose();
        if (!n.getAttribute("uv")) {
          n.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2));
        }
        if (!n.getAttribute("normal")) n.computeVertexNormals();
        for (const k of Object.keys(n.attributes))
          if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
        n = n as BufferGeometry;
        return n;
      });
      const merged = mergeGeometries(ready, false);
      for (const g of ready) g.dispose();
      const mesh = new Mesh(merged, m);
      mesh.castShadow = shadow && !(m as MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      into.add(mesh);
      out.push(mesh);
    }
    this.by.clear();
    return out;
  }
}

export interface SedanOpts {
  colour: number;
  /** which body (the 80s 4x4's: "offroad") */
  kind?: BodyKind;
  /** snow lying on it, 0..1 */
  snowy?: number;
  plate?: string;
}
export interface Lights {
  beams: "off" | "low" | "high";
  tail: boolean; // the side and tail lamps (with the beams, or alone)
  brake: number; // 0..1
  reverse: boolean;
  ind: -1 | 0 | 1; // an indicator lit this instant (both: hazards are drawn by calling with each)
  hazard?: boolean;
  dash: number; // the cluster and switches' brightness (0 off, 1 full; dimmer by day)
  dome: boolean;
}
export interface Wheel {
  steer: Group; // turns about y
  spin: Group; // turns about z (the axle)
  front: boolean;
  side: 1 | -1;
  rest: Vector3; // its centre at rest (model coords)
}
export interface Door {
  group: Group; // its hinge; rotation.y opens it (`open(a)`)
  side: 1 | -1;
  front: boolean;
  open(a: number): void;
}
export interface Wiper {
  arm: Group; // turns about z (on the glass); a: 0 = lying along +z, π = along −z (parked)
  park: number;
  sweep: number; // the far end of its sweep
  pivot: number; // z
  len: number;
  blade: number;
}

export interface Sedan {
  root: Group;
  body: Group; // sprung: set its rotation.x / z and position.y for roll, pitch and bounce
  wheels: Wheel[]; // FL, FR, RL, RR
  doors: Door[]; // FL (the driver's), FR, RL, RR
  steering: Group; // the steering wheel: rotation.z turns it
  wipers: Wiper[];
  freshener: Group; // rotation.x / z swing it
  snow: Mesh[];
  /** where people sit: the hip point and the side (model coords); driver, front passenger, rear left, rear right */
  seats: { hip: Vector3; side: 1 | -1; front: boolean }[];
  /** the driver's eyes (model coords, sitting back) */
  eye: Vector3;
  /** the body: its length, where its front axle is (the profile's u), which */
  dims: { L: number; axleF: number; kind: BodyKind };
  /** the lamps (model coords): headlamps' centres and their aim; tail lamps */
  lamps: { head: Vector3[]; tail: Vector3[]; exhaust: Vector3 };
  /** the rear-view mirror's glass (model coords: it faces +x, the driver) */
  rearView: Mesh;
  /** the glass of the windscreen: its foot and top in profile coords, half-widths */
  screen: { u0: number; y0: number; u1: number; y1: number; hw0: number; hw1: number; len: number };
  /** a point on the steering wheel's rim (model coords): `phi` from 12 o'clock towards the driver's right */
  rim(phi: number, out?: Vector3): Vector3;
  setSteer(road: number): void;
  setLights(l: Lights): void;
  setCluster(c: Cluster): void;
  setRadio(band: "FM" | "AM" | "TAPE", f: number, preset: number): void;
  setScreenSnow(t: Texture | null): void;
  setEnv(t: Texture | null): void;
  dispose(): void;
}

export function buildSedan(o: SedanOpts): Sedan {
  const sh = useShape(o.kind ?? "sedan");
  const off = sh.kind === "offroad";
  const dy = sh.cabin.dy; // (the floor's height above the sedan's)
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  // ── materials ──
  const paint = keep(
    new MeshPhysicalMaterial({
      color: o.colour,
      roughness: 0.42,
      metalness: 0.05,
      clearcoat: 0.55,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.4,
    }),
  );
  const chrome = keep(
    new MeshStandardMaterial({ color: "#e4e7ea", roughness: 0.12, metalness: 1, envMapIntensity: 1.2 }),
  );
  const satin = keep(new MeshStandardMaterial({ color: "#16181a", roughness: 0.55, metalness: 0.1 }));
  const rubber = keep(new MeshStandardMaterial({ color: "#121314", roughness: 0.92 }));
  const under = keep(new MeshStandardMaterial({ color: "#0d0e0f", roughness: 1, side: DoubleSide }));
  const glass = keep(
    new MeshPhysicalMaterial({
      color: "#2b3940",
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.32,
      side: DoubleSide,
      envMapIntensity: 1.4,
      depthWrite: false,
    }),
  );
  const mirror = keep(
    new MeshStandardMaterial({ color: "#c9d0d6", roughness: 0.02, metalness: 1, envMapIntensity: 1.3 }),
  );
  const ribs = keep(T.lens("ribs"));
  const grid = keep(T.lens("grid"));
  const headLens = keep(
    new MeshStandardMaterial({
      color: "#e9e6dc",
      map: grid,
      roughness: 0.15,
      metalness: 0.3,
      emissive: "#fff3d6",
      emissiveMap: grid,
      emissiveIntensity: 0,
    }),
  );
  const red = keep(
    new MeshStandardMaterial({
      color: "#6e100c",
      map: ribs,
      roughness: 0.25,
      emissive: "#ff2a14",
      emissiveMap: ribs,
      emissiveIntensity: 0,
    }),
  );
  const amberL = keep(
    new MeshStandardMaterial({
      color: "#b8661a",
      map: ribs,
      roughness: 0.25,
      emissive: "#ff9a2a",
      emissiveMap: ribs,
      emissiveIntensity: 0,
    }),
  );
  const amberR = amberL.clone();
  keep(amberR);
  const reverse = keep(
    new MeshStandardMaterial({
      color: "#d9d9d6",
      map: ribs,
      roughness: 0.25,
      emissive: "#ffffff",
      emissiveMap: ribs,
      emissiveIntensity: 0,
    }),
  );
  const plateTex = keep(T.plate(o.plate ?? "YTP·1986"));
  const plateMat = keep(
    new MeshStandardMaterial({
      map: plateTex,
      roughness: 0.5,
      emissive: "#ffffff",
      emissiveMap: plateTex,
      emissiveIntensity: 0,
    }),
  );
  const snowMat = keep(new MeshStandardMaterial({ color: "#f3f6f9", roughness: 0.88, envMapIntensity: 0.3 }));
  // the cabin
  const woodTex = keep(T.walnut());
  woodTex.repeat.set(2.2, 2.2);
  const wood = keep(
    new MeshPhysicalMaterial({
      map: woodTex,
      roughness: 0.42,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.25,
    }),
  );
  const clothTex = keep(T.cloth());
  clothTex.repeat.set(9, 9);
  const cloth = keep(new MeshStandardMaterial({ map: clothTex, roughness: 0.97, envMapIntensity: 0.08 }));
  const carpetTex = keep(T.carpet());
  carpetTex.repeat.set(3, 3);
  const carpet = keep(new MeshStandardMaterial({ map: carpetTex, roughness: 1, envMapIntensity: 0.05 }));
  const dashTop = keep(new MeshStandardMaterial({ color: "#2b221d", roughness: 0.85, envMapIntensity: 0.1 }));
  const vinyl = keep(new MeshStandardMaterial({ color: "#5a3a28", roughness: 0.6, envMapIntensity: 0.15 }));
  const cream = keep(new MeshStandardMaterial({ color: "#cdbf9f", roughness: 0.8, envMapIntensity: 0.1 }));
  const liner = keep(
    new MeshStandardMaterial({ color: "#d3c9b4", roughness: 1, envMapIntensity: 0.08, side: DoubleSide }),
  );
  // (the C-pillar's inside: one-sided, on the paint's very surface)
  const sailIn = keep(new MeshStandardMaterial({ color: "#d3c9b4", roughness: 1, envMapIntensity: 0.08 }));
  const leather = keep(new MeshStandardMaterial({ color: "#2a1d16", roughness: 0.55, envMapIntensity: 0.2 }));
  const switchMat = keep(new MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.5, envMapIntensity: 0.2 }));
  const strap = keep(new MeshStandardMaterial({ color: "#3a332c", roughness: 0.9 }));
  // the VFDs and the lit panels
  const clusterCanvas = document.createElement("canvas");
  clusterCanvas.width = 1024;
  clusterCanvas.height = 256;
  const clusterTex = keep(new CanvasTexture(clusterCanvas));
  clusterTex.colorSpace = SRGBColorSpace;
  clusterTex.anisotropy = 8;
  const clusterMat = keep(new MeshBasicMaterial({ map: clusterTex, toneMapped: false }));
  const radioCanvas = document.createElement("canvas");
  radioCanvas.width = 512;
  radioCanvas.height = 128;
  const radioTex = keep(new CanvasTexture(radioCanvas));
  radioTex.colorSpace = SRGBColorSpace;
  const radioMat = keep(new MeshBasicMaterial({ map: radioTex, toneMapped: false }));
  const heaterTex = keep(T.heater());
  const heaterMat = keep(new MeshBasicMaterial({ map: heaterTex, toneMapped: false }));
  const domeMat = keep(
    new MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.4, emissive: "#fff1d0", emissiveIntensity: 0 }),
  );
  const exterior: (MeshStandardMaterial | MeshPhysicalMaterial)[] = [
    paint,
    chrome,
    glass,
    mirror,
    satin,
    headLens,
    snowMat,
  ];
  const interior: (MeshStandardMaterial | MeshPhysicalMaterial)[] = [
    wood,
    cloth,
    carpet,
    dashTop,
    vinyl,
    cream,
    leather,
    switchMat,
  ];

  const root = new Group();
  root.name = "sedan";
  const body = new Group();
  body.name = "sedan-body";
  root.add(body);
  const B = new Parts();

  // ── the body: the nose and the boot solid, the cabin between them open ──
  const bc = 0.02;
  B.add(paint, slab(clipU(LOWER, -1, XF - bc), -W / 2, W / 2, bc));
  B.add(paint, slab(clipU(LOWER, XR + bc, L + 1), -W / 2, W / 2, bc));
  // the cowl between the hood and the glass (the wipers' black grille)
  B.add(satin, cube(XF - 0.07, XF + 0.06, BELT - 0.015, BELT + 0.007, -W / 2 + 0.07, W / 2 - 0.07));
  // the wheel wells' liners and the floor pan underneath; the rear tubs close round their
  // tyres and trimmed in vinyl on the cabin's side (nothing of the cabin shows in an arch)
  const ar = sh.arch - 0.005;
  // (a rear tub reaches down past the axle's height to the floor pan: `dip` radians more each end)
  const half = (r: number, z0: number, z1: number, u: number, s: number, dip = 0) =>
    new CylinderGeometry(r, r, z1 - z0, 20, 1, true, Math.PI / 2 - dip, Math.PI + 2 * dip)
      .rotateX(Math.PI / 2)
      .translate(ux(u), sh.archY, (s * (z0 + z1)) / 2);
  for (const u of [sh.axleF, sh.axleR])
    for (const s of [1, -1]) {
      const rear = u === sh.axleR;
      const z0 = sh.track - (rear ? TUB : 0.19);
      const z1 = sh.track + 0.15;
      const gap = sh.archY - (0.22 + dy);
      const dip = rear && gap > 0 ? Math.asin(Math.min(1, gap / ar)) : 0;
      B.add(under, half(ar, z0, z1, u, s, dip));
      B.add(under, new CircleGeometry(ar, 20, 0, Math.PI).translate(ux(u), sh.archY, s * z0));
      if (!rear) continue;
      // (its inner wall too, below the axle's height)
      if (gap > 0) B.add(under, new PlaneGeometry(2 * ar, gap).translate(ux(u), sh.archY - gap / 2, s * z0));
      B.add(vinyl, half(ar + 0.006, z0, W / 2 - DOOR_T - 0.01, u, s, dip));
      const wall = new CircleGeometry(ar + 0.006, 20, 0, Math.PI);
      if (s > 0) wall.rotateY(Math.PI);
      B.add(vinyl, wall.translate(ux(u), sh.archY, s * (z0 - 0.006)));
    }
  B.add(under, cube(sh.axleF - 0.5, sh.axleR + 0.65, sh.wheelR * 0.45, sh.wheelR * 0.8, -0.58, 0.58));
  B.add(under, cube(XF, XR, 0.22 + dy, 0.3 + dy, -W / 2 + DOOR_T, W / 2 - DOOR_T));
  const head: Vector3[] = [];
  const tail: Vector3[] = [];
  if (off) {
    // black bumpers, square-cut; the grille a black panel of slats; round headlamps in it
    for (const [u0, u1] of [
      [-0.07, 0.06],
      [L - 0.06, L + 0.07],
    ]) {
      B.add(satin, cube(u0, u1, 0.47, 0.63, -W / 2 - 0.01, W / 2 + 0.01));
      B.add(rubber, cube(u0 < 1 ? u0 - 0.006 : u1, u0 < 1 ? u0 : u1 + 0.006, 0.52, 0.58, -W / 2 + 0.05, W / 2 - 0.05));
    }
    B.add(satin, cube(-0.025, 0.005, 0.68, 0.955, -0.7, 0.7));
    for (let k = 0; k < 5; k++) B.add(chrome, cube(-0.031, -0.023, 0.72 + k * 0.045, 0.728 + k * 0.045, -0.32, 0.32));
    for (const s of [1, -1]) {
      const z = s * 0.52;
      B.add(headLens, new CylinderGeometry(0.088, 0.088, 0.03, 24).rotateZ(Math.PI / 2).translate(ux(-0.028), 0.84, z));
      B.add(chrome, new TorusGeometry(0.094, 0.012, 8, 28).rotateY(Math.PI / 2).translate(ux(-0.04), 0.84, z));
      head.push(new Vector3(ux(-0.05), 0.84, z));
      const amb = s > 0 ? amberL : amberR;
      B.add(amb, cube(-0.032, -0.02, 0.7, 0.75, s * 0.42, s * 0.62));
      B.add(amb, cube(0.02, 0.12, 0.84, 0.9, s * (W / 2 - 0.004), s * (W / 2 + 0.006)));
      // the tail: small lamp clusters at its corners
      // (out past the body's rounded back, 2 cm proud of the profile)
      B.add(satin, cube(L + 0.016, L + 0.026, 0.78, 0.98, s * 0.46, s * 0.82));
      B.add(red, cube(L + 0.024, L + 0.036, 0.8, 0.96, s * 0.56, s * 0.8));
      B.add(amb, cube(L + 0.024, L + 0.036, 0.8, 0.96, s * 0.47, s * 0.55));
      tail.push(new Vector3(ux(L + 0.05), 0.88, s * 0.64));
    }
    B.add(reverse, cube(L + 0.02, L + 0.032, 0.66, 0.72, -0.12, 0.12));
    B.add(plateMat, new PlaneGeometry(0.5, 0.115).rotateY(Math.PI / 2).translate(ux(L + 0.024), 0.86, 0));
    B.add(plateMat, new PlaneGeometry(0.5, 0.115).rotateY(-Math.PI / 2).translate(ux(-0.076), 0.555, 0));
    // the roof rack: two rails on feet, three bars across
    for (const sd of [1, -1]) {
      const z = sd * (HR - 0.04);
      B.add(satin, beam(U(sh.A1[0] + 0.1, ROOF + 0.09, z), U(sh.R1[0] - 0.06, ROOF + 0.09, z), 0.03, 0.03, [0, 1, 0]));
      for (const u of [sh.A1[0] + 0.15, (sh.A1[0] + sh.R1[0]) / 2, sh.R1[0] - 0.12])
        B.add(satin, cube(u - 0.03, u + 0.03, ROOF, ROOF + 0.09, z - 0.025, z + 0.025));
    }
    for (const u of [sh.A1[0] + 0.25, (sh.A1[0] + sh.R1[0]) / 2, sh.R1[0] - 0.2])
      B.add(satin, beam(U(u, ROOF + 0.1, -HR + 0.04), U(u, ROOF + 0.1, HR - 0.04), 0.03, 0.02, [1, 0, 0]));
    // mud flaps behind the wheels, black cladding along the sills
    for (const sd of [1, -1]) {
      for (const u of [sh.axleF + sh.arch + 0.04, sh.axleR + sh.arch + 0.04])
        B.add(rubber, cube(u, u + 0.012, 0.18, 0.46, sd * (W / 2 - 0.2), sd * (W / 2 - 0.02)));
      for (const [u0, u1] of [...clearOfArches(0.3, XF - 0.02, 0.47), ...clearOfArches(XR + 0.02, L - 0.08, 0.47)])
        B.add(rubber, cube(u0, u1, 0.47, 0.58, sd * (W / 2), sd * (W / 2 + 0.015)));
      // behind the door (no rear doors): the body's side, and a card inside over the tub
      const zo = sd > 0 ? W / 2 - DOOR_T : -W / 2;
      B.add(paint, slab(clipU(LOWER, XB + 0.013, XR + bc), zo, zo + DOOR_T, 0.01));
      const zi = sd * (W / 2 - DOOR_T - 0.012);
      B.add(cream, cube(XB + 0.04, XR, sh.archY + sh.arch + 0.015, BELT - 0.01, zi - sd * 0.01, zi + sd * 0.01));
    }
  } else {
    // the bumpers: chrome over a black rubber insert, wrapping round the corners
    for (const [u0, u1, wrap] of [
      [-0.075, 0.045, [0.045, 0.32]],
      [4.855, 4.975, [4.58, 4.855]],
    ] as [number, number, [number, number]][]) {
      B.add(chrome, cube(u0, u1, 0.37, 0.52, -W / 2 - 0.025, W / 2 + 0.025));
      const front = u0 < 1;
      const face = front ? u0 - 0.004 : u1 + 0.004;
      B.add(rubber, cube(face - 0.012, face + 0.012, 0.42, 0.47, -W / 2 - 0.02, W / 2 + 0.02));
      for (const s of [1, -1]) {
        B.add(chrome, cube(wrap[0], wrap[1], 0.37, 0.52, s * (W / 2 - 0.01), s * (W / 2 + 0.025)));
        B.add(rubber, cube(wrap[0], wrap[1], 0.42, 0.47, s * (W / 2 + 0.024), s * (W / 2 + 0.034)));
      }
      B.add(satin, cube(front ? 0.02 : 4.6, front ? 0.35 : 4.88, 0.21, 0.37, -0.86, 0.86));
    }
    // the grille: black, a chrome surround and slats
    B.add(satin, cube(-0.03, 0.0, 0.53, 0.755, -0.4, 0.4));
    for (let k = 0; k < 6; k++) {
      const y = 0.555 + k * 0.038;
      B.add(chrome, cube(-0.036, -0.026, y, y + 0.01, -0.39, 0.39));
    }
    B.add(chrome, beam(U(-0.034, 0.53, -0.405), U(-0.034, 0.53, 0.405), 0.014, 0.014, [0, 1, 0]));
    B.add(chrome, beam(U(-0.034, 0.758, -0.405), U(-0.034, 0.758, 0.405), 0.014, 0.014, [0, 1, 0]));
    for (const s of [1, -1]) B.add(chrome, beam(U(-0.034, 0.53, s * 0.405), U(-0.034, 0.758, s * 0.405), 0.014, 0.014));
    // the headlamps: square sealed beams in a chrome bezel; amber corner lamps wrapping round
    for (const s of [1, -1]) {
      B.add(headLens, cube(-0.034, -0.012, 0.56, 0.745, s * 0.45, s * 0.82));
      head.push(new Vector3(ux(-0.04), 0.652, s * 0.635));
      for (const [a, b] of [
        [U(-0.036, 0.556, s * 0.445), U(-0.036, 0.556, s * 0.825)],
        [U(-0.036, 0.749, s * 0.445), U(-0.036, 0.749, s * 0.825)],
        [U(-0.036, 0.556, s * 0.445), U(-0.036, 0.749, s * 0.445)],
        [U(-0.036, 0.556, s * 0.825), U(-0.036, 0.749, s * 0.825)],
      ] as [V3, V3][])
        B.add(chrome, beam(a, b, 0.012, 0.012, [1, 0, 0]));
      const amb = s > 0 ? amberL : amberR;
      B.add(amb, cube(-0.03, -0.012, 0.56, 0.745, s * 0.835, s * 0.915));
      B.add(amb, cube(-0.0, 0.16, 0.56, 0.745, s * (W / 2 - 0.004), s * (W / 2 + 0.006)));
    }
    // the tail: lamps (reverse, red, amber outermost) on a black housing, the plate between
    for (const s of [1, -1]) {
      B.add(satin, cube(4.915, 4.93, 0.6, 0.86, s * 0.26, s * 0.92));
      B.add(reverse, cube(4.925, 4.942, 0.62, 0.84, s * 0.28, s * 0.4));
      B.add(red, cube(4.925, 4.942, 0.62, 0.84, s * 0.41, s * 0.74));
      B.add(s > 0 ? amberL : amberR, cube(4.925, 4.942, 0.62, 0.84, s * 0.75, s * 0.905));
      B.add(red, cube(4.62, 4.9, 0.62, 0.84, s * (W / 2 - 0.004), s * (W / 2 + 0.005)));
      tail.push(new Vector3(ux(4.95), 0.73, s * 0.58));
    }
    B.add(plateMat, new PlaneGeometry(0.5, 0.115).rotateY(Math.PI / 2).translate(ux(4.937), 0.68, 0));
    B.add(plateMat, new PlaneGeometry(0.5, 0.115).rotateY(-Math.PI / 2).translate(ux(-0.088), 0.445, 0));
    B.add(chrome, cube(4.88, 4.93, 0.875, 0.89, -0.88, 0.88));
  }
  // shut lines: the hood, the boot lid, the fuel flap
  const shut = (a: V3, b: V3) => B.add(under, beam(a, b, 0.008, 0.004, [0, 1, 0]));
  shut(U(XF - 0.06, topY(XF - 0.06) + 0.004, -W / 2 + 0.05), U(XF - 0.06, topY(XF - 0.06) + 0.004, W / 2 - 0.05));
  for (const s of [1, -1])
    for (let u = 0.12; u < XF - 0.1; u += 0.2)
      shut(U(u, topY(u) + 0.006, s * (W / 2 - 0.045)), U(u + 0.2, topY(u + 0.2) + 0.006, s * (W / 2 - 0.045)));
  if (off) {
    // the tailgate's outline on the back
    for (const [a, b] of [
      [U(L + 0.003, 0.64, -0.66), U(L + 0.003, 0.64, 0.66)],
      [U(L + 0.003, 0.64, -0.66), U(L + 0.003, BELT - 0.02, -0.66)],
      [U(L + 0.003, 0.64, 0.66), U(L + 0.003, BELT - 0.02, 0.66)],
    ] as [V3, V3][])
      B.add(under, beam(a, b, 0.008, 0.004, [1, 0, 0]));
  } else {
    for (const s of [1, -1]) {
      for (let u = 0.12; u < XF - 0.1; u += 0.2)
        shut(U(u, topY(u) + 0.006, s * 0.885), U(u + 0.2, topY(u + 0.2) + 0.006, s * 0.885));
      shut(U(3.99, topY(3.99) + 0.004, s * 0.86), U(4.86, topY(4.86) + 0.004, s * 0.86));
    }
    shut(U(3.99, topY(3.99) + 0.004, -0.86), U(3.99, topY(3.99) + 0.004, 0.86));
    for (const [a, b] of [
      [U(4.1, 0.78, -W / 2 - 0.002), U(4.26, 0.78, -W / 2 - 0.002)],
      [U(4.1, 0.9, -W / 2 - 0.002), U(4.26, 0.9, -W / 2 - 0.002)],
      [U(4.1, 0.78, -W / 2 - 0.002), U(4.1, 0.9, -W / 2 - 0.002)],
      [U(4.26, 0.78, -W / 2 - 0.002), U(4.26, 0.9, -W / 2 - 0.002)],
    ] as [V3, V3][])
      B.add(under, beam(a, b, 0.006, 0.004, [1, 0, 0]));
  }
  // rubbing strips along the nose and tail flanks (the doors carry their own)
  for (const s of off ? [] : [1, -1])
    for (const [u0, u1] of [...clearOfArches(0.38, XF - 0.02, 0.53), ...clearOfArches(XR + 0.02, 4.6, 0.53)]) {
      B.add(rubber, cube(u0, u1, 0.53, 0.585, s * (W / 2), s * (W / 2 + 0.016)));
      B.add(chrome, cube(u0, u1, 0.553, 0.562, s * (W / 2 + 0.016), s * (W / 2 + 0.019)));
    }
  // the aerial on the right front wing, the exhaust under the left rear
  B.add(chrome, beam(U(XF - 0.24, BELT - 0.045, -W / 2 + 0.11), U(XF + 0.2, BELT + 0.81, -W / 2 + 0.09), 0.007, 0.007));
  const ey = off ? 0.32 : 0.2;
  B.add(chrome, new CylinderGeometry(0.028, 0.03, 0.26, 12).rotateZ(Math.PI / 2).translate(ux(L - 0.04), ey, -0.52));
  B.add(under, new CircleGeometry(0.022, 12).rotateY(Math.PI / 2).translate(ux(L + 0.092), ey, -0.52));
  const exhaust = new Vector3(ux(L + 0.1), ey, -0.52);

  // ── the greenhouse: pillars, roof, glass ──
  const A0: P2 = [XF + 0.02, BELT + 0.003];
  const A1: P2 = sh.A1;
  const R1: P2 = sh.R1;
  for (const s of [1, -1] as const) {
    // A-pillar: painted, a trim inside
    B.add(
      paint,
      beam(onSide(A0[0] - 0.01, A0[1], s, 0.02), onSide(A1[0], A1[1] + 0.012, s, 0.02), 0.075, 0.055, [1, 0, 0]),
    );
    B.add(
      vinyl,
      beam(onSide(A0[0] + 0.03, A0[1], s, 0.075), onSide(A1[0] + 0.02, A1[1], s, 0.075), 0.08, 0.03, [1, 0, 0]),
    );
    // B-pillar: satin black outside, cream inside
    B.add(satin, beam(onSide(XB, BELT, s, 0.012), onSide(XB, ROOF - 0.01, s, 0.012), 0.11, 0.05, [1, 0, 0]));
    B.add(cream, beam(onSide(XB, BELT, s, 0.055), onSide(XB, ROOF - 0.015, s, 0.055), 0.13, 0.04, [1, 0, 0]));
    // drip rail along the roof's edge
    B.add(
      chrome,
      beam(
        onSide(A1[0] - 0.02, ROOF - 0.01, s, -0.006),
        onSide(R1[0] + 0.02, ROOF - 0.003, s, -0.006),
        0.012,
        0.014,
        [0, 1, 0],
      ),
    );
    if (off) {
      // the 4x4: a fixed window behind the door, the D-pillar, the cargo bay's liner
      const q: P2[] = [
        [XB + 0.09, BELT + 0.02],
        [R1[0] - 0.1, BELT + 0.02],
        [R1[0] - 0.1, ROOF - 0.05],
        [XB + 0.09, ROOF - 0.05],
      ];
      const pane = new Mesh(sidePane(q, s, 0.012), glass);
      pane.renderOrder = 2;
      body.add(pane);
      for (let i = 0; i < q.length; i++)
        B.add(
          satin,
          beam(
            onSide(q[i][0], q[i][1], s, -0.002),
            onSide(q[(i + 1) % 4][0], q[(i + 1) % 4][1], s, -0.002),
            0.026,
            0.022,
            [1, 0, 0],
          ),
        );
      B.add(
        paint,
        beam(onSide(R1[0] - 0.03, BELT, s, 0.02), onSide(R1[0] - 0.02, ROOF - 0.01, s, 0.02), 0.14, 0.05, [1, 0, 0]),
      );
      B.add(
        paint,
        faces(
          [
            [
              onSide(XB + 0.06, BELT + 0.005, s, 0),
              onSide(R1[0], BELT + 0.005, s, 0),
              onSide(R1[0], BELT - 0.06, s, -0.01),
              onSide(XB + 0.06, BELT - 0.06, s, -0.01),
            ],
          ],
          s < 0,
        ),
      );
      continue;
    }
    // C-pillar: the sail between the rear door's glass and the rear window
    const sb = onSide(3.56, 0.975, s, 0.0);
    const st = onSide(3.42, 1.52, s, 0.0);
    const gt: V3 = [ux(3.45), 1.52, s * (HR - 0.12)];
    const gb: V3 = [ux(3.955), 0.985, s * (HB - 0.16)];
    const db: V3 = [ux(3.95), 0.978, s * (W / 2 - 0.015)];
    const outer =
      s > 0
        ? [
            [sb, gb, gt, st],
            [sb, db, gb],
          ]
        : [
            [sb, st, gt, gb],
            [sb, gb, db],
          ];
    B.add(paint, faces(outer as V3[][]));
    B.add(sailIn, faces(outer as V3[][], true));
    // the side windows' frames on the body (the B-pillar's top edge, the sail's front edge)
    B.add(satin, beam(onSide(3.56, 0.98, s, -0.004), onSide(3.42, 1.515, s, -0.004), 0.025, 0.02, [1, 0, 0]));
  }
  // the roof: a thin slab, crowned, its edges rounded
  B.add(
    paint,
    slab(
      [
        [A1[0] - 0.03, ROOF - 0.035],
        [A1[0] + 0.03, ROOF + 0.003],
        [(A1[0] + R1[0]) / 2, ROOF + 0.017],
        [R1[0] + 0.02, ROOF + 0.005],
        [R1[0] + (off ? 0.06 : 0.07), ROOF - 0.03],
        [R1[0] + 0.03, ROOF - 0.035],
        [A1[0] + 0.02, ROOF - 0.03],
      ],
      -HR - 0.012,
      HR + 0.012,
      0.022,
    ),
  );
  // the windscreen: bowed, its foot under the cowl; the rear window
  const screen = {
    u0: A0[0] + 0.02,
    y0: BELT + 0.007,
    u1: A1[0] - 0.01,
    y1: ROOF - 0.027,
    hw0: HB - 0.07,
    hw1: HR - 0.06,
    len: 0,
  };
  screen.len = Math.hypot(screen.u1 - screen.u0, screen.y1 - screen.y0);
  const screenGeo = bowed(screen.u0, screen.y0, screen.hw0, screen.u1, screen.y1, screen.hw1, 0.035);
  const screenMesh = new Mesh(screenGeo, glass);
  screenMesh.renderOrder = 2;
  keep(screenGeo);
  body.add(screenMesh);
  // (lit a little from within: at night the cabin's glow and the lamps outside still show it)
  const snowScreenMat = keep(
    new MeshStandardMaterial({
      transparent: true,
      roughness: 0.9,
      depthWrite: false,
      color: "#f2f5f8",
      emissive: "#3c434d",
      side: DoubleSide,
    }),
  );
  const snowScreen = new Mesh(
    bowed(screen.u0, screen.y0, screen.hw0, screen.u1, screen.y1, screen.hw1, 0.035, 0.006),
    snowScreenMat,
  );
  snowScreen.visible = false;
  snowScreen.renderOrder = 3;
  body.add(snowScreen);
  const rearGeo = off
    ? bowed(R1[0] + 0.035, ROOF - 0.035, HR - 0.08, L - 0.035, BELT + 0.07, HB - 0.08, 0.012)
    : bowed(3.45, ROOF - 0.023, HR - 0.12, 3.945, 0.99, HB - 0.165, 0.03);
  const rear = new Mesh(rearGeo, glass);
  rear.renderOrder = 2;
  keep(rearGeo);
  body.add(rear);
  // the windscreen's chrome surround
  for (const s of [1, -1]) {
    B.add(
      chrome,
      beam(onSide(screen.u0, screen.y0, s, 0.07), onSide(screen.u1, screen.y1, s, 0.06), 0.012, 0.012, [1, 0, 0]),
    );
  }
  B.add(
    chrome,
    beam(
      U(screen.u1, screen.y1 + 0.004, -HR + 0.06),
      U(screen.u1, screen.y1 + 0.004, HR - 0.06),
      0.012,
      0.012,
      [0, 1, 0],
    ),
  );

  // ── the doors ──
  const doors: Door[] = [];
  const doorParts: { g: Group; p: Parts }[] = [];
  for (const front of off ? [true] : [true, false])
    for (const s of [1, -1] as const) {
      const bs = 0.01;
      const gap = bs + 0.003;
      const u0 = front ? XF + gap : XB + gap;
      const u1 = front ? XB - gap : XR - gap;
      const hinge = new Vector3(ux(u0), 0, s * (W / 2));
      const group = new Group();
      group.position.copy(hinge);
      const inner = new Group();
      inner.position.copy(hinge).negate();
      group.add(inner);
      body.add(group);
      const P = new Parts();
      const zo = s > 0 ? W / 2 - DOOR_T : -W / 2;
      P.add(paint, slab(clipU(LOWER, u0, u1), zo, zo + DOOR_T, bs));
      // the door card: cream vinyl, a walnut strip, the armrest, the crank, a speaker
      const zi = s * (W / 2 - DOOR_T - 0.012);
      const top = BELT - 0.01;
      const y = (v: number) => v + dy; // (the cabin's heights: the 4x4 sits higher)
      // (a door over a wheel: what's inside it stops short of the arch, at each height)
      const by = (h: number) => {
        const d = h - sh.archY;
        const r = sh.arch + 0.02;
        let at = u1;
        for (const a of [sh.axleF, sh.axleR])
          if (a > u0 && Math.abs(d) < r) at = Math.min(at, a - Math.sqrt(r * r - d * d));
        return at;
      };
      const card: P2[] = [[u0 + 0.03, y(0.33)]];
      for (let k = 0; k <= 12; k++) {
        const h = y(0.33) + ((top - y(0.33)) * k) / 12;
        card.push([Math.min(u1 - 0.03, by(h)), h]);
      }
      card.push([u0 + 0.03, top]);
      P.add(cream, slab(card, Math.min(zi - s * 0.01, zi + s * 0.01), Math.max(zi - s * 0.01, zi + s * 0.01), 0));
      P.add(wood, cube(u0 + 0.05, Math.min(u1 - 0.05, by(y(0.8))), y(0.8), y(0.84), zi - s * 0.02, zi));
      P.add(vinyl, cube(u0 + 0.05, u1 - 0.05, top - 0.065, top + 0.005, zi - s * 0.035, zi));
      P.add(
        vinyl,
        cube(u0 + (front ? 0.3 : 0.18), Math.min(u1 - 0.1, by(y(0.6))), y(0.6), y(0.66), zi - s * 0.085, zi),
      );
      P.add(chrome, cube(u0 + 0.1, u0 + 0.2, y(0.735), y(0.765), zi - s * 0.022, zi));
      const crank = Math.min(u1 - 0.2, by(y(0.47)) - 0.14);
      P.add(
        switchMat,
        new CylinderGeometry(0.035, 0.035, 0.02, 16).rotateX(Math.PI / 2).translate(ux(crank), y(0.52), zi - s * 0.015),
      );
      P.add(switchMat, beam(U(crank, y(0.52), zi - s * 0.03), U(crank + 0.08, y(0.47), zi - s * 0.03), 0.015, 0.012));
      P.add(chrome, new SphereGeometry(0.014, 8, 6).translate(ux(crank + 0.08), y(0.47), zi - s * 0.05));
      if (front)
        P.add(
          switchMat,
          new CylinderGeometry(0.075, 0.075, 0.012, 20)
            .rotateX(Math.PI / 2)
            .translate(ux(u0 + 0.26), y(0.43), zi - s * 0.012),
        );
      // outside: the handle, the rubbing strip (the 4x4: black cladding)
      P.add(satin, cube(u1 - 0.24, u1 - 0.08, BELT - 0.125, BELT - 0.085, s * (W / 2), s * (W / 2 + 0.018)));
      P.add(chrome, cube(u1 - 0.235, u1 - 0.085, BELT - 0.1, BELT - 0.09, s * (W / 2 + 0.018), s * (W / 2 + 0.021)));
      for (const [a, b] of clearOfArches(u0 + 0.01, u1 - 0.01, off ? 0.47 : 0.53))
        if (off) P.add(rubber, cube(a, b, 0.47, 0.58, s * (W / 2), s * (W / 2 + 0.015)));
        else {
          P.add(rubber, cube(a, b, 0.53, 0.585, s * (W / 2), s * (W / 2 + 0.016)));
          P.add(chrome, cube(a, b, 0.553, 0.562, s * (W / 2 + 0.016), s * (W / 2 + 0.019)));
        }
      // the beltline's chrome
      P.add(chrome, cube(u0 + 0.005, u1 - 0.005, top + 0.004, top + 0.016, s * (W / 2 - 0.014), s * (W / 2 + 0.002)));
      // the window and its frame
      // (its front edge follows the A-pillar)
      const pillar = (A1[1] - A0[1]) / (A1[0] - A0[0]);
      const wt = ROOF - 0.043;
      const wb = BELT + 0.02;
      const win: P2[] = front
        ? [
            [XF + 0.12, wb],
            [XB - 0.06, wb],
            [XB - 0.06, wt],
            [XF + 0.12 + (wt - wb) / pillar, wt],
          ]
        : [
            [XB + 0.06, wb],
            [3.53, wb],
            [3.43, wt],
            [XB + 0.06, wt],
          ];
      const pane = new Mesh(sidePane(win, s, 0.012), glass);
      pane.renderOrder = 2;
      inner.add(pane);
      for (let i = 0; i < win.length; i++) {
        const a = win[i];
        const b = win[(i + 1) % win.length];
        if (i === 0) continue; // (the bottom edge is the door's chrome)
        P.add(satin, beam(onSide(a[0], a[1], s, -0.002), onSide(b[0], b[1], s, -0.002), 0.026, 0.022, [1, 0, 0]));
      }
      if (front) {
        // the mirror: a black housing on a stalk, its glass facing back
        const my = BELT + 0.065;
        const mz = s * (W / 2 + 0.11);
        P.add(satin, beam(U(XF + 0.13, my - 0.04, s * (W / 2 - 0.01)), U(XF + 0.15, my, mz - s * 0.04), 0.04, 0.03));
        P.add(satin, cube(XF + 0.12, XF + 0.22, my - 0.05, my + 0.05, mz - s * 0.085, mz + s * 0.085));
        P.add(mirror, new PlaneGeometry(0.15, 0.08).rotateY(Math.PI / 2).translate(ux(XF + 0.222), my, mz));
      }
      doorParts.push({ g: inner, p: P });
      doors.push({
        group,
        side: s,
        front,
        open: (a: number) => {
          group.rotation.y = -s * a;
        },
      });
    }
  for (const d of doorParts) d.p.build(d.g);

  // ── the cabin: built as the sedan's, then moved and narrowed into this body ──
  // (where the rear tubs start, and their inner wall, in the cabin's own coords: nothing goes in them)
  const tubU = sh.axleR - sh.arch - 0.06 + SHAPES.sedan.L / 2 - sh.cabin.dx - sh.L / 2;
  const tubZ = (sh.track - TUB - 0.012) / sh.cabin.sz;
  useShape("sedan");
  const cabin = new Group();
  cabin.position.set(sh.cabin.dx, dy, 0);
  cabin.scale.set(1, 1, sh.cabin.sz);
  body.add(cabin);
  const I = new Parts();
  // floor, tunnel, kick plates, the footwell's carpeted firewall
  I.add(carpet, cube(XF, tubU, 0.3, 0.31, -W / 2 + DOOR_T, W / 2 - DOOR_T));
  I.add(carpet, cube(tubU, XR, 0.3, 0.31, -tubZ, tubZ));
  I.add(carpet, cube(XF, 2.95, 0.31, 0.47, -0.15, 0.15));
  I.add(carpet, cube(XF + 0.005, XF + 0.02, 0.3, 0.6, -W / 2 + DOOR_T, W / 2 - DOOR_T));
  for (const s of [1, -1]) I.add(vinyl, cube(XF, tubU, 0.3, 0.4, s * (W / 2 - DOOR_T - 0.06), s * (W / 2 - DOOR_T)));
  I.add(rubber, cube(1.76, 2.42, 0.31, 0.318, 0.2, 0.7));
  // the dashboard: dark vinyl over a walnut fascia
  I.add(
    dashTop,
    slab(
      [
        [XF, 0.955],
        [XF + 0.04, 0.975],
        [1.98, 0.958],
        [2.07, 0.918],
        [2.085, 0.86],
        [2.06, 0.66],
        [1.92, 0.58],
        [XF, 0.56],
      ],
      -W / 2 + DOOR_T + 0.005,
      W / 2 - DOOR_T - 0.005,
      0.012,
    ),
  );
  I.add(wood, cube(2.082, 2.098, 0.82, 0.862, -0.84, 0.13));
  I.add(wood, cube(2.082, 2.098, 0.82, 0.862, 0.72, 0.84));
  // vents: two in the middle, one at each end
  for (const [z0, z1] of [
    [-0.24, -0.04],
    [0.04, 0.24],
    [-0.84, -0.72],
    [0.72, 0.84],
  ]) {
    I.add(switchMat, cube(2.075, 2.1, 0.875, 0.915, z0, z1));
    for (let k = 0; k < 4; k++)
      I.add(chrome, cube(2.098, 2.104, 0.882 + k * 0.009, 0.885 + k * 0.009, z0 + 0.005, z1 - 0.005));
  }
  // the glovebox lid, its chrome button
  I.add(vinyl, cube(2.07, 2.082, 0.69, 0.8, -0.7, -0.26));
  I.add(chrome, cube(2.08, 2.09, 0.76, 0.775, -0.3, -0.27));
  // the binnacle: a visor over the VFD, its cheeks
  I.add(
    dashTop,
    slab(
      [
        [1.96, 0.952],
        [2.06, 0.99],
        [2.15, 0.982],
        [2.155, 0.967],
        [2.07, 0.958],
        [1.98, 0.945],
      ],
      0.14,
      0.71,
      0.01,
    ),
  );
  for (const z of [0.14, 0.69]) I.add(dashTop, cube(2.0, 2.15, 0.8, 0.975, z, z + 0.02));
  I.add(dashTop, cube(2.06, 2.15, 0.8, 0.815, 0.14, 0.71));
  const cluster = new Mesh(new PlaneGeometry(0.5, 0.125), clusterMat);
  cluster.position.set(ux(2.105), 0.885, 0.425);
  cluster.rotation.set(0, Math.PI / 2, 0);
  cluster.rotateX(-0.12);
  keep(cluster.geometry);
  cabin.add(cluster);
  // the centre stack: walnut, the radio-cassette, the heater's sliders
  const stackTop = U(2.08, 0.82, 0);
  const stackFoot = U(2.24, 0.48, 0);
  I.add(wood, beam(stackTop, stackFoot, 0.27, 0.025, [0, 0, 1]));
  const tilt = Math.atan2(0.16, 0.34); // how far the stack leans back
  const onStack = (t: number, out = 0.016): V3 => [
    stackTop[0] + (stackFoot[0] - stackTop[0]) * t + Math.cos(tilt) * out,
    stackTop[1] + (stackFoot[1] - stackTop[1]) * t + Math.sin(tilt) * out,
    0,
  ];
  {
    const [x, y] = onStack(0.18, 0.02);
    I.add(switchMat, new BoxGeometry(0.03, 0.07, 0.22).rotateZ(-tilt).translate(x, y, 0));
    const r = new Mesh(new PlaneGeometry(0.12, 0.03), radioMat);
    const [rx, ry] = onStack(0.15, 0.037);
    r.position.set(rx, ry, -0.02);
    r.rotation.set(0, Math.PI / 2, 0);
    r.rotateX(tilt);
    keep(r.geometry);
    cabin.add(r);
    const [cx, cy] = onStack(0.235, 0.037);
    I.add(rubber, new BoxGeometry(0.004, 0.012, 0.12).rotateZ(-tilt).translate(cx, cy, -0.02));
    for (const z of [-0.093, 0.093]) {
      const [kx, ky] = onStack(0.18, 0.048);
      I.add(chrome, new CylinderGeometry(0.013, 0.013, 0.02, 14).rotateZ(Math.PI / 2 - tilt).translate(kx, ky, z));
    }
    const h = new Mesh(new PlaneGeometry(0.22, 0.069), heaterMat);
    const [hx, hy] = onStack(0.55, 0.03);
    h.position.set(hx, hy, 0);
    h.rotation.set(0, Math.PI / 2, 0);
    h.rotateX(tilt);
    keep(h.geometry);
    cabin.add(h);
  }
  // the console: the gear lever in its boot, the handbrake, the ashtray
  I.add(vinyl, cube(2.22, 2.95, 0.47, 0.5, -0.13, 0.13));
  I.add(leather, new ConeGeometry(0.075, 0.08, 14).translate(ux(2.44), 0.535, 0));
  I.add(chrome, beam(U(2.44, 0.55, 0), U(2.41, 0.7, 0), 0.014, 0.014));
  I.add(wood, new SphereGeometry(0.03, 14, 10).translate(ux(2.405), 0.72, 0));
  I.add(wood, cube(2.26, 2.34, 0.5, 0.507, -0.07, 0.07));
  I.add(leather, beam(U(2.86, 0.5, 0), U(2.66, 0.6, 0), 0.04, 0.035));
  I.add(chrome, new CylinderGeometry(0.008, 0.008, 0.02, 8).rotateZ(Math.PI / 2).translate(ux(2.65), 0.604, 0));
  // pedals: clutch, brake, throttle
  for (const [z, y0, y1] of [
    [0.57, 0.4, 0.47],
    [0.43, 0.4, 0.47],
    [0.29, 0.37, 0.5],
  ]) {
    I.add(rubber, cube(1.82, 1.84, y0, y1, z - 0.04, z + 0.04));
    I.add(satin, beam(U(1.83, y1, z), U(1.76, 0.66, z), 0.02, 0.012));
  }
  // the seats: two cloth buckets, the bench behind
  const seats: Sedan["seats"] = [];
  // (the 4x4's are narrower on the outside: its rear tubs are beside their backs)
  const outer = off ? 0.18 : 0.26;
  const across = (z: number, s: number, inn: number, out: number): [number, number] =>
    s > 0 ? [z - inn, z + out] : [z - out, z + inn];
  for (const s of [1, -1] as const) {
    const z = s * 0.42;
    I.add(
      cloth,
      slab(
        [
          [2.4, 0.36],
          [2.4, 0.45],
          [2.45, 0.495],
          [2.9, 0.455],
          [2.94, 0.4],
          [2.9, 0.36],
        ],
        ...across(z, s, 0.26, outer),
        0.035,
      ),
    );
    // the back, reclined, with side bolsters
    I.add(
      cloth,
      slab(
        [
          [2.88, 0.43],
          [3.12, 1.08],
          [3.22, 1.07],
          [3.02, 0.4],
        ],
        ...across(z, s, 0.25, outer - 0.01),
        0.035,
      ),
    );
    for (const e of [-1, 1])
      I.add(
        vinyl,
        slab(
          [
            [2.86, 0.45],
            [3.06, 1.0],
            [3.12, 0.99],
            [2.94, 0.42],
          ],
          z + e * (e === s && off ? 0.15 : 0.25) - 0.05,
          z + e * (e === s && off ? 0.15 : 0.25) + 0.05,
          0.025,
        ),
      );
    // the headrest on two chrome posts
    I.add(
      cloth,
      slab(
        [
          [3.14, 1.15],
          [3.2, 1.32],
          [3.29, 1.31],
          [3.23, 1.14],
        ],
        z - 0.13,
        z + 0.13,
        0.03,
      ),
    );
    for (const e of [-1, 1])
      I.add(chrome, beam(U(3.15, 1.06, z + e * 0.08), U(3.18, 1.16, z + e * 0.08), 0.012, 0.012));
    // the seat's runners
    I.add(satin, cube(2.45, 2.9, 0.31, 0.36, z - 0.22, z + 0.22));
    seats.push({ hip: new Vector3(ux(2.8), 0.47, z), side: s, front: true });
    // the belt hanging from the B-pillar, unbuckled
    I.add(strap, beam(onSide(XB + 0.02, 1.42, s, 0.08), U(2.96, 0.55, s * 0.74), 0.045, 0.004, [1, 0, 0]));
  }
  // the rear bench: between the tubs (wider in front of them)
  const cushion: P2[] = [
    [3.2, 0.36],
    [3.2, 0.44],
    [3.25, 0.48],
    [3.62, 0.46],
    [3.66, 0.36],
  ];
  if (tubU > 3.25) I.add(cloth, slab(clipU(cushion, 3.2, tubU), -0.78, 0.78, 0.035));
  I.add(cloth, slab(clipU(cushion, Math.max(3.2, tubU), 3.66), -tubZ, tubZ, 0.035));
  I.add(
    cloth,
    slab(
      [
        [3.6, 0.46],
        [3.7, 1.0],
        [3.76, 0.99],
        [3.73, 0.43],
      ],
      -tubZ,
      tubZ,
      0.03,
    ),
  );
  for (const s of [1, -1] as const) seats.push({ hip: new Vector3(ux(3.47), 0.46, s * 0.45), side: s, front: false });
  // the parcel shelf with its speakers
  I.add(vinyl, cube(3.74, 3.97, 0.955, 0.975, -0.82, 0.82));
  for (const s of [1, -1])
    I.add(switchMat, new CircleGeometry(0.06, 16).rotateX(-Math.PI / 2).translate(ux(3.86), 0.977, s * 0.5));
  // the headliner, the visors, the dome lamp, the rear-view mirror
  I.add(
    liner,
    new PlaneGeometry(R1[0] - A1[0] + 0.06, 2 * (HR - 0.01))
      .rotateX(Math.PI / 2)
      .translate(ux((A1[0] + R1[0]) / 2), 1.467, 0),
  );
  for (const s of [1, -1]) I.add(cream, cube(2.33, 2.47, 1.445, 1.463, s * 0.08, s * 0.62));
  I.add(domeMat, cube(2.92, 3.04, 1.451, 1.466, -0.07, 0.07));
  I.add(satin, beam(U(2.34, 1.485, 0), U(2.32, 1.38, 0), 0.02, 0.02));
  I.add(satin, cube(2.3, 2.34, 1.335, 1.4, -0.13, 0.13));
  // the rear-view mirror's glass: its own mesh, so the game can show the road behind on it
  const rearAt = new Vector3(ux(2.343), 1.368, 0);
  const rearView = new Mesh(keep(new PlaneGeometry(0.235, 0.05).rotateY(Math.PI / 2)), mirror);
  rearView.position.copy(rearAt);
  cabin.add(rearView);
  I.build(cabin);
  B.build(body);

  // the pine tree on its string, under the mirror
  const freshener = new Group();
  freshener.position.set(ux(2.32), 1.335, 0.06);
  const pineTex = keep(T.freshener());
  const pine = new Mesh(
    new PlaneGeometry(0.06, 0.09),
    keep(new MeshStandardMaterial({ map: pineTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.9 })),
  );
  pine.rotation.y = Math.PI / 2 + 0.4;
  pine.position.y = -0.11;
  keep(pine.geometry);
  const string = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.07, 4).translate(0, -0.035, 0), strap);
  keep(string.geometry);
  freshener.add(string, pine);
  cabin.add(freshener);

  // ── the steering wheel ──
  const hub = new Vector3(ux(2.44), 0.935, 0.425);
  const axis = new Vector3(0.2, 0.085, 0).normalize(); // up the column, towards the driver
  const upW = new Vector3(-axis.y, axis.x, 0);
  const rightW = new Vector3().crossVectors(upW, axis); // the driver's right (−z)
  const column = new Group();
  column.position.copy(hub);
  column.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(rightW, upW, axis));
  const steering = new Group();
  column.add(steering);
  cabin.add(column);
  {
    const P = new Parts();
    const RIM = 0.19;
    P.add(leather, new TorusGeometry(RIM, 0.016, 10, 56));
    // spokes: two out to 3 and 9 o'clock (a little down), two down to 5 and 7; the top stays open
    for (const a of [-1.75, 1.75, -2.55, 2.55]) {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      P.add(satin, beam([sn * 0.055, c * 0.055, 0.01], [sn * (RIM - 0.01), c * (RIM - 0.01), 0], 0.03, 0.012));
    }
    // the padded hub and its emblem
    P.add(leather, new CylinderGeometry(0.07, 0.078, 0.05, 20).rotateX(Math.PI / 2).translate(0, -0.01, 0.015));
    P.add(chrome, new CircleGeometry(0.018, 16).translate(0, -0.01, 0.0405));
    P.build(steering);
    // the column's shroud and the stalks
    const S = new Parts();
    S.add(switchMat, new CylinderGeometry(0.04, 0.052, 0.36, 12).rotateX(Math.PI / 2).translate(0, 0, -0.2));
    for (const e of [-1, 1])
      S.add(switchMat, beam([0, 0.0, -0.06], [e * 0.15, -0.015, -0.06], 0.012, 0.012, [0, 0, 1]));
    S.build(column);
  }
  const steerTmp = new Vector3();
  const rim = (phi: number, out = new Vector3()) => {
    const a = phi + steering.rotation.z * -1;
    steerTmp.set(Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0);
    column.updateMatrix();
    cabin.updateMatrix();
    return out.copy(steerTmp).applyMatrix4(column.matrix).applyMatrix4(cabin.matrix);
  };
  // the seats and the driver's eyes, from the cabin's frame to the body's
  const eye = new Vector3(ux(2.86), 1.3, 0.42);
  for (const p of [...seats.map((x) => x.hip), eye]) {
    p.x += cabin.position.x;
    p.y += dy;
    p.z *= sh.cabin.sz;
  }
  useShape(sh.kind);

  // ── the wipers ──
  const slope = new Vector3(screen.u1 - screen.u0, screen.y1 - screen.y0, 0).normalize();
  const nrm = new Vector3(0, 0, 1).cross(slope); // out of the glass
  const wipers: Wiper[] = [];
  const wk = screen.hw0 / 0.82; // (a narrower windscreen, shorter wipers)
  for (const [pz, len, blade, sweep, lift] of [
    [0.36 * wk, 0.66 * wk, 0.56 * wk, 1.12, 0.0],
    [-0.18 * wk, 0.62 * wk, 0.52 * wk, 1.18, 0.02],
  ]) {
    const g = new Group();
    g.position
      .set(ux(screen.u0), screen.y0, pz)
      .addScaledVector(slope, lift - 0.015)
      .addScaledVector(nrm, 0.012);
    g.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, 1), slope, nrm));
    const arm = new Group();
    g.add(arm);
    const P = new Parts();
    P.add(satin, new CylinderGeometry(0.018, 0.018, 0.02, 10).rotateX(Math.PI / 2));
    P.add(satin, beam([0, 0, 0.012], [len, 0, 0.012], 0.012, 0.01, [0, 1, 0]));
    P.add(rubber, beam([len - blade, 0, 0.004], [len, 0, 0.004], 0.01, 0.014, [0, 1, 0]));
    P.add(satin, beam([len - blade + 0.03, 0, 0.012], [len - 0.03, 0, 0.012], 0.008, 0.01, [0, 1, 0]));
    P.build(arm, false);
    arm.rotation.z = Math.PI;
    body.add(g);
    wipers.push({ arm, park: Math.PI, sweep, pivot: pz, len, blade });
  }

  // ── snow lying on it ──
  const snow: Mesh[] = [];
  const sk = o.snowy ?? 0;
  if (sk > 0) {
    const add = (g: BufferGeometry) => {
      const m = new Mesh(g, snowMat);
      m.castShadow = true;
      m.receiveShadow = true;
      keep(g);
      body.add(m);
      snow.push(m);
    };
    add(
      slab(
        [
          [sh.A1[0] + 0.11, ROOF + 0.013],
          [sh.R1[0] - 0.06, ROOF + 0.015],
          [sh.R1[0] - 0.09, ROOF + 0.015 + 0.09 * sk],
          [sh.A1[0] + 0.19, ROOF + 0.017 + 0.085 * sk],
        ],
        -HR + 0.06,
        HR - 0.06,
        0.035,
      ),
    );
    const hood: P2[] = [];
    for (let u = 0.25; u <= XF - 0.14; u += 0.1) hood.push([u, topY(u) + 0.004]);
    for (let u = XF - 0.14; u >= 0.25; u -= 0.1)
      hood.push([u, topY(u) + 0.004 + 0.055 * sk * Math.max(0, Math.sin(((u - 0.25) / (XF - 0.39)) * Math.PI)) ** 0.4]);
    add(slab(hood, -W / 2 + 0.13, W / 2 - 0.13, 0.02));
    if (!off)
      add(
        slab(
          [
            [4.05, 0.975],
            [4.8, 0.966],
            [4.76, 0.966 + 0.05 * sk],
            [4.1, 0.975 + 0.055 * sk],
          ],
          -0.78,
          0.78,
          0.02,
        ),
      );
    add(
      beam(
        U(screen.u0 + 0.02, screen.y0 + 0.02, -W / 2 + 0.13),
        U(screen.u0 + 0.02, screen.y0 + 0.02, W / 2 - 0.13),
        0.09,
        0.05 * sk + 0.01,
        [1, 0, 0],
      ),
    );
  }

  // ── the wheels ──
  const wheels: Wheel[] = [];
  const treadTex = keep(T.tread());
  treadTex.repeat.set(1, 1);
  const tyre = keep(new MeshStandardMaterial({ map: treadTex, roughness: 0.92, color: "#ffffff" }));
  const capTex = keep(T.hubcap());
  const cap = keep(new MeshStandardMaterial({ map: capTex, roughness: 0.25, metalness: 0.85, envMapIntensity: 1.1 }));
  const steel = keep(new MeshStandardMaterial({ color: "#3b3e42", roughness: 0.5, metalness: 0.6 }));
  exterior.push(cap);
  const R = sh.wheelR;
  const rk = R / 0.317;
  if (off) cap.color.set("#5a5e62"); // (plain steel wheels)
  const profile: Vector2[] = [
    [0.195, -0.094],
    [0.235, -0.104],
    [0.275, -0.106],
    [0.302, -0.098],
    [0.317, -0.08],
    [0.317, -0.04],
    [0.317, 0],
    [0.317, 0.04],
    [0.317, 0.08],
    [0.302, 0.098],
    [0.275, 0.106],
    [0.235, 0.104],
    [0.195, 0.094],
  ].map(([r, y]) => new Vector2(r * rk, y));
  const tyreGeo = keep(new LatheGeometry(profile, 44).rotateX(Math.PI / 2));
  for (const front of [true, false])
    for (const s of [1, -1] as const) {
      const steer = new Group();
      const rest = new Vector3(ux(front ? sh.axleF : sh.axleR), R, s * sh.track);
      steer.position.copy(rest);
      const spin = new Group();
      steer.add(spin);
      const t = new Mesh(tyreGeo, tyre);
      t.castShadow = true;
      t.receiveShadow = true;
      const rimG = new Mesh(
        keep(new CylinderGeometry(0.196 * rk, 0.196 * rk, 0.17, 24, 1, true).rotateX(Math.PI / 2)),
        steel,
      );
      const c = new Mesh(keep(new CircleGeometry(0.19 * rk, 40)), cap);
      c.position.z = s * 0.09;
      if (s < 0) c.rotation.y = Math.PI;
      const back = new Mesh(keep(new CircleGeometry(0.196 * rk, 24)), steel);
      back.position.z = -s * 0.04;
      if (s > 0) back.rotation.y = Math.PI;
      spin.add(t, rimG, c, back);
      root.add(steer);
      wheels.push({ steer, spin, front, side: s, rest });
    }

  // ── state ──
  const setSteer = (road: number) => {
    for (const w of wheels) if (w.front) w.steer.rotation.y = road;
    steering.rotation.z = road * SEDAN.steerRatio; // (anticlockwise as the driver sees it: left)
  };
  const setLights = (l: Lights) => {
    const head = l.beams === "off" ? 0 : l.beams === "low" ? 2.2 : 3.4;
    headLens.emissiveIntensity = head;
    const tl = l.tail || l.beams !== "off" ? 0.9 : 0;
    red.emissiveIntensity = Math.max(tl, l.brake * 3.2);
    reverse.emissiveIntensity = l.reverse ? 2.2 : 0;
    amberL.emissiveIntensity = l.ind === 1 || l.hazard ? 2.6 : 0;
    amberR.emissiveIntensity = l.ind === -1 || l.hazard ? 2.6 : 0;
    plateMat.emissiveIntensity = tl ? 0.25 : 0;
    domeMat.emissiveIntensity = l.dome ? 1.4 : 0;
    const d = Math.max(0, Math.min(1, l.dash));
    clusterMat.color.setScalar(0.35 + 0.65 * d);
    radioMat.color.setScalar(0.35 + 0.65 * d);
    heaterMat.color.setScalar(0.25 + 0.75 * d);
  };
  const setCluster = (c: Cluster) => {
    drawCluster(clusterCanvas, c);
    clusterTex.needsUpdate = true;
  };
  const setRadio = (band: "FM" | "AM" | "TAPE", f: number, preset: number) => {
    drawRadio(radioCanvas, band, f, preset);
    radioTex.needsUpdate = true;
  };
  const setScreenSnow = (t: Texture | null) => {
    snowScreenMat.map = t;
    snowScreenMat.emissiveMap = t;
    snowScreenMat.needsUpdate = true;
    snowScreen.visible = !!t;
  };
  const setEnv = (t: Texture | null) => {
    for (const m of [...exterior, ...interior, red, amberL, amberR, reverse, plateMat]) {
      m.envMap = t;
      m.needsUpdate = true;
    }
  };
  setLights({ beams: "off", tail: false, brake: 0, reverse: false, ind: 0, dash: 0, dome: false });
  setCluster({
    kmh: 0,
    rpm: 0,
    gear: "N",
    fuel: 0.7,
    temp: 0.1,
    clock: "12:00",
    outside: -8,
    odo: 87412,
    beams: "off",
    ind: 0,
    hand: true,
    helps: false,
  });
  setRadio("FM", 98.7, 3);

  return {
    root,
    body,
    wheels,
    doors,
    steering,
    wipers,
    freshener,
    snow,
    seats,
    eye,
    dims: { L, axleF: sh.axleF, kind: sh.kind },
    lamps: { head, tail, exhaust },
    rearView,
    screen,
    rim,
    setSteer,
    setLights,
    setCluster,
    setRadio,
    setScreenSnow,
    setEnv,
    dispose: () => {
      for (const d of disposables) d.dispose();
      root.traverse((x) => {
        const m = x as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}

/** A gently bowed pane between a lower edge (u0, y0, ±h0) and an upper one (u1, y1, ±h1), its
 *  middle pushed out by `bow` (outwards: ahead of a windscreen, behind a rear window); `lift`
 *  off it the same way. UVs: z across (−h0..h0 → 0..1) and up the glass (0..1), the frame of
 *  the windscreen's snow texture. */
function bowed(
  u0: number,
  y0: number,
  h0: number,
  u1: number,
  y1: number,
  h1: number,
  bow: number,
  lift = 0,
): BufferGeometry {
  const nu = 12;
  const nv = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const dy = y1 - y0;
  const du = u1 - u0;
  const l = Math.hypot(du, dy);
  const nx = -dy / l; // the pane's outward normal in (u, y)
  const ny = du / l;
  for (let j = 0; j <= nv; j++) {
    const t = j / nv;
    const u = u0 + du * t;
    const y = y0 + dy * t;
    const h = h0 + (h1 - h0) * t;
    for (let i = 0; i <= nu; i++) {
      const k = i / nu;
      const z = -h + 2 * h * k;
      const b = bow * (1 - (2 * k - 1) ** 2) + lift;
      pos.push(ux(u) + nx * b, y + ny * b, z);
      uv.push((z + h0) / (2 * h0), t);
    }
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
    }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
