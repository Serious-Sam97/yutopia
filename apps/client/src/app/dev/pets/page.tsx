"use client";

import {
  BREED_COAT,
  BREEDS,
  DEFAULT_OUTFIT,
  type PetLook,
  type PetOutfit,
  SPECIES,
  SPECIES_DEFS,
  type Species,
} from "@yutopia/shared/pets";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePets } from "@/components/usePets";
import type { BodyMood, Face3, PoseKind } from "@/world/art/pets3d";

// Dev-only review sheet for the pet models (docs/plan/14-pets-v2.md): every
// species on a turntable, in each pose, with a few looks and outfits; and the
// iso sprites the world draws, in the 8 facings.
const POSES: PoseKind[] = [
  "idle",
  "walk",
  "sit",
  "sleep",
  "jump",
  "roll",
  "speak",
  "highfive",
  "dance",
  "pounce",
  "eat",
  "pet",
  "battle",
  "attack",
  "defend",
  "ko",
  "scratch",
  "pant",
  "groom",
  "stretch",
  "twitch",
  "binky",
  "slide",
  "shake",
  "yawn",
  "flat",
  "preen",
  "wing",
  "beg",
  "nudge",
  "sniff",
  "lie",
  "playbow",
  "tilt",
  "sniffground",
];
const FACES: Face3[] = ["open", "happy", "closed", "angry", "sad", "surprised", "sleepy", "excited", "scared", "smug"];
const OUTFITS: Partial<PetOutfit>[] = [
  {},
  { hat: "cap", collar: "collar" },
  { hat: "crown", collar: "bell", coat: "sweater" },
  { hat: "party", collar: "bandana", coat: "raincoat" },
  { hat: "beanie", collar: "bowtie", coat: "cape" },
  { hat: "tophat", collar: "scarf", coat: "hoodie" },
  { hat: "bow", coat: "jersey" },
  { hat: "fedora", collar: "collar" },
];
// a platypus with its parts coloured apart from the coat, in a fedora
const PARTS_LOOK: PetLook = {
  color: "#1fb2a6",
  mark: "none",
  markColor: "#2a2420",
  breed: "young",
  parts: { bill: "#f0a040", feet: "#f0a040", tail: "#e8a33d" },
  eyeColor: "#2a2420",
};

function Turn({
  species,
  look,
  outfit,
  pose,
  face,
  t,
  yaw,
  size = 180,
  mood,
  speed,
}: {
  species: Species;
  look: PetLook;
  outfit: PetOutfit;
  pose: PoseKind;
  face: Face3;
  t: number;
  yaw: number;
  size?: number;
  mood?: BodyMood;
  speed?: number;
}) {
  const P = usePets();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!P || !c) return;
    P.petRenderer().turntable(c, species, look, outfit, yaw, { kind: pose, t, face, mood, speed });
  }, [P, species, look, outfit, pose, face, t, yaw, mood, speed]);
  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size, background: "#6f5a48", borderRadius: 8 }}
    />
  );
}

function Iso({ species, look, outfit, pose }: { species: Species; look: PetLook; outfit: PetOutfit; pose: PoseKind }) {
  const P = usePets();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!P || !c) return;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.clearRect(0, 0, c.width, c.height);
    for (let d = 0; d < 8; d++) {
      const act =
        pose === "idle" || pose === "walk" || pose === "sleep"
          ? ""
          : `trick:${pose === "sit" ? "sit" : pose === "jump" ? "jump" : "dance"}`;
      const sp = P.petRenderer().sprite(
        species,
        look,
        outfit,
        d,
        { a: pose === "walk" ? 1 : pose === "sleep" ? 2 : 0, mode: "follow", act, actAt: 0, feeling: "happy" },
        1000,
      );
      if (sp) g.drawImage(sp.canvas, d * 110, 0, sp.canvas.width * 0.55, sp.canvas.height * 0.55);
    }
  }, [P, species, look, outfit, pose]);
  return <canvas ref={ref} width={880} height={120} style={{ background: "#8a6d52", borderRadius: 8 }} />;
}

export default function PetsSheet() {
  if (process.env.NODE_ENV === "production") notFound();
  const [pose, setPose] = useState<PoseKind>("idle");
  const [face, setFace] = useState<Face3>("happy");
  const [t, setT] = useState(0.25);
  const [yaw, setYaw] = useState(-0.8);
  const [fit, setFit] = useState(0);
  return (
    <main className="p-4 text-[#efe4cc]" style={{ background: "#2a1c13", minHeight: "100vh" }}>
      <h1 className="text-lg mb-2">Pets — review sheet</h1>
      <div className="flex flex-wrap gap-2 mb-4 items-center text-sm">
        <select value={pose} onChange={(e) => setPose(e.target.value as PoseKind)} className="field">
          {POSES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={face} onChange={(e) => setFace(e.target.value as Face3)} className="field">
          {FACES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label>
          t <input type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))} />
        </label>
        <label>
          yaw{" "}
          <input
            type="range"
            min={-3.14}
            max={3.14}
            step={0.05}
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
        </label>
        <label>
          outfit{" "}
          <input
            type="range"
            min={0}
            max={OUTFITS.length - 1}
            step={1}
            value={fit}
            onChange={(e) => setFit(Number(e.target.value))}
          />
        </label>
      </div>
      <section className="mb-6">
        <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
          parts + fedora
        </h2>
        <div className="flex gap-2 flex-wrap items-start">
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
            <Turn
              key={a}
              species="platypus"
              look={PARTS_LOOK}
              outfit={{ ...DEFAULT_OUTFIT, hat: "fedora", hatColor: "#5b3a26" }}
              pose={pose}
              face={face}
              t={t}
              yaw={yaw + a}
            />
          ))}
          <Turn
            species="dog"
            look={{
              ...PARTS_LOOK,
              breed: "golden",
              color: "#d9a349",
              parts: { belly: "#efe4cc", ears: "#1fb2a6", feet: "#2a2420" },
              eyeColor: "#4a7fb5",
            }}
            outfit={{ ...DEFAULT_OUTFIT, hat: "fedora" }}
            pose={pose}
            face={face}
            t={t}
            yaw={yaw}
          />
        </div>
      </section>
      <PlanTwo />
      {(["dog", "cat"] as const).map((sp) => (
        <section key={`breeds-${sp}`} className="mb-6">
          <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
            {sp} breeds
          </h2>
          <div className="flex gap-2 flex-wrap items-start">
            {BREEDS[sp].map((b) => (
              <div key={b} className="flex flex-col items-center gap-1">
                <Turn
                  species={sp}
                  look={{
                    color: BREED_COAT[b] ?? SPECIES_DEFS[sp].colors[0],
                    mark: "none",
                    markColor: "#2a2420",
                    breed: b,
                  }}
                  outfit={DEFAULT_OUTFIT}
                  pose={pose}
                  face={face}
                  t={t}
                  yaw={yaw}
                  size={160}
                />
                <span className="mono text-[10px] uppercase" style={{ color: "#c9b28a" }}>
                  {b}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {SPECIES.map((sp) => {
        const def = SPECIES_DEFS[sp];
        const look: PetLook = {
          color: def.colors[0],
          mark: def.marks[1] ?? "none",
          markColor: "#2a2420",
          breed: BREEDS[sp][0],
        };
        const outfit: PetOutfit = { ...DEFAULT_OUTFIT, ...OUTFITS[fit] };
        return (
          <section key={sp} className="mb-6">
            <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
              {def.label}
            </h2>
            <div className="flex gap-2 flex-wrap items-start">
              <Turn species={sp} look={look} outfit={outfit} pose={pose} face={face} t={t} yaw={yaw} size={220} />
              <Turn species={sp} look={look} outfit={outfit} pose={pose} face={face} t={t} yaw={yaw + Math.PI / 2} />
              <Turn species={sp} look={look} outfit={outfit} pose={pose} face={face} t={t} yaw={yaw + Math.PI} />
              <Turn
                species={sp}
                look={{ ...look, color: def.colors[1] ?? look.color, mark: "none" }}
                outfit={outfit}
                pose="idle"
                face="open"
                t={0}
                yaw={0}
              />
            </div>
            <div className="mt-2">
              <Iso species={sp} look={look} outfit={outfit} pose={pose} />
            </div>
          </section>
        );
      })}
    </main>
  );
}

// docs/plan/52-the-pet-two.md D4–D5: the 12 dogs side on, a strip of each gait, the moods, the new poses.
// Each section's `data-shot` names its still (e2e/pets-sheet-shots.mts).
const GOLDEN: PetLook = { color: "#d9a349", mark: "none", markColor: "#efe4cc", breed: "golden" };
const GAITS: [string, number][] = [
  ["walk", 1.2],
  ["trot", 4.2],
  ["gallop", 7],
];
const MOODS: BodyMood[] = ["", "happy", "bored", "scared", "sulk", "alert"];
const NEW_POSES: PoseKind[] = ["lie", "playbow", "tilt", "sniffground", "shake", "sit"];
function PlanTwo() {
  const label = (s: string) => (
    <span className="mono text-[10px] uppercase" style={{ color: "#c9b28a" }}>
      {s}
    </span>
  );
  return (
    <>
      <section className="mb-6" data-shot="breeds">
        <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
          the 12 dogs, side on (plan 52)
        </h2>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(6, 160px)" }}>
          {BREEDS.dog.map((b) => (
            <div key={b} className="flex flex-col items-center gap-1">
              <Turn
                species="dog"
                look={{
                  color: BREED_COAT[b] ?? SPECIES_DEFS.dog.colors[0],
                  mark: "none",
                  markColor: "#2a2420",
                  breed: b,
                }}
                outfit={DEFAULT_OUTFIT}
                pose="idle"
                face="open"
                t={0.25}
                yaw={-0.35}
                size={160}
              />
              {label(b)}
            </div>
          ))}
        </div>
      </section>
      <section className="mb-6" data-shot="gaits">
        <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
          gaits: a cycle in six (plan 52)
        </h2>
        {GAITS.map(([name, speed]) => (
          <div key={name} className="flex gap-1 items-center mb-1">
            <div className="w-16">{label(`${name} ${speed}`)}</div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Turn
                key={i}
                species="dog"
                look={GOLDEN}
                outfit={DEFAULT_OUTFIT}
                pose="walk"
                face="happy"
                t={i / 6}
                yaw={0}
                size={130}
                speed={speed}
              />
            ))}
          </div>
        ))}
      </section>
      <section className="mb-6" data-shot="moods">
        <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
          moods, standing and trotting (plan 52)
        </h2>
        {(["idle", "walk"] as const).map((pose) => (
          <div key={pose} className="flex gap-2 items-start mb-1">
            {MOODS.map((m) => (
              <div key={m || "none"} className="flex flex-col items-center gap-1">
                <Turn
                  species="dog"
                  look={{ color: "#5b3a26", mark: "none", markColor: "#efe4cc", breed: "beagle" }}
                  outfit={DEFAULT_OUTFIT}
                  pose={pose}
                  face="open"
                  t={0.3}
                  yaw={-0.5}
                  size={150}
                  mood={m}
                  speed={pose === "walk" ? 3.5 : undefined}
                />
                {label(m || "(feeling)")}
              </div>
            ))}
          </div>
        ))}
      </section>
      <section className="mb-6" data-shot="poses">
        <h2 className="mono text-xs uppercase mb-1" style={{ color: "#c9b28a" }}>
          new poses (plan 52)
        </h2>
        <div className="flex gap-2 items-start">
          {NEW_POSES.map((p) => (
            <div key={p} className="flex flex-col items-center gap-1">
              <Turn
                species="dog"
                look={GOLDEN}
                outfit={DEFAULT_OUTFIT}
                pose={p}
                face="happy"
                t={0.4}
                yaw={-0.6}
                size={150}
              />
              {label(p)}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
