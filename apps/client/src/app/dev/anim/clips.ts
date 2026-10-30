import { Grid, type JumpKind, jumpArc, jumpNowAt, jumpTimes } from "@yutopia/shared";
import {
  type FlowLook,
  KH_FEEL,
  KH_MOVE,
  type MoveEnv,
  type MoveInput,
  NO_INPUT,
  newBody,
  stepBody,
} from "@yutopia/shared/move";
import type { PhysicsWorld } from "@yutopia/shared/physics";
import { box3, type SolidBox3 } from "@yutopia/shared/shapes";
import type { LocoIn, Locomotion, MotionIn, Moved } from "@/world/chars";
import type { Reach } from "@/world/chars/model";

// /dev/anim's clips (docs/plan/58-the-animation.md, phase 2): every animation by name, two ways —
// `raw`, the keyed pose at a moment (what's keyed, nothing laid on), and `live`, a scripted run
// driven through Locomotion as the game drives it (momentum's springs, follow-through, the gaze).
// Each has a "before" to compare: the old keys, or plan 58 off. A clip is worked out once into a
// table of frames (`tabulate`), so scrubbing, onion skins, pops and the feet's slide all read it.

type Chars = typeof import("@/world/chars");
type Hero = NonNullable<ReturnType<Chars["heroNow"]>>;
export interface Ctx {
  C: Chars;
  H: Hero;
  /** the mood: 0 day … 1 the dark */
  T: number;
  /** the walk's style (plan 58 4e) */
  gait?: string;
}
/** Where the body is, in the scene (three's: it faces +z at yaw 0, its left +x), and turned (rad,
 *  + to its left: three's rotation.y). */
export interface Root {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
/** A scripted moment for a live clip: how fast, how it turns, a jump or a slide begun at a time. */
export interface Drive {
  speed: number;
  turn?: number;
  jump?: { kind: JumpKind; at: number };
  slide?: number;
  /** (5c) a Flowmotion move as it's drawn, and her feet held this high and this far on (m) */
  flow?: { kind: FlowLook["kind"]; t: number; side: number; speed: number };
  rise?: number;
  fwd?: number;
  /** (7) the dark's: the torch on, aiming (with the gun), reloading, a shot's kick, the look (off her
   *  facing: + left, + up), struck or startled */
  torch?: boolean;
  aim?: boolean;
  gun?: boolean;
  reload?: boolean;
  kick?: number;
  yaw?: number;
  pitch?: number;
  hit?: { from: number; t: number; k: number } | null;
  /** (9) how cold, how spent (0..1), a sound heard */
  cold?: number;
  spent?: number;
  heard?: { yaw: number; pitch: number; t: number; loud?: boolean } | null;
}
export interface Clip {
  name: string;
  group: string;
  /** seconds shown (a whole number of cycles, so the loop joins) */
  len: number;
  /** (7) the mood the clip's at, whatever the slider says (the dark's clips: 1) */
  mood?: number;
  /** (9) her walk's style for this clip, whatever the page says */
  gait?: string;
  raw?: {
    after: (x: Ctx, t: number) => Moved & { hands?: Frame["hands"] };
    before?: (x: Ctx, t: number) => Moved;
    root?: (t: number) => Root;
  };
  live?: (t: number) => Drive;
  /** (4c) driven by the move core itself under these keys (`x`, `y`: the way, in the body's own
   *  frame at the start — y ahead, x to its right), as the game moves the body: starts, stops,
   *  turning back */
  keys?: (t: number) => Partial<MoveInput>;
  /** (4d) how hurt she is (0…1): a limp */
  hurt?: number;
  /** (4f) the ground's height at (x, z) in the scene (three's: z the way she sets off): a ramp,
   *  stairs; else flat */
  ground?: (x: number, z: number) => number;
  /** (5a) the core walks on this ground itself (a ledge to run off): `ground`'s heights are the
   *  floor's, a tile at a time, and her height is the core's own */
  coreGround?: boolean;
  /** (5b) …and what's raised is a block in the way (its tiles not walked through: a wall, a crate),
   *  not a floor to walk off */
  blocks?: boolean;
  /** (5c) a pole stood at (x, z), swung round */
  pole?: [number, number];
  /** (6) driven through Motion3 (the everyday: sitting, the hands, busy, together, the emotes) by
   *  these inputs at `t` s */
  motion?: (t: number) => Partial<MotionIn>;
  /** (6) things drawn: a seat, a desk, a board */
  props?: SolidBox3[];
  /** (6d) the other one, facing her this far ahead (m), doing this — shown as the "before" */
  pair?: { d: number; act: string };
  /** (5d) gone limp on Jolt's ragdoll: at `at` s, or on landing from `drop` m or more; a blow to a
   *  part (RagdollRig's: 2 the chest) and the whole body sent at `vel` by it; what's solid besides the land (the ledge she came off) */
  rag?: {
    at?: number;
    drop?: number;
    vel?: [number, number, number];
    hit?: { part: number; impulse: [number, number, number] };
    /** (8) never getting up (one of the shadowed, shot down) */
    stay?: boolean;
    solids?: SolidBox3[];
  };
}

const still = (): Root => ({ x: 0, y: 0, z: 0, yaw: 0 });
const ahead =
  (v: number) =>
  (t: number): Root => ({ x: 0, y: 0, z: v * t, yaw: 0 });
const mod1 = (x: number) => ((x % 1) + 1) % 1;
// a cycle at `v` tiles/s over a stride: the whole number of cycles nearest `secs`
const cycles = (v: number, stride: number, secs: number) => {
  const per = stride / v;
  return Math.max(1, Math.round(secs / per)) * per;
};
// a jump laid over the standing pose, as Locomotion lays it
function jumped(x: Ctx, kind: JumpKind, t: number, v2: boolean): Moved {
  const base = v2
    ? x.H.idle2Pose(0, x.T, 3, false)
    : { pose: { ...x.C.REST }, lift: [0, 0, 0] as [number, number, number] };
  const now = jumpNowAt(kind, t);
  if (!now) return base;
  const j = v2 ? x.H.jump2Pose(now, true) : x.C.jumpPose(now, true);
  if (j.w <= 0) return base;
  return {
    pose: x.C.blend(base.pose, j.pose, j.w),
    lift: [base.lift[0], base.lift[1] + (j.lift[1] - base.lift[1]) * j.w, base.lift[2]],
  };
}
const jumpRoot =
  (kind: JumpKind, v: number) =>
  (t: number): Root => ({ x: 0, y: jumpArc(kind, t).h, z: v * Math.max(0, t), yaw: 0 });

const JOG = KH_MOVE.jog;
const SPRINT = KH_MOVE.sprint;
const RUN = (JOG + SPRINT) / 2;
const WALK = KH_MOVE.walk;

export function clipList(): Clip[] {
  const list: Clip[] = [];
  const add = (c: Clip) => list.push(c);
  // ── standing
  add({
    name: "idle",
    group: "standing",
    // (long enough for its variants: one every 17–24 s)
    len: 40,
    raw: { after: (x, t) => x.H.idle2Pose(t, x.T, 3, false, { gait: x.gait }) },
    live: () => ({ speed: 0 }),
  });
  // the trunk bent every way, through the spine and the chest (plan 58 phase 2: the waist, the
  // skin weights) — forward, back, twisting, to the sides
  add({
    name: "trunk bend",
    group: "standing",
    len: 8,
    raw: {
      after: (x, t) => {
        const w = (a: number, b: number) =>
          Math.max(0, Math.sin((Math.PI * (t - a)) / (b - a))) * (t > a && t < b ? 1 : 0);
        const fwd = 0.75 * w(0, 2) - 0.45 * w(2, 3.5);
        const twist = 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 3.5) / 2.5)) * 2);
        const side = 0.4 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 6) / 2)) * 2);
        const m = x.H.idle2Pose(0, 0, 3, false);
        const p = { ...m.pose };
        p.spine = [fwd * 0.55, twist * 0.5, side * 0.55];
        p.chest = [fwd * 0.45, twist * 0.5, side * 0.45];
        return { pose: p, lift: m.lift };
      },
    },
  });
  // the hands' shapes one after another, arms held out ahead; then up on the toes (plan 58 phase 2c)
  add({
    name: "hands and toes",
    group: "standing",
    len: 9,
    raw: {
      after: (x, t) => {
        const shapes = Object.values(x.C.HANDS);
        const i = Math.min(shapes.length - 1, Math.floor(t));
        const a = shapes[i];
        const b = shapes[Math.min(shapes.length - 1, i + 1)];
        const u = Math.min(1, Math.max(0, (t - i - 0.6) / 0.4));
        const mixed = {
          fingers: a.fingers + (b.fingers - a.fingers) * u,
          index: a.index + (b.index - a.index) * u,
          thumb: a.thumb + (b.thumb - a.thumb) * u,
        };
        const p = { ...x.C.REST, ...x.C.handPose(1, mixed), ...x.C.handPose(-1, mixed) };
        p.shoulderL = [-1.15, 0, 0.25];
        p.shoulderR = [-1.15, 0, -0.25];
        p.elbowL = [-0.35, 0, 0];
        p.elbowR = [-0.35, 0, 0];
        // (the last two seconds: up on the toes and down, the toes flat on the ground)
        const tip = t > 7 ? 0.55 * Math.sin((Math.PI * (t - 7)) / 2) : 0;
        p.ankleL = [tip, 0, 0];
        p.ankleR = [tip, 0, 0];
        p.toeL = [-tip, 0, 0];
        p.toeR = [-tip, 0, 0];
        return { pose: p, lift: [0, 0.11 * Math.sin(tip), 0] };
      },
    },
  });
  // (a quarter turn, a half turn and a whole one, standing)
  add({
    name: "turn on the spot",
    group: "standing",
    len: 7,
    // (the turn's rate eased on and off over a tenth of a second, as the body's facing is)
    live: (t) => {
      const on = (a: number, b: number) =>
        Math.min(1, Math.max(0, (t - a) / 0.1)) * Math.min(1, Math.max(0, (b - t) / 0.1));
      return { speed: 0, turn: 3.1 * (on(0.5, 1.0) - on(2.2, 3.2) + on(4.4, 6.4)) };
    },
  });
  // ── on the move: the cycles (raw: distance-matched, the old one beside)
  const cycle = (
    name: string,
    v: number,
    stride: (x: Ctx) => number,
    after: (x: Ctx, ph: number) => Moved,
    before?: (x: Ctx, ph: number) => Moved,
    oldStride?: (x: Ctx) => number,
  ) => {
    // (its length from the new stride at day: the old one plays at its own over the same seconds)
    const len = cycles(v, 2, 2.4);
    add({
      name,
      group: "on the move",
      len,
      raw: {
        after: (x, t) => after(x, mod1((v * t) / stride(x))),
        before: before && ((x, t) => before(x, mod1((v * t) / (oldStride ?? stride)(x)))),
        root: ahead(v),
      },
      live: () => ({ speed: v }),
    });
  };
  cycle(
    "walk",
    WALK,
    (x) => x.H.walk2Stride(x.T, x.gait),
    (x, ph) => x.H.walk2Pose(ph, x.T, 0, { gait: x.gait }),
    (x, ph) => x.C.walkPose(ph, 1) as Moved,
    (x) => x.C.STRIDE,
  );
  cycle(
    "jog",
    JOG,
    (x) => x.H.run2Stride(0),
    (x, ph) => x.H.run2Pose(ph, 0, x.T),
    (x, ph) => x.C.runPose(ph, 0),
    (x) => x.C.runStride(0),
  );
  cycle(
    "run",
    RUN,
    (x) => x.H.run2Stride(0.5),
    (x, ph) => x.H.run2Pose(ph, 0.5, x.T),
    (x, ph) => x.C.runPose(ph, 0.5),
    (x) => x.C.runStride(0.5),
  );
  cycle(
    "sprint",
    SPRINT,
    (x) => x.H.run2Stride(1),
    (x, ph) => x.H.run2Pose(ph, 1, x.T),
    (x, ph) => x.C.runPose(ph, 1),
    (x) => x.C.runStride(1),
  );
  // ── on the move: driven, as the game does it (4c: by the move core, under keys)
  const keyed = (name: string, len: number, keys: (t: number) => Partial<MoveInput>) =>
    add({ name, group: "starts, stops, turns", len, live: () => ({ speed: 0 }), keys });
  const during = (t: number, a: number, b: number) => t >= a && t < b;
  keyed("start, walk, stop", 3.6, (t) => ({ y: during(t, 0.4, 2.4) ? 1 : 0, walk: true }));
  keyed("start, jog, stop", 3.2, (t) => ({ y: during(t, 0.4, 2.2) ? 1 : 0 }));
  keyed("sprint, skid", 3.4, (t) => ({ y: during(t, 0.3, 2.2) ? 1 : 0, sprint: true }));
  // (turning back: the keys the other way — the body faces on as it slows, turns round once it's
  // slow, and goes)
  keyed("walk, turn back", 4.4, (t) => ({ y: during(t, 0.3, 2) ? 1 : during(t, 2, 3.6) ? -1 : 0, walk: true }));
  keyed("jog, turn back", 4, (t) => ({ y: during(t, 0.3, 1.8) ? 1 : during(t, 1.8, 3.2) ? -1 : 0 }));
  keyed("sprint, turn back", 4.6, (t) => ({ y: during(t, 0.3, 2.2) ? 1 : during(t, 2.2, 3.8) ? -1 : 0, sprint: true }));
  // (a cut: a quarter turn at a jog, to the right)
  keyed("jog, cut right", 3.4, (t) => (during(t, 0.3, 1.6) ? { y: 1 } : during(t, 1.6, 2.8) ? { x: 1 } : {}));
  // ── 4d: aside, backing up, crouched, aiming, winded, hurt (facing where it looks, as first person
  // and lock-on do: the keys move it, the look holds the facing)
  const facing = (k: Partial<MoveInput>): Partial<MoveInput> => ({ ...k, faceLook: true, look: Math.PI / 2 });
  const way4d = (name: string, len: number, keys: (t: number) => Partial<MoveInput>, hurt?: number) =>
    add({ name, group: "aside, back, low, hurt", len, live: () => ({ speed: 0 }), keys, hurt });
  way4d("back up, walk", 3.6, (t) => facing({ y: during(t, 0.4, 2.6) ? -1 : 0, walk: true }));
  way4d("back up, jog", 3.4, (t) => facing({ y: during(t, 0.4, 2.4) ? -1 : 0 }));
  way4d("aside right, jog", 3.4, (t) => facing({ x: during(t, 0.4, 2.4) ? 1 : 0 }));
  way4d("aside left, walk", 3.6, (t) => facing({ x: during(t, 0.4, 2.6) ? -1 : 0, walk: true }));
  way4d("aslant back-left, jog", 3.4, (t) => facing(during(t, 0.4, 2.4) ? { x: -0.7, y: -0.7 } : {}));
  // (round a square, facing on: ahead, right, back, left)
  way4d("a square, facing on", 6, (t) =>
    facing(
      during(t, 0.4, 1.5)
        ? { y: 1 }
        : during(t, 1.5, 2.6)
          ? { x: 1 }
          : during(t, 2.6, 3.7)
            ? { y: -1 }
            : during(t, 3.7, 4.8)
              ? { x: -1 }
              : {},
    ),
  );
  way4d("crouch: start, sneak, stop", 3.6, (t) => ({ crouch: true, y: during(t, 0.6, 2.6) ? 1 : 0 }));
  way4d("crouch: back up, aside", 5, (t) =>
    facing({ crouch: true, ...(during(t, 0.6, 2.2) ? { y: -1 } : during(t, 2.2, 3.8) ? { x: 1 } : {}) }),
  );
  way4d("aim: round a square", 6, (t) =>
    facing({
      aim: true,
      ...(during(t, 0.4, 1.5)
        ? { y: 1 }
        : during(t, 1.5, 2.6)
          ? { x: 1 }
          : during(t, 2.6, 3.7)
            ? { y: -1 }
            : during(t, 3.7, 4.8)
              ? { x: -1 }
              : {}),
    }),
  );
  way4d("sprint, then walk winded", 10, (t) =>
    during(t, 0.3, 5) ? { y: 1, sprint: true } : during(t, 5, 9) ? { y: 1, walk: true } : {},
  );
  way4d("walk hurt", 3.6, (t) => ({ y: during(t, 0.4, 2.6) ? 1 : 0, walk: true }), 0.85);
  // (turning at speed: a sprint into a quarter turn, and round a circle — the keys turning with time)
  keyed("sprint, turn right", 3.2, (t) =>
    during(t, 0.3, 1.6) ? { y: 1, sprint: true } : during(t, 1.6, 2.8) ? { x: 1, sprint: true } : {},
  );
  keyed("sprint round", 4, (t) =>
    during(t, 0.3, 3.7)
      ? { x: Math.sin(Math.max(0, t - 1) * 2.2), y: Math.cos(Math.max(0, t - 1) * 2.2), sprint: true }
      : {},
  );
  keyed("jog round", 4, (t) =>
    during(t, 0.3, 3.7) ? { x: Math.sin(Math.max(0, t - 1) * 2.2), y: Math.cos(Math.max(0, t - 1) * 2.2) } : {},
  );
  // (jumping on the run: the core's own jump, a press held a moment — the jog's hop, the sprint's leap)
  keyed("jog, jump", 3, (t) => ({
    y: during(t, 0.3, 2.6) ? 1 : 0,
    jump: during(t, 1.2, 1.5),
    jumpPressed: Math.abs(t - 1.2) < 0.004,
  }));
  keyed("sprint, jump", 3.4, (t) => ({
    y: during(t, 0.3, 2.8) ? 1 : 0,
    sprint: true,
    jump: during(t, 1.4, 1.7),
    jumpPressed: Math.abs(t - 1.4) < 0.004,
  }));
  // ── 5a: in the air — the jumps (standing, the jump in the air, the air dash) and off ledges
  const press = (t: number, at: number) => Math.abs(t - at) < 0.004;
  keyed("stand, jump", 2.4, (t) => ({ jump: during(t, 0.5, 0.8), jumpPressed: press(t, 0.5) }));
  keyed("jog, jump, jump again", 3.4, (t) => ({
    y: during(t, 0.3, 3) ? 1 : 0,
    jump: during(t, 1.0, 1.3) || during(t, 1.5, 1.8),
    jumpPressed: press(t, 1.0) || press(t, 1.5),
  }));
  keyed("jog, jump, air dash", 3, (t) => ({
    y: during(t, 0.3, 2.6) ? 1 : 0,
    jump: during(t, 1.0, 1.3),
    jumpPressed: press(t, 1.0),
    dodgePressed: press(t, 1.4),
  }));
  // (its edge on a tile's: the core's floor is a tile at a time)
  const ledge = (h: number) => (_x: number, z: number) => (z < 2 ? h : 0);
  for (const [name, h, walk] of [
    ["walk off a 0.6 m ledge", 0.6, true],
    ["walk off a 3 m drop", 3, true],
    ["jog off a 1.5 m ledge", 1.5, false],
    ["jog off a 4 m drop", 4, false],
  ] as [string, number, boolean][])
    add({
      name,
      group: "in the air",
      len: 3.6,
      live: () => ({ speed: 0 }),
      keys: (t) => ({ y: during(t, 0.3, 3) ? 1 : 0, walk }),
      ground: ledge(h),
      coreGround: true,
    });
  // ── 5b: over things and onto them, the roll and the slide — the core's own verbs, by its probe
  // (a block across the way from `at` m on, `deep` m deep and `h` high; the core's floor a tile at a
  // time. A jog's 5 m/s reaches 5 m by about 1.37 s, a sprint 6.9 m by 1.27 s)
  const block = (h: number, at: number, deep: number) => (_x: number, z: number) => (z >= at && z < at + deep ? h : 0);
  for (const [name, h, deep, sprint, at, hold] of [
    ["jog, vault a 0.7 m wall", 0.7, 1, false, 1.37, false],
    ["sprint, vault a 0.5 m wall", 0.5, 1, true, 1.27, false],
    ["jog, climb onto 1.2 m", 1.2, 3, false, 1.37, false],
    ["jog, jump, catch a 2.2 m ledge", 2.2, 3, false, 1.2, true],
  ] as [string, number, number, boolean, number, boolean][])
    add({
      name,
      group: "over things",
      len: 3.4,
      live: () => ({ speed: 0 }),
      keys: (t) => ({
        y: during(t, 0.3, 2.9) ? 1 : 0,
        sprint,
        jump: hold ? during(t, at, at + 0.8) : during(t, at, at + 0.1),
        jumpPressed: press(t, at),
      }),
      ground: block(h, sprint ? 8 : 6, deep),
      coreGround: true,
      blocks: true,
    });
  for (const [name, sprint, k] of [
    ["jog, roll", false, "dodgePressed"],
    ["sprint, slide", true, "crouchPressed"],
  ] as [string, boolean, string][])
    add({
      name,
      group: "over things",
      len: 3,
      live: () => ({ speed: 0 }),
      keys: (t) => ({
        y: during(t, 0.3, 2.6) ? 1 : 0,
        sprint,
        [k]: press(t, 1.2),
        crouch: k === "crouchPressed" && during(t, 1.2, 1.3),
      }),
      ground: () => 0,
      coreGround: true,
    });
  // ── 5c: Flowmotion on the new body — the hands taking hold (a 2.2 m ledge 0.25 m ahead: hung from
  // with the feet 1.45 m under its top, climbed onto as the core climbs; a pole on her left)
  const ledge22 = (_x: number, z: number) => (z >= 0.25 ? 2.2 : 0);
  const hangY = 2.2 - 1.45;
  const flowClip = (name: string, len: number, f: (t: number) => Drive, ground?: (x: number, z: number) => number) =>
    add({ name, group: "Flowmotion", len, live: f, ground, coreGround: !!ground });
  flowClip("hang", 1.6, (t) => ({ speed: 0, flow: { kind: "hang", t, side: 1, speed: 0 }, rise: hangY }), ledge22);
  flowClip(
    "hang, climb up",
    1.2,
    (t) => {
      const u = Math.max(0, Math.min(1, (t - 0.4) / 0.34));
      const sm = (x: number) => x * x * (3 - 2 * x);
      if (t < 0.4) return { speed: 0, flow: { kind: "hang", t: t + 1, side: 1, speed: 0 }, rise: hangY };
      if (u >= 1) return { speed: 0, rise: 2.2, fwd: 0.6 };
      return {
        speed: 0,
        flow: { kind: "climb", t: u, side: 1, speed: 0 },
        rise: hangY + 1.45 * sm(Math.min(1, u / 0.65)),
        fwd: 0.6 * sm(Math.max(0, (u - 0.35) / 0.65)),
      };
    },
    ledge22,
  );
  add({
    name: "swing round a pole",
    group: "Flowmotion",
    len: 1.4,
    live: (t) => ({ speed: 0, flow: { kind: "swing", t, side: 1, speed: 0 } }),
    pole: [0.48, 0],
  });
  flowClip("run up a wall", 1, (t) => ({ speed: 0, flow: { kind: "wallrun", t, side: 1, speed: 5.5 } }));
  flowClip("run along a wall", 1.1, (t) => ({ speed: 0, flow: { kind: "wallside", t, side: 1, speed: 8.5 } }));
  flowClip("grind a rail", 1.2, (t) => ({ speed: 0, flow: { kind: "grind", t, side: 1, speed: 7 } }));
  // ── 6: the everyday, through Motion3 (sitting, the hands and the phone, busy, together, the emotes)
  const seat = [box3(-0.24, -0.3, 0.24, 0.16, 0, 0.36), box3(-0.24, -0.34, 0.24, -0.28, 0.36, 0.95)];
  const desk = [...seat, box3(-0.6, 0.38, 0.6, 0.98, 0.69, 0.73)];
  const every = (
    name: string,
    group: string,
    len: number,
    motion: (t: number) => Partial<MotionIn>,
    more: Partial<Clip> = {},
  ) => add({ name, group, len, motion, ...more });
  every("sit down, sit, get up", "sitting", 10, (t) => ({ sit: t > 0.6 && t < 7.2 }), { props: seat });
  every("sat at a desk, typing", "sitting", 8, () => ({ sit: true, typing: true }), { props: desk });
  every("sat, a while", "sitting", 24, () => ({ sit: true }), { props: seat });
  every("a mug, sipping", "the hands", 9, (t) => ({ held: { kind: "mug", since: t * 1000 } }));
  for (const [state, pose, speaking] of [
    ["text", "", false],
    ["call", "", true],
    ["video", "", true],
    ["photo", "", false],
    ["selfie", "peace", false],
  ] as [string, string, boolean][])
    every(`phone: ${state}${pose ? `, ${pose}` : ""}`, "the hands", 6, () => ({
      phone: { state, pose, ringing: false },
      speaking,
    }));
  for (const what of ["coffee", "throw", "arcade", "piano", "gamepad", "pool", "pong", "computer", "whiteboard"])
    every(`busy: ${what}`, "busy", 7, () => ({ busy: what }));
  for (const [what, ms] of [
    ["highfive", 1500],
    ["fistbump", 1400],
    ["cheers", 1700],
    ["give", 1500],
    ["wave", 2200],
  ] as [string, number][])
    every(
      `with someone: ${what}`,
      "together",
      ms / 1000 + 1.2,
      (t) => ({
        act:
          t > 0.4 && t < 0.4 + ms / 1000
            ? { what, t: t - 0.4, len: ms / 1000, with: [0, 1.2] as [number, number] }
            : null,
        held: what === "cheers" || what === "give" ? { kind: "mug", since: 0 } : null,
      }),
      { pair: { d: 1.2, act: what === "give" ? "take" : what } },
    );
  for (const e of ["wave", "clap", "laugh", "heart", "question", "fire", "coffee", "tape"])
    every(`emote: ${e}`, "emotes", 4, (t) => ({ emote: t > 0.3 && t < 3.5 ? e : "" }));
  // ── 7: the dark (the mood all the way: the fear)
  const dark = (name: string, len: number, live: (t: number) => Drive, mood = 1) =>
    add({ name, group: "the dark", len, live, mood });
  dark("torch, looking round", 6, (t) => ({
    speed: 0,
    torch: true,
    yaw: 0.9 * Math.sin(t * 0.9),
    pitch: 0.25 * Math.sin(t * 0.55),
  }));
  dark("torch, walking", 4, () => ({ speed: WALK, torch: true }));
  dark("torch, by day", 4, (t) => ({ speed: 0, torch: true, yaw: 0.6 * Math.sin(t * 0.9) }), 0);
  dark("aiming, shooting", 4, (t) => {
    const s = t > 0.8 ? (t - 0.8) % 0.7 : 9;
    return { speed: 0, aim: true, gun: true, kick: s < 0.3 ? Math.exp(-s * 12) : 0 };
  });
  dark("reloading", 4, () => ({ speed: 0, gun: true, reload: true }));
  for (const [side, from] of [
    ["ahead", 0],
    ["behind", Math.PI],
    ["the left", Math.PI / 2],
    ["the right", -Math.PI / 2],
  ] as [string, number][])
    dark(`struck from ${side}`, 2, (t) => ({
      speed: 0,
      torch: true,
      hit: t > 0.4 ? { from, t: t - 0.4, k: 1 } : null,
    }));
  dark("startled from the left", 2, (t) => ({
    speed: 0,
    torch: true,
    hit: t > 0.4 ? { from: 1.2, t: t - 0.4, k: 0.4 } : null,
  }));
  dark("struck walking, from ahead", 3, (t) => ({
    speed: WALK,
    torch: true,
    hit: t > 1.2 ? { from: 0, t: t - 1.2, k: 1 } : null,
  }));
  // (down: crawling on, kneeling by someone — the world's view lays these: docs/plan/30-the-dark.md D7)
  add({
    name: "down, crawling",
    group: "the dark",
    len: 3.36,
    raw: {
      after: (x, t) => {
        const N = x.C.nightNow();
        if (!N) return x.C.crawlPose(((t * 0.6) / 0.45) % 1);
        const r = N.crawl2(((t * 0.6) / 0.42) % 1, t, true);
        return { ...r.m, hands: r.hands };
      },
      before: (x, t) => x.C.crawlPose(((t * 0.6) / 0.45) % 1),
      root: ahead(0.6),
    },
  });
  add({
    name: "kneeling by someone",
    group: "the dark",
    len: 6,
    raw: {
      after: (x, t) => {
        const N = x.C.nightNow();
        if (!N) return x.C.kneelPose();
        const r = N.kneel2(t, 1);
        return { ...r.m, hands: r.hands };
      },
      before: (x) => x.C.kneelPose(),
    },
  });
  // ── 8: the shadowed, their own (the mood at its full; "before" the old poses)
  const SHADE_V = 1.3;
  const shadeClip = (
    name: string,
    len: number,
    after: (x: Ctx, t: number) => Moved,
    before: (x: Ctx, t: number) => Moved,
    more: Partial<Clip> & { root?: (t: number) => Root } = {},
  ) => add({ name, group: "the shadowed", len, raw: { after, before, root: more.root }, rag: more.rag, mood: 1 });
  // (their walk: the heavy limp; the top theirs over it — or the old, slumped over the old walk)
  const shadeWalk = (x: Ctx, t: number, kind: "lurch" | "recoil" | "exposed"): Moved => {
    const N = x.C.nightNow();
    const stride = x.H.walk2Stride(1, "heavy");
    const legs = x.H.walk2Pose(((t * SHADE_V) / stride) % 1, 1, 0, { hurt: 0.7, gait: "heavy" });
    if (!N) return legs;
    const top = N.shade2(kind, t, 3, true, 1.2).m;
    const p = { ...legs.pose };
    for (const j of [
      "spine",
      "chest",
      "neck",
      "head",
      "shoulderL",
      "shoulderR",
      "elbowL",
      "elbowR",
      "wristL",
      "wristR",
    ] as const)
      if (top.pose[j]) p[j] = top.pose[j];
    for (const [k, r] of Object.entries(top.pose)) if (/^(fingers|index|thumb)/.test(k)) p[k as keyof typeof p] = r;
    return { pose: p, lift: legs.lift };
  };
  const oldWalk = (x: Ctx, t: number, kind: "lurch" | "recoil" | "exposed"): Moved => {
    const w = x.C.walkPose(((t * SHADE_V) / x.C.STRIDE) % 1, 1);
    return { pose: x.C.blend(w.pose, x.C.shadePose(kind, t, 3), 1), lift: w.lift };
  };
  const oldStood = (x: Ctx, t: number, kind: "lurch" | "windup" | "strike" | "recoil" | "exposed"): Moved => ({
    pose: x.C.blend({ ...x.C.REST }, x.C.shadePose(kind, t, 3), 1),
    lift: [0, 0, 0],
  });
  const stood =
    (kind: "lurch" | "windup" | "strike" | "recoil" | "exposed", from = 0) =>
    (x: Ctx, t: number) =>
      x.C.nightNow()?.shade2(kind, t, 3, false, from).m ?? oldStood(x, t, kind);
  shadeClip(
    "lurching on",
    4,
    (x, t) => shadeWalk(x, t, "lurch"),
    (x, t) => oldWalk(x, t, "lurch"),
    { root: ahead(SHADE_V) },
  );
  shadeClip("stood, twitching", 6, stood("lurch"), (x, t) => oldStood(x, t, "lurch"));
  shadeClip(
    "wind-up and strike",
    2.4,
    (x, t) => (t < 0.8 ? stood("windup")(x, t) : t < 1.5 ? stood("strike")(x, t - 0.8) : stood("lurch")(x, t)),
    (x, t) => (t < 0.8 ? oldStood(x, t, "windup") : t < 1.5 ? oldStood(x, t - 0.8, "strike") : oldStood(x, t, "lurch")),
  );
  shadeClip("caught in a beam from its left", 3, stood("recoil", 1.2), (x, t) => oldStood(x, t, "recoil"));
  shadeClip("exposed", 4, stood("exposed"), (x, t) => oldStood(x, t, "exposed"));
  shadeClip(
    "asleep in its nest",
    6,
    (x, t) => x.C.nightNow()?.shade2("lurk", t, 3, false).m ?? x.C.lurkPose(t, 3),
    (x, t) => x.C.lurkPose(t, 3),
  );
  shadeClip(
    "shot down",
    5,
    (x, t) => {
      const N = x.C.nightNow();
      if (!N) return x.C.deathPose(t, 3);
      if (t < N.LIMP) return N.shadeShot(t, 3);
      // (no world for the ragdoll: from the shot into the old fall)
      const a = N.shadeShot(N.LIMP, 3);
      const b = x.C.deathPose(t, 3);
      const w = Math.min(1, (t - N.LIMP) / 0.3);
      return {
        pose: x.C.blend(a.pose, b.pose, w),
        lift: [
          a.lift[0] + (b.lift[0] - a.lift[0]) * w,
          a.lift[1] + (b.lift[1] - a.lift[1]) * w,
          a.lift[2] + (b.lift[2] - a.lift[2]) * w,
        ],
      };
    },
    (x, t) => x.C.deathPose(t, 3),
    { rag: { at: 0.55, vel: [0, 0.3, -2.2], stay: true } },
  );
  // ── 9: reactions and life — the cold, catching her breath, who she is, a sound
  const life = (name: string, len: number, live: (t: number) => Drive, more: Partial<Clip> = {}) =>
    add({ name, group: "life", len, live, ...more });
  life("cold, stood", 14, () => ({ speed: 0, cold: 0.9 }), { mood: 0.6 });
  life("cold, walking", 4, () => ({ speed: WALK, cold: 0.8 }), { mood: 0.6 });
  life("spent, catching her breath", 6, () => ({ speed: 0, spent: 0.95 }));
  for (const g of ["old", "brisk", "tired", "bouncy", "heavy"])
    life(`stood: ${g}`, 9, () => ({ speed: 0 }), { gait: g });
  life("a sound off to her left", 4, (t) => ({ speed: 0, heard: t > 1 ? { yaw: 1.4, pitch: 0.1, t: t - 1 } : null }));
  life(
    "a shot close behind",
    3,
    (t) => ({ speed: 0, heard: t > 0.8 ? { yaw: 2.8, pitch: 0, t: t - 0.8, loud: true } : null }),
    {
      mood: 1,
    },
  );
  // ── 5d: limp on the ragdoll, and up again — off a drop too high to land on her feet; a blow
  add({
    name: "jog off an 8 m drop, limp",
    group: "limp",
    len: 5.6,
    live: () => ({ speed: 0 }),
    keys: (t) => ({ y: during(t, 0.3, 1.2) ? 1 : 0 }),
    ground: ledge(8),
    coreGround: true,
    rag: { drop: 6, solids: [box3(-3, -10, 3, 2, 0, 8)] },
  });
  add({
    name: "jogging, hit in the chest",
    group: "limp",
    len: 5,
    live: () => ({ speed: 0 }),
    keys: (t) => ({ y: during(t, 0.3, 4) ? 1 : 0 }),
    ground: () => 0,
    coreGround: true,
    rag: { at: 1.2, vel: [0, 1.2, -2.8], hit: { part: 2, impulse: [0, 0, -60] } },
  });
  // ── 4f: slopes and stairs (the ground's own: the feet set on it, tipped to it)
  const slope =
    (deg: number, from = 1.2) =>
    (_x: number, z: number) =>
      Math.max(0, z - from) * Math.tan((deg * Math.PI) / 180);
  // (stairs: a 15 cm rise, a 30 cm tread, from 1.2 m on, ten of them; `down`: from the top)
  const stairs = (down: boolean) => (_x: number, z: number) => {
    const n = Math.max(0, Math.min(10, Math.floor((z - 1.2) / 0.3) + 1));
    return 0.15 * (down ? 10 - n : n);
  };
  const ground4f = (
    name: string,
    len: number,
    ground: (x: number, z: number) => number,
    keys: (t: number) => Partial<MoveInput>,
  ) => add({ name, group: "slopes and stairs", len, live: () => ({ speed: 0 }), keys, ground });
  ground4f("walk up a ramp (15°)", 4.5, slope(15), (t) => ({ y: during(t, 0.3, 3.8) ? 1 : 0, walk: true }));
  ground4f(
    "walk down a ramp (15°)",
    4.5,
    (x, z) => slope(15)(x, -z + 4.5),
    (t) => ({ y: during(t, 0.3, 3.8) ? 1 : 0, walk: true }),
  );
  ground4f(
    "walk across a slope (12°)",
    4,
    (x) => Math.max(-0.5, x * Math.tan((12 * Math.PI) / 180)),
    (t) => ({ y: during(t, 0.3, 3.4) ? 1 : 0, walk: true }),
  );
  ground4f("walk up stairs", 4.5, stairs(false), (t) => ({ y: during(t, 0.3, 3.8) ? 1 : 0, walk: true }));
  ground4f("walk down stairs", 4.5, stairs(true), (t) => ({ y: during(t, 0.3, 3.8) ? 1 : 0, walk: true }));
  ground4f("jog up stairs", 2.6, stairs(false), (t) => ({ y: during(t, 0.3, 1.5) ? 1 : 0 }));
  ground4f(
    "stand on a stair's edge",
    6,
    (_x, z) => (z > 0.02 ? 0.15 : 0),
    () => ({}),
  );
  // (3b) a hard sprint, then standing to get the breath back
  add({
    name: "sprint, then winded",
    group: "on the move",
    len: 16,
    live: (t) => ({ speed: t < 0.3 ? 0 : t < 6 ? SPRINT : 0 }),
  });
  add({ name: "jog round (steady turn)", group: "on the move", len: 4, live: () => ({ speed: JOG, turn: 2.2 }) });
  // ── in the air
  for (const [kind, v] of [
    ["hop", 0],
    ["flip", 0],
    ["leap", SPRINT],
  ] as [JumpKind, number][]) {
    const len = jumpTimes(kind).len + 0.5;
    add({
      name: kind,
      group: "in the air",
      len,
      raw: {
        after: (x, t) => jumped(x, kind, t - 0.25, true),
        before: kind === "leap" ? undefined : (x, t) => jumped(x, kind, t - 0.25, false),
        root: (t) => jumpRoot(kind, v)(t - 0.25),
      },
      live: () => ({ speed: v || 0, jump: { kind, at: 0.25 } }),
    });
  }
  add({
    name: "slide",
    group: "in the air",
    len: 2.4,
    raw: {
      after: (x, t) => x.H.slide2Pose(Math.min(1, Math.max(0, (t - 0.3) / x.C.VERB_LEN.slide))),
      before: (x, t) => x.C.verbPose("slide", Math.min(1, Math.max(0, (t - 0.3) / x.C.VERB_LEN.slide))),
    },
    live: (t) => ({ speed: t < 1.6 ? SPRINT : 0, slide: 0.5 }),
  });
  add({
    name: "skid",
    group: "in the air",
    len: 1.2,
    raw: { after: (x, t) => x.H.skid2Pose(Math.min(1, t / 0.3), t) },
  });
  return list;
}

/** One moment of a clip, worked out. */
export interface Frame {
  pose: Moved["pose"];
  lift: Moved["lift"];
  root: Root;
  eyes: [number, number];
  blink: number;
  /** (5b) where the hands go, in her own space: `Locomotion.handsOut` */
  hands?: Locomotion["handsOut"];
  /** (6) hands put on the body: the phone at the ear, the mug at the mouth */
  reach?: Reach;
  /** (9) the breath's place (0..1) and how cold: a puff in the air with each breath out */
  breath?: number;
  cold?: number;
}
export const RATE = 120;

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** An open floor 200 m a side for the move core. */
function open(): Grid {
  const g = new Grid(200, 200);
  g.walk.fill(1);
  g.top.fill(0);
  return g;
}

/** A clip, `after` or `before`, `live` or raw, at `rate` frames a second. */
export function tabulate(x: Ctx, clip: Clip, which: "after" | "before", live: boolean, rate = RATE): Frame[] | null {
  const n = Math.round(clip.len * rate) + 1;
  const out: Frame[] = [];
  if (!live) {
    const r = clip.raw;
    const at = r ? (which === "after" ? r.after : r.before) : undefined;
    if (!at) return null;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const m = at(x, t);
      out.push({
        pose: m.pose,
        lift: m.lift,
        root: r?.root?.(t) ?? still(),
        eyes: [0, 0],
        blink: 0,
        hands: (m as { hands?: Frame["hands"] }).hands,
      });
    }
    return out;
  }
  if (clip.motion) return everyday(x, clip, which, rate);
  if (!clip.live) return null;
  // driven: as the sandbox drives it — the body's speed, its change and its turn; Locomotion's layers
  const loco = new x.C.Locomotion(KH_FEEL);
  loco.v2 = which === "after";
  loco.tension = clip.mood ?? x.T;
  loco.seed = 3;
  loco.gait = clip.gait ?? x.gait ?? "calm";
  const dt = 1 / rate;
  let v = 0;
  let acc = 0;
  let yaw = 0;
  let px = 0;
  let pz = 0;
  let goal: number | undefined;
  let rideY = 0;
  let coreLanded: number | undefined;
  let was: ReturnType<typeof jumpArc>["stage"] | null = null;
  // (4c: the move core's body on an open floor, facing three's +z — the floor's +y, south)
  // (5a: the clip's ground under the core's own feet — a ledge — a tile at a time)
  const grid = open();
  if (clip.coreGround && clip.ground)
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++) {
        const h = clip.ground(x + 0.5 - 100, y + 0.5 - 100);
        grid.top[y * 200 + x] = h;
        if (clip.blocks && h > 0) grid.walk[y * 200 + x] = 0;
      }
  const body = newBody(100, 100, clip.coreGround && clip.ground ? clip.ground(0, 0) : 0, Math.PI / 2);
  const env: MoveEnv = { grid, footing: () => "floor" };
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const d = clip.live(t);
    let turn = d.turn ?? 0;
    let ahead = 0;
    let left = 0;
    let dist = 0;
    if (clip.keys) {
      const k = clip.keys(t);
      // (the keys in the body's starting frame: ahead the floor's +y, its right the floor's -x)
      const inp = { ...NO_INPUT, ...k, x: -(k.x ?? 0), y: k.y ?? 0 };
      const [x0, y0, yaw0] = [body.x, body.y, body.yaw];
      const ev = stepBody(body, inp, env, KH_FEEL, dt);
      coreLanded = ev.landed;
      const g = body.gait;
      goal = g === "walk" || g === "jog" || g === "sprint" || g === "crouch" || g === "aim" ? KH_FEEL[g] : goal;
      const nv = Math.hypot(body.vx, body.vy);
      acc += ((nv - v) / dt - acc) * Math.min(1, dt * 10);
      v = nv;
      // (a turn's rate + to the right, as the floor's y is south)
      turn = wrapPi(body.yaw - yaw0) / dt;
      dist = Math.hypot(body.x - x0, body.y - y0);
      const c = Math.cos(body.yaw);
      const s = Math.sin(body.yaw);
      ahead = body.vx * c + body.vy * s;
      left = -(-body.vx * s + body.vy * c);
      yaw = Math.PI / 2 - body.yaw;
      px = body.x - 100;
      pz = body.y - 100;
    } else {
      // (the body's own ramp: the feel's grip, about 0.2 s to a run and 0.25 s to a stop)
      const want = d.speed;
      const grip = want > v ? 30 : 24;
      const nv = v + Math.max(-grip * dt, Math.min(grip * dt, want - v));
      acc += ((nv - v) / dt - acc) * Math.min(1, dt * 10);
      v = nv;
      // (a turn's rate + to the right, as the floor's y is south: the yaw + to the left)
      yaw -= turn * dt;
      px += Math.sin(yaw) * v * dt;
      pz += Math.cos(yaw) * v * dt;
      ahead = v;
      dist = v * dt;
    }
    const jt = d.jump ? t - d.jump.at : -1;
    const arc = d.jump && jt >= 0 ? jumpArc(d.jump.kind, jt) : null;
    // (keyed: the core's own jump — its takeoff, its arc, its landing)
    const up = clip.keys ? body.up : arc?.stage === "air";
    const landed = clip.keys ? coreLanded : was === "air" && arc && arc.stage !== "air" ? 0.5 : undefined;
    was = arc?.stage ?? null;
    const keysNow = clip.keys?.(t);
    // (4f: the body on the ground under it — up a step at once and eased there, as the sandbox's;
    // the ground under a spot in her own space for Locomotion)
    const G = clip.ground;
    if (G && !clip.coreGround) {
      const at = G(px, pz);
      rideY = i === 0 ? at : rideY + (at - rideY) * Math.min(1, dt * 16);
    }
    const ry = yaw;
    // (on the core's own ground her height's the core's)
    const under = clip.coreGround ? body.z : rideY;
    const ground = G
      ? (lx: number, lz: number) =>
          G(px + lx * Math.cos(ry) + lz * Math.sin(ry), pz - lx * Math.sin(ry) + lz * Math.cos(ry)) - under
      : undefined;
    const st = d.slide !== undefined ? (t - d.slide) / x.C.VERB_LEN.slide : -1;
    const standing = loco.v2 ? x.H.idle2Pose(t, x.T, 3, true, loco.life()) : undefined;
    const m = loco.update(
      dt,
      {
        dist,
        speed: v,
        ahead,
        left,
        // (as the sandbox has them: crouched by the gait, or held still)
        crouch: body.gait === "crouch" || (!!keysNow?.crouch && v < 0.2),
        aim: !!keysNow?.aim || !!d.aim,
        gun: d.gun,
        torch: d.torch,
        reload: d.reload,
        kick: d.kick,
        hit: d.hit ?? null,
        cold: d.cold,
        spent: d.spent,
        heard: d.heard ?? null,
        pitch: d.pitch ?? 0,
        yaw: d.yaw ?? 0,
        turn,
        accel: acc,
        up,
        jump: clip.keys ? x.C.jumpNowOf(body, KH_FEEL) : d.jump && jt >= 0 ? jumpNowAt(d.jump.kind, jt) : null,
        landed,
        verb: clip.keys ? x.C.verbIn(body, KH_FEEL) : st >= 0 && st < 1 ? { kind: "slide", t: st } : null,
        flow: d.flow ?? null,
        goal,
        hurt: clip.hurt,
        facing: !!(keysNow?.faceLook || keysNow?.aim),
        ground,
        reduced: false,
      } satisfies LocoIn,
      standing,
    );
    const g = loco.gazeOut;
    out.push({
      pose: m.pose,
      lift: m.lift,
      root: { x: px, y: (clip.keys ? body.z : (arc?.h ?? d.rise ?? 0)) + rideY, z: pz + (d.fwd ?? 0), yaw },
      eyes: g ? [g.eyes[0], g.eyes[1]] : [0, 0],
      blink: g?.blink ?? 0,
      hands: loco.handsOut ?? undefined,
      breath: loco.life().breath,
      cold: d.cold,
    });
  }
  return out;
}

/** How finely a clip's looked at for pops: at a thousand a second a hard but smooth swing changes
 *  its speed by a hair a sample, a break in it all at once. */
export const POP_RATE = 1000;
/** Moments a joint pops (in a table at POP_RATE): its speed changing in one sample by `least` (rad:
 *  0.6 rad/s at once), or by 8% of how fast it's going if more, beyond what the samples 3 ms either
 *  side do — a break, a spike off the trend; a hard swing, or a speed-up that steps, keeps to it. */
export function pops(frames: Frame[], least = 0.0006): { t: number; what: string }[] {
  const chans: { name: string; get: (f: Frame) => number | undefined; least: number }[] = [];
  const first = frames[0];
  if (!first) return [];
  // (by the joint's size: a toe's or a finger's few centimetres show a jolt far less than a thigh)
  const small = (j: string) => (/^(toe|fingers|index|thumb)/.test(j) ? 4 : 1);
  for (const j of Object.keys(first.pose) as (keyof Frame["pose"])[])
    for (let k = 0; k < 3; k++) chans.push({ name: String(j), get: (f) => f.pose[j]?.[k], least: least * small(j) });
  chans.push({ name: "hips' height", get: (f) => f.lift[1], least: least / 4 });
  // (each pop once, at the 1/120 s frame it's in)
  const hits = new Map<number, Set<string>>();
  const S = 3;
  for (const c of chans) {
    const d2: number[] = [];
    for (let i = 2; i < frames.length; i++) {
      const a = c.get(frames[i - 2]);
      const b = c.get(frames[i - 1]);
      const n = c.get(frames[i]);
      d2.push(a === undefined || b === undefined || n === undefined ? 0 : n - 2 * b + a);
    }
    for (let i = S; i < d2.length - S; i++) {
      // (against how fast it's turning, too: the eye judges a jolt by the motion it's in — a sprint's
      // foot, down 50 ms and turning 20 rad/s, wobbling a thirtieth of that isn't seen)
      const a = c.get(frames[i]);
      const b = c.get(frames[i + 2]);
      const speed = a === undefined || b === undefined ? 0 : Math.abs(b - a) / 2;
      if (Math.abs(d2[i] - (d2[i - S] + d2[i + S]) / 2) < Math.max(c.least, 0.08 * speed)) continue;
      const t = Math.round(((i + 1) / POP_RATE) * RATE);
      const set = hits.get(t) ?? new Set();
      set.add(c.name);
      hits.set(t, set);
    }
  }
  return [...hits].sort((a, b) => a[0] - b[0]).map(([i, set]) => ({ t: i / RATE, what: [...set].join(", ") }));
}

type Air = NonNullable<ReturnType<Chars["airNow"]>>;
/** (5d) A clip's limp stretch, worked out on Jolt with her own model: from the moment it goes limp
 *  (or lands from its drop) the frames are the ragdoll's, then the get-up's, then standing. */
export function limp(
  frames: Frame[],
  clip: Clip,
  model: InstanceType<Chars["PersonModel"]>,
  world: PhysicsWorld,
  A: Air,
): void {
  const R = clip.rag;
  if (!R || frames.length < 4) return;
  let i0 = R.at !== undefined ? Math.round(R.at * RATE) : -1;
  if (R.drop !== undefined) {
    let top = 0;
    for (let i = 1; i < frames.length && i0 < 0; i++) {
      top = Math.max(top, frames[i].root.y);
      if (
        top - frames[i].root.y >= R.drop &&
        frames[i].root.y <= frames[i - 1].root.y &&
        frames[i + 1]?.root.y >= frames[i].root.y - 1e-3
      )
        i0 = i;
    }
  }
  if (i0 < 2 || i0 >= frames.length) return;
  const f0 = frames[i0];
  const a = frames[i0 - 2].root;
  // (going as it was: down at no more than a fall's 12 m/s — the core's falls are quick)
  const vel: [number, number, number] = R.vel ?? [
    ((f0.root.x - a.x) * RATE) / 2,
    Math.max(-12, ((frames[i0 - 1].root.y - frames[i0 - 3].root.y) * RATE) / 2),
    ((f0.root.z - a.z) * RATE) / 2,
  ];
  model.root.position.set(f0.root.x, f0.root.y, f0.root.z);
  model.root.rotation.y = f0.root.yaw;
  model.setPose(f0.pose, f0.lift);
  model.root.updateMatrixWorld(true);
  const D = new A.Downed(world, model);
  if (!D.fall(f0.pose, vel, R.hit, R.stay)) return;
  let root = { ...f0.root };
  let last: Frame = f0;
  for (let i = i0 + 1; i < frames.length; i++) {
    world.step(1 / RATE);
    const r = D.update(1 / RATE, () => 0, A.getUp2Pose, A.GETUP_LEN);
    if (r?.root) root = { ...r.root };
    if (r)
      last = { pose: r.m.pose, lift: r.m.lift, root: { ...root }, eyes: [0, 0], blink: 0, hands: r.hands ?? undefined };
    frames[i] = { ...last, root: { ...root } };
  }
  D.stop();
}

/** (6) A clip of the everyday, through Motion3 as the world drives it: "before" plan 58 off, or the
 *  other one of a pair facing her. The seat's drop as the world's view lays it on. */
function everyday(x: Ctx, clip: Clip, which: "after" | "before", rate: number): Frame[] {
  const n = Math.round(clip.len * rate) + 1;
  const pair = which === "before" && clip.pair;
  const m3 = new x.C.Motion3(pair ? 0.71 : 0.3);
  m3.v2 = which === "after" || !!pair;
  m3.tension = x.T;
  m3.gait = x.gait ?? "calm";
  const out: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const inp: MotionIn = {
      dist: 0,
      walking: false,
      speed: 0,
      sit: false,
      typing: false,
      speaking: false,
      emote: "",
      reduced: false,
      ...clip.motion?.(t),
    };
    if (pair && inp.act) inp.act = { ...inp.act, what: clip.pair?.act ?? inp.act.what };
    const o = m3.update(1 / rate, inp);
    // (the view's: down by the seat's drop as it settles — the old's by its own ease either way)
    const k = m3.v2 ? o.settle : inp.sit ? o.settle : 1 - o.settle;
    const drop = clip.props && (inp.sit || o.settle < 1) ? (inp.seatDrop ?? -0.34) * k : 0;
    out.push({
      pose: o.pose,
      lift: [o.lift[0], o.lift[1] + drop, o.lift[2]],
      root: pair ? { x: 0, y: 0, z: clip.pair?.d ?? 1.2, yaw: Math.PI } : still(),
      eyes: o.eyes ? [o.eyes[0], o.eyes[1]] : [0, 0],
      blink: o.blink,
      hands: o.hands ?? undefined,
      reach: o.reach,
    });
  }
  return out;
}
