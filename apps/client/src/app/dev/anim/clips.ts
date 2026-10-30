import { type JumpKind, jumpArc, jumpNowAt, jumpTimes } from "@yutopia/shared";
import { KH_FEEL, KH_MOVE } from "@yutopia/shared/move";
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
    raw: { after: (x, t) => x.H.idle2Pose(t, x.T, 3, false) },
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
    (x) => x.H.walk2Stride(x.T),
    (x, ph) => x.H.walk2Pose(ph, x.T),
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
  // ── on the move: driven, as the game does it
  add({
    name: "start, jog, stop",
    group: "on the move",
    len: 3.2,
    live: (t) => ({ speed: t < 0.4 ? 0 : t < 2.2 ? JOG : 0 }),
  });
  add({
    name: "sprint, skid",
    group: "on the move",
    len: 3.2,
    live: (t) => ({ speed: t < 0.3 ? 0 : t < 1.8 ? SPRINT : 0 }),
  });
  // (3b) a hard sprint, then standing to get the breath back
  add({
    name: "sprint, then winded",
    group: "on the move",
    len: 16,
    live: (t) => ({ speed: t < 0.3 ? 0 : t < 6 ? SPRINT : 0 }),
  });
  add({ name: "jog round", group: "on the move", len: 4, live: () => ({ speed: JOG, turn: 2.2 }) });
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
  const dt = 1 / rate;
  let v = 0;
  let acc = 0;
  let yaw = 0;
  let px = 0;
  let pz = 0;
  let was: ReturnType<typeof jumpArc>["stage"] | null = null;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const d = clip.live(t);
    // (the body's own ramp: the feel's grip, about 0.2 s to a run and 0.25 s to a stop)
    const want = d.speed;
    const grip = want > v ? 30 : 24;
    const nv = v + Math.max(-grip * dt, Math.min(grip * dt, want - v));
    acc += ((nv - v) / dt - acc) * Math.min(1, dt * 10);
    v = nv;
    // (a turn's rate + to the right, as the floor's y is south: the yaw + to the left)
    const turn = d.turn ?? 0;
    yaw -= turn * dt;
    px += Math.sin(yaw) * v * dt;
    pz += Math.cos(yaw) * v * dt;
    const jt = d.jump ? t - d.jump.at : -1;
    const arc = d.jump && jt >= 0 ? jumpArc(d.jump.kind, jt) : null;
    const up = arc?.stage === "air";
    const landed = was === "air" && arc && arc.stage !== "air" ? 0.5 : undefined;
    was = arc?.stage ?? null;
    const st = d.slide !== undefined ? (t - d.slide) / x.C.VERB_LEN.slide : -1;
    const standing = loco.v2 ? x.H.idle2Pose(t, x.T, 3, true, loco.life()) : undefined;
    const m = loco.update(
      dt,
      {
        dist: v * dt,
        speed: v,
        ahead: v,
        left: 0,
        crouch: false,
        aim: false,
        pitch: 0,
        yaw: 0,
        turn,
        accel: acc,
        up,
        jump: d.jump && jt >= 0 ? jumpNowAt(d.jump.kind, jt) : null,
        landed,
        verb: st >= 0 && st < 1 ? { kind: "slide", t: st } : null,
        reduced: false,
      } satisfies LocoIn,
      standing,
    );
    const g = loco.gazeOut;
    out.push({
      pose: m.pose,
      lift: m.lift,
      root: { x: px, y: arc?.h ?? 0, z: pz, yaw },
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
 *  0.6 rad/s at once) more than the samples 3 ms either side do — a break, a spike off the trend;
 *  a hard swing, or a speed-up that steps, keeps to the trend. */
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
      if (Math.abs(d2[i] - (d2[i - S] + d2[i + S]) / 2) < c.least) continue;
      const t = Math.round(((i + 1) / POP_RATE) * RATE);
      const set = hits.get(t) ?? new Set();
      set.add(c.name);
      hits.set(t, set);
    }
  }
  return [...hits].sort((a, b) => a[0] - b[0]).map(([i, set]) => ({ t: i / RATE, what: [...set].join(", ") }));
}
