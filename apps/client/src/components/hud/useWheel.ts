"use client";

import { useEffect, useRef, useState } from "react";
import { usePadFrame } from "./usePad";

// A wheel held open (docs/plan/56-the-controls.md phase 6: the emotes', the pets'): `n` slices
// round the middle of the screen, clockwise from the top. The one chosen by where it's pointed —
// the pointer (a panel gives the mouse back), the arrows or WASD, a pad's stick (the right one,
// else the left). Letting go of the key or the pad's button that holds it open does the chosen
// one; letting go in the middle, or Esc, nothing.

const DEAD = 34; // px from the middle: nothing chosen
const DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** The slice (of `n`, clockwise from the top) a way (screen x right, y down) points at. */
export function sliceOf(n: number, dx: number, dy: number): number {
  const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / ((Math.PI * 2) / n)) % n;
}

export function useWheel(
  n: number,
  o: {
    /** the key (code) that holds it open */
    keyCode: string;
    /** the pad's button that holds it open, when it was opened on the pad */
    padButton?: number;
    done(i: number | null): void;
    cancel(): void;
  },
) {
  const [hot, setHot] = useState<number | null>(null);
  const hotRef = useRef<number | null>(null);
  hotRef.current = hot;
  const pointer = useRef({ x: 0, y: 0 });
  const opts = useRef(o);
  opts.current = o;

  useEffect(() => {
    const held = new Set<string>();
    const fromKeys = () => {
      let x = 0;
      let y = 0;
      for (const c of held) {
        x += DIRS[c][0];
        y += DIRS[c][1];
      }
      if (x || y) setHot(sliceOf(n, x, y));
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const dx = e.clientX - window.innerWidth / 2;
      const dy = e.clientY - window.innerHeight / 2;
      setHot(Math.hypot(dx, dy) < DEAD ? null : sliceOf(n, dx, dy));
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") return opts.current.cancel();
      if (DIRS[e.code]) {
        e.preventDefault();
        held.add(e.code);
        fromKeys();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      held.delete(e.code);
      if (e.code === opts.current.keyCode) opts.current.done(hotRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [n]);

  usePadFrame((f) => {
    const s = Math.hypot(f.right.x, f.right.y) > 0.5 ? f.right : f.left;
    if (Math.hypot(s.x, s.y) > 0.5) setHot(sliceOf(n, s.x, s.y));
    const b = opts.current.padButton;
    if (b !== undefined && f.released(b)) opts.current.done(hotRef.current);
    if (f.pressed(1)) opts.current.cancel();
  });

  return { hot, setHot, pointer };
}
