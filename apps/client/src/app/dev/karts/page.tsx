"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The Kart Park — phase 0's mocks (docs/plan/46-the-karts.md): the site plan with the new land
// east of the town, the park close up, and the stills (the kart, a race, the bowl, the gate),
// drawn from the shared park (packages/shared kart/park.ts) by the Grounds' stills. Dev only
// (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/karts?shot=plan          the Grounds' site plan with the new land and the park
//   /dev/karts?shot=park-plan     the park close up (&layout=oval&reverse=1: a layout of the
//                                 track changer's, docs/plan/47-the-track-changer.md)
//   /dev/karts?shot=<still>       a still (the `kart-…` shots in world/tp/grounds-shots.ts)
//   &w=&h=                        the canvas' size (default 1600 × 900)
//
// When it's drawn, window.__shot is true (for the screenshot script).

export default function KartsDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("…");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const shot = q.get("shot") ?? "park-plan";
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const done = (c: HTMLCanvasElement, what: string) => {
        c.style.width = "100%";
        el.appendChild(c);
        setStatus(`${what} ${c.width}×${c.height}`);
        (window as unknown as { __shot?: boolean }).__shot = true;
        cleanup = () => c.remove();
      };
      if (shot === "plan" || shot === "park-plan") {
        const S = await import("@/world/tp/grounds-shots");
        const c = document.createElement("canvas");
        if (shot === "plan") {
          S.drawSitePlan(c);
          S.drawParkOnSitePlan(c);
        } else S.drawParkPlan(c, (q.get("layout") ?? "eight") as "eight", q.get("reverse") === "1");
        done(c, shot);
        return;
      }
      const S = await import("@/world/tp/grounds-shots");
      if (stop) return;
      const W = Number(q.get("w")) || 1600;
      const H = Number(q.get("h")) || 900;
      cleanup = await S.runShot(el, shot, W, H, setStatus);
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);

  return (
    <div style={{ background: "#111", minHeight: "100vh" }}>
      <div ref={host} />
      <div
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          font: "12px monospace",
          color: "#ccc",
          background: "rgba(0,0,0,.5)",
          padding: "2px 6px",
        }}
        data-status
      >
        {status}
      </div>
    </div>
  );
}
