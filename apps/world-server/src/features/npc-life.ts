import { ANIM, aboveOf, faceByte, objLevel, type Point, seatByte, stairsWayUp } from "@yutopia/shared";
import { layoutOf } from "@yutopia/shared/building-styles";
import { nightness } from "@yutopia/shared/dark";
import { buildingsFor, editsNow, groundAt, pavedAt, STREET } from "@yutopia/shared/grounds";
import { thingAtOf } from "@yutopia/shared/grounds-things";
import { SIT_HIP } from "@yutopia/shared/kart";
import { linesFor, type NpcDef, paceOf, TALK_EVERY } from "@yutopia/shared/npc";
import { type NpcPlaceDef, onDuty, type PlacedType, placedType, placesOf } from "@yutopia/shared/npc/places";
import { type Cast, dress, placedKeys, wire } from "../cast.ts";
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

/** A walk's leg: points on one floor (the next leg starts on another, through a town building's door). */
interface Leg {
  level: number;
  pts: Point[];
}
type Mode = "life" | "home" | "duck" | "flee";

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
}

registerFeature((room: WorldRoom) => {
  const lives = new Map<string, Life>();
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
    void plan(l.npc.level, from, level, to)
      .then((legs) => {
        if (!lives.has(l.key) || lives.get(l.key) !== l) return;
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
    l.def = d;
    l.place = place;
    l.type = placedType(d, place);
    l.v = V * paceOf(d);
    l.lines = linesFor(d, "ambient");
    l.greets = linesFor(d, "greet");
    l.answers = linesFor(d, "answer");
    l.talk = TALK_EVERY[d.behaviour.talk];
    if (moved) {
      // (put somewhere else in God mode: there now, their walk forgotten)
      Object.assign(l.npc, { x: place.x, y: place.z, z: 0, level: place.level, a: ANIM.idle });
      face(l.npc, place.a);
      l.legs = [];
      l.mode = "life";
      l.inHome = false;
      l.seated = false;
      l.stop = 0;
      l.dir = 1;
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
  const standUp = (l: Life) => {
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
        // their hours, with a home (F8); without one they don't matter (F8.2)
        const away = !!l.place.home && !onDuty(l.def.behaviour, hour, night);
        if (away && l.mode !== "home") {
          l.mode = "home";
          l.legs = [];
          l.until = now;
        } else if (!away && l.mode === "home") {
          // (time to come out: back to their place)
          l.mode = "life";
          l.inHome = false;
          standUp(l);
          l.legs = [];
          l.until = now;
          goTo(l, l.place.level, { x: l.place.x, y: l.place.z });
        }
        if (l.mode === "home") {
          if (l.legs.length) walk(l, dt, l.v);
          else goHome(l, now);
        } else live(l, dt, now);
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
      for (const l of lives.values()) room.state.npcs.delete(l.npc.id);
      lives.clear();
    },
  };
});
