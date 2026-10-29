import { ANCHORED, anchoredAt, type P, smoothLine, WAYS, type WayKind, wayAt } from "./grounds.ts";
import type { GroundsEdits, WayDef } from "./grounds-edits.ts";

// God mode's roads (docs/plan/53-the-god-mode.md, phase 7): a way drawn, moved, widened or lit,
// taken away — as the draft's edits (a new one added; the generator's changed or taken away by
// key). What the generator does with a way does the rest: its line smoothed, the land levelled
// to it, a bridge where it crosses the river or the ravine, its lamps along, joined where an end
// lies on another (the two at one height). The shuttle's ways may be widened or lit, not moved
// nor taken away; nothing runs over anchored ground (the rule book's).

/** A new way's width by its kind, and whether it's lit (the generator's own, near enough). */
export const WAY_DEFAULTS: Record<WayKind, { w: number; pave: boolean; lamps: boolean }> = {
  road: { w: 7, pave: false, lamps: true },
  street: { w: 9, pave: true, lamps: true },
  driveway: { w: 5, pave: false, lamps: false },
  trail: { w: 2.4, pave: false, lamps: false },
  walk: { w: 2, pave: false, lamps: false },
};
/** A pavement's width each side, when a way has them. */
export const PAVE = 2;
const KIND_NAMES: Record<WayKind, string> = {
  road: "Road",
  street: "Street",
  driveway: "Driveway",
  trail: "Trail",
  walk: "Walk",
};

/** The way's definition as it is now (laid: the draft's), or null. */
export function wayDefOf(key: string): WayDef | null {
  const w = WAYS.find((u) => u.key === key);
  if (!w) return null;
  return {
    key: w.key,
    kind: w.kind,
    name: w.name,
    w: w.w,
    pts: w.pts.map((p) => [p[0], p[1]] as P),
    ...(w.closed ? { closed: true } : {}),
    ...(w.pave ? { pave: w.pave } : {}),
    ...(w.lamps !== undefined ? { lamps: w.lamps } : {}),
  };
}

const isNew = (e: GroundsEdits, key: string) => !!e.ways?.add?.some((d) => d.key === key);

/** Why a way can't be moved or taken away (the shuttle's), or null. */
export function wayLocked(key: string): string | null {
  return ANCHORED[`way:${key}`] ?? null;
}

/** A key for a new way, not yet in the draft. */
export function newWayKey(e: GroundsEdits): string {
  let n = 1;
  const taken = new Set((e.ways?.add ?? []).map((d) => d.key));
  while (taken.has(`god-way-${n}`)) n++;
  return `god-way-${n}`;
}
/** A new way's name: its kind and a number ("Road 3"). */
export function newWayName(e: GroundsEdits, kind: WayKind): string {
  const n = (e.ways?.add ?? []).filter((d) => d.kind === kind).length + 1;
  return `${KIND_NAMES[kind]} ${n}`;
}

/** The draft with a way added. */
export function addWay(e: GroundsEdits, d: WayDef): GroundsEdits {
  return { ...e, ways: { ...e.ways, add: [...(e.ways?.add ?? []), d] } };
}
/** The draft with a way changed: a new one's own definition, the generator's by its change. */
export function changeWay(e: GroundsEdits, key: string, patch: Partial<Omit<WayDef, "key">>): GroundsEdits {
  if (isNew(e, key))
    return {
      ...e,
      ways: { ...e.ways, add: (e.ways?.add ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)) },
    };
  return {
    ...e,
    ways: { ...e.ways, change: { ...(e.ways?.change ?? {}), [key]: { ...e.ways?.change?.[key], ...patch } } },
  };
}
/** The draft with a way taken away (a new one: as if never drawn). */
export function removeWay(e: GroundsEdits, key: string): GroundsEdits {
  if (isNew(e, key)) {
    const change = { ...(e.ways?.change ?? {}) };
    delete change[key];
    return { ...e, ways: { ...e.ways, add: (e.ways?.add ?? []).filter((d) => d.key !== key), change } };
  }
  return { ...e, ways: { ...e.ways, remove: [...new Set([...(e.ways?.remove ?? []), key])] } };
}

/** An end of a way being drawn, put on the way it's dropped on (its line's own sample there), so
 *  the generator joins them; and that way's key. */
export function snapEnd(p: P, pad = 3): { p: P; to: string | null } {
  const hit = wayAt(p[0], p[1], pad);
  if (!hit) return { p, to: null };
  const q = hit.w.line[hit.i];
  return { p: [q[0], q[1]], to: hit.w.key };
}

/** What's wrong with a way through these points: where it'd run over anchored ground, or past the
 *  edge (the rule book's own test), or null. */
export function wayBlocked(pts: P[]): string | null {
  if (pts.length < 2) return null;
  for (const [x, z] of smoothLine(pts)) {
    const a = anchoredAt(x, z);
    if (a) return a.why;
  }
  return null;
}

/** Where to put a new point on a way so it's least out of its way: after which of its points. */
export function insertAt(pts: P[], q: P): number {
  let best = 0;
  let cost = Number.POSITIVE_INFINITY;
  for (let k = 0; k < pts.length - 1; k++) {
    const [a, b] = [pts[k], pts[k + 1]];
    const c =
      Math.hypot(q[0] - a[0], q[1] - a[1]) +
      Math.hypot(b[0] - q[0], b[1] - q[1]) -
      Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (c < cost) {
      cost = c;
      best = k;
    }
  }
  return best;
}

/** How long a way through these points is (m, along its smoothed line). */
export function wayLength(pts: P[]): number {
  const l = smoothLine(pts);
  let d = 0;
  for (let i = 1; i < l.length; i++) d += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  return d;
}
