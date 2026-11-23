"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STRIKE_SFX, type StrikeCand, type StrikeSlot, strikeBank } from "@/world/strike/sound";

// The Strike Park's listening bench (docs/plan/118-the-strike-park-polished.md, F11a): the CC0 candidates for the
// lobby's music, the round's and the match's stingers and the announcer (public/sfx/strike/manifest.json), each heard
// (▷) and picked; the picks kept on this machine (the game plays them at once) and "copy picks" gives chosen.json.
// Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/strike-sound

const SLOTS: [StrikeSlot, string][] = [
  ["music", "Lobby music (loops in the compound)"],
  ["start", "Round start"],
  ["won", "Round won"],
  ["lost", "Round lost"],
  ["victory", "Match won"],
  ["defeat", "Match lost"],
  ["voice", "Announcer"],
];
const SAY = [
  "5",
  "4",
  "3",
  "go",
  "you_win",
  "you_lose",
  "objective_achieved",
  "hurry_up",
  "mission_completed",
  "game_over",
];

export default function StrikeSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [man, setMan] = useState<Record<StrikeSlot, StrikeCand[]> | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState("");
  const [copied, setCopied] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    void strikeBank().then((b) => {
      if (!b) return;
      setMan(b.man);
      setPicks(b.chosen);
    });
  }, []);
  const play = (url: string) => {
    el.current?.pause();
    if (playing === url) return setPlaying("");
    const a = new Audio(url);
    a.onended = () => setPlaying("");
    void a.play();
    el.current = a;
    setPlaying(url);
  };
  const pick = (slot: string, i: number) => {
    const n = { ...picks, [slot]: i };
    setPicks(n);
    try {
      localStorage.setItem("yutopia:strike-sound", JSON.stringify(n));
    } catch {
      /* private window */
    }
  };
  const voiceSeq = async (dir: string) => {
    el.current?.pause();
    for (const l of SAY) {
      const a = new Audio(`${STRIKE_SFX}${dir}${l}.mp3`);
      el.current = a;
      await a.play().catch(() => {});
      await new Promise((r) => {
        a.onended = r;
      });
    }
  };
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "system-ui",
        color: "#e8e2d4",
        background: "#14171a",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 22 }}>Strike Park · sound picks</h1>
      <p style={{ opacity: 0.75, fontSize: 14 }}>
        All CC0. ▷ plays (again stops). The pick is kept on this machine and played in the game at once; “copy picks”
        gives chosen.json for the repo.
      </p>
      {!man && <p>Loading…</p>}
      {man &&
        SLOTS.map(([slot, title]) => (
          <section key={slot} style={{ margin: "18px 0", padding: 12, border: "1px solid #333", borderRadius: 4 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px", color: "#e8a33a" }}>{title}</h2>
            {(man[slot] ?? []).map((c, i) => {
              const url = slot === "voice" ? "" : `${STRIKE_SFX}${c.file}`;
              return (
                <div key={c.file} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                  <input
                    type="radio"
                    name={slot}
                    checked={(picks[slot] ?? 0) === i}
                    onChange={() => pick(slot, i)}
                    aria-label={`Pick ${c.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => (slot === "voice" ? void voiceSeq(c.file) : play(url))}
                    style={{ width: 34 }}
                  >
                    {playing === url && url ? "■" : "▷"}
                  </button>
                  <div style={{ fontSize: 14 }}>
                    <b>{c.title}</b> · {c.author} · {c.license}{" "}
                    <a href={c.page} target="_blank" rel="noreferrer" style={{ color: "#6fa3c7" }}>
                      page
                    </a>
                    <div style={{ opacity: 0.65, fontSize: 12 }}>{c.about}</div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify(picks, null, 1));
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy picks"}
      </button>
    </main>
  );
}
