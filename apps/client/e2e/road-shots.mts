/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/69-the-long-road.md: the stills, in the game as Ana (the dev stack, :3100 and
// :8100, the machine's GPU), with a mock of the long road patched into the 3D view from here — no
// game code. The mock (road-course.mts has its shape):
//   - L4, L6: the land past today's Grounds in rings round the camera (2 m near, then 8, 32 and
//     128 m out to 24 km), in the game's own land material (its snow, its light), the forest's
//     canopy tinted into the far rings; the camera's far plane and the air's haze pushed out;
//   - L5: the forest in three tiers — the game's own trees near (its spruces, birches and bare
//     trees), its far trees out to ~1.8 km, clumps of them out to ~5 km;
//   - L3: the road — asphalt, its lines, guard rails over drops, reflector posts, snow poles over
//     the treeline, the bridges on piers, signs;
//   - L7: the rest stop, the pull-out, the lookout's deck, the jetty and cabins, the lake's ice;
//   - the barricade taken away (its meshes hidden) and the painted ridges gone.
// The physics is today's (Ana stands in town): the camera is set by hand before each frame.
//   node --experimental-strip-types e2e/road-shots.mts [out dir]
//   QUALITY=low|medium; SPOTS=wood,…; STATES=noon,…; SHEETS=1: only the contact sheets
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page, request } from "@playwright/test";
import { landBounds, PINE_H, pineVariant, terrainAt, treesIn } from "@yutopia/shared/grounds";
import {
  ALT,
  at,
  BEND,
  bridged,
  CREEK,
  cellRng,
  creekWater,
  forest,
  LAKE,
  LOOKOUT,
  lakeR,
  landAt,
  N,
  PADS,
  PASS,
  padAt,
  REST,
  ROAD_W,
  S,
  SPINE,
  summit,
  surfaceAt,
  TREELINE,
} from "./road-course.mts";

// (the land's box: shared land.ts — docs/plan/69)
const GROUNDS = landBounds();

const out = resolve(process.argv[2] ?? "../../design/screens/road");
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const OX = 60; // the land's coords → Ana's tiles (a teleport's)
const OZ = 10;
// the game's own land, drawn west of this (inside its box); past it the mock's (its blocks there,
// past the box, carry today's edge ridges: hidden, and their trees)
const GAME_X = 512;
const inGame = (x: number, z: number) => x < GAME_X && x > GROUNDS.x0 && z > GROUNDS.z0 && z < GROUNDS.z1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// the game's surfaces' colours (tp/grounds3d.ts SURF)
const SURF: Record<string, number> = {
  snow: 0xf3f6f9,
  deep: 0xeef3f8,
  asphalt: 0xc4c8cc,
  ice: 0xc3d2dc,
  rock: 0x737880,
};
const hex = (h: number): [number, number, number] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const BLUE = hex(0xdbe5f0);
const CANOPY = hex(0x6a7a72);
// (a cheap smooth variation for the canopy's tone, 0 … 1)
const fbmish = (x: number, z: number) =>
  0.5 + 0.25 * Math.sin(x / 310 + Math.sin(z / 470) * 2) + 0.25 * Math.sin(z / 260 + Math.sin(x / 530) * 2);

// ── the land in rings round the camera ──
interface Ring {
  x0: number;
  z0: number;
  step: number;
  n: number; // samples a side
  h: string; // Float32 heights, base64
  c: string; // Uint8 rgb
  w: string; // Uint8 woods, a way near
  hole: [number, number, number, number] | null; // the finer ring's square (drawn there, not here)
}
const RINGS = [
  { size: 1000, step: 2 },
  { size: 4000, step: 8 },
  { size: 16000, step: 32 },
  { size: 48000, step: 128 },
];
function rings(cx: number, cz: number, skipGame: boolean): Ring[] {
  const outR: Ring[] = [];
  let hole: Ring["hole"] = null;
  for (const { size, step } of RINGS) {
    const x0 = Math.round((cx - size / 2) / step) * step;
    const z0 = Math.round((cz - size / 2) / step) * step;
    const n = size / step + 1;
    const h = new Float32Array(n * n);
    const c = new Uint8Array(n * n * 3);
    const w = new Uint8Array(n * n * 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = landAt(x0 + i * step, z0 + j * step);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const k = j * n + i;
        const hh = h[k];
        const hx = h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)];
        const hz = h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(hx, hz) / (2 * step);
        let dens = inGame(x, z) ? 0 : forest(x, z, hh, slope);
        if (inGame(x, z) && step >= 32) dens = Math.min(1, treesIn(Math.floor(x / 32), Math.floor(z / 32)).length / 70);
        const s = inGame(x, z) && step < 32 ? "snow" : surfaceAt(x, z, hh, slope, dens);
        let col = hex(SURF[s] ?? SURF.snow);
        if (s === "snow" || s === "deep") {
          const t = 0.35 + 0.35 * Math.sin(x * 0.05 + z * 0.031);
          col = col.map((v, q) => v + (BLUE[q] - v) * t) as typeof col;
        }
        // (the forest past where its trees are drawn: its canopy in the land's colour)
        const far = Math.hypot(x - cx, z - cz);
        const tint = dens * (0.72 + 0.2 * fbmish(x, z)) * smooth(3400, 5200, far);
        col = col.map((v, q) => v + (CANOPY[q] - v) * tint) as typeof col;
        // (the high land a little bluer: snow in shade, the air between)
        c[k * 3] = col[0];
        c[k * 3 + 1] = col[1];
        c[k * 3 + 2] = col[2];
        const road = s === "asphalt" ? 1 : 0;
        w[k * 2] = Math.round(Math.min(1, dens * 1.3) * 255);
        w[k * 2 + 1] = road * 255;
      }
    const enc = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
    outR.push({ x0, z0, step, n, h: enc(h), c: enc(c), w: enc(w), hole });
    hole = [x0 + step * 2, z0 + step * 2, x0 + size - step * 2, z0 + size - step * 2];
  }
  void skipGame;
  return outR;
}

// ── the trees round the camera ──
// a tree: x y z, its scale across and up, its turn, its pool (the game's: 0–5 spruces, 6–8 birches,
// 9–11 bare, 12 the far spruce, 14 the far birch, 15 the far bare)
function trees(cx: number, cz: number, farMode: boolean, look: [number, number]): Float32Array {
  const o: number[] = [];
  const keep = (x: number, z: number, r: number) => {
    // (behind the camera, past 300 m: not drawn)
    const dx = x - cx;
    const dz = z - cz;
    return r < 300 || dx * look[0] + dz * look[1] > -0.25 * r;
  };
  const put = (x: number, z: number, near: boolean, k: number, s: number, r: () => number, mid = 1) => {
    if (Math.hypot(x - cx, z - cz) < 6) return;
    const y = landAt(x, z);
    const h2 = landAt(x + 2.5, z);
    const slope = Math.abs(h2 - y) / 2.5;
    const dens = forest(x, z, y, slope);
    if (r() > dens) return;
    const nearCreek = CREEK.some((p, i) => i % 40 === 0 && Math.abs(p[0] - x) < 60 && Math.abs(p[1] - z) < 60);
    const kr = r();
    const kind = y > 260 ? "pine" : nearCreek && kr < 0.45 ? "birch" : kr < 0.72 ? "pine" : kr < 0.9 ? "birch" : "bare";
    const sc = (0.72 + 0.62 * r()) * (y > TREELINE - 40 ? 0.75 : 1) * s;
    const ry = r() * Math.PI * 2;
    const sy = 0.9 + r() * 0.2;
    if (kind === "pine") {
      const pv = pineVariant({ x, z, ry });
      // (tall spruces in the deep wood: plan 69 L5)
      const tall = y < 300 && r() < 0.18 ? 1.5 : 1;
      o.push(x, y - 0.25, z, sc * 1.45 * mid, sc * 1.45 * sy * tall * mid, ry, near ? pv : 12);
    } else if (kind === "birch") o.push(x, y - 0.25, z, sc * mid, sc * sy * mid, ry, near ? 6 + (k % 3) : 14);
    else o.push(x, y - 0.25, z, sc * 1.7 * mid, sc * sy * mid, ry, near ? 9 + (k % 3) : 15);
  };
  // near: the game's cell, the game's trees inside its Grounds (far mode only: else they're drawn)
  const CELL = 3.2;
  for (let j = Math.floor((cz - 520) / CELL); j < (cz + 520) / CELL; j++)
    for (let i = Math.floor((cx - 520) / CELL); i < (cx + 520) / CELL; i++) {
      const x = (i + 0.15 + 0.7 * cellRng(i, j, 1)) * CELL;
      const z = (j + 0.15 + 0.7 * cellRng(i, j, 2)) * CELL;
      const r = Math.hypot(x - cx, z - cz);
      if (r > 520 || inGame(x, z) || !keep(x, z, r)) continue;
      let seed = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      put(x, z, r < 420, i + j, 1, rnd);
    }
  if (farMode)
    for (let cj = Math.floor((GROUNDS.z0 + 1) / 32); cj < GROUNDS.z1 / 32; cj++)
      for (let ci = Math.floor((GROUNDS.x0 + 1) / 32); ci < GAME_X / 32; ci++) {
        const mx = ci * 32 + 16;
        const mz = cj * 32 + 16;
        const r = Math.hypot(mx - cx, mz - cz);
        if (r > 5200) continue;
        const near = r < 420;
        const list = treesIn(ci, cj);
        for (const [q, t] of list.entries()) {
          if (!near && r > 1800 && q % 6) continue;
          if (!near && r > 520 && q % 2) continue;
          const sk = near ? 1 : r > 1800 ? 2.4 : r > 520 ? 1.4 : 1;
          if (t.kind === "pine")
            o.push(t.x, t.y - 0.25, t.z, t.s * 1.45 * sk, t.s * 1.45 * sk, t.ry, near ? pineVariant(t) : 12);
          else if (t.kind === "birch") o.push(t.x, t.y - 0.25, t.z, t.s * sk, t.s * sk, t.ry, near ? 6 : 14);
          else o.push(t.x, t.y - 0.25, t.z, t.s * 1.7 * sk, t.s * sk, t.ry, near ? 9 : 15);
        }
      }
  // the middle: far spruces, a 9.6 m cell, out to 1.8 km
  const MID = 9.6;
  for (let j = Math.floor((cz - 1800) / MID); j < (cz + 1800) / MID; j++)
    for (let i = Math.floor((cx - 1800) / MID); i < (cx + 1800) / MID; i++) {
      const x = (i + 0.1 + 0.8 * cellRng(i, j, 5)) * MID;
      const z = (j + 0.1 + 0.8 * cellRng(i, j, 6)) * MID;
      const r = Math.hypot(x - cx, z - cz);
      if (r < 520 || r > 1800 || inGame(x, z) || !keep(x, z, r)) continue;
      let seed = (Math.imul(i, 83492791) ^ Math.imul(j, 2654435761)) >>> 0;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      put(x, z, false, i + j, 1.35, rnd);
    }
  // far: clumps of them, a 26 m cell, out to 5.2 km
  const FAR = 26;
  for (let j = Math.floor((cz - 5200) / FAR); j < (cz + 5200) / FAR; j++)
    for (let i = Math.floor((cx - 5200) / FAR); i < (cx + 5200) / FAR; i++) {
      const x = (i + 0.1 + 0.8 * cellRng(i, j, 7)) * FAR;
      const z = (j + 0.1 + 0.8 * cellRng(i, j, 8)) * FAR;
      const r = Math.hypot(x - cx, z - cz);
      if (r < 1800 || r > 5200 || inGame(x, z) || !keep(x, z, r)) continue;
      // (thinning out into the canopy's colour)
      if (cellRng(i, j, 9) < smooth(3600, 5200, r)) continue;
      let seed = (Math.imul(i, 40503) ^ Math.imul(j, 2246822519)) >>> 0;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      put(x, z, false, i + j, 2.6, rnd);
    }
  return new Float32Array(o);
}

// ── the road and what lines it: triangles with their colours (land coords) ──
interface Geo {
  p: number[];
  c: number[];
}
const geo = (): Geo => ({ p: [], c: [] });
type V = [number, number, number];
function tri(g: Geo, a: V, b: V, c: V, col: number, shade = 1) {
  g.p.push(...a, ...b, ...c);
  const [r, gg, bb] = hex(col);
  for (let k = 0; k < 3; k++) g.c.push((r / 255) * shade, (gg / 255) * shade, (bb / 255) * shade);
}
function quad(g: Geo, a: V, b: V, c: V, d: V, col: number, shade = 1) {
  tri(g, a, b, c, col, shade);
  tri(g, a, c, d, col, shade);
}
/** a box, axis-free: its foot's middle, its direction along (dx, dz), its half sizes */
function box(
  g: Geo,
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  hl: number,
  hw: number,
  h: number,
  col: number,
) {
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const vx = -uz;
  const vz = ux;
  const P = (a: number, b: number, yy: number): V => [x + ux * a + vx * b, yy, z + uz * a + vz * b];
  const c = [P(-hl, -hw, y), P(hl, -hw, y), P(hl, hw, y), P(-hl, hw, y)];
  const t = [P(-hl, -hw, y + h), P(hl, -hw, y + h), P(hl, hw, y + h), P(-hl, hw, y + h)];
  quad(g, t[0], t[3], t[2], t[1], col, 1);
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    quad(g, c[k], c[k2], t[k2], t[k], col, k % 2 ? 0.86 : 0.74);
  }
}
const frame = (i: number) => {
  const a = SPINE[Math.max(0, i - 2)];
  const b = SPINE[Math.min(N - 1, i + 2)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / l;
  const tz = (b[1] - a[1]) / l;
  // (its left looking along)
  return { tx, tz, lx: tz, lz: -tx };
};
function road(cx: number, cz: number, r: number): Geo {
  const g = geo();
  const ASPH = 0x5d636b;
  const half = ROAD_W / 2;
  const off = (i: number, o: number, dy = 0): V => {
    const f = frame(i);
    return [SPINE[i][0] + f.lx * o, ALT[i] + 0.05 + dy, SPINE[i][1] + f.lz * o];
  };
  const near = (i: number) => Math.hypot(SPINE[i][0] - cx, SPINE[i][1] - cz) < r;
  const STEP = 2;
  for (let i = 0; i + STEP < N; i += STEP) {
    if (!near(i)) continue;
    const j = i + STEP;
    // the asphalt, its shoulders a little snowy
    quad(g, off(i, -half), off(i, half), off(j, half), off(j, -half), ASPH);
    quad(g, off(i, half), off(i, half + 0.9, -0.04), off(j, half + 0.9, -0.04), off(j, half), 0xb9c0c7);
    quad(g, off(i, -half - 0.9, -0.04), off(i, -half), off(j, -half), off(j, -half - 0.9, -0.04), 0xb9c0c7);
    // its lines: the edges, the centre dashed (doubled where it bends hard)
    for (const s of [-1, 1])
      quad(
        g,
        off(i, s * (half - 0.35), 0.01),
        off(i, s * (half - 0.2), 0.01),
        off(j, s * (half - 0.2), 0.01),
        off(j, s * (half - 0.35), 0.01),
        0xe9ecee,
      );
    const blind = BEND[i] > 0.008;
    const dash = Math.floor(S[i] / 3) % 4 === 0;
    if (blind)
      for (const s of [-0.18, 0.18])
        quad(
          g,
          off(i, s - 0.06, 0.01),
          off(i, s + 0.06, 0.01),
          off(j, s + 0.06, 0.01),
          off(j, s - 0.06, 0.01),
          0xe0b43a,
        );
    else if (dash) quad(g, off(i, -0.07, 0.01), off(i, 0.07, 0.01), off(j, 0.07, 0.01), off(j, -0.07, 0.01), 0xe0b43a);
    // a bridge: its deck's sides, parapets, piers
    if (bridged(i)) {
      for (const s of [-1, 1]) {
        const a = off(i, s * (half + 0.9), -0.04);
        const b = off(j, s * (half + 0.9), -0.04);
        quad(g, a, b, [b[0], b[1] - 1.4, b[2]], [a[0], a[1] - 1.4, a[2]], 0x8d939a, 0.8);
        const ta = off(i, s * (half + 0.9), 1.0);
        const tb = off(j, s * (half + 0.9), 1.0);
        quad(g, [a[0], a[1], a[2]], [b[0], b[1], b[2]], tb, ta, 0xa7adb3, 0.92);
      }
      // the deck's underside
      quad(
        g,
        off(j, -half - 0.9, -1.45),
        off(j, half + 0.9, -1.45),
        off(i, half + 0.9, -1.45),
        off(i, -half - 0.9, -1.45),
        0x7a8087,
        0.6,
      );
      if (Math.floor(S[i]) % 32 < STEP) {
        const [x, z] = SPINE[i];
        const f = frame(i);
        const foot = landAt(x, z) - 1;
        box(g, x, foot, z, f.tx, f.tz, 1.1, half - 0.5, ALT[i] - 1.4 - foot, 0x8d939a);
      }
      continue;
    }
    // what lines it: a rail over a drop, posts, poles
    for (const s of [-1, 1]) {
      const p = off(i, s * (half + 1.6));
      const drop = ALT[i] - landAt(p[0], p[2]);
      if (drop > 2) {
        const a = off(i, s * (half + 1.3), 0.55);
        const b = off(j, s * (half + 1.3), 0.55);
        quad(g, a, b, [b[0], b[1] + 0.32, b[2]], [a[0], a[1] + 0.32, a[2]], 0xc9cdd2, s > 0 ? 0.95 : 0.8);
        if (Math.floor(S[i]) % 4 < STEP) {
          const f = frame(i);
          box(g, a[0], ALT[i] - 0.2, a[2], f.tx, f.tz, 0.06, 0.06, 1.05, 0x6f757c);
        }
      }
      if (Math.floor(S[i]) % 50 < STEP) {
        const q = off(i, s * (half + 1.9));
        const f = frame(i);
        box(g, q[0], landAt(q[0], q[2]) - 0.1, q[2], f.tx, f.tz, 0.07, 0.07, 1.1, 0xf2f2ee);
        box(g, q[0], landAt(q[0], q[2]) + 0.72, q[2], f.tx, f.tz, 0.075, 0.075, 0.14, 0x22262b);
        box(g, q[0], landAt(q[0], q[2]) + 0.84, q[2], f.tx, f.tz, 0.076, 0.076, 0.08, 0xff8a1c);
      }
      if (ALT[i] > TREELINE - 30 && Math.floor(S[i]) % 25 < STEP) {
        const q = off(i, s * (half + 2.6));
        const f = frame(i);
        const y0 = landAt(q[0], q[2]) - 0.1;
        for (let k = 0; k < 5; k++)
          box(g, q[0], y0 + k * 0.5, q[2], f.tx, f.tz, 0.04, 0.04, 0.5, k % 2 ? 0x22262b : 0xff6a14);
      }
    }
  }
  return g;
}
// signs: a board on posts beside the road (its sample, the side, the words) — drawn in the page
interface Sign {
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  lines: string[];
  bg: string;
  fg: string;
}
function signs(): Sign[] {
  const out: Sign[] = [];
  const beside = (i: number, side: number, o: number) => {
    const f = frame(i);
    const x = SPINE[i][0] + f.lx * side * o;
    const z = SPINE[i][1] + f.lz * side * o;
    // (facing the oncoming driver)
    return { x, z, y: landAt(x, z), ry: Math.atan2(-f.tx, -f.tz) };
  };
  out.push({
    ...beside(at(0.06), -1, 6.6),
    w: 2.6,
    h: 1.5,
    lines: ["Silver Lake  14", "Hawk Pass  11"],
    bg: "#1f5a3a",
    fg: "#f4f4ee",
  });
  for (let km = 1; km < 14; km++)
    out.push({ ...beside(at(km), -1, 6.2), w: 0.5, h: 0.6, lines: [`${km}`], bg: "#1f5a3a", fg: "#f4f4ee" });
  out.push({ ...beside(PASS, -1, 7), w: 2.8, h: 1.4, lines: ["HAWK PASS", "461 m"], bg: "#6b3a1f", fg: "#f6efe2" });
  out.push({ ...beside(REST - 60, -1, 6.6), w: 2.2, h: 1.1, lines: ["REST AREA", "→"], bg: "#1f5a3a", fg: "#f4f4ee" });
  out.push({
    ...beside(LOOKOUT - 200, -1, 6.6),
    w: 2.6,
    h: 1.2,
    lines: ["SILVER LAKE", "LOOKOUT"],
    bg: "#6b3a1f",
    fg: "#f6efe2",
  });
  return out;
}

// ── the places: the rest stop, the pull-out, the lookout, the jetty and cabins ──
function places(): { g: Geo; glows: V[] } {
  const g = geo();
  const glows: V[] = [];
  const WOOD = 0x8a6a4a;
  const DARK = 0x4a3a2c;
  // the rest stop: picnic tables, a fire pit, a hut, two lamps
  {
    const [px, pz] = padAt(PADS[0]);
    const y = ALT[PADS[0].i] - 0.06;
    for (const [dx, dz] of [
      [-10, -6],
      [-2, -12],
      [8, -4],
    ]) {
      box(g, px + dx, y + 0.72, pz + dz, 1, 0.2, 1, 0.45, 0.06, WOOD);
      for (const s of [-1, 1]) box(g, px + dx, y + 0.42, pz + dz + s * 0.8, 1, 0, 1, 0.14, 0.05, WOOD);
      for (const s of [-0.8, 0.8]) box(g, px + dx + s, y, pz + dz, 0, 1, 0.5, 0.05, 0.72, DARK);
    }
    // the fire pit's ring of stones
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      box(
        g,
        px + 2 + Math.cos(a) * 0.9,
        y,
        pz + 6 + Math.sin(a) * 0.9,
        Math.cos(a),
        Math.sin(a),
        0.18,
        0.2,
        0.28,
        0x6f6a66,
      );
    }
    glows.push([px + 2, y + 0.4, pz + 6]);
    // the hut, its roof
    box(g, px + 16, y, pz + 10, 1, 0, 1.6, 1.4, 2.4, 0x7a5a3e);
    box(g, px + 16, y + 2.4, pz + 10, 1, 0, 1.9, 1.7, 0.18, 0x3c4248);
    for (const [dx, dz] of [
      [-18, 4],
      [14, -16],
    ]) {
      box(g, px + dx, y, pz + dz, 1, 0, 0.08, 0.08, 4.2, 0x3a3f45);
      box(g, px + dx, y + 4.1, pz + dz, 1, 0, 0.3, 0.16, 0.12, 0x3a3f45);
      glows.push([px + dx, y + 4.0, pz + dz]);
    }
  }
  // the lookout: a deck out over the edge, its rails, the binoculars
  {
    const i = LOOKOUT;
    const [x, z] = SPINE[i];
    const y = ALT[i];
    // (out towards the lake: west down its length)
    const tl = Math.hypot(LAKE.cx - x, LAKE.cz - z) || 1;
    const dx = (LAKE.cx - x) / tl;
    const dz = (LAKE.cz - z) / tl;
    const cx = x + dx * 26;
    const cz = z + dz * 26;
    box(g, cx, y - 0.3, cz, dx, dz, 9, 5, 0.3, WOOD);
    // its legs down the bluff
    for (const a of [-7, 0, 7])
      for (const b of [-4, 4]) {
        const lx = cx + dx * a - dz * b;
        const lz = cz + dz * a + dx * b;
        const foot = Math.min(landAt(lx, lz), y - 1);
        box(g, lx, foot - 1, lz, dx, dz, 0.15, 0.15, y - 0.3 - foot + 1, DARK);
      }
    for (const b of [-5, 5]) box(g, cx - dz * b, y, cz + dx * b, dx, dz, 9, 0.05, 1.05, DARK);
    box(g, cx + dx * 9, y, cz + dz * 9, -dz, dx, 5, 0.05, 1.05, DARK);
    box(g, cx + dx * 7, y, cz + dz * 7, dx, dz, 0.08, 0.08, 1.2, 0x3a3f45);
    box(g, cx + dx * 7, y + 1.2, cz + dz * 7, dx, dz, 0.22, 0.12, 0.16, 0x2f6f5a);
    glows.push([x - dz * 12, y + 4, z + dx * 12]);
  }
  // the jetty and the cabins, by the lake's west end
  {
    const [jx, jz] = JETTY;
    const lv = LAKE.level;
    for (let k = 0; k < 9; k++) box(g, jx, lv + 0.5, jz - k * 2.4, 0, 1, 1.15, 1.3, 0.12, WOOD);
    for (let k = 0; k < 9; k += 2)
      for (const s of [-1.1, 1.1]) box(g, jx + s, lv - 2, jz - k * 2.4, 1, 0, 0.1, 0.1, 2.6, DARK);
    // the rowing boat
    box(g, jx + 3, lv + 0.05, jz - 14, 0.2, 1, 2.2, 0.6, 0.45, 0x8c2f24);
    for (const [cx, cz, ry] of [
      [jx - 30, jz + 42, 0.3],
      [jx + 34, jz + 50, -0.2],
    ]) {
      const y = landAt(cx, cz);
      const ux = Math.cos(ry);
      const uz = Math.sin(ry);
      box(g, cx, y - 0.4, cz, ux, uz, 4, 3, 3.2, 0x6b4a30);
      // the gable roof
      const P = (a: number, b: number, yy: number): V => [cx + ux * a - uz * b, yy, cz + uz * a + ux * b];
      const top = y + 2.8 + 2.2;
      quad(g, P(-4.4, -3.4, y + 2.8), P(4.4, -3.4, y + 2.8), P(4.4, 0, top), P(-4.4, 0, top), 0x3b4046, 0.8);
      quad(g, P(4.4, 3.4, y + 2.8), P(-4.4, 3.4, y + 2.8), P(-4.4, 0, top), P(4.4, 0, top), 0x3b4046, 0.95);
      tri(g, P(-4, -3, y + 2.8), P(-4, 3, y + 2.8), P(-4, 0, top - 0.2), 0x6b4a30, 0.8);
      tri(g, P(4, 3, y + 2.8), P(4, -3, y + 2.8), P(4, 0, top - 0.2), 0x6b4a30, 0.8);
      box(g, cx + ux * 2.5, y + 3.6, cz + uz * 2.5, ux, uz, 0.35, 0.35, 2.2, 0x6f6a66);
      glows.push(P(0, -3.05, y + 1.4));
    }
  }
  // the pull-out: a bench by the rail
  {
    const [px, pz] = padAt(PADS[1]);
    const y = ALT[PADS[1].i] - 0.06;
    box(g, px, y + 0.45, pz, 1, 0, 0.9, 0.22, 0.06, WOOD);
    for (const s of [-0.7, 0.7]) box(g, px + s, y, pz, 1, 0, 0.05, 0.2, 0.45, DARK);
  }
  return { g, glows };
}
// the lake: a disc at its level (its ice, or its water)
function lake(): Geo {
  const g = geo();
  const A = 160;
  const R = 12;
  const lv = LAKE.level;
  const at2 = (k: number, a: number): V => {
    const t = (a / A) * Math.PI * 2;
    const r = (1.08 * k) / R;
    const c = Math.cos(LAKE.tilt);
    const s = Math.sin(LAKE.tilt);
    const u = Math.cos(t) * LAKE.rx * r;
    const v = Math.sin(t) * LAKE.rz * r;
    return [LAKE.cx + u * c - v * s, lv, LAKE.cz + u * s + v * c];
  };
  for (let k = 0; k < R; k++)
    for (let a = 0; a < A; a++) {
      const p0 = at2(k, a);
      const p1 = at2(k, a + 1);
      const p2 = at2(k + 1, a + 1);
      const p3 = at2(k + 1, a);
      const n = Math.sin(p0[0] * 0.013 + p0[2] * 0.021) * 0.5 + 0.5;
      const col = n > 0.62 ? 0xdfe8ef : 0xb7c9d6;
      quad(g, p0, p3, p2, p1, col, 0.96 + 0.04 * n);
    }
  void lakeR;
  return g;
}
// the creek's water (open: a dark ribbon), near the camera
function creek(cx: number, cz: number): Geo {
  const g = geo();
  for (let i = 0; i + 4 < CREEK.length; i += 4) {
    const [x, z] = CREEK[i];
    if (Math.hypot(x - cx, z - cz) > 2500) continue;
    const [x2, z2] = CREEK[i + 4];
    const l = Math.hypot(x2 - x, z2 - z) || 1;
    const nx = -(z2 - z) / l;
    const nz = (x2 - x) / l;
    const w = 2.6;
    const y1 = creekWater(i);
    const y2 = creekWater(i + 4);
    quad(
      g,
      [x - nx * w, y1, z - nz * w],
      [x2 - nx * w, y2, z2 - nz * w],
      [x2 + nx * w, y2, z2 + nz * w],
      [x + nx * w, y1, z + nz * w],
      0x2c4650,
    );
  }
  return g;
}

// the jetty: on the lake's south shore, its west end (walked out from the middle to where it ends)
const JETTY: [number, number] = (() => {
  const tx = 9020;
  const tz = -1900;
  let x = LAKE.cx;
  let z = LAKE.cz;
  const d = Math.hypot(tx - x, tz - z);
  for (let t = 0; t < d; t += 1) {
    const px = LAKE.cx + ((tx - LAKE.cx) * t) / d;
    const pz = LAKE.cz + ((tz - LAKE.cz) * t) / d;
    if (lakeR(px, pz) > 1) break;
    x = px;
    z = pz;
  }
  return [x, z + 8];
})();

// ── the page: the mock put into the view ──
interface Setup {
  rings: Ring[];
  trees: string;
  road: { p: number[]; c: number[] };
  places: { p: number[]; c: number[] };
  glows: V[];
  lake: { p: number[]; c: number[] };
  creek: { p: number[]; c: number[] };
  signs: Sign[];
  far: boolean; // hide the game's own land and trees (a view from far off)
}
async function mock(p: Page, s: Setup) {
  await p.evaluate((s) => {
    const win = window as any;
    const w = win.__yutopia;
    const tp = w.tp;
    const g = tp.around.grounds;
    const anyMesh = g.root.children.find((m: any) => m.isMesh) ?? g.pools[0].mesh;
    const Geo = anyMesh.geometry.constructor;
    const BA = anyMesh.geometry.attributes.position.constructor;
    const Mesh = Object.getPrototypeOf(g.pools[0].mesh.constructor.prototype).constructor; // (InstancedMesh's parent)
    const IMesh = g.pools[0].mesh.constructor;
    const Group = g.root.constructor;
    const Lam = g.landMat.constructor;
    const Mat4 = g.pools[0].mesh.matrix.constructor;
    const V3 = tp.camera.position.constructor;
    const Q = tp.camera.quaternion.constructor;
    tp.renderer.debug.checkShaderErrors = true;
    // (what's left of the last spot's mock)
    if (win.__rdRoot) {
      win.__rdRoot.traverse((m: any) => {
        if (m.geometry) m.geometry.dispose();
      });
      win.__rdRoot.removeFromParent();
    }
    const root = new Group();
    root.position.copy(g.root.getWorldPosition(new V3()));
    tp.scene.add(root);
    win.__rdRoot = root;
    win.__rdBase = root.position.clone();
    const dec = (b64: string) => {
      const bin = atob(b64);
      const a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return a;
    };
    // the land's rings
    const GX = s.far ? -1e9 : 512;
    for (const r of s.rings) {
      const h = new Float32Array(dec(r.h).buffer);
      const c = dec(r.c);
      const wl = dec(r.w);
      const n = r.n;
      const pos = new Float32Array(n * n * 3);
      const col = new Float32Array(n * n * 3);
      const uv = new Float32Array(n * n * 2);
      const wx = new Float32Array(n * n * 2);
      const hole = r.hole;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const x = r.x0 + i * r.step;
          const z = r.z0 + j * r.step;
          // (under the finer ring: a little down, so the finer wins where both are)
          const under =
            hole && x > hole[0] - r.step && x < hole[2] + r.step && z > hole[1] - r.step && z < hole[3] + r.step;
          pos[k * 3] = x;
          pos[k * 3 + 1] = h[k] - (under ? 0.4 + r.step * 0.04 : 0);
          pos[k * 3 + 2] = z;
          // (the land's colours are in sRGB: three's vertex colours are linear)
          for (let q = 0; q < 3; q++) col[k * 3 + q] = (c[k * 3 + q] / 255) ** 2.2;
          uv[k * 2] = x / 14;
          uv[k * 2 + 1] = z / 14;
          wx[k * 2] = wl[k * 2] / 255;
          wx[k * 2 + 1] = wl[k * 2 + 1] / 255;
        }
      const idx: number[] = [];
      for (let j = 0; j < n - 1; j++)
        for (let i = 0; i < n - 1; i++) {
          const x = r.x0 + (i + 0.5) * r.step;
          const z = r.z0 + (j + 0.5) * r.step;
          if (hole && x > hole[0] && x < hole[2] && z > hole[1] && z < hole[3]) continue;
          // (the game's own land, drawn: not over it)
          if (x < GX && x > s.rings[0].x0 - 1e6 && z > -961 && z < 209 && x > -481) continue;
          const p0 = j * n + i;
          idx.push(p0, p0 + n, p0 + 1, p0 + 1, p0 + n, p0 + n + 1);
        }
      const gg = new Geo();
      gg.setAttribute("position", new BA(pos, 3));
      gg.setAttribute("color", new BA(col, 3));
      gg.setAttribute("uv", new BA(uv, 2));
      gg.setAttribute("wxLand", new BA(wx, 2));
      gg.setIndex(idx);
      gg.computeVertexNormals();
      // (far off: plain colours, the forest's canopy as tinted — the snow's layer would whiten it)
      win.__rdFarLand ??= new Lam({ vertexColors: true });
      const m = new Mesh(gg, r.step >= 32 ? win.__rdFarLand : g.landMat);
      m.frustumCulled = false;
      m.receiveShadow = r.step <= 2;
      root.add(m);
    }
    // the trees: the game's own geometries and material
    {
      const t = new Float32Array(dec(s.trees).buffer);
      const by = new Map<number, number[]>();
      for (let k = 0; k < t.length; k += 7) {
        const l = by.get(t[k + 6]) ?? [];
        by.set(t[k + 6], l);
        l.push(k);
      }
      const m4 = new Mat4();
      const q = new Q();
      const up = new V3(0, 1, 0);
      for (const [pool, ks] of by) {
        const src = g.pools[pool].mesh;
        const im = new IMesh(src.geometry, src.material, ks.length);
        for (const [n, k] of ks.entries()) {
          q.setFromAxisAngle(up, t[k + 5]);
          m4.compose(new V3(t[k], t[k + 1], t[k + 2]), q, new V3(t[k + 3], t[k + 4], t[k + 3]));
          im.setMatrixAt(n, m4);
        }
        im.frustumCulled = false;
        im.castShadow = pool < 12;
        im.receiveShadow = true;
        root.add(im);
      }
    }
    // the road, the places, the lake, the creek: plain lit vertex colours
    win.__rdMat ??= new Lam({ vertexColors: true, side: 2 });
    win.__rdGlow ??= new Lam({ color: 0x5a4014, emissive: 0xffb02a, emissiveIntensity: 1.6, side: 2 });
    // (the sky's dome and stars: kept round the camera, wherever it's taken)
    win.__rdSky = [];
    tp.scene.traverse((m: any) => {
      if (m.isMesh && (m.renderOrder === -10 || m.renderOrder === -9)) win.__rdSky.push(m);
      if (m.isPoints) win.__rdSky.push(m);
    });
    for (const part of [s.road, s.places, s.lake, s.creek]) {
      if (!part.p.length) continue;
      const gg = new Geo();
      gg.setAttribute("position", new BA(new Float32Array(part.p), 3));
      const lin = new Float32Array(part.c.length);
      for (let i = 0; i < lin.length; i++) lin[i] = part.c[i] ** 2.2;
      gg.setAttribute("color", new BA(lin, 3));
      gg.computeVertexNormals();
      const m = new Mesh(gg, win.__rdMat);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    // the glows (lamps, the fire, windows): small lit boxes
    for (const [x, y, z] of s.glows) {
      const gg = new Geo();
      const S = 0.3;
      const P: number[] = [];
      const face = (a: number[], b: number[], c: number[], d: number[]) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
      const v = (i: number, j: number, k: number) => [x + i * S, y + j * S, z + k * S];
      face(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1));
      face(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1));
      face(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1));
      face(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1));
      face(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1));
      gg.setAttribute("position", new BA(new Float32Array(P), 3));
      gg.computeVertexNormals();
      const m = new Mesh(gg, win.__rdGlow);
      root.add(m);
    }
    // the signs: boards with their words
    const Tex = g.snowTex.constructor;
    for (const sg of s.signs) {
      const cv = document.createElement("canvas");
      cv.width = Math.round(256 * sg.w);
      cv.height = Math.round(256 * sg.h);
      const x2 = cv.getContext("2d") as CanvasRenderingContext2D;
      x2.fillStyle = sg.bg;
      x2.fillRect(0, 0, cv.width, cv.height);
      x2.strokeStyle = sg.fg;
      x2.lineWidth = 10;
      x2.strokeRect(14, 14, cv.width - 28, cv.height - 28);
      x2.fillStyle = sg.fg;
      x2.textAlign = "center";
      x2.textBaseline = "middle";
      const fh = Math.min(cv.height / (sg.lines.length + 0.6), cv.width / 7);
      x2.font = `700 ${Math.round(fh * 0.8)}px system-ui, sans-serif`;
      for (const [i, l] of sg.lines.entries())
        x2.fillText(l, cv.width / 2, (cv.height * (i + 0.5 + 0.15)) / (sg.lines.length + 0.3));
      const tex = new Tex(cv);
      tex.colorSpace = "srgb";
      const mat = new Lam({ map: tex });
      const gg = new Geo();
      const c = Math.cos(sg.ry);
      const sn = Math.sin(sg.ry);
      const y0 = sg.y + 1.1;
      const hw = sg.w / 2;
      const P = (a: number, yy: number) => [sg.x + c * a, yy, sg.z - sn * a];
      const pts = [P(-hw, y0), P(hw, y0), P(hw, y0 + sg.h), P(-hw, y0), P(hw, y0 + sg.h), P(-hw, y0 + sg.h)];
      gg.setAttribute("position", new BA(new Float32Array(pts.flat()), 3));
      gg.setAttribute("uv", new BA(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
      gg.computeVertexNormals();
      const m = new Mesh(gg, mat);
      m.material.side = 2;
      root.add(m);
      // its posts
      for (const a of sg.w > 1 ? [-hw + 0.2, hw - 0.2] : [0]) {
        const pg = new Geo();
        const [px, , pz] = P(a, 0);
        const r = 0.05;
        const ps: number[] = [];
        const v = (i: number, j: number, yy: number) => [px + i * r, yy, pz + j * r];
        const face = (A: number[], B: number[], C: number[], D: number[]) =>
          ps.push(...A, ...B, ...C, ...A, ...C, ...D);
        face(v(-1, 1, sg.y - 0.2), v(1, 1, sg.y - 0.2), v(1, 1, y0 + sg.h), v(-1, 1, y0 + sg.h));
        face(v(1, -1, sg.y - 0.2), v(-1, -1, sg.y - 0.2), v(-1, -1, y0 + sg.h), v(1, -1, y0 + sg.h));
        face(v(-1, -1, sg.y - 0.2), v(-1, 1, sg.y - 0.2), v(-1, 1, y0 + sg.h), v(-1, -1, y0 + sg.h));
        face(v(1, 1, sg.y - 0.2), v(1, -1, sg.y - 0.2), v(1, -1, y0 + sg.h), v(1, 1, y0 + sg.h));
        pg.setAttribute("position", new BA(new Float32Array(ps), 3));
        pg.computeVertexNormals();
        root.add(new Mesh(pg, new Lam({ color: 0x6f757c })));
      }
    }
    // the barricade taken away; the painted ridges gone; far off, the game's own land and trees too
    g.statics.root.traverse((m: any) => {
      if (!m.isMesh) return;
      if (m.material === g.statics.ridgeMat) m.visible = false;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      // (its middle in the land's coords: through its own place in the statics)
      const mid = new V3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)
        .applyMatrix4(m.matrixWorld)
        .sub(root.position);
      if (Math.abs(mid.x - 529) < 10 && Math.abs(mid.z + 405) < 12 && b.max.x - b.min.x < 16) m.visible = false;
    });
    win.__rdFar = s.far;
    // the camera: set by hand before each frame; the air's reach pushed out
    if (!win.__rdHooked) {
      win.__rdHooked = true;
      const post = tp.post;
      const r0 = post.render.bind(post);
      post.render = (moving: boolean, over: any) => {
        const c = win.__rdCam;
        const cam = tp.camera;
        if (c) {
          const b = win.__rdBase;
          cam.position.set(b.x + c.from[0], b.y + c.from[1], b.z + c.from[2]);
          cam.lookAt(b.x + c.to[0], b.y + c.to[1], b.z + c.to[2]);
          cam.near = 0.5;
          cam.far = 60000;
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld(true);
          for (const d of win.__rdSky ?? []) {
            const p = cam.position.clone();
            d.parent?.worldToLocal(p);
            d.position.copy(p);
            d.updateMatrixWorld(true);
          }
          const fog = tp.scene.fog;
          fog.near = c.fogNear;
          fog.far = c.fogFar;
          // the game's land and trees: hidden when the view's from far off
          for (const blk of g.blocks.values())
            if (blk.mesh) blk.mesh.visible = !win.__rdFar && blk.shown && blk.x0 + 128 / 2 ** blk.tier <= 512;
          for (const pl of [...g.pools, ...g.casters]) {
            pl.mesh.visible = !win.__rdFar;
            // (the trees past x 512: on today's ridge, over the mock's land — gone)
            const a = pl.mesh.instanceMatrix.array;
            let changed = false;
            for (let i = 0; i < pl.mesh.count; i++)
              if (a[i * 16 + 12] > 512 && a[i * 16 + 15] !== 0) {
                for (let q = 0; q < 16; q++) a[i * 16 + q] = 0;
                changed = true;
              }
            if (changed) pl.mesh.instanceMatrix.needsUpdate = true;
          }
          // headlights (two of the torches)
          if (c.lights) {
            const spots: any[] = [];
            tp.scene.traverse((l: any) => {
              if (l.isSpotLight) spots.push(l);
            });
            const fx = c.to[0] - c.from[0];
            const fz = c.to[2] - c.from[2];
            const fl = Math.hypot(fx, fz) || 1;
            for (const [k, side] of [
              [0, -0.8],
              [1, 0.8],
            ]) {
              const sp = spots[k];
              if (!sp) continue;
              const lx = (-fz / fl) * side;
              const lz = (fx / fl) * side;
              sp.position.set(b.x + c.from[0] + lx, b.y + c.from[1] - 0.6, b.z + c.from[2] + lz);
              sp.target.position.set(
                b.x + c.from[0] + (fx / fl) * 30 + lx,
                b.y + c.from[1] - 1.6,
                b.z + c.from[2] + (fz / fl) * 30 + lz,
              );
              sp.target.updateMatrixWorld();
              sp.intensity = 60;
              sp.distance = 90;
              sp.angle = 0.42;
              sp.penumbra = 0.5;
              sp.visible = true;
            }
          }
        }
        return r0(moving, over);
      };
    }
  }, s);
}

interface State {
  name: string;
  hour: number;
  sky: "clear" | "cloudy" | "snow";
  fog?: "mist" | "fog";
  fogFar: number;
}
const STATES: State[] = [
  { name: "noon", hour: 12.5, sky: "clear", fogFar: 26000 },
  { name: "dusk", hour: 19.25, sky: "clear", fogFar: 20000 },
  { name: "night", hour: 22, sky: "clear", fogFar: 9000 },
  { name: "haze", hour: 9, sky: "cloudy", fogFar: 7000 },
];
async function setState(p: Page, st: State) {
  await p.evaluate((st) => {
    const w = (window as any).__yutopia;
    w.room.send("mod:weather", { to: st.sky, now: true });
    w.room.send("mod:fog", { fog: st.fog ?? "clear", now: true });
  }, st);
  await p.waitForTimeout(1200);
  await p.evaluate((st) => {
    const win = window as any;
    const w = win.__yutopia;
    const tp = w.tp;
    w.updateNight = () => {};
    w.hour = st.hour;
    w.model?.setClock(st.hour);
    tp.setHour(st.hour);
    if (w.life) w.life.weather = () => [0, 0];
    // (the snow lies everywhere, the water's iced)
    const wx = w.room.state.weather;
    wx.snow = 1;
    wx.ice = 1;
    win.__rdCam.fogNear = 250;
    win.__rdCam.fogFar = st.fogFar;
  }, st);
}

interface Spot {
  name: string;
  /** the camera (land coords; its height over the land there) and what it looks at */
  from: [number, number, number];
  to: [number, number, number];
  far?: boolean;
  lights?: boolean;
  states?: string[];
}
// a point on the road: along it (km), off it (m, + its left), up (m over the road)
const on = (km: number, o = 0, up = 1.6): [number, number, number] => {
  const i = at(km);
  const f = frame(i);
  return [SPINE[i][0] + f.lx * o, up, SPINE[i][1] + f.lz * o];
};
const onAbs = (km: number, o = 0, up = 1.6): [number, number, number] => {
  const [x, , z] = on(km, o);
  return [x, ALT[at(km)] + up - landAt(x, z), z];
};
// a point on the creek `down` m downstream of where it's nearest the road at km, `up` over its water
const creekAt = (km: number, down: number, up: number): [number, number, number] => {
  const [x, , z] = on(km);
  let best = 0;
  for (let i = 0; i < CREEK.length; i++)
    if (Math.hypot(CREEK[i][0] - x, CREEK[i][1] - z) < Math.hypot(CREEK[best][0] - x, CREEK[best][1] - z)) best = i;
  const i = Math.min(CREEK.length - 1, best + down);
  const [cx, cz] = CREEK[i];
  return [cx, creekWater(i) - landAt(cx, cz) + up, cz];
};
// the n-th hairpin of the climb: from 70 m out past its outside, 45 m up; or its middle
const pins = (() => {
  const out: number[] = [];
  for (let i = 20; i < N - 20; i++)
    if (
      BEND[i] > 0.03 &&
      BEND[i] >= BEND[i - 1] &&
      BEND[i] >= BEND[i + 1] &&
      (!out.length || i - out[out.length - 1] > 80)
    )
      out.push(i);
  return out;
})();
const hairpinView = (n: number, mid = false): [number, number, number] => {
  const i = pins[Math.min(pins.length - 1, n)];
  const [x, z] = SPINE[i];
  // (its outside: away from the turn's middle, the two legs' ends)
  const a = SPINE[i - 60];
  const b = SPINE[i + 60];
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  const l = Math.hypot(x - mx, z - mz) || 1;
  if (mid) return [mx, ALT[i] - landAt(mx, mz) - 4, mz];
  const ox = x + ((x - mx) / l) * 60;
  const oz = z + ((z - mz) / l) * 60;
  return [ox, ALT[i] + 45 - landAt(ox, oz), oz];
};
// the lookout's deck: at its end, the lake ahead
const lookoutEye = (): [number, number, number] => {
  const [x, z] = SPINE[LOOKOUT];
  const tl = Math.hypot(LAKE.cx - x, LAKE.cz - z) || 1;
  const ex = x + ((LAKE.cx - x) / tl) * 33;
  const ez = z + ((LAKE.cz - z) / tl) * 33;
  return [ex, ALT[LOOKOUT] + 1.6 - landAt(ex, ez), ez];
};
// the rest stop from its entrance: the road behind, the tables and the hut ahead
const restEye = (): [number, number, number] => {
  const [px, pz] = padAt(PADS[0]);
  const [rx, rz] = SPINE[REST];
  const ex = px + (rx - px) * 0.75;
  const ez = pz + (rz - pz) * 0.75;
  return [ex, 1.7, ez];
};
const SPOTS: Spot[] = [
  // the barricade's spot, opened: looking east out of town along the road
  { name: "opened", from: [500, 2.2, -401.5], to: [700, 1.5, -408], states: ["noon", "dusk"] },
  // the edge of town: the fields, fence lines, the first of the wood ahead
  { name: "edge", from: on(0.55, 1.6, 1.7), to: on(1.4, 0, 6), far: true, states: ["noon", "dusk"] },
  // deep in the Long Wood, on the road
  { name: "wood", from: on(3.05, 1.8, 1.7), to: on(3.25, 0, 4), far: true, states: ["noon", "night"], lights: true },
  // in the wood, off the road, among the trees
  { name: "wood-in", from: on(2.0, 40, 1.7), to: on(2.08, 120, 6), far: true, states: ["noon"] },
  // the rest stop from the road
  {
    name: "rest",
    from: restEye(),
    to: [padAt(PADS[0])[0], 0.6, padAt(PADS[0])[1]],
    far: true,
    states: ["noon", "night"],
  },
  // the gorge from the high bridge, down it (west)
  { name: "gorge", from: onAbs(5.99, 3.6, 2.6), to: creekAt(5.99, 420, 2), far: true, states: ["noon", "haze"] },
  // the high bridge, from the creek under it
  { name: "bridge", from: creekAt(5.99, 150, 2), to: onAbs(5.99, 0, -3), far: true, states: ["noon"] },
  // a hairpin from over its outside
  { name: "hairpin", from: hairpinView(2), to: hairpinView(2, true), far: true, states: ["noon"] },
  // the pull-out, looking back down the valley to the town
  {
    name: "pullout",
    from: [padAt(PADS[1])[0], 1.7, padAt(PADS[1])[1] + 12],
    to: [1200, 0, -420],
    far: true,
    states: ["noon", "dusk", "night", "haze"],
  },
  // the pass
  {
    name: "pass",
    from: on(S[PASS] / 1000 - 0.12, 2, 1.7),
    to: on(S[PASS] / 1000 + 0.35, 0, -10),
    far: true,
    states: ["noon", "dusk"],
  },
  // the lake from the lookout's deck, west down it to the pass
  { name: "lookout", from: lookoutEye(), to: [8700, 40, -2300], far: true, states: ["noon", "dusk", "night"] },
  // the lake from the jetty's end
  {
    name: "jetty",
    from: [JETTY[0], LAKE.level + 2.2 - landAt(JETTY[0], JETTY[1] - 20), JETTY[1] - 20],
    to: [10290, 18, -2290],
    far: true,
    states: ["noon", "dusk"],
  },
  // the far view: from high on the pass's north peak, back west over the whole road
  {
    name: "far",
    from: (() => {
      const [x, , z] = summit(8060, -1420, 420);
      return [x, 12, z] as [number, number, number];
    })(),
    to: [2500, 0, -420],
    far: true,
    states: ["noon", "haze", "dusk"],
  },
];

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const ready = (p: Page) =>
  p.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 120_000 },
  );
async function open(browser: Browser): Promise<Page> {
  const tok = await token("ana@yutopia.test");
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      console.log(
        "  console:",
        m
          .text()
          .match(/ERROR:[^\n]*/g)
          ?.join(" | ") ?? m.text().slice(0, 300),
      ),
  );
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  return page;
}
const go = async (p: Page, at: [number, number]) => {
  const to = { x: at[0] + OX, y: at[1] + OZ, level: 0 };
  await p.evaluate((a) => (window as any).__yutopia.teleport(a), to);
  await p
    .waitForFunction(
      (a) => {
        const w = (window as any).__yutopia;
        const m = w.room.state.players.get(w.room.sessionId);
        return w.level === 0 && Math.hypot(m.x - a.x, m.y - a.y) < 8;
      },
      to,
      { timeout: 8000 },
    )
    .catch(() => console.log("  (didn't get to the barricade's spot)"));
  await p.waitForTimeout(9000);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-rdshot", "");
    if (!document.getElementById("rdshot-css")) {
      const s = document.createElement("style");
      s.id = "rdshot-css";
      s.textContent = "*:not(:has([data-rdshot])):not([data-rdshot]){visibility:hidden!important}";
      document.head.appendChild(s);
    }
  });
  const file = `${out}/${quality === "high" ? "" : `${quality}-`}${name}.png`;
  await p.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

async function sheets(browser: Browser) {
  const files = readdirSync(out).filter(
    (f) => f.endsWith(".png") && !f.startsWith("sheet-") && !f.startsWith("map") && f !== "profile.png",
  );
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const k = f.startsWith("low-") || f.startsWith("medium-") ? "tiers" : f.split("-")[0];
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  }
  // (a sheet a stretch of the road: in order)
  const sheetsOf: Record<string, string[]> = {
    town: ["opened", "edge"],
    wood: ["wood", "rest"],
    gorge: ["gorge", "bridge", "hairpin"],
    high: ["pullout", "pass"],
    lake: ["lookout", "jetty"],
    far: ["far"],
    tiers: ["tiers"],
  };
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  for (const [k, keys] of Object.entries(sheetsOf)) {
    const fs = keys.flatMap((key) => (groups[key] ?? []).sort());
    if (!fs.length) continue;
    const html = `<html><body style="margin:0;background:#1b1d20;font:14px system-ui;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(${fs.length > 4 ? 3 : 2},1fr);gap:6px;padding:6px">
${fs.map((f) => `<figure style="margin:0"><img src="file://${out}/${f}" style="width:100%;display:block"><figcaption style="padding:3px 2px">${f.replace(".png", "")}</figcaption></figure>`).join("\n")}
</div></body></html>`;
    const tmp = `${out}/.sheet.html`;
    writeFileSync(tmp, html);
    await page.goto(`file://${tmp}`);
    await page.waitForLoadState("load");
    await page.screenshot({ path: `${out}/sheet-${k}.png`, fullPage: true });
    console.log(`sheet-${k}.png (${fs.length})`);
  }
  await page.close();
}

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
});
if (process.env.SHEETS) {
  await sheets(browser);
  await browser.close();
  process.exit(0);
}
const ana = await open(browser);
const wantSpots = process.env.SPOTS?.split(",");
const wantStates = process.env.STATES?.split(",");
try {
  await go(ana, [478, -405]);
  await ana.evaluate(() => {
    (window as any).__rdCam = { from: [500, 2, -401], to: [700, 2, -405], fogNear: 250, fogFar: 20000 };
  });
  for (const s of SPOTS) {
    if (wantSpots && !wantSpots.includes(s.name)) continue;
    const t0 = Date.now();
    const cx = s.from[0];
    const cz = s.from[2];
    const look: [number, number] = [s.to[0] - cx, s.to[2] - cz];
    const ll = Math.hypot(look[0], look[1]) || 1;
    const road1 = road(cx, cz, s.far ? 14000 : 3000);
    const pl = places();
    const setup: Setup = {
      rings: rings(cx, cz, !s.far),
      trees: Buffer.from(trees(cx, cz, !!s.far, [look[0] / ll, look[1] / ll]).buffer).toString("base64"),
      road: road1,
      places: pl.g,
      glows: pl.glows,
      lake: lake(),
      creek: creek(cx, cz),
      signs: signs(),
      far: !!s.far,
    };
    console.log(s.name, `(the mock's data in ${Date.now() - t0} ms)`);
    await mock(ana, setup);
    if (process.env.DEBUG)
      console.log(
        await ana.evaluate(() => {
          const win = window as any;
          const r = win.__rdRoot;
          const tp = win.__yutopia.tp;
          return JSON.stringify({
            root: r.position,
            kids: r.children
              .slice(0, 8)
              .map((m: any) => [
                m.type,
                m.visible,
                m.geometry?.attributes.position.count,
                m.geometry?.index?.count,
                m.layers.mask,
                m.material?.type,
              ]),
            cam: tp.camera.position,
            camLayers: tp.camera.layers.mask,
            info: tp.renderer.info.render,
          });
        }),
      );
    const fl = landAt(s.from[0], s.from[2]);
    const tl = landAt(s.to[0], s.to[2]);
    await ana.evaluate(
      ([c]) => {
        const win = window as any;
        win.__rdCam = { ...win.__rdCam, ...c };
      },
      [
        { from: [s.from[0], fl + s.from[1], s.from[2]], to: [s.to[0], tl + s.to[1], s.to[2]], lights: !!s.lights },
      ] as const,
    );
    const states = STATES.filter((x) =>
      wantStates ? wantStates.includes(x.name) : s.states ? s.states.includes(x.name) : x.name === "noon",
    );
    for (const st of states) {
      if (quality !== "high" && st.name !== "noon") continue;
      // (twice: the materials compile after the first)
      await setState(ana, st);
      await ana.waitForTimeout(1500);
      await setState(ana, st);
      await shot(ana, `${s.name}-${st.name}`);
    }
  }
} finally {
  await ana.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:weather", { to: null, now: true });
    w.room.send("mod:fog", { fog: null, now: true });
  });
}
await sheets(browser);
await browser.close();
void PINE_H;
void terrainAt;
