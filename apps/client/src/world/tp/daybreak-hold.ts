// Plan 84 — the Daybreak held as a person holds one (docs/plan/84-the-daybreak.md), on plan 81's long-gun hold
// (tp/long-hold.ts), as the AK and the sniper are (plans 82–83): the gun the anchor; the right hand round the walnut
// pistol grip by a frame of its own, the web high on its back; the left hand round the leather VERTICAL fore-grip
// (thumb-break: the palm on its left side, the fingers round its front, the index up under the lamp's body, the
// thumb over its top); carried at the AK's low ready in both hands (F1a), the brace's pad at the shoulder's front,
// the lens down and across to her left; aimed with the pad in the pocket, her head nearly upright behind the high
// ring sight, her right eye on its line (F2a). The numbers the phase 0 mocks' (tools/art/guns/mock84.py, signed
// off 2026-11-13 — Blender's x, y, z → the game's x, z, −y), in the gun's own frame here (x along the lamp, y its
// top, z its right; m; its origin the grip point at the walnut grip's top — tools/art/guns/guns.py daybreak()).
import { Matrix4, Quaternion, Vector3 } from "three";
import type { HeldShape } from "../chars/props";
import type { LongSpec, SlingSpec } from "./long-hold";

/** The lamp's axis over the grip; the ring sight's line over it */
export const DB_AZ = 0.115;
export const DB_SIGHT = DB_AZ + 0.085;

/** The right hand round the walnut grip: its palm's middle on the grip's right side ~4.5 cm down it, the
 *  fingers' way, the index side (the sniper's turned 9° more up the grip — its grip raked back ~9°, less than
 *  the sniper's 17°: at the sniper's, the right wrist went 4–10° past its reach aimed low and running) */
export const DB_GRIP = {
  palm: new Vector3(-0.016, -0.004, 0.02),
  along: new Vector3(0.921, 0.386, -0.05).normalize(),
  index: new Vector3(-0.388, 0.91, -0.148).normalize(),
};
/** …what the fingers close round: the grip, 4.2 cm front to back, 3.2 across, raked back ~9° — round, its middle
 *  1.7 cm down */
export const DB_GRIP_SHAPE = {
  at: new Vector3(0, -0.017, 0),
  axis: new Vector3(0.152, 0.988, 0).normalize(),
  shape: { round: true as const, r: 0.019, y0: 0, hy: 0.055 },
};
/** The vertical fore-grip (guns.py: 0.267–0.315 along, from the body's underside 6.2 cm over the grip's line
 *  down 9.6 cm, 3.2 across): the left palm's middle on its left side (thumb-break), 2 cm up it, 3.2 out from its
 *  middle (at 2.6 the index pressed into its top); one place, not a run along it */
export const DB_FORE = { x: 0.288, y: 0.02, z: -0.032 };
/** …what its fingers close round: the fore-grip, upright — round, 4.2 across where the fingers are (its top's 4.8,
 *  its foot's 3: at 4.6 the index curled 1.5 cm round into it), its middle 1.4 cm up */
export const DB_FORE_SHAPE = {
  y: 0.014,
  z: 0,
  axis: new Vector3(0, 1, 0),
  shape: { round: true as const, r: 0.021, y0: 0, hy: 0.048 },
};
/** (F7a) The torch in the same left fist, pressed to the fore-grip's front: along the lamp under its body, its
 *  axis this high, its middle this far ahead of the palm's (its tail at the grip's front), the palm's middle
 *  where it is without it */
export const DB_TORCH = { y: 0.018, ahead: 0.09, palm: DB_FORE.y };
const DB_TORCH_HELD: HeldShape = {
  parts: [
    DB_FORE_SHAPE.shape,
    { cap: [0.03, DB_TORCH.y - DB_FORE_SHAPE.y, 0, 0.18, DB_TORCH.y - DB_FORE_SHAPE.y, 0], r: 0.016 },
  ],
};
/** The brace's leather pad, its middle: dropped 14 cm under the lamp's axis and cast 3.5 cm to its right (phase
 *  0: her eye on the ring's line with her head nearly upright, the pad in her shoulder's pocket) */
export const DB_BUTT = new Vector3(-0.301, DB_AZ - 0.14, 0.035);

// ── slung, drawn, put away (plan 84 phase 2, F6a) ───────────────────────────────────────────────────────
/** Slung upright down the middle of her back, the lens down at her hips (RE5's MGL on Chris's back), its side
 *  to her — its top (the carry handle) to her right, the grip and the fore-grip to her left — over the long guns
 *  there (the chest bone's space: x her left, y up, z ahead): the grip's place (the lamp's axis down her spine),
 *  its turn */
const DB_SLUNG_F = new Vector3(0, -1, 0);
const DB_SLUNG_U = new Vector3(-1, 0, 0);
export const DB_SLUNG = {
  at: new Vector3(DB_AZ, 0, -0.18),
  turn: new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(DB_SLUNG_F, DB_SLUNG_U, new Vector3().crossVectors(DB_SLUNG_F, DB_SLUNG_U)),
  ),
};
/** Drawn by its carry handle round her right side (shared ARMS.daybreak.draw: 0.6), put back the same way */
export const DB_SLING: SlingSpec = {
  flag: "slingDb",
  at: DB_SLUNG.at,
  turn: DB_SLUNG.turn,
  // (by its carry handle: pulled off her back to her right, turning, its lens coming round forward; at her right
  // side carried as a lamp is — level, the lens ahead, the handle up in her hanging hand; lifted level before her
  // right hip, its top rolled a little to her right (rolled further, the handle went out of her reach; level, her
  // wrist went 13–16° past its reach) — and her right on to the walnut grip as it comes up into the low
  // ready, her left meeting the fore-grip (from 0.6 it fell 17–22 cm short of it at her right side, her arm hanging))
  keys: [
    { at: [-0.085, -0.327, -0.439], f: [0, -Math.SQRT1_2, Math.SQRT1_2], u: [-0.704, 0.503, 0.503] },
    { at: [-0.24, -0.775, -0.2], f: [0, 0, 1], u: [0, 1, 0] },
    { at: [-0.2, -0.685, -0.076], f: [0.1, -0.15, 0.98], u: [-0.4, 0.92, 0.1] },
  ],
  draw: 0.6,
  away: 0.5,
  // (from the brace's top over her right shoulder, across her chest to her left hip, round to the lens's collar
  // low on her back — the double-barrel's way, a little out over its strap)
  strap: [
    { bone: "shoulderR", at: [0, 0.1, -0.035] },
    { bone: "shoulderR", at: [0.05, 0.05, 0.1] },
    { bone: "chest", at: [0.05, -0.1, 0.225] },
    { bone: "hips", at: [0.17, 0.07, 0.205] },
    { bone: "hips", at: [0.2, 0.03, 0.04] },
  ],
  ends: [new Vector3(-0.2, DB_AZ - 0.05, 0), new Vector3(0.42, DB_AZ - 0.06, 0)],
  bust: 0.005,
  // (over the sniper over the AK, over the double-barrel: its body this much further out for each there — resting
  // on them where they cross under it)
  over: [
    { flag: "slingSn", out: 0.02 },
    { flag: "slingAk", out: 0.02 },
    { flag: "sling", out: 0.01 },
  ],
  // (alone, its lens on her lower back and its top stood 5 cm off a feminine back and 10 off a masculine one:
  // tilted top in and brought nearer, each body its own — lying 0.2–3.4 cm off her all its length; over the
  // others, resting on them at its top, its foot tilted in a little)
  lean: { alone: [0.1, 0.143], over: [-0.06, -0.12] },
  back: { alone: [0.035, 0.08], over: [0, 0] },
  // (taken off her back by its carry handle — her hand round the bar from outside it, the fingers down and in
  // under it, the index toward the lens — carried by it at her side as a lamp, then on to the walnut grip as it
  // swings up)
  grab: {
    // (her hand from the handle to the grip round the gun's right side: straight, her forearm went 9 cm through the
    // lamp)
    arc: 0.08,
    palm: new Vector3(0.2, DB_AZ + 0.12, 0.012),
    along: new Vector3(0, -1, -0.25).normalize(),
    index: new Vector3(1, 0, 0),
    until: 0.75,
    to: 0.92,
    // (on her back the bar's upright at her right: her hand round it from outside — searched by small turns from
    // the fingers back round it; rolled round it to the lamp's hold by 0.6 of the draw, as it comes level)
    from: {
      palm: new Vector3(0.2, DB_AZ + 0.125, 0),
      along: new Vector3(0.985, 0, 0.17).normalize(),
      index: new Vector3(0.17, 0, -0.985).normalize(),
      by: 0.6,
    },
  },
};

/** The Daybreak as tp/long-hold.ts holds a long gun */
export const DB_LONG: LongSpec = {
  key: "daybreak",
  wrist: DB_GRIP,
  wristShape: DB_GRIP_SHAPE,
  fore: {
    part: null,
    pivot: new Vector3(),
    y: DB_FORE.y,
    x: [DB_FORE.x, DB_FORE.x],
    z: DB_FORE.z,
    // (the mocks': the fingers ahead round its front and across to its right, the index side up under the body —
    // searched by small turns of it, both bodies, carried to aimed: the left wrist within its reach, no finger in
    // the grip or the body)
    along: new Vector3(0.885, 0.042, 0.464).normalize(),
    index: new Vector3(-0.093, 0.992, -0.081).normalize(),
    shape: DB_FORE_SHAPE,
    // (over its top, ahead, under the body's left side)
    thumb: [0.03, 0.035, -0.04],
  },
  torch: { ...DB_TORCH, held: DB_TORCH_HELD, thumb: [0.03, 0.035, -0.04] },
  butt: DB_BUTT,
  // (F1a, the AK's low ready — the mocks': the pad out at the shoulder and 8 cm ahead, 5 under the joint)
  carry: { kind: "ready", pocket: [0.03, -0.05, 0.08], down: 0.45, across: 0.3, run: 0.08 },
  aim: { up: 0.0, trunk: 0.8, bust: 0.0175, lean: 1 },
  // (her right eye on the ring's line: 20 cm over the grip — the pad's drop puts it at her eye with her head
  // nearly upright; cheekTo brings the rest)
  cheek: { y: DB_SIGHT, z: 0 },
  blade: { ready: 0.08, aim: 0.25 },
  protract: 0.1,
  // (the mocks' shove: 1.8 cm back into her shoulder, the lens up ~4° — phase 3 tunes it with the charge)
  kick: { flip: 0.07, back: 0.018, rock: 0.04 },
  // (F3a: charging, leant into it ~4° — at the mocks' 6° and her left shoulder 2 cm further forward on the
  // fore-grip, a masculine left wrist went 6° past its reach aimed high)
  charge: { lean: 0.07, protract: 0 },
  // (shared ARMS.daybreak.aim)
  aimS: 0.3,
  leftCarried: true,
  sling: DB_SLING,
  // (port arms, struck: phase 5)
  avoid: null,
  check: {
    boxes: [
      // (the fore-grip: 4.8 cm front to back under the body, 3 at its foot)
      { c: [0.291, 0.044], h: [0.022, 0.014, 0.014], fore: false },
      { c: [0.29, -0.002], h: [0.016, 0.032, 0.014], fore: false },
      // (the cell under the body, between the guard and the fore-grip — round: two boxes across it)
      { c: [0.175, 0.04], h: [0.075, 0.022, 0.012], fore: false },
      { c: [0.175, 0.04], h: [0.075, 0.012, 0.022], fore: false },
      // (the lamp's body, 11 cm round — two boxes across it, its curve between)
      { c: [0.2, DB_AZ], h: [0.22, 0.055, 0.028], fore: false },
      { c: [0.2, DB_AZ], h: [0.22, 0.028, 0.055], fore: false },
      { c: [0.2, DB_AZ], h: [0.22, 0.045, 0.045], fore: false },
    ],
    rods: [
      // (the brace, down from the spine to its pad: her right forearm by it)
      { a: [-0.16, DB_AZ], b: [-0.28, DB_AZ - 0.11], r: 0.022, fore: false },
      // (the lamp's body, the fins behind it, the lens's cage)
      { a: [-0.02, DB_AZ], b: [0.42, DB_AZ], r: 0.058, fore: false },
      { a: [-0.13, DB_AZ], b: [-0.03, DB_AZ], r: 0.072, fore: false },
      { a: [0.43, DB_AZ], b: [0.53, DB_AZ], r: 0.072, fore: false },
      // (the cell)
      { a: [0.1, 0.04], b: [0.25, 0.04], r: 0.024, fore: false },
    ],
    // (tools/art/guns/guns.py's brace — a strut down to its pad — cast to the lamp's right)
    stock: {
      x: [-0.312, -0.16],
      top: [
        [-0.16, DB_AZ + 0.03],
        [-0.27, DB_AZ - 0.088],
        [-0.292, DB_AZ - 0.1],
        [-0.312, DB_AZ - 0.104],
      ],
      bot: [
        [-0.16, DB_AZ - 0.03],
        [-0.25, DB_AZ - 0.125],
        [-0.292, DB_AZ - 0.18],
        [-0.312, DB_AZ - 0.176],
      ],
      z: 0.027,
      cz: 0.03,
    },
  },
};
