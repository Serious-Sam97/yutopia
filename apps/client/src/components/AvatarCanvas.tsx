"use client";

import type { AvatarLayers } from "@yutopia/shared";
import { useEffect, useMemo, useState } from "react";
import { avatarSvg, type View } from "@/world/art/avatar-svg";

// Turntable preview of an avatar (lobby, editor, person card): the same vector
// drawing the world uses, as a plain image — no canvas needed.
const TURN: [View, boolean][] = [
  ["S", false],
  ["SW", false],
  ["W", false],
  ["NW", false],
  ["N", false],
  ["NW", true],
  ["W", true],
  ["SW", true],
];

export function AvatarCanvas({
  avatar,
  size = 160,
  spin = true,
  walk = false,
}: {
  avatar: AvatarLayers;
  size?: number;
  spin?: boolean;
  walk?: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!spin && !walk) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const i = setInterval(() => setTick((t) => t + 1), walk ? 130 : 1200);
    return () => clearInterval(i);
  }, [spin, walk]);

  const dir = spin ? (walk ? Math.floor(tick / 9) : tick) % 8 : 0;
  const frame = walk ? tick % 4 : 0;
  const [view, mirror] = TURN[dir];
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(avatar, view, frame, false, 2))}`,
    [avatar, view, frame],
  );
  const h = size;
  const w = (size * 64) / 100;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        position: "relative",
      }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          bottom: size * 0.02,
          width: size * 0.5,
          height: size * 0.1,
          borderRadius: "50%",
          background: "#3e2718",
          boxShadow: "0 0 0 2px rgba(255,166,48,.55)",
        }}
      />
      {/* biome-ignore lint/performance/noImgElement: generated SVG data URI, nothing for next/image to optimise */}
      <img
        src={src}
        alt=""
        width={w * 0.94}
        height={h * 0.94}
        style={{ position: "relative", transform: mirror ? "scaleX(-1)" : undefined, imageRendering: "auto" }}
        draggable={false}
      />
    </div>
  );
}
