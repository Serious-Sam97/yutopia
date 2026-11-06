// Edits to a structure as operations (docs/plan/72-the-3d-core.md, phase 6): what the server
// applies, saves and sends, and every browser applies the same — never the whole building again.
// Each has its inverse (undo), worked out from the structure it's applied to. A structure carries
// a revision; a batch of operations goes from one to the next.
//
// The build tool still edits tile maps (phase 11 replaces it): the server checks an edit by the old
// rules, then `diffStructures` turns its result into these operations. The verbs a free tool needs
// (move a wall's end, split it, join two) are made of the same: walls taken away and put in.
import type { Floor, Roof, Room, Slab, Structure, Wall, XY } from "./types.ts";

export type StructOp =
  /** walls taken away (by id), then walls put in */
  | { op: "walls"; remove: string[]; add: Wall[] }
  /** a floor's slabs, all of them, as they are now */
  | { op: "slabs"; floor: number; slabs: Slab[] }
  /** a floor's rooms, in order (an earlier one wins where they overlap at the same priority) */
  | { op: "rooms"; floor: number; rooms: Room[] }
  /** a floor's roofs, all of them (phase 11.7) */
  | { op: "roofs"; floor: number; roofs: Roof[] }
  /** the floors (their places, names, sizes), in order */
  | { op: "floors"; floors: Floor[] }
  /** the world's own: where people arrive, the core, the home floor */
  | { op: "meta"; spawn?: XY; core?: XY | null; home?: number };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A structure with operations applied (a new one; the old is left as it was). Throws on an
 *  operation that doesn't fit (a wall taken away that isn't there, two walls with one id). */
export function applyOps(s: Structure, ops: StructOp[]): Structure {
  let walls = s.walls;
  let slabs = s.slabs;
  let rooms = s.rooms;
  let roofs = s.roofs ?? [];
  let floors = s.floors;
  let meta: Partial<Structure> = {};
  for (const o of ops) {
    if (o.op === "walls") {
      const gone = new Set(o.remove);
      for (const id of gone) if (!walls.some((w) => w.id === id)) throw new Error(`no wall ${id}`);
      const kept = walls.filter((w) => !gone.has(w.id));
      const ids = new Set(kept.map((w) => w.id));
      for (const w of o.add) {
        if (ids.has(w.id)) throw new Error(`wall ${w.id} twice`);
        if (![...w.a, ...w.b, w.base, w.height].every(Number.isFinite)) throw new Error(`wall ${w.id}: not a place`);
        ids.add(w.id);
      }
      walls = [...kept, ...o.add];
    } else if (o.op === "slabs") {
      slabs = [...slabs.filter((x) => x.floor !== o.floor), ...o.slabs.map((x) => ({ ...x, floor: o.floor }))];
    } else if (o.op === "rooms") {
      rooms = [...rooms.filter((r) => r.floor !== o.floor), ...o.rooms.map((r) => ({ ...r, floor: o.floor }))];
    } else if (o.op === "roofs") {
      roofs = [...roofs.filter((r) => r.floor !== o.floor), ...o.roofs.map((r) => ({ ...r, floor: o.floor }))];
    } else if (o.op === "floors") {
      floors = o.floors;
      const have = new Set(floors.map((f) => f.index));
      // (a floor gone: what stood on it goes with it)
      walls = walls.filter((w) => have.has(w.floor));
      slabs = slabs.filter((x) => have.has(x.floor));
      rooms = rooms.filter((r) => have.has(r.floor));
      roofs = roofs.filter((r) => have.has(r.floor));
    } else if (o.op === "meta") {
      const { op: _op, core, ...rest } = o;
      meta = { ...meta, ...rest, ...(core !== undefined ? { core: core ?? undefined } : {}) };
    }
  }
  const out: Structure = { ...s, ...meta, walls, slabs, rooms, floors, ...(roofs.length || s.roofs ? { roofs } : {}) };
  if (out.core === undefined) delete out.core;
  return out;
}

/** What undoes `ops` on `s` (apply it to applyOps(s, ops) and `s` comes back). */
export function invertOps(s: Structure, ops: StructOp[]): StructOp[] {
  const back: StructOp[] = [];
  let at = s;
  for (const o of ops) {
    if (o.op === "walls")
      back.push({ op: "walls", remove: o.add.map((w) => w.id), add: at.walls.filter((w) => o.remove.includes(w.id)) });
    else if (o.op === "slabs")
      back.push({ op: "slabs", floor: o.floor, slabs: at.slabs.filter((x) => x.floor === o.floor) });
    else if (o.op === "rooms")
      back.push({ op: "rooms", floor: o.floor, rooms: at.rooms.filter((r) => r.floor === o.floor) });
    else if (o.op === "roofs")
      back.push({ op: "roofs", floor: o.floor, roofs: (at.roofs ?? []).filter((r) => r.floor === o.floor) });
    else if (o.op === "floors") {
      // (a floor taken away takes what stood on it: all of that back too)
      back.push({ op: "floors", floors: at.floors });
      const gone = new Set(at.floors.map((f) => f.index).filter((i) => !o.floors.some((f) => f.index === i)));
      if (gone.size) {
        back.push({ op: "walls", remove: [], add: at.walls.filter((w) => gone.has(w.floor)) });
        for (const i of gone) {
          back.push({ op: "slabs", floor: i, slabs: at.slabs.filter((x) => x.floor === i) });
          back.push({ op: "rooms", floor: i, rooms: at.rooms.filter((r) => r.floor === i) });
          back.push({ op: "roofs", floor: i, roofs: (at.roofs ?? []).filter((r) => r.floor === i) });
        }
      }
    } else if (o.op === "meta")
      back.push({
        op: "meta",
        ...(o.spawn ? { spawn: at.spawn } : {}),
        ...(o.core !== undefined ? { core: at.core ?? null } : {}),
        ...(o.home !== undefined ? { home: at.home } : {}),
      });
    at = applyOps(at, [o]);
  }
  return back.reverse();
}

/** The operations that make `a` into `b` (none when they're the same). */
export function diffStructures(a: Structure, b: Structure): StructOp[] {
  const ops: StructOp[] = [];
  if (!same(a.floors, b.floors)) ops.push({ op: "floors", floors: b.floors });
  const aw = new Map(a.walls.map((w) => [w.id, w]));
  const bw = new Map(b.walls.map((w) => [w.id, w]));
  const remove = a.walls.filter((w) => !same(w, bw.get(w.id))).map((w) => w.id);
  const add = b.walls.filter((w) => !same(w, aw.get(w.id)));
  // (walls on a floor that went are taken with it by "floors")
  const floorsB = new Set(b.floors.map((f) => f.index));
  const removeLive = remove.filter((id) => floorsB.has((aw.get(id) as Wall).floor));
  if (removeLive.length || add.length) ops.push({ op: "walls", remove: removeLive, add });
  for (const f of b.floors) {
    const sa = a.slabs.filter((x) => x.floor === f.index);
    const sb = b.slabs.filter((x) => x.floor === f.index);
    if (!same(sa, sb)) ops.push({ op: "slabs", floor: f.index, slabs: sb });
    const ra = a.rooms.filter((r) => r.floor === f.index);
    const rb = b.rooms.filter((r) => r.floor === f.index);
    if (!same(ra, rb)) ops.push({ op: "rooms", floor: f.index, rooms: rb });
    const oa = (a.roofs ?? []).filter((r) => r.floor === f.index);
    const ob = (b.roofs ?? []).filter((r) => r.floor === f.index);
    if (!same(oa, ob)) ops.push({ op: "roofs", floor: f.index, roofs: ob });
  }
  const meta: StructOp & { op: "meta" } = { op: "meta" };
  if (!same(a.spawn, b.spawn)) meta.spawn = b.spawn;
  if (!same(a.core, b.core)) meta.core = b.core ?? null;
  if (a.home !== b.home) meta.home = b.home;
  if (Object.keys(meta).length > 1) ops.push(meta);
  return ops;
}
