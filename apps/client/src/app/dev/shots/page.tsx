"use client";

import { isTheme, studio } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Quality } from "@/lib/prefs";
import { WorldEngine } from "@/world/engine";

// Screenshot regression (and budgets): the Studio rendered offline from the
// built-in map — no server, no people, a fixed hour and camera, the clock
// frozen (every frame is dt = 0, so nothing moves but High's finish still
// shows). Dev only, or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1.
//   /dev/shots?x=12&y=9&zoom=1.15&hour=12&theme=clouds&quality=high[&crowd=50]
export default function Shots() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const theme = q.get("theme");
    const quality = (q.get("quality") ?? "high") as Quality;
    const crowd = Number(q.get("crowd") ?? 0);
    const map = { ...studio, theme: isTheme(theme) ? theme : "clouds" };
    const engine = new WorldEngine(map);
    let stop = false;
    void (async () => {
      if (!host.current) return;
      // text on boards and signs is drawn once: have its fonts loaded first
      await Promise.all(
        ["15px VT323", "12px 'Share Tech Mono'", "12px Inter"].map((f) => document.fonts.load(f).catch(() => [])),
      );
      await document.fonts.ready;
      await engine.init(host.current, { quality, reducedMotion: false });
      if (stop) return engine.destroy();
      engine.setObjects(studio.objects);
      engine.setClock(Number(q.get("hour") ?? 12));
      engine.pinCamera({ x: Number(q.get("x") ?? 24), y: Number(q.get("y") ?? 18), zoom: Number(q.get("zoom") ?? 1) });
      // a crowd (budgets): people standing around the open floor, seeded
      for (let i = 0; i < crowd; i++) {
        // an R2 sequence: evenly spread, no two people on top of each other
        const x = 2.5 + ((0.5 + i * 0.7548776662) % 1) * 23;
        const y = 2.5 + ((0.5 + i * 0.5698402909) % 1) * 15;
        engine.upsertAvatar(`p${i}`, {
          name: `Person ${i + 1}`,
          avatar: {
            body: ["regular", "slim", "broad"][i % 3],
            skin: ["#e4b48e", "#a8693f", "#f3d2b3", "#7c4a2b"][i % 4],
            hair: ["short", "long", "curly", "bun", "afro"][i % 5],
            hairColor: ["#3b2a20", "#1c1410", "#b5562f"][i % 3],
            top: ["tee", "hoodie", "shirt", "sweater"][i % 4],
            topColor: ["#b5562f", "#6e7b3a", "#3d4a5c", "#e8a33d"][i % 4],
            bottom: ["jeans", "trousers"][i % 2],
            bottomColor: "#3d4a5c",
            accessory: "none",
            accessoryColor: "#e8a33d",
            style: ["citypop", "ligne"][i % 2],
          },
          x,
          y,
          d: i % 8,
          a: i % 4 === 0 ? 1 : 0,
          status: "available",
          speaking: false,
          emote: "",
          mic: true,
          bot: true,
        });
      }
      const frozen = q.get("frozen") !== "0";
      engine.app.ticker.add((t) => engine.update(frozen ? 0 : t.deltaMS / 1000));
      Object.assign(window as object, { __shots: { engine, settled: () => engine.settled() } });
    })();
    return () => {
      stop = true;
      engine.destroy();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#17110d" }} />;
}
