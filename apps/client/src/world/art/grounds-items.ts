import type { CatalogEntry, WorldObjectDef } from "@yutopia/shared";
import type * as GroundsModule from "@yutopia/shared/grounds";
import type { ItemGen } from "./items";
import type { Face, Mat, Sketch, V3 } from "./items/kit";

// The Grounds' things in the iso view (docs/plan/27-the-grounds.md, phase 2):
// the other buildings, the lamps, the fence, the gate's barrier, the tower,
// the statue, the bench, the signs — drawn as items (the iso kit's inked
// boxes and cones), registered at run time as kinds nobody builds or stores
// (`gr_…`), and set round the camera by art/grounds-iso.ts. The 3D view draws
// the same things from the same data (tp/grounds3d.ts).

type G = typeof GroundsModule;
type Props = Record<string, unknown>;
const P = 39.19; // px a tile up

/** A thing on the Grounds, in the building's coords (x, y: its footprint's corner). */
export interface Thing extends WorldObjectDef {
  /** where its middle is, for the ground's height */
  cx: number;
  cz: number;
}

// ── materials ───────────────────────────────────────────────────────────────
const mat = (c: string, top?: string, left?: string, right?: string): Mat => ({ c, top, left, right });
const SNOW = mat("#e9eef2", "#f7fafc", "#e3e9ee", "#d2dae1");
const CONCRETE = mat("#c9c5bc", "#d8d4cb", "#c2beb5", "#aeaaa2");
const STEEL = mat("#5d6268", "#7a7f85", "#6a6f75", "#52575c");
const DARK = mat("#2a2e33", "#3a3f45", "#33383d", "#24282c");
const ROOF = mat("#3a3f45", "#4a5058");
const WOOD = mat("#6b5442", "#7d6450", "#6f5845", "#5a4636");
const RED_BOARD = mat("#6e2a22", "#7d342a", "#73302a", "#5a2119");
const BRONZE = mat("#4a4338", "#5d554a", "#514a3e", "#3b352c");
const GLASS = "#2c3a44";
const LIT = "#ffcf8a";
const BRICKS = ["#7b3b2c", "#6c4436", "#8a5a42", "#5b4a44"];
const SIDINGS = ["#c9c2b2", "#8d9a9c", "#b9a98b", "#d8d2c4"];
const shade = (hex: string, k: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * k)))
      .toString(16)
      .padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
const wallMat = (c: string): Mat => mat(c, shade(c, 1.12), shade(c, 1.0), shade(c, 0.82));
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fr(f: Face, plane: number, u0: number, u1: number, z0: number, z1: number): V3[] {
  return f === "s" || f === "n"
    ? [
        [u0, plane, z1],
        [u1, plane, z1],
        [u1, plane, z0],
        [u0, plane, z0],
      ]
    : [
        [plane, u0, z1],
        [plane, u1, z1],
        [plane, u1, z0],
        [plane, u0, z0],
      ];
}

// ── buildings ───────────────────────────────────────────────────────────────
interface Bld {
  kind: string;
  w: number;
  h: number;
  floors: number;
  face: "n" | "s" | "e" | "w";
  sign?: string;
  vacant?: boolean;
  seed: number;
}
// a row of windows on a face (s: along x at y = h; e: along y at x = w), some lit
function windows(s: Sketch, b: Bld, f: "s" | "e", z0: number, z1: number, every: number, lit: number) {
  const r = rng(b.seed * 31 + (f === "s" ? 1 : 2));
  const len = f === "s" ? b.w : b.h;
  const plane = f === "s" ? b.h : b.w;
  const n = Math.max(1, Math.floor(len / every));
  s.shape({ x: 0, y: 0, w: b.w, d: b.h, z: z0, h: z1 - z0 }, (d) => {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) * len) / n;
      const ww = Math.min(1.3, every * 0.42);
      const on = !b.vacant && r() < lit;
      d.poly(f, fr(f, plane, u - ww / 2, u + ww / 2, z0, z1), on ? LIT : GLASS, {
        stroke: "#1b1f22",
        sw: 0.6,
        glow: on,
      });
    }
  });
}
// a pitched roof over the footprint (ridge along x or y), snow on it
function pitched(s: Sketch, b: Bld, z: number, rise: number, alongX: boolean, over = 0.4) {
  const x0 = -over;
  const y0 = -over;
  const x1 = b.w + over;
  const y1 = b.h + over;
  s.shape({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, z, h: rise }, (d) => {
    const xm = b.w / 2;
    const ym = b.h / 2;
    const poly = (pts: V3[], fill: string) => {
      const p = pts.map(([x, y, zz]) => d.m(x, y, zz));
      d.raw(
        `<path d="M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="${fill}" stroke="#151819" stroke-width="1" stroke-linejoin="round"/>`,
      );
    };
    if (alongX) {
      // the far slope first, then the gable end, then the near slope (snow on both)
      poly(
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        "#e3e9ee",
      );
      poly(
        [
          [b.w, 0, z],
          [b.w, b.h, z],
          [b.w, ym, z + rise],
        ],
        "#b8b0a2",
      );
      poly(
        [
          [x0, y1, z],
          [x1, y1, z],
          [x1, ym, z + rise],
          [x0, ym, z + rise],
        ],
        "#f4f7fa",
      );
    } else {
      poly(
        [
          [x0, y0, z],
          [x0, y1, z],
          [xm, y1, z + rise],
          [xm, y0, z + rise],
        ],
        "#e3e9ee",
      );
      poly(
        [
          [0, b.h, z],
          [b.w, b.h, z],
          [xm, b.h, z + rise],
        ],
        "#b8b0a2",
      );
      poly(
        [
          [x1, y0, z],
          [x1, y1, z],
          [xm, y1, z + rise],
          [xm, y0, z + rise],
        ],
        "#f4f7fa",
      );
    }
  });
}
function shop(s: Sketch, b: Bld) {
  const r = rng(b.seed);
  const fh = 3.8 * P;
  const H = b.floors * fh + 0.8 * P;
  const brick = r() < 0.6;
  const c = brick ? BRICKS[Math.floor(r() * 4)] : SIDINGS[Math.floor(r() * 4)];
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat(c) });
  // cornice and the snow on the roof
  s.box({ x: -0.25, y: -0.25, w: b.w + 0.5, d: b.h + 0.5, z: H - 0.5 * P, h: 0.5 * P, mat: mat("#8c857a", "#9d968b") });
  s.box({ x: -0.2, y: -0.2, w: b.w + 0.4, d: b.h + 0.4, z: H, h: 0.3 * P, mat: SNOW });
  // the visible faces: a shopfront where it faces (s or e), upstairs windows
  for (const f of ["s", "e"] as const) {
    const front = (b.face === "s" && f === "s") || (b.face === "e" && f === "e");
    if (front && !b.vacant) {
      const len = f === "s" ? b.w : b.h;
      const plane = f === "s" ? b.h : b.w;
      s.shape({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: 3.4 * P }, (d) => {
        d.poly(f, fr(f, plane, 0.6, len - 0.6, 0.6 * P, 3.0 * P), b.sign === "BAR" ? "#e08a50" : "#f0c886", {
          stroke: "#23292e",
          sw: 1.2,
          glow: true,
        });
        d.poly(f, fr(f, plane, len / 2 - 0.8, len / 2 + 0.8, 0, 2.6 * P), "#23292e");
      });
      // the awning
      const aw = b.sign === "BAR" ? "#5a1e1e" : ["#2f4a3b", "#6b2430", "#2c3e55"][Math.floor(r() * 3)];
      if (f === "s") s.box({ x: 0.6, y: b.h, w: b.w - 1.2, d: 1.4, z: 3.0 * P, h: 0.5 * P, mat: mat(aw, "#f4f7fa") });
      else s.box({ x: b.w, y: 0.6, w: 1.4, d: b.h - 1.2, z: 3.0 * P, h: 0.5 * P, mat: mat(aw, "#f4f7fa") });
    } else if (f === "s" || f === "e") windows(s, b, f, 0.9 * P, 2.6 * P, 3.4, 0.3);
    for (let k = 1; k < b.floors; k++) windows(s, b, f, k * fh + 0.9 * P, k * fh + 2.7 * P, 3.4, 0.4);
  }
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function house(s: Sketch, b: Bld) {
  const H = 6.4 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat("#d8d2c4") });
  windows(s, b, "s", 0.9 * P, 2.4 * P, 3.2, 0.35);
  windows(s, b, "e", 0.9 * P, 2.4 * P, 3.2, 0.35);
  windows(s, b, "s", 3.9 * P, 5.3 * P, 3.2, 0.3);
  windows(s, b, "e", 3.9 * P, 5.3 * P, 3.2, 0.3);
  pitched(s, b, H, 2.6 * P, false);
  // the porch on its street side
  const e = b.face === "e";
  if (e) {
    s.box({ x: b.w, y: b.h / 2 - 1.4, w: 1.6, d: 2.8, z: 0, h: 0.5 * P, mat: CONCRETE });
    s.box({ x: b.w, y: b.h / 2 - 1.6, w: 1.8, d: 3.2, z: 2.75 * P, h: 0.35 * P, mat: SNOW });
  } else {
    s.box({ x: -1.6, y: b.h / 2 - 1.4, w: 1.6, d: 2.8, z: 0, h: 0.5 * P, mat: CONCRETE });
    s.box({ x: -1.8, y: b.h / 2 - 1.6, w: 1.8, d: 3.2, z: 2.75 * P, h: 0.35 * P, mat: SNOW });
  }
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function church(s: Sketch, b: Bld) {
  const H = 6 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat("#ecebe5") });
  windows(s, b, "e", 1.4 * P, 4.6 * P, 5, 0.6);
  pitched(s, b, H, 6 * P, false);
  // the steeple at the front (south), its spire
  const xm = b.w / 2;
  s.box({ x: xm - 2, y: b.h - 1, w: 4, d: 3.5, z: 0, h: 13 * P, mat: wallMat("#ecebe5") }, (d) => {
    d.poly("s", fr("s", b.h + 2.5, xm - 0.6, xm + 0.6, 5.5 * P, 7.9 * P), LIT, {
      stroke: "#1b1f22",
      sw: 0.8,
      glow: true,
    });
  });
  s.cyl({ x: xm, y: b.h + 0.75, z: 13.4 * P, r: 2.2, r2: 0.05, h: 9 * P, mat: ROOF });
  s.shadow(0, 0, b.w, b.h + 2.5, 0.3, 0.1);
}
function gas(s: Sketch, b: Bld) {
  // the kiosk at the back, the canopy over the pumps
  s.box({ x: 2, y: b.h - 6, w: 10, d: 6, z: 0, h: 3.2 * P, mat: wallMat("#d8d4cb") }, (d) => {
    d.poly("s", fr("s", b.h, 3, 11, 0.4 * P, 2.6 * P), LIT, { stroke: "#23292e", sw: 1, glow: true });
  });
  s.box({ x: 1.8, y: b.h - 6.2, w: 10.4, d: 6.4, z: 3.2 * P, h: 0.3 * P, mat: SNOW });
  for (const x of [3, b.w - 3])
    for (const y of [2, 8]) s.box({ x: x - 0.25, y: y - 0.25, w: 0.5, d: 0.5, z: 0, h: 4.6 * P, mat: mat("#e9e9e6") });
  for (const x of [7, b.w - 7]) {
    s.box({ x: x - 0.6, y: 3.5, w: 1.2, d: 3, z: 0, h: 0.25 * P, mat: CONCRETE });
    s.box({ x: x - 0.35, y: 4.2, w: 0.7, d: 0.6, z: 0.25 * P, h: 1.45 * P, mat: mat("#d6d2c8") });
  }
  s.box({ x: 1, y: 0, w: b.w - 2, d: 10, z: 4.6 * P, h: 0.8 * P, mat: mat("#b8322a", "#f4f7fa") });
  s.shadow(1, 0, b.w - 2, 10, 0.25, 0.1);
}
function smallHouse(s: Sketch, b: Bld, wall: Mat, alongX: boolean, H: number) {
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wall });
  pitched(s, b, H, 2.4 * P, alongX, 0.5);
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function gatehouse(s: Sketch, b: Bld) {
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: 1.0 * P, mat: CONCRETE });
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 1.0 * P, h: 1.6 * P, mat: mat("#51606b", "#5c6b76"), op: 0.85 }, (d) => {
    for (const f of ["s", "e"] as const)
      d.poly(f, fr(f, f === "s" ? b.h : b.w, 0.1, (f === "s" ? b.w : b.h) - 0.1, 1.05 * P, 2.55 * P), LIT, {
        op: 0.85,
        glow: true,
      });
  });
  s.box({ x: -0.6, y: -0.6, w: b.w + 1.2, d: b.h + 1.2, z: 2.6 * P, h: 0.35 * P, mat: CONCRETE });
  s.box({ x: -0.62, y: -0.62, w: b.w + 1.24, d: b.h + 1.24, z: 2.95 * P, h: 0.25 * P, mat: SNOW });
  s.shadow(-0.4, -0.4, b.w + 0.8, b.h + 0.8, 0.35, 0.1);
}
function shelter(s: Sketch, b: Bld) {
  for (const [x, y] of [
    [0, 0],
    [b.w, 0],
    [0, b.h],
    [b.w, b.h],
  ])
    s.box({ x: x - 0.06, y: y - 0.06, w: 0.12, d: 0.12, z: 0, h: 2.5 * P, mat: DARK });
  s.box({ x: 0, y: 0, w: b.w, d: 0.08, z: 0.2 * P, h: 2.2 * P, mat: mat("#8fa3b0"), op: 0.45 });
  s.box({ x: 0.5, y: 0.3, w: b.w - 1, d: 0.5, z: 0.45 * P, h: 0.1 * P, mat: WOOD });
  s.box({ x: -0.3, y: -0.3, w: b.w + 0.6, d: b.h + 0.6, z: 2.5 * P, h: 0.2 * P, mat: DARK });
  s.box({ x: -0.3, y: -0.3, w: b.w + 0.6, d: b.h + 0.6, z: 2.7 * P, h: 0.25 * P, mat: SNOW });
}
function building(s: Sketch, p: Props) {
  const b = p as unknown as Bld;
  switch (b.kind) {
    case "house":
      return house(s, b);
    case "church":
      return church(s, b);
    case "gas":
      return gas(s, b);
    case "gatehouse":
      return gatehouse(s, b);
    case "shelter":
      return shelter(s, b);
    case "boathouse":
      return smallHouse(s, b, RED_BOARD, true, 3.2 * P);
    case "shed":
      return smallHouse(s, b, mat("#9aa0a6", "#aab0b5", "#9aa0a6", "#80868c"), true, 4 * P);
    case "barn":
      return barn(s, b);
    case "silo":
      return silo(s, b);
    case "farmhouse":
      return farmhouse(s, b);
    default:
      return shop(s, b);
  }
}

// ── the farm (docs/plan/31-the-day.md) ──────────────────────────────────────
const BARN_RED = mat("#8e2b20", "#9e3a2c", "#8e2b20", "#6e2018");
const TRIM = mat("#ece6da", "#f6f2ea", "#e4ddd0", "#c9c2b5");
const STRAW = mat("#c9a95a", "#d8bb70", "#c4a252", "#a88a44");
const STALK = mat("#b59c6c", "#c4ad7f", "#a88d5c", "#8f7a52");
/** The barn's gambrel roof (its ridge along x, as 3D draws it): steep low, shallow high, snow on
 *  its slopes; the east gable end red, the shape of it. */
function gambrel(s: Sketch, b: Bld, z: number, over = 0.6) {
  const K = 3.2;
  const ym = b.h / 2;
  const prof: [number, number][] = [
    [-over, z - 0.35 * P],
    [K, z + 2.8 * P],
    [ym, z + 4.2 * P],
    [b.h - K, z + 2.8 * P],
    [b.h + over, z - 0.35 * P],
  ];
  s.shape({ x: -over, y: -over, w: b.w + 2 * over, d: b.h + 2 * over, z: z - 0.35 * P, h: 4.6 * P }, (d) => {
    const poly = (pts: V3[], fill: string) => {
      const p = pts.map(([x, y, zz]) => d.m(x, y, zz));
      d.raw(
        `<path d="M${p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("L")}Z" fill="${fill}" stroke="#151819" stroke-width="1" stroke-linejoin="round"/>`,
      );
    };
    const slope = (k: number, fill: string) => {
      const [ya, za] = prof[k];
      const [yb, zb] = prof[k + 1];
      poly(
        [
          [-over, ya, za],
          [b.w + over, ya, za],
          [b.w + over, yb, zb],
          [-over, yb, zb],
        ],
        fill,
      );
    };
    slope(0, "#dfe6ec");
    slope(1, "#e9eef2");
    poly(
      [
        [b.w, 0, z],
        [b.w, K, z + 2.8 * P],
        [b.w, ym, z + 4.2 * P],
        [b.w, b.h - K, z + 2.8 * P],
        [b.w, b.h, z],
      ],
      "#7a2419",
    );
    slope(2, "#f4f7fa");
    slope(3, "#f7fafc");
  });
}
function barn(s: Sketch, b: Bld) {
  const H = 5.2 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: BARN_RED }, (d) => {
    // the west doorway (dark: you walk in), its doors slid open either side, white X's
    const zm = b.h / 2;
    d.poly("w", fr("w", 0, zm - 1.6, zm + 1.6, 0, 3.4 * P), "#1b1410");
    for (const [u0, u1] of [
      [zm - 4.6, zm - 1.6],
      [zm + 1.6, zm + 4.6],
    ]) {
      d.poly("w", fr("w", 0, u0, u1, 0.05 * P, 3.3 * P), "#ece6da");
      d.poly("w", fr("w", 0, u0 + 0.2, u1 - 0.2, 0.25 * P, 3.1 * P), "#8e2b20");
    }
    for (const f of ["s", "n"] as const)
      for (let x = 4; x < b.w - 2; x += 6) d.poly(f, fr(f, f === "s" ? b.h : 0, x, x + 1, 2.2 * P, 3.2 * P), "#2c3540");
  });
  for (const [x, y] of [
    [0, 0],
    [b.w, 0],
    [0, b.h],
    [b.w, b.h],
  ])
    s.box({ x: x - 0.12, y: y - 0.12, w: 0.24, d: 0.24, z: 0, h: H, mat: TRIM, line: 0.5 });
  // a stone foundation round its foot
  s.box({
    x: -0.06,
    y: -0.06,
    w: b.w + 0.12,
    d: b.h + 0.12,
    z: 0,
    h: 0.6 * P,
    mat: mat("#8a8780", "#9a978f", "#8a8780", "#77746d"),
  });
  gambrel(s, b, H);
  // the cupola on the ridge
  s.box({ x: b.w / 2 - 0.8, y: b.h / 2 - 0.8, w: 1.6, d: 1.6, z: H + 4.0 * P, h: 1.3 * P, mat: TRIM });
  s.cyl({ x: b.w / 2, y: b.h / 2, z: H + 5.3 * P, r: 1.2, r2: 0.05, h: 0.9 * P, mat: mat("#3d3a36", "#f4f7fa") });
  s.shadow(0, 0, b.w, b.h, 0.3, 0.1);
}
function silo(s: Sketch, b: Bld) {
  const c = b.w / 2;
  const r = Math.min(b.w, b.h) / 2 - 0.2;
  s.cyl({ x: c, y: c, z: 0, r, h: 13 * P, mat: mat("#a9aeb2", "#c4c8cc") });
  for (let z = 1.5; z < 13; z += 2.2) s.cyl({ x: c, y: c, z: z * P, r: r + 0.05, h: 0.14 * P, mat: STEEL });
  s.cyl({ x: c, y: c, z: 13 * P, r, r2: 0.6, h: 2 * P, mat: mat("#8f9499", "#f6f8fa") });
  s.shadow(c - r, c - r, 2 * r, 2 * r, 0.3, 0.5);
}
function farmhouse(s: Sketch, b: Bld) {
  const H = 6.2 * P;
  s.box({ x: 0, y: 0, w: b.w, d: b.h, z: 0, h: H, mat: wallMat("#e3dccb") }, (d) => {
    const xm = b.w / 2;
    for (const dx of [-4, 4]) {
      d.poly("n", fr("n", 0, xm + dx - 0.65, xm + dx + 0.65, 0.9 * P, 2.4 * P), GLASS);
      d.poly("n", fr("n", 0, xm + dx - 0.6, xm + dx + 0.6, 3.7 * P, 5.1 * P), GLASS);
    }
    d.poly("n", fr("n", 0, xm - 0.5, xm + 0.5, 0.45 * P, 2.5 * P), "#4a3a2c");
  });
  pitched(s, b, H, 3 * P, true, 0.5);
  // the porch along the front (north)
  s.box({ x: 1, y: -2.2, w: b.w - 2, d: 2.2, z: 0, h: 0.45 * P, mat: WOOD });
  for (let x = 1.2; x <= b.w - 1; x += (b.w - 2.4) / 3)
    s.box({ x: x - 0.09, y: -2.1, w: 0.18, d: 0.18, z: 0.45 * P, h: 2.35 * P, mat: TRIM, line: 0.4 });
  s.box({ x: 0.8, y: -2.4, w: b.w - 1.6, d: 2.4, z: 2.8 * P, h: 0.15 * P, mat: ROOF });
  s.box({ x: 0.8, y: -2.4, w: b.w - 1.6, d: 2.4, z: 2.95 * P, h: 0.2 * P, mat: SNOW, line: 0.4 });
  s.shadow(0, -2.2, b.w, b.h + 2.2, 0.3, 0.1);
}
/** A run of the cornfield: a row's dry stalks, `len` tiles of it (north–south). */
function cornRow(s: Sketch, p: Props) {
  const len = Number(p.len) || 10;
  const r = rng(Number(p.seed) || 1);
  for (let y = 0.2; y < len; y += 0.55 + r() * 0.3) {
    if (r() < 0.1) continue;
    const h = (r() < 0.14 ? 0.5 + r() * 0.4 : 1.5 + r() * 0.6) * P;
    const x = 0.45 + (r() - 0.5) * 0.3;
    s.box({ x, y, w: 0.08, d: 0.08, z: 0, h, mat: STALK, line: 0.3 });
    if (h > P)
      s.box({
        x: x - 0.28,
        y: y - 0.04,
        w: 0.64,
        d: 0.16,
        z: h * (0.45 + r() * 0.3),
        h: 0.04 * P,
        mat: STALK,
        line: 0.25,
      });
  }
}
function rail(s: Sketch, p: Props) {
  const v = p.dir === "v";
  const len = Number(p.len) || 3;
  s.box({ x: 0, y: 0, w: 0.14, d: 0.14, z: 0, h: 1.15 * P, mat: WOOD, line: 0.5 });
  for (const z of [0.55, 1.0])
    s.box({ x: 0, y: 0, w: v ? 0.1 : len, d: v ? len : 0.1, z: z * P, h: 0.1 * P, mat: WOOD, line: 0.4 });
}
function tractor(s: Sketch) {
  const RED = mat("#9b2a20", "#b03a2e", "#9b2a20", "#7a2018");
  const TYRE = mat("#1e1e1e", "#2a2a2a");
  // along x: the hood ahead (east), the cab behind, the big wheels at the back
  for (const y of [0.05, 2.0]) {
    s.cyl({ x: 1.1, y: y + 0.25, z: 0, r: 0.85, h: 0.5 * P, mat: TYRE });
    s.cyl({ x: 3.3, y: y + 0.2, z: 0, r: 0.45, h: 0.35 * P, mat: TYRE });
  }
  s.box({ x: 2.0, y: 0.8, w: 2.2, d: 0.9, z: 0.8 * P, h: 0.9 * P, mat: RED });
  s.box({ x: 2.1, y: 0.82, w: 2.0, d: 0.85, z: 1.7 * P, h: 0.14 * P, mat: SNOW, line: 0.3 });
  s.box({ x: 0.45, y: 0.3, w: 1.3, d: 1.9, z: 0.9 * P, h: 0.25 * P, mat: DARK });
  for (const [x, y] of [
    [0.45, 0.35],
    [1.65, 0.35],
    [0.45, 2.1],
    [1.65, 2.1],
  ])
    s.box({ x, y, w: 0.08, d: 0.08, z: 1.1 * P, h: 1.3 * P, mat: DARK, line: 0.3 });
  s.box({ x: 0.4, y: 0.3, w: 1.4, d: 1.9, z: 2.4 * P, h: 0.12 * P, mat: RED });
  s.box({ x: 0.38, y: 0.28, w: 1.44, d: 1.94, z: 2.52 * P, h: 0.18 * P, mat: SNOW, line: 0.3 });
  s.box({ x: 1.2, y: 2.2, w: 0.6, d: 0.3, z: 0.9 * P, h: 0.3 * P, mat: mat("#2f5d8a", "#3d6f9e") }); // the toolbox
  s.shadow(0.2, 0.1, 3.8, 2.6, 0.32, 0.2);
}
function scarecrow(s: Sketch) {
  const COAT = mat("#3b3328", "#4a4034");
  s.box({ x: 0.45, y: 0.45, w: 0.1, d: 0.1, z: 0, h: 2.5 * P, mat: WOOD, line: 0.4 });
  s.box({ x: -0.3, y: 0.45, w: 1.6, d: 0.1, z: 1.8 * P, h: 0.1 * P, mat: WOOD, line: 0.4 });
  s.cyl({ x: 0.5, y: 0.5, z: 0.9 * P, r: 0.4, r2: 0.3, h: 1.1 * P, mat: COAT });
  s.box({ x: -0.25, y: 0.38, w: 1.5, d: 0.26, z: 1.72 * P, h: 0.28 * P, mat: COAT });
  s.box({ x: -0.25, y: 0.38, w: 1.5, d: 0.26, z: 2.0 * P, h: 0.06 * P, mat: SNOW, line: 0.3 });
  s.cyl({ x: 0.5, y: 0.5, z: 2.05 * P, r: 0.26, h: 0.45 * P, mat: mat("#c9b48a", "#d8c49a") });
  s.cyl({ x: 0.5, y: 0.5, z: 2.5 * P, r: 0.36, h: 0.06 * P, mat: DARK });
  s.cyl({ x: 0.5, y: 0.5, z: 2.56 * P, r: 0.2, h: 0.28 * P, mat: DARK });
}
function bale(s: Sketch) {
  s.cyl({ x: 0.6, y: 0.6, z: 0, r: 0.6, h: 1.1 * P, mat: STRAW });
  s.cyl({ x: 0.6, y: 0.6, z: 1.1 * P, r: 0.5, h: 0.1 * P, mat: SNOW });
}

// ── the rest ────────────────────────────────────────────────────────────────
function tower(s: Sketch) {
  const c = 9;
  // the fence round its foot (a gap to the south)
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    const x = c + Math.cos(a) * 8.6;
    const y = c + Math.sin(a) * 8.6;
    if (y > c && Math.abs(x - c) < 1.5) continue;
    s.box({ x: x - 0.05, y: y - 0.05, w: 0.1, d: 0.1, z: 0, h: 1.8 * P, mat: STEEL, line: 0.6 });
  }
  s.cyl({ x: c, y: c, z: 0, r: 2.1, r2: 1.7, h: 24 * P, mat: mat("#dadde0", "#e4e6e8") });
  s.cyl({ x: c, y: c, z: 24 * P, r: 1.7, r2: 4.2, h: 4 * P, mat: mat("#cfd3d7") });
  s.cyl({ x: c, y: c, z: 28 * P, r: 7.4, h: 1.2 * P, mat: mat("#b9bec4") });
  s.cyl({ x: c, y: c, z: 29.2 * P, r: 7.2, r2: 6.2, h: 2.2 * P, mat: mat("#e6e8ea") });
  s.cyl({ x: c, y: c, z: 31.4 * P, r: 6.2, r2: 2.4, h: 3 * P, mat: mat("#e6e8ea", "#f4f7fa") });
  s.cyl({ x: c, y: c, z: 34.4 * P, r: 2.4, r2: 0.6, h: 1.4 * P, mat: mat("#f4f7fa") });
  s.cyl({ x: c, y: c, z: 35.8 * P, r: 0.5, h: 2 * P, mat: mat("#b9bec4") });
  s.cyl({
    x: c,
    y: c,
    z: 37.8 * P,
    r: 0.45,
    h: 0.6 * P,
    mat: { c: "#ff2a1a", top: "#ff6a4a", flat: true },
    glow: true,
  });
  s.shadowDot(c, c, 7.5, 0.25);
}
function fence(s: Sketch, p: Props) {
  const v = p.dir === "v";
  const len = 3;
  const w = v ? 0.1 : len;
  const d = v ? len : 0.1;
  s.box({ x: 0, y: 0, w: 0.1, d: 0.1, z: 0, h: 3.05 * P, mat: STEEL, line: 0.6 });
  // the chain-link: see-through
  s.box({ x: 0, y: 0, w, d, z: 0.05 * P, h: 2.35 * P, mat: mat("#3a3e44"), op: 0.32, line: 0.4 });
  for (const k of [2.6, 2.8, 3.0]) s.box({ x: 0, y: 0, w, d, z: k * P, h: 0.6, mat: DARK, line: 0 });
  // snow caught at its foot
  s.box({
    x: v ? -0.25 : 0,
    y: v ? 0 : -0.25,
    w: v ? 0.5 : len,
    d: v ? len : 0.5,
    z: 0,
    h: 0.3 * P,
    mat: SNOW,
    line: 0.4,
  });
}
function barrier(s: Sketch, p: Props) {
  const n = Number(p.len) || 8;
  s.box({ x: n - 0.3, y: 0.2, w: 0.6, d: 0.6, z: 0, h: 1.1 * P, mat: STEEL });
  for (let k = 0; k < n - 0.4; k += 0.95)
    s.box({
      x: k,
      y: 0.43,
      w: Math.min(0.95, n - 0.4 - k),
      d: 0.14,
      z: 0.95 * P,
      h: 0.17 * P,
      mat: mat(Math.round(k / 0.95) % 2 ? "#f2f2f2" : "#c8322a"),
      line: 0.5,
    });
}
// the company's shuttle (docs/plan/27, phase 6): 10 × 3 tiles, its nose at −x
// (as the lot's cars are), cream with a rust stripe, a band of dark glass
function bus(s: Sketch) {
  const BODY = mat("#e6dccb", "#f1e9db");
  const GLASS = mat("#262d33", "#323a41");
  const TYRE = mat("#1c1c1c", "#2a2a2a");
  for (const x of [1.4, 7.6]) for (const y of [0.25, 2.45]) s.box({ x, y, w: 1, d: 0.3, z: 0, h: 0.75 * P, mat: TYRE });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 0.35 * P, h: 1.2 * P, mat: BODY, line: 1 });
  s.box({ x: -0.02, y: 0.3, w: 10.04, d: 2.4, z: 1.0 * P, h: 0.22 * P, mat: mat("#a8432c", "#b9523a"), line: 0.4 });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 1.55 * P, h: 0.95 * P, mat: GLASS, line: 0.8 });
  s.box({ x: 0, y: 0.3, w: 10, d: 2.4, z: 2.5 * P, h: 0.45 * P, mat: BODY, line: 0.8 });
  s.box({ x: 0.3, y: 0.45, w: 9.4, d: 2.1, z: 2.95 * P, h: 0.12 * P, mat: SNOW, line: 0.5 });
  // its lights: headlamps at the nose, red at the back
  for (const y of [0.55, 2.25]) {
    s.box({
      x: -0.04,
      y,
      w: 0.06,
      d: 0.25,
      z: 0.7 * P,
      h: 0.18 * P,
      mat: mat("#fff4cc", "#fffbe8"),
      glow: true,
      line: 0,
    });
    s.box({ x: 9.98, y, w: 0.06, d: 0.25, z: 0.7 * P, h: 0.18 * P, mat: mat("#c8322a", "#d8553f"), line: 0 });
  }
}
function statue(s: Sketch) {
  s.box({ x: 0, y: 0, w: 5, d: 5, z: 0, h: 0.5 * P, mat: mat("#8f8b83", "#a39f97") });
  s.box({ x: 1.1, y: 1.1, w: 2.8, d: 2.8, z: 0.5 * P, h: 2.7 * P, mat: mat("#9d988f", "#b0aba2") });
  s.box({ x: 1, y: 1, w: 3, d: 3, z: 3.2 * P, h: 0.2 * P, mat: SNOW });
  // the founder, his arm out to the street (north)
  s.cyl({ x: 2.5, y: 2.5, z: 3.4 * P, r: 0.75, r2: 0.45, h: 2.4 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 5.8 * P, r: 0.45, r2: 0.42, h: 0.9 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 6.7 * P, r: 0.34, h: 0.7 * P, mat: BRONZE });
  s.cyl({ x: 2.5, y: 2.5, z: 7.4 * P, r: 0.36, r2: 0.1, h: 0.25 * P, mat: SNOW });
  s.box({ x: 2.4, y: 1.0, w: 0.2, d: 1.5, z: 6.4 * P, h: 0.25 * P, mat: BRONZE });
}
function bench(s: Sketch) {
  for (const x of [0.15, 1.75]) s.box({ x, y: 0.1, w: 0.1, d: 0.6, z: 0, h: 1.0 * P, mat: DARK });
  s.box({ x: 0, y: 0.2, w: 2, d: 0.6, z: 0.45 * P, h: 0.08 * P, mat: WOOD });
  s.box({ x: 0, y: 0.08, w: 2, d: 0.1, z: 0.7 * P, h: 0.35 * P, mat: WOOD });
  s.box({ x: 0, y: 0.2, w: 2, d: 0.6, z: 0.53 * P, h: 0.1 * P, mat: SNOW, line: 0.4 });
}
function townLamp(s: Sketch) {
  const POST = mat("#1f2a26", "#2c3a35");
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.3, r2: 0.24, h: 0.6 * P, mat: POST });
  s.cyl({ x: 0.5, y: 0.5, z: 0.6 * P, r: 0.1, r2: 0.08, h: 3.6 * P, mat: POST });
  s.box({
    x: 0.26,
    y: 0.26,
    w: 0.48,
    d: 0.48,
    z: 4.25 * P,
    h: 0.57 * P,
    mat: { c: "#ffe0a8", top: "#fff2d0", flat: true },
    glow: true,
    line: 0.8,
  });
  s.cyl({ x: 0.5, y: 0.5, z: 4.82 * P, r: 0.42, r2: 0.05, h: 0.5 * P, mat: POST });
  s.shadowDot(0.5, 0.5, 0.3, 0.35);
}
function porchLamp(s: Sketch) {
  s.box({
    x: 0.38,
    y: 0.38,
    w: 0.24,
    d: 0.24,
    z: 2.2 * P,
    h: 0.35 * P,
    mat: { c: "#ffd29a", top: "#fff0d0", flat: true },
    glow: true,
    line: 0.6,
  });
}
function sign(s: Sketch, p: Props) {
  const w = Number(p.w) || 4;
  for (const x of [0.2, w - 0.3]) s.box({ x, y: 0.4, w: 0.1, d: 0.1, z: 0, h: 2.8 * P, mat: DARK });
  s.box({ x: 0, y: 0.35, w, d: 0.12, z: 1.0 * P, h: 1.8 * P, mat: mat(String(p.bg ?? "#e9e6dc")) }, (d) => {
    for (let i = 0; i < 3; i++)
      d.poly(
        "s",
        fr("s", 0.47, 0.4, w - 0.4 - i * 0.6, (1.3 + i * 0.45) * P, (1.42 + i * 0.45) * P),
        String(p.fg ?? "#1c2228"),
      );
  });
  s.box({ x: 0, y: 0.35, w, d: 0.12, z: 2.8 * P, h: 0.12 * P, mat: SNOW, line: 0.4 });
}
function dock(s: Sketch, p: Props) {
  const n = Number(p.len) || 14;
  for (let y = 0; y < n; y += 0.45) s.box({ x: 0, y, w: 3, d: 0.4, z: 0.55 * P, h: 0.12 * P, mat: WOOD, line: 0.4 });
  s.box({ x: 0.15, y: 0.2, w: 2.7, d: n - 0.4, z: 0.67 * P, h: 0.08 * P, mat: SNOW, line: 0 });
  // the canoe turned over, under snow
  s.box({ x: 1.0, y: 4.5, w: 0.9, d: 4.6, z: 0.67 * P, h: 0.32 * P, mat: mat("#7a2f22", "#f4f7fa") });
}

// ── the kinds and their drawings, the things ────────────────────────────────
/** Every kind the Grounds' things use (one per building: its own footprint). */
export function groundKinds(G: G): { kinds: Record<string, CatalogEntry>; gens: Record<string, ItemGen> } {
  const kinds: Record<string, CatalogEntry> = {
    gr_tower: { label: "Water tower", w: 18, h: 18, solid: true },
    gr_fence_h: { label: "Fence", w: 3, h: 1, solid: true },
    gr_fence_v: { label: "Fence", w: 1, h: 3, solid: true },
    gr_barrier: { label: "Barrier", w: 8, h: 1, solid: true },
    gr_statue: { label: "The founder", w: 5, h: 5, solid: true },
    gr_bench: { label: "Bench", w: 2, h: 1, solid: true },
    gr_lamp_town: { label: "Lamp", w: 1, h: 1, solid: true },
    gr_lamp_porch: { label: "Lamp", w: 1, h: 1, solid: false },
    gr_sign: { label: "Sign", w: 4, h: 1, solid: true },
    gr_dock: { label: "Dock", w: 3, h: 14, solid: false },
    gr_bus: { label: "Shuttle", w: 10, h: 3, solid: false },
    gr_corn: { label: "Cornfield", w: 1, h: 10, solid: false },
    gr_rail_h: { label: "Fence", w: 3, h: 1, solid: false },
    gr_rail_v: { label: "Fence", w: 1, h: 3, solid: false },
    gr_tractor: { label: "Tractor", w: 4, h: 3, solid: true },
    gr_scarecrow: { label: "Scarecrow", w: 1, h: 1, solid: true },
    gr_bale: { label: "Hay", w: 1, h: 1, solid: false },
  };
  const gens: Record<string, ItemGen> = {
    gr_tower: { draw: tower, variants: 1 },
    gr_fence_h: { draw: (s) => fence(s, { dir: "h" }), variants: 1 },
    gr_fence_v: { draw: (s) => fence(s, { dir: "v" }), variants: 1 },
    gr_barrier: { draw: barrier, variants: 1 },
    gr_statue: { draw: statue, variants: 1 },
    gr_bench: { draw: bench, variants: 1 },
    gr_lamp_town: { draw: townLamp, variants: 1 },
    gr_lamp_porch: { draw: porchLamp, variants: 1 },
    gr_sign: { draw: sign, variants: 1, key: (p) => `${p.bg}|${p.fg}` },
    gr_dock: { draw: dock, variants: 1 },
    gr_bus: { draw: bus, variants: 1 },
    gr_corn: { draw: cornRow, variants: 1, key: (p) => `${p.seed}|${p.len}` },
    gr_rail_h: { draw: (s, p) => rail(s, { ...p, dir: "h" }), variants: 1, key: (p) => String(p.len) },
    gr_rail_v: { draw: (s, p) => rail(s, { ...p, dir: "v" }), variants: 1, key: (p) => String(p.len) },
    gr_tractor: { draw: tractor, variants: 1 },
    gr_scarecrow: { draw: scarecrow, variants: 1 },
    gr_bale: { draw: bale, variants: 1 },
  };
  kinds.gr_wall = { label: "Wall", w: 1, h: 1, solid: true };
  gens.gr_wall = { draw: wallPiece, variants: 1, key: (p) => `${p.dir}|${p.c}` };
  for (const ins of G.INSIDES)
    for (const [k, f] of ins.fits.entries()) {
      const kind = `gr_f_${ins.b.key}_${k}`;
      const x = Math.floor(f.x);
      const y = Math.floor(f.z);
      kinds[kind] = {
        label: f.kind,
        w: Math.max(1, Math.ceil(f.x + f.w) - x),
        h: Math.max(1, Math.ceil(f.z + f.d) - y),
        solid: f.solid,
      };
      const props = { ...f, x: f.x - x, z: f.z - y, bar: ins.b.sign === "BAR" };
      gens[kind] = { draw: (s) => fitPiece(s, props), variants: 1 };
    }
  for (const [i, b] of G.BUILDINGS.entries()) {
    if (b.stored || b.kind === "hq") continue;
    const k = `gr_b_${b.key}`;
    kinds[k] = { label: b.name, w: b.x1 - b.x0, h: b.z1 - b.z0, solid: true };
    const props: Props = {
      kind: b.kind,
      w: b.x1 - b.x0,
      h: b.z1 - b.z0,
      floors: b.floors,
      face: b.face,
      sign: b.sign,
      vacant: b.vacant,
      seed: i * 7 + 3,
    };
    gens[k] = { draw: (s) => building(s, props), variants: 1 };
  }
  return { kinds, gens };
}

// ── insides (the town's bar, diner, market; the gatehouse): cut walls, furniture ──
function wallPiece(s: Sketch, p: Props) {
  const c = String(p.c ?? "#e6e0d4");
  const H = 0.9 * P; // cut low, as the iso view cuts walls
  const m = wallMat(c);
  if (p.dir === "v") s.box({ x: -0.08, y: 0, w: 0.16, d: 1, z: 0, h: H, mat: m, line: 0.7 });
  else s.box({ x: 0, y: -0.08, w: 1, d: 0.16, z: 0, h: H, mat: m, line: 0.7 });
}
function fitPiece(s: Sketch, p: Props) {
  const f = p as unknown as { kind: string; x: number; z: number; w: number; d: number; h: number; bar: boolean };
  const { x, z: y, w, d } = f;
  const h = f.h * P;
  const WOODD = mat("#3e2718", "#5b3a26");
  switch (f.kind) {
    case "counter":
      s.box({ x, y, w, d, z: 0, h: h - 3, mat: f.bar ? WOODD : mat("#d8d2c4", "#e6e0d4") });
      s.box({
        x: x - 0.08,
        y: y - 0.12,
        w: w + 0.16,
        d: d + 0.2,
        z: h - 3,
        h: 3,
        mat: f.bar ? mat("#7a5236", "#8a5a36") : mat("#b9b2a3", "#cfc9bc"),
      });
      break;
    case "stool":
      s.cyl({ x: x + 0.3, y: y + 0.3, z: 0, r: 0.05, h: h - 3, mat: DARK });
      s.cyl({ x: x + 0.3, y: y + 0.3, z: h - 3, r: 0.3, h: 3, mat: mat("#b5562f", "#c96a3f") });
      break;
    case "table":
      s.cyl({ x: x + w / 2, y: y + d / 2, z: 0, r: 0.07, h: h - 2, mat: DARK });
      s.box({ x, y, w, d, z: h - 2, h: 2, mat: mat("#8a5a36", "#a8733f") });
      break;
    case "chair":
      s.box({ x, y, w, d, z: 0.42 * P, h: 3, mat: mat("#5b3a26", "#74492f") });
      s.box({ x: x + w - 0.08, y, w: 0.08, d, z: 0, h, mat: mat("#5b3a26", "#74492f") });
      break;
    case "booth":
      s.box({ x, y, w, d: 0.7, z: 0, h: 0.5 * P, mat: mat("#8a3b2e", "#a04a36") });
      s.box({ x, y, w, d: 0.25, z: 0, h, mat: mat("#8a3b2e", "#a04a36") });
      s.box({ x: x + 0.4, y: y + 1.0, w: w - 0.8, d: d - 2.0, z: 0.75 * P, h: 2, mat: mat("#d8d2c4", "#e6e0d4") });
      s.box({ x, y: y + d - 0.7, w, d: 0.7, z: 0, h: 0.5 * P, mat: mat("#8a3b2e", "#a04a36") });
      break;
    case "shelf": {
      s.box({ x, y, w, d, z: 0, h, mat: f.bar ? WOODD : mat("#9aa0a6", "#aab0b5") }, (dd) => {
        const r = rng(Math.round(x * 13 + y * 7));
        for (let k = 0.5 * P; k < h - 6; k += 0.55 * P)
          for (let u = x + 0.1; u < x + w - 0.2; u += 0.3)
            dd.poly(
              "s",
              fr("s", y + d, u, u + 0.2, k, k + 0.35 * P),
              ["#2f4a3b", "#6b2430", "#c39a4a", "#3d4a5c", "#e8e6df", "#b5562f"][Math.floor(r() * 6)],
            );
      });
      break;
    }
    case "fridge":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#d6d2c8", "#e4e0d6") }, (dd) => {
        dd.poly("w", fr("w", x, y + 0.2, y + d - 0.2, 0.2 * P, h - 0.2 * P), "#dfeeff", { glow: true, op: 0.8 });
      });
      break;
    case "jukebox":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#5a1e1e", "#6e2a22") }, (dd) => {
        dd.poly("s", fr("s", y + d, x + 0.15, x + w - 0.15, 0.8 * P, h - 0.15 * P), "#ffb35c", { glow: true });
      });
      break;
    case "till":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#9a948a", "#aaa49a") });
      s.box({ x: x + 0.4, y: y + 0.3, w: 0.6, d: 0.5, z: h, h: 0.3 * P, mat: DARK });
      break;
    case "desk":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#5a4636", "#6b5442") });
      break;
    case "locker":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#4f5a52", "#5f6b62") });
      s.box({ x: x + w / 2 - 0.02, y: y + d, w: 0.04, d: 0.02, z: 0.2 * P, h: h - 0.4 * P, mat: DARK });
      break;
    case "screens":
      s.box({
        x,
        y,
        w: 0.1,
        d,
        z: 0.85 * P,
        h: h - 0.85 * P,
        mat: { c: "#9fd2c0", top: "#c8eadc", flat: true },
        glow: true,
      });
      break;
    // the barn's: hay in bales, the stalls' boards, the workbench
    case "hay":
      for (let k = 0; k < f.h - 0.05; k += 0.5)
        s.box({ x, y, w, d, z: k * P, h: Math.min(0.48, f.h - k) * P, mat: STRAW, line: 0.4 });
      break;
    case "stall":
      s.box({ x, y, w, d, z: 0.15 * P, h: h - 0.15 * P, mat: WOOD, line: 0.4 });
      break;
    // the farmhouse's
    case "stove":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#2b2a26", "#3a3a38") });
      s.box({ x: x + 0.25, y: y + d - 0.25, w: 0.1, d: 0.1, z: h, h: 1.6 * P, mat: DARK });
      break;
    case "sofa": {
      const C = mat("#6b4a3a", "#7d5844", "#6b4a3a", "#5a3c2e");
      s.box({ x, y, w, d, z: 0.15 * P, h: 0.3 * P, mat: C });
      s.box({ x, y, w: 0.25, d, z: 0.45 * P, h: h - 0.45 * P, mat: C });
      s.box({ x, y, w, d: 0.2, z: 0.45 * P, h: 0.2 * P, mat: C });
      s.box({ x, y: y + d - 0.2, w, d: 0.2, z: 0.45 * P, h: 0.2 * P, mat: C });
      break;
    }
    case "armchair": {
      const C = mat("#2f4a3b", "#3d5c4a", "#2f4a3b", "#27402f");
      s.box({ x, y, w, d, z: 0.15 * P, h: 0.3 * P, mat: C });
      s.box({ x, y: y + d - 0.25, w, d: 0.25, z: 0.45 * P, h: h - 0.45 * P, mat: C });
      break;
    }
    case "coffee":
      s.box({ x, y, w, d, z: h - 0.06 * P, h: 0.06 * P, mat: WOOD });
      for (const [u, v] of [
        [0.08, 0.08],
        [w - 0.14, d - 0.14],
      ])
        s.box({ x: x + u, y: y + v, w: 0.06, d: 0.06, z: 0, h: h - 0.06 * P, mat: WOOD });
      break;
    case "rug":
      s.box({ x, y, w, d, z: 0, h: 0.03 * P, mat: mat("#8a3b2e", "#9a4a3a"), line: 0.3 });
      s.box({ x: x + 0.3, y: y + 0.3, w: w - 0.6, d: d - 0.6, z: 0.03 * P, h: 0.01 * P, mat: mat("#c9a95a"), line: 0 });
      break;
    case "fireplace":
      s.box({ x, y, w, d, z: 0, h, mat: mat("#8a6a5a", "#9a7a6a", "#8a6a5a", "#6f5444") });
      s.box({ x: x + 0.6, y, w: w - 1.2, d: d - 0.15, z: h, h: 3.0 * P - h, mat: mat("#7a5a4a", "#8a6a5a") });
      s.box({
        x: x + 0.6,
        y: y - 0.02,
        w: w - 1.2,
        d: 0.1,
        z: 0.1 * P,
        h: 0.3 * P,
        mat: { c: "#ff7a2a", top: "#ffb06a", flat: true },
        glow: true,
      });
      break;
    case "bookshelf":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD }, (dr) => {
        for (let k = 0.2; k < f.h - 0.2; k += 0.45)
          dr.poly("s", fr("s", d, 0.1, w - 0.1, (k + 0.02) * P, (k + 0.3) * P), "#6b2430");
      });
      break;
    case "bed":
      s.box({ x, y, w, d, z: 0, h: 0.35 * P, mat: WOOD });
      s.box({
        x: x + 0.05,
        y: y + 0.05,
        w: w - 0.1,
        d: d - 0.1,
        z: 0.35 * P,
        h: 0.15 * P,
        mat: mat("#e8e4dc", "#f4f1ea"),
      });
      s.box({ x, y: y + 0.8, w, d: d - 0.8, z: 0.5 * P, h: 0.08 * P, mat: mat("#6b8aa8", "#7d9bb8") });
      s.box({ x, y: y - 0.1, w, d: 0.15, z: 0, h: 1.1 * P, mat: WOOD });
      break;
    case "nightstand":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD });
      s.box({ x: x + 0.15, y: y + 0.15, w: 0.2, d: 0.2, z: h, h: 0.35 * P, mat: mat("#e8d8b0") });
      break;
    case "wardrobe":
      s.box({ x, y, w, d, z: 0, h, mat: WOOD });
      break;
    case "bench":
      for (const u of [x + 0.1, x + w - 0.2])
        s.box({ x: u, y: y + 0.1, w: 0.1, d: d - 0.2, z: 0, h: h - 0.1 * P, mat: WOOD });
      s.box({ x, y, w, d, z: h - 0.1 * P, h: 0.1 * P, mat: WOOD });
      s.box({ x: x + 1.6, y: y + 0.25, w: 0.7, d: 0.45, z: h, h: 0.25 * P, mat: mat("#2f5d8a", "#3d6f9e") });
      break;
  }
}
/** A building's inside as iso items (its walls cut low, its furniture), building coords. */
export function insideThings(G: G, i: GroundsModule.Inside): Thing[] {
  const out: Thing[] = [];
  const { b } = i;
  const c =
    b.sign === "BAR" ? "#4a3426" : b.kind === "barn" ? "#6a4a34" : b.kind === "farmhouse" ? "#d8c9a8" : "#e6e0d4";
  for (let x = b.x0; x < b.x1; x++)
    for (const z of [b.z0, b.z1])
      if (G.wallEdgeAt("h", x, z))
        out.push({
          id: `gr:${b.key}:h${x},${z}`,
          kind: "gr_wall",
          x,
          y: z,
          rot: 0,
          props: { dir: "h", c },
          cx: x + 0.5,
          cz: z,
        });
  for (let z = b.z0; z < b.z1; z++)
    for (const x of [b.x0, b.x1])
      if (G.wallEdgeAt("v", x, z))
        out.push({
          id: `gr:${b.key}:v${x},${z}`,
          kind: "gr_wall",
          x,
          y: z,
          rot: 0,
          props: { dir: "v", c },
          cx: x,
          cz: z + 0.5,
        });
  for (const [k, f] of i.fits.entries()) {
    const x = Math.floor(f.x);
    const y = Math.floor(f.z);
    out.push({
      id: `gr:${b.key}:f${k}`,
      kind: `gr_f_${b.key}_${k}`,
      x,
      y,
      rot: 0,
      props: {},
      cx: f.x + f.w / 2,
      cz: f.z + f.d / 2,
    });
  }
  return out;
}

/** The things on the Grounds (building coords), each with its middle for the ground's height. */
export function groundThings(G: G): Thing[] {
  const out: Thing[] = [];
  const put = (id: string, kind: string, x: number, y: number, w: number, h: number, props: Props = {}, rot = 0) =>
    out.push({ id: `gr:${id}`, kind, x: Math.floor(x), y: Math.floor(y), rot, props, cx: x + w / 2, cz: y + h / 2 });
  for (const b of G.BUILDINGS)
    if (!b.stored && b.kind !== "hq") put(b.key, `gr_b_${b.key}`, b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  // the lamps (the cobra-heads are the lot's own kind; its arm turned to the road)
  for (const [i, l] of G.LAMPS.entries()) {
    if (l.kind === "cobra") {
      const dx = Math.cos(l.ry);
      const dz = -Math.sin(l.ry);
      const rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 2) : dz > 0 ? 1 : 3;
      put(`lamp${i}`, "lamp_post", l.x - 0.5, l.z - 0.5, 1, 1, {}, rot);
    } else put(`lamp${i}`, l.kind === "porch" ? "gr_lamp_porch" : "gr_lamp_town", l.x - 0.5, l.z - 0.5, 1, 1);
  }
  // the fence, a panel every 3 tiles (the gate open)
  for (let i = 0; i < G.FENCE.length; i++) {
    const [ax, az] = G.FENCE[i];
    const [bx, bz] = G.FENCE[(i + 1) % G.FENCE.length];
    const v = ax === bx;
    const len = Math.abs(v ? bz - az : bx - ax);
    const s = Math.sign(v ? bz - az : bx - ax);
    for (let t = 0; t < len; t += 3) {
      const x = v ? ax : ax + s * t - (s < 0 ? 3 : 0);
      const z = v ? az + s * t - (s < 0 ? 3 : 0) : az;
      if (!v && Math.abs(z - G.GATE.z) < 1 && x + 3 > G.GATE.x - 5 && x < G.GATE.x + 12) continue;
      put(`fence${i}-${t}`, v ? "gr_fence_v" : "gr_fence_h", x, z, v ? 1 : 3, v ? 3 : 1);
    }
  }
  put("tower", "gr_tower", G.TOWER.x - 9, G.TOWER.z - 9, 18, 18);
  put("statue", "gr_statue", G.STATUE.x - 2.5, G.STATUE.z - 2.5, 5, 5);
  put("bench", "gr_bench", G.BENCH.x - 1, G.BENCH.z, 2, 1);
  put("barrier", "gr_barrier", -44.5, G.GATE.z - 1, 8, 1, { len: 8 });
  put("closed", "gr_barrier", G.ROAD_CLOSED.x, G.ROAD_CLOSED.z - 4, 1, 8, { len: 8 }, 1);
  put("gate-sign", "gr_sign", -51.5, G.GATE.z + 4, 4, 1, { bg: "#e9e6dc", fg: "#1c2228" });
  put("dock", "gr_dock", -254, -98, 3, 14, { len: 14 });
  // the farm (docs/plan/31-the-day.md): the cornfield in runs of rows, its fence, the tractor,
  // the scarecrows, hay bales by the barn
  const C = G.CORN;
  for (let x = C.x0 + 1; x < C.x1; x += C.row)
    for (let z = C.z0; z < C.z1; z += 10) {
      const len = Math.min(10, C.z1 - z);
      put(`corn${x},${z}`, "gr_corn", x - 0.5, z, 1, len, { len, seed: 1 + ((((x * 31 + z) % 5) + 5) % 5) }); // (5 looks, drawn once each)
    }
  const e = { x0: C.x0 - 2, z0: C.z0 - 2, x1: C.x1 + 1, z1: C.z1 + 1 };
  for (let x = e.x0; x < e.x1; x += 3) {
    put(`rail-n${x}`, "gr_rail_h", x, e.z0, 3, 1, { len: Math.min(3, e.x1 - x) });
    put(`rail-s${x}`, "gr_rail_h", x, e.z1, 3, 1, { len: Math.min(3, e.x1 - x) });
  }
  const gm = (e.z0 + e.z1) / 2;
  for (let z = e.z0; z < e.z1; z += 3) {
    put(`rail-w${z}`, "gr_rail_v", e.x0, z, 1, 3, { len: Math.min(3, e.z1 - z) });
    if (z + 3 < gm - 3 || z > gm + 3) put(`rail-e${z}`, "gr_rail_v", e.x1, z, 1, 3, { len: Math.min(3, e.z1 - z) });
  }
  put("tractor", "gr_tractor", G.TRACTOR.x - 2, G.TRACTOR.z - 1.5, 4, 3);
  for (const [i, c] of G.SCARECROWS.entries()) put(`crow${i}`, "gr_scarecrow", c.x - 0.5, c.z - 0.5, 1, 1);
  for (const [i, [x, z]] of [
    [437, -298],
    [437, -296.6],
    [438.4, -297.4],
    [466, -300],
  ].entries())
    put(`bale${i}`, "gr_bale", x - 0.5, z - 0.5, 1, 1);
  // the cars parked along Main Street (the lot's own kind, nosed east or west)
  for (const [i, c] of G.TOWN_CARS.entries())
    put(
      `car${i}`,
      "car",
      c.x - 2.5,
      c.z - 1,
      5,
      2,
      {
        variant: c.colour,
        wagon: c.wagon ? 1 : 0,
        snowy: c.snowy ? 1 : 0,
        dx: Math.round((c.x - 2.5 - Math.floor(c.x - 2.5)) * 100) / 100,
        dz: Math.round((c.z - 1 - Math.floor(c.z - 1)) * 100) / 100,
      },
      c.dir > 0 ? 0 : 2,
    );
  return out;
}
