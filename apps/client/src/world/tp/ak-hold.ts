// Plan 82 — the AK held as a person holds one (docs/plan/82-the-ak.md), on plan 81's long-gun hold
// (tp/long-hold.ts): the gun the anchor; the right hand round the pistol grip by a frame of its own, the web
// high on its back; the left palm up under the receiver in front of the magazine (the "magwell" hold — square,
// the handguard was out of reach) or out along the lower handguard as far as the arm reaches, its fingers round
// it; carried at the low ready in both hands before her (F1b), the butt at the shoulder's front, the muzzle
// down; aimed square, the butt in the pocket (F2a). The numbers the phase 0 mocks' (tools/art/guns/mock82.py,
// signed off 2026-11-12 — Blender's x, y, z → the game's x, z, −y), in the gun's own frame here (x along the
// bore, y its top, z its right; m; its origin the top of the pistol grip — tools/art/guns/guns.py ak47()).
import { Matrix4, Quaternion, Vector3 } from "three";
import type { HeldShape } from "../chars/props";
import type { LongSpec, SlingSpec } from "./long-hold";

/** The right hand round the pistol grip: its palm's middle on the grip's right side ~4 cm down it, the
 *  fingers' way, the index side — the hand round it a little aslant, its fingers' way 25° up from square to
 *  the grip (so 11° over the bore) and its index side back from up the grip as much: the AK's grip is near
 *  upright and her forearm comes up to it from below — the mocks' 52° down had the wrist bent 82° sideways in
 *  the game, square to the grip (as the revolver's) 45°; aslant it's 15–33°, within a wrist's reach */
export const AK_GRIP = {
  palm: new Vector3(-0.006, -0.042, 0.012),
  along: new Vector3(0.98, 0.19, -0.05).normalize(),
  index: new Vector3(-0.2, 0.98, 0).normalize(),
};
/** …what the fingers close round: the grip, raked back ~13°, 4.6 cm front to back, 3.1 across — round,
 *  its middle 4.5 cm down */
export const AK_GRIP_SHAPE = {
  at: new Vector3(-0.003, -0.045, 0),
  axis: new Vector3(0.234, 0.972, 0).normalize(),
  shape: { round: true as const, r: 0.019, y0: 0, hy: 0.04 },
};
/** The left palm up under the gun (7 mm inside the receiver's underside — its skin on it; at the double-
 *  barrel's 9 the index's knuckle was in it — the knuckles at its right edge, the fingers round its right side,
 *  the thumb ahead along its left): from in front of the magazine (under the receiver — its little finger clear
 *  of the magazine's front) out along the lower handguard, as far out as the arm reaches */
export const AK_FORE = { y: 0.027, x: [0.155, 0.43] as [number, number] };
/** …what its fingers close round: the receiver's front and the handguard, a box along the bore (its own y;
 *  its x down, its z across), 5.6 cm tall round its middle, 4.8 wide */
export const AK_FORE_SHAPE = {
  y: 0.05,
  shape: { round: false as const, half: [0.028, 0.07, 0.024] as [number, number, number], cz: 0 },
};
/** (F3a) The torch in the same left fist along the bore under the gun: its axis this high (its body 6 mm
 *  under the receiver), its middle this far ahead of the palm's (its back end clear of the magazine), the
 *  palm's middle under it */
export const AK_TORCH = { y: -0.002, ahead: 0.085, palm: -0.002 - 0.016 + 0.009 };
const AK_TORCH_HELD: HeldShape = {
  parts: [AK_FORE_SHAPE.shape, { round: true, r: 0.016, y0: 0.012, hy: 0.04, x0: AK_FORE_SHAPE.y - AK_TORCH.y }],
};
/** The butt plate's middle */
export const AK_BUTT = new Vector3(-0.41, -0.013, 0);
/** The magazine's front lug (it rocks about it); the charging handle's knob (on the right) */
export const AK_LUG = new Vector3(0.124, 0.026, 0);
export const AK_CHARGE = new Vector3(0.19, 0.073, 0.046);

// ── slung, drawn, put away (plan 82 phase 2, F6a) ──────────────────────────────────────────────────
/** Slung on her back, the double-barrel's mirrored so both fit, crossed (the chest bone's space: x her left, y
 *  up, z ahead): its grip low behind her right side, the muzzle up past her left shoulder, the stock down to
 *  her right hip, its top to her back (the magazine out from it) — the grip's place, its turn */
const SLUNG_F = new Vector3(0.55, 0.83, 0).normalize();
export const AK_SLUNG = {
  at: new Vector3(-0.1, -0.13, -0.14),
  turn: new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(SLUNG_F, new Vector3(0, 0, 1), new Vector3().crossVectors(SLUNG_F, new Vector3(0, 0, 1))),
  ),
};
/** The AK slung, drawn and put back (shared ARMS.ak47.draw: 0.6 — off her back, down her right side) */
export const AK_SLING: SlingSpec = {
  flag: "slingAk",
  at: AK_SLUNG.at,
  turn: AK_SLUNG.turn,
  // (her right hand back to the grip low on her back, the gun turned down across her back — the muzzle sweeping
  // down past her left hip — to hang muzzle down at her right side, its top ahead, the stock up behind her arm;
  // swung up ahead to the hold. Her hand as a hand hangs all the way: swung round her side upright, its top to
  // her, the grip held fingers up, her wrist was bent 57–97° past its reach)
  keys: [
    { at: [-0.14, -0.36, -0.2], f: [0.9, -0.42, 0], u: [0, 0, 1] },
    { at: [-0.27, -0.36, -0.1], f: [0, -0.937, 0.35], u: [0, 0, 1] },
    { at: [-0.26, -0.32, 0.12], f: [0.05, -0.6, 0.8], u: [0, 0.8, 0.6] },
  ],
  draw: 0.6,
  away: 0.5,
  // (from the front swivel up by her left shoulder, over it, across her chest — over the double-barrel's strap
  // — to her right hip, round to the stock's loop)
  strap: [
    { bone: "shoulderL", at: [0, 0.09, -0.03] },
    { bone: "shoulderL", at: [-0.05, 0.04, 0.09] },
    { bone: "chest", at: [-0.05, -0.1, 0.215] },
    { bone: "hips", at: [-0.17, 0.07, 0.195] },
    { bone: "hips", at: [-0.2, 0.03, 0.03] },
  ],
  ends: [new Vector3(0.46, 0.03, 0), new Vector3(-0.35, 0, -0.021)],
  bust: 0.005,
  // (crossed over the double-barrel when she carries both: their middles met in her back)
  over: 0.085,
};

/** The AK as tp/long-hold.ts holds a long gun */
export const AK_LONG: LongSpec = {
  key: "ak47",
  wrist: AK_GRIP,
  wristShape: AK_GRIP_SHAPE,
  fore: {
    part: null,
    pivot: new Vector3(),
    y: AK_FORE.y,
    x: AK_FORE.x,
    // (the fingers' way across under it and ahead, the index side tipped up: square across, the palm flat up,
    // her forearm was turned palm-up past 60° and the wrist bent 45–60° sideways — this way 33–46°, 28–41°; any
    // more ahead or tipped and the index's joints went into the receiver, the little finger into the magazine)
    along: new Vector3(0.65, 0, 0.76).normalize(),
    index: new Vector3(1, 0.25, 0).normalize(),
    shape: AK_FORE_SHAPE,
    // (along the left side, ahead)
    thumb: [0.08, 0.042, -0.034],
  },
  torch: { ...AK_TORCH, held: AK_TORCH_HELD, thumb: [0.075, AK_TORCH.y + 0.004, -0.02] },
  butt: AK_BUTT,
  // (F1b, the mocks': the butt out at the shoulder's front — in toward the neck, the stock's heel was in his
  // chest — the muzzle ~26° down and across him a little: so his left hand reaches with his shoulders square)
  carry: { kind: "ready", pocket: [0.03, -0.03, 0.07], down: 0.45, across: 0.28, run: 0.15 },
  aim: { up: 0.05, trunk: 0.8, bust: 0.0175 },
  // (near square: the mocks' 0.08 carried, 0.25 aimed — plan 81's 0.5 had her side-on)
  blade: { ready: 0.08, aim: 0.25 },
  // (her left shoulder forward: at the double-barrel's 0.065 her left hand fell 1–3 cm short of the receiver)
  protract: 0.09,
  // (a round's — full auto's ten a second: small, phase 3 tunes it)
  kick: { flip: 0.05, back: 0.012, rock: 0.025 },
  // (shared ARMS.ak47.aim)
  aimS: 0.24,
  leftCarried: true,
  sling: AK_SLING,
  avoid: null,
  check: {
    boxes: [
      // (the receiver's front and the lower handguard)
      { c: [0.3, 0.05], h: [0.15, 0.028, 0.024], fore: true },
      // (the magazine's top: the left little finger by it)
      { c: [0.101, -0.02], h: [0.029, 0.04, 0.013], fore: false },
    ],
    rods: [
      // (the stock's front half — its back's in the shoulder)
      { a: [-0.07, 0.04], b: [-0.3, 0.0], r: 0.03, fore: false },
      // (the barrel past the handguard)
      { a: [0.46, 0.06], b: [0.69, 0.064], r: 0.012, fore: false },
      // (the magazine)
      { a: [0.1, 0.0], b: [0.15, -0.16], r: 0.016, fore: false },
    ],
    // (tools/art/guns/guns.py's stock)
    stock: {
      x: [-0.395, -0.1],
      top: [
        [-0.1, 0.07],
        [-0.4, 0.046],
      ],
      bot: [
        [-0.1, 0.012],
        [-0.36, -0.072],
      ],
      z: 0.014,
    },
  },
};
