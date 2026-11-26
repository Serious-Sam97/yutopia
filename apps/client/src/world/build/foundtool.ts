import type { ClientMessages } from "@yutopia/shared";
import { entry, footprint, quarterYaw } from "@yutopia/shared";
import { inRing, padsOf, poolsOf, type Structure, type XY } from "@yutopia/shared/structure";
import type { PolyGhost } from "../model";

// Build mode's Foundation part (docs/plan/130-the-house-build.md, phase 5 — F3b): on a lot's ground storey, a box
// dragged lays a foundation's pad (its sides the panel's, the foundation's height the panel's — the house goes up to
// it); Remove takes the pad clicked away; Steps puts a flight of steps from the land up to it, by the pad's edge
// clicked near; Dig digs a basement under the box dragged (a basement storey there first: the floor menu).

export interface FoundHost {
  structure(): Structure | null;
  level(): number;
  mode(): "box" | "remove" | "steps" | "dig" | "pool";
  /** (plan 130 phase 11) the pool's settings, and its message */
  pool(): { depth: number; tile: string; coping: string; ladder: number; lights: boolean };
  sendPool(m: ClientMessages["struct:pool"]): void;
  style(): string;
  height(): number;
  send(m: ClientMessages["struct:found"]): void;
  dig(m: ClientMessages["struct:dig"]): void;
  put(m: ClientMessages["obj:put"]): void;
  show(polys: PolyGhost[]): void;
}

const snap = (v: number) => Math.round(v * 2) / 2;

export class FoundTool {
  private from: XY | null = null;
  constructor(private h: FoundHost) {}

  private box(x: number, y: number): XY[] | null {
    if (!this.from) return null;
    const [ax, ay] = this.from;
    const [bx, by] = [snap(x), snap(y)];
    if (Math.abs(bx - ax) < 1 || Math.abs(by - ay) < 1) return null;
    return [
      [Math.min(ax, bx), Math.min(ay, by)],
      [Math.max(ax, bx), Math.min(ay, by)],
      [Math.max(ax, bx), Math.max(ay, by)],
      [Math.min(ax, bx), Math.max(ay, by)],
    ];
  }
  /** A pad's edge near (x, y) outside it: where steps go, which way out. */
  private edgeNear(x: number, y: number): { at: XY; n: XY } | null {
    const st = this.h.structure();
    if (!st) return null;
    let best: { at: XY; n: XY; d: number } | null = null;
    for (const p of padsOf(st, this.h.level())) {
      const xs = p.ring.map((q) => q[0]);
      const ys = p.ring.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const cx = Math.max(x0 + 0.5, Math.min(x1 - 0.5, x));
      const cy = Math.max(y0 + 0.5, Math.min(y1 - 0.5, y));
      for (const [at, n] of [
        [
          [cx, y0],
          [0, -1],
        ],
        [
          [cx, y1],
          [0, 1],
        ],
        [
          [x0, cy],
          [-1, 0],
        ],
        [
          [x1, cy],
          [1, 0],
        ],
      ] as [XY, XY][]) {
        const d = Math.hypot(at[0] - x, at[1] - y);
        const outside = (x - at[0]) * n[0] + (y - at[1]) * n[1] > -0.2;
        if (outside && d < 3 && (!best || d < best.d)) best = { at, n, d };
      }
    }
    return best && { at: best.at, n: best.n };
  }
  /** The steps' placement by an edge: its quarter turn (its top to the pad), its corner on the tiles. */
  private steps(e: { at: XY; n: XY }): { x: number; y: number; q: number } {
    // (a flight climbs along its own +y: into the pad, against the edge's outward normal)
    const q = e.n[1] < 0 ? 0 : e.n[0] > 0 ? 1 : e.n[1] > 0 ? 2 : 3;
    const { w, h } = footprint("flight", q);
    const mid: XY = [e.at[0] + e.n[0] * 1.5, e.at[1] + e.n[1] * 1.5];
    return { x: Math.round(mid[0] - w / 2), y: Math.round(mid[1] - h / 2), q };
  }

  hover(x: number, y: number) {
    const m = this.h.mode();
    if (m === "box" || m === "dig" || m === "pool") {
      const b = this.box(x, y);
      this.h.show(b ? [{ pts: b, ok: true, closed: true, remove: m === "dig" }] : []);
      return;
    }
    const st = this.h.structure();
    if (m === "remove") {
      const p = st
        ? (poolsOf(st, this.h.level()).find((q) => inRing(q.ring, x, y)) ??
          padsOf(st, this.h.level()).find((q) => inRing(q.ring, x, y)))
        : null;
      this.h.show(p ? [{ pts: p.ring, ok: true, closed: true, remove: true }] : []);
      return;
    }
    const e = this.edgeNear(x, y);
    if (!e) return this.h.show([]);
    const s = this.steps(e);
    const { w, h } = footprint("flight", s.q);
    this.h.show([
      {
        pts: [
          [s.x, s.y],
          [s.x + w, s.y],
          [s.x + w, s.y + h],
          [s.x, s.y + h],
        ],
        ok: true,
        closed: true,
      },
    ]);
  }
  down(x: number, y: number) {
    const m = this.h.mode();
    if (m === "box" || m === "dig" || m === "pool") this.from = [snap(x), snap(y)];
  }
  up(x: number, y: number) {
    const m = this.h.mode();
    const level = this.h.level();
    if (m === "box" || m === "dig" || m === "pool") {
      const b = this.box(x, y);
      this.from = null;
      this.h.show([]);
      if (!b) return;
      if (m === "box") this.h.send({ level, a: b[0], b: b[2], style: this.h.style(), height: this.h.height() });
      else if (m === "pool") this.h.sendPool({ level, add: { a: b[0], b: b[2], ...this.h.pool() } });
      else this.h.dig({ level, a: b[0], b: b[2] });
      return;
    }
    if (m === "remove") {
      // (a pool clicked: filled in; else the pad)
      const st = this.h.structure();
      const pool = st ? poolsOf(st, level).find((q) => inRing(q.ring, x, y)) : null;
      if (pool) return this.h.sendPool({ level, remove: pool.id });
      return this.h.send({ level, remove: [x, y] });
    }
    const e = this.edgeNear(x, y);
    const found = this.h.structure()?.floors.find((f) => f.index === level)?.found ?? 0;
    if (!e || !found) return;
    const s = this.steps(e);
    void entry;
    this.h.put({ kind: "flight", x: s.x, y: s.y, yaw: quarterYaw(s.q), props: { level, rise: found } });
  }
}
