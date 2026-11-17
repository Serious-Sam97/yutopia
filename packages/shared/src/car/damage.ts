// A car's damage (docs/plan/92-the-cars.md, Damage F6a): you see it and feel a little of it, never wrecked.
//
//   - Five zones, 0..1: the front, the back, its left, its right, the roof (a roll). Each presses the
//     model's dent morphs in (`dent_front` …).
//   - Parts, a bit each, broken by the hits that pass their mark: the front bumper hanging, then gone (a
//     thing on the road); a mirror folded; a lamp broken (its light out); (plan 94 P3) each pane of glass on its
//     own — the windscreen, the rear window, each side's front and rear window — cracked, then gone (the
//     windscreen cracked, badly, then gone).
//   - (plan 94 P2) What's come off it, or hangs: each door hanging off its lower hinge, then gone; the bonnet and
//     the boot lid sprung, then gone; the rear bumper hanging, then gone; a mirror off. Kept on it, so a parked
//     wreck stays one for everyone.
//   - On the wire and on the car's object as one string, `props.dmg`: the zones, then the parts after a
//     "|", then what's come off after another — "0.2,0,0,0.5" (a car from before the roof and the parts) still
//     reads.
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
  sideL: 1024, // (before plan 94: the left side's windows shattered — read as both of them gone)
  sideR: 2048,
  // (plan 93 S1: shot) a tyre flat; the engine dead (the front's block struck past its mark)
  flatFL: 4096,
  flatFR: 8192,
  flatRL: 16384,
  flatRR: 32768,
  engineDead: 65536,
  // (plan 94 P3) the windscreen gone; the rear window cracked, gone; each side window (FL FR RL RR: a side's
  // front window and the one behind it — a rear door's, or the quarter's) cracked, gone
  screenGone: 1 << 17,
  rearCrack: 1 << 18,
  rearGone: 1 << 19,
  crackFL: 1 << 20,
  crackFR: 1 << 21,
  crackRL: 1 << 22,
  crackRR: 1 << 23,
  goneFL: 1 << 24,
  goneFR: 1 << 25,
  goneRL: 1 << 26,
  goneRR: 1 << 27,
} as const;
const ALL_PARTS = (1 << 28) - 1;

/** (plan 94 P3) The panes: the windscreen, the rear window, the side windows FL FR RL RR. */
export const PANES = ["screen", "rear", "fl", "fr", "rl", "rr"] as const;
export type Pane = 0 | 1 | 2 | 3 | 4 | 5;
/** each pane's first crack, and its being gone */
export const PANE_CRACK = [PART.screen, PART.rearCrack, PART.crackFL, PART.crackFR, PART.crackRL, PART.crackRR] as const;
export const PANE_GONE = [PART.screenGone, PART.rearGone, PART.goneFL, PART.goneFR, PART.goneRL, PART.goneRR] as const;
/** every glass bit (what the garage's new glass mends) */
export const GLASS_BITS =
  PART.screenBad |
  PART.sideL |
  PART.sideR |
  PANE_CRACK.reduce((a, b) => a | b, 0) |
  PANE_GONE.reduce((a, b) => a | b, 0);
/** a side's window: front or the one behind it, its left or its right */
export const sidePane = (left: boolean, front: boolean): Pane => ((front ? 2 : 4) + (left ? 0 : 1)) as Pane;

/** A pane as it is: 0 whole, 1 cracked (the windscreen badly: still 1), 2 gone. */
export function paneOf(parts: number, i: Pane): 0 | 1 | 2 {
  if (parts & PANE_GONE[i]) return 2;
  return parts & PANE_CRACK[i] ? 1 : 0;
}

/** A pane struck (a round, a knock on it): whole, it cracks; cracked, it goes (the windscreen cracks badly
 *  first). `hard`: a blow that takes it at once. Returns the bits newly set. */
export function hitPane(d: Damage, i: Pane, hard = false): number {
  const before = d.parts;
  const st = paneOf(d.parts, i);
  if (st === 2) return 0;
  if (hard) d.parts |= PANE_GONE[i] | PANE_CRACK[i];
  else if (st === 0) d.parts |= PANE_CRACK[i];
  else if (i === 0 && !(d.parts & PART.screenBad)) d.parts |= PART.screenBad;
  else d.parts |= PANE_GONE[i];
  d.parts = norm(d.parts);
  return d.parts & ~before;
}

/** (plan 94: the blast) every pane gone. */
export function shatterAll(d: Damage): number {
  const before = d.parts;
  for (const b of PANE_GONE) d.parts |= b;
  d.parts = norm(d.parts);
  return d.parts & ~before;
}

/** The bits as one way of saying them: what's gone was cracked; the windscreen badly was cracked; before plan
 *  94 a side's windows shattered — both of them gone. */
export function norm(parts: number): number {
  let p = parts & ALL_PARTS;
  if (p & PART.sideL) p = (p | PART.goneFL | PART.goneRL) & ~PART.sideL;
  if (p & PART.sideR) p = (p | PART.goneFR | PART.goneRR) & ~PART.sideR;
  if (p & PART.screenGone) p |= PART.screenBad;
  if (p & PART.screenBad) p |= PART.screen;
  for (let i = 0; i < 6; i++) if (p & PANE_GONE[i]) p |= PANE_CRACK[i];
  return p;
}
/** (plan 93) the flat tyres' bits, FL FR RL RR */
export const FLATS = [PART.flatFL, PART.flatFR, PART.flatRL, PART.flatRR] as const;

export interface Damage {
  /** front, rear, left, right, roof: 0..1 */
  zones: number[];
  parts: number;
  /** (plan 94 P2) what's come off it or hangs: WRECK's bits */
  wreck: number;
  /** (plan 94 P1) on fire: FIRE's stage — none, smoking, burning, burnt out */
  fire: number;
}

/** (plan 94 P1) A car's fire, by stage: black smoke out of a wrecked engine, then flames, then the blast and what's
 *  left — the server's (features/cars.ts) to step. */
export const FIRE = { none: 0, smoke: 1, burning: 2, burnt: 3 } as const;

/** (plan 94 P2) What comes off a car. The doors by where they are: FL FR RL RR (a van's slide its right rear,
 *  the bus's middle door its right front). */
export const WRECK = {
  hangFL: 1,
  hangFR: 2,
  hangRL: 4,
  hangRR: 8,
  goneFL: 16,
  goneFR: 32,
  goneRL: 64,
  goneRR: 128,
  bonnetLoose: 256,
  bonnetGone: 512,
  bootLoose: 1024,
  bootGone: 2048,
  bumperRHang: 4096,
  bumperRGone: 8192,
  mirrorLOff: 16384,
  mirrorROff: 32768,
} as const;
const ALL_WRECK = 65535;
export const DOOR_HANG = [WRECK.hangFL, WRECK.hangFR, WRECK.hangRL, WRECK.hangRR] as const;
export const DOOR_GONE = [WRECK.goneFL, WRECK.goneFR, WRECK.goneRL, WRECK.goneRR] as const;
/** a door's slot by its name on the model: door_fl … door_rr; the van's slide (door_sr) and the bus's two */
export function doorSlot(name: string): number {
  const k = name.replace(/^door_/, "");
  return k === "fl" ? 0 : k === "fr" || k === "mr" ? 1 : k === "rl" ? 2 : k === "rr" || k === "sr" ? 3 : -1;
}
/** what's gone is what hung first */
export function normWreck(w: number): number {
  let x = w & ALL_WRECK;
  for (let i = 0; i < 4; i++) if (x & DOOR_GONE[i]) x |= DOOR_HANG[i];
  if (x & WRECK.bonnetGone) x |= WRECK.bonnetLoose;
  if (x & WRECK.bootGone) x |= WRECK.bootLoose;
  if (x & WRECK.bumperRGone) x |= WRECK.bumperRHang;
  return x;
}

/** (plan 94: the blast) the doors, the bonnet and the boot lid blown off. */
export function blowOff(d: Damage): number {
  const before = d.wreck;
  for (const b of DOOR_GONE) d.wreck |= b;
  d.wreck = normWreck(d.wreck | WRECK.bonnetGone | WRECK.bootGone);
  return d.wreck & ~before;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** None. */
export const noDamage = (): Damage => ({ zones: [0, 0, 0, 0, 0], parts: 0, wreck: 0, fire: 0 });

/** A car's damage from its string ("f,r,l,r[,roof][|parts]"); anything else, none. */
export function parseDamage(s: unknown, out: Damage = noDamage()): Damage {
  const str = typeof s === "string" ? s : "";
  const [z, p, w, f] = str.split("|");
  const d = (z ?? "").split(",").map(Number);
  for (let i = 0; i < 5; i++) out.zones[i] = clamp01(d[i] ?? 0);
  const bits = Number(p);
  out.parts = Number.isFinite(bits) ? norm(bits) : 0;
  const wb = Number(w);
  out.wreck = Number.isFinite(wb) ? normWreck(wb) : 0;
  const fb = Number(f);
  out.fire = Number.isFinite(fb) ? Math.max(0, Math.min(3, Math.round(fb))) : 0;
  return out;
}

/** …as its string ("" for none; four zones when the roof and the parts are whole, as before). */
export function damageString(d: Damage): string {
  const z = d.zones.map((x) => Math.round(clamp01(x) * 100) / 100);
  const wreck = (d.wreck ?? 0) & ALL_WRECK;
  const fire = Math.max(0, Math.min(3, Math.round(d.fire ?? 0)));
  if (!z.some((x) => x > 0) && !d.parts && !wreck && !fire) return "";
  const zs = (z[4] > 0 || d.parts || wreck || fire ? z : z.slice(0, 4)).join(",");
  if (fire) return `${zs}|${d.parts & ALL_PARTS}|${wreck}|${fire}`;
  if (wreck) return `${zs}|${d.parts & ALL_PARTS}|${wreck}`;
  return d.parts ? `${zs}|${d.parts & ALL_PARTS}` : zs;
}

/** What the driver's client says merged into what was: only ever more, and a zone not by more than
 *  half at once (the server's rule, as `car:wear` always had it). */
export function mergeDamage(
  was: Damage,
  next: { zones: number[]; parts?: number; wreck?: number; fire?: number },
): Damage {
  const out = noDamage();
  for (let i = 0; i < 5; i++) {
    const w = clamp01(was.zones[i] ?? 0);
    out.zones[i] = clamp01(Math.max(w, Math.min(clamp01(next.zones[i] ?? 0), w + 0.5)));
  }
  let parts = (was.parts | ((next.parts ?? 0) & ALL_PARTS)) & ALL_PARTS;
  // (gone is past hanging)
  if (parts & PART.bumperGone) parts |= PART.bumperHang;
  out.parts = norm(parts);
  out.wreck = normWreck((was.wreck ?? 0) | (next.wreck ?? 0));
  // (the fire's the server's to step: only ever further along)
  out.fire = Math.max(was.fire ?? 0, Math.min(3, next.fire ?? 0));
  return out;
}

/** A knock on a zone, `k` of damage (0..0.35 a hit), at `across` (−1 its left .. 1 its right, for the
 *  front and the back; along for the sides: −1 its back .. 1 its front). What it breaks follows from how
 *  bad the zone is now. Returns the parts newly broken. */
export function knock(d: Damage, zone: Zone, k: number, across: number): number {
  const before = d.parts;
  d.wreck ??= 0;
  const z = clamp01(d.zones[zone] + k);
  d.zones[zone] = z;
  const left = across < 0;
  const hard = k > 0.18;
  // (plan 94 P3: the glass by the knock on its side — cracked past a mark, gone past a worse one)
  const pane = (i: Pane, crack: boolean, gone: boolean) => {
    if (gone) d.parts |= PANE_GONE[i];
    else if (crack) d.parts |= PANE_CRACK[i];
  };
  if (zone === 0) {
    if (z > 0.3) d.parts |= PART.bumperHang;
    if (z > 0.62 || (z > 0.45 && hard)) d.parts |= PART.bumperGone | PART.bumperHang;
    // (a lamp: the side it was struck on, once the front's past a knock)
    if (z > 0.35 && Math.abs(across) > 0.25) d.parts |= left ? PART.headL : PART.headR;
    if (z > 0.7) d.parts |= PART.headL | PART.headR;
    if (z > 0.5) d.parts |= PART.screen;
    if (z > 0.85) d.parts |= PART.screenBad;
    // (laminated: it sags out only in a wreck)
    if (z > 0.97 && hard) d.parts |= PART.screenGone;
    // (plan 94 P2: the bonnet sprung off its catch, then torn off its hinges)
    if (z > 0.55) d.wreck |= WRECK.bonnetLoose;
    if (z > 0.97 || (z > 0.88 && hard)) d.wreck |= WRECK.bonnetGone;
  } else if (zone === 1) {
    if (z > 0.35 && Math.abs(across) > 0.25) d.parts |= left ? PART.tailL : PART.tailR;
    if (z > 0.7) d.parts |= PART.tailL | PART.tailR;
    pane(1, z > 0.45, z > 0.72 || (z > 0.55 && hard));
    // (plan 94 P2: the rear bumper hanging, then off; the boot lid sprung, then off)
    if (z > 0.3) d.wreck |= WRECK.bumperRHang;
    if (z > 0.62 || (z > 0.45 && hard)) d.wreck |= WRECK.bumperRGone;
    if (z > 0.55) d.wreck |= WRECK.bootLoose;
    if (z > 0.97 || (z > 0.88 && hard)) d.wreck |= WRECK.bootGone;
  } else if (zone === 2 || zone === 3) {
    const side = zone === 2;
    // (a mirror: struck toward the front of the side; folded on a scrape)
    if (z > 0.15 && across > 0.1) d.parts |= side ? PART.mirrorL : PART.mirrorR;
    // (the window it was struck by: ahead of its middle the front one; past the worst, both)
    const near = sidePane(side, across > -0.15);
    pane(near, z > 0.35 && hard, z > 0.6 || (z > 0.42 && hard));
    if (z > 0.82) pane(sidePane(side, across <= -0.15), false, true);
    // (plan 94 P2: the door it was struck by off its top hinge, hanging; then off; a mirror struck off)
    const slot = (side ? 0 : 1) + (across > -0.15 ? 0 : 2);
    if (z > 0.7 || (z > 0.55 && hard)) d.wreck |= DOOR_HANG[slot];
    if (z > 0.9 || (z > 0.74 && hard)) d.wreck |= DOOR_GONE[slot];
    if (z > 0.4 && across > 0.1) d.wreck |= side ? WRECK.mirrorLOff : WRECK.mirrorROff;
  } else {
    // (on its roof: the windscreen gives, then the rest)
    if (z > 0.3) d.parts |= PART.screen;
    if (z > 0.6) {
      d.parts |= PART.screenBad;
      for (let i = 1; i < 6; i++) d.parts |= PANE_GONE[i];
    }
    // (rolled: the doors sprung on their hinges)
    if (z > 0.75) for (const b of DOOR_HANG) d.wreck |= b;
  }
  d.parts = norm(d.parts);
  d.wreck = normWreck(d.wreck);
  return d.parts & ~before;
}

/** (plan 94 P1: the blast) Everything a blast does to it: every pane, the doors and lids off, every tyre burnt
 *  flat, every side crushed in, the lamps and the engine dead, burnt out. */
export function burnOut(d: Damage): void {
  shatterAll(d);
  blowOff(d);
  for (let i = 0; i < 5; i++) d.zones[i] = Math.max(d.zones[i], i === 4 ? 0.5 : 1);
  d.parts |=
    PART.flatFL |
    PART.flatFR |
    PART.flatRL |
    PART.flatRR |
    PART.engineDead |
    PART.headL |
    PART.headR |
    PART.tailL |
    PART.tailR |
    PART.bumperHang;
  d.wreck = normWreck(d.wreck | WRECK.mirrorLOff | WRECK.mirrorROff | WRECK.bumperRHang);
  d.fire = FIRE.burnt;
}

/** How the steering pulls with a bad front (the input's units, −1..1: + right): toward the side that took
 *  more, nothing under half. */
export function steerPull(d: Damage): number {
  // (plan 93: a flat front tyre drags it to its side; plan 94 P5: twice as hard, and a rear's a little)
  const flat =
    (d.parts & PART.flatFL ? -0.16 : 0) +
    (d.parts & PART.flatFR ? 0.16 : 0) +
    (d.parts & PART.flatRL ? -0.05 : 0) +
    (d.parts & PART.flatRR ? 0.05 : 0);
  const f = d.zones[0];
  if (f < 0.5) return flat;
  const side = d.zones[3] > d.zones[2] ? 1 : d.zones[2] > d.zones[3] ? -1 : d.parts & PART.headR ? 1 : -1;
  return side * Math.min(0.07, (f - 0.5) * 0.14) + flat;
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
