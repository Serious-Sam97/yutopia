// An NPC's mind (docs/plan/123-npcs-alive.md, F1a): needs that fall as the minutes go, traits of their own, what they
// do next chosen from what's on offer round them — the server runs it for every placed NPC (F7a), deterministic but
// for the dice it's handed. The pets' mind (../mind.ts) is the shape: needs → wants → a choice kept till it's done.
// The world's hour is the real one, so their needs fall over minutes, not a day: something done every few minutes.
// Their work (F2a, F3c): a job at a spot in a town building in their shift; a staffed place is where the others' needs
// are met (a coffee at the counter, a meal at the diner). How they feel about people — players and each other (F4c,
// F5a, F6a) — is a bond, changed by what's done with them.

import { clamp100 } from "../needs.ts";

// ── needs ───────────────────────────────────────────────────────────────────
/** 100: met; 0: can't go on without. */
export const NEED_NAMES = ["hunger", "thirst", "energy", "fun", "social", "comfort"] as const;
export type NeedName = (typeof NEED_NAMES)[number];
export type NpcNeeds = Record<NeedName, number>;
/** Minutes from met to empty, left alone (an active one's fun, an outgoing one's company, the night's energy faster). */
export const NEED_EMPTY_MIN: Record<NeedName, number> = {
  hunger: 150,
  thirst: 80,
  energy: 14 * 60,
  fun: 50,
  social: 60,
  comfort: 120,
};
export const fullNeeds = (): NpcNeeds => ({
  hunger: 100,
  thirst: 100,
  energy: 100,
  fun: 100,
  social: 100,
  comfort: 100,
});

// ── traits ──────────────────────────────────────────────────────────────────
/** 0…1 each, set on the cast page (else from their key): who they are. */
export interface NpcTraits {
  /** shy 0 … outgoing 1: company wanted sooner, talks more, takes to people */
  outgoing: number;
  /** lazy 0 … active 1: bored sooner, walks further for fun */
  active: number;
  /** messy 0 … neat 1: comfort wanted sooner */
  neat: number;
  /** grumpy 0 … cheerful 1: laughs at a joke, a better mood */
  cheerful: number;
}
export const TRAIT_NAMES = ["outgoing", "active", "neat", "cheerful"] as const;
/** A number in 0…1 from a key and a salt (the same every time). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}
/** Their traits: as given (each 0…1, in tenths), the rest from their key. */
export function traitsOf(key: string, given?: Partial<Record<string, unknown>> | null): NpcTraits {
  const out = {} as NpcTraits;
  for (const t of TRAIT_NAMES) {
    const v = given?.[t];
    out[t] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.min(1, Math.round(v * 10) / 10))
        : Math.round(hash01(`${key}:${t}`) * 10) / 10;
  }
  return out;
}

// ── jobs, spots, activities ─────────────────────────────────────────────────
/** What they can be at work. */
export const JOBS = [
  "barista",
  "bartender",
  "cook",
  "waiter",
  "cashier",
  "clerk",
  "librarian",
  "cleaner",
  "guard",
] as const;
export type Job = (typeof JOBS)[number];
/** Where in a building a job is done: behind a counter, at a till, a desk; on the floor (walking it). */
export const SPOT_KINDS = ["counter", "till", "desk", "floor"] as const;
export type SpotKind = (typeof SPOT_KINDS)[number];
export const JOB_SPOTS: Record<Job, readonly SpotKind[]> = {
  barista: ["counter"],
  bartender: ["counter"],
  cook: ["counter"],
  waiter: ["floor"],
  cashier: ["till", "counter"],
  clerk: ["desk", "counter"],
  librarian: ["desk", "counter"],
  cleaner: ["floor"],
  guard: ["floor"],
};
/** What they do, each a while. */
export const ACTIVITY_KINDS = [
  "work",
  "coffee",
  "meal",
  "drink",
  "shop",
  "read",
  "bench",
  "chat",
  "sleep",
  "eat-home",
  "stroll",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
/** Where an activity is done: someone's service (a staffed place), home, a bench, with someone, anywhere. */
export type Where = "service" | "home" | "bench" | "friend" | "anywhere" | "work";
export interface Activity {
  /** each need's rise a minute while at it */
  fills: Partial<Record<NeedName, number>>;
  /** how long, minutes (lo…hi) */
  minutes: [number, number];
  where: Where;
  /** a service's: the jobs that sell it there */
  sold?: readonly Job[];
  /** what it is to them, over their head (client icons) */
  icon: string;
}
export const ACTIVITIES: Record<ActivityKind, Activity> = {
  work: { fills: { social: 0.6, hunger: 0.4, thirst: 0.6 }, minutes: [20, 40], where: "work", icon: "work" },
  coffee: {
    fills: { thirst: 30, fun: 6, energy: 4 },
    minutes: [2, 4],
    where: "service",
    sold: ["barista"],
    icon: "coffee",
  },
  meal: {
    fills: { hunger: 14, thirst: 4, fun: 2 },
    minutes: [6, 10],
    where: "service",
    sold: ["cook", "waiter"],
    icon: "meal",
  },
  drink: {
    fills: { thirst: 16, fun: 8, social: 5 },
    minutes: [4, 8],
    where: "service",
    sold: ["bartender"],
    icon: "drink",
  },
  shop: { fills: { fun: 6, hunger: 3 }, minutes: [3, 6], where: "service", sold: ["cashier", "clerk"], icon: "shop" },
  read: { fills: { fun: 9, comfort: 3 }, minutes: [5, 10], where: "service", sold: ["librarian"], icon: "book" },
  bench: { fills: { energy: 2, fun: 3, comfort: 1 }, minutes: [3, 7], where: "bench", icon: "bench" },
  chat: { fills: { social: 22, fun: 6 }, minutes: [1, 2], where: "friend", icon: "chat" },
  sleep: { fills: { energy: 2.2, comfort: 1 }, minutes: [40, 90], where: "home", icon: "zzz" },
  "eat-home": { fills: { hunger: 10, thirst: 8, comfort: 6 }, minutes: [8, 12], where: "home", icon: "meal" },
  stroll: { fills: { fun: 5, comfort: 1 }, minutes: [2, 5], where: "anywhere", icon: "walk" },
};
/** The activities a job's place sells. */
export function soldBy(job: Job): ActivityKind[] {
  return ACTIVITY_KINDS.filter((k) => ACTIVITIES[k].sold?.includes(job));
}

/** Their needs after `min` minutes of `doing` (or nothing): falling, by their traits and the night; what they're at
 *  filling its own. */
export function stepNeeds(n: NpcNeeds, t: NpcTraits, min: number, doing: ActivityKind | null, night = 0): NpcNeeds {
  const fall: Record<NeedName, number> = {
    hunger: 1,
    thirst: 1,
    energy: 1 + night * 0.8,
    fun: 0.6 + t.active * 0.8,
    social: 0.5 + t.outgoing,
    comfort: 0.6 + t.neat * 0.8,
  };
  const fills = doing ? ACTIVITIES[doing].fills : {};
  const out = { ...n };
  for (const k of NEED_NAMES)
    out[k] = clamp100(n[k] - (100 / NEED_EMPTY_MIN[k]) * fall[k] * min + (fills[k] ?? 0) * min);
  return out;
}

// ── wanting and choosing ────────────────────────────────────────────────────
/** How much each need presses, 0…100 (a need under a third presses hard). */
export function wants(n: NpcNeeds, t: NpcTraits, night = 0): Record<NeedName, number> {
  const p = (v: number, k = 1) => clamp100((100 - v) * k + (v < 33 ? (33 - v) * 1.2 : 0));
  return {
    hunger: p(n.hunger),
    thirst: p(n.thirst, 1.05),
    energy: p(n.energy, 0.7 + night * 0.8),
    fun: p(n.fun, 0.6 + t.active * 0.5),
    social: p(n.social, 0.5 + t.outgoing * 0.7),
    comfort: p(n.comfort, 0.6 + t.neat * 0.5),
  };
}
/** Something they could do now: its kind, where (an id the world knows: a worker's key, a bench, a friend), how far. */
export interface Offer {
  kind: ActivityKind;
  at: string;
  /** metres there (by the way, or straight) */
  dist: number;
}
export interface MindCtx {
  night: number;
  /** in their shift with a workplace */
  onShift: boolean;
  /** a home to go to */
  home: boolean;
  /** what's on offer round them (the staffed places, benches, friends near; work and home are their own) */
  offers: Offer[];
}
/** What they've chosen: the kind, where, and till when (ms) at most. */
export interface Plan {
  kind: ActivityKind;
  at: string;
  until: number;
}
/** Under this nothing presses: they stroll — their placed way at their place (plan 121's) —, or stand about. */
export const PRESSING = 45;
/** How good an offer is to them: what it fills of what presses, less the walk (a lazy one minds it more). */
export function scoreOf(o: Offer, w: Record<NeedName, number>, t: NpcTraits): number {
  const a = ACTIVITIES[o.kind];
  let s = 0;
  for (const k of NEED_NAMES) s += (w[k] / 100) * Math.min(40, (a.fills[k] ?? 0) * a.minutes[0]);
  return s - o.dist / (25 + t.active * 50);
}
/** What next: their shift's work first; asleep at home deep in the night when they're tired; else the best of what's
 *  on offer for what presses — a stroll when nothing does (`rand` 0…1 picks the length). */
export function choose(n: NpcNeeds, t: NpcTraits, c: MindCtx, now: number, rand: () => number): Plan {
  const len = (k: ActivityKind) => {
    const [lo, hi] = ACTIVITIES[k].minutes;
    return now + (lo + (hi - lo) * rand()) * 60_000;
  };
  if (c.onShift) return { kind: "work", at: "work", until: len("work") };
  const w = wants(n, t, c.night);
  if (c.home && ((c.night > 0.75 && n.energy < 70) || n.energy < 15))
    return { kind: "sleep", at: "home", until: len("sleep") };
  const all: Offer[] = [...c.offers];
  if (c.home) all.push({ kind: "eat-home", at: "home", dist: 60 });
  let best: Offer | null = null;
  let bestS = Number.NEGATIVE_INFINITY;
  for (const o of all) {
    const s = scoreOf(o, w, t);
    if (s > bestS) {
      bestS = s;
      best = o;
    }
  }
  const top = Math.max(...NEED_NAMES.map((k) => w[k]));
  if (!best || top < PRESSING || bestS <= 0.5) return { kind: "stroll", at: "", until: len("stroll") };
  return { kind: best.kind, at: best.at, until: len(best.kind) };
}
/** Done with it before its time: what it fills all met. */
export function metBy(n: NpcNeeds, kind: ActivityKind): boolean {
  const f = ACTIVITIES[kind].fills;
  if (kind === "work" || kind === "stroll") return false;
  return NEED_NAMES.every((k) => !f[k] || f[k] < 1 || n[k] >= 96);
}
/** The most pressing need (the panel's, the want over them). */
export function topWant(n: NpcNeeds, t: NpcTraits, night = 0): NeedName | null {
  const w = wants(n, t, night);
  let best: NeedName | null = null;
  for (const k of NEED_NAMES) if (w[k] >= PRESSING && (!best || w[k] > w[best])) best = k;
  return best;
}

// ── mood ────────────────────────────────────────────────────────────────────
export const MOODS = ["happy", "fine", "uneasy", "sad", "cross"] as const;
export type NpcMood = (typeof MOODS)[number];
/** Their mood, −100…100: their needs (a low one weighs), their nature, a lift or a sting from what was just done with
 *  them (`lift`, fading). */
export function moodValue(n: NpcNeeds, t: NpcTraits, lift = 0): number {
  let sum = 0;
  let low = 0;
  for (const k of NEED_NAMES) {
    sum += n[k];
    if (n[k] < 25) low += 25 - n[k];
  }
  const v = (sum / NEED_NAMES.length - 50) * 2 - low * 1.2 + (t.cheerful - 0.5) * 30 + lift;
  return Math.max(-100, Math.min(100, Math.round(v)));
}
export function moodOf(v: number, t: NpcTraits): NpcMood {
  if (v >= 50) return "happy";
  if (v >= 10) return "fine";
  if (v >= -30) return "uneasy";
  return t.cheerful < 0.4 ? "cross" : "sad";
}

// ── bonds ───────────────────────────────────────────────────────────────────
/** How they feel about someone (a player, another NPC): −100…100, how many times they've met, when last. */
export interface Bond {
  v: number;
  n: number;
  at: number;
}
export const BOND_LEVELS = ["dislike", "stranger", "acquaintance", "friend", "close"] as const;
export type BondLevel = (typeof BOND_LEVELS)[number];
export function bondLevel(b: Bond | null | undefined): BondLevel {
  if (!b) return "stranger";
  if (b.v <= -20) return "dislike";
  if (b.v >= 70) return "close";
  if (b.v >= 35) return "friend";
  if (b.v >= 10 || b.n >= 3) return "acquaintance";
  return "stranger";
}
/** A bond after a while unseen: back toward nothing, slowly (a week takes half of it away). */
export function bondFaded(b: Bond, now: number): Bond {
  const days = Math.max(0, now - b.at) / 86_400_000;
  return { ...b, v: Math.round(b.v * 0.5 ** (days / 7)) };
}

// ── what's done with them (the menu, F4c) ───────────────────────────────────
export const NPC_ACTS = [
  "talk",
  "greet",
  "joke",
  "compliment",
  "ask_day",
  "ask_job",
  "wave",
  "highfive",
  "fistbump",
  "cheers",
  "give",
  "order",
  "handshake",
  "hug",
  "kiss",
] as const;
export type NpcAct = (typeof NPC_ACTS)[number];
/** The acts two people do together, contact and all (the people's SOCIAL, and plan 123's new: shared actions.ts). */
export const TOGETHER: readonly NpcAct[] = ["highfive", "fistbump", "cheers", "give", "handshake", "hug", "kiss"];
/** How they take it — and say it: a line's moment (their cast's lines, else the defaults) and how their body says it. */
export type Reaction = "laugh" | "smile" | "shrug" | "frown" | "refuse" | "accept";
/** From how close they must be for it to be offered (a hug from an acquaintance, a kiss from a friend). */
export const ACT_LEVEL: Partial<Record<NpcAct, BondLevel>> = { hug: "acquaintance", kiss: "friend" };
const LEVEL_I = (l: BondLevel) => BOND_LEVELS.indexOf(l);
/** What's on the menu for them now: by how they feel about you, their mood, whether they're at work (an order then;
 *  a hug or a kiss not at the counter), and whether you've a drink to give. */
export function actsFor(
  level: BondLevel,
  mood: NpcMood,
  o: { atWork: boolean; serves: boolean; holding: boolean },
): NpcAct[] {
  return NPC_ACTS.filter((a) => {
    if (a === "order") return o.atWork && o.serves;
    if (a === "ask_job") return o.atWork || level !== "stranger";
    if (a === "give") return o.holding;
    if ((a === "hug" || a === "kiss") && o.atWork) return false;
    if (mood === "cross" && (a === "hug" || a === "kiss" || a === "joke")) return false;
    const need = ACT_LEVEL[a];
    return !need || LEVEL_I(level) >= LEVEL_I(need);
  });
}
/** What an act does: whether they take it, how much it moves them, how they react — by how they feel about you,
 *  their mood and nature, the dice (`r` 0…1). Doing the same again soon counts less (`again`: times in the last
 *  minutes). */
export function actOutcome(
  act: NpcAct,
  b: Bond | null,
  mood: NpcMood,
  t: NpcTraits,
  r: number,
  again = 0,
): { ok: boolean; dv: number; react: Reaction } {
  const lvl = LEVEL_I(bondLevel(b));
  const good = mood === "happy" ? 0.25 : mood === "fine" ? 0.1 : mood === "uneasy" ? -0.1 : -0.3;
  const tired = 1 / (1 + again * 0.8);
  const chance = (base: number) => base + good + (t.outgoing - 0.5) * 0.3 + (lvl - 1) * 0.1;
  const take = (base: number, up: number, down: number, yes: Reaction, no: Reaction) =>
    r < Math.max(0.05, Math.min(0.97, chance(base)))
      ? { ok: true, dv: Math.round(up * tired), react: yes }
      : { ok: false, dv: -down, react: no };
  switch (act) {
    case "talk":
    case "greet":
    case "wave":
      return { ok: true, dv: Math.round((act === "talk" ? 3 : 1) * tired), react: "smile" };
    case "ask_day":
    case "ask_job":
      return { ok: true, dv: Math.round(4 * tired), react: "smile" };
    case "joke":
      return r < Math.max(0.05, Math.min(0.95, 0.35 + t.cheerful * 0.5 + good))
        ? { ok: true, dv: Math.round(6 * tired), react: "laugh" }
        : { ok: false, dv: -2, react: "shrug" };
    case "compliment":
      return take(0.75, 6, 2, "smile", "shrug");
    case "highfive":
    case "fistbump":
    case "cheers":
    case "handshake":
      return take(0.8, 4, 2, "accept", "refuse");
    case "give":
      return { ok: true, dv: 8, react: "smile" };
    case "order":
      return { ok: true, dv: 1, react: "accept" };
    case "hug":
      return take(0.55, 9, 6, "accept", "refuse");
    case "kiss":
      return take(0.35, 12, 10, "accept", "refuse");
  }
}
/** A bond after an act (−100…100), met once more. */
export function bondAfter(b: Bond | null, dv: number, now: number): Bond {
  const v = Math.max(-100, Math.min(100, (b?.v ?? 0) + dv));
  return { v, n: (b?.n ?? 0) + 1, at: now };
}

// ── NPCs with each other (F6a) ──────────────────────────────────────────────
/** How two take to each other, −1…1: the cheerful with the cheerful, an outgoing one with anyone, a grumpy pair sour. */
export function getOn(a: NpcTraits, b: NpcTraits): number {
  const like =
    1 -
    (Math.abs(a.cheerful - b.cheerful) * 0.9 + Math.abs(a.active - b.active) * 0.5 + Math.abs(a.neat - b.neat) * 0.3);
  const open = (a.outgoing + b.outgoing) / 2;
  const sour = a.cheerful < 0.3 && b.cheerful < 0.3 ? 0.4 : 0;
  return Math.max(-1, Math.min(1, like * 0.9 + open * 0.6 - 0.65 - sour));
}
/** A chat between two NPCs: the bond's change (each the same), by how they get on, their moods, the dice. */
export function chatDelta(a: NpcTraits, b: NpcTraits, moodA: NpcMood, moodB: NpcMood, r: number): number {
  const m = (x: NpcMood) => (x === "happy" ? 0.3 : x === "fine" ? 0.1 : x === "uneasy" ? -0.15 : -0.4);
  const v = getOn(a, b) * 5 + (m(moodA) + m(moodB)) * 3 + (r - 0.5) * 4;
  return Math.max(-8, Math.min(8, Math.round(v)));
}
/** Whether two would stop to chat: both free and wanting company enough, not cross, and they don't dislike each
 *  other (unless it's a row: they keep apart). */
export function wouldChat(sa: number, sb: number, moodA: NpcMood, moodB: NpcMood, b: Bond | null): boolean {
  if (moodA === "cross" || moodB === "cross") return false;
  if (bondLevel(b) === "dislike") return false;
  return sa < 70 && sb < 85;
}
