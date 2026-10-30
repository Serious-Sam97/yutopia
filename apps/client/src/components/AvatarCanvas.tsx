"use client";

import type { AvatarLayers } from "@yutopia/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { View } from "@/world/art/avatar-svg";
import { useChars } from "./useChars";
import { usePeople } from "./usePeople";

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
    if (!C.isoPeople().canDraw()) return setGl(false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motion = new C.Motion3(0.37);
    // (plan 58: the new animations, so the look's walk — 4e — is the one shown, at the walk's pace)
    motion.v2 = true;
    motion.gait = a.gait ?? "calm";
    const pace = 1.5;
    const iso = C.isoPeople();
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
      if (!iso.turntable(c, a, yaw, mo)) {
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

// The vector drawing on a turntable (8 views, mirrored), as people were drawn before 3D.
const TURN: [View, boolean][] = [
  ["S", false],
  ["SW", false],
  ["W", false],
  ["NW", false],
  ["N", false],
  ["NW", true],
  ["W", true],
  ["SW", true],
];

function AvatarDrawing({
  avatar,
  size,
  spin,
  walk,
}: {
  avatar: AvatarLayers;
  size: number;
  spin: boolean;
  walk: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!spin && !walk) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const i = setInterval(() => setTick((t) => t + 1), walk ? 70 : 1200);
    return () => clearInterval(i);
  }, [spin, walk]);
  // walking: the rig's walk, 8 steps a cycle (1–8; 0 is standing still)
  const dir = spin ? (walk ? Math.floor(tick / 16) : tick) % 8 : 0;
  const frame = walk ? 1 + (tick % 8) : 0;
  const [view, mirror] = TURN[dir];
  // the drawing loads with the people chunk (only the stand shows until then)
  const P = usePeople();
  const src = useMemo(
    () =>
      P ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(P.avatarSvg(avatar, view, frame, false, 2))}` : "",
    [P, avatar, view, frame],
  );
  const w = (size * 64) / 100;
  return src ? (
    // biome-ignore lint/performance/noImgElement: generated SVG data URI, nothing for next/image to optimise
    <img
      src={src}
      alt=""
      width={w * 0.94}
      height={size * 0.94}
      style={{ position: "relative", transform: mirror ? "scaleX(-1)" : undefined, imageRendering: "auto" }}
      draggable={false}
    />
  ) : (
    <span style={{ width: w * 0.94, height: size * 0.94 }} />
  );
}
