import {
  aboveOf,
  canBeFree,
  entry,
  FLOORS,
  footprint,
  objLevel,
  placeFree,
  quarterOf,
  quarterYaw,
  riseOf,
  roomKey,
  roomsClosedOps,
  thingMiddle,
  type WorldObjectDef,
} from "@yutopia/shared";
import {
  applyOps,
  columnsOf,
  digOps,
  endMoves,
  FLIGHT_SHAPES,
  type Flight,
  type FoundStyle,
  flightAddOps,
  flightRemoveOps,
  flightWhy,
  foundHeightOps,
  freeCuts,
  inRing,
  movesOp,
  movesWhy,
  NEW_ROOM,
  onOf,
  overAt,
  type PlanMove,
  type Pool,
  padOps,
  padRemoveOps,
  painted,
  planPoint,
  planYaw,
  poolAddOps,
  poolRemoveOps,
  pushMoves,
  roomMoveOps,
  roomPieces,
  roomRemoveOps,
  roomsAfterWalls,
  roomsFollow,
  type StructOp,
  slabsHoleOps,
  supportEditWhy,
  TILES_AT_ONCE,
  tilesIn,
  tilesOf,
  tilesOp,
  tilesWhy,
  viewOf,
  type WallMove,
  type XY,
} from "@yutopia/shared/structure";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Building a house (docs/plan/130-the-house-build.md, phase 2 — The Sims 4's room manipulation): walls moved — an end
// dragged, a wall pushed or pulled with its neighbours' ends — and rooms moved, turned, copied or knocked down whole,
// the things in them with them. Each is one undo step (history.ts: the structure's operations and the things).

let seq = 0;
const newId = (k: string) => `${k[0]}${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}`;

registerFeature((room: WorldRoom) => {
  const me = (c: WorldClient) => room.state.players.get(c.sessionId);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const objects = (): WorldObjectDef[] => [...room.state.objects.values()].map(fromSchema);
  const save = (o: WorldObjectDef) => {
    room.state.objects.set(o.id, toSchema(o));
    if (!config.offline) void api.putObject(o).catch((e) => console.warn("[house] save failed", e.message));
  };
  const drop = (id: string) => {
    room.state.objects.delete(id);
    room.state.holds.delete(id);
    if (!config.offline) void api.deleteObject(id).catch(() => {});
  };
  /** The floor an edit's on, if `c` may build there (a lot's: its owner's — plan 130; a town building's: admins'). */
  const floorFor = (c: WorldClient, level: unknown): number | null => {
    const p = me(c);
    const l = Number(level);
    if (!p?.builder || !Number.isInteger(l) || !room.structure.floors.some((f) => f.index === l)) return null;
    const why = room.spaceWhy(p, l);
    if (why) {
      warn(c, `${why[0].toUpperCase()}${why.slice(1)}.`);
      return null;
    }
    return l;
  };
  const lockedOut = (c: WorldClient, ops: StructOp[], level: number): boolean => {
    // (an upper storey over something on the storey under it; a wall holding one up stays — the quality pass)
    const held = supportEditWhy(room.structure, level, ops, (f) => columnsOf(objects(), f));
    if (held) {
      warn(c, `Can't: ${held}.`);
      return true;
    }
    const p = me(c);
    const why = p ? room.lockBreak(p, viewOf(applyOps(room.structure, ops)), [], level) : "no";
    if (why) warn(c, `${why}.`);
    return !!why;
  };
  // (a floor laid by itself upstairs — roomsClosedOps: its slab's id)
  let slabSeq = 0;
  const slabKey = () => `f${Date.now().toString(36)}h${(slabSeq++).toString(36)}`;
  // (found rooms' keys for an edit: none a room has)
  const keys = () => {
    const used = new Set(room.structure.rooms.map((r) => r.key));
    return () => {
      const base = roomKey(NEW_ROOM);
      let key = base;
      for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
      used.add(key);
      return key;
    };
  };

  // ── walls moved: their new ends (an end dragged, a push — the client's moves; checked here) ──
  room.on("struct:wallmove", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    let moves: WallMove[];
    if (m?.push && typeof m.push.id === "string") moves = pushMoves(room.structure, level, m.push.id, Number(m.push.d));
    else if (m?.end && typeof m.end.id === "string")
      moves = endMoves(room.structure, level, m.end.id, m.end.end === "b" ? "b" : "a", [
        Number(m.end.to?.[0]),
        Number(m.end.to?.[1]),
      ]);
    else return;
    if (!moves.length) return;
    const things = objects();
    const why = movesWhy(room.structure, level, moves, (id) => Math.max(0, ...freeCuts(things, id).map((q) => q.u1)));
    if (why) return warn(client, `That wall can't go there: ${why}.`);
    const op = movesOp(room.structure, moves);
    // (the rooms with their corners: pushed out, a room grows — then any split or closed the walls make)
    const follow = roomsFollow(room.structure, level, moves);
    const before = follow ? applyOps(room.structure, [follow]) : room.structure;
    const walled = applyOps(before, [op]);
    const rooms = roomsAfterWalls(before, walled, level, keys());
    // (a room closed upstairs by a wall pushed: its floor, the roof under it lifted — as drawing walls does)
    let closed = roomsClosedOps(rooms ? applyOps(walled, [rooms.op]) : walled, level, rooms?.found ?? [], slabKey);
    const bare = [...(follow ? [follow] : []), op, ...(rooms ? [rooms.op] : [])];
    // (a floor laid by itself that nothing under it holds up: left out, the wall still moves)
    if (closed.length && supportEditWhy(room.structure, level, [...bare, ...closed], (f) => columnsOf(objects(), f)))
      closed = [];
    const ops = [...bare, ...closed];
    if (lockedOut(client, ops, level)) return;
    room.applyStruct(ops);
    room.rebuildGrid();
  });

  // ── a room moved, turned, copied, or knocked down — the things in it with it ──
  room.on("struct:room", (client, m) => {
    const r = room.structure.rooms.find((q) => q.key === m?.key);
    if (!r) return;
    const level = floorFor(client, r.floor);
    if (level === null) return;
    const pieces = roomPieces(room.structure, r.key);
    if (!pieces) return;
    // (what's in it: its middle in the room, on its floor — not hung on a wall: those go with their walls)
    const inside = objects().filter(
      (o) => objLevel(o, room.map) === level && !onOf(o) && pieces.inside(thingMiddle(o)) && entry(o.kind).buildable,
    );
    if (m?.remove) {
      const rr = roomRemoveOps(room.structure, r.key);
      if ("why" in rr) return warn(client, `Can't: ${rr.why}.`);
      if (lockedOut(client, rr.ops, level)) return;
      // (its walls' doors and windows with them)
      const gone = new Set(pieces.own.map((w) => w.id));
      for (const o of objects()) if (onOf(o) && gone.has(String(onOf(o)?.wall))) drop(o.id);
      for (const o of inside) drop(o.id);
      room.applyStruct(rr.ops);
      room.rebuildGrid();
      return;
    }
    const d: XY = [Number(m?.d?.[0] ?? 0), Number(m?.d?.[1] ?? 0)];
    const turn = Number.isInteger(m?.turn) ? (((m.turn as number) % 4) + 4) % 4 : 0;
    if (!d.every(Number.isFinite) || Math.hypot(d[0], d[1]) > 200) return;
    const copy = !!m?.copy;
    const ids = new Map<string, string>();
    const res = roomMoveOps(
      room.structure,
      r.key,
      { d: [Math.round(d[0] * 1000) / 1000, Math.round(d[1] * 1000) / 1000], turn, copy },
      (k) => newId(k),
      keys(),
    );
    if ("why" in res) return warn(client, `Can't move it there: ${res.why}.`);
    // (copied walls: which is whose — a copy's doors and windows go in its copies)
    const wallOp = res.ops.find((o) => o.op === "walls");
    if (wallOp && wallOp.op === "walls")
      for (const w of wallOp.add) {
        if (pieces.own.some((q) => q.id === w.id)) continue;
        const from = [...pieces.own, ...pieces.shared].find(
          (q) => Math.hypot(...(planPoint(res.move, q.a).map((v, i) => v - w.a[i]) as [number, number])) < 1e-3,
        );
        if (from) ids.set(from.id, w.id);
      }
    if (lockedOut(client, res.ops, level)) return;
    room.applyStruct(res.ops);
    const moved = (o: WorldObjectDef, id: string): WorldObjectDef => thingMoved(o, id, res.move);
    for (const o of inside) save(moved(o, copy ? `${o.id.slice(0, 40)}-c${newId("t")}` : o.id));
    // (doors and windows: in the room's own walls they went with them; a copy's in its copies)
    if (copy)
      for (const o of objects()) {
        const on = onOf(o);
        const to = on ? ids.get(String(on.wall)) : undefined;
        if (on && to)
          save({
            ...o,
            id: `${o.id.slice(0, 40)}-c${newId("t")}`,
            props: { ...(o.props ?? {}), on: { ...on, wall: to } },
          });
      }
    room.rebuildGrid();
  });
  // ── a foundation (phase 5): a pad laid, its height changed, a pad taken away — the house with it ──
  room.on("struct:found", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    const pt = (v: unknown): XY | null => {
      const q = v as number[] | undefined;
      return Array.isArray(q) && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1]))
        ? [Number(q[0]), Number(q[1])]
        : null;
    };
    let ops: StructOp[] | string;
    const rm = pt(m?.remove);
    const a = pt(m?.a);
    const b = pt(m?.b);
    if (rm) ops = padRemoveOps(room.structure, level, rm);
    else if (a && b)
      ops = padOps(
        room.structure,
        level,
        a,
        b,
        String(m?.style ?? "stone") as FoundStyle,
        Number(m?.height ?? 0.75),
        () => newId("slab"),
      );
    else if (m?.height !== undefined) ops = foundHeightOps(room.structure, level, Number(m.height));
    else return;
    if (typeof ops === "string") return ops === "as it is" ? undefined : warn(client, `Can't: ${ops}.`);
    if (lockedOut(client, ops, level)) return;
    room.applyStruct(ops);
    yardThings(level);
    room.rebuildGrid();
  });
  // ── a basement dug (phase 5): the land opened, its storeys' floors and walls ──
  room.on("struct:dig", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    const a: XY = [Number(m?.a?.[0]), Number(m?.a?.[1])];
    const b: XY = [Number(m?.b?.[0]), Number(m?.b?.[1])];
    if (![...a, ...b].every(Number.isFinite)) return;
    const ops = digOps(room.structure, level, a, b, (k) => newId(k));
    if (typeof ops === "string") return warn(client, `Can't dig there: ${ops}.`);
    room.applyStruct(ops);
    room.rebuildGrid();
  });
  // ── a pool (phase 11): dug in the yard, or filled in ──
  let poolSeq = 0;
  room.on("struct:pool", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    if (typeof m?.remove === "string") {
      const op = poolRemoveOps(room.structure, level, m.remove);
      if (typeof op === "string") return warn(client, `Can't fill it in: ${op}.`);
      room.applyStruct([op]);
      return room.rebuildGrid();
    }
    const d = m?.add;
    if (!d) return;
    const a: XY = [Number(d.a?.[0]), Number(d.a?.[1])];
    const b: XY = [Number(d.b?.[0]), Number(d.b?.[1])];
    if (![...a, ...b].every(Number.isFinite)) return;
    const op = poolAddOps(
      room.structure,
      level,
      {
        a,
        b,
        depth: Number(d.depth),
        tile: String(d.tile),
        coping: String(d.coping) as Pool["coping"],
        ladder: Number(d.ladder),
        lights: d.lights === true,
      },
      `pool${Date.now().toString(36)}${(poolSeq++).toString(36)}`,
    );
    if (typeof op === "string") return warn(client, `Can't dig a pool there: ${op}.`);
    room.applyStruct([op]);
    room.rebuildGrid();
  });
  /** (phase 5) The things in a lot's yard, off its foundation, stand on the land: `props.over` its foundation's
   *  height under the floor (and none on it). */
  const yardThings = (level: number) => {
    for (const o of objects()) {
      if (objLevel(o, room.map) !== level || onOf(o)) continue;
      const over = overAt(room.structure, level, thingMiddle(o));
      const was = Number(o.props?.over ?? 0) || 0;
      if (Math.abs(over - was) < 1e-6) continue;
      const { over: _o, ...rest } = o.props ?? {};
      save({ ...o, props: over ? { ...rest, over } : rest });
    }
  };
  room.yardThings = yardThings;

  // ── stairs built (phase 6): up to the storey over it unless it's told how high ──
  room.on("struct:flight", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    const above = aboveOf(level);
    const upThere = above !== null && room.structure.floors.some((f) => f.index === above) ? above : null;
    if (typeof m?.remove === "string") {
      const ops = flightRemoveOps(room.structure, level, m.remove, upThere);
      if (typeof ops === "string") return warn(client, `Can't: ${ops}.`);
      room.applyStruct(ops);
      room.rebuildGrid();
      return;
    }
    const d = m?.add;
    if (!d) return;
    const storey = upThere !== null ? riseOf(level) : 3.5;
    const rise = d.rise === undefined || !Number.isFinite(Number(d.rise)) ? storey : Number(d.rise);
    const f: Flight = {
      id: newId("flight"),
      x: Number(d.x),
      y: Number(d.y),
      dir: Number(d.dir) || 0,
      shape: (FLIGHT_SHAPES as readonly string[]).includes(String(d.shape)) ? (d.shape as Flight["shape"]) : "straight",
      turn: d.turn === -1 ? -1 : 1,
      width: Math.max(0.6, Math.min(2, Number(d.width) || 1)),
      rise: Math.round(rise * 1000) / 1000,
      style: String(d.style ?? "oak").slice(0, 20),
      rail: String(d.rail ?? "balusters").slice(0, 20),
      ...(d.closed ? { closed: true } : {}),
    };
    const why = flightWhy(room.structure, level, f);
    if (why) return warn(client, `Those stairs can't go there: ${why}.`);
    // (up a whole storey: its hole and rails up there; less, a flight of its own)
    const ops = flightAddOps(room.structure, level, f, Math.abs(f.rise - storey) < 0.05 ? upThere : null);
    if (lockedOut(client, ops, level)) return;
    room.applyStruct(ops);
    room.rebuildGrid();
  });

  // ── a hole cut in a floor (phase 4) ──
  room.on("struct:hole", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null || !Array.isArray(m?.ring)) return;
    const ring = (m.ring as unknown[])
      .slice(0, 64)
      .map((p) => [Number((p as number[])?.[0]), Number((p as number[])?.[1])] as XY);
    const op = slabsHoleOps(room.structure, level, ring, Number(m?.over ?? 0) || 0);
    if (typeof op === "string") return warn(client, `Can't cut that: ${op}.`);
    if (lockedOut(client, [op], level)) return;
    room.applyStruct([op]);
    room.rebuildGrid();
  });

  // ── floors painted tile by tile (phase 4): tiles, a room's, the storey's ──
  room.on("struct:tiles", (client, m) => {
    const level = floorFor(client, m?.level);
    if (level === null) return;
    const mat = m?.mat === null || m?.mat === undefined ? null : String(m.mat);
    let cells: { x: number; y: number; mask: number }[];
    if (typeof m?.room === "string") {
      const r = room.structure.rooms.find((q) => q.key === m.room && q.floor === level);
      if (!r) return;
      cells = tilesIn(room.structure, level, (x, y) => inRing(r.outline, x, y));
    } else if (m?.storey) cells = tilesIn(room.structure, level, () => true);
    else
      cells = (Array.isArray(m?.cells) ? m.cells : []).slice(0, TILES_AT_ONCE).map((c: Record<string, unknown>) => ({
        x: Number(c?.x),
        y: Number(c?.y),
        mask: Number(c?.mask ?? 0xff),
      }));
    if (!cells.length) return;
    const why = tilesWhy(room.structure, level, cells, mat, FLOOR_MATS);
    if (why) return warn(client, `Can't paint that: ${why}.`);
    const layer = painted(tilesOf(room.structure, level), cells, mat);
    room.applyStruct([tilesOp(room.structure, level, layer)]);
  });
  return {};
});

/** (plan 130) What a floor's tiles may be painted with: the floors' materials (not the ground's). */
const FLOOR_MATS = Object.keys(FLOORS).filter((k) => k !== "g");

/** A thing taken with a room as it moves (turned with it): free where it can stand free, else by its corner. */
function thingMoved(o: WorldObjectDef, id: string, t: PlanMove): WorldObjectDef {
  const c = planPoint(t, thingMiddle(o));
  const yaw = planYaw(t, o.yaw ?? quarterYaw(quarterOf(o)));
  if (canBeFree(o.kind)) return placeFree({ ...o, id }, c[0], c[1], yaw);
  const q = (quarterOf(o) + t.turn) & 3;
  const { w, h } = footprint(o.kind, q);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { ...o, id, x: r(c[0] - w / 2), y: r(c[1] - h / 2), yaw: quarterYaw(q) };
}
