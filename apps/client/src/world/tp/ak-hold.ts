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

// ── everything else (plan 82 phase 5) ─────────────────────────────────────────────────────────────────
/** In a whole-body move — a roll, a vault, a slide, Flowmotion — or struck: pulled in across her chest (port
 *  arms, her chest's frame: x her left, y up, z ahead — it goes round with her), both hands on: the grip by her
 *  right hip's front, the muzzle up, left and ahead — further ahead than the double-barrel's (SG_PORT, nearly
 *  upright): held so by its pistol grip her right wrist was bent 53–76° past its reach and her left forearm
 *  turned 65°; this way 11–28°, within 52° */
const PORT_F = new Vector3(0.55, 0.5, 0.67).normalize();
export const AK_PORT = {
  at: new Vector3(-0.08, -0.24, 0.3),
  turn: new Quaternion().setFromRotationMatrix(
    (() => {
      const u = new Vector3(0, 0, -1).addScaledVector(PORT_F, PORT_F.z).normalize();
      return new Matrix4().makeBasis(PORT_F, u, new Vector3().crossVectors(PORT_F, u));
    })(),
  ),
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
  aim: { up: 0.05, trunk: 0.8, bust: 0.0175, lean: 1 },
  // (near square: the mocks' 0.08 carried, 0.25 aimed — plan 81's 0.5 had her side-on)
  // (the rear and front sights' tops ~10.4 cm over the grip's top: her eye a little over them)
  cheek: { y: 0.106, z: 0 },
  blade: { ready: 0.08, aim: 0.25 },
  // (her left shoulder forward: at the double-barrel's 0.065 her left hand fell 1–3 cm short of the receiver)
  protract: 0.09,
  // (a round's — full auto's ten a second: small, phase 3 tunes it)
  kick: { flip: 0.05, back: 0.012, rock: 0.025 },
  // (shared ARMS.ak47.aim)
  aimS: 0.24,
  leftCarried: true,
  sling: AK_SLING,
  port: AK_PORT,
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

// ── the reload (plan 82 phase 4: F4a rock and lock, F5a the pouch) ─────────────────────────────────────
// One timeline, s from the server's step opening it (Player.arm ARM.open; its closing ARM.shut, or ARM.rack
// run dry — everyone sees which), in time with shared ARMS.ak47 (the magazine out 0.8, the new one in 1.0,
// shouldered 0.4 or racked 1.0):
//   0–0.3      the gun in close (the butt under her right arm, rolled so the well faces her left hand); her
//              left hand off the receiver to the magazine, its thumb on the catch
//   0.25–0.62  the empty rocked out on its front lug and pulled clear; let fall at 0.7
//   0.7–1.1    her left hand down to the pouch at her left hip, a new one drawn up out of it
//   1.1–1.66   up to the well, its front lug hooked, rocked back till it clicks
//   1.8–2.2    shouldered: her left hand back to the receiver, the gun up to the hold — or, racked (to 2.8):
//              her left hand over the receiver to the charging handle, swept back, let go, and back
// A shot while the empty's still in (the server snaps it shut): on from the closing.
/** (shared ARMS.ak47, AK_RELOAD) */
export const AK_LOAD = { open: 0.8, speed: 1.0, shut: 0.4, rack: 1.0, out: 0.45, drop: 0.7, home: 1.66, pull: 0.42 };
export const AK_CLOSE = AK_LOAD.open + AK_LOAD.speed;
/** The gun held for loading (the mocks'): its butt under her right arm — from the right shoulder's joint
 *  (her frame: x left, y up, z ahead) — the bore's way ahead, left and a little down, its top rolled left (the
 *  well to her left hand) */
export const AK_LOAD_GUN = {
  butt: [0.02, -0.16, 0.04] as [number, number, number],
  f: [0.55, -0.2, 0.8] as [number, number, number],
  u: [0.45, 1, 0] as [number, number, number],
};
/** Her trunk turned this far right while loading (the mocks') */
export const AK_LOAD_BLADE = 0.12;
/** The magazine part's pivot (its front lug — tools/art/guns/build_guns.py) and how far it's rocked out (rad,
 *  its bottom forward about the lug), hooked, slid out along itself (m) */
export const MAG = { lug: AK_LUG, out: 0.42, hook: 0.3, clear: 0.06, hookDown: 0.015 };
/** The left hand round the magazine (its own frame — the gun's as it hangs home, rocked with it): the palm on
 *  its left side, the fingers round its front and down, the index side up; the thumb up behind it on the
 *  catch (the gun's frame) */
export const MAG_HAND = {
  palm: new Vector3(0.13, -0.07, -0.034),
  along: new Vector3(0.7, -0.7, -0.2).normalize(),
  index: new Vector3(0.3, 1, 0).normalize(),
  thumb: new Vector3(0.075, 0.008, -0.012),
  shape: { round: false as const, half: [0.026, 0.06, 0.014] as [number, number, number], cz: 0 },
  /** the shape's middle on the magazine (its frame) */
  at: new Vector3(0.13, -0.07, 0),
};
/** The left hand on the charging handle run dry: over the top of the receiver, its palm down on the dust
 *  cover, its fingers down the right side to the knob — swept back with the carrier (the gun's frame, m). Under
 *  the rifle, palm up (the mocks', F4a's), with the gun in close her forearm was turned 90–140° and her wrist
 *  bent 80–120° past its reach; over the top, ~0° and within it */
export const RACK_HAND = {
  palm: new Vector3(0.17, 0.095, 0.012),
  along: new Vector3(0, -0.35, 0.94).normalize(),
  index: new Vector3(-1, 0, 0),
  back: 0.075,
};
/** The pouch on her belt at her left hip's front (F5a; the hips' own space: x her left, y up, z ahead): its
 *  middle, its turn (x along the belt, y up, z out from her), its box's size (m — long along the belt for a
 *  30-round magazine's curve), its two magazines' mouths (the box's frame, just over its top) and their turn in
 *  it (their curve forward along the belt, their left sides out: her hand takes one palm in, as a hand hangs —
 *  their curve out from her, it took it turned 78°) — the outer one drawn — and how far it's drawn up out of it
 *  before it's carried off. Out on her hip's front (at 14 cm it was half in her) */
export const AK_POUCH = {
  at: new Vector3(0.16, -0.13, 0.175),
  turn: new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      new Vector3(0.75, 0, -0.66).normalize(),
      new Vector3(0, 1, 0),
      new Vector3(0.66, 0, 0.75).normalize(),
    ),
  ),
  box: [0.13, 0.2, 0.065] as [number, number, number],
  mags: [new Vector3(0.0075, 0.115, 0.0155), new Vector3(0.0075, 0.115, -0.0155)],
  magTurn: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
  take: 0,
  draw: 0.12,
  /** her hand meets it drawn this much of the way up (its palm over the pouch's mouth) */
  grab: 0.5,
};
/** The empty let fall: its spin (rad/s about the gun's right and its bore), how long it lies (s) */
export const DROP = { spin: [3.2, 1.4] as [number, number], lie: 2.5 };

const sm = (a: number, b: number, t: number) => {
  const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
};
/** Where the reload is at `t` (s; `rack`: its closing racks the handle): the gun's legs (0 the hold … 1 in
 *  close), the magazine's state, the left hand's, the carrier's travel back (0..1) */
export function akLoadAt(t: number, rack: boolean) {
  const end = AK_CLOSE + (rack ? AK_LOAD.rack : AK_LOAD.shut);
  // the gun: down in close, kept there (racked: till the handle's let go), up to the hold
  const upFrom = rack ? AK_CLOSE + 0.62 : AK_CLOSE + 0.05;
  const gun = sm(0, 0.3, t) * (1 - sm(upFrom, end, t));
  // the magazine: home; rocked out; slid clear (in her hand); fallen; drawn from the pouch; to the well;
  // hooked; home
  let mag: { at: "gun" | "hand" | "gone" | "pouch" | "carry"; rock: number; slide: number; k: number };
  if (t < 0.25) mag = { at: "gun", rock: 0, slide: 0, k: 0 };
  else if (t < 0.5) mag = { at: "gun", rock: MAG.out * sm(0.25, 0.5, t), slide: 0, k: 0 };
  else if (t < AK_LOAD.drop) mag = { at: "hand", rock: MAG.out, slide: MAG.clear * sm(0.5, 0.62, t), k: 0 };
  else if (t < 0.95) mag = { at: "gone", rock: 0, slide: 0, k: 0 };
  // (her hand takes it by its top, half up out of the pouch — its palm over the pouch's mouth, not in it)
  else if (t < 1.1) mag = { at: "pouch", rock: 0, slide: 0, k: AK_POUCH.grab + (1 - AK_POUCH.grab) * sm(0.95, 1.1, t) };
  else if (t < 1.38) mag = { at: "carry", rock: MAG.hook, slide: MAG.hookDown, k: sm(1.1, 1.38, t) };
  else if (t < 1.48) mag = { at: "gun", rock: MAG.hook, slide: MAG.hookDown * (1 - sm(1.38, 1.48, t)), k: 0 };
  else mag = { at: "gun", rock: MAG.hook * (1 - sm(1.48, AK_LOAD.home, t)), slide: 0, k: 0 };
  // the left hand: to the magazine, with it, to the pouch, with the new one; then back — or to the handle
  let hand: { a: string; b: string; k: number };
  if (t < 0.25) hand = { a: "fore", b: "mag", k: sm(0, 0.25, t) };
  else if (t < AK_LOAD.drop) hand = { a: "mag", b: "mag", k: 0 };
  else if (t < 0.95) hand = { a: "let", b: "pouch", k: sm(AK_LOAD.drop, 0.95, t) };
  else if (t < AK_CLOSE) hand = { a: "mag", b: "mag", k: 0 };
  else if (!rack) hand = { a: "mag", b: "fore", k: sm(AK_CLOSE, AK_CLOSE + 0.25, t) };
  else if (t < AK_CLOSE + 0.3) hand = { a: "mag", b: "knob", k: sm(AK_CLOSE, AK_CLOSE + 0.3, t) };
  else if (t < AK_CLOSE + 0.57) hand = { a: "knob", b: "knob", k: 0 };
  else hand = { a: "knob", b: "fore", k: sm(AK_CLOSE + 0.57, AK_CLOSE + 0.8, t) };
  // the carrier: swept back with the hand, let go (it slams home)
  const bolt = !rack
    ? 0
    : t < AK_CLOSE + AK_LOAD.pull
      ? sm(AK_CLOSE + 0.3, AK_CLOSE + AK_LOAD.pull, t)
      : 1 - Math.max(0, Math.min(1, (t - AK_CLOSE - AK_LOAD.pull) / 0.05));
  return { gun, mag, hand, bolt, end, look: sm(0, 0.3, t) * (1 - sm(AK_CLOSE, AK_CLOSE + 0.3, t)) };
}
