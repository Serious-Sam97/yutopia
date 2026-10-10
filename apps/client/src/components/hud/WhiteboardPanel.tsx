"use client";

import { WB_H, WB_MAX_POINTS, WB_W, type WbItem } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

type Tool = "pen" | "marker" | "note" | "text" | "eraser";
const INKS = ["#2a2420", "#b5562f", "#3d4a5c", "#6e7b3a", "#e8a33d"];
const NOTES = ["#f3d27a", "#f1b9a0", "#c9d6a3", "#bcd3e0"];
const rid = () => Math.random().toString(36).slice(2, 10);

// Shared whiteboard. Everyone at the board sees strokes as they land; the scene
// is saved with the object, and the wall shows a miniature.
export function WhiteboardPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const w = useWorld();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<WbItem[]>(() => w?.whiteboardItems(objectId) ?? []);
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState(INKS[0]);
  const drawing = useRef<number[] | null>(null);
  const mine = useRef<string[]>([]);

  useEffect(() => {
    if (!w) return;
    w.send("wb:get", { objectId });
    return w.onWhiteboard((id, next) => {
      if (id === objectId) setItems([...next]);
    });
  }, [w, objectId]);

  // paint
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = WB_W * dpr;
    c.height = WB_H * dpr;
    const x = c.getContext("2d") as CanvasRenderingContext2D;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = "#fbf8ef";
    x.fillRect(0, 0, WB_W, WB_H);
    x.strokeStyle = "#ece4d0";
    x.lineWidth = 1;
    for (let gx = 40; gx < WB_W; gx += 40) x.strokeRect(gx, 0, 0.01, WB_H);
    for (let gy = 40; gy < WB_H; gy += 40) x.strokeRect(0, gy, WB_W, 0.01);
    const all = drawing.current
      ? [...items, { id: "_", k: "stroke" as const, c: ink, w: tool === "marker" ? 22 : 3, p: drawing.current }]
      : items;
    for (const it of all) {
      if (it.k === "stroke") {
        x.globalAlpha = it.w > 12 ? 0.35 : 1;
        x.strokeStyle = it.c;
        x.lineWidth = it.w;
        x.lineCap = "round";
        x.lineJoin = "round";
        x.beginPath();
        x.moveTo(it.p[0], it.p[1]);
        for (let i = 2; i < it.p.length; i += 2) x.lineTo(it.p[i], it.p[i + 1]);
        if (it.p.length === 2) x.lineTo(it.p[0] + 0.1, it.p[1]);
        x.stroke();
        x.globalAlpha = 1;
      } else if (it.k === "note") {
        x.fillStyle = it.c;
        x.shadowColor = "#0003";
        x.shadowBlur = 6;
        x.fillRect(it.x, it.y, 120, 80);
        x.shadowBlur = 0;
        x.fillStyle = "#2a2420";
        x.font = "14px Inter, sans-serif";
        wrap(x, it.text, it.x + 8, it.y + 20, 104, 17, 4);
      } else {
        x.fillStyle = it.c;
        x.font = "bold 20px 'Permanent Marker', Inter, sans-serif";
        x.fillText(it.text, it.x, it.y + 18);
      }
    }
  }, [items, ink, tool]);

  const pos = (e: React.PointerEvent) => {
    const r = (canvas.current as HTMLCanvasElement).getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * WB_W), Math.round(((e.clientY - r.top) / r.height) * WB_H)];
  };
  const add = (item: WbItem) => {
    mine.current.push(item.id);
    w?.send("wb:op", { objectId, op: { t: "add", item } });
  };

  const onDown = (e: React.PointerEvent) => {
    const [px, py] = pos(e);
    if (tool === "pen" || tool === "marker") {
      (e.target as Element).setPointerCapture(e.pointerId);
      drawing.current = [px, py];
      setItems((x) => [...x]);
    } else if (tool === "note" || tool === "text") {
      const text = window.prompt(tool === "note" ? "Sticky note" : "Text")?.trim();
      if (text)
        add({
          id: rid(),
          k: tool,
          c: tool === "note" ? NOTES[Math.floor(Math.random() * NOTES.length)] : ink,
          x: px,
          y: py,
          text: text.slice(0, 280),
        });
    } else {
      const hit = [...items].reverse().find((it) => hitTest(it, px, py));
      if (hit) w?.send("wb:op", { objectId, op: { t: "del", id: hit.id } });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const [px, py] = pos(e);
    const p = drawing.current;
    if (Math.hypot(px - p[p.length - 2], py - p[p.length - 1]) < 3 || p.length >= WB_MAX_POINTS * 2) return;
    p.push(px, py);
    setItems((x) => [...x]);
  };
  const onUp = () => {
    const p = drawing.current;
    drawing.current = null;
    if (p) add({ id: rid(), k: "stroke", c: ink, w: tool === "marker" ? 22 : 3, p });
  };
  const undo = () => {
    const id = mine.current.pop();
    if (id) w?.send("wb:op", { objectId, op: { t: "del", id } });
  };

  return (
    <Panel title={t("whiteboard")} wide>
      <div className="flex flex-col h-full gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["pen", "marker", "note", "text", "eraser"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="deck-btn"
              aria-pressed={tool === k}
              onClick={() => setTool(k)}
              style={{ height: 36 }}
            >
              {{ pen: "✒ Pen", marker: "🖍 Marker", note: "🗒 Note", text: "T Text", eraser: "⌫ Erase" }[k]}
            </button>
          ))}
          <span className="w-px h-7 mx-1" style={{ background: "var(--edge)" }} />
          {INKS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={ink === c}
              onClick={() => setInk(c)}
              className="h-8 w-8 rounded-full border-2"
              style={{ background: c, borderColor: ink === c ? "var(--amber)" : "#0006" }}
            />
          ))}
          <span className="ml-auto flex gap-1.5">
            <button type="button" className="ghost-btn" onClick={undo}>
              ↶ Undo
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                if (window.confirm("Clear the whole board for everyone?"))
                  w?.send("wb:op", { objectId, op: { t: "clear" } });
              }}
            >
              Clear
            </button>
          </span>
        </div>
        <div
          className="flex-1 min-h-0 flex items-center justify-center rounded-lg p-2"
          style={{ background: "#b9b2a3" }}
        >
          <canvas
            ref={canvas}
            className="max-w-full max-h-full rounded shadow-lg touch-none"
            style={{
              aspectRatio: `${WB_W} / ${WB_H}`,
              width: "100%",
              cursor: tool === "eraser" ? "not-allowed" : "crosshair",
            }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            aria-label="Whiteboard canvas"
          />
        </div>
      </div>
    </Panel>
  );
}

function hitTest(it: WbItem, x: number, y: number) {
  if (it.k === "note") return x >= it.x && x <= it.x + 120 && y >= it.y && y <= it.y + 80;
  if (it.k === "text") return x >= it.x && x <= it.x + it.text.length * 11 && y >= it.y && y <= it.y + 24;
  for (let i = 0; i < it.p.length; i += 2) if (Math.hypot(it.p[i] - x, it.p[i + 1] - y) < it.w / 2 + 6) return true;
  return false;
}

function wrap(
  x: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  width: number,
  lh: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let n = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (x.measureText(test).width > width && line) {
      x.fillText(line, left, top + n * lh);
      line = word;
      if (++n >= maxLines) return;
    } else line = test;
  }
  if (line) x.fillText(line, left, top + n * lh);
}
