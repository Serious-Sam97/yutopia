"use client";

import { useEffect, useState } from "react";

// Catalog pictures: the same illustrated item art the world draws (the lazy
// items chunk), as data URLs, made once per kind and kept for the session.
type Items = typeof import("@/world/art/items");
let items: Promise<Items> | null = null;
const cache = new Map<string, string | null>();

function make(m: Items, kind: string, props?: Record<string, unknown>): string | null {
  if (!m.hasItemArt(kind)) return null;
  const art = m.itemArt({ kind, id: "catalog", rot: 0, props }, null, "all", 2);
  return art ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}` : null;
}

export function useThumb(kind: string, props?: Record<string, unknown>): string | null {
  const key = `${kind}|${JSON.stringify(props ?? {})}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: props are part of the key
  useEffect(() => {
    if (cache.has(key)) return setSrc(cache.get(key) ?? null);
    let alive = true;
    items ??= import("@/world/art/items");
    void items.then((m) => {
      if (!cache.has(key)) cache.set(key, make(m, kind, props));
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
        style={{ background: "linear-gradient(180deg,#5a412f,#3b281b)", width: "45%", aspectRatio: "1" }}
        aria-hidden
      />
    );
  return (
    // biome-ignore lint/performance/noImgElement: inline SVG data URL
    <img alt="" src={src} className={`max-w-full max-h-full object-contain ${className ?? ""}`} draggable={false} />
  );
}
