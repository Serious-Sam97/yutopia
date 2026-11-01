import type { Mat, Sketch } from "./kit";

// Parkour, out of doors (shared catalog's pk_*: Flowmotion grinds the rails, runs up and kicks off
// the walls, swings round the poles — physics/flow.ts): a steel rail on posts, a concrete wall
// with a cap, a steel pole on a plate with a hazard band at its foot. Sizes as shapes/index.ts.

const PX = 39.19; // iso px a metre (shapes PX_PER_M)
const STEEL: Mat = { c: "#7d8590", top: "#a9b1bb", left: "#8b939d", right: "#666d76", gloss: 0.8 };
const STEEL_DARK: Mat = { c: "#4f555c", top: "#646a72" };
const RUBBER: Mat = { c: "#2b2b2e", top: "#3a3a3e" };
const CONCRETE: Mat = { c: "#b8b2a6", top: "#d0cabe", left: "#c2bcb0", right: "#a39d91" };
const CAP: Mat = { c: "#857f75", top: "#9a948a" };
const HAZARD: Mat = { c: "#e0b02a", top: "#f0c445" };

/** A grind rail `len` tiles long: its round bar 0.9 m up on posts a little under 3 m apart. */
export function rail(s: Sketch, len: number) {
  const top = 0.9 * PX;
  const bar = 0.08 * PX;
  const n = Math.max(2, Math.ceil(len / 2.8) + 1);
  for (let i = 0; i < n; i++) {
    const u = 0.25 + ((len - 0.5) * i) / (n - 1);
    s.box({ x: u - 0.1, y: 0.4, w: 0.2, d: 0.2, z: 0, h: 1.5, mat: STEEL_DARK, line: 0.6 });
    s.cyl({ x: u, y: 0.5, z: 1.5, r: 0.035, h: top - bar - 1.5, mat: STEEL, line: 0.7 });
  }
  s.box({ x: 0.06, y: 0.46, w: len - 0.12, d: 0.08, z: top - bar, h: bar, mat: STEEL, line: 0.8 });
  for (const x of [0.02, len - 0.06])
    s.box({ x, y: 0.455, w: 0.04, d: 0.09, z: top - bar - 0.3, h: bar + 0.6, mat: RUBBER, line: 0.6 });
  s.shadow(0.1, 0.42, len - 0.2, 0.16, 0.3, 0.5);
}

/** A free-standing wall 4 tiles wide, `m` metres tall: a concrete slab on a plinth, capped. */
export function wall(s: Sketch, m: number) {
  const h = m * PX;
  const cap = 6;
  s.box({ x: -0.02, y: 0.32, w: 4.04, d: 0.36, z: 0, h: 6, mat: CAP, line: 0.8 });
  s.box({ x: 0, y: 0.35, w: 4, d: 0.3, z: 6, h: h - cap - 6, mat: CONCRETE, line: 1 }, (d) => {
    // (the formwork's seams, a metre up each)
    for (let z = PX; z < h - cap - 4; z += PX)
      for (const f of ["s", "n"] as const)
        d.line(f, [0, f === "s" ? 0.65 : 0.35, z], [4, f === "s" ? 0.65 : 0.35, z], "#8f897e", 0.5, 0.6);
  });
  s.box({ x: -0.03, y: 0.32, w: 4.06, d: 0.36, z: h - cap, h: cap, mat: CAP, line: 0.9, capped: false });
  s.shadow(0, 0.3, 4, 0.4, 0.4, 0.2);
}

/** A swing pole `m` metres tall on a base plate, its foot banded yellow. */
export function pole(s: Sketch, m: number) {
  const h = m * PX;
  s.box({ x: 0.3, y: 0.3, w: 0.4, d: 0.4, z: 0, h: 1.5, mat: STEEL_DARK, line: 0.6 });
  s.cyl({ x: 0.5, y: 0.5, z: 1.5, r: 0.085, h: 22, mat: HAZARD, line: 0.7 });
  s.cyl({ x: 0.5, y: 0.5, z: 23.5, r: 0.08, h: h - 26.5, mat: STEEL, line: 0.7 });
  s.cyl({ x: 0.5, y: 0.5, z: h - 3, r: 0.1, h: 3, mat: RUBBER, line: 0.6 });
  s.shadowDot(0.5, 0.5, 0.2, 0.35);
}
