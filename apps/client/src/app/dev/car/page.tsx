"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The car's sandbox (docs/plan/28-the-car.md, phase 1): drive it, read every
// wheel, tune it. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/car                         the test pad
//   /dev/car?world=grounds&at=lot    the real Grounds (lot · pond · driveway · woods · town)
//   &night=1   &car=offroad

export default function CarDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const S = await import("@/world/tp/car/sandbox");
      if (stop) return;
      cleanup = await S.runSandbox(el, {
        world: q.get("world") === "grounds" ? "grounds" : "pad",
        at: q.get("at") ?? undefined,
        night: q.get("night") === "1",
        spec: q.get("car") === "offroad" ? "offroad" : "sedan",
      });
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#111" }} />;
}
