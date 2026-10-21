// The shadowed's mind (docs/plan/30-the-dark.md, D5): pure, one step at a time,
// tested on its own. The server (features/dark.ts) senses for it — who's near,
// who it can see, whether a focused beam or a pool's light is on it — walks it
// where it wants to go, and lands the strike it decides on.
//
// 1. dormant   — not yet
// 2. emerge    — the dark gathering into a shape (1.2 s): the warning
// 3. stalk     — closes in, circles at 4–6 tiles, flanks; now and then rushes in
// 4. windup    — 0.8 s, plain to see, a slow lunge: roll through it, or step out of it
// 5. strike    — lands if you're within 1.3 tiles and not mid-roll (the server's call)
// 6. recover   — backs off a moment
// 7. burning   — under a focused beam: the shield falls 60/s, it goes at half speed
// 8. exposed   — the shield gone for 12 s (only now do bullets hurt, phase 5); it backs off
// 9. flee      — from a pool, a flare, the dawn
// 10. dissolve — gone (killed: a burst of light; or it just went)
// By day (docs/plan/31-the-day.md) they wait in nests instead:
// 11. lurk     — asleep where it was put, crouched; what comes near enough wakes it (and its nest)
// 12. home     — leashed: past 30 tiles from its nest, it walks back and sleeps again
// Someone safe indoors (the lot too) can't be had, but keeps it from going: with nobody
// to have it prowls round them at SHADE.watch, watching (stalk, no target).

export const SHADE_STATES = [
  "dormant",
  "emerge",
  "stalk",
  "windup",
  "strike",
  "recover",
  "burning",
  "exposed",
  "flee",
  "dissolve",
  "lurk",
  "home",
] as const;
export type ShadeState = (typeof SHADE_STATES)[number];
export const shadeCode = (s: ShadeState) => SHADE_STATES.indexOf(s);

/** Every number of them (seconds, tiles, tiles / s; the shield 0..100). */
export const SHADE = {
  emerge: 1.2,
  windup: 0.8,
  strike: 0.15,
  recover: 0.7,
  exposed: 12,
  dissolve: 1,
  /** killed: the death plays out (it staggers, goes down, burns away in light) */
  dying: 2.4,
  /** a strike lands within this; the windup starts this close */
  reach: 1.3,
  closeIn: 1.2,
  /** they circle at this far, until they rush in */
  circle: [4, 6] as const,
  /** between rushes (after the last, or after first seeing you) */
  rushEvery: [4, 7] as const,
  see: { day: 10, night: 20, crouch: 0.5 },
  hear: { sprint: 8, shot: 40 },
  /** the windup's lunge is slow: a step away (or a roll) gets you out of it */
  speed: { stalk: 3.2, rush: 4.2, windup: 1.5, flee: 5.5, back: 2.5, wander: 1.6 },
  /** under a focused beam (strength 1): shield per s; the speed, times */
  burn: 60,
  burnSlow: 0.5,
  /** the shield grows back, per s — once no beam has been on it for `regrowAfter` s
   *  (eased 2026-10-21, the user: "it comes back too fast") */
  regrow: 6,
  regrowAfter: 2,
  strikeDamage: 15,
  /** lost sight of everyone this long: it forgets where they were */
  forget: 10,
  /** what it takes to put one down, exposed (a revolver round is 50) */
  hp: 100,
  /** nobody near for this long (or the dawn): it goes */
  leave: 20,
  near: 70,
  /** someone safe indoors (the lot too) and nobody to have: it prowls round them this far off,
   *  watching (it can't step off the land — it paces the edge) — and doesn't go (2026-10-21) */
  watch: 10,
  /** asleep in a nest by day: what wakes it — seen this close (crouching, half), a sprint
   *  heard, a shot heard — and how far from its nest it'll go after anyone */
  lurk: { see: 10, crouch: 0.5, hear: 14, shot: 30 },
  leash: 30,
} as const;

export interface Shade {
  state: ShadeState;
  /** when the state began (s, the caller's clock) */
  since: number;
  x: number;
  y: number;
  shield: number;
  target: string | null;
  /** where it last saw or heard someone, and when */
  seen: { x: number; y: number; t: number } | null;
  /** which way round it circles */
  orbit: 1 | -1;
  /** when it may rush in next */
  rushAt: number;
  rushing: boolean;
  /** when someone was last within SHADE.near */
  nearAt: number;
  /** when a focused beam was last on it */
  burntAt: number;
  /** dissolving because it was killed (a burst of light), not just leaving */
  killed?: boolean;
  /** what bullets can take, only while it's exposed (phase 5) */
  hp: number;
  /** a day's: its nest, where it sleeps and is leashed to (docs/plan/31-the-day.md) */
  home?: { x: number; y: number } | null;
  /** where it stood last step, prowling (stuck at an edge or a corner: it turns back sooner) */
  was?: { x: number; y: number } | null;
}

export interface Prey {
  id: string;
  x: number;
  y: number;
  crouch: boolean;
  sprinting: boolean;
  /** not to be had: in a lamp's pool or a flare's, down, away, do-not-disturb, indoors */
  hidden: boolean;
  /** indoors (hidden too): safe, but they come and look — one with nobody to have prowls
   *  round the nearest, and stays while they're near */
  watch?: boolean;
}

export interface ShadeSense {
  /** the clock (s) */
  t: number;
  /** 0 day … 1 night */
  night: number;
  /** the dawn has come (or the dark was switched off): they go */
  dawn: boolean;
  /** focused beams on it now, summed (shared beam.ts beamAt of each, with line of sight) */
  burn: number;
  /** it stands in a lamp's pool or a flare's; and where that light is (to get out of it) */
  lit: boolean;
  light?: { x: number; y: number } | null;
  prey: readonly Prey[];
  /** a clear line from it to (x, y) */
  sees(x: number, y: number): boolean;
  /** shots fired just now (where from): one asleep within SHADE.lurk.shot wakes */
  shots?: readonly { x: number; y: number }[];
  /** one of its nest woke: it wakes too */
  woken?: boolean;
}

export interface ShadeAct {
  /** where to go (null: stand), how fast */
  goal: { x: number; y: number } | null;
  speed: number;
  /** a strike, at whom (the server lands it: in reach, not mid-roll) */
  strike?: string;
  /** what changed this step, for the clients' sound and look */
  became?: ShadeState;
  /** done: take it out of the world */
  gone?: boolean;
}

export function newShade(x: number, y: number, t: number, rand: () => number = Math.random): Shade {
  return {
    state: "emerge",
    since: t,
    x,
    y,
    shield: 100,
    target: null,
    seen: null,
    orbit: rand() < 0.5 ? 1 : -1,
    rushAt: t + SHADE.emerge + span(SHADE.rushEvery, rand),
    rushing: false,
    nearAt: t,
    burntAt: -1,
    hp: SHADE.hp,
  };
}

/** One of a day's nest, asleep where it's put (docs/plan/31-the-day.md). */
export function lurker(x: number, y: number, t: number, rand: () => number = Math.random): Shade {
  const s = newShade(x, y, t, rand);
  s.state = "lurk";
  s.home = { x, y };
  return s;
}

/** Woken: out of its sleep (the emerge's sting), after whoever woke it. */
export function wake(s: Shade, t: number, by?: { id: string; x: number; y: number } | null): void {
  if (s.state !== "lurk" && s.state !== "home") return;
  go(s, "emerge", t);
  s.rushAt = t + SHADE.emerge + 1;
  if (by) {
    s.target = by.id;
    s.seen = { x: by.x, y: by.y, t };
  }
}

/** A bullet's worth (docs/plan/30-the-dark.md D6): only an exposed one is hurt — a
 *  shielded one throws a spark. Dead: it dissolves, a burst of light. */
export function wound(s: Shade, n: number, t: number): "spark" | "hurt" | "killed" {
  if (s.state !== "exposed") return "spark";
  s.hp -= n;
  if (s.hp > 0) return "hurt";
  s.killed = true;
  go(s, "dissolve", t);
  return "killed";
}

const span = (r: readonly [number, number], rand: () => number) => r[0] + (r[1] - r[0]) * rand();

function go(s: Shade, to: ShadeState, t: number): ShadeState {
  s.state = to;
  s.since = t;
  return to;
}

/** Who it can have: seen (in range, a clear line, crouching halves it) or heard (a sprint). */
export function perceive(s: Shade, sense: ShadeSense): Prey | null {
  const range = SHADE.see.day + (SHADE.see.night - SHADE.see.day) * Math.max(0, Math.min(1, sense.night));
  // the nearest first: the first it hears or sees is the one (a line of sight is the dear part)
  const near: { p: Prey; d: number }[] = [];
  for (const p of sense.prey) {
    if (p.hidden) continue;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d <= range || (p.sprinting && d <= SHADE.hear.sprint)) near.push({ p, d });
  }
  near.sort((a, b) => a.d - b.d);
  for (const { p, d } of near) {
    if (p.sprinting && d <= SHADE.hear.sprint) return p;
    if (d <= range * (p.crouch ? SHADE.see.crouch : 1) && sense.sees(p.x, p.y)) return p;
  }
  return null;
}

/** What wakes one asleep: someone seen close (crouching, half as close), a sprint heard, a shot
 *  heard (as whoever's nearest it). */
function woke(s: Shade, sense: ShadeSense): Prey | null {
  const L = SHADE.lurk;
  let best: Prey | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const p of sense.prey) {
    if (p.hidden) continue;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d >= bd) continue;
    if ((p.sprinting && d <= L.hear) || (d <= L.see * (p.crouch ? L.crouch : 1) && sense.sees(p.x, p.y))) {
      best = p;
      bd = d;
    }
  }
  if (best) return best;
  if (sense.shots?.some((q) => Math.hypot(q.x - s.x, q.y - s.y) <= L.shot)) {
    for (const p of sense.prey) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (!p.hidden && d < bd) {
        best = p;
        bd = d;
      }
    }
    return best;
  }
  return null;
}

/** One step of `dt` s. Changes `s`; says where to go and what it did. */
export function think(s: Shade, sense: ShadeSense, dt: number, rand: () => number = Math.random): ShadeAct {
  const t = sense.t;
  const inState = t - s.since;
  const act: ShadeAct = { goal: null, speed: 0 };
  const was = s.state;
  const done = () => {
    if (s.state !== was) act.became = s.state;
    return act;
  };
  if (sense.prey.some((p) => Math.hypot(p.x - s.x, p.y - s.y) <= SHADE.near)) s.nearAt = t;
  if (sense.burn > 0) s.burntAt = t;

  // dissolving: then gone
  if (s.state === "dissolve") {
    if (inState >= (s.killed ? SHADE.dying : SHADE.dissolve)) act.gone = true;
    return act;
  }
  // the dawn, or nobody near for long: it goes (back into the dark)
  if (sense.dawn || (!s.home && t - s.nearAt > SHADE.leave)) {
    if (s.state !== "flee" || inState > 3) go(s, "dissolve", t);
    else act.goal = away(s, sense, 6);
    act.speed = SHADE.speed.flee;
    return done();
  }
  // the shield: burnt by focused beams (and a flare's light), grown back after being exposed
  if (sense.burn > 0 && s.state !== "exposed") s.shield = Math.max(0, s.shield - SHADE.burn * sense.burn * dt);
  if (sense.lit && s.state !== "exposed") s.shield = Math.max(0, s.shield - SHADE.burn * dt);
  if (s.shield <= 0 && s.state !== "exposed") {
    go(s, "exposed", t);
    s.rushing = false;
  }

  // asleep in its nest: still; what wakes it (a beam on it, one of its nest, seen close, a sprint
  // or a shot heard) — else the shield comes back whole while it sleeps
  if (s.state === "lurk") {
    const by = woke(s, sense);
    if (by || sense.burn > 0 || sense.woken) wake(s, t, by);
    else if (s.shield < 100 && t - s.burntAt > SHADE.regrowAfter)
      s.shield = Math.min(100, s.shield + SHADE.regrow * dt);
    return done();
  }

  const prey = perceive(s, sense);
  if (prey) {
    s.target = prey.id;
    s.seen = { x: prey.x, y: prey.y, t };
  } else if (s.seen && t - s.seen.t > SHADE.forget) {
    s.seen = null;
    s.target = null;
  }
  const tgt = prey ?? null;

  switch (s.state) {
    case "dormant":
      go(s, "emerge", t);
      break;
    case "emerge":
      if (inState >= SHADE.emerge) go(s, "stalk", t);
      break;
    case "exposed":
      // backs off from whoever it was after, then the shield comes back
      act.goal = away(s, sense, 5);
      act.speed = SHADE.speed.back;
      if (inState >= SHADE.exposed) {
        s.shield = 1;
        go(s, "stalk", t);
      }
      break;
    case "flee":
      act.goal = away(s, sense, 6);
      act.speed = SHADE.speed.flee;
      if (!sense.lit && inState > 1) go(s, "stalk", t);
      break;
    case "windup":
      // committed (a beam doesn't stop it — roll): it leans in after whoever it's swinging at
      if (tgt) {
        act.goal = { x: tgt.x, y: tgt.y };
        act.speed = SHADE.speed.windup;
      }
      if (inState >= SHADE.windup) {
        go(s, "strike", t);
        if (s.target) act.strike = s.target;
      }
      break;
    case "strike":
      if (inState >= SHADE.strike) go(s, "recover", t);
      break;
    case "recover":
      act.goal = tgt ? around(s, tgt, SHADE.circle[0], 0.9) : null;
      act.speed = SHADE.speed.back;
      if (inState >= SHADE.recover) {
        s.rushAt = t + span(SHADE.rushEvery, rand);
        go(s, "stalk", t);
      }
      break;
    case "home": {
      // back to its nest, the shield growing back; anyone close again (within its leash) and it turns
      const h = s.home as { x: number; y: number };
      if (tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) <= SHADE.leash) {
        go(s, "stalk", t);
        break;
      }
      if (s.shield < 100 && t - s.burntAt > SHADE.regrowAfter) s.shield = Math.min(100, s.shield + SHADE.regrow * dt);
      if (Math.hypot(s.x - h.x, s.y - h.y) <= 1.2) {
        s.target = null;
        s.seen = null;
        go(s, "lurk", t);
        break;
      }
      act.goal = h;
      act.speed = SHADE.speed.back * 1.2;
      break;
    }
    case "stalk":
    case "burning": {
      if (sense.lit) {
        go(s, "flee", t);
        act.goal = away(s, sense, 6);
        act.speed = SHADE.speed.flee;
        break;
      }
      const burning = t - s.burntAt < 0.3;
      if (burning && s.state === "stalk") go(s, "burning", t);
      if (!burning && s.state === "burning") go(s, "stalk", t);
      if (s.state === "stalk" && s.shield < 100 && t - s.burntAt > SHADE.regrowAfter)
        s.shield = Math.min(100, s.shield + SHADE.regrow * dt);
      const slow = s.state === "burning" ? SHADE.burnSlow : 1;
      // a day's, on its leash: too far from its nest (or whoever it's after is), or nobody to have —
      // home (it isn't drawn to the living as the night's are)
      if (s.home) {
        const h = s.home;
        const far = Math.hypot(s.x - h.x, s.y - h.y) > SHADE.leash;
        const gone = tgt ? Math.hypot(tgt.x - h.x, tgt.y - h.y) > SHADE.leash + 6 : !s.seen;
        if (far || gone) {
          s.target = null;
          s.seen = null;
          s.rushing = false;
          go(s, "home", t);
          act.goal = h;
          act.speed = SHADE.speed.back * 1.2;
          break;
        }
      }
      if (!tgt) {
        // lost them: where they were last; never seen anyone, it's drawn to the living (it came
        // out of the dark 25–45 tiles off, past what it sees: it comes in until it does)
        s.rushing = false;
        const drawn = s.seen ? null : nearestFree(s, sense);
        // (nobody to have, someone safe indoors near: round them, watching)
        const watched = s.seen || drawn ? null : nearestWatcher(s, sense);
        if (watched) {
          // (closing in as it goes round — kept off the floor, it slides along the edge; now and
          // then it turns back: pacing)
          const d = Math.hypot(watched.x - s.x, watched.y - s.y);
          const moved = s.was ? Math.hypot(s.x - s.was.x, s.y - s.was.y) : 1;
          s.was = { x: s.x, y: s.y };
          if (rand() < dt / (moved < 0.01 ? 1.2 : 9)) s.orbit = s.orbit === 1 ? -1 : 1;
          act.goal = around(s, watched, Math.max(SHADE.watch, d - 4), d > SHADE.watch + 3 ? 0.15 : 0.45);
          act.speed = SHADE.speed.wander * slow;
          break;
        }
        act.goal = s.seen ? { x: s.seen.x, y: s.seen.y } : drawn;
        act.speed = (s.seen ? SHADE.speed.wander : SHADE.speed.stalk * 0.8) * slow;
        break;
      }
      const d = Math.hypot(tgt.x - s.x, tgt.y - s.y);
      if (!s.rushing && t >= s.rushAt) s.rushing = true;
      if (s.rushing) {
        if (d <= SHADE.closeIn) {
          s.rushing = false;
          go(s, "windup", t);
          break;
        }
        act.goal = { x: tgt.x, y: tgt.y };
        act.speed = SHADE.speed.rush * slow;
        break;
      }
      // closing to the circle, coming round from the side; on it, round it
      const r = (SHADE.circle[0] + SHADE.circle[1]) / 2;
      act.goal = around(s, tgt, r, d > SHADE.circle[1] + 2 ? 0.5 : 0.9);
      act.speed = SHADE.speed.stalk * slow;
      break;
    }
  }
  return done();
}

// the nearest that can be had, within SHADE.near (where it is, roughly: they know)
function nearestFree(s: Shade, sense: ShadeSense): { x: number; y: number } | null {
  let best: Prey | null = null;
  let bd: number = SHADE.near;
  for (const p of sense.prey) {
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (!p.hidden && d < bd) {
      best = p;
      bd = d;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

// the nearest safe indoors, within SHADE.near (to prowl round)
function nearestWatcher(s: Shade, sense: ShadeSense): { x: number; y: number } | null {
  let best: Prey | null = null;
  let bd: number = SHADE.near;
  for (const p of sense.prey) {
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (p.watch && d < bd) {
      best = p;
      bd = d;
    }
  }
  return best;
}

// a point `r` from `p`, a little round from where `s` is (its way round): circling, flanking
function around(s: Shade, p: { x: number; y: number }, r: number, turn: number) {
  const a = Math.atan2(s.y - p.y, s.x - p.x) + s.orbit * turn;
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

// away from the light it's in, else whoever's nearest (or where it last saw them), `r` tiles
function away(s: Shade, sense: ShadeSense, r: number) {
  let from = (sense.lit && sense.light) || (s.seen as { x: number; y: number } | null);
  let best = Number.POSITIVE_INFINITY;
  if (!(sense.lit && sense.light))
    for (const p of sense.prey) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < best) {
        best = d;
        from = p;
      }
    }
  if (!from) return null;
  const a = Math.atan2(s.y - from.y, s.x - from.x);
  return { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
}
