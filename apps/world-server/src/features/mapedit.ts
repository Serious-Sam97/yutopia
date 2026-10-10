import {
  addRoom,
  applyPaint,
  blankMap,
  doorRoom,
  isFloor,
  MAP_MAX,
  MAP_MIN,
  type MapDef,
  paintBlocker,
  ROOM_KINDS,
  resizeMap,
  roomKey,
  tileAt,
  type WorldObjectDef,
} from "@yutopia/shared";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, safeJson, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Builders edit the map itself: paint walls/floors, draw rooms (with an owner),
// resize or start blank, move the arrival point, assign desks. Doors: anyone
// opens/closes; the room's owner (or a builder) locks. The shared rules
// (packages/shared/src/map-edit.ts) decide what's allowed.
registerFeature((room: SpaceRoom) => {
  const builder = (c: SpaceClient) => room.state.players.get(c.sessionId)?.builder === true;
  const objects = (): WorldObjectDef[] => [...room.state.objects.values()].map(fromSchema);
  const bodies = () => [...room.state.players.values()].map((p) => ({ x: p.x, y: p.y }));
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });

  const save = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await yondra.putObject(room.spaceId, o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
  const drop = async (id: string) => {
    room.state.objects.delete(id);
    if (!config.offline) await yondra.deleteObject(room.spaceId, id).catch(() => {});
  };
  // People standing somewhere that's no longer floor go back to the arrival point.
  const rescue = (map: MapDef) => {
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (!p || isFloor(tileAt(map, Math.floor(p.x), Math.floor(p.y)))) continue;
      p.x = map.spawn.x;
      p.y = map.spawn.y;
      room.send(c, "snap", { x: p.x, y: p.y });
    }
  };

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
    if (ok.length) room.commitMap(applyPaint(room.map, ok));
    if (reason) warn(client, `Skipped a tile: ${reason}.`);
  });

  room.on("map:resize", (client, m) => {
    if (!builder(client)) return;
    const next = resizeMap(room.map, Number(m.width), Number(m.height));
    for (const o of objects()) if (o.x >= next.width || o.y >= next.height) void drop(o.id);
    room.commitMap(next);
    rescue(next);
    room.broadcastMsg("toast", { text: `The studio is now ${next.width}×${next.height}.` });
  });

  room.on("map:new", (client, m) => {
    if (!builder(client)) return;
    const w = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.width) || 32)));
    const h = Math.max(MAP_MIN, Math.min(MAP_MAX, Math.floor(Number(m.height) || 24)));
    const next = blankMap(room.map.key, room.map.name, w, h);
    for (const o of objects()) void drop(o.id);
    room.commitMap(next);
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (!p) continue;
      p.x = next.spawn.x + (Math.random() - 0.5) * 3;
      p.y = next.spawn.y + (Math.random() - 0.5);
      p.desk = "";
      room.send(c, "snap", { x: p.x, y: p.y });
    }
    room.broadcastMsg("toast", { text: `A blank ${w}×${h} studio. Time to build.` });
  });

  room.on("map:spawn", (client, m) => {
    if (!builder(client)) return;
    const x = Math.floor(Number(m.x));
    const y = Math.floor(Number(m.y));
    if (!room.grid.ok(x, y)) return warn(client, "Pick an open floor tile.");
    room.commitMap({ ...room.map, spawn: { x: x + 0.5, y: y + 0.5 } });
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
    });
    if (typeof res === "string") return warn(client, `Couldn't make the room: ${res}.`);
    room.commitMap(res.map);
    if (res.door)
      void save({
        id: `door-${key}`,
        kind: "door",
        x: res.door.x,
        y: res.door.y,
        rot: res.door.rot,
        props: { state: "open", roomKey: key },
      }).then(() => room.rebuildGrid());
  });

  room.on("map:room:update", (client, m) => {
    if (!builder(client)) return;
    const areas = room.map.areas.map((a) => {
      if (a.key !== m.key) return a;
      const next = { ...a };
      if (typeof m.name === "string" && m.name.trim()) next.name = m.name.trim().slice(0, 40);
      if (ROOM_KINDS.includes(m.kind as never)) next.kind = m.kind as (typeof ROOM_KINDS)[number];
      if (m.ownerId !== undefined) {
        next.ownerId = Number.isInteger(m.ownerId) && (m.ownerId as number) > 0 ? (m.ownerId as number) : null;
        next.ownerName = next.ownerId ? String(m.ownerName ?? "").slice(0, 120) || null : null;
      }
      return next;
    });
    room.commitMap({ ...room.map, areas });
  });

  room.on("map:room:remove", (client, m) => {
    if (!builder(client)) return;
    room.commitMap({ ...room.map, areas: room.map.areas.filter((a) => a.key !== m.key) });
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

  room.on("door:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id));
    if (!p || !o || o.kind !== "door" || !["open", "closed", "locked"].includes(m.state)) return;
    const def = fromSchema(o);
    const current = String(def.props?.state ?? "open");
    const area = doorRoom(room.map, def);
    const owner = area?.ownerId ?? null;
    const near = Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5)) <= 2.5;
    const mayLock = p.uid === owner || p.builder;
    if (m.state === "locked" || current === "locked") {
      if (!mayLock)
        return warn(
          client,
          owner
            ? `Only ${area?.ownerName ?? "the room's owner"} can lock or unlock this door.`
            : "Only a project owner can lock this door.",
        );
    } else if (!near) return;
    void save({ ...def, props: { ...(def.props ?? {}), state: m.state } }).then(() => room.rebuildGrid());
  });

  return {};
});
