// Floors drawn free (docs/plan/72-the-3d-core.md, phase 11.7; the mocks' 07–08): the Walls tool's
// Floors — Line: a floor's corners clicked one after another (snapping as walls do: to their ends
// and middles, the grid, angle steps), closed on the first corner or with Enter; Box: a rectangle
// dragged; Fill: the room under the pointer, its walls' face whole; Erase: the floor under the
// pointer. All at the working height (the floor's own, or a mezzanine's over it — the panel's
// Height, PgUp/PgDn). They go to the server as the structure's operation (struct:slabs), undone and
// redone through its history.
import type { ClientMessages } from "@yutopia/shared";
import { isFloor } from "@yutopia/shared";
import {
  floorFaces,
  inRing,
  type RoofDraft,
  roofAt,
  roofWhy,
  type Slab,
  type SnapOpts,
  type Structure,
  slabAt,
  slabWhy,
  snapPoint,
  type Wall,
  type XY,
} from "@yutopia/shared/structure";
import { type Key, tr } from "@/lib/i18n";
import type { SnapMark } from "../model";
import { hud, toast } from "../store";
import { buildSound } from "./sounds";

/** A floor about to go in (or out), as build3d draws it: its corners, whether it fits. */
export interface PolyGhost {
  pts: XY[];
  holes?: XY[][];
  ok: boolean;
  closed: boolean;
  remove?: boolean;
  top?: string;
}

export interface FloorHost {
  structure(): Structure | null;
  level(): number;
  send(msg: ClientMessages["struct:slabs"]): void;
  show(polys: PolyGhost[], marks: SnapMark[]): void;
  shift(): boolean;
}

const CLOSE = 0.3; // how near the first corner closes the floor (m)
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class FreeFloors {
  private pts: XY[] = [];
  private boxFrom: XY | null = null;
  private pointer: XY | null = null;
  private seq = 0;

  constructor(private h: FloorHost) {}

  /** Floors' Line, Box, Fill and Erase: this tool's. */
  static owns(): boolean {
    const b = hud.get().build;
    return b.on && b.tool === "walls" && b.wallMode === "floors";
  }
  get busy(): boolean {
    return this.pts.length > 0 || !!this.boxFrom;
  }

  private over(): number {
    return hud.get().build.over ?? 0;
  }
  private walls(): Wall[] {
    const s = this.h.structure();
    const lv = this.h.level();
    return s ? s.walls.filter((w) => w.floor === lv) : [];
  }
  private opts(): SnapOpts {
    if (this.h.shift()) return { grid: 0, angle: 0, walls: false };
    const b = hud.get().build;
    return { grid: b.snapGrid, angle: b.snapAngle, walls: true };
  }
  private mode(): "line" | "box" | "fill" | "erase" {
    const b = hud.get().build;
    // ("No floor" picked: what the pointer's on goes)
    if (b.paintMode === "erase" || !isFloor(b.brush)) return "erase";
    return b.paintMode === "box" ? "box" : b.paintMode === "fill" ? "fill" : "line";
  }
  private why(outline: XY[], holes?: XY[][]): string | null {
    const s = this.h.structure();
    if (!s) return "not loaded";
    return slabWhy(s, this.h.level(), { outline, holes, top: hud.get().build.brush, over: this.over() });
  }
  private slabHere(p: XY): Slab | null {
    const s = this.h.structure();
    return s ? slabAt(s, this.h.level(), p, this.over()) : null;
  }
  /** The face the walls close round at a point (the smallest), if any. */
  private faceAt(p: XY): { outline: XY[]; holes: XY[][] } | null {
    const s = this.h.structure();
    if (!s) return null;
    const area = (r: XY[]) => {
      let a = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
      return Math.abs(a) / 2;
    };
    return (
      floorFaces(s, this.h.level())
        .filter((f) => inRing(f.outline, p[0], p[1]) && !f.holes.some((q) => inRing(q, p[0], p[1])))
        .sort((a, b) => area(a.outline) - area(b.outline))[0] ?? null
    );
  }
  private rect(a: XY, b: XY): XY[] {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }

  hover(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    const mode = this.mode();
    const top = hud.get().build.brush;
    if (mode === "erase") {
      const sl = this.slabHere(p);
      return this.h.show(sl ? [{ pts: sl.outline, holes: sl.holes, ok: true, closed: true, remove: true }] : [], []);
    }
    if (mode === "fill") {
      const f = this.faceAt(p);
      return this.h.show(
        f ? [{ pts: f.outline, holes: f.holes, ok: !this.why(f.outline, f.holes), closed: true, top }] : [],
        [],
      );
    }
    const s = snapPoint(p, this.pts.at(-1) ?? null, this.walls(), this.opts());
    if (mode === "box") {
      if (!this.boxFrom) return this.h.show([], [{ p: s.p, kind: s.kind }]);
      const r = this.rect(this.boxFrom, s.p);
      return this.h.show([{ pts: r, ok: !this.why(r), closed: true, top }], [{ p: s.p, kind: s.kind }]);
    }
    if (!this.pts.length) return this.h.show([], [{ p: s.p, kind: s.kind }]);
    // (on the first corner again: it closes)
    const closing = this.pts.length >= 3 && dist(s.p, this.pts[0]) < CLOSE;
    const pts = closing ? [...this.pts] : [...this.pts, s.p];
    const ok = pts.length < 3 || !this.why(pts);
    this.h.show(
      [{ pts, ok, closed: closing, top }],
      [{ p: closing ? this.pts[0] : s.p, kind: closing ? "end" : s.kind }],
    );
  }

  down(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    if (this.mode() === "box") this.boxFrom = snapPoint(p, null, this.walls(), this.opts()).p;
    this.hover(x, y);
  }

  up(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    const mode = this.mode();
    if (mode === "erase") {
      const sl = this.slabHere(p);
      if (sl) {
        this.h.send({ level: this.h.level(), remove: [sl.id] });
        buildSound("remove");
      }
      return;
    }
    if (mode === "fill") {
      const f = this.faceAt(p);
      if (!f) return this.nope("no room there");
      this.put(f.outline, f.holes);
      return;
    }
    if (mode === "box") {
      const from = this.boxFrom;
      this.boxFrom = null;
      if (!from) return;
      const s = snapPoint(p, null, this.walls(), this.opts());
      if (dist(from, s.p) < 0.3) return this.hover(x, y);
      this.put(this.rect(from, s.p));
      return this.hover(x, y);
    }
    const s = snapPoint(p, this.pts.at(-1) ?? null, this.walls(), this.opts());
    if (this.pts.length >= 3 && dist(s.p, this.pts[0]) < CLOSE) return this.finish();
    const last = this.pts.at(-1);
    if (last && dist(last, s.p) < 0.1) return;
    this.pts.push(s.p);
    buildSound("select");
    this.hover(x, y);
  }

  /** The corners so far as a floor (three or more), in. */
  private finish() {
    const pts = this.pts;
    this.pts = [];
    if (pts.length < 3) return this.redraw();
    this.put(pts);
    this.redraw();
  }

  private put(outline: XY[], holes?: XY[][]) {
    const why = this.why(outline, holes);
    if (why) return this.nope(why);
    const top = hud.get().build.brush;
    this.h.send({
      level: this.h.level(),
      add: [{ outline, ...(holes?.length ? { holes } : {}), top, over: this.over() }],
      n: ++this.seq,
    });
    buildSound("drop");
  }

  private nope(why: string) {
    buildSound("nope");
    toast(WHY[why] ? tr(WHY[why]) : why, "warn");
  }

  end() {
    const was = this.busy;
    this.pts = [];
    this.boxFrom = null;
    this.h.show([], []);
    if (was) this.redraw();
  }

  /** Keys while drawing (true: handled): Enter closes it, Backspace takes a corner back, Esc lets go. */
  key(key: string): boolean {
    if (key === "escape") {
      if (!this.busy) return false;
      this.end();
      return true;
    }
    if (!this.pts.length) return false;
    if (key === "enter") {
      this.finish();
      return true;
    }
    if (key === "backspace") {
      this.pts.pop();
      this.redraw();
      return true;
    }
    return false;
  }
  redraw() {
    if (this.pointer) this.hover(this.pointer[0], this.pointer[1]);
  }
}

const WHY: Record<string, Key> = {
  "too small": "floorWhySmall",
  "its edges cross": "floorWhyCross",
  "off the floor": "wallWhyOff",
  "no room there": "floorWhyNoRoom",
};

/** The Roof tool's host: the floor tool's, with its own message and whether ⌘/Ctrl is held. */
export interface RoofHost {
  structure(): Structure | null;
  level(): number;
  send(msg: ClientMessages["struct:roofs"]): void;
  show(polys: PolyGhost[]): void;
  removing(): boolean;
}

/** Roofs (phase 11.7): the room under the pointer roofed, its outline shown first; ⌘/Ctrl: the roof
 *  over it taken off; R turns a gable's ridge. */
export class FreeRoofs {
  private pointer: XY | null = null;
  constructor(private h: RoofHost) {}

  static owns(): boolean {
    const b = hud.get().build;
    return b.on && b.tool === "walls" && b.wallMode === "roof";
  }
  private draft(outline: XY[]): RoofDraft {
    const b = hud.get().build;
    return { outline, kind: b.roofKind, pitch: b.roofPitch, ridge: b.roofRidge };
  }
  private faceAt(p: XY): { outline: XY[]; holes: XY[][] } | null {
    const s = this.h.structure();
    if (!s) return null;
    const area = (r: XY[]) => {
      let a = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
      return Math.abs(a) / 2;
    };
    return (
      floorFaces(s, this.h.level())
        .filter((f) => inRing(f.outline, p[0], p[1]) && !f.holes.some((q) => inRing(q, p[0], p[1])))
        .sort((a, b) => area(a.outline) - area(b.outline))[0] ?? null
    );
  }
  hover(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    const s = this.h.structure();
    if (!s) return;
    if (this.h.removing()) {
      const r = roofAt(s, this.h.level(), p);
      return this.h.show(r ? [{ pts: r.outline, ok: true, closed: true, remove: true }] : []);
    }
    const f = this.faceAt(p);
    if (!f) return this.h.show([]);
    const why = roofWhy(s, this.h.level(), this.draft(f.outline));
    this.h.show([{ pts: f.outline, ok: !why, closed: true }]);
  }
  down(x: number, y: number) {
    this.hover(x, y);
  }
  up(x: number, y: number) {
    const p: XY = [x, y];
    const s = this.h.structure();
    if (!s) return;
    if (this.h.removing()) {
      const r = roofAt(s, this.h.level(), p);
      if (r) {
        this.h.send({ level: this.h.level(), remove: [r.id] });
        buildSound("remove");
      }
      return;
    }
    const f = this.faceAt(p);
    if (!f) {
      buildSound("nope");
      return void toast(tr("floorWhyNoRoom"), "warn");
    }
    const d = this.draft(f.outline);
    const why = roofWhy(s, this.h.level(), d);
    if (why) {
      buildSound("nope");
      const k: Key | null = why.startsWith("a gable") ? "roofWhyGable" : why.startsWith("a hip") ? "roofWhyHip" : null;
      return void toast(k ? tr(k) : why, "warn");
    }
    // (a roof there already: this one instead)
    const was = roofAt(s, this.h.level(), p);
    this.h.send({ level: this.h.level(), add: [d], ...(was ? { remove: [was.id] } : {}) });
    buildSound("drop");
  }
  key(key: string): boolean {
    if (key !== "r") return false;
    hud.set((s) => ({ build: { ...s.build, roofRidge: s.build.roofRidge ? 0 : 1 } }));
    buildSound("rotate");
    if (this.pointer) this.hover(this.pointer[0], this.pointer[1]);
    return true;
  }
  end() {
    this.h.show([]);
  }
}
