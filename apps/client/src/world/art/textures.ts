"use client";

import type { AvatarLayers, Emote, Want } from "@yutopia/shared";
import { ImageSource, Texture } from "pixi.js";
import type { Box, Face, PartArt } from "./avatar-rig";
import type { Rim, View } from "./avatar-svg";
import { emoteSvg } from "./emotes";
import { HELD_BOX, heldSvg } from "./held";
import { people } from "./people-load";
import { svgDoc } from "./svgdoc";
import { type VortexMood, vortexSvg } from "./vortex/vortexArt";

// SVG art → GPU textures, drawn lazily and kept in an LRU (each person only
// ever needs the views they're actually seen in). Never evicts a texture used
// in the last moments (a sprite may still show it).
const MAX = 3000;
const KEEP_MS = 1500;
const cache = new Map<string, Texture>();
const used = new Map<string, number>();
const pending = new Set<string>();

function touch(key: string, tex: Texture) {
  const now = performance.now();
  cache.delete(key);
  cache.set(key, tex);
  used.set(key, now);
  while (cache.size > MAX) {
    const [old, t] = cache.entries().next().value as [string, Texture];
    if (now - (used.get(old) ?? 0) < KEEP_MS) break; // everything left is in use
    cache.delete(old);
    used.delete(old);
    t.destroy(true);
  }
}

function load(key: string, svg: string) {
  if (pending.has(key)) return;
  pending.add(key);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  img
    .decode()
    .then(() => touch(key, Texture.from(img)))
    .catch(() => {})
    .finally(() => {
      pending.delete(key);
      URL.revokeObjectURL(url);
    });
}

function get(key: string, make: () => string): Texture | null {
  const t = cache.get(key);
  if (t) {
    touch(key, t);
    return t;
  }
  load(key, make());
  return null;
}

// A person's whole drawing at rest (what shows while their rig's parts decode).
// The rim light follows the hour: warm and sky blue by day, neon at night.
export function avatarTexture(
  a: AvatarLayers,
  view: View,
  frame: number,
  sitting: boolean,
  rim: Rim = "day",
): Texture | null {
  const base = `p|${JSON.stringify(a)}|${view}`;
  const P = people();
  if (!P) return null; // the people chunk is still loading
  return get(`${base}|${frame}|${sitting ? 1 : 0}|${rim}`, () => P.avatarSvg(a, view, frame, sitting, 2, rim));
}

// One part of a person's rig (avatar-rig.ts), `RIG_PX` texture px per board
// unit. `key` names the look, view, seat and light it belongs to.
export const RIG_PX = 2;
export function rigPartTexture(key: string, part: PartArt, face?: Face, svg?: string): Texture | null {
  return get(`r|${key}|${part.name}${face ? `|${face}` : ""}`, () => svgDoc(svg ?? part.svg, part.box, RIG_PX));
}

// What someone carries (art/held.ts), at the rig's density.
export function heldTexture(kind: string, color: string, level: number): Texture | null {
  return get(`h|${kind}|${color}|${level}`, () => svgDoc(heldSvg(kind, color, level), HELD_BOX, RIG_PX));
}

// A phone in the hand (art/held.ts phoneSvg): its case colours and the face seen.
// Drawn at twice the rig's density (it's small and it's the point).
// (its drawing comes with the people chunk: `svg` builds it)
export function phoneTexture(key: string, svg: () => string, box: Box): Texture | null {
  return get(`ph|${key}`, () => svgDoc(svg(), box, RIG_PX * 2));
}

// Vortex exactly as Yondra draws him (vortexSvg), one texture per mood.
export function vortexTexture(mood: VortexMood): Texture | null {
  return get(`vx|${mood}`, () => vortexSvg(mood, `y${mood}`).replace("<svg ", '<svg width="240" height="225" '));
}

// Emotes over heads: drawn at 2× the size they're shown.
export function emoteTexture(e: Emote | Want): Texture | null {
  return get(`em|${e}`, () => emoteSvg(e, 128));
}

// ── items ──────────────────────────────────────────────────────────────────
// Illustrated items are held by sprites for as long as the item is on the map,
// so they're reference-counted: only unused textures are evicted, oldest first,
// once they pass the budget. Mipmapped, so zoomed-out rooms don't shimmer.
interface ItemEntry {
  tex: Texture | null;
  refs: number;
  bytes: number;
  waiters: ((t: Texture) => void)[];
}
const items = new Map<string, ItemEntry>();
const ITEM_BUDGET = 64 * 1024 * 1024; // bytes of *unused* textures kept around
let idleBytes = 0;

function decodeItem(key: string, e: ItemEntry, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  img
    .decode()
    .then(() => {
      if (items.get(key) !== e) return;
      e.tex = new Texture({ source: new ImageSource({ resource: img, autoGenerateMipmaps: true }) });
      e.bytes = img.width * img.height * 5.3; // RGBA + mip chain
      if (!e.refs) idleBytes += e.bytes;
      for (const cb of e.waiters.splice(0)) cb(e.tex);
      trimItems();
    })
    .catch(() => items.delete(key))
    .finally(() => URL.revokeObjectURL(url));
}

function trimItems() {
  if (idleBytes <= ITEM_BUDGET) return;
  for (const [key, e] of items) {
    if (idleBytes <= ITEM_BUDGET) break;
    if (e.refs || !e.tex) continue;
    items.delete(key);
    idleBytes -= e.bytes;
    e.tex.destroy(true);
  }
}

// Calls `ready` with the texture (now if cached, later once decoded) and
// returns a release function; call it when the sprite goes away.
export function acquireItem(key: string, svg: () => string, ready: (t: Texture) => void): () => void {
  let e = items.get(key);
  if (e) {
    // most recently used last
    items.delete(key);
    items.set(key, e);
  } else {
    e = { tex: null, refs: 0, bytes: 0, waiters: [] };
    items.set(key, e);
    decodeItem(key, e, svg());
  }
  const entry = e;
  if (!entry.refs && entry.tex) idleBytes -= entry.bytes;
  entry.refs++;
  if (entry.tex) ready(entry.tex);
  else entry.waiters.push(ready);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    entry.refs--;
    const i = entry.waiters.indexOf(ready);
    if (i >= 0) entry.waiters.splice(i, 1);
    if (!entry.refs && entry.tex) {
      idleBytes += entry.bytes;
      trimItems();
    }
  };
}

// Drawings still decoding (the scene isn't final yet).
export function itemsPending(): number {
  let n = 0;
  for (const e of items.values()) if (!e.tex) n++;
  return n;
}

export function itemTextureStats() {
  let bytes = 0;
  let live = 0;
  for (const e of items.values()) {
    bytes += e.bytes;
    if (e.refs) live++;
  }
  return { textures: items.size, live, mb: Math.round(bytes / 1048576) };
}
