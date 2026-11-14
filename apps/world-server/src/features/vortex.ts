import { ANIM, areaAt, faceByte, type Point } from "@yutopia/shared";
import { BODY, type Ray, rayMeets } from "@yutopia/shared/dark";
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
const HOME: Point = { x: 45.5, y: 32.5 };
const OFFLINE_LINES = ["the tape hisses. nobody listens. classic.", "i'm not wandering. i'm patrolling.", "*kkzzt*"];

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
}
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
    hit(sid, n, now) {
      const p = room.state.players.get(sid);
      if (!p || p.bot || !hittable()) return;
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
      if (fight.k <= 0) beaten(p, now);
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
        ? { line: OFFLINE_LINES[Math.floor(Math.random() * OFFLINE_LINES.length)], mood: "smug", personal: false }
        : await api.vortexLine({ event, user_id: userId ?? null });
      if (!res?.line) return;
      npc.mood = res.mood ?? "smug";
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
      if (held) return;
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
          if (d <= 2.6 && now - (lastGreet.get(t.uid) ?? 0) > GREET_COOLDOWN) {
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
