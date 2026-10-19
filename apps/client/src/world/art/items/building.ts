import { CAR_COLOURS } from "@yutopia/shared";
import { shade } from "../palette";
import type { Mat, Sketch } from "./kit";
import { K, M } from "./pal";

// The building's things (docs/plan/25-building-floors.md): the staircase, an
// elevator's car, and outside the lot's cars and lamp posts. Heights in iso px
// (39.19 a tile), as every item.

const P = 39.19; // px a tile up
const STOREY = 3.5 * P;
const HALF = STOREY / 2;
const N = 9; // steps a flight

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const paint = (n: number): Mat => ({
  c: hex(n),
  top: hex(shade(n, 1.15)),
  left: hex(shade(n, 0.95)),
  right: hex(shade(n, 0.78)),
});

const TREAD: Mat = { c: "#8d8a84", top: "#a7a39b", left: "#7d7a74", right: "#6c6964" };
const CONCRETE: Mat = { c: "#b9b6ae", top: "#cbc8c0" };
const NOSING: Mat = { c: "#2b2d2f", top: "#3a3d40", flat: true }; // anti-slip strips
const RAIL: Mat = { c: "#2f3336", top: "#4a4f53", flat: true };
const STEEL: Mat = { c: "#9aa1a6", top: "#b8bec2", left: "#a3aaaf", right: "#7d858a", gloss: 0.7 };
const CAR_FLOOR: Mat = { c: "#3a3633", top: "#46413d" };
const LIT: Mat = { c: K.vfd, top: K.amber, flat: true };
const DARK: Mat = { c: "#2a2016", top: "#3a2e20", flat: true };
const STEEL_DK: Mat = { c: "#6c7378", top: "#848b90", left: "#737a7f", right: "#5c6267" };

// A staircase: a switchback in a 4 × 6 well (shared stairs.ts) — up the east
// half away from the door, a half landing at the far end, back up the west
// half to the floor above. Treads with an amber nosing, a wall between the
// flights, a rail up the outer side of each.
export function stairs(s: Sketch) {
  const run = 3 / N;
  // flight A (u 2..4, v 1 → 4): solid steps from the floor
  for (let i = 0; i < N; i++) {
    const top = (HALF * (i + 1)) / N;
    const v = 1 + run * i;
    s.box({ x: 2.04, y: v, w: 1.9, d: run + 0.01, z: 0, h: top, mat: TREAD, line: 0.8 });
    s.box({ x: 2.04, y: v, w: 1.9, d: 0.05, z: top - 1, h: 1.6, mat: NOSING, line: 0, bevel: false });
  }
  // the half landing (all across the far end)
  s.box({ x: 0.04, y: 4, w: 3.92, d: 1.94, z: 0, h: HALF, mat: CONCRETE, line: 0.8 });
  s.box({ x: 0.04, y: 4, w: 3.92, d: 0.05, z: HALF - 1, h: 1.6, mat: NOSING, line: 0, bevel: false });
  // flight B (u 0..2, v 4 → 1): a slab of steps over the floor (the soffit under it)
  for (let i = 0; i < N; i++) {
    const top = HALF + (HALF * (i + 1)) / N;
    const v = 4 - run * (i + 1);
    const thick = 26;
    s.box({ x: 0.06, y: v, w: 1.9, d: run + 0.01, z: top - thick, h: thick, mat: TREAD, line: 0.8 });
    s.box({ x: 0.06, y: v + run - 0.05, w: 1.9, d: 0.05, z: top - 1, h: 1.6, mat: NOSING, line: 0, bevel: false });
  }
  // the spine between the flights: a low concrete upstand (the rails ride on it)
  s.box({ x: 1.96, y: 1, w: 0.08, d: 3, z: 0, h: 14, mat: CONCRETE, line: 0.8 });
  // rails: posts along the outer side of each flight, a bar stepping with them
  for (let i = 0; i <= N; i += 3) {
    const a = (HALF * Math.max(1, i)) / N;
    s.box({ x: 3.88, y: 1 + run * i, w: 0.06, d: 0.06, z: a, h: 36, mat: RAIL, line: 0 });
    const b = HALF + (HALF * Math.max(1, i)) / N;
    s.box({ x: 0.08, y: 4 - run * i - 0.06, w: 0.06, d: 0.06, z: b, h: 36, mat: RAIL, line: 0 });
  }
  for (let i = 0; i < N; i++) {
    const a = (HALF * (i + 1)) / N + 36;
    s.box({ x: 3.86, y: 1 + run * i, w: 0.1, d: run, z: a - 2, h: 3, mat: RAIL, line: 0, bevel: false });
    const b = HALF + (HALF * (i + 1)) / N + 36;
    s.box({ x: 0.06, y: 4 - run * (i + 1), w: 0.1, d: run, z: b - 2, h: 3, mat: RAIL, line: 0, bevel: false });
  }
  s.shadow(0, 1, 4, 5, 0.25);
}

// An elevator's stop (2 × 2; the doors on the north edge, rot 0), as the iso
// camera sees it — from inside, over the cut-away car (docs/plan/26): the
// steel portal and the doors' inner faces, sliding apart by props.anim (0 shut
// … 1 open, stepped by the controller from the shared motion), the display
// over them lit while the car's here or coming; props.here: the car's floor
// (low steel walls, a walnut rail, its panel) or the empty shaft (dark).
export function elevator(s: Sketch, props: Record<string, unknown>) {
  const k = Math.max(0, Math.min(1, Number(props.anim ?? (props.door === "open" ? 1 : 0))));
  const here = props.here !== false;
  const H = 86; // the doors (2.2 tiles)
  s.box({ x: 0.06, y: 0.14, w: 1.88, d: 1.8, z: 0, h: 2, mat: here ? CAR_FLOOR : M.graphite });
  if (here) {
    // the car cut away low: its sides and back, a rail along them, the panel
    for (const [x, y, w, d] of [
      [0.06, 0.14, 0.06, 1.8],
      [1.88, 0.14, 0.06, 1.8],
      [0.06, 1.88, 1.88, 0.06],
    ])
      s.box({ x, y, w, d, z: 0, h: 14, mat: STEEL, line: 0.7 });
    s.box({ x: 0.14, y: 1.8, w: 1.72, d: 0.04, z: 14, h: 2, mat: M.walnut, line: 0 });
    s.box({ x: 1.62, y: 0.16, w: 0.2, d: 0.03, z: 30, h: 34, mat: STEEL, line: 0.6 });
    s.box({ x: 1.68, y: 0.13, w: 0.08, d: 0.02, z: 54, h: 5, mat: LIT, glow: true, line: 0 });
  }
  // the portal: posts and head
  s.box({ x: 0.36, y: 0, w: 0.08, d: 0.14, z: 0, h: H + 6, mat: STEEL, line: 0.8 });
  s.box({ x: 1.56, y: 0, w: 0.08, d: 0.14, z: 0, h: H + 6, mat: STEEL, line: 0.8 });
  s.box({ x: 0.44, y: 0, w: 1.12, d: 0.14, z: H, h: 6, mat: STEEL, line: 0.8 });
  // the leaves, each sliding into the wall on its side
  const w = 0.56 * (1 - k);
  if (w > 0.02) {
    s.box({ x: 0.44, y: 0.03, w, d: 0.06, z: 0, h: H, mat: STEEL_DK, line: 0.7 });
    s.box({ x: 1.56 - w, y: 0.03, w, d: 0.06, z: 0, h: H, mat: STEEL_DK, line: 0.7 });
  }
  // the display over them (inside): amber while the car's here or coming
  const lit = (here && k > 0) || (props.dir !== undefined && props.dir !== 0);
  s.box({ x: 0.72, y: 0.14, w: 0.56, d: 0.04, z: H + 8, h: 9, mat: lit ? LIT : DARK, glow: lit, line: 0.6 });
}

// An 80s sedan or wagon parked in a bay, its nose to −x (rot 0), snow on the
// roof and the hood (props.snowy). props.variant: its colour (shared
// CAR_COLOURS); dx / dz: where exactly it stands in its bay.
export function car(s: Sketch, props: Record<string, unknown>) {
  const v = Number.isInteger(props.variant) ? (props.variant as number) : Math.floor(s.seed * CAR_COLOURS.length);
  const colour =
    typeof props.color === "string" ? Number.parseInt(props.color.slice(1), 16) : CAR_COLOURS[v % CAR_COLOURS.length];
  const body = paint(colour);
  const wagon = !!props.wagon;
  const snowy = props.snowy !== 0 && props.snowy !== false;
  const ox = Math.max(-0.4, Math.min(0.4, Number(props.dx) || 0));
  const oy = Math.max(-0.4, Math.min(0.4, Number(props.dz) || 0));
  const b = (
    x: number,
    y: number,
    w: number,
    d: number,
    z: number,
    h: number,
    mat: Mat,
    o: Partial<{ glow: boolean; line: number; op: number }> = {},
  ) => s.box({ x: x + ox, y: y + oy, w, d, z, h, mat, ...o });
  const TYRE: Mat = { c: "#1c1c1c", top: "#2a2a2a", flat: true };
  const GLASS: Mat = { c: "#2a3036", top: "#3a434b", left: "#323a41", right: "#262c31" };
  const SNOW: Mat = { c: "#eef2f4", top: "#f8fafb", left: "#e2e8ec", right: "#d3dbe0" };
  // wheels, under the body's sills
  for (const x of [0.75, 3.6]) for (const y of [0.06, 1.74]) b(x, y, 0.62, 0.2, 0, 21, TYRE, { line: 0.7 });
  // the lower body, bumpers and lights
  b(0.12, 0.14, 4.76, 1.72, 8, 23, body, { line: 1 });
  b(0, 0.2, 0.14, 1.6, 10, 7, M.aluminium, { line: 0.6 });
  b(4.86, 0.2, 0.14, 1.6, 10, 7, M.aluminium, { line: 0.6 });
  for (const y of [0.3, 1.4]) {
    b(0.04, y, 0.06, 0.3, 21, 4, { c: "#fff4cc", top: "#fffbe8", flat: true }, { glow: true, line: 0 });
    b(4.92, y, 0.05, 0.3, 21, 4, { c: K.red, top: "#d8553f", flat: true }, { line: 0 });
  }
  // the cabin: dark glass, the roof in the body's colour (a wagon's runs to the back)
  const c0 = 1.55;
  const c1 = wagon ? 4.7 : 3.95;
  b(c0, 0.3, c1 - c0, 1.4, 31, 20, GLASS, { line: 0.9 });
  b(c0 + 0.12, 0.34, c1 - c0 - 0.2, 1.32, 51, 4, body, { line: 0.9 });
  if (snowy) {
    b(c0 + 0.2, 0.42, c1 - c0 - 0.4, 1.16, 55, 3, SNOW, { line: 0.6 });
    b(0.25, 0.3, 1.1, 1.4, 31, 2, SNOW, { line: 0.5 });
    if (!wagon) b(c1 + 0.15, 0.3, 4.75 - c1 - 0.2, 1.4, 31, 2, SNOW, { line: 0.5 });
  }
  s.shadow(0.1 + ox, 0.1 + oy, 4.8, 1.8, 0.4, 0.4);
}

// A cobra-head lamp post over the lot: a tall steel pole, the arm, the head
// lit (the light map makes its pool at night).
export function lampPost(s: Sketch) {
  const POLE: Mat = { c: "#6c7074", top: "#7e8286", left: "#74787c", right: "#5c6064" };
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.14, h: 8, mat: { c: "#9a9690", top: "#b0aca5" }, line: 0.9 });
  s.cyl({ x: 0.5, y: 0.5, z: 8, r: 0.06, h: 340, mat: POLE, line: 0.8 });
  s.box({ x: 0.46, y: 0.46, w: 1.9, d: 0.08, z: 342, h: 5, mat: POLE, line: 0.7 });
  s.box({ x: 1.95, y: 0.36, w: 0.6, d: 0.28, z: 337, h: 9, mat: POLE, line: 0.8 });
  s.box({
    x: 2.0,
    y: 0.4,
    w: 0.5,
    d: 0.2,
    z: 335,
    h: 2,
    mat: { c: "#fff2cc", top: "#fffaf0", flat: true },
    glow: true,
    line: 0,
  });
  s.shadowDot(0.5, 0.5, 0.2, 0.35);
}
