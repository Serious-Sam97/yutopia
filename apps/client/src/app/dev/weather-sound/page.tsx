"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";
import { sound } from "@/world/sound";
import type { StepPlayer } from "@/world/steps";
import { loadSteps } from "@/world/steps-load";
import { BEDS, type Bed, FULL, loopable, thunderOf, WeatherSound, type WxHere } from "@/world/weather-sound";

// The weather's listening bench (docs/plan/65-the-weather.md, phase 9): every sound's candidates
// (CC0: tools/sfx-weather.json, made by tools/sfx-weather.mjs into public/sfx/weather and the steps'),
// each played alone at the game's level, and the game's own mix (world/weather-sound.ts) in a scene
// — a downpour in the open, under the trees, indoors, in a car, by the pond, a thunderstorm… — with
// the candidates picked here. ★ keeps a pick (in this browser); "copy picks" gives the tool's PICK.
// Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/weather-sound

type Cand = { id: string; user: string; title: string; files: string[] };
type Man = Record<string, Cand[]>;
const STEP_SLOTS = ["grass", "mud", "wet", "puddle"] as const;
const SHOTS = ["thunder-near", "thunder-far"] as const;
const LABEL: Record<string, string> = {
  grass: "Steps: grass",
  mud: "Steps: mud",
  wet: "Steps: a wet way",
  puddle: "Steps: a puddle (now and then on a wet way)",
  "rain-light": "Rain, light (the open)",
  "rain-heavy": "Rain, heavy (the open)",
  "rain-trees": "Rain under the trees",
  "rain-roof": "Rain on the roof (indoors)",
  "rain-car": "Rain on the car's roof (inside)",
  "rain-water": "Rain on open water",
  sleet: "Sleet",
  birds: "Birds (warm, dry days; mornings loud)",
  river: "The river running (not frozen)",
  drips: "Drips after the rain",
  "thunder-near": "Thunder, near (a crack: all of them till one's picked)",
  "thunder-far": "Thunder, far (a rumble: all of them till one's picked)",
};

const AIR: Omit<WxHere, "rain" | "sleet" | "thunder" | "wet"> = {
  out: true,
  car: false,
  woods: 0,
  water: 0,
  river: 0,
  night: 0,
  storm: 0,
  fog: 0,
  hour: 12,
  temp: 14,
  ice: 0,
  cloud: 0.9,
};
const SCENES: { name: string; h: WxHere }[] = [
  { name: "a downpour in the open", h: { ...AIR, rain: 1, sleet: false, thunder: 0, wet: 1 } },
  { name: "light rain in the open", h: { ...AIR, rain: 0.25, sleet: false, thunder: 0, wet: 0.6 } },
  { name: "rain under the trees", h: { ...AIR, woods: 0.9, rain: 0.6, sleet: false, thunder: 0, wet: 1 } },
  { name: "indoors in the rain", h: { ...AIR, out: false, rain: 0.8, sleet: false, thunder: 0, wet: 1 } },
  { name: "in a car in the rain", h: { ...AIR, out: false, car: true, rain: 0.8, sleet: false, thunder: 0, wet: 1 } },
  { name: "by the pond in the rain", h: { ...AIR, water: 1, rain: 0.6, sleet: false, thunder: 0, wet: 1 } },
  { name: "sleet", h: { ...AIR, temp: 1, rain: 0.6, sleet: true, thunder: 0, wet: 0.8, cloud: 1 } },
  { name: "a thunderstorm", h: { ...AIR, storm: 0.6, rain: 1, sleet: false, thunder: 1, wet: 1, cloud: 1 } },
  { name: "a thunderstorm, indoors", h: { ...AIR, out: false, storm: 0.6, rain: 1, sleet: false, thunder: 1, wet: 1 } },
  {
    name: "after the rain, in the woods",
    h: { ...AIR, woods: 0.8, rain: 0, sleet: false, thunder: 0, wet: 0.8, after: 30 },
  },
  { name: "a spring morning", h: { ...AIR, hour: 6.5, cloud: 0.1, rain: 0, sleet: false, thunder: 0, wet: 0 } },
  {
    name: "by the river, a dry noon",
    h: { ...AIR, river: 0.9, cloud: 0.3, rain: 0, sleet: false, thunder: 0, wet: 0 },
  },
];

const KEY = "yutopia:wxpicks";
const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid rgba(239,228,204,.18)",
  background: on ? "#ffb347" : "rgba(30,20,12,.85)",
  color: on ? "#1d1408" : "#efe4cc",
  cursor: "pointer",
  font: "inherit",
});

export default function WeatherSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [man, setMan] = useState<Man>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [scene, setScene] = useState(-1);
  const [solo, setSolo] = useState("");
  const [levels, setLevels] = useState<Partial<Record<Bed, number>>>({});
  const wx = useRef<WeatherSound | null>(null);
  const steps = useRef<StepPlayer | null>(null);
  const soloNode = useRef<(() => void) | null>(null);
  // (each play's own: one whose recordings come in after another's been asked for is dropped)
  const playTok = useRef(0);
  const fading = useRef<ReturnType<typeof setInterval> | null>(null);
  const picksNow = useRef(picks);
  picksNow.current = picks;

  useEffect(() => {
    try {
      setPicks(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
    void Promise.all([
      fetch("/sfx/weather/manifest.json").then((r) => r.json()),
      fetch("/sfx/steps/manifest.json").then((r) => r.json()),
    ]).then(([w, s]) => setMan({ ...w, ...Object.fromEntries(STEP_SLOTS.map((k) => [k, s[k] ?? []])) }));
  }, []);
  // (a pick past a slot's candidates — they've been cut down to the one picked since — is none)
  const pickOf = (slot: string) => {
    const i = picks[slot];
    return i !== undefined && i < (man[slot]?.length ?? 0) ? i : 0;
  };
  const setPick = (slot: string, i: number) => {
    const next = { ...picks, [slot]: i };
    setPicks(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    wx.current?.choose(slot as Bed, i);
    if ((STEP_SLOTS as readonly string[]).includes(slot)) steps.current?.choose(slot as "grass", i);
  };

  // a scene: the game's mix, every tenth of a second, with the picks (made once the candidates are
  // known: a pick past them is none)
  useEffect(() => {
    if (scene < 0 || !Object.keys(man).length) return;
    void mixer.resume();
    if (fading.current) clearInterval(fading.current);
    fading.current = null;
    if (!wx.current) {
      wx.current = new WeatherSound();
      for (const [s, i] of Object.entries(picksNow.current))
        if (!(STEP_SLOTS as readonly string[]).includes(s) && i < (man[s]?.length ?? 0)) wx.current.choose(s as Bed, i);
    }
    const W = wx.current;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      W.update((now - last) / 1000, SCENES[scene].h);
      last = now;
      setLevels(W.levels());
    }, 100);
    return () => {
      clearInterval(timer);
      // (faded out: the scene's beds at nothing)
      const quiet = { ...SCENES[scene].h, rain: 0, thunder: 0, wet: 0, river: 0, hour: 0, night: 1 };
      let n = 0;
      fading.current = setInterval(() => {
        W.update(0.1, quiet);
        if (++n > 40 && fading.current) {
          clearInterval(fading.current);
          fading.current = null;
        }
      }, 100);
    };
  }, [scene, man]);
  // (leaving the page: all of it stopped)
  useEffect(
    () => () => {
      if (fading.current) clearInterval(fading.current);
      wx.current?.stop();
    },
    [],
  );

  // a candidate alone, at the game's level: a bed looped, thunder's peal once, a walk on the steps'
  async function play(slot: string, i: number) {
    soloNode.current?.();
    soloNode.current = null;
    const tok = ++playTok.current;
    const key = `${slot}:${i}`;
    if (solo === key) return setSolo("");
    setSolo(key);
    await mixer.resume();
    const ctx = mixer.ensure();
    if ((STEP_SLOTS as readonly string[]).includes(slot)) {
      const S = await loadSteps();
      if (tok !== playTok.current) return;
      steps.current ??= new S.StepPlayer(
        () => (mixer.ctx?.state === "running" ? mixer.ctx : null),
        () => mixer.buses.effects,
        (f, g) => sound.stepSynth(f, g),
      );
      const P = steps.current;
      P.choose(slot as "grass", i);
      P.preload(slot as "grass");
      // (a puddle's heard on a wet way: here with puddles everywhere, about half the steps)
      if (slot === "puddle") P.puddled(1);
      const timer = setInterval(
        () => P.step(slot === "puddle" ? "wet" : (slot as "grass"), { gait: "walk", shoe: "hard" }),
        420,
      );
      soloNode.current = () => clearInterval(timer);
      return;
    }
    const files = man[slot]?.[i]?.files ?? [];
    const bufs = await Promise.all(
      files.map((f) =>
        fetch(`/sfx/weather/${f}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => ctx.decodeAudioData(b)),
      ),
    ).catch(() => [] as AudioBuffer[]);
    // (another asked for meanwhile, or this one stopped: not started)
    if (tok !== playTok.current) return;
    if (!bufs.length) return setSolo("");
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    if ((SHOTS as readonly string[]).includes(slot)) {
      const t = thunderOf(slot === "thunder-far" ? 0.75 : 0.15, true, false);
      src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
      g.gain.value = t.gain * 1.08;
      src.onended = () => setSolo((s) => (s === key ? "" : s));
    } else {
      src.buffer = loopable(ctx, bufs[0]);
      src.loop = true;
      g.gain.value = FULL[slot as Bed];
    }
    src.connect(g).connect(mixer.buses.ambience);
    src.start();
    soloNode.current = () => {
      src.stop();
      g.disconnect();
    };
  }
  useEffect(() => () => soloNode.current?.(), []);

  const slots = [...STEP_SLOTS, ...BEDS, ...SHOTS];
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#17110b",
        color: "#efe4cc",
        font: "13px 'Share Tech Mono', ui-monospace, monospace",
        padding: "16px 16px 80px",
      }}
      data-testid="weather-sound-bench"
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "8px 0 12px" }}>
        <span style={{ opacity: 0.5, marginRight: 4 }}>the game's mix</span>
        {SCENES.map((s, i) => (
          <button key={s.name} type="button" style={btn(scene === i)} onClick={() => setScene(scene === i ? -1 : i)}>
            {s.name}
          </button>
        ))}
        <button
          type="button"
          style={{ ...btn(false), marginLeft: "auto" }}
          onClick={() =>
            // (every slot as it's picked, the first where none's been starred; thunder only if one has:
            // else the game plays all its peals)
            void navigator.clipboard.writeText(
              JSON.stringify(
                Object.fromEntries(
                  [...STEP_SLOTS, ...BEDS, ...SHOTS]
                    .filter((k) => !(SHOTS as readonly string[]).includes(k) || k in picks)
                    .map((k) => [k, pickOf(k)]),
                ),
              ),
            )
          }
        >
          copy picks
        </button>
      </div>
      {scene >= 0 && (
        <div style={{ opacity: 0.7, marginBottom: 10 }}>
          {Object.entries(levels)
            .filter(([, v]) => (v ?? 0) > 0.003)
            .map(([b, v]) => `${b} ${(v ?? 0).toFixed(2)}`)
            .join(" · ") || "…"}
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {slots.map((slot) => (
          <div
            key={slot}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(239,228,204,.04)",
            }}
          >
            <strong style={{ fontSize: 14, flex: "0 0 300px" }}>{LABEL[slot]}</strong>
            {(man[slot] ?? []).map((c, i) => (
              <span key={c.id} style={{ display: "inline-flex", gap: 2 }}>
                <button
                  type="button"
                  style={btn(solo === `${slot}:${i}`)}
                  title={`${c.title} — ${c.user} (Freesound ${c.id}, CC0)`}
                  onClick={() => void play(slot, i)}
                >
                  {solo === `${slot}:${i}` ? "■" : "▶"} {"abc"[i]} · {c.title.slice(0, 26)}
                </button>
                <button
                  type="button"
                  style={btn(pickOf(slot) === i)}
                  aria-label={`pick ${"abc"[i]}`}
                  onClick={() => setPick(slot, i)}
                >
                  ★
                </button>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
