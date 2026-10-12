"use client";

import { parseAvatar } from "@yutopia/shared";
import { useMemo } from "react";
import { avatarSvg } from "@/world/art/avatar-svg";

// A person's portrait: the head of their own avatar drawing, facing you.
const cache = new Map<string, string>();
function portrait(seed: string): string {
  let url = cache.get(seed);
  if (!url) {
    const svg = avatarSvg(parseAvatar(seed), "S", 0, false, 1).replace('viewBox="0 0 64 100"', 'viewBox="20 5 24 24"');
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
  const src = useMemo(() => portrait(avatar), [avatar]);
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
      {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
      <img alt="" src={src} className="w-full h-full rounded-full" draggable={false} />
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
