import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from "three";

// The stairwell, made properly (docs/plan/26-floor-transitions.md, phase 0):
// shared stairs.ts's switchback (4 × 6 tiles, the door on v = 0), in tiles,
// three.js axes — x = u, z = v, y up; one floor's flights, STOREY high.
//
//   v 0..1  the landing by the door        v 1..4  flight A (u 2..4), up
//   v 4..6  the half landing               v 4..1  flight B (u 0..2), up
//
// Precast concrete flights on a sloped slab (its soffit seen from below), each
// tread with a dark anti-slip nosing; a steel balustrade along the open side of
// both flights with one handrail that turns round the end at the landing; a
// wall rail; painted block walls; the floor's number stencilled big at the
// landing; a bulkhead light; a fire door at the entry, its leaf swinging.

export const STOREY = 3.5;
const N = 9; // steps a flight
const RISE = STOREY / 2 / N;
const RUN = 3 / N;
const RAIL_H = 0.95;

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
function tex(c: HTMLCanvasElement, rx = 1, ry = 1): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// fair-faced concrete: soft blotches, a few pores
function concrete(base: string, seed: number): CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "40,40,40"},${r() * 0.05})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 2 + r() * 22, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = "rgba(30,30,30,0.35)";
    g.fillRect(r() * S, r() * S, 1 + r(), 1 + r());
  }
  return tex(c);
}

// painted concrete block, running bond (a block 0.4 × 0.2 tiles)
function blocks(): CanvasTexture {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(21);
  g.fillStyle = "#e9e6df";
  g.fillRect(0, 0, S, S);
  const bw = S / 4;
  const bh = S / 8;
  for (let row = 0; row < 8; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const y = row * bh;
      const l = 228 + Math.floor(r() * 14);
      g.fillStyle = `rgb(${l},${l - 2},${l - 7})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  g.fillStyle = "rgba(0,0,0,0.05)";
  for (let i = 0; i < 400; i++) g.fillRect(r() * S, r() * S, 1.5, 1.5);
  return tex(c, 1, 1);
}

// the floor's number, stencilled (and a strip: "FLOOR 3 · EXIT ↓")
function stencil(text: string, sub: string): CanvasTexture {
  const { c, g } = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = "#1f2a33";
  g.font = '700 330px "Space Grotesk", Inter, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(text, 256, 360);
  // the stencil's bridges
  g.fillStyle = "rgba(0,0,0,0)";
  g.globalCompositeOperation = "destination-out";
  g.fillRect(0, 200, 512, 10);
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#ffb347";
  g.fillRect(96, 400, 320, 40);
  g.fillStyle = "#1f2a33";
  g.font = '600 30px "Share Tech Mono", monospace';
  g.fillText(sub, 256, 431);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface StairMats {
  concrete: MeshStandardMaterial;
  soffit: MeshStandardMaterial;
  nosing: MeshStandardMaterial;
  rail: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  door: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  bulb: MeshBasicMaterial;
}
let mats: StairMats | null = null;
export function stairMats(): StairMats {
  if (mats) return mats;
  mats = {
    concrete: new MeshStandardMaterial({ map: concrete("#b9b6b0", 4), roughness: 0.82 }),
    soffit: new MeshStandardMaterial({ map: concrete("#c9c6c0", 8), roughness: 0.9 }),
    nosing: new MeshStandardMaterial({ color: "#2b2d2f", roughness: 0.65, metalness: 0.3 }),
    rail: new MeshStandardMaterial({ color: "#26292c", roughness: 0.35, metalness: 0.7 }),
    wall: new MeshStandardMaterial({ map: blocks(), roughness: 0.85 }),
    door: new MeshStandardMaterial({ color: "#6e3a2f", roughness: 0.5, metalness: 0.2 }),
    frame: new MeshStandardMaterial({ color: "#3a3d40", roughness: 0.4, metalness: 0.6 }),
    glass: new MeshStandardMaterial({ color: "#2c3439", roughness: 0.05, metalness: 0.4 }),
    bulb: new MeshBasicMaterial({ color: "#fff4dc", toneMapped: false }),
  };
  return mats;
}

const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// a slab between two points along z, `t` thick under its top line (the soffit)
function slopedSlab(x0: number, x1: number, z0: number, y0: number, z1: number, y1: number, t: number, mat: Material) {
  const g = new BufferGeometry();
  const P = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z1],
    [x0, y1, z1],
    [x0, y0 - t, z0],
    [x1, y0 - t, z0],
    [x1, y1 - t, z1],
    [x0, y1 - t, z1],
  ];
  const quads = [
    [4, 5, 6, 7], // the soffit (seen from below)
    [0, 4, 7, 3],
    [1, 2, 6, 5],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const [a, b, c, d] of quads)
    for (const i of [a, b, c, a, c, d]) {
      pos.push(...P[i]);
      uv.push(P[i][0] * 0.5, (P[i][2] + P[i][1]) * 0.5);
    }
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Stairwell {
  readonly root = new Group();
  readonly light: PointLight;
  private door: Group;

  /** `floor`: the number at its landing; `walls`: the well's walls drawn (a
   *  cut-away view leaves the near ones out); `storeys`: how many of them. */
  constructor(opts: { floor?: string; next?: string; walls?: ("w" | "e" | "s")[]; storeys?: number } = {}) {
    const m = stairMats();
    const storeys = opts.storeys ?? 1;
    for (let k = 0; k < storeys; k++) this.flights(k * STOREY, m, k === 0);
    // the well's walls: block, two storeys of them
    const H = STOREY * storeys + 0.2;
    const walls = opts.walls ?? ["w", "e", "s"];
    if (walls.includes("w")) this.root.add(box(0.12, H, 6, m.wall, -0.06, H / 2, 3));
    if (walls.includes("e")) this.root.add(box(0.12, H, 6, m.wall, 4.06, H / 2, 3));
    if (walls.includes("s")) this.root.add(box(4.24, H, 0.12, m.wall, 2, H / 2, 6.06));
    // the floor's number at the half landing's wall, facing the climb
    if (opts.floor) {
      const sign = new Mesh(
        new PlaneGeometry(1.0, 1.0),
        new MeshBasicMaterial({ map: stencil(opts.floor, opts.next ?? `FLOOR ${opts.floor}`), transparent: true }),
      );
      sign.position.set(2, STOREY / 2 + 1.25, 5.99);
      sign.rotation.y = Math.PI;
      this.root.add(sign);
    }
    // a bulkhead over the half landing, its light
    const lamp = box(0.34, 0.18, 0.08, m.frame, 2, STOREY / 2 + 2.35, 5.95);
    const lens = box(0.28, 0.12, 0.02, m.bulb, 2, STOREY / 2 + 2.35, 5.905);
    this.root.add(lamp, lens);
    this.light = new PointLight("#fff0d8", 4, 7, 1.5);
    this.light.position.set(2, STOREY / 2 + 2.1, 5.5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -0.001;
    this.root.add(this.light);
    // the fire door into the well (its west half, u 0..2 on v = 0), hinged on the west
    this.door = new Group();
    this.door.position.set(0.1, 0, 0);
    const leaf = box(1.0, 2.1, 0.05, m.door, 0.5, 1.05, 0);
    const vision = box(0.18, 0.7, 0.054, m.glass, 0.75, 1.5, 0);
    const bar = box(0.7, 0.04, 0.05, m.frame, 0.52, 1.0, 0.06);
    this.door.add(leaf, vision, bar);
    this.root.add(this.door);
    this.root.add(box(0.06, 2.16, 0.12, m.frame, 0.07, 1.08, 0));
    this.root.add(box(0.06, 2.16, 0.12, m.frame, 1.13, 1.08, 0));
    this.root.add(box(1.12, 0.06, 0.12, m.frame, 0.6, 2.13, 0));
    this.setDoor(0);
  }

  private flights(y0: number, m: StairMats, first: boolean) {
    // flight A: solid steps from the floor (u 2..4, v 1 → 4)
    for (let i = 0; i < N; i++) {
      const top = y0 + RISE * (i + 1);
      const z = 1 + RUN * i;
      const h = first ? top - y0 : RISE * 2;
      this.root.add(box(1.9, h, RUN + 0.005, m.concrete, 3, top - h / 2, z + RUN / 2));
      this.root.add(box(1.9, 0.012, 0.05, m.nosing, 3, top + 0.006, z + 0.025));
    }
    if (!first) this.root.add(slopedSlab(2.05, 3.95, 1, y0 - 0.02, 4, y0 + STOREY / 2 - RISE, 0.2, m.soffit));
    // the half landing (all across), its slab and edge
    const L = y0 + STOREY / 2;
    this.root.add(box(4, 0.22, 2, m.concrete, 2, L - 0.11, 5));
    this.root.add(box(4, 0.012, 0.05, m.nosing, 2, L + 0.006, 4.025));
    // flight B: treads on a sloped slab (u 0..2, v 4 → 1), its soffit over flight A's door side
    for (let i = 0; i < N; i++) {
      const top = L + RISE * (i + 1);
      const z = 4 - RUN * (i + 1);
      this.root.add(box(1.9, RISE + 0.02, RUN + 0.005, m.concrete, 1, top - (RISE + 0.02) / 2, z + RUN / 2));
      this.root.add(box(1.9, 0.012, 0.05, m.nosing, 1, top + 0.006, z + RUN - 0.025));
    }
    this.root.add(slopedSlab(0.05, 1.95, 4, L - 0.02, 1, y0 + STOREY - RISE - 0.02, 0.2, m.soffit));
    // the spine between the flights: a slim upstand, and the balustrade on it
    // with one handrail rising with A, round the end at the landing, up with B
    const pts: Vector3[] = [];
    const railAt = (z: number, y: number) => new Vector3(2, y + RAIL_H, z);
    pts.push(railAt(1.0, y0 + 0.05));
    pts.push(railAt(3.95, L - RISE * 0.5));
    pts.push(new Vector3(2.12, L + RAIL_H, 4.2));
    pts.push(new Vector3(2.0, L + RAIL_H, 4.32));
    pts.push(new Vector3(1.88, L + RAIL_H, 4.2));
    pts.push(railAt(3.95, L + RISE * 0.5).setX(1.92));
    pts.push(railAt(1.05, y0 + STOREY - RISE).setX(1.92));
    const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.1);
    const rail = new Mesh(new TubeGeometry(curve, 120, 0.024, 10, false), m.rail);
    rail.castShadow = true;
    this.root.add(rail);
    // balusters: flat bars every 12 cm along both flights
    for (let z = 1.05; z < 4; z += 0.12) {
      const ya = y0 + ((z - 1) / 3) * (STOREY / 2);
      this.root.add(box(0.012, RAIL_H, 0.035, m.rail, 2.07, ya + RAIL_H / 2 + 0.02, z));
      const yb = L + ((4 - z) / 3) * (STOREY / 2);
      this.root.add(box(0.012, RAIL_H, 0.035, m.rail, 1.93, yb + RAIL_H / 2 + 0.02, z));
    }
    // a wall rail on each flight's outer side, on brackets
    const wallRail = (x: number, za: number, ya: number, zb: number, yb: number) => {
      const len = Math.hypot(zb - za, yb - ya);
      const r = new Mesh(new CylinderGeometry(0.02, 0.02, len, 10), m.rail);
      r.position.set(x, (ya + yb) / 2 + RAIL_H - 0.05, (za + zb) / 2);
      r.rotation.x = Math.atan2(zb - za, yb - ya);
      this.root.add(r);
      for (const k of [0.15, 0.85]) {
        this.root.add(
          box(
            0.06,
            0.02,
            0.02,
            m.rail,
            x + (x < 2 ? -0.03 : 0.03),
            ya + (yb - ya) * k + RAIL_H - 0.07,
            za + (zb - za) * k,
          ),
        );
      }
    };
    wallRail(3.92, 1, y0, 4, L);
    wallRail(0.08, 4, L, 1, y0 + STOREY);
  }

  /** The fire door: 0 shut … 1 open (it swings into the well). */
  setDoor(open: number) {
    const k = Math.max(0, Math.min(1, open));
    this.door.rotation.y = -k * 1.45;
  }
}
