"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The kart's sounds to listen to (docs/plan/46-the-karts.md): each scene played live, or rendered
// offline and saved as a WAV. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1). A test reads
// the offline render through window.__kartSound.render(name) → base64 WAV.

type Board = typeof import("@/world/kart/sound-board");

export default function KartSoundDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [board, setBoard] = useState<Board | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    void import("@/world/kart/sound-board").then((b) => {
      setBoard(b);
      (window as unknown as { __kartSound: unknown }).__kartSound = {
        scenes: Object.keys(b.SCENES),
        /** its loudest sample, its RMS, whether anything went NaN */
        async level(name: string) {
          const buf = await b.renderScene(name);
          let peak = 0;
          let sum = 0;
          let nan = false;
          for (let c = 0; c < buf.numberOfChannels; c++)
            for (const x of buf.getChannelData(c)) {
              if (Number.isNaN(x)) nan = true;
              peak = Math.max(peak, Math.abs(x));
              sum += x * x;
            }
          return { peak, rms: Math.sqrt(sum / (buf.length * buf.numberOfChannels)), nan };
        },
        async render(name: string) {
          const buf = await b.renderScene(name);
          const bytes = b.wav(buf);
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        },
      };
    });
  }, []);
  const play = (name: string) => {
    if (!board) return;
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
    stop.current?.();
    stop.current = board.playScene(ctx.current, name);
  };
  const save = async (name: string) => {
    if (!board) return;
    const bytes = board.wav(await board.renderScene(name));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/wav" }));
    a.download = `kart-${name}.wav`;
    a.click();
  };
  return (
    <main
      style={{
        padding: 24,
        fontFamily: "var(--font-body)",
        color: "var(--cream)",
        background: "var(--bg)",
        minHeight: "100vh",
      }}
    >
      <h1 className="title" style={{ fontSize: 32 }}>
        Kart sounds
      </h1>
      <p style={{ color: "var(--cream-dim)" }}>
        drive: idle, off the line, a drift to purple, the turbo, lifting off, the kerb, snow, the jump, a bank · items:
        every item · race: the lights, the go, the flag · flyby: someone else going past
      </p>
      {board &&
        Object.keys(board.SCENES).map((n) => (
          <div key={n} style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
            <span style={{ width: 80 }}>{n}</span>
            <button type="button" className="deck-btn" onClick={() => play(n)}>
              Play
            </button>
            <button type="button" className="deck-btn" onClick={() => void save(n)}>
              Save WAV
            </button>
          </div>
        ))}
      <button type="button" className="deck-btn" onClick={() => stop.current?.()}>
        Stop
      </button>
    </main>
  );
}
