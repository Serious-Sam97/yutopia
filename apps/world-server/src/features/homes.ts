import {
  claimOps,
  claimSetOps,
  entry,
  type HomeLotDef,
  homeKeyOf,
  isHomeSpace,
  isOpening,
  type LotMate,
  lotFloors,
  lotGround,
  lotOf,
  lotRole,
  lotSign,
  objLevel,
  releaseOps,
  STOREY_RISES,
  type StoreyRise,
  storeyAddOps,
  storeyRemoveOps,
  type WorldObjectDef,
  worldZ,
} from "@yutopia/shared";
import { BLUEPRINT_MAX_BYTES, type BlueprintData, blueprintBuild } from "@yutopia/shared/blueprints";
import { HOME_LOTS, heightAt } from "@yutopia/shared/grounds";
import { onOf, placeOnWall } from "@yutopia/shared/structure";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Home lots (docs/plan/130-the-house-build.md, phase 1 — F1a, F2a; shared homes.ts): a member claims a free lot — one
// each — and builds a house on it; its owner lets roommates build there too; storeys go up and basements down; the lot
// given back takes all of it. Admins give a lot to someone or free it.

const MATES_MAX = 8;

registerFeature((room: WorldRoom) => {
  const me = (c: WorldClient) => room.state.players.get(c.sessionId);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const say = (c: WorldClient, text: string) => room.send(c, "toast", { text });
  const lotBy = (key: unknown): HomeLotDef | null => HOME_LOTS.find((l) => l.key === key) ?? null;
  /** The things on a lot's storeys (all of them, or one). */
  const thingsOn = (levels: Set<number>): WorldObjectDef[] =>
    [...room.state.objects.values()].map(fromSchema).filter((o) => levels.has(objLevel(o, room.map)));
  const drop = (id: string) => {
    room.state.objects.delete(id);
    if (!config.offline) void api.deleteObject(id).catch(() => {});
  };
  /** Whoever stands on these floors: out onto the land, by the lot's sign. */
  const evacuate = (levels: Set<number>, lot: HomeLotDef) => {
    const s = lotSign(lot);
    for (const p of room.state.players.values()) {
      if (!levels.has(p.level)) continue;
      Object.assign(p, { x: s.x, y: s.z - 1, level: 0, z: heightAt(s.x, s.z - 1) });
      const c = room.clients.getById(p.sid) as WorldClient | undefined;
      if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    }
  };
  /** A lot given back (or freed by an admin): its storeys and everything on them gone. */
  const release = (key: string) => {
    const lot = lotBy(key);
    const levels = new Set(lotFloors(room.structure, key).map((f) => f.index));
    if (!levels.size) return false;
    for (const o of thingsOn(levels)) drop(o.id);
    if (lot) evacuate(levels, lot);
    room.applyStruct(releaseOps(room.structure, key));
    room.rebuildGrid();
    return true;
  };
  const claimFor = (lot: HomeLotDef, who: LotMate): boolean => {
    const ops = claimOps(room.structure, lot, who, heightAt((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2));
    if (!ops) return false;
    room.applyStruct(ops);
    room.rebuildGrid();
    return true;
  };
  /** The lot a message is about (by its key, else the one `uid` has) and whether they may change it. */
  const mine = (c: WorldClient, key: unknown, owner = false): HomeLotDef | null => {
    const p = me(c);
    if (!p) return null;
    const k = typeof key === "string" && key ? key : lotOf(room.structure, p.uid);
    const lot = k ? lotBy(k) : null;
    if (!lot || !lotGround(room.structure, lot.key)) {
      warn(c, "You haven't a lot yet.");
      return null;
    }
    const role = lotRole(room.structure, lot.key, p.uid);
    if (p.admin || role === "owner" || (!owner && role === "mate")) return lot;
    warn(c, owner ? "Only its owner can do that." : "That's not your lot.");
    return null;
  };

  room.on("lot:claim", (client, m) => {
    const p = me(client);
    const lot = lotBy(m?.key);
    if (!p || !lot || p.bot) return;
    // (as many as they like: no limit — 2026-11-26)
    if (lotRole(room.structure, lot.key, p.uid) === "owner") return warn(client, "It's yours already.");
    if (lotGround(room.structure, lot.key)) return warn(client, "Someone's claimed it already.");
    if (!claimFor(lot, { uid: p.uid, name: p.name })) return warn(client, "No room in the world for another house.");
    say(client, `${lot.name} is yours. Press B to build.`);
    room.broadcastMsg("toast", { text: `${p.name.split(" ")[0]} claimed ${lot.name} in ${lot.area ?? "town"}.` });
  });

  room.on("lot:release", (client, m) => {
    const lot = mine(client, m?.key, true);
    if (!lot) return;
    release(lot.key);
    say(client, `${lot.name} is free again.`);
  });

  // roommates: the owner adds someone who's here, or takes one off
  room.on("lot:mate", (client, m) => {
    const lot = mine(client, m?.key, true);
    if (!lot) return;
    const g = lotGround(room.structure, lot.key);
    if (!g?.claim) return;
    const uid = Number(m?.uid);
    if (!Number.isInteger(uid) || uid <= 0 || uid === g.claim.owner) return;
    const mates = (g.claim.mates ?? []).filter((q) => q.uid !== uid);
    if (m?.add) {
      const them = [...room.state.players.values()].find((q) => q.uid === uid && !q.bot);
      if (!them) return warn(client, "They have to be here to be added.");
      if (mates.length >= MATES_MAX) return warn(client, `${MATES_MAX} roommates at most.`);
      mates.push({ uid, name: them.name });
      const c = room.clients.getById(them.sid) as WorldClient | undefined;
      if (c) say(c, `${g.claim.ownerName.split(" ")[0]} made you a roommate on ${lot.name}: you can build there.`);
    }
    const ops = claimSetOps(room.structure, lot.key, { ...g.claim, mates });
    if (ops) room.applyStruct(ops);
  });

  // a storey on top or a basement under: its owner or a roommate
  room.on("lot:storey", (client, m) => {
    const lot = mine(client, m?.key);
    if (!lot) return;
    const dir = m?.dir === "down" ? "down" : "up";
    const rise: StoreyRise = (m?.rise as StoreyRise) in STOREY_RISES ? (m.rise as StoreyRise) : "normal";
    const ops = storeyAddOps(room.structure, lot, dir, rise);
    if (typeof ops === "string") return warn(client, `${ops[0].toUpperCase()}${ops.slice(1)}.`);
    room.applyStruct(ops);
    room.rebuildGrid();
    // (up with no room under it: nothing to stand on up there yet — its floor comes over the rooms under it)
    const floored = ops.some((o) => o.op === "slabs");
    say(
      client,
      dir === "down"
        ? "A basement dug."
        : floored
          ? "A new storey on top."
          : "A new storey on top — close a room with walls under it to have a floor up there.",
    );
  });

  room.on("lot:storey:remove", (client, m) => {
    const lot = mine(client, m?.key);
    const level = Number(m?.level);
    if (!lot || !Number.isInteger(level)) return;
    const ops = storeyRemoveOps(room.structure, lot.key, level);
    if (typeof ops === "string") return warn(client, `${ops[0].toUpperCase()}${ops.slice(1)}.`);
    for (const o of thingsOn(new Set([level]))) drop(o.id);
    // (whoever's on it: down to the ground storey's, by the sign)
    evacuate(new Set([level]), lot);
    room.applyStruct(ops);
    room.rebuildGrid();
    say(client, "That storey's gone.");
  });

  // (plan 130 phase 12) a blueprint built on my empty lot: its storeys, its pieces, its things (each a new id)
  let bpSeq = 0;
  room.on("lot:blueprint", (client, m) => {
    const lot = mine(client, m?.key);
    if (!lot) return;
    const data = m?.data as BlueprintData;
    if (!data || typeof data !== "object" || JSON.stringify(data).length > BLUEPRINT_MAX_BYTES)
      return warn(client, "That blueprint won't do.");
    const id = (k: string) => `${k[0]}b${Date.now().toString(36)}${(bpSeq++).toString(36)}`;
    const all = [...room.state.objects.values()].map(fromSchema);
    let r: ReturnType<typeof blueprintBuild>;
    try {
      r = blueprintBuild(room.structure, lot, data, all, id);
    } catch {
      return warn(client, "That blueprint won't do.");
    }
    if (typeof r === "string") return warn(client, `${r[0].toUpperCase()}${r.slice(1)}.`);
    room.applyStruct(r.ops);
    // (its things: what may be built, a door or window placed on its wall's new id)
    let n = 0;
    for (const o of r.things) {
      if (!entry(o.kind).buildable) continue;
      let def = o;
      const on = isOpening(o.kind) && o.props?.free === true ? onOf(o) : null;
      if (on) {
        const w = room.structure.walls.find((q) => q.id === on.wall);
        if (!w) continue;
        def = { ...o, ...placeOnWall(w, on.at, o) };
      }
      room.state.objects.set(def.id, toSchema(def));
      if (!config.offline) void api.putObject(def).catch(() => {});
      n++;
    }
    room.rebuildGrid();
    say(client, `Built from the blueprint (${n} things in it).`);
  });

  // admins: a lot given to someone here, or freed
  room.on("lot:assign", (client, m) => {
    const p = me(client);
    const lot = lotBy(m?.key);
    if (!p?.admin || !lot) return;
    const uid = Number(m?.uid);
    const them = [...room.state.players.values()].find((q) => q.uid === uid && !q.bot);
    if (!them) return warn(client, "They have to be here.");
    const g = lotGround(room.structure, lot.key);
    if (g?.claim) {
      const ops = claimSetOps(room.structure, lot.key, {
        ...g.claim,
        owner: uid,
        ownerName: them.name,
        mates: (g.claim.mates ?? []).filter((q) => q.uid !== uid),
      });
      if (ops) room.applyStruct(ops);
    } else if (!claimFor(lot, { uid, name: them.name })) return warn(client, "No room in the world for another house.");
    say(client, `${lot.name} is ${them.name.split(" ")[0]}'s now.`);
  });

  room.on("lot:free", (client, m) => {
    const p = me(client);
    const lot = lotBy(m?.key);
    if (!p?.admin || !lot) return;
    if (release(lot.key)) say(client, `${lot.name} is free again.`);
  });

  // (to my lot — the one asked for, if it's mine or I room there; else my first —: by its sign, on the land)
  room.on("lot:go", (client, m) => {
    const p = me(client);
    const asked = typeof m?.key === "string" && p && lotRole(room.structure, m.key, p.uid) ? m.key : null;
    const key = asked ?? (p ? lotOf(room.structure, p.uid) : null);
    const lot = key ? lotBy(key) : null;
    if (!p || !lot) return warn(client, "You haven't a lot yet.");
    const s = lotSign(lot);
    const [x, y] = [s.x + 1, s.z - 1.5];
    Object.assign(p, { x, y, level: 0, z: worldZ(0, heightAt(x, y)) });
    room.send(client, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
  });
  return {};
});

/** (for the publish's rules) A claimed lot's key, by a floor's space. */
export const claimedKeys = (floors: readonly { space?: string; claim?: unknown; away?: boolean }[]): string[] =>
  floors.filter((f) => isHomeSpace(f.space) && f.claim).map((f) => homeKeyOf(f.space as string));
