"use client";

import type { AvatarLayers } from "@yutopia/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { flatFigure } from "./flatFigure";
import { useChars } from "./useChars";

// Turntable preview of an avatar (lobby, editor, person card): the same 3D
// model the world shows (world/chars), turning slowly on its stand and alive —
// breathing, blinking, walking with `walk`. Just the stand while the 3D
// people load; the vector drawing where WebGL can't draw (or only on the CPU).

export function AvatarCanvas({
  avatar,
  size = 160,
  spin = true,
  walk = false,
}: {
  avatar: AvatarLayers;
  size?: number;
  spin?: boolean;
  walk?: boolean;
}) {
  const C = useChars();
  const ref = useRef<HTMLCanvasElement>(null);
  const [gl, setGl] = useState(true); // false: WebGL couldn't draw it (the drawing instead)
  const look = JSON.stringify(avatar);
  const px = typeof window === "undefined" ? 2 : Math.min(2, window.devicePixelRatio || 1);
  const a = useMemo(() => JSON.parse(look) as AvatarLayers, [look]);
  useEffect(() => {
    const c = ref.current;
    if (!C || !c || !gl) return;
    if (!C.pictures().canDraw()) return setGl(false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motion = new C.Motion3(0.37);
    // (plan 58: the new animations, so the look's walk — 4e — is the one shown, at the walk's pace)
    motion.gait = a.gait ?? "calm";
    const pace = 1.5;
    const pics = C.pictures();
    let raf = 0;
    const t0 = performance.now();
    let last = t0 - 1000;
    const draw = (now: number) => {
      // at most 30 a second, none while the tab is away
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < 31) return;
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const going = walk && !reduced;
      const mo = motion.update(dt, {
        dist: going ? pace * dt : 0,
        walking: going,
        speed: going ? pace : 0,
        loco: {
          ahead: going ? pace : 0,
          left: 0,
          crouch: false,
          aim: false,
          pitch: 0,
          yaw: 0,
          turn: 0,
          accel: 0,
          up: false,
          verb: null,
          goal: pace,
        },
        sit: false,
        typing: false,
        speaking: false,
        emote: "",
        reduced,
      });
      // a three-quarter view, turning slowly
      const yaw = 0.55 + (spin && !reduced ? t * 0.55 : 0);
      if (!pics.turntable(c, a, yaw, mo)) {
        // (the life look: their clothes' files still coming — drawn once they're in, 5.6; only without
        // WebGL the drawing instead)
        if (pics.lifeLook() && pics.canDraw()) {
          void pics.whenReady(a);
          return;
        }
        cancelAnimationFrame(raf);
        setGl(false);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [C, a, spin, walk, gl]);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        position: "relative",
      }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          bottom: size * 0.02,
          width: size * 0.5,
          height: size * 0.1,
          borderRadius: "50%",
          background: "var(--walnut-dark)",
          boxShadow: "0 0 0 2px var(--lamp-ring)",
        }}
      />
      {!gl ? (
        <AvatarDrawing avatar={a} size={size} spin={spin} walk={walk} />
      ) : C ? (
        <canvas
          ref={ref}
          width={Math.round(size * px)}
          height={Math.round(size * px)}
          style={{ position: "relative", width: size, height: size }}
          data-avatar-3d
        />
      ) : (
        <span style={{ width: size, height: size }} />
      )}
    </div>
  );
}

// Without WebGL: them drawn flat in their colours (flatFigure; the paper people retired, plan 72
// phase 12) — standing still, whatever the turntable would do.
function AvatarDrawing({ avatar, size }: { avatar: AvatarLayers; size: number; spin: boolean; walk: boolean }) {
  const src = useMemo(() => flatFigure(avatar), [avatar]);
  const w = (size * 64) / 100;
  return (
    // biome-ignore lint/performance/noImgElement: generated SVG data URI, nothing for next/image to optimise
    <img src={src} alt="" width={w * 0.94} height={size * 0.94} style={{ position: "relative" }} draggable={false} />
  );
}
