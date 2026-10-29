import { ANCHORED, type P } from "@yutopia/shared/grounds";
import type { GroundsEdits, ThingDef } from "@yutopia/shared/grounds-edits";
import {
  addThing,
  catalogThing,
  changeThing,
  newThingKey,
  removeThing,
  thingAt,
  thingAtOf,
  thingBlocked,
  thingDefOf,
} from "@yutopia/shared/grounds-things";
import type { Scene } from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";
import { RoadGhost } from "./road-ghost";
import { ThingGhost } from "./thing-ghost";

// God mode's things tool (docs/plan/53-the-god-mode.md, phase 8; the mock 06-things). Place: the
// catalog's kind under the pointer (its box: green where it can go, red with why where it can't),
// R turns it, a click puts it down. A line (fences): a click a point, a double-click or Enter ends
// it, Esc lets it go. Any thing — a new one or the generator's — dragged moves it; a click picks
// it (the panel then turns it, sizes it, changes its words; Delete takes it away); Alt and a
// click takes its kind for the catalog. What's anchored stays (a toast says why). Each a step.

type Frame = { x: number; z: number; y: number };
type Ground = { x: number; z: number; h: number } | null;
export interface ThingsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  up(): number;
  snap(): GodHud["snap"];
}
const DOUBLE_MS = 350;
const RAD = Math.PI / 180;

export class ThingsTool {
  private ghost: ThingGhost | null = null;
  private line: RoadGhost | null = null;
  private pts: P[] = [];
  private lastClick = { t: 0, x: 0, y: 0 };
  // a thing dragged: its key, where it was picked up from, where it is now
  private drag: { key: string; from: P; at: P; d: ThingDef } | null = null;

  constructor(
    private readonly host: ThingsHost,
    private readonly scene: Scene,
  ) {}

  private get o() {
    return hud.get().god.things;
  }
  private setO(p: Partial<GodHud["things"]>) {
    hud.set((s) => ({ god: { ...s.god, things: { ...s.god.things, ...p } } }));
  }
  private reach() {
    return Math.max(1.5, this.host.up() * 0.03);
  }
  private snapped(at: { x: number; z: number }): P {
    const s = this.host.snap();
    return s
      ? [Math.round(at.x / s) * s, Math.round(at.z / s) * s]
      : [Math.round(at.x * 10) / 10, Math.round(at.z * 10) / 10];
  }
  private locked(key: string): string | null {
    return ANCHORED[key] ?? null;
  }

  /** The left button down: a thing under it picked up to drag (true), else not this tool's. */
  down(at: Ground): boolean {
    if (this.o.mode === "line") return false;
    return this.grab(at);
  }
  /** The thing under `at` (Select's), its key; or null. */
  hits(at: { x: number; z: number }): string | null {
    return thingAt(at.x, at.z, this.reach());
  }
  /** The thing under `at` picked up to drag (true): the tool's in any mode, and Select's. */
  grab(at: Ground): boolean {
    if (!at) return false;
    const key = thingAt(at.x, at.z, this.reach());
    const d = key ? thingDefOf(key) : null;
    if (!key || !d) return false;
    const why = this.locked(key);
    if (why) {
      toast(tr("godThingLocked").replace("{why}", why), "warn");
      return true;
    }
    const p = thingAtOf(d);
    this.drag = { key, from: p, at: p, d };
    return true;
  }
  move(at: Ground) {
    if (this.drag && at) this.drag.at = this.snapped(at);
  }
  /** The button up: a dragged thing put down where it is; or a click (`click`). */
  up(at: Ground, click: boolean, e: { clientX: number; clientY: number; altKey: boolean }) {
    const dr = this.drag;
    if (dr) {
      this.drag = null;
      const [dx, dz] = [dr.at[0] - dr.from[0], dr.at[1] - dr.from[1]];
      if (Math.hypot(dx, dz) < 0.05) return this.pick(dr.key, e.altKey);
      const why = thingBlocked(dr.d.kind, dr.at[0], dr.at[1]);
      if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
      const patch: Partial<ThingDef> = { x: dr.d.x + dx, z: dr.d.z + dz };
      if (dr.d.pts) patch.pts = dr.d.pts.map(([x, z]) => [x + dx, z + dz] as P);
      this.host.change(changeThing(this.host.draft(), dr.key, patch));
      return;
    }
    if (!click || !at) return;
    const now = performance.now();
    const twice =
      now - this.lastClick.t < DOUBLE_MS && Math.hypot(e.clientX - this.lastClick.x, e.clientY - this.lastClick.y) < 8;
    this.lastClick = { t: now, x: e.clientX, y: e.clientY };
    const o = this.o;
    const p = this.snapped(at);
    if (o.mode === "line") {
      if (twice && this.pts.length >= 2) return this.finish();
      this.pts.push(p);
      this.status();
      return;
    }
    // place: the catalog's kind there
    const why = thingBlocked(o.kind, p[0], p[1]);
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    const d = this.host.draft();
    const c = catalogThing(o.kind);
    const t: ThingDef = {
      key: newThingKey(d),
      kind: o.kind,
      // (a bench is kept by its corner: its middle's where it's put)
      x: o.kind === "bench" ? p[0] - 1 : p[0],
      z: o.kind === "bench" ? p[1] - 0.5 : p[1],
      ry: o.ry * RAD,
      ...(c.sized && o.s !== 1 && { s: o.s }),
      ...(c.text && { text: o.text.slice(0, 40) }),
    };
    this.host.change(addThing(d, t));
  }
  /** Picked: the panel's (Alt: only its kind, for putting more down). */
  private pick(key: string, kindOnly: boolean) {
    const d = thingDefOf(key);
    if (!d) return;
    if (kindOnly) return this.setO({ kind: d.kind, mode: d.kind === "fence" ? "line" : "place" });
    this.setO({
      sel: { key, kind: d.kind, locked: this.locked(key) },
      kind: d.kind,
      ry: Math.round(((((d.ry / RAD) % 360) + 360) % 360) * 10) / 10,
      s: d.s ?? 1,
      text: d.text ?? "",
    });
  }
  /** The panel's turn, size, words: the next one's, or the picked one's changed (a step). */
  setOpts(p: Partial<Pick<GodHud["things"], "ry" | "s" | "text">>, commit = true) {
    this.setO(p);
    const sel = this.o.sel;
    if (!sel || !commit || sel.locked) return;
    const patch: Partial<ThingDef> = {};
    if (p.ry !== undefined) patch.ry = p.ry * RAD;
    if (p.s !== undefined && catalogThing(sel.kind).sized) patch.s = p.s;
    if (p.text !== undefined && catalogThing(sel.kind).text) patch.text = p.text.slice(0, 40);
    if (Object.keys(patch).length) this.host.change(changeThing(this.host.draft(), sel.key, patch));
  }
  /** The picked one taken away (Delete). */
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    if (sel.locked) return void toast(tr("godThingLocked").replace("{why}", sel.locked), "warn");
    this.host.change(removeThing(this.host.draft(), sel.key));
    this.setO({ sel: null });
  }
  deselect() {
    this.setO({ sel: null });
  }
  setKind(kind: GodHud["things"]["kind"]) {
    this.cancel();
    this.setO({ kind, sel: null, mode: kind === "fence" ? "line" : "place", s: 1 });
  }
  /** R: turned 15° (Shift: back). */
  turn(by: number) {
    this.setOpts({ ry: (((this.o.ry + by) % 360) + 360) % 360 });
  }

  // a fence along a line
  finish() {
    if (this.pts.length < 2) return;
    const pts = this.pts;
    const d = this.host.draft();
    const blocked = pts.map(([x, z]) => thingBlocked("fence", x, z)).find(Boolean);
    if (blocked) return void toast(tr("godThingBlocked").replace("{why}", blocked), "warn");
    this.host.change(addThing(d, { key: newThingKey(d), kind: "fence", x: pts[0][0], z: pts[0][1], ry: 0, pts }));
    this.cancel();
  }
  cancel() {
    this.pts = [];
    this.setO({ drawing: null });
  }
  back() {
    this.pts.pop();
    if (!this.pts.length) return this.cancel();
    this.status();
  }
  get drawing() {
    return this.pts.length > 0;
  }
  private status() {
    let m = 0;
    for (let i = 1; i < this.pts.length; i++)
      m += Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]);
    this.setO({ drawing: { n: this.pts.length, m: Math.round(m) } });
  }

  /** Each frame: the ghost — the thing dragged, the kind to put down, the thing under the pointer
   *  (or the one picked); a fence's line as it's drawn. */
  frame(at: Ground, f: Frame, only = false) {
    this.ghost ??= new ThingGhost(this.scene);
    this.line ??= new RoadGhost(this.scene);
    const o = this.o;
    if (o.mode === "line" && !only) {
      const next = at ? this.snapped(at) : null;
      const pts = next ? [...this.pts, next] : this.pts;
      this.line.show(pts.length ? pts : null, 0.3, !pts.some(([x, z]) => thingBlocked("fence", x, z)), null, f);
      this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
      return;
    }
    this.line.show(null, 0, true, null, f);
    const dr = this.drag;
    if (dr) {
      const c = catalogThing(dr.d.kind);
      const why = thingBlocked(dr.d.kind, dr.at[0], dr.at[1]);
      this.ghost.show({ x: dr.at[0], z: dr.at[1] }, dr.d.ry, c.foot, dr.d.s ?? 1, why ? "no" : "ok", f);
      if (why !== o.blocked) this.setO({ blocked: why });
      return;
    }
    const over = at ? thingAt(at.x, at.z, this.reach()) : null;
    const shown = over ?? o.sel?.key ?? null;
    const d = shown ? thingDefOf(shown) : null;
    if (d) {
      const p = thingAtOf(d);
      this.ghost.show({ x: p[0], z: p[1] }, d.ry, catalogThing(d.kind).foot, d.s ?? 1, "picked", f);
      if (o.blocked) this.setO({ blocked: null });
      return;
    }
    // (Select's: nothing to put down)
    if (!at || only) return this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
    const p = this.snapped(at);
    const why = thingBlocked(o.kind, p[0], p[1]);
    const c = catalogThing(o.kind);
    this.ghost.show({ x: p[0], z: p[1] }, o.ry * RAD, c.foot, c.sized ? o.s : 1, why ? "no" : "ok", f);
    if (why !== o.blocked) this.setO({ blocked: why });
  }
  hide() {
    this.ghost?.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", { x: 0, z: 0, y: 0 });
    this.line?.show(null, 0, true, null, { x: 0, z: 0, y: 0 });
  }
  dispose() {
    this.ghost?.dispose();
    this.line?.dispose();
    this.ghost = null;
    this.line = null;
  }
}
