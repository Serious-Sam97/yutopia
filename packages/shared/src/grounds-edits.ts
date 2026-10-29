import type { Building, Lamp, P, StreetThing, WayKind } from "./grounds.ts";

// God mode's edits to the Grounds (docs/plan/53-the-god-mode.md § A): what admins changed, laid
// over the generated world by grounds.ts applyEdits. Nothing here is the world itself: with no
// edits it's exactly what the generator makes. Types and the grids' codecs only (no imports at
// run time: the client's chunks share it with no copy of the Grounds).

/** A chunk's key in the grids: "cx,cz" (CHUNK tiles a side). */
export type ChunkKey = string;

export interface GroundsEdits {
  /** the revision these are (0: none) */
  rev: number;
  /** per chunk: (CHUNK·2 + 1)² heights added to the land, Int16 centimetres, row by row (z) */
  height?: Record<ChunkKey, string>;
  /** per chunk: CHUNK² tiles' surfaces, a byte each: 0 as generated, else SURFACES' index + 1 */
  paint?: Record<ChunkKey, string>;
  /** per chunk: its 10 × 10 tree cells (3.2 m), a byte each: TREE_MASK */
  trees?: Record<ChunkKey, string>;
  ways?: Section<WayDef>;
  things?: Section<ThingDef>;
  buildings?: Section<BuildingDef>;
}
/** Added, changed (by key: only what's given), taken away (by key). */
export interface Section<T extends { key: string }> {
  add?: T[];
  change?: Record<string, Partial<Omit<T, "key">>>;
  remove?: string[];
}

/** A way as it's drawn: its control points, smoothed as the generator's are. */
export interface WayDef {
  key: string;
  kind: WayKind;
  name: string;
  w: number;
  pts: P[];
  closed?: boolean;
  pave?: number;
  /** lamps along it (a street's both sides every 22, a road's one side every 30); the generated
   *  ways keep their own unless this is false */
  lamps?: boolean;
}
/** A thing put on the land: a lamp, a piece of street furniture, a snow pole (phase 8: a boulder,
 *  a planter, a sign with words, a fence along a line). */
export type ThingKind = `lamp-${Exclude<Lamp["kind"], "flood">}` | StreetThing["kind"] | "snowpole";
export interface ThingDef {
  key: string;
  kind: ThingKind;
  x: number;
  z: number;
  ry: number;
  /** how big (a boulder, a planter: 0.5–2) */
  s?: number;
  /** what a sign says */
  text?: string;
  /** a fence's line (its points; x, z its first) */
  pts?: P[];
}
/** A building: the generator's own fields (its plot, axis-aligned; its door's side). */
export type BuildingDef = Omit<Building, "stored">;

/** A tree cell's byte. */
export const TREE_MASK = { generated: 0, none: 1, pine: 2, birch: 3, bare: 4 } as const;

export const NO_EDITS: GroundsEdits = { rev: 0 };

// ── the grids, as base64 (the blob is compressed on the way: the API's gzip) ──
function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const t = atob(s);
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
}
export const encodeBytes = (a: Uint8Array): string => toB64(a);
export const decodeBytes = (s: string, n: number): Uint8Array | null => {
  const b = fromB64(s);
  return b.length === n ? b : null;
};
/** Int16, little-endian. */
export function encodeHeights(a: Int16Array): string {
  const b = new Uint8Array(a.length * 2);
  const v = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) v.setInt16(i * 2, a[i], true);
  return toB64(b);
}
export function decodeHeights(s: string, n: number): Int16Array | null {
  const b = fromB64(s);
  if (b.length !== n * 2) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = v.getInt16(i * 2, true);
  return out;
}
