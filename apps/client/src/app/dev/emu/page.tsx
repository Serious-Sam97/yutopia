"use client";

import { type GameSystem, SYSTEMS } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Emu } from "@/world/games/emu";

// Dev only: the game room's emulator on its own (G0 spike). Pick a console and a
// cartridge (?system=2600&rom=/emu/test/colors.a26, or a file), it runs; the
// canvas is captured like the TV stream and played back below, with the
// frames per second of both. Window hooks for e2e: __emuDev.
export default function EmuDev() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLCanvasElement>(null);
  const echo = useRef<HTMLVideoElement>(null);
  const [system, setSystem] = useState<GameSystem>("2600");
  const [status, setStatus] = useState("idle");
  const [stats, setStats] = useState({ emuFps: 0, streamFps: 0, longFrames: 0, audio: false });
  const emu = useRef<Emu | null>(null);

  const start = async (file?: File) => {
    const q = new URLSearchParams(location.search);
    const sys = (file ? system : ((q.get("system") as GameSystem) ?? system)) as GameSystem;
    setSystem(sys);
    setStatus("loading");
    try {
      const rom = file ?? (await (await fetch(q.get("rom") ?? "/emu/test/colors.a26")).blob());
      const name = file?.name ?? (q.get("rom") ?? "colors.a26").split("/").pop() ?? "game";
      const { startEmu } = await import("@/world/games/emu");
      emu.current?.exit();
      emu.current = await startEmu({ system: sys, rom, romName: name, canvas: host.current as HTMLCanvasElement });
      const stream = emu.current.canvas.captureStream(30);
      const a = emu.current.audio();
      if (echo.current) echo.current.srcObject = stream;
      setStats((s) => ({ ...s, audio: !!a?.getAudioTracks().length }));
      setStatus("running");
    } catch (e) {
      setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // frames per second: the emulator's canvas (sampled pixels change) and the echo video
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
    };
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: once; start reads the URL itself
  }, []);

  return (
    <main
      className="p-4 flex flex-col gap-3"
      style={{ color: "var(--cream)", background: "#15100c", minHeight: "100vh" }}
    >
      <h1 className="lcd text-xl">EMULATOR — DEV</h1>
      <div className="flex gap-2 items-center flex-wrap">
        <select value={system} onChange={(e) => setSystem(e.target.value as GameSystem)} className="text-black">
          {Object.entries(SYSTEMS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label} ({s.core})
            </option>
          ))}
        </select>
        <input type="file" onChange={(e) => e.target.files?.[0] && void start(e.target.files[0])} />
        <button type="button" className="deck-btn" onClick={() => void start()}>
          Start from URL
        </button>
        <button
          type="button"
          className="deck-btn"
          onPointerDown={() => emu.current?.press(1, SYSTEMS[system].buttons.includes("b" as never) ? "b" : "a", true)}
          onPointerUp={() => emu.current?.press(1, SYSTEMS[system].buttons.includes("b" as never) ? "b" : "a", false)}
        >
          Hold fire (P1)
        </button>
        <span data-testid="status" className="mono text-sm">
          {status}
        </span>
      </div>
      <p className="mono text-sm" data-testid="stats">
        page fps {stats.emuFps} · stream fps {stats.streamFps} · long frames {stats.longFrames} · audio{" "}
        {stats.audio ? "yes" : "no"}
      </p>
      <div className="flex gap-4 flex-wrap">
        <div style={{ width: 480, height: 360, background: "#000" }}>
          <canvas ref={host} />
        </div>
        <video ref={echo} autoPlay muted playsInline style={{ width: 480, height: 360, background: "#000" }} />
      </div>
    </main>
  );
}
