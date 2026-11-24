import type { NpcAbout } from "@yutopia/shared";
import {
  ANIM,
  aboveOf,
  answerOf,
  entry,
  faceByte,
  isHeld,
  isSocial,
  objLevel,
  type Point,
  SOCIAL_MS,
  seatByte,
  stairsWayUp,
  thingCorners,
  thingMiddle,
} from "@yutopia/shared";
import { layoutOf } from "@yutopia/shared/building-styles";
import { nightness } from "@yutopia/shared/dark";
import { buildingsFor, editsNow, groundAt, pavedAt, STREET } from "@yutopia/shared/grounds";
import { thingAtOf } from "@yutopia/shared/grounds-things";
import { SIT_HIP } from "@yutopia/shared/kart";
import { biOf, linesFor, type NpcDef, paceOf, TALK_EVERY } from "@yutopia/shared/npc";
import { JOB_ORDER, lineFor } from "@yutopia/shared/npc/lines";
import {
  ACTIVITIES,
  type ActivityKind,
  actOutcome,
  actsFor,
  type Bond,
  bondAfter,
  bondFaded,
  bondLevel,
  chatDelta,
  choose,
  fullNeeds,
  metBy,
  moodOf,
  moodValue,
  type NeedName,
  NPC_ACTS,
  type NpcAct,
  type NpcMood,
  type NpcNeeds,
  type NpcTraits,
  type Offer,
  type Plan,
  soldBy,
  stepNeeds,
  topWant,
  traitsOf,
} from "@yutopia/shared/npc/mind";
import { inShift, type NpcPlaceDef, onDuty, type PlacedType, placedType, placesOf } from "@yutopia/shared/npc/places";
import { api } from "../api.ts";
import { type Cast, dress, placedKeys, wire } from "../cast.ts";
import { config } from "../config.ts";
import { onEditsLaid } from "../land.ts";
import { Npc, type Player } from "../schema.ts";
import { fromSchema, seatFacing, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md): the cast NPCs God mode placed, played here. Each is made from
// the published edits' `npcs` section and the cast (dressed by it, a change taken live), and lives by their type on the
// navmesh (F5a):
//   stand    at their spot, turning about now and then;
//   counter  at their spot, turned to whoever comes up (within 4 m), else across the counter;
//   sit      on the seat at their spot (a world thing's), up and aside while someone wants it;
//   wander   to a point in their circle (F6a), a while there, the next;
//   route    their stops in order, a pause at each, round again or back the way they came.
// Given a home (F8), out of their hours they walk to its door and in, and stay on its ground storey (F8.1a) — standing,
// or on a seat there — till it's time to come out; without one their hours don't matter (F8.2). They say their lines
// now and then as often as they talk, greet someone coming near, answer X ("npc:talk", aloud: F7a), and duck or run
// from a shot. A town NPC placed is let go by their own feature (room.castFree) and played here (F3.1a); Vortex never
// (F3.2a). Their Npc is `place:<key>`, kind "folk" (the client draws them as the town's folk); `mood` says what the body
// does: "wave", "duck", "run" (the client's).

const V = 1.3; // a person's walk, m/s (× their pace)
const RUN = 3.4; // fleeing
const NEAR_TALK = 10; // a line said on their own only with someone this near
const NEAR_GREET = 3;
const GREET_AGAIN = 3 * 60_000;
const COUNTER_REACH = 4;
const TALK_REACH = 3;
const SHOT_HEARD = 25;
const DUCK_MS = 4000;
const FLEE_M = 14;
const FLEE_BACK_MS = 9000;
const WAVE_MS = 2500;
const SEAT_GIVE_MS = 30_000;
const NO_WAY_RETRY = 20_000;
const BENCH_SEAT = 0.5; // a street bench's seat, its top (m)
// (plan 123) their mind
const MIND_MS = 1000; // their needs stepped, a second at a time
const SERVICE_REACH = 160; // a staffed place this near is on offer (m, straight; + LEVEL_M a floor)
const HAND_REACH = 3; // (plan 123) an order handed over to a player this near the one who made it (m)
const TRAY_MS = 3 * 60_000; // (plan 123) a waiter's order given up past this (a customer gone quiet, a path that won't come)
const TABLE_REACH = 20; // …a player who ordered, walked further than this from the waiter's spot: let go (m, its floor)
const ABOUT_REACH = 25; // …their card, their menu asked of the server this near (m, the same floor)
const LEVEL_M = 20;
const BENCH_REACH = 60;
const FRIEND_REACH = 40;
const FRONT_M = 1.3; // a customer's spot before a counter, out from the worker's
const QUEUE_M = 0.9; // the next in line, behind
const SERVE_MS = 5000; // an order made
const CHAT_LINE_MS = 6000;
const LIFT_FADE_MS = 10 * 60_000;
const RETHINK_MS = 15_000;
const UMBRELLA_FALL = 0.12; // rain this heavy (the room's `fall`) and they open one
/** What a customer's handed for an activity (shared HELD's kinds; none: nothing in hand). */
const SERVED_ITEM: Partial<Record<ActivityKind, string>> = { coffee: "mug", drink: "soda" };
/** The icon over them for a pressing need (the client's want icons). */
const WANT_OF: Record<NeedName, string> = {
  hunger: "meal",
  thirst: "coffee",
  energy: "zzz",
  fun: "fun",
  social: "chat",
  comfort: "home",
};
/** Their needs when they're first made: each its own, from their key — not all of them hungry at once; met enough
 *  that they keep to their placed way a while first. */
function startNeeds(key: string): NpcNeeds {
  const n = fullNeeds();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  for (const k of Object.keys(n) as NeedName[]) {
    h = Math.imul(h ^ k.length, 16777619) >>> 0;
    n[k] = 70 + (h % 30);
  }
  return n;
}

/** A walk's leg: points on one floor (the next leg starts on another, through a town building's door). */
interface Leg {
  level: number;
  pts: Point[];
}
type Mode = "life" | "home" | "duck" | "flee" | "work";
/** Where a plan's at (plan 123): on the way, waiting in line, served (to a seat with it), at it. */
type Stage = "" | "going" | "queue" | "served" | "at";

interface Life {
  key: string;
  npc: Npc;
  def: NpcDef;
  place: NpcPlaceDef;
  type: PlacedType;
  v: number;
  lines: string[];
  greets: string[];
  answers: string[];
  talk: number;
  /** what they're at: their life, home out of hours, ducking, fleeing */
  mode: Mode;
  /** the walk under way (legs left), and whether one's being found */
  legs: Leg[];
  finding: boolean;
  /** the next thing due (a turn, a new point, the pause's end), ms */
  until: number;
  sayAt: number;
  /** when their wave/duck ends (`mood` back to "") */
  moodUntil: number;
  greeted: Map<number, number>;
  answeredAt: Map<number, number>;
  /** route: the stop they're going to, and which way along */
  stop: number;
  dir: 1 | -1;
  /** sit: seated; given up for someone till then */
  seated: boolean;
  givenUntil: number;
  /** home: in it (on its ground storey) */
  inHome: boolean;
  // ── (plan 123) their mind ──
  needs: NpcNeeds;
  traits: NpcTraits;
  /** what they're doing, chosen (null: to choose), and where that's at */
  plan: Plan | null;
  stage: Stage;
  /** gone home for a plan (sleep, a meal there) till then */
  homeUntil: number;
  /** a lift (or a sting) to their mood from what was just done with them, and when */
  lift: number;
  liftAt: number;
  mindAt: number;
  /** what their body's doing till then (`npc.act`) */
  actUntil: number;
  /** how they feel about people: "u:<uid>" a player's, "n:<key>" another NPC's */
  bonds: Map<string, Bond>;
  // at work: there at their spot; who's in line to be served (customers' keys — "n:<key>", "p:<sid>"); the one being
  // served now, with what, till when; the next of their own acts (a wipe, a walk across the floor)
  inWork: boolean;
  line: string[];
  serving: { who: string; item: string; until: number } | null;
  workAt: number;
  /** a chat with another NPC: the next line's turn */
  chatAt: number;
  /** a stroll's or a bench's: when they look again for what meets what presses */
  rethinkAt: number;
  /** their walks' count: one found for a plan given up since is dropped */
  gen: number;
  /** a drink given them, put down by then if nothing they're at uses it (ms) */
  heldUntil: number;
  /** a seat looked for near them no sooner than this (ms): none found, not again every tick */
  seatAt: number;
  /** (a customer at a waited place) the table seat they're shown to */
  table: { x: number; y: number; yaw: number } | null;
  /** (plan 123) their meal's table looked for (once a meal: none found, not again) */
  dishTried: boolean;
  /** (a waiter) the order they're on: whose, and where it's at — taken at the table, to the pass, made, carried */
  tray: { who: string; stage: "take" | "kitchen" | "making" | "serve"; until: number; since: number } | null;
}

/** (plan 123) The point of a convex outline (its corners in order) nearest (x, y): (x, y) itself inside it. */
function nearestOn(c: readonly (readonly [number, number])[], x: number, y: number): [number, number] {
  let inside = true;
  let sign = 0;
  let best: [number, number] = [c[0][0], c[0][1]];
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[(i + 1) % c.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) inside = false;
    }
    const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L));
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) {
      bd = d;
      best = [px, py];
    }
  }
  return inside ? [x, y] : best;
}

registerFeature((room: WorldRoom) => {
  const lives = new Map<string, Life>();
  /** (plan 123) bonds changed since they were last kept ("<npc>|u:<uid>", "<npc>|n:<key>") */
  const bondsDirty = new Set<string>();
  // every NPC's bonds, by their key (the API's, loaded once; an NPC placed later has theirs) — a Life's `bonds` is
  // its NPC's map here
  const bondsOf = new Map<string, Map<string, Bond>>();
  const bondMap = (key: string) => {
    const m = bondsOf.get(key) ?? new Map<string, Bond>();
    bondsOf.set(key, m);
    return m;
  };
  // (loaded once the API answers — tried again every save till it does; till then nothing's kept, so a room opened
  // while the API was away never writes its blank bonds over the kept ones: what changed meanwhile gives way to them)
  let bondsLoaded = !!config.offline;
  let bondsLoading = false;
  const loadBonds = () => {
    if (bondsLoaded || bondsLoading) return;
    bondsLoading = true;
    void api
      .npcBonds()
      .then((r) => {
        for (const b of r.bonds ?? []) bondMap(b.npc).set(b.other, { v: b.v, n: b.n, at: b.at });
        bondsDirty.clear();
        bondsLoaded = true;
      })
      .catch((e) => console.warn("[npcs] bonds not loaded:", e instanceof Error ? e.message : e))
      .finally(() => {
        bondsLoading = false;
      });
  };
  loadBonds();
  /** The changed bonds kept by the API, 500 a call (failed: that call's and the rest kept for the next). */
  const keepBonds = async () => {
    if (!bondsLoaded) return loadBonds();
    if (config.offline || !bondsDirty.size) return;
    const all = [...bondsDirty];
    bondsDirty.clear();
    for (let i = 0; i < all.length; i += 500) {
      const part = all.slice(i, i + 500);
      const rows = part.flatMap((k) => {
        const [npc, other] = k.split("|");
        const b = bondsOf.get(npc)?.get(other);
        return b ? [{ npc, other, v: Math.round(b.v), n: b.n, at: Math.round(b.at) }] : [];
      });
      try {
        if (rows.length) await api.putNpcBonds(rows);
      } catch (e) {
        for (const k of all.slice(i)) bondsDirty.add(k);
        console.warn("[npcs] bonds not kept:", e instanceof Error ? e.message : e);
        return;
      }
    }
  };
  const keeping = setInterval(() => {
    void keepBonds();
    // (what was done with whom a while ago: forgotten)
    const old = Date.now() - RECENT_MS;
    for (const [k, v] of recent) if (!v.length || v[v.length - 1].at < old) recent.delete(k);
    for (const [k, at] of aboutAt) if (at < old) aboutAt.delete(k);
  }, 30_000);
  const pick = <T>(l: T[]): T => l[Math.floor(Math.random() * l.length)];
  // (the people about: made once a tick, not once an NPC — 120 placed: plan 121's perf)
  let people: Player[] = [];
  let peopleAt = -1;
  const humans = () => {
    const now = Date.now();
    if (now !== peopleAt) {
      peopleAt = now;
      people = [...room.state.players.values()].filter((p) => !p.bot);
    }
    return people;
  };
  const nearBy = (l: Life, r: number) =>
    humans().filter((p) => p.level === l.npc.level && Math.hypot(p.x - l.npc.x, p.y - l.npc.y) <= r);

  // ── floors and doors ──
  /** A town building's ground storey (its space's storey 0): its floor, its middle. */
  const homeFloor = (key: string) => room.structure.floors.find((f) => f.space === key && (f.storey ?? 0) === 0);
  const spaceOf = (level: number) => room.structure.floors.find((f) => f.index === level && f.space !== undefined);
  /** Where a town building's door is: just outside on the land, just inside on its ground storey (as wayThrough). */
  const doorOf = (key: string): { out: Point; inn: Point } | null => {
    const b = buildingsFor(editsNow()).find((q) => q.key === key);
    const d = b ? layoutOf(b)?.door : null;
    if (!b || !d) return null;
    const edge = d.ox !== 0 ? { x: d.ox > 0 ? b.x1 : b.x0, y: d.z } : { x: d.x, y: d.oz > 0 ? b.z1 : b.z0 };
    return {
      out: { x: edge.x + d.ox * 0.9, y: edge.y + d.oz * 0.9 },
      inn: { x: edge.x - d.ox * 0.9, y: edge.y - d.oz * 0.9 },
    };
  };
  /** The floors' links: each staircase up its flights to the floor above and back down (shared stairsWayUp, as a
   *  player climbs — the studio's core, a town building's storeys), and each town building's door between the land
   *  and its ground storey. `pts`: the first on `from` (where its floor's navmesh leaves them), walked straight, the
   *  last on `to`. */
  interface Link {
    from: number;
    to: number;
    pts: Point[];
  }
  const links = (): Link[] => {
    const out: Link[] = [];
    for (const o of room.state.objects.values()) {
      if (o.kind !== "stairs") continue;
      const d = fromSchema(o);
      const S = objLevel(d, room.map);
      const A = aboveOf(S);
      if (A === null) continue;
      const way = stairsWayUp(d);
      out.push({ from: S, to: A, pts: way }, { from: A, to: S, pts: [...way].reverse() });
    }
    for (const f of room.structure.floors) {
      if (f.space === undefined || (f.storey ?? 0) !== 0) continue;
      const door = doorOf(f.space);
      if (!door) continue;
      out.push(
        { from: 0, to: f.index, pts: [door.out, door.inn] },
        { from: f.index, to: 0, pts: [door.inn, door.out] },
      );
    }
    return out;
  };
  /** The way from one floor's spot to another's, leg by leg (F5a): on each floor the navmesh, between floors the links
   *  — up and down stairs, in and out of doors — the fewest of them (each tried nearest first). Null: no way (never
   *  walked through walls). */
  const plan = async (fromLevel: number, from: Point, toLevel: number, to: Point): Promise<Leg[] | null> => {
    const leg = async (level: number, a: Point, b: Point): Promise<Leg | null> => {
      const pts = await room.waySoon(null, level, a, b);
      return pts ? { level, pts: pts.length ? pts : [b] } : null;
    };
    if (fromLevel === toLevel) {
      const one = await leg(fromLevel, from, to);
      if (one) return [one];
    }
    // the floors' graph, breadth first: the fewest links (several to a floor: each a way to try)
    const all = links();
    const by = new Map<number, Link[]>();
    for (const k of all) by.set(k.from, [...(by.get(k.from) ?? []), k]);
    const paths: Link[][] = [];
    const queue: { level: number; path: Link[] }[] = [{ level: fromLevel, path: [] }];
    const depth = new Map<number, number>([[fromLevel, 0]]);
    while (queue.length && paths.length < 6) {
      const q = queue.shift() as { level: number; path: Link[] };
      if (q.level === toLevel && q.path.length) {
        paths.push(q.path);
        continue;
      }
      if (q.path.length >= 8) continue;
      for (const k of by.get(q.level) ?? []) {
        const d = q.path.length + 1;
        if ((depth.get(k.to) ?? Number.POSITIVE_INFINITY) < d) continue;
        depth.set(k.to, d);
        queue.push({ level: k.to, path: [...q.path, k] });
      }
    }
    // (the nearest link out of here first)
    paths.sort(
      (a, b) =>
        Math.hypot(a[0].pts[0].x - from.x, a[0].pts[0].y - from.y) -
        Math.hypot(b[0].pts[0].x - from.x, b[0].pts[0].y - from.y),
    );
    for (const path of paths) {
      const legs: Leg[] = [];
      let at = from;
      let level = fromLevel;
      let ok = true;
      for (const k of path) {
        const walk = await leg(level, at, k.pts[0]);
        if (!walk) {
          ok = false;
          break;
        }
        // (arrived on this floor by a link: the leg starts where it left them)
        if (legs.length) walk.pts.unshift(at);
        legs.push(walk);
        // the link walked straight on its own floor (the stairs' flights; a door's two steps), out on the next
        const mid = k.pts.slice(1, -1);
        if (mid.length) legs.push({ level, pts: mid });
        at = k.pts[k.pts.length - 1];
        level = k.to;
      }
      if (!ok) continue;
      const last = await leg(level, at, to);
      if (!last) continue;
      last.pts.unshift(at);
      legs.push(last);
      return legs;
    }
    return null;
  };
  const goTo = (l: Life, level: number, to: Point, then: () => void = () => {}) => {
    if (l.finding) return;
    l.finding = true;
    const from = { x: l.npc.x, y: l.npc.y };
    const gen = l.gen;
    void plan(l.npc.level, from, level, to)
      .then((legs) => {
        if (!lives.has(l.key) || lives.get(l.key) !== l || l.gen !== gen) return;
        if (!legs) {
          // (no way: they stay where they are, and try again a while later)
          l.until = Date.now() + NO_WAY_RETRY;
          return;
        }
        l.legs = legs;
        then();
      })
      .catch(() => {
        l.until = Date.now() + NO_WAY_RETRY;
      })
      .finally(() => {
        l.finding = false;
      });
  };
  /** A step along the walk (true: there, the walk done). */
  const walk = (l: Life, dt: number, v: number): boolean => {
    const n = l.npc;
    while (l.legs.length) {
      const leg = l.legs[0];
      if (n.level !== leg.level) {
        // (through the door: on the other floor now, at the leg's start)
        n.level = leg.level;
        const s = leg.pts[0];
        if (s) {
          n.x = s.x;
          n.y = s.y;
        }
      }
      const t = leg.pts[0];
      if (!t) {
        l.legs.shift();
        continue;
      }
      const dx = t.x - n.x;
      const dz = t.y - n.y;
      const d = Math.hypot(dx, dz);
      const step = v * dt;
      if (d <= step) {
        n.x = t.x;
        n.y = t.y;
        leg.pts.shift();
        if (!leg.pts.length) l.legs.shift();
        if (!l.legs.length) break;
        return false;
      }
      n.x += (dx / d) * step;
      n.y += (dz / d) * step;
      n.a = ANIM.walk;
      n.z = 0;
      n.yaw = faceByte(dx, dz, n.yaw);
      return false;
    }
    n.a = ANIM.idle;
    return true;
  };
  const face = (n: Npc, a: number) => {
    n.yaw = faceByte(Math.cos(a), Math.sin(a), n.yaw);
  };
  const atPlace = (l: Life) =>
    l.npc.level === l.place.level && Math.hypot(l.npc.x - l.place.x, l.npc.y - l.place.z) < 0.6;
  const setMood = (l: Life, mood: string, ms: number) => {
    l.npc.mood = mood;
    l.moodUntil = ms ? Date.now() + ms : 0;
  };
  const say = (l: Life, line: string) => {
    l.npc.say = wire(line);
    l.npc.sayAt = Date.now();
  };

  // ── made, dressed, taken away ──
  const fit = (l: Life, d: NpcDef, place: NpcPlaceDef) => {
    dress(l.npc, d);
    if (l.npc.talk !== d.behaviour.answer) l.npc.talk = d.behaviour.answer;
    const moved = l.place.x !== place.x || l.place.z !== place.z || l.place.level !== place.level;
    // (their work moved or changed: off it properly — its line told, a plate put down — to start again there)
    const wasWork = l.place.work;
    const nowWork = place.work;
    const workMoved =
      !!wasWork !== !!nowWork ||
      (!!wasWork &&
        !!nowWork &&
        (wasWork.building !== nowWork.building ||
          wasWork.job !== nowWork.job ||
          wasWork.x !== nowWork.x ||
          wasWork.z !== nowWork.z ||
          wasWork.level !== nowWork.level));
    if ((moved || workMoved) && l.mode === "work") leaveWork(l, Date.now());
    l.def = d;
    l.place = place;
    l.type = placedType(d, place);
    l.v = V * paceOf(d);
    l.lines = linesFor(d, "ambient");
    l.greets = linesFor(d, "greet");
    l.answers = linesFor(d, "answer");
    l.talk = TALK_EVERY[d.behaviour.talk];
    l.traits = traitsOf(d.key, d.behaviour.traits);
    if (moved) {
      // (put somewhere else in God mode: there now, what they were at given up — out of any line, their walk to it
      // and any still being found dropped)
      if (l.plan) endPlan(l);
      l.gen++;
      Object.assign(l.npc, { x: place.x, y: place.z, z: 0, level: place.level, a: ANIM.idle });
      face(l.npc, place.a);
      l.legs = [];
      l.mode = "life";
      l.inHome = false;
      l.seated = false;
      l.stop = 0;
      l.dir = 1;
      l.plan = null;
      l.stage = "";
      l.inWork = false;
    }
  };
  const make = (d: NpcDef, place: NpcPlaceDef, now: number): Life => {
    const npc = new Npc();
    npc.id = `place:${d.key}`;
    npc.kind = "folk";
    Object.assign(npc, { x: place.x, y: place.z, z: 0, level: place.level, a: ANIM.idle });
    face(npc, place.a);
    const l: Life = {
      key: d.key,
      npc,
      def: d,
      place,
      type: "stand",
      v: V,
      lines: [],
      greets: [],
      answers: [],
      talk: 1,
      mode: "life",
      legs: [],
      finding: false,
      until: now + 2000 + Math.random() * 4000,
      sayAt: now + 15_000 + Math.random() * 45_000,
      moodUntil: 0,
      greeted: new Map(),
      answeredAt: new Map(),
      stop: 0,
      dir: 1,
      seated: false,
      givenUntil: 0,
      inHome: false,
      needs: startNeeds(d.key),
      traits: traitsOf(d.key, d.behaviour.traits),
      plan: null,
      stage: "",
      homeUntil: 0,
      lift: 0,
      liftAt: 0,
      mindAt: now,
      actUntil: 0,
      bonds: bondMap(d.key),
      inWork: false,
      line: [],
      serving: null,
      workAt: 0,
      chatAt: 0,
      rethinkAt: 0,
      gen: 0,
      heldUntil: 0,
      seatAt: 0,
      table: null,
      dishTried: false,
      tray: null,
    };
    fit(l, d, place);
    room.state.npcs.set(npc.id, npc);
    return l;
  };
  const reconcile = (c: Cast = room.cast) => {
    const e = editsNow();
    const now = Date.now();
    const keys = placedKeys(e, c);
    const places = new Map(placesOf(e).map((p) => [p.key, p]));
    for (const [k, l] of lives)
      if (!keys.has(k)) {
        room.state.npcs.delete(l.npc.id);
        lives.delete(k);
      }
    for (const k of keys) {
      const d = c.get(k);
      const p = places.get(k);
      if (!d || !p) continue;
      const l = lives.get(k);
      if (l) fit(l, d, p);
      else lives.set(k, make(d, p, now));
    }
    // (an NPC deleted from the cast: their bonds gone too — the API's are deleted with them — and theirs in the others')
    // (one the cast hasn't — deleted, or the cast a stand-in while the API's away —: nothing of theirs written; what's
    // kept left as it is, and the API deletes a deleted one's)
    if (bondsDirty.size)
      for (const d of [...bondsDirty]) {
        const [npc, other] = d.split("|");
        if (!c.get(npc) || (other.startsWith("n:") && !c.get(other.slice(2)))) bondsDirty.delete(d);
      }
    // (the town's features let go of anyone placed here, and take back anyone no longer)
    room.setPlaced(keys);
  };
  reconcile();
  const offLaid = onEditsLaid(() => reconcile());

  // ── their lives ──
  /** (out on the land) A street bench's free seat nearest their place, within 1.5 m: two to a bench, either half of it,
   *  on its seat (0.5 m up), facing out from its back (the client's town3d bench: its back at local −z). */
  const benchSeat = (l: Life): { x: number; z: number; y: number; a: number } | null => {
    if (l.place.level !== 0) return null;
    let best: { x: number; z: number; y: number; a: number; d: number } | null = null;
    for (const t of STREET) {
      if (t.kind !== "bench") continue;
      const [cx, cz] = thingAtOf(t);
      if (Math.hypot(cx - l.place.x, cz - l.place.z) > 2.6) continue;
      // (along it: local x; out of it: local z — three.js's turn by ry)
      const ax = Math.cos(t.ry);
      const az = -Math.sin(t.ry);
      const fx = Math.sin(t.ry);
      const fz = Math.cos(t.ry);
      for (const u of [-0.5, 0.5]) {
        const x = cx + ax * u + fx * 0.05;
        const z = cz + az * u + fz * 0.05;
        const d = Math.hypot(x - l.place.x, z - l.place.z);
        if (d > 1.5 || (best && d >= best.d)) continue;
        const busy =
          humans().some((p) => p.level === 0 && Math.hypot(p.x - x, p.y - z) < 0.45) ||
          [...lives.values()].some((o) => o !== l && o.seated && Math.hypot(o.npc.x - x, o.npc.y - z) < 0.45);
        if (busy) continue;
        best = { x, z, y: groundAt(x, z) + pavedAt(x, z) + BENCH_SEAT - SIT_HIP, a: Math.atan2(fz, fx), d };
      }
    }
    return best;
  };
  const sitDown = (l: Life): boolean => {
    const g = room.gridFor(0, l.place.level);
    const seat = g.seatAt(l.place.x, l.place.z);
    if (!seat) {
      // (no seat of the world's things there: a street bench by it, out on the land)
      const b = benchSeat(l);
      if (!b) return false;
      l.npc.x = b.x;
      l.npc.y = b.z;
      l.npc.z = b.y;
      l.npc.a = ANIM.sit;
      face(l.npc, b.a);
      l.seated = true;
      return true;
    }
    // (never on a seat someone's in)
    const taken = humans().some(
      (p) => p.level === l.place.level && p.a === ANIM.sit && Math.hypot(p.x - l.place.x, p.y - l.place.z) < 0.8,
    );
    if (taken) return false;
    const spot = g.seatSpot(l.place.x, l.place.z);
    l.npc.x = spot.x;
    l.npc.y = spot.y;
    l.npc.a = ANIM.sit;
    l.npc.yaw = seat.front ? seatByte(seat) : seatFacing(seat.rot);
    l.seated = true;
    return true;
  };
  /** (plan 123) Where their plate goes, sat to eat: on the top of the table (or counter) before them — its nearest
   *  point to them, a hand in from its edge — "x,y,h" ("" no table in reach: on their lap, nothing drawn). */
  const dishOf = (l: Life): string => {
    const n = l.npc;
    let best: { x: number; y: number; h: number; d: number } | null = null;
    for (const s of room.state.objects.values()) {
      const e = entry(s.kind);
      // (a table's or a counter's height — not a shelf's, nor a coffee table's down by the knees)
      if (e.surface === undefined || e.surface < 0.6 || e.surface > 1.15) continue;
      const o = fromSchema(s);
      const [mx, my] = thingMiddle(o);
      if (Math.hypot(mx - n.x, my - n.y) > 3 || objLevel(o, room.map) !== n.level) continue;
      const c = thingCorners(o, 0.12);
      const [px, py] = nearestOn(c, n.x, n.y);
      const d = Math.hypot(px - n.x, py - n.y);
      if (d < 0.9 && (!best || d < best.d)) best = { x: px, y: py, h: e.surface, d };
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return best ? `${r2(best.x)},${r2(best.y)},${r2(best.h)}` : "";
  };
  const standUp = (l: Life) => {
    // (up — ducked, fled, off —: the plate taken up; sat again at their meal, set down again)
    if (l.npc.dish) l.npc.dish = "";
    l.dishTried = false;
    if (!l.seated) return;
    l.seated = false;
    l.npc.a = ANIM.idle;
    l.npc.z = 0;
  };
  /** Their type's life at their place (home, ducking and fleeing aside). */
  const live = (l: Life, dt: number, now: number) => {
    const n = l.npc;
    const p = l.place;
    if (l.legs.length) {
      if (walk(l, dt, l.v)) l.until = now + 1000;
      return;
    }
    if (l.finding) return;
    // away from their place (back from home, from fleeing, a route's or a wander's walk aside): stand/counter/sit go
    // back to it first
    if ((l.type === "stand" || l.type === "counter" || l.type === "sit") && !atPlace(l) && !l.seated) {
      if (now >= l.until) goTo(l, p.level, { x: p.x, y: p.z });
      return;
    }
    switch (l.type) {
      case "stand":
        if (now >= l.until) {
          l.until = now + 6000 + Math.random() * 9000;
          face(n, p.a + (Math.random() - 0.5) * 1.6);
        }
        break;
      case "counter": {
        // (turned to whoever's come up to it, the nearest; else back across it)
        const who = nearBy(l, COUNTER_REACH).sort(
          (a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y),
        )[0];
        if (who) n.yaw = faceByte(who.x - n.x, who.y - n.y, n.yaw);
        else face(n, p.a);
        n.a = ANIM.idle;
        break;
      }
      case "sit": {
        // (someone standing at the seat wants it: up and aside a while; else sat on it)
        const wants = humans().some(
          (q) => q.level === p.level && q.a !== ANIM.sit && Math.hypot(q.x - p.x, q.y - p.z) < 1.0,
        );
        if (l.seated && wants) {
          standUp(l);
          l.givenUntil = now + SEAT_GIVE_MS;
          const aside = room.gridFor(0, p.level).nearestOpen(p.x + Math.cos(p.a) * 1.4, p.z + Math.sin(p.a) * 1.4, 3);
          if (aside) {
            n.x = aside.x;
            n.y = aside.y;
          }
          break;
        }
        if (!l.seated && now >= l.givenUntil && now >= l.until) {
          if (!sitDown(l)) {
            // (no seat there, or it's taken: they stand by it, and look again later)
            l.until = now + 10_000;
            n.a = ANIM.idle;
            face(n, p.a);
          }
        }
        break;
      }
      case "wander":
        if (now >= l.until) {
          const r = p.r ?? 6;
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          const g = room.gridFor(0, p.level);
          const to = g.nearestOpen(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 2);
          l.until = now + 5000 + Math.random() * 15_000;
          if (to) goTo(l, p.level, to, () => {});
        }
        break;
      case "route": {
        if (now < l.until) break;
        const stops = [{ x: p.x, z: p.z, level: p.level }, ...(p.route ?? [])];
        if (stops.length < 2) {
          face(n, p.a);
          break;
        }
        // (the next stop: round again, or back the way they came)
        let next = l.stop + l.dir;
        if (next >= stops.length) {
          if (p.loop) next = 0;
          else {
            l.dir = -1;
            next = stops.length - 2;
          }
        } else if (next < 0) {
          l.dir = 1;
          next = 1;
        }
        const s = stops[next];
        goTo(l, s.level, { x: s.x, y: s.z }, () => {
          l.stop = next;
        });
        // (the pause at it, after the walk: counted from when they set off, plus the walk)
        l.until = now + (p.pause ?? 4) * 1000;
        break;
      }
    }
  };
  /** Home out of hours (F8): to its door, in, and a spot (a seat there, else standing) on its ground storey. */
  const goHome = (l: Life, now: number) => {
    const f = l.place.home ? homeFloor(l.place.home) : undefined;
    if (!f) {
      l.mode = "life";
      return;
    }
    if (l.inHome) return;
    if (l.legs.length) return;
    if (l.npc.level === f.index) {
      l.inHome = true;
      // (a seat in the house, if one's free; else where they are)
      const g = room.gridFor(0, f.index);
      for (const [tile, seat] of g.seats) {
        const [tx, ty] = tile.split(",").map(Number);
        const spot = g.seatSpot(tx + 0.5, ty + 0.5);
        const busy =
          [...lives.values()].some(
            (o) => o !== l && o.inHome && Math.hypot(o.npc.x - spot.x, o.npc.y - spot.y) < 0.5,
          ) || humans().some((p) => p.level === f.index && Math.hypot(p.x - spot.x, p.y - spot.y) < 0.8);
        if (busy) continue;
        l.npc.x = spot.x;
        l.npc.y = spot.y;
        l.npc.a = ANIM.sit;
        l.npc.yaw = seat.front ? seatByte(seat) : seatFacing(seat.rot);
        l.seated = true;
        return;
      }
      l.npc.a = ANIM.idle;
      return;
    }
    if (now < l.until) return;
    const mid = { x: f.grid.x0 + f.grid.w / 2, y: f.grid.y0 + f.grid.h / 2 };
    // (each their own spot inside: spread about the middle)
    const k = [...lives.keys()].indexOf(l.key);
    const spot =
      room.gridFor(0, f.index).nearestOpen(mid.x + (k % 3) - 1, mid.y + (Math.floor(k / 3) % 3) - 1, 4) ?? mid;
    standUp(l);
    goTo(l, f.index, spot);
    l.until = now + 3000;
  };

  // ── (plan 123) their mind ──
  const setAct = (l: Life, act: string, ms: number, withId = "") => {
    l.npc.act = act;
    l.npc.actAt = Date.now();
    l.npc.actWith = withId;
    l.actUntil = ms ? Date.now() + ms : 0;
  };
  const moodNow = (l: Life, now: number): NpcMood => {
    const lift = l.lift * Math.max(0, 1 - (now - l.liftAt) / LIFT_FADE_MS);
    return moodOf(moodValue(l.needs, l.traits, lift), l.traits);
  };
  /** What they're doing now, to their needs: work, home's sleep or meal, the plan they're at. */
  const doingNow = (l: Life, night: number): ActivityKind | null => {
    if (l.mode === "work") return l.inWork ? "work" : null;
    if (l.mode === "home") return l.inHome ? (night > 0.5 || l.plan?.kind === "sleep" ? "sleep" : "eat-home") : null;
    if (l.plan && l.stage === "at") return l.plan.kind;
    return null;
  };
  const stepMind = (l: Life, now: number, night: number) => {
    const min = Math.min(5, (now - l.mindAt) / 60_000);
    l.mindAt = now;
    l.needs = stepNeeds(l.needs, l.traits, min, doingNow(l, night), night);
    const w = l.mode === "life" || l.mode === "home" ? topWant(l.needs, l.traits, night) : null;
    const want = w ? WANT_OF[w] : "";
    if (l.npc.want !== want) l.npc.want = want;
  };
  /** A worker at their spot serving what's sold there: the one open to customers. */
  const open = (w: Life) => w.mode === "work" && w.inWork && !!w.place.work && soldBy(w.place.work.job).length > 0;
  /** Where a customer stands to be served by `w`: before the spot, out the way they face (the `i`-th in line behind). */
  const frontOf = (w: Life, i = 0): Point | null => {
    const k = w.place.work;
    if (!k) return null;
    const d = FRONT_M + i * QUEUE_M;
    const g = room.gridFor(0, k.level);
    return g.nearestOpen(k.x + Math.cos(k.a) * d, k.z + Math.sin(k.a) * d, 1.5) ?? null;
  };
  const distTo = (l: Life, level: number, x: number, z: number) =>
    Math.hypot(l.npc.x - x, l.npc.y - z) + (level === l.npc.level ? 0 : LEVEL_M);
  /** What's on offer round them: the staffed places, a bench out on the land, a friend about to chat with. */
  const offersFor = (l: Life, now: number): Offer[] => {
    const out: Offer[] = [];
    for (const w of lives.values()) {
      if (w === l || !open(w) || !w.place.work) continue;
      const k = w.place.work;
      const d = distTo(l, k.level, k.x, k.z);
      if (d > SERVICE_REACH) continue;
      for (const kind of soldBy(k.job)) out.push({ kind, at: w.key, dist: d + w.line.length * 8 });
    }
    if (l.npc.level === 0)
      for (const t of STREET) {
        if (t.kind !== "bench") continue;
        const [cx, cz] = thingAtOf(t);
        const d = Math.hypot(cx - l.npc.x, cz - l.npc.y);
        if (d < BENCH_REACH) out.push({ kind: "bench", at: `bench:${t.key}`, dist: d });
      }
    const mood = moodNow(l, now);
    for (const f of lives.values()) {
      if (f === l || f.mode !== "life" || f.npc.level !== l.npc.level || (f.plan && f.plan.kind !== "stroll")) continue;
      const d = Math.hypot(f.npc.x - l.npc.x, f.npc.y - l.npc.y);
      if (d > FRIEND_REACH) continue;
      const b = l.bonds.get(`n:${f.key}`) ?? null;
      if ((b?.v ?? 0) <= -20 || mood === "cross" || moodNow(f, now) === "cross") continue;
      // (a friend's worth walking further for)
      out.push({ kind: "chat", at: f.key, dist: Math.max(0, d - (b?.v ?? 0) / 4) });
    }
    return out;
  };
  /** Their plan done (or given up): what's in hand put away, up from a seat, out of line. */
  const endPlan = (l: Life) => {
    // (what they had for it — or were given — finished, put down; an umbrella kept)
    if (l.npc.held && l.npc.held !== "umbrella") l.npc.held = "";
    if (l.plan?.kind === "chat") {
      const f = lives.get(l.plan.at);
      if (f?.plan?.kind === "chat" && f.plan.at === l.key) {
        if (l.stage === "at" && f.stage === "at") chatDone(l, f, Date.now());
        f.plan = null;
        f.stage = "";
        if (f.npc.act === "chat") setAct(f, "", 0);
      }
    }
    for (const w of lives.values()) {
      const i = w.line.indexOf(`n:${l.key}`);
      if (i >= 0) w.line.splice(i, 1);
    }
    if (l.npc.act === "chat" || l.npc.act === "eat" || l.npc.act === "drink" || l.npc.act === "read") setAct(l, "", 0);
    standUp(l);
    l.table = null;
    l.dishTried = false;
    l.plan = null;
    l.stage = "";
    // (the walk to it given up too, and any still being found)
    l.legs = [];
    l.gen++;
  };
  const chooseNext = (l: Life, now: number, night: number) => {
    const p = choose(
      l.needs,
      l.traits,
      { night, onShift: false, home: !!l.place.home && !!homeFloor(l.place.home), offers: offersFor(l, now) },
      now,
      Math.random,
    );
    l.plan = p;
    l.stage = p.kind === "stroll" ? "at" : "going";
    // (off to it now: not after what they were at's own wait)
    l.until = now;
    if (p.kind === "chat") {
      // (the friend stops for it too: their plan the same, with them)
      const f = lives.get(p.at);
      if (f) {
        // (what they were at given up properly: up off a seat, out of a line, their walk to it dropped)
        if (f.plan) endPlan(f);
        else standUp(f);
        f.plan = { kind: "chat", at: l.key, until: p.until };
        f.stage = "going";
        f.legs = [];
      }
    }
    if (p.kind === "sleep" || p.kind === "eat-home") {
      l.homeUntil = p.until;
      l.mode = "home";
      l.legs = [];
      l.until = now;
    }
  };
  /** A seat free on this floor near (x, z) (its spot, which way), for a customer with what they've been served. */
  const freeSeat = (level: number, x: number, z: number, l: Life) => {
    const g = room.gridFor(0, level);
    let best: { spot: Point; yaw: number; d: number } | null = null;
    for (const [tile, seat] of g.seats) {
      const [tx, ty] = tile.split(",").map(Number);
      const spot = g.seatSpot(tx + 0.5, ty + 0.5);
      const d = Math.hypot(spot.x - x, spot.y - z);
      if (d > 14 || (best && d >= best.d)) continue;
      const busy =
        [...lives.values()].some(
          (o) =>
            o !== l &&
            ((o.seated && Math.hypot(o.npc.x - spot.x, o.npc.y - spot.y) < 0.5) ||
              (o.table && Math.hypot(o.table.x - spot.x, o.table.y - spot.y) < 0.5)),
        ) || humans().some((q) => q.level === level && Math.hypot(q.x - spot.x, q.y - spot.y) < 0.7);
      if (!busy) best = { spot, yaw: seat.front ? seatByte(seat) : seatFacing(seat.rot), d };
    }
    return best;
  };
  /** Their life by their mind (life mode): the plan followed; nothing pressing, their placed type at their place. */
  const follow = (l: Life, dt: number, now: number, night: number) => {
    const n = l.npc;
    const p = l.plan;
    if (!p || now >= p.until || (l.stage === "at" && metBy(l.needs, p.kind))) {
      if (p) endPlan(l);
      chooseNext(l, now, night);
      return;
    }
    // (strolling or on a bench while something presses that neither meets: now and then they look again — a place
    // opened meanwhile, a friend come by)
    if ((p.kind === "stroll" || p.kind === "bench") && now >= l.rethinkAt) {
      l.rethinkAt = now + RETHINK_MS;
      const top = topWant(l.needs, l.traits, night);
      if (top && !(ACTIVITIES[p.kind].fills[top] ?? 0)) {
        const next = choose(
          l.needs,
          l.traits,
          { night, onShift: false, home: !!l.place.home && !!homeFloor(l.place.home), offers: offersFor(l, now) },
          now,
          Math.random,
        );
        if ((ACTIVITIES[next.kind].fills[top] ?? 0) > 1) {
          endPlan(l);
          chooseNext(l, now, night);
          return;
        }
      }
    }
    if (p.kind === "stroll") return live(l, dt, now);
    if (l.legs.length) {
      walk(l, dt, l.v);
      return;
    }
    if (l.finding) return;
    switch (p.kind) {
      case "coffee":
      case "meal":
      case "drink":
      case "shop":
      case "read": {
        const w = lives.get(p.at);
        if (!w || !open(w) || !w.place.work) {
          // (closed meanwhile: something else)
          if (l.stage !== "served" && l.stage !== "at") {
            p.until = now;
            return;
          }
        }
        const k = w?.place.work;
        // (a waited place — a waiter's —: shown to a table, sat, the order taken there and the plate brought)
        if (w && k && k.job === "waiter" && (l.stage === "going" || l.stage === "queue")) {
          const me = `n:${l.key}`;
          if (l.stage === "going") {
            if (!l.table) {
              // (the nearest seat no one's sat on or been shown to)
              const s = freeSeat(k.level, k.x, k.z, l);
              if (!s) {
                p.until = now;
                return;
              }
              l.table = { x: s.spot.x, y: s.spot.y, yaw: s.yaw };
            }
            const t = l.table;
            if (n.level === k.level && Math.hypot(n.x - t.x, n.y - t.y) < 1.6) {
              n.x = t.x;
              n.y = t.y;
              n.a = ANIM.sit;
              n.yaw = t.yaw;
              l.seated = true;
              if (!w.line.includes(me)) w.line.push(me);
              l.stage = "queue";
            } else if (now >= l.until) {
              l.until = now + 1500;
              goTo(l, k.level, { x: t.x, y: t.y });
            }
            return;
          }
          // (sat waiting: forgotten — the waiter gone off — or too long, off, cross; not while theirs is on its way)
          const theirs = w.tray?.who === me;
          if ((!theirs && !w.line.includes(me)) || (now > p.until - 30_000 && !theirs)) p.until = now;
          return;
        }
        if (l.stage === "going" && w && k) {
          const i = Math.max(0, w.line.indexOf(`n:${l.key}`));
          const f = frontOf(w, w.line.includes(`n:${l.key}`) ? i : w.line.length);
          if (!f) {
            p.until = now;
            return;
          }
          // (as near as the navmesh leaves them: a worker's tolerance)
          if (n.level === k.level && Math.hypot(n.x - f.x, n.y - f.y) < 1.2) {
            if (!w.line.includes(`n:${l.key}`)) w.line.push(`n:${l.key}`);
            l.stage = "queue";
            n.yaw = faceByte(k.x - n.x, k.z - n.y, n.yaw);
          } else if (now >= l.until) {
            l.until = now + 1500;
            goTo(l, k.level, f);
          }
          return;
        }
        if (l.stage === "queue" && w && k) {
          // (moved up the line as those before are served)
          const i = w.line.indexOf(`n:${l.key}`);
          if (i < 0) {
            l.stage = "going";
            return;
          }
          const f = frontOf(w, i);
          if (f && Math.hypot(n.x - f.x, n.y - f.y) > 0.5 && now >= l.until) {
            l.until = now + 1500;
            goTo(l, k.level, f);
          }
          n.yaw = faceByte(k.x - n.x, k.z - n.y, n.yaw);
          // (waiting too long: off, cross — not while theirs is being made)
          if (now > p.until - 30_000 && w.serving?.who !== `n:${l.key}`) p.until = now;
          return;
        }
        if (l.stage === "served") {
          // (to a seat in the place with it, if there's one; else where they are)
          const seat = freeSeat(n.level, n.x, n.y, l);
          l.stage = "at";
          const len = ACTIVITIES[p.kind].minutes;
          p.until = now + (len[0] + (len[1] - len[0]) * Math.random()) * 60_000;
          // (sat on it once there: the "at" stage's)
          if (seat && p.kind !== "shop" && !l.seated) goTo(l, n.level, seat.spot);
          return;
        }
        if (l.stage === "at") {
          if (!l.seated && !l.legs.length && now >= l.seatAt) {
            const s = seatNear(l);
            if (!s) l.seatAt = now + 3000;
            else {
              n.x = s.spot.x;
              n.y = s.spot.y;
              n.a = ANIM.sit;
              n.yaw = s.yaw;
              l.seated = true;
            }
          }
          // (a meal sat at: its plate on the table before them, once)
          if (p.kind === "meal" && l.seated && !n.dish && !l.dishTried) {
            l.dishTried = true;
            n.dish = dishOf(l);
          }
          const act = p.kind === "meal" ? "eat" : p.kind === "read" ? "read" : p.kind === "shop" ? "" : "drink";
          if (act && n.act !== act && now >= l.actUntil) setAct(l, act, 0);
        }
        return;
      }
      case "bench": {
        if (l.stage === "going") {
          const t = STREET.find((q) => `bench:${q.key}` === p.at);
          if (!t) {
            p.until = now;
            return;
          }
          const b = benchOf(l, t);
          if (!b) {
            p.until = now;
            return;
          }
          if (Math.hypot(n.x - b.x, n.y - b.z) < 0.5) {
            n.x = b.x;
            n.y = b.z;
            n.z = b.y;
            n.a = ANIM.sit;
            face(n, b.a);
            l.seated = true;
            l.stage = "at";
          } else if (now >= l.until) {
            l.until = now + 2000;
            goTo(l, 0, { x: b.x, y: b.z });
          }
        }
        return;
      }
      case "chat": {
        const f = lives.get(p.at);
        if (!f || f.plan?.kind !== "chat" || f.plan.at !== l.key || f.mode !== "life") {
          p.until = now;
          return;
        }
        const d = Math.hypot(f.npc.x - n.x, f.npc.y - n.y);
        if (l.stage === "going") {
          if (d < 1.4 && f.npc.level === n.level) {
            l.stage = "at";
            l.chatAt = now + (l.key < f.key ? 500 + SOCIAL_MS.hug : CHAT_LINE_MS / 2 + SOCIAL_MS.hug);
            // (met: a hug for a close friend, a handshake or a fist bump for a friend — the first there gives it)
            const lvl = bondLevel(l.bonds.get(`n:${f.key}`));
            if (l.key < f.key && (lvl === "close" || lvl === "friend")) {
              const act = lvl === "close" ? "hug" : Math.random() < 0.5 ? "handshake" : "fistbump";
              setAct(l, act, SOCIAL_MS[act], f.npc.id);
              setAct(f, act, SOCIAL_MS[act], n.id);
            }
          } else if (now >= l.until && l.key < f.key) {
            // (one walks to the other; the other waits)
            l.until = now + 2500;
            const to = room.gridFor(0, f.npc.level).nearestOpen(f.npc.x + 0.9, f.npc.y, 1.5) ?? {
              x: f.npc.x,
              y: f.npc.y,
            };
            goTo(l, f.npc.level, to);
          }
          return;
        }
        // (at it: face each other, the chat's act — once a greeting's over —, a line each in turn)
        n.yaw = faceByte(f.npc.x - n.x, f.npc.y - n.y, n.yaw);
        if (n.act !== "chat" && now >= l.actUntil) setAct(l, "chat", 0, f.npc.id);
        if (now >= l.chatAt) {
          l.chatAt = now + CHAT_LINE_MS * (1.6 + Math.random());
          const line = lineFor(l.def, "chat", Math.random);
          if (line && nearBy(l, NEAR_TALK).length) say(l, line);
        }
        return;
      }
      default:
        return;
    }
  };
  /** A seat right by them (within a step), as a customer's. */
  const seatNear = (l: Life) => {
    const s = freeSeat(l.npc.level, l.npc.x, l.npc.y, l);
    return s && s.d < 0.8 ? s : null;
  };
  /** A street bench's half for them (as benchSeat, for any bench). */
  const benchOf = (l: Life, t: (typeof STREET)[number]) => {
    const [cx, cz] = thingAtOf(t);
    const ax = Math.cos(t.ry);
    const az = -Math.sin(t.ry);
    const fx = Math.sin(t.ry);
    const fz = Math.cos(t.ry);
    for (const u of [-0.5, 0.5]) {
      const x = cx + ax * u + fx * 0.05;
      const z = cz + az * u + fz * 0.05;
      const busy =
        humans().some((q) => q.level === 0 && Math.hypot(q.x - x, q.y - z) < 0.45) ||
        [...lives.values()].some((o) => o !== l && o.seated && Math.hypot(o.npc.x - x, o.npc.y - z) < 0.45);
      if (!busy) return { x, z, y: groundAt(x, z) + pavedAt(x, z) + BENCH_SEAT - SIT_HIP, a: Math.atan2(fz, fx) };
    }
    return null;
  };
  /** A chat ended: their bond each way, by how they got on (npc/mind.ts chatDelta). */
  const chatDone = (a: Life, b: Life, now: number) => {
    const dv = chatDeltaOf(a, b, now);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const k = `n:${y.key}`;
      const was = x.bonds.get(k) ?? null;
      x.bonds.set(k, bondAfter(was, dv, now));
      bondsDirty.add(`${x.key}|${k}`);
    }
  };
  const chatDeltaOf = (a: Life, b: Life, now: number) =>
    chatDelta(a.traits, b.traits, moodNow(a, now), moodNow(b, now), Math.random());

  /** (plan 123 F9a) Out on the land in rain or sleet: their umbrella opened (unless their hand's full — a coffee
   *  carried out); in, or dry again, put away. */
  const umbrella = (l: Life, wet: boolean, now: number) => {
    const n = l.npc;
    // (a drink given them and nothing they're at for it: finished, put down)
    if (n.held && n.held !== "umbrella" && n.held !== "plate" && !l.plan && now > l.heldUntil) n.held = "";
    // (walking home too: only once in is it put away)
    const out = wet && n.level === 0 && !l.inHome && room.gridFor(null, 0).onLand(n.x, n.y);
    if (out && !n.held) n.held = "umbrella";
    else if (!out && n.held === "umbrella") n.held = "";
  };

  // ── (plan 123) at work ──
  const enterWork = (l: Life, now: number) => {
    if (l.plan) endPlan(l);
    l.mode = "work";
    l.inHome = false;
    l.inWork = false;
    l.legs = [];
    l.until = now;
    l.workAt = now + 10_000;
    standUp(l);
  };
  const leaveWork = (l: Life, now: number) => {
    l.mode = "life";
    l.inWork = false;
    l.serving = null;
    if (l.tray) {
      l.tray = null;
      if (l.npc.held === "plate") l.npc.held = "";
    }
    // (those still in line: told it's closed — off to something else)
    for (const who of l.line) {
      const c = who.startsWith("n:") ? lives.get(who.slice(2)) : undefined;
      if (c?.plan) c.plan.until = now;
    }
    l.line = [];
    if (l.npc.act) setAct(l, "", 0);
    l.until = now;
  };
  /** (plan 123) What they say taking an order: their own lines first, else their job's, else anyone's. */
  const orderLine = (l: Life, job: Parameters<typeof biOf>[0] | undefined) =>
    l.def.lines.some((x) => x.when === "order")
      ? lineFor(l.def, "order", Math.random)
      : job
        ? biOf(job)
        : lineFor(l.def, "order", Math.random);
  /** (plan 123) Where a waiter collects a plate: before the cook at work in the same building (theirs made there),
   *  else their own spot (the kitchen's hatch). */
  const passOf = (l: Life): { at: Point; cook: Life | null } | null => {
    const k = l.place.work;
    if (!k) return null;
    for (const c of lives.values()) {
      const ck = c.place.work;
      if (c === l || !ck || ck.job !== "cook" || ck.building !== k.building || c.mode !== "work" || !c.inWork) continue;
      const f = frontOf(c);
      if (f) return { at: f, cook: c };
    }
    return { at: { x: k.x, y: k.z }, cook: null };
  };
  /** (plan 123) A waiter's rounds: the next at a table (or a player who ordered) — over to them, the order taken, to
   *  the pass, made (by the cook there, if there's one), the plate carried out and set down. False with no one
   *  waiting: they walk the floor. */
  const waitTables = (l: Life, now: number): boolean => {
    const k = l.place.work;
    const n = l.npc;
    if (!k) return false;
    let t = l.tray;
    if (!t) {
      const who = l.line.shift();
      if (!who) return false;
      l.tray = t = { who, stage: "take", until: 0, since: now };
      l.until = now;
    }
    const c = t.who.startsWith("n:") ? lives.get(t.who.slice(2)) : undefined;
    const pl = t.who.startsWith("p:") ? room.state.players.get(t.who.slice(2)) : undefined;
    // (a player: still on the place's floor, near it — walked off, they've let it go; anyone: not past a few minutes)
    const body: { x: number; y: number; level: number } | null =
      now - t.since > TRAY_MS
        ? null
        : c
          ? c.stage === "queue" && c.plan
            ? c.npc
            : null
          : pl && pl.level === k.level && Math.hypot(pl.x - k.x, pl.y - k.z) <= TABLE_REACH
            ? pl
            : null;
    if (!body) {
      // (gone off, or left: the order dropped, a plate carried back)
      l.tray = null;
      if (n.held === "plate") n.held = "";
      return false;
    }
    const near = (q: { x: number; y: number; level?: number }, r: number) =>
      n.level === (q.level ?? k.level) && Math.hypot(n.x - q.x, n.y - q.y) < r;
    // (walked over to: a fresh path now and then as they go — true, still on it)
    const toward = (q: { x: number; y: number; level?: number }): true => {
      if (now < l.until) return true;
      l.until = now + 1500;
      const g = room.gridFor(0, q.level ?? k.level);
      goTo(l, q.level ?? k.level, g.nearestOpen(q.x, q.y, 1.5) ?? { x: q.x, y: q.y });
      return true;
    };
    const id = c ? c.npc.id : t.who.slice(2);
    if (t.stage === "take") {
      if (!near(body, 2)) return toward(body);
      n.yaw = faceByte(body.x - n.x, body.y - n.y, n.yaw);
      const said = JOB_ORDER[k.job];
      say(l, orderLine(l, said));
      setAct(l, "chat", 1500, id);
      t.stage = "kitchen";
      t.until = now + 1500;
      return true;
    }
    if (t.stage === "kitchen") {
      if (now < t.until) return true;
      const pass = passOf(l);
      if (!pass) return false;
      if (!near(pass.at, 1.2)) return toward(pass.at);
      t.stage = "making";
      t.until = now + SERVE_MS;
      if (pass.cook) {
        n.yaw = faceByte(pass.cook.npc.x - n.x, pass.cook.npc.y - n.y, n.yaw);
        setAct(pass.cook, "make", SERVE_MS, n.id);
      } else setAct(l, "make", SERVE_MS, id);
      return true;
    }
    if (t.stage === "making") {
      if (now < t.until) return true;
      n.held = "plate";
      t.stage = "serve";
      l.until = now;
      return true;
    }
    // (serve) carried out to them, set down with a word
    if (!near(body, 2)) return toward(body);
    n.yaw = faceByte(body.x - n.x, body.y - n.y, n.yaw);
    setAct(l, "give", 1500, id);
    say(l, lineFor(l.def, "served", Math.random));
    n.held = "";
    if (c) c.stage = "served";
    l.tray = null;
    return true;
  };
  /** What a worker does in their shift: to their spot, then their job — the line served, their own acts between. */
  const doWork = (l: Life, dt: number, now: number) => {
    const k = l.place.work;
    const n = l.npc;
    if (!k) return;
    if (l.legs.length) {
      walk(l, dt, l.v);
      return;
    }
    if (l.finding) return;
    // (the navmesh may leave them a little off it: as near as it lets them is there)
    const at = n.level === k.level && Math.hypot(n.x - k.x, n.y - k.z) < 1.2;
    if (!l.inWork) {
      if (at) {
        l.inWork = true;
        n.x = k.x;
        n.y = k.z;
        face(n, k.a);
      } else if (now >= l.until) {
        l.until = now + 4000;
        goTo(l, k.level, { x: k.x, y: k.z });
      }
      return;
    }
    // walking the floor (a waiter, a cleaner, a guard): a spot on its storey now and then, back to their own between
    if (k.spot === "floor") {
      // (a waiter: the tables first — an order taken, to the pass, carried out)
      if (k.job === "waiter" && waitTables(l, now)) return;
      if (now >= l.workAt) {
        l.workAt = now + 10_000 + Math.random() * 15_000;
        const g = room.gridFor(0, k.level);
        const f = spaceOf(k.level);
        const to =
          f && Math.random() < 0.7
            ? g.nearestOpen(f.grid.x0 + Math.random() * f.grid.w, f.grid.y0 + Math.random() * f.grid.h, 3)
            : { x: k.x, y: k.z };
        if (to) goTo(l, k.level, to);
        if (k.job === "cleaner") setAct(l, "clean", 4000);
      }
      if (k.job !== "waiter") serveLine(l, now);
      return;
    }
    if (!at) {
      if (now >= l.until) {
        l.until = now + 4000;
        goTo(l, k.level, { x: k.x, y: k.z });
      }
      return;
    }
    if (!serveLine(l, now)) {
      face(n, k.a);
      // (their own acts, now and then: the counter wiped, the keys at the desk)
      if (now >= l.workAt) {
        l.workAt = now + 20_000 + Math.random() * 25_000;
        setAct(l, k.spot === "desk" ? "type" : "wipe", 3500);
      }
    }
  };
  /** The line at a worker: the first served — its order made a while, then handed over (a player's into their hand;
   *  an NPC's: theirs, to a seat with it). True: busy with it. */
  const serveLine = (l: Life, now: number): boolean => {
    const k = l.place.work;
    if (!k) return false;
    if (l.serving) {
      if (now < l.serving.until) return true;
      const s = l.serving;
      l.serving = null;
      const i = l.line.indexOf(s.who);
      if (i >= 0) l.line.splice(i, 1);
      handOver(l, s.who, s.item);
      return true;
    }
    const who = l.line[0];
    if (!who) return false;
    const c = who.startsWith("n:") ? lives.get(who.slice(2)) : undefined;
    const p = who.startsWith("p:") ? room.state.players.get(who.slice(2)) : undefined;
    if ((!c || c.stage !== "queue") && !p) {
      l.line.shift();
      return false;
    }
    // (a player's: what this job sells — a barista's coffee, a bartender's drink; a cook's meal, a cashier's goods
    // with nothing to carry)
    const kind = c?.plan?.kind ?? soldBy(k.job)[0] ?? "";
    const item = SERVED_ITEM[kind] ?? "";
    l.serving = { who, item, until: now + SERVE_MS };
    const ex = c ? c.npc : p;
    if (ex) l.npc.yaw = faceByte(ex.x - l.npc.x, ex.y - l.npc.y, l.npc.yaw);
    setAct(l, "make", SERVE_MS, c ? c.npc.id : who.slice(2));
    const said = JOB_ORDER[k.job];
    say(l, orderLine(l, said));
    return true;
  };
  /** Handed over: what was made, with a word. */
  const handOver = (l: Life, who: string, item: string) => {
    const c = who.startsWith("n:") ? lives.get(who.slice(2)) : undefined;
    const p = who.startsWith("p:") ? room.state.players.get(who.slice(2)) : undefined;
    // (only to one still waiting for it: a customer gone off, a player walked away or with their hands full — kept)
    const near = (q: { x: number; y: number; level: number }) =>
      q.level === l.npc.level && Math.hypot(q.x - l.npc.x, q.y - l.npc.y) <= HAND_REACH;
    const theirs = c ? c.stage === "queue" && !!c.plan : !!p && near(p) && !p.held;
    if (!theirs) return;
    setAct(l, "give", 1500, c ? c.npc.id : who.slice(2));
    say(l, lineFor(l.def, "served", Math.random));
    if (c) {
      if (item && !c.npc.held) c.npc.held = item;
      c.stage = "served";
    } else if (p && item) {
      p.held = item;
      p.heldAt = Date.now();
    }
  };

  room.npcMind = {
    needs: (key) => {
      const l = lives.get(key);
      return l ? { ...l.needs } : null;
    },
    nudge: (key, needs) => {
      const l = lives.get(key);
      if (!l) return;
      l.needs = { ...l.needs, ...needs };
      if (l.mode === "life" && l.plan) endPlan(l);
    },
    doing: (key) => {
      const l = lives.get(key);
      return l ? { mode: l.mode, kind: l.plan?.kind ?? "", at: l.plan?.at ?? "", stage: l.stage } : null;
    },
  };

  // ── (plan 123) what's done with them: the menu (F4c) ──
  const ACT_REACH = 2.2; // the menu's acts: this near (a wave across a room: 7)
  const ACT_AGAIN_MS = 1500;
  const RECENT_MS = 3 * 60_000;
  const recent = new Map<string, { act: string; at: number }[]>(); // "<npc>|<uid>"
  const aboutAt = new Map<string, number>(); // a client's last npc:about
  const bondKey = (p: Player) => `u:${p.uid}`;
  const bondWith = (l: Life, p: Player, now: number): Bond | null => {
    const b = l.bonds.get(bondKey(p));
    return b ? bondFaded(b, now) : null;
  };
  const atWorkServing = (l: Life) =>
    l.mode === "work" && l.inWork && !!l.place.work && soldBy(l.place.work.job).length > 0;
  /** What the menu offers with them now, and what the panel shows (F8b). */
  const about = (l: Life, p: Player, now: number): NpcAbout => {
    const b = bondWith(l, p, now);
    const mood = moodNow(l, now);
    const acts = actsFor(bondLevel(b), mood, {
      atWork: l.mode === "work" && l.inWork,
      serves: atWorkServing(l),
      holding: isHeld(p.held),
    }).filter((a) => a !== "order" || !p.held);
    const w = l.place.work;
    return {
      id: l.npc.id,
      name: l.def.name,
      role: l.npc.role,
      job: w?.job ?? "",
      work: w?.building ?? "",
      shift: w ? ([w.from, w.to] as [number, number]) : null,
      home: l.place.home ?? "",
      mood,
      needs: Object.fromEntries(Object.entries(l.needs).map(([k, v]) => [k, Math.round(v)])),
      want: l.npc.want,
      doing: l.mode === "work" ? "work" : l.mode === "home" ? (l.inHome ? "home" : "going-home") : (l.plan?.kind ?? ""),
      traits: { ...l.traits },
      bond: { v: b?.v ?? 0, n: b?.n ?? 0, level: bondLevel(b) },
      acts,
    };
  };
  const reachOk = (l: Life, p: Player, act: string) =>
    p.level === l.npc.level && Math.hypot(p.x - l.npc.x, p.y - l.npc.y) <= (act === "wave" ? 7 : ACT_REACH);
  room.on("npc:about", (client: WorldClient, m: { id?: unknown }) => {
    const p = room.state.players.get(client.sessionId);
    const id = typeof m?.id === "string" ? m.id : "";
    const l = id.startsWith("place:") ? lives.get(id.slice(6)) : undefined;
    if (!p || !l || p.level !== l.npc.level || Math.hypot(p.x - l.npc.x, p.y - l.npc.y) > ABOUT_REACH) return;
    // (a card's every 2 s, a menu's once: no more than a few a second)
    const now = Date.now();
    if (now - (aboutAt.get(client.sessionId) ?? 0) < 100) return;
    aboutAt.set(client.sessionId, now);
    room.send(client, "npc:about", about(l, p, now));
  });
  // (plan 123) an admin's: how a placed NPC feels about them set outright (−100…100) — to see a friend's or a close
  // friend's acts without the many it takes; logged like the hour and the weather
  room.on("mod:npcBond", (client: WorldClient, m: { id?: unknown; v?: unknown }) => {
    const p = room.state.players.get(client.sessionId);
    const id = typeof m?.id === "string" ? m.id : "";
    const l = id.startsWith("place:") ? lives.get(id.slice(6)) : undefined;
    const v = Number(m?.v);
    if (!p?.admin || !l || !Number.isFinite(v)) return;
    const now = Date.now();
    const was = l.bonds.get(bondKey(p));
    l.bonds.set(bondKey(p), { v: Math.max(-100, Math.min(100, Math.round(v))), n: Math.max(was?.n ?? 0, 3), at: now });
    bondsDirty.add(`${l.key}|${bondKey(p)}`);
    room.adminLog(p, "npcbond", null, `${l.def.name} ${Math.round(v)}`);
    room.send(client, "npc:about", about(l, p, now));
  });
  room.on("npc:act", (client: WorldClient, m: { id?: unknown; act?: unknown }) => {
    const p = room.state.players.get(client.sessionId);
    const id = typeof m?.id === "string" ? m.id : "";
    const act = typeof m?.act === "string" ? (m.act as NpcAct) : null;
    const l = id.startsWith("place:") ? lives.get(id.slice(6)) : undefined;
    if (!p || !l || !act || !(NPC_ACTS as readonly string[]).includes(act)) return;
    if (l.mode === "flee" || l.mode === "duck" || l.inHome || !reachOk(l, p, act)) return;
    const now = Date.now();
    const rk = `${l.key}|${p.uid}`;
    const mine = (recent.get(rk) ?? []).filter((r) => now - r.at < RECENT_MS);
    if (mine.length && now - mine[mine.length - 1].at < ACT_AGAIN_MS) return;
    const info = about(l, p, now);
    if (!info.acts.includes(act)) return;
    // (nothing to give, or their hand's full; already in their line: nothing done, nothing felt)
    if (act === "give" && (!isHeld(p.held) || l.npc.held)) return;
    if (act === "order" && (l.line.includes(`p:${client.sessionId}`) || l.tray?.who === `p:${client.sessionId}`))
      return;
    // (a together act: neither of them in another)
    if (isSocial(act) && act !== "wave" && (p.act || l.npc.act === "make")) return;
    const again = mine.filter((r) => r.act === act).length;
    mine.push({ act, at: now });
    recent.set(rk, mine.slice(-40));
    const was = bondWith(l, p, now);
    const mood = moodNow(l, now);
    const out0 = actOutcome(act, was, mood, l.traits, Math.random(), again);
    // (a lot at once, whatever it is, counts for less: past four in the last minutes each warms them less and less)
    const tired = Math.max(0.1, 1 - Math.max(0, mine.length - 4) * 0.15);
    const out = out0.dv > 0 ? { ...out0, dv: out0.dv * tired } : out0;
    // how they feel about you, kept (F5a); their mood lifted (or stung); company met
    l.bonds.set(bondKey(p), bondAfter(was, out.dv, now));
    bondsDirty.add(`${l.key}|${bondKey(p)}`);
    const faded = l.lift * Math.max(0, 1 - (now - l.liftAt) / LIFT_FADE_MS);
    l.lift = Math.max(-40, Math.min(40, faded + out.dv * 1.5));
    l.liftAt = now;
    l.needs = { ...l.needs, social: Math.min(100, l.needs.social + (out.ok ? 6 : 2)) };
    if (!l.seated) l.npc.yaw = faceByte(p.x - l.npc.x, p.y - l.npc.y, l.npc.yaw);
    const line = (when: string) => {
      const s = lineFor(l.def, when, Math.random, mood);
      if (s) say(l, s);
    };
    switch (act) {
      case "talk":
        line(l.answers.length ? "answer" : l.lines.length ? "ambient" : "answer");
        break;
      case "greet":
        line("greet");
        setMood(l, "wave", WAVE_MS);
        break;
      case "joke":
        line(out.ok ? "laugh" : "refuse");
        break;
      case "compliment":
        line(out.ok ? "compliment" : "refuse");
        break;
      case "ask_day":
        line("day");
        break;
      case "ask_job":
        line("job");
        break;
      case "order": {
        // in line at their counter (their next), handed it once it's made (serveLine)
        const who = `p:${client.sessionId}`;
        if (!l.line.includes(who)) l.line.push(who);
        line("order");
        break;
      }
      case "give": {
        // your drink to them, as it was (a thirsty one's thirst met with it)
        if (!isHeld(p.held) || l.npc.held) break;
        const kind = p.held;
        p.act = "give";
        p.actAt = now;
        p.actWith = l.npc.id;
        setAct(l, "take", SOCIAL_MS.give, client.sessionId);
        room.clock.setTimeout(() => {
          if (p.held !== kind) return;
          p.held = "";
          p.heldAt = 0;
          l.npc.held = kind;
          // (held a minute while they drink it, then put down — sooner if what they're at ends)
          l.heldUntil = Date.now() + 60_000;
          l.needs = { ...l.needs, thirst: Math.min(100, l.needs.thirst + 25) };
        }, SOCIAL_MS.give * 0.45);
        line("thanks");
        break;
      }
      default:
        break;
    }
    // the body's say: a laugh, a shrug, a frown — or the act together (their side of it), or a no
    if (isSocial(act) && act !== "give") {
      if (out.ok) {
        if (act !== "wave") {
          p.act = act;
          p.actAt = now;
          p.actWith = l.npc.id;
        }
        setAct(l, act === "wave" ? "wave" : answerOf(act), SOCIAL_MS[act], client.sessionId);
      } else {
        setAct(l, "refuse", 1800, client.sessionId);
        line("refuse");
      }
    } else if (act !== "give" && act !== "order")
      setAct(
        l,
        out.react === "laugh" ? "laugh" : out.react === "shrug" ? "shrug" : out.react === "frown" ? "frown" : "smile",
        2000,
        client.sessionId,
      );
    room.send(client, "npc:acted", { id: l.npc.id, act, ok: out.ok, react: out.react, bond: about(l, p, now).bond });
  });

  room.on("npc:talk", (client: WorldClient, m: { id?: unknown }) => {
    const p = room.state.players.get(client.sessionId);
    const id = typeof m?.id === "string" ? m.id : "";
    const l = id.startsWith("place:") ? lives.get(id.slice(6)) : undefined;
    if (!p || !l || !l.def.behaviour.answer || l.mode === "flee") return;
    if (p.level !== l.npc.level || Math.hypot(p.x - l.npc.x, p.y - l.npc.y) > TALK_REACH) return;
    const now = Date.now();
    if (now - (l.answeredAt.get(p.uid) ?? 0) < 3000) return;
    l.answeredAt.set(p.uid, now);
    const pool = l.answers.length ? l.answers : l.lines;
    if (!l.seated) l.npc.yaw = faceByte(p.x - l.npc.x, p.y - l.npc.y, l.npc.yaw);
    // (aloud: everyone near sees it — F7a; nothing to say, a wave)
    if (pool.length) say(l, pick(pool));
    else setMood(l, "wave", WAVE_MS);
  });

  return {
    cast(c) {
      reconcile(c);
    },
    shot(p: Player) {
      const now = Date.now();
      for (const l of lives.values()) {
        const n = l.npc;
        if (l.inHome || n.level !== p.level || Math.hypot(n.x - p.x, n.y - p.y) > SHOT_HEARD) continue;
        const how = l.def.behaviour.shots;
        if (how === "duck") {
          if (l.mode === "duck") {
            l.moodUntil = now + DUCK_MS;
            continue;
          }
          standUp(l);
          l.legs = [];
          l.mode = "duck";
          setMood(l, "duck", DUCK_MS);
          n.a = ANIM.idle;
        } else if (how === "flee" && l.mode !== "flee") {
          standUp(l);
          l.mode = "flee";
          l.legs = [];
          // (away from the shooter, as far as the floor lets them)
          const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
          const to = { x: n.x + ((n.x - p.x) / d) * FLEE_M, y: n.y + ((n.y - p.y) / d) * FLEE_M };
          const open = room.gridFor(0, n.level).nearestOpen(to.x, to.y, 6) ?? to;
          goTo(l, n.level, open);
          setMood(l, "run", 0);
          l.until = now + FLEE_BACK_MS;
        }
      }
    },
    tick(dt, now) {
      const hour = room.state.hour;
      const night = nightness(hour);
      const w = room.state.weather;
      const wet = (w.kind === "rain" || w.kind === "sleet") && w.fall > UMBRELLA_FALL;
      for (const l of lives.values()) {
        const n = l.npc;
        if (l.moodUntil && now >= l.moodUntil) {
          n.mood = "";
          l.moodUntil = 0;
          if (l.mode === "duck") l.mode = "life";
        }
        // ducking: still till it's over; fleeing: away, then back to their life after a while
        if (l.mode === "duck") continue;
        if (l.mode === "flee") {
          if (l.legs.length) walk(l, dt, RUN);
          if (!l.legs.length && !l.finding && now >= l.until) {
            l.mode = "life";
            n.mood = "";
            l.until = now;
          }
          continue;
        }
        // (plan 123) their mind, a second at a time; their body's act over; an umbrella in rain (F9a)
        if (now - l.mindAt >= MIND_MS) {
          stepMind(l, now, night);
          umbrella(l, wet, now);
        }
        if (l.actUntil && now >= l.actUntil) setAct(l, "", 0);
        // their work in their shift (F2a): there, whatever their hours say
        const shift = !!l.place.work && inShift(l.place.work, hour);
        if (shift && l.mode !== "work") enterWork(l, now);
        else if (!shift && l.mode === "work") leaveWork(l, now);
        if (l.mode === "work") doWork(l, dt, now);
        else {
          // their hours, with a home (F8; without one they don't matter, F8.2) — or a plan of their mind's there
          const away = (!!l.place.home && !onDuty(l.def.behaviour, hour, night)) || now < l.homeUntil;
          if (away && l.mode !== "home") {
            if (l.plan) endPlan(l);
            l.mode = "home";
            l.legs = [];
            l.until = now;
          } else if (!away && l.mode === "home") {
            // (time to come out: their mind's next)
            l.mode = "life";
            l.inHome = false;
            l.homeUntil = 0;
            l.plan = null;
            l.stage = "";
            standUp(l);
            l.legs = [];
            l.until = now;
          }
          if (l.mode === "home") {
            if (l.legs.length) walk(l, dt, l.v);
            else goHome(l, now);
          } else follow(l, dt, now, night);
        }
        // a line now and then with someone near (as often as they talk); a hello to someone come near
        if (now >= l.sayAt) {
          if (!l.lines.length || !Number.isFinite(l.talk)) l.sayAt = now + 60_000;
          else {
            l.sayAt = now + (40_000 + Math.random() * 40_000) * l.talk;
            if (nearBy(l, NEAR_TALK).length && !l.inHome) say(l, pick(l.lines));
          }
        }
        if (l.def.behaviour.greet && !l.inHome)
          for (const q of nearBy(l, NEAR_GREET)) {
            if (now - (l.greeted.get(q.uid) ?? 0) < GREET_AGAIN) continue;
            l.greeted.set(q.uid, now);
            if (l.greets.length) say(l, pick(l.greets));
            setMood(l, "wave", WAVE_MS);
            if (!l.seated) n.yaw = faceByte(q.x - n.x, q.y - n.y, n.yaw);
            break;
          }
      }
    },
    dispose() {
      offLaid();
      clearInterval(keeping);
      void keepBonds();
      room.npcMind = null;
      for (const l of lives.values()) room.state.npcs.delete(l.npc.id);
      lives.clear();
    },
  };
});
