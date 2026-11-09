"use client";

import { parseAvatar } from "@yutopia/shared";
import { useEffect, useMemo, useState } from "react";
import { flatFigure } from "../flatFigure";
import { useChars } from "../useChars";

type Chars = NonNullable<ReturnType<typeof useChars>>;

// A person's portrait: their 3D model's head and shoulders, a little turned
// (world/chars, rendered once per look and kept as a picture); where WebGL can't draw, their head
// drawn flat in their colours (flatFigure).
const portraits = new Map<string, string | null>();
// (a portrait asked for before its person's clothes were in — the life look, 5.4 — not kept: drawn again
// once they are)
const waiting = new Map<string, Promise<void>>();
function portrait3d(C: Chars, seed: string, name: string): string | null | undefined {
  const pics = C.pictures();
  if (!pics.canDraw()) return null; // (no GPU: the drawing)
  // (by name too: the life look draws a neutral avatar as the man or the woman by it)
  const key = `${seed}|${name}`;
  if (!portraits.has(key)) {
    const got = pics.portrait(parseAvatar(seed), 128, name);
    if (got === null && pics.lifeLook() && !waiting.has(key)) {
      waiting.set(key, pics.whenReady(parseAvatar(seed), name));
      return undefined;
    }
    if (got === null && pics.lifeLook() && waiting.has(key)) return undefined;
    portraits.set(key, got);
  }
  return portraits.get(key) ?? null;
}
export const STATUS_COLOR: Record<string, string> = { online: "var(--good)", dnd: "var(--rust)", away: "var(--muted)" };

export function Face({
  avatar,
  name,
  size = 30,
  status,
  ring,
}: {
  avatar: string;
  name: string;
  size?: number;
  status?: string;
  ring?: string; // e.g. the speaking glow
}) {
  // (a plain disc while the 3D people load; flat in their colours without WebGL)
  const C = useChars();
  const [tries, setTries] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tries` asks again once their clothes are in
  const pic = useMemo(() => (C ? portrait3d(C, avatar, name) : ""), [C, avatar, name, tries]);
  useEffect(() => {
    if (pic !== undefined) return;
    const w = waiting.get(`${avatar}|${name}`);
    let gone = false;
    w?.then(() => {
      waiting.delete(`${avatar}|${name}`);
      if (!gone) setTries((t) => t + 1);
    });
    return () => {
      gone = true;
    };
  }, [pic, avatar, name]);
  const src = useMemo(() => pic || (pic === null ? flatFigure(parseAvatar(avatar), true) : ""), [pic, avatar]);
  return (
    <span
      className="relative inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 40% 30%, var(--face-hi), var(--panel-top))",
        border: "2px solid var(--panel-raised)",
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
      title={name}
    >
      {src && (
        // biome-ignore lint/performance/noImgElement: inline SVG data URL
        <img alt="" src={src} className="w-full h-full rounded-full" draggable={false} />
      )}
      {status && (
        <i
          className="absolute -right-0.5 -bottom-0.5 rounded-full"
          style={{
            width: Math.max(8, size * 0.32),
            height: Math.max(8, size * 0.32),
            background: STATUS_COLOR[status] ?? STATUS_COLOR.online,
            border: "2px solid var(--panel-raised)",
          }}
        />
      )}
    </span>
  );
}
