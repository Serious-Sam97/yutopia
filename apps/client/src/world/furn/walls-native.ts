import { Color } from "three";
import type { Out } from "../tp/kit3d";
import { CEL_ALPHA } from "./look";

// The walls and posts (docs/plan/72-the-3d-core.md, phase 12: signed off 2026-11-06, in place of
// the item art's sketches), built as the furniture is: flat facets in each material's colours,
// cel-marked, the world inking them; every layer where it was (the skirting, the dado and its rail,
// the body, the cap), each material's own relief as geometry — brick in courses at true size,
// walnut in panels, foam in blocks, cork with its rail, smoked glass you see through in a walnut
// frame, a painted window's frame, sill and bars. Metres, in a wall's own frame: along it (u),
// across it (v: its front +), up (z).

// (the heights as they were: the old art's px in metres)
export const N_WALL = 3.266;
const SKIRT = 0.128;
const DADO = 0.74;
const RAIL = 0.817;
const CAP = 0.077;
const LOW = 0.357; // what stays when a wall is "down"
export const N_HALF = 0.868;
const WIN0 = 0.919;
const WIN1 = 2.246;
const CORK0 = 0.715;
const CORK1 = 0.766;
const GLASS0 = 0.306;

const WALNUT = "#5b3a26";
const WALNUT_DARK = "#3e2718";
const CREAM = "#efe4cc";
const BRICK = "#9a4a30";
const MORTAR = "#cdbd9b";
const FOAM = "#8a3b2e";
const CORK = "#c49a6c";
const SMOKE = "#3a4a4a";
const PANE = "#a9c2d0";

const c = new Color();
const rgba = (hex: string, a = CEL_ALPHA): number[] => {
  c.setStyle(hex);
  return [c.r, c.g, c.b, a];
};
const tone = (hex: string, k: number): string => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

/** Where a wall piece is: on the cells' edge north of (x, y) along x ("h") or west of it along y
 *  ("v") — or a free wall's piece in its own frame (x, y 0, "h", turned into place after). */
export interface WallFrame {
  dir: "h" | "v";
  x: number;
  y: number;
}
type V3 = [number, number, number];
const P = (f: WallFrame, u: number, v: number, z: number): V3 =>
  f.dir === "h" ? [f.x + u, z, f.y + v] : [f.x + v, z, f.y + u];
const N = (f: WallFrame, nu: number, nv: number, nz: number): V3 => (f.dir === "h" ? [nu, nz, nv] : [nv, nz, nu]);

/** A box along u0..u1, across v0..v1, up z0..z1 (its underside left out). */
function box(out: Out, f: WallFrame, u: [number, number], v: [number, number], z: [number, number], col: number[]) {
  const [u0, u1] = u;
  const [v0, v1] = v;
  const [z0, z1] = z;
  if (u1 - u0 < 1e-5 || v1 - v0 < 1e-5 || z1 - z0 < 1e-5) return;
  const g = col[3] < CEL_ALPHA - 1e-3 ? out.clear : out.lit;
  // (front and back: the faces across it; the ends; the top)
  g.quad(P(f, u0, v1, z0), P(f, u1, v1, z0), P(f, u1, v1, z1), P(f, u0, v1, z1), N(f, 0, 1, 0), col);
  g.quad(P(f, u0, v0, z0), P(f, u0, v0, z1), P(f, u1, v0, z1), P(f, u1, v0, z0), N(f, 0, -1, 0), col);
  g.quad(P(f, u1, v0, z0), P(f, u1, v0, z1), P(f, u1, v1, z1), P(f, u1, v1, z0), N(f, 1, 0, 0), col);
  g.quad(P(f, u0, v0, z0), P(f, u0, v1, z0), P(f, u0, v1, z1), P(f, u0, v0, z1), N(f, -1, 0, 0), col);
  g.quad(P(f, u0, v0, z1), P(f, u0, v1, z1), P(f, u1, v1, z1), P(f, u1, v0, z1), N(f, 0, 0, 1), col);
}

const span = (a0: number, a1: number, b0: number, b1: number): [number, number] | null => {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo + 1e-6 ? [lo, hi] : null;
};

export interface WallDraw {
  /** the edge's char: a material ("p" plaster, "w" walnut, "f" foam, "b" brick, "k" cork, "g"
   *  glass), upper case with a painted window, "h" a half wall */
  ch: string;
  part: "low" | "high";
  /** along it: from, to (m) */
  a0: number;
  a1: number;
  /** which of it: both faces one material, or the front's half (+v) or the back's (−v) */
  side: "both" | "front" | "back";
  /** a door's or window's hole through it (m up) */
  cut?: readonly [number, number] | null;
  /** its own height and half thickness (m) — a wall drawn free's */
  top?: number;
  t?: number;
  /** a seed for its tones (a brick's, a foam wedge's) */
  seed?: number;
  /** how far along its whole wall this piece's u 0 is (m): its patterns run on from piece to piece */
  along?: number;
}

/** One piece of a wall, in `out`. */
export function nativeWall(out: Out, f: WallFrame, d: WallDraw): void {
  const half = d.ch === "h";
  const top = d.top ?? (half ? N_HALF : N_WALL);
  const t = d.t ?? 0.1;
  const mat = half ? "p" : d.ch.toLowerCase();
  const window = !half && d.ch !== mat && !d.cut;
  const [z0, z1] = d.part === "low" ? [0, LOW] : [LOW, top];
  const hole = d.cut ?? (window ? ([WIN0, WIN1] as const) : null);
  const bands: [number, number][] = hole
    ? ([
        [z0, Math.min(z1, hole[0])],
        [Math.max(z0, hole[1]), z1],
      ].filter(([a, b]) => b > a) as [number, number][])
    : [[z0, z1]];
  const across: [number, number] = d.side === "front" ? [0, t] : d.side === "back" ? [-t, 0] : [-t, t];
  const faces: (1 | -1)[] = d.side === "front" ? [1] : d.side === "back" ? [-1] : [1, -1];
  const u: [number, number] = [d.a0, d.a1];
  const seed = d.seed ?? 0.37;
  for (const [b0, b1] of bands) {
    const lay = (lo: number, hi: number, col: string, proud = 0) => {
      const s = span(b0, b1, lo, hi);
      if (!s) return;
      const v: [number, number] = [
        across[0] - (faces.includes(-1) ? proud : 0),
        across[1] + (faces.includes(1) ? proud : 0),
      ];
      box(out, f, u, v, s, rgba(col));
    };
    lay(0, SKIRT, WALNUT_DARK, 0.012);
    body(out, f, d, mat, u, across, faces, b0, b1, top, seed, lay);
    lay(top - CAP, top, WALNUT_DARK, 0.008);
  }
  if (window && d.part === "high" && d.side !== "back") windowFrame(out, f, u, t);
}

type Lay = (lo: number, hi: number, col: string, proud?: number) => void;

// the material between the skirting and the cap, its relief on each face it shows
function body(
  out: Out,
  f: WallFrame,
  d: WallDraw,
  mat: string,
  u: [number, number],
  across: [number, number],
  faces: (1 | -1)[],
  b0: number,
  b1: number,
  top: number,
  seed: number,
  lay: Lay,
) {
  const T = Math.max(Math.abs(across[0]), Math.abs(across[1]));
  // a strip proud of a face: along ua..ub, up za..zb, `p` out from it
  const strip = (side: 1 | -1, ua: number, ub: number, za: number, zb: number, col: string, p: number) => {
    const s = span(b0, b1, za, zb);
    const a = span(u[0], u[1], ua, ub);
    if (!s || !a) return;
    const v: [number, number] = side > 0 ? [T - 0.001, T + p] : [-T - p, -T + 0.001];
    box(out, f, a, v, s, rgba(col));
  };
  // a plate on a face, `p` out from it — its front only: sides a few mm deep don't show, and a brick
  // wall has some 185 bricks a metre (a box each was 1,850 triangles a metre of wall)
  const plate = (side: 1 | -1, ua: number, ub: number, za: number, zb: number, col: string, p: number) => {
    const s = span(b0, b1, za, zb);
    const a = span(u[0], u[1], ua, ub);
    if (!s || !a) return;
    const v = side * (T + p);
    const c = rgba(col);
    out.lit.quad(
      P(f, a[0], v, s[0]),
      P(f, a[1], v, s[0]),
      P(f, a[1], v, s[1]),
      P(f, a[0], v, s[1]),
      N(f, 0, side, 0),
      c,
    );
  };
  // (a pattern's places along the piece: whole steps from the wall's own start, run on from the
  // piece before)
  const base = d.along ?? 0;
  const along = (step: number, from = 0): number[] => {
    const out2: number[] = [];
    const w0 = base + u[0];
    for (let x = Math.floor((w0 - from) / step) * step + from; x < base + u[1]; x += step) out2.push(x - base);
    return out2;
  };
  switch (mat) {
    case "w": {
      lay(SKIRT, top - CAP, WALNUT);
      // panels: a stile every third of a metre, a top rail under the cap
      for (const s of faces) {
        for (const x of along(1 / 3)) strip(s, x - 0.015, x + 0.015, SKIRT, top - CAP - 0.2, tone(WALNUT, 0.72), 0.01);
        strip(s, u[0], u[1], top - CAP - 0.23, top - CAP - 0.18, tone(WALNUT, 0.8), 0.012);
      }
      return;
    }
    case "f": {
      lay(SKIRT, top - CAP, FOAM);
      // foam wedges: a grid of blocks proud of the felt, their tones alternating
      for (const s of faces)
        for (let z = SKIRT + 0.08, row = 0; z < top - CAP - 0.16; z += 0.2, row++)
          for (const x of along(0.25)) {
            const lit = (Math.round(x * 4) + row) % 2 === 0;
            strip(s, x + 0.02, x + 0.23, z, z + 0.18, lit ? "#9e4a36" : "#7d3a2c", 0.035);
          }
      return;
    }
    case "b": {
      // brick at true size: courses of 75 mm (65 and the mortar), bricks of 225, stretcher bond
      lay(SKIRT, top - CAP, MORTAR);
      const course = 0.075;
      for (const s of faces)
        for (let z = SKIRT + 0.005, row = 0; z < top - CAP - 0.02; z += course, row++)
          for (const x of along(0.225, row % 2 ? 0.1125 : 0)) {
            const k = 0.9 + (((Math.round(x * 40) * 7 + row * 13 + Math.floor(seed * 10)) % 5) / 5) * 0.16;
            plate(s, x + 0.005, x + 0.22, z, Math.min(z + 0.065, top - CAP), tone(BRICK, k), 0.006);
          }
      return;
    }
    case "k": {
      lay(SKIRT, CORK0, WALNUT);
      lay(CORK0, CORK1, WALNUT_DARK, 0.01);
      lay(CORK1, top - CAP, CORK);
      // its grain: a scatter of darker flecks
      for (const s of faces)
        for (const x of along(1))
          for (let i = 0; i < 14; i++) {
            const ux = x + ((i * 37) % 97) / 97;
            const z = CORK1 + (((i * 53) % 89) / 89) * (top - CAP - CORK1 - 0.05);
            plate(s, ux, ux + 0.02, z, z + 0.02, "#9c754c", 0.002);
          }
      return;
    }
    case "g": {
      lay(SKIRT, GLASS0, WALNUT);
      // smoked glass, a mullion every metre (light passes, you see through)
      const s = span(b0, b1, GLASS0, top - CAP);
      if (s) box(out, f, u, across, s, rgba(SMOKE, 0.55));
      for (const side of faces)
        for (const x of along(1)) {
          strip(side, x - 0.02, x + 0.02, GLASS0, top - CAP, WALNUT, 0.01);
          // (its sheen: two pale streaks down each pane, as the sketch had — on one face only: the
          // other's would show through it)
          if (side !== faces[0]) continue;
          for (const [o, w] of [
            [0.22, 0.1],
            [0.62, 0.05],
          ]) {
            const s2 = span(b0, b1, GLASS0 + 0.03, top - CAP - 0.03);
            const a = span(u[0], u[1], x + o, x + o + w);
            if (!s2 || !a) continue;
            const v: [number, number] = side > 0 ? [T + 0.001, T + 0.003] : [-T - 0.003, -T - 0.001];
            box(out, f, a, v, s2, rgba("#c9dad8", 0.1));
          }
        }
      return;
    }
    default: {
      // plaster over a walnut dado, the dado's rail, a picture rail under the cap
      lay(SKIRT, DADO, WALNUT);
      lay(DADO, RAIL, WALNUT_DARK, 0.012);
      lay(RAIL, top - CAP, CREAM);
      for (const side of faces) {
        strip(side, u[0], u[1], top - CAP - 0.27, top - CAP - 0.24, "#d8c9a2", 0.008);
        for (const x of along(1, 0.5))
          strip(side, x - 0.008, x + 0.008, SKIRT + 0.04, DADO - 0.04, tone(WALNUT, 0.78), 0.004);
      }
      return;
    }
  }
}

// A painted-on window (an older save's): a walnut frame and sill, the pane, its bars.
function windowFrame(out: Out, f: WallFrame, u: [number, number], t: number) {
  const [a0, a1] = u;
  const w = a1 - a0;
  const col = rgba(WALNUT);
  box(out, f, [a0, a0 + 0.06 * w], [-t, t], [WIN0, WIN1], col);
  box(out, f, [a1 - 0.06 * w, a1], [-t, t], [WIN0, WIN1], col);
  box(out, f, [a0, a1], [-t, t], [WIN1 - 0.08, WIN1], col);
  box(out, f, [a0 + 0.02 * w, a1 - 0.02 * w], [-t - 0.04, t + 0.04], [WIN0 - 0.05, WIN0], rgba(CREAM));
  box(out, f, [a0 + 0.06 * w, a1 - 0.06 * w], [-0.01, 0.01], [WIN0, WIN1 - 0.08], rgba(PANE, 0.32));
  const mid = (a0 + a1) / 2;
  box(out, f, [mid - 0.015, mid + 0.015], [-0.02, 0.02], [WIN0, WIN1 - 0.08], col);
  const zm = (WIN0 + WIN1) / 2;
  box(out, f, [a0 + 0.06 * w, a1 - 0.06 * w], [-0.02, 0.02], [zm - 0.015, zm + 0.015], col);
}

/** A post where walls turn, meet or end, at (x, y): its skirting, its body in the material of a wall
 *  it joins, its cap — `top` high (m), `t` half its side. */
export function nativePost(
  out: Out,
  x: number,
  y: number,
  top: number,
  part: "low" | "high",
  ch: string,
  t = 0.1,
): void {
  const [z0, z1] = part === "low" ? [0, LOW] : [LOW, top];
  const f: WallFrame = { dir: "h", x, y };
  const lay = (lo: number, hi: number, col: string) => {
    const s = span(z0, z1, lo, hi);
    if (s) box(out, f, [-t, t], [-t, t], s, rgba(col));
  };
  const m = ch === "h" ? "p" : ch.toLowerCase();
  lay(0, SKIRT, WALNUT_DARK);
  if (m === "p") {
    lay(SKIRT, Math.min(DADO, top - CAP), WALNUT);
    lay(DADO, top - CAP, CREAM);
  } else if (m === "k") {
    lay(SKIRT, Math.min(CORK0, top - CAP), WALNUT);
    lay(CORK0, top - CAP, CORK);
  } else lay(SKIRT, top - CAP, ({ w: WALNUT, f: FOAM, b: BRICK, g: WALNUT } as Record<string, string>)[m] ?? WALNUT);
  lay(top - CAP, top, WALNUT_DARK);
}
