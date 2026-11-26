import { isHomeSpace, worldZ } from "@yutopia/shared";
import {
  animalPlacesOf,
  canBeAt,
  checkAnimalPlace,
  checkDefaultChange,
  isGeneratedKey,
} from "@yutopia/shared/animals/habitat";
import { checkVehicles, isCarKind, validLook } from "@yutopia/shared/car";
import { checkNestPlace, nestPlacesOf } from "@yutopia/shared/dark/nests";
import {
  BUILDINGS,
  buildingsFor,
  CHUNK,
  checkEdits,
  editsNow,
  HOME_LOTS,
  heightAt,
  homeLotsFor,
  insideOf,
} from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { beyondLand, REACH_MARGIN } from "@yutopia/shared/land";
import { checkNpcPlaces } from "@yutopia/shared/npc/places";
import { spaceShrinkWhy } from "@yutopia/shared/structure/spaces";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { landEdits } from "../land.ts";
import type { Player } from "../schema.ts";
import { fromSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { claimedKeys } from "./homes.ts";
import { registerFeature } from "./index.ts";

// God mode (docs/plan/53-the-god-mode.md): an admin's draft of edits to the Grounds published —
// checked here against the shared rule book (grounds.ts checkEdits), kept by the API as the next
// revision, laid on the land (here, the land worker, the physics world) — or an older revision
// rolled back to (a new revision of its own). Everyone's client fetches what's laid when
// `groundsRev` moves. Anyone standing where the land rose is lifted onto it. In god mode (phase
// 5) the admin's body stays where it stood, marked "building" (`busy`: their client holds it),
// on foot again walking the draft. Admins only: from anyone else every message is dropped.

/** A body in god mode (Player.busy): drawn standing still, its tag "building". */
export const GOD_BUSY = "god";
/** A publish's note: this long at most. */
const NOTE_MAX = 140;

// (offline, the tests' and a world file's: no API — the revisions and the drafts kept here)
const offline: GroundsEdits[] = [{ rev: 0 }];
/** Offline: the admins' drafts by their ids (plan 55), as the API would keep them. */
export const offlineDrafts = new Map<number, { userId: number; name: string; baseRev: number; data: GroundsEdits }>();

registerFeature((room: WorldRoom) => {
  const admin = (c: WorldClient): Player | null => {
    const p = room.state.players.get(c.sessionId);
    return p?.admin ? p : null;
  };
  const refuse = (c: WorldClient, reason: string, problems: string[] = []) => {
    room.send(c, "god:refused", { reason, problems });
    room.send(c, "toast", { text: reason, tone: "warn" });
  };
  /** God mode's vehicles (docs/plan/102): each a kind and a look there is; a player's own car moved only, never taken
   *  away or repainted. */
  const vehicleProblems = (e: GroundsEdits): string[] => {
    const out = checkVehicles(e, {
      kind: (k) => isCarKind(k),
      look: (k, l) => isCarKind(k) && !!validLook(k, l),
      kindOf: (id) => {
        const o = room.state.objects.get(id);
        if (o?.kind !== "car") return undefined;
        const m = fromSchema(o).props?.model;
        return typeof m === "string" ? m : "sedan";
      },
    });
    const owned = (id: string) => {
      const o = room.state.objects.get(id);
      return !!(o?.kind === "car" && fromSchema(o).props?.ownerId);
    };
    for (const id of e.vehicles?.remove ?? []) if (owned(id)) out.push(`${id}: someone's own car isn't taken away`);
    for (const [id, c] of Object.entries(e.vehicles?.change ?? {}))
      if (owned(id) && (c.look || c.model || c.role !== undefined || c.plate !== undefined))
        out.push(`${id}: someone's own car is only moved`);
    return out;
  };
  /** The town's buildings' insides (plan 112, plan 54's rule): none moved, resized, restyled or turned so that what's
   *  built in it is left outside it, on a storey it hasn't now, or laid over — every building as these edits would
   *  have it, not only those they name (a draft's a whole set: an entry left out puts its building back as the town
   *  had it; a rollback the same — plan 113 review). One taken away keeps its inside, out of the world. */
  // the draft's NPCs (plans 121, 123): each one of the cast, their home and work in a town building that's there — on
  // one of its storeys —, their floors floors there are
  const npcProblems = (e: GroundsEdits): string[] => {
    const floors = room.structure.floors;
    return checkNpcPlaces(e, {
      npc: (k) => room.cast.get(k),
      home: (k) => floors.some((f) => f.space === k && (f.storey ?? 0) === 0),
      level: (l) => l === 0 || floors.some((f) => f.index === l),
      storeyOf: (b, l) => floors.some((f) => f.space === b && f.index === l),
      within: (l, x, z) =>
        floors.some(
          (f) =>
            f.index === l && x >= f.grid.x0 && x <= f.grid.x0 + f.grid.w && z >= f.grid.y0 && z <= f.grid.y0 + f.grid.h,
        ),
    });
  };
  const spaceProblems = (e: GroundsEdits): string[] => {
    const out: string[] = [];
    // (plan 130: a claimed lot stays as it is — given back or freed first)
    const now = new Map(homeLotsFor(e).map((l) => [l.key, l]));
    for (const key of claimedKeys(room.structure.floors)) {
      const was = HOME_LOTS.find((l) => l.key === key);
      const is = now.get(key);
      if (!was) continue;
      // (whose, by name: an admin's own test claim read as "someone's", 11-26)
      const who = room.structure.floors.find((f) => f.space === `home:${key}` && f.claim)?.claim?.ownerName;
      const whose = who ? `${who}'s` : "someone's";
      if (!is)
        out.push(
          `${was.name} is ${whose}: free it first (Free it on the lot's card by its sign, or in God mode with it picked)`,
        );
      else if (is.x0 !== was.x0 || is.z0 !== was.z0 || is.x1 !== was.x1 || is.z1 !== was.z1)
        out.push(`${was.name} is ${whose}: free it before moving it`);
    }
    const things = [...room.state.objects.values()].map(fromSchema);
    const after = new Map(buildingsFor(e).map((b) => [b.key, b]));
    for (const was of BUILDINGS) {
      const now = after.get(was.key);
      if (!now) continue;
      const why = spaceShrinkWhy(room.structure, was, now, things);
      if (why) out.push(why);
    }
    return out;
  };
  // one publish at a time: the next is made on what this one leaves live
  let busy = false;

  /** Lay these edits as the world's, and set down whoever stands where the land moved. */
  const lay = (edits: GroundsEdits) => {
    // (which buildings were furnished before: a toggle in this publish lays or takes away their furniture — plan 113)
    const furnished = new Map(BUILDINGS.map((b) => [b.key, !!b.enter]));
    const dirty = new Set(landEdits(edits).map(([x, z]) => `${x},${z}`));
    room.state.groundsRev = edits.rev;
    const turned = new Set(
      BUILDINGS.filter((b) => furnished.has(b.key) && furnished.get(b.key) !== !!b.enter).map((b) => b.key),
    );
    // (the town's buildings' insides with them: laid, moved, regrown, taken out of the world — plan 112)
    // (plan 130: a home lot's storeys aren't a building's — never moved by a publish)
    const before = new Map(
      room.structure.floors.filter((f) => f.space !== undefined && !isHomeSpace(f.space)).map((f) => [f.index, f]),
    );
    room.fixSpaces([...room.state.objects.values()].map(fromSchema), false, turned);
    // (whoever's inside one: with it where it moved; out at its door if it turned; back where they arrive if it's
    // gone — plan 113 review)
    for (const p of room.state.players.values()) {
      const was = before.get(p.level);
      if (!was) continue;
      const now = room.structure.floors.find((f) => f.index === p.level);
      const c = room.clients.getById(p.sid) as WorldClient | undefined;
      const b = BUILDINGS.find((q) => q.key === was.space);
      const say = (text: string) => c && !p.bot && room.send(c, "toast", { text });
      if (!now || now.away || !b) {
        const to = room.arrivalFor(p);
        Object.assign(p, { x: to.x, y: to.y, level: to.level, z: worldZ(to.level, 0) });
        say("The building you were in is gone: you're back where you arrive.");
      } else if (now.turn !== was.turn) {
        // (out on the street at its door)
        const d = insideOf(b)?.door;
        if (!d) continue;
        const m = (d.from + d.to) / 2;
        const o = d.dir === "h" ? (d.at === b.z1 ? 1 : -1) : d.at === b.x1 ? 1 : -1;
        const [x, y] = d.dir === "h" ? [m, d.at + o * 1.5] : [d.at + o * 1.5, m];
        Object.assign(p, { x, y, level: 0, z: heightAt(x, y) });
        say(`${b.name} was laid out again: you're at its door.`);
      } else {
        const dx = now.grid.x0 - was.grid.x0;
        const dy = now.grid.y0 - was.grid.y0;
        // (its floor's height with it too: moved onto higher ground, not left in the slab — plan 113 review)
        const dz = now.z - was.z;
        if (!dx && !dy && !dz) continue;
        p.x = Math.round((p.x + dx) * 1000) / 1000;
        p.y = Math.round((p.y + dy) * 1000) / 1000;
        p.z = Math.round((p.z + dz) * 1000) / 1000;
      }
      p.area = room.areaOf(p)?.key ?? "";
      if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    }
    for (const p of room.state.players.values()) {
      const g = room.gridFor(p.uid, p.level);
      if (!g.onLand(p.x, p.y)) continue;
      const _lm = room.levelMap(p.level);
      const x = p.x;
      const z = p.y;
      if (!dirty.has(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`)) continue;
      // (on grown land taken away, past the world's edge now: back where they arrive — docs/plan/69)
      if (beyondLand(x, z) > REACH_MARGIN) {
        const to = room.arrivalFor(p);
        Object.assign(p, { x: to.x, y: to.y, level: to.level, z: worldZ(to.level, 0) });
        const c = room.clients.getById(p.sid) as WorldClient | undefined;
        if (c) {
          room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
          if (!p.bot) room.send(c, "toast", { text: "The land you stood on is gone: you're back where you arrive." });
        }
        continue;
      }
      // (under the land now: onto it)
      const h = heightAt(x, z);
      if (p.z < h - 0.05) {
        p.z = h;
        const c = room.clients.getById(p.sid) as WorldClient | undefined;
        if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
      }
      // (in a building put down over them, not one you walk into: out by its nearest wall)
      const b = BUILDINGS.find((u) => !u.enter && u.kind !== "hq" && x > u.x0 && x < u.x1 && z > u.z0 && z < u.z1);
      if (b) {
        const out = [
          [b.x0 - 0.8, z, x - b.x0],
          [b.x1 + 0.8, z, b.x1 - x],
          [x, b.z0 - 0.8, z - b.z0],
          [x, b.z1 + 0.8, b.z1 - z],
        ].sort((a, c) => a[2] - c[2])[0];
        p.x = out[0];
        p.y = out[1];
        p.z = heightAt(out[0], out[1]);
        const c = room.clients.getById(p.sid) as WorldClient | undefined;
        if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
      }
      const c = room.clients.getById(p.sid) as WorldClient | undefined;
      if (c && !p.bot)
        room.send(c, "toast", {
          text: b ? `${b.name} stands here now: you're moved out of it.` : "The ground shifts here.",
        });
    }
  };

  /** Keep `data` as the next revision (the API's, or here offline) and lay it. */
  const commit = async (
    p: Player,
    data: GroundsEdits,
    how: { note: string; rollbackOf?: number | null; draftId?: number },
  ): Promise<number> => {
    const baseRev = room.state.groundsRev;
    let rev: number;
    if (config.offline) {
      rev = offline.length;
      offline.push({ ...data, rev });
    } else {
      const r = await api.publishGrounds({ adminId: p.uid, data, baseRev, ...how });
      rev = r.revision.rev;
    }
    lay({ ...data, rev });
    return rev;
  };

  // who's in god mode (session ids), walking the draft or not
  const inGod = new Map<string, { walking: boolean }>();
  room.on("god:enter", (c) => {
    const p = admin(c);
    if (!p || inGod.has(c.sessionId)) return;
    inGod.set(c.sessionId, { walking: false });
    p.busy = GOD_BUSY;
    room.adminLog(p, "god", null, "in");
  });
  room.on("god:walk", (c, m) => {
    const p = admin(c);
    const g = inGod.get(c.sessionId);
    if (!p || !g) return;
    g.walking = m?.on === true;
    p.busy = g.walking ? "" : GOD_BUSY;
  });
  const out = (sid: string, p: Player | undefined) => {
    if (!inGod.delete(sid) || !p) return false;
    if (p.busy === GOD_BUSY) p.busy = "";
    return true;
  };
  room.on("god:leave", (c) => {
    const p = admin(c);
    if (p && out(c.sessionId, p)) room.adminLog(p, "god", null, "out");
  });

  room.on("god:publish", async (c, m) => {
    const p = admin(c);
    if (!p) return;
    if (busy) return refuse(c, "A publish is under way: try again in a moment.");
    busy = true;
    try {
      const note = String(m?.note ?? "").slice(0, NOTE_MAX);
      // the admin's draft, by its id (docs/plan/55-the-drafts.md): theirs, or none
      const id = Number(m?.draftId);
      if (!Number.isInteger(id) || id < 1) return refuse(c, "There's no draft to publish.");
      const draft = config.offline
        ? (offlineDrafts.get(id) ?? null)
        : await api.groundsDraft(id).then(
            (r) => r.draft,
            () => null,
          );
      if (!draft || draft.userId !== p.uid) return refuse(c, "There's no draft to publish.");
      if (draft.baseRev !== room.state.groundsRev)
        return refuse(
          c,
          `Revision ${room.state.groundsRev} is live; your draft was made on ${draft.baseRev}. Bring it up to date first.`,
        );
      const problems = [
        ...checkEdits(draft.data),
        ...vehicleProblems(draft.data),
        ...spaceProblems(draft.data),
        ...npcProblems(draft.data),
        // (plan 126) the draft's animal places: herds, dens, nests, empty places, pens — each sound
        ...animalPlacesOf(draft.data)
          .map((p) => checkAnimalPlace(p))
          .filter((w): w is string => !!w),
        // (plan 127) the land's own groups changed: sound, and one moved where it can be (F7a) — only those this draft
        // changes (one published long ago, its land changed since, doesn't hold every later publish up)
        ...Object.entries(draft.data.animals?.change ?? {})
          .filter(
            ([k, c]) =>
              isGeneratedKey(k) &&
              JSON.stringify(editsNow().animals?.change?.[k] ?? null) !== JSON.stringify(c ?? null),
          )
          .map(([k, c]) => checkDefaultChange(k, c, canBeAt))
          .filter((w): w is string => !!w),
        ...(draft.data.animals?.remove ?? [])
          .filter((k) => typeof k !== "string" || k.length > 40)
          .map((k) => `${String(k).slice(0, 40)}: a key to take away`),
        // (plan 127) the dark's nests God mode put down, its places kept clear
        ...nestPlacesOf(draft.data)
          .map((p) => checkNestPlace(p))
          .filter((w): w is string => !!w),
      ];
      if (problems.length) return refuse(c, "The draft can't be published as it is.", problems);
      const rev = await commit(p, draft.data, { note, draftId: id });
      if (config.offline) offlineDrafts.delete(id);
      room.adminLog(p, "publish", null, `revision ${rev} (${draft.name})${note ? `: ${note}` : ""}`);
      room.send(c, "god:published", { rev });
    } catch (e) {
      console.error("[god] publish:", e);
      refuse(c, "Couldn't publish: the API didn't take it.");
    } finally {
      busy = false;
    }
  });

  room.on("god:rollback", async (c, m) => {
    const p = admin(c);
    if (!p) return;
    const to = Number(m?.rev);
    if (!Number.isInteger(to) || to < 0 || to >= room.state.groundsRev)
      return refuse(c, "Not a revision to roll back to.");
    if (busy) return refuse(c, "A publish is under way: try again in a moment.");
    busy = true;
    try {
      const data: GroundsEdits =
        to === 0
          ? { rev: 0 }
          : config.offline
            ? (offline[to] ?? { rev: 0 })
            : (await api.groundsRevision(to)).revision.data;
      // (the same rule as a publish: no rolling back past what's been built inside a building since — plan 113 review)
      const problems = spaceProblems(data);
      if (problems.length) return refuse(c, "Can't roll back to that revision as things are.", problems);
      const rev = await commit(p, data, { note: `Roll back to ${to}`, rollbackOf: to || null });
      room.adminLog(p, "rollback", null, `to revision ${to} (now ${rev})`);
      room.send(c, "god:published", { rev });
    } catch (e) {
      console.error("[god] roll back:", e);
      refuse(c, "Couldn't roll back: the API didn't take it.");
    } finally {
      busy = false;
    }
  });

  return {
    leave(client, p) {
      if (out(client.sessionId, p)) room.adminLog(p, "god", null, "out (left)");
    },
    join(client) {
      // (the edits laid now: every client fetches them on its own from the API; offline, sent)
      if (config.offline && editsNow().rev) room.send(client, "god:edits", editsNow());
    },
  };
});
