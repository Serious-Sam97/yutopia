import type { ClientMessages } from "@yutopia/shared";
import {
  endMoves,
  inRing,
  isArc,
  type PlanMove,
  planPoint,
  pushMoves,
  roomPieces,
  type Structure,
  type Wall,
  wallPoints,
  type XY,
} from "@yutopia/shared/structure";
import type { PolyGhost, SegGhost } from "../model";

// Build mode's room manipulation (docs/plan/130-the-house-build.md, phase 2 — The Sims 4's): in Walls › Select, the
// picked wall's ends dragged (the walls joined there follow) and the wall itself dragged square to itself (pushed or
// pulled, its neighbours' ends with it); a room picked by its floor, then dragged to move it — Alt to copy it —, R a
// quarter turn, Delete knocks it down. Shown as ghosts while dragged, sent on the release; the server checks it all.

export interface HouseHost {
  structure(): Structure | null;
  level(): number;
  /** the picked wall (Select's) and room */
  wallSel(): string | null;
  roomSel(): string | null;
  pickRoom(key: string | null): void;
  sendWalls(m: ClientMessages["struct:wallmove"]): void;
  sendRoom(m: ClientMessages["struct:room"]): void;
  show(segs: SegGhost[], polys: PolyGhost[]): void;
  alt(): boolean;
  snap(): number;
}

type Drag =
  | { kind: "end"; id: string; end: "a" | "b"; from: XY; at: XY }
  | { kind: "push"; id: string; from: XY; at: XY }
  | { kind: "room"; key: string; from: XY; at: XY };

// (Alt held: a room dragged is copied — kept here, the pointer's own events don't reach the tools)
let ALT = false;
if (typeof window !== "undefined") {
  const on = (e: KeyboardEvent) => {
    ALT = e.altKey;
  };
  window.addEventListener("keydown", on, true);
  window.addEventListener("keyup", on, true);
  window.addEventListener("blur", () => {
    ALT = false;
  });
}
export const altHeld = (): boolean => ALT;

const END_GRAB = 0.45;
const BODY_GRAB = 0.35;

export class HouseTools {
  private drag: Drag | null = null;
  private turnBy = 0;

  constructor(private h: HouseHost) {}

  get dragging(): boolean {
    return !!this.drag;
  }
  private walls(): Wall[] {
    const st = this.h.structure();
    return st ? st.walls.filter((w) => w.floor === this.h.level()) : [];
  }
  /** The room whose floor holds (x, y) on my floor, or null. */
  roomAt(x: number, y: number): string | null {
    const st = this.h.structure();
    if (!st) return null;
    for (const r of st.rooms) if (r.floor === this.h.level() && inRing(r.outline, x, y)) return r.key;
    return null;
  }
  private snapXY(p: XY): XY {
    const s = this.h.snap();
    return s > 0 ? [Math.round(p[0] / s) * s, Math.round(p[1] / s) * s] : p;
  }

  /** The left button down at (x, y): a drag started (true) — the picked wall's end or body, the picked room. */
  down(x: number, y: number): boolean {
    const p: XY = [x, y];
    const wid = this.h.wallSel();
    const w = wid ? this.walls().find((q) => q.id === wid) : null;
    if (w && !w.shell && !isArc(w)) {
      for (const end of ["a", "b"] as const)
        if (Math.hypot(w[end][0] - x, w[end][1] - y) < END_GRAB) {
          this.drag = { kind: "end", id: w.id, end, from: w[end], at: w[end] };
          return true;
        }
      if (distToSeg(p, w.a, w.b) < (w.thick ?? 0.2) / 2 + BODY_GRAB) {
        this.drag = { kind: "push", id: w.id, from: p, at: p };
        return true;
      }
    }
    const rk = this.h.roomSel();
    if (rk && this.roomAt(x, y) === rk) {
      this.drag = { kind: "room", key: rk, from: p, at: p };
      this.turnBy = 0;
      return true;
    }
    return false;
  }

  /** The pointer at (x, y): a drag's ghost. */
  hover(x: number, y: number): boolean {
    const d = this.drag;
    if (!d) return false;
    d.at = d.kind === "end" ? this.snapXY([x, y]) : [x, y];
    this.preview();
    return true;
  }

  /** The button up: the drag sent (true: it was one, the click's not a pick). */
  up(): boolean {
    const d = this.drag;
    this.drag = null;
    if (!d) return false;
    const moved = Math.hypot(d.at[0] - d.from[0], d.at[1] - d.from[1]) > 0.05;
    if (d.kind === "end" && moved) this.h.sendWalls({ level: this.h.level(), end: { id: d.id, end: d.end, to: d.at } });
    if (d.kind === "push") {
      const dist = this.pushBy(d);
      if (Math.abs(dist) > 0.05) this.h.sendWalls({ level: this.h.level(), push: { id: d.id, d: dist } });
    }
    if (d.kind === "room" && (moved || this.turnBy)) {
      const dd = this.roomBy(d);
      this.h.sendRoom({ key: d.key, d: dd, turn: this.turnBy, copy: this.h.alt() });
    }
    this.turnBy = 0;
    this.h.show([], []);
    return moved || (d.kind === "room" && this.turnBy !== 0);
  }

  /** R while a room's held: a quarter round (shown; sent with the drop) — or, held still, at once. */
  turn(): boolean {
    const rk = this.h.roomSel();
    if (!rk) return false;
    if (this.drag?.kind === "room") {
      this.turnBy = (this.turnBy + 1) % 4;
      this.preview();
      return true;
    }
    this.h.sendRoom({ key: rk, d: [0, 0], turn: 1 });
    return true;
  }
  /** The picked room copied beside itself (its width to the east). */
  copy(): void {
    const st = this.h.structure();
    const rk = this.h.roomSel();
    const r = rk ? st?.rooms.find((q) => q.key === rk) : null;
    if (!r) return;
    const w = r.rect[2] - r.rect[0];
    this.h.sendRoom({ key: r.key, d: [Math.ceil(w + 1), 0], turn: 0, copy: true });
  }
  /** The picked room knocked down. */
  remove(): void {
    const rk = this.h.roomSel();
    if (!rk) return;
    this.h.sendRoom({ key: rk, remove: true });
    this.h.pickRoom(null);
  }
  cancel(): void {
    this.drag = null;
    this.turnBy = 0;
    this.h.show([], []);
  }

  private pushBy(d: { id: string; from: XY; at: XY }): number {
    const w = this.walls().find((q) => q.id === d.id);
    if (!w) return 0;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const n: XY = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L];
    const raw = (d.at[0] - d.from[0]) * n[0] + (d.at[1] - d.from[1]) * n[1];
    const s = this.h.snap();
    return s > 0 ? Math.round(raw / s) * s : Math.round(raw * 1000) / 1000;
  }
  private roomBy(d: { from: XY; at: XY }): [number, number] {
    const s = this.h.snap() || 0.5;
    return [Math.round((d.at[0] - d.from[0]) / s) * s, Math.round((d.at[1] - d.from[1]) / s) * s];
  }

  /** The ghosts of what a drag does: the walls where they'll go (blue), a room's outline. */
  private preview(): void {
    const st = this.h.structure();
    const d = this.drag;
    if (!st || !d) return;
    const level = this.h.level();
    const seg = (w: Wall, a: XY, b: XY): SegGhost => ({ a, b, h: w.height, t: w.thick, ok: true });
    if (d.kind === "end" || d.kind === "push") {
      const moves =
        d.kind === "end" ? endMoves(st, level, d.id, d.end, d.at) : pushMoves(st, level, d.id, this.pushBy(d));
      const segs = moves.flatMap((m) => {
        const w = st.walls.find((q) => q.id === m.id);
        return w ? [seg(w, m.a, m.b)] : [];
      });
      return this.h.show(segs, []);
    }
    const pc = roomPieces(st, d.key);
    if (!pc) return;
    const dd = this.roomBy(d);
    const c: XY = [
      pc.room.outline.reduce((s, p) => s + p[0], 0) / pc.room.outline.length,
      pc.room.outline.reduce((s, p) => s + p[1], 0) / pc.room.outline.length,
    ];
    const t: PlanMove = { c, d: dd, turn: this.turnBy };
    const P = (p: XY) => planPoint(t, p);
    const segs = [...pc.own, ...pc.shared].map((w) =>
      isArc(w) ? { ...seg(w, P(w.a), P(w.b)), pts: wallPoints(w).map(P) } : seg(w, P(w.a), P(w.b)),
    );
    this.h.show(segs, [{ pts: pc.room.outline.map(P), ok: true, closed: true }]);
  }
}

function distToSeg(p: XY, a: XY, b: XY): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
