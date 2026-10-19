import {
  addRoom,
  applyEdges,
  applyPaint,
  areaAt,
  atLevel,
  blankLevel,
  blankMap,
  doorCentre,
  doorLockable,
  doorRoom,
  doorStartState,
  type EdgeEdit,
  edgeAt,
  edgeBlocker,
  entry,
  floorsOf,
  hungOnEdge,
  isDressing,
  isFacedWall,
  levelMap,
  lockedEdge,
  MAP_MAX,
  MAP_MIN,
  type MapDef,
  mayLockDoor,
  objLevel,
  onLevel,
  openingBlocker,
  paintBlocker,
  ROOM_KINDS,
  resizeMap,
  roomKey,
  setRoomWalls,
  tileAt,
  WALL_MATS,
  type WallMat,
  type WorldObjectDef,
  withLevel,
} from "@yutopia/shared";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, safeJson, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Builders edit the map itself: paint floors (tiles) and walls (tile edges), draw rooms (with an owner),
// resize or start blank, move the arrival point, assign desks. Doors: anyone
// opens/closes; the room's owner locks (an admin, rooms with no owner), and
// while it's locked nobody else changes that room (room.lockBreak). The shared
// rules (packages/shared/src/map-edit.ts) decide what's allowed.
// What switches on and off: floor lamps and the desk lamps on desks.
const isLamp = (o: WorldObjectDef) => o.kind === "lamp" || (o.kind === "tabletop" && o.props?.d === "desklamp");

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
  const bodies = (level = room.home) =>
    [...room.state.players.values()].filter((p) => p.level === level).map((p) => ({ x: p.x, y: p.y }));
  // a floor changed: the building with it
  const commit = (lm: MapDef) => room.commitMap(withLevel(room.map, lm));

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
  const mat = (m: unknown): WallMat | undefined =>
    typeof m === "string" && Object.hasOwn(WALL_MATS, m) ? (m as WallMat) : undefined;

  room.on("map:paint", (client, m) => {
    const level = floor(m);
    if (!builder(client) || !Array.isArray(m.cells) || level === null) return;
    const lm = at(level);
    const objs = things(level);
    const ok: { x: number; y: number; ch: string }[] = [];
    let reason: string | null = null;
    for (const c of m.cells.slice(0, 600)) {
      const x = Math.floor(Number(c?.x));
      const y = Math.floor(Number(c?.y));
      const ch = String(c?.ch ?? "");
      if (tileAt(lm, x, y) === ch) continue;
      const why = paintBlocker(lm, objs, bodies(level), x, y, ch);
      if (why) reason ??= why;
      else ok.push({ x, y, ch });
    }
    if (ok.length) {
      commit(applyPaint(lm, ok));
      room.rescue();
    }
    if (reason) warn(client, `Skipped a tile: ${reason}.`);
  });

  room.on("map:walls", (client, m) => {
    const level = floor(m);
    if (!builder(client) || !Array.isArray(m.edges) || level === null) return;
    const objs = things(level);
    const uid = room.state.players.get(client.sessionId)?.uid ?? null;
    const lockedHere = (e: EdgeEdit) => lockedEdge(at(level), objs, e, uid);
    const ok: EdgeEdit[] = [];
    let reason: string | null = null;
    let next = at(level);
    for (const e of m.edges.slice(0, 600)) {
      const edge: EdgeEdit = {
        x: Math.floor(Number(e?.x)),
        y: Math.floor(Number(e?.y)),
        dir: e?.dir === "v" ? ("v" as const) : ("h" as const),
        ch: String(e?.ch ?? ""),
        side: e?.side === 1 || e?.side === -1 ? e.side : undefined,
      };
      const why = edgeBlocker(next, objs, edge, edge.ch) ?? lockedHere(edge);
      if (why) reason ??= why;
      else {
        ok.push(edge);
        next = applyEdges(next, [edge]); // windows check the walls painted just before
      }
    }
    if (ok.length) {
      commit(next);
      room.rescue();
    }
    if (reason) warn(client, `Skipped a wall: ${reason}.`);
  });

  // Paint faces: only walls that have two faces, only the material
  room.on("map:faces", (client, m) => {
    const w = mat(m.mat);
    const level = floor(m);
    if (!builder(client) || !w || w === "g" || !Array.isArray(m.faces) || level === null) return;
    const lm = at(level);
    const edits: EdgeEdit[] = [];
    for (const f of m.faces.slice(0, 1200)) {
      const e = {
        x: Math.floor(Number(f?.x)),
        y: Math.floor(Number(f?.y)),
        dir: f?.dir === "v" ? ("v" as const) : ("h" as const),
      };
      if (!isFacedWall(edgeAt(lm, e))) continue;
      edits.push({ ...e, ch: w, side: f?.side === -1 ? -1 : 1 });
    }
    if (edits.length) commit(applyEdges(lm, edits));
  });

  room.on("map:room:walls", (client, m) => {
    const w = mat(m.wall);
    const level = floor(m);
    if (!builder(client) || !w || level === null) return;
    const next = setRoomWalls(at(level), String(m.key), w, things(level));
    if (!blocked(client, next, level)) commit(next);
  });

  room.on("map:resize", (client, m) => {
    if (!builder(client)) return;
    const next = resizeMap(room.map, Number(m.width), Number(m.height));
    if (blocked(client, next)) return;
    for (const o of things(room.home)) if (o.x >= next.width || o.y >= next.height) void drop(o.id);
    room.commitMap(next);
    room.rescue();
    room.broadcastMsg("toast", { text: `The studio is now ${next.width}×${next.height}.` });
  });

  room.on("map:new", (client, m) => {
    if (!builder(client)) return;
    const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.width) || 32)));
    const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.height) || 24)));
    // (the home floor: the building's other floors stay)
    const next = { ...blankMap(room.map.key, room.map.name, w, h), floor: room.map.floor, levels: room.map.levels };
    if (blocked(client, next)) return;
    for (const o of things(room.home)) void drop(o.id);
    room.commitMap(next);
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (!p || p.level !== room.home) continue;
      p.x = next.spawn.x + (Math.random() - 0.5) * 3;
      p.y = next.spawn.y + (Math.random() - 0.5);
      p.desk = "";
      p.z = 0;
      room.send(c, "snap", { x: p.x, y: p.y, z: 0, level: p.level });
    }
    room.broadcastMsg("toast", { text: `A blank ${w}×${h} studio. Time to build.` });
  });

  room.on("map:spawn", (client, m) => {
    if (!builder(client)) return;
    const x = Math.floor(Number(m.x));
    const y = Math.floor(Number(m.y));
    if (!room.grid.ok(x, y)) return warn(client, "Pick an open floor tile.");
    room.commitMap({ ...room.map, spawn: { x: x + 0.5, y: y + 0.5 } });
    room.send(client, "toast", { text: "Arrival point set — everyone who comes in arrives here." });
  });

  room.on("map:room", (client, m) => {
    const level = floor(m);
    if (!builder(client) || level === null) return;
    const lm = at(level);
    const name =
      String(m.name ?? "")
        .trim()
        .slice(0, 40) || "Room";
    const kind = ROOM_KINDS.includes(m.kind as never) ? (m.kind as (typeof ROOM_KINDS)[number]) : "private";
    let key = roomKey(name);
    // (a key no room on any floor has)
    for (let i = 2; room.areaByKey(key); i++) key = `${roomKey(name)}-${i}`;
    const ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
    const res = addRoom(lm, things(level), bodies(level), {
      key,
      name,
      kind,
      x: Math.floor(Number(m.x)),
      y: Math.floor(Number(m.y)),
      w: Math.floor(Number(m.w)),
      h: Math.floor(Number(m.h)),
      ownerId,
      ownerName: ownerId ? String(m.ownerName ?? "").slice(0, 120) || null : null,
      walls: !!m.walls,
      floor: typeof m.floor === "string" ? m.floor : undefined,
      wall: mat(m.wall),
    });
    if (typeof res === "string") return warn(client, `Couldn't make the room: ${res}.`);
    if (blocked(client, res.map, level)) return;
    commit(res.map);
    room.rescue();
    const door =
      res.door &&
      atLevel(
        {
          id: `door-${key}`,
          kind: "door",
          x: res.door.x,
          y: res.door.y,
          rot: res.door.rot,
          props: { state: "open", roomKey: key },
        },
        level,
        room.map,
      );
    // its door, in the wall it just got (if it fits there: floor both sides)
    const here = things(level);
    if (door && !openingBlocker(res.map, here, door, hungOnEdge(here))) void save(door).then(() => room.rebuildGrid());
  });

  room.on("map:room:update", (client, m) => {
    const level = floor(m);
    if (!builder(client) || level === null) return;
    const lm = at(level);
    const p = room.state.players.get(client.sessionId);
    const was = lm.areas.find((a) => a.key === m.key);
    // someone's room: only they (or an admin) give it to someone else
    if (m.ownerId !== undefined && was?.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can give ${was.name} to someone else.`);
    const areas = lm.areas.map((a) => {
      if (a.key !== m.key) return a;
      const next = { ...a };
      if (typeof m.name === "string" && m.name.trim()) next.name = m.name.trim().slice(0, 40);
      if (ROOM_KINDS.includes(m.kind as never)) next.kind = m.kind as (typeof ROOM_KINDS)[number];
      if (m.dressing !== undefined) next.dressing = isDressing(m.dressing) ? m.dressing : null;
      if (m.ownerId !== undefined) {
        next.ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
        next.ownerName = next.ownerId ? String(m.ownerName ?? "").slice(0, 120) || null : null;
      }
      return next;
    });
    if (!blocked(client, { ...lm, areas }, level)) commit({ ...lm, areas });
  });

  room.on("map:room:remove", (client, m) => {
    const level = floor(m);
    if (!builder(client) || level === null) return;
    const lm = at(level);
    const p = room.state.players.get(client.sessionId);
    const was = lm.areas.find((a) => a.key === m.key);
    if (was?.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can take ${was.name} away.`);
    const next = { ...lm, areas: lm.areas.filter((a) => a.key !== m.key) };
    if (!blocked(client, next, level)) commit(next);
  });

  // ── floors: a blank one on top (the home floor's footprint, the core), the
  // top one taken away (never the home floor) ──
  room.on("level:add", async (client) => {
    if (!builder(client)) return;
    const floors = floorsOf(room.map);
    const top = floors[floors.length - 1];
    if (floors.length >= 12) return warn(client, "That's as tall as the building goes.");
    const index = top + 1;
    const made = blankLevel(room.map, index);
    // (its stairs go nowhere yet: none; the floor below gets the stairs up)
    const add = made.objects.filter((o) => o.kind !== "stairs");
    const below = blankLevel(room.map, top).objects.find((o) => o.kind === "stairs");
    if (below && !things(top).some((o) => o.kind === "stairs")) add.push(atLevel(below, top, room.map));
    const next = { ...room.map, levels: [...(room.map.levels ?? []), made.level].sort((a, b) => a.index - b.index) };
    room.commitMap(next);
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
    room.commitMap({ ...room.map, levels: (room.map.levels ?? []).filter((l) => l.index !== level) });
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
    if (Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5)) > 2.5) return;
    const def = fromSchema(o);
    void save({ ...def, props: { ...(def.props ?? {}), on: !!m.on } });
  });

  // A light switch: every lamp in its room (or, outside a room, nearby) on or off.
  room.on("lights:room", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const sw = room.state.objects.get(String(m?.id ?? ""));
    const swDef = sw && fromSchema(sw);
    if (!p || !sw || !swDef || sw.kind !== "light_switch" || objLevel(swDef, room.map) !== p.level) return;
    if (Math.hypot(p.x - (sw.x + 0.5), p.y - (sw.y + 0.5)) > 2.5) return;
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
    const near = p.level === objLevel(def, room.map) && Math.hypot(p.x - c.x, p.y - c.y) <= 2.5;
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

  return {};
});
