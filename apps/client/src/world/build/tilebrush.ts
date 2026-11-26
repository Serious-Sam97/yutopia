import type { ClientMessages } from "@yutopia/shared";
import { brushMask, inRing, partTri, type Structure, type TileBrush, tilesOf } from "@yutopia/shared/structure";
import type { PolyGhost } from "../model";

// Build mode's tile brush (docs/plan/130-the-house-build.md, phase 4 — F4a, The Sims' floor tool): over a floor's
// slabs, its tiles painted one at a time as the pointer drags across them — whole, a half, a quarter or a triangle
// (the brush's, by where in the tile the pointer is); Shift paints the room under it, Ctrl Shift the storey; ⌘/Ctrl
// takes the paint off. The tiles under the stroke shown as it goes, sent on the release (one undo step).

export interface TileHost {
  structure(): Structure | null;
  level(): number;
  brush(): TileBrush | "hole";
  over(): number;
  sendHole(m: ClientMessages["struct:hole"]): void;
  mat(): string | null;
  shift(): boolean;
  ctrl(): boolean;
  /** (plan 130 phase 9) Alt held: the eyedropper — the tile's paint picked up */
  alt(): boolean;
  pick(mat: string): void;
  send(m: ClientMessages["struct:tiles"]): void;
  show(polys: PolyGhost[]): void;
}

export class TileBrushTool {
  private stroke = new Map<string, { x: number; y: number; mask: number }>();
  private down_ = false;
  // (the hole tool: the box being dragged, from its first corner — half-metre snapped)
  private from: [number, number] | null = null;
  private holeRing(x: number, y: number): [number, number][] | null {
    if (!this.from) return null;
    const s = (v: number) => Math.round(v * 2) / 2;
    const [ax, ay] = this.from;
    const [bx, by] = [s(x), s(y)];
    if (Math.abs(bx - ax) < 0.5 || Math.abs(by - ay) < 0.5) return null;
    return [
      [Math.min(ax, bx), Math.min(ay, by)],
      [Math.max(ax, bx), Math.min(ay, by)],
      [Math.max(ax, bx), Math.max(ay, by)],
      [Math.min(ax, bx), Math.max(ay, by)],
    ];
  }

  constructor(private h: TileHost) {}

  private cellAt(x: number, y: number): { x: number; y: number; mask: number } {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const b = this.h.brush();
    return { x: tx, y: ty, mask: brushMask(b === "hole" ? "tile" : b, x - tx, y - ty) };
  }
  private add(c: { x: number; y: number; mask: number }) {
    const k = `${c.x},${c.y}`;
    const had = this.stroke.get(k);
    this.stroke.set(k, had ? { ...c, mask: had.mask | c.mask } : c);
  }
  private ghosts(cells: Iterable<{ x: number; y: number; mask: number }>, ok = true): PolyGhost[] {
    const out: PolyGhost[] = [];
    for (const c of cells)
      for (let k = 0; k < 8; k++)
        if (c.mask & (1 << k))
          out.push({
            pts: partTri(k).map(([u, v]): [number, number] => [c.x + u, c.y + v]),
            ok,
            closed: true,
            remove: !this.h.mat(),
          });
    return out;
  }
  /** The room on my floor under (x, y), for Shift. */
  private roomAt(x: number, y: number): string | null {
    const st = this.h.structure();
    const r = st?.rooms.find((q) => q.floor === this.h.level() && inRing(q.outline, x, y));
    return r?.key ?? null;
  }

  hover(x: number, y: number) {
    if (this.h.brush() === "hole") {
      const r = this.holeRing(x, y);
      this.h.show(r ? [{ pts: r, ok: true, closed: true, remove: true }] : []);
      return;
    }
    if (this.down_) {
      this.add(this.cellAt(x, y));
      this.h.show(this.ghosts(this.stroke.values()));
      return;
    }
    if (this.h.shift()) {
      const st = this.h.structure();
      const r = this.h.ctrl() ? null : st?.rooms.find((q) => q.floor === this.h.level() && inRing(q.outline, x, y));
      this.h.show(r ? [{ pts: r.outline, ok: true, closed: true }] : []);
      return;
    }
    this.h.show(this.ghosts([this.cellAt(x, y)]));
  }
  down(x: number, y: number) {
    if (this.h.alt()) {
      const st = this.h.structure();
      const cell = st ? tilesOf(st, this.h.level())[`${Math.floor(x)},${Math.floor(y)}`] : undefined;
      const m = typeof cell === "string" ? cell : cell?.find((q) => q);
      if (m) this.h.pick(m);
      return;
    }
    if (this.h.brush() === "hole") {
      this.from = [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
      return;
    }
    if (this.h.shift()) return;
    this.down_ = true;
    this.stroke.clear();
    this.add(this.cellAt(x, y));
  }
  up(x: number, y: number) {
    const level = this.h.level();
    if (this.h.brush() === "hole") {
      const r = this.holeRing(x, y);
      this.from = null;
      this.h.show([]);
      if (r) this.h.sendHole({ level, ring: r, ...(this.h.over() > 0 ? { over: this.h.over() } : {}) });
      return;
    }
    const mat = this.h.mat();
    if (this.h.shift()) {
      if (this.h.ctrl()) this.h.send({ level, storey: true, mat });
      else {
        const room = this.roomAt(x, y);
        if (room) this.h.send({ level, room, mat });
      }
      return;
    }
    if (!this.down_) return;
    this.down_ = false;
    this.add(this.cellAt(x, y));
    const cells = [...this.stroke.values()];
    this.stroke.clear();
    if (cells.length) this.h.send({ level, cells, mat });
    this.h.show([]);
  }
  end() {
    this.down_ = false;
    this.stroke.clear();
    this.h.show([]);
  }
}
