// Plan 83 — the sniper held as a person holds one (docs/plan/83-the-sniper.md), on plan 81's long-gun hold
// (tp/long-hold.ts), as the AK is (plan 82): the gun the anchor; the right hand round the pistol grip by a frame
// of its own, the web high on its back; the left palm up under the fore-end (behind the folded bipod) as far out
// as the arm reaches, its fingers round it; carried at the AK's low ready in both hands (F1a), the butt at the
// shoulder's front, the muzzle down; aimed square, the butt in the pocket, her cheek on the riser and her right
// eye on the scope's axis (F2a). The numbers the phase 0 mocks' (tools/art/guns/mock83.py, signed off 2026-11-13
// — Blender's x, y, z → the game's x, z, −y), in the gun's own frame here (x along the bore, y its top, z its
// right; m; its origin the top of the pistol grip — tools/art/guns/guns.py sniper()).
import { Quaternion, Vector3 } from "three";
import type { HeldShape } from "../chars/props";
import { AK_SLING } from "./ak-hold";
import type { LongSpec, SlingSpec } from "./long-hold";

/** The bore over the grip; the scope's axis */
export const SN_BZ = 0.066;
export const SN_SZ = 0.112;

/** The right hand round the pistol grip: its palm's middle on the grip's right side ~4.5 cm down it, the
 *  fingers' way, the index side (the AK's turn to start from — its grip raked as the AK's) */
export const SN_GRIP = {
  palm: new Vector3(-0.032, -0.045, 0.021),
  along: new Vector3(0.969, 0.244, -0.05).normalize(),
  index: new Vector3(-0.25, 0.968, -0.15).normalize(),
};
/** …what the fingers close round: the grip, raked back ~17°, 5.8 cm front to back, 5 across — round, its
 *  middle 5 cm down */
export const SN_GRIP_SHAPE = {
  at: new Vector3(-0.03, -0.05, 0),
  axis: new Vector3(0.29, 0.957, 0).normalize(),
  shape: { round: true as const, r: 0.025, y0: 0, hy: 0.04 },
};
/** The left palm up under the fore-end (2 mm inside its underside — its skin on it; at 7 mm, the AK's, the
 *  smaller hand's index went 9 mm into the wood — the knuckles at its
 *  right edge, the fingers round its right side, the thumb ahead along its left): from its back end out to
 *  the folded bipod's back, as far out as the arm reaches */
export const SN_FORE = { y: 0.015, x: [0.17, 0.31] as [number, number] };
/** …what its fingers close round: the fore-end, a box along the bore (its own y; its x down, its z across), 4
 *  cm tall round its middle, 5 wide */
export const SN_FORE_SHAPE = {
  y: 0.033,
  shape: { round: false as const, half: [0.02, 0.07, 0.025] as [number, number, number], cz: 0 },
};
/** (F7a) The torch in the same left fist along the bore under the fore-end: its axis this high (its body 6 mm
 *  under it), its middle this far ahead of the palm's, the palm's middle under it */
export const SN_TORCH = { y: -0.009, ahead: 0.085, palm: -0.009 - 0.016 + 0.009 };
const SN_TORCH_HELD: HeldShape = {
  parts: [SN_FORE_SHAPE.shape, { round: true, r: 0.016, y0: 0.012, hy: 0.04, x0: SN_FORE_SHAPE.y - SN_TORCH.y }],
};
/** The butt pad's middle */
export const SN_BUTT = new Vector3(-0.39, -0.01, 0);

// ── slung, drawn, put away (plan 83 phase 2, F6 — after phase 0: on the AK's diagonal, over it) ───────────
/** Slung on her back on the AK's diagonal (tp/ak-hold.ts AK_SLUNG): its grip low behind her right side, the
 *  muzzle up past her left shoulder, the stock down at her right hip, flat — its right side (the bolt) to her,
 *  its top up toward her right shoulder; over the AK when she carries both, over the double-barrel where they
 *  cross. Drawn and put back as the AK is: off her back by its stock round her right side. Its strap the AK's
 *  way, a little out over it; its two studs */
export const SN_SLING: SlingSpec = {
  ...AK_SLING,
  flag: "slingSn",
  // (shared ARMS.sniper.draw)
  draw: 0.6,
  away: 0.5,
  strap: [
    { bone: "shoulderL", at: [0, 0.105, -0.03] },
    { bone: "shoulderL", at: [-0.05, 0.055, 0.105] },
    { bone: "chest", at: [-0.05, -0.1, 0.23] },
    { bone: "hips", at: [-0.17, 0.07, 0.21] },
    { bone: "hips", at: [-0.2, 0.03, 0.045] },
  ],
  ends: [new Vector3(0.59, 0.02, 0.002), new Vector3(-0.28, -0.098, 0.002)],
  over: [
    { flag: "slingAk", out: 0.07 },
    { flag: "sling", out: 0.025 },
  ],
};

// ── everything else (plan 83 phase 6) ─────────────────────────────────────────────────────────────────
/** In a whole-body move — a roll, a vault, a slide, Flowmotion — or struck: held across her chest in its frame
 *  (the grip's place, its turn — x her left, y up, z ahead), as the AK's (tp/ak-hold.ts AK_PORT) but higher and
 *  nearer her, the muzzle down to her left (~21°) and a little ahead: its 1.27 m was through the floor at the
 *  AK's (6–10 cm in a roll), at the double-barrel's 24–35 — here over it all the roll (1–9 cm), the stock's belly
 *  off her right forearm; her left hand over its top (palm down — the AK's), the thumb along its left */
export const SN_PORT_ARMS = {
  at: new Vector3(0.07, 0.04, 0.28),
  turn: new Quaternion(0.0092, -0.0491, -0.1837, 0.9817).normalize(),
  fore: {
    y: 0.075,
    along: new Vector3(0.4, -0.35, 0.85).normalize(),
    index: new Vector3(-1, 0, 0),
    thumb: [0.01, 0.05, -0.04] as [number, number, number],
  },
};

/** The sniper as tp/long-hold.ts holds a long gun */
export const SN_LONG: LongSpec = {
  key: "sniper",
  wrist: SN_GRIP,
  wristShape: SN_GRIP_SHAPE,
  fore: {
    part: null,
    pivot: new Vector3(),
    y: SN_FORE.y,
    x: SN_FORE.x,
    // (the AK's: the fingers ahead and across under it, the index side tipped up a little)
    along: new Vector3(0.8, 0, 0.6).normalize(),
    index: new Vector3(1, 0.15, 0).normalize(),
    shape: SN_FORE_SHAPE,
    // (along its left side, ahead, out from it: on it, the bigger hand's thumb tip went 7 mm into the wood)
    thumb: [0.07, 0.046, -0.04],
  },
  torch: { ...SN_TORCH, held: SN_TORCH_HELD, thumb: [0.075, SN_TORCH.y + 0.004, -0.02] },
  butt: SN_BUTT,
  // (F1a, the AK's low ready — the butt out at the shoulder and 1.5 cm further ahead (its tall stock's toe was
  // 2.5–3.8 cm into the fuller chest's shirt), the muzzle a little more across her (her left hand to the fore-end);
  // running, less steep than the AK's: at 0.32 across and 0.15 her left forearm turned 53–54° jogging and
  // sprinting, her right forearm grazed the stock's belly)
  carry: { kind: "ready", pocket: [0, -0.03, 0.085], down: 0.45, across: 0.3, run: 0.08 },
  aim: { up: 0.05, trunk: 0.8, bust: 0.0175, lean: 1 },
  // (her right eye on the scope's axis: 11.2 cm over the grip — the mocks' head down on the riser leaves it
  // 6 cm short, the gun comes up the rest: cheekTo)
  cheek: { y: SN_SZ, z: 0 },
  blade: { ready: 0.08, aim: 0.25 },
  // (her left shoulder forward: at the AK's 0.1, with the butt further ahead, her left hand fell 1.1–1.3 cm short)
  protract: 0.12,
  // (a .308's: more than the AK's round, less than the 12-gauge — phase 3 tunes it)
  kick: { flip: 0.14, back: 0.025, rock: 0.06 },
  // (shared ARMS.sniper.aim)
  aimS: 0.3,
  leftCarried: true,
  sling: SN_SLING,
  port: SN_PORT_ARMS,
  avoid: null,
  check: {
    boxes: [
      // (the fore-end)
      { c: [0.24, 0.033], h: [0.14, 0.02, 0.025], fore: false },
      // (the magazine's floorplate: the left little finger by it)
      { c: [0.11, 0.0125], h: [0.04, 0.022, 0.016], fore: false },
    ],
    rods: [
      // (the stock behind the grip: its comb and its belly — her right forearm by it)
      { a: [-0.08, 0.045], b: [-0.32, 0.05], r: 0.025, fore: false },
      { a: [-0.1, -0.03], b: [-0.32, -0.065], r: 0.03, fore: false },
      // (the barrel past the fore-end)
      { a: [0.62, SN_BZ], b: [0.88, SN_BZ], r: 0.014, fore: false },
      // (the scope)
      { a: [-0.146, SN_SZ], b: [0.32, SN_SZ], r: 0.02, fore: false },
    ],
    // (tools/art/guns/guns.py's stock and riser)
    stock: {
      x: [-0.395, -0.1],
      top: [
        [-0.11, 0.074],
        [-0.13, 0.083],
        [-0.3, 0.085],
        [-0.37, 0.07],
      ],
      bot: [
        [-0.07, -0.032],
        [-0.12, -0.04],
        [-0.33, -0.1],
        [-0.375, -0.09],
      ],
      z: 0.025,
    },
  },
};

// ── the bolt (plan 83 phase 4, F3a) ─────────────────────────────────────────────────────────────────────
// After a shot (Player.arm ARM.bolt, shared ARMS.sniper.bolt — 0.85 s, from 0.2 s after it; no shot till it's
// home): her right hand off the grip to the knob, the bolt turned up, run back (the case out), run home and
// turned down, her hand back to the grip — the rifle kept at her shoulder, her cheek on it, her left hand on
// the fore-end (all three games, the real thing). s:
//   0–0.13      her right hand from the grip to the knob
//   0.13–0.28   the bolt turned up (poseGun's `bolt` 0 → 0.35)
//   0.28–0.43   run back (0.35 → 1) — the case thrown out
//   0.47–0.6    run home (1 → 0.35)
//   0.6–0.7     turned down (0.35 → 0)
//   0.7–0.85    her hand back to the grip
export const SN_BOLT = { reach: 0.13, up: 0.28, back: 0.43, home: 0.6, down: 0.7, len: 0.85 };
/** Her right hand on the bolt's knob (the bolt's own frame, its origin on the bore 6.6 cm over the grip — the
 *  knob turns and runs with it): its palm's middle to the knob's right, under it and behind it, the palm to the
 *  gun, the knob in the curl of her index and thumb; the fingers' way ahead, up and in over the bolt, the index
 *  side up. (The mocks' — the fingers ahead and in, level — bent her wrist 11–43° past its reach through the
 *  cycle; turned 29° in and 29° up, within it, her forearm turned ≤33°) */
export const SN_KNOB_HAND = {
  palm: new Vector3(-0.041, 0.022 - SN_BZ, 0.095),
  along: new Vector3(0.834, 0.458, -0.309).normalize(),
  index: new Vector3(-0.233, 0.964, -0.127).normalize(),
};
const sm = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Where the bolt's timeline has the hand and the bolt `t` s in: her right hand off the grip toward the knob
 *  (0 on the grip, 1 on the knob), the bolt (poseGun's `bolt`: 0–0.35 turned up, 0.35–1 run back) */
export function snBoltAt(t: number): { hand: number; bolt: number } {
  const T = SN_BOLT;
  const hand = sm(0, T.reach, t) * (1 - sm(T.down, T.len, t));
  const bolt =
    t < T.up
      ? 0.35 * sm(T.reach, T.up, t)
      : t < T.home - 0.13
        ? 0.35 + 0.65 * sm(T.up, T.back, t)
        : t < T.home
          ? 1 - 0.65 * sm(T.home - 0.13, T.home, t)
          : 0.35 * (1 - sm(T.home, T.down, t));
  return { hand, bolt };
}

// ── the reload (plan 83 phase 5: F4a raised, F5a the sleeve) ──────────────────────────────────────────────
// One timeline, s from the server's opening it (Player.arm ARM.open — the bolt back, then a round at a time; it
// says nothing between) to its closing (ARM.shut — the bolt home), in time with shared ARMS.sniper (open 0.35, a
// round 0.5, shut 0.35):
//   0–0.25          raised (F4a, AW2's and RE5's): nearly upright before her right chest, the muzzle up and a
//                   little left, its right side (the port) turned to her; her left hand up the fore-end
//   0–0.12          her right hand from the grip to the knob; the bolt turned up (–0.22) and run back (–0.35)
//   a round, 0.5:   her right hand down to the sleeve on the stock (–0.35 of it), a round pinched out (0.4), up
//                   to the port (–0.8), laid in and thumbed down into the magazine (–1)
//   closing, 0.35:  her right hand to the knob (–0.12), the bolt run home and turned down (–0.35)
//   then 0.3:       her right hand back on the grip, the rifle down to the hold
// Seen mid-way (a newcomer): on from the opening; closed, on from the closing.
export const SN_LOAD = { raise: 0.25, open: 0.35, each: 0.5, shut: 0.35, back: 0.3 };
/** The rifle raised for loading (the mocks'): its grip from the right shoulder's joint (her frame: x left, y up,
 *  z ahead; m), the bore's way, its top's */
export const SN_LOAD_GUN = {
  at: [0.1, -0.4, 0.26] as [number, number, number],
  f: [0.14, 0.8, 0.52] as [number, number, number],
  u: [0.8, 0, -0.35] as [number, number, number],
  /** her left hand up the fore-end the while (along it, from … to — as far as she reaches) */
  fore: [0.36, 0.46] as [number, number],
  /** …round it from over its top (its top's to her left, the rifle upright): its palm's middle this high, the
   *  fingers' way across to its left and down, the index side ahead; the thumb along its right */
  // (searched from the mocks' — the fingers across its top, the index ahead — that had her wrist 43° past its
  // reach: turned 34° in, 34° up, rolled 40°, within it, her forearm barely turned)
  hand: {
    y: 0.085,
    along: new Vector3(0.572, 0.421, -0.704).normalize(),
    index: new Vector3(0.681, 0.565, 0.466).normalize(),
    thumb: [0.03, 0.03, 0.04] as [number, number, number],
  },
};
/** Her right hand on the knob loading (the rifle raised: its own turn — the bolt's, at the shoulder, is
 *  SN_KNOB_HAND) */
export const SN_LOAD_KNOB = {
  palm: SN_KNOB_HAND.palm.clone(),
  // (the bolt's at the shoulder bent her wrist 85° past its reach here: from below it, the palm down to the bolt
  // as it's pulled down the upright rifle, the fingers across the bolt's top)
  along: new Vector3(0.261, 0.965, -0.03).normalize(),
  index: new Vector3(0.023, 0.32, 0.947).normalize(),
};
/** The sleeve's rounds (tools/art/guns/guns.py: standing across the stock on its right side, bullets up): the
 *  first's axis (its base), the spacing along the stock, their length */
export const SN_SLEEVE = { at: new Vector3(-0.289, -0.032, 0.037), dx: 0.017, len: 0.071, n: 5 };
/** Her right hand pinching a round out of the sleeve (the gun's frame, about the round's middle): its palm's
 *  middle out to its right, the fingers' way in and a little ahead, the index side up */
export const SN_SLEEVE_HAND = {
  palm: new Vector3(0.0, 0.0, 0.04),
  // (straight in, her wrist bent 10° past its reach with the rifle raised: turned 29° more ahead, within it)
  along: new Vector3(-0.206, -0.095, -0.974).normalize(),
  index: new Vector3(0, 1, 0),
};
/** The port (the magazine under it, the bolt back): where a round's laid, bullet ahead, and thumbed down */
export const SN_PORT = new Vector3(0.065, 0.07, 0.012);
/** Her right hand at the port, laying a round in: its palm's middle to the port's right and over it, the
 *  fingers in and down over it, the index side ahead */
export const SN_PORT_HAND = {
  palm: new Vector3(-0.005, 0.03, 0.05),
  // (the fingers straight in and down over it bent her wrist 21° past its reach, raised: turned 29° in and up,
  // rolled 34°, within it)
  along: new Vector3(0.522, 0.112, -0.846).normalize(),
  index: new Vector3(0.705, 0.549, 0.449).normalize(),
};
export type SnPlace = "grip" | "knob" | "sleeve" | "port";
/** Where the reload's timeline has it `t` s in (`closeAt`: when its closing began, −1 not yet): the rifle
 *  raised (0..1); her right hand between two places and how far; the bolt (poseGun's `bolt`); a round in her
 *  hand (0 none, 1 in it, 2 at the port going in); the rounds still in the sleeve; her eyes on the action */
export function snLoadAt(
  t: number,
  closeAt: number,
): {
  gun: number;
  left: number;
  a: SnPlace;
  b: SnPlace;
  k: number;
  bolt: number;
  round: 0 | 1 | 2;
  push: number;
  taken: number;
  look: number;
  done: boolean;
} {
  const L = SN_LOAD;
  // (not closing yet: raised throughout — Infinity's arithmetic would make it NaN)
  const back0 = closeAt >= 0 ? closeAt + L.shut : -1;
  // (her left hand over the fore-end's top first, then the rifle up — and down, then her hand back under it: both
  // at once, her forearm swept through the scope)
  const gun = sm(0.08, L.raise + 0.05, t) * (back0 < 0 ? 1 : 1 - sm(back0, back0 + 0.2, t));
  const left = sm(0, 0.12, t) * (back0 < 0 ? 1 : 1 - sm(back0 + 0.15, back0 + L.back, t));
  const look = sm(0.1, L.raise, t) * (back0 < 0 ? 1 : 1 - sm(back0 - 0.1, back0 + 0.15, t));
  const done = back0 >= 0 && t >= back0 + L.back;
  if (closeAt >= 0 && t >= closeAt) {
    const c = t - closeAt;
    if (c < L.shut) {
      const bolt = 1 - sm(0.1, L.shut, c);
      return { gun, left, a: "port", b: "knob", k: sm(0, 0.12, c), bolt, round: 0, push: 0, taken: 0, look, done };
    }
    return {
      gun,
      left,
      a: "knob",
      b: "grip",
      k: sm(L.shut, L.shut + 0.15, c),
      bolt: 0,
      round: 0,
      push: 0,
      taken: 0,
      look,
      done,
    };
  }
  if (t < L.open) {
    const bolt = t < 0.22 ? 0.35 * sm(0.12, 0.22, t) : 0.35 + 0.65 * sm(0.22, L.open, t);
    return { gun, left, a: "grip", b: "knob", k: sm(0, 0.12, t), bolt, round: 0, push: 0, taken: 0, look, done };
  }
  const r = (t - L.open) / L.each;
  const n = Math.floor(r);
  const u = r - n;
  const from: SnPlace = n === 0 ? "knob" : "port";
  const taken = n + (u >= 0.4 ? 1 : 0);
  if (u < 0.35)
    return { gun, left, a: from, b: "sleeve", k: sm(0, 0.35, u), bolt: 1, round: 0, push: 0, taken, look, done };
  if (u < 0.45)
    return { gun, left, a: "sleeve", b: "sleeve", k: 1, bolt: 1, round: u >= 0.4 ? 1 : 0, push: 0, taken, look, done };
  if (u < 0.8)
    return { gun, left, a: "sleeve", b: "port", k: sm(0.45, 0.8, u), bolt: 1, round: 1, push: 0, taken, look, done };
  return {
    gun,
    left,
    a: "port",
    b: "port",
    k: 1,
    bolt: 1,
    round: u < 0.95 ? 2 : 0,
    push: sm(0.8, 0.95, u),
    taken,
    look,
    done,
  };
}
