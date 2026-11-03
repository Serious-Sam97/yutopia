"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";
import { sound } from "@/world/sound";
import type { StepPlayer } from "@/world/steps";
import { loadSteps } from "@/world/steps-load";
import { FULL, LOOPS, LOUD, type Loop, SHOTS, type Shot, WaterSound, type WetHere } from "@/world/water-sound";
import { loopable } from "@/world/weather-sound";

// The water's listening bench (docs/plan/66-the-water.md, phase 9): every sound's candidates (CC0:
// tools/sfx-water.json, made by tools/sfx-weather.mjs into public/sfx/water and the steps'), each
// played alone at the game's level, and the game's own mix (world/water-sound.ts) in a scene —
// afloat, swimming, under, by the rapid, just out — with the candidates picked here. ★ keeps a pick
// (in this browser); "copy picks" gives the tool's PICK. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/water-sound

type Cand = { id: string; user: string; title: string; files: string[] };
type Man = Record<string, Cand[]>;
const STEP_SLOTS = ["wade-shallow", "wade-deep", "soaked"] as const;
const LABEL: Record<string, string> = {
  "wade-shallow": "Steps: wading, the ankles",
  "wade-deep": "Steps: wading, the thighs",
  soaked: "Steps: soaked shoes (a squelch with each)",
  under: "Under the water (its bed)",
  current: "Under, the river's current going by",
  "pond-lap": "The pond lapping at its shore",
  rapid: "The rapid",
  falls: "The falls",
  tread: "Treading water, still",
  "drip-body": "Drips off me, just out",
  "in-step": "In: a step down, a duck dive",
  "in-jump": "In: a jump",
  "in-dive": "In: a dive",
  "in-fall": "In: a fall, a car",
  "car-sink": "A car sinking",
  "ice-crack": "The ice giving way",
  "stroke-breast": "A stroke: breast",
  "stroke-crawl": "A stroke: crawl (fast)",
  "gasp-man": "Coming up: a gasp (a man's)",
  "gasp-woman": "Coming up: a gasp (a woman's)",
  "breathless-man": "Out of breath after long under (a man's)",
  "breathless-woman": "Out of breath after long under (a woman's)",
  bubbles: "Bubbles: a breath out under",
  "climb-out": "Climbing out",
};

const DRY: WetHere = { swim: 0, speed: 0, out: true, pond: 0, rapid: 1e9, falls: 1e9, current: 0, ice: 0 };
// (a scene: where I am, and how I'm going — swum along, the strokes the game's own)
const SCENES: { name: string; h: WetHere }[] = [
  { name: "afloat in the pond, still", h: { ...DRY, swim: 2, pond: 0.4 } },
  { name: "swimming (breast)", h: { ...DRY, swim: 2, speed: 1.3, pond: 0.4 } },
  { name: "swimming fast (crawl)", h: { ...DRY, swim: 2, speed: 2.3, pond: 0.4 } },
  { name: "under in the pond", h: { ...DRY, swim: 3, speed: 1.2 } },
  { name: "under in the river", h: { ...DRY, swim: 3, speed: 1, current: 1.2 } },
  { name: "on the pond's shore", h: { ...DRY, pond: 1 } },
  { name: "by the rapid", h: { ...DRY, rapid: 12, falls: 160 } },
  { name: "by the falls", h: { ...DRY, falls: 15, rapid: 1e9 } },
  { name: "just out, soaked", h: { ...DRY, swim: 0, soaked: 1, after: 2 } },
];

const isStep = (slot: string) => (STEP_SLOTS as readonly string[]).includes(slot);
const KEY = "yutopia:waterpicks";
const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid rgba(239,228,204,.18)",
  background: on ? "#ffb347" : "rgba(30,20,12,.85)",
  color: on ? "#1d1408" : "#efe4cc",
  cursor: "pointer",
  font: "inherit",
});

export default function WaterSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [man, setMan] = useState<Man>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [scene, setScene] = useState(-1);
  const [solo, setSolo] = useState("");
  const [levels, setLevels] = useState<Partial<Record<Loop, number>>>({});
  const water = useRef<WaterSound | null>(null);
  const steps = useRef<StepPlayer | null>(null);
  const soloNode = useRef<(() => void) | null>(null);
  const playTok = useRef(0);
  const fading = useRef<ReturnType<typeof setInterval> | null>(null);
  const picksNow = useRef(picks);
  picksNow.current = picks;

  useEffect(() => {
    try {
      setPicks(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
    void Promise.all([
      fetch("/sfx/water/manifest.json").then((r) => (r.ok ? r.json() : {})),
      fetch("/sfx/steps/manifest.json").then((r) => r.json()),
    ]).then(([w, s]) => setMan({ ...w, ...Object.fromEntries(STEP_SLOTS.map((k) => [k, s[k] ?? []])) }));
  }, []);
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
    if (isStep(slot)) steps.current?.choose(slot as "soaked", i);
    else water.current?.choose(slot as Loop, i);
  };

  // a scene: the game's mix, every tenth of a second — me swimming along as it says
  useEffect(() => {
    if (scene < 0 || !Object.keys(man).length) return;
    void mixer.resume();
    if (fading.current) clearInterval(fading.current);
    fading.current = null;
    if (!water.current) {
      water.current = new WaterSound();
      for (const [s, i] of Object.entries(picksNow.current))
        if (!isStep(s) && i < (man[s]?.length ?? 0)) water.current.choose(s as Loop, i);
    }
    const W = water.current;
    const h = SCENES[scene].h;
    let last = performance.now();
    let x = 0;
    let after = h.after;
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      x += h.speed * dt;
      if (after !== undefined) after += dt;
      const me = {
        id: "me",
        swim: h.swim,
        x,
        y: 0,
        z: h.swim === 3 ? -2 : h.swim === 2 ? -1.25 : 0,
        gain: 1,
        pan: 0,
        me: true,
      };
      W.update(dt, { ...h, after }, [me]);
      setLevels(W.levels());
    }, 100);
    return () => {
      clearInterval(timer);
      // (faded out: back on dry land)
      let n = 0;
      fading.current = setInterval(() => {
        W.update(0.1, DRY, []);
        if (++n > 40 && fading.current) {
          clearInterval(fading.current);
          fading.current = null;
        }
      }, 100);
    };
  }, [scene, man]);
  useEffect(
    () => () => {
      if (fading.current) clearInterval(fading.current);
      water.current?.stop();
    },
    [],
  );

  // a candidate alone, at the game's level: a bed looped, a one-shot's takes one after another, a walk
  async function play(slot: string, i: number) {
    soloNode.current?.();
    soloNode.current = null;
    const tok = ++playTok.current;
    const key = `${slot}:${i}`;
    if (solo === key) return setSolo("");
    setSolo(key);
    await mixer.resume();
    const ctx = mixer.ensure();
    if (isStep(slot)) {
      const S = await loadSteps();
      if (tok !== playTok.current) return;
      steps.current ??= new S.StepPlayer(
        () => (mixer.ctx?.state === "running" ? mixer.ctx : null),
        () => mixer.buses.effects,
        (f, g) => sound.stepSynth(f, g),
      );
      const P = steps.current;
      P.choose(slot as "soaked", i);
      P.preload(slot as "soaked");
      // (wading by the water over the feet; soaked on a lawn)
      const o = slot === "wade-shallow" ? { water: 0.15 } : slot === "wade-deep" ? { water: 0.6 } : { soaked: 1 };
      const timer = setInterval(
        () => P.step("grass", { gait: "walk", shoe: "soft", ...o }),
        slot === "wade-deep" ? 700 : 480,
      );
      soloNode.current = () => clearInterval(timer);
      return;
    }
    const files = man[slot]?.[i]?.files ?? [];
    const bufs = await Promise.all(
      files.map((f) =>
        fetch(`/sfx/water/${f}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => ctx.decodeAudioData(b)),
      ),
    ).catch(() => [] as AudioBuffer[]);
    if (tok !== playTok.current) return;
    if (!bufs.length) return setSolo("");
    if ((SHOTS as readonly string[]).includes(slot)) {
      // (each take, a beat apart)
      let at = ctx.currentTime + 0.05;
      const srcs = bufs.map((b) => {
        const src = ctx.createBufferSource();
        src.buffer = b;
        const g = ctx.createGain();
        g.gain.value = LOUD[slot as Shot];
        src.connect(g).connect(mixer.buses.effects);
        src.start(at);
        at += b.duration + 0.6;
        return src;
      });
      srcs[srcs.length - 1].onended = () => setSolo((s) => (s === key ? "" : s));
      soloNode.current = () => {
        for (const s of srcs) s.stop();
      };
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = loopable(ctx, bufs[0], 0.05, Math.min(0.5, bufs[0].duration / 6));
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = FULL[slot as Loop];
    src.connect(g).connect(mixer.buses.ambience);
    src.start();
    soloNode.current = () => {
      src.stop();
      g.disconnect();
    };
  }
  useEffect(() => () => soloNode.current?.(), []);

  const slots = [...STEP_SLOTS, ...LOOPS, ...SHOTS];
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#17110b",
        color: "#efe4cc",
        font: "13px 'Share Tech Mono', ui-monospace, monospace",
        padding: "16px 16px 80px",
      }}
      data-testid="water-sound-bench"
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
            void navigator.clipboard.writeText(JSON.stringify(Object.fromEntries(slots.map((k) => [k, pickOf(k)]))))
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
            {!man[slot]?.length && <span style={{ opacity: 0.4 }}>none yet</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
