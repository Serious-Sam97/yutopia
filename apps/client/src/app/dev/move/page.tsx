"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The move's sandbox (docs/plan/29-the-move.md, phase 1): walk, run, jump,
// vault, climb, roll and slide on a test pad, read the body on graphs, tune
// every number. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/move

export default function MoveDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const S = await import("@/world/tp/move/sandbox");
      if (stop) return;
      cleanup = await S.runMoveSandbox(el);
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#111" }} />;
}
