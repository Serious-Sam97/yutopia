"use client";

import { HELD, isHeld } from "@yutopia/shared";
import { legalMoves, outcome, parseFen, START, sqName } from "@yutopia/shared/games68/chess";
import { prizesOf } from "@yutopia/shared/games68/claw";
import { DARTS_A_TURN, dartLands, dartWobble } from "@yutopia/shared/games68/darts";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { dartAt, drawClaw, drawDartboard, drawFoos, drawHockey, foosView, hockeyView } from "@/world/games68/draw";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// The small games' panels (docs/plan/68-more-furniture.md, phases 21–25): chess at the chess table,
// darts at the board, the claw machine, and air hockey / foosball (one panel, the table's game).
// What the room keeps (a chess game, the darts in the board) is the thing's props, read as it changes.

/** The thing's props, as the room has them now (re-read four times a second). */
function useProps(objectId: string): Record<string, unknown> {
  const w = useWorld();
  const [props, setProps] = useState<Record<string, unknown>>(() => w?.model?.getObject(objectId)?.props ?? {});
  useEffect(() => {
    const i = setInterval(() => {
      const p = w?.model?.getObject(objectId)?.props ?? {};
      setProps((was) => (JSON.stringify(was) === JSON.stringify(p) ? was : p));
    }, 250);
    return () => clearInterval(i);
  }, [w, objectId]);
  return props;
}

// (the filled set for both sides, white's cream with an ink edge: the hollow set faded on the light
// squares; U+FE0E keeps the pawn from turning into an emoji)
/** The table's position (a start's when it has none, or one that won't read). */
const safeFen = (fen: unknown) => {
  try {
    return parseFen(typeof fen === "string" ? fen : START);
  } catch {
    return parseFen(START);
  }
};

const GLYPH: Record<string, string> = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
  P: "♟\uFE0E",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟\uFE0E",
};

export function ChessPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const props = useProps(objectId);
  const [pick, setPick] = useState<number | null>(null);
  const me = w?.myUid?.() ?? -1;
  const pos = safeFen(props.fen);
  const mine = props.w === me ? "w" : props.b === me ? "b" : null;
  const flip = mine === "b";
  const moves = mine === pos.turn && !props.over ? legalMoves(pos) : [];
  const targets = pick === null ? [] : moves.filter((m) => m.from === pick).map((m) => m.to);
  const last = (props.last as number[] | undefined) ?? [];
  const end = props.over ? String(props.over) : outcome(pos);
  const click = (s: number) => {
    if (pick !== null && targets.includes(s)) {
      w?.send("chess:move", { id: objectId, from: pick, to: s, promo: "q" });
      setPick(null);
    } else setPick(moves.some((m) => m.from === s) ? s : null);
  };
  const seat = (side: "w" | "b") => {
    const uid = props[side];
    const name = String(props[`${side}n`] ?? "");
    return (
      <button
        type="button"
        className="ghost-btn flex items-center justify-between gap-3"
        onClick={() => w?.send("chess:sit", { id: objectId, side: uid === me ? null : side })}
      >
        <span>{side === "w" ? t("chessWhite") : t("chessBlack")}</span>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          {uid === me ? t("chessYou") : uid ? name : t("chessSit")}
        </span>
      </button>
    );
  };
  return (
    <Panel title={t("chessTitle")}>
      <div className="p-4 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          {seat("w")}
          {seat("b")}
        </div>
        <div
          className="grid grid-cols-8 grid-rows-8 aspect-square w-full max-w-[420px] mx-auto rounded-md overflow-hidden"
          style={{ border: "2px solid var(--edge-strong)" }}
        >
          {Array.from({ length: 64 }, (_, i) => {
            const s = flip ? 63 - i : i;
            const dark = (Math.floor(s / 8) + (s % 8)) % 2 === 1;
            const c = pos.board[s];
            const on = pick === s || last.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-label={`${sqName(s)} ${c || ""}`}
                onClick={() => click(s)}
                className="grid place-items-center min-h-0 text-[min(5.5vw,38px)] leading-none relative"
                style={{
                  background: on ? "var(--amber-lo)" : dark ? "var(--walnut)" : "var(--paper)",
                  color: c && c === c.toUpperCase() ? "var(--cream)" : "var(--ink)",
                  WebkitTextStroke: c && c === c.toUpperCase() ? "1.2px var(--ink)" : undefined,
                  paintOrder: "stroke fill",
                }}
              >
                {c ? GLYPH[c] : ""}
                {targets.includes(s) && (
                  <span
                    className="absolute w-3 h-3 rounded-full"
                    style={{ background: "var(--amber)", opacity: 0.8 }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>
            {end === "mate"
              ? t("chessMate")
              : end === "play" || end === "check"
                ? `${pos.turn === "w" ? t("chessWhite") : t("chessBlack")} ${t("chessToMove")}${end === "check" ? ` — ${t("chessCheck")}` : ""}`
                : t("chessDraw")}
          </span>
          <button type="button" className="deck-btn" onClick={() => w?.send("chess:new", { id: objectId })}>
            {t("chessNew")}
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function DartsPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const props = useProps(objectId);
  const ref = useRef<HTMLCanvasElement>(null);
  const aim = useRef<[number, number] | null>(null);
  const since = useRef(performance.now());
  const SIZE = 360;
  const darts = (props.darts as [number, number][] | undefined) ?? [];
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const g = ref.current?.getContext("2d");
      if (g) {
        const a = aim.current;
        const wob = dartWobble((performance.now() - since.current) / 1000);
        drawDartboard(g, SIZE, darts, a ? [a[0] + wob[0], a[1] + wob[1]] : null);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
  const turn = props.turn as { name: string; total: number; n: number } | undefined;
  const best = props.best as { name: string; score: number } | undefined;
  return (
    <Panel title={t("dartsTitle")}>
      <div className="p-4 grid gap-3 justify-items-center">
        <canvas
          ref={ref}
          width={SIZE}
          height={SIZE}
          className="rounded-full cursor-crosshair max-w-full"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            aim.current = dartAt(
              SIZE,
              ((e.clientX - r.left) / r.width) * SIZE,
              ((e.clientY - r.top) / r.height) * SIZE,
            );
          }}
          onPointerEnter={() => {
            since.current = performance.now();
          }}
          onPointerLeave={() => {
            aim.current = null;
          }}
          onClick={() => {
            const a = aim.current;
            if (!a) return;
            const wob = dartWobble((performance.now() - since.current) / 1000);
            const [x, y] = dartLands(a[0], a[1], wob, Math.random(), Math.random());
            w?.send("darts:throw", { id: objectId, x, y });
            since.current = performance.now();
          }}
        />
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          {t("dartsHint")}
        </p>
        <div className="flex gap-4 text-sm mono">
          {turn && (
            <span>
              {turn.name}: {turn.total} ({turn.n}/{DARTS_A_TURN})
            </span>
          )}
          {best && (
            <span style={{ color: "var(--amber)" }}>
              {t("dartsBest")} {best.score} — {best.name}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function ClawPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const props = useProps(objectId);
  const ref = useRef<HTMLCanvasElement>(null);
  const claw = useRef<[number, number]>([0.5, 0.5]);
  const [down, setDown] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [left, setLeft] = useState(20);
  const SIZE = 320;
  const prizes = prizesOf(objectId, Number(props.won) || 0);
  useEffect(() => {
    const off = w?.onGame?.("claw:result", (m: { id: string; toy: string | null }) => {
      if (m.id !== objectId) return;
      setResult(m.toy ? (isHeld(m.toy) ? HELD[m.toy].label : m.toy) : "");
    });
    return () => off?.();
  }, [w, objectId]);
  useEffect(() => {
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => keys.add(e.key);
    const ku = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    let raf = 0;
    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const c = claw.current;
      const v = 0.45 * dt;
      if (keys.has("ArrowLeft") || keys.has("a")) c[0] -= v;
      if (keys.has("ArrowRight") || keys.has("d")) c[0] += v;
      if (keys.has("ArrowUp") || keys.has("w")) c[1] -= v;
      if (keys.has("ArrowDown") || keys.has("s")) c[1] += v;
      c[0] = Math.max(0.06, Math.min(0.94, c[0]));
      c[1] = Math.max(0.06, Math.min(0.94, c[1]));
      const g = ref.current?.getContext("2d");
      if (g) drawClaw(g, SIZE, prizes, c, down);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  });
  useEffect(() => {
    if (down || result !== null) return;
    const i = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(i);
  }, [down, result]);
  const drop = () => {
    if (down) return;
    setDown(1);
    setTimeout(() => w?.send("claw:drop", { id: objectId, x: claw.current[0], z: claw.current[1] }), 700);
    // (no answer — the connection dropped: the claw comes back up empty)
    setTimeout(() => setResult((r) => r ?? ""), 6000);
  };
  useEffect(() => {
    if (left === 0) drop();
  });
  return (
    <Panel title={t("clawTitle")}>
      <div className="p-4 grid gap-3 justify-items-center">
        <canvas
          ref={ref}
          width={SIZE}
          height={SIZE}
          className="rounded-md max-w-full"
          onPointerMove={(e) => {
            if (down) return;
            const r = e.currentTarget.getBoundingClientRect();
            claw.current = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
          }}
        />
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          {result === null ? `${t("clawHint")} · ${left}s` : result ? `${t("clawWon")} ${result}!` : t("clawMissed")}
        </p>
        <div className="flex gap-2">
          {result === null ? (
            <button type="button" className="deck-btn" disabled={!!down} onClick={drop}>
              {t("clawDrop")}
            </button>
          ) : (
            <button
              type="button"
              className="deck-btn"
              onClick={() => {
                setResult(null);
                setDown(0);
                setLeft(20);
              }}
            >
              {t("clawAgain")}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

interface TgState {
  id: string;
  kind: "hockey" | "foosball";
  side: number;
  names: [string, string];
  running: boolean;
  s: number[];
  score: [number, number];
}

export function TableGamePanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const ref = useRef<HTMLCanvasElement>(null);
  const [st, setSt] = useState<TgState | null>(null);
  const stRef = useRef<TgState | null>(null);
  const W = 380;
  const H = 560;
  useEffect(() => {
    const off = w?.onGame?.("tg:state", (m: TgState) => {
      if (m.id !== objectId) return;
      stRef.current = m;
      setSt((was) =>
        was && was.running === m.running && was.score.join() === m.score.join() && was.names.join() === m.names.join()
          ? was
          : m,
      );
    });
    w?.send("tg:join", { id: objectId });
    return () => {
      off?.();
      w?.send("tg:leave", { id: objectId });
    };
  }, [w, objectId]);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const g = ref.current?.getContext("2d");
      const s = stRef.current;
      if (g && s) (s.kind === "hockey" ? drawHockey : drawFoos)(g, W, H, s.s, s.side);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const sentAt = useRef(0);
  const input = (px: number, py: number, kick = false) => {
    const s = stRef.current;
    if (!s) return;
    const now = performance.now();
    if (!kick && now - sentAt.current < 33) return;
    sentAt.current = now;
    if (s.kind === "hockey") {
      const [x, y] = hockeyView(W, H, s.side).from(px, py);
      w?.send("tg:input", { id: objectId, x, y });
    } else {
      const v = foosView(W, H, s.side);
      const [x] = v.from(px, py);
      // (across the pitch: the rods slid from −1 to 1)
      const k = (x / 0.68) * 2 - 1;
      w?.send("tg:input", { id: objectId, x: s.side === 0 ? k : k, y: 0, kick });
    }
  };
  const mine = st?.side ?? 0;
  return (
    <Panel title={st?.kind === "foosball" ? t("foosTitle") : t("hockeyTitle")}>
      <div className="p-4 grid gap-2 justify-items-center">
        <div className="flex gap-4 text-sm mono">
          <span style={{ color: "var(--hot)" }}>
            {st?.names[mine] || t("chessYou")} {st?.score[mine] ?? 0}
          </span>
          <span>—</span>
          <span>
            {st?.score[1 - mine] ?? 0} {st?.names[1 - mine] || t("tgWaiting")}
          </span>
        </div>
        <canvas
          ref={ref}
          width={W}
          height={H}
          className="rounded-md max-w-full cursor-none"
          // (the whole table on the screen, however short: both goals in sight)
          style={{ maxHeight: "calc(100dvh - 250px)", width: "auto", height: "auto" }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            input(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
          }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            input(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, true);
          }}
        />
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          {!st?.running && st?.names.every(Boolean)
            ? t("tgOver")
            : st?.kind === "foosball"
              ? t("foosHint")
              : t("hockeyHint")}
        </p>
      </div>
    </Panel>
  );
}
