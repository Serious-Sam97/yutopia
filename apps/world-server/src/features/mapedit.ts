import {
  addRoom,
  applyEdges,
  applyPaint,
  areaAt,
  blankMap,
  doorCentre,
  doorLockable,
  doorRoom,
  doorStartState,
  type EdgeEdit,
  edgeAt,
  edgeBlocker,
  entry,
  hungOnEdge,
  isDressing,
  isFacedWall,
  isTheme,
  lockedEdge,
  MAP_MAX,
  MAP_MIN,
  type MapDef,
  mayLockDoor,
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
  const bodies = () => [...room.state.players.values()].map((p) => ({ x: p.x, y: p.y }));
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });

  const save = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await api.putObject(o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
  const drop = async (id: string) => {
    room.state.objects.delete(id);
    if (!config.offline) await api.deleteObject(id).catch(() => {});
  };
  // a change that would open someone else's locked room: told why, not made
  const blocked = (c: WorldClient, next: MapDef): boolean => {
    const p = room.state.players.get(c.sessionId);
    const why = p ? room.lockBreak(p, next) : "no";
    if (why) warn(c, `${why}.`);
    return !!why;
  };
  const mat = (m: unknown): WallMat | undefined =>
    typeof m === "string" && Object.hasOwn(WALL_MATS, m) ? (m as WallMat) : undefined;

  room.on("map:paint", (client, m) => {
    if (!builder(client) || !Array.isArray(m.cells)) return;
    const objs = objects();
    const ok: { x: number; y: number; ch: string }[] = [];
    let reason: string | null = null;
    for (const c of m.cells.slice(0, 600)) {
      const x = Math.floor(Number(c?.x));
      const y = Math.floor(Number(c?.y));
      const ch = String(c?.ch ?? "");
      if (tileAt(room.map, x, y) === ch) continue;
      const why = paintBlocker(room.map, objs, bodies(), x, y, ch);
      if (why) reason ??= why;
      else ok.push({ x, y, ch });
    }
    if (ok.length) {
      room.commitMap(applyPaint(room.map, ok));
      room.rescue();
    }
    if (reason) warn(client, `Skipped a tile: ${reason}.`);
  });

  room.on("map:walls", (client, m) => {
    if (!builder(client) || !Array.isArray(m.edges)) return;
    const objs = objects();
    const uid = room.state.players.get(client.sessionId)?.uid ?? null;
    const lockedHere = (e: EdgeEdit) => lockedEdge(room.map, objs, e, uid);
    const ok: EdgeEdit[] = [];
    let reason: string | null = null;
    let next = room.map;
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
      room.commitMap(next);
      room.rescue();
    }
    if (reason) warn(client, `Skipped a wall: ${reason}.`);
  });

  // Paint faces: only walls that have two faces, only the material
  room.on("map:faces", (client, m) => {
    const w = mat(m.mat);
    if (!builder(client) || !w || w === "g" || !Array.isArray(m.faces)) return;
    const edits: EdgeEdit[] = [];
    for (const f of m.faces.slice(0, 1200)) {
      const e = {
        x: Math.floor(Number(f?.x)),
        y: Math.floor(Number(f?.y)),
        dir: f?.dir === "v" ? ("v" as const) : ("h" as const),
      };
      if (!isFacedWall(edgeAt(room.map, e))) continue;
      edits.push({ ...e, ch: w, side: f?.side === -1 ? -1 : 1 });
    }
    if (edits.length) room.commitMap(applyEdges(room.map, edits));
  });

  room.on("map:room:walls", (client, m) => {
    const w = mat(m.wall);
    if (!builder(client) || !w) return;
    const next = setRoomWalls(room.map, String(m.key), w, objects());
    if (!blocked(client, next)) room.commitMap(next);
  });

  room.on("map:resize", (client, m) => {
    if (!builder(client)) return;
    const next = resizeMap(room.map, Number(m.width), Number(m.height));
    if (blocked(client, next)) return;
    for (const o of objects()) if (o.x >= next.width || o.y >= next.height) void drop(o.id);
    room.commitMap(next);
    room.rescue();
    room.broadcastMsg("toast", { text: `The studio is now ${next.width}×${next.height}.` });
  });

  room.on("map:new", (client, m) => {
    if (!builder(client)) return;
    const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.width) || 32)));
    const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.height) || 24)));
    const next = blankMap(room.map.key, room.map.name, w, h);
    if (blocked(client, next)) return;
    for (const o of objects()) void drop(o.id);
    room.commitMap(next);
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (!p) continue;
      p.x = next.spawn.x + (Math.random() - 0.5) * 3;
      p.y = next.spawn.y + (Math.random() - 0.5);
      p.desk = "";
      p.z = 0;
      room.send(c, "snap", { x: p.x, y: p.y, z: 0 });
    }
    room.broadcastMsg("toast", { text: `A blank ${w}×${h} studio. Time to build.` });
  });

  room.on("map:theme", (client, m) => {
    if (!builder(client) || !isTheme(m.theme)) return;
    room.commitMap({ ...room.map, theme: m.theme });
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
    if (!builder(client)) return;
    const name =
      String(m.name ?? "")
        .trim()
        .slice(0, 40) || "Room";
    const kind = ROOM_KINDS.includes(m.kind as never) ? (m.kind as (typeof ROOM_KINDS)[number]) : "private";
    let key = roomKey(name);
    for (let i = 2; room.map.areas.some((a) => a.key === key); i++) key = `${roomKey(name)}-${i}`;
    const ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
    const res = addRoom(room.map, objects(), bodies(), {
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
    if (blocked(client, res.map)) return;
    room.commitMap(res.map);
    room.rescue();
    const door = res.door && {
      id: `door-${key}`,
      kind: "door",
      x: res.door.x,
      y: res.door.y,
      rot: res.door.rot,
      props: { state: "open", roomKey: key },
    };
    // its door, in the wall it just got (if it fits there: floor both sides)
    if (door && !openingBlocker(res.map, objects(), door, hungOnEdge(objects())))
      void save(door).then(() => room.rebuildGrid());
  });

  room.on("map:room:update", (client, m) => {
    if (!builder(client)) return;
    const p = room.state.players.get(client.sessionId);
    const was = room.map.areas.find((a) => a.key === m.key);
    // someone's room: only they (or an admin) give it to someone else
    if (m.ownerId !== undefined && was?.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can give ${was.name} to someone else.`);
    const areas = room.map.areas.map((a) => {
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
    if (!blocked(client, { ...room.map, areas })) room.commitMap({ ...room.map, areas });
  });

  room.on("map:room:remove", (client, m) => {
    if (!builder(client)) return;
    const p = room.state.players.get(client.sessionId);
    const was = room.map.areas.find((a) => a.key === m.key);
    if (was?.ownerId && was.ownerId !== p?.uid && !p?.admin)
      return warn(client, `Only ${was.ownerName ?? "its owner"} or an admin can take ${was.name} away.`);
    const next = { ...room.map, areas: room.map.areas.filter((a) => a.key !== m.key) };
    if (!blocked(client, next)) room.commitMap(next);
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
    if (!p || !o || !isLamp(fromSchema(o))) return;
    if (Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5)) > 2.5) return;
    const def = fromSchema(o);
    void save({ ...def, props: { ...(def.props ?? {}), on: !!m.on } });
  });

  // A light switch: every lamp in its room (or, outside a room, nearby) on or off.
  room.on("lights:room", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const sw = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !sw || sw.kind !== "light_switch") return;
    if (Math.hypot(p.x - (sw.x + 0.5), p.y - (sw.y + 0.5)) > 2.5) return;
    const on = !!m.on;
    const where = areaAt(room.map, sw.x + 0.5, sw.y + 0.5)?.key ?? null;
    const swDef = fromSchema(sw);
    void save({ ...swDef, props: { ...(swDef.props ?? {}), on } });
    for (const o of objects()) {
      if (!isLamp(o) || (o.props?.on !== false) === on) continue;
      const inRoom = where
        ? areaAt(room.map, o.x + 0.5, o.y + 0.5)?.key === where
        : Math.hypot(o.x - sw.x, o.y - sw.y) <= 6;
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
    const area = doorRoom(room.map, def);
    const owner = area?.ownerId ?? null;
    const c = doorCentre(def);
    const near = Math.hypot(p.x - c.x, p.y - c.y) <= 2.5;
    // an owner's lock is theirs alone: nobody else (not an admin) opens it
    if (m.state === "locked" || current === "locked") {
      if (!mayLockDoor(room.map, def, p))
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
