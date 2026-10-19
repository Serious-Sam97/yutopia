"use client";

import { type GameSystem, SYSTEMS } from "@yutopia/shared/games";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Emu } from "@/world/games/emu";

// Dev only: the game room's emulator on its own (G0 spike). Pick a console and a
// cartridge (?system=2600&rom=/emu/test/colors.a26, or a file), it runs; the
// canvas is captured like the TV stream and played back below, with the
// frames per second of both. Window hooks for e2e: __emuDev.
// The disc console's spike (docs/plan/23-disc-console.md P0): ?system=ps1
// (rom /emu/test/colors.exe by default; &bios=<url> or pick a BIOS file, else
// the core's HLE BIOS — dev only), its pads through virtual gamepads, and what
// it costs: main-thread time per frame, memory, boot time, save-state size.

type Sys = GameSystem;

interface Cost {
  med: number;
  p95: number;
  max: number;
}
const quant = (a: number[]): Cost => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p: number) => +(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(2);
  return { med: q(0.5), p95: q(0.95), max: q(1) };
};

// Main-thread time spent in rAF callbacks (the cores run their frame there).
const rafTimes: number[] = [];
let rafWrapped = false;
function wrapRaf() {
  if (rafWrapped) return;
  rafWrapped = true;
  const raf = window.requestAnimationFrame.bind(window);
  let frameCost = 0;
  let lastFrame = -1;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    raf((t) => {
      if (t !== lastFrame) {
        if (lastFrame >= 0) rafTimes.push(frameCost);
        frameCost = 0;
        lastFrame = t;
      }
      const t0 = performance.now();
      try {
        cb(t);
      } finally {
        frameCost += performance.now() - t0;
      }
    });
}

export default function EmuDev() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLCanvasElement>(null);
  const echo = useRef<HTMLVideoElement>(null);
  const [system, setSystem] = useState<Sys>("2600");
  const [status, setStatus] = useState("idle");
  const [stats, setStats] = useState({ emuFps: 0, streamFps: 0, longFrames: 0, audio: false });
  const [cost, setCost] = useState<Cost | null>(null);
  const [spike, setSpike] = useState<Record<string, string | number>>({});
  const emu = useRef<Emu | null>(null);
  const biosFile = useRef<File | null>(null);
  const rumbles = useRef<{ port: number; strong: number; weak: number; ms: number }[]>([]);

  const start = async (files?: File[]) => {
    const q = new URLSearchParams(location.search);
    const sys = (files?.length ? system : ((q.get("system") as Sys) ?? system)) as Sys;
    setSystem(sys);
    setStatus("loading");
    try {
      const ps1 = sys === "ps1";
      const fallback = ps1 ? "/emu/test/colors.exe" : "/emu/test/colors.a26";
      // a disc in several files: the .cue (or .m3u) first, its tracks after
      const sorted = [...(files ?? [])].sort(
        (a, b) => Number(/\.(cue|m3u)$/i.test(b.name)) - Number(/\.(cue|m3u)$/i.test(a.name)),
      );
      const rom = sorted[0] ?? (await (await fetch(q.get("rom") ?? fallback)).blob());
      const name = sorted[0]?.name ?? (q.get("rom") ?? fallback).split("/").pop() ?? "game";
      const { startEmu } = await import("@/world/games/emu");
      emu.current?.exit();
      let bios: File[] | undefined;
      if (ps1) {
        const url = q.get("bios");
        if (biosFile.current) bios = [biosFile.current];
        else if (url) bios = [new File([await (await fetch(url)).blob()], url.split("/").pop() ?? "scph5501.bin")];
      }
      wrapRaf();
      const heap0 = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      const t0 = performance.now();
      emu.current = await startEmu({
        system: sys,
        rom,
        romName: name,
        more: sorted.slice(1),
        canvas: host.current as HTMLCanvasElement,
        // (the pads, the DualShock setup, the BIOS options: startEmu's own)
        ...(ps1 ? { bios } : {}),
        config: {
          ...(q.has("latency") ? { audio_latency: Number(q.get("latency")) } : {}),
          ...(q.has("verbose") ? { log_verbosity: true, libretro_log_level: 0, frontend_log_level: 0 } : {}),
        },
      });
      const bootMs = Math.round(performance.now() - t0);
      emu.current.onRumble((port, r) => {
        rumbles.current.push({ port, ...r });
        if (rumbles.current.length > 50) rumbles.current.shift();
      });
      const stream = emu.current.canvas.captureStream(30);
      const a = emu.current.audio();
      if (echo.current) echo.current.srcObject = stream;
      setStats((s) => ({ ...s, audio: !!a?.getAudioTracks().length }));
      const heap1 = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      setSpike({
        core: SYSTEMS[sys].core,
        bios: ps1 ? (bios?.[0]?.name ?? "HLE") : "-",
        romMB: +(sorted.reduce((n, f) => n + f.size, 0) / 1e6 || rom.size / 1e6).toFixed(1),
        bootMs,
        jsHeapMB: heap1 ? +((heap1 - heap0) / 1e6).toFixed(0) : "n/a",
      });
      rafTimes.length = 0;
      setStatus("running");
    } catch (e) {
      console.error("[emu dev]", e);
      setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // the core's memory and a save state's size, raw and gzip'd
  const measureState = async () => {
    const e = emu.current;
    if (!e) return;
    const t0 = performance.now();
    const st = await e.saveState();
    const saveMs = Math.round(performance.now() - t0);
    const gz = await new Response(st.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    const sram = await e.saveSRAM();
    setSpike((s) => ({
      ...s,
      stateKB: Math.round(st.size / 1024),
      stateGzKB: Math.round(gz.size / 1024),
      saveMs,
      sramKB: sram ? Math.round(sram.size / 1024) : 0,
    }));
  };

  // frames per second: the emulator's canvas (sampled pixels change) and the echo video
  // biome-ignore lint/correctness/useExhaustiveDependencies: once; start reads the URL itself
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let long = 0;
    let echoFrames = 0;
    const v = echo.current;
    const onVideo = () => {
      echoFrames++;
      v?.requestVideoFrameCallback(onVideo);
    };
    v?.requestVideoFrameCallback(onVideo);
    const tick = (now: number) => {
      frames++;
      if (now - last > 50) long++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setInterval(() => {
      setStats((s) => ({ ...s, emuFps: frames, streamFps: echoFrames, longFrames: long }));
      if (rafTimes.length > 30) setCost(quant(rafTimes.slice(-300)));
      frames = 0;
      echoFrames = 0;
      long = 0;
      last = performance.now();
    }, 1000);
    (window as unknown as { __emuDev: unknown }).__emuDev = {
      get emu() {
        return emu.current;
      },
      start: () => start(),
      // main-thread ms per frame over the last n frames (rAF callbacks)
      cost: (n = 300) => quant(rafTimes.slice(-n)),
      costRaw: (n = 1000) => rafTimes.slice(-n),
      resetCost: () => {
        rafTimes.length = 0;
      },
      measureState,
      // a game of a space through this browser's copy (the disc cache), stopped
      // after `stopAt` bytes when asked (the next call carries on with Range)
      cacheGame: async (id: string, stopAt = 0) => {
        const api = await import("@/world/games/api");
        const game = (await api.library()).find((g) => g.id === id);
        if (!game) return { error: "no such game" };
        const ctl = new AbortController();
        let last = 0;
        try {
          const r = await api.romOf(id, game.system, {
            game,
            signal: ctl.signal,
            onProgress: (done) => {
              last = done;
              if (stopAt && done >= stopAt) ctl.abort();
            },
          });
          return {
            sizes: [r.blob.size, ...r.more.map((f) => f.size)],
            names: [r.name, ...r.more.map((f) => f.name)],
            last,
          };
        } catch (e) {
          return { stopped: ctl.signal.aborted, last, error: String(e) };
        }
      },
      forgetGames: async () => (await import("@/world/games/discs")).forget(),
      // bytes of the core's wasm memory
      peek: (at: number, n: number) => {
        const m = emu.current?.emscripten() as { HEAPU8: Uint8Array } | undefined;
        return m ? [...m.HEAPU8.slice(at, at + n)] : null;
      },
      // try a launch by hand: { rom: url, core, config, coreConfig, bios: url }
      launch: async (x: {
        rom: string;
        core?: string;
        config?: Record<string, string | number | boolean>;
        coreConfig?: Record<string, string>;
        bios?: string;
      }) => {
        const { startEmu } = await import("@/world/games/emu");
        emu.current?.exit();
        const get = async (u: string) => new File([await (await fetch(u)).blob()], u.split("/").pop() ?? "f");
        const rom = await get(x.rom);
        emu.current = await startEmu({
          system: "snes",
          rom,
          romName: rom.name,
          canvas: host.current as HTMLCanvasElement,
          core: x.core,
          config: x.config,
          coreConfig: x.coreConfig,
          bios: x.bios ? [await get(x.bios)] : undefined,
        });
        return "ok";
      },
      // a virtual pad: buttons by standard index (bitmask), sticks −1..1
      vpad: async (port: number, buttons: number, axes: number[] = [0, 0, 0, 0]) =>
        (await import("@/world/games/vpad")).setVirtualPad(port, buttons, axes),
      rumbles: () => rumbles.current,
    };
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const fire = SYSTEMS[system].buttons.includes("b" as never) ? "b" : "a";
  return (
    <main
      className="p-4 flex flex-col gap-3"
      style={{ color: "var(--cream)", background: "#15100c", minHeight: "100vh" }}
    >
      <h1 className="lcd text-xl">EMULATOR — DEV</h1>
      <div className="flex gap-2 items-center flex-wrap">
        <select value={system} onChange={(e) => setSystem(e.target.value as Sys)} className="text-black">
          {Object.entries(SYSTEMS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label} ({s.core})
            </option>
          ))}
        </select>
        <label className="mono text-sm">
          game{" "}
          <input
            type="file"
            multiple
            data-testid="rom-file"
            onChange={(e) => e.target.files?.length && void start([...e.target.files])}
          />
        </label>
        {system === "ps1" ? (
          <label className="mono text-sm">
            BIOS{" "}
            <input
              type="file"
              data-testid="bios-file"
              onChange={(e) => {
                biosFile.current = e.target.files?.[0] ?? null;
              }}
            />
          </label>
        ) : null}
        <button type="button" className="deck-btn" onClick={() => void start()}>
          Start from URL
        </button>
        <button
          type="button"
          className="deck-btn"
          onPointerDown={() => emu.current?.press(1, fire, true)}
          onPointerUp={() => emu.current?.press(1, fire, false)}
        >
          Hold fire (P1)
        </button>
        <button type="button" className="deck-btn" onClick={() => void measureState()}>
          Measure state
        </button>
        <span data-testid="status" className="mono text-sm">
          {status}
        </span>
      </div>
      <p className="mono text-sm" data-testid="stats">
        page fps {stats.emuFps} · stream fps {stats.streamFps} · long frames {stats.longFrames} · audio{" "}
        {stats.audio ? "yes" : "no"}
        {cost ? ` · main thread / frame: med ${cost.med} ms, p95 ${cost.p95}, max ${cost.max}` : ""}
      </p>
      {Object.keys(spike).length ? (
        <p className="mono text-sm" data-testid="spike">
          {Object.entries(spike)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}
        </p>
      ) : null}
      <div className="flex gap-4 flex-wrap">
        <div style={{ width: 480, height: 360, background: "#000" }}>
          <canvas ref={host} />
        </div>
        <video ref={echo} autoPlay muted playsInline style={{ width: 480, height: 360, background: "#000" }} />
      </div>
    </main>
  );
}
