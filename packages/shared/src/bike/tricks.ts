// The tricks in the air and the landing's judge (docs/plan/101-the-bicycles.md F4b) — shared, so the skate (plan 102)
// takes them up: a trick is a timed move (its length by how well the board or bike takes tricks), finished or not when
// the wheels come down; the landing clean, shaky or a fall by how it meets the ground.
//
// The bike's: the tailwhip (the frame kicked round under the rider, who keeps the bars), the barspin (the bars spun a
// turn and caught), the superman (the body stretched out behind, the hands on the bars), the no-hander (both hands
// off, out to the sides). The 360 is no trick of its own here: the spin is the rider's say in the air (A/D), judged by
// how it lands.

export type TrickId = "tailwhipL" | "tailwhipR" | "barspin" | "superman" | "nohander";

/** Each trick's length (s) for the best at it (×, for the worst: 1.7), and how much of it must be done to land it. */
export const TRICKS: Record<TrickId, { len: number; done: number; name: [string, string] }> = {
  tailwhipL: { len: 0.62, done: 0.92, name: ["Tailwhip", "Tailwhip"] },
  tailwhipR: { len: 0.62, done: 0.92, name: ["Tailwhip", "Tailwhip"] },
  barspin: { len: 0.42, done: 0.9, name: ["Barspin", "Barspin"] },
  superman: { len: 0.9, done: 0.85, name: ["Superman", "Superman"] },
  nohander: { len: 0.7, done: 0.85, name: ["No-hander", "Sem mãos"] },
};

export interface TrickNow {
  id: TrickId;
  t: number;
  len: number;
}

/** The tricks under way: one at a time; what's been landed this jump (for its name), the spin turned. */
export class Tricks {
  cur: TrickNow | null = null;
  /** this jump's: the tricks finished, how far it spun (rad) */
  done: TrickId[] = [];
  spun = 0;
  start(id: TrickId, skill: number) {
    this.cur = { id, t: 0, len: TRICKS[id].len * (1 + 0.7 * (1 - Math.max(0, Math.min(1, skill)))) };
  }
  /** A step: in the air the trick goes on (finished: off the list, another may start); `turned` rad of spin. */
  tick(dt: number, air: boolean, turned: number) {
    if (air) this.spun += turned;
    const c = this.cur;
    if (!c) return;
    c.t += dt;
    if (c.t >= c.len) {
      this.done.push(c.id);
      this.cur = null;
    }
  }
  /** Down again: the jump's count cleared. */
  landed() {
    this.cur = null;
    this.done = [];
    this.spun = 0;
  }
}
export const newTricks = () => new Tricks();

export interface Landing {
  clean: boolean;
  /** a fall's why */
  why?: "trick" | "sideways" | "endo" | "loop" | "landing";
  /** 0 clean … 1 nearly off: it loses speed */
  wobble: number;
  /** how long it was up (s), its tricks, how far it spun (whole turns) */
  air: number;
  tricks: TrickId[];
  turns: number;
}

/** How a jump comes down: the trick (unfinished: off), the heading against the way it's going (a 360 not quite round:
 *  sideways), the nose too far down or up, the drop's speed. `X`, `Y` its forward and up (world), `v` its velocity. */
export function landingOf(o: {
  air: number;
  X: number[];
  Y: number[];
  v: [number, number, number];
  vyBefore: number;
  trick: TrickNow | null;
  skill: number;
  tricks?: TrickId[];
  spun?: number;
}): Landing {
  const tricks = o.tricks ?? [];
  const turns = Math.round((o.spun ?? 0) / (Math.PI * 2));
  const base = { air: o.air, tricks, turns };
  if (o.trick && o.trick.t / o.trick.len < TRICKS[o.trick.id].done)
    return { ...base, clean: false, why: "trick", wobble: 1 };
  const sp = Math.hypot(o.v[0], o.v[2]);
  const fl = Math.hypot(o.X[0], o.X[2]) || 1;
  const pitch = Math.asin(Math.max(-1, Math.min(1, o.X[1])));
  // (the way it faces against the way it's going, flat)
  let off = 0;
  if (sp > 2) {
    const c = (o.X[0] * o.v[0] + o.X[2] * o.v[2]) / (fl * sp);
    off = Math.acos(Math.max(-1, Math.min(1, c)));
  }
  const loose = 0.12 * Math.max(0, Math.min(1, o.skill));
  if (off > 0.62 + loose) return { ...base, clean: false, why: "sideways", wobble: 1 };
  if (pitch < -(0.75 + loose)) return { ...base, clean: false, why: "endo", wobble: 1 };
  if (pitch > 0.95 + loose) return { ...base, clean: false, why: "loop", wobble: 1 };
  // (on its side)
  if (o.Y[1] < Math.cos(0.75)) return { ...base, clean: false, why: "landing", wobble: 1 };
  // (a drop that would buckle the legs: from ~4.5 m)
  if (o.vyBefore < -9.5) return { ...base, clean: false, why: "landing", wobble: 1 };
  const wobble = Math.max(
    0,
    Math.min(1, Math.max((off - 0.3) / 0.35, (Math.abs(pitch) - 0.45) / 0.35, (-o.vyBefore - 7) / 2.5)),
  );
  return { ...base, clean: true, wobble };
}
