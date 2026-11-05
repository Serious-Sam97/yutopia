import type { CamMode } from "../view";
export const FOV = 50;

export const LIMITS: Record<CamMode, { pitch: [number, number]; dist: [number, number] }> = {
  // (the KH camera: low and behind — docs/plan/56-the-controls.md D; follow-cam.ts keeps it there)
  chase: { pitch: [-0.15, 0.75], dist: [2, 12] },
  free: { pitch: [-0.12, 1.45], dist: [1.2, 14] },
  first: { pitch: [-1.25, 1.25], dist: [0, 0] },
};

// Where a 2D segment first enters a box (0..1 along it), or null.
export function segBox(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return t0;
}

export function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const GROUND_POOL = 4; // their own point lights (High; fewer below)

// ── over heads ───────────────────────────────────────────────────────────────
export interface Tag {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  dot: HTMLSpanElement;
  slash: HTMLSpanElement;
  emote: HTMLImageElement;
  bubble: HTMLDivElement;
  dotKey: string;
  emoteKey: string;
  bubbleUntil: number;
}

export const LAMPS = 10; // point lights in the pool (the nearest lamps get them)
