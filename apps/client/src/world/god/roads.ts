import type { P } from "@yutopia/shared/grounds";
import { wayAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import {
  addWay,
  changeWay,
  insertAt,
  newWayKey,
  newWayName,
  PAVE,
  removeWay,
  snapEnd,
  WAY_DEFAULTS,
  wayBlocked,
  wayDefOf,
  wayLength,
  wayLocked,
} from "@yutopia/shared/grounds-roads";
import type { Scene } from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";
import { RoadGhost } from "./road-ghost";

// God mode's roads tool (docs/plan/53-the-god-mode.md, phase 7; the mock 04-roads). Draw: a click
// a point (on the grid's snap), the first and last put on a way they're dropped near (joined:
// the generator gives the two one height there); a double-click, or Enter, ends it, Backspace
// takes the last point back, Esc lets it go. Edit points: a way's point dragged; a click on its
// line puts a point in there; Alt and a click takes one out; a click picks it, its width,
// pavements and lamps then the row's. Remove: a click takes a way away. The shuttle's ways may be
// widened or lit, no more; nothing over what's anchored (said before it's drawn). Each a step.
// The Select tool's too: a whole way picked, dragged, taken away (`grabWay`, `upWay`).

type Frame = { x: number; z: number; y: number };
type Ground = { x: number; z: number; h: number } | null;
export interface RoadsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  /** the camera's metres over the land (how near a point must be to be picked) */
  up(): number;
  snap(): GodHud["snap"];
}

const DOUBLE_MS = 350;

export class RoadsTool {
  private pts: P[] = [];
  private joins: (string | null)[] = [];
  private ghost: RoadGhost | null = null;
  private lastClick = { t: 0, x: 0, y: 0 };
  // a point being dragged: the way's, which one, its points as they'll be
  private drag: { key: string; k: number; pts: P[] } | null = null;
  // a whole way dragged (Select): its key, where it was picked up from, where it is now, its points
  private wayDrag: { key: string; from: P; at: P; pts: P[] } | null = null;
  private hover: string | null = null;

  constructor(
    private readonly host: RoadsHost,
    private readonly scene: Scene,
  ) {}

  private get o() {
    return hud.get().god.roads;
  }
  private setO(p: Partial<GodHud["roads"]>) {
    hud.set((s) => ({ god: { ...s.god, roads: { ...s.god.roads, ...p } } }));
  }
  /** How near (m) a point or a way is picked from up here. */
  private reach(): number {
    return Math.max(2, this.host.up() * 0.025);
  }
  private snapped(at: { x: number; z: number }): P {
    const s = this.host.snap();
    return s
      ? [Math.round(at.x / s) * s, Math.round(at.z / s) * s]
      : [Math.round(at.x * 10) / 10, Math.round(at.z * 10) / 10];
  }

  /** The left button down at `at`: true if it's this tool's (a point picked to drag), not a pan. */
  down(at: Ground): boolean {
    if (this.o.mode !== "edit" || !at) return false;
    const p = this.pointNear(at);
    if (!p) return false;
    const locked = wayLocked(p.key);
    if (locked) {
      toast(tr("godWayLocked").replace("{why}", locked), "warn");
      return true;
    }
    this.drag = p;
    return true;
  }
  /** The pointer moved with the button down (a point dragged, or a whole way). */
  move(at: Ground) {
    if (this.wayDrag && at) this.wayDrag.at = this.snapped(at);
    if (!this.drag || !at) return;
    this.drag.pts[this.drag.k] = this.snapped(at);
  }
  /** The button up: a point dragged put down; or a click (`click`) — a point, a pick, a removal. */
  up(at: Ground, click: boolean, e: { clientX: number; clientY: number; altKey: boolean }) {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      const why = wayBlocked(d.pts);
      if (why) toast(tr("godWayBlocked").replace("{why}", why), "warn");
      else this.host.change(changeWay(this.host.draft(), d.key, { pts: d.pts }));
      return;
    }
    if (!click || !at) return;
    const o = this.o;
    const now = performance.now();
    const twice =
      now - this.lastClick.t < DOUBLE_MS && Math.hypot(e.clientX - this.lastClick.x, e.clientY - this.lastClick.y) < 8;
    this.lastClick = { t: now, x: e.clientX, y: e.clientY };
    if (o.mode === "draw") {
      if (twice && this.pts.length >= 2) return this.finish();
      const raw = this.snapped(at);
      // (an end: on the way it's dropped near — the first now, the last when it's ended)
      const j = this.pts.length ? { p: raw, to: null } : snapEnd(raw, this.reach());
      this.pts.push(j.p);
      this.joins.push(j.to);
      this.status();
    } else if (o.mode === "remove") {
      const hit = wayAt(at.x, at.z, this.reach());
      if (!hit) return;
      const locked = wayLocked(hit.w.key);
      if (locked) return void toast(tr("godWayLocked").replace("{why}", locked), "warn");
      this.host.change(removeWay(this.host.draft(), hit.w.key));
      toast(tr("godWayRemoved").replace("{name}", hit.w.name));
    } else {
      const p = this.pointNear(at);
      if (p && e.altKey) {
        // (Alt: that point out — two at least stay)
        if (p.pts.length <= 2 || wayLocked(p.key)) return;
        p.pts.splice(p.k, 1);
        this.host.change(changeWay(this.host.draft(), p.key, { pts: p.pts }));
        return;
      }
      const hit = wayAt(at.x, at.z, this.reach());
      if (!hit) return this.setO({ sel: null });
      const def = this.pick(hit.w.key);
      if (!def) return;
      if (p || wayLocked(def.key)) return;
      // a click on its line, not at a point: one put in there
      const q = this.snapped(at);
      const k = insertAt(def.pts, q) + 1;
      const pts = [...def.pts.slice(0, k), q, ...def.pts.slice(k)];
      if (!wayBlocked(pts)) this.host.change(changeWay(this.host.draft(), def.key, { pts }));
    }
  }
  /** A way picked: the row's then its width, pavements and lamps. */
  private pick(key: string) {
    const def = wayDefOf(key);
    if (!def) return null;
    this.setO({
      sel: { key: def.key, name: def.name, locked: wayLocked(def.key) },
      kind: def.kind,
      w: def.w,
      pave: (def.pave ?? 0) > 0,
      lamps: def.lamps ?? WAY_DEFAULTS[def.kind].lamps,
    });
    return def;
  }
  /** The way under `at` (Select's), its key; or null. */
  hits(at: { x: number; z: number }): string | null {
    return wayAt(at.x, at.z, this.reach())?.w.key ?? null;
  }
  /** Select: the way under `at` picked up to drag whole (true); one that stays picked, and said. */
  grabWay(at: Ground): boolean {
    const key = at && this.hits(at);
    const def = key ? wayDefOf(key) : null;
    if (!at || !def) return false;
    const locked = wayLocked(def.key);
    if (locked) {
      this.pick(def.key);
      toast(tr("godWayLocked").replace("{why}", locked), "warn");
      return true;
    }
    const p = this.snapped(at);
    this.wayDrag = { key: def.key, from: p, at: p, pts: def.pts.map((q) => [q[0], q[1]] as P) };
    return true;
  }
  private moved(d: NonNullable<RoadsTool["wayDrag"]>): P[] {
    const dx = d.at[0] - d.from[0];
    const dz = d.at[1] - d.from[1];
    return d.pts.map(([x, z]) => [x + dx, z + dz] as P);
  }
  /** Select: the button up — the way dragged put down where it is, or (not moved) picked. */
  upWay() {
    const d = this.wayDrag;
    this.wayDrag = null;
    if (!d) return;
    if (d.at[0] === d.from[0] && d.at[1] === d.from[1]) return void this.pick(d.key);
    const pts = this.moved(d);
    const why = wayBlocked(pts);
    if (why) return void toast(tr("godWayBlocked").replace("{why}", why), "warn");
    this.host.change(changeWay(this.host.draft(), d.key, { pts }));
    this.pick(d.key);
  }
  /** The picked way taken away (Select's Delete). */
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    if (sel.locked) return void toast(tr("godWayLocked").replace("{why}", sel.locked), "warn");
    this.host.change(removeWay(this.host.draft(), sel.key));
    toast(tr("godWayRemoved").replace("{name}", sel.name));
    this.setO({ sel: null });
  }
  deselect() {
    this.setO({ sel: null });
  }
  private pointNear(at: { x: number; z: number }): { key: string; k: number; pts: P[] } | null {
    const hit = wayAt(at.x, at.z, this.reach() * 2);
    const def = hit && wayDefOf(hit.w.key);
    if (!def) return null;
    let best = -1;
    let bd = this.reach();
    for (const [k, [x, z]] of def.pts.entries()) {
      const d = Math.hypot(x - at.x, z - at.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best < 0 ? null : { key: def.key, k: best, pts: def.pts.map((p) => [p[0], p[1]] as P) };
  }

  /** The way being drawn, ended: a new way (its last point on a way it's dropped near). */
  finish() {
    if (this.pts.length < 2) return;
    const o = this.o;
    const last = snapEnd(this.pts[this.pts.length - 1], this.reach());
    const pts = [...this.pts.slice(0, -1), last.p];
    const why = wayBlocked(pts);
    if (why) return void toast(tr("godWayBlocked").replace("{why}", why), "warn");
    const d = this.host.draft();
    const key = newWayKey(d);
    this.host.change(
      addWay(d, {
        key,
        kind: o.kind,
        name: newWayName(d, o.kind),
        w: o.w,
        pts,
        pave: o.pave ? PAVE : 0,
        lamps: o.lamps,
      }),
    );
    this.cancel();
  }
  /** The way being drawn let go (Esc), or its last point taken back (Backspace). */
  cancel() {
    this.pts = [];
    this.joins = [];
    this.setO({ drawing: null });
  }
  back() {
    this.pts.pop();
    this.joins.pop();
    if (!this.pts.length) return this.cancel();
    this.status();
  }
  get drawing(): boolean {
    return this.pts.length > 0;
  }
  private status(extra?: P, extraJoin?: string | null) {
    const pts = extra ? [...this.pts, extra] : this.pts;
    // (what it joins: the end under the pointer's, else the first point's)
    const joins = extraJoin ?? this.joins.find((j) => j) ?? null;
    this.setO({
      drawing: {
        n: this.pts.length,
        m: Math.round(pts.length > 1 ? wayLength(pts) : 0),
        blocked: wayBlocked(pts),
        joins: joins ? (wayDefOf(joins)?.name ?? joins) : null,
      },
    });
  }

  /** The row's settings: a new way's, or (Edit points) the picked one changed — a step. */
  setOpts(p: Partial<Pick<GodHud["roads"], "kind" | "w" | "pave" | "lamps">>) {
    const o = this.o;
    const next = { ...p };
    // (a new way's kind: its own width, pavements and lamps)
    if (p.kind && p.kind !== o.kind && o.mode !== "edit") Object.assign(next, WAY_DEFAULTS[p.kind]);
    this.setO(next);
    if (o.mode !== "edit" || !o.sel) return;
    // (the shuttle's: wider or lit, not another kind)
    if (o.sel.locked && p.kind) return;
    const patch: Parameters<typeof changeWay>[2] = {};
    if (p.kind) patch.kind = p.kind;
    if (p.w !== undefined) patch.w = p.w;
    if (p.pave !== undefined) patch.pave = p.pave ? PAVE : 0;
    if (p.lamps !== undefined) patch.lamps = p.lamps;
    this.host.change(changeWay(this.host.draft(), o.sel.key, patch));
  }

  /** The width shown as it's dragged (the picked way changed only when it's let go: setOpts). */
  preview(w: number) {
    this.setO({ w });
  }

  /** Each frame: the ghost — the way being drawn to the pointer, the point dragged, or the way
   *  under the pointer (Edit points, Remove). */
  frame(at: Ground, f: Frame, only = false) {
    this.ghost ??= new RoadGhost(this.scene);
    const o = this.o;
    if (only) {
      // (Select's: the way dragged, else the one under the pointer, else the picked one)
      const d = this.wayDrag;
      if (d) {
        const pts = this.moved(d);
        return this.ghost.show(pts, wayDefOf(d.key)?.w ?? o.w, !wayBlocked(pts), null, f);
      }
      const key = (at && this.hits(at)) ?? o.sel?.key ?? null;
      const def = key ? wayDefOf(key) : null;
      return this.ghost.show(def?.pts ?? null, def?.w ?? 0, !wayLocked(key ?? ""), null, f);
    }
    if (this.drag) {
      this.ghost.show(this.drag.pts, wayDefOf(this.drag.key)?.w ?? o.w, !wayBlocked(this.drag.pts), null, f);
      return;
    }
    if (o.mode === "draw") {
      if (!this.pts.length) {
        // (where it'd start: on a way it'd join)
        const j = at ? snapEnd(this.snapped(at), this.reach()) : null;
        this.ghost.show(j ? [j.p] : null, o.w, true, j?.to ? j.p : null, f);
        return;
      }
      const next = at ? this.snapped(at) : null;
      const end = next ? snapEnd(next, this.reach()) : null;
      const pts = end ? [...this.pts, end.p] : this.pts;
      const blocked = wayBlocked(pts);
      this.ghost.show(pts, o.w, !blocked, end?.to ? end.p : this.joins[0] ? this.pts[0] : null, f);
      const key = `${pts.length}|${pts[pts.length - 1]}|${end?.to}`;
      if (key !== this.hover) {
        this.hover = key;
        this.status(end?.p, end?.to);
      }
      return;
    }
    // edit, remove: the way under the pointer (the picked one, editing)
    const hit = at ? wayAt(at.x, at.z, this.reach()) : null;
    const key = hit?.w.key ?? (o.mode === "edit" ? (o.sel?.key ?? null) : null);
    const def = key ? wayDefOf(key) : null;
    this.ghost.show(def?.pts ?? null, def?.w ?? 0, o.mode !== "remove" && !wayLocked(key ?? ""), null, f);
  }
  hide() {
    this.ghost?.show(null, 0, true, null, { x: 0, z: 0, y: 0 });
  }
  dispose() {
    this.ghost?.dispose();
    this.ghost = null;
  }
}
