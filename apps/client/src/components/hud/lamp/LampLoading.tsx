"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n";

// The loading screen, GTA's (docs/plan/125-the-new-ui.md phase 9, design/ui-life/r2/f-loading.png): a frame of the
// town full-bleed, the name, a tip, "loading the town" with a spinner and a thin gold bar.
const FRAMES = ["dusk", "day", "night"];
const TIPS: [string, string][] = [
  [
    "Hold Tab for your hands — let go to take what it points at.",
    "Segure Tab para as mãos — solte para pegar o que ela aponta.",
  ],
  ["Esc opens the map, your pack, pets and settings.", "Esc abre o mapa, a mochila, os pets e os ajustes."],
  ["Press I for your case: drag things to fit, R turns them.", "Aperte I para a maleta: arraste para caber, R gira."],
  [
    "Click a place on the map to set a waypoint — the gold line leads you.",
    "Clique num lugar do mapa para marcar o destino — a linha dourada te leva.",
  ],
  [
    "Cold out there: get indoors or by a fire before your warmth runs out.",
    "Frio lá fora: entre ou fique perto do fogo antes do calor acabar.",
  ],
];

export function LampLoading({ msg, progress, solid }: { msg: string; progress: number; solid: boolean }) {
  const t = useTr();
  const pt = t("hallway") === "Corredor";
  const [n] = useState(() => Math.floor(Math.random() * 1000));
  const [tip, setTip] = useState(n % TIPS.length);
  useEffect(() => {
    const id = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 6000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="lamp absolute inset-0" data-lamp-loading="">
      {solid && (
        <div
          className="absolute inset-0"
          style={{
            background: `url(/lamp/town-${FRAMES[n % FRAMES.length]}.jpg) center / cover`,
            filter: "saturate(1.12) contrast(1.12) brightness(.95)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%,transparent 50%,rgba(0,0,0,.6)),linear-gradient(0deg,rgba(6,7,9,.9) 0,rgba(6,7,9,.2) 30%,transparent 50%)",
        }}
      />
      <div className="lamp-film" />
      <div className="absolute" style={{ left: 70, bottom: 120, width: 620 }}>
        <div
          style={{
            font: "italic 900 70px/.9 var(--f-sans)",
            letterSpacing: "-.03em",
            textShadow: "0 4px 0 rgba(0,0,0,.4)",
          }}
        >
          YUTOPIA
        </div>
        <div
          style={{
            marginTop: 18,
            background: "rgba(0,0,0,.6)",
            borderLeft: "3px solid var(--l-gold)",
            padding: "12px 16px",
            font: "500 15.5px/1.5 var(--f-sans)",
          }}
        >
          <b style={{ color: "var(--l-gold)", letterSpacing: ".12em", fontSize: 12 }}>{pt ? "DICA" : "TIP"}</b>
          <br />
          {TIPS[tip][pt ? 1 : 0]}
        </div>
      </div>
      <div className="absolute l-sh" style={{ right: 70, bottom: 52, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ font: "400 26px/1 var(--f-num)", letterSpacing: ".05em" }}>{msg}</div>
          {solid && (
            <div style={{ font: "600 13px/1.4 var(--f-sans)", color: "var(--l-soft)" }}>
              {Math.round(progress * 100)}%
            </div>
          )}
        </div>
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          aria-hidden="true"
          style={{ animation: "lamp-spin 1.1s linear infinite" }}
        >
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="4" />
          <path d="M22 4 A18 18 0 1 1 6.4 31" fill="none" stroke="#f3d27a" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      {solid && (
        <div
          className="absolute"
          style={{ left: 0, right: 0, bottom: 0, height: 4, background: "rgba(255,255,255,.1)" }}
        >
          <i
            style={{
              display: "block",
              width: `${Math.round(progress * 100)}%`,
              height: "100%",
              background: "var(--l-gold)",
              boxShadow: "0 0 10px rgba(243,215,140,.8)",
              transition: "width .3s",
            }}
          />
        </div>
      )}
    </div>
  );
}
