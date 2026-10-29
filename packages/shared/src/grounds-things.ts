import { anchoredAt, BUILDINGS, LAMPS, type P, SNOW_POLES, STREET, wayAt } from "./grounds.ts";
import type { GroundsEdits, ThingDef, ThingKind } from "./grounds-edits.ts";

// God mode's things (docs/plan/53-the-god-mode.md, phase 8): what stands on the land — a lamp, a
// piece of street furniture, a snow pole, a boulder, a planter, a sign with words, a fence along a
// line — put down, moved, turned, sized, taken away, as the draft's edits (a new one added; the
// generator's own moved or taken away by its key). Its catalog, what it takes up (the ghost's
// box; the shapes table's solids are the same: shapes/grounds.ts), where it can't go.

export interface CatalogThing {
  kind: ThingKind;
  name: string;
  /** what it takes up before it's turned, about where it stands: x0, z0, x1, z1, its height */
  foot: [number, number, number, number, number];
  /** sized (0.5–2), has words, drawn as a line */
  sized?: boolean;
  text?: boolean;
  line?: boolean;
}
export const THINGS: CatalogThing[] = [
  { kind: "lamp-town", name: "Town lamp", foot: [-0.2, -0.2, 0.2, 0.2, 4.2] },
  { kind: "lamp-cobra", name: "Road lamp", foot: [-0.2, -0.2, 0.2, 0.2, 7.5] },
  { kind: "lamp-lone", name: "Path lamp", foot: [-0.15, -0.15, 0.15, 0.15, 3.2] },
  { kind: "bench", name: "Bench", foot: [-1, -0.27, 1, 0.27, 0.92] },
  { kind: "bin", name: "Bin", foot: [-0.3, -0.3, 0.3, 0.3, 0.96] },
  { kind: "hydrant", name: "Hydrant", foot: [-0.17, -0.17, 0.17, 0.17, 0.84] },
  { kind: "newsbox", name: "Newsbox", foot: [-0.25, -0.22, 0.25, 0.22, 1.18] },
  { kind: "postbox", name: "Postbox", foot: [-0.26, -0.25, 0.26, 0.25, 1.31] },
  { kind: "sign", name: "Sign", foot: [-0.8, -0.06, 0.8, 0.06, 2.05], text: true },
  { kind: "fence", name: "Fence", foot: [-0.06, -0.06, 0.06, 0.06, 1.1], line: true },
  { kind: "snowpole", name: "Snow pole", foot: [-0.04, -0.04, 0.04, 0.04, 1.74] },
  { kind: "boulder", name: "Boulder", foot: [-0.72, -0.72, 0.72, 0.72, 1.05], sized: true },
  { kind: "planter", name: "Planter", foot: [-0.6, -0.6, 0.6, 0.6, 2.3], sized: true },
  { kind: "pole", name: "Utility pole", foot: [-0.16, -1.2, 0.16, 1.2, 8.6] },
  { kind: "stop", name: "Bus stop sign", foot: [-0.38, -0.05, 0.38, 0.1, 2.66] },
  { kind: "streetsign", name: "Street sign", foot: [-0.2, -0.2, 1.1, 1.1, 3.06] },
];
export const catalogThing = (kind: ThingKind): CatalogThing => THINGS.find((t) => t.kind === kind) ?? THINGS[0];

/** A thing as it is now (laid: the draft's), by its key — the generator's or a new one. */
export function thingDefOf(key: string): ThingDef | null {
  const l = LAMPS.find((t) => t.key === key);
  if (l) return { key, kind: `lamp-${l.kind}` as ThingKind, x: l.x, z: l.z, ry: l.ry };
  const p = SNOW_POLES.find((t) => t.key === key);
  if (p) return { key, kind: "snowpole", x: p.x, z: p.z, ry: p.ry };
  const t = STREET.find((u) => u.key === key);
  if (!t) return null;
  return {
    key,
    kind: t.kind,
    x: t.x,
    z: t.z,
    ry: t.ry,
    ...(t.s !== undefined && { s: t.s }),
    ...(t.text !== undefined && { text: t.text }),
    ...(t.pts && { pts: t.pts.map((q) => [q[0], q[1]] as P) }),
  };
}
/** Where a thing stands (a bench: its middle, not the corner it's kept by). */
export function thingAtOf(t: { kind: string; x: number; z: number }): P {
  return t.kind === "bench" ? [t.x + 1, t.z + 0.5] : [t.x, t.z];
}

/** The thing nearest (x, z), within `r` m (a fence: of its line), its key; or null. The Kart
 *  Park's floods are its own, not anyone's to move. */
export function thingAt(x: number, z: number, r = 1.5): string | null {
  let best: { key: string; d: number } | null = null;
  const consider = (key: string, d: number) => {
    if (d < r && (!best || d < best.d)) best = { key, d };
  };
  for (const l of LAMPS) if (l.kind !== "flood") consider(l.key, Math.hypot(l.x - x, l.z - z));
  for (const p of SNOW_POLES) consider(p.key, Math.hypot(p.x - x, p.z - z));
  for (const t of STREET) {
    if (t.pts) {
      for (let i = 1; i < t.pts.length; i++) consider(t.key, segDist(t.pts[i - 1], t.pts[i], x, z));
      continue;
    }
    const [cx, cz] = thingAtOf(t);
    consider(t.key, Math.hypot(cx - x, cz - z) - (t.kind === "boulder" || t.kind === "planter" ? 0.6 * (t.s ?? 1) : 0));
  }
  return (best as { key: string } | null)?.key ?? null;
}
function segDist(a: P, b: P, x: number, z: number): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}

/** Why a thing can't stand at (x, z), or null: what's anchored, a way's carriageway, a building. */
export function thingBlocked(kind: ThingKind, x: number, z: number): string | null {
  const a = anchoredAt(x, z);
  if (a) return a.why;
  const w = wayAt(x, z, -0.4);
  if (w && w.w.kind !== "trail" && w.w.kind !== "walk" && kind !== "snowpole") return `on ${w.w.name}`;
  for (const b of BUILDINGS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return `in ${b.name}`;
  return null;
}

const isNew = (e: GroundsEdits, key: string) => !!e.things?.add?.some((d) => d.key === key);
/** A key for a new thing, not yet in the draft. */
export function newThingKey(e: GroundsEdits): string {
  let n = 1;
  const taken = new Set((e.things?.add ?? []).map((d) => d.key));
  while (taken.has(`god-thing-${n}`)) n++;
  return `god-thing-${n}`;
}
export function addThing(e: GroundsEdits, d: ThingDef): GroundsEdits {
  return { ...e, things: { ...e.things, add: [...(e.things?.add ?? []), d] } };
}
/** Moved, turned, sized or its words changed: a new one's own; the generator's by its change. */
export function changeThing(
  e: GroundsEdits,
  key: string,
  patch: Partial<Omit<ThingDef, "key" | "kind">>,
): GroundsEdits {
  if (isNew(e, key))
    return {
      ...e,
      things: { ...e.things, add: (e.things?.add ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)) },
    };
  return {
    ...e,
    things: { ...e.things, change: { ...(e.things?.change ?? {}), [key]: { ...e.things?.change?.[key], ...patch } } },
  };
}
/** Taken away (a new one: as if never put down). */
export function removeThing(e: GroundsEdits, key: string): GroundsEdits {
  if (isNew(e, key)) {
    const change = { ...(e.things?.change ?? {}) };
    delete change[key];
    return { ...e, things: { ...e.things, add: (e.things?.add ?? []).filter((d) => d.key !== key), change } };
  }
  return { ...e, things: { ...e.things, remove: [...new Set([...(e.things?.remove ?? []), key])] } };
}
