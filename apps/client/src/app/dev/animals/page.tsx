"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The animals' animation bench (docs/plan/129-animal-animations.md, F2a): every model, every clip, as the game plays
// it, on a treadmill marked in metres. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/animals?model=bear&speed=9   /dev/animals?all=1&speed=3   /dev/animals?model=wolf&clip=howl&with=fox

export default function AnimalsDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const B = await import("@/world/animals/bench");
      if (stop) return;
      cleanup = await B.runBench(el, { q: new URLSearchParams(location.search) });
      if (stop) cleanup();
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#e6e1d6" }} />;
}
