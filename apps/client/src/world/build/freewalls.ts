// Walls drawn free (docs/plan/72-the-3d-core.md, phase 11; the mocks in design/build-tool): Build's
// Line puts walls in at any angle and length, corner after corner — a click each (or a drag for
// one), the pointer snapping to other walls' ends and middles, onto their lines carried on, square
// off the wall it starts on, else in angle steps and grid lengths (Shift: none of it); a length
// typed puts the next wall in that long; Backspace takes the last one back; Enter, Esc, a double
// click or closing on the first corner ends the run. Arc (11.3): a click where it starts, one where
// it ends, then out to bow it — in 0.25 m steps, a half circle at most (or the bow typed) — and a
// click; the next goes on from its end. Adjust (11.4): a wall's top dragged up or down for its height
// (snapping to ceiling, rail, low), a click for the panel's height and thickness. New walls go up as
// high and as thick as the panel says. Box draws four round a rectangle; Erase (or
// ⌘/Ctrl) takes a whole wall away, every wall a drag crosses. They go to the server as the
// structure's operations (struct:walls), undone and redone through its history.
import type { ClientMessages, Ray, ServerMessages } from "@yutopia/shared";
import { HALF_WALL_H, WALL_H, WALL_T } from "@yutopia/shared";
import {
  bowThrough,
  isArc,
  nearOnWall,
  onTiles,
  type SnapOpts,
  type Snapped,
  type Structure,
  snapPoint,
  uncovered,
  WALL_HEIGHTS,
  WALL_LOWEST,
  WALL_MATERIALS,
  WALL_MIN,
  WALLS_AT_ONCE,
  type Wall,
  type WallDraft,
  wallLength,
  wallPoint,
  wallPoints,
  wallWhy,
  type XY,
} from "@yutopia/shared/structure";
import { type Key, tr } from "@/lib/i18n";
import type { SegGhost, SnapMark } from "../model";
import { hud, toast, type WallTag } from "../store";
import { buildSound } from "./sounds";

export interface FreeHost {
  structure(): Structure | null;
  /** the ray from the camera through the pointer (floor metres, z up off the floor) */
  ray(): Ray | null;
  level(): number;
  send(msg: ClientMessages["struct:walls"]): void;
  show(segs: SegGhost[], marks: SnapMark[]): void;
  tag(t: WallTag | null): void;
  shift(): boolean;
  removing(): boolean;
}

const THERE = "there already";
const ERASE_NEAR = 0.3; // how near a wall the pointer picks it (m)
const DOUBLE_MS = 350;
const BOW_STEP = 0.25; // an arc's bow, snapped (m)
const HEIGHT_SNAP = 0.12; // how near a named height a dragged top snaps to it (m)
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

interface Chain {
  pts: XY[]; // its corners (the first where it began)
  ids: (string[] | null)[]; // each wall's id once the server's said (null: on its way)
}

export class FreeWalls {
  private chain: Chain | null = null;
  private typed: string | null = null; // a length being typed (m)
  private boxFrom: XY | null = null;
  private arcEnd: XY | null = null; // Arc: its end picked, its bow being chosen
  private began: XY | null = null;
  // Adjust: the wall pressed on (its top being dragged: moved once the pointer has), and the one
  // under the pointer
  private adj: { wall: Wall; at: XY; h: number; moved: boolean } | null = null;
  private under: Wall | null = null; // the press that began the run: where (its release a click, unless dragged)
  private stroke: Set<string> | null = null; // Erase: the walls a drag has crossed
  private pointer: XY | null = null;
  private lastUp = { t: 0, p: [0, 0] as XY };
  private seq = 0;
  private waiting = new Map<number, { chain: Chain; i: number }>();

  constructor(private h: FreeHost) {}

  /** Line, Box and Erase in Build: this tool's. */
  static owns(): boolean {
    const b = hud.get().build;
    return b.on && b.tool === "walls" && b.wallMode === "build" && b.paintMode !== "fill";
  }

  get busy(): boolean {
    return !!(this.chain || this.boxFrom || this.stroke || this.adj || this.typed);
  }

  /** My floor's walls (the build controller's openings aim at them). */
  wallsHere(): Wall[] {
    return this.walls();
  }
  /** Whether the tile map holds this wall (the tile tool's openings go in it, by edges). */
  onTilesHere(w: Wall): boolean {
    const f = this.h.structure()?.floors.find((q) => q.index === w.floor);
    return !!f && onTiles(w, f);
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
  private erasing(): boolean {
    return this.h.removing() || hud.get().build.paintMode === "erase";
  }
  private arcing(): boolean {
    return hud.get().build.paintMode === "arc";
  }
  /** The bow the pointer (or a number typed) gives the arc being drawn. */
  private bowAt(p: XY): number {
    const from = this.chain?.pts.at(-1);
    const end = this.arcEnd;
    if (!from || !end) return 0;
    const free = bowThrough(from, end, p, 0);
    const typed = this.typed ? Number(this.typed) : Number.NaN;
    if (Number.isFinite(typed)) {
      const half = dist(from, end) / 2;
      return (free < 0 ? -1 : 1) * Math.min(half, typed);
    }
    return this.h.shift() ? free : bowThrough(from, end, p, BOW_STEP);
  }
  private adjusting(): boolean {
    return hud.get().build.paintMode === "adjust";
  }
  /** How high the pointer puts a wall's top: where its ray meets the wall's upright plane (an arc's
   *  at its tangent where it was pressed), snapped to the named heights near them, else to 0.1 m
   *  (Shift: the mm). */
  private heightAt(w: Wall, at: XY): number | null {
    const r = this.h.ray();
    if (!r) return null;
    const { q, t } = nearOnWall(w, at);
    const [p0, p1] = [wallPoint(w, Math.max(0, t - 0.01)), wallPoint(w, Math.min(1, t + 0.01))];
    const [ux, uy] = [p1[0] - p0[0], p1[1] - p0[1]];
    const den = r.d.x * uy - r.d.y * ux;
    if (Math.abs(den) < 1e-9) return null;
    const k = ((q[0] - r.o.x) * uy - (q[1] - r.o.y) * ux) / den;
    if (k <= 0) return null;
    let h = r.o.z + k * r.d.z;
    if (this.h.shift()) h = Math.round(h * 1000) / 1000;
    else {
      const named = Object.values(WALL_HEIGHTS).find((v) => Math.abs(v - h) < HEIGHT_SNAP);
      h = named ?? Math.round(h * 10) / 10;
    }
    return Math.max(WALL_LOWEST, Math.min(WALL_H, h));
  }
  private boxing(): boolean {
    return hud.get().build.paintMode === "box";
  }
  /** The brush's wall: what it's made of and how high. */
  private brush(): { front: string; height: number; thick: number } | null {
    const b = hud.get().build;
    const ch = b.brush.slice(2);
    if (!(WALL_MATERIALS as readonly string[]).includes(ch)) return null;
    // (up on a mezzanine, a wall to the ceiling is as high as there's room for)
    const over = b.over ?? 0;
    const height = ch === "h" ? HALF_WALL_H : b.wallHeight >= WALL_H - 1e-3 ? WALL_H - over : b.wallHeight;
    return { front: ch, height, thick: b.wallThick };
  }
  /** The working height drafts stand at (a mezzanine's — phase 11.7). */
  private overOf(): { over?: number } {
    const over = hud.get().build.over ?? 0;
    return over > 0 ? { over } : {};
  }
  private why(d: WallDraft): string | null {
    const s = this.h.structure();
    if (!s) return "not loaded";
    return wallWhy(s, this.h.level(), d) ?? (d.bow || uncovered(this.walls(), d.a, d.b).length ? null : THERE);
  }

  /** The wall nearest the pointer, near enough to pick. */
  private wallNear(p: XY): Wall | null {
    let best: Wall | null = null;
    let bd = ERASE_NEAR;
    for (const w of this.walls()) {
      const { d } = nearOnWall(w, p);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  /** Where the next corner goes: snapped, or the length typed along the way the pointer points. */
  private next(p: XY): Snapped {
    const from = this.chain?.pts.at(-1) ?? null;
    const s = snapPoint(p, from, this.walls(), this.opts());
    const len = this.typed ? Number(this.typed) : Number.NaN;
    if (from && Number.isFinite(len) && len > 0) {
      const a = Math.atan2(s.p[1] - from[1], s.p[0] - from[0]);
      return { p: [from[0] + Math.cos(a) * len, from[1] + Math.sin(a) * len], kind: s.kind };
    }
    return s;
  }
  private mark(s: Snapped, from: XY | null): SnapMark {
    const m: SnapMark = { p: s.p, kind: s.kind };
    if (s.kind === "line" && s.wall) {
      // the guide back to the nearer end of the wall it's in line with
      const w = this.walls().find((q) => q.id === s.wall);
      if (w) m.from = dist(w.a, s.p) < dist(w.b, s.p) ? w.a : w.b;
    } else if (s.kind === "square" && from) m.from = from;
    return m;
  }

  hover(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    if (this.erasing()) {
      const w = this.wallNear(p);
      if (w && this.stroke) this.stroke.add(w.id);
      const gone = this.walls().filter((q) => q.id === w?.id || this.stroke?.has(q.id));
      this.h.show(
        gone.map((q) => ({
          a: q.a,
          b: q.b,
          h: q.height,
          ok: true,
          remove: true,
          ...(isArc(q) ? { pts: wallPoints(q) } : {}),
        })),
        [],
      );
      this.h.tag(
        gone.length
          ? { kind: "draw", len: 0, ang: 0, snap: "", typed: null, remove: true, n: gone.length, why: null }
          : null,
      );
      return;
    }
    if (this.adjusting()) return this.adjustHover(p);
    const br = this.brush();
    if (this.boxing()) {
      const s = snapPoint(p, null, this.walls(), this.opts());
      if (!this.boxFrom) {
        this.h.show([], [this.mark(s, null)]);
        return this.h.tag(null);
      }
      const ring = this.ring(this.boxFrom, s.p);
      // (a side along walls that are there: skipped, the rest go up)
      const whys = ring.map((d) => this.why(d));
      const segs = ring
        .map((d, i) => ({ ...d, h: d.height ?? WALL_H, t: d.thick, ok: !whys[i], mat: d.front, why: whys[i] }))
        .filter((g) => g.why !== THERE);
      const why = whys.find(Boolean) ?? null;
      this.h.show(segs, [this.mark(s, null)]);
      const r = (v: number) => Math.round(v * 100) / 100;
      this.h.tag({
        kind: "run",
        n: segs.filter((g) => g.ok).length,
        w: r(Math.abs(s.p[0] - this.boxFrom[0])),
        h: r(Math.abs(s.p[1] - this.boxFrom[1])),
        remove: false,
        skipped: whys.filter((w) => w === THERE).length,
        why: why ? whyText(why) : null,
      });
      return;
    }
    const from = this.chain?.pts.at(-1) ?? null;
    if (!this.arcing()) this.arcEnd = null;
    if (from && br && this.arcEnd) {
      // an arc being bowed: its ghost along its curve, a mark at the top of its bow
      const bow = this.bowAt(p);
      const d: WallDraft = {
        a: from,
        b: this.arcEnd,
        front: br.front,
        height: br.height,
        thick: br.thick,
        ...this.overOf(),
        ...(bow ? { bow } : {}),
      };
      const why = this.why(d);
      const top = wallPoint(d, 0.5);
      const chordMid: XY = [(from[0] + this.arcEnd[0]) / 2, (from[1] + this.arcEnd[1]) / 2];
      this.h.show(
        [
          {
            a: from,
            b: this.arcEnd,
            h: br.height,
            t: br.thick,
            ok: !why,
            mat: br.front,
            ...(bow ? { pts: wallPoints(d) } : {}),
          },
        ],
        [{ p: top, kind: "bow", ...(bow ? { from: chordMid } : {}) }],
      );
      this.h.tag({
        kind: "draw",
        len: wallLength(d),
        ang: 0,
        snap: "",
        typed: this.typed,
        remove: false,
        n: this.chain ? this.chain.pts.length - 1 : 0,
        why: why ? whyText(why) : null,
        bow,
        half: Math.abs(Math.abs(bow) - dist(from, this.arcEnd) / 2) < 1e-3,
      });
      return;
    }
    const s = this.next(p);
    if (!from || !br) {
      this.h.show([], [this.mark(s, null)]);
      return this.h.tag(br ? null : this.tagWhy(tr("wallWhyNone")));
    }
    const d: WallDraft = { a: from, b: s.p, front: br.front, height: br.height, thick: br.thick, ...this.overOf() };
    const why = dist(from, s.p) < WALL_MIN ? null : this.why(d);
    const done = this.chain ? this.chain.pts.length - 1 : 0;
    this.h.show(
      dist(from, s.p) < 1e-3 ? [] : [{ a: from, b: s.p, h: br.height, t: br.thick, ok: !why, mat: br.front }],
      [this.mark(s, from)],
    );
    const ang = ((((Math.atan2(-(s.p[1] - from[1]), s.p[0] - from[0]) * 180) / Math.PI) % 360) + 360) % 360;
    this.h.tag({
      kind: "draw",
      len: dist(from, s.p),
      ang,
      snap: s.kind,
      typed: this.typed,
      remove: false,
      n: done,
      why: why ? whyText(why) : null,
    });
  }
  /** Adjust: the wall under the pointer (or the one pressed on) at the height its top's dragged to. */
  private adjustHover(p: XY) {
    const a = this.adj;
    if (a && !a.moved && dist(p, a.at) > 0.3) a.moved = true;
    if (a?.moved) a.h = this.heightAt(a.wall, a.at) ?? a.h;
    const w = a?.wall ?? this.wallNear(p);
    this.under = w;
    if (!w) {
      this.h.show([], []);
      return this.h.tag(null);
    }
    const h = a ? a.h : w.height;
    const top = wallPoint(w, a ? nearOnWall(w, a.at).t : 0.5);
    const changed = !!a && Math.abs(h - w.height) > 0.005;
    this.h.show(
      [{ a: w.a, b: w.b, h, t: w.thick ?? WALL_T, ok: true, ...(isArc(w) ? { pts: wallPoints(w) } : {}) }],
      [{ p: top, kind: "height", z: h, ...(changed ? { fromZ: w.height } : {}) }],
    );
    this.h.tag({
      kind: "draw",
      len: wallLength(w),
      ang: 0,
      snap: "",
      typed: this.typed,
      remove: false,
      n: 0,
      why: null,
      height: this.typed && !a ? Number(this.typed) || h : h,
      thick: w.thick ?? WALL_T,
      bow: null,
    });
  }
  /** Walls that are there changed: their height, their thickness. */
  private setWall(w: Wall, c: { height?: number; thick?: number }) {
    const height = c.height !== undefined && Math.abs(c.height - w.height) > 0.005 ? c.height : undefined;
    const thick = c.thick !== undefined && Math.abs(c.thick - (w.thick ?? WALL_T)) > 1e-6 ? c.thick : undefined;
    if (height === undefined && thick === undefined) return;
    if (height !== undefined && (height < WALL_LOWEST - 1e-6 || height > WALL_H + 1e-6))
      return this.nope("not a wall's height");
    this.h.send({
      level: this.h.level(),
      set: [{ id: w.id, ...(height !== undefined ? { height } : {}), ...(thick !== undefined ? { thick } : {}) }],
    });
    buildSound("drop");
  }
  private tagWhy(why: string): WallTag {
    return { kind: "draw", len: 0, ang: 0, snap: "", typed: null, remove: false, n: 0, why };
  }

  down(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    if (this.erasing()) {
      this.stroke = new Set();
      return this.hover(x, y);
    }
    if (this.adjusting()) {
      const w = this.wallNear(p);
      this.adj = w ? { wall: w, at: p, h: w.height, moved: false } : null;
      return this.hover(x, y);
    }
    if (this.boxing()) {
      this.boxFrom = snapPoint(p, null, this.walls(), this.opts()).p;
      return this.hover(x, y);
    }
    if (!this.chain) {
      if (!this.brush()) {
        buildSound("nope");
        return;
      }
      this.chain = { pts: [snapPoint(p, null, this.walls(), this.opts()).p], ids: [] };
      this.began = p;
      buildSound("select");
    }
    this.hover(x, y);
  }

  up(x: number, y: number) {
    const p: XY = [x, y];
    this.pointer = p;
    if (this.stroke) {
      const ids = [...this.stroke];
      this.stroke = null;
      for (let i = 0; i < ids.length; i += WALLS_AT_ONCE)
        this.h.send({ level: this.h.level(), remove: ids.slice(i, i + WALLS_AT_ONCE) });
      if (ids.length) buildSound("remove");
      return this.hover(x, y);
    }
    if (this.adj) {
      const a = this.adj;
      this.adj = null;
      // dragged: that height; a click: the panel's height and thickness
      const b = hud.get().build;
      if (a.moved) this.setWall(a.wall, { height: a.h });
      else this.setWall(a.wall, { height: a.wall.front === "h" ? undefined : b.wallHeight, thick: b.wallThick });
      return this.hover(x, y);
    }
    if (this.boxFrom) {
      const s = snapPoint(p, null, this.walls(), this.opts());
      const ring = this.ring(this.boxFrom, s.p);
      this.boxFrom = null;
      const whys = ring.map((d) => this.why(d));
      const why = whys.find((w) => w && w !== THERE) ?? (whys.every((w) => w === THERE) ? THERE : null);
      if (!ring.length) return this.hover(x, y);
      if (why) this.nope(why);
      else {
        this.h.send({ level: this.h.level(), add: ring });
        buildSound("drop");
      }
      return this.hover(x, y);
    }
    const c = this.chain;
    if (!c) return;
    // (the release of the press that began it: a click, not a wall — unless it was dragged)
    const began = this.began;
    this.began = null;
    if (began && dist(began, p) < 0.25) return;
    const now = performance.now();
    const twice = now - this.lastUp.t < DOUBLE_MS && dist(p, this.lastUp.p) < 0.3;
    this.lastUp = { t: now, p };
    if (twice && c.pts.length > 1 && !this.arcEnd) return this.end();
    const from = c.pts.at(-1) as XY;
    if (this.arcing()) {
      if (this.arcEnd) {
        // its bow: in
        const end = this.arcEnd;
        const bow = this.bowAt(p);
        this.arcEnd = null;
        return this.put(from, end, bow);
      }
      // its end picked (as a straight wall's snaps); next, its bow
      const s = this.next(p);
      if (dist(from, s.p) < WALL_MIN) return;
      this.arcEnd = s.p;
      this.typed = null;
      buildSound("select");
      return this.redraw();
    }
    const s = this.next(p);
    if (dist(from, s.p) < WALL_MIN) return; // (the click that began it)
    this.put(from, s.p);
  }

  /** The wall from `a` to `b` in, and the run carried on from `b` (closed on its first corner: done). */
  private put(a: XY, b: XY, bow = 0) {
    const c = this.chain;
    const br = this.brush();
    if (!c || !br) return;
    const d: WallDraft = {
      a,
      b,
      front: br.front,
      height: br.height,
      thick: br.thick,
      ...this.overOf(),
      ...(bow ? { bow } : {}),
    };
    const why = this.why(d);
    if (why) return this.nope(why);
    const n = ++this.seq;
    this.h.send({ level: this.h.level(), add: [d], n });
    c.pts.push(b);
    c.ids.push(null);
    this.waiting.set(n, { chain: c, i: c.ids.length - 1 });
    this.typed = null;
    buildSound("drop");
    if (c.pts.length > 2 && dist(b, c.pts[0]) < 1e-3) return this.end();
    if (this.pointer) this.hover(this.pointer[0], this.pointer[1]);
  }

  private nope(why: string) {
    buildSound("nope");
    toast(whyText(why), "warn");
  }

  /** The server's word on walls put in: their ids (Backspace takes them back by them). */
  ok(m: ServerMessages["struct:walls:ok"]) {
    // a room closed round: named next (BuildMode's prompt)
    if (m.found?.length) {
      hud.set((s) => ({ build: { ...s.build, foundRoom: m.found?.[0] ?? null } }));
      buildSound("select");
    }
    if (m.n === null) return;
    const w = this.waiting.get(m.n);
    if (!w) return;
    this.waiting.delete(m.n);
    w.chain.ids[w.i] = m.ids;
  }

  /** The four walls round the rectangle from a to b (the corner diagonally across). */
  private ring(a: XY, b: XY): WallDraft[] {
    const br = this.brush();
    if (!br) return [];
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    if (x1 - x0 < WALL_MIN || y1 - y0 < WALL_MIN) return [];
    const c: XY[] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    return c.map((q, i) => ({
      a: q,
      b: c[(i + 1) % 4],
      front: br.front,
      height: br.height,
      thick: br.thick,
      ...this.overOf(),
    }));
  }

  /** Ends the run (the walls stay). */
  end() {
    const was = this.busy;
    this.chain = null;
    this.typed = null;
    this.arcEnd = null;
    this.began = null;
    this.adj = null;
    this.boxFrom = null;
    this.stroke = null;
    this.h.show([], []);
    this.h.tag(null);
    if (was && this.pointer) this.hover(this.pointer[0], this.pointer[1]);
  }

  /** Keys while drawing (true: handled): a length typed, Enter, Backspace, Esc. */
  key(key: string): boolean {
    const c = this.chain;
    if (key === "escape") {
      if (!this.busy) return false;
      this.end();
      return true;
    }
    if (!c && this.adjusting() && this.under) {
      // a height typed for the wall under the pointer, Enter: that
      if (/^[0-9]$/.test(key) || (key === "." && !this.typed?.includes("."))) {
        this.typed = (this.typed ?? "") + key;
        this.redraw();
        return true;
      }
      if (key === "backspace" && this.typed) {
        this.typed = this.typed.slice(0, -1) || null;
        this.redraw();
        return true;
      }
      if (key === "enter" && this.typed) {
        const h = Number(this.typed);
        this.typed = null;
        if (Number.isFinite(h)) this.setWall(this.under, { height: h });
        this.redraw();
        return true;
      }
    }
    if (!c) return false;
    if (/^[0-9]$/.test(key) || (key === "." && !this.typed?.includes("."))) {
      this.typed = (this.typed ?? "") + key;
      this.redraw();
      return true;
    }
    if (key === "enter" && this.arcEnd && this.pointer) {
      // the arc in, bowed as the pointer (or the number typed) says
      const end = this.arcEnd;
      const bow = this.bowAt(this.pointer);
      this.arcEnd = null;
      this.put(c.pts.at(-1) as XY, end, bow);
      return true;
    }
    if (key === "enter") {
      const len = Number(this.typed);
      if (this.typed && Number.isFinite(len) && len > 0 && this.pointer) {
        const s = this.next(this.pointer);
        const from = c.pts.at(-1) as XY;
        if (dist(from, s.p) >= WALL_MIN) this.put(from, s.p);
        else this.nope("too short");
      } else this.end();
      return true;
    }
    if (key === "backspace") {
      if (this.typed) {
        this.typed = this.typed.slice(0, -1) || null;
        this.redraw();
        return true;
      }
      // an arc's end picked: unpicked
      if (this.arcEnd) {
        this.arcEnd = null;
        this.redraw();
        return true;
      }
      // the last wall of the run back out (once the server's said which it is)
      const ids = c.ids.at(-1);
      if (!c.ids.length) {
        this.end();
        return true;
      }
      if (!ids) return true; // (on its way)
      this.h.send({ level: this.h.level(), remove: ids });
      c.ids.pop();
      c.pts.pop();
      buildSound("remove");
      this.redraw();
      return true;
    }
    return false;
  }
  redraw() {
    if (this.pointer) this.hover(this.pointer[0], this.pointer[1]);
  }
}

// The checks' reasons, as a player reads them.
const WHY: Record<string, Key> = {
  "too short": "wallWhyShort",
  "too long": "wallWhyLong",
  "off the floor": "wallWhyOff",
  "not a wall's material": "wallWhyMat",
  "bows too far": "wallWhyBow",
  "not a wall's height": "wallWhyHeight",
  [THERE]: "wallWhyThere",
};
const whyText = (why: string): string => (WHY[why] ? tr(WHY[why]) : why);
