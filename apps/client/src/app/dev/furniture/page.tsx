"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The furniture bench (docs/plan/67-the-furniture.md, phase 0): today's piece next to the new one in
// its three tiers, at true scale, people sat on and stood by them. Dev only (or a build with
// NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/furniture?hero=chair|desk|sofa|plant   (phase 0's tiers)
//   /dev/furniture?kind=chair|armchair|sofa|beanbag|bench   (every look, as the world draws it)   &story=1
//   &look=lambert|toon|toon2   &night=1   &col=0..3 (one column, close)   &turn=0.5 (radians)   &spin=1   &labels=0   &sitters=1 (people in a close look)
//   &w=&h=   the canvas' size (default: the window)
//   ?scene=desk|hosts   (a dressed desk, today's and the new, someone typing; the radio, the coffee
//   machine and the turntable on their tables)
//   &thumb=0|1|2 &size=256   one model on nothing (a catalog picture, the tier's; or &kind=…&d=…&variant=)

export default function FurnitureDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      if (q.get("room") !== null || q.get("plan") !== null) {
        // (plan 67 phase 10) a room of the studio furnished by a plan: &room=lounge &plan=kitchen
        const P = await import("@/world/furn/planbench");
        if (stop) return;
        cleanup = await P.runPlan(el, {
          plan: q.get("plan"),
          room: q.get("room") ?? "lounge",
          night: q.get("night") === "1",
          w: Number(q.get("w")) || window.innerWidth,
          h: Number(q.get("h")) || window.innerHeight,
        });
        return;
      }
      const B = await import("@/world/furn/bench");
      if (stop) return;
      const hero = q.get("hero");
      const col = q.get("col");
      const h = hero === "desk" || hero === "sofa" || hero === "plant" ? hero : "chair";
      if (q.get("thumb") !== null) {
        // one model on nothing, a catalog picture: &thumb=0|1|2 (the tier) &size=
        cleanup = await B.runThumb(el, {
          hero: h,
          tier: Math.max(0, Math.min(2, Number(q.get("thumb")) || 0)) as 0 | 1 | 2,
          look: q.get("look") === "toon" || q.get("look") === "toon2" ? (q.get("look") as "toon") : "lambert",
          size: Number(q.get("size")) || 256,
          turn: Number(q.get("turn") ?? 0.6) || 0,
          kind: q.get("kind") ?? undefined,
          d: q.get("d") ?? undefined,
          variant: Number(q.get("variant")) || 0,
        });
        return;
      }
      cleanup = await B.runBench(el, {
        hero: h,
        kind: B.BENCH_KINDS.find((k) => k === q.get("kind")) ?? null,
        story: q.get("story") === "1",
        look: q.get("look") === "toon" || q.get("look") === "toon2" ? (q.get("look") as "toon") : "lambert",
        night: q.get("night") === "1",
        col: col === null ? null : Math.max(0, Math.min(9, Number(col) || 0)),
        turn: Number(q.get("turn") ?? 0.22) || 0,
        spin: q.get("spin") === "1",
        labels: q.get("labels") !== "0",
        sitters: q.get("sitters") === "1",
        scene: q.get("scene") === "desk" || q.get("scene") === "hosts" ? (q.get("scene") as "desk") : null,
        ...(q.get("t") !== null ? { t: Number(q.get("t")) } : {}),
        ...(q.get("day") !== null ? { day: Number(q.get("day")) } : {}),
        ...(q.get("text") !== null ? { text: q.get("text") as string } : {}),
        w: Number(q.get("w")) || window.innerWidth,
        h: Number(q.get("h")) || window.innerHeight,
      });
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return (
    <>
      {/* (the dev overlay's badge kept out of the stills) */}
      <style>{"nextjs-portal{display:none!important}"}</style>
      <div ref={host} style={{ position: "fixed", inset: 0, background: "transparent", overflow: "hidden" }} />
    </>
  );
}
