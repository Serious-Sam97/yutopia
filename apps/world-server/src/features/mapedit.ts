import {
  areaAt,
  atLevel,
  blankLevel,
  blankMap,
  doorCentre,
  doorLockable,
  doorRoom,
  doorStartState,
  emptyEdges,
  entry,
  floorsOf,
  isDressing,
  isOpening,
  levelMap,
  MAP_MAX,
  MAP_MIN,
  type MapDef,
  mayLockDoor,
  objLevel,
  onLevel,
  ROOM_KINDS,
  roomKey,
  type TileMap,
  type WorldObjectDef,
  worldZ,
} from "@yutopia/shared";
import {
  applyOps,
  floorPieces,
  footprintRows,
  freeCuts,
  movedOn,
  NEW_ROOM,
  onOf,
  type PaintStretch,
  roofsEdit,
  roomStretches,
  roomsAfterWalls,
  SLABS_AT_ONCE,
  type Structure,
  slabsEdit,
  viewOf,
  WALLS_AT_ONCE,
  wallsEdit,
  wallsPaint,
  wallsSet,
  withFloor,
  withoutFloor,
} from "@yutopia/shared/structure";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, safeJson, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Builders edit the building (the structure — docs/plan/72 phase 11: walls, floors and roofs drawn
// free; rooms found as walls close round them, named, given an owner), start the home floor blank,
// add a floor on top or take it away, move the arrival point, assign desks. Doors: anyone
// opens/closes; the room's owner locks (an admin, rooms with no owner), and
// while it's locked nobody else changes that room (room.lockBreak). The shared
// rules (packages/shared/src/map-edit.ts) decide what's allowed.
// What switches on and off: floor lamps, the ceiling lights (plan 67) and the desk lamps on desks.
// (anything switched as a lamp: the catalog's interact "lamp" — a fireplace, a lava lamp, a tree's
// lights — and a desk lamp on a desk)
const isLamp = (o: WorldObjectDef) =>
  o.kind === "pendant_light" ||
  o.kind === "panel_light" ||
  entry(o.kind).interact === "lamp" ||
  (o.kind === "tabletop" && o.props?.d === "desklamp");

// (a new wall's id: unique enough in one world, sorted by when it was drawn)
let wallSeq = 0;
const newWallId = () => `w${Date.now().toString(36)}${(wallSeq++ % 1296).toString(36).padStart(2, "0")}`;

registerFeature((room: WorldRoom) => {
  const builder = (c: WorldClient) => room.state.players.get(c.sessionId)?.builder === true;
  const objects = (): WorldObjectDef[] => [...room.state.objects.values()].map(fromSchema);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  // which floor an edit is on (the building's, shared levels.ts; none: the home
  // floor), and that floor as a map, its things, the people on it
  const floor = (m: { level?: unknown }): number | null => {
    const l = m.level === undefined ? room.home : Number(m.level);
    return Number.isInteger(l) && levelMap(room.map, l) ? l : null;
  };
  const at = (level: number) => room.levelMap(level);
  const things = (level: number) => onLevel(objects(), at(level));

  const save = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await api.putObject(o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
  const drop = async (id: string) => {
    room.state.objects.delete(id);
    if (!config.offline) await api.deleteObject(id).catch(() => {});
  };
  // a change that would open someone else's locked room: told why, not made
  const blocked = (c: WorldClient, next: MapDef, level = room.home): boolean => {
    const p = room.state.players.get(c.sessionId);
    const why = p ? room.lockBreak(p, next, [], level) : "no";
    if (why) warn(c, `${why}.`);
    return !!why;
  };

  // Walls drawn free (docs/plan/72 phase 11): put in and taken away as the structure's operation — at
  // any angle, any length, on whatever floor it's sent for. Checked as the browser's ghost is (shared
  // structure/edit.ts); not through someone else's locked room. The ids it gave back to the sender.
  // found rooms' keys, one edit's: none a room on any floor has, nor one handed out already
  const roomKeys = () => {
    const used = new Set(room.structure.rooms.map((r) => r.key));
    const base = roomKey(NEW_ROOM);
    return () => {
      let key = base;
      for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
      used.add(key);
      return key;
    };
  };

  room.on("struct:walls", (client, m) => {
    const level = floor(m);
    const p = room.state.players.get(client.sessionId);
    if (!builder(client) || level === null || !p) return;
    const add = (Array.isArray(m?.add) ? m.add : []).slice(0, WALLS_AT_ONCE).map((d: Record<string, unknown>) => ({
      a: d?.a as [number, number],
      b: d?.b as [number, number],
      front: String(d?.front ?? "p"),
      height: d?.height == null ? undefined : Number(d.height),
      bow: d?.bow == null ? undefined : Number(d.bow),
      thick: d?.thick == null ? undefined : Number(d.thick),
      over: d?.over == null ? undefined : Number(d.over),
    }));
    const set = (Array.isArray(m?.set) ? m.set : []).slice(0, WALLS_AT_ONCE).map((c: Record<string, unknown>) => ({
      id: String(c?.id ?? ""),
      height: c?.height == null ? undefined : Number(c.height),
      thick: c?.thick == null ? undefined : Number(c.thick),
      front: c?.front == null ? undefined : String(c.front),
      back: c?.back == null ? undefined : String(c.back),
    }));
    const remove = (Array.isArray(m?.remove) ? m.remove : []).slice(0, WALLS_AT_ONCE).map(String);
    if (!add.length && !remove.length && !set.length) return;
    // (a wall with things hung on it stays: they'd be left on nothing — its doors and windows go with
    // it, below)
    if (remove.length) {
      const gone = new Set(remove);
      const hung = objects().find((o) => !isOpening(o.kind) && gone.has(String(onOf(o)?.wall ?? "")));
      if (hung) return warn(client, `That wall stays: a ${entry(hung.kind).label.toLowerCase()} hangs on that wall.`);
    }
    // (walls that are there changed — their height, their thickness — or walls drawn and taken away)
    const r = set.length
      ? wallsSet(room.structure, level, set, (id) => Math.max(0, ...freeCuts(objects(), id).map((c) => c.z1)))
      : wallsEdit(room.structure, level, add, remove, newWallId);
    if ("why" in r) return warn(client, `That wall can't go: ${r.why}.`);
    // (the rooms its walls close round now: found, split — phase 11.5)
    const walled = applyOps(room.structure, [r.op]);
    const rooms = roomsAfterWalls(room.structure, walled, level, roomKeys());
    const ops = rooms ? [r.op, rooms.op] : [r.op];
    const why = room.lockBreak(p, viewOf(rooms ? applyOps(walled, [rooms.op]) : walled), [], level);
    if (why) return warn(client, `${why}.`);
    room.applyStruct(ops);
    // (the doors and windows in walls taken away go with them — phase 11.6; undone, back)
    if (r.op.op === "walls") {
      const back = new Set(r.op.add.map((w) => w.id));
      const gone = new Set(r.op.remove.filter((id) => !back.has(id)));
      for (const o of [...room.state.objects.values()]) {
        const d = fromSchema(o);
        const on = isOpening(d.kind) ? onOf(d) : null;
        if (!on || !gone.has(on.wall)) continue;
        if (!config.offline) void api.deleteObject(d.id).catch(() => {});
        room.state.objects.delete(d.id);
        room.state.holds.delete(d.id);
      }
    }
    room.rescue();
    room.send(client, "struct:walls:ok", {
      n: m?.n ?? null,
      ids: "added" in r ? (r.added as { id: string }[]).map((w) => w.id) : [],
      ...(rooms?.found.length ? { found: rooms.found } : {}),
    });
  });

  // wall faces painted (plan 72 phase 11: the tile tools' Paint retired): stretches of faces, or every
  // face round a room — the walls split where a stretch starts and ends; what's on them goes onto
  // the piece it's on
  room.on("struct:paint", (client, m) => {
    let level = floor(m);
    if (!builder(client) || level === null) return;
    const mat = String(m?.mat ?? "");
    let stretches: PaintStretch[];
    if (typeof m?.room === "string") {
      const r = room.structure.rooms.find((q) => q.key === m.room);
      if (!r) return;
      level = r.floor;
      stretches = roomStretches(room.structure, r.key, mat);
    } else
      stretches = (Array.isArray(m?.stretches) ? m.stretches : []).slice(0, 400).map((q: Record<string, unknown>) => ({
        id: String(q?.id ?? ""),
        side: q?.side === -1 ? (-1 as const) : (1 as const),
        from: Number(q?.from),
        to: Number(q?.to),
        mat: String(q?.mat ?? ""),
      }));
    stretches = stretches.filter((q) => Number.isFinite(q.from) && Number.isFinite(q.to));
    if (!stretches.length) return;
    // (its openings kept whole: a stretch's end in a door is moved to the door's edge)
    const things = [...objects()];
    const r = wallsPaint(room.structure, level, stretches, newWallId, (id) =>
      freeCuts(things, id).map((c) => [c.u0, c.u1] as const),
    );
    if ("why" in r) return r.why === "as it is" ? undefined : warn(client, `Can't paint that: ${r.why}.`);
    room.applyStruct([r.op]);
    for (const o of objects()) {
      const on = onOf(o);
      const to = on && movedOn(r.moves, on);
      if (!on || !to) continue;
      void save({ ...o, props: { ...(o.props ?? {}), on: { ...on, ...to } } });
    }
    room.rebuildGrid();
  });

  // floors drawn free (plan 72 phase 11.7): slabs put in and taken away as the structure's operation
  let slabSeq = 0;
  const newSlabId = () => `f${Date.now().toString(36)}${(slabSeq++).toString(36)}`;
  room.on("struct:slabs", (client, m) => {
    const level = floor(m);
    const p = room.state.players.get(client.sessionId);
    if (!builder(client) || level === null || !p) return;
    const add = (Array.isArray(m?.add) ? m.add : []).slice(0, SLABS_AT_ONCE).map((d: Record<string, unknown>) => ({
      outline: (Array.isArray(d?.outline) ? d.outline : [])
        .slice(0, 256)
        .map((q: unknown) =>
          Array.isArray(q)
            ? ([Number(q[0]), Number(q[1])] as [number, number])
            : ([Number.NaN, Number.NaN] as [number, number]),
        ),
      holes: (Array.isArray(d?.holes) ? d.holes : [])
        .slice(0, 64)
        .map((h: unknown) =>
          (Array.isArray(h) ? h : [])
            .slice(0, 256)
            .map((q: unknown) =>
              Array.isArray(q)
                ? ([Number(q[0]), Number(q[1])] as [number, number])
                : ([Number.NaN, Number.NaN] as [number, number]),
            ),
        ),
      top: String(d?.top ?? "."),
      over: d?.over == null ? 0 : Number(d.over),
    }));
    const remove = (Array.isArray(m?.remove) ? m.remove : []).slice(0, SLABS_AT_ONCE).map(String);
    const r = slabsEdit(room.structure, level, add, remove, newSlabId);
    if ("why" in r) return warn(client, `That floor can't go: ${r.why}.`);
    const why = room.lockBreak(p, viewOf(applyOps(room.structure, [r.op])), [], level);
    if (why) return warn(client, `${why}.`);
    room.applyStruct([r.op]);
    room.rescue();
    room.send(client, "struct:slabs:ok", { n: m?.n ?? null, ids: r.added.map((q) => q.id) });
  });

  // roofs (plan 72 phase 11.7): put on a closed set of walls, taken off
  let roofSeq = 0;
  room.on("struct:roofs", (client, m) => {
    const level = floor(m);
    const p = room.state.players.get(client.sessionId);
    if (!builder(client) || level === null || !p) return;
    const add = (Array.isArray(m?.add) ? m.add : []).slice(0, 16).map((d: Record<string, unknown>) => ({
      outline: (Array.isArray(d?.outline) ? d.outline : [])
        .slice(0, 256)
        .map((q: unknown) =>
          Array.isArray(q)
            ? ([Number(q[0]), Number(q[1])] as [number, number])
            : ([Number.NaN, Number.NaN] as [number, number]),
        ),
      kind: (["flat", "gable", "hip"].includes(String(d?.kind)) ? d.kind : "flat") as "flat" | "gable" | "hip",
      pitch: d?.pitch == null ? undefined : Number(d.pitch),
      ridge: d?.ridge === 1 ? (1 as const) : (0 as const),
    }));
    const remove = (Array.isArray(m?.remove) ? m.remove : []).slice(0, 16).map(String);
    const r = roofsEdit(
      room.structure,
      level,
      add,
      remove,
      () => `r${Date.now().toString(36)}${(roofSeq++).toString(36)}`,
    );
    if ("why" in r) return warn(client, `That roof can't go: ${r.why}.`);
    room.applyStruct([r.op]);
  });

  // a blank home floor: the generator's, put in place of the one there (the other floors stay)
  room.on("map:new", (client, m) => {
    if (!builder(client)) return;
    const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.width) || 32)));
    const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.height) || 24)));
    const home = room.home;
    const blank = { ...blankMap(room.map.key, room.map.name, w, h), floor: home };
    const hf = room.structure.floors.find((f) => f.index === home);
    const pieces = floorPieces(blank, home, [hf?.grid.x0 ?? 0, hf?.grid.y0 ?? 0]);
    if (!pieces) return;
    const next = {
      ...withFloor(room.structure, pieces),
      spawn: [pieces.floor.grid.x0 + blank.spawn.x, pieces.floor.grid.y0 + blank.spawn.y] as [number, number],
    };
    if (blocked(client, viewOf(next))) return;
    for (const o of things(home)) void drop(o.id);
    room.commitStructure(next);
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (!p || p.level !== home) continue;
      p.x = next.spawn[0] + (Math.random() - 0.5) * 3;
      p.y = next.spawn[1] + (Math.random() - 0.5);
      p.desk = "";
      p.z = worldZ(p.level, 0);
      room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    }
    room.broadcastMsg("toast", { text: `A blank ${w}×${h} studio. Time to build.` });
  });

  room.on("map:spawn", (client, m) => {
    if (!builder(client)) return;
    const x = Math.floor(Number(m.x));
    const y = Math.floor(Number(m.y));
    if (!room.grid.ok(x, y)) return warn(client, "Pick an open floor tile.");
    room.commitStructure({ ...room.structure, spawn: [x + 0.5, y + 0.5] });
    room.send(client, "toast", { text: "Arrival point set — everyone who comes in arrives here." });
  });

  // a room's own (its name, kind, owner, dressing): the structure's room as it is, its props changed
  const roomOn = (level: number, key: unknown) =>
    room.structure.rooms.find((r) => r.floor === level && r.key === String(key)) ?? null;
  const withRooms = (rooms: Structure["rooms"]) => ({ ...room.structure, rooms });

  room.on("map:room:update", (client, m) => {
    const level = floor(m);
    if (!builder(client) || level === null) return;
    const p = room.state.players.get(client.sessionId);
    const r = roomOn(level, m.key);
    if (!r) return;
    const was = r.props as { name?: string; ownerId?: number | null; ownerName?: string | null };
    // someone's room: only they (or an admin) give it to someone else
    if (m.ownerId !== undefined && was.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can give ${was.name} to someone else.`);
    const props = { ...r.props };
    if (typeof m.name === "string" && m.name.trim()) props.name = m.name.trim().slice(0, 40);
    if (ROOM_KINDS.includes(m.kind as never)) props.kind = m.kind as (typeof ROOM_KINDS)[number];
    if (m.dressing !== undefined) props.dressing = isDressing(m.dressing) ? m.dressing : null;
    if (m.ownerId !== undefined) {
      props.ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
      props.ownerName = props.ownerId ? String(m.ownerName ?? "").slice(0, 120) || null : null;
    }
    const next = withRooms(room.structure.rooms.map((q) => (q === r ? { ...r, props } : q)));
    if (!blocked(client, viewOf(next), level)) room.commitStructure(next);
  });

  room.on("map:room:remove", (client, m) => {
    const level = floor(m);
    if (!builder(client) || level === null) return;
    const p = room.state.players.get(client.sessionId);
    const r = roomOn(level, m.key);
    if (!r) return;
    const was = r.props as { name?: string; ownerId?: number | null; ownerName?: string | null };
    if (was.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can take ${was.name} away.`);
    const next = withRooms(room.structure.rooms.filter((q) => q !== r));
    if (!blocked(client, viewOf(next), level)) room.commitStructure(next);
  });

  // ── floors: a blank one on top (the home floor's footprint, the core), the
  // top one taken away (never the home floor) ──
  room.on("level:add", async (client) => {
    if (!builder(client)) return;
    const floors = floorsOf(room.map);
    const top = floors[floors.length - 1];
    if (floors.length >= 12) return warn(client, "That's as tall as the building goes.");
    const index = top + 1;
    // (the generator draws it in tiles from the home floor's footprint and the core: put in as the
    // structure's pieces)
    const home = room.home;
    const hf = room.structure.floors.find((f) => f.index === home);
    const at: [number, number] = [hf?.grid.x0 ?? 0, hf?.grid.y0 ?? 0];
    const foot = footprintRows(room.structure, home);
    const core = room.map.core ? { x: room.map.core.x - at[0], y: room.map.core.y - at[1] } : undefined;
    const base: TileMap = {
      key: room.map.key,
      name: room.map.name,
      ...foot,
      ...emptyEdges(foot.width, foot.height),
      areas: [],
      spawn: room.map.spawn,
      objects: [],
      floor: home,
      ...(core ? { core } : {}),
    };
    const made = blankLevel(base, index);
    const pieces = floorPieces({ ...base, levels: [made.level] }, index, at);
    if (!pieces) return;
    const shift = (o: WorldObjectDef) => ({ ...o, x: o.x + at[0], y: o.y + at[1] });
    // (its stairs go nowhere yet: none; the floor below gets the stairs up)
    const add = made.objects.filter((o) => o.kind !== "stairs").map(shift);
    const below = blankLevel(base, top).objects.find((o) => o.kind === "stairs");
    if (below && !things(top).some((o) => o.kind === "stairs")) add.push(atLevel(shift(below), top, room.map));
    room.commitStructure(withFloor(room.structure, pieces));
    for (const o of add) await save(o);
    room.rebuildGrid();
    room.broadcastMsg("toast", { text: `A new floor on top: ${made.level.name}. Time to build.` });
  });

  room.on("level:remove", async (client, m) => {
    if (!builder(client)) return;
    const floors = floorsOf(room.map);
    const top = floors[floors.length - 1];
    const level = Number(m?.level);
    if (level !== top || level === room.home) return warn(client, "Only the floor on top goes (and never the studio).");
    for (const o of things(level)) await drop(o.id);
    // the stairs up to it go too
    for (const o of things(level - 1)) if (o.kind === "stairs") await drop(o.id);
    room.commitStructure(withoutFloor(room.structure, level));
    room.rescue();
    room.rebuildGrid();
    room.broadcastMsg("toast", { text: `Floor ${level} is gone.` });
  });

  room.on("desk:assign", (client, m) => {
    const o = room.state.objects.get(String(m.id));
    if (!builder(client) || !o) return;
    const def = fromSchema(o);
    const ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
    const props = { ...(def.props ?? {}), desk: true } as Record<string, unknown>;
    if (ownerId) {
      // one assigned desk per person
      for (const other of room.state.objects.values()) {
        if (other.id !== o.id && safeJson(other.props).ownerId === ownerId) {
          const od = fromSchema(other);
          const op = { ...(od.props ?? {}) };
          delete op.ownerId;
          delete op.ownerName;
          void save({ ...od, props: op });
        }
      }
      props.ownerId = ownerId;
      props.ownerName = String(m.ownerName ?? "").slice(0, 120);
    } else {
      delete props.ownerId;
      delete props.ownerName;
    }
    void save({ ...def, props });
  });

  // lamps click on and off for whoever stands next to them
  room.on("lamp:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id));
    if (!p || !o || !isLamp(fromSchema(o)) || objLevel(fromSchema(o), room.map) !== p.level) return;
    const def = fromSchema(o);
    if (room.reach3(p, def, Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5))) > 2.5) return;
    void save({ ...def, props: { ...(def.props ?? {}), on: !!m.on } });
  });

  // A light switch: every lamp in its room (or, outside a room, nearby) on or off.
  room.on("lights:room", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const sw = room.state.objects.get(String(m?.id ?? ""));
    const swDef = sw && fromSchema(sw);
    if (!p || !sw || !swDef || sw.kind !== "light_switch" || objLevel(swDef, room.map) !== p.level) return;
    if (room.reach3(p, swDef, Math.hypot(p.x - (sw.x + 0.5), p.y - (sw.y + 0.5))) > 2.5) return;
    const on = !!m.on;
    const lm = at(p.level);
    const where = areaAt(lm, sw.x + 0.5, sw.y + 0.5)?.key ?? null;
    void save({ ...swDef, props: { ...(swDef.props ?? {}), on } });
    for (const o of things(p.level)) {
      if (!isLamp(o) || (o.props?.on !== false) === on) continue;
      const inRoom = where ? areaAt(lm, o.x + 0.5, o.y + 0.5)?.key === where : Math.hypot(o.x - sw.x, o.y - sw.y) <= 6;
      if (inRoom) void save({ ...o, props: { ...(o.props ?? {}), on } });
    }
  });

  room.on("door:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id));
    if (!p || !o || entry(o.kind).interact !== "door" || !["open", "closed", "locked"].includes(m.state)) return;
    if (m.state === "locked" && !doorLockable(o.kind)) return warn(client, `${entry(o.kind).label} don't lock.`);
    const def = fromSchema(o);
    const current = String(def.props?.state ?? doorStartState(o.kind) ?? "open");
    const lm = at(objLevel(def, room.map));
    const area = doorRoom(lm, def);
    const owner = area?.ownerId ?? null;
    const c = doorCentre(def);
    // (a door's in its wall: no sight to it asked)
    const near = room.reach3(p, def, Math.hypot(p.x - c.x, p.y - c.y), c, false) <= 2.5;
    // an owner's lock is theirs alone: nobody else (not an admin) opens it
    if (m.state === "locked" || current === "locked") {
      if (!mayLockDoor(lm, def, p))
        return warn(
          client,
          owner
            ? `Only ${area?.ownerName ?? "the room's owner"} can lock or unlock this door.`
            : "Only an admin can lock this door.",
        );
    } else if (!near) return;
    void save({ ...def, props: { ...(def.props ?? {}), state: m.state } }).then(() => room.rebuildGrid());
  });
  // an admin's (docs/plan/48-the-admin.md): any door no one owns, locked or unlocked from anywhere
  // (an owner's lock stays theirs alone, as above)
  room.on("mod:door", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    if (!p?.admin || !o || entry(o.kind).interact !== "door" || !doorLockable(o.kind)) return;
    const def = fromSchema(o);
    const lm = at(objLevel(def, room.map));
    const area = doorRoom(lm, def);
    if (area?.ownerId != null) return warn(client, `That's ${area.ownerName ?? "the owner"}'s lock.`);
    const current = String(def.props?.state ?? doorStartState(o.kind) ?? "open");
    if ((current === "locked") === !!m.locked) return;
    void save({ ...def, props: { ...(def.props ?? {}), state: m.locked ? "locked" : "closed" } }).then(() =>
      room.rebuildGrid(),
    );
    room.adminLog(p, m.locked ? "lock" : "unlock", null, "", `${area?.name ?? entry(o.kind).label} door`);
  });

  return {};
});
