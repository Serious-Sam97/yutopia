// Plan 111 phase 3 (docs/plan/111-buildings-fixes.md, F1b) — a room behind every window. The buildings' glass is
// see-through now: each opening of a wall (shared building-kit.ts KHole) gets a box of a room behind it, as deep as
// its use wants and as wide as its bay — back wall, side walls, floor, ceiling, all facing in — and the things in it
// by use (a home's curtains, sofa or bed, a picture, a lamp; a shop's shelves of goods, its counter, a display at the
// glass; an office's desks and screens; a café's tables and its bar back). A lit room's shell is laid again in warm
// light at night (`lit`: its own colours glowing, as the windows come on). Plain quads with a colour each: the kit's
// batcher (kit-buildings.ts) lays them into its batches, merged a cell at a time. No three here.

import type { Layout } from "@yutopia/shared/building-kit";
import { OPENINGS } from "@yutopia/shared/building-kit";

type V = [number, number, number];
/** A flat face to draw: its points (wound any way), the way it faces, its colour; `glow`: the night's layer. */
export interface RoomQuad {
  pts: V[];
  n: V;
  c: number;
  /** in a room lit at night (its lamps' light: kit-buildings.ts room-lit) */
  lit?: boolean;
  /** each point's light (its colour times this): a room's darker in from its window */
  ks?: number[];
}
/** What a building's rooms are for. */
export type RoomUse = "home" | "shop" | "cafe" | "office" | "hall" | "bare";
export interface RoomOpts {
  /** the ground floor's rooms and the floors' above */
  ground: RoomUse;
  upper: RoomUse;
  /** (a building walked into) its ground floor's real: no rooms under this height (m over its ground) */
  insideH?: number;
  /** each opening lit at night, or not (by its part's own `lit`; else this share of them, seeded) */
  litShare?: number;
}
/** The doors no room shows behind (solid, or a vehicle's). */
const SOLID = new Set(["door-garage", "door-rollup", "door-apparatus", "door-barn", "door-service", "door-slider"]);
/** A room's light by day against the street's (its window's side; under half that at its back): a room is a few
 *  times darker than outside, its window the light's way in. */
const DAY = 0.3;
/** The lamps' panels: lit, not shaded. */
const LAMP_SHOP = 0xfdf8ec;
const LAMP_OFFICE = 0xf6f8fa;
const LAMPS = new Set([LAMP_SHOP, LAMP_OFFICE]);
/** How deep each use's rooms are (m), at most. */
const DEPTH: Record<RoomUse, number> = { home: 3.2, shop: 4.6, cafe: 4.2, office: 4.2, hall: 4.5, bare: 3.0 };

// (a seeded random of a few numbers)
function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(Math.round(a * 97) | 0, 0x27d4eb2d) ^
    Math.imul(Math.round(b * 89) | 0, 0x165667b1) ^
    Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}
const pick = <T>(xs: readonly T[], r: number): T => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];
function mul(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// the rooms' colours by use: walls, floors, the cloth at a home's windows, the goods on a shop's shelves
const WALLS: Record<RoomUse, number[]> = {
  home: [0xe8dcc4, 0xd9c7a8, 0xc9d3c0, 0xd8c2b4, 0xc3ccd6, 0xe6d6b8, 0xb9a88c, 0xd0b89c],
  shop: [0xf1ece2, 0xe6e1d5, 0xf3efe6, 0xdfe4e6],
  cafe: [0xc9a27a, 0x9c6e4c, 0xd8c3a0, 0x7e5a44, 0xb98a62],
  office: [0xe9e7e2, 0xdcdfe0, 0xe4e0d6],
  hall: [0xe2d6c0, 0xd8cbb0],
  bare: [0x8c8478, 0x7a7266, 0x9a9283],
};
const FLOORS: Record<RoomUse, number[]> = {
  home: [0x8a6040, 0x6e4c34, 0x9c7a56, 0x7c6a5c, 0x5a4a44],
  shop: [0xb8b2a6, 0xcfc8b8, 0x8f8a80],
  cafe: [0x5e3e2a, 0x2e2a28, 0x7a5236],
  office: [0x6f7378, 0x8a8478, 0x5e646c],
  hall: [0x7a5a3e],
  bare: [0x6a655c, 0x5a554e],
};
const CLOTH = [0xb8463c, 0x7c8a5a, 0xd8c39a, 0x3e5a78, 0x8a6a9a, 0xe0d8c8, 0x9a7a4c, 0x4a6a5e, 0xc98a5a];
const GOODS = [0xc8423a, 0xe8b23a, 0x3e7ab8, 0x5a9a4a, 0xf0e6d0, 0x8a4a8a, 0xe07a3a, 0x2a2a2a, 0xd8d0b0, 0x4ab0a8];
const WOOD = [0x6e4a30, 0x8a6240, 0x4e3828, 0xa07850];
const SOFA = [0x6a4a3a, 0x3e5266, 0x7a7262, 0x5b3a4a, 0x8a8578, 0x4a5a3e];

/** The rooms behind a layout's openings (`y0` its ground), as quads. */
export function roomQuads(L: Layout, y0: number, o: RoomOpts): RoomQuad[] {
  const out: RoomQuad[] = [];
  // (its plan's extent: no room deeper than near half of it)
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const w of L.walls)
    for (const p of [w.a, w.b]) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[1]);
      z1 = Math.max(z1, p[1]);
    }
  const half = Math.max(1, Math.min(x1 - x0, z1 - z0) * 0.45);
  // (each point's depth into its room, for its light)
  const depthOf = new WeakMap<V, number>();
  for (const w of L.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (len < 0.5 || !w.holes.length) continue;
    const tx = (w.b[0] - w.a[0]) / len;
    const tz = (w.b[1] - w.a[1]) / len;
    const [ox, oz] = w.o;
    // a point of the room: s along the wall, d in from its face, y up
    const P = (s: number, d: number, y: number): V => {
      const v: V = [w.a[0] + tx * s - ox * d, y + y0, w.a[1] + tz * s - oz * d];
      depthOf.set(v, d);
      return v;
    };
    const holes = [...w.holes].sort((p, q) => p.s0 - q.s0);
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      if (h.s1 - h.s0 < 0.25 || h.y1 - h.y0 < 0.3) continue;
      // (its part: what it is, and whether it's lit)
      const mid = (h.s0 + h.s1) / 2;
      const [cx, cz] = [w.a[0] + tx * mid, w.a[1] + tz * mid];
      const part = L.parts.find(
        (p) => Math.abs(p.y - h.y0) < 0.25 && Math.hypot(p.x - cx, p.z - cz) < Math.max(0.45, (h.s1 - h.s0) / 2),
      );
      if (part && SOLID.has(part.part)) continue;
      const upper = h.y0 > 3.2;
      // (a floor walked into: its own inside seen through it — a transom over its door too, just over its walls)
      if (o.insideH && h.y0 < o.insideH + 0.5) continue;
      const use = upper ? o.upper : o.ground;
      const seed = hash(cx, cz, Math.round(h.y0 * 10));
      // (its part's own `lit`, or its own share of the rest)
      const lit = !!part?.lit || hash(cx, cz, 77) < (o.litShare ?? 0.5) * 0.6;
      // its box: wider than its opening (hidden behind the wall), never into the next one's
      const gapL = i > 0 ? (h.s0 - holes[i - 1].s1) / 2 : h.s0;
      const gapR = i + 1 < holes.length ? (holes[i + 1].s0 - h.s1) / 2 : len - h.s1;
      // (at least a hair past its opening each side: on the jamb's own plane, its side fought the frame's — the next
      // room's side, overlapped, faces away from this one)
      const sL = h.s0 - Math.max(0.04, Math.min(0.3, gapL - 0.02));
      const sR = h.s1 + Math.max(0.04, Math.min(0.3, gapR - 0.02));
      const head = OPENINGS[part?.part ?? ""]?.head;
      const rise = head === "arch" ? (h.s1 - h.s0) / 2 : head === "pointed" ? (h.s1 - h.s0) * 0.87 : 0;
      // (its floor a hair under its opening's foot at least: on the threshold's plane it fought it)
      const sill = h.y0 - w.y0 < 0.4 ? 0.03 : Math.min(0.9, h.y0 - w.y0);
      const yb = h.y0 - sill;
      const yt = Math.max(h.y1 + rise + 0.35, yb + 2.5);
      const D = Math.min(DEPTH[use], half);
      if (D < 0.8) continue;
      const W = sR - sL;
      const first = out.length;
      // ── the shell: back wall, sides, floor, ceiling (facing in) ──
      const wall = pick(WALLS[use], seed);
      const floor = pick(FLOORS[use], hash(seed, 3));
      const out1: V = [ox, 0, oz];
      const along: V = [tx, 0, tz];
      const back: V[] = [P(sL, D, yb), P(sR, D, yb), P(sR, D, yt), P(sL, D, yt)];
      const left: V[] = [P(sL, 0, yb), P(sL, D, yb), P(sL, D, yt), P(sL, 0, yt)];
      const right: V[] = [P(sR, 0, yb), P(sR, D, yb), P(sR, D, yt), P(sR, 0, yt)];
      const flo: V[] = [P(sL, 0, yb), P(sR, 0, yb), P(sR, D, yb), P(sL, D, yb)];
      const ceil: V[] = [P(sL, 0, yt), P(sR, 0, yt), P(sR, D, yt), P(sL, D, yt)];
      out.push({ pts: back, n: out1, c: wall });
      out.push({ pts: left, n: along, c: mul(wall, 0.86) });
      out.push({ pts: right, n: [-tx, 0, -tz], c: mul(wall, 0.86) });
      out.push({ pts: flo, n: [0, 1, 0], c: floor });
      out.push({ pts: ceil, n: [0, -1, 0], c: mul(use === "bare" ? wall : 0xeeeae2, 0.92) });
      // ── its things, a box at a time (s0…s1 along, d0…d1 in, y0…y1 up) ──
      const box = (s0: number, s1: number, d0: number, d1: number, b0: number, b1: number, c: number) => {
        const a = Math.max(sL + 0.01, Math.min(s0, s1));
        const b = Math.min(sR - 0.01, Math.max(s0, s1));
        const da = Math.max(0.05, Math.min(d0, d1));
        const db = Math.min(D - 0.01, Math.max(d0, d1));
        if (b - a < 0.01 || db - da < 0.01) return;
        const ya = yb + b0;
        const yz = Math.min(yt - 0.01, yb + b1);
        out.push({ pts: [P(a, da, yz), P(b, da, yz), P(b, db, yz), P(a, db, yz)], n: [0, 1, 0], c });
        out.push({ pts: [P(a, da, ya), P(b, da, ya), P(b, da, yz), P(a, da, yz)], n: out1, c: mul(c, 0.9) });
        out.push({ pts: [P(a, da, ya), P(a, db, ya), P(a, db, yz), P(a, da, yz)], n: [-tx, 0, -tz], c: mul(c, 0.8) });
        out.push({ pts: [P(b, da, ya), P(b, db, ya), P(b, db, yz), P(b, da, yz)], n: along, c: mul(c, 0.8) });
      };
      const r = (k: number) => hash(seed, k, 5);
      const hs0 = h.s0;
      const hs1 = h.s1;
      const hw = hs1 - hs0;
      const hy0 = h.y0 - yb;
      const hy1 = h.y1 + rise - yb;
      if (use === "home") {
        const cloth = pick(CLOTH, r(1));
        const k = r(2);
        if (k < 0.55) {
          // curtains drawn back to each side, a valance
          const cw = Math.min(0.42, hw * 0.28);
          box(hs0 - 0.12, hs0 + cw, 0.1, 0.16, Math.max(0.05, hy0 - 0.25), hy1 + 0.15, cloth);
          box(hs1 - cw, hs1 + 0.12, 0.1, 0.16, Math.max(0.05, hy0 - 0.25), hy1 + 0.15, cloth);
          box(hs0 - 0.12, hs1 + 0.12, 0.1, 0.18, hy1 - 0.02, hy1 + 0.18, mul(cloth, 0.85));
        } else if (k < 0.85) {
          // a blind, part down
          box(hs0 - 0.04, hs1 + 0.04, 0.12, 0.14, hy1 - (hy1 - hy0) * (0.2 + r(3) * 0.45), hy1 + 0.05, 0xe4ddcc);
        }
        if (upper && r(4) < 0.6) {
          // a bed's foot, its cover
          const bw = Math.min(1.6, W - 0.4);
          const bc = pick(CLOTH, r(5));
          box(mid - bw / 2, mid + bw / 2, D - 2.0, D - 0.05, 0, 0.5, mul(bc, 0.9));
          box(mid - bw / 2, mid + bw / 2, D - 0.25, D - 0.05, 0, 1.0, pick(WOOD, r(6)));
        } else {
          // a sofa's back to the window's wall opposite, its arms
          const sw = Math.min(2.0, W - 0.5);
          const sc = pick(SOFA, r(7));
          box(mid - sw / 2, mid + sw / 2, D - 0.85, D - 0.08, 0, 0.45, sc);
          box(mid - sw / 2, mid + sw / 2, D - 0.3, D - 0.08, 0.45, 0.9, mul(sc, 0.92));
          box(mid - sw / 2, mid - sw / 2 + 0.18, D - 0.85, D - 0.08, 0.45, 0.62, mul(sc, 0.95));
          box(mid + sw / 2 - 0.18, mid + sw / 2, D - 0.85, D - 0.08, 0.45, 0.62, mul(sc, 0.95));
        }
        // a picture over it, a lamp to a side
        box(mid - 0.32, mid + 0.32, D - 0.04, D - 0.01, 1.35, 1.8, 0x3a2e26);
        box(
          mid - 0.26,
          mid + 0.26,
          D - 0.05,
          D - 0.03,
          1.4,
          1.75,
          pick([0x7a96a8, 0xc8a46a, 0x6a8a5a, 0xb07a6a], r(8)),
        );
        const ls = r(9) < 0.5 ? sL + 0.35 : sR - 0.35;
        box(ls - 0.03, ls + 0.03, D - 0.5, D - 0.44, 0, 1.35, 0x2a2622);
        box(ls - 0.18, ls + 0.18, D - 0.65, D - 0.3, 1.25, 1.55, lit ? 0xfff0c8 : 0xd8ccb0);
      } else if (use === "shop") {
        // shelves along the back, full of goods; a counter; a display at the glass
        for (const sy of [0.35, 0.85, 1.35, 1.85]) {
          box(sL + 0.05, sR - 0.05, D - 0.5, D - 0.02, sy - 0.03, sy, 0xd8d2c4);
          for (let s = sL + 0.12; s < sR - 0.15; ) {
            const gw = 0.12 + r(Math.round(s * 13) + sy * 7) * 0.2;
            const gh = 0.15 + r(Math.round(s * 17) + sy * 11) * 0.28;
            if (r(Math.round(s * 19) + sy * 3) > 0.12)
              box(s, s + gw, D - 0.46, D - 0.08, sy, sy + gh, pick(GOODS, r(Math.round(s * 23) + sy * 5)));
            s += gw + 0.02;
          }
        }
        if (r(10) < 0.6) {
          const cw = Math.min(2.4, W * 0.5);
          const cs = r(11) < 0.5 ? sL + 0.2 : sR - 0.2 - cw;
          box(cs, cs + cw, D * 0.42, D * 0.42 + 0.6, 0, 1.0, pick(WOOD, r(12)));
          box(cs, cs + cw, D * 0.42 - 0.03, D * 0.42 + 0.63, 1.0, 1.05, 0x2e2a26);
        }
        // the display: a low stand of goods behind the glass
        box(hs0 + 0.15, hs1 - 0.15, 0.45, 1.05, 0, Math.min(0.7, Math.max(0.3, hy0 + 0.05)), pick(WOOD, r(13)));
        for (let s = hs0 + 0.25; s < hs1 - 0.35; s += 0.45 + r(Math.round(s * 7)) * 0.3) {
          const gy = Math.min(0.7, Math.max(0.3, hy0 + 0.05));
          box(s, s + 0.3, 0.55, 0.9, gy, gy + 0.2 + r(Math.round(s * 9)) * 0.35, pick(GOODS, r(Math.round(s * 31))));
        }
        // the lights over it all
        for (let s = sL + 0.6; s < sR - 0.3; s += 1.8)
          box(s, s + 0.9, D * 0.3, D * 0.3 + 0.3, yt - yb - 0.06, yt - yb - 0.01, LAMP_SHOP);
      } else if (use === "cafe") {
        // the bar back's shelf of bottles, tables and stools by the glass, a pendant each
        box(sL + 0.05, sR - 0.05, D - 0.35, D - 0.02, 1.0, 1.04, 0x3a2a20);
        box(sL + 0.05, sR - 0.05, D - 0.35, D - 0.02, 1.5, 1.54, 0x3a2a20);
        for (let s = sL + 0.15; s < sR - 0.12; s += 0.11 + r(Math.round(s * 29)) * 0.06)
          for (const by of [1.04, 1.54])
            box(
              s,
              s + 0.07,
              D - 0.25,
              D - 0.12,
              by,
              by + 0.22 + r(Math.round(s * 37 + by)) * 0.1,
              pick([0x3a6a3a, 0x8a5a2a, 0xd8c890, 0x5a2a2a, 0x2a3a5a], r(Math.round(s * 41 + by))),
            );
        for (let s = hs0 + 0.5; s < hs1 - 0.3; s += 1.4) {
          box(s - 0.35, s + 0.35, 0.9, 1.6, 0.72, 0.76, pick(WOOD, r(14)));
          box(s - 0.04, s + 0.04, 1.21, 1.29, 0, 0.72, 0x2a2622);
          box(s - 0.55, s - 0.3, 1.1, 1.4, 0, 0.45, 0x5a3a2a);
          box(s + 0.3, s + 0.55, 1.1, 1.4, 0, 0.45, 0x5a3a2a);
          box(s - 0.02, s + 0.02, 1.23, 1.27, 1.95, yt - yb, 0x1e1c1a);
          box(s - 0.14, s + 0.14, 1.11, 1.39, 1.8, 1.95, lit ? 0xffd890 : 0xc8b08a);
        }
      } else if (use === "office") {
        // desks with screens, a partition, the panels of light over them, a plant
        for (let s = sL + 0.3; s < sR - 0.9; s += 1.7) {
          box(s, s + 1.2, D * 0.45, D * 0.45 + 0.7, 0.72, 0.76, 0xd8d4cc);
          box(s + 0.05, s + 0.1, D * 0.45 + 0.05, D * 0.45 + 0.65, 0, 0.72, 0x5a5e62);
          box(s + 1.1, s + 1.15, D * 0.45 + 0.05, D * 0.45 + 0.65, 0, 0.72, 0x5a5e62);
          box(s + 0.35, s + 0.85, D * 0.45 + 0.45, D * 0.45 + 0.5, 0.78, 1.12, 0x1c1e22);
          box(
            s - 0.05,
            s + 1.25,
            D * 0.45 + 0.72,
            D * 0.45 + 0.77,
            0,
            1.25,
            pick([0x7a8a96, 0x9a8c7a, 0x6a7a6a], r(15)),
          );
        }
        for (let s = sL + 0.5; s < sR - 0.5; s += 1.5)
          box(s, s + 1.0, D * 0.5, D * 0.5 + 0.5, yt - yb - 0.05, yt - yb - 0.01, LAMP_OFFICE);
        if (r(16) < 0.5) {
          const ps = r(17) < 0.5 ? sL + 0.3 : sR - 0.3;
          box(ps - 0.18, ps + 0.18, D - 0.5, D - 0.15, 0, 0.4, 0x8a6a4a);
          box(ps - 0.25, ps + 0.25, D - 0.6, D - 0.05, 0.4, 1.2, 0x3e6a3a);
        }
      } else if (use === "bare") {
        // crates, a shelf
        for (let s = sL + 0.2; s < sR - 0.6; s += 0.9 + r(Math.round(s * 5)) * 0.8)
          box(s, s + 0.55, D - 0.7, D - 0.1, 0, 0.45 + r(Math.round(s * 3)) * 0.5, pick(WOOD, r(Math.round(s * 11))));
      }
      // its light: dimmer than the street, darker in from the window; its lamps' own panels as they are; lit at
      // night, or not
      for (let j = first; j < out.length; j++) {
        const q = out[j];
        q.lit = lit;
        if (LAMPS.has(q.c)) continue;
        q.ks = q.pts.map((p) => DAY * (1 - 0.55 * Math.min(1, (depthOf.get(p) ?? 0) / D)));
      }
    }
  }
  return out;
}

/** What each kind's rooms are for (ground floor, floors above) and the share of them lit at night. */
export function roomUse(kind: string): RoomOpts {
  switch (kind) {
    case "house":
    case "townhouses":
    case "apartments":
    case "farmhouse":
      return { ground: "home", upper: "home", litShare: 0.55 };
    case "shop":
    case "cornershop":
    case "gas":
      return { ground: "shop", upper: "home", litShare: 0.6 };
    case "bar":
    case "diner":
      return { ground: "cafe", upper: "home", litShare: 0.7 };
    case "hotel":
      return { ground: "cafe", upper: "home", litShare: 0.5 };
    case "office":
    case "clinic":
    case "police":
    case "school":
    case "library":
    case "fire":
    case "gatehouse":
      return { ground: "office", upper: "office", litShare: 0.45 };
    case "church":
      return { ground: "hall", upper: "hall", litShare: 0.4 };
    default:
      return { ground: "bare", upper: "bare", litShare: 0.15 };
  }
}
