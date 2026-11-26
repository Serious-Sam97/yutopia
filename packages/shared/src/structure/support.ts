// What holds an upper storey up (docs/plan/130-the-house-build.md, the quality pass — The Sims' rule): on a home
// lot's storey over the ground (or over a basement's), a floor or a wall stands only over something on the storey
// under it — inside one of its rooms, or within an overhang of one of its walls (not a fence's, a rail's) or its
// columns. A foundation alone holds nothing up; nothing floats. The other way: a wall that holds up what's over it
// stays.

import type { StructOp } from "./ops.ts";
import { applyOps } from "./ops.ts";
import { inRing } from "./rings.ts";
import type { Floor, Structure, Wall, XY } from "./types.ts";

/** How far a floor reaches past what holds it up (m): The Sims' two tiles. */
export const OVERHANG = 2;
/** The kinds that hold a storey up as a wall does (columns, posts, piers). */
export const SUPPORT_KINDS = new Set([
  "column",
  "porch_column",
  "square_post",
  "tuscan_column",
  "doric_column",
  "ionic_column",
  "corinthian_column",
  "log_post",
  "brick_pier",
  "stone_pier",
  "steel_pole",
]);

const segDist = (p: XY, a: XY, b: XY): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
};

/** The storey under a home storey (null: none to need — the ground storey, a basement, any other floor). */
export function storeyUnder(s: Structure, floor: number): Floor | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f?.space?.startsWith("home:") || (f.storey ?? 0) <= 0) return null;
  return s.floors.find((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) - 1 && !q.away) ?? null;
}

/** Whether (x, y) on storey `floor` is held up from the storey under it (true where there's none to need). */
export function heldUp(s: Structure, floor: number, p: XY, columns: readonly XY[] = []): boolean {
  const u = storeyUnder(s, floor);
  if (!u) return true;
  if (s.rooms.some((r) => r.floor === u.index && inRing(r.outline, p[0], p[1]))) return true;
  for (const w of s.walls) if (w.floor === u.index && !w.style && segDist(p, w.a, w.b) <= OVERHANG + 1e-6) return true;
  return columns.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) <= OVERHANG + 1e-6);
}

/** Points along a wall and over a polygon (a half-metre grid inside it and its corners), to ask. */
const alongWall = (w: Pick<Wall, "a" | "b">): XY[] => {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const n = Math.max(1, Math.ceil(L / 0.5));
  return Array.from(
    { length: n + 1 },
    (_, i): XY => [w.a[0] + ((w.b[0] - w.a[0]) * i) / n, w.a[1] + ((w.b[1] - w.a[1]) * i) / n],
  );
};
const overRing = (ring: readonly XY[]): XY[] => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const out: XY[] = ring.map((p): XY => [p[0], p[1]]);
  for (let x = Math.min(...xs) + 0.25; x < Math.max(...xs); x += 0.5)
    for (let y = Math.min(...ys) + 0.25; y < Math.max(...ys); y += 0.5)
      if (inRing(ring as XY[], x, y)) out.push([x, y]);
  return out;
};

/** Why a storey's walls and floors as they'd be aren't held up (null: they are) — what's on `floor` after `ops`. */
export function supportWhy(s: Structure, floor: number, columns: readonly XY[] = []): string | null {
  if (!storeyUnder(s, floor)) return null;
  for (const w of s.walls)
    if (w.floor === floor && !alongWall(w).every((p) => heldUp(s, floor, p, columns)))
      return "nothing under it holds it up: build walls or columns on the storey below first";
  for (const sl of s.slabs)
    if (sl.floor === floor && !overRing(sl.outline).every((p) => heldUp(s, floor, p, columns)))
      return "nothing under it holds it up: build walls or columns on the storey below first";
  return null;
}

/** Why an edit on `floor` can't go for the storeys' support (null: it can): what's on it held up after it, and what
 *  it holds up on the storey over it still held up. */
export function supportEditWhy(
  s: Structure,
  floor: number,
  ops: readonly StructOp[],
  columnsOn: (floor: number) => readonly XY[] = () => [],
): string | null {
  const after = applyOps(s, [...ops]);
  // (only what this edit added or moved on its own floor is asked of it — a storey older than the rule stays)
  const before = new Set([...s.walls.map((w) => JSON.stringify([w.floor, w.a, w.b])), ...s.slabs.map((x) => x.id)]);
  if (storeyUnder(after, floor)) {
    for (const w of after.walls)
      if (
        w.floor === floor &&
        !before.has(JSON.stringify([w.floor, w.a, w.b])) &&
        !alongWall(w).every((p) => heldUp(after, floor, p, columnsOn(storeyUnder(after, floor)?.index ?? -1)))
      )
        return "nothing under it holds it up: build walls or columns on the storey below first";
    for (const sl of after.slabs)
      if (
        sl.floor === floor &&
        !before.has(sl.id) &&
        !overRing(sl.outline).every((p) => heldUp(after, floor, p, columnsOn(storeyUnder(after, floor)?.index ?? -1)))
      )
        return "nothing under it holds it up: build walls or columns on the storey below first";
  }
  // (the storey over it: what it held up before, it still does)
  const f = after.floors.find((q) => q.index === floor);
  const over = f?.space
    ? after.floors.find((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) + 1)
    : null;
  if (over && (f?.storey ?? 0) >= 0) {
    const cols = columnsOn(floor);
    const was = (p: XY) => heldUp(s, over.index, p, cols);
    const now = (p: XY) => heldUp(after, over.index, p, cols);
    for (const w of after.walls)
      if (w.floor === over.index && alongWall(w).some((p) => was(p) && !now(p)))
        return "it holds up the storey over it";
    for (const sl of after.slabs)
      if (sl.floor === over.index && sl.top !== "g" && overRing(sl.outline).some((p) => was(p) && !now(p)))
        return "it holds up the storey over it";
  }
  return null;
}

/** The columns standing on `floor` among these things (their middles): what holds the storey over them up. */
export function columnsOf(
  things: Iterable<{ kind: string; x: number; y: number; props?: Record<string, unknown> | null }>,
  floor: number,
): XY[] {
  const out: XY[] = [];
  for (const o of things)
    if (SUPPORT_KINDS.has(o.kind) && Number(o.props?.level) === floor) out.push([o.x + 0.5, o.y + 0.5]);
  return out;
}

/** Why taking columns away from `floor` (`before` → `after`, their middles) can't go: what they hold up on the storey
 *  over it (null: nothing that needs them). */
export function columnsHoldWhy(
  s: Structure,
  floor: number,
  before: readonly XY[],
  after: readonly XY[],
): string | null {
  const f = s.floors.find((q) => q.index === floor);
  const over = f?.space ? s.floors.find((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) + 1) : null;
  if (!over || (f?.storey ?? 0) < 0) return null;
  const was = (p: XY) => heldUp(s, over.index, p, before);
  const now = (p: XY) => heldUp(s, over.index, p, after);
  for (const w of s.walls)
    if (w.floor === over.index && alongWall(w).some((p) => was(p) && !now(p))) return "it holds up the storey over it";
  for (const sl of s.slabs)
    if (sl.floor === over.index && sl.top !== "g" && overRing(sl.outline).some((p) => was(p) && !now(p)))
      return "it holds up the storey over it";
  return null;
}

/** (for the tools' ghosts) Why a wall from `a` to `b`, or a floor over `ring`, on `floor` wouldn't be held up (null:
 *  it would) — the storey under it's walls, rooms, and the columns among `things`. */
export function heldWhy(
  s: Structure,
  floor: number,
  what: { a: XY; b: XY } | { ring: readonly XY[] },
  things: Iterable<{ kind: string; x: number; y: number; props?: Record<string, unknown> | null }> = [],
): string | null {
  const u = storeyUnder(s, floor);
  if (!u) return null;
  const cols = columnsOf(things, u.index);
  const pts = "ring" in what ? overRing(what.ring) : alongWall(what);
  return pts.every((p) => heldUp(s, floor, p, cols)) ? null : "nothing under it holds it up";
}
