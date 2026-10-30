import type { Grid } from "@yutopia/shared";
import type { Collider, FlowWorld, Mover } from "@yutopia/shared/move";
import { FLOW_MOVES } from "@yutopia/shared/move/flow-moves";
import {
  CharacterMover,
  type Frame,
  JoltCollider,
  type Land,
  loadJolt,
  PhysicsWorld,
  sizesFor,
} from "@yutopia/shared/physics";
import { box3, type Solid3 } from "@yutopia/shared/shapes";
import * as T3 from "three";

// /dev/move's pad on Jolt (docs/plan/56-the-controls.md H.1, phase 1b): the sandbox's tops as
// Jolt boxes, its dummies as posts, and what the grid couldn't have — two chunks of land (ramps at
// 20°, 35° and 50°, a bumpy hill), a lamp post, a trunk, a fence, a thin wall and balls loose to
// knock about — moved through by the world's own Jolt character (shared/physics CharacterMover)
// and asked by the world's own questions (JoltCollider), so the feel signed off here is the world's.

/** The land: x 0..64, z 64..96 (two of the Grounds' 32 m chunks, named as the Grounds' are). */
export const LAND = { x0: 0, x1: 64, z0: 64, z1: 96 };
const CHUNK = 32;
const STEP = 0.5;
/** The strip between the footings and the land: the posts, the fence, the wall, the balls. */
export const YARD = { z0: 50, z1: 64 };
const RAMPS: { x0: number; x1: number; deg: number }[] = [
  { x0: 2, x1: 10, deg: 20 },
  { x0: 12, x1: 20, deg: 35 },
  { x0: 22, x1: 30, deg: 50 },
];
const PLATEAU = 3;
/** How tall the pad's walls stand (drawn, and in Jolt). */
export const WALL_H = 3.5;

/** The land's height at (x, z): the ramps up to a 3 m plateau, then a hill with bumps on it. */
export function landHeight(x: number, z: number): number {
  if (x < 32) {
    const r = RAMPS.find((p) => x >= p.x0 && x <= p.x1);
    if (!r) return 0;
    return Math.max(0, Math.min(PLATEAU, (z - 70) * Math.tan((r.deg * Math.PI) / 180)));
  }
  const hill = 4 * Math.exp(-((x - 48) ** 2 + (z - 80) ** 2) / 60);
  return hill + 0.25 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.25;
}
export const onPadLand = (x: number, y: number) => y >= LAND.z0 && y < LAND.z1 && x >= LAND.x0 && x < LAND.x1;

// the yard's things (tiles; y up)
const POLE = { x: 8, z: 57, r: 0.09, h: 4.2 };
const TRUNK = { x: 14, z: 57, r: 0.35, h: 6 };
const FENCE = { x0: 19, x1: 26, z: 57, t: 0.08, h: 1.1 };
const THIN = { x0: 30, x1: 38, z: 57, t: 0.2, h: 2.5 };
const BALLS = [0.11, 0.15, 0.2, 0.25, 0.3, 0.12];
// Flowmotion's (docs/plan/56-the-controls.md F, phase 7): two rails to grind (one a jump up, one a
// jump and a jump in the air), a tall wall to run up, a long one to run along; the pole, the
// trunk, the thin wall and the pad's own edges tagged too
const RAIL_LOW = { x0: 4, x1: 20, z: 61, t: 0.08, h: 0.9 };
const RAIL_HIGH = { x0: 24, x1: 40, z: 61, t: 0.08, h: 1.7 };
const CLIMB = { x0: 60, x1: 70, z: 61, t: 0.6, h: 6 };
const ALONG = { x0: 72, x1: 94, z: 61, t: 0.6, h: 4.5 };

export interface JoltPad {
  collider: Collider;
  mover: Mover;
  /** the world's things a frame on (the balls) */
  step(dt: number): void;
  /** how far from (x, y, z) along the unit (dx, dy, dz) the first solid is (the camera's) */
  ray(x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number): number | null;
  /** its look: the land, the yard's things, the balls */
  mesh: T3.Object3D;
  labels: [string, number, number][];
  /** where the balls are (tests) */
  balls(): [number, number, number][];
  /** what Flowmotion can run up, swing round, grind along */
  flow: FlowWorld;
  dispose(): void;
}

/** The pad's tops (x, y, h tiles: Infinity a wall), the pad's size, its dummies' tiles. */
export async function joltPad(
  tops: [number, number, number][],
  size: { w: number; h: number },
  dummies: [number, number][],
): Promise<JoltPad> {
  const isDummy = (x: number, y: number) => dummies.some(([dx, dy]) => dx === x && dy === y);
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === size.w - 1 || y === size.h - 1;
  const boxes: Solid3[] = [];
  for (const [x, y, h] of tops) {
    if (isDummy(x, y)) continue;
    // (a wall stands 3.5 m, as drawn; the pad's edge 10, so nothing's jumped out over it)
    const top = Number.isFinite(h) ? h : edge(x, y) ? 10 : WALL_H;
    boxes.push(box3(x, y, x + 1, y + 1, 0, top));
  }
  const posts: Solid3[] = dummies.map(([x, y]) => ({ t: "cyl", x: x + 0.5, z: y + 0.5, r: 0.38, y0: 0, y1: 1.9 }));
  const yard: Solid3[] = [
    { t: "cyl", x: POLE.x, z: POLE.z, r: POLE.r, y0: 0, y1: POLE.h },
    { t: "cyl", x: TRUNK.x, z: TRUNK.z, r: TRUNK.r, y0: 0, y1: TRUNK.h },
    box3(FENCE.x0, FENCE.z - FENCE.t / 2, FENCE.x1, FENCE.z + FENCE.t / 2, 0, FENCE.h),
    box3(THIN.x0, THIN.z - THIN.t / 2, THIN.x1, THIN.z + THIN.t / 2, 0, THIN.h),
    ...[RAIL_LOW, RAIL_HIGH, CLIMB, ALONG].map((r) => box3(r.x0, r.z - r.t / 2, r.x1, r.z + r.t / 2, 0, r.h)),
  ];
  // the floor: everywhere but the land
  const floor: Solid3[] = [box3(0, 0, size.w, LAND.z0, -1, 0), box3(LAND.x1, LAND.z0, size.w, size.h, -1, 0)];
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, things: BALLS.length + 4 }));
  world.setStatic("pad", boxes);
  world.setStatic("posts", posts);
  world.setStatic("yard", yard);
  world.setStatic("floor", floor, "floor");
  const lands: Land[] = [];
  for (let cx = LAND.x0 / CHUNK; cx < LAND.x1 / CHUNK; cx++) {
    const n = CHUNK / STEP + 1;
    const h = new Float32Array(n * n);
    const x0 = cx * CHUNK;
    const z0 = LAND.z0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = landHeight(x0 + i * STEP, z0 + j * STEP);
    const land: Land = { x0, z0, n, step: STEP, h };
    lands.push(land);
    // (named as the Grounds' chunks: the collider and the mover ask for `land:cx,cz` before they
    // trust the land there)
    world.setLand(`land:${cx},${z0 / CHUNK}`, land);
  }
  const balls = BALLS.map((r, i) => ({ r, id: world.addThing({ kind: "ball", r }, 44 + i * 2, r + 0.5, 57) }));
  world.settle();

  // the collider asks its grid only where the land is (the pad's floor is all Jolt's)
  const landGrid = {
    onLand: onPadLand,
    onRamp: () => false,
    speedAt: () => 1,
  } as unknown as Grid;
  const frame: Frame = { ox: 0, oy: 0, elev: 0 };
  const collider = new JoltCollider(world, landGrid, frame);
  const mover = new CharacterMover(
    world,
    () => frame,
    () => ({ mask: "all", pass: null }),
    onPadLand,
  );
  // up and down the hills at the body's own pace (H.3; the world's mover keeps today's way till
  // the sign-off)
  mover.along = true;

  // ── its look
  const mesh = new T3.Group();
  const snow = new T3.MeshLambertMaterial({ color: "#e8edf1", flatShading: true });
  for (const l of lands) {
    const side = (l.n - 1) * l.step;
    const g = new T3.PlaneGeometry(side, side, l.n - 1, l.n - 1).rotateX(-Math.PI / 2);
    const p = g.attributes.position as T3.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + l.x0 + side / 2;
      const z = p.getZ(i) + l.z0 + side / 2;
      p.setXYZ(i, x, landHeight(x, z), z);
    }
    g.computeVertexNormals();
    const m = new T3.Mesh(g, snow);
    m.receiveShadow = true;
    m.castShadow = true;
    mesh.add(m);
  }
  const iron = new T3.MeshLambertMaterial({ color: "#3d4248" });
  const bark = new T3.MeshLambertMaterial({ color: "#6b4a33" });
  const wood = new T3.MeshLambertMaterial({ color: "#8a6a48" });
  const concrete = new T3.MeshLambertMaterial({ color: "#7d838a" });
  const put = (m: T3.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    mesh.add(m);
  };
  put(new T3.Mesh(new T3.CylinderGeometry(POLE.r, POLE.r, POLE.h, 12), iron), POLE.x, POLE.h / 2, POLE.z);
  put(
    new T3.Mesh(new T3.SphereGeometry(0.22, 12, 8), new T3.MeshBasicMaterial({ color: "#ffe6a8" })),
    POLE.x,
    POLE.h,
    POLE.z,
  );
  put(new T3.Mesh(new T3.CylinderGeometry(TRUNK.r * 0.9, TRUNK.r, TRUNK.h, 10), bark), TRUNK.x, TRUNK.h / 2, TRUNK.z);
  put(
    new T3.Mesh(new T3.BoxGeometry(FENCE.x1 - FENCE.x0, FENCE.h, FENCE.t), wood),
    (FENCE.x0 + FENCE.x1) / 2,
    FENCE.h / 2,
    FENCE.z,
  );
  put(
    new T3.Mesh(new T3.BoxGeometry(THIN.x1 - THIN.x0, THIN.h, THIN.t), concrete),
    (THIN.x0 + THIN.x1) / 2,
    THIN.h / 2,
    THIN.z,
  );
  const steel = new T3.MeshLambertMaterial({ color: "#c9a14a" });
  for (const r of [RAIL_LOW, RAIL_HIGH])
    put(new T3.Mesh(new T3.BoxGeometry(r.x1 - r.x0, r.h, r.t), steel), (r.x0 + r.x1) / 2, r.h / 2, r.z);
  for (const w of [CLIMB, ALONG])
    put(new T3.Mesh(new T3.BoxGeometry(w.x1 - w.x0, w.h, w.t), concrete), (w.x0 + w.x1) / 2, w.h / 2, w.z);
  const ballMat = new T3.MeshLambertMaterial({ color: "#d8423a" });
  const ballMeshes = balls.map((b) => {
    const m = new T3.Mesh(new T3.SphereGeometry(b.r, 16, 12), ballMat);
    m.castShadow = true;
    mesh.add(m);
    return m;
  });
  const at: [number, number, number] = [0, 0, 0];
  const drawBalls = () => {
    balls.forEach((b, i) => {
      if (b.id !== null && world.thingAt(b.id, at)) ballMeshes[i].position.set(at[0], at[1], at[2]);
    });
  };
  drawBalls();

  let acc = 0;
  return {
    collider,
    mover,
    step(dt: number) {
      acc = Math.min(acc + dt, 0.25);
      while (acc >= 1 / 60) {
        world.step(1 / 60);
        acc -= 1 / 60;
      }
      drawBalls();
    },
    ray(x, y, z, dx, dy, dz, max) {
      const a = world.rayHit(x, y, z, dx, dy, dz, max, "tops");
      const b = world.rayHit(x, y, z, dx, dy, dz, max, "land");
      return a === null ? b : b === null ? a : Math.min(a, b);
    },
    mesh,
    flow: flowWorld(size),
    balls: () => ballMeshes.map((m) => [m.position.x, m.position.y, m.position.z]),
    labels: [
      ["ramps 20° · 35° · 50°", 16, LAND.z0 + 4],
      ["hill", 48, LAND.z0 + 4],
      ["lamp post", POLE.x, POLE.z - 2],
      ["trunk", TRUNK.x, TRUNK.z - 2],
      ["fence 1.1", (FENCE.x0 + FENCE.x1) / 2, FENCE.z - 2],
      ["thin wall 0.2", (THIN.x0 + THIN.x1) / 2, THIN.z - 2],
      ["balls", 49, 55],
      ["rail 0.9", (RAIL_LOW.x0 + RAIL_LOW.x1) / 2, RAIL_LOW.z - 1.5],
      ["rail 1.7", (RAIL_HIGH.x0 + RAIL_HIGH.x1) / 2, RAIL_HIGH.z - 1.5],
      ["run up it", (CLIMB.x0 + CLIMB.x1) / 2, CLIMB.z - 1.5],
      ["run along it", (ALONG.x0 + ALONG.x1) / 2, ALONG.z - 1.5],
    ],
    dispose() {
      (mover as CharacterMover).dispose();
      world.destroy();
      mesh.traverse((o) => {
        if (o instanceof T3.Mesh) o.geometry.dispose();
      });
    },
  };
}

// Flowmotion's world here (pure geometry, the pieces as tagged): walls as lines with a thickness, the
// poles, the rails' tops
function flowWorld(size: { w: number; h: number }): FlowWorld {
  const R = 0.25; // (a body's radius)
  const walls = [
    { ...THIN, run: false },
    { ...CLIMB, run: true },
    { ...ALONG, run: true },
    // (the pad's edges: a wall a tile thick at each side, as high as Jolt has them)
    { x0: 0, x1: size.w, z: 0.5, t: 1, h: 10, run: true },
    { x0: 0, x1: size.w, z: size.h - 0.5, t: 1, h: 10, run: true },
  ];
  const sides = [
    { x: 0.5, z0: 0, z1: size.h, t: 1, h: 10 },
    { x: size.w - 0.5, z0: 0, z1: size.h, t: 1, h: 10 },
  ];
  const poles = [
    { x: POLE.x, y: POLE.z, r: POLE.r, top: POLE.h },
    { x: TRUNK.x, y: TRUNK.z, r: TRUNK.r, top: TRUNK.h },
  ];
  return {
    moves: FLOW_MOVES,
    pole(x, y, z, reach) {
      for (const p of poles) if (Math.hypot(x - p.x, y - p.y) - p.r - R < reach && z < p.top) return p;
      return null;
    },
    wall(x, y, z, _ux, _uy, reach) {
      let best: { nx: number; ny: number; d: number; top: number; run: boolean } | null = null;
      const face = (cx: number, cy: number, t: number, top: number, run: boolean) => {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const d = dist - t / 2 - R;
        if (d < reach && z < top && (!best || d < best.d)) best = { nx: dx / dist, ny: dy / dist, d, top, run };
      };
      for (const w of walls) face(Math.max(w.x0, Math.min(w.x1, x)), w.z, w.t, w.h, w.run);
      for (const w of sides) face(w.x, Math.max(w.z0, Math.min(w.z1, y)), w.t, w.h, true);
      return best;
    },
    rail(x, y, z, reach) {
      for (const r of [RAIL_LOW, RAIL_HIGH, FENCE]) {
        if (x < r.x0 || x > r.x1 || Math.abs(y - r.z) > reach || Math.abs(z - r.h) > 0.5) continue;
        return { x, y: r.z, z: r.h, ux: 1, uy: 0, back: x - r.x0, ahead: r.x1 - x };
      }
      return null;
    },
  };
}
