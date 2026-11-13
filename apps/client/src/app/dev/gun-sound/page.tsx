"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";

// The guns' listening bench (docs/plan/79-the-guns.md phase 9): every sound's candidates (CC0 on
// Freesound: tools/sfx-guns.json, found by tools/sfx-guns-search.mjs, cut into takes by
// tools/sfx-weather.mjs into public/sfx/guns), each played alone — its takes one after another — and
// each gun's moments in order (draw, shots, its reload, put away) with the candidates picked here. ★ keeps
// a pick (in this browser); "copy picks" gives the tool's PICK. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/gun-sound

type Cand = { id: string; user: string; title: string; url: string; files: string[] };
type Man = Record<string, Cand[]>;

const GROUPS: { name: string; slots: [string, string][]; run?: (string | number)[] }[] = [
  {
    name: "The revolver",
    slots: [
      ["revolver-near", "A shot, outdoors (its tail into the land)"],
      ["revolver-in", "A shot, in a room"],
      ["revolver-far", "Someone's shot, far off"],
      ["revolver-cock", "The hammer thumbed back"],
      ["revolver-dry", "Dry: the hammer on nothing"],
      ["revolver-open", "The cylinder swung out"],
      ["revolver-eject", "The rod punched: the cases dumped"],
      ["revolver-speedloader", "The speedloader in, twisted"],
      ["revolver-close", "The cylinder snapped shut"],
    ],
    run: [
      "draw",
      400,
      "revolver-cock",
      500,
      "revolver-near",
      900,
      "revolver-cock",
      300,
      "revolver-near",
      900,
      "revolver-dry",
      700,
      "revolver-open",
      250,
      "revolver-eject",
      300,
      "case-snow",
      500,
      "revolver-speedloader",
      600,
      "revolver-close",
      700,
      "holster",
    ],
  },
  {
    name: "The double-barrel",
    slots: [
      ["shotgun-near", "A shot, outdoors"],
      ["shotgun-in", "A shot, in a room"],
      ["shotgun-far", "Someone's shot, far off"],
      ["shotgun-dry", "Dry"],
      ["shotgun-break", "Broken open"],
      ["shotgun-eject", "Both shells out"],
      ["shotgun-shell", "A shell in"],
      ["shotgun-close", "Snapped shut"],
    ],
    run: [
      "draw",
      500,
      "shotgun-near",
      1100,
      "shotgun-near",
      1100,
      "shotgun-break",
      200,
      "shotgun-eject",
      300,
      "shell-snow",
      600,
      "shotgun-shell",
      550,
      "shotgun-shell",
      500,
      "shotgun-close",
      700,
      "holster",
    ],
  },
  {
    name: "The AK-47",
    slots: [
      ["ak-near", "A round, outdoors (full auto plays it ten times a second)"],
      ["ak-in", "A round, in a room"],
      ["ak-far", "Someone's fire, far off"],
      ["ak-mag-out", "The magazine out"],
      ["mag-floor", "The empty landing on a floor"],
      ["mag-snow", "The empty landing on snow or the ground"],
      ["ak-mag-in", "A new one rocked in"],
      ["ak-rack", "The charging handle racked"],
    ],
    run: [
      "draw",
      500,
      ...Array.from({ length: 8 }, () => ["ak-near", 100]).flat(),
      600,
      ...Array.from({ length: 5 }, () => ["ak-near", 100]).flat(),
      800,
      "rifle-dry",
      600,
      "ak-mag-out",
      380,
      "mag-floor",
      520,
      "ak-mag-in",
      700,
      "ak-rack",
      700,
      "holster",
    ],
  },
  {
    name: "The sniper",
    slots: [
      ["sniper-near", "A shot, outdoors"],
      ["sniper-in", "A shot, in a room"],
      ["sniper-far", "Someone's shot, far off"],
      ["sniper-bolt-open", "The bolt up and back"],
      ["sniper-bolt-close", "The bolt forward and down"],
      ["sniper-round", "A round thumbed in"],
    ],
    run: [
      "draw",
      600,
      "sniper-near",
      500,
      "sniper-bolt-open",
      350,
      "case-snow",
      150,
      "sniper-bolt-close",
      900,
      "sniper-near",
      500,
      "sniper-bolt-open",
      600,
      "sniper-round",
      500,
      "sniper-round",
      500,
      "sniper-bolt-close",
      700,
      "holster",
    ],
  },
  {
    name: "The Daybreak (sci-fi energy)",
    slots: [
      ["daybreak-charge", "Its charge (a second)"],
      ["daybreak-fire", "The ball leaving"],
      ["daybreak-ball", "The ball flying (a loop)"],
      ["daybreak-burst", "Its burst"],
      ["daybreak-burst-far", "A burst far off"],
      ["daybreak-cell-out", "A cell out"],
      ["daybreak-cell-in", "A cell in"],
    ],
    run: [
      "draw",
      600,
      "daybreak-charge",
      1000,
      "daybreak-fire",
      200,
      "daybreak-ball",
      1800,
      "daybreak-burst",
      2500,
      "daybreak-cell-out",
      900,
      "daybreak-cell-in",
      700,
      "holster",
    ],
  },
  {
    name: "Every gun",
    slots: [
      ["draw", "Drawn"],
      ["holster", "Put away"],
      ["rifle-dry", "Dry: the AK's, the sniper's"],
      ["case-snow", "Brass landing on snow"],
      ["case-floor", "Brass landing on a floor"],
      ["shell-snow", "A shell landing on snow"],
      ["shell-floor", "A shell landing on a floor"],
    ],
  },
];

const KEY = "yutopia:gunpicks";
// (a shot keeps every take of the one picked — the game goes round them; a handling sound is one moment:
// its take picked too)
const isShot = (slot: string) => /-(near|in|far|burst|burst-far|ball)$/.test(slot);
type Pick = { c: number; t?: number };
const btn = (on: boolean): React.CSSProperties => ({
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid rgba(239,228,204,.18)",
  background: on ? "#ffb347" : "rgba(30,20,12,.85)",
  color: on ? "#1d1408" : "#efe4cc",
  cursor: "pointer",
  font: "inherit",
});

export default function GunSoundBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [man, setMan] = useState<Man>({});
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [playing, setPlaying] = useState("");
  const [copied, setCopied] = useState(false);
  const stopNow = useRef<(() => void) | null>(null);
  const bufs = useRef(new Map<string, AudioBuffer>());
  const tok = useRef(0);

  useEffect(() => {
    try {
      setPicks(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
    void fetch("/sfx/guns/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setMan);
  }, []);
  const pickOf = (slot: string) => {
    const i = picks[slot]?.c;
    return i !== undefined && i < (man[slot]?.length ?? 0) ? i : 0;
  };
  const takeOf = (slot: string) => picks[slot]?.t;
  const setPick = (slot: string, c: number, t?: number) => {
    const next = { ...picks, [slot]: { c, t } };
    setPicks(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const load = async (file: string) => {
    const have = bufs.current.get(file);
    if (have) return have;
    const ctx = mixer.ensure();
    const b = await fetch(`/sfx/guns/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((a) => ctx.decodeAudioData(a));
    bufs.current.set(file, b);
    return b;
  };
  const stop = () => {
    stopNow.current?.();
    stopNow.current = null;
    tok.current++;
    setPlaying("");
  };
  // play buffers at times (s from now); once the last has ended, nothing is playing
  const schedule = (_key: string, items: { b: AudioBuffer; at: number; loop?: number }[]) => {
    const ctx = mixer.ensure();
    const t0 = ctx.currentTime + 0.05;
    let end = 0;
    const srcs = items.map(({ b, at, loop }) => {
      const src = ctx.createBufferSource();
      src.buffer = b;
      if (loop) src.loop = true;
      src.connect(mixer.buses.effects);
      src.start(t0 + at);
      if (loop) src.stop(t0 + at + loop);
      end = Math.max(end, at + (loop ?? b.duration));
      return src;
    });
    const me = tok.current;
    const timer = setTimeout(
      () => {
        if (tok.current === me) setPlaying("");
      },
      (end + 0.2) * 1000,
    );
    stopNow.current = () => {
      clearTimeout(timer);
      for (const s of srcs) s.stop();
    };
  };

  // a candidate alone: its takes, a beat apart (a loop: 4 s of it)
  async function play(slot: string, i: number) {
    const key = `${slot}:${i}`;
    const was = playing;
    stop();
    if (was === key) return;
    setPlaying(key);
    await mixer.resume();
    const me = tok.current;
    const files = man[slot]?.[i]?.files ?? [];
    const got = await Promise.all(files.map(load)).catch(() => [] as AudioBuffer[]);
    if (me !== tok.current || !got.length) return;
    if (slot === "daybreak-ball") return schedule(key, [{ b: got[0], at: 0, loop: 4 }]);
    let at = 0;
    schedule(
      key,
      got.map((b) => {
        const it = { b, at };
        at += b.duration + 0.45;
        return it;
      }),
    );
  }

  // one take of a candidate
  async function playTake(slot: string, i: number, t: number) {
    const key = `${slot}:${i}:${t}`;
    const was = playing;
    stop();
    if (was === key) return;
    setPlaying(key);
    await mixer.resume();
    const me = tok.current;
    const f = man[slot]?.[i]?.files[t];
    const b = f ? await load(f).catch(() => null) : null;
    if (me !== tok.current || !b) return;
    schedule(key, [{ b, at: 0 }]);
  }

  // a gun's moments in order, with the picks (each sound a take of its own, in turn)
  async function run(name: string, steps: (string | number)[]) {
    const key = `run:${name}`;
    const was = playing;
    stop();
    if (was === key) return;
    setPlaying(key);
    await mixer.resume();
    const me = tok.current;
    const used = new Map<string, number>();
    const items: { b: AudioBuffer; at: number; loop?: number }[] = [];
    let at = 0;
    for (const s of steps) {
      if (typeof s === "number") {
        at += s / 1000;
        continue;
      }
      const all = man[s]?.[pickOf(s)]?.files ?? [];
      const t = takeOf(s);
      const files = t !== undefined && all[t] ? [all[t]] : all;
      if (!files.length) continue;
      const n = used.get(s) ?? 0;
      used.set(s, n + 1);
      const b = await load(files[n % files.length]).catch(() => null);
      if (!b) continue;
      items.push(s === "daybreak-ball" ? { b, at, loop: 1.8 } : { b, at });
    }
    if (me !== tok.current) return;
    schedule(key, items);
  }

  const copy = async () => {
    // (a shot: its candidate; a handling sound: [candidate, take] once a take's starred)
    const all: Record<string, number | [number, number]> = {};
    for (const g of GROUPS)
      for (const [s] of g.slots) {
        const t = takeOf(s);
        all[s] = !isShot(s) && t !== undefined ? [pickOf(s), t] : pickOf(s);
      }
    await navigator.clipboard.writeText(JSON.stringify(all)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        // (the game locks the body's scroll — globals.css: this page scrolls in itself)
        height: "100vh",
        overflowY: "auto",
        background: "#17110b",
        color: "#efe4cc",
        font: "13px 'Share Tech Mono', ui-monospace, monospace",
        padding: "16px 16px 80px",
      }}
      data-testid="gun-sound-bench"
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>The guns' sounds</b>
        <span style={{ opacity: 0.6 }}>
          ▶ a candidate's takes · ★ your pick · for a reload's moments: 1 2 3… each take alone, its ★ that one · ▶▶ the
          gun in order with your picks
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn(false)} onClick={stop}>
          ■ stop
        </button>
        <button type="button" style={btn(copied)} onClick={copy} data-testid="copy-picks">
          {copied ? "copied" : "copy picks"}
        </button>
      </div>
      {GROUPS.map((g) => (
        <section key={g.name} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0 8px" }}>
            <b style={{ fontSize: 15, color: "#ffb347" }}>{g.name}</b>
            {g.run && (
              <button
                type="button"
                style={btn(playing === `run:${g.name}`)}
                onClick={() => run(g.name, g.run ?? [])}
                data-testid={`run-${g.name}`}
              >
                ▶▶ in order
              </button>
            )}
          </div>
          {g.slots.map(([slot, label]) => (
            <div
              key={slot}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 300px) 1fr",
                gap: 10,
                padding: "6px 0",
                borderTop: "1px solid rgba(239,228,204,.08)",
              }}
            >
              <div>
                <div>{label}</div>
                <div style={{ opacity: 0.45, fontSize: 11 }}>{slot}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(man[slot] ?? []).map((c, i) => (
                  <span key={c.id} style={{ display: "inline-flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      style={btn(playing === `${slot}:${i}`)}
                      onClick={() => play(slot, i)}
                      title={`${c.title} — ${c.user} (CC0) · ${c.files.length} takes`}
                    >
                      ▶ {"abcdefgh"[i]} <span style={{ opacity: 0.6 }}>{c.title.slice(0, 28)}</span>
                    </button>
                    <button
                      type="button"
                      style={btn(pickOf(slot) === i && picks[slot] !== undefined && takeOf(slot) === undefined)}
                      onClick={() => setPick(slot, i)}
                      aria-label={`pick ${"abcdefgh"[i]} for ${slot}`}
                    >
                      ★
                    </button>
                    {!isShot(slot) &&
                      c.files.length > 1 &&
                      c.files.map((f, t) => (
                        <span key={f} style={{ display: "inline-flex" }}>
                          <button
                            type="button"
                            style={{ ...btn(playing === `${slot}:${i}:${t}`), padding: "3px 6px", fontSize: 11 }}
                            onClick={() => playTake(slot, i, t)}
                            title={`take ${t + 1} alone`}
                          >
                            {t + 1}
                          </button>
                          <button
                            type="button"
                            style={{
                              ...btn(pickOf(slot) === i && takeOf(slot) === t),
                              padding: "3px 5px",
                              fontSize: 11,
                            }}
                            onClick={() => setPick(slot, i, t)}
                            aria-label={`pick take ${t + 1} of ${"abcdefgh"[i]} for ${slot}`}
                          >
                            ★
                          </button>
                        </span>
                      ))}
                  </span>
                ))}
                {!man[slot]?.length && <span style={{ opacity: 0.4 }}>none yet</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
