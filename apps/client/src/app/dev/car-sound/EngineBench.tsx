"use client";

import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";

// The engines' half of /dev/car-sound (docs/plan/92-the-cars.md phase 11): each voice's candidate sets
// (public/sfx/cars/engines.json, cut by tools/sfx-cars-engines.mjs), each played as the game would play it
// (world/car/sound.ts): every loop pitched by the revs over its own, the two either side crossfaded by log revs, on
// load while the revs climb and off as they fall, the mics mixed as heard outside or in. A rev sweep, an idle, a
// drive-by, and each body's moments in order with the picks of the other half (its storage key).

type Point = { file: string; load: "on" | "off"; mic: string; rpm: number; steady: number; sure: number; snr: number };
type Set = {
  name: string;
  note: string;
  credit: { id: string; user: string; title: string; url: string }[];
  points: Point[];
  start: string | null;
};
type Voice = { rpm: number[]; for: string; sets: Set[]; mine?: number; why?: string };
type Man = Record<string, Voice>;
type Cand = { files: string[] };

const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid rgba(239,228,204,.18)",
  background: on ? "#ffb347" : "rgba(30,20,12,.85)",
  color: on ? "#1d1408" : "#efe4cc",
  cursor: "pointer",
  font: "inherit",
});
const KEY = "yutopia:carenginepicks";
const SLOT_KEY = "yutopia:carpicks";
/** how much of each mic, outside the car and in it (sound.ts's MIX, the cabin mic in front when there is one) */
const MIX: Record<"out" | "in", Record<string, number>> = {
  out: { ex: 1, bay: 0.25, far: 0, cabin: 0 },
  in: { ex: 0.35, bay: 0.6, far: 0, cabin: 1 },
};
/** each body: its voice and its moments (slots of the other half; "engine:…" the voice's) */
const BODIES: { name: string; voice: string; run: (string | number)[] }[] = [
  {
    name: "The saloon",
    voice: "four",
    run: [
      "door-open",
      700,
      "door-shut",
      900,
      "belt",
      900,
      "engine:start",
      "engine:idle",
      "engine:rev",
      "horn-saloon",
      1500,
      "engine:stop",
      "door-open",
      600,
      "door-shut",
    ],
  },
  {
    name: "The hatch",
    voice: "revvy",
    run: [
      "door-open",
      600,
      "door-shut",
      900,
      "engine:start",
      "engine:idle",
      "engine:rev",
      "horn-small",
      1200,
      "engine:stop",
    ],
  },
  {
    name: "The pickup",
    voice: "v8",
    run: [
      "door-truck",
      1000,
      "engine:start",
      "engine:idle",
      "engine:rev",
      "horn-truck",
      1500,
      "engine:stop",
      "door-truck",
    ],
  },
  {
    name: "The van",
    voice: "diesel-light",
    run: [
      "door-van",
      1800,
      "door-shut",
      900,
      "engine:start",
      "engine:idle",
      "engine:rev",
      "horn-saloon",
      1500,
      "engine:stop",
    ],
  },
  {
    name: "The plough truck",
    voice: "diesel",
    run: [
      "door-truck",
      1000,
      "engine:start",
      "engine:idle",
      "reverse-beep",
      2500,
      "engine:rev",
      "horn-truck",
      1500,
      "engine:stop",
    ],
  },
  { name: "The snowmobile", voice: "two", run: ["engine:start", "engine:idle", "engine:rev", "engine:stop"] },
];

function loopable(ctx: BaseAudioContext, b: AudioBuffer, skip = 0.03, xf = 0.12): AudioBuffer {
  const sr = b.sampleRate;
  const s0 = Math.round(skip * sr);
  const x = Math.round(xf * sr);
  const len = Math.max(1, b.length - 2 * s0 - x);
  const src = b.getChannelData(0);
  const out = ctx.createBuffer(1, len, sr);
  const d = out.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = src[s0 + i];
  for (let i = 0; i < x && i < len; i++) {
    const k = ((i / x) * Math.PI) / 2;
    d[i] = src[s0 + i] * Math.sin(k) + (src[s0 + len + i] ?? 0) * Math.cos(k);
  }
  return out;
}
function weights(r: number, at: number[]): number[] {
  const w = at.map(() => 0);
  const n = at.length - 1;
  if (n < 0) return w;
  if (r <= at[0]) w[0] = 1;
  else if (r >= at[n]) w[n] = 1;
  else
    for (let i = 0; i < n; i++)
      if (r < at[i + 1]) {
        const x = Math.log(r / at[i]) / Math.log(at[i + 1] / at[i]);
        w[i] = Math.cos((x * Math.PI) / 2);
        w[i + 1] = Math.sin((x * Math.PI) / 2);
        break;
      }
  return w;
}

/** a curve of revs (and load: 1 on, 0 off) over time; its gain and pan for a drive-by */
type Curve = (t: number) => { rpm: number; load: number; gain?: number; pan?: number; rate?: number };
const sweep =
  (idle: number, top: number, dur: number): Curve =>
  (t) => {
    const up = dur * 0.55;
    if (t < 0.8) return { rpm: idle, load: 0 };
    if (t < 0.8 + up) {
      const x = (t - 0.8) / up;
      return { rpm: idle * (top / idle) ** (x ** 0.8), load: 1 };
    }
    const x = Math.min(1, (t - 0.8 - up) / (dur - up - 0.8));
    return { rpm: top * (idle / top) ** (1 - (1 - x) ** 2), load: 0 };
  };

export function EngineBench() {
  const [man, setMan] = useState<Man>({});
  const [slots, setSlots] = useState<Record<string, Cand[]>>({});
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [heard, setHeard] = useState<"out" | "in">("out");
  const [playing, setPlaying] = useState("");
  const [copied, setCopied] = useState(false);
  const bufs = useRef(new Map<string, AudioBuffer>());
  const stopNow = useRef<(() => void) | null>(null);
  const tok = useRef(0);

  useEffect(() => {
    try {
      setPicks(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
    void fetch("/sfx/cars/engines.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setMan);
    void fetch("/sfx/cars/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setSlots);
  }, []);
  const pickOf = (voice: string) => {
    const i = picks[voice];
    return i !== undefined && i < (man[voice]?.sets.length ?? 0) ? i : 0;
  };
  const setPick = (voice: string, i: number) => {
    const next = { ...picks, [voice]: i };
    setPicks(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const load = async (path: string, loop: boolean) => {
    const k = `${path}${loop ? ":loop" : ""}`;
    const have = bufs.current.get(k);
    if (have) return have;
    const ctx = mixer.ensure();
    const b = await fetch(path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((a) => ctx.decodeAudioData(a));
    const out = loop ? loopable(ctx, b) : b;
    bufs.current.set(k, out);
    return out;
  };
  const stop = () => {
    stopNow.current?.();
    stopNow.current = null;
    tok.current++;
    setPlaying("");
  };

  /** the set's engine along `curve` for `dur` s from `t0` (ctx time); returns its stop */
  async function engine(set: Set, curve: Curve, dur: number, t0: number, me: number) {
    const ctx = mixer.ensure();
    const pts = set.points;
    const mics = [...new Set(pts.map((p) => p.mic))];
    const mix = MIX[heard];
    // the mics to hear (and what's missing borrowed: no cabin mic → the bay and exhaust as sound.ts does)
    const level = (mic: string) => {
      if (heard === "in" && !mics.includes("cabin")) return mic === "bay" ? 0.85 : mic === "ex" ? 0.45 : 0;
      return mix[mic] ?? 0;
    };
    const voices: { p: Point; src: AudioBufferSourceNode; g: GainNode }[] = [];
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = heard === "in" && !mics.includes("cabin") ? 2400 : 18000;
    out.connect(lp).connect(pan).connect(mixer.buses.effects);
    out.gain.value = 0;
    for (const p of pts) {
      if (level(p.mic) <= 0) continue;
      const b = await load(`/sfx/cars/engines/${p.file}`, true).catch(() => null);
      if (!b || me !== tok.current) continue;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(out);
      src.start(t0, Math.random() * b.duration);
      src.stop(t0 + dur + 0.3);
      voices.push({ p, src, g });
    }
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 0.15);
    out.gain.setValueAtTime(1, t0 + dur - 0.25);
    out.gain.linearRampToValueAtTime(0, t0 + dur);
    // the curve, a step every 30 ms ahead of time
    const byLoad = (l: "on" | "off") => {
      const has = voices.filter((v) => v.p.load === l);
      return has.length ? has : voices;
    };
    for (let t = 0; t < dur; t += 0.03) {
      const c = curve(t);
      const at = t0 + t;
      const want = new Map<(typeof voices)[number], number>();
      for (const l of ["on", "off"] as const) {
        const vs = byLoad(l);
        const share = l === "on" ? Math.sqrt(c.load) : Math.sqrt(1 - c.load);
        for (const mic of mics) {
          const mv = vs.filter((v) => v.p.mic === mic).sort((a, b) => a.p.rpm - b.p.rpm);
          const w = weights(
            c.rpm,
            mv.map((v) => v.p.rpm),
          );
          mv.forEach((v, i) => {
            want.set(v, (want.get(v) ?? 0) + w[i] * share * level(mic) * (l === "on" ? 1 : 0.6));
          });
        }
      }
      for (const v of voices) {
        v.src.playbackRate.setValueAtTime(Math.min(2.2, Math.max(0.4, (c.rpm / v.p.rpm) * (c.rate ?? 1))), at);
        v.g.gain.setTargetAtTime(want.get(v) ?? 0, at, 0.025);
      }
      if (c.gain !== undefined) out.gain.setTargetAtTime(c.gain, at, 0.05);
      if (c.pan !== undefined) pan.pan.setValueAtTime(c.pan, at);
    }
    return () => {
      for (const v of voices) v.src.stop();
    };
  }

  async function play(key: string, voice: string, si: number, what: "sweep" | "idle" | "by" | "points") {
    const was = playing;
    stop();
    if (was === key) return;
    setPlaying(key);
    await mixer.resume();
    const me = tok.current;
    const v = man[voice];
    const set = v?.sets[si];
    if (!set) return;
    const ctx = mixer.ensure();
    const t0 = ctx.currentTime + 0.1;
    const idle = v.rpm[0];
    const top = v.rpm[v.rpm.length - 1];
    let stopper: () => void = () => undefined;
    let dur = 0;
    if (what === "sweep") {
      dur = 9;
      stopper = await engine(set, sweep(idle, top, dur), dur, t0, me);
    } else if (what === "idle") {
      dur = 5;
      stopper = await engine(set, () => ({ rpm: idle, load: 0 }), dur, t0, me);
    } else if (what === "by") {
      // passing at 60 km/h in third: ~45 % of its revs, close by at 3 s, its pitch up then down
      dur = 6;
      const r = idle + (top - idle) * 0.4;
      stopper = await engine(
        set,
        (t) => {
          const x = (t - 3) * 16.7; // m along the road
          const d = Math.hypot(x, 4);
          const toward = -x / d;
          return {
            rpm: r,
            load: 0.6,
            gain: Math.min(1, 5 / d),
            pan: Math.max(-1, Math.min(1, x / 12)),
            rate: 1 / (1 - (16.7 * toward) / 343),
          };
        },
        dur,
        t0,
        me,
      );
    } else {
      // each loop alone, 1.4 s each, in rev order
      const pts = [...set.points].sort((a, b) => (a.load === b.load ? a.rpm - b.rpm : a.load < b.load ? -1 : 1));
      const srcs: AudioBufferSourceNode[] = [];
      let at = 0;
      for (const p of pts) {
        const b = await load(`/sfx/cars/engines/${p.file}`, true).catch(() => null);
        if (!b || me !== tok.current) continue;
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.loop = true;
        s.connect(mixer.buses.effects);
        s.start(t0 + at);
        s.stop(t0 + at + 1.4);
        srcs.push(s);
        at += 1.6;
      }
      dur = at;
      stopper = () => {
        for (const s of srcs) s.stop();
      };
    }
    if (me !== tok.current) return stopper();
    const timer = setTimeout(() => tok.current === me && setPlaying(""), (dur + 0.3) * 1000);
    stopNow.current = () => {
      clearTimeout(timer);
      stopper();
    };
  }

  /** a body's moments in order: the other half's picks, its voice's picked set */
  async function run(b: (typeof BODIES)[number]) {
    const key = `run:${b.name}`;
    const was = playing;
    stop();
    if (was === key) return;
    setPlaying(key);
    await mixer.resume();
    const me = tok.current;
    const v = man[b.voice];
    const set = v?.sets[pickOf(b.voice)];
    const ctx = mixer.ensure();
    let slotPicks: Record<string, { c: number; t?: number }> = {};
    try {
      slotPicks = JSON.parse(localStorage.getItem(SLOT_KEY) ?? "{}");
    } catch {}
    const one = async (slot: string) => {
      const p = slotPicks[slot];
      const c = slots[slot]?.[p?.c ?? 0];
      const f = c?.files[p?.t ?? 0];
      return f ? load(`/sfx/cars/${f}`, false).catch(() => null) : null;
    };
    const t0 = ctx.currentTime + 0.1;
    let at = 0;
    const stops: (() => void)[] = [];
    for (const s of b.run) {
      if (me !== tok.current) break;
      if (typeof s === "number") {
        at += s / 1000;
        continue;
      }
      if (s.startsWith("engine:")) {
        if (!set || !v) continue;
        const idle = v.rpm[0];
        const what = s.slice(7);
        if (what === "start") {
          const sb = set.start
            ? await load(`/sfx/cars/engines/${set.start}`, false).catch(() => null)
            : await one(
                `start-${b.voice === "four" || b.voice === "revvy" || b.voice === "diesel-light" ? "four" : b.voice === "v8" ? "v8" : b.voice === "two" ? "two" : "diesel"}`,
              );
          if (sb) {
            const src = ctx.createBufferSource();
            src.buffer = sb;
            src.connect(mixer.buses.effects);
            src.start(t0 + at);
            stops.push(() => src.stop());
            at += Math.min(sb.duration, 3.5) - 0.4;
          }
        } else if (what === "idle") {
          stops.push(await engine(set, () => ({ rpm: idle, load: 0 }), 2.5, t0 + at, me));
          at += 2.4;
        } else if (what === "rev") {
          const top = v.rpm[Math.max(0, v.rpm.length - 2)];
          stops.push(await engine(set, sweep(idle, top, 4), 4, t0 + at, me));
          at += 3.9;
        } else if (what === "stop") {
          stops.push(await engine(set, () => ({ rpm: idle, load: 0 }), 1.6, t0 + at, me));
          at += 1.5;
          const sb = await one("stop");
          if (sb) {
            const src = ctx.createBufferSource();
            src.buffer = sb;
            src.connect(mixer.buses.effects);
            src.start(t0 + at - 0.3);
            stops.push(() => src.stop());
            at += sb.duration;
          }
        }
        continue;
      }
      const sb = await one(s);
      if (!sb) continue;
      const src = ctx.createBufferSource();
      src.buffer = sb;
      src.connect(mixer.buses.effects);
      src.start(t0 + at);
      src.stop(t0 + at + Math.min(sb.duration, 3));
      stops.push(() => src.stop());
      at += Math.min(sb.duration, 3) + 0.2;
    }
    const timer = setTimeout(() => tok.current === me && setPlaying(""), (at + 0.5) * 1000);
    stopNow.current = () => {
      clearTimeout(timer);
      for (const f of stops) f();
    };
  }

  const copy = async () => {
    const all: Record<string, number> = {};
    for (const voice of Object.keys(man)) all[voice] = pickOf(voice);
    await navigator.clipboard.writeText(JSON.stringify(all)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        background: "#17110b",
        color: "#efe4cc",
        font: "13px 'Share Tech Mono', ui-monospace, monospace",
        padding: "16px 16px 80px",
      }}
      data-testid="car-engine-bench"
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>The cars' engines</b>
        <span style={{ opacity: 0.6 }}>
          ▶ sweep: idle → its top → idle (on load climbing, off falling) · idle · drive-by · each loop alone · ★ your
          pick (a is mine)
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn(heard === "out")} onClick={() => setHeard("out")}>
          outside
        </button>
        <button type="button" style={btn(heard === "in")} onClick={() => setHeard("in")}>
          in the cabin
        </button>
        <button type="button" style={btn(false)} onClick={stop}>
          ■ stop
        </button>
        <button type="button" style={btn(copied)} onClick={copy} data-testid="copy-engine-picks">
          {copied ? "copied" : "copy picks"}
        </button>
      </div>
      <section style={{ marginBottom: 22 }}>
        <b style={{ fontSize: 15, color: "#ffb347" }}>Each body's moments, with your picks</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {BODIES.map((b) => (
            <button key={b.name} type="button" style={btn(playing === `run:${b.name}`)} onClick={() => run(b)}>
              ▶▶ {b.name}
            </button>
          ))}
        </div>
      </section>
      {Object.entries(man).map(([voice, v]) => (
        <section key={voice} style={{ marginBottom: 22 }}>
          <div style={{ margin: "6px 0 8px" }}>
            <b style={{ fontSize: 15, color: "#ffb347" }}>{voice}</b>{" "}
            <span style={{ opacity: 0.6 }}>
              — {v.for} · revs {v.rpm.join(" · ")}
            </span>
            {v.why && <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>my pick: a — {v.why}</div>}
          </div>
          {v.sets.map((s, i) => {
            const k = (w: string) => `${voice}:${i}:${w}`;
            const loads = [...new Set(s.points.map((p) => p.load))].join("/");
            const mics = [...new Set(s.points.map((p) => p.mic))].join(", ");
            return (
              <div
                key={s.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(200px, 360px) 1fr",
                  gap: 10,
                  padding: "6px 0",
                  borderTop: "1px solid rgba(239,228,204,.08)",
                }}
              >
                <div>
                  <div>
                    {"abcdefgh"[i]}. {s.name}
                  </div>
                  <div style={{ opacity: 0.5, fontSize: 11 }}>
                    {s.note} · {s.points.length} loops ({loads}; {mics}) at {s.points.map((p) => p.rpm).join(" ")} rpm ·{" "}
                    {s.credit
                      .map((c) => c.user)
                      .filter((u, j, a) => a.indexOf(u) === j)
                      .join(", ")}{" "}
                    (CC0)
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {(["sweep", "idle", "by", "points"] as const).map((w) => (
                    <button key={w} type="button" style={btn(playing === k(w))} onClick={() => play(k(w), voice, i, w)}>
                      ▶ {w === "by" ? "drive-by" : w === "points" ? "each loop" : w}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={btn(pickOf(voice) === i && picks[voice] !== undefined)}
                    onClick={() => setPick(voice, i)}
                    aria-label={`pick ${"abcdefgh"[i]} for ${voice}`}
                  >
                    ★
                  </button>
                </div>
              </div>
            );
          })}
          {!v.sets.length && <span style={{ opacity: 0.4 }}>none yet</span>}
        </section>
      ))}
    </div>
  );
}
