import type { AvatarLayers, JumpNow } from "@yutopia/shared";
import type { FlowLook } from "@yutopia/shared/move";
import type { PetView } from "../petview";

// Who's drawn, as the view gives each person to be drawn (tp/person3d.ts; the stand-ins, stand3d.ts):
// where, how they're turned and what they're doing.

export interface Keys {
  x: number;
  y: number;
  h: number;
  /** (a piano's) how far apart the hands go along them, m */
  spread?: number;
}

export interface PersonIn {
  name: string;
  avatar: AvatarLayers;
  x: number;
  y: number;
  angle: number; // facing, world radians (atan2 of the world direction)
  a: number; // 0 idle, 1 walk, 2 sit
  npc?: boolean; // Vortex
  vortexMood?: string;
  vortexSit?: number; // (plan 70) sat in a chair: its seat's top, m
  pet?: PetView; // a pet (world/petview.ts): drawn as a model by the view, not here
  status?: string; // available / away / dnd…
  speaking?: boolean;
  emote?: string;
  held?: string; // what they carry (shared/held.ts), since heldAt (server ms)
  heldAt?: number;
  busy?: string; // using something (the arcade, the piano…)
  act?: string; // with someone (shared SOCIAL, or "take"), since actAt
  actAt?: number;
  typing?: boolean; // seated at a desk with a keyboard
  keys?: Keys; // (plan 62) the keys they type on: its middle on the floor, its top's height
  parts?: Keys[]; // (plan 62) the parts of what they're busy at their hands go to (a button, a tap…)
  cue?: { tip: [number, number, number]; butt: [number, number, number] }; // (plan 62) their pool shot's cue
  reduced?: boolean; // reduced motion
  seat?: string; // what they sit on (catalog kind), when `a` is 2
  // the phone (shared/phone.ts): in the hand, its case, a photo pose, ringing
  phone?: string;
  bud?: boolean; // on a call, the phone put away: an earbud in the right ear
  phoneCase?: string;
  phonePose?: string;
  ringing?: boolean;
  recording?: boolean;
  torch?: boolean; // the phone's flashlight on
  focused?: boolean; // …focused: narrow and far (docs/plan/30-the-dark.md D4)
  gun?: string; // the weapon in the hand (D6): "revolver", "shotgun", "ak47" (plan 79)
  arm?: number; // …what the hand's doing with it (shared ARM: drawing, reloading, broken open)
  down?: "down" | "kneel"; // down, crawling; kneeling by someone down (D7: world/dark says)
  fell?: number; // knocked down by a pool ball: s since (tp/view.ts times it from when it's seen)
  fellAt?: number; // …the server's, since when (0: on their feet), and the way the ball went
  fellYaw?: number;
  /** (plan 58 7) struck: s since (the view times it from when it's seen) and where it came from (the
   *  floor's radians) */
  hit?: { t: number; yaw: number };
  /** (plan 58 9) the warmth and the stamina (0..100), and a sound heard (s since, from where; loud: close) */
  hp?: number;
  wm?: number;
  st?: number;
  heard?: { t: number; x: number; y: number; loud: boolean };
  pinned?: boolean; // held down by a dog (docs/plan/52-the-pet-two.md D8): lying, not getting up
  jump?: JumpNow; // jumping (shared/jump.ts): its stage
  z?: number; // feet off the floor (up on something, in a jump), tiles
  ground?: number; // the top under them, tiles
  swim?: number; // in the water (docs/plan/66-the-water.md): 0 out, 1 wading, 2 afloat, 3 under
  overWater?: boolean; // over water deep enough to catch a fall: no ragdoll into it
  waterOver?: number; // wading: the water this far up over the feet (m)
  mv?: number; // the gait, crouching, aiming (shared/move packMv)
  // a vault, a mantle, a roll, a slide: how far in (`at`: since when, performance.now ms)
  verb?: { kind: string; t: number; at?: number };
  // a Flowmotion move (docs/plan/56-the-controls.md F): mine as it is (shared move FlowLook), or
  // someone's by its byte (move/flow.ts flowCode) and since when it shows (performance.now ms)
  flow?: FlowLook | null;
  flowCode?: number;
  flowAt?: number;
  pitch?: number; // aiming: up from level (radians)
  // one of the shadowed (docs/plan/30-the-dark.md D5; world/dark gives them): its upper body's
  // pose and how far in (s), its own twitches, how wrapped in the dark it is (0 bare … 1),
  // and its state (shared dark/fsm.ts) for the shroud
  shade?: {
    pose: "lurch" | "windup" | "strike" | "recoil" | "exposed" | "lurk";
    t: number;
    seed: number;
    dark: number;
    state: string;
    since: number; // (performance.now ms)
    burn?: { x: number; y: number } | null; // a focused beam on it, from there
    fade?: number; // 0..1: coming into range, going out of it (world/dark/shades.ts)
    killed?: boolean; // shot down: its dissolve is its death (SHADE.dying long)
  };
}
