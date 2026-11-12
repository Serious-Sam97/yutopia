// Plan 81 — the double-barrel held as a person holds one (docs/plan/81-the-shotgun.md), on plan 80's
// machinery (tp/revolver-hold.ts, chars/model.ts gripTo): the gun the anchor, placed by its butt in the right
// shoulder's pocket — at the low ready (F1a: the muzzle ~35° down) or aimed (F2a: the butt's heel up at the
// top of the shoulder, the comb to the cheek); the right hand on the stock's wrist by a frame of its own (the
// gun held fixed in the fist, never turned in it); the left palm up under the fore-end, its fingers round its
// side, as far out as the arm reaches. The numbers the phase 0 mocks' (tools/art/guns/mock81.py, signed off
// 2026-11-12) — in the gun's own frame here (x along the barrels, y its top, z its right; m).
import { Matrix4, Quaternion, Vector3 } from "three";
import type { HeldShape } from "../chars/props";
import type { LongSpec } from "./long-hold";
import { gunQuat } from "./revolver-hold";

/** The right hand on the stock's wrist: its palm's middle (its skin on the wrist's right side), the fingers'
 *  way (forward and down round the wrist's front), its index side (forward and up) */
export const SG_WRIST = {
  palm: new Vector3(-0.046, -0.022, 0.012),
  // (the knuckles nearly along the gun, ~22° down: a shotgun's wrist is shallow — the mocks' 40°, a pistol
  // grip's, left the wrist bent 80° sideways)
  along: new Vector3(0.92, -0.38, -0.1).normalize(),
  index: new Vector3(0.3, 1, 0).normalize(),
};
/** …what its fingers close round: the stock's wrist, round, its axis across the fingers' way (back and down,
 *  ~50°) */
export const SG_WRIST_SHAPE = {
  at: new Vector3(-0.045, -0.02, 0),
  axis: new Vector3(0.55, 0.83, 0).normalize(),
  shape: { round: true as const, r: 0.019, y0: 0, hy: 0.035 },
};
/** The left hand palm up under the fore-end (its palm's middle 9 mm inside its underside — its skin on it, the
 *  knuckles at its right edge — the fingers round its right side, the thumb ahead along its left: `x` along
 *  the gun, from the fore-end's back end (`FORE_X[0]`, by the hinge) out to `FORE_X[1]` — as far out as the
 *  arm reaches */
export const SG_FORE = {
  y: 0.035,
  along: new Vector3(0.45, 0, 0.85).normalize(),
  index: new Vector3(1, 0, 0),
};
export const FORE_X: [number, number] = [0.16, 0.33];
/** …what its fingers close round: the fore-end, a box along the barrels (its own y; its x down, its z across
 *  — turned so by Y onto the gun's X), 3.4 cm tall and 5.4 wide, its middle this high (round, its middle
 *  that high, the palm under it was inside it) */
export const SG_FORE_SHAPE = {
  y: 0.043,
  shape: { round: false as const, half: [0.017, 0.07, 0.027] as [number, number, number], cz: 0 },
};
/** (F3a) The torch held under the fore-end in the same left fist, along the barrels, its lens ahead (the
 *  barrels' frame): its axis this high — its body 6 mm under the fore-end's underside, its head clear of it
 *  where the fore-end rises at its front — its middle this far ahead of the palm's (its knurled grip in the
 *  fist); the palm's middle under it, 9 mm inside its underside, as under the fore-end */
export const SG_TORCH = { y: 0.004, ahead: 0.07, palm: 0.004 - 0.016 + 0.009 };
/** …what the left fingers close round then: the fore-end's box and the torch's body under it (the box's own
 *  frame: x down, y along the barrels) */
export const SG_TORCH_HELD: HeldShape = {
  parts: [SG_FORE_SHAPE.shape, { round: true, r: 0.016, y0: 0.012, hy: 0.04, x0: SG_FORE_SHAPE.y - SG_TORCH.y }],
};
/** The butt pad's middle (its frame) */
export const SG_BUTT = new Vector3(-0.392, -0.035, 0);
/** The barrels' hinge (their group's pivot — the fore-end's on them, it drops with them) */
export const SG_HINGE = new Vector3(0.144, 0.033, 0);
/** Carried, not aimed — at her side (the user's ask, 2026-11-12: the low ready across her front had her
 *  shoulders side-on for her left hand to reach the fore-end, "just put it at her side, then the arm needn't
 *  stretch"): in her right hand alone by the stock's wrist, down along her right side, the muzzle ahead and
 *  down, the stock back past her hip; her shoulders square, her left hand free (on the gun only aimed,
 *  reloading, or pulled in across her chest). Her frame from her shoulders' middle (x her left, y up, z
 *  ahead; m): the grip, the barrels' way, its top's; running, the muzzle this much steeper (rad) */
export const SG_CARRY = {
  at: [-0.23, -0.51, 0.13] as [number, number, number],
  f: [0.05, -0.32, 0.95] as [number, number, number],
  u: [0, 1, 0] as [number, number, number],
  run: 0.15,
};
/** …her trunk turned this far right of the gun's way carried (the aim's is SG_BLADE): square */
export const SG_READY = { blade: 0 };
/** Aimed (F2a): the butt's heel at the top of the shoulder — the pocket this far up (m, the mocks' man's);
 *  the trunk bent with the aim's pitch this much of it (the rest the aim pose's own); on a fuller chest the
 *  pocket this much further ahead (the butt's toe went into it) */
export const SG_AIM = { up: 0.05, trunk: 0.8, bust: 0.0175 };
/** A shot's kick, aimed (the 12-gauge's, at its height — shared arms' gunFx.kick, 0..1): the muzzle up this
 *  far about the butt (rad), the gun back into the shoulder this far (m), her trunk rocked back this far
 *  (rad) — the butt in the pocket throughout */
export const SG_KICK = { flip: 0.22, back: 0.035, rock: 0.1 };
/** Her left shoulder brought forward this far holding it (m — the shoulder blade round her ribs as she reaches:
 *  squared to the gun, her left hand fell short of the fore-end; turning her trunk further had her shoulders
 *  side-on, 2026-11-12's second feedback) */
export const SG_PROTRACT = 0.065;
/** Her trunk turned this far right of the gun's way, aimed (rad; square, her left arm couldn't reach the
 *  fore-end — 16 cm short; at the mocks' 0.5 her left hand only got to the fore-end's back end, under the
 *  action — curled under it, it looked folded away, the wood showing through it: 2026-11-12's feedback) */
export const SG_BLADE = 0.5;

/** (the shared ARMS.shotgun.aim, s) up from the carry to the aim */
export const SG_AIM_S = 0.26;

/** The double-barrel as tp/long-hold.ts holds a long gun */
export const SG_LONG: LongSpec = {
  key: "shotgun",
  wrist: SG_WRIST,
  wristShape: SG_WRIST_SHAPE,
  fore: {
    part: "barrels",
    pivot: SG_HINGE,
    y: SG_FORE.y,
    x: FORE_X,
    along: SG_FORE.along,
    index: SG_FORE.index,
    shape: SG_FORE_SHAPE,
    // (laid along the fore-end's left side, ahead — closed round the box it went into it)
    thumb: [0.09, 0.036, -0.037],
  },
  torch: { ...SG_TORCH, held: SG_TORCH_HELD, thumb: [0.075, SG_TORCH.y + 0.004, -0.02] },
  butt: SG_BUTT,
  carry: { kind: "side", ...SG_CARRY },
  aim: SG_AIM,
  blade: { ready: SG_READY.blade, aim: SG_BLADE },
  protract: SG_PROTRACT,
  kick: SG_KICK,
  aimS: SG_AIM_S,
  leftCarried: false,
  avoid: { a: [-0.37, -0.03], b: [-0.12, -0.005], r: 0.045 },
  check: {
    // (the fore-end a box on the barrels: 0.16–0.42 along, 3.4 cm tall round 0.043, 5.4 wide)
    boxes: [{ c: [0.29, 0.043], h: [0.13, 0.017, 0.027], fore: true }],
    // (the stock; the barrels past the fore-end)
    rods: [
      { a: [-0.02, -0.01], b: [-0.38, -0.03], r: 0.022, fore: false },
      { a: [0.43, 0.055], b: [0.85, 0.066], r: 0.02, fore: true },
    ],
    // (tools/art/guns/guns.py's stock)
    stock: {
      x: [-0.395, -0.1],
      top: [
        [-0.09, 0.064],
        [-0.365, 0.036],
      ],
      bot: [
        [-0.14, -0.042],
        [-0.37, -0.1],
      ],
      z: 0.016,
    },
  },
};

// ── slung, drawn, put away (plan 81 phase 2, F6a) ──────────────────────────────────────────────────────
/** (shared ARMS.shotgun.draw) off her back and over the right shoulder, s; put back, s */
export const SG_DRAW_S = 0.6;
export const SG_AWAY_S = 0.5;
/** Slung on her back (the chest bone's space: x her left, y up, z ahead): the stock up behind her right
 *  shoulder — its butt about the shoulder's height, not over it (there it filled the game's camera beside her
 *  head) — the barrels down to her left hip, its right side to her back — its grip point there, its turn */
export const SLUNG_AT = new Vector3(-0.12, -0.07, -0.095);
export const SLUNG_TURN = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0.62, -0.78, 0), new Vector3(0.78, 0.62, 0), new Vector3(0, 0, 1)),
);
/** The draw's keys between the back and the hold (her frame from her shoulders' middle: x left, y up, z ahead;
 *  the barrels' way): lifted by the stock over the right shoulder (the barrels hanging behind her), over it
 *  (the barrels back), before her chest (the barrels up) — each under half a turn from the next, so the
 *  slerp goes the way a person swings it */
export const DRAW_KEYS: { at: [number, number, number]; f: [number, number, number] }[] = [
  { at: [-0.16, 0.16, -0.06], f: [0.2, -0.9, -0.35] },
  { at: [-0.17, 0.12, 0.12], f: [0, 0.2, -0.98] },
  { at: [-0.1, -0.1, 0.22], f: [0, 0.9, 0.4] },
];
/** The strap's way over her (the slung gun's swivel → over the right shoulder → across the chest → the left
 *  hip → round to the barrels): each point a bone's and an offset in her frame (x left, y up, z ahead; m) —
 *  out on her front (a fuller chest: STRAP_BUST more) */
export const STRAP: { bone: "shoulderR" | "chest" | "hips"; at: [number, number, number] }[] = [
  { bone: "shoulderR", at: [0, 0.09, -0.03] },
  { bone: "shoulderR", at: [0.05, 0.04, 0.09] },
  { bone: "chest", at: [0.05, -0.1, 0.21] },
  { bone: "hips", at: [0.17, 0.07, 0.19] },
  { bone: "hips", at: [0.2, 0.03, 0.03] },
];
/** (the gun's frame) where the strap meets it: the stock's swivel, and on the barrels toward the muzzle */
export const STRAP_ENDS = { swivel: new Vector3(-0.26, -0.09, 0), barrels: new Vector3(0.45, 0.03, 0) };
/** (on a feminine body the chest's point this much further out) */
export const STRAP_BUST = 0.005;

// ── the reload (plan 81 phase 4: F4b, F5a) ───────────────────────────────────────────────────────────
// One timeline, s from the server's step opening it (Player.arm ARM.open — its closing ARM.shut: everyone
// sees both), in time with shared ARMS.shotgun (open 0.45, a shell 0.75, shut 0.35):
//   0–0.45     the gun down under the right arm (the stock along the forearm, against the ribs), the right thumb
//              across the top lever, the left hand drops the barrels — the fired shells kicked out (0.36)
//   0.45–1.95  a shell at a time: the right hand off the wrist down to the carrier on the right hip, a shell
//              drawn up by its brass, into the left chamber and pushed home (the server counts it at the
//              step's end); the next into the right
//   1.95–2.3   the right hand back on the wrist lifts the stock up to the barrels the left holds — shut — and
//              up to the ready
// A shot while it's open (the server snaps it shut) or the steps ending early: on from the closing.
export const SG_LOAD = { open: 0.45, shell: 0.75, shut: 0.35 };
export const SG_LOAD_CLOSE = SG_LOAD.open + 2 * SG_LOAD.shell;
export const SG_LOAD_LEN = SG_LOAD_CLOSE + SG_LOAD.shut;
/** The gun held for loading (her frame from her shoulders' middle: x her left, y up, z ahead): its grip
 *  before her belly, its barrels' way (ahead, down, left — the stock back along her right side at the waist,
 *  between her arm and her ribs: the mocks' steeper way had its butt up through her chest to the armpit), its
 *  top (rolled a little right) */
export const SG_LOAD_GUN = {
  at: [-0.1, -0.3, 0.22] as [number, number, number],
  f: [0.35, -0.3, 0.89] as [number, number, number],
  u: [-0.45, 1, 0] as [number, number, number],
};
/** Her trunk turned this far right while loading (the mocks' — the hold's is SG_BLADE) */
export const SG_LOAD_BLADE = 0.3;
/** The gun's legs: the hold → down for loading → the hold (s) */
export const SG_LOAD_GUN_LEGS: [string, string, number, number][] = [
  ["hold", "load", 0, 0.3],
  ["load", "load", 0.3, 2.1],
  ["load", "hold", 2.1, SG_LOAD_LEN],
];
/** The right hand's legs: the stock's wrist (its thumb on the lever, opening it), each shell's loop on the
 *  carrier, the chamber's mouth (the shell half in), pushed home — the left chamber, then the right */
export const SG_LOAD_RIGHT: [string, string, number, number][] = (() => {
  const legs: [string, string, number, number][] = [["grip", "grip", 0, SG_LOAD.open]];
  for (const i of [0, 1]) {
    const s = SG_LOAD.open + i * SG_LOAD.shell;
    const e = SG_LOAD.shell;
    legs.push(
      [i ? "home0" : "grip", `loop${i}`, s, s + 0.26 * e],
      [`loop${i}`, `loop${i}`, s + 0.26 * e, s + 0.36 * e],
      [`loop${i}`, `mouth${i}`, s + 0.36 * e, s + 0.78 * e],
      [`mouth${i}`, `home${i}`, s + 0.78 * e, s + e],
    );
  }
  legs.push(
    ["home1", "grip", SG_LOAD_CLOSE, SG_LOAD_CLOSE + 0.14],
    ["grip", "grip", SG_LOAD_CLOSE + 0.14, SG_LOAD_LEN],
  );
  return legs;
})();
const smooth = (a: number, b: number, t: number) => {
  const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return c * c * (3 - 2 * c);
};
/** The gun's moving parts and the hands' at `t`: the barrels dropped (0..1 — lifted shut by the stock from
 *  SG_LOAD_CLOSE), the shells out of it yet, how many pushed home since, the shell in the right hand (its
 *  chamber, −1: none), how many drawn from the carrier */
export function sgLoadAt(t: number) {
  const s0 = SG_LOAD.open;
  const e = SG_LOAD.shell;
  const home = (t >= s0 + e ? 1 : 0) + (t >= s0 + 2 * e ? 1 : 0);
  const inHand = t >= s0 + 0.32 * e && t < s0 + e ? 0 : t >= s0 + e + 0.32 * e && t < s0 + 2 * e ? 1 : -1;
  return {
    open: smooth(0.16, 0.4, t) * (1 - smooth(SG_LOAD_CLOSE + 0.06, SG_LOAD_CLOSE + 0.22, t)),
    ejected: t >= 0.36,
    home,
    inHand,
    drawn: (t >= s0 + 0.32 * e ? 1 : 0) + (t >= s0 + e + 0.32 * e ? 1 : 0),
    /** the right thumb across the top lever (0..1) */
    lever: smooth(0.04, 0.14, t) * (1 - smooth(0.34, 0.44, t)),
  };
}
/** (the gun's frame) A chamber's mouth — the barrels' breech face (0 the left, 1 the right) */
export const CHAMBER = (i: number, out: Vector3) => out.set(0.142, 0.066, i === 0 ? -0.0118 : 0.0118);
/** The shell (guns3d shellGeometry: +x its hull's way, its rim 1 cm behind its origin) at a chamber's mouth,
 *  half in: its origin this far behind the mouth; pushed home, this far in */
export const SHELL_MOUTH = { out: 0.024, home: -0.0094 };
/** The right hand pushing it — the shell pinched by its brass in the fingertips and the thumb, its hull out
 *  ahead of them: the palm's middle this far behind the shell's rim, along the bore */
export const SHELL_PALM = 0.055;
/** (the gun's frame) The top lever, where the right thumb goes across it */
export const LEVER_THUMB = new Vector3(0.0, 0.083, 0.012);

/** The shell carrier on the belt at her right hip's side (F5a; the hips' own space: x her left, y up, z
 *  ahead): its strip's middle, its turn (its x along the belt toward her front, its y up, its z out from
 *  her), four shells upright in its loops, their brass up — the hand takes the front two */
export const CARRIER = {
  at: new Vector3(-0.19, -0.04, 0.11),
  turn: new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      new Vector3(0.3, 0, 0.95).normalize(),
      new Vector3(0, 1, 0),
      new Vector3(-0.95, 0, 0.3).normalize(),
    ),
  ),
  loops: [-0.03, -0.01, 0.01, 0.03],
  /** the shells' axis out from the strip; their origin's height (their rim 1 cm over it) */
  out: 0.0166,
  y: 0.022,
  take: [3, 2],
};

// ── everything else (plan 81 phase 5) ─────────────────────────────────────────────────────────────────
/** In a whole-body move — a roll, a vault, a slide, Flowmotion — or struck: the gun pulled in across her chest
 *  (port arms), both hands on, in her chest's own frame (x her left, y up, z ahead) so it goes round with her:
 *  the right hand on the stock's wrist by her right hip's front, the barrels up past her left shoulder, its
 *  top out ahead — a long gun let go of in one hand swung through her legs, the floor, her face */
export const SG_PORT = {
  at: new Vector3(-0.08, -0.24, 0.3),
  turn: gunQuat(
    new Vector3(0.45, 0.82, 0.36).normalize(),
    new Vector3(0, 0, -1).addScaledVector(
      new Vector3(0.45, 0.82, 0.36).normalize(),
      0.36 / Math.hypot(0.45, 0.82, 0.36),
    ),
    new Quaternion(),
  ),
};
