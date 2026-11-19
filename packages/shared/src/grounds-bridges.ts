import {
  BRIDGE_LIMITS,
  BRIDGE_LOOK,
  BRIDGES,
  type Bridge,
  bridgeAt,
  bridgePiers,
  type P,
  pierSize,
  WAYS,
  type Way,
  wayAlong,
  wayAt,
} from "./grounds.ts";
import type { BridgeDef, BridgeStyle, GroundsEdits } from "./grounds-edits.ts";

// God mode's bridges (docs/plan/109-bridges.md): a bridge is a stretch of a way — the generator's four (and any way's
// over the river or the ravine, a road drawn there too) changed or taken away by key, new ones added on any road,
// street or trail. Its deck is its way's own height; its style, colour, sides and piers are the draft's. Plain steps
// on the draft, as the roads' (grounds-roads.ts).

export { BRIDGE_LIMITS, BRIDGE_LOOK, BRIDGES, type Bridge, bridgeAt, bridgePiers, pierSize };

/** A bridge as it's laid now, as the draft would write it. */
export function bridgeDefOf(b: Bridge): BridgeDef {
  const s = wayAlong(b.w);
  return {
    key: b.key,
    way: b.w.key,
    s0: round(s[b.a]),
    s1: round(s[b.b]),
    style: b.style,
    colour: b.colour,
    rails: b.rails,
    piers: b.piers,
  };
}
const round = (v: number) => Math.round(v * 10) / 10;

/** The bridge laid under this key, or null. */
export const bridgeOf = (key: string): Bridge | null => BRIDGES.find((b) => b.key === key) ?? null;

/** A way a bridge can go on (not a walk's path between the townhouses: they're on the land) at (x, z), and how far
 *  along it that is (m), or null. */
export function bridgeWayAt(x: number, z: number, pad = 2): { w: Way; m: number; i: number } | null {
  const hit = wayAt(x, z, pad);
  if (!hit || hit.w.kind === "walk" || hit.w.closed) return null;
  return { w: hit.w, m: alongAt(hit.w, x, z), i: hit.i };
}
/** How far along way w the point nearest (x, z) is (m, between its samples). */
export function alongAt(w: Way, x: number, z: number): number {
  const L = w.line;
  const s = wayAlong(w);
  let best = { d: Number.POSITIVE_INFINITY, m: 0 };
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best.d) best = { d, m: s[i] + (s[i + 1] - s[i]) * u };
  }
  return best.m;
}
/** The point `m` metres along way w. */
export function pointAlong(w: Way, m: number): P {
  const s = wayAlong(w);
  const L = w.line;
  if (m <= 0) return [L[0][0], L[0][1]];
  for (let i = 1; i < L.length; i++)
    if (s[i] >= m) {
      const u = (m - s[i - 1]) / (s[i] - s[i - 1] || 1);
      return [L[i - 1][0] + (L[i][0] - L[i - 1][0]) * u, L[i - 1][1] + (L[i][1] - L[i - 1][1]) * u];
    }
  const e = L[L.length - 1];
  return [e[0], e[1]];
}
/** A way's length (m). */
export const wayLong = (w: Way): number => {
  const s = wayAlong(w);
  return s[s.length - 1] ?? 0;
};

/** A stretch of way w from `a` to `b` metres, made fit to be a bridge: ordered, on the way, 4–400 m, and not over
 *  another of its bridges (`but`: the one being moved) — cut back to the gap it's in; null where there's none. */
export function fitSpan(w: Way, a: number, b: number, but?: string): [number, number] | null {
  const len = wayLong(w);
  let s0 = Math.max(0, Math.min(a, b));
  let s1 = Math.min(len, Math.max(a, b));
  const s = wayAlong(w);
  const from = (a + b) / 2;
  for (const o of BRIDGES) {
    if (o.w !== w || o.key === but) continue;
    const o0 = s[o.a];
    const o1 = s[o.b];
    if (o1 < from) s0 = Math.max(s0, o1 + 1);
    else if (o0 > from) s1 = Math.min(s1, o0 - 1);
    else return null;
  }
  if (s1 - s0 > BRIDGE_LIMITS.max) s1 = s0 + BRIDGE_LIMITS.max;
  if (s1 - s0 < BRIDGE_LIMITS.min) return null;
  return [round(s0), round(s1)];
}

/** A new bridge's key: god-bridge-n, the first n the draft hasn't. */
export function newBridgeKey(e: GroundsEdits): string {
  const taken = new Set([...(e.bridges?.add ?? []).map((d) => d.key), ...(e.bridges?.remove ?? [])]);
  let n = 1;
  while (taken.has(`god-bridge-${n}`)) n++;
  return `god-bridge-${n}`;
}
/** A new bridge's look by its way (a trail's timber, else steel). */
export const newBridgeStyle = (w: Way): BridgeStyle => (w.kind === "trail" ? "timber" : "steel");
const isNew = (e: GroundsEdits, key: string) => !!e.bridges?.add?.some((d) => d.key === key);

export function addBridge(e: GroundsEdits, d: BridgeDef): GroundsEdits {
  return { ...e, bridges: { ...e.bridges, add: [...(e.bridges?.add ?? []), d] } };
}
/** A bridge changed: a new one's own entry, the generator's in `change` (only what's given; a style's own colour,
 *  sides and piers when its style changes and they're not). */
export function changeBridge(
  e: GroundsEdits,
  key: string,
  patch: Partial<Omit<BridgeDef, "key" | "way">>,
): GroundsEdits {
  const p: Partial<BridgeDef> = { ...patch };
  if (p.style) {
    const L = BRIDGE_LOOK[p.style];
    if (p.colour === undefined) p.colour = L.colour;
    if (p.rails === undefined) p.rails = L.rails;
    if (p.piers === undefined) p.piers = L.piers;
  }
  if (isNew(e, key))
    return {
      ...e,
      bridges: { ...e.bridges, add: (e.bridges?.add ?? []).map((d) => (d.key === key ? { ...d, ...p } : d)) },
    };
  return {
    ...e,
    bridges: { ...e.bridges, change: { ...(e.bridges?.change ?? {}), [key]: { ...e.bridges?.change?.[key], ...p } } },
  };
}
/** A bridge taken away (a new one: as if never; the generator's: its road on the land there). */
export function removeBridge(e: GroundsEdits, key: string): GroundsEdits {
  const change = { ...(e.bridges?.change ?? {}) };
  delete change[key];
  if (isNew(e, key))
    return { ...e, bridges: { ...e.bridges, add: (e.bridges?.add ?? []).filter((d) => d.key !== key), change } };
  return { ...e, bridges: { ...e.bridges, change, remove: [...new Set([...(e.bridges?.remove ?? []), key])] } };
}
/** The way a bridge is on (by its key), or null. */
export const bridgeWay = (key: string): Way | null => WAYS.find((w) => w.key === key) ?? null;
