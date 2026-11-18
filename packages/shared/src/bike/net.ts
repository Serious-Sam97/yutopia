import type { TrickId } from "./tricks.ts";

// A bike over the wire (docs/plan/101-the-bicycles.md): a car's state (car/net.ts CarWire) — its cadence in `rpm`, its
// gear in `gear`, the legs' effort in `thr`, its lamp as the low beams, its bell as the horn — and what's only a
// bike's in the flags' high bits, above the cars' (CAR_FLAGS ends at 1 << 16): stood on the pedals, crouched for a
// hop, the trick under way and how far through it, a foot down.

const STAND = 1 << 17;
const CROUCH = 1 << 18;
const TRICK_AT = 19; // 3 bits
const TRICK_T_AT = 22; // 4 bits
const FOOT_L = 1 << 26;
const FOOT_R = 1 << 27;
const WALK = 1 << 28;

const IDS: (TrickId | null)[] = [null, "tailwhipL", "tailwhipR", "barspin", "superman", "nohander"];

export interface BikeWire {
  stand: boolean;
  crouch: boolean;
  trick: TrickId | null;
  trickT: number;
  foot: -1 | 0 | 1;
  /** wheeled on foot, its rider walking beside it */
  walk: boolean;
}

/** A bike's own bits, to OR into its car flags. */
export function packBike(b: {
  stand: number;
  charge: number;
  trick: TrickId | null;
  trickT: number;
  foot: number;
  walk?: boolean;
}): number {
  let f = 0;
  if (b.walk) f |= WALK;
  if (b.stand > 0.5) f |= STAND;
  if (b.charge > 0.05) f |= CROUCH;
  const i = b.trick ? IDS.indexOf(b.trick) : 0;
  if (i > 0) {
    f |= i << TRICK_AT;
    f |= Math.max(0, Math.min(15, Math.round(b.trickT * 15))) << TRICK_T_AT;
  }
  if (b.foot < 0) f |= FOOT_L;
  else if (b.foot > 0) f |= FOOT_R;
  return f;
}

/** …and read back. */
export function unpackBike(fl: number): BikeWire {
  const i = (fl >>> TRICK_AT) & 7;
  return {
    stand: !!(fl & STAND),
    crouch: !!(fl & CROUCH),
    trick: IDS[i] ?? null,
    trickT: i ? ((fl >>> TRICK_T_AT) & 15) / 15 : 0,
    foot: fl & FOOT_L ? -1 : fl & FOOT_R ? 1 : 0,
    walk: !!(fl & WALK),
  };
}

/** Stood on the pedals and pushing hard: a sprint (the stamina it costs — the server's survival tick, the rider's own
 *  client). From its flags and its effort (the wire's `thr`, ×100). */
export const bikeSprinting = (fl: number, thr: number): boolean => !!(fl & STAND) && thr >= 80;
