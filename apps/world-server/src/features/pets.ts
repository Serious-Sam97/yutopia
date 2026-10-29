import {
  ANIM,
  type AreaDef,
  across,
  areaAt,
  dirFromDelta,
  findPath,
  floorsOf,
  GROUND_OFFSET,
  inLiftDoorway,
  isDoorKind,
  isToyHeld,
  objLevel,
  openingCentre,
  type Point,
  RUN_SPEED,
  THROWN,
  type WorldObjectDef,
} from "@yutopia/shared";
import { type CarKind, SEATS_OF } from "@yutopia/shared/car";
import { blackoutAt, inLampPool, nightness } from "@yutopia/shared/dark";
import { BUILDINGS, inBuilt, LAMPS, placeAt, RIVER, ROAD_CLOSED, treeDensity } from "@yutopia/shared/grounds";
import { isRadio } from "@yutopia/shared/media";
import {
  type Bonds,
  bondDecay,
  bondOf,
  bondUp,
  choose,
  cleanBonds,
  cleanMemory,
  cleanTraits,
  compatible,
  drift,
  drives,
  dueSoon,
  favouriteSpot,
  greets,
  hasGrudge,
  holdGrudge,
  type Intent,
  isDusk,
  learnK,
  type Memory,
  moodOf,
  NEGLECT_MS,
  nightOf,
  obeyChance,
  type Raising,
  rememberArrival,
  rememberBowl,
  rememberRoom,
  rememberSpot,
  rememberToy,
  SULK_MS,
  SULK_OBEY,
  shyOf,
  type Traits,
  usualHour,
  WANT_ICON,
} from "@yutopia/shared/mind";
import {
  ATTACK,
  afterBattle,
  BATTLE,
  type BattleEvent,
  battleWinner,
  CARE,
  canExert,
  cleanLook,
  cleanName,
  cleanOutfit,
  cleanPlace,
  coldHurt,
  FETCH,
  type Fighter,
  flightMs,
  goneChance,
  HUNGRY_AT,
  hpFor,
  isCommand,
  isDead,
  isMove,
  isSpecies,
  isToy,
  isTrick,
  LESSON_COOLDOWN,
  LESSON_MS,
  LOST,
  learned,
  lessonGain,
  levelFor,
  type Move,
  type Needs,
  newPet,
  PET_MAX,
  type PetMood,
  type PetOut,
  type PetPlace,
  type PetRecord,
  type PetSeen,
  PLAY,
  playFun,
  resolveRound,
  SLEEP_AT,
  SPECIES_DEFS,
  type Species,
  settleNeeds,
  statsOf,
  THROW_RANGE,
  TOY_DEFS,
  type Toy,
  TRICK_MS,
  tricksFor,
  WAIT_RADIUS,
  WAKE_AT,
  XP,
} from "@yutopia/shared/pets";
import { onCallState } from "@yutopia/shared/phone";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { Pet, PetBattle, type Player, Toy as ToyState, type Vehicle } from "../schema.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Pets (docs/plan/13-pets.md, rules in shared/pets.ts). A pet is its owner's
// (a record in the API) and walks in with them. When they leave it stays where
// it was (docs/plan/51-the-pet.md): waiting about the spot, anyone near may pet
// and feed it, and the room puts it back there when it opens again. Here it
// lives: follows, stays, explores, sleeps when tired (in its bed if it finds
// one), eats and drinks from bowls, answers commands, plays with toys, learns
// tricks, makes its sounds, and battles other pets. Its needs settle with
// real time — slowly while the owner is away — and it can die of neglect.

const REACH = 3; // tiles: close enough to care for / play with / teach
// what each species gets up to beside its owner (art/pets3d.ts has the poses)
const IDLE_SETS: Record<Species, { kind: string; ms: number; when: (n: Needs) => boolean; face?: boolean }[]> = {
  dog: [
    { kind: "scratch", ms: 3600, when: () => true },
    { kind: "pant", ms: 4000, when: (n) => n.energy < 55 },
  ],
  cat: [
    { kind: "groom", ms: 4200, when: () => true },
    { kind: "stretch", ms: 2600, when: () => true },
  ],
  rabbit: [
    { kind: "twitch", ms: 3000, when: () => true, face: true },
    { kind: "binky", ms: 1100, when: (n) => n.fun > 50 },
  ],
  platypus: [
    { kind: "slide", ms: 2200, when: () => true },
    { kind: "shake", ms: 1300, when: () => true },
  ],
  capybara: [
    { kind: "yawn", ms: 2600, when: () => true, face: true },
    { kind: "flat", ms: 7000, when: (n) => n.energy < 80 },
  ],
  parrot: [
    { kind: "preen", ms: 3900, when: () => true },
    { kind: "wing", ms: 2000, when: () => true },
  ],
};
// the 8 facings (shared/iso.ts DIRS: S, SW, W, NW, N, NE, E, SE) as world vectors
const FACING: [number, number][] = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
];
const BOWL_REACH = 2.2;
const SETTLE_MS = 5000;
const SAVE_MS = 30_000;
const HUNGRY_CALL_MS = 120_000;
const EAT_MS = 4000;
const PET_MS = 1500;
// its mind (shared/mind.ts): how often it thinks, how long a want shows, how
// soon it asks again, how long it begs / nudges / sniffs / watches
const THINK_MS = 1000;
const WANT_AGAIN_MS = 25_000;
const BEG_AGAIN_MS = 14_000;
const BEG_MS = 3500;
const NUDGE_MS = 2600;
const SNIFF_MS = 2600;
const WATCH_MS = 20_000;
const GREET_DELAY_MS = 1500;
const ZOOM_AGAIN_MS = 20 * 60_000;
const ZOOM_PACE = 2.1;
// following: within NEAR it's beside them; past FAR it drops whatever it was
// idling at and runs after them (all the way, never a jump); a fresh path
// every REPATH_MS while they keep moving
const FOLLOW_NEAR = 2.6;
const FOLLOW_FAR = 8;
const REPATH_MS = 600;
const AWAY_MS = 2500; // its owner on another floor this long: it goes after them
const CATCH_UP = RUN_SPEED * 1.05; // tiles per second at most: a little quicker than a run
// what it lets go of to catch up (eating, a lesson, a fetch, a battle it sees through)
const LET_GO = new Set([
  "idle",
  "move",
  "trick",
  "seek",
  "watch",
  "beg",
  "nudge",
  "hide",
  "company",
  "greet",
  "zoom",
  "scratch",
]);
const FETCHED: ReadonlySet<string> = new Set(["ball", "frisbee", "laser"]);
// exploring: rooms it keeps out of (as Vortex does), and the beat between legs
const KEEP_OUT: ReadonlySet<string> = new Set(["booth", "standup"]);
const EXPLORE_REST_MS = 1500;
const BIG_ROOM = 120; // tiles: an open floor, toured in several legs
// the car (docs/plan/51-the-pet.md): its owner gets in with it this near (tiles = m) and it runs to a
// free door and hops in — only while the car's slower than this (m/s, as a person: cars.ts OUT_V);
// at the door when this near it; a run's pace to it
const BOARD_NEAR = 15;
const BOARD_V = 2.5;
const BOARD_REACH = 1.2;
const BOARD_PACE = 1.6;
// the seats a pet takes, best first: the back, then the front passenger's
const PET_SEATS = [2, 3, 1];
// the lift (docs/plan/52-the-pet-two.md, D1): a pet following this near its owner (tiles) when
// their car goes rides with them (Pet.ride LIFT), beside them in it; no way to its owner this long
// (ms), it's put back at their side
const LIFT = "lift";
const LIFT_NEAR = 6;
const STUCK_MS = 5000;
const STUCK_NEAR = 20;
// up or down the stairs on foot (D1): it goes to where its owner left the floor first, then comes
// along — this long at most (ms); someone this near walking at it, it steps aside (tiles)
const VIA_MS = 6000;
const VIA_NEAR = 6; // tiles: the new spot this near the old one (its frame), it was the stairs
const ASIDE_NEAR = 1.1;
// its world (D2): a stranger this near in the dark it barks at, again after this long; a car going
// by this near and fast it bounds after a little, again after this long; a dog this near it plays
// with (or growls at)
const STRANGER_NEAR = 6;
const BARK_AGAIN_MS = 6000;
const CAR_NEAR = 10;
const CAR_FAST = 3;
const CHASE_AGAIN_MS = 20_000;
const DOG_NEAR = 3;
const PLAY_AGAIN_MS = 30_000;
// the moves' length (ms): move:<kind> acts (art/pets3d.ts poses them)
const MOVE_MS: Record<string, number> = {
  lie: 8000,
  playbow: 1600,
  shake: 1400,
  tilt: 1500,
  sniffground: 2600,
  chase: 2500,
};
// its owner's routine (D3): a room's minute counted this often; bedtime (the world's hours)
const ROOM_EVERY_MS = 60_000;
const BED_FROM = 22;
const BED_TO = 6;
// lost (shared LOST): its legs about the land (tiles), how far a path is looked for, a search's
// circle on the GPS; how often a sighting tells its owner; how deep the woods are to be the wild
const LEG_MIN = 10;
const LEG_MAX = 40;
const LEG_NODES = 6000;
const SIGHT_TOLD_MS = 10 * 60_000;
const WILD_TREES = 0.9;
const HIT_AGAIN_MS = 4000;
const SNIFFED_AGAIN_MS = 10 * 60_000;

interface Run {
  path: Point[];
  until: number; // when to think again
  care: Record<string, number>; // what → last time
  lesson: number;
  hungryCall: number;
  seenAt: number; // last needs settle (ms)
  dirty: boolean;
  savedAt: number;
  phase: number; // play: which leg it's on
  toy?: string;
  bowl?: string; // the bowl it's heading to
  after?: string; // the toy it's fetching
  toyAt: number; // the throw it last answered (the toy's `at`)
  since: number; // when it joined the room
  greeted: boolean;
  // its mind (shared/mind.ts)
  traits: Traits;
  memory: Memory;
  bonds: Bonds;
  intent: Intent | null;
  thinkAt: number; // when it thinks next
  lastPlay: number;
  lastPetted: number; // petted or spoken to
  lastNear: number; // beside another pet
  lastLooked: number; // had a look at something new / explored
  seen: Set<string>; // the things it has had a look at
  wantAt: number; // when its want was last shown
  calledAt: number; // a command it ignored (a second call works)
  begAt: number; // the last beg / nudge (not again at once)
  shyAt: number; // the last step away from a stranger
  away?: number; // since when its owner's been on another floor (it follows after AWAY_MS)
  zoomAt: number; // the last zoomies
  pace: number; // × its walking pace (zoomies, catching up)
  lost: number; // tries in a row it found no way to its owner
  // exploring: the room it's touring (legs left there), when it last was in each, what it has sniffed
  tour: { area: string | null; legs: number } | null;
  visited: Map<string, number>;
  sniffed: Map<string, number>;
  trail: Point[]; // its last stops (the next one is somewhere it hasn't been)
  echo?: { mood: PetMood; at: number }; // a parrot about to repeat a sound
  anchor?: Point; // waiting: the spot it was left at (it sniffs about it, WAIT_RADIUS)
  // lost (docs/plan/51-the-pet.md): since when its owner's car has been too far ahead; the friend
  // it follows; its last car hit, limping till; when its owner was last told of a sighting
  behind?: number;
  leader?: string;
  hitAt?: number;
  limpUntil?: number;
  toldAt?: number;
  target?: string; // get him (D8): the session it's after, or holding down
  sightAt?: number;
  home?: { key: string; level: number }; // its owner's office it keeps to (mode home)
  liftAt?: Point; // in a lift's car: where it stands off its owner
  stuck?: number; // since when it's found no way to its owner
  ownerAt?: Point & { level: number }; // its owner's last spot on its floor
  via?: Point; // they went up or down from here (the stairs): it goes there first
  viaAt?: number;
  asideAt?: number; // when it next looks whether it's in the way
  // its world and mood (D2, D4)
  sulkUntil?: number;
  barkAt?: number;
  chaseAt?: number;
  playAt?: number;
  alertUntil?: number;
  quiet?: boolean; // its owner busy (a call, focus, a booth): no sounds
  greetedHome?: boolean; // greeted its owner coming into the office (till they leave it)
  roomAt?: number;
}

/** How far (x, z) is from a polyline (the river's middle). */
function distToLine(line: [number, number][], x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

// Offline (tests, no API): records kept here, and which sandbox each one out in
// the world is in (several rooms run at once offline; online there's one world).
const offlinePets = new Map<number, PetRecord[]>();
const offlineOwners = new Map<number, string>();
const offlineOut = new Map<number, string>();
let offlineId = 1;

registerFeature((room: WorldRoom) => {
  const runs = new Map<string, Run>();
  const records = new Map<string, PetRecord>();
  const owners = () => room.state.players;

  const client = (sid: string) => room.clients.getById(sid) as WorldClient | undefined;
  const toast = (sid: string, text: string, tone: "info" | "warn" = "info") => {
    const c = client(sid);
    if (c) room.send(c, "toast", { text, tone });
  };
  const event = (pet: Pet, kind: string, extra: { n?: number; trick?: string } = {}) => {
    const c = client(pet.sid);
    if (c) room.send(c, "pet:event", { id: pet.id, kind, ...extra });
  };
  // (its owner busy — a call, heads down, a booth —: not a sound; D3)
  const say = (pet: Pet, mood: PetMood) => {
    if (runs.get(pet.id)?.quiet) return;
    pet.say = mood;
    pet.sayAt = Date.now();
  };
  const needsOf = (pet: Pet): Needs => ({
    food: pet.food,
    water: pet.water,
    energy: pet.energy,
    fun: pet.fun,
    health: pet.health,
  });
  const setNeeds = (pet: Pet, n: Needs) => {
    pet.food = Math.round(n.food);
    pet.water = Math.round(n.water);
    pet.energy = Math.round(n.energy);
    pet.fun = Math.round(n.fun);
    pet.health = Math.round(n.health);
  };
  const touch = (pet: Pet) => {
    const r = runs.get(pet.id);
    if (r) r.dirty = true;
  };
  const addXp = (pet: Pet, n: number) => {
    pet.xp += n;
    const level = levelFor(pet.xp);
    if (level > pet.level) {
      pet.level = level;
      event(pet, "levelUp", { n: level });
      say(pet, "happy");
    }
    touch(pet);
  };
  // its mind, kept on the run and (traits, bonds) in the state for the panel
  const setTraits = (pet: Pet, r: Run, t: Traits) => {
    r.traits = t;
    pet.traits = JSON.stringify(t);
    r.dirty = true;
  };
  const setBonds = (pet: Pet, r: Run, b: Bonds) => {
    r.bonds = b;
    pet.bonds = JSON.stringify(b);
    r.dirty = true;
  };
  const raise = (pet: Pet, r: Run, ev: Raising) => setTraits(pet, r, drift(r.traits, ev));
  const want = (pet: Pet, r: Run, icon: string, now: number) => {
    pet.want = icon;
    pet.wantAt = now;
    r.wantAt = now;
  };
  const tricks = (pet: Pet): Record<string, number> => {
    try {
      return JSON.parse(pet.tricks || "{}");
    } catch {
      return {};
    }
  };
  const owner = (pet: Pet) => owners().get(pet.sid);
  const mine = (c: WorldClient, id: unknown): Pet | null => {
    const pet = room.state.pets.get(String(id ?? ""));
    return pet && pet.sid === c.sessionId && pet.alive ? pet : null;
  };
  // (in three dimensions: shared reach.ts — a pet's on what it stands on, half a metre high)
  const near = (pet: Pet, p: Player, r = REACH) => {
    const g = room.groundOf(p.uid, p.level, pet.x, pet.y);
    return room.reachSpot(p, pet, Math.hypot(pet.x - p.x, pet.y - p.y), g, g + 0.6, false) <= r;
  };
  const stop = (pet: Pet) => {
    const r = runs.get(pet.id);
    if (r) r.path = [];
  };
  const go = (pet: Pet, to: Point): boolean => {
    const r = runs.get(pet.id);
    if (!r) return false;
    const g = room.gridFor(pet.uid, pet.floor);
    const p = findPath(g, pet, to, g.width * g.height);
    if (!p) return false;
    r.path = p;
    return true;
  };
  // Beside someone: at their side first (where a camera behind them still
  // sees it), then ahead, behind last; among equals the nearest spot.
  const goNear = (pet: Pet, p: Point & { d?: number; level?: number }, radius = 1.3): boolean => {
    if (p.level !== undefined && p.level !== pet.floor) return false; // (someone on another floor)
    const g = room.gridFor(pet.uid, pet.floor);
    const [fx, fy] = FACING[(p.d ?? 0) & 7];
    const ahead = Math.atan2(fy, fx);
    const spots: { x: number; y: number; rank: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = ahead + (i / 8) * Math.PI * 2;
      const rel = Math.abs((((i / 8) * Math.PI * 2 + Math.PI) % (Math.PI * 2)) - Math.PI); // 0 ahead … π behind
      const rank =
        Math.abs(rel - Math.PI / 2) * 2 +
        Math.hypot(p.x + Math.cos(a) * radius - pet.x, p.y + Math.sin(a) * radius - pet.y) * 0.3;
      spots.push({ x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius, rank });
    }
    spots.sort((a, b) => a.rank - b.rank);
    // (a spot on the far side of a wall fits but is a long way round: skip it)
    return spots.some((s) => g.fits(s.x, s.y) && nearBy(g, p, s) && go(pet, s));
  };
  // reachable from `from` in a couple of steps (not round a wall)
  const nearBy = (g: ReturnType<typeof room.gridFor>, from: Point, to: Point) => {
    const path = findPath(g, from, to);
    if (!path) return false;
    let len = 0;
    let prev = from;
    for (const w of path) {
      len += Math.hypot(w.x - prev.x, w.y - prev.y);
      prev = w;
    }
    return len <= Math.hypot(to.x - from.x, to.y - from.y) + 1.2;
  };
  const face = (pet: Pet, at: Point) => {
    const dx = at.x - pet.x;
    const dy = at.y - pet.y;
    if (Math.hypot(dx, dy) > 0.05) pet.d = dirFromDelta(dx, dy);
  };
  const act = (pet: Pet, what: string, at?: Point) => {
    pet.act = what;
    pet.actAt = Date.now();
    if (at) {
      pet.actX = at.x;
      pet.actY = at.y;
    }
  };
  // the things on a floor (a pet only knows the floor it's on)
  const objects = (floor: number) =>
    [...room.state.objects.values()].map(fromSchema).filter((o) => objLevel(o, room.map) === floor);
  const portions = (o: WorldObjectDef) => Number(o.props?.portions ?? 0);
  const saveObject = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await api.putObject(o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };

  // ── the record ────────────────────────────────────────────────────────────
  const load = async (uid: number): Promise<PetRecord[]> => {
    if (config.offline) return offlinePets.get(uid) ?? [];
    return (await api.pets(uid)).pets;
  };
  // every living pet out in this world, whoever's (the room's start)
  const loadOut = async (): Promise<PetOut[]> => {
    if (config.offline)
      return [...offlinePets.entries()].flatMap(([uid, recs]) =>
        recs
          .filter((r) => r.alive && offlineOut.get(r.id) === room.sandbox)
          .map((r) => ({ ...r, uid, owner: offlineOwners.get(uid) ?? "" })),
      );
    return (await api.petsOut()).pets;
  };
  const create = async (uid: number, rec: Omit<PetRecord, "id">): Promise<PetRecord> => {
    if (config.offline) {
      const pet = { ...rec, id: offlineId++ };
      offlinePets.set(uid, [...(offlinePets.get(uid) ?? []), pet]);
      return pet;
    }
    return (await api.createPet(uid, rec)).pet;
  };
  // where it is, saved: alive, its spot and mode; dead, only a death its owner hasn't heard of yet
  const placeOf = (pet: Pet): PetPlace | null => {
    if (!pet.alive) {
      const was = records.get(pet.id)?.place;
      return was?.mode === "died" ? was : null;
    }
    const place: PetPlace = { x: pet.x, y: pet.y, level: pet.floor, mode: pet.mode as PetPlace["mode"] };
    const seen = seenOf(pet);
    if (seen?.lost) place.seen = seen;
    return place;
  };
  const seenOf = (pet: Pet): PetSeen | null => {
    try {
      return pet.seen ? (JSON.parse(pet.seen) as PetSeen) : null;
    } catch {
      return null;
    }
  };
  const patchOf = (pet: Pet, now: number): Partial<PetRecord> => ({
    traits: runs.get(pet.id)?.traits,
    memory: runs.get(pet.id)?.memory,
    bonds: runs.get(pet.id)?.bonds,
    needs: needsOf(pet),
    xp: pet.xp,
    tricks: tricks(pet),
    name: pet.name,
    look: JSON.parse(pet.look),
    outfit: JSON.parse(pet.outfit),
    alive: pet.alive,
    diedAt: records.get(pet.id)?.diedAt ?? null,
    place: placeOf(pet),
    seenAt: now,
    wins: pet.wins,
    losses: pet.losses,
  });
  const save = async (pet: Pet, now = Date.now()) => {
    const r = runs.get(pet.id);
    if (r) {
      r.dirty = false;
      r.savedAt = now;
    }
    const patch = patchOf(pet, now);
    const rec = records.get(pet.id);
    if (rec) Object.assign(rec, patch);
    if (config.offline) {
      if (patch.place && patch.place.mode !== "died") offlineOut.set(Number(pet.id), room.sandbox);
      else offlineOut.delete(Number(pet.id));
      return;
    }
    await api.savePet(pet.uid, Number(pet.id), patch).catch((e) => console.warn("[pets] save", (e as Error).message));
  };
  const remove = async (uid: number, id: number) => {
    if (config.offline) {
      offlinePets.set(
        uid,
        (offlinePets.get(uid) ?? []).filter((p) => p.id !== id),
      );
      return;
    }
    await api.deletePet(uid, id).catch(() => {});
  };

  // A pet into the room: by its owner, or (`at`) where it was left — its owner
  // here or not (an owner away: sid "").
  const place = (
    rec: PetRecord,
    p: Player | { uid: number; sid: string; name: string },
    now: number,
    at?: PetPlace,
  ) => {
    const pet = new Pet();
    pet.id = String(rec.id);
    pet.uid = p.uid;
    pet.sid = p.sid;
    pet.owner = p.name;
    pet.name = rec.name;
    pet.species = rec.species;
    pet.look = JSON.stringify(rec.look);
    pet.outfit = JSON.stringify(rec.outfit);
    if (at || !("x" in p)) {
      const spot0 = at ?? { x: room.map.spawn.x, y: room.map.spawn.y, level: room.home };
      pet.floor = spot0.level;
      const g = room.gridFor(p.uid, spot0.level);
      const spot = g.fits(spot0.x, spot0.y) ? spot0 : (g.nearestOpen(spot0.x, spot0.y, 3) ?? spot0);
      pet.x = spot.x;
      pet.y = spot.y;
    } else {
      // at their side (not ahead, where a camera behind them can't see it)
      const [fx, fy] = FACING[p.d & 7];
      pet.floor = p.level;
      const g = room.gridFor(p.uid, p.level);
      const want = [
        { x: p.x - fy * 1.3, y: p.y + fx * 1.3 },
        { x: p.x + fy * 1.3, y: p.y - fx * 1.3 },
        { x: p.x + fx * 1.3, y: p.y + fy * 1.3 },
      ];
      const spot =
        want.map((w) => g.nearestOpen(w.x, w.y, 2)).find((o) => o && nearBy(g, p, o)) ??
        g.nearestOpen(p.x, p.y, 3) ??
        ({ x: p.x, y: p.y } as Point);
      pet.x = spot.x;
      pet.y = spot.y;
      pet.d = p.d;
    }
    setNeeds(pet, rec.needs);
    pet.xp = rec.xp;
    pet.level = levelFor(rec.xp);
    pet.tricks = JSON.stringify(rec.tricks ?? {});
    pet.alive = rec.alive;
    pet.wins = rec.wins;
    pet.losses = rec.losses;
    pet.seen = at?.seen ? JSON.stringify(at.seen) : "";
    // (where it was left: in the mode it had — following no one, waiting there)
    const was = at && at.mode !== "died" ? at.mode : "follow";
    pet.mode = rec.needs.energy < SLEEP_AT ? "sleep" : was === "follow" && !p.sid ? "wait" : was;
    pet.a = pet.mode === "sleep" ? ANIM.sit : ANIM.idle;
    records.set(pet.id, rec);
    const seed = (Number(rec.id) * 7919 + (rec.bornAt % 100_000)) >>> 0;
    const traits = cleanTraits(rec.traits, rec.species, rec.look.breed, seed);
    const bonds = bondDecay(cleanBonds(rec.bonds), Math.max(0, now - rec.seenAt) / 3_600_000);
    pet.traits = JSON.stringify(traits);
    pet.bonds = JSON.stringify(bonds);
    runs.set(pet.id, {
      traits,
      memory: cleanMemory(rec.memory),
      bonds,
      intent: null,
      thinkAt: now + 2000,
      lastPlay: now,
      lastPetted: now,
      lastNear: now,
      lastLooked: now,
      seen: new Set(objects(pet.floor).map((o) => o.id)),
      wantAt: 0,
      calledAt: 0,
      begAt: 0,
      shyAt: 0,
      zoomAt: 0,
      pace: 1,
      lost: 0,
      tour: null,
      visited: new Map(),
      sniffed: new Map(),
      trail: [],
      path: [],
      until: now + 1000,
      care: {},
      lesson: 0,
      hungryCall: 0, // (it says so at once if it arrives hungry)
      seenAt: now,
      dirty: false,
      savedAt: now,
      phase: 0,
      since: now,
      greeted: false,
      toyAt: 0,
      anchor: { x: pet.x, y: pet.y },
    });
    showRoutine(pet, runs.get(pet.id) as Run);
    // (left in its owner's office: home again, if it's still theirs)
    if (pet.mode === "home") {
      const h = homeOf(p.uid);
      const r = runs.get(pet.id);
      if (h && r) r.home = { key: h.area.key, level: h.level };
      else pet.mode = "wait";
    }
    room.state.pets.set(pet.id, pet);
    return pet;
  };

  // (cause: hunger, cold, car — a death; gone: lost for good, out of the world even with its owner here)
  const die = (pet: Pet, now: number, cause = "hunger") => {
    for (const t of [...toys.values()]) if (t.holder === pet.id) dropToy(t);
    pet.carry = "";
    pet.alive = false;
    pet.act = "";
    pet.mode = "sleep";
    pet.a = ANIM.sit;
    pet.battle = "";
    const rec = records.get(pet.id);
    if (rec) rec.diedAt = now;
    stop(pet);
    pet.seen = "";
    const kind = cause === "gone" ? "gone" : cause === "hunger" ? "died" : `died_${cause}`;
    // its owner away: out of the world, and they're told at their next login (its place says so)
    if (!owner(pet)) {
      if (rec) rec.place = { x: pet.x, y: pet.y, level: pet.floor, mode: "died", cause };
      void save(pet, now);
      forget(pet);
      return;
    }
    event(pet, kind);
    void save(pet, now);
    // gone: never seen again
    if (cause === "gone") forget(pet);
  };
  // out of the room (saved first): its runs, its record, its toys
  const forget = (pet: Pet) => {
    for (const t of [...toys.values()]) if (t.holder === pet.id) dropToy(t);
    room.state.pets.delete(pet.id);
    runs.delete(pet.id);
    records.delete(pet.id);
  };
  // where it is, in words: the room's name, or the place out on the Grounds
  const whereOf = (pet: Pet): string => {
    const area = room.areaOf({ x: pet.x, y: pet.y, level: pet.floor });
    if (area) return area.name;
    const g = room.gridFor(pet.uid, pet.floor);
    if (g.onLand(pet.x, pet.y)) {
      const at = placeAt(pet.x + GROUND_OFFSET.x, pet.y + GROUND_OFFSET.y);
      if (at.name) return at.name;
    }
    return "where you left it";
  };

  // ── joining and leaving ──────────────────────────────────────────────────
  const bring = async (c: WorldClient, p: Player) => {
    const now = Date.now();
    let recs: PetRecord[];
    try {
      recs = await load(p.uid);
    } catch (e) {
      console.warn("[pets] load", (e as Error).message);
      return;
    }
    if (!room.clients.getById(c.sessionId)) return; // left while we fetched
    if (config.offline) offlineOwners.set(p.uid, p.name);
    for (const rec of recs) {
      // here already — where they left it, or under an earlier session of theirs (another tab, a
      // reconnect): now theirs again, where it is (they go and fetch it; the panel says where)
      const have = room.state.pets.get(String(rec.id));
      if (have) {
        if (have.uid === p.uid) {
          const was = have.sid;
          have.sid = p.sid;
          have.owner = p.name;
          if (!was) arrived(have);
          const far = have.floor !== p.level || Math.hypot(have.x - p.x, have.y - p.y) > FOLLOW_FAR;
          if (!was && have.alive && far) toast(p.sid, `${have.name} is waiting where you left it: ${whereOf(have)}.`);
        }
        continue;
      }
      // died with them away (the room put it out of the world): told now, once
      if (!rec.alive && rec.place?.mode === "died") {
        const cause = rec.place.cause ?? "hunger";
        rec.place = null;
        const pet = place(rec, p, now);
        event(pet, cause === "gone" ? "gone" : cause === "hunger" ? "died" : `died_${cause}`);
        void save(pet, now);
        if (cause === "gone") forget(pet);
        continue;
      }
      // while away: asleep at home, slowly
      if (rec.alive) {
        const hours = Math.max(0, now - (rec.seenAt || now)) / 3_600_000;
        rec.needs = settleNeeds(rec.needs, hours, { asleep: true, online: false });
        if (isDead(rec.needs)) {
          rec.alive = false;
          rec.diedAt = now;
        }
      }
      // (out in the world but not put back yet — the room's start still loading: where it was)
      const at = rec.alive ? (cleanPlace(rec.place) ?? undefined) : undefined;
      const pet = place(rec, p, now, at?.mode === "died" ? undefined : at);
      if (!pet.alive) {
        if (rec.diedAt === now) {
          event(pet, "died");
          void save(pet, now);
        }
        continue;
      }
      if (rec.needs.energy >= SLEEP_AT) say(pet, "happy");
      arrived(pet);
      void save(pet, now);
    }
  };
  // its owner in (D3): the hour remembered
  const arrived = (pet: Pet) => {
    const r = runs.get(pet.id);
    if (!r || !pet.alive) return;
    r.memory = rememberArrival(r.memory, room.state.hour);
    r.dirty = true;
    showRoutine(pet, r);
  };
  // what it knows of their routine, for the panel: the usual hour, the rooms by name, their desk's room
  const showRoutine = (pet: Pet, r: Run) => {
    const rooms = Object.entries(r.memory.rooms ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => room.areaByKey(k)?.name)
      .filter(Boolean);
    const desk = [...room.state.objects.values()]
      .map(fromSchema)
      .find((o) => o.kind === "desk" && Number(o.props?.ownerId) === pet.uid);
    const deskAt = desk
      ? room.areaOf({ x: desk.x + 0.5, y: desk.y + 0.5, level: objLevel(desk, room.map) })?.name
      : null;
    const next = JSON.stringify({ usual: usualHour(r.memory), rooms, desk: deskAt ?? null });
    if (pet.routine !== next) pet.routine = next;
  };

  // The room's start: every pet left out in this world put back where it was,
  // its needs settled (slowly) for the time the world was shut.
  const saveRecord = async (uid: number, rec: PetRecord, patch: Partial<PetRecord>) => {
    if (config.offline) {
      const kept = (offlinePets.get(uid) ?? []).find((x) => x.id === rec.id);
      if (kept) Object.assign(kept, patch);
      offlineOut.delete(rec.id);
      return;
    }
    await api.savePet(uid, rec.id, patch).catch((e) => console.warn("[pets] save", (e as Error).message));
  };
  const putBack = async () => {
    let out: PetOut[];
    try {
      out = await loadOut();
    } catch (e) {
      console.warn("[pets] out", (e as Error).message);
      return;
    }
    const now = Date.now();
    for (const { uid, owner: name, ...rec } of out) {
      if (room.state.pets.has(String(rec.id))) continue; // (its owner's here and brought it already)
      const at = cleanPlace(rec.place);
      if (!at || at.mode === "died") continue;
      const hours = Math.max(0, now - (rec.seenAt || now)) / 3_600_000;
      rec.needs = settleNeeds(rec.needs, hours, { asleep: at.mode === "sleep", online: false });
      if (isDead(rec.needs)) {
        const place = { ...at, mode: "died" as const };
        await saveRecord(uid, rec, { alive: false, diedAt: now, needs: rec.needs, place, seenAt: now });
        continue;
      }
      const here = [...owners().values()].find((q) => q.uid === uid && !q.bot);
      const pet = place(rec, here ?? { uid, sid: "", name }, now, at);
      void save(pet, now);
    }
  };
  void putBack();

  // Hit by a car (the driver's client says so, as cars.ts car:knock): lost, badly hurt and limping
  // (a second hit kills it); with its owner about, only knocked aside.
  room.on("pet:hit", (c, m) => {
    const pet = room.state.pets.get(String(m?.id ?? ""));
    const r = pet && runs.get(pet.id);
    if (!pet || !r || !pet.alive || pet.ride || pet.floor !== 0) return;
    const v = [...room.state.vehicles.values()].find((x) => String(x.seats).split("|")[0] === c.sessionId);
    if (!v || Math.hypot(v.vx, v.vz) < BOARD_V) return;
    const mid = carSpot(v, 0, 0);
    if (Math.hypot(pet.x - mid.x, pet.y - mid.y) > 4) return;
    const now = Date.now();
    if (now - (r.hitAt ?? 0) < HIT_AGAIN_MS) return;
    const twice = !!r.hitAt;
    r.hitAt = now;
    stop(pet);
    pet.act = "";
    // thrown aside, the way the car was going
    const sp = Math.hypot(v.vx, v.vz);
    const g = room.gridFor(pet.uid, 0);
    const to = g.nearestOpen(pet.x + (v.vx / sp) * 1.5, pet.y + (v.vz / sp) * 1.5, 2);
    if (to) {
      pet.x = to.x;
      pet.y = to.y;
    }
    say(pet, "sad");
    if (pet.mode !== "lost") return;
    const n = needsOf(pet);
    n.health = Math.max(0, n.health - LOST.car);
    setNeeds(pet, n);
    r.limpUntil = now + 3_600_000;
    touch(pet);
    if (twice || isDead(n)) die(pet, now, "car");
  });

  room.on("pet:adopt", async (c, m) => {
    const p = owners().get(c.sessionId);
    if (!p || p.bot || !isSpecies(m?.species)) return;
    const have = [...room.state.pets.values()].filter((x) => x.uid === p.uid);
    if (have.length >= PET_MAX) return void toast(c.sessionId, "That's plenty of pets for one person.", "warn");
    const now = Date.now();
    const { id: _, ...rec } = newPet(0, m.species, m.name, m.look, now);
    try {
      const saved = await create(p.uid, rec);
      if (!owners().get(c.sessionId)) return;
      const pet = place(saved, p, now);
      say(pet, "happy");
    } catch (e) {
      console.warn("[pets] adopt", (e as Error).message);
      toast(c.sessionId, "Couldn't adopt right now.", "warn");
    }
  });

  room.on("pet:release", async (c, m) => {
    const pet = room.state.pets.get(String(m?.id ?? ""));
    if (!pet || pet.sid !== c.sessionId) return;
    endBattle(pet.battle, null);
    room.state.pets.delete(pet.id);
    runs.delete(pet.id);
    records.delete(pet.id);
    await remove(pet.uid, Number(pet.id));
  });

  room.on("pet:edit", (c, m) => {
    const pet = room.state.pets.get(String(m?.id ?? ""));
    if (!pet || pet.sid !== c.sessionId) return;
    if (m.name !== undefined) pet.name = cleanName(m.name, pet.name);
    if (m.look !== undefined) pet.look = JSON.stringify(cleanLook(pet.species as Species, m.look));
    if (m.outfit !== undefined) pet.outfit = JSON.stringify(cleanOutfit(m.outfit));
    touch(pet);
  });

  // ── commands ─────────────────────────────────────────────────────────────
  room.on("pet:cmd", (c, m) => {
    const pet = mine(c, m?.id);
    const p = pet && owner(pet);
    if (!pet || !p || !isCommand(m.cmd) || pet.battle) return;
    const r = runs.get(pet.id);
    if (!r) return;
    const now = Date.now();
    // get him (D8): a person, near enough, on their feet, not its owner; leave it: off them
    if (m.cmd === "leave") {
      if (r.target) leaveIt(pet, r);
      return;
    }
    if (m.cmd === "attack") {
      const q = owners().get(String(m.target ?? ""));
      const ok =
        !!q &&
        q.sid !== p.sid &&
        pet.mode === "follow" &&
        q.level === pet.floor &&
        // (in three dimensions: a flier over its head is out of its reach — shared reach.ts)
        near(pet, q, ATTACK.reach) &&
        !q.busy.startsWith("drive:") &&
        !q.busy.startsWith("ride:") &&
        !room.carried.has(q.sid);
      if (!q || !ok) return event(pet, "attackNo");
    }
    // (any other word: off whoever it's holding)
    if (r.target && m.cmd !== "attack" && m.cmd !== "speak") leaveIt(pet, r);
    // lost: only "come" works, and only heard close enough — then it's found
    if (pet.mode === "lost") {
      if (m.cmd === "come" && p.level === pet.floor && Math.hypot(p.x - pet.x, p.y - pet.y) < LOST.call)
        found(pet, r, p, now);
      else event(pet, "unheard");
      return;
    }
    r.lastPetted = now; // spoken to
    setBonds(pet, r, bondUp(r.bonds, p.uid, "word"));
    // a will of its own: obedience, the bond, its mood; a second call within
    // a few seconds always works (it heard you)
    // (sulking — left alone too long: D4 —, it minds less)
    const sulk = (r.sulkUntil ?? 0) > now ? SULK_OBEY : 1;
    const chance = obeyChance(r.traits, bondOf(r.bonds, p.uid), needsOf(pet), r.intent?.drive ?? null) * sulk;
    // (offline — the tests — it always does: the chance itself is tested in shared)
    const roll = config.offline ? 0 : Math.random();
    if (m.cmd !== "speak" && now - r.calledAt > 5000 && roll > chance) {
      r.calledAt = now;
      event(pet, "ignored");
      want(pet, r, "no", now);
      say(pet, "sad");
      raise(pet, r, "ignored");
      return;
    }
    r.calledAt = 0;
    // the office: left there (standing in it with it), or off there on its own
    if (m.cmd === "home" || m.cmd === "gohome") {
      const h = homeOf(p.uid);
      if (!h) return event(pet, "noOffice");
      const there = p.level === h.level && inRoom(p, p.level, h.area.key) && inRoom(pet, pet.floor, h.area.key);
      if (m.cmd === "home" && !there) return event(pet, "notInOffice");
      addXp(pet, XP.command);
      setHome(pet, r, h, now);
      event(pet, m.cmd === "home" ? "home" : "goHome");
      return;
    }
    // (any other mode: it lives with them again)
    if (m.cmd === "come" || m.cmd === "follow" || m.cmd === "stay" || m.cmd === "explore") r.home = undefined;
    addXp(pet, XP.command);
    pet.act = "";
    r.pace = 1;
    r.until = now + 2000;
    switch (m.cmd) {
      case "come":
        pet.mode = "follow";
        pet.a = ANIM.idle;
        r.tour = null;
        goNear(pet, p, 1.2);
        r.until = now + REPATH_MS;
        break;
      case "attack": {
        if (r.target) leaveIt(pet, r);
        r.target = String(m.target);
        r.until = 0;
        say(pet, "angry");
        break;
      }
      case "stay":
        pet.mode = "stay";
        pet.a = ANIM.idle;
        stop(pet);
        break;
      case "follow":
        // (from anywhere: it comes the whole way back, behave's chase)
        pet.mode = "follow";
        pet.a = ANIM.idle;
        r.tour = null;
        stop(pet);
        r.until = now;
        break;
      case "explore":
        pet.mode = "explore";
        pet.a = ANIM.idle;
        r.tour = null;
        stop(pet);
        r.until = now + 700; // (a beat, then off it goes)
        say(pet, "happy");
        break;
      case "sleep":
        sleep(pet);
        break;
      case "speak":
        say(pet, "call");
        break;
      case "trick": {
        if (!isTrick(m.trick) || !learned(tricks(pet), m.trick) || !tricksFor(pet.species as Species).includes(m.trick))
          return;
        stop(pet);
        face(pet, p);
        act(pet, `trick:${m.trick}`);
        if (m.trick === "speak" || m.trick === "talk") say(pet, "call");
        break;
      }
    }
  });

  // (tests only, offline: its needs, bonds and clock set by hand)
  room.on("pet:test", (c, m) => {
    // (and a pet whose owner's away, offline: the tests' run of time on its own)
    const any = room.state.pets.get(String(m?.id ?? ""));
    const pet = config.offline ? (mine(c, m?.id) ?? (any?.alive && !owner(any) ? any : null)) : null;
    const r = pet && runs.get(pet.id);
    if (!pet || !r) return;
    if (m.needs) setNeeds(pet, { ...needsOf(pet), ...m.needs });
    if (m.bonds) setBonds(pet, r, cleanBonds(m.bonds));
    if (m.ago) {
      r.lastPetted -= m.ago;
      r.lastPlay -= m.ago;
    }
    r.thinkAt = 0;
    r.begAt = 0;
    // lost (docs/plan/51-the-pet.md): set down somewhere (the ground floor's tiles), lost there, and
    // `hours` of its needs, the cold and the wild run on at once
    if (m.at && Number.isFinite(m.at.x) && Number.isFinite(m.at.y)) {
      stop(pet);
      pet.floor = 0;
      pet.x = m.at.x;
      pet.y = m.at.y;
    }
    const now = Date.now();
    if (Array.isArray(m.arrivals))
      r.memory = { ...r.memory, arrivals: m.arrivals.filter((h) => typeof h === "number") };
    if (m.lose) lose(pet, r, now);
    if (m.hours) {
      r.seenAt = now - m.hours * 3_600_000;
      settle(pet, r, now);
    }
  });

  // ── care ─────────────────────────────────────────────────────────────────
  room.on("pet:care", (c, m) => {
    const what = m?.what;
    if (what !== "pet" && what !== "snack" && what !== "water") return;
    // anyone near may pet it; only its owner feeds and waters it — or anyone, its owner away
    const any = room.state.pets.get(String(m?.id ?? ""));
    const pet = any?.alive && (what === "pet" || !owner(any)) ? any : mine(c, m?.id);
    const p = pet && owners().get(c.sessionId);
    if (!pet || !p || !near(pet, p) || pet.battle) return;
    const r = runs.get(pet.id);
    if (!r) return;
    const now = Date.now();
    const careKey = what === "pet" ? `pet:${c.sessionId}` : what;
    if (now - (r.care[careKey] ?? 0) < CARE[what].cooldown) return void event(pet, "wait");
    r.care[careKey] = now;
    r.lastPetted = now;
    setBonds(pet, r, bondUp(r.bonds, p.uid, what === "pet" ? "pet" : "feed"));
    raise(pet, r, what === "pet" ? "pet" : "fed");
    const n = needsOf(pet);
    if (what === "pet") n.fun = Math.min(100, n.fun + CARE.pet.fun);
    if (what === "snack") n.food = Math.min(100, n.food + CARE.snack.food);
    if (what === "water") n.water = Math.min(100, n.water + CARE.water.water);
    setNeeds(pet, n);
    addXp(pet, CARE[what].xp);
    stop(pet);
    face(pet, p);
    if (pet.mode === "sleep") wake(pet);
    act(pet, what === "pet" ? "pet" : what === "snack" ? "eat" : "drink");
    say(pet, "happy");
  });

  // a bowl filled by whoever stands at it
  room.on("pet:bowl", (c, m) => {
    const p = owners().get(c.sessionId);
    const o = room.state.objects.get(String(m?.id ?? ""));
    if (!p || !o || (o.kind !== "pet_bowl" && o.kind !== "water_bowl")) return;
    const def = fromSchema(o);
    if (room.reach3(p, def, Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5))) > BOWL_REACH) return;
    void saveObject({ ...def, props: { ...(def.props ?? {}), portions: CARE.bowl.portions } });
  });

  // ── toys ─────────────────────────────────────────────────────────────────
  room.on("pet:play", (c, m) => {
    const pet = mine(c, m?.id);
    const p = pet && owner(pet);
    if (!pet || !p || !near(pet, p) || !isToy(m.toy) || pet.act || pet.battle) return;
    if (!canExert(needsOf(pet))) return void event(pet, "tired");
    const r = runs.get(pet.id);
    if (!r) return;
    if (p.held !== m.toy) return void event(pet, "needToy"); // (it's in your hand or it isn't)
    if (pet.mode === "sleep") wake(pet);
    const toy = m.toy;
    const def = TOY_DEFS[toy];
    if (def.run === "fetch" || def.run === "dart") return; // thrown / pointed instead (toy:throw, laser:point)
    r.toy = toy;
    r.phase = 0;
    r.lastPlay = Date.now();
    r.memory = rememberToy(r.memory, toy);
    setBonds(pet, r, bondUp(r.bonds, p.uid, "play"));
    raise(pet, r, "play");
    stop(pet);
    face(pet, p);
    if (toy === "rope") pet.carry = "rope";
    act(pet, `play:${toy}`, { x: p.x, y: p.y });
  });

  // ── toys in the world (shared/pets.ts) ───────────────────────────────────
  let toyId = 1;
  const toys = room.state.toys;
  const dropToy = (t: ToyState) => {
    if (t.holder) {
      const pet = room.state.pets.get(t.holder);
      if (pet) {
        pet.carry = "";
        if (pet.act.startsWith("fetch")) pet.act = "";
      }
    }
    for (const r of runs.values()) if (r.after === t.id) r.after = undefined;
    toys.delete(t.id);
  };
  const toysOf = (sid: string) => [...toys.values()].filter((t) => t.by === sid);
  // Where a throw from `from` towards `to` lands: along the line, as far as
  // the floor goes and never across a wall; the toy stops where it's stopped.
  const landing = (uid: number, from: Point, to: Point): Point => {
    const g = room.gridFor(uid, [...owners().values()].find((q) => q.uid === uid)?.level);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return from;
    const n = Math.ceil(d / 0.2);
    let last = { x: from.x, y: from.y };
    let tx = Math.floor(from.x);
    let ty = Math.floor(from.y);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const pt = { x: from.x + dx * k, y: from.y + dy * k };
      const nx = Math.floor(pt.x);
      const ny = Math.floor(pt.y);
      if ((nx !== tx || ny !== ty) && !g.step(tx, ty, nx, ny)) break;
      if (!g.fits(pt.x, pt.y, 0.08)) break;
      tx = nx;
      ty = ny;
      last = pt;
    }
    return last;
  };

  room.on("toy:take", (c, m) => {
    const p = owners().get(c.sessionId);
    if (!p || !isToy(m?.toy)) return;
    if (m.id) {
      const o = room.state.objects.get(String(m.id));
      if (!o || o.kind !== "toy_box") return;
      if (room.reach3(p, fromSchema(o), Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5))) > BOWL_REACH) return;
    } else if (![...room.state.pets.values()].some((x) => x.sid === c.sessionId && x.alive)) return;
    for (const t of toysOf(c.sessionId)) dropToy(t); // one toy of yours out at a time
    p.held = m.toy;
    p.heldAt = Date.now();
    p.busy = "";
  });

  room.on("toy:throw", (c, m) => {
    const p = owners().get(c.sessionId);
    if (!p || !isToyHeld(p.held) || !(THROWN as readonly string[]).includes(p.held)) return;
    const x = Number(m?.x);
    const y = Number(m?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    let dx = x - p.x;
    let dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > THROW_RANGE) {
      dx *= THROW_RANGE / d;
      dy *= THROW_RANGE / d;
    }
    const to = landing(p.uid, p, { x: p.x + dx, y: p.y + dy });
    for (const t of toysOf(c.sessionId)) dropToy(t);
    const t = new ToyState();
    t.id = `t${toyId++}`;
    t.kind = p.held;
    t.state = "flying";
    t.by = c.sessionId;
    t.fromX = p.x;
    t.fromY = p.y;
    t.x = to.x;
    t.y = to.y;
    t.at = Date.now();
    t.dur = flightMs(Math.hypot(to.x - p.x, to.y - p.y));
    toys.set(t.id, t);
    p.held = "";
    p.heldAt = 0;
    p.d = dirFromDelta(to.x - p.x, to.y - p.y, p.d as 0);
    // the arm follows through
    p.busy = "throw";
    room.clock.setTimeout(() => {
      if (p.busy === "throw") p.busy = "";
    }, 700);
  });

  room.on("toy:pick", (c, m) => {
    const p = owners().get(c.sessionId);
    const t = toys.get(String(m?.id ?? ""));
    if (!p || !t || t.state !== "floor" || p.held) return;
    const g = room.groundOf(p.uid, p.level, t.x, t.y);
    if (room.reachSpot(p, t, Math.hypot(p.x - t.x, p.y - t.y), g, g + 0.3) > 1.8) return;
    dropToy(t);
    p.held = t.kind;
    p.heldAt = Date.now();
  });

  room.on("laser:point", (c, m) => {
    const p = owners().get(c.sessionId);
    if (!p || p.held !== "laser") return;
    const x = Number(m?.x);
    const y = Number(m?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const to = landing(p.uid, p, { x, y });
    let t = toysOf(c.sessionId).find((z) => z.kind === "laser");
    if (!t) {
      for (const z of toysOf(c.sessionId)) dropToy(z);
      t = new ToyState();
      t.id = `t${toyId++}`;
      t.kind = "laser";
      t.by = c.sessionId;
      toys.set(t.id, t);
    }
    t.state = "floor";
    t.x = to.x;
    t.y = to.y;
    t.at = Date.now();
    t.dur = 0;
    p.d = dirFromDelta(to.x - p.x, to.y - p.y, p.d as 0);
  });

  // A pet with nothing to do and a toy of its owner's on the floor goes for it.
  const maybeFetch = (pet: Pet, r: Run) => {
    const p = owner(pet);
    if (!p) return;
    for (const t of toys.values()) {
      if (t.by !== pet.sid || t.state !== "floor" || t.at === r.toyAt) continue;
      if (!FETCHED.has(t.kind)) continue;
      if ([...runs.values()].some((o) => o !== r && o.after === t.id)) continue;
      if (!go(pet, { x: t.x, y: t.y })) continue;
      r.after = t.id;
      r.toyAt = t.at;
      r.phase = 0;
      r.lastPlay = Date.now();
      r.memory = rememberToy(r.memory, t.kind);
      setBonds(pet, r, bondUp(r.bonds, p.uid, "play"));
      act(pet, "fetch:go", { x: t.x, y: t.y });
      say(pet, "happy");
      return;
    }
  };

  const tickToys = (now: number) => {
    for (const t of [...toys.values()]) {
      if (t.state === "flying" && now > t.at + t.dur) t.state = "floor";
      // forgotten on the floor: gone after a while, and with its owner
      if (t.state === "floor" && now - t.at > 180_000) dropToy(t);
      else if (!owners().get(t.by)) dropToy(t);
    }
  };

  // ── lessons ──────────────────────────────────────────────────────────────
  room.on("pet:teach", (c, m) => {
    const pet = mine(c, m?.id);
    const p = pet && owner(pet);
    if (!pet || !p || !near(pet, p) || !isTrick(m.trick) || pet.act || pet.battle) return;
    if (!tricksFor(pet.species as Species).includes(m.trick)) return;
    const r = runs.get(pet.id);
    const now = Date.now();
    if (!r || now - r.lesson < LESSON_COOLDOWN) return void event(pet, "wait");
    if (learned(tricks(pet), m.trick)) return;
    if (!canExert(needsOf(pet))) return void event(pet, "tired");
    r.lesson = now;
    if (pet.mode === "sleep") wake(pet);
    stop(pet);
    face(pet, p);
    act(pet, `lesson:${m.trick}`);
  });

  // ── battles ──────────────────────────────────────────────────────────────
  let battleId = 1;
  const fighterOf = (pet: Pet, hp?: number): Fighter => {
    const stats = statsOf(pet.species as Species, pet.level);
    const max = hpFor(stats);
    return {
      species: pet.species as Species,
      stats,
      hp: hp ?? max,
      max,
      poison: 0,
      guard: false,
      special: learned(tricks(pet), SPECIES_DEFS[pet.species as Species].signature),
    };
  };
  const poison = new Map<string, { a: number; b: number }>();

  room.on("pet:challenge", (c, m) => {
    const me = owners().get(c.sessionId);
    const my = mine(c, m?.mine);
    const theirs = room.state.pets.get(String(m?.id ?? ""));
    if (!me || !my || !theirs || !theirs.alive || theirs.sid === c.sessionId) return;
    const them = owner(theirs);
    if (!them) return;
    if (my.battle || theirs.battle) return void toast(c.sessionId, "They're already in a battle.", "warn");
    if (Math.hypot(me.x - them.x, me.y - them.y) > BATTLE.reach) return;
    if (!canExert(needsOf(my))) return void event(my, "tired");
    if (!canExert(needsOf(theirs))) return void toast(c.sessionId, `${theirs.name} isn't up for it right now.`, "warn");
    if (
      [...room.state.battles.values()].some(
        (b) => b.phase === "offer" && (b.sidA === c.sessionId || b.sidB === them.sid),
      )
    )
      return;
    const b = new PetBattle();
    b.id = `b${battleId++}`;
    b.a = my.id;
    b.b = theirs.id;
    b.sidA = c.sessionId;
    b.sidB = them.sid;
    b.phase = "offer";
    b.until = Date.now() + BATTLE.challengeMs;
    room.state.battles.set(b.id, b);
    const to = client(them.sid);
    if (to)
      room.send(to, "pet:challenge", {
        battle: b.id,
        from: c.sessionId,
        fromName: me.name,
        pet: my.id,
        mine: theirs.id,
      });
  });

  room.on("pet:answer", (c, m) => {
    const b = room.state.battles.get(String(m?.battle ?? ""));
    if (!b || b.phase !== "offer" || b.sidB !== c.sessionId) return;
    const A = room.state.pets.get(b.a);
    const B = room.state.pets.get(b.b);
    if (!m.accept || !A || !B || A.battle || B.battle) {
      room.state.battles.delete(b.id);
      toast(b.sidA, m.accept ? "That battle can't start." : "They passed on the battle.");
      return;
    }
    const fa = fighterOf(A);
    const fb = fighterOf(B);
    b.hpA = fa.hp;
    b.hpB = fb.hp;
    b.maxA = fa.max;
    b.maxB = fb.max;
    b.phase = "pick";
    b.round = 1;
    b.until = Date.now() + BATTLE.pickMs;
    poison.set(b.id, { a: 0, b: 0 });
    for (const pet of [A, B]) {
      pet.battle = b.id;
      if (pet.mode === "sleep") wake(pet);
      stop(pet);
      act(pet, "battle");
    }
    // face off, two tiles apart, between the owners
    const pa = owner(A);
    const pb = owner(B);
    if (pa && pb) {
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const ux = pb.x - pa.x;
      const uy = pb.y - pa.y;
      const l = Math.hypot(ux, uy) || 1;
      const g = room.gridFor(A.uid, A.floor);
      // two different tiles along the line between the owners, a step apart
      let sa: Point | null = null;
      let sb: Point | null = null;
      for (let d = 1; d <= 3 && (!sa || !sb || (sa.x === sb.x && sa.y === sb.y)); d += 0.5) {
        sa = g.nearestOpen(mx - (ux / l) * d, my - (uy / l) * d, 3);
        sb = g.nearestOpen(mx + (ux / l) * d, my + (uy / l) * d, 3);
      }
      if (sa && sb && sa.x === sb.x && sa.y === sb.y) sb = g.nearestOpen(sa.x + 1.5, sa.y + 1.5, 3);
      if (sa) go(A, sa);
      if (sb) go(B, sb);
    }
  });

  room.on("pet:move", (c, m) => {
    const b = room.state.battles.get(String(m?.battle ?? ""));
    if (!b || b.phase !== "pick" || !isMove(m.move)) return;
    if (c.sessionId === b.sidA && !b.moveA) b.moveA = m.move;
    else if (c.sessionId === b.sidB && !b.moveB) b.moveB = m.move;
    else return;
    if (b.moveA && b.moveB) playRound(b);
  });

  const playRound = (b: PetBattle) => {
    const A = room.state.pets.get(b.a);
    const B = room.state.pets.get(b.b);
    if (!A || !B) return endBattle(b.id, null);
    const ma = (b.moveA || "attack") as Move;
    const mb = (b.moveB || "attack") as Move;
    const ps = poison.get(b.id) ?? { a: 0, b: 0 };
    const fa = { ...fighterOf(A, b.hpA), poison: ps.a };
    const fb = { ...fighterOf(B, b.hpB), poison: ps.b };
    const r = resolveRound(fa, fb, ma, mb, Math.random);
    poison.set(b.id, { a: r.a.poison, b: r.b.poison });
    b.hpA = r.a.hp;
    b.hpB = r.b.hp;
    b.log = JSON.stringify(r.log satisfies BattleEvent[]);
    b.phase = "anim";
    b.until = Date.now() + BATTLE.animMs;
    face(A, B);
    face(B, A);
    act(A, b.hpA <= 0 ? "ko" : ma);
    act(B, b.hpB <= 0 ? "ko" : mb);
    if (ma === "attack" || ma === "special") say(A, "angry");
    if (mb === "attack" || mb === "special") say(B, "angry");
  };

  const endBattle = (id: string, winner: "a" | "b" | "draw" | null) => {
    const b = id ? room.state.battles.get(id) : undefined;
    if (!b) return;
    poison.delete(b.id);
    const A = room.state.pets.get(b.a);
    const B = room.state.pets.get(b.b);
    for (const [pet, side] of [
      [A, "a"],
      [B, "b"],
    ] as const) {
      if (!pet) continue;
      pet.battle = "";
      pet.act = "";
      if (winner) {
        const won = winner === side;
        if (won) pet.wins++;
        else pet.losses++;
        setNeeds(pet, afterBattle(needsOf(pet), won));
        addXp(pet, won ? XP.win : XP.loss);
        const r = runs.get(pet.id);
        if (r && winner !== "draw") {
          raise(pet, r, won ? "won" : "lost");
          // the loser keeps away from the winner for a while
          if (!won) r.memory = holdGrudge(r.memory, side === "a" ? b.b : b.a, Date.now());
        }
        event(pet, winner === "draw" ? "draw" : won ? "won" : "lost");
        say(pet, won ? "happy" : "sad");
      }
    }
    if (winner) {
      b.phase = "done";
      b.winner = winner;
      b.until = Date.now() + 6000;
    } else room.state.battles.delete(b.id);
  };

  const tickBattles = (now: number) => {
    for (const b of [...room.state.battles.values()]) {
      if (now < b.until) continue;
      if (b.phase === "offer") {
        room.state.battles.delete(b.id);
        toast(b.sidA, "No answer to the challenge.");
      } else if (b.phase === "pick") playRound(b);
      else if (b.phase === "anim") {
        const A = room.state.pets.get(b.a);
        const B = room.state.pets.get(b.b);
        if (!A || !B) {
          endBattle(b.id, null);
          continue;
        }
        const ps = poison.get(b.id) ?? { a: 0, b: 0 };
        const w = battleWinner(
          { ...fighterOf(A, b.hpA), poison: ps.a },
          { ...fighterOf(B, b.hpB), poison: ps.b },
          b.round,
        );
        if (w) endBattle(b.id, w);
        else {
          b.round++;
          b.moveA = "";
          b.moveB = "";
          b.phase = "pick";
          b.until = now + BATTLE.pickMs;
          act(A, "battle");
          act(B, "battle");
        }
      } else room.state.battles.delete(b.id);
    }
  };

  // ── living ───────────────────────────────────────────────────────────────
  const sleep = (pet: Pet) => {
    pet.mode = "sleep";
    pet.act = "";
    // (at home: its office's bed, not one out in the building)
    const home = runs.get(pet.id)?.home;
    const map = room.levelMap(pet.floor);
    const bed = objects(pet.floor).find(
      (o) =>
        o.kind === "pet_bed" &&
        (!home || areaAt(map, o.x + 0.5, o.y + 0.5)?.key === home.key) &&
        findPath(room.gridFor(pet.uid, pet.floor), pet, { x: o.x + 0.5, y: o.y + 0.5 }),
    );
    if (bed) go(pet, { x: bed.x + 0.5, y: bed.y + 0.5 });
    else {
      stop(pet);
      pet.a = ANIM.sit;
    }
  };
  // (awake: back to following — or to its office, if that's where it lives now)
  const wake = (pet: Pet) => {
    pet.mode = runs.get(pet.id)?.home ? "home" : "follow";
    pet.a = ANIM.idle;
  };

  const settle = (pet: Pet, r: Run, now: number) => {
    const hours = (now - r.seenAt) / 3_600_000;
    r.seenAt = now;
    // (its owner away: slowly, as when it's home with them — docs/plan/51-the-pet.md)
    // (lost: hungry and thirsty at the full rate, owner or not; and the cold, out in the dark)
    const p = owner(pet);
    const lost = pet.mode === "lost";
    const n = settleNeeds(needsOf(pet), hours, { asleep: pet.mode === "sleep", online: !!p || lost });
    const cold = lost && coldOut(pet, now);
    if (cold) n.health = Math.max(0, n.health - coldHurt(hours));
    setNeeds(pet, n);
    r.dirty = true;
    if (isDead(n)) return die(pet, now, cold && n.food > 0 && n.water > 0 ? "cold" : "hunger");
    // lost in the wild: a chance it's never seen again (offline, the tests: always)
    if (lost && wildAt(pet) && (config.offline ? 0 : Math.random()) < goneChance(hours)) return die(pet, now, "gone");
    // not with its owner: where it is, for them to find (the panel, the GPS)
    if (!lost) {
      const away = pet.mode !== "follow" || !p;
      if (away) setSeen(pet, now, undefined, false);
      else if (pet.seen) pet.seen = "";
    }
    // neglected (no one's attention for long, fun low): a sulk (D4)
    if (n.fun < 40 && now - Math.max(r.lastPetted, r.lastPlay) > NEGLECT_MS && (r.sulkUntil ?? 0) < now)
      r.sulkUntil = now + SULK_MS;
    // late in the world's evening, at home or waiting: to bed (D3)
    const hour = room.state.hour;
    const late = hour >= BED_FROM || hour < BED_TO;
    if (late && (pet.mode === "home" || pet.mode === "wait") && n.energy < WAKE_AT && !pet.act && !pet.battle) {
      sleep(pet);
      return;
    }
    if (pet.mode === "sleep" && n.energy >= WAKE_AT && !(late && (r.home || !p))) {
      wake(pet);
      say(pet, "happy");
    } else if (pet.mode !== "sleep" && n.energy < SLEEP_AT && !pet.act && !pet.battle) sleep(pet);
    void p; // (hunger and thirst are on its mind: think())
  };
  const byDistance = (list: WorldObjectDef[], pet: Pet) =>
    [...list].sort((a, b) => Math.hypot(a.x - pet.x, a.y - pet.y) - Math.hypot(b.x - pet.x, b.y - pet.y));
  const centre = (o: WorldObjectDef) => ({ x: o.x + 0.5, y: o.y + 0.5 });
  const reachable = (pet: Pet) => (o: WorldObjectDef) => !!findPath(room.gridFor(pet.uid, pet.floor), pet, centre(o));
  // a bowl with something in it: over to it, and a portion gone (finishAct eat / drink)
  const goEat = (pet: Pet, r: Run, bowl: WorldObjectDef) => {
    r.bowl = bowl.id;
    r.memory = rememberBowl(r.memory, bowl.x, bowl.y, bowl.kind);
    go(pet, centre(bowl));
    act(pet, bowl.kind === "pet_bowl" ? "eat" : "drink");
    r.phase = 0;
  };
  // how loud it is where it stands: a battle next to it, a radio, a crowd
  const noiseAt = (pet: Pet): number => {
    let noise = 0;
    for (const b of room.state.battles.values()) {
      if (b.phase !== "pick" && b.phase !== "anim") continue;
      const A = room.state.pets.get(b.a);
      if (A && Math.hypot(A.x - pet.x, A.y - pet.y) < 8) noise = 1;
    }
    if (
      noise < 0.4 &&
      objects(pet.floor).some(
        (o) => isRadio(o.kind) && o.props?.playing === true && Math.hypot(o.x + 0.5 - pet.x, o.y + 0.5 - pet.y) < 5,
      )
    )
      noise = 0.4;
    let crowd = 0;
    for (const q of owners().values()) if (Math.hypot(q.x - pet.x, q.y - pet.y) < 4) crowd++;
    if (crowd > 4) noise = Math.max(noise, 0.3);
    return noise;
  };
  const hourNow = () => room.state.hour; // (the world's: São Paulo's, shared clock.ts)
  const isTv = (o: WorldObjectDef) => o.kind.includes("tv") && o.props?.playing !== false;

  // ── its mind ─────────────────────────────────────────────────────────────
  // once a second with nothing on: what it wants most, an icon over its head,
  // and a plan — the room's paths and acts do the rest (finishAct)
  const think = (pet: Pet, r: Run, p: Player, now: number) => {
    r.thinkAt = now + THINK_MS;
    const n = needsOf(pet);
    const others = [...room.state.pets.values()].filter(
      (o) => o !== pet && o.alive && !o.battle && Math.hypot(o.x - pet.x, o.y - pet.y) < 10,
    );
    if (others.some((o) => Math.hypot(o.x - pet.x, o.y - pet.y) < 2.2)) r.lastNear = now;
    // a parrot repeats a sound it just heard
    if (pet.species === "parrot" && !r.echo) {
      const heard = others.find((o) => o.say && now - o.sayAt < 1500 && Math.hypot(o.x - pet.x, o.y - pet.y) < 6);
      if (heard) r.echo = { mood: heard.say as PetMood, at: now + 1500 };
    }
    const friends = others.filter((o) => {
      const or = runs.get(o.id);
      return (
        !!or && compatible(r.traits, or.traits) && !hasGrudge(r.memory, o.id, now) && !hasGrudge(or.memory, pet.id, now)
      );
    });
    // time beside people counts a little
    for (const q of owners().values())
      if (Math.hypot(q.x - pet.x, q.y - pet.y) < 3 && Math.random() < 1 / 60)
        setBonds(pet, r, bondUp(r.bonds, q.uid, "near"));
    const hour = hourNow();
    const d = drives(n, r.traits, {
      now,
      night: nightOf(hour),
      noise: noiseAt(pet),
      lastPlay: r.lastPlay,
      lastPetted: r.lastPetted,
      lastNear: r.lastNear,
      lastLooked: r.lastLooked,
      newThings: objects(pet.floor).filter((o) => !r.seen.has(o.id)).length,
      pets: friends.length,
    });
    const was = r.intent;
    r.intent = choose(d, r.intent, now);
    if (!r.intent) {
      if (was) pet.want = "";
      // nothing pressing: now and then something of the day (M4)
      if (isDusk(hour) && r.traits.energy > 0.6 && now - r.zoomAt > ZOOM_AGAIN_MS && Math.random() < 0.02)
        return zoom(pet, r, now);
      if (
        n.fun < 55 &&
        Math.random() < 0.04 &&
        ![...owners().values()].some((q) => Math.hypot(q.x - pet.x, q.y - pet.y) < 4)
      ) {
        const tv = byDistance(objects(pet.floor).filter(isTv), pet).find(
          (o) => Math.hypot(o.x - pet.x, o.y - pet.y) < 9,
        );
        if (tv && goNear(pet, centre(tv), 1.6)) {
          r.phase = 0;
          act(pet, `watch:${tv.id}`, centre(tv));
        }
      }
      return;
    }
    if (r.intent !== was || now - r.wantAt > WANT_AGAIN_MS) want(pet, r, WANT_ICON[r.intent.drive], now);
    if (pet.mode === "stay") return; // (it stays put, but says what it wants)
    plan(pet, r, p, now, friends);
  };
  const plan = (pet: Pet, r: Run, p: Player, now: number, friends: Pet[]) => {
    const drive = r.intent?.drive;
    const n = needsOf(pet);
    const g = room.gridFor(pet.uid, pet.floor);
    const begin = (what: string, at?: Point) => {
      r.phase = 0;
      act(pet, what, at);
    };
    switch (drive) {
      case "hunger":
      case "thirst": {
        const kind = drive === "thirst" ? "water_bowl" : "pet_bowl";
        const full = byDistance(
          objects(pet.floor).filter((o) => o.kind === kind && portions(o) > 0),
          pet,
        ).find(reachable(pet));
        if (full) return goEat(pet, r, full);
        // an empty bowl: it stands there and paws at it; none: it begs at its owner
        if (now - r.hungryCall > HUNGRY_CALL_MS && (n.food < 25 || n.water < 25)) {
          r.hungryCall = now;
          say(pet, "sad");
          event(pet, drive === "thirst" ? "thirsty" : "hungry");
        }
        if (now - r.begAt < BEG_AGAIN_MS) return;
        r.begAt = now;
        const empty = byDistance(
          objects(pet.floor).filter((o) => o.kind === kind),
          pet,
        ).find(reachable(pet));
        if (empty) {
          if (goNear(pet, centre(empty), 0.9)) begin("beg", centre(empty));
        } else if (goNear(pet, p, 1.2)) begin("beg", p);
        return;
      }
      case "rest": {
        if (n.energy < SLEEP_AT) return sleep(pet);
        if (now - r.begAt < BEG_AGAIN_MS) return;
        r.begAt = now;
        // its bed (or house) for a lie-down; taken: it sits beside it; none: its favourite spot
        const bed = byDistance(
          objects(pet.floor).filter((o) => o.kind === "pet_bed" || o.kind === "pet_house"),
          pet,
        ).find(reachable(pet));
        const taken =
          !!bed &&
          [...room.state.pets.values()].some(
            (o) => o !== pet && Math.hypot(o.x - bed.x - 0.5, o.y - bed.y - 0.5) < 0.6,
          );
        const at = bed && !taken ? centre(bed) : favouriteSpot(r.memory);
        if (at && go(pet, at)) return begin("rest", at);
        if (bed && taken && goNear(pet, centre(bed), 1.1)) return begin("trick:sit");
        return;
      }
      case "play": {
        // a toy of its owner's on the floor: after it; a friend: a romp; else it asks, ball in its eyes
        if (canExert(n)) maybeFetch(pet, r);
        if (pet.act) return;
        if (friends.length && Math.random() < 0.5) return romp(pet, r, friends[0]);
        if (pet.species === "cat" && Math.random() < 0.35) {
          const post = byDistance(
            objects(pet.floor).filter((o) => o.kind === "scratch_post"),
            pet,
          ).find((o) => Math.hypot(o.x - pet.x, o.y - pet.y) < 8);
          if (post && goNear(pet, centre(post), 0.9)) {
            begin("scratch");
            r.lastPlay = now;
            return;
          }
        }
        if (now - r.begAt < BEG_AGAIN_MS) return;
        r.begAt = now;
        if (goNear(pet, p, 1.1)) begin("nudge", p);
        return;
      }
      case "attention": {
        if (now - r.begAt < BEG_AGAIN_MS) return;
        r.begAt = now;
        if (goNear(pet, p, 1.0)) begin("nudge", p);
        return;
      }
      case "curiosity": {
        const fresh = byDistance(
          objects(pet.floor).filter((o) => !r.seen.has(o.id)),
          pet,
        );
        const target = fresh.find((o) => goNear(pet, centre(o), 1.0));
        if (target) return begin(`seek:${target.id}`, centre(target));
        for (const o of fresh) r.seen.add(o.id); // (can't get to them: never mind)
        // nothing new: a wander somewhere else
        for (let i = 0; i < 6; i++) {
          const t = { x: pet.x + (Math.random() * 2 - 1) * 8, y: pet.y + (Math.random() * 2 - 1) * 8 };
          if (g.fits(t.x, t.y) && go(pet, t)) return begin("seek:");
        }
        r.lastLooked = now;
        return;
      }
      case "comfort": {
        if (now - r.begAt < BEG_AGAIN_MS) return;
        r.begAt = now;
        const den = byDistance(
          objects(pet.floor).filter((o) => o.kind === "pet_house" || o.kind === "pet_bed"),
          pet,
        ).find(reachable(pet));
        if (den && go(pet, centre(den))) return begin("hide");
        if (goNear(pet, p, 0.9)) begin("hide");
        return;
      }
      case "company": {
        if (friends.length) romp(pet, r, friends[0]);
        return;
      }
    }
  };
  // over to a friend for a romp (a jump / hop together: finishAct company)
  const romp = (pet: Pet, r: Run, other: Pet) => {
    if (!goNear(pet, other, 1.1)) return;
    r.phase = 0;
    act(pet, `company:${other.id}`, other);
  };
  // zoomies: a few laps of wherever it is, flat out
  const zoom = (pet: Pet, r: Run, now: number) => {
    r.zoomAt = now;
    r.pace = ZOOM_PACE;
    r.phase = 0;
    act(pet, "zoom");
    say(pet, "happy");
  };
  // a step away from a stranger (a timid pet that doesn't know them yet)
  const shy = (pet: Pet, r: Run, now: number) => {
    if (now - r.shyAt < 4000 || pet.act || pet.mode === "sleep") return;
    for (const q of owners().values()) {
      if (q.sid === pet.sid || Math.hypot(q.x - pet.x, q.y - pet.y) > 1.3) continue;
      if (!shyOf(r.traits, bondOf(r.bonds, q.uid))) continue;
      r.shyAt = now;
      const dx = pet.x - q.x;
      const dy = pet.y - q.y;
      const k = 2 / Math.max(0.2, Math.hypot(dx, dy));
      const to = room.gridFor(pet.uid, pet.floor).nearestOpen(pet.x + dx * k, pet.y + dy * k, 2);
      if (to) go(pet, to);
      return;
    }
  };

  // what it's doing comes to an end
  const finishAct = (pet: Pet, r: Run, now: number) => {
    const [what, arg] = pet.act.split(":");
    const since = now - pet.actAt;
    const p = owner(pet);
    switch (what) {
      case "pet":
        if (since > PET_MS) pet.act = "";
        break;
      case "idle": {
        const own = IDLE_SETS[pet.species as Species].find((x) => x.kind === arg);
        if (!own || since > own.ms) pet.act = "";
        break;
      }
      case "beg":
      case "nudge":
      case "seek":
      case "hide":
      case "watch": {
        // walking there first; then a while at it
        if (r.path.length) break;
        if (r.phase === 0) {
          r.phase = 1;
          pet.actAt = now;
          if (what === "watch" || what === "seek" || pet.actX || pet.actY) face(pet, { x: pet.actX, y: pet.actY });
          if ((what === "beg" || what === "nudge") && p && !(pet.actX || pet.actY)) face(pet, p);
          break;
        }
        const ms =
          what === "beg"
            ? BEG_MS
            : what === "nudge"
              ? NUDGE_MS
              : what === "seek"
                ? SNIFF_MS
                : what === "watch"
                  ? WATCH_MS
                  : 6000;
        if (since < ms) break;
        if (what === "hide" && noiseAt(pet) > 0.2 && since < 60_000) break;
        pet.act = "";
        if (what === "seek") {
          for (const o of objects(pet.floor)) r.seen.add(o.id);
          r.lastLooked = now;
        }
        if (what === "watch") {
          r.lastLooked = now;
          const n = needsOf(pet);
          n.fun = Math.min(100, n.fun + 4);
          setNeeds(pet, n);
        }
        break;
      }
      case "rest": {
        if (r.path.length) break;
        pet.act = "";
        r.memory = rememberSpot(r.memory, pet.x, pet.y);
        r.dirty = true;
        const n = needsOf(pet);
        if (nightOf(hourNow()) > 0.5 || n.energy < 45) sleep(pet);
        else act(pet, "trick:chill");
        break;
      }
      case "company": {
        if (r.path.length) break;
        pet.act = "";
        const other = room.state.pets.get(arg);
        if (!other) break;
        face(pet, other);
        r.lastNear = now;
        r.lastPlay = now;
        act(pet, pet.species === "rabbit" ? "trick:hop" : pet.species === "parrot" ? "trick:dance" : "trick:jump");
        say(pet, "happy");
        break;
      }
      case "greet": {
        if (r.path.length) break;
        pet.act = "";
        const q = owners().get(arg);
        if (q) face(pet, q);
        act(pet, pet.species === "rabbit" ? "trick:hop" : "trick:jump");
        say(pet, "happy");
        break;
      }
      case "zoom": {
        if (r.path.length) break;
        if (r.phase < 3) {
          const g = room.gridFor(pet.uid, pet.floor);
          let gone = false;
          for (let i = 0; i < 8 && !gone; i++) {
            const t = { x: pet.x + (Math.random() * 2 - 1) * 7, y: pet.y + (Math.random() * 2 - 1) * 7 };
            if (Math.hypot(t.x - pet.x, t.y - pet.y) > 3 && g.fits(t.x, t.y) && go(pet, t)) gone = true;
          }
          r.phase++;
          if (gone) break;
        }
        pet.act = "";
        r.pace = 1;
        const n = needsOf(pet);
        n.fun = Math.min(100, n.fun + 8);
        n.energy = Math.max(0, n.energy - 4);
        setNeeds(pet, n);
        break;
      }
      case "scratch":
        if (!r.path.length && since > 5000) {
          pet.act = "";
          const n = needsOf(pet);
          n.fun = Math.min(100, n.fun + 6);
          setNeeds(pet, n);
        }
        break;
      case "eat":
      case "drink": {
        if (r.bowl) {
          // walking to the bowl, then a while at it, then a portion gone
          if (r.path.length) break;
          if (r.phase === 0) {
            r.phase = 1;
            pet.actAt = now;
            break;
          }
          if (since < EAT_MS) break;
          const o = room.state.objects.get(r.bowl);
          r.bowl = undefined;
          pet.act = "";
          if (!o) break;
          const def = fromSchema(o);
          const left = portions(def);
          if (left <= 0) break;
          void saveObject({ ...def, props: { ...(def.props ?? {}), portions: left - 1 } });
          const n = needsOf(pet);
          if (what === "eat") n.food = Math.min(100, n.food + CARE.bowl.food);
          else n.water = Math.min(100, n.water + CARE.bowl.water);
          setNeeds(pet, n);
          addXp(pet, what === "eat" ? XP.feed : XP.water);
          say(pet, "happy");
          if (what === "eat" && r.traits.energy > 0.55 && now - r.zoomAt > ZOOM_AGAIN_MS && Math.random() < 0.5)
            zoom(pet, r, now);
        } else if (since > EAT_MS * 0.6) pet.act = "";
        break;
      }
      case "trick":
        if (since > (TRICK_MS[arg as keyof typeof TRICK_MS] ?? 2000)) {
          pet.act = "";
          const n = needsOf(pet);
          n.fun = Math.min(100, n.fun + 10);
          setNeeds(pet, n);
          addXp(pet, XP.trick);
        }
        break;
      case "lesson":
        if (since > LESSON_MS) {
          pet.act = "";
          const t = tricks(pet);
          const wit = statsOf(pet.species as Species, pet.level).wit;
          const was = t[arg] ?? 0;
          t[arg] = Math.min(100, was + lessonGain(wit) * learnK(r.traits));
          pet.tricks = JSON.stringify(t);
          const n = needsOf(pet);
          n.energy = Math.max(0, n.energy - 5);
          setNeeds(pet, n);
          if (t[arg] >= 100 && was < 100) {
            addXp(pet, XP.learned);
            event(pet, "learned", { trick: arg });
            say(pet, "happy");
          } else touch(pet);
        }
        break;
      case "fetch": {
        const t = r.after ? toys.get(r.after) : undefined;
        if (!t) {
          pet.act = "";
          pet.carry = "";
          r.after = undefined;
          break;
        }
        if (arg === "go") {
          // the toy moved on (a laser dot): after it again
          if (t.kind === "laser" && (Math.hypot(t.x - pet.actX, t.y - pet.actY) > 0.2 || t.at !== r.toyAt)) {
            r.toyAt = t.at;
            pet.actX = t.x;
            pet.actY = t.y;
            if (!go(pet, { x: t.x, y: t.y })) pet.act = "";
            break;
          }
          if (r.path.length) break;
          if (Math.hypot(t.x - pet.x, t.y - pet.y) > FETCH.reach + 0.3) {
            if (!go(pet, { x: t.x, y: t.y })) {
              pet.act = "";
              r.after = undefined;
            }
            break;
          }
          if (t.kind === "laser") {
            // a pounce on the dot, and it's still there…
            face(pet, t);
            act(pet, "fetch:pounce");
            break;
          }
          t.state = "mouth";
          t.holder = pet.id;
          pet.carry = t.kind;
          act(pet, "fetch:back");
          if (p && !goNear(pet, p, 0.9)) {
            // can't get back: it's dropped here
            t.state = "floor";
            t.holder = "";
            t.x = pet.x;
            t.y = pet.y;
            t.at = now;
            t.dur = 0;
            pet.carry = "";
            pet.act = "";
            r.after = undefined;
          }
        } else if (arg === "pounce") {
          if (since > 900) {
            pet.act = "";
            r.after = undefined;
            const n = needsOf(pet);
            n.fun = Math.min(100, n.fun + 4);
            setNeeds(pet, n);
            if (Math.random() < 0.3) addXp(pet, 2);
          }
        } else if (arg === "back") {
          if (t.holder !== pet.id) {
            pet.act = "";
            break;
          }
          t.x = pet.x;
          t.y = pet.y;
          if (r.path.length || !p) break;
          if (Math.hypot(p.x - pet.x, p.y - pet.y) > 1.5) {
            if (!goNear(pet, p, 0.9)) {
              r.until = now + 800;
            }
            break;
          }
          // dropped at the owner's feet
          face(pet, p);
          const k = 0.45 / Math.max(0.01, Math.hypot(p.x - pet.x, p.y - pet.y));
          t.state = "floor";
          t.holder = "";
          t.x = pet.x + (p.x - pet.x) * k;
          t.y = pet.y + (p.y - pet.y) * k;
          t.at = now;
          t.dur = 0;
          r.toyAt = t.at;
          pet.carry = "";
          pet.act = "";
          r.after = undefined;
          const n = needsOf(pet);
          n.fun = Math.min(
            100,
            n.fun + FETCH.fun * (SPECIES_DEFS[pet.species as Species].favourite === t.kind ? 2 : 1),
          );
          n.energy = Math.max(0, n.energy - FETCH.energy);
          setNeeds(pet, n);
          addXp(pet, FETCH.xp);
          say(pet, "happy");
        }
        break;
      }
      case "play": {
        const toy = r.toy ?? "ball";
        const def = TOY_DEFS[toy as keyof typeof TOY_DEFS] ?? TOY_DEFS.ball;
        if (def.run === "fetch" && p) {
          // out to the toy, back to the owner
          if (!r.path.length && r.phase === 0) {
            r.phase = 1;
            goNear(pet, p, 1.1);
          }
        } else if (def.run === "dart" && p && !r.path.length) {
          const g = room.gridFor(pet.uid, pet.floor);
          for (let i = 0; i < 6; i++) {
            const t = {
              x: p.x + (Math.random() * 2 - 1) * def.range,
              y: p.y + (Math.random() * 2 - 1) * def.range,
            };
            if (g.fits(t.x, t.y) && go(pet, t)) {
              pet.actX = t.x;
              pet.actY = t.y;
              break;
            }
          }
        } else if (p && def.run !== "fetch" && def.run !== "dart") face(pet, p);
        if (since > def.ms) {
          pet.act = "";
          pet.carry = "";
          stop(pet);
          const n = needsOf(pet);
          n.fun = Math.min(100, n.fun + playFun(pet.species as Species, toy as Toy));
          n.energy = Math.max(0, n.energy - PLAY.energy);
          setNeeds(pet, n);
          addXp(pet, XP.play);
          say(pet, "happy");
        }
        break;
      }
      case "move": {
        // its own moves (D2–D4); lying down by a busy owner lasts while they're busy
        if (r.path.length) break;
        if (arg === "lie" && r.quiet) break;
        if (since > (MOVE_MS[arg] ?? 2000)) pet.act = "";
        break;
      }
      default:
        break;
    }
  };

  // (beside `p`: its owner, or the spot it waits at)
  const idle = (pet: Pet, r: Run, p: Point, now: number) => {
    const roll = Math.random();
    const sp = pet.species as Species;
    const n = needsOf(pet);
    r.until = now + 2500 + Math.random() * 4000;
    if (roll < 0.3) {
      // a sniff about: a step or two nearby, still beside them
      const g = room.gridFor(pet.uid, pet.floor);
      const t = { x: p.x + (Math.random() * 2 - 1) * 1.6, y: p.y + (Math.random() * 2 - 1) * 1.6 };
      if (g.fits(t.x, t.y) && nearBy(g, p, t)) go(pet, t);
    } else if (roll < 0.45) {
      face(pet, p);
    } else if (roll < 0.6 && n.energy < 70) {
      // a sit-down for a bit
      act(pet, "trick:sit");
      r.until = now + 6000;
    } else if (roll < 0.68 && n.fun > 60) {
      const known = tricksFor(sp).filter((t) => learned(tricks(pet), t) && t !== "playdead");
      if (known.length) {
        face(pet, p);
        act(pet, `trick:${known[Math.floor(Math.random() * known.length)]}`);
      }
    } else if (roll < 0.74 && sp === "cat") {
      const post = objects(pet.floor).find(
        (o) => o.kind === "scratch_post" && Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.y) < 6,
      );
      if (post && goNear(pet, { x: post.x + 0.5, y: post.y + 0.5, d: 0 }, 0.9)) {
        act(pet, "scratch");
        r.until = now + 7000;
      }
    } else if (roll < 0.9) {
      // something of its own kind
      const own = IDLE_SETS[sp];
      const pick = own[Math.floor(Math.random() * own.length)];
      if (pick.when(n)) {
        stop(pet);
        if (pick.face) face(pet, p);
        act(pet, `idle:${pick.kind}`);
        r.until = now + pick.ms + 800;
      }
    } else if (n.fun > 40) say(pet, "happy");
    // a parrot bobs to a radio playing near it
    if (sp === "parrot" && !pet.act && Math.random() < 0.25) {
      const playing = objects(pet.floor).find(
        (o) => isRadio(o.kind) && o.props?.playing === true && Math.hypot(o.x + 0.5 - pet.x, o.y + 0.5 - pet.y) < 6,
      );
      if (playing) act(pet, "trick:dance");
    }
  };

  // how much quicker than its own pace it goes to catch up: none close by, up
  // to a little more than a person's run when they're far ahead
  const catchUp = (pet: Pet, d: number) => {
    if (d <= 4) return 1;
    const own = SPECIES_DEFS[pet.species as Species].pace;
    return Math.max(1, Math.min(CATCH_UP / own, 1 + (d - 4) / 5));
  };

  // ── exploring ─────────────────────────────────────────────────────────────
  // Off round the whole world on its own: over to the room it has been in
  // least lately, a sniff at two or three things there (or a corner of it),
  // then on to the next, until it's called back. Booths and the standup ring
  // stay private.
  const inArea = (a: AreaDef, at: Point) => at.x >= a.x && at.x < a.x + a.w && at.y >= a.y && at.y < a.y + a.h;
  // somewhere open in the room (or anywhere), as far as it can find from
  // where it has stopped lately: a big open floor gets covered, not circled
  const spotIn = (pet: Pet, r: Run, a: AreaDef | null): Point | null => {
    const g = room.gridFor(pet.uid, pet.floor);
    const map = room.levelMap(pet.floor);
    let best: Point | null = null;
    let far = -1;
    for (let i = 0; i < 16; i++) {
      const t = a
        ? { x: a.x + 0.5 + Math.random() * (a.w - 1), y: a.y + 0.5 + Math.random() * (a.h - 1) }
        : { x: 0.5 + Math.random() * (map.width - 1), y: 0.5 + Math.random() * (map.height - 1) };
      const at = areaAt(map, t.x, t.y);
      if (!g.fits(t.x, t.y) || (at && KEEP_OUT.has(at.kind)) || (a && at?.key !== a.key)) continue;
      const d = Math.min(...[pet, ...r.trail].map((q) => Math.hypot(q.x - t.x, q.y - t.y)));
      if (d > far) {
        far = d;
        best = t;
      }
    }
    return best;
  };
  const explore = (pet: Pet, r: Run, now: number) => {
    const map = room.levelMap(pet.floor);
    const here = areaAt(map, pet.x, pet.y);
    if (here) r.visited.set(here.key, now);
    r.trail = [...r.trail.slice(-7), { x: pet.x, y: pet.y }];
    r.until = now + EXPLORE_REST_MS + Math.random() * 2500;
    const tour = r.tour;
    if (tour && tour.legs > 0) {
      tour.legs--;
      const area = map.areas.find((a) => a.key === tour.area) ?? null;
      // a thing in this room it hasn't had its nose in lately
      const things = byDistance(
        objects(pet.floor).filter(
          (o) => (!area || inArea(area, centre(o))) && now - (r.sniffed.get(o.id) ?? 0) > SNIFFED_AGAIN_MS,
        ),
        pet,
      );
      for (const o of things.slice(0, 4)) {
        if (!goNear(pet, centre(o), 1.0)) continue;
        r.sniffed.set(o.id, now);
        r.seen.add(o.id);
        r.phase = 0;
        return act(pet, `seek:${o.id}`, centre(o));
      }
      // nothing there: a corner of it
      const t = spotIn(pet, r, area);
      if (t && go(pet, t)) {
        r.phase = 0;
        act(pet, "seek:");
      }
      return;
    }
    // on to the next room: the one it saw longest ago (never, first), nearer
    // ones first among those, a little chance in it
    const rooms = map.areas
      .filter((a) => !KEEP_OUT.has(a.kind) && a.w * a.h >= 4 && (a.key !== here?.key || a.w * a.h >= BIG_ROOM))
      .map((a) => {
        const age = Math.min(now - (r.visited.get(a.key) ?? 0), 15 * 60_000) / 1000;
        const dist = Math.hypot(a.x + a.w / 2 - pet.x, a.y + a.h / 2 - pet.y);
        return { a, score: age - dist * 2 + Math.random() * 40 };
      })
      .sort((x, y) => y.score - x.score);
    for (const { a } of rooms.slice(0, 5)) {
      const t = spotIn(pet, r, a);
      if (!t || !go(pet, t)) continue;
      r.visited.set(a.key, now);
      r.tour = { area: a.key, legs: 1 + Math.floor(Math.random() * 3) + (a.w * a.h >= BIG_ROOM ? 3 : 0) };
      if (Math.random() < 0.5) say(pet, "happy");
      return;
    }
    // no rooms on this map (or none it can get into): anywhere a good way off
    for (let i = 0; i < 6; i++) {
      const t = spotIn(pet, r, null);
      if (t && Math.hypot(t.x - pet.x, t.y - pet.y) > 6 && go(pet, t)) {
        r.tour = { area: null, legs: 1 };
        return;
      }
    }
  };

  // A pet to its owner's floor (with them up or down the stairs, out of a lift): beside them there,
  // on a spot it can walk to them from (docs/plan/52-the-pet-two.md, D1 — the nearest open spot
  // put it behind the lift, where it couldn't get out). None yet (the car's doors still shut):
  // false, and it's asked again.
  const comeAlong = (pet: Pet, p: Player): boolean => {
    const g = room.gridFor(pet.uid, p.level);
    const [fx, fy] = FACING[p.d & 7];
    const want = [
      { x: p.x - fy * 1.1, y: p.y + fx * 1.1 },
      { x: p.x + fy * 1.1, y: p.y - fx * 1.1 },
      { x: p.x - fx * 1.1, y: p.y - fy * 1.1 },
      { x: p.x + fx * 1.1, y: p.y + fy * 1.1 },
    ];
    const at = want.map((w) => g.nearestOpen(w.x, w.y, 2)).find((o) => o && nearBy(g, p, o));
    if (!at) return false;
    stop(pet);
    pet.act = "";
    pet.floor = p.level;
    pet.x = at.x;
    pet.y = at.y;
    pet.z = 0;
    const r = runs.get(pet.id);
    if (r) {
      r.away = 0;
      r.stuck = 0;
    }
    return true;
  };
  // In a lift's car with its owner: beside them, its floor and height theirs, sitting; out of the
  // ride when they are (the doors opening), standing in the car with them.
  const liftRide = (pet: Pet, r: Run, p: Player | undefined) => {
    if (!p || !room.carried.has(p.sid)) {
      pet.ride = "";
      pet.z = 0;
      pet.a = ANIM.idle;
      if (p && !room.gridFor(pet.uid, p.level).fits(pet.x, pet.y)) comeAlong(pet, p);
      return;
    }
    const off = r.liftAt ?? { x: -0.6, y: 0.4 };
    pet.floor = p.level;
    pet.x = p.x + off.x;
    pet.y = p.y + off.y;
    pet.z = p.z;
    pet.a = ANIM.sit;
  };

  // Waiting where it was left: a sniff about the spot, a sit, its own little
  // things (idle, round the spot as if it were its owner); back to it if it strayed.
  const waitAbout = (pet: Pet, r: Run, now: number) => {
    if (r.path.length || now <= r.until) return;
    if (!r.anchor) r.anchor = { x: pet.x, y: pet.y };
    const a = r.anchor;
    if (Math.hypot(pet.x - a.x, pet.y - a.y) > WAIT_RADIUS && go(pet, a)) {
      r.until = now + 1500;
      return;
    }
    idle(pet, r, a, now);
  };
  // With its owner away: what it was doing, then waiting (or exploring, or asleep).
  const alone = (pet: Pet, r: Run, now: number) => {
    setMood(pet, r, now);
    r.quiet = false;
    if (pet.act === "battle" || pet.act === "ko" || isMove(pet.act)) return;
    if (pet.mode === "home" && !pet.act && awaitOwner(pet, r, now)) return;
    if (pet.mode === "lost") return lostAbout(pet, r, now);
    if (pet.mode === "home") return homeAbout(pet, r, now);
    if (pet.act) return finishAct(pet, r, now);
    // (following no one: it waits where it is)
    if (pet.mode === "follow") {
      pet.mode = "wait";
      r.anchor = { x: pet.x, y: pet.y };
      r.pace = 1;
    }
    if (pet.mode === "explore" && !r.path.length && now > r.until) explore(pet, r, now);
    else if (pet.mode === "wait") waitAbout(pet, r, now);
    else if (pet.mode === "sleep" && !r.path.length) pet.a = ANIM.sit;
  };

  // ── home: its owner's office (docs/plan/51-the-pet.md, D2) ───────────────
  // the room someone owns (their office), on whichever floor
  const homeOf = (uid: number): { area: AreaDef; level: number } | null => {
    for (const level of floorsOf(room.map)) {
      const area = room.levelMap(level).areas.find((a) => a.ownerId === uid && a.kind !== "booth");
      if (area) return { area, level };
    }
    return null;
  };
  const inRoom = (at: { x: number; y: number }, level: number, key: string) =>
    areaAt(room.levelMap(level), at.x, at.y)?.key === key;
  const setHome = (pet: Pet, r: Run, h: { area: AreaDef; level: number }, now: number) => {
    stop(pet);
    pet.act = "";
    pet.mode = "home";
    pet.a = ANIM.idle;
    r.home = { key: h.area.key, level: h.level };
    r.tour = null;
    r.pace = 1;
    r.until = now + 600;
    touch(pet);
  };
  // At home: to its office if it isn't there yet (up or down from the floor's way in, then on
  // foot); in it, a bowl when it's hungry or thirsty, a leg about the room, its own little things.
  // Never out of it on its own. The room no longer its owner's: it waits where it is.
  const homeAbout = (pet: Pet, r: Run, now: number) => {
    const h = r.home;
    const cur = homeOf(pet.uid);
    if (!h || !cur || cur.area.key !== h.key) {
      pet.mode = "wait";
      r.home = undefined;
      r.anchor = { x: pet.x, y: pet.y };
      return;
    }
    if (pet.act) return finishAct(pet, r, now);
    if (r.path.length || now <= r.until) return;
    if (pet.floor !== h.level || !inRoom(pet, pet.floor, h.key)) {
      if (pet.floor !== h.level) {
        const e = room.levelEntry(h.level, pet.uid);
        if (!e) return;
        pet.floor = h.level;
        pet.x = e.x;
        pet.y = e.y;
      }
      const t = spotIn(pet, r, cur.area);
      r.until = now + (t && go(pet, t) ? 1000 : 3000);
      return;
    }
    const n = needsOf(pet);
    for (const [kind, low] of [
      ["water_bowl", n.water < HUNGRY_AT],
      ["pet_bowl", n.food < HUNGRY_AT],
    ] as const) {
      if (!low) continue;
      const bowl = objects(pet.floor).find(
        (o) => o.kind === kind && portions(o) > 0 && inRoom({ x: o.x + 0.5, y: o.y + 0.5 }, pet.floor, h.key),
      );
      if (bowl) return goEat(pet, r, bowl);
    }
    // a leg about the room (only to spots in it), or its own little things where it is — never
    // idle()'s sniff about, which can step out of an open door
    const own = IDLE_SETS[pet.species as Species].filter((x) => x.when(n));
    if (Math.random() < 0.5 || !own.length) {
      const t = spotIn(pet, r, cur.area);
      if (t) go(pet, t);
    } else act(pet, `idle:${own[Math.floor(Math.random() * own.length)].kind}`);
    r.until = now + 3000 + Math.random() * 5000;
  };

  // ── lost (docs/plan/51-the-pet.md, D4) ───────────────────────────────────
  // its spot in the Grounds' metres
  const metres = (pet: Pet) => ({ x: pet.x + GROUND_OFFSET.x, z: pet.y + GROUND_OFFSET.y });
  // out under the sky: the ground floor, in no building (the lot's on the ground floor's map,
  // not its land, and it's outside all the same)
  const outside = (pet: Pet) => {
    if (pet.floor !== 0) return false;
    const m = metres(pet);
    return !BUILDINGS.some((b) => inBuilt(b, m.x, m.z));
  };
  // out in the cold: outside, dark, and out of every lamp's pool (a blackout puts them out)
  const coldOut = (pet: Pet, now: number) => {
    if (!outside(pet) || nightness(room.state.hour) < 0.5) return false;
    const m = metres(pet);
    return blackoutAt(now, room.state.hour) || !inLampPool(m.x, m.z);
  };
  // the wild: deep woods, the river's ice, the county road past its closure
  const wildAt = (pet: Pet) => {
    if (!outside(pet)) return false;
    const m = metres(pet);
    if (m.x > ROAD_CLOSED.x) return true;
    if (treeDensity(m.x, m.z) >= WILD_TREES) return true;
    return distToLine(RIVER.line, m.x, m.z) < RIVER.w / 2;
  };
  // (lost: a sighting, a circle to search; else where it waits, a pin)
  const setSeen = (pet: Pet, now: number, by?: string, lost = true) => {
    const m = metres(pet);
    const seen: PetSeen = { x: m.x, z: m.z, level: pet.floor, where: whereOf(pet), at: now };
    if (lost) seen.lost = true;
    if (by) seen.by = by;
    pet.seen = JSON.stringify(seen);
  };
  // Lost: where it is is where it was last seen; its owner told.
  const lose = (pet: Pet, r: Run, now: number) => {
    stop(pet);
    pet.act = "";
    pet.mode = "lost";
    pet.a = ANIM.idle;
    r.behind = 0;
    r.leader = undefined;
    r.tour = null;
    r.trail = [];
    r.pace = 1;
    r.until = now + 1500;
    setSeen(pet, now);
    say(pet, "sad");
    event(pet, "astray");
    touch(pet);
  };
  // Found by its owner: to them, overjoyed, following again.
  const found = (pet: Pet, r: Run, p: Player, now: number) => {
    pet.mode = "follow";
    pet.seen = "";
    r.leader = undefined;
    r.behind = 0;
    r.pace = 1;
    stop(pet);
    pet.act = "";
    setBonds(pet, r, bondUp(r.bonds, p.uid, "pet"));
    goNear(pet, p, 1.2);
    say(pet, "happy");
    event(pet, "found");
    r.until = now + REPATH_MS;
    touch(pet);
  };
  // A leg about the land: somewhere it hasn't just been, 10–40 tiles off; after dark, now and then,
  // towards a lamp (shelter, if it's lucky).
  const wanderLeg = (pet: Pet, r: Run, now: number) => {
    const g = room.gridFor(pet.uid, pet.floor);
    let to: Point | null = null;
    if (outside(pet) && nightness(room.state.hour) >= 0.5 && Math.random() < 0.25) {
      const m = metres(pet);
      const lamp = LAMPS.map((l) => ({ l, d: Math.hypot(l.x - m.x, l.z - m.z) }))
        .filter((x) => x.d < LEG_MAX && x.d > 2)
        .sort((a, b) => a.d - b.d)[0];
      if (lamp) to = g.nearestOpen(lamp.l.x - GROUND_OFFSET.x, lamp.l.z - GROUND_OFFSET.y, 3);
    }
    for (let i = 0; i < 8 && !to; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = LEG_MIN + Math.random() * (LEG_MAX - LEG_MIN);
      const t = g.nearestOpen(pet.x + Math.cos(a) * d, pet.y + Math.sin(a) * d, 3);
      if (t && !r.trail.some((q) => Math.hypot(q.x - t.x, q.y - t.y) < 8)) to = t;
    }
    const path = to && findPath(g, pet, to, LEG_NODES);
    if (path?.length && to) {
      r.path = path;
      r.trail = [...r.trail.slice(-5), to];
      r.until = now + (path.length / SPECIES_DEFS[pet.species as Species].pace) * 1000 + 2000 + Math.random() * 5000;
    } else r.until = now + 2000;
    if (Math.random() < 0.35) say(pet, "sad");
  };
  // Lost, each think: its owner near (found); someone it knows near (it follows them); else about the land.
  const lostAbout = (pet: Pet, r: Run, now: number) => {
    const p = owner(pet);
    if (p && p.level === pet.floor && !carOf(p) && Math.hypot(p.x - pet.x, p.y - pet.y) < LOST.found)
      return found(pet, r, p, now);
    let lead = r.leader ? owners().get(r.leader) : undefined;
    if (lead && (lead.level !== pet.floor || Math.hypot(lead.x - pet.x, lead.y - pet.y) > LOST.sight + 5))
      lead = undefined;
    if (!lead)
      lead = [...owners().values()].find(
        (q) =>
          !q.bot &&
          q.uid !== pet.uid &&
          q.level === pet.floor &&
          !carOf(q) &&
          Math.hypot(q.x - pet.x, q.y - pet.y) < LOST.found &&
          greets(bondOf(r.bonds, q.uid)),
      );
    r.leader = lead?.sid;
    if (pet.act) return finishAct(pet, r, now);
    if (lead) {
      // after a friend: they may bring it home
      if (Math.hypot(lead.x - pet.x, lead.y - pet.y) > FOLLOW_NEAR && now > r.until) {
        goNear(pet, lead, 1.3);
        r.until = now + REPATH_MS;
      }
      return;
    }
    if (!r.path.length && now > r.until) wanderLeg(pet, r, now);
  };
  // Someone near a lost pet sees it: its last sighting; its owner told (not too often).
  const sightings = (pet: Pet, r: Run, now: number) => {
    for (const q of owners().values()) {
      if (q.bot || q.uid === pet.uid || q.level !== pet.floor) continue;
      if (Math.hypot(q.x - pet.x, q.y - pet.y) > LOST.sight) continue;
      setSeen(pet, now, q.name);
      const o = owner(pet);
      if (o && now - (r.toldAt ?? 0) > SIGHT_TOLD_MS) {
        r.toldAt = now;
        toast(o.sid, `${q.name.split(" ")[0]} saw ${pet.name} — ${whereOf(pet)}.`);
      }
      return;
    }
  };

  // ── the car (docs/plan/51-the-pet.md) ────────────────────────────────────
  // the car someone's in (their busy: cars.ts), "" for none
  const carOf = (p: Player): string =>
    p.busy.startsWith("drive:") ? p.busy.slice(6) : p.busy.startsWith("ride:car:") ? p.busy.slice(9) : "";
  // a car-local point (x forward, z right, from its CoG: shared car SEATS_OF) in tiles
  const carSpot = (v: Vehicle, lx: number, lz: number): Point => {
    const ca = Math.cos(v.a);
    const sa = Math.sin(v.a);
    return { x: v.x + ca * lx - sa * lz - GROUND_OFFSET.x, y: v.z + sa * lx + ca * lz - GROUND_OFFSET.y };
  };
  // a seat for a pet: nobody in it, no other pet in it (-1: none — a full car, or not a car)
  const freeSeat = (v: Vehicle, except = ""): number => {
    const seats = SEATS_OF[v.kind as CarKind];
    if (!seats) return -1;
    const people = String(v.seats).split("|");
    const pets = new Set<number>();
    for (const q of room.state.pets.values()) if (q.ride === v.id && q.id !== except) pets.add(q.seat);
    return PET_SEATS.find((i) => i < seats.at.length && !people[i] && !pets.has(i)) ?? -1;
  };
  // in its seat, turned with the car
  const seatPet = (pet: Pet, v: Vehicle) => {
    const [lx, lz] = SEATS_OF[v.kind as CarKind].at[pet.seat];
    const at = carSpot(v, lx, lz);
    pet.x = at.x;
    pet.y = at.y;
    pet.floor = 0;
    pet.d = dirFromDelta(Math.cos(v.a), Math.sin(v.a));
  };
  // Its owner in a car, it following and close: to a free door and in. False: not
  // for it (too far, the car moving, no room) — it runs after them as ever.
  const board = (pet: Pet, r: Run, p: Player, now: number): boolean => {
    const v = room.state.vehicles.get(carOf(p));
    if (!v || pet.floor !== 0 || Math.hypot(v.vx, v.vz) > BOARD_V) return false;
    const mid = carSpot(v, 0, 0);
    if (Math.hypot(pet.x - mid.x, pet.y - mid.y) > BOARD_NEAR) return false;
    const seat = freeSeat(v, pet.id);
    if (seat < 0) return false;
    // its ways in: the seat's door, the other side's, round the back (shared SEATS_OF out) — the
    // nearest it can stand at (a parked car beside may block a door)
    const g = room.gridFor(pet.uid, 0);
    const ways = SEATS_OF[v.kind as CarKind].out[seat]
      .map(([lx, lz]) => carSpot(v, lx, lz))
      .map((d) => (g.fits(d.x, d.y) ? d : g.nearestOpen(d.x, d.y, 1.2)))
      .filter((d): d is Point => !!d)
      .sort((a, b) => Math.hypot(a.x - pet.x, a.y - pet.y) - Math.hypot(b.x - pet.x, b.y - pet.y));
    if (!ways.length) return false;
    if (ways.some((d) => Math.hypot(pet.x - d.x, pet.y - d.y) < BOARD_REACH)) {
      stop(pet);
      pet.act = "";
      pet.ride = v.id;
      pet.seat = seat;
      pet.a = ANIM.sit;
      r.pace = 1;
      seatPet(pet, v);
      say(pet, "happy");
      event(pet, "boarded");
      return true;
    }
    // (the HUD's "Waiting for Rex…": car/cars.ts)
    pet.act = "board";
    r.pace = BOARD_PACE;
    const end = r.path[r.path.length - 1];
    if ((!end || !ways.some((d) => Math.hypot(end.x - d.x, end.y - d.y) < 0.8)) && now > r.until) {
      // (the first way it can walk to, nearest first)
      r.until = now + (ways.some((d) => go(pet, d)) ? REPATH_MS : 1000);
    }
    return true;
  };
  // Out of the car: by its door (the owner's side if that's shut), following them — or, its
  // owner gone, waiting there.
  const hopOut = (pet: Pet, r: Run, v: Vehicle | undefined) => {
    pet.ride = "";
    pet.act = "";
    pet.a = ANIM.idle;
    pet.floor = 0;
    if (v) {
      const g = room.gridFor(pet.uid, 0);
      const doors = SEATS_OF[v.kind as CarKind]?.out[pet.seat] ?? [];
      const spots = doors.map(([lx, lz]) => carSpot(v, lx, lz));
      const at = spots.find((s) => g.fits(s.x, s.y)) ?? (spots[0] && g.nearestOpen(spots[0].x, spots[0].y, 4)) ?? null;
      if (at) {
        pet.x = at.x;
        pet.y = at.y;
      }
    }
    r.path = [];
    r.until = 0;
    if (!owner(pet)) {
      pet.mode = "wait";
      r.anchor = { x: pet.x, y: pet.y };
    }
  };
  // Riding: in its seat as the car goes; out when its owner is (or the car's put away).
  const ride = (pet: Pet, r: Run) => {
    const v = room.state.vehicles.get(pet.ride);
    const p = owner(pet);
    if (!v || !p || carOf(p) !== v.id) return hopOut(pet, r, v);
    // someone sat in its seat: another, or out
    if (String(v.seats).split("|")[pet.seat]) {
      const other = freeSeat(v, pet.id);
      if (other < 0) return hopOut(pet, r, v);
      pet.seat = other;
    }
    seatPet(pet, v);
    pet.a = ANIM.sit;
  };

  // In the way (D1): in a doorway (a door's or a lift's), right in front of its owner where they
  // face, or someone else walking into it.
  const inTheWay = (pet: Pet, p: Player): boolean => {
    for (const o of objects(pet.floor)) {
      if (isDoorKind(o.kind)) {
        const c = openingCentre(o);
        if (Math.hypot(c.x - pet.x, c.y - pet.y) < 0.8) return true;
      } else if (o.kind === "elevator" && inLiftDoorway(o, pet, 0.3)) return true;
    }
    const [fx, fy] = FACING[p.d & 7];
    const ax = pet.x - p.x;
    const ay = pet.y - p.y;
    const ahead = (ax * fx + ay * fy) / Math.hypot(fx, fy);
    if (ahead > 0.4 && Math.abs(ax * fy - ay * fx) / Math.hypot(fx, fy) < 0.6 && Math.hypot(ax, ay) < 1.6) return true;
    for (const q of owners().values())
      if (
        q.sid !== p.sid &&
        q.level === pet.floor &&
        q.a === ANIM.walk &&
        Math.hypot(q.x - pet.x, q.y - pet.y) < ASIDE_NEAR
      )
        return true;
    return false;
  };
  // A step to its owner's side (left or right, whichever it can walk to), out of the way.
  const stepAside = (pet: Pet, r: Run, p: Player, now: number) => {
    const g = room.gridFor(pet.uid, pet.floor);
    const [fx, fy] = FACING[p.d & 7];
    const l = Math.hypot(fx, fy);
    const sides = [
      { x: p.x - (fy / l) * 1.2, y: p.y + (fx / l) * 1.2 },
      { x: p.x + (fy / l) * 1.2, y: p.y - (fx / l) * 1.2 },
      { x: p.x - (fx / l) * 1.2, y: p.y - (fy / l) * 1.2 },
    ].sort((a, b) => Math.hypot(a.x - pet.x, a.y - pet.y) - Math.hypot(b.x - pet.x, b.y - pet.y));
    pet.act = "";
    for (const t of sides) {
      const at = g.nearestOpen(t.x, t.y, 1);
      if (at && Math.hypot(at.x - pet.x, at.y - pet.y) > 0.3 && go(pet, at)) break;
    }
    r.until = now + 1500;
  };

  // ── get him (docs/plan/52-the-pet-two.md, D8) ─────────────────────────────
  // Over: the one it held is up again (as from a car's knock: not hurt), it's its owner's again.
  const leaveIt = (pet: Pet, r: Run) => {
    const q = r.target ? owners().get(r.target) : undefined;
    if (q && q.bitBy === pet.id) {
      q.bitBy = "";
      q.fellAt = 0;
    }
    r.target = undefined;
    if (pet.act === "attack") pet.act = "";
    r.pace = 1;
    stop(pet);
  };
  // After them, and holding them down: till it's called off, its owner's gone off or out, they're
  // gone (or in a car, a lift, out of reach), or it's too tired. Biting tires it.
  const getHim = (pet: Pet, r: Run, p: Player, now: number) => {
    const q = r.target ? owners().get(r.target) : undefined;
    const far = Math.hypot(p.x - pet.x, p.y - pet.y) > ATTACK.leash || p.level !== pet.floor;
    if (
      !q ||
      far ||
      q.level !== pet.floor ||
      q.busy.startsWith("drive:") ||
      q.busy.startsWith("ride:") ||
      room.carried.has(q.sid) ||
      pet.energy < SLEEP_AT
    )
      return leaveIt(pet, r);
    const d = Math.hypot(q.x - pet.x, q.y - pet.y);
    if (q.bitBy === pet.id) {
      // at them: it holds on, growling and biting, tiring
      if (d > ATTACK.bite + 0.6) {
        q.bitBy = "";
        q.fellAt = 0;
      } else {
        face(pet, q);
        if (pet.act !== "attack") act(pet, "attack", q);
        else if (now - pet.actAt > 900) pet.actAt = now; // (the bite's swing again)
        if (now - (r.barkAt ?? 0) > 2000) {
          r.barkAt = now;
          say(pet, "angry");
          const n = needsOf(pet);
          n.energy = Math.max(0, n.energy - 1);
          setNeeds(pet, n);
        }
        r.alertUntil = now + 2000;
        return;
      }
    }
    if (d <= ATTACK.bite && !q.bitBy) {
      // got them: down they go, and stay down
      stop(pet);
      q.bitBy = pet.id;
      q.fellAt = now;
      q.fellYaw = Math.atan2(q.y - pet.y, q.x - pet.x);
      addXp(pet, XP.command);
      // they won't forget it: no friend of theirs now, and their own pets bear it a grudge
      const b = { ...r.bonds, [String(q.uid)]: 0 };
      setBonds(pet, r, b);
      for (const o of room.state.pets.values()) {
        const or = runs.get(o.id);
        if (or && o.uid === q.uid) or.memory = holdGrudge(or.memory, pet.id, now);
      }
      toast(
        q.sid,
        `${pet.name} (${p.name.split(" ")[0]}'s dog) has you! Only ${p.name.split(" ")[0]} can call it off.`,
        "warn",
      );
      act(pet, "attack", q);
      say(pet, "angry");
      return;
    }
    // on its way: a run, a fresh path as they move
    r.pace = BOARD_PACE;
    pet.act = "";
    const end = r.path[r.path.length - 1];
    if ((!end || Math.hypot(end.x - q.x, end.y - q.y) > 0.8) && now > r.until) {
      r.until = now + 400;
      if (!goNear(pet, q, 0.6)) r.until = now + 1500;
    }
  };

  // ── its world, its mood, its owner's routine (docs/plan/52-the-pet-two.md, D2–D4) ──
  // its owner busy: on a call, heads down at their desk, "do not disturb", in a booth
  const busyOf = (p: Player) =>
    p.focus || p.status === "dnd" || onCallState(p.phone) || room.areaOf(p)?.kind === "booth";
  // Beside its owner, a look round: a stranger in the dark, a car going by, another dog; a storm.
  // Returns true when it's taken up with one.
  const react = (pet: Pet, r: Run, p: Player, now: number): boolean => {
    if (pet.act || r.path.length) return false;
    const out = outside(pet);
    const dark = nightness(room.state.hour) >= 0.5;
    // a stranger near them after dark, outside: a bark, between them
    if (out && dark && now - (r.barkAt ?? 0) > BARK_AGAIN_MS) {
      const q = [...owners().values()].find(
        (o) =>
          o.sid !== p.sid &&
          !o.bot &&
          o.level === pet.floor &&
          Math.hypot(o.x - p.x, o.y - p.y) < STRANGER_NEAR &&
          bondOf(r.bonds, o.uid) < 10,
      );
      if (q) {
        r.barkAt = now;
        r.alertUntil = now + BARK_AGAIN_MS;
        say(pet, "angry");
        face(pet, q);
        const mid = room.gridFor(pet.uid, pet.floor).nearestOpen((p.x + q.x) / 2, (p.y + q.y) / 2, 1);
        if (mid) go(pet, mid);
        return true;
      }
    }
    // a car going by fast, not theirs: a bark and a few bounds after it, then back
    if (out && !carOf(p) && now - (r.chaseAt ?? 0) > CHASE_AGAIN_MS) {
      for (const v of room.state.vehicles.values()) {
        if (Math.hypot(v.vx, v.vz) < CAR_FAST) continue;
        const c = carSpot(v, 0, 0);
        const d = Math.hypot(c.x - pet.x, c.y - pet.y);
        if (d > CAR_NEAR) continue;
        r.chaseAt = now;
        say(pet, "call");
        const k = Math.min(3, d) / Math.max(0.01, d);
        const to = room
          .gridFor(pet.uid, pet.floor)
          .nearestOpen(pet.x + (c.x - pet.x) * k, pet.y + (c.y - pet.y) * k, 1);
        if (to && go(pet, to)) {
          r.pace = 1.6;
          act(pet, "move:chase", to);
        }
        return true;
      }
    }
    // another dog close: a play-bow to one it gets on with, a growl and a step back from one it doesn't
    if (now - (r.playAt ?? 0) > PLAY_AGAIN_MS) {
      for (const o of room.state.pets.values()) {
        if (o === pet || !o.alive || o.battle || o.ride || o.floor !== pet.floor) continue;
        if (Math.hypot(o.x - pet.x, o.y - pet.y) > DOG_NEAR) continue;
        const or = runs.get(o.id);
        if (!or) continue;
        r.playAt = now;
        face(pet, o);
        if (compatible(r.traits, or.traits) && !hasGrudge(r.memory, o.id, now)) {
          act(pet, "move:playbow");
          say(pet, "happy");
          r.lastNear = now;
        } else {
          r.alertUntil = now + 3000;
          say(pet, "angry");
          const away = room.gridFor(pet.uid, pet.floor).nearestOpen(pet.x + (pet.x - o.x), pet.y + (pet.y - o.y), 1);
          if (away) go(pet, away);
        }
        return true;
      }
    }
    return false;
  };
  // How it carries itself now (Pet.mood): alarm, fear (a storm out there), a sulk, how it feels.
  const setMood = (pet: Pet, r: Run, now: number) => {
    const n = needsOf(pet);
    const mood = moodOf({
      alert: (r.alertUntil ?? 0) > now,
      scared: room.state.storm > 0.5 && outside(pet),
      sulking: (r.sulkUntil ?? 0) > now,
      fun: n.fun,
      happy: n.fun > 60 && n.food > 40 && n.water > 40 && n.health > 60,
    });
    if (pet.mood !== mood) pet.mood = mood;
  };
  // At home with its owner away, near their usual time in: to the office's door, inside (D3).
  const awaitOwner = (pet: Pet, r: Run, now: number): boolean => {
    const h = r.home;
    if (!h || owner(pet) || !dueSoon(r.memory, room.state.hour) || r.path.length || now <= r.until) return false;
    const a = homeOf(pet.uid)?.area;
    if (!a) return false;
    // its door: the one made with it, or one in its walls
    const onEdge = (c: Point) =>
      c.x >= a.x - 0.6 &&
      c.x <= a.x + a.w + 0.6 &&
      c.y >= a.y - 0.6 &&
      c.y <= a.y + a.h + 0.6 &&
      (Math.abs(c.x - a.x) < 0.6 ||
        Math.abs(c.x - a.x - a.w) < 0.6 ||
        Math.abs(c.y - a.y) < 0.6 ||
        Math.abs(c.y - a.y - a.h) < 0.6);
    const doors = objects(h.level).filter((o) => isDoorKind(o.kind));
    const door = doors.find((o) => o.props?.roomKey === h.key) ?? doors.find((o) => onEdge(openingCentre(o)));
    // (none — a room drawn without one —: the side they come in from, the floor's lifts)
    const c = door ? openingCentre(door) : room.levelEntry(h.level, pet.uid);
    if (!c) return false;
    const g = room.gridFor(pet.uid, h.level);
    let best: Point | null = null;
    for (let x = a.x; x < a.x + a.w; x++)
      for (let y = a.y; y < a.y + a.h; y++) {
        const t = { x: x + 0.5, y: y + 0.5 };
        if (!g.fits(t.x, t.y) || !inRoom(t, h.level, h.key)) continue;
        if (!best || Math.hypot(t.x - c.x, t.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y)) best = t;
      }
    if (best && Math.hypot(best.x - pet.x, best.y - pet.y) > 0.8) go(pet, best);
    r.until = now + 10_000;
    return true;
  };

  const behave = (pet: Pet, r: Run, now: number) => {
    const p = owner(pet);
    if (!p) return alone(pet, r, now);
    setMood(pet, r, now);
    // their routine (D3): the rooms they're in, a minute at a time
    const area = room.areaOf(p);
    if (area && now - (r.roomAt ?? 0) > ROOM_EVERY_MS) {
      r.roomAt = now;
      r.memory = rememberRoom(r.memory, area.key);
      r.dirty = true;
      showRoutine(pet, r);
    }
    // busy (a call, focus, a booth) and it beside them: quiet, lying down
    const near = pet.floor === p.level && Math.hypot(p.x - pet.x, p.y - pet.y) <= FOLLOW_NEAR + 0.5;
    r.quiet = pet.mode === "follow" && near && busyOf(p);
    if (r.quiet && !pet.act && !r.path.length) act(pet, "move:lie");
    // (before the battle's moves: its bite is the battle's "attack")
    if (r.target) return getHim(pet, r, p, now);
    if (pet.act === "battle" || pet.act === "ko" || isMove(pet.act)) return;
    if (pet.mode === "lost") return lostAbout(pet, r, now);
    if (pet.mode === "home") {
      // its owner coming into the office: over to them, happy (once a visit)
      const inside = r.home && p.level === r.home.level && inRoom(p, p.level, r.home.key);
      if (inside && !r.greetedHome && pet.floor === p.level && (r.sulkUntil ?? 0) < now) {
        r.greetedHome = true;
        pet.act = "";
        if (goNear(pet, p, 1.2)) say(pet, "happy");
        r.until = now + 4000;
        return;
      }
      if (!inside) r.greetedHome = false;
      return homeAbout(pet, r, now);
    }
    // its owner on another floor (it was asleep, or told to stay, when they
    // went): following again, it goes after them — up the stairs, out of sight
    if (pet.floor !== p.level && pet.mode === "follow" && !pet.battle) {
      // where they went up or down: there first, then along with them
      if (r.via) {
        const there = Math.hypot(r.via.x - pet.x, r.via.y - pet.y) < 1.4;
        if (!there && !r.path.length && now - (r.viaAt ?? 0) < VIA_MS) {
          // (the open spot nearest it: a person's feet can stand where a dog's can't)
          const to = room.gridFor(pet.uid, pet.floor).nearestOpen(r.via.x, r.via.y, 2);
          if (to) r.via = to;
          if (!to || !go(pet, to)) r.via = undefined;
          r.pace = catchUp(pet, 8);
          return;
        }
        if (!there && now - (r.viaAt ?? 0) < VIA_MS) return;
        if (comeAlong(pet, p)) r.via = undefined;
        return;
      }
      if (!r.away) r.away = now;
      // (not while they're in a lift's car on the move: where they stop; nowhere to walk to them
      // from yet, again in a second)
      else if (now - r.away > AWAY_MS && !room.carried.has(p.sid) && !comeAlong(pet, p)) r.away = now - AWAY_MS + 1000;
      return;
    }
    if (pet.floor === p.level) {
      r.away = 0;
      r.via = undefined;
      r.ownerAt = { x: p.x, y: p.y, level: p.level };
    }
    // its owner in a car: in with them, if it can (the boarding act is only while it's on its way)
    if (pet.mode === "follow" && !pet.battle && carOf(p) && pet.act !== "battle" && board(pet, r, p, now)) return;
    // left behind by its owner's car: too far, too long — lost
    if (pet.mode === "follow" && carOf(p) && !pet.ride) {
      const far = pet.floor !== p.level || Math.hypot(p.x - pet.x, p.y - pet.y) > LOST.far;
      if (!far) r.behind = 0;
      else if (!r.behind) {
        r.behind = now;
        toast(p.sid, `You drove off without ${pet.name}.`, "warn");
      } else if (now - r.behind > LOST.ms) return lose(pet, r, now);
    } else r.behind = 0;
    if (pet.act === "board") {
      pet.act = "";
      r.pace = 1;
    }
    if (r.echo && now > r.echo.at) {
      say(pet, r.echo.mood);
      r.echo = undefined;
    }
    const d = Math.hypot(p.x - pet.x, p.y - pet.y);
    // left behind: whatever it was idling at can wait, it goes after them
    const behind = pet.mode === "follow" && d > FOLLOW_FAR;
    // (and a ball just thrown for it gets it up from a sit or a sniff)
    const thrown =
      pet.mode !== "sleep" &&
      pet.mode !== "stay" &&
      [...toys.values()].some(
        (t) => t.by === pet.sid && t.state === "floor" && t.at !== r.toyAt && FETCHED.has(t.kind),
      );
    if ((behind || thrown) && pet.act && LET_GO.has(pet.act.split(":")[0])) {
      pet.act = "";
      r.path = [];
      r.pace = 1;
    }
    if (pet.act) return finishAct(pet, r, now);
    if (pet.mode !== "sleep" && pet.mode !== "stay" && canExert(needsOf(pet))) maybeFetch(pet, r);
    if (pet.act) return;
    if (pet.mode !== "sleep" && !behind && !r.path.length && now > r.thinkAt) think(pet, r, p, now);
    if (pet.act) return;
    shy(pet, r, now);
    if (r.path.length && r.intent && !behind) return; // (on its way somewhere of its own)
    if (!r.greeted && now - r.since > 800) {
      r.greeted = true;
      if (pet.mode !== "sleep") say(pet, "happy");
    }
    if (pet.mode === "follow") {
      if (d > FOLLOW_NEAR) {
        // after them the whole way, however far: a new path whenever they've
        // moved on from where it was heading, and a run when they're well ahead
        const end = r.path[r.path.length - 1];
        if ((!end || Math.hypot(end.x - p.x, end.y - p.y) > 2.2) && now > r.until) {
          if (goNear(pet, p, 1.3)) {
            r.until = now + REPATH_MS;
            r.lost = 0;
            r.stuck = 0;
          } else {
            // no way through: it waits, and whines now and then — and still none after a while
            // (shut in somewhere: docs/plan/52-the-pet-two.md, D1), it's put back at their side
            r.until = now + 1500;
            if (r.lost++ % 6 === 0) say(pet, "sad");
            // (only with them on foot and near: left behind by a car it's lost — 51 D4 —, and far
            // off it's a long way round, not shut in)
            if (carOf(p) || d > STUCK_NEAR) r.stuck = 0;
            else if (!r.stuck) r.stuck = now;
            else if (now - r.stuck > STUCK_MS) comeAlong(pet, p);
          }
        }
        r.pace = catchUp(pet, d);
      } else {
        r.pace = 1;
        // out of the way (D1): not in a doorway or a lift's, not in front of them, not in someone's path
        // (looked at now and then: a floor's things are many)
        if (!r.path.length && now > (r.asideAt ?? 0)) {
          r.asideAt = now + 700;
          if (inTheWay(pet, p)) return stepAside(pet, r, p, now);
          // its world: a stranger in the dark, a car going by, another dog (D2) — not when they're busy
          if (!r.quiet && react(pet, r, p, now)) return;
        }
        // a storm out here: close to them, no wandering off for a sniff (D2)
        if (pet.mood === "scared") return;
        // by its owner, with time on its paws: a sniff about, a sit-down, a
        // look at them, a trick it's proud of, a cat's scratch on the post
        if (!r.path.length && now > r.until) idle(pet, r, p, now);
      }
    } else if (pet.mode === "explore" && !r.path.length && now > r.until) explore(pet, r, now);
    else if (pet.mode === "wait") waitAbout(pet, r, now);
    else if (pet.mode === "sleep" && !r.path.length) pet.a = ANIM.sit;
  };

  return {
    // its owner went up or down (the stairs, an elevator): a pet with them comes
    // along (they go together; a pet told to stay, or asleep, stays put)
    // their lift's car moved them: a pet riding with them is put beside them at once (the pets
    // tick before the lifts: a step behind otherwise)
    carried(c, p) {
      for (const pet of room.state.pets.values()) {
        const r = runs.get(pet.id);
        if (r && pet.sid === c.sessionId && pet.ride === LIFT) liftRide(pet, r, p);
      }
    },
    // (in a lift's car on the move, floor after floor: not each one — it's in the car with them, or
    // comes along where they stop; behave's away)
    levelChange(c, p) {
      if (room.carried.has(c.sessionId)) return;
      const now = Date.now();
      for (const pet of room.state.pets.values()) {
        if (pet.sid !== c.sessionId || pet.battle || pet.mode !== "follow" || pet.ride) continue;
        // (on foot — the stairs —: to where they left its floor first, then along; behave)
        const r = runs.get(pet.id);
        const last = r?.ownerAt;
        // (on foot: where they are now is just by where they left — a teleport's a jump: along at once)
        const there = last && across(room.map, last.level, p.level, last);
        const walked = !!there && Math.hypot(there.x - p.x, there.y - p.y) < VIA_NEAR;
        if (r && last && walked && last.level === pet.floor && Math.hypot(last.x - pet.x, last.y - pet.y) < 25) {
          r.via = { x: last.x, y: last.y };
          r.viaAt = now;
          r.away = now;
          stop(pet);
          pet.act = "";
        } else comeAlong(pet, p);
      }
    },
    join(c, p) {
      if (p.bot) return;
      void bring(c, p);
      // a friend at the door: the pets that know them come over
      room.clock.setTimeout(() => {
        const q = owners().get(c.sessionId);
        if (!q) return;
        for (const pet of room.state.pets.values()) {
          const r = runs.get(pet.id);
          // (at home in its office it stays there: a knock brings it to the door)
          if (!r || !pet.alive || pet.sid === c.sessionId || pet.battle || pet.mode === "sleep" || pet.mode === "home")
            continue;
          // (a sit or a scratch beside its owner gives way; anything else it's doing doesn't)
          const idling =
            !pet.act || pet.act.startsWith("idle:") || pet.act.startsWith("trick:") || pet.act === "scratch";
          if (!idling || !greets(bondOf(r.bonds, q.uid)) || (r.sulkUntil ?? 0) > Date.now()) continue;
          pet.act = "";
          if (goNear(pet, q, 1.2)) {
            r.phase = 0;
            act(pet, `greet:${c.sessionId}`, q);
          }
        }
      }, GREET_DELAY_MS);
    },
    // its owner gone: it stays where it is (docs/plan/51-the-pet.md) — following
    // no one, it waits there; a dead one goes with them
    leave(c) {
      const now = Date.now();
      for (const pet of [...room.state.pets.values()]) {
        if (pet.sid !== c.sessionId) continue; // (a newer tab of theirs may have taken it over)
        if (pet.battle) endBattle(pet.battle, null);
        for (const b of [...room.state.battles.values()])
          if (b.phase === "offer" && (b.a === pet.id || b.b === pet.id)) room.state.battles.delete(b.id);
        const r = runs.get(pet.id);
        if (r && pet.alive) {
          const hours = (now - r.seenAt) / 3_600_000;
          setNeeds(pet, settleNeeds(needsOf(pet), hours, { asleep: pet.mode === "sleep", online: true }));
          r.seenAt = now;
        }
        if (!r || !pet.alive) {
          void save(pet, now);
          forget(pet);
          continue;
        }
        for (const t of [...toys.values()]) if (t.holder === pet.id) dropToy(t);
        if (r.target) leaveIt(pet, r);
        pet.sid = "";
        pet.carry = "";
        if (pet.ride === LIFT) {
          pet.ride = "";
          pet.z = 0;
        } else if (pet.ride) hopOut(pet, r, room.state.vehicles.get(pet.ride));
        // (running after their car when they went: lost)
        if (pet.mode === "follow" && r.behind) lose(pet, r, now);
        if (pet.mode === "follow") {
          stop(pet);
          pet.mode = "wait";
          pet.a = ANIM.idle;
          r.pace = 1;
          r.tour = null;
        }
        r.anchor = { x: pet.x, y: pet.y };
        if (pet.act && LET_GO.has(pet.act.split(":")[0])) pet.act = "";
        if (isDead(needsOf(pet))) die(pet, now);
        else void save(pet, now);
      }
    },
    // someone at its office's door: a pet at home there that knows them (or its owner) goes to the
    // door, inside, and wags
    knock(_c, p, areaKey) {
      const now = Date.now();
      for (const pet of room.state.pets.values()) {
        const r = runs.get(pet.id);
        if (!r || pet.mode !== "home" || r.home?.key !== areaKey || !pet.alive) continue;
        if (pet.uid !== p.uid && !greets(bondOf(r.bonds, p.uid))) continue;
        const a = homeOf(pet.uid)?.area;
        if (!a) continue;
        const g = room.gridFor(pet.uid, pet.floor);
        let best: Point | null = null;
        for (let x = a.x; x < a.x + a.w; x++)
          for (let y = a.y; y < a.y + a.h; y++) {
            const t = { x: x + 0.5, y: y + 0.5 };
            if (!g.fits(t.x, t.y) || !inRoom(t, pet.floor, areaKey)) continue;
            if (!best || Math.hypot(t.x - p.x, t.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = t;
          }
        pet.act = "";
        if (best && go(pet, best)) {
          r.until = now + 8000;
          say(pet, "happy");
        }
      }
    },
    // the room shutting (everyone gone, a restart): every pet saved where it is
    dispose() {
      const now = Date.now();
      for (const pet of room.state.pets.values()) void save(pet, now);
    },
    tick(dt, now) {
      tickBattles(now);
      tickToys(now);
      for (const pet of room.state.pets.values()) {
        const r = runs.get(pet.id);
        if (!r || !pet.alive) continue;
        if (now - r.seenAt >= SETTLE_MS) settle(pet, r, now);
        if (!pet.alive) continue;
        if (r.dirty && now - r.savedAt > SAVE_MS) void save(pet, now);
        // a lift's car going with its owner in it: in with them, if it was following close by
        const o = owner(pet);
        if (
          !pet.ride &&
          o &&
          room.carried.has(o.sid) &&
          pet.mode === "follow" &&
          !pet.battle &&
          pet.floor === o.level &&
          Math.hypot(pet.x - o.x, pet.y - o.y) <= LIFT_NEAR
        ) {
          stop(pet);
          pet.act = "";
          pet.ride = LIFT;
          r.liftAt = { x: -0.6, y: 0.4 };
        }
        if (pet.ride === LIFT) {
          liftRide(pet, r, o);
          if (pet.ride) continue;
        } else if (pet.ride) {
          ride(pet, r);
          if (pet.ride) continue;
        }
        if (pet.mode === "lost" && now - (r.sightAt ?? 0) > 2000) {
          r.sightAt = now;
          sightings(pet, r, now);
        }
        behave(pet, r, now);
        // walk
        if (r.path.length) {
          // (hit by a car, lost: limping, at half its pace)
          const limp = r.limpUntil && now < r.limpUntil ? 0.5 : 1;
          let budget = SPECIES_DEFS[pet.species as Species].pace * dt * r.pace * limp;
          while (budget > 0 && r.path.length) {
            const wp = r.path[0];
            const dx = wp.x - pet.x;
            const dy = wp.y - pet.y;
            const dd = Math.hypot(dx, dy);
            if (dd > 0.001) pet.d = dirFromDelta(dx, dy);
            if (dd <= budget) {
              pet.x = wp.x;
              pet.y = wp.y;
              budget -= dd;
              r.path.shift();
            } else {
              pet.x += (dx / dd) * budget;
              pet.y += (dy / dd) * budget;
              budget = 0;
            }
          }
          pet.a = ANIM.walk;
          if (!r.path.length && pet.mode === "sleep") pet.a = ANIM.sit;
        } else if (pet.a === ANIM.walk) pet.a = pet.mode === "sleep" ? ANIM.sit : ANIM.idle;
      }
    },
  };
});
