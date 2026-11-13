// Plan 83 — the sniper held as a person holds one (docs/plan/83-the-sniper.md), on plan 81's long-gun hold
// (tp/long-hold.ts), as the AK is (plan 82): the gun the anchor; the right hand round the pistol grip by a frame
// of its own, the web high on its back; the left palm up under the fore-end (behind the folded bipod) as far out
// as the arm reaches, its fingers round it; carried at the AK's low ready in both hands (F1a), the butt at the
// shoulder's front, the muzzle down; aimed square, the butt in the pocket, her cheek on the riser and her right
// eye on the scope's axis (F2a). The numbers the phase 0 mocks' (tools/art/guns/mock83.py, signed off 2026-11-13
// — Blender's x, y, z → the game's x, z, −y), in the gun's own frame here (x along the bore, y its top, z its
// right; m; its origin the top of the pistol grip — tools/art/guns/guns.py sniper()).
import { Vector3 } from "three";
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
  // 2.5–3.8 cm into the fuller chest's shirt), the muzzle a little more across her (her left hand to the fore-end)
  carry: { kind: "ready", pocket: [0, -0.03, 0.085], down: 0.45, across: 0.32, run: 0.15 },
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
