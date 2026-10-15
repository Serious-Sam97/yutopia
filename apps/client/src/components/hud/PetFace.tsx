"use client";

import type { PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import { useEffect, useMemo, useRef } from "react";
import type { Face3, PoseKind } from "@/world/art/pets3d";
import { usePets } from "../usePets";

// A pet's portrait and its live model on a turntable: the same 3D model the
// world shows (art/pets3d.ts), rendered by the pets chunk's renderer.

const portraits = new Map<string, string | null>();

export function PetFace({
  species,
  look,
  outfit,
  face = "happy",
  size = 32,
}: {
  species: Species;
  look: PetLook;
  outfit: PetOutfit;
  face?: Face3;
  size?: number;
}) {
  const P = usePets();
  const src = useMemo(() => {
    if (!P) return null;
    const key = `${species}|${JSON.stringify(look)}|${JSON.stringify(outfit)}|${face}`;
    if (!portraits.has(key)) portraits.set(key, P.petRenderer().portrait(species, look, outfit, face, 128));
    return portraits.get(key) ?? null;
  }, [P, species, look, outfit, face]);
  if (!src)
    return <span className="rounded-full block" style={{ width: size, height: size, background: look.color }} />;
  // biome-ignore lint/performance/noImgElement: rendered picture
  return <img alt="" src={src} width={size} height={size} draggable={false} style={{ width: size, height: size }} />;
}

// The pet turning slowly on a stand (a canvas drawn every frame while shown).
export function PetTurntable({
  species,
  look,
  outfit,
  face = "happy",
  pose = "idle",
  size = 160,
  spin = true,
  className,
}: {
  species: Species;
  look: PetLook;
  outfit: PetOutfit;
  face?: Face3;
  pose?: PoseKind;
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  const P = usePets();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!P || !c) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      P.petRenderer().turntable(c, species, look, outfit, -Math.PI / 2 + 0.6 + (spin ? t * 0.6 : 0), {
        kind: pose,
        t: (t % 3.2) / 3.2,
        face,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [P, species, look, outfit, face, pose, spin]);
  return (
    <canvas ref={ref} width={size * 2} height={size * 2} className={className} style={{ width: size, height: size }} />
  );
}
