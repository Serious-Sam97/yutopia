// Blueprints (docs/plan/130-the-house-build.md, phase 12 — F12b: your own saves only, no starter houses): a lot's house
// as it stands — its storeys (by number, how high each rises), their walls, floors, roofs, rooms' shapes, the house
// layers (painted tiles, the foundation's pads, the stairs, the pools, a basement's dig) and the things in it —
// measured from the lot's corner, so it's built again on any lot it fits. Saved to the API (the person's own), built
// by the world server on the owner's empty lot (`blueprintBuild`): its storeys added, its foundation raised, every
// piece a new id (a door's wall followed to its new one).

import type { WorldObjectDef } from "./catalog.ts";
import { GROUND_TOP, type HomeLotDef, lotFloors, STOREY_RISES, type StoreyRise, storeyAddOps } from "./homes.ts";
import { applyOps, diffStructures, type StructOp } from "./structure/ops.ts";
import type { Floor, Roof, Slab, Structure, Wall, XY } from "./structure/types.ts";
import { SLAB } from "./units.ts";

export const BLUEPRINT_V = 1;
/** The house layers a blueprint carries (by name), and the most a blueprint's JSON may weigh. */
const LAYERS = ["tiles", "found", "flights", "pools", "dig"] as const;
export const BLUEPRINT_MAX_BYTES = 400_000;

type Rel<T> = Omit<T, "id" | "floor"> & { id: string };
export interface BlueprintStorey {
  storey: number;
  rise: StoreyRise;
  walls: Rel<Wall>[];
  slabs: Rel<Slab>[];
  roofs: Rel<Roof>[];
  layers: Partial<Record<(typeof LAYERS)[number], unknown>>;
}
export interface BlueprintThing {
  storey: number;
  kind: string;
  x: number;
  y: number;
  yaw: number;
  props: Record<string, unknown>;
}
export interface BlueprintData {
  v: number;
  /** the lot it came from: its size (m) */
  w: number;
  d: number;
  /** its foundation's height (m; 0 none) */
  found: number;
  storeys: BlueprintStorey[];
  things: BlueprintThing[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const riseOf = (f: Floor): StoreyRise => {
  const h = (f.ceil ?? 3.266 - SLAB) + SLAB;
  let best: StoreyRise = "normal";
  for (const [k, v] of Object.entries(STOREY_RISES) as [StoreyRise, number][])
    if (Math.abs(v - h) < Math.abs(STOREY_RISES[best] - h)) best = k;
  return best;
};
const shiftXY = (p: XY, dx: number, dy: number): XY => [r3(p[0] + dx), r3(p[1] + dy)];
/** A layer's data moved by (dx, dy): its rings, its points, its "x,y" keys (tiles). */
function shiftLayer(name: string, data: unknown, dx: number, dy: number): unknown {
  if (data == null) return data;
  if (name === "tiles") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const [x, y] = k.split(",").map(Number);
      out[`${Math.round(x + dx)},${Math.round(y + dy)}`] = v;
    }
    return out;
  }
  return (data as Record<string, unknown>[]).map((q) => ({
    ...q,
    ...(Array.isArray(q.ring) ? { ring: (q.ring as XY[]).map((p) => shiftXY(p, dx, dy)) } : {}),
    ...(typeof q.x === "number" && typeof q.y === "number" ? { x: r3(q.x + dx), y: r3(q.y + dy) } : {}),
  }));
}

/** A lot's house as a blueprint (its storeys, its things), measured from the lot's corner. */
export function blueprintOf(st: Structure, lot: HomeLotDef, things: readonly WorldObjectDef[]): BlueprintData | string {
  const floors = lotFloors(st, lot.key).filter((f) => !f.away);
  const ground = floors.find((f) => (f.storey ?? 0) === 0);
  if (!ground) return "that lot's nobody's";
  const [ox, oy] = [lot.x0, lot.z0];
  const found = ground.found ?? 0;
  const storeys: BlueprintStorey[] = floors.map((f) => {
    const dz = (z: number) => r3(z - f.z);
    const layers: BlueprintStorey["layers"] = {};
    for (const n of LAYERS) {
      const d = st.layers?.[n]?.[String(f.index)];
      if (d != null) layers[n] = shiftLayer(n, d, -ox, -oy);
    }
    return {
      storey: f.storey ?? 0,
      rise: riseOf(f),
      walls: st.walls
        .filter((w) => w.floor === f.index && !w.shell)
        .map(({ floor: _f, ...w }) => ({
          ...w,
          a: shiftXY(w.a, -ox, -oy),
          b: shiftXY(w.b, -ox, -oy),
          base: dz(w.base),
        })),
      // (the lot's ground — the land — isn't the house's)
      slabs: st.slabs
        .filter((s) => s.floor === f.index && s.top !== GROUND_TOP)
        .map(({ floor: _f, ...s }) => ({
          ...s,
          z: dz(s.z),
          outline: s.outline.map((p) => shiftXY(p, -ox, -oy)),
          holes: s.holes.map((h) => h.map((p) => shiftXY(p, -ox, -oy))),
        })),
      roofs: (st.roofs ?? [])
        .filter((r) => r.floor === f.index)
        .map(({ floor: _f, ...r }) => ({
          ...r,
          z: dz(r.z),
          ...(r.top !== undefined ? { top: dz(r.top) } : {}),
          outline: r.outline.map((p) => shiftXY(p, -ox, -oy)),
        })),
      layers,
    };
  });
  const byIndex = new Map(floors.map((f) => [f.index, f.storey ?? 0]));
  const out: BlueprintThing[] = [];
  for (const o of things) {
    const lv = Number(o.props?.level);
    const storey = byIndex.get(lv);
    if (storey === undefined) continue;
    const { level: _l, ...props } = o.props ?? {};
    out.push({ storey, kind: o.kind, x: r3(o.x - ox), y: r3(o.y - oy), yaw: o.yaw ?? 0, props });
  }
  return { v: BLUEPRINT_V, w: r3(lot.x1 - lot.x0), d: r3(lot.z1 - lot.z0), found, storeys, things: out };
}

/** Why a lot can't take a blueprint (null: it can): its owner's, empty (its ground storey alone, nothing on it), big
 *  enough. */
export function blueprintWhy(
  st: Structure,
  lot: HomeLotDef,
  bp: BlueprintData,
  things: readonly WorldObjectDef[],
): string | null {
  if (bp?.v !== BLUEPRINT_V || !Array.isArray(bp.storeys) || !Array.isArray(bp.things)) return "not a blueprint";
  const floors = lotFloors(st, lot.key).filter((f) => !f.away);
  if (!floors.length) return "that lot's nobody's";
  if (floors.length > 1) return "build it on an empty lot (take its storeys off first)";
  const g = floors[0];
  if (st.walls.some((w) => w.floor === g.index) || (st.roofs ?? []).some((r) => r.floor === g.index))
    return "build it on an empty lot";
  if (st.slabs.some((s) => s.floor === g.index && s.top !== GROUND_TOP)) return "build it on an empty lot";
  if (things.some((o) => Number(o.props?.level) === g.index)) return "build it on an empty lot (its things too)";
  if (bp.w > lot.x1 - lot.x0 + 1e-6 || bp.d > lot.z1 - lot.z0 + 1e-6) return "it's bigger than this lot";
  if (!bp.storeys.some((q) => q.storey === 0)) return "no ground storey in it";
  return null;
}

/** A blueprint built on a lot: the structure's operations (one diff: its storeys, its foundation, its pieces) and its
 *  things (new ids), or why not. */
export function blueprintBuild(
  st: Structure,
  lot: HomeLotDef,
  bp: BlueprintData,
  things: readonly WorldObjectDef[],
  newId: (k: string) => string,
): { ops: StructOp[]; things: WorldObjectDef[] } | string {
  const why = blueprintWhy(st, lot, bp, things);
  if (why) return why;
  let s = st;
  // its storeys: up from the ground, then down
  const ups = bp.storeys.filter((q) => q.storey > 0).sort((a, b) => a.storey - b.storey);
  const downs = bp.storeys.filter((q) => q.storey < 0).sort((a, b) => b.storey - a.storey);
  for (const [list, dir] of [
    [ups, "up"],
    [downs, "down"],
  ] as const)
    for (const q of list) {
      const ops = storeyAddOps(s, lot, dir, q.rise);
      if (typeof ops === "string") return ops;
      s = applyOps(s, ops);
    }
  // its foundation: the storeys over the land raised by it (the ground's floor its top)
  const F = Math.max(0, Math.min(1.5, Number(bp.found) || 0));
  const floors = lotFloors(s, lot.key).filter((f) => !f.away);
  if (F > 0) {
    const mine = new Set(floors.filter((f) => (f.storey ?? 0) >= 0).map((f) => f.index));
    s = applyOps(s, [
      {
        op: "floors",
        floors: s.floors.map((f) =>
          mine.has(f.index) ? { ...f, z: r3(f.z + F), ...((f.storey ?? 0) === 0 ? { found: F } : {}) } : f,
        ),
      },
    ]);
  }
  const at = new Map(lotFloors(s, lot.key).map((f) => [f.storey ?? 0, f]));
  const [ox, oy] = [lot.x0, lot.z0];
  const wallIds = new Map<string, string>();
  const flightIds = new Map<string, string>();
  for (const q of bp.storeys)
    for (const f of (q.layers.flights as { id: string }[] | undefined) ?? []) flightIds.set(f.id, newId("flight"));
  const ops: StructOp[] = [];
  const walls: Wall[] = [];
  for (const q of bp.storeys) {
    const f = at.get(q.storey);
    if (!f) return "a storey's missing";
    const up = (z: number) => r3(z + f.z);
    for (const w of q.walls) {
      // (a stair's rail keeps its stair's name: rail-<flight>-<n>)
      const m = /^rail-(.+)-(\d+)$/.exec(w.id);
      const id = m && flightIds.has(m[1]) ? `rail-${flightIds.get(m[1])}-${m[2]}` : newId("wall");
      wallIds.set(w.id, id);
      walls.push({ ...w, id, floor: f.index, a: shiftXY(w.a, ox, oy), b: shiftXY(w.b, ox, oy), base: up(w.base) });
    }
    const slabs = s.slabs.filter((x) => x.floor === f.index && x.top === GROUND_TOP);
    for (const sl of q.slabs)
      slabs.push({
        ...sl,
        id: newId("slab"),
        floor: f.index,
        z: up(sl.z),
        outline: sl.outline.map((p) => shiftXY(p, ox, oy)),
        holes: sl.holes.map((h) => h.map((p) => shiftXY(p, ox, oy))),
      });
    ops.push({ op: "slabs", floor: f.index, slabs });
    ops.push({
      op: "roofs",
      floor: f.index,
      roofs: q.roofs.map((r) => ({
        ...r,
        id: newId("roof"),
        floor: f.index,
        z: up(r.z),
        ...(r.top !== undefined ? { top: up(r.top) } : {}),
        outline: r.outline.map((p) => shiftXY(p, ox, oy)),
      })),
    });
    for (const n of LAYERS) {
      const d = q.layers[n];
      if (d == null) continue;
      let data = shiftLayer(n, d, ox, oy);
      if (n === "flights")
        data = (data as { id: string }[]).map((x) => ({ ...x, id: flightIds.get(x.id) ?? newId("flight") }));
      if (n === "pools") data = (data as { id: string }[]).map((x) => ({ ...x, id: newId("pool") }));
      ops.push({ op: "layer", name: n, floor: f.index, data });
    }
  }
  ops.unshift({ op: "walls", remove: [], add: walls });
  s = applyOps(s, ops);
  // its things: on their storeys, moved, a door's or window's wall its new one
  const made: WorldObjectDef[] = [];
  for (const t of bp.things.slice(0, 2000)) {
    const f = at.get(t.storey);
    if (!f || typeof t.kind !== "string") continue;
    const props: Record<string, unknown> = { ...(t.props ?? {}), level: f.index };
    const on = props.on as { wall?: string; at?: number } | undefined;
    if (on?.wall) {
      const w = wallIds.get(on.wall);
      if (!w) continue;
      props.on = { ...on, wall: w };
    }
    made.push({ id: newId("thing"), kind: t.kind, x: r3(t.x + ox), y: r3(t.y + oy), yaw: t.yaw, props });
  }
  return { ops: diffStructures(st, s), things: made };
}
