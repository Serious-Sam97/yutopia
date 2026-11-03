import { KH_MOVE, SWIM, wadeK } from "@yutopia/shared/move";
import { box3, type SolidBox3 } from "@yutopia/shared/shapes";
import type { Moved } from "@/world/chars";
import type { Clip, Ctx, Frame } from "./clips";

// Plan 66 phase 4 (docs/plan/66-the-water.md): the swim body on the bench — each mode and the ways
// between them, driven through chars/anim/swim.ts's `Swim2` and `wade2` as the world will drive them.
// A small stand-in for the move core (shared/move/swim.ts's numbers: afloat from 1.45 m, the feet
// riding 1.25 under, the bob, the speeds, the duck dive's push, floating up, standing where the bed
// comes up, wading slowed by `wadeK`) moves the body along +z; the water drawn at its level.

type SwimM = NonNullable<ReturnType<Ctx["C"]["swimNow"]>>;
/** What the keys say at a moment: how hard ahead (0..1), Shift, C held (under), the look's pitch, run. */
export interface SwimKeys {
  go: number;
  fast?: boolean;
  under?: boolean;
  pitch?: number;
  /** on the dock, jogging (to the dive) */
  run?: boolean;
}
export interface SwimScript {
  level: number;
  /** the bed under z (default flat at 0) */
  bed?: (z: number) => number;
  /** the dock: its planks' top, its edge (z < edge is on it); a running jump off it into the water */
  deck?: { top: number; edge: number };
  start: { z: number; mode: "walk" | "swim" | "under"; y?: number };
  /** a cycle's clip: its speed so the length holds whole cycles (`cycles` of the mode's stride) */
  cycles?: { n: number; stride: (x: Ctx, S: SwimM) => number };
  keys: (t: number) => SwimKeys;
}

const smooth = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};
const RUN = 4;
const RISE_TO = 4;

/** A swim clip worked out, `rate` frames a second. */
export function swimTable(x: Ctx, clip: Clip, rate: number): Frame[] | null {
  const S = x.C.swimNow();
  const sc = clip.swim;
  if (!S || !sc) return null;
  const n = Math.round(clip.len * rate) + 1;
  const dt = 1 / rate;
  const L = sc.level;
  const bed = sc.bed ?? (() => 0);
  const ground = (z: number) => (sc.deck && z < sc.deck.edge ? sc.deck.top : bed(z));
  const stride = x.H.walk2Stride(0);
  const runStride = x.H.run2Stride(0);
  // (a cycle's clip: the speed that fits its cycles in the length)
  const k0 = sc.keys(0);
  let fit: number | null = null;
  if (sc.cycles) fit = (sc.cycles.n * sc.cycles.stride(x, S)) / clip.len;
  const speedOf = (mode: string, k: SwimKeys, over: number) =>
    fit ??
    (mode === "walk"
      ? (k.run ? RUN : KH_MOVE.walk * wadeK(over)) * k.go
      : mode === "under"
        ? (k.fast ? SWIM.underFast : SWIM.under) * k.go
        : (k.fast ? SWIM.crawl : SWIM.speed) * k.go);
  let mode: "walk" | "swim" | "under" | "air" = sc.start.mode;
  let z = sc.start.z;
  let y = sc.start.y ?? (mode === "walk" ? ground(z) : L - SWIM.ride);
  let vy = 0;
  let v = speedOf(mode, k0, Math.max(0, L - y));
  let air = { t: 0, T: 1, vz: 0 };
  let wasUnder = !!k0.under;
  let walkPh = 0;
  let runPh = 0;
  const bobHz = 1 / clip.len;
  const sw = new S.Swim2();
  const inp = (k: SwimKeys) => ({
    swim: mode === "swim" ? 2 : mode === "under" ? 3 : 0,
    speed: v,
    fast: !!k.fast,
    sea: L - y,
    pitch: k.pitch ?? 0,
    dive: mode === "air" ? Math.min(1, air.t / air.T) : null,
  });
  sw.settle(inp(k0));
  const out: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const k = sc.keys(t);
    const top = L - SWIM.ride + SWIM.bob * Math.sin(t * 2 * Math.PI * bobHz);
    // ── the stand-in core
    if (mode === "walk") {
      const over = Math.max(0, L - ground(z));
      const want = speedOf(mode, k, over);
      v += Math.max(-4 * dt, Math.min(4 * dt, want - v));
      z += v * dt;
      y = ground(z);
      if (sc.deck && k.run && z > sc.deck.edge - 0.35) {
        // (off the edge: a running jump, as far as it falls to the water)
        mode = "air";
        vy = 3;
        const d = sc.deck.top - (L - 0.25);
        const T = (vy + Math.sqrt(vy * vy + 2 * 9.81 * d)) / 9.81;
        air = { t: 0, T, vz: v };
      } else if (L - bed(z) >= SWIM.enter && !(sc.deck && z < sc.deck.edge)) mode = "swim";
    } else if (mode === "air") {
      air.t += dt;
      vy -= 9.81 * dt;
      y += vy * dt;
      z += air.vz * dt;
      v = air.vz;
      if (y <= L - 0.25) {
        mode = vy < -7 ? "under" : "swim";
        vy *= 0.25;
        v = Math.min(v, 2.5);
      }
    } else {
      // (C pressed: under, and again up)
      if (!!k.under !== wasUnder) {
        mode = k.under ? "under" : "swim";
        if (mode === "under") vy = -SWIM.sink;
      }
      const want = speedOf(mode, k, 0);
      v += Math.max(-SWIM.accel * dt, Math.min(SWIM.accel * dt, want - v));
      const pitch = mode === "under" ? (k.pitch ?? 0) : 0;
      z += v * Math.cos(pitch) * dt;
      if (mode === "swim") {
        vy = Math.max(-2, Math.min(2, (top - y) * RISE_TO));
        if (bed(z) > top - 0.1) {
          mode = "walk";
          vy = 0;
        }
      } else {
        const vzWant = want * Math.sin(pitch) + (k.go < 0.05 ? SWIM.buoy : 0);
        vy += (vzWant - vy) * Math.min(1, 4 * dt);
        if (y >= top - 0.02 && vy > 0) {
          mode = "swim";
          vy = 0;
        }
      }
      y = mode === "walk" ? ground(z) : Math.max(bed(z), y + vy * dt);
    }
    wasUnder = !!k.under;
    // ── the land's pose (walking, wading, the run to the edge): the bench's own walk and idle
    const walking = mode === "walk" || mode === "air";
    let land: Moved;
    if ((walking && k.run) || mode === "air") {
      runPh += (v * dt) / runStride;
      land = x.H.run2Pose(runPh % 1, 0, 0);
    } else {
      walkPh += (v * dt) / stride;
      const idle = x.H.idle2Pose(t, 0, 3, false);
      const walk = x.H.walk2Pose(walkPh % 1, 0);
      const u = smooth(v / 0.4);
      land = {
        pose: x.C.blend(idle.pose, walk.pose, u),
        lift: [
          idle.lift[0] + (walk.lift[0] - idle.lift[0]) * u,
          idle.lift[1] + (walk.lift[1] - idle.lift[1]) * u,
          idle.lift[2] + (walk.lift[2] - idle.lift[2]) * u,
        ],
      };
    }
    // (the water over the feet, afloat too: the wade's layer under the swim, as the world will have it)
    const waded = S.wade2(land, Math.max(0, L - y));
    // ── the swim over it
    const so = sw.update(dt, inp(k));
    const f = so ? S.mixSwum(waded, so, so.w) : waded;
    out.push({
      pose: f.m.pose,
      lift: f.m.lift,
      root: { x: 0, y, z, yaw: 0 },
      eyes: [0, 0],
      blink: 0,
      hands: Object.keys(f.hands).length ? f.hands : undefined,
    });
  }
  return out;
}

/** The dock: its top at `top`, its edge at z `edge`, going on `away` (+1 ahead, −1 behind), `half` m
 *  to each side (a jetty: narrow, so the ¾ view sees round it). */
const dock = (top: number, edge: number, away: 1 | -1, half: number): SolidBox3[] => [
  box3(-half, edge, half, edge + away * 6, 0, top),
];

/** The clips, in the bench's "swim (plan 66)" group: the modes, then the ways between them. */
export function swimClips(): Clip[] {
  const clip = (
    name: string,
    len: number,
    swim: SwimScript,
    look: number,
    rise: number,
    more: Partial<Clip> = {},
  ): Clip => ({
    name: `swim: ${name}`,
    group: "swim (plan 66)",
    len,
    water: swim.level,
    look: () => look,
    rise,
    swim,
    live: () => ({ speed: 0 }),
    ...more,
  });
  const go = (k: SwimKeys) => () => k;
  const D = 2.0; // the water's level in the open clips (the bed at 0)
  const strideOf = (m: "breast" | "crawl" | "under") => (_: Ctx, S: SwimM) => S.STRIDE[m];
  // (the slope out of the water: a shore, its shelf down to 2 m deep)
  const shore = (z: number) => (z < 0.5 ? 0.6 : Math.max(-2, 0.6 - 0.32 * (z - 0.5)));
  const shoreUp = (z: number) => shore(8 - z);
  return [
    // ── the modes, looping
    clip("tread", 2 * 1.4, { level: D, start: { z: 0, mode: "swim" }, keys: go({ go: 0 }) }, D - 0.45, 1.0),
    clip(
      "breaststroke",
      (2 * 1.5) / 1.3,
      { level: D, start: { z: 0, mode: "swim" }, cycles: { n: 2, stride: strideOf("breast") }, keys: go({ go: 1 }) },
      D - 0.3,
      1.2,
    ),
    clip(
      "crawl",
      (2 * 2.4) / 2.3,
      {
        level: D,
        start: { z: 0, mode: "swim" },
        cycles: { n: 2, stride: strideOf("crawl") },
        keys: go({ go: 1, fast: true }),
      },
      D - 0.3,
      1.2,
    ),
    clip(
      "under",
      (2 * 2.2) / 1.4,
      {
        level: 2.4,
        start: { z: 0, mode: "under", y: 0.3 },
        cycles: { n: 2, stride: strideOf("under") },
        keys: go({ go: 1, under: true }),
      },
      1.4,
      1.35,
    ),
    clip(
      "wade knee-deep",
      2.4,
      {
        level: 0.5,
        start: { z: 0, mode: "walk" },
        cycles: { n: 2, stride: (x) => x.H.walk2Stride(0) },
        keys: go({ go: 1 }),
      },
      0.85,
      0.55,
    ),
    clip(
      "wade waist-deep",
      3.2,
      {
        level: 1.05,
        start: { z: 0, mode: "walk" },
        cycles: { n: 2, stride: (x) => x.H.walk2Stride(0) },
        keys: go({ go: 1 }),
      },
      0.9,
      0.6,
    ),
    // ── the dives
    clip(
      "duck dive",
      4,
      {
        level: 2.4,
        start: { z: 0, mode: "swim" },
        keys: (t) => ({ go: 1, under: t >= 1.2, pitch: -0.45 * (1 - smooth((t - 2.0) / 0.8)) }),
      },
      1.5,
      1.3,
    ),
    clip(
      "dive in",
      5,
      {
        level: 1.6,
        deck: { top: 2.05, edge: 0 },
        start: { z: -RUN * 1.1, mode: "walk" },
        keys: (t) => ({ go: 1, run: t < 1.6 }),
      },
      0.9,
      0.8,
      // (the camera on her height, the dock's top drawn as the ground it is)
      { props: dock(2.05, 0, -1, 1.2), ground: (_x, z) => (z < 0 ? 2.05 : 0) },
    ),
    // ── the ways between
    clip(
      "tread → breaststroke → crawl",
      7.6,
      {
        level: D,
        start: { z: 0, mode: "swim" },
        keys: (t) => ({ go: t < 1.4 || t >= 5.8 ? 0 : 1, fast: t >= 3.6 && t < 5.8 }),
      },
      D - 0.3,
      1.2,
    ),
    clip(
      "surface → under → surface",
      6.5,
      {
        level: 2.4,
        start: { z: 0, mode: "swim" },
        keys: (t) => ({
          go: 1,
          under: t >= 1.5,
          pitch: -0.5 * (1 - smooth((t - 2.2) / 0.6)) + 0.6 * smooth((t - 3.0) / 0.6),
        }),
      },
      1.5,
      1.3,
    ),
    clip(
      "walk → wade → float",
      10,
      { level: 0.4, bed: shore, start: { z: -1, mode: "walk" }, keys: go({ go: 1 }) },
      0.7,
      1.0,
      { ground: (_x, z) => shore(z) },
    ),
    clip(
      "swim → stand → wade out",
      9,
      { level: 0.4, bed: shoreUp, start: { z: 0, mode: "swim" }, keys: go({ go: 1 }) },
      0.7,
      1.0,
      { ground: (_x, z) => shoreUp(z) },
    ),
  ];
}
