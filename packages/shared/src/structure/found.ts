// Foundations and basements (docs/plan/130-the-house-build.md, phase 5 — F3b): on a home lot, the house raised on
// foundations — pads (boxes on the plan) of stone, brick, concrete, stucco, logs or a deck on posts, all one height
// (0.25–1.5 m: `Floor.found`, the ground storey's) — and dug into the land under it, one or two basements deep.
//
// The ground storey's own height (`Floor.z`) is its foundation's top: the house's floors, walls and things stand on it
// as on any floor. Round it the yard is the land, `found` lower: a wall or a thing put there stands on the land
// (a wall's base, a thing's props.over — negative). The lot's ground (its `g` slab) stays at the land's height.
// Raising or lowering the foundation moves the whole house (every storey, its walls, floors and roofs) with it.
//
// A basement dug (`dig`, boxes on the ground storey's layer) is a hole in the land there — its heightfield's and its
// drawing's (`landHoles`) — the basement storeys' floors and their walls round it, and a floor over it on the ground
// storey (its lid).

import { WALL_T } from "../units.ts";
import { applyOps, type StructOp } from "./ops.ts";
import { setPoolWater } from "./pools.ts";
import { inRing } from "./rings.ts";
import type { Floor, Slab, Structure, Wall, XY } from "./types.ts";

export const FOUND = "found";
export const DIG = "dig";
export const FOUND_LOW = 0.25;
export const FOUND_HIGH = 1.5;
export const FOUND_STYLES = ["stone", "brick", "concrete", "stucco", "logs", "deck"] as const;
export type FoundStyle = (typeof FOUND_STYLES)[number];
/** A foundation's pad: a box on the plan (world), what its sides are. */
export interface Pad {
  ring: XY[];
  style: FoundStyle;
}
/** A basement dug: a box on the plan. */
export interface Dig {
  ring: XY[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const padsOf = (s: Structure, floor: number): Pad[] =>
  (s.layers?.[FOUND]?.[String(floor)] as Pad[] | undefined) ?? [];
export const digsOf = (s: Structure, floor: number): Dig[] =>
  (s.layers?.[DIG]?.[String(floor)] as Dig[] | undefined) ?? [];
/** Whether (x, y) is on one of a floor's pads. */
export const onPad = (s: Structure, floor: number, p: XY): boolean =>
  padsOf(s, floor).some((q) => inRing(q.ring, p[0], p[1]));
/** How far a floor's yard is under its floor (its foundation's height; 0: none). */
export const foundOf = (s: Structure, floor: number): number => s.floors.find((f) => f.index === floor)?.found ?? 0;
/** Where on a floor (x, y) stands: its floor's height, or in the yard the land's (`found` lower). */
export function overAt(s: Structure, floor: number, p: XY): number {
  const h = foundOf(s, floor);
  return h > 0 && !onPad(s, floor, p) ? -h : 0;
}

const box = (a: XY, b: XY): XY[] => {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [
    [r3(x0), r3(y0)],
    [r3(x1), r3(y0)],
    [r3(x1), r3(y1)],
    [r3(x0), r3(y1)],
  ];
};
const inGrid = (f: Floor, ring: XY[]) =>
  ring.every(
    (p) =>
      p[0] >= f.grid.x0 - 0.01 &&
      p[1] >= f.grid.y0 - 0.01 &&
      p[0] <= f.grid.x0 + f.grid.w + 0.01 &&
      p[1] <= f.grid.y0 + f.grid.h + 0.01,
  );

/** The lot's storeys, the ground's first (the ground storey: storey 0 of its space). */
function storeysOf(s: Structure, ground: Floor): Floor[] {
  return s.floors.filter((f) => f.space !== undefined && f.space === ground.space && !f.away);
}

/** Every storey of the house moved up `dz` (the foundation raised): their heights, their walls, floors, roofs — not the
 *  lot's ground (the land's) nor a wall standing on the land in the yard. */
function raised(s: Structure, ground: Floor, dz: number): StructOp[] {
  if (Math.abs(dz) < 1e-6) return [];
  const on = new Set(storeysOf(s, ground).map((f) => f.index));
  // (the yard's walls stay on the land: those of the ground storey off every pad)
  const yard = (w: Wall) =>
    w.floor === ground.index && !onPad(s, ground.index, [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]);
  // (basements stay where they're dug: only the ground storey and those over it go up)
  const up = new Set(
    storeysOf(s, ground)
      .filter((f) => (f.storey ?? 0) >= 0)
      .map((f) => f.index),
  );
  const walls = s.walls.filter((w) => up.has(w.floor) && !yard(w));
  const ops: StructOp[] = [
    { op: "floors", floors: s.floors.map((f) => (up.has(f.index) ? { ...f, z: r3(f.z + dz) } : f)) },
    { op: "walls", remove: walls.map((w) => w.id), add: walls.map((w) => ({ ...w, base: r3(w.base + dz) })) },
  ];
  for (const i of up) {
    const sl = s.slabs.filter((x) => x.floor === i);
    if (sl.length)
      ops.push({ op: "slabs", floor: i, slabs: sl.map((x) => (x.top === "g" ? x : { ...x, z: r3(x.z + dz) })) });
    const rf = (s.roofs ?? []).filter((x) => x.floor === i);
    if (rf.length) ops.push({ op: "roofs", floor: i, roofs: rf.map((x) => ({ ...x, z: r3(x.z + dz) })) });
  }
  void on;
  return ops;
}

/** A foundation pad laid on a lot's ground storey (a box from a to b, its style, the foundation's height): the pad,
 *  a floor on it (concrete, to be painted), the house raised if the height's new — the operations, or why not. */
export function padOps(
  s: Structure,
  floor: number,
  a: XY,
  b: XY,
  style: FoundStyle,
  height: number,
  newId: () => string,
): StructOp[] | string {
  const f = s.floors.find((q) => q.index === floor);
  if (!f || (f.storey ?? 0) !== 0 || !f.space?.startsWith("home:")) return "foundations go on a lot's ground storey";
  if (!(FOUND_STYLES as readonly string[]).includes(style)) return "not a foundation";
  if (!(height >= FOUND_LOW - 1e-6 && height <= FOUND_HIGH + 1e-6)) return `${FOUND_LOW}–${FOUND_HIGH} m high`;
  const ring = box(a, b);
  const [w, h] = [ring[1][0] - ring[0][0], ring[2][1] - ring[1][1]];
  if (w < 1 || h < 1) return "too small";
  if (!inGrid(f, ring)) return "off the lot";
  const was = f.found ?? 0;
  const ops: StructOp[] = [];
  // (the first pad sets the height; another at a new height raises the house to it — what's on the new pad too)
  const dz = r3(height - was);
  const withPad = applyOps(s, [{ op: "layer", name: FOUND, floor, data: [...padsOf(s, floor), { ring, style }] }]);
  if (Math.abs(dz) > 1e-6) {
    ops.push(...raised(withPad, f, dz));
    ops.push({
      op: "floors",
      floors: (ops.find((o) => o.op === "floors") as { floors: Floor[] }).floors.map((q) =>
        q.index === floor ? { ...q, found: r3(height) } : q,
      ),
    });
  }
  const pads = [...padsOf(s, floor), { ring, style }];
  ops.push({ op: "layer", name: FOUND, floor, data: pads });
  // (a floor on it at the foundation's top: concrete till it's painted)
  const top = r3(f.z + dz);
  const after = s.slabs
    .filter((x) => x.floor === floor)
    .map((x) => (x.top === "g" || Math.abs(dz) < 1e-6 ? x : { ...x, z: r3(x.z + dz) }));
  ops.push({
    op: "slabs",
    floor,
    slabs: [...after, { id: newId(), floor, z: top, top: style === "deck" ? "." : "c", outline: ring, holes: [] }],
  });
  return ops;
}

/** The foundation's height changed: the house with it (the pads stay) — the operations, or why not. */
export function foundHeightOps(s: Structure, floor: number, height: number): StructOp[] | string {
  const f = s.floors.find((q) => q.index === floor);
  if (!f || (f.storey ?? 0) !== 0) return "not a ground storey";
  if (!padsOf(s, floor).length) return "no foundation yet";
  if (!(height >= FOUND_LOW - 1e-6 && height <= FOUND_HIGH + 1e-6)) return `${FOUND_LOW}–${FOUND_HIGH} m high`;
  const dz = r3(height - (f.found ?? 0));
  if (Math.abs(dz) < 1e-6) return "as it is";
  const ops = raised(s, f, dz);
  const fl = ops.find((o) => o.op === "floors") as { floors: Floor[] };
  fl.floors = fl.floors.map((q) => (q.index === floor ? { ...q, found: r3(height) } : q));
  return ops;
}

/** A pad taken away (the one holding `p`). */
export function padRemoveOps(s: Structure, floor: number, p: XY): StructOp[] | string {
  const pads = padsOf(s, floor);
  const i = pads.findIndex((q) => inRing(q.ring, p[0], p[1]));
  if (i < 0) return "no foundation there";
  const rest = pads.filter((_, k) => k !== i);
  const ops: StructOp[] = [{ op: "layer", name: FOUND, floor, data: rest.length ? rest : null }];
  // (the last one gone: the house back down on the land)
  if (!rest.length) {
    const f = s.floors.find((q) => q.index === floor);
    if (f?.found) {
      const down = raised(s, f, -f.found);
      const fl = down.find((o) => o.op === "floors") as { floors: Floor[] };
      fl.floors = fl.floors.map((q) => {
        if (q.index !== floor) return q;
        const { found: _f, ...rest2 } = q;
        return rest2;
      });
      ops.unshift(...down);
    }
  }
  return ops;
}

/** A basement dug (a box from a to b) under a lot's ground storey: the hole in the land, each basement storey's floor
 *  and walls round it, a floor over it (the lid) — the operations, or why not. */
export function digOps(
  s: Structure,
  floor: number,
  a: XY,
  b: XY,
  newId: (k: "wall" | "slab") => string,
): StructOp[] | string {
  const f = s.floors.find((q) => q.index === floor);
  if (!f || (f.storey ?? 0) !== 0 || !f.space?.startsWith("home:")) return "dig from a lot's ground storey";
  const downs = storeysOf(s, f).filter((q) => (q.storey ?? 0) < 0);
  if (!downs.length) return "add a basement storey first (the floor menu)";
  const ring = box(a, b);
  const [w, h] = [ring[1][0] - ring[0][0], ring[2][1] - ring[1][1]];
  if (w < 2 || h < 2) return "2 m a side at least";
  if (!inGrid(f, ring)) return "off the lot";
  const ops: StructOp[] = [{ op: "layer", name: DIG, floor, data: [...digsOf(s, floor), { ring }] }];
  // (each basement: its floor over the box, its walls round it — concrete, thick)
  for (const d of downs) {
    ops.push({
      op: "slabs",
      floor: d.index,
      slabs: [
        ...s.slabs.filter((x) => x.floor === d.index),
        { id: newId("slab"), floor: d.index, z: d.z, top: "c", outline: ring, holes: [] },
      ],
    });
    const walls: Wall[] = ring.map((p, i) => ({
      id: newId("wall"),
      floor: d.index,
      a: p,
      b: ring[(i + 1) % 4],
      base: d.z,
      height: r3(d.ceil ?? 3.25),
      front: "p",
      thick: 0.3,
    }));
    ops.push({ op: "walls", remove: [], add: walls });
  }
  // (the lid: the ground storey's floor over it, unless there's one)
  const lidded = s.slabs.some(
    (x) =>
      x.floor === floor &&
      x.top !== "g" &&
      Math.abs(x.z - f.z) < 1e-3 &&
      ring.every((p) => inRing(x.outline, p[0], p[1]) || near(x.outline, p)),
  );
  if (!lidded)
    ops.push({
      op: "slabs",
      floor,
      slabs: [
        ...s.slabs.filter((x) => x.floor === floor),
        { id: newId("slab"), floor, z: f.z, top: "c", outline: ring, holes: [] },
      ],
    });
  void WALL_T;
  return ops;
}
const near = (r: XY[], p: XY) => r.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.02);

/** The land's holes (world rects): every basement dug, every pool (plan 130) — the heightfield's and the drawing's. */
export function landHolesOf(s: Structure): { x0: number; z0: number; x1: number; z1: number }[] {
  const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
  for (const name of [DIG, "pools"])
    for (const [fl, list] of Object.entries(s.layers?.[name] ?? {})) {
      const f = s.floors.find((q) => q.index === Number(fl));
      if (!f || f.away) continue;
      for (const d of (list as { ring: XY[] }[]) ?? []) {
        const xs = d.ring.map((p) => p[0]);
        const ys = d.ring.map((p) => p[1]);
        out.push({ x0: Math.min(...xs), z0: Math.min(...ys), x1: Math.max(...xs), z1: Math.max(...ys) });
      }
    }
  return out;
}
// (the registry the land asks: set by whoever holds the live structure — the server, the client — as levels.ts's)
let HOLES: { x0: number; z0: number; x1: number; z1: number }[] = [];
let HOLES_SIG = "";
/** The land's holes now; returns whether they changed. */
export function setLandHoles(s: Structure): boolean {
  // (plan 130 phase 11: the pools' water with them — the swim's)
  setPoolWater(s);
  const next = landHolesOf(s);
  const sig = JSON.stringify(next);
  if (sig === HOLES_SIG) return false;
  HOLES = next;
  HOLES_SIG = sig;
  return true;
}
export const landHoles = (): readonly { x0: number; z0: number; x1: number; z1: number }[] => HOLES;
/** Whether the land has a hole at (x, z) (a hair in from its edges: the land meets its walls). */
export function landHoleAt(x: number, z: number): boolean {
  for (const h of HOLES) if (x > h.x0 + 0.01 && x < h.x1 - 0.01 && z > h.z0 + 0.01 && z < h.z1 - 0.01) return true;
  return false;
}
export type { Slab };
