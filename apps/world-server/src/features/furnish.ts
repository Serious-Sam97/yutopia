import {
  areaAt,
  CATALOG,
  type ClientMessages,
  canPlace,
  dressItems,
  entry,
  isKind,
  takenId,
  type WorldObjectDef,
} from "@yutopia/shared";
import { config } from "../config.ts";
import { cleanProps, fromSchema, type SpaceClient, type SpaceRoom, surfaceRiders, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Build mode, Sims-style: a builder's hand (what they're holding, so nobody
// else grabs it), moving or copying a group in one go (all or nothing), and
// the rooms' generated clutter turned into real things you can move.
const MAX_BATCH = 60;
const HOLD_MS = 120_000; // a forgotten hand lets go after two minutes

registerFeature((room: SpaceRoom) => {
  const builder = (c: SpaceClient) => {
    const p = room.state.players.get(c.sessionId);
    return p?.builder ? p : null;
  };
  const heldAt = new Map<string, number>(); // id → when it was picked up
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const release = (uid: number) => {
    for (const [id, h] of room.state.holds.entries())
      if (Number(h.split("|")[0]) === uid) {
        room.state.holds.delete(id);
        heldAt.delete(id);
      }
  };

  room.on("obj:hold", (client, m: ClientMessages["obj:hold"]) => {
    const p = builder(client);
    if (!p) return;
    release(p.uid);
    const now = Date.now();
    for (const id of (Array.isArray(m?.ids) ? m.ids : []).slice(0, MAX_BATCH)) {
      const o = room.state.objects.get(String(id));
      if (!o || !entry(o.kind).buildable) continue;
      const stale = now - (heldAt.get(o.id) ?? 0) > HOLD_MS;
      if (room.heldByOther(o.id, p.uid) && !stale) {
        warn(client, `${room.holderName(o.id)} is moving that.`);
        continue;
      }
      room.state.holds.set(o.id, `${p.uid}|${p.name}`);
      heldAt.set(o.id, now);
    }
  });

  room.on("obj:batch", async (client, m: ClientMessages["obj:batch"]) => {
    const p = builder(client);
    const items = Array.isArray(m?.items) ? m.items.slice(0, MAX_BATCH) : [];
    if (!p || !items.length) return;
    const ids = new Set(items.map((i) => i.id).filter((id): id is string => typeof id === "string" && !!id));
    const rest = objects().filter((o) => !ids.has(o.id));
    const bodies = [...room.state.players.values()];
    const next: WorldObjectDef[] = [];
    const base = Date.now().toString(36);
    for (const [n, it] of items.entries()) {
      if (!isKind(it.kind) || !CATALOG[it.kind] || !entry(it.kind).buildable || it.kind === "door") return;
      const id = typeof it.id === "string" && it.id ? it.id.slice(0, 64) : `b-${it.kind}-${base}${n}`;
      const existing = room.state.objects.get(id);
      if ((existing && existing.kind !== it.kind) || next.some((d) => d.id === id)) return; // same thing twice: no
      if (room.heldByOther(id, p.uid)) return warn(client, `${room.holderName(id)} is moving that.`);
      const x = it.x | 0;
      const y = it.y | 0;
      const def: WorldObjectDef = {
        id,
        kind: it.kind,
        x,
        y,
        rot: ((it.rot | 0) + 4) % 4,
        refId: existing?.refId || null,
        props: cleanProps(
          it.kind,
          it.props ?? (existing ? (fromSchema(existing).props ?? {}) : {}),
          [...rest, ...next],
          x,
          y,
          ((it.rot | 0) + 4) % 4,
        ),
      };
      // the group can't overlap the room, or itself
      if (!canPlace(room.map, [...rest, ...next], def, bodies)) return warn(client, "That doesn't all fit there.");
      next.push(def);
    }
    const before = new Map(objects().map((o) => [o.id, o]));
    for (const def of next) {
      const saved = config.offline ? def : (await yondra.putObject(room.spaceId, def)).object;
      room.state.objects.set(saved.id, toSchema(saved));
      room.state.holds.delete(saved.id);
      const was = before.get(saved.id);
      if (was) await room.carryTabletops(was, saved, ids);
    }
    room.rebuildGrid();
  });

  room.on("obj:removeMany", async (client, m: ClientMessages["obj:removeMany"]) => {
    const p = builder(client);
    if (!p) return;
    const all = objects();
    const gone = new Set<string>();
    for (const id of (Array.isArray(m?.ids) ? m.ids : []).slice(0, MAX_BATCH)) {
      const o = room.state.objects.get(String(id));
      if (!o || !entry(o.kind).buildable) continue;
      if (room.heldByOther(o.id, p.uid)) {
        warn(client, `${room.holderName(o.id)} is moving that.`);
        continue;
      }
      gone.add(o.id);
      for (const r of surfaceRiders(fromSchema(o), all)) gone.add(r);
    }
    for (const id of gone) {
      if (!config.offline) await yondra.deleteObject(room.spaceId, id).catch(() => {});
      room.state.objects.delete(id);
      room.state.holds.delete(id);
    }
    room.rebuildGrid();
  });

  // A generated piece of clutter: hide it from the rules (per room), and for
  // "take", put the same thing there as a real object you can now move.
  const fromDressing = (client: SpaceClient, pieceId: string, take: boolean) => {
    const p = builder(client);
    if (!p) return;
    const piece = dressItems(room.map, objects()).find((d) => d.id === pieceId);
    if (!piece) return;
    const area = areaAt(room.map, piece.x, piece.kind === "frame" ? piece.y + 0.25 : piece.y);
    if (!area) return;
    const areas = room.map.areas.map((a) =>
      a.key === area.key ? { ...a, dressOff: [...new Set([...(a.dressOff ?? []), piece.id])].slice(-400) } : a,
    );
    room.commitMap({ ...room.map, areas });
    if (!take) return;
    const kind = piece.kind === "frame" ? "frame" : "decor";
    const x = Math.floor(piece.x);
    const y = piece.kind === "frame" ? Math.round(piece.y) : Math.floor(piece.y);
    const all = objects();
    const def: WorldObjectDef = {
      id: takenId(piece.id),
      kind,
      x,
      y,
      rot: 0,
      props: cleanProps(kind, { d: piece.kind, seed: piece.seed }, all, x, y),
    };
    room.state.objects.set(def.id, toSchema(def));
    room.state.holds.set(def.id, `${p.uid}|${p.name}`);
    heldAt.set(def.id, Date.now());
    if (!config.offline) void yondra.putObject(room.spaceId, def).catch(() => {});
    room.rebuildGrid();
  };
  room.on("dress:take", (client, m: ClientMessages["dress:take"]) => fromDressing(client, String(m?.id ?? ""), true));
  room.on("dress:hide", (client, m: ClientMessages["dress:hide"]) => fromDressing(client, String(m?.id ?? ""), false));

  return {
    leave: (_client, p) => release(p.uid),
  };
});
