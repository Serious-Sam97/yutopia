"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The Grounds — phase 0's mocks (docs/plan/27-the-grounds.md): the site plan
// and the mood stills, drawn from the shared Grounds (packages/shared
// grounds.ts) by the prototype in world/tp/grounds3d.ts. Dev only (or a build
// with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/grounds?shot=plan            the site plan
//   /dev/grounds?shot=lot-plan        the lot, today and proposed (docs/plan/42-the-lot.md)
//   /dev/grounds?shot=<still>         a still (see SHOTS in world/tp/grounds-shots.ts)
//   &w=&h=                            the canvas' size (default 1600 × 900)
//
// When a still is drawn, window.__shot is true (for the screenshot script).

export default function GroundsDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("…");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const shot = q.get("shot") ?? "plan";
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      if (shot === "lot-plan") {
        // (through the stills' module: an import of its own split the Grounds' chunks — docs/plan/42)
        const { drawLotPlans } = await import("@/world/tp/grounds-shots");
        const c = document.createElement("canvas");
        drawLotPlans(c);
        c.style.width = "100%";
        el.appendChild(c);
        setStatus(`lot plan ${c.width}×${c.height}`);
        (window as unknown as { __shot?: boolean }).__shot = true;
        cleanup = () => c.remove();
        return;
      }
      if (shot === "plan") {
        const { drawSitePlan } = await import("@/world/grounds-plan");
        const c = document.createElement("canvas");
        const t0 = performance.now();
        drawSitePlan(c);
        c.style.width = "100%";
        el.appendChild(c);
        setStatus(`plan ${c.width}×${c.height} in ${Math.round(performance.now() - t0)} ms`);
        (window as unknown as { __shot?: boolean }).__shot = true;
        cleanup = () => c.remove();
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
