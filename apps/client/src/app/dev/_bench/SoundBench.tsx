"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mixer } from "@/world/audio";

// A listening bench (plans 79, 88): every sound's candidates (CC0 on Freesound, found by a tools/sfx-*-search.mjs,
// cut into takes by tools/sfx-weather.mjs into public/sfx/<dir>), each played alone — its takes one after another —
// and each group's moments in order with the candidates picked here. ★ keeps a pick (in this browser); "copy picks"
// gives the tool's PICK. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1): /dev/gun-sound, /dev/vortex-sound.

type Cand = { id: string; user: string; title: string; url: string; files: string[] };
type Man = Record<string, Cand[]>;
export type Group = { name: string; slots: [string, string][]; run?: (string | number)[] };

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

export interface BenchProps {
  /** its heading and how to use it */
  title: string;
  help: string;
  /** public/sfx/<dir>: its manifest and takes */
  dir: string;
  /** where the picks are kept in this browser */
  storageKey: string;
  groups: Group[];
  /** a sound that keeps every take of the one picked (the game goes round them) — else one moment: its take picked */
  isShot: (slot: string) => boolean;
  /** a loop: how long it plays alone, and in a run */
  loops?: Record<string, [number, number]>;
  testId: string;
}

export function SoundBench({ title, help, dir, storageKey, groups, isShot, loops = {}, testId }: BenchProps) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const KEY = storageKey;
  const GROUPS = groups;
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
    void fetch(`/sfx/${dir}/manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setMan);
  }, [dir, KEY]);
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
    const b = await fetch(`/sfx/${dir}/${file}`)
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
    if (loops[slot]) return schedule(key, [{ b: got[0], at: 0, loop: loops[slot][0] }]);
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
      items.push(loops[s] ? { b, at, loop: loops[s][1] } : { b, at });
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
      data-testid={testId}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{title}</b>
        <span style={{ opacity: 0.6 }}>{help}</span>
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
