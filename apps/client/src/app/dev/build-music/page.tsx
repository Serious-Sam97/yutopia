"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BUILD_MUSIC_KEY, type BuildTrack } from "@/world/build/music";

// Build mode's music, by ear (docs/plan/124-the-build-view.md, follow-up): the CC BY candidates in
// public/sfx/build/manifest.json, each heard (▷, a bar to seek) and ★ kept for the playlist. The picks are kept on this
// machine — the game plays them at once, shuffled, the next time build mode opens — and "copy picks" gives chosen.json.
// Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/build-music

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function BuildMusicBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [tracks, setTracks] = useState<BuildTrack[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [playing, setPlaying] = useState("");
  const [at, setAt] = useState({ t: 0, d: 0 });
  const [copied, setCopied] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    try {
      setPicks(JSON.parse(localStorage.getItem(BUILD_MUSIC_KEY) ?? "[]"));
    } catch {}
    void fetch("/sfx/build/manifest.json")
      .then((r) => r.json())
      .then((m: { music: BuildTrack[] }) => setTracks(m.music));
    const id = setInterval(() => {
      const a = el.current;
      if (a) setAt({ t: a.currentTime, d: a.duration || 0 });
    }, 250);
    return () => {
      clearInterval(id);
      el.current?.pause();
    };
  }, []);
  const play = (file: string) => {
    el.current?.pause();
    if (playing === file) return setPlaying("");
    const a = new Audio(`/sfx/build/${file}`);
    a.volume = 0.8;
    a.onended = () => setPlaying("");
    void a.play();
    el.current = a;
    setPlaying(file);
  };
  const toggle = (file: string) => {
    const n = picks.includes(file) ? picks.filter((f) => f !== file) : [...picks, file];
    setPicks(n);
    try {
      localStorage.setItem(BUILD_MUSIC_KEY, JSON.stringify(n));
    } catch {}
  };
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ music: picks }, null, 1));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <main
      data-testid="build-music-bench"
      style={{
        minHeight: "100vh",
        padding: "28px 32px",
        background: "linear-gradient(180deg, #e2f0fc, #c4def4)",
        color: "#123e6a",
        font: "600 14px/1.4 var(--font-glass, system-ui)",
      }}
    >
      <h1 style={{ font: "900 26px/1.1 var(--font-glass, system-ui)", margin: 0 }}>Build mode's music</h1>
      <p style={{ maxWidth: 720, color: "#5b7a9b", margin: "8px 0 18px" }}>
        Candidates in The Sims 3 build mode's spirit — light jazz and bossa by Kevin MacLeod (incompetech.com), CC BY
        4.0. ▷ to listen, ★ to keep it in the playlist. Your picks play in the game at once (shuffled, the next time
        build mode opens); "copy picks" gives chosen.json. {picks.length} picked.
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8, maxWidth: 760 }}>
        {tracks.map((t) => {
          const on = playing === t.file;
          const kept = picks.includes(t.file);
          return (
            <li
              key={t.file}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 16,
                background: kept ? "linear-gradient(180deg,#e0f0ff,#b9dbfa)" : "rgba(255,255,255,.8)",
                border: "1.5px solid #fff",
                boxShadow: kept ? "0 0 0 2.5px #2a84dc" : "0 2px 6px rgba(10,50,100,.15)",
              }}
            >
              <button
                type="button"
                onClick={() => play(t.file)}
                aria-label={`${on ? "Stop" : "Play"} ${t.title}`}
                style={btn(on)}
              >
                {on ? "■" : "▷"}
              </button>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 900 }}>{t.title}</b>{" "}
                <span style={{ color: "#5b7a9b" }}>
                  · {t.author} · {t.license}
                </span>
                {on && (
                  <input
                    type="range"
                    min={0}
                    max={at.d || 1}
                    step={0.5}
                    value={at.t}
                    aria-label="Seek"
                    onChange={(e) => {
                      if (el.current) el.current.currentTime = Number(e.target.value);
                    }}
                    style={{ display: "block", width: "100%", marginTop: 6 }}
                  />
                )}
              </span>
              {on && (
                <span style={{ color: "#5b7a9b", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(at.t)} / {fmt(at.d)}
                </span>
              )}
              <button
                type="button"
                onClick={() => toggle(t.file)}
                aria-pressed={kept}
                aria-label={`Keep ${t.title}`}
                style={btn(kept)}
              >
                {kept ? "★" : "☆"}
              </button>
            </li>
          );
        })}
      </ol>
      <p style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button type="button" onClick={() => void copy()} style={btn(false)}>
          {copied ? "Copied" : "Copy picks"}
        </button>
      </p>
    </main>
  );
}

const btn = (on: boolean): React.CSSProperties => ({
  minWidth: 38,
  height: 38,
  padding: "0 12px",
  borderRadius: 999,
  border: "1.5px solid #fff",
  background: on ? "linear-gradient(180deg,#6ab8ff,#1f74cf)" : "linear-gradient(180deg,#fff,#dcecfb)",
  color: on ? "#fff" : "#123e6a",
  font: "800 15px/1 var(--font-glass, system-ui)",
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(20,70,130,.25)",
});
