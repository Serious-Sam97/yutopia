"use client";

import { PIANO_RANGE } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// The upright piano: two octaves under your mouse or your keyboard (A–K the
// white keys, W E T Y U O P the black ones, Z / X an octave down / up). What
// you play is heard here at once and by everyone near you, from where you are.
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24]; // semitones over two octaves (+ the top C)
const BLACK: [number, number][] = [
  // [semitone, index of the white key it sits after]
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
  [13, 7],
  [15, 8],
  [18, 10],
  [20, 11],
  [22, 12],
];
const KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function PianoPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const [octave, setOctave] = useState(0); // −1, 0, 1: shifts the two octaves
  const [down, setDown] = useState<Set<number>>(new Set());
  const [last, setLast] = useState<number | null>(null);
  const held = useRef(new Set<string>());
  const base = octave * 12;

  const play = (semi: number) => {
    const n = base + semi;
    if (n < PIANO_RANGE[0] || n > PIANO_RANGE[1]) return;
    w?.playPiano(objectId, n);
    setLast(n);
    setDown((d) => new Set(d).add(semi));
    setTimeout(
      () =>
        setDown((d) => {
          const x = new Set(d);
          x.delete(semi);
          return x;
        }),
      160,
    );
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === "z") return setOctave((o) => Math.max(-1, o - 1));
      if (k === "x") return setOctave((o) => Math.min(1, o + 1));
      const semi = KEYS[k];
      if (semi === undefined || held.current.has(k)) return;
      held.current.add(k);
      e.preventDefault();
      play(semi);
    };
    const onUp = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  const W = 100 / WHITE.length;
  return (
    <Panel title={t("piano")}>
      <div className="vfd-window p-3 flex items-center justify-between">
        <span className="lcd text-2xl">
          {last === null ? "— — —" : `${NAMES[((last % 12) + 12) % 12]}${4 + Math.floor(last / 12)}`}
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            className="deck-btn"
            style={{ height: 30, fontSize: 11 }}
            onClick={() => setOctave((o) => Math.max(-1, o - 1))}
            disabled={octave <= -1}
          >
            Z ◂
          </button>
          <span className="mono text-xs self-center" style={{ color: "var(--cream-dim)" }}>
            C{4 + octave}–C{6 + octave}
          </span>
          <button
            type="button"
            className="deck-btn"
            style={{ height: 30, fontSize: 11 }}
            onClick={() => setOctave((o) => Math.min(1, o + 1))}
            disabled={octave >= 1}
          >
            ▸ X
          </button>
        </span>
      </div>
      <fieldset className="relative mt-3 select-none" style={{ height: 150 }} aria-label={t("piano")}>
        {WHITE.map((semi, i) => (
          <button
            key={`w${semi}`}
            type="button"
            aria-label={`${NAMES[semi % 12]}${4 + octave + Math.floor(semi / 12)}`}
            onPointerDown={() => play(semi)}
            className="absolute top-0 bottom-0 rounded-b-md"
            style={{
              left: `${i * W}%`,
              width: `calc(${W}% - 2px)`,
              background: down.has(semi) ? "linear-gradient(#ffd79a,#f2c27a)" : "linear-gradient(#fbf6ea,#e9dfc8)",
              border: "1px solid #3a2c1f",
              boxShadow: down.has(semi) ? "inset 0 2px 6px rgba(0,0,0,.25)" : "0 3px 0 #b8ab90",
            }}
          />
        ))}
        {BLACK.map(([semi, after]) => (
          <button
            key={`b${semi}`}
            type="button"
            aria-label={`${NAMES[semi % 12]}${4 + octave + Math.floor(semi / 12)}`}
            onPointerDown={() => play(semi)}
            className="absolute top-0 rounded-b-md z-10"
            style={{
              left: `calc(${(after + 1) * W}% - ${W * 0.3}%)`,
              width: `${W * 0.6}%`,
              height: "62%",
              background: down.has(semi) ? "#5a4636" : "linear-gradient(#2e2b28,#1a1816)",
              border: "1px solid #000",
            }}
          />
        ))}
      </fieldset>
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        {t("pianoHint")}
      </p>
    </Panel>
  );
}
