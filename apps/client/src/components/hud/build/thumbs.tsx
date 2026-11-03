"use client";

import { useEffect, useState } from "react";

// Catalog pictures: rendered from the 3D models the world draws (docs/plan/67-the-furniture.md,
// phase 9: world/furn/pictures.ts, lazy); for what the kit doesn't draw (doors, windows, cars) the
// item art's drawing. As data URLs, made once a kind and look and kept for the session.
type Items = typeof import("@/world/art/items");
type Pictures = typeof import("@/world/furn/pictures");
let items: Promise<Items> | null = null;
let pictures: Promise<Pictures> | null = null;
export const loadPictures = (): Promise<Pictures> => {
  pictures ??= import("@/world/furn/pictures");
  return pictures;
};
const cache = new Map<string, string | null>();

// (a picture takes a render and a read-back, ~5–15 ms: a category's twenty at once froze the game for
// a frame of 200 ms — made a few milliseconds' worth a frame instead, the cards filling in)
const SLICE_MS = 6;
const jobs: (() => void)[] = [];
let pumping = false;
function pump() {
  const t0 = performance.now();
  do jobs.shift()?.();
  while (jobs.length && performance.now() - t0 < SLICE_MS);
  if (jobs.length) requestAnimationFrame(pump);
  else pumping = false;
}
/** `fn` run in its turn, a few a frame — or `skip` if it's no longer wanted by then. */
function inTurn<T>(fn: () => T, wanted: () => boolean, skip: T): Promise<T> {
  return new Promise((resolve, reject) => {
    jobs.push(() => {
      if (!wanted()) return resolve(skip);
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    });
    if (!pumping) {
      pumping = true;
      // (a frame or two after the panel's own redraw: not both in one frame)
      requestAnimationFrame(() => requestAnimationFrame(pump));
    }
  });
}
const SKIPPED = "skipped";

async function make(
  kind: string,
  props?: Record<string, unknown>,
  wanted: () => boolean = () => true,
): Promise<string | null> {
  const p = await loadPictures();
  if (p.drawsKind(kind)) {
    try {
      return await inTurn(() => p.pictureOf(kind, props ?? {}), wanted, SKIPPED);
    } catch {
      // (no WebGL here: the drawing instead)
    }
  }
  items ??= import("@/world/art/items");
  const m = await items;
  if (!m.hasItemArt(kind)) return null;
  // a picture: things drawn live in the world (the clock's hands) are drawn in
  const art = m.itemArt({ kind, id: "catalog", rot: 0, props: { ...props, _thumb: true } }, null, "all", 2);
  return art ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}` : null;
}

export function useThumb(kind: string, props?: Record<string, unknown>): string | null {
  const key = `${kind}|${JSON.stringify(props ?? {})}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: props are part of the key
  useEffect(() => {
    if (cache.has(key)) return setSrc(cache.get(key) ?? null);
    let alive = true;
    void make(kind, props, () => alive).then((url) => {
      // (its card gone before its turn came: made when it's shown again)
      if (url === SKIPPED) return;
      if (!cache.has(key)) cache.set(key, url);
      if (alive) setSrc(cache.get(key) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [key, kind]);
  return src;
}

export function ItemThumb({
  kind,
  props,
  className,
}: {
  kind: string;
  props?: Record<string, unknown>;
  className?: string;
}) {
  const src = useThumb(kind, props);
  if (!src)
    return (
      <span
        className={`block rounded-md ${className ?? ""}`}
        style={{
          background: "linear-gradient(180deg,var(--edge-cabinet),var(--panel-top))",
          width: "45%",
          aspectRatio: "1",
        }}
        aria-hidden
      />
    );
  // things for desks are small next to a sofa: shown filling the card instead (a model's picture is
  // framed to fit already)
  const small = kind === "tabletop" && !src.startsWith("data:image/png");
  return (
    // biome-ignore lint/performance/noImgElement: inline SVG data URL
    <img
      alt=""
      src={src}
      className={`max-w-full max-h-full object-contain ${className ?? ""}`}
      style={small ? { width: "64%", height: "64%" } : undefined}
      draggable={false}
    />
  );
}
