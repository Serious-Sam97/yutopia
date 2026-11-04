"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The chess mocks (docs/plan/70-the-chess.md, phase 0): the living men, the board camera, the
// storyboards. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1). The shots: world/furn/chessbench.ts.

export default function ChessDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const B = await import("@/world/furn/chessbench");
      if (stop) return;
      const k = q.get("k") ?? "k";
      cleanup = await B.runChess(el, {
        shot: q.get("shot") ?? "board",
        set: Math.max(0, Math.min(2, Number(q.get("set") ?? 1) || 0)),
        side: q.get("side") === "b" ? "b" : "w",
        k: ("prnbqk".includes(k) ? k : "k") as "k",
        view: q.get("view") ?? "white",
        story: q.get("story") ?? "knight",
        f: Number(q.get("f")) || 0,
        sel: q.get("sel") === "1",
        hud: q.get("hud") === "1",
        night: q.get("night") === "1",
        turn: Number(q.get("turn") ?? 0.35) || 0,
        vortex: q.get("vortex") ?? "",
        w: Number(q.get("w")) || window.innerWidth,
        h: Number(q.get("h")) || window.innerHeight,
      });
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, overflow: "hidden" }} />;
}
