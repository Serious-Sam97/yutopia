import { ANIM, areaAt, dirFromDelta, findPath, type Point } from "@yutopia/shared";
import { isRadio } from "@yutopia/shared/media";
import { config } from "../config.ts";
import type { SpaceClient, SpaceRoom } from "../SpaceRoom.ts";
import { Npc, type Player } from "../schema.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Vortex lives in the building (Fita 6). He wanders, stalks people, dances when
// the radio is on, sleeps in the server room at night. His lines come from
// Laravel (same soul/persona as in Yondra). Rules from the voice guide:
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

registerFeature((room: SpaceRoom) => {
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

  const humans = () => [...room.state.players.values()].filter((p) => !p.bot);
  const near = (r: number) => humans().filter((p) => Math.hypot(p.x - npc.x, p.y - npc.y) <= r);
  const okTarget = (pt: Point) => {
    const kind = areaAt(room.map, pt.x, pt.y)?.kind;
    return kind !== "booth" && kind !== "standup";
  };

  const go = (to: Point) => {
    if (!okTarget(to)) return false;
    const p = findPath(room.grid, npc, to);
    if (!p?.length) return false;
    path = p;
    return true;
  };

  const say = async (event: string, userId?: number, client?: SpaceClient) => {
    if (busy) return;
    busy = true;
    try {
      const res = config.offline
        ? { line: OFFLINE_LINES[Math.floor(Math.random() * OFFLINE_LINES.length)], mood: "smug", personal: false }
        : await yondra.vortexLine(room.spaceId, { event, user_id: userId ?? null });
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

  const clientOf = (p: Player) => room.clients.getById(p.sid) as SpaceClient | undefined;

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
    npc.d = dirFromDelta(p.x - npc.x, p.y - npc.y);
    void say("poke", p.uid, client);
    // two people at the terminal: the pencil (fragment Y03)
    if (atTerminal && !config.offline) {
      const inRoom = humans().filter((q) => q.area === p.area);
      if (inRoom.length >= 2) {
        void yondra
          .grantFragment(
            room.spaceId,
            "Y03",
            inRoom.map((q) => q.uid),
          )
          .then(({ granted }) => {
            for (const q of inRoom) {
              if (!granted.includes(q.uid)) continue;
              const c = clientOf(q);
              if (c)
                room.send(c, "toast", {
                  text: 'the screen shows a pencil, turning in the reel. a voice: "not yet." (fragment)',
                  tone: "vortex",
                });
            }
          })
          .catch(() => {});
      }
    }
  });

  const pickMode = (now: number) => {
    const hour = new Date().getHours();
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
      // walk
      if (path.length) {
        let budget = SPEED * dt;
        while (budget > 0 && path.length) {
          const wp = path[0];
          const dx = wp.x - npc.x;
          const dy = wp.y - npc.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.001) npc.d = dirFromDelta(dx, dy);
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
            : new Date().getHours() >= 21
              ? "night"
              : "ambient";
        if (Math.random() < 0.7) void say(event);
      }
    },
  };
});
