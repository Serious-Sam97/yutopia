"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The kart's sandbox (docs/plan/46-the-karts.md, phase 1): drive it round the real circuit, read
// what it's doing, tune it. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/kart              by day
//   /dev/kart?night=1      under the floodlights
//   &surface=ice|snow|deep the whole circuit one surface

export default function KartDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const S = await import("@/world/tp/kart/sandbox");
      if (stop) return;
      const surf = q.get("surface");
      cleanup = await S.runKartSandbox(el, {
        night: q.get("night") === "1",
        surface: surf && ["snow", "deep", "ice", "blackice"].includes(surf) ? (surf as "ice") : undefined,
      });
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#111" }} />;
}
