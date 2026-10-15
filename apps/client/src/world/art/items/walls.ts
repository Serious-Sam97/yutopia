import { type Mat, mixc, type Sketch, sh, type V3 } from "./kit";
import { K, M } from "./pal";

// Thin walls on tile edges (map v2), drawn like the items: ink outlines, light
// from the upper-left. A wall is a box WALL_T thick centred on its edge; only
// its +y face (walls along x) or +x face (walls along y) ever faces the camera,
// so that face carries the material: plaster over a walnut dado, walnut
// panelling, acoustic foam, brick, cork, smoked glass; upper case = with a
// window; "h" = a half wall. Each wall is cut into four slices (depth sorting)
// and into a low part (skirting, always shown) and a high part (fades when the
// wall stands between you and the camera).
// Heights in iso px (39.2 a tile). A person is ~74 tall: walls about 1.7× that
// (3.3 tiles, a loft), doorways 1.2×. (Same as WALL_H in art/furniture.ts.)
export const WALL_Z = 128;
export const DOOR_Z = 88; // a doorway's opening
export const LOW_Z = 14; // what stays when a wall is "down"
export const HALF_Z = 34;
export const WALL_HALF_T = 0.1; // half thickness, tiles (a post is 2× this square)
const T = WALL_HALF_T;
const WIN0 = 36; // window opening (its top level with the doorways')
const WIN1 = DOOR_Z;

export type WallPart = "low" | "high";

const CAP: Mat = { c: K.walnutDark, top: "#5a3a26" };

interface Run {
  // the wall in edge-local coords: along u (0..1), across v (−T..T), z up
  box: (
    u0: number,
    u1: number,
    z0: number,
    z1: number,
    mat: Mat,
    d?: (f: Face2) => void,
    line?: number,
    depth?: number,
    op?: number,
  ) => void;
}
// draws on the visible face: rectangle u0..u1 × z0..z1, slightly in front
type Face2 = {
  rect: (
    u0: number,
    u1: number,
    z0: number,
    z1: number,
    fill: string,
    o?: { stroke?: string; sw?: number; op?: number; glow?: boolean },
  ) => void;
  line: (u0: number, z0: number, u1: number, z1: number, stroke: string, sw?: number, op?: number) => void;
};

// An edge-local drawer: walls along x ("h") or along y ("v").
// `capFrom`: boxes ending below it have another band on top (their top is hidden).
function runFor(s: Sketch, dir: "h" | "v", capFrom = WALL_Z - 3): Run {
  return {
    box(a0, a1, z0, z1, mat, d, line, depth = 2 * T, op) {
      // full-length boxes run half a tile past the edge and are cut by the
      // slice, so straight walls join with no seam; ends get a post
      const full = a0 === 0 && a1 === 1;
      const u0 = full ? -0.5 : a0;
      const u1 = full ? 1.5 : a1;
      const spec =
        dir === "h"
          ? { x: u0, y: -depth / 2, w: u1 - u0, d: depth, z: z0, h: z1 - z0 }
          : { x: -depth / 2, y: u0, w: depth, d: u1 - u0, z: z0, h: z1 - z0 };
      s.box({ ...spec, mat, line: line ?? 1.1, op, capped: z1 < capFrom }, (draw) => {
        if (!d) return;
        const f = dir === "h" ? "s" : "e";
        const plane = depth / 2 + 0.002;
        const P = (u: number, z: number): V3 => (dir === "h" ? [u, plane, z] : [plane, u, z]);
        d({
          rect: (a0, a1, b0, b1, fill, o) => draw.poly(f, [P(a0, b1), P(a1, b1), P(a1, b0), P(a0, b0)], fill, o),
          line: (a0, b0, a1, b1, stroke, sw = 0.7, op = 1) => draw.line(f, P(a0, b0), P(a1, b1), stroke, sw, op),
        });
      });
    },
  };
}

const span = (a0: number, a1: number, b0: number, b1: number): [number, number] | null => {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi > lo ? [lo, hi] : null;
};

// Draw one wall edge: `ch` its char, `part` low or high. (Clipping to a slice
// is the sketch's clip.)
export function wall(s: Sketch, dir: "h" | "v", ch: string, part: WallPart) {
  const half = ch === "h";
  const r = runFor(s, dir, (half ? HALF_Z : WALL_Z) - 3);
  const mat = half ? "p" : ch.toLowerCase();
  const window = !half && ch !== mat; // upper case
  const top = half ? HALF_Z : WALL_Z;
  const [z0, z1] = part === "low" ? [0, LOW_Z] : [LOW_Z, top];
  // the wall body, in horizontal bands so a window can cut through
  const bands: [number, number][] = window
    ? ([
        [z0, Math.min(z1, WIN0)],
        [Math.max(z0, WIN1), z1],
      ].filter(([a, b]) => b > a) as [number, number][])
    : [[z0, z1]];
  const skirt = { c: K.walnutDark, top: "#5a3a26" } as Mat;

  for (const [b0, b1] of bands) {
    // skirting board, always walnut
    const sk = span(b0, b1, 0, 5);
    if (sk) r.box(0, 1, sk[0], sk[1], skirt, undefined, 0.9);
    const rest = span(b0, b1, 5, top - 3);
    if (rest) paintMaterial(r, mat, rest[0], rest[1], top, s.seed);
    const cap = span(b0, b1, top - 3, top);
    if (cap) r.box(0, 1, cap[0], cap[1], CAP, undefined, 1.1);
  }
  if (window && part === "high") windowFrame(r);
}

function paintMaterial(r: Run, mat: string, z0: number, z1: number, top: number, seed: number) {
  switch (mat) {
    case "w": {
      // walnut panelling: tall panels with grooves, a top rail
      r.box(0, 1, z0, z1, M.walnut, (f) => {
        for (const u of [1 / 3, 2 / 3]) f.line(u, z0, u, z1, sh(K.walnut, 0.7), 0.7, 0.9);
        for (const u of [0.04, 1 / 3 + 0.04, 2 / 3 + 0.04]) f.line(u, z0 + 1, u, z1 - 1, sh(K.walnut, 1.25), 0.5, 0.5);
        if (z1 >= top - 8 && z0 <= top - 8) f.rect(0, 1, top - 9, top - 7, sh(K.walnut, 0.8));
      });
      return;
    }
    case "f": {
      // acoustic foam wedges in a felt frame
      r.box(0, 1, z0, z1, { c: K.rustDark, top: "#9a4636" }, (f) => {
        for (let z = 8; z < top - 6; z += 8)
          for (let i = 0; i < 4; i++) {
            const lo = Math.max(z0, z);
            const hi = Math.min(z1, z + 7.4);
            if (hi <= lo) continue;
            const u = i * 0.25 + 0.02;
            const lit = (i + Math.floor(z / 8)) % 2 === 0;
            f.rect(u, u + 0.21, lo, hi, lit ? "#9e4a36" : "#7d3a2c");
          }
      });
      return;
    }
    case "b": {
      // brick: courses of 5 px, staggered, mortar lines
      r.box(0, 1, z0, z1, { c: "#9a4a30", top: "#a8573a" }, (f) => {
        for (let z = 5, row = 0; z < top - 3; z += 5, row++) {
          const lo = Math.max(z0, z);
          const hi = Math.min(z1, z + 5);
          if (hi <= lo) continue;
          f.line(0, Math.min(hi, z + 5), 1, Math.min(hi, z + 5), "#d9cba9", 0.6, 0.55);
          for (let u = row % 2 ? 0.125 : 0; u < 1; u += 0.25) {
            if (u > 0) f.line(u, lo, u, hi, "#d9cba9", 0.6, 0.55);
            const tone = ((Math.floor(u * 8) * 7 + row * 13 + Math.floor(seed * 10)) % 5) / 5;
            // opaque (pre-blended): see-through patches would double up where slices overlap
            f.rect(
              u + 0.01,
              Math.min(1, u + 0.24),
              lo + 0.5,
              hi - 0.5,
              mixc("#9a4a30", sh("#9a4a30", 0.92 + tone * 0.16), 0.6),
            );
          }
        }
      });
      return;
    }
    case "k": {
      // cork board between a walnut dado and a walnut picture rail
      const dado = span(z0, z1, 5, 28);
      if (dado) r.box(0, 1, dado[0], dado[1], M.walnut);
      const cork = span(z0, z1, 28, top - 3);
      if (cork)
        r.box(0, 1, cork[0], cork[1], { c: "#c49a6c", top: "#d2aa7c" }, (f) => {
          for (let i = 0; i < 24; i++) {
            const u = ((i * 37) % 97) / 97;
            const z = cork[0] + (((i * 53) % 89) / 89) * (cork[1] - cork[0]);
            f.rect(u, u + 0.012, z, z + 0.7, "#9c754c");
          }
          if (cork[0] <= 30) f.rect(0, 1, 28, 30, K.walnutDark);
        });
      return;
    }
    case "g": {
      // smoked glass in a walnut frame: light passes, you see through
      const base = span(z0, z1, 5, 12);
      if (base) r.box(0, 1, base[0], base[1], M.walnut);
      const pane = span(z0, z1, 12, top - 3);
      if (pane)
        r.box(
          0,
          1,
          pane[0],
          pane[1],
          { c: "#3a4a4a", top: "#4c5c5c", left: "#56686a", right: "#435253", flat: true },
          (f) => {
            f.line(0.5, pane[0], 0.5, pane[1], K.walnut, 1.6);
            f.rect(0.06, 0.3, Math.max(pane[0], top - 20), pane[1], "#ffffff", { op: 0.08 });
          },
        );
      return;
    }
    default: {
      // plaster over a walnut dado, a dado rail at 30
      const dado = span(z0, z1, 5, 29);
      if (dado)
        r.box(0, 1, dado[0], dado[1], M.walnut, (f) => {
          for (const u of [0.5]) f.line(u, dado[0], u, dado[1], sh(K.walnut, 0.75), 0.6, 0.7);
        });
      const rail = span(z0, z1, 29, 32);
      if (rail) r.box(0, 1, rail[0], rail[1], { c: K.walnutDark, top: "#5a3a26" }, undefined, 0.8);
      const plaster = span(z0, z1, 32, top - 3);
      if (plaster)
        r.box(0, 1, plaster[0], plaster[1], { c: K.cream, top: "#f6eedb", left: "#ece0c4", right: "#d6c9aa" }, (f) => {
          // a picture rail and a soft cornice line
          if (plaster[1] >= top - 10) f.line(0, top - 10, 1, top - 10, "#c9b991", 0.8, 0.8);
        });
      return;
    }
  }
}

// The window: a walnut frame and sill, thin glazing bars, a pale pane with a
// reflection (the outside shows through it).
function windowFrame(r: Run) {
  r.box(0, 0.06, WIN0, WIN1, M.walnut, undefined, 0.9);
  r.box(0.94, 1, WIN0, WIN1, M.walnut, undefined, 0.9);
  r.box(0, 1, WIN1 - 3, WIN1, M.walnut, undefined, 0.9);
  r.box(0.02, 0.98, WIN0 - 2, WIN0, { c: K.cream, top: "#f6eedb" }, undefined, 0.9); // sill
  // the glass, in the middle of the wall, with thin bars on it
  r.box(
    0.06,
    0.94,
    WIN0,
    WIN1 - 3,
    { c: "#a9c2d0", top: "#a9c2d0", left: "#a9c2d0", right: "#8ea7b5", flat: true },
    (f) => {
      f.rect(0.1, 0.36, WIN1 - 8, WIN1 - 3, "#ffffff", { op: 0.35 });
      f.rect(0.1, 0.2, WIN0 + 6, WIN1 - 8, "#ffffff", { op: 0.18 });
      f.line(0.5, WIN0, 0.5, WIN1 - 3, K.walnut, 1.6);
      f.line(0.06, (WIN0 + WIN1) / 2, 0.94, (WIN0 + WIN1) / 2, K.walnut, 1.4);
    },
    0.5,
    0.02,
    0.32,
  );
}

// A post where walls turn, meet or end: fills the joint, in the material of a
// wall it joins (its skirting and cap like every wall's).
export function post(s: Sketch, height: number, part: WallPart, ch: string) {
  const [z0, z1] = part === "low" ? [0, LOW_Z] : [LOW_Z, height];
  const box = (a: number, b: number, mat: Mat) => {
    const lo = Math.max(z0, a);
    const hi = Math.min(z1, b);
    if (hi > lo) s.box({ x: -T, y: -T, w: 2 * T, d: 2 * T, z: lo, h: hi - lo, mat, line: 1 });
  };
  const m = ch === "h" ? "p" : ch.toLowerCase();
  box(0, 5, { c: K.walnutDark, top: "#5a3a26" });
  if (m === "p") {
    box(5, Math.min(29, height - 3), M.walnut);
    box(29, height - 3, { c: K.cream, top: "#f6eedb", left: "#ece0c4", right: "#d6c9aa" });
  } else if (m === "k") {
    box(5, Math.min(28, height - 3), M.walnut);
    box(28, height - 3, { c: "#c49a6c", top: "#d2aa7c" });
  } else {
    const body: Record<string, Mat> = {
      w: M.walnut,
      f: { c: K.rustDark, top: "#9a4636" },
      b: { c: "#9a4a30", top: "#a8573a" },
      g: M.walnut,
    };
    box(5, height - 3, body[m] ?? M.walnut);
  }
  box(height - 3, height, CAP);
}

// A free-standing plaster column with a walnut base and capital, as tall as the
// walls. Story (seeded): a flyer pinned to it.
export function column(s: Sketch) {
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.3, h: 5, mat: M.walnutDark });
  s.cyl({ x: 0.5, y: 0.5, z: 5, r: 0.26, r2: 0.24, h: 2, mat: M.walnut, line: 0.9 });
  s.cyl(
    { x: 0.5, y: 0.5, z: 7, r: 0.22, h: 70, mat: { c: K.cream, top: "#f6eedb", left: "#f3e9d3", right: "#cdbf9f" } },
    (d) => {
      // fluting
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.5;
        const [x0, y0] = d.m(0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15, 10);
        const [, y1] = d.m(0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15, 74);
        d.raw(`<path d="M${x0} ${y0}L${x0} ${y1}" stroke="#c9b991" stroke-width=".7" opacity=".7"/>`);
      }
      if (Math.floor(s.seed * 2) === 1) {
        const [fx, fy] = d.m(0.62, 0.68, 46);
        d.raw(
          `<path d="M${fx - 4} ${fy - 5}l8 -1l.6 10l-8 1z" fill="${K.amberSoft}" stroke="#a8721f" stroke-width=".4"/><circle cx="${fx}" cy="${fy - 5}" r=".9" fill="${K.red}"/><path d="M${fx - 2.5} ${fy - 1}h5M${fx - 2.5} ${fy + 1.4}h4" stroke="#6b4a20" stroke-width=".5"/>`,
        );
      }
    },
  );
  s.cyl({ x: 0.5, y: 0.5, z: 77, r: 0.26, r2: 0.3, h: 4, mat: M.walnut, line: 0.9 });
  s.cyl({ x: 0.5, y: 0.5, z: 81, r: 0.3, h: 3, mat: CAP });
  s.shadowDot(0.5, 0.5, 0.32, 0.42);
}
