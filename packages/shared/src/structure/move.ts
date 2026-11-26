// Moving the structure (docs/plan/130-the-house-build.md, phase 2 — The Sims 4's room manipulation): a wall's end
// dragged (the walls joined there follow), a wall pushed or pulled square to itself (its neighbours' ends with it), a
// room moved, turned a quarter or copied whole — its walls, its floors, its roofs, and (the server's part) the things in
// it — or knocked down (the sledgehammer with Ctrl). Walls keep their ids when they move; a room's walls it shares with
// another room stay where they are for that room, and the moved room takes copies of them.

import { WALL_MAX, WALL_MIN } from "./edit.ts";
import type { StructOp } from "./ops.ts";
import { inRing } from "./rings.ts";
import type { Roof, Room, Slab, Structure, Wall, XY } from "./types.ts";

/** A wall's new ends. */
export interface WallMove {
  id: string;
  a: XY;
  b: XY;
}
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const near = (p: XY, q: XY, d = 0.02) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= d;
const p3 = (p: XY): XY => [r3(p[0]), r3(p[1])];

/** Why these walls can't go to these ends (null: they can): each on the floor, not a building's own, long enough, on
 *  the floor's grid, long enough still for what's set in it (`cutsTo`: how far along it its openings reach). */
export function movesWhy(
  s: Structure,
  floor: number,
  moves: readonly WallMove[],
  cutsTo: (id: string) => number = () => 0,
): string | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return "no such floor";
  const { x0, y0, w, h } = f.grid;
  const on = (p: XY) =>
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] >= x0 - 0.01 &&
    p[1] >= y0 - 0.01 &&
    p[0] <= x0 + w + 0.01 &&
    p[1] <= y0 + h + 0.01;
  for (const m of moves) {
    const wl = s.walls.find((q) => q.id === m.id && q.floor === floor);
    if (!wl) return "no such wall";
    if (wl.shell) return "the building's own wall";
    if (!on(m.a) || !on(m.b)) return "off the floor";
    const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
    if (len < WALL_MIN) return "too short";
    if (len > WALL_MAX) return "too long";
    if (wl.bow !== undefined && Math.abs(wl.bow) > len / 2 + 1e-3) return "its arc's too deep for that";
    if (cutsTo(m.id) > len + 1e-3) return "shorter than what's set in it";
  }
  return null;
}
/** The walls at these ends: the operation (ids kept). */
export function movesOp(s: Structure, moves: readonly WallMove[]): StructOp {
  const by = new Map(moves.map((m) => [m.id, m]));
  const walls = s.walls.filter((w) => by.has(w.id));
  return {
    op: "walls",
    remove: walls.map((w) => w.id),
    add: walls.map((w) => {
      const m = by.get(w.id) as WallMove;
      return { ...w, a: p3(m.a), b: p3(m.b) };
    }),
  };
}

/** The rooms whose corners stood where the moved walls' ends were: those corners with them (a room pushed out
 *  grows, pulled in shrinks — plan 72's rooms never grow by themselves). The operation, or null: none. */
export function roomsFollow(s: Structure, floor: number, moves: readonly WallMove[]): StructOp | null {
  const pts: [XY, XY][] = [];
  for (const m of moves) {
    const w = s.walls.find((q) => q.id === m.id);
    if (!w) continue;
    pts.push([w.a, m.a], [w.b, m.b]);
  }
  let changed = false;
  const rooms = s.rooms
    .filter((r) => r.floor === floor)
    .map((r) => {
      let hit = false;
      const outline = r.outline.map((p) => {
        const to = pts.find(([was]) => near(was, p))?.[1];
        if (!to) return p;
        hit = true;
        return p3(to);
      });
      if (!hit) return r;
      changed = true;
      const xs = outline.map((p) => p[0]);
      const ys = outline.map((p) => p[1]);
      return {
        ...r,
        outline,
        rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number],
      };
    });
  return changed ? { op: "rooms", floor, rooms } : null;
}

/** A wall's end dragged to `to`: it, and every wall on the floor whose end was there, with it. */
export function endMoves(s: Structure, floor: number, id: string, end: "a" | "b", to: XY): WallMove[] {
  const w = s.walls.find((q) => q.id === id && q.floor === floor);
  if (!w) return [];
  const at = w[end];
  const out: WallMove[] = [];
  for (const q of s.walls) {
    if (q.floor !== floor || q.shell) continue;
    const a = near(q.a, at) ? to : q.a;
    const b = near(q.b, at) ? to : q.b;
    if (q.id === id || a !== q.a || b !== q.b) out.push({ id: q.id, a, b });
  }
  return out;
}

/** A wall pushed (or pulled) `d` metres square to itself (to its left, +): it, and the ends of the walls that meet it
 *  there along with it — a wall joining it end to end along its own line stays (it'd be pulled apart). */
export function pushMoves(s: Structure, floor: number, id: string, d: number): WallMove[] {
  const w = s.walls.find((q) => q.id === id && q.floor === floor);
  if (!w) return [];
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const n: XY = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L];
  const off = (p: XY): XY => [p[0] + n[0] * d, p[1] + n[1] * d];
  const out: WallMove[] = [{ id, a: off(w.a), b: off(w.b) }];
  for (const q of s.walls) {
    if (q.floor !== floor || q.id === id || q.shell) continue;
    let a = q.a;
    let b = q.b;
    for (const e of [w.a, w.b]) {
      if (near(q.a, e)) a = off(e);
      if (near(q.b, e)) b = off(e);
    }
    if (a === q.a && b === q.b) continue;
    // (along its own line: a wall carrying on from it is moved whole only if it's a stub, else left)
    const qL = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) || 1;
    const cross = Math.abs(((q.b[0] - q.a[0]) * n[0] + (q.b[1] - q.a[1]) * n[1]) / qL);
    if (cross < 0.2) continue;
    out.push({ id: q.id, a, b });
  }
  return out;
}

// ── a room's pieces ───────────────────────────────────────────────────────────────────────────────────────────────
/** A transform of the plan: turned `turn` quarters (clockwise from above: x → y) about `c`, then moved by `d`. */
export interface PlanMove {
  c: XY;
  d: XY;
  turn: number;
}
export const planPoint = (t: PlanMove, p: XY): XY => {
  const q = ((t.turn % 4) + 4) % 4;
  let [x, y] = [p[0] - t.c[0], p[1] - t.c[1]];
  for (let i = 0; i < q; i++) [x, y] = [-y, x];
  return [r3(t.c[0] + x + t.d[0]), r3(t.c[1] + y + t.d[1])];
};
/** The yaw a thing turned with the plan has (radians; +: x → y). */
export const planYaw = (t: PlanMove, yaw: number): number => yaw + ((((t.turn % 4) + 4) % 4) * Math.PI) / 2;

const onRing = (r: readonly XY[], p: XY, tol = 0.16): boolean => {
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i], r[(i + 1) % r.length]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) <= tol) return true;
  }
  return false;
};
const mid = (w: { a: XY; b: XY }): XY => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
const middleOf = (r: readonly XY[]): XY => {
  let [x, y] = [0, 0];
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
};

/** What a room is made of on its floor: the walls round it and in it (`own`: its alone; `shared`: on its edge with
 *  another room the other side), the slabs and roofs inside it, and whether a point's in it. */
export function roomPieces(
  s: Structure,
  key: string,
): { room: Room; own: Wall[]; shared: Wall[]; slabs: Slab[]; roofs: Roof[]; inside: (p: XY) => boolean } | null {
  const room = s.rooms.find((r) => r.key === key);
  if (!room) return null;
  const ring = room.outline;
  const inside = (p: XY) => inRing(ring, p[0], p[1]) || onRing(ring, p, 0.02);
  const others = s.rooms.filter((r) => r.floor === room.floor && r.key !== key);
  const own: Wall[] = [];
  const shared: Wall[] = [];
  for (const w of s.walls) {
    if (w.floor !== room.floor || w.shell) continue;
    const m = mid(w);
    const edge = onRing(ring, w.a) && onRing(ring, w.b) && onRing(ring, m);
    if (!edge && !inRing(ring, m[0], m[1])) continue;
    if (!edge) {
      own.push(w);
      continue;
    }
    // (on its edge: whose side is the other — another room's, shared)
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const n: XY = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L];
    const sides: XY[] = [
      [m[0] + n[0] * 0.3, m[1] + n[1] * 0.3],
      [m[0] - n[0] * 0.3, m[1] - n[1] * 0.3],
    ];
    const out = sides.find((p) => !inRing(ring, p[0], p[1])) ?? sides[0];
    if (others.some((o) => inRing(o.outline, out[0], out[1]))) shared.push(w);
    else own.push(w);
  }
  const slabs = s.slabs.filter((x) => x.floor === room.floor && x.outline.every((p) => inside(p)) && x.top !== "g");
  const roofs = (s.roofs ?? []).filter((x) => x.floor === room.floor && inside(middleOf(x.outline)));
  return { room, own, shared, slabs, roofs, inside };
}

/** A room moved, turned or copied (`copy`: the room left as it was, a copy put down) — the operations, the room's
 *  new key (a copy's) and its middle; or why not. `newId` gives a copy's pieces their ids; `roomKey` a copied room's. */
export function roomMoveOps(
  s: Structure,
  key: string,
  t: { d: XY; turn: number; copy: boolean },
  newId: (kind: "wall" | "slab" | "roof") => string,
  roomKey: () => string,
): { ops: StructOp[]; key: string; move: PlanMove } | { why: string } {
  const pc = roomPieces(s, key);
  if (!pc) return { why: "no such room" };
  const { room, own, shared, slabs, roofs } = pc;
  const f = s.floors.find((q) => q.index === room.floor);
  if (!f) return { why: "no such floor" };
  const c = middleOf(room.outline);
  const move: PlanMove = { c, d: t.d, turn: t.turn };
  const P = (p: XY) => planPoint(move, p);
  const { x0, y0, w, h } = f.grid;
  const on = (p: XY) => p[0] >= x0 - 0.01 && p[1] >= y0 - 0.01 && p[0] <= x0 + w + 0.01 && p[1] <= y0 + h + 0.01;
  const moved = [...own, ...shared].flatMap((q) => [P(q.a), P(q.b)]);
  if (!moved.every(on) || !room.outline.map(P).every(on)) return { why: "off the floor" };
  // (the walls: its own moved — copies if it's a copy —, those it shares left for the room next door and copied)
  const kept = t.copy ? [...own, ...shared] : shared;
  const walls: Wall[] = [
    ...(t.copy ? [] : own.map((q) => ({ ...q, a: P(q.a), b: P(q.b) }))),
    ...kept.map((q) => ({ ...q, id: newId("wall"), a: P(q.a), b: P(q.b) })),
  ];
  const ops: StructOp[] = [{ op: "walls", remove: t.copy ? [] : own.map((q) => q.id), add: walls }];
  const slabMoved = (x: Slab, id: string): Slab => ({
    ...x,
    id,
    outline: x.outline.map(P),
    holes: x.holes.map((hh) => hh.map(P)),
  });
  const movedSlabs = new Set(slabs.map((x) => x.id));
  ops.push({
    op: "slabs",
    floor: room.floor,
    slabs: [
      ...s.slabs.filter((x) => x.floor === room.floor && (t.copy || !movedSlabs.has(x.id))),
      ...slabs.map((x) => slabMoved(x, t.copy ? newId("slab") : x.id)),
    ],
  });
  if (roofs.length) {
    const movedRoofs = new Set(roofs.map((x) => x.id));
    ops.push({
      op: "roofs",
      floor: room.floor,
      roofs: [
        ...(s.roofs ?? []).filter((x) => x.floor === room.floor && (t.copy || !movedRoofs.has(x.id))),
        ...roofs.map((x) => ({
          ...x,
          id: t.copy ? newId("roof") : x.id,
          outline: x.outline.map(P),
          ...(x.ridge !== undefined && t.turn % 2 ? { ridge: (1 - x.ridge) as 0 | 1 } : {}),
        })),
      ],
    });
  }
  // (the room itself: its outline where it went; a copy's its own key and name)
  const ring = room.outline.map(P);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const rect: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const nk = t.copy ? roomKey() : room.key;
  const placed: Room = {
    ...room,
    key: nk,
    outline: ring,
    rect,
    props: t.copy ? { ...room.props, name: `${String(room.props.name ?? "Room")} (copy)`, ownerId: null } : room.props,
  };
  const rooms = s.rooms.filter((r) => r.floor === room.floor);
  ops.push({
    op: "rooms",
    floor: room.floor,
    rooms: t.copy ? [...rooms, placed] : rooms.map((r) => (r.key === room.key ? placed : r)),
  });
  return { ops, key: nk, move };
}

/** A room knocked down (the sledgehammer with Ctrl): its own walls, its floors and roofs, the room — the operations
 *  (the things in it are the server's), or why not. */
export function roomRemoveOps(
  s: Structure,
  key: string,
): { ops: StructOp[]; inside: (p: XY) => boolean } | { why: string } {
  const pc = roomPieces(s, key);
  if (!pc) return { why: "no such room" };
  const { room, own, slabs, roofs, inside } = pc;
  const gone = new Set(slabs.map((x) => x.id));
  const ops: StructOp[] = [
    { op: "walls", remove: own.map((q) => q.id), add: [] },
    { op: "slabs", floor: room.floor, slabs: s.slabs.filter((x) => x.floor === room.floor && !gone.has(x.id)) },
    { op: "rooms", floor: room.floor, rooms: s.rooms.filter((r) => r.floor === room.floor && r.key !== key) },
  ];
  if (roofs.length) {
    const rg = new Set(roofs.map((x) => x.id));
    ops.push({
      op: "roofs",
      floor: room.floor,
      roofs: (s.roofs ?? []).filter((x) => x.floor === room.floor && !rg.has(x.id)),
    });
  }
  return { ops, inside };
}
