import type { Building } from "@yutopia/shared/grounds";

// How each building on the Grounds looks (docs/plan/33-the-look.md, phase 7): the choices both
// views make the same — a shop's wall, its front, its awning; a townhouse's kind, colour and
// shutters. Decided once from the building, its own seed (no drawing order in it), so 3D
// (tp/grounds3d.ts) and iso (art/grounds-items.ts) agree. No three.js here: both chunks take it.

/** The same small generator as the Grounds' (shared groundsRng), by a seed. */
function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShopLook {
  civic: boolean; // the town hall, the post office
  diner: boolean;
  brick: boolean;
  wall: string; // its wall's colour
  trim: string;
  falseFront: boolean; // a front rising over its roof
  awning: string;
  striped: boolean;
  /** each upstairs window lit at night, front then sides, as many as asked */
  lit: (n: number) => boolean[];
}
export function shopLook(b: Building): ShopLook {
  const r = rngOf(b.x0 * 7919 + b.z0 * 31 + 7);
  const civic = b.key === "hall" || b.key === "post";
  const diner = b.kind === "diner";
  const brick = !civic && !diner && r() < 0.6;
  const wall = civic
    ? "#d9d3c4"
    : diner
      ? "#c9ced3"
      : brick
        ? ["#7b3b2c", "#6c4436", "#8a5a42", "#5b4a44"][Math.floor(r() * 4)]
        : ["#c9c2b2", "#8d9a9c", "#b9a98b", "#a7b39a", "#c4a98d"][Math.floor(r() * 5)];
  const awning = b.sign === "BAR" ? "#5a1e1e" : ["#2f4a3b", "#6b2430", "#2c3e55", "#6a5a40"][Math.floor(r() * 4)];
  const striped = b.sign !== "BAR" && r() < 0.5;
  const seed = r() * 1e9;
  return {
    civic,
    diner,
    brick,
    wall,
    trim: brick ? "#cfc6b4" : civic ? "#ece6da" : "#e6e1d6",
    falseFront: !civic && !diner && (!brick || b.floors === 1),
    awning,
    striped,
    lit: (n) => {
      const q = rngOf(seed);
      return Array.from({ length: n }, () => !b.vacant && q() < 0.4);
    },
  };
}

export interface HouseLook {
  kind: 0 | 1 | 2; // side gable, two storeys · front gable with a porch across · storey and a half, a dormer
  wall: string;
  shutter: string;
  H: number; // its walls' height
  rise: number; // its roof's
  chimneyEnd: boolean; // at the far end of the ridge (else the near)
  lit: (n: number) => boolean[];
}
export function houseLook(b: Building): HouseLook {
  const r = rngOf(b.z0 * 17 + b.x0 * 3 + 11);
  const kind = Math.floor(r() * 3) as 0 | 1 | 2;
  const wall = ["#d8d2c4", "#b9c4c9", "#c9b48f", "#8f9e8b", "#c7a59a", "#e3dccb", "#9aa7b4"][Math.floor(r() * 7)];
  const shutter = ["#2f4a3b", "#6b2430", "#2c3e55", "#3a3f45", "#5a4636"][Math.floor(r() * 5)];
  const chimneyEnd = r() < 0.5;
  const seed = r() * 1e9;
  return {
    kind,
    wall,
    shutter,
    H: kind === 2 ? 4.2 : 6.4,
    rise: kind === 2 ? 4.4 : kind === 1 ? 3.6 : 2.6,
    chimneyEnd,
    lit: (n) => {
      const q = rngOf(seed);
      return Array.from({ length: n }, () => q() < 0.35);
    },
  };
}

/** A colour as a number (three.js wants them so). */
export const hexOf = (c: string) => Number.parseInt(c.slice(1), 16);
