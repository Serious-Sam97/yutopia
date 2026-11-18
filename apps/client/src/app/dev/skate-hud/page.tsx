"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SkateHud, SkateHudState } from "@/world/skate/hud";

// The skate HUD's bench (docs/plan/104-the-skate-again.md F7b): the HUD of world/skate/hud.ts over a plain ground,
// driven by made-up states — a combo growing, a grind's needle swinging, a manual's, a landing counted into the
// score, a bail, a gap, the special lit, fakie, off the board. Dev only (or NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//   /dev/skate-hud

const TRICKS = [
  "Ollie",
  "Kickflip",
  "50-50",
  "Manual",
  "Indy 360",
  "Boardslide",
  "Heelflip",
  "Nosegrind",
  "Revert",
  "Madonna",
  "5-0",
  "Varial Kickflip",
];

type Sim = {
  names: string[];
  base: number;
  bal: SkateHudState["bal"];
  score: number;
  best: number;
  special: number;
  lit: boolean;
  fakie: boolean;
  swing: "grind" | "manual" | "lip" | null;
  off: boolean;
};

export default function SkateHudBench() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const hudRef = useRef<SkateHud | null>(null);
  const sim = useRef<Sim>({
    names: [],
    base: 0,
    bal: undefined,
    score: 12_450,
    best: 48_210,
    special: 0.35,
    lit: false,
    fakie: false,
    swing: null,
    off: false,
  });
  const [, redraw] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    void import("@/world/skate/hud").then(({ SkateHud }) => {
      if (!alive) return;
      const hud = new SkateHud();
      hudRef.current = hud;
      const t0 = performance.now();
      const frame = () => {
        const s = sim.current;
        const t = (performance.now() - t0) / 1000;
        // a needle that drifts like a pendulum, growing
        if (s.swing) s.bal = { kind: s.swing, v: Math.sin(t * 2.1) * 0.55 + Math.sin(t * 5.3) * 0.25 };
        else s.bal = undefined;
        if (s.swing && s.names.length) s.base += 3; // a grind's points pile up
        if (s.lit) {
          s.special = Math.max(0, s.special - 1 / (15 * 60));
          if (s.special <= 0) s.lit = false;
        }
        hud.show({
          combo: s.names.length ? { names: s.names, base: s.base, mult: s.names.length } : null,
          bal: s.bal,
          score: s.score,
          best: s.best,
          special: s.special,
          lit: s.lit,
          fakie: s.fakie,
        });
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      hud.note("Your board's over there — walk to it");
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      hudRef.current?.dispose();
      hudRef.current = null;
    };
  }, []);

  const s = sim.current;
  const add = (name?: string) => addTrick(s, name);
  const land = () => landCombo(s, hudRef.current);
  const bail = () => bailCombo(s, hudRef.current);

  // the demo: a line, landed, another, bailed
  useEffect(() => {
    if (!auto) return;
    const s = sim.current;
    const add = (name?: string) => addTrick(s, name);
    const steps: (() => void)[] = [
      () => add("Ollie"),
      () => add("Kickflip"),
      () => {
        add("50-50");
        s.swing = "grind";
      },
      () => {},
      () => {
        s.swing = "manual";
        add("Manual");
      },
      () => {
        s.swing = null;
        add("Indy 360");
      },
      () => hudRef.current?.gap("Hall Hip Transfer", 250),
      () => landCombo(s, hudRef.current),
      () => {},
      () => {
        s.fakie = true;
        add("Heelflip");
      },
      () => {
        add("Boardslide");
        s.swing = "grind";
      },
      () => {},
      () => bailCombo(s, hudRef.current),
      () => {
        s.fakie = false;
      },
    ];
    let i = 0;
    const id = setInterval(() => {
      steps[i % steps.length]();
      i++;
      redraw((n) => n + 1);
    }, 900);
    return () => clearInterval(id);
  }, [auto]);

  const btn = (label: string, fn: () => void) => (
    <button
      type="button"
      onClick={() => {
        fn();
        redraw((n) => n + 1);
      }}
      style={{
        padding: "6px 10px",
        border: "1px solid #555",
        borderRadius: 4,
        background: "#1d1f22",
        color: "#ddd",
        font: "12px system-ui, sans-serif",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        // a plain stand-in for the park: a grey concrete floor under a dim hall
        background:
          "linear-gradient(#4a4f55 0%, #6b7076 46%, #8d8a82 47%, #a19c90 100%), repeating-linear-gradient(90deg, transparent 0 120px, rgba(0,0,0,.06) 120px 122px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          right: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          maxWidth: 560,
          zIndex: 50,
        }}
      >
        {btn(auto ? "Stop demo" : "Play demo", () => setAuto((a) => !a))}
        {btn("+ trick", () => add())}
        {btn("+ 6 tricks", () => {
          for (let i = 0; i < 6; i++) add();
        })}
        {btn(s.swing === "grind" ? "Grind off" : "Grind", () => {
          if (!s.names.length) add("50-50");
          s.swing = s.swing === "grind" ? null : "grind";
        })}
        {btn(s.swing === "manual" ? "Manual off" : "Manual", () => {
          if (!s.names.length) add("Manual");
          s.swing = s.swing === "manual" ? null : "manual";
        })}
        {btn(s.swing === "lip" ? "Lip off" : "Lip", () => {
          if (!s.names.length) add("Rock to Fakie");
          s.swing = s.swing === "lip" ? null : "lip";
        })}
        {btn("Rename last (spin)", () => {
          if (!s.names.length) return;
          s.names = [...s.names.slice(0, -1), `540 ${s.names[s.names.length - 1].replace(/^\d+ /, "")}`];
        })}
        {btn("Land", land)}
        {btn("Bail", bail)}
        {btn("Gap", () => hudRef.current?.gap("Hall Hip Transfer", 250))}
        {btn("Gap ×2", () => {
          hudRef.current?.gap("Over the Stairs", 100);
          hudRef.current?.gap("Kinked Rail", 500);
        })}
        {btn("Special full", () => {
          s.special = 1;
          s.lit = true;
        })}
        {btn(`Fakie: ${s.fakie ? "on" : "off"}`, () => {
          s.fakie = !s.fakie;
        })}
        {btn("Note", () => hudRef.current?.note("Your board's over there — walk to it"))}
        {btn(s.off ? "On the board" : "Off the board", () => {
          s.off = !s.off;
          hudRef.current?.hidden(s.off);
        })}
      </div>
    </main>
  );
}

function addTrick(s: Sim, name?: string) {
  s.names = [...s.names, name ?? TRICKS[s.names.length % TRICKS.length]];
  s.base += [100, 50, 300, 750, 125, 200][s.names.length % 6];
}

function landCombo(s: Sim, hud: SkateHud | null) {
  if (!s.names.length) return;
  const pot = s.base * s.names.length;
  hud?.landed(pot);
  s.score += pot;
  s.best = Math.max(s.best, pot);
  s.special = Math.min(1, s.special + pot / 3000);
  if (s.special >= 1) s.lit = true;
  s.names = [];
  s.base = 0;
  s.swing = null;
}

function bailCombo(s: Sim, hud: SkateHud | null) {
  hud?.bailed(s.base * Math.max(1, s.names.length));
  s.names = [];
  s.base = 0;
  s.swing = null;
  s.special = 0;
  s.lit = false;
}
