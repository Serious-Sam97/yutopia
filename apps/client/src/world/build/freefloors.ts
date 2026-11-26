// Floors drawn free (docs/plan/72-the-3d-core.md, phase 11.7; the mocks' 07–08): the Walls tool's
// Floors — Line: a floor's corners clicked one after another (snapping as walls do: to their ends
// and middles, the grid, angle steps), closed on the first corner or with Enter; Box: a rectangle
// dragged; Fill: the room under the pointer, its walls' face whole; Erase: the floor under the
// pointer. All at the working height (the floor's own, or a mezzanine's over it — the panel's
// Height, PgUp/PgDn). They go to the server as the structure's operation (struct:slabs), undone and
// redone through its history.
import type { ClientMessages, WorldObjectDef } from "@yutopia/shared";
import { isFloor } from "@yutopia/shared";
import {
  floorFaces,
  heldWhy,
  inRing,
  ON_ROOF,
  onRoofDraft,
  type Roof,
  type RoofDraft,
  roofAt,
  roofSetOps,
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
import { altHeld } from "./house";
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
  /** (the quality pass) the things here: the columns that hold an upper storey up */
  things?(): Iterable<WorldObjectDef>;
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
    return (
      slabWhy(s, this.h.level(), { outline, holes, top: hud.get().build.brush, over: this.over() }) ??
      // (an upper storey's: over something on the storey under it — the quality pass)
      heldWhy(s, this.h.level(), { ring: outline }, this.h.things?.() ?? [])
    );
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
  shift(): boolean;
}

/** Roofs (phase 11.7): the room under the pointer roofed, its outline shown first; ⌘/Ctrl: the roof
 *  over it taken off; R turns a gable's ridge. (plan 130 phase 7) Shift: the roof under it changed to
 *  these choices in place; a dormer or a chimney put on the roof under the pointer; Auto Roof (the card). */
export class FreeRoofs {
  private pointer: XY | null = null;
  constructor(private h: RoofHost) {}
  /** What's shown, and the picked roof's outline with it (the quality pass). */
  private show(polys: PolyGhost[]) {
    const s = this.h.structure();
    const id = hud.get().build.roofSel;
    const r = s && id ? (s.roofs ?? []).find((q) => q.id === id) : null;
    this.h.show(r ? [...polys, { pts: r.outline, ok: true, closed: true }] : polys);
  }

  static owns(): boolean {
    const b = hud.get().build;
    return b.on && b.tool === "walls" && b.wallMode === "roof";
  }
  private draft(outline: XY[]): RoofDraft {
    const b = hud.get().build;
    return { outline, kind: b.roofKind, pitch: b.roofPitch, ridge: b.roofRidge, mat: b.roofMat, over: b.roofOver };
  }
  /** A dormer's or a chimney's draft at the pointer, or why not. */
  private piece(p: XY): RoofDraft | string {
    const s = this.h.structure();
    const b = hud.get().build;
    if (!s) return "no roof there";
    const d = onRoofDraft(s, this.h.level(), b.roofKind as "dormer" | "chimney", p[0], p[1], b.roofPitch);
    // (a dormer in its roof's covering — onRoofDraft's; a chimney's brick)
    return d;
  }
  /** The roof under the pointer as these choices would make it (Shift), or why not. */
  private restyle(p: XY) {
    const s = this.h.structure();
    const r = s && roofAt(s, this.h.level(), p);
    if (!s || !r) return null;
    const b = hud.get().build;
    const c = ON_ROOF.has(r.kind)
      ? { mat: b.roofMat }
      : { kind: b.roofKind, pitch: b.roofPitch, mat: b.roofMat, over: b.roofOver, ridge: b.roofRidge };
    if (!ON_ROOF.has(r.kind) && ON_ROOF.has(b.roofKind)) return { r, c, why: "pick a roof's kind" };
    const op = roofSetOps(s, this.h.level(), r.id, c);
    return { r, c, why: typeof op === "string" ? op : null };
  }
  /** Auto Roof: this floor's roofs made again over its rooms. */
  auto() {
    const b = hud.get().build;
    if (ON_ROOF.has(b.roofKind)) return void toast(tr("roofAutoPick"), "warn");
    this.h.send({
      level: this.h.level(),
      auto: { kind: b.roofKind, pitch: b.roofPitch, mat: b.roofMat, over: b.roofOver },
    });
    buildSound("drop");
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
      return this.show(r ? [{ pts: r.outline, ok: true, closed: true, remove: true }] : []);
    }
    if (this.h.shift()) {
      const q = this.restyle(p);
      return this.show(q ? [{ pts: q.r.outline, ok: !q.why, closed: true }] : []);
    }
    if (ON_ROOF.has(hud.get().build.roofKind)) {
      const d = this.piece(p);
      return this.show(typeof d === "string" ? [] : [{ pts: d.outline, ok: true, closed: true }]);
    }
    const f = this.faceAt(p);
    if (!f) return this.show([]);
    const why = roofWhy(s, this.h.level(), this.draft(f.outline));
    this.show([{ pts: f.outline, ok: !why, closed: true }]);
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
    // (Alt: a roof picked — its card edits it; the quality pass)
    if (altHeld()) {
      const r = roofAt(s, this.h.level(), p);
      hud.set((st) => ({ build: { ...st.build, roofSel: r?.id ?? null } }));
      buildSound(r ? "select" : "nope");
      return;
    }
    if (this.h.shift()) {
      const q = this.restyle(p);
      if (!q) return;
      if (q.why) {
        buildSound("nope");
        return void toast(q.why, "warn");
      }
      this.h.send({ level: this.h.level(), set: { id: q.r.id, ...q.c } });
      return void buildSound("drop");
    }
    if (ON_ROOF.has(hud.get().build.roofKind)) {
      const d = this.piece(p);
      if (typeof d === "string") {
        buildSound("nope");
        return void toast(d === "no roof there" ? tr("roofNoRoof") : d, "warn");
      }
      this.h.send({ level: this.h.level(), add: [d] });
      return void buildSound("drop");
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
      const k: Key | null = why.includes("needs a rectangle")
        ? why.startsWith("a hip")
          ? "roofWhyHip"
          : "roofWhyGable"
        : null;
      return void toast(k ? tr(k) : why, "warn");
    }
    // (a roof there already: this one instead — not a dormer or chimney on it)
    const was = (s.roofs ?? [])
      .filter((q) => q.floor === this.h.level() && !ON_ROOF.has(q.kind) && inRing(q.outline, p[0], p[1]))
      .at(-1);
    this.h.send({ level: this.h.level(), add: [d], ...(was ? { remove: [was.id] } : {}) });
    buildSound("drop");
  }
  /** The picked roof changed (the card's, the keys'): its kind, pitch, overhang, eaves' height. */
  setPicked(c: { kind?: Roof["kind"]; pitch?: number; over?: number; z?: number; mat?: string }) {
    const s = this.h.structure();
    const id = hud.get().build.roofSel;
    const r = s && id ? (s.roofs ?? []).find((q) => q.id === id) : null;
    if (!s || !r) return false;
    const next = {
      ...c,
      ...(c.pitch !== undefined ? { pitch: Math.max(10, Math.min(60, Math.round(c.pitch))) } : {}),
      ...(c.over !== undefined ? { over: Math.max(0, Math.min(1.5, Math.round(c.over * 100) / 100)) } : {}),
      ...(c.z !== undefined ? { z: Math.round(c.z * 1000) / 1000 } : {}),
    };
    const why = roofSetOps(s, r.floor, r.id, next);
    if (typeof why === "string") {
      buildSound("nope");
      toast(why, "warn");
      return true;
    }
    this.h.send({ level: r.floor, set: { id: r.id, ...next } });
    buildSound("rotate");
    return true;
  }
  key(key: string): boolean {
    // (a picked roof: [ ] its pitch, PgUp/PgDn its eaves' height, , . its overhang)
    const s = this.h.structure();
    const sel = hud.get().build.roofSel;
    const r = s && sel ? (s.roofs ?? []).find((q) => q.id === sel) : null;
    if (r) {
      if (key === "[" || key === "]") return this.setPicked({ pitch: r.pitch + (key === "]" ? 5 : -5) });
      if (key === "pageup" || key === "pagedown") return this.setPicked({ z: r.z + (key === "pageup" ? 0.25 : -0.25) });
      if (key === "," || key === ".") return this.setPicked({ over: (r.over ?? 0.3) + (key === "." ? 0.1 : -0.1) });
      if (key === "escape") {
        hud.set((st) => ({ build: { ...st.build, roofSel: null } }));
        return true;
      }
    }
    if (key !== "r") return false;
    hud.set((s) => ({ build: { ...s.build, roofRidge: s.build.roofRidge ? 0 : 1 } }));
    buildSound("rotate");
    if (this.pointer) this.hover(this.pointer[0], this.pointer[1]);
    return true;
  }
  end() {
    this.show([]);
  }
}
