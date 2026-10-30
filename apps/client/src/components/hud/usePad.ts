"use client";

import { useEffect, useRef } from "react";
import { activePad } from "@/world/pads";

// A pad read once a frame while something's open (docs/plan/56-the-controls.md phase 6: the
// wheels, the lift's panel, pool and pong on a pad): each button's press and release this frame,
// the sticks past their deadzone. On the first frame what's down was down already (the button
// that opened it), not a press.

export interface PadFrame {
  pressed(i: number): boolean;
  released(i: number): boolean;
  held(i: number): boolean;
  left: { x: number; y: number };
  right: { x: number; y: number };
}

const DEAD = 0.2;
const stick = (x: number, y: number) => (Math.hypot(x, y) < DEAD ? { x: 0, y: 0 } : { x, y });

export function usePadFrame(fn: (f: PadFrame) => void, on = true): void {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let was: boolean[] | null = null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = activePad();
      if (!p) {
        was = null;
        return;
      }
      const now = p.buttons.map((b, i) => (i === 6 || i === 7 ? b.value > 0.4 : b.pressed));
      const prev = was ?? now;
      was = now;
      cb.current({
        pressed: (i) => !!now[i] && !prev[i],
        released: (i) => !now[i] && !!prev[i],
        held: (i) => !!now[i],
        left: stick(p.axes[0] ?? 0, p.axes[1] ?? 0),
        right: stick(p.axes[2] ?? 0, p.axes[3] ?? 0),
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}
