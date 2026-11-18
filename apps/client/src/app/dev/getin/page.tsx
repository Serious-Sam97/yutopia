"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The get-in act's bench (docs/plan/100-the-get-in-act.md, phase 0): a car, a seat, her body getting in and out of it,
// scrubbed, played, slowed; the grips and feet marked, the act's faults listed. Dev only (or a build with
// NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/getin                       the town sedan, the driver's door
//   /dev/getin?car=pickup&seat=1     another car, another seat (&out=1 the way out, &fast=1 hurried)

export default function GetInDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const B = await import("@/world/car/getin-bench");
      if (stop) return;
      cleanup = await B.runBench(el, { car: q.get("car") ?? "sedan", seat: Number(q.get("seat") ?? 0) });
      if (stop) cleanup();
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#e6e1d6" }} />;
}
