"use client";

import { useEffect, useState } from "react";

// Catalog pictures: the same illustrated item art the world draws (the lazy
// items chunk), as data URLs, made once per kind and kept for the session.
type Items = typeof import("@/world/art/items");
let items: Promise<Items> | null = null;
const cache = new Map<string, string | null>();

function make(m: Items, kind: string, props?: Record<string, unknown>): string | null {
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
  // things for desks are small next to a sofa: shown filling the card instead
  const small = kind === "tabletop";
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
