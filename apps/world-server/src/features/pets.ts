import { ANIM, dirFromDelta, findPath, isToyHeld, type Point, THROWN, type WorldObjectDef } from "@yutopia/shared";
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
  favouriteSpot,
  greets,
  hasGrudge,
  holdGrudge,
  type Intent,
  isDusk,
  learnK,
  type Memory,
  nightOf,
  obeyChance,
  type Raising,
  rememberBowl,
  rememberSpot,
  rememberToy,
  shyOf,
  type Traits,
  WANT_ICON,
} from "@yutopia/shared/mind";
import {
  afterBattle,
  BATTLE,
  type BattleEvent,
  battleWinner,
  CARE,
  canExert,
  cleanLook,
  cleanName,
  cleanOutfit,
  FETCH,
  type Fighter,
  flightMs,
  hpFor,
  isCommand,
  isDead,
  isMove,
  isSpecies,
  isToy,
  isTrick,
  LESSON_COOLDOWN,
  LESSON_MS,
  learned,
  lessonGain,
  levelFor,
  type Move,
  type Needs,
  newPet,
  PET_MAX,
  type PetMood,
  type PetRecord,
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
  WAKE_AT,
  XP,
} from "@yutopia/shared/pets";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { Pet, PetBattle, type Player, Toy as ToyState } from "../schema.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Pets (docs/plan/13-pets.md, rules in shared/pets.ts). A pet is its owner's
// (a record in Yondra), walks in with them and leaves with them. Here it
// lives: follows, stays, roams, sleeps when tired (in its bed if it finds
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
  zoomAt: number; // the last zoomies
  pace: number; // × its walking pace (zoomies)
  echo?: { mood: PetMood; at: number }; // a parrot about to repeat a sound
}

// Offline (tests, no Yondra): records kept here.
const offlinePets = new Map<number, PetRecord[]>();
let offlineId = 1;

registerFeature((room: SpaceRoom) => {
  const runs = new Map<string, Run>();
  const records = new Map<string, PetRecord>();
  const owners = () => room.state.players;

  const client = (sid: string) => room.clients.getById(sid) as SpaceClient | undefined;
  const toast = (sid: string, text: string, tone: "info" | "warn" = "info") => {
    const c = client(sid);
    if (c) room.send(c, "toast", { text, tone });
  };
  const event = (pet: Pet, kind: string, extra: { n?: number; trick?: string } = {}) => {
    const c = client(pet.sid);
    if (c) room.send(c, "pet:event", { id: pet.id, kind, ...extra });
  };
  const say = (pet: Pet, mood: PetMood) => {
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
  const mine = (c: SpaceClient, id: unknown): Pet | null => {
    const pet = room.state.pets.get(String(id ?? ""));
    return pet && pet.sid === c.sessionId && pet.alive ? pet : null;
  };
  const near = (pet: Pet, p: Player, r = REACH) => Math.hypot(pet.x - p.x, pet.y - p.y) <= r;
  const stop = (pet: Pet) => {
    const r = runs.get(pet.id);
    if (r) r.path = [];
  };
  const go = (pet: Pet, to: Point): boolean => {
    const r = runs.get(pet.id);
    if (!r) return false;
    const p = findPath(room.gridFor(pet.uid), pet, to);
    if (!p) return false;
    r.path = p;
    return true;
  };
  // Beside someone: at their side first (where a camera behind them still
  // sees it), then ahead, behind last; among equals the nearest spot.
  const goNear = (pet: Pet, p: Point & { d?: number }, radius = 1.3): boolean => {
    const g = room.gridFor(pet.uid);
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
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const portions = (o: WorldObjectDef) => Number(o.props?.portions ?? 0);
  const saveObject = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await yondra.putObject(room.spaceId, o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };

  // ── the record ────────────────────────────────────────────────────────────
  const load = async (uid: number): Promise<PetRecord[]> => {
    if (config.offline) return offlinePets.get(uid) ?? [];
    return (await yondra.pets(uid)).pets;
  };
  const create = async (uid: number, rec: Omit<PetRecord, "id">): Promise<PetRecord> => {
    if (config.offline) {
      const pet = { ...rec, id: offlineId++ };
      offlinePets.set(uid, [...(offlinePets.get(uid) ?? []), pet]);
      return pet;
    }
    return (await yondra.createPet(uid, rec)).pet;
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
    if (config.offline) return;
    await yondra
      .savePet(pet.uid, Number(pet.id), patch)
      .catch((e) => console.warn("[pets] save", (e as Error).message));
  };
  const remove = async (uid: number, id: number) => {
    if (config.offline) {
      offlinePets.set(
        uid,
        (offlinePets.get(uid) ?? []).filter((p) => p.id !== id),
      );
      return;
    }
    await yondra.deletePet(uid, id).catch(() => {});
  };

  // A pet into the room, by its owner.
  const place = (rec: PetRecord, p: Player, now: number) => {
    const pet = new Pet();
    pet.id = String(rec.id);
    pet.uid = p.uid;
    pet.sid = p.sid;
    pet.owner = p.name;
    pet.name = rec.name;
    pet.species = rec.species;
    pet.look = JSON.stringify(rec.look);
    pet.outfit = JSON.stringify(rec.outfit);
    // at their side (not ahead, where a camera behind them can't see it)
    const [fx, fy] = FACING[p.d & 7];
    const g = room.gridFor(p.uid);
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
    setNeeds(pet, rec.needs);
    pet.xp = rec.xp;
    pet.level = levelFor(rec.xp);
    pet.tricks = JSON.stringify(rec.tricks ?? {});
    pet.alive = rec.alive;
    pet.wins = rec.wins;
    pet.losses = rec.losses;
    pet.mode = rec.needs.energy < SLEEP_AT ? "sleep" : "follow";
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
      seen: new Set(objects().map((o) => o.id)),
      wantAt: 0,
      calledAt: 0,
      begAt: 0,
      shyAt: 0,
      zoomAt: 0,
      pace: 1,
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
    });
    room.state.pets.set(pet.id, pet);
    return pet;
  };

  const die = (pet: Pet, now: number) => {
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
    event(pet, "died");
    void save(pet, now);
  };

  // ── joining and leaving ──────────────────────────────────────────────────
  const bring = async (c: SpaceClient, p: Player) => {
    const now = Date.now();
    let recs: PetRecord[];
    try {
      recs = await load(p.uid);
    } catch (e) {
      console.warn("[pets] load", (e as Error).message);
      return;
    }
    if (!room.clients.getById(c.sessionId)) return; // left while we fetched
    for (const rec of recs) {
      // here already under an earlier session of theirs (another tab, a reconnect): now theirs again
      const have = room.state.pets.get(String(rec.id));
      if (have) {
        if (have.uid === p.uid) {
          have.sid = p.sid;
          have.owner = p.name;
        }
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
      const pet = place(rec, p, now);
      if (!pet.alive) {
        if (rec.diedAt === now) {
          event(pet, "died");
          void save(pet, now);
        }
        continue;
      }
      if (rec.needs.energy >= SLEEP_AT) say(pet, "happy");
      void save(pet, now);
    }
  };

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
    r.lastPetted = now; // spoken to
    setBonds(pet, r, bondUp(r.bonds, p.uid, "word"));
    // a will of its own: obedience, the bond, its mood; a second call within
    // a few seconds always works (it heard you)
    const chance = obeyChance(r.traits, bondOf(r.bonds, p.uid), needsOf(pet), r.intent?.drive ?? null);
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
    addXp(pet, XP.command);
    pet.act = "";
    r.pace = 1;
    r.until = now + 2000;
    switch (m.cmd) {
      case "come":
        pet.mode = "follow";
        pet.a = ANIM.idle;
        goNear(pet, p, 1.2);
        break;
      case "stay":
        pet.mode = "stay";
        pet.a = ANIM.idle;
        stop(pet);
        break;
      case "follow":
        pet.mode = "follow";
        pet.a = ANIM.idle;
        break;
      case "roam":
        pet.mode = "roam";
        pet.a = ANIM.idle;
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
    const pet = config.offline ? mine(c, m?.id) : null;
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
  });

  // ── care ─────────────────────────────────────────────────────────────────
  room.on("pet:care", (c, m) => {
    const what = m?.what;
    if (what !== "pet" && what !== "snack" && what !== "water") return;
    // anyone near may pet it; only its owner feeds and waters it
    const any = room.state.pets.get(String(m?.id ?? ""));
    const pet = what === "pet" && any?.alive ? any : mine(c, m?.id);
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
    if (Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5)) > BOWL_REACH) return;
    const def = fromSchema(o);
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
    const g = room.gridFor(uid);
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
      if (Math.hypot(p.x - (o.x + 0.5), p.y - (o.y + 0.5)) > BOWL_REACH) return;
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
    if (Math.hypot(p.x - t.x, p.y - t.y) > 1.8) return;
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
      if (t.kind !== "ball" && t.kind !== "frisbee" && t.kind !== "laser") continue;
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
      const g = room.gridFor(A.uid);
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
    const bed = objects().find(
      (o) => o.kind === "pet_bed" && findPath(room.gridFor(pet.uid), pet, { x: o.x + 0.5, y: o.y + 0.5 }),
    );
    if (bed) go(pet, { x: bed.x + 0.5, y: bed.y + 0.5 });
    else {
      stop(pet);
      pet.a = ANIM.sit;
    }
  };
  const wake = (pet: Pet) => {
    pet.mode = "follow";
    pet.a = ANIM.idle;
  };

  const settle = (pet: Pet, r: Run, now: number) => {
    const hours = (now - r.seenAt) / 3_600_000;
    r.seenAt = now;
    const n = settleNeeds(needsOf(pet), hours, { asleep: pet.mode === "sleep", online: true });
    setNeeds(pet, n);
    r.dirty = true;
    if (isDead(n)) return die(pet, now);
    const p = owner(pet);
    if (pet.mode === "sleep" && n.energy >= WAKE_AT) {
      wake(pet);
      say(pet, "happy");
    } else if (pet.mode !== "sleep" && n.energy < SLEEP_AT && !pet.act && !pet.battle) sleep(pet);
    void p; // (hunger and thirst are on its mind: think())
  };
  const byDistance = (list: WorldObjectDef[], pet: Pet) =>
    [...list].sort((a, b) => Math.hypot(a.x - pet.x, a.y - pet.y) - Math.hypot(b.x - pet.x, b.y - pet.y));
  const centre = (o: WorldObjectDef) => ({ x: o.x + 0.5, y: o.y + 0.5 });
  const reachable = (pet: Pet) => (o: WorldObjectDef) => !!findPath(room.gridFor(pet.uid), pet, centre(o));
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
      objects().some(
        (o) => isRadio(o.kind) && o.props?.playing === true && Math.hypot(o.x + 0.5 - pet.x, o.y + 0.5 - pet.y) < 5,
      )
    )
      noise = 0.4;
    let crowd = 0;
    for (const q of owners().values()) if (Math.hypot(q.x - pet.x, q.y - pet.y) < 4) crowd++;
    if (crowd > 4) noise = Math.max(noise, 0.3);
    return noise;
  };
  const hourNow = () => new Date().getHours() + new Date().getMinutes() / 60;
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
      newThings: objects().filter((o) => !r.seen.has(o.id)).length,
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
        const tv = byDistance(objects().filter(isTv), pet).find((o) => Math.hypot(o.x - pet.x, o.y - pet.y) < 9);
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
    const g = room.gridFor(pet.uid);
    const begin = (what: string, at?: Point) => {
      r.phase = 0;
      act(pet, what, at);
    };
    switch (drive) {
      case "hunger":
      case "thirst": {
        const kind = drive === "thirst" ? "water_bowl" : "pet_bowl";
        const full = byDistance(
          objects().filter((o) => o.kind === kind && portions(o) > 0),
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
          objects().filter((o) => o.kind === kind),
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
          objects().filter((o) => o.kind === "pet_bed" || o.kind === "pet_house"),
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
            objects().filter((o) => o.kind === "scratch_post"),
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
          objects().filter((o) => !r.seen.has(o.id)),
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
          objects().filter((o) => o.kind === "pet_house" || o.kind === "pet_bed"),
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
      const to = room.gridFor(pet.uid).nearestOpen(pet.x + dx * k, pet.y + dy * k, 2);
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
          for (const o of objects()) r.seen.add(o.id);
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
          const g = room.gridFor(pet.uid);
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
          const g = room.gridFor(pet.uid);
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
      default:
        break;
    }
  };

  const idle = (pet: Pet, r: Run, p: Player, now: number) => {
    const roll = Math.random();
    const sp = pet.species as Species;
    const n = needsOf(pet);
    r.until = now + 2500 + Math.random() * 4000;
    if (roll < 0.3) {
      // a sniff about: a step or two nearby, still beside them
      const g = room.gridFor(pet.uid);
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
      const post = objects().find((o) => o.kind === "scratch_post" && Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.y) < 6);
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
      const playing = objects().find(
        (o) => isRadio(o.kind) && o.props?.playing === true && Math.hypot(o.x + 0.5 - pet.x, o.y + 0.5 - pet.y) < 6,
      );
      if (playing) act(pet, "trick:dance");
    }
  };

  const behave = (pet: Pet, r: Run, now: number) => {
    const p = owner(pet);
    if (!p) return;
    if (pet.act === "battle" || pet.act === "ko" || isMove(pet.act)) return;
    if (r.echo && now > r.echo.at) {
      say(pet, r.echo.mood);
      r.echo = undefined;
    }
    if (pet.act) return finishAct(pet, r, now);
    if (pet.mode !== "sleep" && pet.mode !== "stay" && canExert(needsOf(pet))) maybeFetch(pet, r);
    if (pet.act) return;
    if (pet.mode !== "sleep" && !r.path.length && now > r.thinkAt) think(pet, r, p, now);
    if (pet.act) return;
    shy(pet, r, now);
    if (r.path.length && r.intent) return; // (on its way somewhere of its own)
    const d = Math.hypot(p.x - pet.x, p.y - pet.y);
    // lost its owner (a teleport, a locked door): turn up beside them
    if (d > 14 && pet.mode !== "stay") {
      const spot = room.gridFor(pet.uid).nearestOpen(p.x, p.y, 6);
      if (spot) {
        pet.x = spot.x;
        pet.y = spot.y;
        r.path = [];
      }
    }
    if (!r.greeted && now - r.since > 800) {
      r.greeted = true;
      if (pet.mode !== "sleep") say(pet, "happy");
    }
    if (pet.mode === "follow") {
      if (d > 2.6 && !r.path.length && now > r.until) {
        if (!goNear(pet, p, 1.3)) r.until = now + 1500;
        pet.a = ANIM.idle;
      } else if (d <= 2.6 && !r.path.length && now > r.until) {
        // by its owner, with time on its paws: a sniff about, a sit-down, a
        // look at them, a trick it's proud of, a cat's scratch on the post
        idle(pet, r, p, now);
      }
    } else if (pet.mode === "roam" && !r.path.length && now > r.until) {
      const g = room.gridFor(pet.uid);
      for (let i = 0; i < 5; i++) {
        const t = { x: p.x + (Math.random() * 2 - 1) * 6, y: p.y + (Math.random() * 2 - 1) * 6 };
        if (g.fits(t.x, t.y) && go(pet, t)) break;
      }
      r.until = now + 6000 + Math.random() * 8000;
    } else if (pet.mode === "sleep" && !r.path.length) pet.a = ANIM.sit;
  };

  return {
    join(c, p) {
      if (p.bot) return;
      void bring(c, p);
      // a friend at the door: the pets that know them come over
      room.clock.setTimeout(() => {
        const q = owners().get(c.sessionId);
        if (!q) return;
        for (const pet of room.state.pets.values()) {
          const r = runs.get(pet.id);
          if (!r || !pet.alive || pet.sid === c.sessionId || pet.battle || pet.mode === "sleep") continue;
          // (a sit or a scratch beside its owner gives way; anything else it's doing doesn't)
          const idling =
            !pet.act || pet.act.startsWith("idle:") || pet.act.startsWith("trick:") || pet.act === "scratch";
          if (!idling || !greets(bondOf(r.bonds, q.uid))) continue;
          pet.act = "";
          if (goNear(pet, q, 1.2)) {
            r.phase = 0;
            act(pet, `greet:${c.sessionId}`, q);
          }
        }
      }, GREET_DELAY_MS);
    },
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
        }
        void save(pet, now);
        for (const t of [...toys.values()]) if (t.holder === pet.id) dropToy(t);
        room.state.pets.delete(pet.id);
        runs.delete(pet.id);
        records.delete(pet.id);
      }
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
        behave(pet, r, now);
        // walk
        if (r.path.length) {
          let budget = SPECIES_DEFS[pet.species as Species].pace * dt * r.pace;
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
