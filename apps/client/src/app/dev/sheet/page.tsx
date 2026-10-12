"use client";

import { type AvatarLayers, avatarFromSeed, DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { avatarSvg, type View } from "@/world/art/avatar-svg";
import { vortexSvg } from "@/world/art/vortex/vortexArt";

// Dev-only turnaround sheet for the character art (image-first review).
const VIEWS: [View, boolean][] = [
  ["S", false],
  ["SW", false],
  ["W", false],
  ["NW", false],
  ["N", false],
  ["NW", true],
  ["W", true],
  ["SW", true],
];

// ?style=ligne draws the whole cast in Ligne claire (default: City-pop)
const CAST: Omit<AvatarLayers, "style">[] = [
  DEFAULT_AVATAR,
  {
    body: "slim",
    skin: "#f3d2b3",
    hair: "long",
    hairColor: "#b5562f",
    top: "sweater",
    topColor: "#6e7b3a",
    bottom: "skirt",
    bottomColor: "#3d4a5c",
    accessory: "headphones",
    accessoryColor: "#e8a33d",
  },
  {
    body: "broad",
    skin: "#7c4a2b",
    hair: "afro",
    hairColor: "#1c1410",
    top: "jacket",
    topColor: "#5b3a26",
    bottom: "jeans",
    bottomColor: "#3d4a5c",
    accessory: "glasses",
    accessoryColor: "#2a2420",
  },
  {
    body: "regular",
    skin: "#e4b48e",
    hair: "bun",
    hairColor: "#3b2a20",
    top: "hoodie",
    topColor: "#8a3b2e",
    bottom: "trousers",
    bottomColor: "#2a2420",
    accessory: "walkman",
    accessoryColor: "#e8a33d",
  },
  {
    body: "regular",
    skin: "#a8693f",
    hair: "curly",
    hairColor: "#6b4128",
    top: "shirt",
    topColor: "#c9b28a",
    bottom: "shorts",
    bottomColor: "#4f6b5a",
    accessory: "cap",
    accessoryColor: "#b5562f",
  },
  {
    body: "slim",
    skin: "#c68a5e",
    hair: "bob",
    hairColor: "#1c1410",
    top: "dress",
    topColor: "#7a5c8a",
    bottom: "jeans",
    bottomColor: "#3d4a5c",
    accessory: "beanie",
    accessoryColor: "#e8a33d",
  },
  {
    body: "broad",
    skin: "#4f2e1c",
    hair: "mohawk",
    hairColor: "#c4402b",
    top: "tee",
    topColor: "#efe4cc",
    bottom: "trousers",
    bottomColor: "#5b3a26",
    accessory: "none",
    accessoryColor: "#e8a33d",
  },
  avatarFromSeed(1234),
];

const src = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function Sheet() {
  // review tool only: not served in production builds
  if (process.env.NODE_ENV === "production") notFound();
  // read after mount: the server render has no URL, and hydration would keep its defaults
  const [q, setQ] = useState(() => new URLSearchParams());
  useEffect(() => setQ(new URLSearchParams(location.search)), []);
  const z = Number(q.get("z") ?? 1);
  const only = q.get("n") ? Number(q.get("n")) : CAST.length;
  const style = q.get("style") ?? "citypop";
  const cast: AvatarLayers[] = CAST.slice(0, only).map((c) => ({ ...c, style }));
  return (
    <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
      <h1 className="lcd text-2xl mb-2">YUTOPIA · CHARACTER SHEET</h1>
      {cast.map((a) => (
        <div
          key={`${a.hair}-${a.top}-${a.skin}`}
          style={{
            display: "flex",
            gap: 2,
            alignItems: "flex-end",
            marginBottom: 6,
            background: "#3b281b",
            borderRadius: 8,
            padding: 4,
          }}
        >
          {VIEWS.map(([v, m]) => (
            // biome-ignore lint/performance/noImgElement: dev sheet
            <img
              key={`${v}${m ? "m" : ""}`}
              alt=""
              width={64 * z}
              height={100 * z}
              src={src(avatarSvg(a, v, 0, false, 1))}
              style={{ transform: m ? "scaleX(-1)" : undefined }}
            />
          ))}
          <span style={{ width: 12 }} />
          {[1, 2, 3].map((f) => (
            // biome-ignore lint/performance/noImgElement: dev sheet
            <img key={`w${f}`} alt="" width={64 * z} height={100 * z} src={src(avatarSvg(a, "S", f, false, 1))} />
          ))}
          {[1, 3].map((f) => (
            // biome-ignore lint/performance/noImgElement: dev sheet
            <img key={`s${f}`} alt="" width={64 * z} height={100 * z} src={src(avatarSvg(a, "W", f, false, 1))} />
          ))}
          {/* biome-ignore lint/performance/noImgElement: dev sheet */}
          <img alt="" width={64 * z} height={100 * z} src={src(avatarSvg(a, "S", 0, true, 1))} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, background: "#3b281b", borderRadius: 8, padding: 6 }}>
        {(["smug", "curious", "happy", "judging", "hungry", "dizzy", "asleep", "possessed"] as const).map((m) => (
          // biome-ignore lint/performance/noImgElement: dev sheet
          <img key={m} alt={m} width={90} height={84} src={src(vortexSvg(m, m))} />
        ))}
      </div>
    </main>
  );
}
