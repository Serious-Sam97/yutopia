import { StateView } from "@colyseus/schema";
import type { ServerMessages } from "@yutopia/shared";
import { capsuleOf, rayCapsule } from "@yutopia/shared/animals/body";
import {
  ANIMAL_SEED,
  type AnimalPlaceDef,
  CELL,
  cellGroups,
  cellOf,
  type GroupSpec,
  landGroups,
  placeOfGroup,
  SWIM_DEPTH,
} from "@yutopia/shared/animals/habitat";
import { dayNests, dayNestsIn, dayOf as nestDayOf, NEST_CELL, nestCount } from "@yutopia/shared/dark/nests";
import {
  awayFrom,
  type Ctx,
  type Doing,
  doingNo,
  fed,
  freshNeeds,
  type Intention,
  isFriend,
  type Needs,
  paceNo,
  type Pace,
  type Seen,
  speedOf,
  stepNeeds,
  think,
  type Trust,
  awakeAt,
} from "@yutopia/shared/animals/mind";
import { type DayPlaces, dayPlaces } from "@yutopia/shared/animals/places";
import { ALARM_HEARD, CALL_HEARD, CALL_NEAR, callsNow, noiseOf, traitsOf } from "@yutopia/shared/animals/traits";
import {
  ANIMALS,
  type AnimalKind,
  befriendable,
  CRATE_FOODS,
  CRATE_REACH,
  FEED_CRATES,
  takes,
  YOUNG,
} from "@yutopia/shared/animals/species";
import { dayOf, nightness, type Ray, rayDir } from "@yutopia/shared/dark";
import { editsNow, heightAt, TOWN, treeDensity, walkableCell, waterAt, wayClearance } from "@yutopia/shared/grounds";
import { ApiError, api, type SavedTrust } from "../api.ts";
import { config } from "../config.ts";
import { onEditsLaid, ready, squareReady } from "../land.ts";
import { Animal } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The animals (docs/plan/126-animal-life.md, phase 4, F4b): every one out on the land the server's — made by the
// land's cells round whoever's outdoors (shared animals/habitat.ts: by habitat, seeded, the same for all; God mode's
// places and the farm's pens over it), each with a light mind (shared animals/mind.ts) stepped often near people and
// seldom away from them, walking the land's height (as the pets), flying, swimming. They flee people who come too
// close and come to food held out, predators come for strangers in their territory (F5c), shots hurt them (F6c),
// they're skinned, fed, befriended, milked, ridden. Each client sees those near it only (client.view).

/** The cells made a tick, at most this long (ms). */
const CELL_MS = 4;
/** How far round a person outdoors the land's cells are kept alive (cells). */
const RING = 2;
/** A cell no one's been near this long is let go (its animals gone till someone comes again). */
const CELL_IDLE_MS = 3 * 60_000;
/** Seen by a client within this (m). */
const SEEN = 160;
/** The least time between two bites on one person, by anything (ms). */
const BITE_GAP = 1200;
/** Stepped every tick within this of a person (m); twice a second beyond. */
const NEAR = 120;
/** Each animal thinks this often (s), give or take. */
const THINK_S = 0.9;
/** A body left lying (skinned or not) this long, then gone (ms). */
const BODY_MS = 6 * 60_000;
/** Shot dead or skinned, it's back (a new one in its place) after this (ms). */
const RESPAWN_MS = 25 * 60_000;
/** Reach for a hand: to feed, skin, collect, mount (m). */
const REACH = 2.6;
/** A shot heard this far scares them (m). */
const SHOT_HEARD = 90;
/** How steep a walker takes (rise a metre). */
const STEEP = 1.1;
/** An animal's id as the API keeps it (AnimalTrustController::ID): one it can't keep isn't sent (a bad row refuses
 *  the whole batch, every 30 s, for everyone). */
const TRUST_ID = /^[A-Za-z0-9:_#.-]{1,64}$/;

interface Run {
  wire: Animal;
  kind: AnimalKind;
  group: GroupSpec;
  /** its number in its group (0 the lead) */
  i: number;
  x: number;
  z: number;
  /** its height over the ground (in the air, up a tree) */
  h: number;
  yaw: number;
  hp: number;
  young: boolean;
  needs: Needs;
  doing: Doing;
  pace: Pace;
  since: number; // s, in this doing
  thinkIn: number; // s
  to?: { x: number; z: number };
  target?: string;
  /** a strike's next (ms) */
  strikeAt: number;
  /** dead since (ms); 0 alive */
  deadAt: number;
  skinned: boolean;
  /** the farm's: eggs, milk, wool given on this day */
  gaveDay: number;
  /** its friend (befriended): their user id */
  friend: number;
  /** stuck going somewhere: tries round */
  stuck: number;
  // ── plan 128 ──
  /** there (its `to`): the mind chooses again */
  arrived: boolean;
  /** what it's on about (its last intention's) */
  why: string;
  /** its place round its pack's prey (a hunt: 0 drives) */
  flank: number;
  /** its way to `to` on the navmesh (a long trip a straight line can't make), the next first */
  path: { x: number; z: number }[];
  /** the `to` its path is for */
  pathTo: { x: number; z: number } | null;
  /** what it's noticed (an id: how sure, 0..1), how far each was last time (closing) */
  aware: Map<string, number>;
  dists: Map<string, number>;
  /** its last think (ms) */
  thoughtAt: number;
  /** its call's next (ms) */
  callAt: number;
  /** near people this tick: its body met by the world's solids (Jolt), people pushing past it (plan 129) */
  solid: boolean;
}

/** A group's day and what it remembers (plan 128): its places, places it keeps away from, how used it is to people,
 *  its last alarm. */
interface Herd {
  places: DayPlaces | null;
  /** 0 … 0.5: people passing without harm, day after day */
  habit: number;
  alarmAt: number;
}
/** How far an alarm's heard by the others (and the threat it points at), how long it stands (ms). */
const ALARM_MS = 6000;
/** A shot, a kill: kept away from this long (ms: a day), this far round (m). */
const MEMORY_MS = 24 * 3600_000;
const MEMORY_R = 90;


/** What the server keeps of each person for the animals: where they were a moment ago (their speed). */
interface Seer {
  x: number;
  y: number;
  v: number;
  at: number;
}

export interface AnimalHooks {
  /** a ray (the land's frame: x, y on the floor, z up) through them: the nearest within `range`, hurt by `damage` */
  shoot(
    ray: Ray,
    range: number,
    damage: (t: number, head: boolean) => number,
    by: string,
    now: number,
  ): { id: string; kind: "hurt" | "killed"; head: boolean; x: number; y: number; z: number; t: number } | null;
  /** (tests) the live animals */
  all(): Run[];
  /** (plan 126 F8a) those near (x, y) on the land: what they are, where, what they're doing (pets chase them) */
  near(x: number, y: number, r: number): { id: string; kind: AnimalKind; x: number; y: number; doing: Doing }[];
  /** (tests) cells made now round (x, y) */
  wake(x: number, y: number, now: number): void;
}

registerFeature((room: WorldRoom) => {
  const runs = new Map<string, Run>();
  // (plan 128) each group's day; what each group remembers (kept past its cell: a day); alarms just called
  const herds = new Map<string, Herd>();
  const memory = new Map<string, { x: number; z: number; r: number; until: number }[]>();
  const alarms: { x: number; z: number; fx: number; fz: number; r: number; at: number; by: string }[] = [];
  /** long trips waiting for a way on the navmesh (one asked at a time) */
  const pathQ: Run[] = [];
  let pathBusy = false;
  let pathFor: Run | null = null;
  /** admins watching the minds (the dev overlay) */
  const debugFor = new Set<string>();
  let debugAt = 0;
  const cells = new Map<string, { cx: number; cz: number; seenAt: number; ids: string[] }>();
  /** a group member's id → when it may come back (shot, skinned, befriended away) */
  const gone = new Map<string, number>();
  /** the farm's given today (eggs, milk, wool) by id: kept past its cell (a cell made again isn't a second egg) */
  const gave = new Map<string, number>();
  /** kept past its cell (a horse ridden, a friend with its friend): id → last seen so */
  const strays = new Map<string, number>();
  const seers = new Map<string, Seer>();
  /** shots heard lately: where, when */
  const shots: { x: number; y: number; at: number }[] = [];
  /** befriended animals (by its id): whose friend, its name — given to it whenever the land makes it */
  const friendOf = new Map<string, { uid: number; name: string }>();
  /** trust: user id → animal id → Trust (phase 9; kept by the API) */
  const trusts = new Map<number, Map<string, Trust>>();
  /** trust changed, to keep: "uid|id" → the row */
  const dirty = new Map<string, SavedTrust & { user: number }>();
  let keptAt = 0;
  const keepTrust = (uid: number, id: string, kind: AnimalKind, t: Trust, friend: boolean, name = "") => {
    if (!uid || !TRUST_ID.test(id)) return;
    const r = runs.get(id);
    dirty.set(`${uid}|${id}`, { user: uid, id, kind, v: t.v, day: t.day, friend, name: name || r?.wire.name || "" });
  };
  const flushTrust = () => {
    if (config.offline || !dirty.size) return;
    const rows = [...dirty.values()].slice(0, 500);
    for (const r of rows) dirty.delete(`${r.user}|${r.id}`);
    void api.putAnimalTrust(rows).catch((e) => {
      // (kept for the next try — but not a refusal: the same rows would be refused for ever)
      if (!(e instanceof ApiError && e.status >= 400 && e.status < 500))
        for (const r of rows) if (!dirty.has(`${r.user}|${r.id}`)) dirty.set(`${r.user}|${r.id}`, r);
      console.warn("[animals] trust not kept:", e instanceof Error ? e.message : e);
    });
  };
  let cellsAt = 0;
  /** cells to make, nearest first */
  const wanted: { k: string; cx: number; cz: number; d: number }[] = [];
  let viewsAt = 0;
  let clock = 0;

  const offEdits = onEditsLaid(() => {
    // the cells made again (their groups as the edits have them now)
    for (const k of [...cells.keys()]) dropCell(k);
  });

  // ── where an animal can be ────────────────────────────────────────────────────────────────────────────────────
  const deepAt = (x: number, z: number) => (waterAt(x, z)?.depth ?? 0) >= SWIM_DEPTH;
  const groundOk = (x: number, z: number) => {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    try {
      return walkableCell(tx, tz);
    } catch {
      return false;
    }
  };
  /** Can `kind` stand (or swim) at (x, z)? */
  const canBe = (kind: AnimalKind, x: number, z: number): boolean => {
    const d = ANIMALS[kind];
    if (deepAt(x, z)) return !!d.swims;
    return groundOk(x, z);
  };
  /** How far (x, z) is out of its pen (m), 0 in it. */
  const penOff = (p: NonNullable<GroupSpec["pen"]>, x: number, z: number) =>
    Math.hypot(Math.max(p.x0 + 0.4 - x, 0, x - (p.x1 - 0.4)), Math.max(p.z0 + 0.4 - z, 0, z - (p.z1 - 0.4)));
  const canStep = (r: Run, x: number, z: number): boolean => {
    if (r.h > 0.5 && ANIMALS[r.kind].flies) return true;
    if (r.group.pen) {
      // (in it; or out of it — a horse let go after a ride — on its way back)
      const off = penOff(r.group.pen, x, z);
      if (off > 0 && off >= penOff(r.group.pen, r.x, r.z)) return false;
    }
    if (!canBe(r.kind, x, z)) return false;
    if (deepAt(x, z)) return true;
    // (not up a cliff: a walker takes what a person could)
    const rise = Math.abs(heightAt(x, z) - heightAt(r.x, r.z));
    if (rise / Math.max(0.05, Math.hypot(x - r.x, z - r.z)) >= STEEP) return false;
    // (plan 129 F5: near people, its body against the world's solids — a wall, a building, a fence, a rock: Jolt's
    // word, the ground floor's grid; a bird up in the air, a climber up a tree past it). A step longer than its body
    // is tried halfway too (no running through a fence between ticks); one already in a solid — spawned in a parked
    // car, a rock — walks out of it rather than standing frozen.
    if (r.solid && r.h < 0.5) {
      try {
        const grid = room.gridFor(0, 0);
        const br = bodyR(r);
        const bh = bodyH(r);
        const long = Math.hypot(x - r.x, z - r.z) > br;
        if (!grid.fits(x, z, br, bh) || (long && !grid.fits((x + r.x) / 2, (z + r.z) / 2, br, bh)))
          return !grid.fits(r.x, r.z, br, bh);
      } catch {}
    }
    return true;
  };

  // ── the cells round people ────────────────────────────────────────────────────────────────────────────────────
  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
  function makeCell(cx: number, cz: number, now: number) {
    const ids: string[] = [];
    // (offline — the tests' rooms —: only what's placed and the farm's, no wildlife wandering into other tests' shots)
    // (the land's own, as God mode left them — taken away, moved, changed: plan 127 —, and those placed)
    const groups = cellGroups(editsNow(), cx, cz, canBe, !config.offline);
    for (const g of groups) {
      for (let i = 0; i < g.n + g.young; i++) {
        const id = `${g.id}#${i}`;
        const back = gone.get(id);
        if (back && back > now) continue;
        if (runs.has(id)) {
          // (one kept past its cell — ridden, with its friend —: the cell's again)
          if (strays.delete(id)) ids.push(id);
          continue;
        }
        const young = i >= g.n;
        const r = spawn(id, g, i, young);
        if (r) ids.push(id);
      }
    }
    cells.set(cellKey(cx, cz), { cx, cz, seenAt: now, ids });
  }
  function dropCell(k: string) {
    const c = cells.get(k);
    if (!c) return;
    for (const id of c.ids) {
      const r = runs.get(id);
      // (a horse ridden stays under its rider; a befriended one by its friend stays with them — following or sat by
      // them: kept till it's neither a while)
      if (r && kept(r)) {
        strays.set(id, Date.now());
        continue;
      }
      remove(id);
    }
    cells.delete(k);
    // (its groups' days let go — made again when they are; what they remember is kept)
    const left = new Set([...runs.values()].map((r) => r.group.id));
    for (const g of [...herds.keys()]) if (!left.has(g)) herds.delete(g);
    if (memory.size > 4000) for (const [g, l] of [...memory]) if (l.every((m) => m.until < Date.now())) memory.delete(g);
  }
  function spawn(id: string, g: GroupSpec, i: number, young: boolean): Run | null {
    const d = ANIMALS[g.species];
    // round its home, a little apart from the others
    let x = g.x;
    let z = g.z;
    const spread = g.pen ? 0 : 2 + d.len * 2.5;
    for (let tries = 0; tries < 8; tries++) {
      const a = hashUnit(id, tries) * Math.PI * 2;
      const rr = g.pen ? 0 : spread * Math.sqrt(hashUnit(id, tries + 17));
      const px = g.pen ? g.pen.x0 + 1 + hashUnit(id, tries) * (g.pen.x1 - g.pen.x0 - 2) : g.x + Math.cos(a) * rr;
      const pz = g.pen ? g.pen.z0 + 1 + hashUnit(id, tries + 5) * (g.pen.z1 - g.pen.z0 - 2) : g.z + Math.sin(a) * rr;
      if (canBe(g.species, px, pz)) {
        x = px;
        z = pz;
        break;
      }
    }
    if (!canBe(g.species, x, z)) return null;
    const wire = new Animal();
    wire.id = id;
    wire.k = g.species;
    wire.x = x;
    wire.y = z;
    wire.young = young;
    wire.v = Math.floor(hashUnit(id, 99) * 4);
    const r: Run = {
      wire,
      kind: g.species,
      group: g,
      i,
      x,
      z,
      h: 0,
      yaw: hashUnit(id, 7) * Math.PI * 2,
      hp: d.hp * (young ? 0.5 : 1),
      young,
      needs: { ...freshNeeds(), hunger: hashUnit(id, 3) * 0.6 },
      doing: "idle",
      pace: "still",
      since: 0,
      thinkIn: hashUnit(id, 11) * THINK_S,
      strikeAt: 0,
      deadAt: 0,
      skinned: false,
      gaveDay: gave.get(id) ?? -1,
      friend: 0,
      stuck: 0,
      arrived: true,
      why: "",
      flank: 0,
      path: [],
      pathTo: null,
      aware: new Map(),
      dists: new Map(),
      thoughtAt: 0,
      callAt: Date.now() + hashUnit(id, 21) * 120_000,
      solid: false,
    };
    const fr = friendOf.get(id);
    if (fr && befriendable(r.kind, r.young)) {
      r.friend = fr.uid;
      wire.n |= 4;
      wire.name = fr.name || ANIMALS[r.kind].label[0];
    }
    runs.set(id, r);
    room.state.animals.set(id, wire);
    return r;
  }
  function remove(id: string) {
    const r = runs.get(id);
    if (!r) return;
    for (const c of room.clients as WorldClient[]) if (c.view?.has(r.wire)) c.view.remove(r.wire);
    room.state.animals.delete(id);
    runs.delete(id);
    strays.delete(id);
  }
  /** With its friend now (out on the land, near)? */
  function withFriend(r: Run): boolean {
    if (!r.friend || r.deadAt) return false;
    for (const p of room.state.players.values())
      if (p.uid === r.friend && p.level === 0 && Math.abs(p.x - r.x) < SEEN && Math.abs(p.y - r.z) < SEEN) return true;
    return false;
  }
  /** Kept past its cell: ridden, or with its friend. */
  const kept = (r: Run) => (!r.deadAt && r.doing === "ridden") || withFriend(r);

  function hashUnit(s: string, k: number): number {
    let h = 2166136261 ^ k;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  // ── people, as the animals see them ───────────────────────────────────────────────────────────────────────────
  const outdoors = () => [...room.state.players.values()].filter((p) => p.level === 0 && !p.bot);
  const trustOf = (uid: number, id: string) => trusts.get(uid)?.get(id);
  function handOf(sid: string): string | undefined {
    const inv = room.survival?.inventory(sid);
    return inv?.hand?.id;
  }

  /** Can it see from where it is to (x, z) — over the land, through the trees (plan 128 F6a)? */
  function sightLine(r: Run, x: number, z: number, eyeTo: number): boolean {
    const d = ANIMALS[r.kind];
    const len = Math.hypot(x - r.x, z - r.z);
    if (len < 12) return true;
    const a = heightAt(r.x, r.z) + r.h + d.height * 0.9;
    const b = heightAt(x, z) + eyeTo;
    const n = Math.min(12, Math.floor(len / 5));
    let thick = 0;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = r.x + (x - r.x) * t;
      const pz = r.z + (z - r.z) * t;
      // (a rise between: the land in the way)
      if (heightAt(px, pz) > a + (b - a) * t + 0.3) return false;
      // (the trees: a few trunks thin it, a wood's depth hides you)
      if (r.h < 3) thick += Math.max(0, treeDensity(px, pz) - 0.35) * 0.45;
      if (thick >= 1) return false;
    }
    return true;
  }
  /** What a person is to it now (plan 128 F6a): seen — in its sight's cone, in light enough, nothing in the way —,
   *  heard — by how they move —, or neither; how sure it's getting (it builds while it sees or hears them, and fades),
   *  how fast they're coming. */
  function sense(r: Run, p: { sid: string; x: number; y: number; mv: number; torch: boolean }, v: number, now: number) {
    const d = ANIMALS[r.kind];
    const t = traitsOf(r.kind, r.young);
    const dd = Math.hypot(p.x - r.x, p.y - r.z);
    const night = nightness(room.state.hour);
    const low = (p.mv & 8) !== 0;
    // (in the dark it sees half as far — a lit torch is seen from all of it)
    const sightR = p.torch ? d.sight * 1.3 : d.sight * (1 - 0.5 * night);
    const toward = Math.atan2(p.y - r.z, p.x - r.x);
    const off = Math.abs(angleDiff(r.yaw, toward));
    const inCone = off <= ((t.cone / 2) * Math.PI) / 180;
    const sees = dd < sightR && inCone && sightLine(r, p.x, p.y, low ? 0.8 : 1.5);
    const hears = dd < noiseOf(v, low) * t.hearing;
    const since = r.thoughtAt ? Math.min(3, (now - r.thoughtAt) / 1000) : 1;
    const was = r.aware.get(p.sid) ?? 0;
    let aware = sees ? Math.min(1, was + since * (dd < sightR * 0.4 ? 1.6 : 0.8)) : hears ? Math.min(0.75, was + since * 0.6) : Math.max(0, was - since * 0.15);
    if (dd < 4) aware = 1;
    r.aware.set(p.sid, aware);
    const before = r.dists.get(p.sid);
    r.dists.set(p.sid, dd);
    const closing = before === undefined ? 0 : (before - dd) / Math.max(0.2, since);
    return { aware, heard: !sees && hears, closing };
  }

  function seenBy(r: Run, now: number): Seen[] {
    const d = ANIMALS[r.kind];
    const t = traitsOf(r.kind, r.young);
    const range = Math.max(d.sight * 1.3, d.danger?.warn ?? 0, 45 * t.hearing, 30);
    const out: Seen[] = [];
    const here = new Set<string>();
    for (const p of room.state.players.values()) {
      if (p.level !== 0 || p.hp <= 0 || p.downAt) continue;
      const dx = p.x - r.x;
      const dy = p.y - r.z;
      if (dx * dx + dy * dy > range * range) continue;
      const s = seers.get(p.sid);
      const v = s?.v ?? 0;
      const sn = sense(r, p, v, now);
      here.add(p.sid);
      out.push({
        id: p.sid,
        kind: "person",
        x: p.x,
        z: p.y,
        v,
        low: (p.mv & 8) !== 0,
        holds: handOf(p.sid),
        torch: p.torch,
        trust: trustOf(p.uid, r.wire.id)?.v ?? 0,
        aware: sn.aware,
        heard: sn.heard,
        closing: sn.closing,
      });
    }
    // (those gone out of range: forgotten)
    for (const k of [...r.aware.keys()]) if (!here.has(k)) {
      r.aware.delete(k);
      r.dists.delete(k);
    }
    // an alarm called near it (a snort, a crow's call): the threat it points at (prey only — a wolf isn't warned off)
    if (!d.danger)
      for (const a of alarms)
        if (a.by !== r.wire.id && now - a.at < ALARM_MS && Math.hypot(a.x - r.x, a.z - r.z) < a.r)
          out.push({ id: `alarm:${a.by}`, kind: "alarm", x: a.fx, z: a.fz, v: 0, aware: 0.8 });
    // a kill, a body lying: a scavenger's (F8a) — something bigger at it?
    if (t.scavenger) {
      const reach = d.flies ? 250 : 150;
      for (const o of runs.values()) {
        if (!o.deadAt || o === r) continue;
        const q = Math.hypot(o.x - r.x, o.z - r.z);
        if (q > reach) continue;
        let guarded = false;
        for (const e of runs.values())
          if (e !== r && !e.deadAt && ANIMALS[e.kind].danger && Math.hypot(e.x - o.x, e.z - o.z) < 6) {
            guarded = true;
            break;
          }
        out.push({ id: o.wire.id, kind: "carcass", x: o.x, z: o.z, v: 0, guarded });
      }
    }
    for (const v of room.state.vehicles.values()) {
      const dx = v.x - r.x;
      const dz = v.z - r.z;
      if (dx * dx + dz * dz > 60 * 60) continue;
      if (Math.abs(v.v) < 1) continue;
      out.push({ id: v.id, kind: "car", x: v.x, z: v.z, v: Math.abs(v.v) });
    }
    for (const s of shots) {
      if (now - s.at > 3000) continue;
      if (Math.hypot(s.x - r.x, s.y - r.z) < SHOT_HEARD) out.push({ id: "shot", kind: "shot", x: s.x, z: s.y, v: 0 });
    }
    // the others: its prey, its predators (within its sight)
    const prey = d.prey;
    for (const o of runs.values()) {
      if (o === r || o.deadAt) continue;
      const od = ANIMALS[o.kind];
      const isPrey = !!prey?.includes(o.kind);
      const isPredator = !!od.prey?.includes(r.kind);
      if (!isPrey && !isPredator) continue;
      const dx = o.x - r.x;
      const dz = o.z - r.z;
      if (dx * dx + dz * dz > d.sight * d.sight) continue;
      out.push({ id: o.wire.id, kind: "animal", species: o.kind, x: o.x, z: o.z, v: 0, weak: o.hp < od.hp * 0.3 });
    }
    // pets out on the land: a dog after a squirrel, the deer wary of it (F8a)
    for (const pet of room.state.pets.values()) {
      if (pet.floor !== 0) continue;
      const dx = pet.x - r.x;
      const dz = pet.y - r.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      out.push({ id: `pet:${pet.id}`, kind: "pet", x: pet.x, z: pet.y, v: 2 });
    }
    return out;
  }

  // ── a step of one animal ──────────────────────────────────────────────────────────────────────────────────────
  function lead(r: Run): Run | undefined {
    if (r.i === 0 || r.friend) return undefined;
    const l = runs.get(`${r.group.id}#0`);
    return l && !l.deadAt ? l : undefined;
  }
  function youngNear(r: Run): boolean {
    if (r.young) return false;
    for (let i = r.group.n; i < r.group.n + r.group.young; i++) {
      const y = runs.get(`${r.group.id}#${i}`);
      if (y && !y.deadAt && Math.hypot(y.x - r.x, y.z - r.z) < 15) return true;
    }
    return false;
  }
  function targetPos(id: string | undefined): { x: number; z: number } | null {
    if (!id) return null;
    const p = room.state.players.get(id);
    if (p) return { x: p.x, z: p.y };
    const o = runs.get(id);
    if (o) return { x: o.x, z: o.z };
    return null;
  }

  // ── its group's day, what it remembers, how used it is to people (plan 128) ─────────────────────────────────────
  function herdOf(r: Run): Herd {
    let h = herds.get(r.group.id);
    if (!h) {
      const g = r.group;
      // (its places on the land round home: where the land isn't made yet, taken as standable — the way finds out)
      const places = g.pen
        ? null
        : dayPlaces({ id: g.id, species: g.species, x: g.x, z: g.z, den: g.from === "placed" && g.territory > 0 }, (k, x, z) =>
            ready(x, z) ? canBe(k, x, z) : null,
          );
      h = { places, habit: 0, alarmAt: 0 };
      herds.set(g.id, h);
    }
    return h;
  }
  function remember(gid: string, x: number, z: number, now: number) {
    const l = (memory.get(gid) ?? []).filter((m) => m.until > now && Math.hypot(m.x - x, m.z - z) > 20);
    l.push({ x, z, r: MEMORY_R, until: now + MEMORY_MS });
    memory.set(gid, l.slice(-6));
    // (a shot, a kill: whatever it had got used to, gone)
    const h = herds.get(gid);
    if (h) h.habit = 0;
  }
  /** How used it is to people here: a path, the town (half), and its group's own habit. */
  function habitOf(r: Run, h: Herd): number {
    let place = 0;
    try {
      if (wayClearance(r.x, r.z) < 12) place = 0.3;
    } catch {}
    if (r.x >= TOWN.x0 && r.x <= TOWN.x1 && r.z >= TOWN.z0 && r.z <= TOWN.z1) place = 0.5;
    return Math.min(1, place + h.habit);
  }
  /** The herd's watcher now: one of the others in turn (a grazing herd of three or more that keeps one). */
  function lookoutOf(g: GroupSpec, now: number): number {
    if (g.n < 3 || !traitsOf(g.species).lookout) return -1;
    return 1 + (Math.floor(now / 40_000) % (g.n - 1));
  }
  const member = (g: GroupSpec, i: number) => {
    const m = runs.get(`${g.id}#${i}`);
    return m && !m.deadAt ? m : undefined;
  };
  /** Its call: due now (its species' hours, its own time); a chorus's others a moment after the lead. */
  function callDue(r: Run, now: number): boolean {
    const c = traitsOf(r.kind).calls;
    if (!c || r.young || now < r.callAt || !callsNow(r.kind, room.state.hour)) return false;
    // (one of a group calls — the lead —; in a chorus the rest join it)
    if (r.i > 0 && !c.chorus) {
      r.callAt = now + 60_000;
      return false;
    }
    r.callAt = now + (c.every[0] + hashUnit(r.wire.id, Math.floor(now / 1000)) * (c.every[1] - c.every[0])) * 1000;
    if (r.i === 0 && c.chorus)
      for (let i = 1; i < r.group.n; i++) {
        const m = member(r.group, i);
        if (m) m.callAt = Math.min(m.callAt, now + 400 + hashUnit(m.wire.id, i) * 2600);
      }
    return true;
  }
  /** Heard far off: a call, an alarm — to those near enough (their own speakers place it). */
  function sound(r: Run, c: "call" | "alarm") {
    const far = c === "alarm" ? ALARM_HEARD : (CALL_HEARD[r.kind] ?? CALL_NEAR);
    for (const cl of room.clients as WorldClient[]) {
      const p = room.state.players.get(cl.sessionId);
      if (!p || p.level !== 0 || Math.hypot(p.x - r.x, p.y - r.z) > far) continue;
      room.send(cl, "animal:call", { id: r.wire.id, k: r.kind, x: r.x, y: r.z, c });
    }
  }
  /** A straight way to `to` it can walk (a look every 6 m: its ground, no cliff, no deep water for a walker)? */
  function straight(r: Run, to: { x: number; z: number }): boolean {
    const len = Math.hypot(to.x - r.x, to.z - r.z);
    const n = Math.min(60, Math.ceil(len / 6));
    let px = r.x;
    let pz = r.z;
    for (let i = 1; i <= n; i++) {
      const x = r.x + ((to.x - r.x) * i) / n;
      const z = r.z + ((to.z - r.z) * i) / n;
      // (land not made yet: assumed fine — the steering finds out)
      if (ready(x, z)) {
        if (!canBe(r.kind, x, z)) return false;
        if (!deepAt(x, z) && Math.abs(heightAt(x, z) - heightAt(px, pz)) / Math.max(0.05, Math.hypot(x - px, z - pz)) > STEEP) return false;
      }
      px = x;
      pz = z;
    }
    return true;
  }
  /** A long trip a straight line can't make: a way on the navmesh, asked (one at a time; meanwhile it steers). */
  function askWay(r: Run) {
    if (pathQ.includes(r) || pathQ.length > 24) return;
    pathQ.push(r);
    if (!pathBusy) void nextWay();
  }
  async function nextWay() {
    const r = pathQ.shift();
    if (!r) {
      pathBusy = false;
      return;
    }
    pathBusy = true;
    pathFor = r;
    const to = r.to;
    try {
      if (to && runs.get(r.wire.id) === r && !r.deadAt) {
        const pts = await room.nav.pathSoon(0, { x: r.x, y: r.z }, { x: to.x, y: to.z });
        // (still going there: its way)
        if (pts && pts.length > 1 && r.to && Math.hypot(r.to.x - to.x, r.to.z - to.z) < 1) {
          r.path = pts.slice(1).map((q) => ({ x: q.x, z: q.y }));
          r.pathTo = { ...to };
        }
      }
    } catch (e) {
      console.warn("[animals] a way:", e instanceof Error ? e.message : e);
    }
    // (one every two seconds at most: the windows they make are the tick's thread's)
    pathFor = null;
    setTimeout(() => void nextWay(), 2000);
  }

  function decide(r: Run, now: number) {
    const night = nightness(room.state.hour);
    const w = room.state.weather;
    const storm = w.kind === "blizzard" || w.kind === "storm" ? Math.max(0.7, w.fall) : w.fall > 0.8 ? 0.5 : 0;
    const l = lead(r);
    const friendSid = r.friend
      ? [...room.state.players.values()].find((p) => p.uid === r.friend)?.sid
      : undefined;
    const h = herdOf(r);
    const g = r.group;
    const ahead = r.i > 0 && r.i < g.n ? member(g, r.i - 1) : undefined;
    const mom = r.young && g.n > 0 ? member(g, (r.i - g.n) % g.n) : undefined;
    const avoid = (memory.get(g.id) ?? []).filter((m) => m.until > now);
    const seen = seenBy(r, now);
    // (heard a shot near: the spot remembered — kept away from for a day; F7a)
    for (const sh of shots) if (sh.at > r.thoughtAt && now - sh.at < 4000 && Math.hypot(sh.x - r.x, sh.y - r.z) < 70) remember(g.id, sh.x, sh.y, now);
    // (people about and nothing came of it: a little more used to them; nobody, a little less)
    const calmPeople = seen.some((q) => q.kind === "person" && (q.aware ?? 0) > 0.5 && Math.hypot(q.x - r.x, q.z - r.z) < ANIMALS[r.kind].flee * 2.2);
    if (r.i === 0) h.habit = Math.max(0, Math.min(0.5, h.habit + (calmPeople && r.needs.fear < 0.3 ? 0.0005 : -0.0001)));
    const ctx: Ctx = {
      kind: r.kind,
      young: r.young,
      hour: room.state.hour,
      night,
      storm,
      x: r.x,
      z: r.z,
      home: { x: r.group.x, z: r.group.z },
      territory: r.group.territory,
      pen: r.group.pen,
      hurt: r.hp < ANIMALS[r.kind].hp * 0.33,
      lead: l ? { x: l.x, z: l.z, doing: l.doing, pace: l.pace, target: l.target } : undefined,
      youngNear: youngNear(r),
      inWater: deepAt(r.x, r.z),
      friend: friendSid,
      seen,
      needs: r.needs,
      doing: r.doing,
      for: r.since,
      roll: hashUnit(r.wire.id, Math.floor(clock * 3)),
      places: h.places,
      goal: r.to ?? null,
      arrived: r.arrived,
      index: r.i,
      ahead: ahead ? { x: ahead.x, z: ahead.z } : null,
      mother: mom ? { x: mom.x, z: mom.z, doing: mom.doing } : null,
      lookout: lookoutOf(g, now) === r.i,
      avoid,
      habit: habitOf(r, h),
      // (a bird's call is only its voice — it calls from where it sits, flying, feeding)
      callDue: !ANIMALS[r.kind].flies && callDue(r, now),
    };
    if (ANIMALS[r.kind].flies && callDue(r, now) && awakeAt(r.kind, room.state.hour) > 0.2) sound(r, "call");
    r.thoughtAt = now;
    const it: Intention = think(ctx);
    // (a hurt one's fear: the whole group bolts with it)
    if (it.doing !== r.doing) {
      r.doing = it.doing;
      r.since = 0;
      r.wire.at = now;
      r.stuck = 0;
      // (its call, its alarm: heard — the alarm warns the others round it, pointing at what it's from)
      if (it.doing === "call") sound(r, "call");
      const bolt = (it.doing === "flee" || it.doing === "fly" || it.doing === "swim") && it.why === "threat";
      if (bolt) r.needs = { ...r.needs, fear: Math.max(r.needs.fear, 0.75) };
      if ((it.doing === "alarm" || bolt) && traitsOf(r.kind, r.young).alarm > 0 && now - h.alarmAt > 3000) {
        h.alarmAt = now;
        const from = it.target ? targetPos(it.target) : it.to ? { x: r.x * 2 - it.to.x, z: r.z * 2 - it.to.z } : null;
        if (from) alarms.push({ x: r.x, z: r.z, fx: from.x, fz: from.z, r: traitsOf(r.kind).alarm, at: now, by: r.wire.id });
        if (alarms.length > 200) alarms.splice(0, alarms.length - 200);
        sound(r, "alarm");
      }
    }
    // a new place to go: not there yet, no way yet (a long one a straight line can't make: the navmesh's)
    const newTo = !!it.to && (!r.to || Math.hypot(it.to.x - r.to.x, it.to.z - r.to.z) > 1);
    if (newTo || !it.to) {
      r.arrived = !it.to;
      r.stuck = 0;
      r.path = [];
      r.pathTo = null;
    }
    r.pace = it.pace;
    r.to = it.to;
    r.target = it.target;
    r.why = it.why ?? "";
    r.flank = it.flank ?? 0;
    // (a long way: steered — the navmesh asked only once steering's stuck on it, in move: a window of it is ~100s of
    // ms of the tick's thread to make)
    r.wire.d = doingNo(r.doing);
    r.wire.p = paceNo(r.pace);
    r.wire.t = it.target ?? "";
  }

  function move(r: Run, dt: number, now: number) {
    const d = ANIMALS[r.kind];
    // where to: its spot, its target
    const tgt = r.target ? targetPos(r.target) : null;
    let to = r.to ?? null;
    if (tgt && (r.doing === "attack" || r.doing === "chase" || r.doing === "approach" || r.doing === "follow" || r.doing === "stalk"))
      to = tgt;
    // (a pack's hunt: one drives, the others to its sides, ahead of it — plan 128 F8a)
    if (tgt && r.flank > 0 && (r.doing === "chase" || r.doing === "stalk")) {
      const l = member(r.group, 0);
      if (l) {
        const fx = tgt.x - l.x;
        const fz = tgt.z - l.z;
        const fl = Math.hypot(fx, fz) || 1;
        const side = r.flank % 2 ? 1 : -1;
        to = { x: tgt.x + (fx / fl) * 6 - (fz / fl) * side * 9, z: tgt.z + (fz / fl) * 6 + (fx / fl) * side * 9 };
      }
    }
    // (there: it stands where it got to till it chooses again — plan 128: not walking on the spot)
    if (r.arrived && (r.doing === "travel" || r.doing === "wander" || r.doing === "swim" || r.doing === "shelter" || r.doing === "leave" || r.doing === "flee")) {
      settle(r, dt);
      return;
    }
    // (a long trip on its way: the next of its path's points)
    if (to && r.path.length && r.pathTo && r.to && Math.hypot(r.pathTo.x - r.to.x, r.pathTo.z - r.to.z) < 1) {
      while (r.path.length > 1 && Math.hypot(r.path[0].x - r.x, r.path[0].z - r.z) < 3) r.path.shift();
      to = r.path[0];
      if (r.path.length === 1 && Math.hypot(to.x - r.x, to.z - r.z) < 3) r.path = [];
    }
    if (r.doing === "warn" || r.doing === "alert" || r.doing === "eat" || r.doing === "alarm" || r.doing === "call" || r.doing === "sniff" || r.doing === "groom" || r.doing === "drink" || r.doing === "play") {
      // (facing whoever it's on about)
      if (tgt) r.yaw = turnTo(r.yaw, Math.atan2(tgt.z - r.z, tgt.x - r.x), dt * 4);
      settle(r, dt);
      return;
    }
    let speed = speedOf(r.kind, r.pace, r.young);
    // (coming at a person: slower than a run — running away saves you; a defender with no danger slower still)
    if (r.doing === "attack" && r.target && room.state.players.has(r.target)) speed = Math.min(speed, d.danger?.chase ?? 5);
    // the air: up to fly, down to land
    const flying = r.pace === "fly" && !!d.flies;
    const alt = flying ? (d.flies?.alt[0] ?? 4) + ((d.flies?.alt[1] ?? 10) - (d.flies?.alt[0] ?? 4)) * hashUnit(r.wire.id, 5) : r.doing === "perch" && (d.flies || d.climbs) ? perchHeight(r) : 0;
    r.h += Math.sign(alt - r.h) * Math.min(Math.abs(alt - r.h), dt * (flying ? 3 : r.doing === "perch" ? 1.5 : 4));
    if (!to || speed <= 0) {
      settle(r, dt);
      return;
    }
    const dx = to.x - r.x;
    const dz = to.z - r.z;
    const dist = Math.hypot(dx, dz);
    const stopAt =
      r.doing === "attack"
        ? reachOf(r) * 0.8
        : r.doing === "approach"
          ? Math.max(0.6, d.len * 0.6)
          : r.doing === "follow"
            ? r.target
              ? 2.4
              : 1.2 + d.len * 1.4
            : r.i > 0 && r.doing === "travel"
              ? 0.6 + d.len * 0.5
              : 0.4;
    // (a hair's give: its last steps close the gap by less each time — turned a little off, it never quite gets there)
    if (dist <= stopAt + 0.15) {
      if (r.doing === "attack") strike(r, now);
      if (r.doing === "travel" || r.doing === "wander" || r.doing === "swim" || r.doing === "shelter" || r.doing === "leave" || r.doing === "flee") {
        // (a path's point, not its end: on to the next)
        if (!r.path.length) {
          r.arrived = true;
          r.thinkIn = Math.min(r.thinkIn, 0.3);
        }
      }
      if (r.doing === "fly" && !r.target) {
        r.to = undefined;
        r.arrived = true;
        // landed: down from the air
        r.doing = "idle";
        r.wire.d = doingNo("idle");
        r.pace = "still";
        r.wire.p = paceNo("still");
      }
      r.yaw = turnTo(r.yaw, Math.atan2(dz, dx), dt * 3);
      return;
    }
    let want = Math.atan2(dz, dx);
    // (its group: each kept a body's length from the others — a herd spread, a file strung out, not a heap: F5a)
    const g = r.group;
    if (g.n + g.young > 1 && !flying) {
      let sx = 0;
      let sz = 0;
      const sep = d.len * 1.2 + 0.5;
      for (let i = 0; i < g.n + g.young; i++) {
        if (i === r.i) continue;
        const m = runs.get(`${g.id}#${i}`);
        if (!m || m.deadAt) continue;
        const ox = r.x - m.x;
        const oz = r.z - m.z;
        const q = Math.hypot(ox, oz);
        if (q > 0.01 && q < sep) {
          sx += (ox / q) * ((sep - q) / sep);
          sz += (oz / q) * ((sep - q) / sep);
        }
      }
      if (sx || sz) want = Math.atan2(Math.sin(want) + sz * 1.5, Math.cos(want) + sx * 1.5);
    }
    const turnRate = r.pace === "run" || flying ? 5 : 3;
    // a way round what's in the way (a wall, the water's edge, a cliff): the nearest heading that's clear
    const step = Math.min(dist - stopAt, speed * dt);
    let heading = want;
    let ok = false;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
      const a = want + off * (r.stuck % 2 ? -1 : 1);
      const nx = r.x + Math.cos(a) * Math.max(step, 0.6);
      const nz = r.z + Math.sin(a) * Math.max(step, 0.6);
      if (canStep(r, nx, nz)) {
        heading = a;
        ok = true;
        break;
      }
    }
    if (!ok) {
      r.stuck++;
      // (stuck on a long way somewhere of its day: a way round on the navmesh — plan 128 F9a)
      if (r.stuck === 6 && !r.path.length && r.to && (r.doing === "travel" || r.doing === "shelter") && dist > 40 && !d.flies && !straight(r, r.to))
        askWay(r);
      // (given up: somewhere else — unless a way round's been asked for and may yet come, ~4 s)
      if (r.stuck > (pathQ.includes(r) || pathFor === r ? 100 : 20)) {
        r.to = undefined;
        r.arrived = true;
        r.thinkIn = 0;
      }
      return;
    }
    r.yaw = turnTo(r.yaw, heading, dt * turnRate);
    // (it goes the way it faces: turning slows it a little)
    const along = Math.max(0.3, Math.cos(angleDiff(r.yaw, heading)));
    const nx = r.x + Math.cos(r.yaw) * step * along;
    const nz = r.z + Math.sin(r.yaw) * step * along;
    if (canStep(r, nx, nz)) {
      r.x = nx;
      r.z = nz;
    } else {
      // (half a step the clear way — checked too: not into the wall it's turning from)
      const hx = r.x + Math.cos(heading) * step * 0.5;
      const hz = r.z + Math.sin(heading) * step * 0.5;
      if (canStep(r, hx, hz)) {
        r.x = hx;
        r.z = hz;
      } else r.stuck++;
    }
  }
  function settle(r: Run, dt: number) {
    const d = ANIMALS[r.kind];
    if (r.doing !== "perch" && r.doing !== "fly" && r.h > 0) r.h = Math.max(0, r.h - dt * 3);
    if (r.doing === "perch" && !(d.flies || d.climbs)) r.h = 0;
  }
  function perchHeight(r: Run) {
    // (up a tree where there are trees, a little up — a fence, a roof's edge — where there aren't)
    return treeDensity(r.x, r.z) > 0.3 ? 4 + hashUnit(r.wire.id, 13) * 5 : 1.2;
  }
  /** Its body's half-width (m): what has to fit between the solids. */
  const SOLID_NEAR = 25;
  /** Its height against the world's solids (its back's, its head a little over): a cat under a bench, a deer not. */
  const bodyH = (r: Run) => ANIMALS[r.kind].height * (r.young ? YOUNG.scale : 1) * 1.2;
  const bodyR = (r: Run) => Math.max(0.12, Math.min(0.5, ANIMALS[r.kind].len * (r.young ? YOUNG.scale : 1) * 0.22));
  const reachOf = (r: Run) => (ANIMALS[r.kind].len * (r.young ? YOUNG.scale : 1)) / 2 + 0.7;

  // ── strikes: a predator's on a person, on its prey ───────────────────────────────────────────────────────────
  /** a person's next bite (ms): BITE_GAP after the last */
  const bitten = new Map<string, number>();
  function strike(r: Run, now: number) {
    const d = ANIMALS[r.kind];
    if (now < r.strikeAt) return;
    const p = r.target ? room.state.players.get(r.target) : undefined;
    if (p) {
      // (not one gone indoors, upstairs over it)
      if (p.hp <= 0 || p.downAt || p.level !== 0) return;
      if (Math.hypot(p.x - r.x, p.y - r.z) > reachOf(r) + 0.5) return;
      // (one bite at a time on a person, whatever's at them: a pack doesn't tear one apart at once)
      if (now < (bitten.get(p.sid) ?? 0)) return;
      if (bitten.size > 256) bitten.clear();
      bitten.set(p.sid, now + BITE_GAP);
      const n = d.danger?.hit ?? Math.max(3, Math.round(d.hp / 25));
      r.strikeAt = now + (d.danger?.every ?? 2500);
      room.survival?.hurt(p.sid, n);
      p.hitAt = now;
      p.hitYaw = Math.atan2(r.z - p.y, r.x - p.x);
      r.wire.hitAt = 0;
      r.wire.at = now;
      const c = (room.clients as WorldClient[]).find((q) => q.sessionId === p.sid);
      if (c) room.send(c, "animal:strike", { id: r.wire.id, kind: r.kind, n, x: r.x, y: r.z });
      // (it backs off after a strike: a wolf circles in again, a bear's done with you once you're down)
      if (p.downAt || p.hp <= 0) {
        r.target = undefined;
        r.doing = "idle";
        r.thinkIn = 6;
      } else {
        // (else it backs off a few steps, then warns again before it comes back in: a chance to get away)
        r.doing = "flee";
        r.since = 0;
        r.pace = "trot";
        r.to = awayFrom(r, { x: p.x, z: p.y }, 6);
        r.target = undefined;
        r.thinkIn = 2;
        r.wire.d = doingNo("flee");
        r.wire.p = paceNo("trot");
        r.wire.t = "";
      }
      return;
    }
    const o = r.target ? runs.get(r.target) : undefined;
    if (o && !o.deadAt && Math.hypot(o.x - r.x, o.z - r.z) <= reachOf(r) + 0.6) {
      r.strikeAt = now + 900;
      hurt(o, ANIMALS[o.kind].hp * (d.group === "big" ? 0.6 : 0.8), now, r.wire.id);
      if (o.deadAt) {
        // it eats its kill where it fell
        r.needs = { ...r.needs, hunger: 0.1 };
        r.doing = "graze";
        r.since = 0;
        r.wire.d = doingNo("graze");
        r.thinkIn = 25;
      }
    }
  }

  /** Hurt it by `n`: it flinches and bolts (its group with it), or falls. */
  function hurt(r: Run, n: number, now: number, by: string) {
    if (r.deadAt) return;
    r.hp -= n;
    r.wire.hitAt = now;
    r.wire.hp = Math.max(0, Math.round((100 * r.hp) / (ANIMALS[r.kind].hp * (r.young ? 0.5 : 1))));
    if (r.hp <= 0) {
      r.deadAt = now;
      remember(r.group.id, r.x, r.z, now);
      r.doing = "dead";
      r.pace = "still";
      r.h = 0;
      r.wire.d = doingNo("dead");
      r.wire.p = paceNo("still");
      r.wire.at = now;
      r.wire.t = "";
      gone.set(r.wire.id, now + RESPAWN_MS);
    } else {
      r.needs = { ...r.needs, fear: 1 };
      r.thinkIn = 0;
    }
    // the rest of its group: frightened too
    for (let i = 0; i < r.group.n + r.group.young; i++) {
      const o = runs.get(`${r.group.id}#${i}`);
      if (o && o !== r && !o.deadAt) {
        o.needs = { ...o.needs, fear: Math.max(o.needs.fear, 0.8) };
        o.thinkIn = 0;
      }
    }
    void by;
  }

  // ── the room's hooks ──────────────────────────────────────────────────────────────────────────────────────────
  const hooks: AnimalHooks = {
    shoot(ray, range, damage, by, now) {
      const d = rayDir(ray.yaw, ray.pitch);
      let best: { r: Run; t: number } | null = null;
      for (const r of runs.values()) {
        if (r.skinned) continue;
        const dx = r.x - ray.x;
        const dy = r.z - ray.y;
        if (dx * dx + dy * dy > (range + 3) * (range + 3)) continue;
        const ground = heightAt(r.x, r.z);
        const c = capsuleOf({
          kind: r.kind,
          young: r.young,
          x: r.x,
          y: r.z,
          z: ground + r.h,
          yaw: r.yaw,
          lying: r.doing === "rest" || r.doing === "sleep" || !!r.deadAt,
        });
        const t = rayCapsule(ray, d, c, range, 0.05);
        if (t !== null && (!best || t < best.t)) best = { r, t };
      }
      if (!best) return null;
      const hit = { x: ray.x + d.x * best.t, y: ray.y + d.y * best.t, z: ray.z + d.z * best.t };
      if (!(room.sight?.(0, ray, hit) ?? true)) return null;
      const r = best.r;
      const c = capsuleOf({ kind: r.kind, young: r.young, x: r.x, y: r.z, z: heightAt(r.x, r.z) + r.h, yaw: r.yaw });
      const head = Math.hypot(hit.x - c.b[0], hit.y - c.b[1]) < c.r * 1.6;
      if (!r.deadAt) hurt(r, damage(best.t, head), now, by);
      return { id: r.wire.id, kind: r.deadAt ? "killed" : "hurt", head, ...hit, t: best.t };
    },
    all: () => [...runs.values()],
    near(x, y, r) {
      const out: { id: string; kind: AnimalKind; x: number; y: number; doing: Doing }[] = [];
      for (const a of runs.values())
        if (Math.abs(a.x - x) < r && Math.abs(a.z - y) < r && Math.hypot(a.x - x, a.z - y) < r)
          out.push({ id: a.wire.id, kind: a.kind, x: a.x, y: a.z, doing: a.doing });
      return out.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
    },
    wake(x, y, now) {
      const [cx, cz] = cellOf(x, y);
      for (let j = -RING; j <= RING; j++)
        for (let i = -RING; i <= RING; i++) if (!cells.has(cellKey(cx + i, cz + j))) makeCell(cx + i, cz + j, now);
    },
  };
  room.animals = hooks;

  // ── acts: feed, skin, collect, mount ──────────────────────────────────────────────────────────────────────────
  const reply = (c: WorldClient, m: ServerMessages["animal:did"]) => room.send(c, "animal:did", m);
  room.on("animal:act", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const id = String(m?.id ?? "");
    const act = String(m?.act ?? "");
    const r = runs.get(id);
    if (!p || !r) return reply(client, { id, act, ok: false, why: "gone" });
    if (Math.hypot(p.x - r.x, p.y - r.z) > REACH + ANIMALS[r.kind].len / 2) return reply(client, { id, act, ok: false, why: "far" });
    const now = Date.now();
    const inv = room.survival?.inventory(client.sessionId);
    const d = ANIMALS[r.kind];
    // (a horse under its rider isn't fed or stroked off them by whoever walks up)
    if (r.doing === "ridden" && act !== "mount" && act !== "dismount" && act !== "name")
      return reply(client, { id, act, ok: false, why: "ridden" });
    switch (act) {
      case "feed": {
        const food = inv?.hand?.id;
        if (!inv || !food || !takes(r.kind, food)) return reply(client, { id, act, ok: false, why: "food" });
        if (r.deadAt) return reply(client, { id, act, ok: false, why: "dead" });
        // (it must be calm enough to come: eating from the hand, or close and not fleeing)
        if (r.doing === "flee" || r.doing === "fly" || r.doing === "attack")
          return reply(client, { id, act, ok: false, why: "scared" });
        const h = inv.hand as { id: string; n: number } | null;
        inv.hand = h && h.n > 1 ? ({ ...h, n: h.n - 1 } as typeof inv.hand) : null;
        room.survival?.changed(client.sessionId);
        r.needs = { ...r.needs, hunger: Math.max(0, r.needs.hunger - 0.35), fear: 0 };
        r.doing = "eat";
        r.since = 0;
        r.wire.d = doingNo("eat");
        r.wire.at = now;
        r.wire.t = client.sessionId;
        r.thinkIn = 3;
        const mine = trusts.get(p.uid) ?? new Map<string, Trust>();
        const t = fed(r.kind, mine.get(id), dayOf(now));
        mine.set(id, t);
        trusts.set(p.uid, mine);
        const friend = isFriend(t) && befriendable(r.kind, r.young);
        if (friend && !r.friend) {
          r.friend = p.uid;
          friendOf.set(id, { uid: p.uid, name: r.wire.name || d.label[0] });
          r.wire.n |= 4;
          r.wire.name = r.wire.name || d.label[0];
        }
        keepTrust(p.uid, id, r.kind, t, !!r.friend);
        return reply(client, { id, act, ok: true, trust: t.v, friend: !!r.friend && r.friend === p.uid });
      }
      case "skin": {
        if (!r.deadAt || r.skinned) return reply(client, { id, act, ok: false, why: "alive" });
        if (!inv) return reply(client, { id, act, ok: false, why: "pack" });
        const got: { id: string; n: number }[] = [];
        if (d.meat) got.push({ id: "meat", n: r.young ? Math.ceil(d.meat / 2) : d.meat });
        if (d.hide) got.push({ id: `hide_${d.hide}`, n: 1 });
        const given = room.survival?.gift(client.sessionId, got) ?? got;
        // (nothing fitted: it lies there still, to be skinned with room in the pack)
        if (got.length && !given.length) return reply(client, { id, act, ok: false, why: "pack" });
        r.skinned = true;
        r.wire.n |= 1;
        r.deadAt = Math.min(r.deadAt, now - BODY_MS + 4000);
        return reply(client, { id, act, ok: given.length > 0, got: given });
      }
      case "collect": {
        const day = dayOf(now);
        if (!d.gives || r.young || r.deadAt) return reply(client, { id, act, ok: false, why: "none" });
        if (r.gaveDay === day) return reply(client, { id, act, ok: false, why: "today" });
        const item = d.gives === "egg" ? "egg" : d.gives === "milk" ? "milk" : "hide_wool";
        const given = room.survival?.gift(client.sessionId, [{ id: item, n: d.gives === "egg" ? 1 : 1 }]) ?? [];
        if (!given.length) return reply(client, { id, act, ok: false, why: "pack" });
        r.gaveDay = day;
        gave.set(id, day);
        r.wire.n &= ~2;
        return reply(client, { id, act, ok: true, got: given });
      }
      case "mount": {
        if (!d.ride || r.deadAt || r.young) return reply(client, { id, act, ok: false, why: "none" });
        // (the farm's horses are anyone's to ride; a wild one only its friend's)
        if (r.group.from !== "farm" && r.friend !== p.uid) return reply(client, { id, act, ok: false, why: "wild" });
        if (r.doing === "ridden") return reply(client, { id, act, ok: false, why: "taken" });
        for (const o of runs.values()) if (o.doing === "ridden" && o.wire.t === client.sessionId) return reply(client, { id, act, ok: false, why: "riding" });
        r.doing = "ridden";
        r.since = 0;
        r.wire.d = doingNo("ridden");
        r.wire.t = client.sessionId;
        r.wire.at = now;
        r.target = client.sessionId;
        return reply(client, { id, act, ok: true });
      }
      case "dismount": {
        if (r.doing !== "ridden" || r.wire.t !== client.sessionId) return reply(client, { id, act, ok: false, why: "none" });
        letGoOf(r, now);
        return reply(client, { id, act, ok: true });
      }
      case "stroke": {
        if (r.deadAt) return reply(client, { id, act, ok: false });
        const t = trustOf(p.uid, id)?.v ?? 0;
        if (t < 0.5 && d.group !== "farm") return reply(client, { id, act, ok: false, why: "wary", trust: t });
        r.needs = { ...r.needs, fear: 0 };
        r.doing = "idle";
        r.wire.d = doingNo("idle");
        r.wire.t = client.sessionId;
        r.thinkIn = 4;
        return reply(client, { id, act, ok: true, trust: t });
      }
      case "name": {
        if (r.friend !== p.uid) return reply(client, { id, act, ok: false, why: "friend" });
        const name = String(m?.name ?? "").replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 20);
        if (!name) return reply(client, { id, act, ok: false, why: "name" });
        r.wire.name = name;
        friendOf.set(id, { uid: p.uid, name });
        keepTrust(p.uid, id, r.kind, trustOf(p.uid, id) ?? { v: 1, day: dayOf(now) }, true, name);
        return reply(client, { id, act, ok: true, friend: true });
      }
    }
    return reply(client, { id, act, ok: false, why: "act" });
  });
  function letGoOf(r: Run, now: number) {
    r.doing = "idle";
    r.wire.d = doingNo("idle");
    r.wire.t = "";
    r.wire.at = now;
    r.target = undefined;
    r.thinkIn = 2;
    // (its home's where it was let go: a farm horse walks back to its paddock by its pen)
  }

  // a feed crate's food into the left hand (the barn's, the market's: the client says which it stands by)
  // (plan 128, F10a) the dev overlay: an admin's minds round them, twice a second
  room.on("animal:debug", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin) return;
    if (m?.on) debugFor.add(client.sessionId);
    else debugFor.delete(client.sessionId);
  });
  function sendDebug() {
    for (const sid of [...debugFor]) {
      const c = (room.clients as WorldClient[]).find((q) => q.sessionId === sid);
      const p = room.state.players.get(sid);
      if (!c || !p?.admin) {
        debugFor.delete(sid);
        continue;
      }
      const list: ServerMessages["animal:debug"]["list"] = [];
      for (const r of runs.values()) {
        if (Math.abs(r.x - p.x) > 120 || Math.abs(r.z - p.y) > 120) continue;
        let aware = 0;
        for (const v of r.aware.values()) aware = Math.max(aware, v);
        const to = r.path.length ? r.path[r.path.length - 1] : r.to;
        list.push({
          id: r.wire.id,
          d: r.deadAt ? "dead" : r.doing,
          why: r.why,
          to: to ? [Math.round(to.x * 10) / 10, Math.round(to.z * 10) / 10] : null,
          path: r.path.length,
          aware: Math.round(aware * 100) / 100,
          hunger: Math.round(r.needs.hunger * 100) / 100,
          thirst: Math.round((r.needs.thirst ?? 0) * 100) / 100,
          tired: Math.round(r.needs.tired * 100) / 100,
          fear: Math.round(r.needs.fear * 100) / 100,
        });
        if (list.length >= 80) break;
      }
      room.send(c, "animal:debug", { list });
    }
  }

  room.on("animal:take", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const food = String(m?.food ?? "");
    if (!p || p.level !== 0 || !(CRATE_FOODS as readonly string[]).includes(food)) return;
    if (!FEED_CRATES.some((c) => Math.hypot(c.x - p.x, c.z - p.y) <= CRATE_REACH + 0.5)) return;
    room.survival?.gift(client.sessionId, [{ id: food, n: 3 }], true);
  });

  // ── God mode's Animals tool (plan 127, F2a/F6a): what the land makes round its camera, today's dark nests there ──
  // (the server's: it has the land's worker — a square not made yet is asked for there and told as pending, the tool
  // asks again —, and its `canBe`; the client's land chunks are its workers', not read on its main thread)
  const wildLand = new Map<string, AnimalPlaceDef[]>();
  const wildNests = new Map<string, { id: string; x: number; z: number; n: number }[]>();
  let wildDay = -1;
  const offWildEdits = onEditsLaid(() => {
    wildLand.clear();
    wildNests.clear();
  });
  const WILD_R = 500;
  /** an admin's last ask (ms): at most one every 250 */
  const wildAsked = new Map<string, number>();
  room.on("god:wild", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p?.admin) return;
    const x = Number(m?.x);
    const z = Number(m?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const at = Date.now();
    if (at - (wildAsked.get(client.sessionId) ?? 0) < 250) return;
    if (wildAsked.size > 64) wildAsked.clear();
    wildAsked.set(client.sessionId, at);
    const day = nestDayOf(at);
    // (a new day, or asked all over the map: let go — made again as asked)
    if (day !== wildDay || wildNests.size > 2000) {
      wildDay = day;
      wildNests.clear();
    }
    if (wildLand.size > 2000) wildLand.clear();
    const t0 = performance.now();
    let pending = 0;
    const land: AnimalPlaceDef[] = [];
    const nests: { id: string; x: number; z: number; n: number }[] = [];
    // nearest first, a few milliseconds' worth made now, the rest next time it asks
    const squares = (size: number) => {
      const out: { cx: number; cz: number; d: number }[] = [];
      const r = Math.ceil(WILD_R / size);
      const [cx, cz] = [Math.floor(x / size), Math.floor(z / size)];
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot((cx + dx + 0.5) * size - x, (cz + dz + 0.5) * size - z);
          if (d <= WILD_R + size * 0.75) out.push({ cx: cx + dx, cz: cz + dz, d });
        }
      return out.sort((a, b) => a.d - b.d);
    };
    for (const q of squares(CELL)) {
      const k = `${q.cx},${q.cz}`;
      let l = wildLand.get(k);
      if (!l) {
        if (performance.now() - t0 > 8 || !squareReady(q.cx * CELL, q.cz * CELL, CELL)) {
          pending++;
          continue;
        }
        l = landGroups(q.cx, q.cz, ANIMAL_SEED, canBe).map(placeOfGroup);
        wildLand.set(k, l);
      }
      for (const g of l) if (Math.hypot(g.x - x, g.z - z) <= WILD_R) land.push(g);
    }
    // (the campus's out today, as the dark has them — God mode's clear places out, as many as people out make —;
    // outside the day, the day's first as nobody's been out; the far land's by square)
    const campus = room.dark?.campusNests() ?? (() => {
      const all = dayNests(day);
      return all.slice(0, nestCount(all, 0));
    })();
    for (const n of campus) if (Math.hypot(n.x - x, n.z - z) <= WILD_R) nests.push({ id: n.id, x: n.x, z: n.z, n: n.n });
    for (const q of squares(NEST_CELL)) {
      const k = `${q.cx},${q.cz}`;
      let l = wildNests.get(k);
      if (!l) {
        if (performance.now() - t0 > 10 || !squareReady(q.cx * NEST_CELL, q.cz * NEST_CELL, NEST_CELL)) {
          pending++;
          continue;
        }
        l = dayNestsIn(day, q.cx, q.cz).map((n) => ({ id: n.id, x: n.x, z: n.z, n: n.n }));
        wildNests.set(k, l);
      }
      for (const n of l) if (Math.hypot(n.x - x, n.z - z) <= WILD_R) nests.push(n);
    }
    room.send(client, "god:wild", { x, z, land, nests, pending });
  });

  /** Their trust as the API keeps it (phase 9): loaded when they come. */
  const loadTrust = (uid: number) => {
    if (trusts.has(uid)) return;
    trusts.set(uid, new Map());
    if (config.offline) return;
    void api
      .animalTrust(uid)
      .then(({ trust: rows }) => {
      const m = trusts.get(uid) ?? new Map<string, Trust>();
      for (const row of rows ?? []) {
        // (fed meanwhile, before this came: that's newer)
        if (!m.has(row.id)) m.set(row.id, { v: row.v, day: row.day });
        if (row.friend) friendOf.set(row.id, { uid, name: row.name });
        const r = runs.get(row.id);
        if (r && row.friend && befriendable(r.kind, r.young)) {
          r.friend = uid;
          r.wire.n |= 4;
          r.wire.name = row.name || ANIMALS[r.kind].label[0];
        }
      }
      trusts.set(uid, m);
      })
      .catch((e) => {
        // (tried again when they come next)
        trusts.delete(uid);
        console.warn("[animals] trust not loaded:", e instanceof Error ? e.message : e);
      });
  };

  return {
    join(client, p) {
      client.view ??= new StateView();
      seers.set(p.sid, { x: p.x, y: p.y, v: 0, at: Date.now() });
      if (p.uid) loadTrust(p.uid);
    },
    back(client) {
      client.view ??= new StateView();
      viewsAt = 0;
    },
    leave(client, p) {
      seers.delete(p.sid);
      for (const r of runs.values()) if (r.doing === "ridden" && r.wire.t === client.sessionId) letGoOf(r, Date.now());
    },
    shot(p) {
      if (p.level !== 0) return;
      shots.push({ x: p.x, y: p.y, at: Date.now() });
      if (shots.length > 32) shots.shift();
      for (const r of runs.values()) if (Math.hypot(r.x - p.x, r.z - p.y) < SHOT_HEARD) r.thinkIn = Math.min(r.thinkIn, 0.15);
    },
    tick(dt, now) {
      clock += dt;
      if (now - keptAt > 30_000) {
        keptAt = now;
        flushTrust();
      }
      // how fast each person goes (the animals read a runner, a sneak)
      for (const p of room.state.players.values()) {
        const s = seers.get(p.sid);
        if (!s) {
          seers.set(p.sid, { x: p.x, y: p.y, v: 0, at: now });
          continue;
        }
        const ms = now - s.at;
        if (ms >= 200) {
          const v = Math.hypot(p.x - s.x, p.y - s.y) / (ms / 1000);
          // (faster than anyone runs or rides: a teleport, a respawn — no speed at all)
          s.v = v > 25 ? 0 : s.v * 0.4 + v * 0.6;
          s.x = p.x;
          s.y = p.y;
          s.at = now;
        }
      }
      const out = outdoors();
      // the cells round them (looked at once a second; made a few at a time, the nearest first — a ring at once is
      // ~300 ms: a stall for everyone)
      if (now - cellsAt >= 1000) {
        cellsAt = now;
        wanted.length = 0;
        for (const p of out) {
          const [cx, cz] = cellOf(p.x, p.y);
          for (let j = -RING; j <= RING; j++)
            for (let i = -RING; i <= RING; i++) {
              const k = cellKey(cx + i, cz + j);
              const c = cells.get(k);
              if (c) c.seenAt = now;
              else if (!wanted.some((w) => w.k === k)) wanted.push({ k, cx: cx + i, cz: cz + j, d: Math.abs(i) + Math.abs(j) });
            }
        }
        wanted.sort((a, b) => a.d - b.d);
        for (const [k, c] of cells) if (now - c.seenAt > CELL_IDLE_MS) dropCell(k);
        // bodies let go
        for (const r of [...runs.values()]) if (r.deadAt && now - r.deadAt > BODY_MS) remove(r.wire.id);
        // those kept past their cell: let go once they've been neither ridden nor with their friend a while
        for (const [id, at] of [...strays]) {
          const r = runs.get(id);
          if (!r) strays.delete(id);
          else if (kept(r)) strays.set(id, now);
          else if (now - at > CELL_IDLE_MS) remove(id);
        }
        for (const [id, t] of gone) if (t <= now) gone.delete(id);
        // the farm's ready for the day (eggs, milk, wool)
        const day = dayOf(now);
        for (const [id, d] of gave) if (d !== day) gave.delete(id);
        for (const r of runs.values()) if (ANIMALS[r.kind].gives && !r.young && r.gaveDay !== day) r.wire.n |= 2;
      }
      // (a few milliseconds' worth of the cells wanted each tick)
      const t0 = performance.now();
      // (one whose land isn't made yet waits for it: asked for in the worker, made next time round — plan 127)
      const waiting: typeof wanted = [];
      while (wanted.length && performance.now() - t0 < CELL_MS) {
        const w = wanted.shift();
        if (!w || cells.has(w.k)) continue;
        if (!squareReady(w.cx * CELL, w.cz * CELL, CELL)) waiting.push(w);
        else makeCell(w.cx, w.cz, now);
      }
      wanted.push(...waiting);
      // each one: near a person every tick, else twice a second
      const slow = Math.floor(clock * 2) !== Math.floor((clock - dt) * 2);
      for (const r of runs.values()) {
        if (r.deadAt) continue;
        let near = false;
        for (const p of out)
          if (Math.abs(p.x - r.x) < NEAR && Math.abs(p.y - r.z) < NEAR) {
            near = true;
            break;
          }
        if (!near && !slow) continue;
        const step = near ? dt : 0.5;
        if (r.doing === "ridden") {
          // under its rider: where they are, the way they go
          const q = room.state.players.get(r.wire.t);
          if (!q || q.level !== 0 || q.hp <= 0 || q.downAt) letGoOf(r, now);
          else {
            const dx = q.x - r.x;
            const dz = q.y - r.z;
            if (dx * dx + dz * dz > 0.0004) r.yaw = Math.atan2(dz, dx);
            r.x = q.x;
            r.z = q.y;
            const v = seers.get(q.sid)?.v ?? 0;
            const pace: Pace = v < 0.3 ? "still" : v < 3 ? "walk" : v < 7 ? "trot" : "run";
            r.pace = pace;
            r.wire.p = paceNo(pace);
          }
        } else {
          r.since += step;
          r.thinkIn -= step;
          r.needs = stepNeeds(r.needs, step, r.doing, ANIMALS[r.kind].wary);
          if (r.thinkIn <= 0) {
            r.thinkIn = THINK_S * (0.7 + hashUnit(r.wire.id, Math.floor(clock)) * 0.6) * (near ? 1 : 2);
            decide(r, now);
          }
          const lx = r.x;
          const lz = r.z;
          // (met by the solids only close to someone — within SOLID_NEAR of a person —: what they'd see go through a
          // wall; past that, as the land has it: Jolt's queries are a few a step)
          let close = false;
          if (near && !ANIMALS[r.kind].flies)
            for (const p of out)
              if ((r.x - p.x) ** 2 + (r.z - p.y) ** 2 < SOLID_NEAR * SOLID_NEAR) {
                close = true;
                break;
              }
          r.solid = close;
          move(r, step, now);
          // (a person walking into it: it's shoved aside — they're solid to each other; plan 129 F5)
          if (close)
            for (const p of out) {
              const dx = r.x - p.x;
              const dz = r.z - p.y;
              const q = Math.hypot(dx, dz);
              const min = bodyR(r) + 0.3;
              if (q > 0.01 && q < min && canStep(r, r.x + (dx / q) * (min - q), r.z + (dz / q) * (min - q))) {
                r.x += (dx / q) * (min - q);
                r.z += (dz / q) * (min - q);
              }
            }
          // (its pace on the wire as it really goes: stood still, still — not walking on the spot, plan 128 F11)
          const moved = Math.hypot(r.x - lx, r.z - lz) > 0.05 * step || r.pace === "fly";
          const p = paceNo(moved ? r.pace : "still");
          if (r.wire.p !== p) r.wire.p = p;
        }
        r.wire.x = r.x;
        r.wire.y = r.z;
        r.wire.h = r.h;
        r.wire.yaw = Math.round((r.yaw / (Math.PI * 2)) * 256) & 255;
      }
      if (debugFor.size && now - debugAt >= 500) {
        debugAt = now;
        sendDebug();
      }
      // (alarms past their time let go)
      while (alarms.length && now - alarms[0].at > ALARM_MS) alarms.shift();
      // who sees which (twice a second)
      if (now - viewsAt >= 500) {
        viewsAt = now;
        for (const c of room.clients as WorldClient[]) {
          const p = room.state.players.get(c.sessionId);
          if (!p) continue;
          c.view ??= new StateView();
          const out0 = p.level !== 0;
          for (const r of runs.values()) {
            const near = !out0 && Math.abs(r.x - p.x) < SEEN && Math.abs(r.z - p.y) < SEEN;
            const has = c.view.has(r.wire);
            if (near && !has) c.view.add(r.wire);
            else if (!near && has) c.view.remove(r.wire);
          }
        }
      }
    },
    dispose() {
      flushTrust();
      offEdits();
      offWildEdits();
      for (const id of [...runs.keys()]) remove(id);
      pathQ.length = 0;
      room.animals = null;
    },
  };
});

function turnTo(a: number, b: number, k: number): number {
  const d = angleDiff(a, b);
  return a + Math.sign(d) * Math.min(Math.abs(d), k);
}
function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

