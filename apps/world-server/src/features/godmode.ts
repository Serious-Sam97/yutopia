import { BUILDINGS, CHUNK, checkEdits, editsNow, heightAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { landEdits } from "../land.ts";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
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
  // one publish at a time: the next is made on what this one leaves live
  let busy = false;

  /** Lay these edits as the world's, and set down whoever stands where the land moved. */
  const lay = (edits: GroundsEdits) => {
    const dirty = new Set(landEdits(edits).map(([x, z]) => `${x},${z}`));
    room.state.groundsRev = edits.rev;
    for (const p of room.state.players.values()) {
      const g = room.gridFor(p.uid, p.level);
      if (!g.onLand(p.x, p.y)) continue;
      const lm = room.levelMap(p.level);
      const x = p.x + (lm.ox ?? 0);
      const z = p.y + (lm.oy ?? 0);
      if (!dirty.has(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`)) continue;
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
        p.x = out[0] - (lm.ox ?? 0);
        p.y = out[1] - (lm.oy ?? 0);
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
      const problems = checkEdits(draft.data);
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
