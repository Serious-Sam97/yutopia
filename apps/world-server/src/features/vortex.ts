import type { ServerMessages } from "@yutopia/shared";
import { ANIM, areaAt, faceByte, type Point, worldZ } from "@yutopia/shared";
import { BODY, type Ray, rayMeets } from "@yutopia/shared/dark";
import { isWeapon } from "@yutopia/shared/inventory";
import { isRadio } from "@yutopia/shared/media";
import { type Act, actOf, hurtBy, shooters, VORTEX_FIGHT } from "@yutopia/shared/vortex-fight";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { Npc, type Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Vortex lives in the building (Fita 6). He wanders, stalks people, dances when
// the radio is on, sleeps in the server room at night. His lines come from
// the API (curated, apps/api Vortex). Rules from the voice guide:
//  · public lines never name anyone; personal lines go only to that person
//  · he keeps out of booths and the standup ring (he walks into any room whose
//    door isn't locked — a closed door swings for him too), and goes quiet
//    near rituals
//  · speech budget: one public line per ~40 s, and only if someone's around

const SPEED = 3.1;
const PUBLIC_EVERY = 40_000;
const POKE_COOLDOWN = 8_000;
const GREET_COOLDOWN = 5 * 60_000;
const POIS: Point[] = [
  { x: 21.5, y: 22.5 }, // arcade
  { x: 22.5, y: 25.5 }, // radio
  { x: 10.5, y: 9.5 }, // desks
  { x: 22.5, y: 11.5 }, // coffee
  { x: 6.5, y: 26.5 }, // reception
  { x: 33.5, y: 30.5 }, // live room
  { x: 36.5, y: 12.5 }, // booth hall
  { x: 45.5, y: 32.5 }, // home: the terminal
];
// (plan 88: where a confiscated gun is left — the POIs' names, as the client words them)
const POI_KEYS = ["arcade", "radio", "desks", "coffee", "reception", "live", "booths", "server"] as const;
const HOME: Point = { x: 45.5, y: 32.5 };
// (HR: the lobby's far corner, past the reception's desk)
const RECEPTION: Point = { x: 2.5, y: 23 };
const OFFLINE_LINES = ["the tape hisses. nobody listens. classic.", "i'm not wandering. i'm patrolling.", "*kkzzt*"];
// (plan 88) offline, his fight lines (the API has the curated ones: apps/api Vortex, its fight events)
const OFFLINE_FIGHT: Record<string, string> = {
  hit: "ow. that's workplace harassment.",
  dodge: "missed. i'm a sprite. i have no hitbox. *kkzzt* i have a small hitbox.",
  whip: "hold still. this is a hug. with tape.",
  rew: "let's try that again. from the top.",
  pause: "▮▮ pause. nobody move. especially the bullets.",
  steal: "confiscated. you'll get it back at the end of the term.",
  blast: "this song slaps. so does the volume.",
  hr: "reported to hr. sit in reception and think about what you did.",
};

type Mode = "idle" | "wander" | "stalk" | "dance" | "sleep";

/** (plan 88) The fight with him, as features/arms.ts asks: a shot's line, a ball's burst, a hit. */
export interface VortexHooks {
  /** how far along a shot from `level` he is (m), or null — not his floor, down or away, not on its line */
  along(level: number, ray: Ray, range: number): number | null;
  /** a Daybreak ball here (`level`'s floor; z over it): close enough to burst on him */
  near(level: number, x: number, y: number, z: number, r: number): boolean;
  /** where he is: his floor's x, y; z his middle over it */
  at(): { x: number; y: number; z: number };
  /** shot by `sid`, `n` (as the shadowed take it) */
  hit(sid: string, n: number, now: number): void;
  /** (phase 2) taped up by his whip (no steps, no shots) — till a friend cuts them free */
  bound(sid: string): boolean;
}
/** (plan 88 phase 2) his act II moves */
export type VortexMove = "whip" | "rew" | "pause" | "steal" | "radio" | "hr";
const MOVES: VortexMove[] = ["whip", "rew", "pause", "steal", "radio", "hr"];
// the moves' numbers: the lash's flight and how long it binds; REW's 5 s; PAUSE's; the blast's dance and how near;
// HR's timeout (their shots ignored); how far he reaches; act II's pace (a move every 6–9 s); a taunt's spacing
const MV = {
  lash: 500,
  bound: 4000,
  lashReach: 10,
  rew: 5000,
  pause: 2500,
  back: 0.2,
  backMax: 40,
  dance: 3000,
  danceR: 6,
  hr: 20_000,
  reach: 16,
  every: 6000,
  jitter: 3000,
  taunt: 5000,
  dodge: 0.3,
  step: 0.9,
  freeR: 1.8,
} as const;
// the fight's moods, by act (his drawing's faces)
const ACT_MOOD = ["smug", "judging", "fury", "possessed"] as const;
registerFeature((room: WorldRoom) => {
  const npc = new Npc();
  npc.id = "vortex";
  npc.kind = "vortex";
  const spawn = room.grid.nearestOpen(HOME.x, HOME.y) ?? room.map.spawn;
  npc.x = spawn.x;
  npc.y = spawn.y;
  room.state.npcs.set("vortex", npc);

  let mode: Mode = "idle";
  let path: Point[] = [];
  let until = Date.now() + 4000;
  let target: Player | null = null;
  let lastPublic = 0;
  const lastPoke = new Map<number, number>();
  const lastGreet = new Map<number, number>();
  let busy = false;

  // ── (plan 88) the fight: who's in it (by user), his health left, its act; beaten — on the floor, then away ──
  interface Fighter {
    sid: string;
    name: string;
    hits: number;
    dmg: number;
    at: number;
  }
  const fight = { on: false, k: 1, act: 0 as Act, last: 0, since: 0, who: new Map<number, Fighter>() };
  let fallAt = 0;
  let held = false; // (an admin's: kept where he is, for trying it)
  let told = 0;
  let dirty = false;
  // (phase 2) his moves: whips in flight, the fighters' last 6 s (REW), PAUSE's held shots, HR's timeouts
  const lash: { sid: string; at: number }[] = [];
  const trail = new Map<string, { x: number; y: number; t: number }[]>();
  let trailAt = 0;
  let nextMove = 0;
  let pauseUntil = 0;
  const paused = new Map<string, number>();
  const hrTill = new Map<number, number>();
  // (taped up till then, by session — the Player schema is at its 64 fields; the clients have it by vortex:move)
  const boundTill = new Map<string, number>();
  const isBound = (sid: string, now = Date.now()) => (boundTill.get(sid) ?? 0) > now;
  let lastTaunt = 0;
  const toAll = (m: ServerMessages["vortex:move"]) => room.broadcastMsg("vortex:move", m);
  const tell = (now: number) => {
    dirty = false;
    told = now;
    const who = [...fight.who.values()]
      .sort((a, b) => b.hits - a.hits)
      .map((f) => ({ sid: f.sid, name: f.name, hits: f.hits }));
    for (const c of room.clients as WorldClient[]) room.send(c, "vortex:fight", { who });
  };
  const endFight = () => {
    fight.on = false;
    fight.k = 1;
    fight.act = 0;
    fight.who.clear();
    npc.vk = 1;
    npc.vact = 0;
    dirty = true;
    lash.length = 0;
    trail.clear();
    nextMove = 0;
    pauseUntil = 0;
    paused.clear();
    hrTill.clear();
    boundTill.clear();
  };
  const beaten = (by: Player, now: number) => {
    fallAt = now;
    path = [];
    mode = "idle";
    npc.mood = "dead";
    npc.vk = 0;
    // (his tape where he fell — the trophy, for whoever picks it up; the building told who finished him)
    room.survival?.drop("vxtape", 1, npc.x, npc.y, room.home);
    const secs = Math.round((now - fight.since) / 1000);
    for (const c of room.clients as WorldClient[]) room.send(c, "vortex:down", { by: by.name, secs });
  };
  const hittable = () => !fallAt && !npc.vgone;

  // ── (phase 2) his moves: on whom (the ones in the fight, on his floor, near, up, free, not in HR's timeout) ──
  const fighters = (now: number) =>
    [...fight.who.values()]
      .map((f) => room.state.players.get(f.sid))
      .filter(
        (p): p is Player =>
          !!p &&
          p.level === room.home &&
          !p.downAt &&
          !isBound(p.sid, now) &&
          (hrTill.get(p.uid) ?? 0) < now &&
          Math.hypot(p.x - npc.x, p.y - npc.y) < MV.reach,
      );
  // somewhere on his floor (or the nearest open spot to it), snapped there
  const placeAt = (p: Player, x: number, y: number) => {
    const at = room.grid.fits(x, y) ? { x, y } : room.grid.nearestOpen(x, y);
    if (!at) return false;
    p.x = at.x;
    p.y = at.y;
    p.z = worldZ(room.home, 0);
    p.a = ANIM.idle;
    p.area = areaAt(room.map, at.x, at.y)?.key ?? "";
    const c = clientOf(p);
    if (c) room.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    return true;
  };
  const taunt = (event: string, now: number, userId?: number, client?: WorldClient) => {
    if (!userId && now - lastTaunt < MV.taunt) return;
    if (!userId) lastTaunt = now;
    void say(event, userId, client);
  };
  /** one of his moves on `p` (the radio's blast: on everyone in it near him, `p` with them); false — it can't be */
  const move = (kind: VortexMove, p: Player, now: number): boolean => {
    const from = { x: p.x, y: p.y };
    npc.yaw = faceByte(p.x - npc.x, p.y - npc.y, npc.yaw);
    if (kind === "whip") {
      if (Math.hypot(p.x - npc.x, p.y - npc.y) > MV.lashReach) return false;
      lash.push({ sid: p.sid, at: now + MV.lash });
      toAll({ kind, to: p.sid, from: { x: npc.x, y: npc.y }, ms: MV.lash });
      taunt("whip", now);
      return true;
    }
    if (kind === "rew") {
      // where they stood 5 s ago (the oldest they have, if less)
      const tr = trail.get(p.sid) ?? [];
      const back = tr.filter((t) => t.t <= now - MV.rew).at(-1) ?? tr[0];
      if (!back || Math.hypot(back.x - p.x, back.y - p.y) < 0.5 || !placeAt(p, back.x, back.y)) return false;
      toAll({ kind, to: p.sid, from, ms: MV.rew });
      taunt("rew", now);
      return true;
    }
    if (kind === "pause") {
      if (pauseUntil > now) return false;
      pauseUntil = now + MV.pause;
      toAll({ kind, ms: MV.pause });
      taunt("pause", now);
      return true;
    }
    if (kind === "steal") {
      const inv = room.survival?.inventory(p.sid);
      const slot = inv && p.gun ? inv.quick.findIndex((it) => it?.id === p.gun) : -1;
      const it = inv && slot >= 0 ? inv.quick[slot] : null;
      if (!inv || !it || !isWeapon(it.id)) return false;
      // left somewhere ridiculous: the far end of the building from them (now and then a duck in her hand instead)
      const far = POIS.map((q, i) => ({ q, i, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((a, b) => b.d - a.d);
      const spot = far.map((f) => ({ ...f, at: room.grid.nearestOpen(f.q.x, f.q.y) })).find((f) => f.at);
      if (!spot?.at) return false;
      inv.quick[slot] = null;
      p.gun = "";
      room.survival?.changed(p.sid);
      room.survival?.drop(it.id, 1, spot.at.x, spot.at.y, room.home, "loaded" in it ? it.loaded : 0);
      toAll({ kind, to: p.sid, item: it.id, area: POI_KEYS[spot.i], duck: Math.random() < 0.3 });
      taunt("steal", now);
      return true;
    }
    if (kind === "radio") {
      const near = fighters(now).filter((q) => Math.hypot(q.x - npc.x, q.y - npc.y) <= MV.danceR);
      const who = near.some((q) => q.sid === p.sid) ? near : [p, ...near];
      for (const q of who) {
        q.emote = "tape";
        q.emoteAt = now;
      }
      toAll({ kind, who: who.map((q) => q.sid), ms: MV.dance });
      taunt("blast", now);
      return true;
    }
    // HR: sent to the reception's corner, their shots not counted a while; told why (only them)
    if (!placeAt(p, RECEPTION.x, RECEPTION.y)) return false;
    hrTill.set(p.uid, now + MV.hr);
    toAll({ kind, to: p.sid, from, ms: MV.hr });
    const c = clientOf(p);
    if (c) taunt("hr", now, p.uid, c);
    return true;
  };
  // act II: one now and then, on one of them — whichever of the six can be
  const autoMove = (now: number) => {
    const who = fighters(now);
    if (!who.length) return;
    const kinds = [...MOVES].sort(() => Math.random() - 0.5);
    for (const k of kinds) {
      const order = [...who].sort(() => Math.random() - 0.5);
      if (order.some((p) => move(k, p, now))) return;
    }
  };
  // the whips landing (out of reach by then: missed), PAUSE's end (the shots back at whoever fired them), the
  // fighters' trail for REW
  const moving = (now: number) => {
    for (let i = lash.length - 1; i >= 0; i--) {
      const l = lash[i];
      if (l.at > now) continue;
      lash.splice(i, 1);
      const q = room.state.players.get(l.sid);
      if (!q) continue;
      if (q.downAt || q.level !== room.home || Math.hypot(q.x - npc.x, q.y - npc.y) > MV.lashReach + 1) {
        toAll({ kind: "missed", to: l.sid });
        continue;
      }
      boundTill.set(q.sid, now + MV.bound);
      toAll({ kind: "bound", to: l.sid, ms: MV.bound });
    }
    if (pauseUntil && now >= pauseUntil) {
      pauseUntil = 0;
      if (!paused.size) toAll({ kind: "play" });
      for (const [sid, n] of paused) {
        const back = Math.min(MV.backMax, Math.round(n * MV.back));
        room.survival?.hurt(sid, back, true);
        toAll({ kind: "play", to: sid, n: back });
      }
      paused.clear();
    }
    if (fight.on && now - trailAt >= 250) {
      trailAt = now;
      for (const f of fight.who.values()) {
        const p = room.state.players.get(f.sid);
        if (!p || p.level !== room.home) continue;
        const tr = trail.get(f.sid) ?? [];
        tr.push({ x: p.x, y: p.y, t: now });
        while (tr.length && tr[0].t < now - MV.rew - 1000) tr.shift();
        trail.set(f.sid, tr);
      }
    }
  };
  // shot in act I or later: now and then a side-step, away from the line (where there's floor)
  const sidestep = (p: Player) => {
    const dx = npc.x - p.x;
    const dy = npc.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const s of [side, -side]) {
      const x = npc.x + (-dy / d) * MV.step * s;
      const y = npc.y + (dx / d) * MV.step * s;
      if (room.grid.fits(x, y)) {
        path = [];
        npc.x = x;
        npc.y = y;
        return true;
      }
    }
    return false;
  };
  room.vortex = {
    along(level, ray, range) {
      if (level !== room.home || !hittable()) return null;
      return rayMeets(ray, npc.x, npc.y, VORTEX_FIGHT.z0, range, VORTEX_FIGHT.r - BODY.r, VORTEX_FIGHT.h);
    },
    near(level, x, y, z, r) {
      if (level !== room.home || !hittable()) return false;
      return (
        Math.hypot(npc.x - x, npc.y - y) < r + VORTEX_FIGHT.r &&
        z > VORTEX_FIGHT.z0 - 0.2 &&
        z < VORTEX_FIGHT.z0 + VORTEX_FIGHT.h + 0.2
      );
    },
    at: () => ({ x: npc.x, y: npc.y, z: VORTEX_FIGHT.z0 + VORTEX_FIGHT.h / 2 }),
    bound: (sid) => isBound(sid),
    hit(sid, n, now) {
      const p = room.state.players.get(sid);
      if (!p || p.bot || !hittable()) return;
      // (phase 2: in HR's timeout — not counted; PAUSE — the shot stopped in the air, to come back at them)
      if ((hrTill.get(p.uid) ?? 0) > now) return;
      if (pauseUntil > now) {
        paused.set(sid, (paused.get(sid) ?? 0) + n);
        return;
      }
      const f = fight.who.get(p.uid) ?? { sid, name: p.name, hits: 0, dmg: 0, at: 0 };
      f.sid = sid;
      f.hits++;
      f.dmg += n;
      f.at = now;
      fight.who.set(p.uid, f);
      if (!fight.on) {
        fight.on = true;
        fight.since = now;
        fight.k = 1;
      }
      fight.last = now;
      fight.k = hurtBy(
        fight.k,
        n,
        shooters(
          [...fight.who.values()].map((w) => w.at),
          now,
        ),
      );
      fight.act = actOf(fight.k, fight.act);
      npc.vk = fight.k;
      npc.vact = fight.act;
      npc.mood = ACT_MOOD[fight.act];
      dirty = true;
      if (fight.k <= 0) {
        beaten(p, now);
        return;
      }
      // (he complains; and from act I, now and then, steps out of the line)
      const dodged = !held && Math.random() < MV.dodge && sidestep(p);
      taunt(dodged ? "dodge" : "hit", now);
    },
  };
  room.on("mod:vortex", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin) return;
    const now = Date.now();
    if (m?.reset) {
      endFight();
      fallAt = 0;
      npc.vgone = 0;
      npc.mood = "smug";
    }
    if (typeof m?.hold === "boolean") held = m.hold;
    if (m?.at && Number.isFinite(m.at.x) && Number.isFinite(m.at.y)) {
      path = [];
      npc.x = m.at.x;
      npc.y = m.at.y;
    }
    const k = m?.k ?? (m?.act ? [1, 0.69, 0.34][m.act - 1] : undefined);
    if (typeof k === "number" && Number.isFinite(k)) {
      if (!fight.on) {
        fight.on = true;
        fight.since = now;
      }
      fight.last = now;
      fight.k = Math.max(0.001, Math.min(1, k));
      fight.act = actOf(fight.k);
      npc.vk = fight.k;
      npc.vact = fight.act;
      npc.mood = ACT_MOOD[fight.act];
      dirty = true;
    }
    if (m?.beat && hittable()) {
      fight.since ||= now;
      beaten(p, now);
    }
    // (one of his moves, now: on `to`, else on them)
    if (m?.move && MOVES.includes(m.move) && hittable()) {
      const q = (m.to && room.state.players.get(m.to)) || p;
      move(m.move, q, now);
    }
  });
  // a friend cutting someone free of his tape: beside them, up, not taped up themselves
  room.on("vortex:free", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const q = typeof m?.sid === "string" ? room.state.players.get(m.sid) : undefined;
    const now = Date.now();
    if (!p || !q || q === p || !isBound(q.sid, now) || isBound(p.sid, now) || p.downAt || p.level !== q.level) return;
    if (Math.hypot(p.x - q.x, p.y - q.y) > MV.freeR) return;
    boundTill.delete(q.sid);
    toAll({ kind: "free", to: q.sid, from: { x: p.x, y: p.y }, who: [p.sid] });
  });

  const humans = () => [...room.state.players.values()].filter((p) => !p.bot);
  const near = (r: number) => humans().filter((p) => Math.hypot(p.x - npc.x, p.y - npc.y) <= r);
  const okTarget = (pt: Point) => {
    const kind = areaAt(room.map, pt.x, pt.y)?.kind;
    return kind !== "booth" && kind !== "standup";
  };

  const go = (to: Point) => {
    if (!okTarget(to)) return false;
    const p = room.wayFor(null, room.home, npc, to);
    if (!p?.length) return false;
    path = p;
    return true;
  };

  const say = async (event: string, userId?: number, client?: WorldClient) => {
    if (busy) return;
    busy = true;
    try {
      const res = config.offline
        ? {
            line: OFFLINE_FIGHT[event] ?? OFFLINE_LINES[Math.floor(Math.random() * OFFLINE_LINES.length)],
            mood: OFFLINE_FIGHT[event] ? ACT_MOOD[fight.act] : "smug",
            personal: false,
          }
        : await api.vortexLine({ event, user_id: userId ?? null });
      if (!res?.line) return;
      // (in the fight his face is the act's)
      npc.mood = fight.on && !fallAt ? ACT_MOOD[fight.act] : (res.mood ?? "smug");
      if (client && userId) {
        // personal: only the person he's talking to sees it
        room.send(client, "vortex:say", { text: res.line, to: client.sessionId, mood: npc.mood });
      } else {
        npc.say = res.line;
        npc.sayAt = Date.now();
      }
    } catch (e) {
      console.warn("[vortex] line failed", (e as Error).message);
    } finally {
      busy = false;
    }
  };

  const clientOf = (p: Player) => room.clients.getById(p.sid) as WorldClient | undefined;

  room.on("vortex:poke", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    const terminal = [...room.state.objects.values()].find((o) => o.kind === "crt_terminal");
    const atTerminal = terminal && Math.hypot(p.x - (terminal.x + 0.5), p.y - (terminal.y + 0.5)) < 2.2;
    if (!atTerminal && Math.hypot(p.x - npc.x, p.y - npc.y) > 4) return;
    if (now - (lastPoke.get(p.uid) ?? 0) < POKE_COOLDOWN) return;
    lastPoke.set(p.uid, now);
    npc.mood = "glitch";
    npc.yaw = faceByte(p.x - npc.x, p.y - npc.y, npc.yaw);
    void say("poke", p.uid, client);
  });

  const pickMode = (now: number) => {
    // (plan 88) in a fight: after one of them
    const foes = fight.on ? fighters(now) : [];
    if (foes.length) {
      mode = "stalk";
      target = foes[Math.floor(Math.random() * foes.length)];
      until = now + 8000;
      return;
    }
    const hour = room.state.hour; // (the world's: São Paulo's, shared clock.ts)
    if (hour >= 1 && hour < 6 && humans().length === 0) {
      mode = "sleep";
      go(HOME);
      until = now + 60_000;
      return;
    }
    // a radio or record player playing somewhere: dance by it
    const playing = [...room.state.objects.values()].find((o) => isRadio(o.kind) && o.props.includes('"playing":true'));
    if (playing && Math.random() < 0.5) {
      mode = "dance";
      go({ x: playing.x + 0.5 + (Math.random() * 2 - 1), y: playing.y + 1.5 + Math.random() });
      until = now + 30_000;
      return;
    }
    const candidates = humans().filter((p) => okTarget(p) && p.status !== "dnd");
    if (candidates.length && Math.random() < 0.45) {
      mode = "stalk";
      target = candidates[Math.floor(Math.random() * candidates.length)];
      until = now + 20_000 + Math.random() * 20_000;
      return;
    }
    mode = "wander";
    // somewhere he isn't already (an empty path would leave him standing for 40 s)
    const away = POIS.filter((p) => Math.hypot(p.x - npc.x, p.y - npc.y) > 2).sort(() => Math.random() - 0.5);
    if (!away.some((p) => go(p))) mode = "idle";
    until = now + (mode === "wander" ? 40_000 : 3000);
  };

  return {
    tick(dt, now) {
      // (plan 88) the fight: told to everyone when it changes (four a second at most); beaten — on the floor, then
      // away to the server room till he's back; out of it a while — calmed down, healed
      if (dirty && now - told > 250) tell(now);
      if (fallAt) {
        if (now - fallAt < VORTEX_FIGHT.fall) return;
        fallAt = 0;
        endFight();
        npc.vgone = now + VORTEX_FIGHT.away;
        const home = room.grid.nearestOpen(HOME.x, HOME.y) ?? room.map.spawn;
        npc.x = home.x;
        npc.y = home.y;
        path = [];
        return;
      }
      if (npc.vgone) {
        if (now < npc.vgone) return;
        npc.vgone = 0;
        npc.mood = "seething";
        until = now;
      }
      if (fight.on && now - fight.last > VORTEX_FIGHT.calm) endFight();
      moving(now);
      if (held) return;
      // (phase 2) act II: a move every 6–9 s
      if (fight.on && fight.act === 2) {
        if (!nextMove) nextMove = now + MV.every + Math.random() * MV.jitter;
        else if (now >= nextMove) {
          nextMove = now + MV.every + Math.random() * MV.jitter;
          autoMove(now);
        }
      } else nextMove = 0;
      // walk
      if (path.length) {
        let budget = SPEED * dt;
        while (budget > 0 && path.length) {
          const wp = path[0];
          const dx = wp.x - npc.x;
          const dy = wp.y - npc.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.001) npc.yaw = faceByte(dx, dy, npc.yaw);
          if (d <= budget) {
            npc.x = wp.x;
            npc.y = wp.y;
            budget -= d;
            path.shift();
          } else {
            npc.x += (dx / d) * budget;
            npc.y += (dy / d) * budget;
            budget = 0;
          }
        }
        npc.a = ANIM.walk;
      } else npc.a = mode === "sleep" ? ANIM.sit : ANIM.idle;
      npc.area = areaAt(room.map, npc.x, npc.y)?.key ?? "";
      if (npc.mood === "glitch" && Math.random() < dt / 2) npc.mood = "smug";

      // behaviour
      if (mode === "stalk") {
        const t = target && room.state.players.get(target.sid);
        if (!t || !okTarget(t) || t.status === "dnd") {
          mode = "idle";
          until = now + 2000;
        } else {
          const d = Math.hypot(t.x - npc.x, t.y - npc.y);
          // catch up: a spot next to them he may walk to (not a private room,
          // not behind a wall); none → give up and do something else
          if (d > 2.4 && !path.length) {
            const spots = [
              [1.2, 1.2],
              [-1.2, 1.2],
              [1.2, -1.2],
              [-1.2, -1.2],
              [0, 1.4],
              [1.4, 0],
            ];
            if (!spots.some(([ox, oy]) => go({ x: t.x + ox, y: t.y + oy }))) {
              mode = "idle";
              until = now + 1500;
            }
          }
          if (!fight.on && d <= 2.6 && now - (lastGreet.get(t.uid) ?? 0) > GREET_COOLDOWN) {
            lastGreet.set(t.uid, now);
            const c = clientOf(t);
            if (c) void say("greet", t.uid, c);
          }
        }
      }
      if (now > until && !path.length) pickMode(now);
      else if (mode !== "stalk" && !path.length && now > until - 1000) pickMode(now);

      // public chatter, on a budget, only with an audience and never at a ritual
      if (now - lastPublic > PUBLIC_EVERY && near(7).length > 0 && mode !== "sleep") {
        lastPublic = now;
        const standupNear = room.state.standup.active && near(6).some((p) => p.area === "standup");
        const event = standupNear
          ? "standup"
          : mode === "dance"
            ? "radio"
            : room.state.hour >= 21
              ? "night"
              : "ambient";
        if (Math.random() < 0.7) void say(event);
      }
    },
  };
});
