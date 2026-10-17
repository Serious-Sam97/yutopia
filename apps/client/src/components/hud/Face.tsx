"use client";

import { parseAvatar } from "@yutopia/shared";
import { useMemo } from "react";
import { useChars } from "../useChars";
import { usePeople } from "../usePeople";

type People = NonNullable<ReturnType<typeof usePeople>>;
type Chars = NonNullable<ReturnType<typeof useChars>>;

// A person's portrait: their 3D model's head and shoulders, a little turned
// (world/chars, rendered once per look and kept as a picture); the head of
// their vector drawing where WebGL can't draw.
const portraits = new Map<string, string | null>();
function portrait3d(C: Chars, seed: string): string | null {
  const iso = C.isoPeople();
  if (!iso.canDraw()) return null; // (no GPU: the drawing)
  if (!portraits.has(seed)) portraits.set(seed, iso.portrait(parseAvatar(seed), 128));
  return portraits.get(seed) ?? null;
}
const cache = new Map<string, string>();
function portrait(P: People, seed: string): string {
  let url = cache.get(seed);
  if (!url) {
    const svg = P.avatarSvg(parseAvatar(seed), "S", 0, false, 1).replace(
      'viewBox="0 0 64 100"',
      'viewBox="20 5 24 24"',
    );
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(seed, url);
  }
  return url;
}

export const STATUS_COLOR: Record<string, string> = { online: "#8aa04a", dnd: "#b5562f", away: "#a39d8c" };

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
  // (a plain disc while the 3D people load; the drawing only without WebGL)
  const C = useChars();
  const pic = useMemo(() => (C ? portrait3d(C, avatar) : ""), [C, avatar]);
  const P = usePeople(pic === null);
  const src = useMemo(() => pic || (pic === null && P ? portrait(P, avatar) : ""), [pic, P, avatar]);
  return (
    <span
      className="relative inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 40% 30%, #6b4a33, #3b281b)",
        border: "2px solid #2a1c13",
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
            border: "2px solid #2a1c13",
          }}
        />
      )}
    </span>
  );
}
