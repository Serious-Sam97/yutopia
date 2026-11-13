// Plan 84 — the Daybreak held as a person holds one (docs/plan/84-the-daybreak.md), on plan 81's long-gun hold
// (tp/long-hold.ts), as the AK and the sniper are (plans 82–83): the gun the anchor; the right hand round the walnut
// pistol grip by a frame of its own, the web high on its back; the left hand round the leather VERTICAL fore-grip
// (thumb-break: the palm on its left side, the fingers round its front, the index up under the lamp's body, the
// thumb over its top); carried at the AK's low ready in both hands (F1a), the brace's pad at the shoulder's front,
// the lens down and across to her left; aimed with the pad in the pocket, her head nearly upright behind the high
// ring sight, her right eye on its line (F2a). The numbers the phase 0 mocks' (tools/art/guns/mock84.py, signed
// off 2026-11-13 — Blender's x, y, z → the game's x, z, −y), in the gun's own frame here (x along the lamp, y its
// top, z its right; m; its origin the grip point at the walnut grip's top — tools/art/guns/guns.py daybreak()).
import { Vector3 } from "three";
import type { HeldShape } from "../chars/props";
import type { LongSpec } from "./long-hold";

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
  // (shared ARMS.daybreak.aim)
  aimS: 0.3,
  leftCarried: true,
  // (put away, drawn: phase 2; port arms, struck: phase 5)
  sling: null,
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
