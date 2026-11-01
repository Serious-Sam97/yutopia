"use client";

import type { Footing } from "@yutopia/shared/footing";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";
import { sound } from "@/world/sound";
import type { Shoe, StepGait, StepPlayer } from "@/world/steps";
import { loadSteps } from "@/world/steps-load";

// The steps' listening bench (docs/plan/63-the-steps.md): each surface's recording (CC0, picked
// here 2026-11-01 in phase 0: public/sfx/steps) played as a walk through the game's own player
// (world/steps.ts: its levelling, never the same step twice, the shoe and the gait), side by side
// with the synth that stands in while a surface's recordings load. Dev only (or
// NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/steps
// Keys: Space play / stop · 1–4 the gait · Q W E the shoes · ↑ ↓ the surface · ← → recording / synth

const GAITS: StepGait[] = ["crouch", "walk", "jog", "sprint"];
const SHOES: Shoe[] = ["hard", "soft", "sandals"];
/** steps a second: 2 × the gait's speed ÷ its stride (KH_MOVE; hero.ts walk2/run2/crouch2Stride) */
const CADENCE: Record<StepGait, number> = { crouch: 2.4, walk: 2.4, jog: 3.8, sprint: 4.6 };
const LOUD: Record<StepGait, number> = { crouch: 0.22, walk: 0.7, jog: 0.85, sprint: 1 };

const SURFACES: { key: Footing; label: string; where: string }[] = [
  { key: "wood", label: "Wood", where: "boards, the farmhouse, the bar, the church, desk and table tops" },
  { key: "hollow", label: "Hollow wood", where: "the stage, porches, the footbridge, the bleachers, sheds" },
  { key: "carpet", label: "Carpet", where: "carpet, the booths' felt, rugs, the standup mat, the hotel" },
  { key: "tile", label: "Tile", where: "tile, the lift car, the diner, the shops" },
  { key: "concrete", label: "Concrete", where: "concrete, the stairs, pavements, kerbs, the plaza, the HQ roof" },
  { key: "rock", label: "Rock", where: "steep rock, boulders, the statue, the gatehouse" },
  { key: "asphalt", label: "Asphalt", where: "roads, the lot, the circuit and the bowl" },
  { key: "grate", label: "Grate", where: "the server room, catwalks" },
  { key: "sheet", label: "Sheet metal", where: "car roofs, the road bridge, arcade and vending tops, posts" },
  { key: "earth", label: "Earth", where: "the barn's floor" },
  { key: "felt", label: "Felt top", where: "the pool table (a carpet recording, damped)" },
  { key: "snow", label: "Snow", where: "fresh snow, lawns, fields, snowy roofs, a road in a storm" },
  { key: "deep", label: "Deep snow", where: "the woods" },
  { key: "packed", label: "Packed snow", where: "trails" },
  { key: "ice", label: "Ice", where: "the pond, the river (under the bridges too)" },
  { key: "slush", label: "Slush", where: "the roads' slush patches" },
  { key: "blackice", label: "Black ice", where: "the roads' black-ice patches (ice's recordings, damped)" },
];

const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid rgba(239,228,204,.18)",
  background: on ? "#ffb347" : "rgba(30,20,12,.85)",
  color: on ? "#1d1408" : "#efe4cc",
  cursor: "pointer",
  font: "inherit",
});

export default function StepsBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [surf, setSurf] = useState(0);
  const [synth, setSynth] = useState(false);
  const [gait, setGait] = useState<StepGait>("walk");
  const [shoe, setShoe] = useState<Shoe>("hard");
  const [playing, setPlaying] = useState(false);
  const [foot, setFoot] = useState<"L" | "R" | "">("");
  const player = useRef<StepPlayer | null>(null);
  const live = useRef({ surf, synth, gait, shoe });
  live.current = { surf, synth, gait, shoe };

  // the walk: steps scheduled a little ahead, the feet alternating
  useEffect(() => {
    if (!playing) return;
    void mixer.resume();
    const ctx = mixer.ensure();
    // (the game's player, through the game's loader: its own chunk)
    void loadSteps().then((S) => {
      player.current ??= new S.StepPlayer(
        () => (mixer.ctx?.state === "running" ? mixer.ctx : null),
        () => mixer.buses.effects,
        (f, g) => sound.stepSynth(f, g),
      );
    });
    let next = ctx.currentTime + 0.1;
    let side: "L" | "R" = "R";
    const timer = setInterval(() => {
      const L = live.current;
      const f = SURFACES[L.surf].key;
      const P = player.current;
      P?.preload(f);
      // (one step at a time, when it's due: the synth plays now, as the game's does)
      if (ctx.currentTime >= next) {
        if (L.synth) sound.stepSynth(f, LOUD[L.gait]);
        else if (P) P.step(f, { gait: L.gait, shoe: L.shoe });
        setFoot(side);
        side = side === "L" ? "R" : "L";
        next += (1 / CADENCE[L.gait]) * (1 + (Math.random() - 0.5) * 0.04);
        if (next < ctx.currentTime) next = ctx.currentTime;
      }
    }, 10);
    return () => {
      clearInterval(timer);
      setFoot("");
    };
  }, [playing]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === " ") {
        ev.preventDefault();
        setPlaying((p) => !p);
      } else if (ev.key >= "1" && ev.key <= "4") setGait(GAITS[Number(ev.key) - 1]);
      else if ("qwe".includes(ev.key.toLowerCase()) && ev.key.length === 1)
        setShoe(SHOES["qwe".indexOf(ev.key.toLowerCase())]);
      else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        setSurf((i) => (i + (ev.key === "ArrowDown" ? 1 : SURFACES.length - 1)) % SURFACES.length);
      } else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") setSynth((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#17110b",
        color: "#efe4cc",
        font: "13px 'Share Tech Mono', ui-monospace, monospace",
        padding: "16px 16px 80px",
      }}
      data-testid="steps-bench"
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          padding: "8px 0 12px",
          background: "#17110b",
        }}
      >
        <button type="button" style={{ ...btn(playing), minWidth: 76 }} onClick={() => setPlaying((p) => !p)}>
          {playing ? "■ stop" : "▶ walk"}
        </button>
        <span style={{ opacity: 0.5, margin: "0 4px" }}>gait</span>
        {GAITS.map((g) => (
          <button key={g} type="button" style={btn(gait === g)} onClick={() => setGait(g)}>
            {g}
          </button>
        ))}
        <span style={{ opacity: 0.5, margin: "0 4px" }}>shoes</span>
        {SHOES.map((s) => (
          <button key={s} type="button" style={btn(shoe === s)} onClick={() => setShoe(s)}>
            {s}
          </button>
        ))}
        <span style={{ marginLeft: 8, display: "inline-flex", gap: 4 }} role="img" aria-label="feet">
          {(["L", "R"] as const).map((f) => (
            <span
              key={f}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                display: "grid",
                placeItems: "center",
                background: foot === f ? "#ffb347" : "rgba(239,228,204,.08)",
                color: foot === f ? "#1d1408" : "#efe4cc",
              }}
            >
              {f}
            </span>
          ))}
        </span>
        <span style={{ opacity: 0.5 }}>{CADENCE[gait]} steps/s</span>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {SURFACES.map((s, si) => {
          const on = si === surf;
          return (
            <div
              key={s.key}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: on ? "rgba(255,179,71,.1)" : "rgba(239,228,204,.04)",
                border: `1px solid ${on ? "rgba(255,179,71,.5)" : "transparent"}`,
              }}
            >
              <strong style={{ fontSize: 15, minWidth: 110 }}>{s.label}</strong>
              <span style={{ opacity: 0.55, flex: "1 1 200px" }}>{s.where}</span>
              {[false, true].map((sy) => (
                <button
                  key={String(sy)}
                  type="button"
                  style={btn(on && synth === sy)}
                  onClick={() => {
                    setSurf(si);
                    setSynth(sy);
                    setPlaying(true);
                  }}
                >
                  {sy ? "synth" : "recording"}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
