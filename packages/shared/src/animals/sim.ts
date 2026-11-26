// A group's day run on its own, with nothing round it (docs/plan/128-animal-minds.md, F10a): the mind, its needs, its
// places, walking where it says at its pace — how much of the day it's on the move, how far it goes, where — for the
// bench (bench.test.ts) to hold numbers to and for tuning. Pure; no land (open ground everywhere, its places given).
import { type Ctx, type Doing, freshNeeds, type Intention, rangeOf, speedOf, stepNeeds, think } from "./mind.ts";
import { ANIMALS, type AnimalKind } from "./species.ts";

export interface DayStats {
  kind: AnimalKind;
  /** share of the day on the move (the lead) */
  moving: number;
  /** by the part of the day: on the move */
  day: number;
  twilight: number;
  night: number;
  /** metres walked in the day (the lead) */
  km: number;
  /** the farthest from home, against its range */
  reach: number;
  /** the share of the day at each doing */
  doings: Partial<Record<Doing, number>>;
  /** its places reached in the day: bed, feeding grounds, water */
  visited: { bed: number; feed: number; water: number };
  /** (a group) the followers' mean distance from the lead, metres */
  spread: number;
}

/** Its places for the bench: a bed off home, feeding grounds out in its range, water to one side. */
export function benchPlaces(kind: AnimalKind) {
  const R = rangeOf(kind) || 30;
  return {
    bed: { x: -0.25 * R, z: 0.1 * R },
    feed: [
      { x: 0.55 * R, z: 0.05 * R },
      { x: 0.2 * R, z: 0.6 * R },
    ],
    water: { x: 0.35 * R, z: -0.45 * R },
  };
}

/** A day of `kind`'s group (`n` of them), stepped every `dt` s. */
export function simDay(kind: AnimalKind, o: { n?: number; dt?: number; seed?: number; hours?: number } = {}): DayStats {
  const n = o.n ?? 1;
  const dt = o.dt ?? 0.25;
  const places = benchPlaces(kind);
  let seed = o.seed ?? 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  type M = { x: number; z: number; it: Intention; doing: Doing; for: number; thinkIn: number; needs: ReturnType<typeof freshNeeds>; arrived: boolean };
  const ms: M[] = Array.from({ length: n }, (_, i) => ({
    x: places.bed.x + i * 2,
    z: places.bed.z,
    it: { doing: "idle", pace: "still" },
    doing: "idle",
    for: 0,
    thinkIn: i * 0.1,
    needs: { ...freshNeeds(), hunger: 0.4, thirst: 0.3 },
    arrived: true,
  }));
  const R = rangeOf(kind) || 30;
  const part = { day: { mv: 0, t: 0 }, twilight: { mv: 0, t: 0 }, night: { mv: 0, t: 0 } };
  const doings: Partial<Record<Doing, number>> = {};
  const visited = { bed: 0, feed: 0, water: 0 };
  const was = { bed: false, feed: false, water: false };
  let moving = 0;
  let walked = 0;
  let reach = 0;
  let spread = 0;
  let spreadN = 0;
  const T = (o.hours ?? 24) * 3600;
  for (let t = 0; t < T; t += dt) {
    const hour = (t / 3600) % 24;
    const night = hour < 5 || hour >= 20.5 ? 1 : hour < 7 || hour >= 18 ? 0.5 : 0;
    const p = (hour >= 5 && hour < 8) || (hour >= 17 && hour < 21) ? "twilight" : night === 1 ? "night" : "day";
    for (let i = 0; i < n; i++) {
      const m = ms[i];
      m.thinkIn -= dt;
      if (m.thinkIn <= 0) {
        m.thinkIn = 0.9 * (0.7 + rnd() * 0.6);
        const lead = i > 0 ? ms[0] : null;
        const c: Ctx = {
          kind,
          young: false,
          hour,
          night,
          storm: 0,
          x: m.x,
          z: m.z,
          home: { x: 0, z: 0 },
          territory: 0,
          hurt: false,
          youngNear: false,
          inWater: false,
          seen: [],
          needs: m.needs,
          doing: m.doing,
          for: m.for,
          roll: rnd(),
          places,
          goal: m.it.to ?? null,
          arrived: m.arrived,
          index: i,
          ahead: i > 0 ? { x: ms[i - 1].x, z: ms[i - 1].z } : null,
          lead: lead ? { x: lead.x, z: lead.z, doing: lead.doing, pace: lead.it.pace } : undefined,
          lookout: i === 1 && n > 2 && Math.floor(t / 40) % 3 === 0,
        };
        const it = think(c);
        if (it.doing !== m.doing) {
          m.doing = it.doing;
          m.for = 0;
        }
        const sameGoal = it.to && m.it.to && Math.hypot(it.to.x - m.it.to.x, it.to.z - m.it.to.z) < 0.5;
        if (!sameGoal) m.arrived = !it.to;
        m.it = it;
      }
      m.for += dt;
      m.needs = stepNeeds(m.needs, dt, m.doing, ANIMALS[kind].wary);
      const sp = speedOf(kind, m.it.pace, false);
      let mv = false;
      const to = m.it.to;
      if (to && sp > 0 && !m.arrived) {
        const stop = m.doing === "follow" ? 2 + ANIMALS[kind].len * 2 : 0.8;
        const dx = to.x - m.x;
        const dz = to.z - m.z;
        const l = Math.hypot(dx, dz);
        if (l > stop + 0.05) {
          const s = Math.min(l - stop, sp * dt);
          m.x += (dx / l) * s;
          m.z += (dz / l) * s;
          if (i === 0) walked += s;
          mv = true;
        } else if (m.doing !== "follow") m.arrived = true;
      }
      if (i === 0) {
        doings[m.doing] = (doings[m.doing] ?? 0) + dt;
        if (mv) {
          moving += dt;
          part[p].mv += dt;
        }
        part[p].t += dt;
        reach = Math.max(reach, Math.hypot(m.x, m.z) / R);
        for (const [k, at, r] of [
          ["bed", places.bed, 12],
          ["feed", null, 25],
          ["water", places.water, 8],
        ] as const) {
          const here = k === "feed" ? places.feed.some((f) => Math.hypot(m.x - f.x, m.z - f.z) < r) : Math.hypot(m.x - (at as { x: number }).x, m.z - (at as { z: number; x: number }).z) < r;
          if (here && !was[k]) visited[k]++;
          was[k] = here;
        }
      } else {
        spread += Math.hypot(m.x - ms[0].x, m.z - ms[0].z);
        spreadN++;
      }
    }
  }
  for (const k of Object.keys(doings) as Doing[]) doings[k] = (doings[k] ?? 0) / T;
  return {
    kind,
    moving: moving / T,
    day: part.day.mv / Math.max(1, part.day.t),
    twilight: part.twilight.mv / Math.max(1, part.twilight.t),
    night: part.night.mv / Math.max(1, part.night.t),
    km: walked / 1000,
    reach,
    doings,
    visited,
    spread: spreadN ? spread / spreadN : 0,
  };
}
