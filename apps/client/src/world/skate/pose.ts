// The skater on the board (docs/plan/103-the-skate.md F11a): procedural on the rig, as the bike's rider — carStep's
// legs solved in three dimensions to the deck (her space: x her left, y up, z ahead). She stands sideways: the
// board's nose to her left (regular) or her right (goofy), her toes to the board's toe side. What makes it read as
// skating (the plan's list): the knees bent, the trunk and the head turned down the board the way it goes, pushing
// with the back foot on the toe side, the crouch before the pop, the knees up in the air, the board turning under
// the feet in a flip and the feet catching it, a hand to the board for a grab, the arms out on a rail.
import { type SkateLook, TRICKS, type TrickDef } from "@yutopia/shared/skate";
import type { CarStep } from "../chars/anim/acts";
import type { BoardMeasures } from "./board3d";

export interface SkaterIn {
  look: SkateLook;
  /** s since the trick (or the mode) began */
  t: number;
  /** her standing hip height */
  stand: number;
  m: BoardMeasures;
  speed: number;
  /** the clock (s) */
  time: number;
}

/** What the pose puts where: her legs' step, the board's turn (rad, its own frame) and lift, her hands' targets (her
 *  space; none: loose), how far the whole of her is tipped back (rad, a manual's) and shifted (her x). */
export interface SkaterOut {
  step: CarStep;
  board: { roll: number; yaw: number; pitch: number; up: number };
  hands: { L?: [number, number, number]; R?: [number, number, number] };
  shift: number;
}

const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** In over the first 25 %, out over the last 25 %. */
const env = (k: number) => ease(k / 0.25) * (1 - ease((k - 0.75) / 0.25));

export function skaterPose(i: SkaterIn): SkaterOut {
  const { look, m } = i;
  const st = look.stance;
  // a board point in her space (the board's x to her left for a regular rider)
  const her = (p: [number, number, number], dy = 0): [number, number, number] => [p[0] * st, p[1] + dy, p[2] * st];
  const P = m.points;
  const front = her(P.foot_f ?? [0.19, m.deckY, 0]);
  const back = her(P.foot_r ?? [-0.3, m.deckY, 0]);
  // feet[0] is her left: the front foot for a regular rider
  const feet: [[number, number, number], [number, number, number]] =
    st > 0 ? [[...front], [...back]] : [[...back], [...front]];
  const fi = st > 0 ? 0 : 1;
  const bi = 1 - fi;
  // (the front foot angled down the board a little, the back across it)
  const heading: [number, number] = [0, 0];
  heading[fi] = 0.45 * st;
  heading[bi] = -0.1 * st;
  const toe: [number, number] = [0.02, 0.02];
  let hipY = i.stand - 0.14 - (look.crouch ? 0.2 : 0);
  let duck = 0.22 + (look.crouch ? 0.22 : 0);
  // (down the board the way it goes: the nose's way, or the tail's going fakie)
  const way = look.fakie ? -st : st;
  let twist = 0.32 * way;
  let lookH = 0.95 * way;
  let side = -look.lean * 0.07;
  const board = { roll: 0, yaw: 0, pitch: 0, up: 0 };
  const hands: SkaterOut["hands"] = {};
  let shift = 0;
  const knee = (out: number): [number, number, number] => [out * 0.25, 0.25, 1];
  const knees: [[number, number, number], [number, number, number]] = [knee(1), knee(-1)];
  // the arms: loose, out a little for the balance
  const loose = () => {
    hands.L = [0.42, i.stand + 0.05 + 0.03 * Math.sin(i.time * 1.7), 0.12];
    hands.R = [-0.42, i.stand + 0.02 + 0.03 * Math.sin(i.time * 1.3 + 1), 0.08];
  };
  loose();

  const id = look.trick;
  const def = id ? (TRICKS[id] as TrickDef) : null;
  switch (look.mode) {
    case "roll":
      if (look.push) {
        // pushing: the front foot turned down the board, the trunk with it, the back foot down on the toe side,
        // swept back along the ground and lifted forward again
        const ph = (i.time / 0.75) % 1;
        const down = ph < 0.55;
        const k = down ? ph / 0.55 : (ph - 0.55) / 0.45;
        const along = down ? 0.12 - 0.5 * k : -0.38 + 0.5 * k;
        feet[bi] = [along * way, down ? -m.deckY + 0.005 : -m.deckY + 0.04 + 0.08 * Math.sin(k * Math.PI), 0.2];
        heading[fi] = 1.25 * st;
        heading[bi] = 1.25 * st;
        twist = 0.95 * way;
        lookH = 1.25 * way;
        hipY = i.stand - 0.1 - m.deckY * 0.5;
        duck = 0.3;
        knees[bi] = [0, 0.2, 1];
      }
      break;
    case "manual": {
      // on two wheels: the board's nose up (a nose manual, down), the weight over the end that's down
      const nose = id === "nosemanual";
      board.pitch = nose ? -0.2 : 0.2;
      shift = (nose ? 0.09 : -0.09) * st;
      hipY = i.stand - 0.2;
      duck = 0.28;
      break;
    }
    case "air": {
      // the knees up to the board
      hipY = i.stand - 0.3;
      duck = 0.38;
      if (def?.kind === "flip") {
        // the board turned under the feet (kicked by the toe or the heel), the feet off it and caught again
        const len = def.len * (look.double ? 1.6 : 1);
        const k = Math.min(1, i.t / Math.max(0.1, len));
        const e = ease(k);
        const n = look.double ? 2 : 1;
        board.roll = (def.roll ?? 0) * n * 2 * Math.PI * e * st;
        board.yaw = (def.yaw ?? 0) * 2 * Math.PI * e;
        board.pitch = (def.pitch ?? 0) * 2 * Math.PI * e;
        board.up = 0.06 * env(k);
        const lift = 0.16 * env(k);
        feet[0][1] += lift;
        feet[1][1] += lift;
        feet[0][0] += 0.05 * env(k);
        feet[1][0] -= 0.05 * env(k);
      } else if (def?.kind === "grab") {
        // tucked, the board pulled up to the hand that has it
        const k = ease(i.t / Math.max(0.08, def.len));
        hipY = i.stand - 0.38;
        duck = 0.5;
        board.up = 0.1 * k;
        feet[0][1] += 0.1 * k;
        feet[1][1] += 0.1 * k;
        const pt = (name: string) => her((P[name] ?? [0, m.deckY, 0]) as [number, number, number], 0.1 * k);
        // the front hand is her left for a regular rider
        const F: "L" | "R" = st > 0 ? "L" : "R";
        const B: "L" | "R" = st > 0 ? "R" : "L";
        const grab = (S: "L" | "R", at: [number, number, number]) => {
          hands[S] = at;
        };
        switch (id) {
          case "indy":
            grab(B, pt("grab_toe"));
            break;
          case "melon":
            grab(F, pt("grab_heel"));
            break;
          case "nosegrab":
            grab(F, pt("grab_nose"));
            board.pitch = 0.25 * k;
            break;
          case "tailgrab":
            grab(B, pt("grab_tail"));
            board.pitch = -0.25 * k;
            break;
          case "japan":
            grab(F, pt("grab_toe_f"));
            board.roll = -0.35 * k * st;
            feet[fi][1] += 0.12 * k;
            break;
          case "method":
            grab(F, pt("grab_heel"));
            // (the board pulled up behind her, the knees bent back)
            board.roll = 0.6 * k * st;
            board.up += 0.12 * k;
            feet[0][2] -= 0.15 * k;
            feet[1][2] -= 0.15 * k;
            twist += 0.3 * st * k;
            break;
          case "stalefish":
            grab(B, pt("grab_heel_r"));
            board.roll = 0.25 * k * st;
            break;
          case "airwalk":
            grab(F, pt("grab_nose"));
            // (the legs walked out off the board: the front one ahead, the back one behind)
            feet[fi][2] += 0.3 * k;
            feet[fi][1] += 0.1 * k;
            feet[bi][2] -= 0.3 * k;
            board.yaw = 0.3 * k;
            break;
        }
      }
      break;
    }
    case "grind": {
      // on the rail: the arms out, low, the board by the grind
      hipY = i.stand - 0.22;
      duck = 0.3;
      hands.L = [0.65, i.stand + 0.12, 0.1];
      hands.R = [-0.65, i.stand + 0.1, 0.05];
      side += 0.04 * Math.sin(i.time * 2.2);
      const s = st;
      switch (id) {
        case "nosegrind":
          board.pitch = -0.18;
          shift = 0.08 * s;
          break;
        case "fiveo":
          board.pitch = 0.18;
          shift = -0.08 * s;
          break;
        case "crooked":
          board.pitch = -0.16;
          board.yaw = 0.3;
          board.roll = 0.2 * s;
          break;
        case "smith":
          board.pitch = 0.12;
          board.roll = 0.35 * s;
          break;
        case "feeble":
          board.pitch = 0.12;
          board.roll = -0.35 * s;
          break;
        case "noseslide":
          board.yaw = 0.9;
          board.pitch = -0.12;
          break;
        case "tailslide":
        case "bluntslide":
          board.yaw = -0.9;
          board.pitch = id === "bluntslide" ? 0.45 : 0.12;
          break;
        case "lipslide":
        case "boardslide":
          hipY = i.stand - 0.18;
          lookH = 0;
          twist = 0;
          break;
      }
      break;
    }
    case "lip": {
      hipY = i.stand - 0.25;
      duck = 0.35;
      if (id === "rocktofakie") board.pitch = -0.35;
      else if (id === "nosestall") board.pitch = -0.4;
      else if (id === "handplant") {
        // (one hand down on the coping, the board held up with the other)
        hands.R = [0, 0, 0.35];
        hands.L = her((P.grab_heel ?? [0, m.deckY, -0.1]) as [number, number, number], 0.2);
        board.up = 0.25;
        hipY = i.stand - 0.05;
        duck = 0.8;
      }
      break;
    }
    case "wall":
      // the board on its side against the wall (the wall's side: her ahead or behind, the step's), leant to it
      board.roll = 1.2 * st;
      hipY = i.stand - 0.25;
      duck = 0.3;
      break;
  }
  return {
    step: { hipY, feet, toe, duck, side, knee: knees, heading, twist, look: lookH },
    board,
    hands,
    shift,
  };
}
