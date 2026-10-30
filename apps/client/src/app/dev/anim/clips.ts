import { Grid, type JumpKind, jumpArc, jumpNowAt, jumpTimes } from "@yutopia/shared";
import { KH_FEEL, KH_MOVE, type MoveEnv, type MoveInput, NO_INPUT, newBody, stepBody } from "@yutopia/shared/move";
import type { LocoIn, Moved } from "@/world/chars";

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
}
export interface Clip {
  name: string;
  group: string;
  /** seconds shown (a whole number of cycles, so the loop joins) */
  len: number;
  raw?: { after: (x: Ctx, t: number) => Moved; before?: (x: Ctx, t: number) => Moved; root?: (t: number) => Root };
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
      out.push({ pose: m.pose, lift: m.lift, root: r?.root?.(t) ?? still(), eyes: [0, 0], blink: 0 });
    }
    return out;
  }
  if (!clip.live) return null;
  // driven: as the sandbox drives it — the body's speed, its change and its turn; Locomotion's layers
  const loco = new x.C.Locomotion(KH_FEEL);
  loco.v2 = which === "after";
  loco.tension = x.T;
  loco.seed = 3;
  loco.gait = x.gait ?? "calm";
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
  const body = newBody(100, 100, 0, Math.PI / 2);
  const env: MoveEnv = { grid: open(), footing: () => "floor" };
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
    if (G) {
      const at = G(px, pz);
      rideY = i === 0 ? at : rideY + (at - rideY) * Math.min(1, dt * 16);
    }
    const ry = yaw;
    const ground = G
      ? (lx: number, lz: number) =>
          G(px + lx * Math.cos(ry) + lz * Math.sin(ry), pz - lx * Math.sin(ry) + lz * Math.cos(ry)) - rideY
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
        aim: !!keysNow?.aim,
        pitch: 0,
        yaw: 0,
        turn,
        accel: acc,
        up,
        jump: clip.keys ? x.C.jumpNowOf(body, KH_FEEL) : d.jump && jt >= 0 ? jumpNowAt(d.jump.kind, jt) : null,
        landed,
        verb: st >= 0 && st < 1 ? { kind: "slide", t: st } : null,
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
      root: { x: px, y: (clip.keys ? body.z : (arc?.h ?? 0)) + rideY, z: pz, yaw },
      eyes: g ? [g.eyes[0], g.eyes[1]] : [0, 0],
      blink: g?.blink ?? 0,
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
