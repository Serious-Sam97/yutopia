"use client";

import { type ComputerView, ERAS, type Era } from "@yutopia/shared/computer";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";
import { OS_H, OS_W, paintOs, paintTube } from "@/world/os/screen";

// Dev-only review sheet for what a computer's glass shows (world/os/screen.ts):
// every VortexOS era × phase, at a fixed moment (nothing moves, so shots match).
const NOW = new Date(2026, 9, 16, 14, 37).getTime();
const CELLS: { label: string; phase: ComputerView["phase"]; t: number; app?: string }[] = [
  { label: "boot · POST", phase: "boot", t: 1500 },
  { label: "boot · logo", phase: "boot", t: 3600 },
  { label: "login", phase: "login", t: 1800 },
  { label: "desktop", phase: "desktop", t: 4000 },
  { label: "desktop · Paint", phase: "desktop", t: 4000, app: "Paint" },
  { label: "desktop · Doom", phase: "desktop", t: 4000, app: "Doom" },
  { label: "desktop · Terminal", phase: "desktop", t: 1200, app: "Terminal" },
  { label: "desktop · Messenger", phase: "desktop", t: 4000, app: "Messenger" },
  { label: "screensaver", phase: "saver", t: 2600 },
  { label: "shutdown", phase: "shutdown", t: 500 },
  { label: "shutdown · safe", phase: "shutdown", t: 2400 },
];

function Shot({ era, cell }: { era: Era; cell: (typeof CELLS)[number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    paintOs(
      g,
      {
        sid: "",
        uid: 1,
        name: "Ana Demo",
        user: "ana",
        era,
        app: cell.app ?? "",
        phase: cell.phase,
        since: NOW - cell.t,
      },
      NOW,
    );
  }, [era, cell]);
  return <canvas ref={ref} width={OS_W} height={OS_H} style={{ width: 240, height: 180, borderRadius: 6 }} />;
}

function Tube({ k, opening }: { k: number; opening: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paintTube(g, k, opening);
  }, [k, opening]);
  return <canvas ref={ref} width={OS_W} height={OS_H} style={{ width: 120, height: 90, borderRadius: 4 }} />;
}

export default function OsSheet() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ padding: 16, background: "#1a1410", color: "#efe4cc", font: "12px ui-monospace, monospace" }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>VortexOS on the glass · every era × phase</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span>tube on</span>
        {[0.1, 0.4, 0.8].map((k) => (
          <Tube key={`on${k}`} k={k} opening />
        ))}
        <span>tube off</span>
        {[0.2, 0.5, 0.8].map((k) => (
          <Tube key={`off${k}`} k={k} opening={false} />
        ))}
      </div>
      {ERAS.map((era) => (
        <section key={era} data-era={era} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 14, margin: "6px 0" }}>{era}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CELLS.map((c) => (
              <figure key={c.label} style={{ margin: 0 }}>
                <Shot era={era} cell={c} />
                <figcaption>{c.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
