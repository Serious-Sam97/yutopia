// An animal's mind (docs/plan/126-animal-life.md, phase 3; docs/plan/128-animal-minds.md): a few needs (food, water,
// rest), fear that rises and fades, and a choice of what to do now. What's urgent comes first, and outweighs any
// choice of the day: a predator's danger (126 F5c, its nerf kept), a threat by degrees — noticed, watched, an alarm,
// off at a walk, a bolt (128 F7a) —, a defender at bay, a hand held out, its friend, its prey (its pack's hunt), its
// mother. Then the day (F2b): each choice — feed, drink, bed down, roam its range, nibble on, groom, play, sniff about,
// watch for the herd — scored from its needs, the hour (its species' hours), its places (places.ts, F4a), its group
// (F5a), and held a while once taken. Pure: the server passes a context and turns the intention into a walk, a run, a
// flight, a strike; its senses (what's noticed, heard, passed on by an alarm) are the server's.
import { ANIMALS, type AnimalKind, activeAt, type Danger, dangerAt, takes } from "./species.ts";
import { traitsOf } from "./traits.ts";

/** What it's doing (on the wire as a byte: DOINGS' index — added ones at the end, the old keep theirs). */
export const DOINGS = [
  "idle",
  "graze", // eating where it stands: grass, seeds, a peck
  "wander", // a few steps on, round where it is
  "rest", // lying down, awake
  "sleep",
  "alert", // head up, watching what's coming
  "flee",
  "fly", // in the air: off and away, or about
  "perch", // (a bird) up a tree, on a roof
  "swim",
  "warn", // a growl, a stare, a hiss, a bluff
  "stalk", // low and slow after its prey (or you)
  "chase",
  "attack",
  "approach", // coming to a hand held out
  "eat", // from the hand; at a kill
  "follow", // its friend (befriended), its lead, its mother
  "shelter", // out of the storm: to its bed, under the trees
  "ridden",
  "dead",
  // (plan 128)
  "travel", // on its way somewhere of its day: to its bed, its feeding ground, the water, a far corner of its range
  "leave", // off at a walk from what's coming (not yet a bolt)
  "alarm", // a snort, a stamp, a call: the others warned, then off
  "drink",
  "sniff", // nose down, having a look at something
  "groom",
  "play", // the young
  "call", // a howl, a call of its own
] as const;
export type Doing = (typeof DOINGS)[number];
export const doingOf = (n: number): Doing => DOINGS[n] ?? "idle";
export const doingNo = (d: Doing): number => DOINGS.indexOf(d);

/** Its pace for a doing: the clip and speed the server and the client pick. */
export const PACES = ["still", "walk", "trot", "run", "fly", "swim"] as const;
export type Pace = (typeof PACES)[number];
export const paceOf = (n: number): Pace => PACES[n] ?? "still";
export const paceNo = (p: Pace): number => PACES.indexOf(p);

export interface Needs {
  /** 0 full … 1 starving */
  hunger: number;
  /** 0 fresh … 1 worn out */
  tired: number;
  /** 0 calm … 1 terrified (fades by its wariness) */
  fear: number;
  /** 0 … 1 parched (it drinks: traits.drinks) */
  thirst?: number;
}
export const freshNeeds = (): Needs => ({ hunger: 0.2, tired: 0.1, fear: 0, thirst: 0.2 });

/** Something round it that matters: a person, a car, a shot, another animal, a fire, an alarm passed on, a kill. */
export interface Seen {
  id: string;
  kind: "person" | "car" | "shot" | "animal" | "pet" | "fire" | "alarm" | "carcass";
  x: number;
  z: number;
  /** its speed (m/s) */
  v: number;
  /** a person's: crouched (sneaking up, phase 9) */
  low?: boolean;
  /** a person's: what's in their hand (a food it might take) */
  holds?: string;
  /** a person's: a lit torch in their hand (keeps a predator off) */
  torch?: boolean;
  /** a person's: their trust with this animal 0..1 (fed it, befriended) */
  trust?: number;
  /** an animal's species */
  species?: AnimalKind;
  /** an animal's: hurt/dead (prey that's easy) */
  weak?: boolean;
  /** (plan 128, F6a) how sure it is of it (0 unnoticed … 1 seen plainly); unset: 1 */
  aware?: number;
  /** only heard, not seen (it knows the way it is, not what) */
  heard?: boolean;
  /** coming at it (m/s: >0 closer by so much a second) */
  closing?: number;
  /** a carcass: something bigger feeding on it */
  guarded?: boolean;
}

export interface Ctx {
  kind: AnimalKind;
  young: boolean;
  /** the world's hour (0..24) and how dark it is (0 day … 1 night) */
  hour: number;
  night: number;
  /** a blizzard, a storm: 0..1 */
  storm: number;
  x: number;
  z: number;
  home: { x: number; z: number };
  /** its territory's radius (a predator's), 0 none */
  territory: number;
  /** its pen (kept on the farm) */
  pen?: { x0: number; z0: number; x1: number; z1: number };
  /** hurt (hp under a third): it limps away, or turns at bay */
  hurt: boolean;
  /** its group's lead, when it isn't the lead: where, what it's doing, how fast it goes, after whom */
  lead?: { x: number; z: number; doing: Doing; pace?: Pace; target?: string };
  /** young of its own close by (a mother defends them) */
  youngNear: boolean;
  /** in open water now */
  inWater: boolean;
  /** befriended: its friend's id (it follows them), and whether its friend is near */
  friend?: string;
  seen: Seen[];
  needs: Needs;
  /** what it was doing and since how long (s) */
  doing: Doing;
  for: number;
  /** 0..1 a roll for this think (the server's seeded random) */
  roll: number;
  // ── plan 128 ──
  /** its group's day: its bed, its feeding grounds, its water (places.ts) */
  places?: { bed: { x: number; z: number }; feed: { x: number; z: number }[]; water: { x: number; z: number } | null } | null;
  /** where it's going now, and whether it's there (the server's) */
  goal?: { x: number; z: number } | null;
  arrived?: boolean;
  /** its number in its group (0 the lead) and the one ahead of it (a file's) */
  index?: number;
  ahead?: { x: number; z: number } | null;
  /** a young one's mother */
  mother?: { x: number; z: number; doing: Doing } | null;
  /** the herd's watcher now (one of a grazing herd keeps watch, F5a) */
  lookout?: boolean;
  /** places to keep away from (a shot, a kill: remembered, F7a) */
  avoid?: { x: number; z: number; r: number }[];
  /** 0 … 1: how used it is to people here (a path, the town, people passing day after day without harm) */
  habit?: number;
  /** its call's due now (the server's timing, its species' `calls`) */
  callDue?: boolean;
}

export interface Intention {
  doing: Doing;
  pace: Pace;
  /** where to (a spot), or whom (an id: chase, attack, approach, follow) */
  to?: { x: number; z: number };
  target?: string;
  /** what it's on about, for the client's body language and its sound */
  why?:
    | "threat"
    | "prey"
    | "food"
    | "storm"
    | "night"
    | "home"
    | "pack"
    | "friend"
    | "curious"
    | "hurt"
    | "routine"
    | "water"
    | "bed"
    | "carrion"
    | "alarm"
    | "mother";
  /** (a pack's hunt) its place round the prey: one drives, the others cut it off */
  flank?: number;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** A spot away from `from`, `d` m past where it is (the server finds the ground's way there). */
export function awayFrom(me: { x: number; z: number }, from: { x: number; z: number }, d: number) {
  const dx = me.x - from.x;
  const dz = me.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: me.x + (dx / l) * d, z: me.z + (dz / l) * d };
}

/** How near it lets this person come before it bolts (m): by how they come, what it knows of them. 0: never. */
export function fleeAt(kind: AnimalKind, s: Seen, young: boolean): number {
  const d = ANIMALS[kind];
  let f = d.flee * (young ? 1.2 : 1);
  if (s.kind === "car") return Math.max(f * 1.5, 10);
  if (s.kind === "shot") return Math.max(f * 4, 60);
  if (s.kind === "fire") return d.danger ? d.danger.fire : f * 0.5;
  if (s.kind === "pet") return f * 1.1;
  if (s.kind === "alarm") return Math.max(f * 1.3, 12);
  // a runner frightens it twice as far; a crouched, slow one half
  if (s.v > 3.5) f *= 2;
  else if (s.low && s.v < 1.2) f *= 0.45;
  else if (s.v < 0.3) f *= 0.75;
  // one it trusts: closer and closer, none at all once it's a friend
  const t = s.trust ?? 0;
  f *= 1 - Math.min(1, t * 1.1);
  return f;
}

/** Does it like what's held out (and is it calm enough to come for it)? */
export const tempted = (c: Ctx, s: Seen) =>
  s.kind === "person" && !!s.holds && takes(c.kind, s.holds) && c.needs.fear < 0.45 && s.v < 1.2;

/** How hungry it gets an hour of being about (0..1), how tired, how thirsty; asleep it rests. */
export function stepNeeds(n: Needs, dt: number, doing: Doing, wary: number): Needs {
  const h = dt / 3600;
  const eating = doing === "graze" || doing === "eat";
  const resting = doing === "rest" || doing === "sleep";
  const running = doing === "flee" || doing === "chase" || doing === "fly";
  return {
    hunger: clamp(n.hunger + (eating ? -1.6 : 0.35) * h),
    tired: clamp(n.tired + (doing === "sleep" ? -0.9 : resting ? -0.6 : running ? 0.9 : 0.12) * h),
    // fear fades: a bold one in seconds, a wary one in half a minute
    fear: clamp(n.fear - (dt / (6 + wary * 24)) * (doing === "flee" ? 0.4 : 1)),
    // (a drink: a few seconds' lapping does it)
    thirst: clamp((n.thirst ?? 0.2) + (doing === "drink" ? -dt / 8 : (running ? 0.6 : 0.3) * h)),
  };
}
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** How long a predator warns before it charges (s): time to back off. */
export const WARN_S = 2.5;

/** The danger it is to people tonight (its territory, a crowding), or null. */
function dangerNow(c: Ctx): Danger | null {
  const d = ANIMALS[c.kind].danger;
  if (!d || c.young) return null;
  return dangerAt(d, c.night);
}

/** Its day's round from home (m): its traits' (plan 128 F3a); a farm's: its pen. */
export function rangeOf(kind: AnimalKind): number {
  return traitsOf(kind).range;
}

/** How awake it is at this hour (0 … 1): its species' hours, and a rest in the middle of the day for those about at
 *  any hour (a wolf, a bear, a cat lie up through noon). */
export function awakeAt(kind: AnimalKind, hour: number): number {
  const d = ANIMALS[kind];
  const a = activeAt(d.hours, hour);
  const h = ((hour % 24) + 24) % 24;
  if (d.hours === "always") {
    // (about at any hour — but lying up through noon, easier by day, about most at dusk and dawn)
    if (h >= 11 && h < 15) return 0.45;
    if ((h >= 5 && h < 8) || (h >= 17 && h < 21)) return 1;
    return h >= 21 || h < 5 ? 0.8 : 0.65;
  }
  return a;
}

/** A spot to wander to in its pen (kept on the farm). */
export function wanderSpot(c: Ctx, r1: number, r2: number): { x: number; z: number } {
  if (c.pen) {
    const m = 1.2;
    return {
      x: c.pen.x0 + m + r1 * (c.pen.x1 - c.pen.x0 - 2 * m),
      z: c.pen.z0 + m + r2 * (c.pen.z1 - c.pen.z0 - 2 * m),
    };
  }
  // (a few steps on round where it is: 4–15 m — back in, out at its range's edge)
  const R = rangeOf(c.kind);
  const out = R > 0 ? dist(c, c.home) / R : 0;
  const a = out > 0.95 ? Math.atan2(c.home.z - c.z, c.home.x - c.x) + (r1 - 0.5) : r1 * Math.PI * 2;
  const r = 4 + r2 * 11;
  return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
}

/** Somewhere in its range it hasn't been lately: a ring well out from home (it uses all of it, F3a). */
function roamSpot(c: Ctx, r1: number, r2: number): { x: number; z: number } {
  const R = rangeOf(c.kind) * (c.young ? 0.6 : 1);
  const a = r1 * Math.PI * 2;
  const r = (0.35 + r2 * 0.6) * R;
  return { x: c.home.x + Math.cos(a) * r, z: c.home.z + Math.sin(a) * r };
}
const avoided = (c: Ctx, p: { x: number; z: number }) => !!c.avoid?.some((a) => dist(a, p) < a.r);

/** How long it holds a choice of the day once taken (s, at the least; give or take by the roll). */
const HOLD: Partial<Record<Doing, number>> = {
  graze: 40,
  rest: 150,
  sleep: 300,
  idle: 5,
  wander: 0,
  swim: 25,
  perch: 120,
  drink: 7,
  groom: 8,
  play: 10,
  sniff: 5,
  alert: 3,
  call: 4,
};

/** What it does now. */
export function think(c: Ctx): Intention {
  const d = ANIMALS[c.kind];
  const t = traitsOf(c.kind, c.young);
  if (c.doing === "dead") return { doing: "dead", pace: "still" };
  if (c.doing === "ridden") return { doing: "ridden", pace: "still" };
  // (what it's noticed: plan 128 F6a — the server's senses; unset is plainly seen)
  const aware = (s: Seen) => s.aware ?? 1;
  // (its friend: always known — behind it, still, crouched)
  const people = c.seen.filter((s) => s.kind === "person" && (aware(s) >= 0.3 || (!!c.friend && s.id === c.friend)));
  const nearest = (xs: Seen[]) => {
    let best: Seen | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const s of xs) {
      const q = dist(c, s);
      if (q < bd) {
        bd = q;
        best = s;
      }
    }
    return best ? { s: best, d: bd } : null;
  };

  // ── a predator's danger (F5c): in its territory, or crowded ─────────────────────────────────────────────────────
  const danger = dangerNow(c);
  if (danger) {
    const fires = c.seen.filter((s) => s.kind === "fire" || (s.kind === "person" && s.torch));
    const strangers = people.filter((s) => (s.trust ?? 0) < 0.5);
    const p = nearest(strangers);
    if (p) {
      const inTerritory = danger.territory > 0 && dist(p.s, c.home) < danger.territory;
      const crowded = p.d < danger.charge * 0.6;
      const lit = fires.some((f) => dist(f, c) < danger.fire + 2 || dist(f, p.s) < 1.5);
      if (inTerritory || crowded || c.youngNear) {
        if (lit && p.d < danger.fire) return { doing: "flee", pace: "trot", to: awayFrom(c, p.s, danger.fire * 1.5), why: "threat" };
        if (lit) return { doing: "warn", pace: "still", target: p.s.id, why: "threat" };
        // (it warns first — a growl, a stare for a few seconds — and charges only if you stay; one right on top of it,
        // or one it's already after, gets no warning)
        if (p.d < danger.charge) {
          const warned = c.doing === "attack" || (c.doing === "warn" && c.for >= WARN_S) || p.d < danger.charge * 0.35;
          return warned
            ? { doing: "attack", pace: "run", target: p.s.id, why: "threat" }
            : { doing: "warn", pace: "still", target: p.s.id, why: "threat" };
        }
        if (p.d < danger.warn) return { doing: "warn", pace: "still", target: p.s.id, why: "threat" };
        // (a wolf pack in its pass shadows those who come in: stalks them)
        if (inTerritory && d.packKind === "pack" && p.d < danger.warn * 1.6)
          return { doing: "stalk", pace: "walk", target: p.s.id, why: "threat" };
      }
    }
  }

  // ── a threat, by degrees (plan 128 F7a): noticed, watched, an alarm, off at a walk, a bolt ───────────────────────
  // (each threat by how near it is against how near it may come: 1 its flee distance; a person on a path, in town,
  // passing day after day, lets it come nearer — habit)
  let worst: { s: Seen; d: number; at: number; k: number } | null = null;
  for (const s of c.seen) {
    if (aware(s) < 0.3) continue;
    let at = 0;
    if (s.kind === "animal") {
      if (!s.species || !ANIMALS[s.species].prey?.includes(c.kind)) continue;
      at = d.flee ? Math.max(d.flee, 18) : 0;
    } else if (s.kind === "carcass" || s.kind === "fire") {
      if (s.kind === "fire" && !danger) at = fleeAt(c.kind, s, c.young);
      else continue;
    } else {
      if (danger && s.kind !== "shot" && s.kind !== "car") continue; // (a predator isn't scared off by a walker)
      // (food held out by someone still: it's coming for it, not away — phase 9)
      at = tempted(c, s) ? 0 : fleeAt(c.kind, s, c.young);
      if (s.kind === "person" && s.v < 2.2 && !s.heard) at *= 1 - 0.5 * (c.habit ?? 0);
      // (only heard: it doesn't know how near, so less)
      if (s.heard) at *= 0.7;
    }
    if (!at) continue;
    const q = dist(c, s);
    const k = q / at;
    if (k < 2 && (!worst || k < worst.k)) worst = { s, d: q, at, k };
  }
  const fleeFrom = (from: { x: number; z: number; id?: string }, far: number): Intention => {
    // (what it's from, named: an alarm it calls points the others at it)
    const target = from.id && !from.id.startsWith("alarm:") && from.id !== "shot" ? from.id : undefined;
    if (d.flies && !c.inWater) return { doing: "fly", pace: "fly", to: awayFrom(c, from, far + 20), why: "threat", target };
    if (d.swims && c.inWater) return { doing: "swim", pace: "swim", to: awayFrom(c, from, far * 0.5), why: "threat", target };
    return { doing: "flee", pace: "run", to: awayFrom(c, from, far), why: "threat", target };
  };
  // (bolting: on to where it's bolting — a run all the way, not a few strides and back to grazing — unless what it's
  // from has come nearer than before)
  if ((c.doing === "flee" || ((c.doing === "fly" || c.doing === "swim") && c.needs.fear > 0.3)) && c.goal && !c.arrived && c.needs.fear > 0.2) {
    const near = worst && worst.k < 0.5;
    if (!near)
      return { doing: c.doing, pace: c.doing === "fly" ? "fly" : c.doing === "swim" ? "swim" : "run", to: c.goal, why: "threat" };
  }
  if (worst) {
    const { s, d: q, at, k } = worst;
    // (a defender cornered or with young: it turns on its threat — a boar, a moose, a goose)
    if (d.defends && !danger && (c.youngNear || c.hurt) && s.kind === "person" && q < 4)
      return { doing: "attack", pace: "run", target: s.id, why: "threat" };
    const far = Math.max(30, at * 2.2);
    if (k < 1 || s.kind === "shot" || s.kind === "car") {
      // (an alarm first — a snort, a stamp, a call: the others warned — when there's a moment for it)
      const moment = s.kind === "person" && s.v < 3.5 && k > 0.6 && t.alarm > 0 && !d.flies;
      if (c.doing === "alarm" && c.for < 0.9) return { doing: "alarm", pace: "still", target: s.id, why: "alarm" };
      if (moment && c.doing !== "flee" && c.doing !== "alarm") return { doing: "alarm", pace: "still", target: s.id, why: "alarm" };
      return fleeFrom(s, far);
    }
    if (c.needs.fear > 0.85) return fleeFrom(s, far);
    // coming at it: off at a walk (a trot if it's quick), before it has to bolt
    if (k < 1.5 && (s.closing ?? 0) > 0.3)
      return { doing: "leave", pace: (s.closing ?? 0) > 1 ? "trot" : "walk", to: awayFrom(c, s, at * 1.6), why: "threat" };
    // near enough to watch, a while — then on with its day, an eye on it (it watches again if it comes on)
    // (watching: held a few seconds — longer the warier —, then a glance now and then, not a stare)
    const watchFor = 3 + d.wary * 5;
    const watching = c.doing === "alert" && c.for < watchFor;
    if (k < 1.8 && (watching || (c.doing !== "alert" && c.roll < 0.3)))
      return { doing: "alert", pace: "still", target: s.id, why: s.heard ? "curious" : "threat" };
  }
  // (terrified — hurt, shot at — and nothing to see: still away; a bolt's own fright, 0.75, ends where it got to)
  if (!worst && c.needs.fear > 0.85) {
    const from = c.seen[0] ?? c.home;
    return fleeFrom(from, Math.max(30, d.flee * 2.2));
  }

  // ── food held out (phase 9) ─────────────────────────────────────────────────────────────────────────────────────
  const offer = people
    .filter((s) => tempted(c, s))
    .map((s) => ({ s, d: dist(c, s) }))
    .filter((o) => o.d < Math.min(d.sight, 25))
    .sort((a, b) => a.d - b.d)[0];
  if (offer) {
    if (offer.d < Math.max(0.8, d.len * 0.7)) return { doing: "eat", pace: "still", target: offer.s.id, why: "food" };
    // (the wary hold back till it's still and they're hungry enough)
    if (offer.s.v < 0.4 || c.needs.hunger > 0.5 || (offer.s.trust ?? 0) > 0.3)
      return { doing: "approach", pace: "walk", target: offer.s.id, why: "food" };
  }

  // ── its friend (befriended): it follows them when they're near ─────────────────────────────────────────────────
  if (c.friend) {
    const f = people.find((s) => s.id === c.friend);
    if (f && dist(c, f) > 3) return { doing: "follow", pace: dist(c, f) > 10 ? "run" : "walk", target: f.id, why: "friend" };
    // (by them: it stays, sniffs about, sits — not off home)
    if (f) return { doing: c.roll < 0.3 ? "graze" : "idle", pace: "still", why: "friend" };
  }

  // ── its prey (a predator hungry enough), its pack's hunt (F8a) ──────────────────────────────────────────────────
  if (c.lead && (c.lead.doing === "chase" || c.lead.doing === "stalk") && c.lead.target && d.prey && !c.young)
    // (one drives, the others cut it off: each its own side, ahead of it)
    return {
      doing: c.lead.doing,
      pace: c.lead.doing === "chase" ? "run" : "walk",
      target: c.lead.target,
      why: "prey",
      flank: c.index ?? 1,
    };
  const awakeNow = awakeAt(c.kind, c.hour);
  if (d.prey && !c.young && c.needs.hunger > 0.55 && awakeNow > 0.3) {
    const prey = nearest(c.seen.filter((s) => s.kind === "animal" && s.species && d.prey?.includes(s.species) && aware(s) >= 0.3));
    if (prey && prey.d < d.sight) {
      if (prey.d < Math.max(1, d.len)) return { doing: "attack", pace: "run", target: prey.s.id, why: "prey" };
      if (prey.d < d.sight * 0.3 || prey.s.weak) return { doing: "chase", pace: "run", target: prey.s.id, why: "prey" };
      return { doing: "stalk", pace: "walk", target: prey.s.id, why: "prey" };
    }
  }

  // ── a young one: by its mother (F8a) ───────────────────────────────────────────────────────────────────────────
  if (c.young && c.mother) {
    const m = c.mother;
    const md = dist(c, m);
    if (m.doing === "flee" || m.doing === "fly") return { doing: "flee", pace: "run", to: m, why: "mother" };
    if (md > 6) return { doing: "follow", pace: md > 18 ? "run" : md > 9 ? "trot" : "walk", to: m, why: "mother" };
    if (m.doing === "rest" || m.doing === "sleep") return { doing: c.doing === "sleep" ? "sleep" : "rest", pace: "still", why: "mother" };
  }

  // ── the storm: to cover ─────────────────────────────────────────────────────────────────────────────────────────
  const bed = c.places?.bed ?? c.home;
  if (c.storm > 0.6 && !c.pen) {
    if (dist(c, bed) > 8) return { doing: "shelter", pace: "trot", to: bed, why: "storm" };
    return { doing: "rest", pace: "still", why: "storm" };
  }

  // ── a kill, a body lying: a scavenger's (F8a) ───────────────────────────────────────────────────────────────────
  if (t.scavenger && c.needs.hunger > 0.25 && awakeNow > 0.3) {
    const k = nearest(c.seen.filter((s) => s.kind === "carcass"));
    if (k) {
      const big = !!d.danger;
      if (k.s.guarded && !big) {
        // (something bigger at it: it waits its turn, near)
        if (k.d > 18) return { doing: d.flies ? "fly" : "travel", pace: d.flies ? "fly" : "walk", to: awayFrom(k.s, c, -14), why: "carrion" };
        return { doing: d.flies ? "perch" : "alert", pace: "still", target: k.s.id, why: "carrion" };
      }
      if (k.d > 1.6) return { doing: d.flies && k.d > 12 ? "fly" : "travel", pace: d.flies && k.d > 12 ? "fly" : k.d > 40 ? "trot" : "walk", to: k.s, why: "carrion" };
      return { doing: "eat", pace: "still", target: k.s.id, why: "carrion" };
    }
  }

  // ── its group (F5a): on the move with its lead, near it when it's still ────────────────────────────────────────
  const moving = (x: Doing) =>
    x === "travel" || x === "wander" || x === "follow" || x === "flee" || x === "fly" || x === "swim" || x === "leave" || x === "shelter";
  if (c.lead) {
    const ld = dist(c, c.lead);
    const keep = 2 + d.len * 3;
    if (c.lead.doing === "flee" || c.lead.doing === "fly")
      return { doing: c.lead.doing, pace: c.lead.doing === "fly" ? "fly" : "run", to: c.lead, why: "pack" };
    if (moving(c.lead.doing)) {
      // a file behind the one ahead; a herd, a flock, a raft round the lead (the server keeps them apart)
      const after = t.keeps === "file" && c.ahead ? c.ahead : c.lead;
      const ad = dist(c, after);
      const lp = c.lead.pace ?? "walk";
      const pace: Pace = ad > keep * 6 ? "run" : ad > keep * 2.5 ? "trot" : lp === "swim" ? "swim" : lp === "fly" ? "fly" : lp === "still" ? "walk" : lp;
      return { doing: "follow", pace, to: after, why: "pack" };
    }
    if (ld > keep * 2.5) return { doing: "follow", pace: ld > keep * 6 ? "trot" : "walk", to: c.lead, why: "pack" };
  }

  // ── its call (the server's timing: F8a) ──────────────────────────────────────────────────────────────────────────
  if (c.callDue && !c.young && awakeNow > 0.2 && c.doing !== "flee") return { doing: "call", pace: "still", why: "routine" };

  // ── the day (F2b, F4a): each choice scored, the best taken, held a while ─────────────────────────────────────────
  return theDay(c, awakeNow);
}

/** What it does with its day: the choices scored (its needs, the hour, its places, its group), the best taken — the
 *  one it's at held while it's held (HOLD) or till it's there. */
function theDay(c: Ctx, awake: number): Intention {
  const d = ANIMALS[c.kind];
  const t = traitsOf(c.kind, c.young);
  const n = c.needs;
  const r = c.roll;
  const thirst = n.thirst ?? 0;
  // (kept on the farm: its pen's its day — about it, feeding, lying down)
  if (c.pen || !t.range) {
    const keepFor = HOLD[c.doing];
    if (keepFor && c.for < keepFor * (0.6 + r * 0.8)) return { doing: c.doing, pace: "still" };
    if (c.doing === "wander" && !c.arrived && c.goal) return { doing: "wander", pace: "walk", to: c.goal };
    if (awake < 0.3 || n.tired > 0.85) return { doing: n.tired > 0.6 ? "sleep" : "rest", pace: "still", why: "night" };
    if (n.hunger > 0.4 && r < 0.6) return { doing: "graze", pace: "still" };
    if (r < 0.5) return { doing: "wander", pace: "walk", to: wanderSpot(c, (r * 7) % 1, (r * 13) % 1) };
    if (r < 0.8) return { doing: "graze", pace: "still" };
    return { doing: "idle", pace: "still" };
  }

  // on its way: there first (unless something weighs much more: the urgent's come before this)
  if ((c.doing === "travel" || c.doing === "wander" || c.doing === "shelter" || c.doing === "fly") && c.goal && !c.arrived)
    return {
      doing: c.doing === "shelter" ? "travel" : c.doing,
      pace: c.doing === "wander" ? "walk" : c.doing === "fly" ? "fly" : travelPace(c, c.goal),
      to: c.goal,
      why: "routine",
    };
  // a herd's watcher, its turn: head up while the rest graze or lie (it takes over from what it was at)
  if (c.lookout && t.lookout && c.lead && (c.lead.doing === "graze" || c.lead.doing === "rest" || c.lead.doing === "wander"))
    return { doing: "alert", pace: "still", why: "routine" };
  // feeding moves on a few steps every half minute or so: never stock-still for long
  if (c.doing === "graze" && c.for > 18 + r * 30 && !c.pen)
    return { doing: "wander", pace: "walk", to: wanderSpot(c, (r * 7) % 1, (r * 13) % 1), why: "routine" };
  // what it's at, held a while
  const hold = HOLD[c.doing];
  if (hold && c.for < hold * (0.6 + r * 0.8)) {
    // (a sleeper wakes as its hours come; a lookout's watch stays its watch)
    if (!(c.doing === "sleep" && awake > 0.6)) return { doing: c.doing, pace: c.doing === "swim" ? "swim" : "still", why: "routine" };
  }

  const p = c.places;
  const bed = p?.bed ?? c.home;
  const feeds = (p?.feed ?? []).filter((f) => !avoided(c, f));
  const nearFeed = feeds.find((f) => dist(c, f) < 25);
  const atBed = dist(c, bed) < 12;
  const atWater = !!p?.water && dist(c, p.water) < 8;
  const flies = !!d.flies && !c.inWater;
  const choices: { score: number; it: Intention }[] = [];
  // (a way to go costs: the farther, the less it's worth going — it settles where it is rather than to-and-fro)
  const R = Math.max(30, rangeOf(c.kind));
  const add = (score: number, it: Intention) =>
    choices.push({ score: it.doing === "travel" || (it.doing === "fly" && it.to) ? score * (1 - 0.4 * Math.min(1, dist(c, it.to ?? c) / R)) - 0.08 : score, it });
  // (settled where it is: bedded down, feeding — it stays till the need's met or its hours turn)
  const settledBed = (c.doing === "rest" || c.doing === "sleep" || c.doing === "perch") && awake < 0.5 ? 0.45 : 0;
  const settledFeed = (c.doing === "graze" || c.doing === "wander") && n.hunger > 0.12 ? 0.45 : 0;

  // to bed / bedded down: the hours it's asleep, tired
  const sleepy = (1 - awake) * 1.05 + n.tired * 0.8;
  // (a bird up its roost; on the water a duck rests where it floats)
  const bedDown: Doing = flies ? "perch" : awake < 0.3 || n.tired > 0.75 ? "sleep" : "rest";
  if (atBed) add(sleepy + settledBed, { doing: bedDown, pace: "still", why: "bed" });
  else add(sleepy * 0.95, go(c, bed, "bed"));
  // to feed / feeding: hungry, about
  const feedScore = (n.hunger * 1.1 + 0.15) * Math.max(0.2, awake) * 1.3;
  if (nearFeed || (!feeds.length && n.hunger > 0.3)) {
    add(feedScore + (nearFeed ? settledFeed : 0), { doing: "graze", pace: "still", why: "routine" });
  } else if (feeds.length) {
    const f = feeds[Math.floor(((r * 17) % 1) * feeds.length)];
    add(feedScore * 0.9, go(c, f, "routine"));
  }
  // to water / drinking
  if (p?.water && t.drinks && !avoided(c, p.water)) {
    const s = thirst * 1.3 * Math.max(0.4, awake);
    if (atWater) add(s, { doing: "drink", pace: "still", why: "water" });
    else add(s * 0.9, go(c, p.water, "water"));
  }
  // roam: a far corner of its range — patrolling it (a pack, a bear), a look round (it uses its whole range, F3a)
  const roam = roamSpot(c, (r * 11) % 1, (r * 5) % 1);
  if (!avoided(c, roam)) add(awake * (d.danger ? 0.4 : 0.28) * (1 - n.hunger * 0.6) * (1 - n.tired), go(c, roam, "routine"));
  // a few steps on, a sniff about, a groom, play (the young), a look round
  add(0.12 * awake, { doing: "wander", pace: "walk", to: wanderSpot(c, (r * 7) % 1, (r * 13) % 1), why: "routine" });
  if (!d.flies) {
    add(0.1 * awake, { doing: "sniff", pace: "still", why: "routine" });
    add(0.12 * (1 - awake) + 0.06, { doing: "groom", pace: "still", why: "routine" });
  }
  if (c.young && !d.flies) add(0.4 * awake, { doing: "play", pace: "still", why: "routine" });
  add(0.06, { doing: "idle", pace: "still" });
  // swimmers on the water; birds about
  if (c.inWater && d.swims) add(0.35 * awake, { doing: "swim", pace: "swim", to: wanderSpot(c, (r * 7) % 1, (r * 13) % 1), why: "routine" });
  if (d.flies && awake > 0.3) add(0.1 * awake, { doing: "fly", pace: "fly", to: roam, why: "routine" });
  // (a herd's own close by its lead: its day's choices made near it, not off on its own)
  let best = choices[0];
  for (const ch of choices) if (ch.score > best.score + 1e-9) best = ch;
  // (a little of the roll: two choices near enough, either)
  const close = choices.filter((ch) => ch.score > best.score - 0.06);
  const pick = close.length > 1 ? close[Math.floor(((r * 23) % 1) * close.length)] : best;
  if (c.lead && pick.it.to && dist(pick.it.to, c.lead) > 2 + d.len * 6)
    return { doing: "wander", pace: "walk", to: wanderSpot({ ...c, x: c.lead.x, z: c.lead.z }, (r * 7) % 1, (r * 13) % 1), why: "pack" };
  if (c.lead && pick.it.to && pick.it.doing === "travel") {
    const a = (c.index ?? 1) * 2.4;
    const rr = 1.5 + d.len * 1.6;
    return { ...pick.it, to: { x: pick.it.to.x + Math.cos(a) * rr, z: pick.it.to.z + Math.sin(a) * rr } };
  }
  return pick.it;
}

/** On its way to `to`: its day's places at a walk, a long way at a trot. */
function go(c: Ctx, to: { x: number; z: number }, why: Intention["why"]): Intention {
  const d = ANIMALS[c.kind];
  if (d.flies && !c.inWater && dist(c, to) > 30) return { doing: "fly", pace: "fly", to, why };
  if (c.inWater && d.swims) return { doing: "travel", pace: "swim", to, why };
  return { doing: "travel", pace: travelPace(c, to), to, why };
}
const travelPace = (c: Ctx, to: { x: number; z: number }): Pace => {
  const d = ANIMALS[c.kind];
  if (d.flies && !c.inWater && dist(c, to) > 30) return "fly";
  if (c.inWater && d.swims) return "swim";
  // (the dog kind trot wherever they go; the others a long way at a trot, the rest at a walk)
  if (traitsOf(c.kind).trots && dist(c, to) > 25) return "trot";
  return dist(c, to) > 120 && c.needs.tired < 0.5 ? "trot" : "walk";
};

// ── trust and befriending (phase 9, F7c) ─────────────────────────────────────────────────────────────────────────

/** A person's trust with one animal: how far along, and the last day it was fed by them. */
export interface Trust {
  /** 0..1: 1 a friend */
  v: number;
  /** the world's day it was last fed by them (one feed a day counts) */
  day: number;
}

/** After a feed on `day`: trust grows a step (its trustDays steps make a friend); twice a day counts once. */
export function fed(kind: AnimalKind, t: Trust | undefined, day: number): Trust {
  const d = ANIMALS[kind];
  const was = t ?? { v: 0, day: -1 };
  // (a second feed the same day adds nothing: else a crate's free handfuls, fed one after another, make a friend in
  // a minute — its trustDays are days)
  if (was.day === day) return { v: was.v, day };
  const step = 1 / Math.max(1, d.trustDays);
  // (a day missed fades a little: it forgets slowly)
  const gap = was.day < 0 ? 0 : Math.max(0, day - was.day - 1);
  const v = Math.max(0, was.v - gap * step * 0.25) + step;
  return { v: Math.min(1, v), day };
}
/** Is it a friend now: it'll follow them home and be their pet (when it may be befriended at its age)? */
export const isFriend = (t: Trust | undefined) => (t?.v ?? 0) >= 0.999;

/** The clip its doing plays (shared CLIPS), by pace. */
export function clipFor(doing: Doing, pace: Pace, flies: boolean): string {
  switch (doing) {
    case "dead":
      return "die";
    case "sleep":
    case "rest":
      return "lie";
    case "graze":
    case "eat":
      return "eat";
    case "alert":
    case "warn":
      return "look";
    case "attack":
      return "attack";
    case "perch":
      return "idle";
    case "ridden":
      return "ridden";
    case "drink":
      return "drink";
    case "sniff":
      return "sniff";
    case "groom":
      return "groom";
    case "play":
      return "play";
    case "call":
      return "howl";
    case "alarm":
      return "stamp";
  }
  if (pace === "fly") return flies ? "fly" : "run";
  if (pace === "swim") return "swim";
  if (pace === "run") return "run";
  if (pace === "trot") return "trot";
  if (pace === "walk") return "walk";
  return "idle";
}

/** The speed a pace goes at for this species (m/s). */
export function speedOf(kind: AnimalKind, pace: Pace, young: boolean): number {
  const d = ANIMALS[kind];
  const k = young ? 0.75 : 1;
  switch (pace) {
    case "still":
      return 0;
    case "walk":
      return d.walk * k;
    case "trot":
      return Math.min(d.run, d.walk * 2.4) * k;
    case "run":
      return d.run * k;
    case "fly":
      return (d.flies?.speed ?? d.run) * k;
    case "swim":
      return Math.max(0.5, d.walk * 0.7) * k;
  }
}
