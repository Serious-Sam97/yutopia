import { type Bonds, emptyMemory, type Memory, rollTraits, type Traits } from "./mind";
// Pets (docs/plan/13-pets.md): the rules the world-server applies and the
// panel shows. A pet belongs to a person (Yondra `yutopia_pets`), walks in
// with them, and lives by these numbers: needs that drop with real time, XP
// and levels that grow its stats, tricks it learns, toys it plays with,
// clothes it wears, and battles with other pets. Pure functions, no state.

import { CLOTH_COLORS } from "./avatar.ts";
import { clamp100 as clamp, drain, fill } from "./needs.ts";

export const SPECIES = ["dog", "cat", "rabbit", "platypus", "capybara", "parrot"] as const;
export type Species = (typeof SPECIES)[number];
export const isSpecies = (s: unknown): s is Species =>
  typeof s === "string" && (SPECIES as readonly string[]).includes(s);

export interface Stats {
  power: number;
  speed: number;
  wit: number;
  heart: number;
}

export type PetMood = "call" | "happy" | "sad" | "angry";

export interface SpeciesDef {
  label: string;
  base: Stats;
  growth: Stats; // per level
  pace: number; // tiles per second
  sound: "bark" | "meow" | "thump" | "growl" | "squeak" | "squawk";
  noise: Record<PetMood, [string, string]>; // what the bubble says (EN, PT)
  signature: Trick; // its own trick; learning it unlocks its battle special
  favourite: Toy;
  colors: string[]; // body colours to pick from
  marks: Mark[];
}

export const MARKS = ["none", "spots", "stripes", "patch", "socks"] as const;
export type Mark = (typeof MARKS)[number];

export const SPECIES_DEFS: Record<Species, SpeciesDef> = {
  dog: {
    label: "Dog",
    base: { power: 7, speed: 6, wit: 4, heart: 7 },
    growth: { power: 1.2, speed: 0.9, wit: 0.6, heart: 1.1 },
    pace: 4.6,
    sound: "bark",
    noise: {
      call: ["Woof!", "Au au!"],
      happy: ["Woof woof!", "Au au au!"],
      sad: ["Whine…", "Uhm…"],
      angry: ["Grrr!", "Grrr!"],
    },
    signature: "fetch",
    favourite: "ball",
    colors: ["#c68a5e", "#5b3a26", "#efe4cc", "#2a2420", "#e8a33d", "#8d877a", "#d9a349", "#b5562f"],
    marks: ["none", "spots", "patch", "socks"],
  },
  cat: {
    label: "Cat",
    base: { power: 6, speed: 8, wit: 7, heart: 5 },
    growth: { power: 0.9, speed: 1.3, wit: 1.0, heart: 0.7 },
    pace: 4.2,
    sound: "meow",
    noise: { call: ["Meow", "Miau"], happy: ["Purr~", "Ronrom~"], sad: ["Mew…", "Miau…"], angry: ["Hisss!", "Fsss!"] },
    signature: "pounce",
    favourite: "feather",
    colors: ["#e8a33d", "#2a2420", "#8d877a", "#efe4cc", "#c68a5e", "#5b3a26", "#e8c4b0", "#7a8491"],
    marks: ["none", "stripes", "patch", "socks", "spots"],
  },
  rabbit: {
    label: "Rabbit",
    base: { power: 4, speed: 9, wit: 5, heart: 6 },
    growth: { power: 0.6, speed: 1.4, wit: 0.8, heart: 0.9 },
    pace: 5,
    sound: "thump",
    noise: {
      call: ["Thump!", "Tump!"],
      happy: ["Binky!", "Pulinho!"],
      sad: ["…", "…"],
      angry: ["Thump thump!", "Tump tump!"],
    },
    signature: "hop",
    favourite: "rope",
    colors: ["#efe4cc", "#8d877a", "#c68a5e", "#2a2420", "#d9b26a"],
    marks: ["none", "spots", "patch"],
  },
  platypus: {
    label: "Platypus",
    base: { power: 6, speed: 5, wit: 8, heart: 6 },
    growth: { power: 1.0, speed: 0.8, wit: 1.2, heart: 0.9 },
    pace: 3.6,
    sound: "growl",
    noise: {
      call: ["Grrl", "Grrl"],
      happy: ["Grrl grrl!", "Grrl grrl!"],
      sad: ["grrl…", "grrl…"],
      angry: ["GRRRL!", "GRRRL!"],
    },
    signature: "dive",
    favourite: "ball",
    colors: ["#5b3a26", "#7a5c3a", "#3b2a20", "#8a6a4a", "#1fb2a6", "#2aa198", "#3d4a5c"],
    marks: ["none", "socks"],
  },
  capybara: {
    label: "Capybara",
    base: { power: 5, speed: 4, wit: 5, heart: 10 },
    growth: { power: 0.8, speed: 0.6, wit: 0.7, heart: 1.5 },
    pace: 3.4,
    sound: "squeak",
    noise: {
      call: ["Squeak", "Iiik"],
      happy: ["Purr-squeak", "Iik iik"],
      sad: ["eek…", "iik…"],
      angry: ["Bark!", "Au!"],
    },
    signature: "chill",
    favourite: "frisbee",
    colors: ["#a8693f", "#c68a5e", "#7c4a2b", "#d9b26a"],
    marks: ["none", "socks"],
  },
  parrot: {
    label: "Parrot",
    base: { power: 4, speed: 7, wit: 9, heart: 4 },
    growth: { power: 0.6, speed: 1.0, wit: 1.4, heart: 0.6 },
    pace: 4.8,
    sound: "squawk",
    noise: {
      call: ["Squawk!", "Crá!"],
      happy: ["Hello! Hello!", "Olá! Olá!"],
      sad: ["squawk…", "crá…"],
      angry: ["SQUAWK!", "CRÁ!"],
    },
    signature: "talk",
    favourite: "laser",
    colors: ["#c4402b", "#6e7b3a", "#3d4a5c", "#e8a33d", "#4f6b5a", "#7a5c8a"],
    marks: ["none", "stripes", "patch"],
  },
};

// ── looks and clothes ───────────────────────────────────────────────────────
export interface PetLook {
  color: string;
  mark: Mark;
  markColor: string;
  breed: string; // one of BREEDS[species] (M4)
  eyeColor?: string; // an iris colour (EYE_COLORS); unset: ink
  parts?: PetParts; // colours of the parts that aren't the coat; unset: derived from it
}
// the parts you can colour on their own (a platypus' bill, feet and tail…)
export const PART_NAMES = ["bill", "feet", "tail", "belly", "ears"] as const;
export type PartName = (typeof PART_NAMES)[number];
export type PetParts = Partial<Record<PartName, string>>;
export const EYE_COLORS = ["#e8a33d", "#6e9b4a", "#4a7fb5", "#5b3a26", "#b5562f", "#2a2420"];
export const PART_COLORS = [
  "#e8a33d",
  "#f0a040",
  "#c4402b",
  "#efe4cc",
  "#2a2420",
  "#5b3a26",
  "#8d877a",
  "#1fb2a6",
  "#6e7b3a",
  "#3d4a5c",
  "#d9b26a",
  "#f0c8b8",
];
// the coat a breed comes in (picked with the breed; any palette colour still goes)
export const BREED_COAT: Record<string, string> = {
  beagle: "#d9a349",
  poodle: "#efe4cc",
  corgi: "#d9a349",
  dachshund: "#5b3a26",
  husky: "#8d877a",
  golden: "#d9a349",
  pug: "#d9a349",
  bulldog: "#efe4cc",
  dalmatian: "#efe4cc",
  chihuahua: "#c68a5e",
  shepherd: "#c68a5e",
  tabby: "#e8a33d",
  siamese: "#efe4cc",
  persian: "#efe4cc",
  mainecoon: "#c68a5e",
  sphynx: "#e8c4b0",
  fold: "#8d877a",
  calico: "#efe4cc",
  tuxedo: "#2a2420",
  bengal: "#e8a33d",
  ragdoll: "#efe4cc",
  bombay: "#2a2420",
  british: "#7a8491",
};
export const BREEDS: Record<Species, readonly string[]> = {
  dog: [
    "shiba",
    "beagle",
    "poodle",
    "corgi",
    "dachshund",
    "husky",
    "golden",
    "pug",
    "bulldog",
    "dalmatian",
    "chihuahua",
    "shepherd",
  ],
  cat: [
    "tabby",
    "siamese",
    "persian",
    "mainecoon",
    "sphynx",
    "fold",
    "calico",
    "tuxedo",
    "bengal",
    "ragdoll",
    "bombay",
    "british",
  ],
  rabbit: ["lop", "dwarf", "hare"],
  platypus: ["young", "old", "mottled"],
  capybara: ["plain", "marked", "shaggy"],
  parrot: ["macaw", "cockatoo", "budgie"],
};
export const OUTFIT_OPTIONS = {
  hat: ["none", "cap", "bow", "crown", "party", "beanie", "tophat", "fedora"],
  collar: ["none", "collar", "bell", "bandana", "bowtie", "scarf"],
  coat: ["none", "sweater", "raincoat", "cape", "jersey", "hoodie"],
} as const;
export interface PetOutfit {
  hat: string;
  hatColor: string;
  collar: string;
  collarColor: string;
  coat: string;
  coatColor: string;
}
export const DEFAULT_OUTFIT: PetOutfit = {
  hat: "none",
  hatColor: "#c4402b",
  collar: "none",
  collarColor: "#c4402b",
  coat: "none",
  coatColor: "#6e7b3a",
};
export const MARK_COLORS = ["#efe4cc", "#2a2420", "#5b3a26", "#e8a33d", "#8d877a", "#c68a5e"];

const HEX = /^#[0-9a-f]{6}$/i;
export function cleanLook(species: Species, look: unknown): PetLook {
  const d = SPECIES_DEFS[species];
  const l = (look ?? {}) as Partial<PetLook>;
  const color = typeof l.color === "string" && HEX.test(l.color) ? l.color : d.colors[0];
  const mark = (d.marks as readonly string[]).includes(String(l.mark)) ? (l.mark as Mark) : "none";
  const markColor = typeof l.markColor === "string" && HEX.test(l.markColor) ? l.markColor : MARK_COLORS[0];
  const breed = (BREEDS[species] as readonly string[]).includes(String(l.breed)) ? String(l.breed) : BREEDS[species][0];
  const out: PetLook = { color, mark, markColor, breed };
  if (typeof l.eyeColor === "string" && HEX.test(l.eyeColor)) out.eyeColor = l.eyeColor;
  if (l.parts && typeof l.parts === "object") {
    const parts: PetParts = {};
    for (const k of PART_NAMES) {
      const v = (l.parts as Record<string, unknown>)[k];
      if (typeof v === "string" && HEX.test(v)) parts[k] = v;
    }
    if (Object.keys(parts).length) out.parts = parts;
  }
  return out;
}
export function cleanOutfit(outfit: unknown): PetOutfit {
  const o = (outfit ?? {}) as Partial<PetOutfit>;
  const pick = <K extends keyof typeof OUTFIT_OPTIONS>(k: K, v: unknown): string =>
    (OUTFIT_OPTIONS[k] as readonly string[]).includes(String(v)) ? String(v) : "none";
  const col = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
  return {
    hat: pick("hat", o.hat),
    hatColor: col(o.hatColor, DEFAULT_OUTFIT.hatColor),
    collar: pick("collar", o.collar),
    collarColor: col(o.collarColor, DEFAULT_OUTFIT.collarColor),
    coat: pick("coat", o.coat),
    coatColor: col(o.coatColor, DEFAULT_OUTFIT.coatColor),
  };
}
export const PET_NAME_MAX = 20;
export function cleanName(name: unknown, fallback: string): string {
  const s = String(name ?? "")
    .replace(/[\p{C}]/gu, "")
    .trim()
    .slice(0, PET_NAME_MAX);
  return s || fallback;
}
export { CLOTH_COLORS as OUTFIT_COLORS };

// ── needs ───────────────────────────────────────────────────────────────────
export interface Needs {
  food: number;
  water: number;
  energy: number;
  fun: number;
  health: number;
}
export const FULL_NEEDS: Needs = { food: 100, water: 100, energy: 100, fun: 100, health: 100 };
// per hour, awake and with the owner around
export const DECAY = { food: 4, water: 6, fun: 5, energy: 8, sleepGain: 25, hurt: 4, heal: 3 } as const;
export const OFFLINE_RATE = 0.25;

// Where the needs are `hours` later. Food or water at zero hurt; both above
// 30 heal. Asleep: energy comes back. Away from its owner: everything slower.
export function settleNeeds(n: Needs, hours: number, o: { asleep: boolean; online: boolean }): Needs {
  if (hours <= 0 || n.health <= 0) return { ...n };
  const k = o.online ? 1 : OFFLINE_RATE;
  const h = hours * k;
  const food = drain(n.food, DECAY.food, h);
  const water = drain(n.water, DECAY.water, h);
  const fun = drain(n.fun, DECAY.fun, h);
  const energy = o.asleep ? fill(n.energy, DECAY.sleepGain, h) : drain(n.energy, DECAY.energy, h);
  // health follows what the hour ended with (good enough for the panel and the server's short ticks)
  let health = n.health;
  const empty = (food <= 0 ? 1 : 0) + (water <= 0 ? 1 : 0);
  if (empty) health -= DECAY.hurt * empty * h;
  else if (food > 30 && water > 30) health += DECAY.heal * h;
  return { food, water, energy, fun, health: clamp(health) };
}
export const isDead = (n: Needs) => n.health <= 0;
export const SLEEP_AT = 15; // energy: it goes to sleep
export const WAKE_AT = 85; // energy: it wakes up
export const HUNGRY_AT = 40; // it looks for a bowl
// what it's up for (lessons, play, battles)
export const canExert = (n: Needs) => n.food >= 20 && n.energy >= 20 && n.health > 0;

// Care by hand, and from bowls.
export const CARE = {
  pet: { fun: 10, xp: 3, cooldown: 20_000 },
  snack: { food: 25, xp: 4, cooldown: 10 * 60_000 },
  water: { water: 40, xp: 3, cooldown: 5 * 60_000 },
  bowl: { food: 35, water: 35, portions: 3 },
} as const;

// How it feels, for the face and the tag.
export type PetFeeling = "happy" | "ok" | "hungry" | "thirsty" | "tired" | "bored" | "sick";
export function feelingOf(n: Needs): PetFeeling {
  if (n.health < 35) return "sick";
  if (n.water < 25) return "thirsty";
  if (n.food < 25) return "hungry";
  if (n.energy < SLEEP_AT + 5) return "tired";
  if (n.fun < 25) return "bored";
  if (n.fun >= 60 && n.food >= 40 && n.water >= 40) return "happy";
  return "ok";
}

// ── XP, levels, stats ───────────────────────────────────────────────────────
export const XP = {
  play: 12,
  trick: 8,
  learned: 40,
  feed: 4,
  water: 3,
  command: 2,
  pet: 3,
  win: 60,
  loss: 25,
} as const;
export const MAX_LEVEL = 30;
// level n needs 25·n·(n+1) xp in all: 50 → 2, 150 → 3, 300 → 4…
export function levelFor(xp: number): number {
  const n = Math.floor((Math.sqrt(1 + (4 * Math.max(0, xp)) / 25) - 1) / 2);
  return Math.max(1, Math.min(MAX_LEVEL, n + 1));
}
export const xpForLevel = (level: number) => 25 * (level - 1) * level;
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 1, need: 1 };
  const from = xpForLevel(level);
  return { level, into: xp - from, need: xpForLevel(level + 1) - from };
}
export function statsOf(species: Species, level: number): Stats {
  const d = SPECIES_DEFS[species];
  const l = Math.max(0, level - 1);
  const r = (b: number, g: number) => Math.round(b + g * l);
  return {
    power: r(d.base.power, d.growth.power),
    speed: r(d.base.speed, d.growth.speed),
    wit: r(d.base.wit, d.growth.wit),
    heart: r(d.base.heart, d.growth.heart),
  };
}

// ── tricks ──────────────────────────────────────────────────────────────────
export const SHARED_TRICKS = ["sit", "roll", "spin", "jump", "playdead", "speak", "highfive", "dance"] as const;
export const SIGNATURE_TRICKS = ["fetch", "pounce", "hop", "dive", "chill", "talk"] as const;
export type Trick = (typeof SHARED_TRICKS)[number] | (typeof SIGNATURE_TRICKS)[number];
export const TRICK_MS: Record<Trick, number> = {
  sit: 2500,
  roll: 2200,
  spin: 1800,
  jump: 1600,
  playdead: 3000,
  speak: 1500,
  highfive: 1800,
  dance: 3200,
  fetch: 3000,
  pounce: 2000,
  hop: 2200,
  dive: 2600,
  chill: 3200,
  talk: 2800,
};
export function tricksFor(species: Species): Trick[] {
  return [...SHARED_TRICKS, SPECIES_DEFS[species].signature];
}
export const isTrick = (t: unknown): t is Trick => typeof t === "string" && Object.hasOwn(TRICK_MS, t);
export const LESSON_MS = 6000;
export const LESSON_COOLDOWN = 20_000;
// progress a lesson adds (wit helps): 4–6 lessons for most
export const lessonGain = (wit: number) => Math.round(18 + wit * 1.5);
export const learned = (tricks: Record<string, number>, t: Trick) => (tricks[t] ?? 0) >= 100;

// ── toys ────────────────────────────────────────────────────────────────────
export const TOYS = ["ball", "frisbee", "rope", "feather", "laser"] as const;
export type Toy = (typeof TOYS)[number];
export const isToy = (t: unknown): t is Toy => typeof t === "string" && (TOYS as readonly string[]).includes(t);
export interface ToyDef {
  run: "fetch" | "tug" | "wiggle" | "dart";
  ms: number;
  range: number; // tiles it's thrown / darts
}
export const TOY_DEFS: Record<Toy, ToyDef> = {
  ball: { run: "fetch", ms: 7000, range: 4 },
  frisbee: { run: "fetch", ms: 9000, range: 6 },
  rope: { run: "tug", ms: 6000, range: 0 },
  feather: { run: "wiggle", ms: 5000, range: 0 },
  laser: { run: "dart", ms: 6500, range: 3 },
};
export const PLAY = { fun: 30, energy: 12 } as const;
export const playFun = (species: Species, toy: Toy) => PLAY.fun * (SPECIES_DEFS[species].favourite === toy ? 2 : 1);

// ── commands ────────────────────────────────────────────────────────────────
// home: wait in my office (standing in it with it); gohome: off to my office on its own (docs/plan/51-the-pet.md);
// attack: get him (a person, `target`), down till it's called off; leave: leave it (docs/plan/52-the-pet-two.md D8)
export const COMMANDS = [
  "come",
  "stay",
  "follow",
  "explore",
  "sleep",
  "speak",
  "trick",
  "home",
  "gohome",
  "attack",
  "leave",
] as const;
// get him (D8): as far as it's sent (tiles), its owner this near to keep it at it; at them this close
export const ATTACK = { reach: 30, leash: 60, bite: 1.0 } as const;
export type Command = (typeof COMMANDS)[number];
export const isCommand = (c: unknown): c is Command =>
  typeof c === "string" && (COMMANDS as readonly string[]).includes(c);
// explore: a tour of the whole space on its own, room by room, until it's called back;
// wait: where it was left (its owner gone — docs/plan/51-the-pet.md), sniffing round the spot;
// lost: left too far behind (a car driven off without it), wandering, in danger; home: in its owner's office
export type PetMode = "follow" | "stay" | "explore" | "sleep" | "wait" | "lost" | "home";
export const PET_MODES: readonly PetMode[] = ["follow", "stay", "explore", "sleep", "wait", "lost", "home"];
export const isPetMode = (m: unknown): m is PetMode =>
  typeof m === "string" && (PET_MODES as readonly string[]).includes(m);
// waiting: as far from the spot it was left at as it wanders (tiles)
export const WAIT_RADIUS = 3;
// Lost (docs/plan/51-the-pet.md, D4). It's lost when its owner's car is over `far` m off for `ms`;
// found when they're within `found` m (or call it within `call`); seen by anyone within `sight`.
// Lost, outside in the dark, out of every lamp's pool: `cold` health an hour. A car's hit: `car`
// (a second kills it). In the wild (deep woods, the river's ice, past the road's closure): a
// `gone` chance an hour it never comes back.
export const LOST = { far: 60, ms: 20_000, found: 8, call: 30, sight: 15, cold: 8, car: 60, gone: 0.03 } as const;
/** The chance it's gone for good after `hours` in the wild. */
export const goneChance = (hours: number) => 1 - (1 - LOST.gone) ** Math.max(0, hours);
/** Health lost to the cold over `hours` out in the dark. */
export const coldHurt = (hours: number) => LOST.cold * Math.max(0, hours);
// Where its owner can look for it (the panel, the GPS): the Grounds' metres, the floor, the place's
// name, when, by whom; `lost`: a sighting (a circle to search), else where it is (a pin).
export interface PetSeen {
  x: number;
  z: number;
  level: number;
  where: string;
  at: number;
  by?: string;
  lost?: boolean;
}
// a happy pet obeys; a bored one listens half the time
export const obeys = (n: Needs, rnd: number) => n.fun >= 15 || rnd < 0.5;

// ── sounds ──────────────────────────────────────────────────────────────────
export function petNoise(species: Species, mood: PetMood, lang: "en" | "pt"): string {
  return SPECIES_DEFS[species].noise[mood][lang === "pt" ? 1 : 0];
}

// ── the record ──────────────────────────────────────────────────────────────
export const PET_MAX = 3; // per person
export interface PetRecord {
  id: number;
  species: Species;
  name: string;
  look: PetLook;
  outfit: PetOutfit;
  needs: Needs;
  xp: number;
  tricks: Record<string, number>; // progress 0..100
  alive: boolean;
  bornAt: number; // ms
  diedAt: number | null;
  seenAt: number; // when the needs were last settled (ms)
  wins: number;
  losses: number;
  // its mind (shared/mind.ts): who it is, what it remembers, who it's close to
  traits?: Traits;
  memory?: Memory;
  bonds?: Bonds;
  // where it is in the world (docs/plan/51-the-pet.md): it stays when its owner leaves
  place?: PetPlace | null;
}
// A pet's place: a spot on a floor (or the land round the ground floor), in a mode. "died": it
// died there with its owner away — they're told at their next login, and it's out of the world.
export interface PetPlace {
  x: number;
  y: number;
  level: number;
  mode: PetMode | "died";
  seen?: PetSeen; // lost: its last sighting
  cause?: string; // died: of what (hunger, cold, car, gone)
}
export function cleanPlace(u: unknown): PetPlace | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const level = Number(o.level);
  if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 2000)) return null;
  if (!Number.isInteger(level) || level < 0 || level > 200) return null;
  const mode = o.mode === "died" || isPetMode(o.mode) ? o.mode : "wait";
  const out: PetPlace = { x, y, level, mode };
  const s = o.seen as Record<string, unknown> | undefined;
  if (s && [s.x, s.z, s.at].every((v) => Number.isFinite(Number(v))))
    out.seen = {
      x: Number(s.x),
      z: Number(s.z),
      level: Number(s.level) | 0,
      where: String(s.where ?? "").slice(0, 60),
      at: Number(s.at),
      by: s.by ? String(s.by).slice(0, 60) : undefined,
      lost: !!s.lost,
    };
  if (typeof o.cause === "string") out.cause = o.cause.slice(0, 12);
  return out;
}
// A pet out in the world, as the API lists them for the world-server's start: whose it is too.
export type PetOut = PetRecord & { uid: number; owner: string };
export function newPet(id: number, species: Species, name: string, look: unknown, now: number): PetRecord {
  const clean = cleanLook(species, look);
  return {
    id,
    species,
    name: cleanName(name, SPECIES_DEFS[species].label),
    look: clean,
    traits: rollTraits(species, clean.breed, (id * 7919 + (now % 100_000)) >>> 0),
    memory: emptyMemory(),
    bonds: {},
    outfit: { ...DEFAULT_OUTFIT },
    needs: { ...FULL_NEEDS },
    xp: 0,
    tricks: {},
    alive: true,
    bornAt: now,
    diedAt: null,
    seenAt: now,
    wins: 0,
    losses: 0,
  };
}

// ── battles ─────────────────────────────────────────────────────────────────
export const MOVES = ["attack", "special", "defend", "rest"] as const;
export type Move = (typeof MOVES)[number];
export const isMove = (m: unknown): m is Move => typeof m === "string" && (MOVES as readonly string[]).includes(m);
export const BATTLE = { pickMs: 12_000, animMs: 2600, rounds: 12, challengeMs: 30_000, reach: 10 } as const;
export const hpFor = (s: Stats) => 40 + s.heart * 4;

export interface Fighter {
  species: Species;
  stats: Stats;
  hp: number;
  max: number;
  poison: number; // rounds of venom left
  guard: boolean; // defending this round
  special: boolean; // its signature trick is learned
}
export interface BattleEvent {
  who: "a" | "b";
  move: Move;
  dmg?: number;
  heal?: number;
  miss?: boolean;
  crit?: boolean;
  poison?: boolean; // venom took hold / ticked
  reflect?: number;
  ko?: boolean;
}

// One round, both moves known. `rnd()` in [0, 1).
export function resolveRound(
  a: Fighter,
  b: Fighter,
  ma: Move,
  mb: Move,
  rnd: () => number,
): { a: Fighter; b: Fighter; log: BattleEvent[] } {
  const A = { ...a, guard: false };
  const B = { ...b, guard: false };
  const log: BattleEvent[] = [];
  const side = { a: A, b: B };
  const moves = { a: ma, b: mb };
  // guards go up before anything lands
  for (const w of ["a", "b"] as const) if (moves[w] === "defend") side[w].guard = true;
  // the faster first; a rabbit's hop always first
  const first = (w: "a" | "b") =>
    (moves[w] === "special" && side[w].species === "rabbit" ? 1000 : 0) + side[w].stats.speed;
  const fa = first("a");
  const fb = first("b");
  const order: ("a" | "b")[] = fa > fb || (fa === fb && rnd() < 0.5) ? ["a", "b"] : ["b", "a"];
  const act = (w: "a" | "b") => {
    const me = side[w];
    const other = w === "a" ? "b" : "a";
    const them = side[other];
    const m = moves[w];
    if (me.hp <= 0) return;
    if (m === "defend") return void log.push({ who: w, move: m });
    if (m === "rest") {
      const heal = Math.min(me.max - me.hp, Math.round(me.max * 0.18));
      me.hp += heal;
      return void log.push({ who: w, move: m, heal });
    }
    const special = m === "special" && me.special;
    const sp = me.species;
    if (special && sp === "capybara") {
      // chill: a deep breath, a third of it back
      const heal = Math.min(me.max - me.hp, Math.round(me.max * 0.3));
      me.hp += heal;
      return void log.push({ who: w, move: m, heal });
    }
    // to hit: sure for attacks and a parrot's screech, else by wit
    if (special && sp !== "parrot" && rnd() > 0.72 + me.stats.wit / 400)
      return void log.push({ who: w, move: m, miss: true });
    const mult = !special ? 1 : sp === "dog" ? 2 : sp === "parrot" ? 1.5 : 1.7;
    const crit = rnd() < me.stats.wit / 200;
    let dmg = Math.max(2, Math.round(me.stats.power * 1.2 * (0.85 + rnd() * 0.3) * mult - them.stats.heart * 0.3));
    if (crit) dmg = Math.round(dmg * 1.6);
    let reflect = 0;
    if (them.guard && !(special && sp === "cat")) {
      dmg = Math.ceil(dmg / 2);
      reflect = Math.floor(dmg * 0.25);
      me.hp -= reflect;
    }
    them.hp -= dmg;
    const ev: BattleEvent = { who: w, move: m, dmg, crit: crit || undefined, reflect: reflect || undefined };
    if (special && sp === "platypus") {
      them.poison = 3;
      ev.poison = true;
    }
    if (them.hp <= 0) ev.ko = true;
    log.push(ev);
  };
  for (const w of order) act(w);
  // venom ticks at the end of the round
  for (const w of ["a", "b"] as const) {
    const f = side[w];
    if (f.poison > 0 && f.hp > 0) {
      f.poison--;
      const dmg = Math.max(1, Math.round(f.max * 0.06));
      f.hp -= dmg;
      log.push({ who: w, move: "rest", dmg, poison: true, ko: f.hp <= 0 || undefined });
    }
  }
  A.hp = Math.max(0, A.hp);
  B.hp = Math.max(0, B.hp);
  return { a: A, b: B, log };
}

// Who won once it's over: a KO, or after the last round the healthier one.
export function battleWinner(a: Fighter, b: Fighter, round: number): "a" | "b" | "draw" | null {
  if (a.hp <= 0 && b.hp <= 0) return "draw";
  if (a.hp <= 0) return "b";
  if (b.hp <= 0) return "a";
  if (round < BATTLE.rounds) return null;
  const ka = a.hp / a.max;
  const kb = b.hp / b.max;
  return ka === kb ? "draw" : ka > kb ? "a" : "b";
}

// What a battle does to each pet afterwards.
export function afterBattle(n: Needs, won: boolean): Needs {
  return {
    ...n,
    energy: clamp(n.energy - (won ? 20 : 30)),
    fun: clamp(n.fun + (won ? 20 : -10)),
  };
}

// ── toys in the world ───────────────────────────────────────────────────────
// A toy out of someone's hand is a thing everyone sees: flying (an arc from
// where it was thrown to where it lands), on the floor, or in a pet's mouth.
export const THROW_RANGE = 8; // tiles
export const THROW_SPEED = 7; // tiles per second along the ground
export const HAND_Z = 0.95; // tiles: where it leaves the hand
export interface ToyFlight {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  at: number; // when it left the hand (server ms)
  dur: number; // ms in the air
}
export const flightMs = (d: number) => Math.max(350, Math.round((d / THROW_SPEED) * 1000));
// Where it is `now`, with a couple of bounces after landing (`z` in tiles).
export function toyAt(f: ToyFlight, now: number): { x: number; y: number; z: number; done: boolean } {
  const dx = f.toX - f.fromX;
  const dy = f.toY - f.fromY;
  const d = Math.hypot(dx, dy);
  const k = Math.max(0, (now - f.at) / Math.max(1, f.dur));
  if (k >= 1) {
    // two small bounces, then still
    const after = (now - f.at - f.dur) / 1000;
    const b1 = 0.42;
    const b2 = b1 + 0.26;
    let z = 0;
    if (after < b1) z = 0.22 * Math.sin((after / b1) * Math.PI);
    else if (after < b2) z = 0.08 * Math.sin(((after - b1) / (b2 - b1)) * Math.PI);
    return { x: f.toX, y: f.toY, z, done: after > b2 };
  }
  const peak = Math.min(1.3, 0.35 + d * 0.14);
  return { x: f.fromX + dx * k, y: f.fromY + dy * k, z: HAND_Z * (1 - k) + 4 * peak * k * (1 - k), done: false };
}
export const FETCH = { fun: 14, xp: 6, energy: 4, reach: 0.6 } as const;
