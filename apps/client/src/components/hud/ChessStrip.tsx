"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";

// Chess at the table (docs/plan/70-the-chess.md, phase 2): no modal — the board is the screen. A narrow
// strip in the manuscript-in-wood look (plan 45: ink in a walnut frame): the two players, whose move it
// is, the moves so far, a promotion asked, a draw offered, resign (held), Vortex to play, get up. Under
// it, sat at the table, the pointer is the board's (world/chess: hover, pick, send; the wheel steps
// out, right-drag turns a little round it), and so are the keys.

const CSS = `
.cst{position:absolute;right:18px;top:18px;width:310px;background:var(--panel);color:var(--cream);border:5px solid var(--walnut);
 box-shadow:inset 0 0 0 1px var(--walnut-deep),0 6px 18px color-mix(in srgb, var(--bg) 70%, transparent);border-radius:3px;padding:12px 14px;
 font-family:'Special Elite',ui-monospace,monospace;font-size:12.5px;pointer-events:auto}
.cst-row{display:flex;align-items:center;gap:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;letter-spacing:.12em;text-transform:uppercase;flex-wrap:wrap}
.cst-side{display:flex;align-items:center;gap:7px}.cst-side em{font-style:normal;font-family:'Special Elite',monospace;font-size:10px;letter-spacing:.05em;color:var(--amber);text-transform:none}
.cst-dot{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid var(--edge)}.cst-dot.w{background:var(--cream)}.cst-dot.b{background:var(--graphite)}
.cst-to{outline:1px solid var(--amber);outline-offset:2px}
.cst-zig{height:6px;margin:8px 0 7px;background:linear-gradient(135deg,transparent 33%,var(--teak) 33% 50%,transparent 50%) 0 0/8px 6px,linear-gradient(45deg,transparent 33%,var(--teak) 33% 50%,transparent 50%) 0 0/8px 6px;opacity:.7}
.cst-turn{color:var(--amber);margin-bottom:4px}.cst-moves{color:var(--cream-dim);margin-bottom:10px;min-height:1em}.cst-moves b{color:var(--cream);font-weight:normal}
.cst-acts{display:flex;gap:6px;flex-wrap:wrap}
.cst-btn{border:1px solid var(--teak);padding:3px 7px;border-radius:2px;color:var(--cream);background:var(--panel-2);cursor:pointer;font:inherit}
.cst-btn:hover{background:var(--walnut-deep)}.cst-btn.on{color:var(--amber);border-color:var(--amber)}
.cst-btn small{color:var(--muted)}
.cst-hold{position:relative;overflow:hidden}.cst-hold i{position:absolute;inset:0;background:var(--rust);transform-origin:left;transform:scaleX(var(--k,0));opacity:.6}
.cst-hold span{position:relative}
.cst-keys{margin-top:9px;color:var(--muted);font-size:10.5px;line-height:1.35}
`;

const LEVELS = ["easy", "medium", "hard", "turbo"] as const;
const LEVEL_KEY = { easy: "chessEasy", medium: "chessMedium", hard: "chessHard", turbo: "chessTurbo" } as const;

export function ChessStrip(_: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const c = useHud((s) => s.chess);
  const chess = () => w?.chess ?? null;
  const [cuts, setCuts] = useState(() => w?.chess?.cuts ?? true);
  const [vxOpen, setVxOpen] = useState(false);
  const [hold, setHold] = useState(0);
  const holdT = useRef<number | null>(null);
  const drag = useRef<{ x: number } | null>(null);

  // the keys at the table: the board's while I'm at it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (chess()?.key(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!c) return null;
  const n = c.moves.length;
  const shown = c.moves.slice(-6);
  const first = n - shown.length;
  const name = (side: "w" | "b") =>
    c.vortex[side] ? (
      <>
        Vortex <em>{t(LEVEL_KEY[c.vortex[side] as keyof typeof LEVEL_KEY] ?? "chessMedium")}</em>
      </>
    ) : (
      <>
        {c.names[side] || t("chessEmpty")}
        {c.side === side ? <em>{t("chessYou")}</em> : null}
      </>
    );
  const sideName = (side: "w" | "b") =>
    c.vortex[side] ? "Vortex" : c.names[side] || (side === "w" ? t("chessWhite") : t("chessBlack"));
  const over = !["play", "check"].includes(c.state);
  const line = over
    ? c.state === "resign"
      ? `${sideName(c.loser ?? "w")} ${t("chessResigns")} — ${sideName(c.loser === "w" ? "b" : "w")} ${t("chessWins")}`
      : c.state === "mate"
        ? `${t("chessMate")} ${sideName(c.loser === "w" ? "b" : "w")} ${t("chessWins")}`
        : c.state === "agreed"
          ? t("chessAgreed")
          : t("chessDraw")
    : c.promo
      ? `${t("chessPromote")}…`
      : c.picked
        ? `${c.picked} — ${t("chessPick")}`
        : c.side === null
          ? `${t("chessWatching")} · ${c.turn === "w" ? t("chessWhite") : t("chessBlack")} ${t("chessToMove")}`
          : `${c.myTurn ? t("chessYourMove") : t("chessTheirMove")}${c.state === "check" ? ` — ${t("chessCheck")}` : ""}`;
  const offerMine = c.offer && c.offer === c.side;
  const offerTheirs = c.offer && c.side && c.offer !== c.side;

  const startHold = () => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1000);
      setHold(k);
      if (k >= 1) {
        chess()?.resign();
        setHold(0);
        holdT.current = null;
        return;
      }
      holdT.current = requestAnimationFrame(step);
    };
    holdT.current = requestAnimationFrame(step);
  };
  const stopHold = () => {
    if (holdT.current) cancelAnimationFrame(holdT.current);
    holdT.current = null;
    setHold(0);
  };

  return (
    <>
      <style>{CSS}</style>
      {/* the pointer on the board, sat at the table */}
      {c.side ? (
        <div
          role="application"
          aria-label={t("chessTitle")}
          className="fixed inset-0 pointer-events-auto touch-none"
          style={{ cursor: c.myTurn ? "pointer" : "default" }}
          onPointerMove={(e) => {
            if (drag.current && e.buttons & 2) {
              chess()?.turn((e.clientX - drag.current.x) * -0.006);
              drag.current = { x: e.clientX };
              return;
            }
            chess()?.pointer("move", e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            if (e.button === 2) {
              drag.current = { x: e.clientX };
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            chess()?.pointer("down", e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => chess()?.zoom(e.deltaY > 0 ? 1 : -1)}
        />
      ) : null}
      <section className="cst" aria-label={t("chessTitle")}>
        <div className="cst-row">
          <span className={`cst-side${c.turn === "w" && !over ? " cst-to" : ""}`}>
            <i className="cst-dot w" />
            {name("w")}
          </span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span className={`cst-side${c.turn === "b" && !over ? " cst-to" : ""}`}>
            <i className="cst-dot b" />
            {name("b")}
          </span>
        </div>
        <div className="cst-zig" />
        <div className="cst-turn" aria-live="polite">
          {line}
        </div>
        {offerTheirs ? (
          <div className="cst-turn">
            {sideName(c.offer as "w" | "b")} {t("chessDrawOffered")}
          </div>
        ) : null}
        <div className="cst-moves">
          {shown.map((m, i) => {
            const ply = first + i;
            return (
              <span key={ply}>
                {ply % 2 === 0 ? `${ply / 2 + 1}. ` : i === 0 ? `${Math.floor(ply / 2) + 1}. … ` : ""}
                {ply === n - 1 ? <b>{m}</b> : m}{" "}
              </span>
            );
          })}
        </div>
        {c.promo ? (
          <div className="cst-acts" style={{ marginBottom: 8 }}>
            {(
              [
                ["q", "chessQueen"],
                ["r", "chessRook"],
                ["b", "chessBishop"],
                ["n", "chessKnight"],
              ] as const
            ).map(([k, key], i) => (
              <button key={k} type="button" className="cst-btn on" onClick={() => chess()?.promote(k)}>
                {t(key)} <small>{i + 1}</small>
              </button>
            ))}
          </div>
        ) : null}
        <div className="cst-acts">
          {c.side && !over ? (
            offerTheirs ? (
              <button type="button" className="cst-btn on" onClick={() => chess()?.draw(true)}>
                {t("chessAcceptDraw")}
              </button>
            ) : (
              <button type="button" className="cst-btn" onClick={() => chess()?.draw(!offerMine)}>
                {offerMine ? t("chessTakeBack") : t("chessOfferDraw")}
              </button>
            )
          ) : null}
          {c.side && !over && n > 0 ? (
            <button
              type="button"
              className="cst-btn cst-hold"
              style={{ ["--k" as string]: hold }}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
            >
              <i />
              <span>{t("chessResign")}</span>
            </button>
          ) : null}
          {c.side && (over || n === 0) ? (
            <button type="button" className="cst-btn" onClick={() => chess()?.newGame()}>
              {t("chessNew")}
            </button>
          ) : null}
          {c.canVortex ? (
            <button type="button" className={`cst-btn${vxOpen ? " on" : ""}`} onClick={() => setVxOpen((o) => !o)}>
              {t("chessPlayVortex")}
            </button>
          ) : null}
          {c.side && (c.vortex.w || c.vortex.b) ? (
            <button type="button" className="cst-btn" onClick={() => chess()?.vortex(null)}>
              {t("chessVortexGo")}
            </button>
          ) : null}
          <button
            type="button"
            className={`cst-btn${cuts ? " on" : ""}`}
            onClick={() => {
              chess()?.setCuts(!cuts);
              setCuts(!cuts);
            }}
          >
            {t("chessCuts")}
          </button>
          <button type="button" className="cst-btn" onClick={() => chess()?.standUp()}>
            {t("chessGetUp")} <small>Q</small>
          </button>
        </div>
        {vxOpen && c.canVortex ? (
          <div className="cst-acts" style={{ marginTop: 8 }}>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className="cst-btn on"
                onClick={() => {
                  chess()?.vortex(l);
                  setVxOpen(false);
                }}
              >
                {t(LEVEL_KEY[l])}
              </button>
            ))}
          </div>
        ) : null}
        {c.side ? <div className="cst-keys">{t("chessKeys")}</div> : null}
      </section>
    </>
  );
}
