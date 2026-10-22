import { MUZZLE_REACH } from "@yutopia/shared/dark";
import { heightAt } from "@yutopia/shared/grounds";
import { unpackMv } from "@yutopia/shared/move";
import { BALL_R, newBall, POOL_L, POOL_W } from "@yutopia/shared/pool";
import { packGame, unpackGame } from "@yutopia/shared/pool-game";
import {
  type Column,
  flyStep,
  heldBall,
  KNOCK,
  type Launch,
  launch,
  OFF_TABLE,
  PBALL,
  restOf,
  SETTLE,
} from "@yutopia/shared/pool-throw";
import { TABLE_REACH, tableAway } from "@yutopia/shared/tables";
import { type Player, PoolBallOut } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Pool balls out of a game (shared/pool-throw.ts; the user's ask, 2026-10-22). A table that
// isn't being played keeps its balls racked (features/pool.ts): anyone by it takes one in the
// hand and throws it, or takes the cue down — a gun that fires balls. We fly every ball tick by
// tick against where everyone is now: the first one it reaches is knocked down (Player.fellAt).
// It lies where it stopped for anyone to pick up; untouched, it's back on its table after a
// while (a ball the cue fired just goes). A game starting on a table calls its balls back.

const THROW_POSE_MS = 700;

export interface PballHooks {
  /** a table racked again, or its game starting: its balls out come back (off the floor, out of hands) */
  recall(table: string): void;
}

interface Flight {
  f: Launch;
  t: number; // s flown so far
  at: number; // server ms launched
  level: number;
  uid: number; // the sender's (their floor's grid)
  by: string;
}

registerFeature((room: WorldRoom) => {
  const flying = new Map<string, Flight>();
  const lying = new Map<string, number>(); // key → server ms it's settled on the floor
  const from = new Map<string, { table: string; n: number }>(); // sid → the ball in their hand, its table
  const sentAt = new Map<string, number>(); // sid → their last throw or shot
  const posing = new Map<string, number>(); // sid → the throw's follow-through till
  let seq = 0;
  const next = () => {
    seq = (seq + 1) & 0xffff;
    return seq;
  };

  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const ox = () => room.levelMap(0).ox ?? 0;
  const oy = () => room.levelMap(0).oy ?? 0;
  // the floor at (x, y) in a floor's own frame: the land's out on it, else 0
  const floorOf = (uid: number, level: number) => {
    const g = room.gridFor(uid, level);
    return {
      ground: (x: number, y: number) => (g.onLand(x, y) ? heightAt(x + ox(), y + oy()) : 0),
      // (a wall, or something standing higher than the ball is)
      blocked: (x: number, y: number, z: number) =>
        !g.fitsAt(x, y, Math.max(0, z - (g.onLand(x, y) ? heightAt(x + ox(), y + oy()) : 0)) - 0.05, 0.02),
    };
  };
  const able = (p: Player) =>
    !p.fellAt && !p.downAt && p.hp > 0 && !p.busy.startsWith("ride:") && !p.busy.startsWith("drive:");

  // ── the table's layout (out of a game) ──
  const layout = (id: string) => {
    const t = room.state.pool.get(id);
    if (!t || t.phase === "play") return null;
    const g = unpackGame(t.game);
    return g ? { t, g } : null;
  };
  // one ball off it (any still on it, the cue ball last), or -1
  const takeOff = (id: string): number => {
    const L = layout(id);
    if (!L) return -1;
    const on = L.g.balls.filter((b) => b.down < 0);
    if (!on.length) return -1;
    const pick = on.filter((b) => b.id !== 0);
    const b = (pick.length ? pick : on)[Math.floor(Math.random() * (pick.length || on.length))];
    b.down = OFF_TABLE;
    L.t.game = packGame(L.g);
    return b.id;
  };
  // ball n back on its table, somewhere clear on the cloth
  const putBack = (id: string, n: number) => {
    const L = layout(id);
    const b = L?.g.balls.find((q) => q.id === n);
    if (!L || !b || b.down !== OFF_TABLE) return;
    const clear = (x: number, y: number) =>
      !L.g.balls.some((q) => q !== b && q.down < 0 && Math.hypot(q.x - x, q.y - y) < 2 * BALL_R + 0.004);
    let x = 0;
    let y = 0;
    for (let k = 0; k < 60; k++) {
      x = (Math.random() - 0.5) * (POOL_L - 4 * BALL_R);
      y = (Math.random() - 0.5) * (POOL_W - 4 * BALL_R);
      if (clear(x, y)) break;
    }
    Object.assign(b, newBall(n, x, y));
    L.t.game = packGame(L.g);
  };
  // the ball in their hand goes back where it came from
  const handBack = (p: Player) => {
    const n = heldBall(p.held);
    if (n < 0) return;
    const t = from.get(p.sid);
    if (t?.table) putBack(t.table, n);
    from.delete(p.sid);
    p.held = "";
  };

  // ── a ball out: flying, then lying ──
  const send = (p: Player, f: Launch, n: number, table: string) => {
    const key = `${p.sid}:${next()}`;
    const b = new PoolBallOut();
    b.n = n;
    b.level = p.level;
    b.table = table;
    b.by = p.sid;
    Object.assign(b, { x0: f.x0, y0: f.y0, z0: f.z0, vx: f.vx, vy: f.vy, vz: f.vz });
    room.state.pballs.set(key, b);
    flying.set(key, { f, t: 0, at: Date.now(), level: p.level, uid: p.uid, by: p.sid });
  };
  // one lying where it is (dropped from a hand)
  const drop = (p: Player, n: number, table: string) => {
    const key = `${p.sid}:${next()}`;
    const b = new PoolBallOut();
    const { ground } = floorOf(p.uid, p.level);
    const z = ground(p.x, p.y) + PBALL.r;
    Object.assign(b, { n, level: p.level, table, by: p.sid, x0: p.x, y0: p.y, z0: z + 1, t1: 0 });
    Object.assign(b, { x1: p.x, y1: p.y, z1: z + 1, rx: p.x + 0.15, ry: p.y + 0.1, rz: z });
    room.state.pballs.set(key, b);
    lying.set(key, Date.now() + SETTLE * 1000);
  };
  const knock = (q: Player, yaw: number, now: number) => {
    q.fellAt = now;
    q.fellYaw = yaw;
    // (a ball in their hand falls out of it)
    const n = heldBall(q.held);
    if (n >= 0) {
      drop(q, n, from.get(q.sid)?.table ?? "");
      from.delete(q.sid);
      q.held = "";
    }
  };
  const gone = (key: string) => {
    room.state.pballs.delete(key);
    flying.delete(key);
    lying.delete(key);
  };

  room.pballs = {
    recall(table: string) {
      for (const [key, b] of room.state.pballs) if (b.table === table) gone(key);
      for (const [sid, t] of [...from])
        if (t.table === table) {
          const p = room.state.players.get(sid);
          if (p && heldBall(p.held) >= 0) p.held = "";
          from.delete(sid);
        }
    },
  };

  room.on("pball:take", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const id = String(m?.id ?? "");
    const o = room.state.objects.get(id);
    if (!p || o?.kind !== "pool_table" || !able(p)) return;
    if (tableAway(o, p.x, p.y) > TABLE_REACH) return warn(client, "Get closer to the table.");
    const t = room.state.pool.get(id);
    if (t?.phase === "play") return warn(client, "Not while a game's on.");
    if (m?.what === "cue") {
      handBack(p);
      p.gun = "cue";
      return;
    }
    if (heldBall(p.held) >= 0) return warn(client, "You've got a ball already.");
    const n = takeOff(id);
    if (n < 0) return warn(client, "No balls left on the table.");
    // (the cue: put back to take a ball)
    if (p.gun === "cue") p.gun = "";
    p.held = `pball:${n}`;
    p.heldAt = Date.now();
    from.set(p.sid, { table: id, n });
  });

  room.on("pball:pick", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const key = String(m?.key ?? "");
    const b = room.state.pballs.get(key);
    const now = Date.now();
    if (!p || !b || !able(p) || b.level !== p.level || heldBall(p.held) >= 0) return;
    if (flying.has(key) || (lying.get(key) ?? now) > now + 50) return;
    if (Math.hypot(p.x - b.rx, p.y - b.ry) > PBALL.reach) return;
    if (p.gun === "cue") p.gun = "";
    p.held = `pball:${b.n}`;
    p.heldAt = now;
    from.set(p.sid, { table: b.table, n: b.n });
    gone(key);
  });

  room.on("pball:throw", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const now = Date.now();
    const n = p ? heldBall(p.held) : -1;
    if (!p || n < 0 || !able(p)) return;
    if (now - (sentAt.get(p.sid) ?? 0) < PBALL.throwRate * 1000 - 30) return;
    const yaw = Number(m?.yaw);
    const pitch = Number(m?.pitch);
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    sentAt.set(p.sid, now);
    const f = launch(
      p.x + Math.cos(yaw) * 0.25,
      p.y + Math.sin(yaw) * 0.25,
      p.z + PBALL.hand,
      yaw,
      Math.max(-0.8, Math.min(1.2, pitch)),
      PBALL.throwSpeed,
    );
    send(p, f, n, from.get(p.sid)?.table ?? "");
    from.delete(p.sid);
    p.held = "";
    // the follow-through (shared USES "throw")
    if (!p.busy) {
      p.busy = "throw";
      posing.set(p.sid, now + THROW_POSE_MS);
    }
  });

  room.on("pball:fire", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const now = Date.now();
    if (!p || p.gun !== "cue" || !able(p) || p.busy || p.act) return;
    if (now - (sentAt.get(p.sid) ?? 0) < PBALL.cueRate * 1000 - 30) return;
    const [x, y, z, yaw, pitch] = [m?.ox, m?.oy, m?.oz, m?.yaw, m?.pitch].map(Number);
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    // (the tip where the server has them: a cue's length out at most, about the hands' height)
    if (Math.hypot(x - p.x, y - p.y) > MUZZLE_REACH + 0.9 || z < p.z - 0.2 || z > p.z + 2.6) return;
    sentAt.set(p.sid, now);
    send(
      p,
      launch(x, y, z, yaw, Math.max(-1.2, Math.min(1.2, pitch)), PBALL.cueSpeed),
      1 + Math.floor(Math.random() * 15),
      "",
    );
  });

  room.on("pball:back", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    handBack(p);
    if (p.gun === "cue") p.gun = "";
  });

  return {
    tick(_dt, now) {
      // the flights: each on from where it got to, against everyone where they are now
      for (const [key, fl] of flying) {
        const b = room.state.pballs.get(key);
        if (!b) {
          flying.delete(key);
          continue;
        }
        const t = (now - fl.at) / 1000;
        const people: Column[] = [];
        for (const q of room.state.players.values()) {
          if (q.level !== fl.level || q.sid === fl.by || !able(q)) continue;
          people.push({ id: q.sid, x: q.x, y: q.y, z: q.z, h: unpackMv(q.mv).crouch ? 1.25 : 1.8 });
        }
        const { ground, blocked } = floorOf(fl.uid, fl.level);
        const s = flyStep(fl.f, fl.t, t, people, ground, blocked, fl.by);
        fl.t = t;
        if (!s) continue;
        const rest = restOf(fl.f, s, ground, blocked);
        Object.assign(b, { t1: s.t, x1: s.x, y1: s.y, z1: s.z, rx: rest.x, ry: rest.y, rz: rest.z });
        flying.delete(key);
        lying.set(key, now + SETTLE * 1000);
        const q = s.id ? room.state.players.get(s.id) : undefined;
        if (q) {
          b.hit = q.sid;
          knock(q, Math.atan2(fl.f.vy, fl.f.vx), now);
        }
      }
      // lying untouched: back on the table (or gone, the cue's)
      for (const [key, at] of lying) {
        const b = room.state.pballs.get(key);
        if (!b) {
          lying.delete(key);
          continue;
        }
        if (now - at < (b.table ? PBALL.restMs : PBALL.cueRestMs)) continue;
        if (b.table) putBack(b.table, b.n);
        gone(key);
      }
      // a ball that left a hand some other way (something else taken up): back on its table
      for (const [sid, t] of [...from]) {
        const p = room.state.players.get(sid);
        if (p && heldBall(p.held) === t.n) continue;
        if (t.table) putBack(t.table, t.n);
        from.delete(sid);
      }
      // up again; the throw's follow-through over
      for (const p of room.state.players.values()) if (p.fellAt && now - p.fellAt > KNOCK.secs * 1000) p.fellAt = 0;
      for (const [sid, until] of posing)
        if (now >= until) {
          posing.delete(sid);
          const p = room.state.players.get(sid);
          if (p?.busy === "throw") p.busy = "";
        }
    },
    leave(_client, p) {
      handBack(p);
      sentAt.delete(p.sid);
      posing.delete(p.sid);
    },
    dispose() {
      room.pballs = null;
    },
  };
});
