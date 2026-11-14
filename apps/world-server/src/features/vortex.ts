import type { ServerMessages } from "@yutopia/shared";
import { ANIM, areaAt, faceByte, objLevel, type Point, worldZ } from "@yutopia/shared";
import { BODY, type Ray, rayMeets } from "@yutopia/shared/dark";
import { isWeapon } from "@yutopia/shared/inventory";
import { isRadio } from "@yutopia/shared/media";
import { type Act, actOf, hurtBy, shooters, VORTEX_FIGHT } from "@yutopia/shared/vortex-fight";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { Npc, type Player } from "../schema.ts";
import { fromSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
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
  dark: "the lights were never yours.",
  clones: "which one's me? *kkzzt* trick question. all of them. none of them.",
  shades: "i brought friends. they don't like the light either.",
  possess: "your legs are on loan. i'm calling it in.",
  glitch: "*kkzzt* up is down. left is a rumour.",
  down: "*kkzzt* … rewind me.",
  grudge: "you. {gun}. {times}. i remember every one.",
  chair: "your chair? it was my chair. i'm made of spite.",
};

type Mode = "idle" | "wander" | "stalk" | "dance" | "sleep" | "squat";
// (plan 88 phase 4) the grudge: kept a day; after the one who shot him most a while, then a rest; their slip not
// more than every 10 min; their chair taken while they're 8 m from it, sat in up to 45 s (then a rest)
const DAY = 24 * 60 * 60_000;
const GRUDGE = { stalk: 30_000, rest: 60_000, told: 10 * 60_000, away: 8, sit: 45_000, chairRest: 5 * 60_000 } as const;
// his words for what they shot him with, offline (the API has its own)
const GUN_WORD: Record<string, string> = {
  revolver: "the .38",
  shotgun: "the shotgun",
  ak47: "the ak",
  sniper: "the rifle",
  daybreak: "the daybreak",
};

/** (plan 88) The fight with him, as features/arms.ts asks: a shot's line, a ball's burst, a hit. (Act III: his
 *  clones and the shadowed he brings in are hit as he is — `id` says which: "vortex" is him.) */
export interface VortexHooks {
  /** the nearest of him (and his) a shot from `level` meets: how far along (m), which — or null */
  along(level: number, ray: Ray, range: number): { t: number; id: string } | null;
  /** a Daybreak ball here (`level`'s floor; z over it): close enough to burst on him (or his) */
  near(level: number, x: number, y: number, z: number, r: number): boolean;
  /** all of him (and his) within `r` of a burst there: which, and their middle */
  caught(level: number, x: number, y: number, z: number, r: number): { id: string; x: number; y: number; z: number }[];
  /** shot by `sid`, `n` (as the shadowed take it); `id`: which was hit (him by default) */
  hit(sid: string, n: number, now: number, id?: string): void;
  /** (phase 2) taped up by his whip (no steps, no shots) — till a friend cuts them free */
  bound(sid: string): boolean;
}
/** (plan 88 phase 2) his act II moves; (phase 3) act III's — the dark's and the mind games */
export type VortexMove = "whip" | "rew" | "pause" | "steal" | "radio" | "hr";
export type VortexMove3 = "clones" | "shades" | "possess" | "glitch";
const MOVES: VortexMove[] = ["whip", "rew", "pause", "steal", "radio", "hr"];
const MOVES3: VortexMove3[] = ["clones", "shades", "possess", "glitch"];
// act III's numbers: his pace; his blow (how near, how hard, how often); a move every 5–8 s; his clones (how
// many, how long, how fast); the shadowed he brings in (at most, how long, how fast, their reach, their wind-up,
// their blow, their rest after); the mind games (how long; one person's next not before this after)
const MV3 = {
  speed: 5.2,
  strikeR: 1.9,
  strike: 30,
  strikeEvery: 1800,
  every: 5000,
  jitter: 3000,
  clones: 2,
  cloneLife: 12_000,
  cloneSpeed: 3.4,
  shades: 3,
  shadeLife: 25_000,
  shadeSpeed: 2.6,
  shadeR: 1.0,
  windup: 600,
  shadeHit: 20,
  recover: 1200,
  possess: 3000,
  glitch: 4000,
  mindGap: 8000,
} as const;
// the shadowed's body (as a person's) for a shot
const SHADE_H = 1.8;
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
    // (phase 4) hits by what they had out — the grudge remembers the gun
    guns: Record<string, number>;
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
  // (phase 3) act III: his clones and the shadowed he brings in (Npcs of their own: "vortex:c…" drawn as him,
  // "vortex:s…" kind vshade, `mood` their state), his next blow, the mind games' rest by person
  interface Minion {
    npc: Npc;
    kind: "clone" | "shade";
    until: number;
    state: string;
    at: number;
    to: string; // (whom it's after)
    path: Point[];
    pathAt: number;
  }
  const minions = new Map<string, Minion>();
  let minionN = 0;
  let nextStrike = 0;
  const mindTill = new Map<string, number>();
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
  const endFight = (keep = true) => {
    // (phase 4: who shot him, how much, with what — remembered a day; not an admin's reset)
    if (keep) remember(Date.now());
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
    clearMinions();
    mindTill.clear();
  };
  const beaten = (by: Player, now: number) => {
    clearMinions();
    fallAt = now;
    path = [];
    mode = "idle";
    npc.mood = "dead";
    npc.vk = 0;
    // (his tape where he fell — the trophy, for whoever picks it up; the building told who finished him)
    // (phase 4: the last to hit him has it a minute before anyone else may)
    room.survival?.drop("vxtape", 1, npc.x, npc.y, room.home, 0, by.uid);
    // (scarred for the day — another scar if he was already today, three at most)
    mem.scars = mem.scarredUntil > now ? Math.min(3, mem.scars + 1) : 1;
    mem.scarredUntil = now + DAY;
    npc.vscar = mem.scars;
    memDirty = true;
    void say("down");
    const secs = Math.round((now - fight.since) / 1000);
    for (const c of room.clients as WorldClient[]) room.send(c, "vortex:down", { by: by.name, secs });
  };
  const hittable = () => !fallAt && !npc.vgone;

  // ── (phase 4) his memory: the scars today, the grudge (by user: how many hits, with what, till when) — kept with
  // the world (the API's world settings), saved a few seconds after it changes ──
  interface Grudge {
    uid: number;
    name: string;
    hits: number;
    gun: string;
    until: number;
  }
  const mem = { scars: 0, scarredUntil: 0, grudges: new Map<number, Grudge>() };
  let memDirty = false;
  let memSavedAt = 0;
  {
    const saved = room.savedVortex as Partial<{ scars: number; scarredUntil: number; grudges: Grudge[] }> | null;
    const now = Date.now();
    if (saved && typeof saved === "object") {
      if (Number(saved.scarredUntil) > now) {
        mem.scars = Math.max(0, Math.min(3, Number(saved.scars) || 0));
        mem.scarredUntil = Number(saved.scarredUntil);
        npc.vscar = mem.scars;
      }
      for (const g of Array.isArray(saved.grudges) ? saved.grudges : [])
        if (Number.isInteger(g?.uid) && Number(g.until) > now && Number(g.hits) > 0)
          mem.grudges.set(g.uid, {
            uid: g.uid,
            name: String(g.name ?? "").slice(0, 60),
            hits: Math.floor(Number(g.hits)),
            gun: String(g.gun ?? "").slice(0, 20),
            until: Number(g.until),
          });
    }
  }
  const remember = (now: number) => {
    for (const [uid, f] of fight.who) {
      if (!f.hits) continue;
      const g = mem.grudges.get(uid) ?? { uid, name: f.name, hits: 0, gun: "", until: 0 };
      g.name = f.name;
      g.hits += f.hits;
      g.gun = Object.entries(f.guns).sort((a, b) => b[1] - a[1])[0]?.[0] ?? g.gun;
      g.until = now + DAY;
      mem.grudges.set(uid, g);
      memDirty = true;
    }
  };
  const saveMem = (now: number) => {
    // (the scars healed, a grudge's day over: let go)
    if (mem.scarredUntil && now > mem.scarredUntil) {
      mem.scars = 0;
      mem.scarredUntil = 0;
      npc.vscar = 0;
      memDirty = true;
    }
    for (const [uid, g] of mem.grudges)
      if (g.until < now) {
        mem.grudges.delete(uid);
        memDirty = true;
      }
    if (!memDirty || now - memSavedAt < 5000) return;
    memDirty = false;
    memSavedAt = now;
    if (config.offline) return;
    void api
      .putVortex({ scars: mem.scars, scarredUntil: mem.scarredUntil, grudges: [...mem.grudges.values()] })
      .catch((e) => console.warn("[vortex] memory not saved", (e as Error).message));
  };
  // the grudge he holds most, against someone here on his floor he may go after now
  let grudgeRest = 0;
  let chairRest = 0;
  let chairOf: Player | null = null;
  const grudgeTold = new Map<number, number>();
  const grudgeHere = () =>
    [...mem.grudges.values()]
      .sort((a, b) => b.hits - a.hits)
      .map((g) => ({ g, p: humans().find((p) => p.uid === g.uid) }))
      .find(({ p }) => !!p && p.level === room.home && okTarget(p) && p.status !== "dnd") as
      | { g: Grudge; p: Player }
      | undefined;
  // their desk's chair, on his floor, when they're away from it
  const chairFor = (p: Player) => {
    const seat = p.desk ? room.state.objects.get(p.desk) : undefined;
    if (!seat || objLevel(fromSchema(seat), room.map) !== room.home) return null;
    const at = { x: seat.x + 0.5, y: seat.y + 0.5 };
    return Math.hypot(p.x - at.x, p.y - at.y) >= GRUDGE.away ? at : null;
  };
  // what a shot can meet: him, his clones (as big as he is), the shadowed he let in (a person's size)
  const bodies = () => [
    { id: "vortex", x: npc.x, y: npc.y, z0: VORTEX_FIGHT.z0, r: VORTEX_FIGHT.r, h: VORTEX_FIGHT.h },
    ...[...minions.entries()]
      .filter(([, m]) => m.state !== "dissolve")
      .map(([id, m]) =>
        m.kind === "clone"
          ? { id, x: m.npc.x, y: m.npc.y, z0: VORTEX_FIGHT.z0, r: VORTEX_FIGHT.r, h: VORTEX_FIGHT.h }
          : { id, x: m.npc.x, y: m.npc.y, z0: 0, r: BODY.r + 0.1, h: SHADE_H },
      ),
  ];
  const clearMinions = () => {
    for (const id of minions.keys()) room.state.npcs.delete(id);
    minions.clear();
  };
  // the act as his health has it; into act III — the transformation, the lights out (the clients, by `vact`),
  // the shadowed let in
  const setAct = (a: Act, now: number) => {
    const was = fight.act;
    fight.act = a;
    npc.vact = a;
    npc.mood = ACT_MOOD[a];
    for (const m of minions.values()) if (m.kind === "clone") m.npc.mood = npc.mood;
    if (a === 3 && was < 3) {
      toAll({ kind: "dark" });
      taunt("dark", now);
      nextStrike = now + 2500;
      nextMove = now + 2500;
      shadesIn(now, 2);
    }
  };

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
  // ── (phase 3) act III ──
  const spawnMinion = (kind: Minion["kind"], x: number, y: number, now: number, life: number, to: string) => {
    const n = new Npc();
    n.id = `vortex:${kind === "clone" ? "c" : "s"}${++minionN}`;
    n.kind = kind === "clone" ? "vortex" : "vshade";
    n.x = x;
    n.y = y;
    n.level = -1;
    n.mood = kind === "clone" ? npc.mood : "emerge";
    n.vact = kind === "clone" ? npc.vact : 0;
    n.vk = npc.vk;
    room.state.npcs.set(n.id, n);
    minions.set(n.id, { npc: n, kind, until: now + life, state: n.mood, at: now, to, path: [], pathAt: 0 });
    return n;
  };
  // an open spot `r` from (x, y), round it from a random start
  const spotAround = (x: number, y: number, r: number) => {
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 10; i++) {
      const a = a0 + (i * Math.PI * 2) / 10;
      const q = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
      if (room.grid.fits(q.x, q.y) && room.wayFor(null, room.home, { x, y }, q)?.length) return q;
    }
    return null;
  };
  // his clones: two of him beside him, and the three shuffled — which one's real nobody knows
  const clones = (now: number) => {
    const spots = [0, 1].map(() => spotAround(npc.x, npc.y, 2.4)).filter((q): q is Point => !!q);
    if (!spots.length) return false;
    const foes = fighters(now);
    const made = spots.map((q, i) =>
      spawnMinion("clone", q.x, q.y, now, MV3.cloneLife, foes[i % Math.max(1, foes.length)]?.sid ?? ""),
    );
    const swap = Math.floor(Math.random() * (made.length + 1));
    if (swap < made.length) {
      const c = made[swap];
      [npc.x, npc.y, c.x, c.y] = [c.x, c.y, npc.x, npc.y];
      path = [];
    }
    toAll({ kind: "clones", n: made.length });
    taunt("clones", now);
    return true;
  };
  // the shadowed let in: at the edges of where the fight is (6–9 m from one of them), after the nearest
  function shadesIn(now: number, n: number) {
    const have = [...minions.values()].filter((m) => m.kind === "shade").length;
    const foes = fighters(now);
    let made = 0;
    for (let i = 0; i < Math.min(n, MV3.shades - have) && foes.length; i++) {
      const f = foes[i % foes.length];
      const q = spotAround(f.x, f.y, 6 + Math.random() * 3);
      if (!q) continue;
      spawnMinion("shade", q.x, q.y, now, MV3.shadeLife, f.sid);
      made++;
    }
    if (made) toAll({ kind: "shades", n: made });
    return made > 0;
  }
  // a mind game on one of them (possession: the one who's shot him most; the glitch: anyone) — a few
  // seconds, never two at once on one person
  const mind = (kind: "possess" | "glitch", now: number, on?: Player) => {
    const free = (p: Player) => (mindTill.get(p.sid) ?? 0) < now;
    let p = on && free(on) ? on : undefined;
    if (!p) {
      const foes = fighters(now).filter(free);
      if (!foes.length) return false;
      if (kind === "possess") {
        const hits = (q: Player) => fight.who.get(q.uid)?.hits ?? 0;
        p = foes.sort((a, b) => hits(b) - hits(a))[0];
      } else p = foes[Math.floor(Math.random() * foes.length)];
    }
    const ms = kind === "possess" ? MV3.possess : MV3.glitch;
    mindTill.set(p.sid, now + ms + MV3.mindGap);
    toAll({ kind, to: p.sid, ms });
    taunt(kind, now);
    return true;
  };
  const move3 = (kind: VortexMove3, now: number, on?: Player) =>
    kind === "clones" ? clones(now) : kind === "shades" ? shadesIn(now, 2) : mind(kind, now, on);
  // a blow, his or one of the shadowed's: hurt (to the ground at nothing — a friend gets them up), thrown from it
  const strike = (p: Player, from: { x: number; y: number }, n: number, id: string, now: number) => {
    room.survival?.hurt(p.sid, n);
    p.hitAt = now;
    p.hitYaw = Math.atan2(from.y - p.y, from.x - p.x);
    const c = clientOf(p);
    if (c) room.send(c, "dark:hit", { id, n });
    toAll({ kind: "strike", to: p.sid, from });
  };
  // a step of one of his towards (x, y): straight where it can, else along the way there
  const stepTo = (m: Minion, to: Point, speed: number, dt: number, now: number) => {
    const n = m.npc;
    const d = Math.hypot(to.x - n.x, to.y - n.y);
    if (d < 0.05) return;
    const k = Math.min(1, (speed * dt) / d);
    const nx = n.x + (to.x - n.x) * k;
    const ny = n.y + (to.y - n.y) * k;
    if (room.grid.fits(nx, ny) && !m.path.length) {
      n.x = nx;
      n.y = ny;
    } else {
      if (!m.path.length || now - m.pathAt > 1000) {
        m.path = room.wayFor(null, room.home, n, to) ?? [];
        m.pathAt = now;
      }
      const wp = m.path[0];
      if (!wp) return;
      const dw = Math.hypot(wp.x - n.x, wp.y - n.y);
      const kw = Math.min(1, (speed * dt) / Math.max(dw, 1e-3));
      n.x += (wp.x - n.x) * kw;
      n.y += (wp.y - n.y) * kw;
      if (dw <= speed * dt) m.path.shift();
    }
    n.yaw = faceByte(to.x - n.x, to.y - n.y, n.yaw);
    n.a = ANIM.walk;
  };
  // his and theirs, each tick: clones walk after one of them; the shadowed stalk, wind up, strike, rest; their
  // time up — gone (the shadowed dissolve)
  const minionsTick = (dt: number, now: number) => {
    const foes = fighters(now);
    for (const [id, m] of minions) {
      const n = m.npc;
      if (m.state === "dissolve") {
        if (now - m.at > 800) {
          room.state.npcs.delete(id);
          minions.delete(id);
        }
        continue;
      }
      if (now > m.until) {
        if (m.kind === "clone") {
          toAll({ kind: "pop", from: { x: n.x, y: n.y } });
          room.state.npcs.delete(id);
          minions.delete(id);
        } else {
          m.state = n.mood = "dissolve";
          m.at = now;
        }
        continue;
      }
      // whom it's after: theirs if still in it, else the nearest
      let t = foes.find((p) => p.sid === m.to);
      if (!t && foes.length) {
        t = foes.reduce((a, b) => (Math.hypot(a.x - n.x, a.y - n.y) < Math.hypot(b.x - n.x, b.y - n.y) ? a : b));
        m.to = t.sid;
      }
      if (m.kind === "clone") {
        if (t && Math.hypot(t.x - n.x, t.y - n.y) > 2.2) stepTo(m, t, MV3.cloneSpeed, dt, now);
        else n.a = ANIM.idle;
        continue;
      }
      if (m.state === "emerge" && now - m.at > 800) m.state = n.mood = "stalk";
      if (!t) {
        n.a = ANIM.idle;
        continue;
      }
      const d = Math.hypot(t.x - n.x, t.y - n.y);
      if (m.state === "stalk") {
        if (d > MV3.shadeR) stepTo(m, t, MV3.shadeSpeed, dt, now);
        else {
          m.state = n.mood = "windup";
          m.at = now;
          n.a = ANIM.idle;
          n.yaw = faceByte(t.x - n.x, t.y - n.y, n.yaw);
        }
      } else if (m.state === "windup" && now - m.at >= MV3.windup) {
        m.state = n.mood = "strike";
        m.at = now;
        // (stepped out of its reach while it wound up: missed)
        if (d <= MV3.shadeR + 0.5) strike(t, n, MV3.shadeHit, id, now);
      } else if (m.state === "strike" && now - m.at > 300) {
        m.state = n.mood = "recover";
        m.at = now;
      } else if (m.state === "recover" && now - m.at > MV3.recover) m.state = n.mood = "stalk";
    }
  };
  // his own blow in act III: the nearest of them in reach, every couple of seconds
  const blow = (now: number) => {
    if (now < nextStrike) return;
    const p = fighters(now)
      .filter((q) => Math.hypot(q.x - npc.x, q.y - npc.y) <= MV3.strikeR)
      .sort((a, b) => Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y))[0];
    if (!p) return;
    nextStrike = now + MV3.strikeEvery;
    npc.yaw = faceByte(p.x - npc.x, p.y - npc.y, npc.yaw);
    strike(p, npc, MV3.strike, "vortex", now);
  };
  // act III's pace: one of the dark's or the mind games now and then — or a tape trick still
  const autoMove3 = (now: number) => {
    const order = [...MOVES3, "whip", "rew"].sort(() => Math.random() - 0.5) as (VortexMove3 | VortexMove)[];
    const who = fighters(now);
    for (const k of order) {
      if (k === "whip" || k === "rew") {
        if (who.some((p) => move(k, p, now))) return;
      } else if (move3(k as VortexMove3, now)) return;
    }
  };
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
      let best: { t: number; id: string } | null = null;
      for (const b of bodies()) {
        const t = rayMeets(ray, b.x, b.y, b.z0, best ? best.t : range, b.r - BODY.r, b.h);
        if (t !== null && (!best || t < best.t)) best = { t, id: b.id };
      }
      return best;
    },
    near(level, x, y, z, r) {
      return this.caught(level, x, y, z, r).length > 0;
    },
    caught(level, x, y, z, r) {
      if (level !== room.home || !hittable()) return [];
      return bodies()
        .filter((b) => Math.hypot(b.x - x, b.y - y) < r + b.r && z > b.z0 - 0.2 && z < b.z0 + b.h + 0.2)
        .map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z0 + b.h / 2 }));
    },
    bound: (sid) => isBound(sid),
    hit(sid, n, now, id = "vortex") {
      const p = room.state.players.get(sid);
      if (!p || p.bot || !hittable()) return;
      // (phase 3: one of his — a clone pops, one of the shadowed dissolves; him none the worse)
      const mn = minions.get(id);
      if (id !== "vortex") {
        if (!mn || mn.state === "dissolve") return;
        if (mn.kind === "clone") {
          toAll({ kind: "pop", from: { x: mn.npc.x, y: mn.npc.y } });
          room.state.npcs.delete(id);
          minions.delete(id);
        } else {
          mn.state = mn.npc.mood = "dissolve";
          mn.at = now;
        }
        return;
      }
      // (phase 2: in HR's timeout — not counted; PAUSE — the shot stopped in the air, to come back at them)
      if ((hrTill.get(p.uid) ?? 0) > now) return;
      if (pauseUntil > now) {
        paused.set(sid, (paused.get(sid) ?? 0) + n);
        return;
      }
      const f = fight.who.get(p.uid) ?? { sid, name: p.name, hits: 0, dmg: 0, at: 0, guns: {} };
      const gun = p.gun || "revolver";
      f.guns[gun] = (f.guns[gun] ?? 0) + 1;
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
      npc.vk = fight.k;
      setAct(actOf(fight.k, fight.act), now);
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
    // (phase 4) back now: his fall and his time away cut short — the grudge remembered as ever; his memory forgotten
    if (m?.back) {
      if (fallAt) {
        fallAt = 0;
        endFight();
      }
      npc.vgone = 0;
      npc.mood = "seething";
      path = [];
      until = now;
      grudgeRest = 0;
    }
    if (m?.forget) {
      mem.grudges.clear();
      mem.scars = 0;
      mem.scarredUntil = 0;
      npc.vscar = 0;
      memDirty = true;
      grudgeTold.clear();
      grudgeRest = 0;
    }
    if (m?.reset) {
      endFight(false);
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
      npc.vk = fight.k;
      // (an admin's: down an act too — set as it is)
      if (actOf(fight.k) < fight.act) {
        fight.act = actOf(fight.k);
        npc.vact = fight.act;
        npc.mood = ACT_MOOD[fight.act];
        if (fight.act < 3) clearMinions();
      } else setAct(actOf(fight.k, fight.act), now);
      dirty = true;
    }
    if (m?.beat && hittable()) {
      fight.since ||= now;
      beaten(p, now);
    }
    // (one of his moves, now: on `to`, else on them)
    if (m?.move && hittable()) {
      const q = (m.to && room.state.players.get(m.to)) || p;
      if (MOVES.includes(m.move as VortexMove)) move(m.move as VortexMove, q, now);
      else if (MOVES3.includes(m.move as VortexMove3)) move3(m.move as VortexMove3, now, q);
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

  const say = async (event: string, userId?: number, client?: WorldClient, ctx: { n?: number; gun?: string } = {}) => {
    if (busy) return;
    busy = true;
    try {
      const res = config.offline
        ? {
            line: (OFFLINE_FIGHT[event] ?? OFFLINE_LINES[Math.floor(Math.random() * OFFLINE_LINES.length)])
              .replace("{gun}", GUN_WORD[ctx.gun ?? ""] ?? "that thing")
              .replace("{times}", ctx.n === 1 ? "once" : `${ctx.n ?? 0} times`),
            mood: OFFLINE_FIGHT[event] ? ACT_MOOD[fight.act] : "smug",
            personal: false,
          }
        : await api.vortexLine({ event, user_id: userId ?? null, ...ctx });
      if (!res?.line) return;
      // (in the fight his face is the act's)
      // (fallen: still down)
      if (!fallAt) npc.mood = fight.on ? ACT_MOOD[fight.act] : (res.mood ?? "smug");
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
    // (phase 4) the grudge: their chair taken while they're away from it, now and then; else after them a while —
    // they're told he remembers
    const held = !fight.on && now >= grudgeRest ? grudgeHere() : undefined;
    if (held) {
      const chair = now >= chairRest && Math.random() < 0.35 ? chairFor(held.p) : null;
      if (chair && go(chair)) {
        mode = "squat";
        chairOf = held.p;
        chairRest = now + GRUDGE.chairRest;
        until = now + GRUDGE.sit;
        return;
      }
      mode = "stalk";
      target = held.p;
      until = now + GRUDGE.stalk;
      grudgeRest = now + GRUDGE.stalk + GRUDGE.rest;
      if (now - (grudgeTold.get(held.g.uid) ?? 0) > GRUDGE.told) {
        grudgeTold.set(held.g.uid, now);
        const c = clientOf(held.p);
        if (c) room.send(c, "vortex:grudge", { hits: held.g.hits, gun: held.g.gun });
      }
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
      saveMem(now);
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
      if (minions.size) minionsTick(dt, now);
      if (held) return;
      // (phase 2) act II: a move every 6–9 s; (phase 3) act III: every 5–8 s, and his blow
      if (fight.on && fight.act >= 2) {
        const [every, jitter] = fight.act === 3 ? [MV3.every, MV3.jitter] : [MV.every, MV.jitter];
        if (!nextMove) nextMove = now + every + Math.random() * jitter;
        else if (now >= nextMove) {
          nextMove = now + every + Math.random() * jitter;
          if (fight.act === 3) autoMove3(now);
          else autoMove(now);
        }
        if (fight.act === 3) blow(now);
      } else nextMove = 0;
      // walk
      if (path.length) {
        let budget = (fight.on && fight.act === 3 ? MV3.speed : SPEED) * dt;
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
      } else npc.a = mode === "sleep" || mode === "squat" ? ANIM.sit : ANIM.idle;
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
            // (phase 4: held a grudge against — he says so, how many, with what)
            const g = mem.grudges.get(t.uid);
            if (c) void (g ? say("grudge", t.uid, c, { n: g.hits, gun: g.gun }) : say("greet", t.uid, c));
          }
        }
      }
      // (phase 4) in their chair: up when they come back (and says so), or when he's sat long enough
      if (mode === "squat" && chairOf) {
        const t = room.state.players.get(chairOf.sid);
        if (!t) {
          mode = "idle";
          chairOf = null;
        } else if (!path.length && Math.hypot(t.x - npc.x, t.y - npc.y) <= 2.2) {
          const c = clientOf(t);
          if (c) void say("chair", t.uid, c);
          mode = "idle";
          chairOf = null;
          until = now + 3000;
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
