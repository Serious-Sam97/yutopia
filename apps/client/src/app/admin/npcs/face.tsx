"use client";

import type { AvatarLayers } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { flatFigure } from "@/components/flatFigure";
import { useChars } from "@/components/useChars";

type Chars = NonNullable<ReturnType<typeof useChars>>;

// A cast card's picture (docs/plan/120-god-mode-npcs.md): their 3D head and shoulders, drawn one a frame — after
// React's frame — so a list of twenty doesn't stall the page (each read back waits on the GPU); kept by look. Flat in
// their colours where WebGL can't draw. Vortex: his mark.
const pics = new Map<string, string | null>();
const queue: { key: string; look: AvatarLayers; done: () => void }[] = [];
let pumping = false;
function pump(C: Chars) {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    if (!pics.has(job.key)) {
      const p = C.pictures();
      const got = p.canDraw() ? p.portrait(job.look, 96) : null;
      // (the life look's clothes not in yet: asked again once they are)
      if (got === null && p.canDraw() && p.lifeLook()) {
        void p.whenReady(job.look).then(() => {
          queue.push(job);
          pump(C);
        });
      } else {
        pics.set(job.key, got);
        job.done();
      }
    } else job.done();
    requestAnimationFrame(() => setTimeout(step, 0));
  };
  requestAnimationFrame(() => setTimeout(step, 0));
}

export function CastFace({ look, size = 44 }: { look: AvatarLayers | null; size?: number }) {
  const C = useChars();
  const key = look ? JSON.stringify(look) : "";
  const [src, setSrc] = useState<string | null | undefined>(() => (key ? pics.get(key) : undefined));
  useEffect(() => {
    if (!look || !C) return;
    if (pics.has(key)) {
      setSrc(pics.get(key));
      return;
    }
    let gone = false;
    queue.push({ key, look, done: () => !gone && setSrc(pics.get(key)) });
    pump(C);
    return () => {
      gone = true;
    };
  }, [C, key, look]);
  const shown = look ? (src ?? (src === null ? flatFigure(look, true) : "")) : "";
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 40% 30%, var(--face-hi), var(--panel-top))",
        border: "2px solid var(--panel-raised)",
      }}
      aria-hidden
    >
      {look ? (
        shown && (
          // biome-ignore lint/performance/noImgElement: a data URL drawn here
          <img alt="" src={shown} className="w-full h-full" draggable={false} />
        )
      ) : (
        <span className="title" style={{ color: "var(--amber)", fontSize: size * 0.5 }}>
          V
        </span>
      )}
    </span>
  );
}
