"use client";

import { type AvatarLayers, avatarFromSeed, DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useChars } from "@/components/useChars";
import { Motion, walkPose } from "@/world/art/avatar-motion";
import { composeSvg } from "@/world/art/avatar-rig";
import { avatarRig, avatarSvg, type View } from "@/world/art/avatar-svg";
import { vortexSvg } from "@/world/art/vortex/vortexArt";

// Dev-only turnaround sheet for the character art (image-first review).
// ?3d=1: the same cast as the iso view draws it now — sprites of the 3D models
// (world/chars/iso.ts), the 8 facings and the walk's 8 frames.
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

// ?gender=feminine|masculine|neutral sets everyone (default: rows cycle through them)
const BASE = (({ style: _s, gender: _g, ...rest }) => rest)(DEFAULT_AVATAR);
const CAST: Omit<AvatarLayers, "style" | "gender">[] = [
  BASE,
  {
    ...BASE,
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
    shoes: "boots",
    shoesColor: "#5b3a26",
  },
  {
    ...BASE,
    body: "broad",
    skin: "#7c4a2b",
    hair: "afro",
    hairColor: "#1c1410",
    top: "blazer",
    topColor: "#3d4a5c",
    bottom: "trousers",
    bottomColor: "#2a2420",
    accessory: "none",
    eyewear: "round",
    eyewearColor: "#c9b28a",
    shoes: "loafers",
    shoesColor: "#5b3a26",
  },
  {
    ...BASE,
    skin: "#e4b48e",
    hair: "ponytail",
    hairColor: "#3b2a20",
    top: "turtleneck",
    topColor: "#8a3b2e",
    bottom: "longskirt",
    bottomColor: "#c9b28a",
    accessory: "beret",
    accessoryColor: "#2a2420",
    extra: "earrings",
    extraColor: "#e8a33d",
    shoes: "boots",
    shoesColor: "#2a2420",
  },
  {
    ...BASE,
    skin: "#a8693f",
    hair: "buzz",
    hairColor: "#1c1410",
    top: "tank",
    topColor: "#efe4cc",
    bottom: "cargo",
    bottomColor: "#6e7b3a",
    accessory: "bandana",
    accessoryColor: "#b5562f",
    eyewear: "sunglasses",
    extra: "watch",
    extraColor: "#c9b28a",
    shoes: "hightops",
    shoesColor: "#b5562f",
  },
  {
    ...BASE,
    body: "slim",
    skin: "#c68a5e",
    hair: "bob",
    hairColor: "#1c1410",
    top: "cardigan",
    topColor: "#7a5c8a",
    bottom: "joggers",
    bottomColor: "#3d4a5c",
    accessory: "bucket",
    accessoryColor: "#e8a33d",
    extra: "scarf",
    extraColor: "#b5562f",
    shoes: "sneakers",
  },
  {
    ...BASE,
    body: "broad",
    skin: "#4f2e1c",
    hair: "mohawk",
    hairColor: "#c4402b",
    top: "polo",
    topColor: "#4f6b5a",
    bottom: "shorts",
    bottomColor: "#5b3a26",
    accessory: "headband",
    accessoryColor: "#efe4cc",
    extra: "backpack",
    extraColor: "#d97a4a",
    shoes: "sandals",
    shoesColor: "#5b3a26",
  },
  {
    ...BASE,
    hair: "curly",
    hairColor: "#6b4128",
    top: "shirt",
    topColor: "#c9b28a",
    bottom: "jeans",
    accessory: "cap",
    accessoryColor: "#b5562f",
    eyewear: "glasses",
    eyewearColor: "#2a2420",
    extra: "necklace",
    extraColor: "#e8a33d",
  },
  avatarFromSeed(1234),
];

const src = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// ?rig=1: the people rig live — the same motion the world plays (walk in each
// view, standing, talking, seated and typing, every emote).
type Clip = {
  label: string;
  view: View;
  mirror?: boolean;
  sit?: boolean;
  walk?: boolean;
  typing?: boolean;
  talk?: boolean;
  emote?: string;
};
const CLIPS: Clip[] = [
  { label: "walk S", view: "S", walk: true },
  { label: "walk SW", view: "SW", walk: true },
  { label: "walk W", view: "W", walk: true },
  { label: "walk NW", view: "NW", walk: true },
  { label: "walk N", view: "N", walk: true },
  { label: "idle", view: "S" },
  { label: "idle W", view: "W" },
  { label: "talk", view: "SW", talk: true },
  { label: "sit", view: "S", sit: true },
  { label: "type S", view: "S", sit: true, typing: true },
  { label: "type N", view: "N", sit: true, typing: true },
  { label: "type W", view: "W", sit: true, typing: true },
  ...["wave", "clap", "laugh", "heart", "question", "fire", "coffee", "tape"].map((e) => ({
    label: e,
    view: "S" as View,
    emote: e,
  })),
  { label: "wave W", view: "W", emote: "wave" },
];

function RigClip({ a, clip, z }: { a: AvatarLayers; clip: Clip; z: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const motion = new Motion(0.37);
    const rig = avatarRig(a, clip.view, !!clip.sit);
    let last = performance.now();
    let t0 = last;
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // emotes replay every 4 s
      if (clip.emote && now - t0 > 4000) t0 = now;
      const pose = motion.update(rig, dt, {
        dist: clip.walk ? 4.2 * dt : 0,
        walking: !!clip.walk,
        speed: 4.2,
        typing: !!clip.typing,
        speaking: !!clip.talk,
        emote: clip.emote && now - t0 < 3200 ? clip.emote : "",
        reduced: false,
      });
      const shadow = `<ellipse cx="60" cy="${clip.sit ? (rig.side ? 134 : 131) : 168}" rx="${rig.side ? 16 : 20}" ry="4" fill="#000" opacity=".35"/>`;
      if (ref.current)
        ref.current.innerHTML = `<svg viewBox="0 -4 120 184" width="${84 * z}" height="${128 * z}" style="transform:${clip.mirror ? "scaleX(-1)" : "none"}">${shadow}<g transform="translate(60 0) scale(${rig.squash} 1) translate(-60 0)">${composeSvg(rig, pose)}</g></svg>`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [a, clip, z]);
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <div ref={ref} />
      <figcaption className="mono" style={{ color: "#c9b28a", fontSize: 10 }}>
        {clip.label}
      </figcaption>
    </figure>
  );
}

// The cast as iso sprites of their 3D models: each row the 8 facings standing, then the walk.
function Sheet3d({ cast, z }: { cast: AvatarLayers[]; z: number }) {
  const C = useChars();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!C || !host) return;
    const iso = C.isoPeople();
    const W = C.ISO.W;
    const H = C.ISO.H;
    host.innerHTML = "";
    const jobs = cast.flatMap((a) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:0;background:#3b281b;margin-bottom:4px;border-radius:6px";
      host.appendChild(row);
      const cells = [...Array(16).keys()].map((i) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        c.style.cssText = `width:${(W / 2) * z}px;height:${(H / 2) * z}px${i === 8 ? ";margin-left:12px" : ""}`;
        row.appendChild(c);
        return c;
      });
      return cells.map((cell, i) => ({ a, cell, dir: i < 8 ? i : 0, walk: i < 8 ? -1 : i - 8, done: false }));
    });
    let raf = 0;
    let n = 0;
    const tick = () => {
      for (const j of jobs) {
        if (j.done) continue;
        const mem = { phase: j.walk >= 0 ? (j.walk + 0.5) / 8 : 0 };
        const sp = iso.sprite(
          mem,
          { avatar: j.a, dir: j.dir, a: j.walk >= 0 ? 1 : 0, dist: 0, dt: 1 / 60, reduced: true },
          performance.now() + n++,
        );
        if (!sp) continue;
        (j.cell.getContext("2d") as CanvasRenderingContext2D).drawImage(sp.canvas, 0, 0);
        j.done = true;
      }
      if (jobs.some((j) => !j.done)) raf = requestAnimationFrame(tick);
      else (window as unknown as { __sheet3d?: boolean }).__sheet3d = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [C, cast, z]);
  return (
    <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
      <h1 className="lcd text-2xl mb-2">YUTOPIA · PEOPLE IN ISO (3D MODELS)</h1>
      <div ref={ref} />
    </main>
  );
}

export default function Sheet() {
  // review tool only: not served in production builds
  if (process.env.NODE_ENV === "production") notFound();
  // read after mount: the server render has no URL, and hydration would keep its defaults
  const [q, setQ] = useState(() => new URLSearchParams());
  useEffect(() => setQ(new URLSearchParams(location.search)), []);
  const z = Number(q.get("z") ?? 1);
  const only = q.get("n") ? Number(q.get("n")) : CAST.length;
  const genders = ["feminine", "masculine", "neutral"];
  const cast: AvatarLayers[] = CAST.slice(0, only).map((c, i) => ({
    ...c,
    style: "ligne",
    gender: q.get("gender") ?? genders[i % 3],
  }));
  if (q.get("3d")) return <Sheet3d cast={cast} z={z} />;
  if (q.get("frames")) {
    // the walk cycle as a contact strip: 8 phases per view
    const views: View[] = ["S", "SW", "W", "NW", "N"];
    return (
      <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
        {cast.slice(0, Number(q.get("n") ?? 1)).map((a) =>
          views.map((v) => {
            const rig = avatarRig(a, v, false);
            return (
              <div key={`${a.hair}-${v}`} style={{ display: "flex", gap: 0, background: "#3b281b", marginBottom: 4 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((f) => (
                  // biome-ignore lint/performance/noImgElement: dev sheet
                  <img
                    key={f}
                    alt=""
                    width={60 * z}
                    height={90 * z}
                    src={src(
                      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 0 80 180"><g transform="translate(60 0) scale(${rig.squash} 1) translate(-60 0)">${composeSvg(rig, walkPose(rig, f / 8, 1))}</g><path d="M20 168 H100" stroke="#000" opacity=".3"/></svg>`,
                    )}
                  />
                ))}
              </div>
            );
          }),
        )}
      </main>
    );
  }
  if (q.get("rig"))
    return (
      <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
        <h1 className="lcd text-2xl mb-2">YUTOPIA · PEOPLE RIG</h1>
        {cast.slice(0, Number(q.get("n") ?? 3)).map((a) => (
          <div
            key={`${a.hair}-${a.top}-${a.skin}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 8,
              background: "#3b281b",
              borderRadius: 8,
              padding: 6,
            }}
          >
            {CLIPS.map((c) => (
              <RigClip key={c.label} a={a} clip={c} z={z} />
            ))}
          </div>
        ))}
      </main>
    );
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
