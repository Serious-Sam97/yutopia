"use client";

import { useEffect, useMemo, useRef } from "react";
import { asset } from "@/lib/asset";
import { trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";

// GTA V's weapon wheel (docs/plan/125-the-new-ui.md phase 4, F4a — design/ui-life/r2/f-wheel.png): Tab held, the
// mouse points at a kind, Tab let go takes it (keys 1–8 too). Eight kinds, each a white picture made from the real
// item's (public/life/items), its rounds; the one pointed at lit warm with a gold arc, in its own colours; GTA's
// numbers in the corner; the world greyed behind, snow hanging in the air. Time doesn't slow (other people are in
// the world): it only looks still.

const KINDS: { en: string; pt: string; ids: string[] }[] = [
  { en: "Left hand", pt: "Mão esquerda", ids: [] }, // whatever's in it
  { en: "Pistol", pt: "Pistola", ids: ["revolver"] },
  { en: "Shotgun", pt: "Espingarda", ids: ["shotgun"] },
  { en: "Rifle", pt: "Fuzil", ids: ["ak47", "sniper"] },
  { en: "Heavy", pt: "Pesada", ids: ["daybreak"] },
  { en: "Throwable", pt: "Arremesso", ids: ["flare"] },
  { en: "Melee", pt: "Corpo a corpo", ids: [] },
  { en: "Unarmed", pt: "Desarmado", ids: [] },
];
// GTA's four numbers (out of 100): how hard, how fast, how true, how far
const STATS: Record<string, [number, number, number, number]> = {
  revolver: [70, 35, 72, 55],
  shotgun: [90, 22, 46, 34],
  ak47: [55, 85, 55, 70],
  sniper: [96, 10, 95, 100],
  daybreak: [100, 15, 60, 62],
};
const AMMO: Record<string, string> = {
  revolver: "r38",
  shotgun: "shell",
  ak47: "r762",
  sniper: "r308",
  daybreak: "cell",
};

export function LampWheel() {
  const t = useTr();
  const open = useHud((s) => s.lamp.wheel);
  const sel = useHud((s) => s.lamp.wheelSel);
  const lamp = useHud((s) => s.lamp);
  const pt = t("hallway") === "Corredor";
  const acc = useRef({ x: 0, y: 0 });
  // the mouse (the pointer's locked: by how far it moves) points at a kind, GTA's way
  useEffect(() => {
    if (!open) return;
    acc.current = { x: 0, y: 0 };
    const on = (e: MouseEvent) => {
      // (Chrome's stray jump around a pointer lock's change — hundreds of px in one event — isn't a point)
      if (Math.abs(e.movementX) > 150 || Math.abs(e.movementY) > 150) return;
      const a = acc.current;
      a.x = Math.max(-120, Math.min(120, a.x + e.movementX));
      a.y = Math.max(-120, Math.min(120, a.y + e.movementY));
      if (Math.hypot(a.x, a.y) < 28) return;
      const ang = Math.atan2(a.y, a.x) + Math.PI / 2; // 0 at the top, clockwise
      const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
      if (i !== hud.get().lamp.wheelSel) hud.set((s) => ({ lamp: { ...s.lamp, wheelSel: i } }));
    };
    window.addEventListener("mousemove", on);
    return () => window.removeEventListener("mousemove", on);
  }, [open]);
  // snow hanging in the air (a fixed fall: the same flakes each time it opens)
  const snow = useMemo(() => {
    let r = 4242;
    const rnd = () => {
      r = (r * 16807) % 2147483647;
      return r / 2147483647;
    };
    return Array.from({ length: 110 }, () => {
      const near = rnd() < 0.08;
      return {
        x: rnd() * 100,
        y: rnd() * 100,
        s: near ? 10 + rnd() * 14 : 1.5 + rnd() * rnd() * 6,
        b: near ? 4 + rnd() * 4 : rnd() < 0.3 ? 1 + rnd() * 2 : 0,
        o: 0.45 + rnd() * 0.5,
      };
    });
  }, []);
  if (!open) return null;
  const q = lamp.quick;
  const atHand = (id: string) => q.find((it) => it?.id === id) ?? null;
  // what each kind holds now: the first at hand, else carried in the pack (dim), else nothing
  const slots = KINDS.map((k, i) => {
    if (i === 0) {
      const id = lamp.hand.id;
      return id
        ? {
            id,
            ammo: id === "torch" ? `${lamp.vitals.bat}%` : lamp.hand.n > 1 ? `×${lamp.hand.n}` : "",
            dim: false,
            more: 0,
          }
        : null;
    }
    if (i === 5) {
      const n = lamp.counts.flare ?? 0;
      return n ? { id: "flare", ammo: `×${n}`, dim: lamp.hand.id !== "flare", more: 0 } : null;
    }
    const held = k.ids.filter((id) => atHand(id));
    const id = held[0] ?? k.ids.find((x) => (lamp.counts[x] ?? 0) > 0);
    if (!id) return null;
    const it = atHand(id);
    const ammo = it?.loaded !== undefined ? `${it.loaded} | ${lamp.counts[AMMO[id]] ?? 0}` : "";
    return { id, ammo, dim: !it, more: held.length };
  });
  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 720;
  const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 450;
  const R0 = 150;
  const R1 = 300;
  const n = 8;
  const gap = 0.03;
  const pick = slots[sel];
  const pickName =
    sel === 7 ? (pt ? "Desarmado" : "Unarmed") : pick ? (trMaybe(`dark_item_${pick.id}`) ?? pick.id) : "—";
  const stats = pick && STATS[pick.id];
  const pt2 = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  return (
    <div className="absolute inset-0" data-lamp-wheel={sel} style={{ pointerEvents: "none" }}>
      {/* the world greyed and soft behind (only while it's up) */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "grayscale(.55) brightness(.82) blur(2.5px)",
          background:
            "radial-gradient(ellipse 70% 60% at 50% 48%,rgba(255,196,130,.14),transparent 70%),radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(8,6,4,.5) 100%)",
        }}
      />
      {snow.map((f, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: flakes are only places
          key={i}
          className="absolute"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.s,
            height: f.s,
            borderRadius: f.s,
            background: `rgba(255,255,255,${f.o})`,
            filter: f.b ? `blur(${f.b}px)` : undefined,
            boxShadow: `0 0 ${f.s * 2}px rgba(255,255,255,.35)`,
          }}
        />
      ))}
      <svg className="absolute" style={{ left: 0, top: 0, width: "100%", height: "100%" }} aria-hidden="true">
        <defs>
          <radialGradient id="lwSeg" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R1}>
            <stop offset={R0 / R1} stopColor="rgba(6,6,8,.58)" />
            <stop offset="1" stopColor="rgba(20,20,24,.34)" />
          </radialGradient>
          <radialGradient id="lwSel" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R1}>
            <stop offset={R0 / R1} stopColor="rgba(243,215,140,.18)" />
            <stop offset="1" stopColor="rgba(255,244,214,.44)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R1 + 10} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={R0 - 8} fill="rgba(0,0,0,.12)" stroke="rgba(243,215,140,.35)" strokeWidth="1.2" />
        {KINDS.map((k, i) => {
          const a0 = -Math.PI / 2 - Math.PI / n + (i * 2 * Math.PI) / n + gap;
          const a1 = a0 + (2 * Math.PI) / n - 2 * gap;
          const on = i === sel;
          const d = `M${pt2(R0, a0)} L${pt2(R1, a0)} A${R1} ${R1} 0 0 1 ${pt2(R1, a1)} L${pt2(R0, a1)} A${R0} ${R0} 0 0 0 ${pt2(R0, a0)}Z`;
          const arc = `M${pt2(R1 - 4, a0 + 0.01)} A${R1 - 4} ${R1 - 4} 0 0 1 ${pt2(R1 - 4, a1 - 0.01)}`;
          return (
            <g key={k.en}>
              <path
                d={d}
                fill={`url(#${on ? "lwSel" : "lwSeg"})`}
                stroke={on ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.08)"}
              />
              {on && (
                <>
                  <path
                    d={arc}
                    fill="none"
                    stroke="#f3d27a"
                    strokeWidth="10"
                    opacity=".5"
                    style={{ filter: "blur(4px)" }}
                  />
                  <path d={arc} fill="none" stroke="#f3d27a" strokeWidth="6" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {KINDS.map((k, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const mr = (R0 + R1) / 2 + 6;
        const mx = cx + Math.cos(a) * mr;
        const my = cy + Math.sin(a) * mr;
        const lr = R1 + (i === sel ? 50 : 26);
        const s = slots[i];
        const on = i === sel;
        return (
          <div key={k.en}>
            <div
              className="absolute"
              style={{
                left: mx,
                top: my,
                transform: "translate(-50%,-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                opacity: s?.dim ? 0.4 : on ? 1 : 0.8,
              }}
            >
              {i === 7 ? (
                <svg viewBox="0 0 60 50" width="64" height="54" aria-hidden="true">
                  <path
                    d="M10 22 q0 -8 7 -8 h4 q0 -6 6 -6 q5 0 6 5 q1 -5 6 -5 q6 0 6 6 v2 q6 -1 7 5 v14 q0 12 -12 14 h-18 q-12 0 -12 -12z"
                    fill="#fff"
                  />
                </svg>
              ) : s ? (
                // biome-ignore lint/performance/noImgElement: a static picture
                <img
                  src={asset(`/life/items/${s.id}.webp`)}
                  alt=""
                  style={{
                    width: 120,
                    height: 52,
                    objectFit: "contain",
                    filter: on
                      ? "drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 12px rgba(255,226,160,.7)) drop-shadow(0 4px 6px rgba(0,0,0,.8))"
                      : "brightness(0) invert(1) drop-shadow(0 2px 3px rgba(0,0,0,.9))",
                  }}
                />
              ) : (
                <span
                  style={{ font: "400 16px/1 var(--f-num)", letterSpacing: ".14em", color: "rgba(255,255,255,.3)" }}
                >
                  {pt ? "VAZIO" : "EMPTY"}
                </span>
              )}
              {s?.ammo && (
                <span className="l-sh" style={{ font: "400 21px/1 var(--f-num)", color: on ? "#f3d27a" : "#fff" }}>
                  {s.ammo}
                </span>
              )}
              {s?.dim && (
                <span className="l-cap" style={{ color: "#fff" }}>
                  {pt ? "na mochila" : "in the pack"}
                </span>
              )}
            </div>
            <div
              className="absolute l-sh"
              style={{
                left: cx + Math.cos(a) * lr,
                top: cy + Math.sin(a) * lr,
                transform: "translate(-50%,-50%)",
                font: "800 12px/1 var(--f-sans)",
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: on ? "#f3d27a" : "#fff",
                background: `rgba(0,0,0,${on ? 0.6 : 0.42})`,
                padding: "5px 9px",
                borderRadius: 2,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ opacity: 0.6, marginRight: 6 }}>{i + 1}</span>
              {pt ? k.pt : k.en}
            </div>
          </div>
        );
      })}
      {/* the middle: what you'll take */}
      <div
        className="absolute"
        style={{
          left: cx,
          top: cy,
          transform: "translate(-50%,-50%)",
          textAlign: "center",
          width: 250,
          textShadow: "0 0 2px #000, 0 2px 8px rgba(0,0,0,.9)",
        }}
      >
        <div style={{ font: "400 42px/1 var(--f-num)", letterSpacing: ".05em" }}>{pickName}</div>
        {pick?.ammo && (
          <div style={{ font: "400 26px/1 var(--f-num)", color: "#f3d27a", marginTop: 6 }}>{pick.ammo}</div>
        )}
        {pick && (slots[sel]?.more ?? 0) > 1 && (
          <div className="l-cap" style={{ marginTop: 12, color: "#cfc7b4" }}>
            ‹ 1 / {slots[sel]?.more} › · {pt ? "de novo: o próximo" : "again: the next"}
          </div>
        )}
      </div>
      {/* GTA's numbers in the corner */}
      {stats && pick && (
        <div
          className="absolute"
          style={{
            right: 44,
            top: 40,
            width: 340,
            background: "linear-gradient(180deg,rgba(20,16,10,.66),rgba(10,8,6,.58))",
            padding: "16px 18px 18px",
            borderTop: "3px solid #f3d27a",
          }}
        >
          <div style={{ height: 64, display: "grid", placeItems: "center", marginBottom: 8 }}>
            {/* biome-ignore lint/performance/noImgElement: a static picture */}
            <img
              src={asset(`/life/items/${pick.id}.webp`)}
              alt=""
              style={{ maxWidth: 280, maxHeight: 60, objectFit: "contain" }}
            />
          </div>
          <div style={{ font: "400 32px/1 var(--f-num)", letterSpacing: ".04em" }}>{pickName}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
            {(pt ? ["Dano", "Cadência", "Precisão", "Alcance"] : ["Damage", "Fire rate", "Accuracy", "Range"]).map(
              (label, j) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px 1fr",
                    gap: 12,
                    alignItems: "center",
                    font: "700 12px/1 var(--f-sans)",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                  <i style={{ display: "block", height: 9, background: "rgba(255,255,255,.14)", position: "relative" }}>
                    <b
                      style={{
                        position: "absolute",
                        inset: "0 auto 0 0",
                        width: `${stats[j]}%`,
                        background: stats[j] === Math.max(...stats) ? "#f3d27a" : "#fff",
                      }}
                    />
                  </i>
                </div>
              ),
            )}
          </div>
        </div>
      )}
      <div className="absolute l-keys l-sh" style={{ right: 44, bottom: 34 }}>
        <span>
          <span className="l-key">Mouse</span>
          {pt ? "Escolher" : "Pick"}
        </span>
        <span>
          <span className="l-key">1–8</span>
          {pt ? "Tipo" : "Kind"}
        </span>
        <span>
          <span className="l-key">Tab</span>
          {pt ? "Soltar para pegar" : "Let go to take"}
        </span>
      </div>
      <div className="absolute l-keys l-sh" style={{ left: "50%", bottom: 34, transform: "translateX(-50%)" }}>
        {(
          [
            ["P", pt ? "Celular" : "Phone"],
            ["X", "Emote"],
            ["I", pt ? "Mochila" : "Pack"],
            ["B", pt ? "Construir" : "Build"],
          ] as const
        ).map(([k, l]) => (
          <span key={k}>
            <span className="l-key">{k}</span>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
