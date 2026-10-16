// A pet's mind (docs/plan/17-pets-minds.md): who it is (traits), what it
// wants right now (drives), what it does about it (an intention it commits
// to), whether it does what you say (obedience), what it remembers (memory)
// and who it's close to (bonds). Pure: the room passes a small context and
// turns the intention into paths and acts.
import type { Needs, Species } from "./pets";

// ── traits ──────────────────────────────────────────────────────────────────
export const TRAIT_NAMES = [
  "energy",
  "independence",
  "courage",
  "greed",
  "curiosity",
  "affection",
  "obedience",
] as const;
export type TraitName = (typeof TRAIT_NAMES)[number];
export type Traits = Record<TraitName, number>; // 0..1

// where each species leans
const SPECIES_TRAITS: Record<Species, Traits> = {
  dog: {
    energy: 0.7,
    independence: 0.25,
    courage: 0.65,
    greed: 0.65,
    curiosity: 0.55,
    affection: 0.8,
    obedience: 0.75,
  },
  cat: { energy: 0.45, independence: 0.8, courage: 0.5, greed: 0.4, curiosity: 0.7, affection: 0.45, obedience: 0.3 },
  rabbit: { energy: 0.55, independence: 0.5, courage: 0.2, greed: 0.5, curiosity: 0.5, affection: 0.5, obedience: 0.4 },
  platypus: {
    energy: 0.5,
    independence: 0.6,
    courage: 0.5,
    greed: 0.5,
    curiosity: 0.65,
    affection: 0.5,
    obedience: 0.45,
  },
  capybara: {
    energy: 0.2,
    independence: 0.45,
    courage: 0.7,
    greed: 0.7,
    curiosity: 0.35,
    affection: 0.6,
    obedience: 0.5,
  },
  parrot: {
    energy: 0.6,
    independence: 0.55,
    courage: 0.6,
    greed: 0.45,
    curiosity: 0.85,
    affection: 0.6,
    obedience: 0.4,
  },
};
// and where a breed leans away from its species
const BREED_LEAN: Record<string, Partial<Traits>> = {
  husky: { energy: 0.2, obedience: -0.2, independence: 0.15 },
  bengal: { energy: 0.2, curiosity: 0.1 },
  chihuahua: { energy: 0.15, courage: -0.25 },
  persian: { energy: -0.2 },
  bulldog: { energy: -0.2, courage: 0.1 },
  pug: { energy: -0.1, affection: 0.1, greed: 0.1 },
  siamese: { independence: 0.1, obedience: -0.15 },
  sphynx: { independence: 0.1, affection: 0.1 },
  golden: { independence: -0.15, affection: 0.15, obedience: 0.15 },
  corgi: { independence: -0.15, affection: 0.1 },
  shepherd: { courage: 0.2, obedience: 0.2 },
  mainecoon: { courage: 0.15 },
  beagle: { greed: 0.2, curiosity: 0.1 },
  poodle: { curiosity: 0.15, obedience: 0.1 },
  ragdoll: { affection: 0.2, energy: -0.1 },
  bombay: { affection: -0.15 },
  dachshund: { courage: 0.1, obedience: -0.1 },
  hare: { energy: 0.2, independence: 0.1 },
  dwarf: { courage: -0.1, affection: 0.1 },
  cockatoo: { affection: 0.15, energy: 0.1 },
  budgie: { curiosity: 0.1, courage: -0.1 },
};

// a small deterministic generator (mulberry32), so a seed always rolls the same pet
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function rollTraits(species: Species, breed: string, seed: number): Traits {
  const r = rng(seed);
  const base = SPECIES_TRAITS[species];
  const lean = BREED_LEAN[breed] ?? {};
  const out = {} as Traits;
  for (const k of TRAIT_NAMES) out[k] = Math.round(clamp01(base[k] + (lean[k] ?? 0) + (r() - 0.5) * 0.3) * 100) / 100;
  return out;
}
export function cleanTraits(t: unknown, species: Species, breed: string, seed: number): Traits {
  const o = (t ?? {}) as Record<string, unknown>;
  const ok = TRAIT_NAMES.every((k) => typeof o[k] === "number" && Number.isFinite(o[k]));
  if (!ok) return rollTraits(species, breed, seed);
  const out = {} as Traits;
  for (const k of TRAIT_NAMES) out[k] = clamp01(o[k] as number);
  return out;
}
// the three words that say it best (i18n keys trait_<word>): the traits furthest from the middle
const WORDS: Record<TraitName, [string, string]> = {
  energy: ["lazy", "energetic"],
  independence: ["clingy", "aloof"],
  courage: ["timid", "brave"],
  greed: ["picky", "greedy"],
  curiosity: ["settled", "curious"],
  affection: ["cool", "loving"],
  obedience: ["wilful", "obedient"],
};
export function traitWords(t: Traits, n = 3): string[] {
  return [...TRAIT_NAMES]
    .sort((a, b) => Math.abs(t[b] - 0.5) - Math.abs(t[a] - 0.5))
    .slice(0, n)
    .map((k) => WORDS[k][t[k] >= 0.5 ? 1 : 0]);
}
// traits move slowly with how it's raised
export type Raising = "play" | "pet" | "ignored" | "won" | "lost" | "fed";
export const DRIFT = 0.01;
export function drift(t: Traits, ev: Raising): Traits {
  const out = { ...t };
  const nudge = (k: TraitName, d: number) => {
    out[k] = Math.round(clamp01(out[k] + d) * 1000) / 1000;
  };
  switch (ev) {
    case "play":
      nudge("energy", DRIFT);
      nudge("independence", -DRIFT / 2);
      break;
    case "pet":
      nudge("affection", DRIFT);
      nudge("independence", -DRIFT / 2);
      break;
    case "ignored":
      nudge("independence", DRIFT);
      break;
    case "won":
      nudge("courage", DRIFT);
      break;
    case "lost":
      nudge("courage", -DRIFT);
      break;
    case "fed":
      nudge("greed", DRIFT / 2);
      nudge("obedience", DRIFT / 2);
      break;
  }
  return out;
}

// ── drives ──────────────────────────────────────────────────────────────────
export const DRIVE_NAMES = [
  "hunger",
  "thirst",
  "rest",
  "play",
  "attention",
  "curiosity",
  "comfort",
  "company",
] as const;
export type DriveName = (typeof DRIVE_NAMES)[number];
export type Drives = Record<DriveName, number>; // pressure 0..100
export interface MindCtx {
  now: number;
  night: number; // 0 by day … 1 at night
  noise: number; // 0 quiet … 1 a battle next to it
  lastPlay: number; // ms: when it last played
  lastPetted: number; // when it was last petted or spoken to
  lastNear: number; // when it was last beside another pet
  lastLooked: number; // when it last had a look at something new / explored
  newThings: number; // things placed since it last looked
  pets: number; // other pets about (within reach of a walk)
}
const minutes = (now: number, since: number) => Math.max(0, now - since) / 60_000;
const c100 = (v: number) => Math.max(0, Math.min(100, v));

export function drives(n: Needs, t: Traits, c: MindCtx): Drives {
  const tired = n.energy < 25; // not up for much
  return {
    hunger: c100((100 - n.food) * (0.7 + t.greed * 0.6)),
    thirst: c100((100 - n.water) * 1.05),
    rest: c100((100 - n.energy) * (0.8 + c.night * 0.5)),
    play: c100(((100 - n.fun) * (0.6 + t.energy * 0.7) + minutes(c.now, c.lastPlay) * 1.5) * (tired ? 0.3 : 1)),
    attention: c100(minutes(c.now, c.lastPetted) * (2 + t.affection * 4) * (1 - t.independence * 0.5)),
    curiosity: c100((c.newThings * 25 + minutes(c.now, c.lastLooked) * 0.5) * (0.3 + t.curiosity * 0.9)),
    comfort: c100(c.noise * 100 * (1.1 - t.courage)),
    company: c.pets > 0 ? c100(minutes(c.now, c.lastNear) * 3 * (1 - t.independence * 0.8)) : 0,
  };
}

// the intention: the strongest drive, kept until it's met (under KEEP) or
// another is far stronger (by SWITCH), so it never flip-flops
export interface Intent {
  drive: DriveName;
  since: number;
}
export const PRESSING = 20; // under this nothing's on its mind
export const KEEP = 30;
export const SWITCH = 25;
export function choose(d: Drives, cur: Intent | null, now: number): Intent | null {
  let best: DriveName = DRIVE_NAMES[0];
  for (const k of DRIVE_NAMES) if (d[k] > d[best]) best = k;
  if (cur && d[cur.drive] >= KEEP && d[best] < d[cur.drive] + SWITCH) return cur;
  if (d[best] < PRESSING) return null;
  if (cur && cur.drive === best) return cur;
  return { drive: best, since: now };
}
// what it wants, as an icon over its head (client art/emotes.ts WANTS)
export const WANT_ICON: Record<DriveName, string> = {
  hunger: "bone",
  thirst: "drop",
  rest: "zzz",
  play: "ball",
  attention: "heart",
  curiosity: "look",
  comfort: "house",
  company: "paws",
};

// ── a will of its own ───────────────────────────────────────────────────────
// the chance it does what you say: obedience, how close you are, its mood
// (a fresh dog ~0.8, a bonded one ~0.9; a fresh cat about even; hungry,
// bored or scared, less)
export function obeyChance(t: Traits, bond: number, n: Needs, intent: DriveName | null): number {
  const mood = intent === "comfort" ? 0.3 : n.food < 40 || n.water < 40 || n.fun < 25 ? 0.6 : 1;
  const base = 0.45 + t.obedience * 0.55;
  return Math.max(0.05, Math.min(1, base * (0.9 + Math.max(0, Math.min(100, bond)) / 1000) * mood));
}
// how fast a lesson sinks in, × the wit's gain
export const learnK = (t: Traits) => 0.7 + t.obedience * 0.35 + t.curiosity * 0.25;

// ── memory ──────────────────────────────────────────────────────────────────
export interface Memory {
  toys: Record<string, number>; // toy → times played
  spots: { x: number; y: number; n: number }[]; // where it rested (up to 3)
  bowls: { x: number; y: number; kind: string }[]; // where the bowls were
  grudge: Record<string, number>; // pet id → until (ms)
}
export const emptyMemory = (): Memory => ({ toys: {}, spots: [], bowls: [], grudge: {} });
export function cleanMemory(u: unknown): Memory {
  const m = emptyMemory();
  if (!u || typeof u !== "object") return m;
  const o = u as Record<string, unknown>;
  if (o.toys && typeof o.toys === "object")
    for (const [k, v] of Object.entries(o.toys as Record<string, unknown>))
      if (typeof v === "number" && v > 0 && k.length < 20) m.toys[k] = Math.min(9999, Math.floor(v));
  if (Array.isArray(o.spots))
    for (const s of o.spots.slice(0, 3) as Record<string, unknown>[])
      if (typeof s?.x === "number" && typeof s?.y === "number" && typeof s?.n === "number")
        m.spots.push({ x: s.x, y: s.y, n: Math.max(1, Math.floor(s.n)) });
  if (Array.isArray(o.bowls))
    for (const b of o.bowls.slice(0, 6) as Record<string, unknown>[])
      if (typeof b?.x === "number" && typeof b?.y === "number" && typeof b?.kind === "string")
        m.bowls.push({ x: b.x, y: b.y, kind: b.kind.slice(0, 20) });
  if (o.grudge && typeof o.grudge === "object")
    for (const [k, v] of Object.entries(o.grudge as Record<string, unknown>))
      if (typeof v === "number" && k.length < 24) m.grudge[k] = v;
  return m;
}
export function rememberToy(m: Memory, toy: string): Memory {
  return { ...m, toys: { ...m.toys, [toy]: (m.toys[toy] ?? 0) + 1 } };
}
export function favouriteToy(m: Memory): string | null {
  let best: string | null = null;
  for (const [k, v] of Object.entries(m.toys)) if (best === null || v > m.toys[best]) best = k;
  return best;
}
// a rest at (x, y): the same spot (within a tile) counts again; three spots kept
export function rememberSpot(m: Memory, x: number, y: number): Memory {
  const spots = m.spots.map((s) => ({ ...s }));
  const hit = spots.find((s) => Math.hypot(s.x - x, s.y - y) < 1.2);
  if (hit) hit.n++;
  else spots.push({ x, y, n: 1 });
  spots.sort((a, b) => b.n - a.n);
  return { ...m, spots: spots.slice(0, 3) };
}
export function favouriteSpot(m: Memory): { x: number; y: number } | null {
  return m.spots[0] ? { x: m.spots[0].x, y: m.spots[0].y } : null;
}
export function rememberBowl(m: Memory, x: number, y: number, kind: string): Memory {
  const bowls = m.bowls.filter((b) => !(b.kind === kind && Math.hypot(b.x - x, b.y - y) < 0.5));
  bowls.unshift({ x, y, kind });
  return { ...m, bowls: bowls.slice(0, 6) };
}
export const GRUDGE_MS = 3_600_000;
export function holdGrudge(m: Memory, petId: string, now: number, ms = GRUDGE_MS): Memory {
  const grudge: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.grudge)) if (v > now) grudge[k] = v;
  grudge[petId] = now + ms;
  return { ...m, grudge };
}
export const hasGrudge = (m: Memory, petId: string, now: number) => (m.grudge[petId] ?? 0) > now;

// ── bonds ───────────────────────────────────────────────────────────────────
export type Bonds = Record<string, number>; // uid → 0..100
export const BOND_GAIN = { pet: 3, feed: 5, play: 4, near: 0.2, word: 1 } as const;
export const BOND_DECAY_PER_DAY = 1;
export function cleanBonds(u: unknown): Bonds {
  const out: Bonds = {};
  if (!u || typeof u !== "object") return out;
  for (const [k, v] of Object.entries(u as Record<string, unknown>))
    if (typeof v === "number" && Number.isFinite(v) && /^\d{1,12}$/.test(k)) out[k] = Math.max(0, Math.min(100, v));
  return out;
}
export function bondUp(b: Bonds, uid: number | string, kind: keyof typeof BOND_GAIN): Bonds {
  const k = String(uid);
  return { ...b, [k]: Math.min(100, Math.round(((b[k] ?? 0) + BOND_GAIN[kind]) * 100) / 100) };
}
export function bondDecay(b: Bonds, hours: number): Bonds {
  const out: Bonds = {};
  for (const [k, v] of Object.entries(b))
    out[k] = Math.max(0, Math.round((v - (hours / 24) * BOND_DECAY_PER_DAY) * 100) / 100);
  return out;
}
export const bondOf = (b: Bonds, uid: number | string) => b[String(uid)] ?? 0;
// a friend it greets at the door; a stranger it keeps a tile away from
export const greets = (bond: number) => bond >= 30;
export const shyOf = (t: Traits, bond: number) => bond < 10 && t.courage < 0.5;
// two pets that get on: alike in how much they need others and how much they move
export const compatible = (a: Traits, b: Traits) =>
  Math.abs(a.independence - b.independence) < 0.4 && Math.abs(a.energy - b.energy) < 0.4;

// ── a day ───────────────────────────────────────────────────────────────────
// how "night" an hour is: deep night 23–5, dusk and dawn ramps
export function nightOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 23 || h < 5) return 1;
  if (h < 7) return 1 - (h - 5) / 2;
  if (h >= 20) return (h - 20) / 3;
  return 0;
}
export const isDusk = (hour: number) => hour >= 18 && hour < 21;
