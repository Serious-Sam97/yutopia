import type { Container, Graphics } from "pixi.js";
import type { Daylight } from "../daylight";

// What surrounds the studio. Each theme draws a backdrop behind the world
// (screen space) and the building below the floor's outer edges (world px).
export interface ThemeView {
  readonly root: Container;
  setDay(d: Daylight): void;
  setAnimate(on: boolean): void; // off under reduced motion
  update(dt: number, W: number, H: number, camX: number, camY: number, zoom: number): void;
  // `lights` only shows at night (windows still lit)
  drawShell(
    body: Graphics,
    lights: Graphics,
    floorAt: (x: number, y: number) => boolean,
    width: number,
    height: number,
  ): void;
  destroy(): void;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d") as CanvasRenderingContext2D };
}

const hexRgb = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const lerpHex = (a: string, b: string, t: number): number => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return (c[0] << 16) | (c[1] << 8) | c[2];
};
export const css = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// Colour keys through the day: [hour, ...colours]; returns them blended for `hour`.
export function keyed(keys: [number, ...string[]][], hour: number): number[] {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= hour) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = Math.max(0, Math.min(1, (hour - a[0]) / (b[0] - a[0])));
  const s = t * t * (3 - 2 * t);
  return a.slice(1).map((c, k) => lerpHex(c as string, b[k + 1] as string, s));
}

// iso helpers for shells
export const HW = 32;
export const HH = 16;
export const P = (x: number, y: number): [number, number] => [(x - y) * HW, (x + y) * HH];

// Visit the floor's outer south and east edges (the ones facing the camera):
// `a → b` runs along the edge in screen order.
export function outerEdges(
  floorAt: (x: number, y: number) => boolean,
  width: number,
  height: number,
  visit: (a: [number, number], b: [number, number], side: "s" | "e") => void,
) {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!floorAt(x, y)) continue;
      if (!floorAt(x, y + 1)) visit(P(x, y + 1), P(x + 1, y + 1), "s");
      if (!floorAt(x + 1, y)) visit(P(x + 1, y + 1), P(x + 1, y), "e");
    }
}
