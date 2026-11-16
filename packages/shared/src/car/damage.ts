// A car's damage (docs/plan/92-the-cars.md, Damage F6a): you see it and feel a little of it, never wrecked.
//
//   - Five zones, 0..1: the front, the back, its left, its right, the roof (a roll). Each presses the
//     model's dent morphs in (`dent_front` …).
//   - Parts, a bit each, broken by the hits that pass their mark: the front bumper hanging, then gone (a
//     thing on the road); a mirror folded; a lamp broken (its light out); the windscreen cracked; a side's
//     windows shattered.
//   - On the wire and on the car's object as one string, `props.dmg`: the zones, then the parts after a
//     "|" — "0.2,0,0,0.5" (a car from before the roof and the parts) still reads.
//   - Only ever more (the server's merge), till it's mended: at its home, on a tow, by mod:cars.

export const ZONES = ["front", "rear", "left", "right", "roof"] as const;
export type Zone = 0 | 1 | 2 | 3 | 4;

export const PART = {
  bumperHang: 1,
  bumperGone: 2,
  mirrorL: 4,
  mirrorR: 8,
  headL: 16,
  headR: 32,
  tailL: 64,
  tailR: 128,
  screen: 256, // the windscreen cracked
  screenBad: 512, // …badly (a second hit)
  sideL: 1024, // the left side's windows shattered
  sideR: 2048,
  // (plan 93 S1: shot) a tyre flat; the engine dead (the front's block struck past its mark)
  flatFL: 4096,
  flatFR: 8192,
  flatRL: 16384,
  flatRR: 32768,
  engineDead: 65536,
} as const;
const ALL_PARTS = 131071;
/** (plan 93) the flat tyres' bits, FL FR RL RR */
export const FLATS = [PART.flatFL, PART.flatFR, PART.flatRL, PART.flatRR] as const;

export interface Damage {
  /** front, rear, left, right, roof: 0..1 */
  zones: number[];
  parts: number;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** None. */
export const noDamage = (): Damage => ({ zones: [0, 0, 0, 0, 0], parts: 0 });

/** A car's damage from its string ("f,r,l,r[,roof][|parts]"); anything else, none. */
export function parseDamage(s: unknown, out: Damage = noDamage()): Damage {
  const str = typeof s === "string" ? s : "";
  const [z, p] = str.split("|");
  const d = (z ?? "").split(",").map(Number);
  for (let i = 0; i < 5; i++) out.zones[i] = clamp01(d[i] ?? 0);
  const bits = Number(p);
  out.parts = Number.isFinite(bits) ? bits & ALL_PARTS : 0;
  return out;
}

/** …as its string ("" for none; four zones when the roof and the parts are whole, as before). */
export function damageString(d: Damage): string {
  const z = d.zones.map((x) => Math.round(clamp01(x) * 100) / 100);
  if (!z.some((x) => x > 0) && !d.parts) return "";
  const zs = (z[4] > 0 || d.parts ? z : z.slice(0, 4)).join(",");
  return d.parts ? `${zs}|${d.parts & ALL_PARTS}` : zs;
}

/** What the driver's client says merged into what was: only ever more, and a zone not by more than
 *  half at once (the server's rule, as `car:wear` always had it). */
export function mergeDamage(was: Damage, next: { zones: number[]; parts?: number }): Damage {
  const out = noDamage();
  for (let i = 0; i < 5; i++) {
    const w = clamp01(was.zones[i] ?? 0);
    out.zones[i] = clamp01(Math.max(w, Math.min(clamp01(next.zones[i] ?? 0), w + 0.5)));
  }
  let parts = (was.parts | ((next.parts ?? 0) & ALL_PARTS)) & ALL_PARTS;
  // (gone is past hanging)
  if (parts & PART.bumperGone) parts |= PART.bumperHang;
  if (parts & PART.screenBad) parts |= PART.screen;
  out.parts = parts;
  return out;
}

/** A knock on a zone, `k` of damage (0..0.35 a hit), at `across` (−1 its left .. 1 its right, for the
 *  front and the back; along for the sides: −1 its back .. 1 its front). What it breaks follows from how
 *  bad the zone is now. Returns the parts newly broken. */
export function knock(d: Damage, zone: Zone, k: number, across: number): number {
  const before = d.parts;
  const z = clamp01(d.zones[zone] + k);
  d.zones[zone] = z;
  const left = across < 0;
  const hard = k > 0.18;
  if (zone === 0) {
    if (z > 0.3) d.parts |= PART.bumperHang;
    if (z > 0.62 || (z > 0.45 && hard)) d.parts |= PART.bumperGone | PART.bumperHang;
    // (a lamp: the side it was struck on, once the front's past a knock)
    if (z > 0.35 && Math.abs(across) > 0.25) d.parts |= left ? PART.headL : PART.headR;
    if (z > 0.7) d.parts |= PART.headL | PART.headR;
    if (z > 0.5) d.parts |= PART.screen;
    if (z > 0.85) d.parts |= PART.screenBad;
  } else if (zone === 1) {
    if (z > 0.35 && Math.abs(across) > 0.25) d.parts |= left ? PART.tailL : PART.tailR;
    if (z > 0.7) d.parts |= PART.tailL | PART.tailR;
  } else if (zone === 2 || zone === 3) {
    const side = zone === 2;
    // (a mirror: struck toward the front of the side; folded on a scrape)
    if (z > 0.15 && across > 0.1) d.parts |= side ? PART.mirrorL : PART.mirrorR;
    if (z > 0.6 || (z > 0.4 && hard)) d.parts |= side ? PART.sideL : PART.sideR;
  } else {
    // (on its roof: the windscreen gives)
    if (z > 0.3) d.parts |= PART.screen;
    if (z > 0.6) d.parts |= PART.screenBad | PART.sideL | PART.sideR;
  }
  return d.parts & ~before;
}

/** How the steering pulls with a bad front (the input's units, −1..1: + right): toward the side that took
 *  more, nothing under half. */
export function steerPull(d: Damage): number {
  // (plan 93: a flat front tyre drags it to its side)
  const flat = (d.parts & PART.flatFL ? -1 : 0) + (d.parts & PART.flatFR ? 1 : 0);
  const f = d.zones[0];
  if (f < 0.5) return flat * 0.08;
  const side = d.zones[3] > d.zones[2] ? 1 : d.zones[2] > d.zones[3] ? -1 : d.parts & PART.headR ? 1 : -1;
  return side * Math.min(0.07, (f - 0.5) * 0.14) + flat * 0.08;
}

/** How bright the headlamps still are (a bad front dims them both; a broken one is out). */
export function headK(d: Damage, side: "l" | "r"): number {
  if (d.parts & (side === "l" ? PART.headL : PART.headR)) return 0;
  return d.zones[0] > 0.6 ? 0.45 : 1;
}

/** Steam from under the bonnet: past 0.8 at the front. 0..1. */
export function steamOf(d: Damage): number {
  return d.zones[0] > 0.8 ? Math.min(1, (d.zones[0] - 0.8) / 0.2 + 0.3) : 0;
}
