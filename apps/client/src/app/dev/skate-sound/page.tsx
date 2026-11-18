"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";
import {
  playTake,
  SKATE_BEDS,
  SKATE_OWN,
  SKATE_SLOTS,
  SKATE_SURFACES,
  type SkateCand,
  type SkateHit,
  SkateSound,
  type SkateState,
  type SkateSurface,
  SkateVoice,
  skateBank,
  skateTakes,
} from "@/world/skate/sound";

// The skate's listening bench (docs/plan/104-the-skate-again.md, F12a): Tony Hawk's sound model — eleven slots a
// surface and the board's own — each slot's candidates (public/sfx/skate/manifest.json) heard one by one (▷) and
// picked (or the one made in code, or another surface's pitched and filtered where there's no recording); a ride made
// up here (how fast, on what, doing what, pushing) heard through the game's own mix (world/skate/sound.ts), and each of
// its moments; "copy picks" gives chosen.json. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/skate-sound

const STATES: SkateState[] = ["roll", "manual", "air", "grind", "slide", "wall", "lip", "off"];
const HITS: SkateHit[] = [
  "jump",
  "land",
  "bonk",
  "grind-jump",
  "grind-land",
  "slide-jump",
  "slide-land",
  "cess",
  "bail",
  "kick-up",
  "on",
  "off",
];

export default function SkateSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [on, setOn] = useState(false);
  const [far, setFar] = useState(false);
  const [dist, setDist] = useState(25);
  const [speed, setSpeed] = useState(5);
  const [maxSpeed, setMaxSpeed] = useState(10);
  const [surface, setSurface] = useState<SkateSurface>("concrete");
  const [grindOn, setGrindOn] = useState<SkateSurface>("metal");
  const [state, setState] = useState<SkateState>("roll");
  const [pushing, setPushing] = useState(false);
  const [hard, setHard] = useState(0.6);
  const [man, setMan] = useState<Record<string, SkateCand[]> | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const snd = useRef<SkateSound | SkateVoice | null>(null);
  const live = useRef({ speed, maxSpeed, surface, grindOn, state, pushing, dist });
  live.current = { speed, maxSpeed, surface, grindOn, state, pushing, dist };

  useEffect(() => {
    void skateBank().then((b) => {
      if (!b) return;
      setMan(b.man);
      setPicks((p) => ({ ...Object.fromEntries(Object.keys(b.man).map((k) => [k, b.chosen[k] ?? 0])), ...p }));
    });
  }, []);

  // the ride: remade as the picks change (each slot's pick heard in it)
  useEffect(() => {
    if (!on) return;
    const ctx = mixer.ensure();
    void mixer.resume();
    const s = far ? new SkateVoice(ctx, mixer.buses.effects, picks) : new SkateSound(ctx, mixer.buses.effects, picks);
    snd.current = s;
    let last = performance.now();
    let push = 0;
    let airAt = -1;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      push = L.pushing && L.state === "roll" ? (push + dt / 0.9) % 1 || 0.001 : 0;
      if (L.state === "air") {
        if (airAt < 0) airAt = now;
      } else airAt = -1;
      const o = {
        speed: L.speed,
        maxSpeed: L.maxSpeed,
        surface: L.surface,
        state: L.state,
        grindOn: L.grindOn,
        airT: airAt < 0 ? undefined : (now - airAt) / 1000,
        push,
      };
      if (s instanceof SkateVoice) s.update({ ...o, dist: L.dist, at: { x: L.dist * 0.5, y: 0, z: -L.dist * 0.85 } });
      else s.update(o);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      s.dispose();
      snd.current = null;
    };
  }, [on, far, picks]);

  /** A candidate heard alone: a shot's takes one after another, a bed's loop for 3 s. */
  const hear = async (slot: string, i: number) => {
    const ctx = mixer.ensure();
    await mixer.resume();
    const t = await skateTakes(ctx, slot, picks, i);
    if (!t) return;
    const base = slot.split(".")[0];
    if (SKATE_BEDS.has(base)) {
      const src = ctx.createBufferSource();
      const b = t.bufs[0];
      src.buffer = b;
      src.loop = true;
      const [a, z] = t.loop ?? [0, b.duration];
      src.loopStart = a;
      src.loopEnd = z;
      src.playbackRate.value = t.rate;
      const g = ctx.createGain();
      g.gain.value = 0.8 * t.gain;
      let into: AudioNode = mixer.buses.effects;
      if (t.lp < 19000 || t.hp > 20) {
        const f = ctx.createBiquadFilter();
        f.type = t.lp < 19000 ? "lowpass" : "highpass";
        f.frequency.value = t.lp < 19000 ? t.lp : t.hp;
        f.connect(into);
        into = f;
      }
      src.connect(g).connect(into);
      src.start(ctx.currentTime, a);
      src.stop(ctx.currentTime + 3);
    } else
      t.bufs.forEach((_, k) => {
        setTimeout(() => playTake(ctx, mixer.buses.effects, t, 0.9, 1, k), k * 550);
      });
  };

  const row = "flex flex-wrap items-center gap-2 my-2";
  const btn = (label: string, pressed: boolean, onClick: () => void, title = "") => (
    <button key={label} type="button" className="deck-btn" aria-pressed={pressed} onClick={onClick} title={title}>
      {label}
    </button>
  );
  const slotRow = (slot: string) => {
    const cands = man?.[slot] ?? [];
    const pick = picks[slot] ?? 0;
    return (
      <div key={slot} className="flex flex-wrap items-center gap-1 my-1">
        <span className="w-40 mono text-xs">{slot}</span>
        {btn("made in code", pick === -1, () => setPicks((p) => ({ ...p, [slot]: -1 })))}
        {cands.map((c, j) => (
          <span key={`${slot}-${c.name}`} className="flex items-center">
            {btn(
              c.name,
              pick === j,
              () => setPicks((p) => ({ ...p, [slot]: j })),
              c.reuse ? `reuse of ${c.reuse}` : `${c.author ?? ""} · ${c.license ?? ""} · ${c.source ?? ""}`,
            )}
            <button type="button" className="deck-btn" aria-label={`hear ${c.name}`} onClick={() => void hear(slot, j)}>
              ▷
            </button>
          </span>
        ))}
      </div>
    );
  };

  return (
    <main className="p-6 max-w-5xl" style={{ color: "var(--cream)" }}>
      <h1 className="text-xl mb-2">Skate · the listening bench</h1>
      <p className="mono text-xs mb-4" style={{ color: "var(--muted)" }}>
        Tony Hawk's model: eleven slots a surface and the board's own. Hear each candidate (▷), pick one (or the one
        made in code); ride with the picks below; copy them into public/sfx/skate/chosen.json.
      </p>
      <div className={row}>
        {btn(on ? "■ stop" : "▶ ride", on, () => setOn(!on))}
        <label className="mono text-xs">
          <input type="checkbox" checked={pushing} onChange={(e) => setPushing(e.target.checked)} /> pushing
        </label>
        <label className="mono text-xs">
          <input type="checkbox" checked={far} onChange={(e) => setFar(e.target.checked)} /> another's (SkateVoice) at
        </label>
        <input type="range" min={0} max={120} value={dist} onChange={(e) => setDist(+e.target.value)} />
        <span className="mono text-xs">{dist} m</span>
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">
          speed {speed.toFixed(1)} / {maxSpeed} m/s
        </span>
        <input
          type="range"
          min={0}
          max={maxSpeed}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        />
        <span className="mono text-xs">max</span>
        <input type="range" min={4} max={25} value={maxSpeed} onChange={(e) => setMaxSpeed(+e.target.value)} />
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">wheels on</span>
        {SKATE_SURFACES.map((s) => btn(s, s === surface, () => setSurface(s)))}
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">grind / slide on</span>
        {SKATE_SURFACES.map((s) => btn(s, s === grindOn, () => setGrindOn(s)))}
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">doing</span>
        {STATES.map((s) => btn(s, s === state, () => setState(s)))}
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">how hard {hard.toFixed(1)}</span>
        <input type="range" min={0} max={1} step={0.1} value={hard} onChange={(e) => setHard(+e.target.value)} />
      </div>
      <div className={row}>
        <span className="w-40 mono text-xs">moments</span>
        {HITS.map((h) =>
          btn(h, false, () => {
            const on2 = /grind|slide/.test(h) ? grindOn : surface;
            snd.current?.hit(h, on2, hard);
          }),
        )}
      </div>
      <h2 className="text-lg mt-6 mb-1">The candidates</h2>
      {SKATE_SLOTS.map((slot) => (
        <section key={slot} className="my-3">
          <h3 className="mono text-sm" style={{ color: "var(--muted)" }}>
            {slot}
          </h3>
          {SKATE_SURFACES.map((s) => slotRow(`${slot}.${s}`))}
        </section>
      ))}
      <section className="my-3">
        <h3 className="mono text-sm" style={{ color: "var(--muted)" }}>
          the board's own
        </h3>
        {SKATE_OWN.map((s) => slotRow(s))}
      </section>
      <div className={row}>
        {btn(copied ? "copied" : "copy picks", false, () => {
          void navigator.clipboard?.writeText(`${JSON.stringify(picks, null, 1)}\n`).then(() => setCopied(true));
        })}
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          → public/sfx/skate/chosen.json
        </span>
      </div>
    </main>
  );
}
