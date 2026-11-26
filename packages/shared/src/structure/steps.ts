// The steps up onto a foundation (asked 2026-11-26: "a little stair to get up on the foundation — it's missing"): as
// The Sims lays them, at every door out of a house on a foundation, a flight of solid steps from the yard's land up to
// the pad's edge in front of it — worked out from the doors, never kept: a door put in brings them, taken out takes
// them. The same for the drawing (the client's) and for Jolt (physics/build.ts).

import { isDoorKind, openingSpanOf } from "../openings.ts";
import { type Flight, stepsOf } from "./flights.ts";
import { foundOf, type Pad, padsOf } from "./found.ts";
import { freeOpeningMiddle, isFreeOpening } from "./free-openings.ts";
import { inRing } from "./rings.ts";
import type { Structure } from "./types.ts";

const TREAD = 0.28;
/** How far out from a door its foundation's edge may be for it to get steps (a porch's depth). */
export const STEPS_REACH = 4;
/** The steps' look by the foundation's: a log or deck house's in wood, the rest stone. */
const STEP_LOOK: Record<string, string> = { logs: "rustic", deck: "oak" };

type DoorLike = {
  id?: string;
  kind: string;
  x: number;
  y: number;
  yaw?: number;
  props?: Record<string, unknown> | null;
};

/** A floor's steps up to its foundation, one flight at each door out of it (none on a floor without one). */
export function doorSteps(s: Structure, floor: number, objects: Iterable<DoorLike>): Flight[] {
  const h = foundOf(s, floor);
  if (h <= 0) return [];
  const pads = padsOf(s, floor);
  if (!pads.length) return [];
  const padAt = (x: number, y: number): Pad | undefined => pads.find((p) => inRing(p.ring, x, y));
  const inRoom = (x: number, y: number) => s.rooms.some((r) => r.floor === floor && inRing(r.outline, x, y));
  // (a wall — or a fence — across the way from the door out to the pad's edge: no steps that way, they'd stand
  // behind it)
  const walls = s.walls.filter((w) => w.floor === floor);
  const cross = (ax: number, ay: number, bx: number, by: number) =>
    walls.some((w) => {
      const [cx, cy] = w.a;
      const [dx, dy] = w.b;
      const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
      return t > 0 && t < 1 && u >= 0 && u <= 1;
    });
  const out: Flight[] = [];
  for (const o of objects) {
    if (!isDoorKind(o.kind) || !isFreeOpening(o)) continue;
    const [mx, my] = freeOpeningMiddle(o);
    const yaw = o.yaw ?? 0;
    const [nx, ny] = [-Math.sin(yaw), Math.cos(yaw)];
    // (the way out: not into a room; to the pad's edge, the nearer way if both are open)
    let best: { t: number; dx: number; dy: number; pad: Pad } | null = null;
    for (const sg of [1, -1]) {
      const [dx, dy] = [nx * sg, ny * sg];
      if (inRoom(mx + dx * 0.4, my + dy * 0.4)) continue;
      const pad = padAt(mx + dx * 0.05, my + dy * 0.05) ?? padAt(mx - dx * 0.05, my - dy * 0.05);
      if (!pad) continue;
      let t = 0.05;
      while (t <= STEPS_REACH && padAt(mx + dx * t, my + dy * t)) t += 0.05;
      if (t > STEPS_REACH) continue;
      // (its edge exactly: halved between the last step on and the first off)
      let [a, b] = [Math.max(0, t - 0.05), t];
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2;
        if (padAt(mx + dx * m, my + dy * m)) a = m;
        else b = m;
      }
      if (cross(mx + dx * 0.15, my + dy * 0.15, mx + dx * (b + 0.05), my + dy * (b + 0.05))) continue;
      if (!best || b < best.t) best = { t: b, dx, dy, pad };
    }
    if (!best) continue;
    const { t, dx, dy, pad } = best;
    const run = stepsOf({ rise: h, shape: "straight" }) * TREAD;
    // (its top tread against the pad's edge, a hair out past the cap; its foot on the land, `h` down)
    const e = t + 0.03 + run;
    out.push({
      id: `steps:${o.id ?? `${mx.toFixed(2)},${my.toFixed(2)}`}`,
      x: Math.round((mx + dx * e) * 1000) / 1000,
      y: Math.round((my + dy * e) * 1000) / 1000,
      dir: Math.atan2(-dy, -dx),
      shape: "straight",
      turn: 1,
      width: Math.max(
        1,
        Math.min(2.4, openingSpanOf({ kind: o.kind, props: { ...(o.props ?? {}), free: true } }) + 0.4),
      ),
      rise: h,
      style: STEP_LOOK[pad.style] ?? "concrete",
      rail: "none",
      base: -h,
      solid: true,
    });
  }
  return out;
}
