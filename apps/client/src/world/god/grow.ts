import { checkEdits, growDefs, terrainAt } from "@yutopia/shared/grounds";
import type { GroundsEdits, GrowDef } from "@yutopia/shared/grounds-edits";
import { GROW_LIMITS, GROW_SNAP } from "@yutopia/shared/grow";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop, type Scene } from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";

// God mode grows the land (docs/plan/69-the-long-road.md, phase 10): the grow tool. A drag on the
// ground draws a new piece, a rect on the chunks' grid (GROW_SNAP) from the press to the release —
// its outline laid over the land, green where it can go, red with why (the shared rule book's:
// joined to the land, none over another, its size); let go, it's the draft's, with the panel's
// biome and lift. A click inside a piece picks it (the panel then changes its biome, lift and
// name); Delete takes it away (refused while a road or a thing stands on it). Every piece in the
// draft outlined faintly while the tool's on, the picked one (or the one under the pointer)
// brighter. The pieces are god mode's own: changed in the draft's `land.add`, never `change`.

type Frame = { y: number };
type Ground = { x: number; z: number; h: number } | null;
type Rect = { x0: number; z0: number; x1: number; z1: number };
export interface GrowHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  /** how many times the draft's been laid (the land's heights made again) */
  laid?(): number;
}

const AMBER = 0xf1d79a; // (the HUD's lamp: --amber)
const RED = 0xc8553f; // (--rust)
const GREEN = 0x8aa04a; // (--good)
const STEP = 8; // the outline's samples along a side (m)
const UP = 0.6; // over the land

// ── the pieces as data (plain: the tests') ─────────────────────────────────────
/** The rect a drag from `a` to `b` draws: out to the grid round both (GROW_SNAP), a cell at least. */
export function snapRect(a: { x: number; z: number }, b: { x: number; z: number }, snap = GROW_SNAP): Rect {
  const x0 = Math.floor(Math.min(a.x, b.x) / snap) * snap;
  const z0 = Math.floor(Math.min(a.z, b.z) / snap) * snap;
  const x1 = Math.max(x0 + snap, Math.ceil(Math.max(a.x, b.x) / snap) * snap);
  const z1 = Math.max(z0 + snap, Math.ceil(Math.max(a.z, b.z) / snap) * snap);
  return { x0, z0, x1, z1 };
}
/** The piece (x, z) is in (its far edges out), the last laid first. */
export function growAt(defs: readonly GrowDef[], x: number, z: number): GrowDef | null {
  for (let i = defs.length - 1; i >= 0; i--) {
    const d = defs[i];
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return null;
}
/** A new piece's key: god-land-n, the first n the draft hasn't. */
export function newGrowKey(e: GroundsEdits): string {
  const taken = new Set([...(e.land?.add ?? []).map((d) => d.key), ...(e.land?.remove ?? [])]);
  let n = 1;
  while (taken.has(`god-land-${n}`)) n++;
  return `god-land-${n}`;
}
export function addGrow(e: GroundsEdits, d: GrowDef): GroundsEdits {
  return { ...e, land: { ...e.land, add: [...(e.land?.add ?? []), d] } };
}
/** A piece changed where it's added (a `change` it had folded in); undefined fields dropped. */
export function changeGrow(e: GroundsEdits, key: string, patch: Partial<Omit<GrowDef, "key">>): GroundsEdits {
  const change = { ...(e.land?.change ?? {}) };
  const was = change[key];
  delete change[key];
  const add = (e.land?.add ?? []).map((d) => {
    if (d.key !== key) return d;
    const next: GrowDef = { ...d, ...was, ...patch };
    for (const k of Object.keys(next) as (keyof GrowDef)[]) if (next[k] === undefined) delete next[k];
    return next;
  });
  return { ...e, land: tidy({ ...e.land, add, change }) };
}
/** A piece taken away: gone from the draft (it's only ever god mode's own: nothing to `remove`). */
export function removeGrow(e: GroundsEdits, key: string): GroundsEdits {
  const change = { ...(e.land?.change ?? {}) };
  delete change[key];
  return {
    ...e,
    land: tidy({
      add: (e.land?.add ?? []).filter((d) => d.key !== key),
      change,
      remove: (e.land?.remove ?? []).filter((k) => k !== key),
    }),
  };
}
// (empty parts left out, as the draft's merge writes them)
function tidy(s: NonNullable<GroundsEdits["land"]>): NonNullable<GroundsEdits["land"]> {
  const out: NonNullable<GroundsEdits["land"]> = {};
  if (s.add?.length) out.add = s.add;
  if (s.change && Object.keys(s.change).length) out.change = s.change;
  if (s.remove?.length) out.remove = s.remove;
  return out;
}
/** What a change brings that wasn't wrong before (the first of it), or null. */
export function newProblem(before: readonly string[], after: readonly string[]): string | null {
  const was = new Set(before);
  return after.find((p) => !was.has(p)) ?? null;
}

// ── an outline on the land ─────────────────────────────────────────────────────
class Outline {
  readonly line: LineLoop;
  private readonly mat = new LineBasicMaterial({ transparent: true, depthTest: false });
  private key = "";
  private lay: unknown = null;

  constructor(scene: Scene) {
    this.line = new LineLoop(new BufferGeometry(), this.mat);
    this.line.renderOrder = 21;
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
  }
  /** Round `r`, over the land (sampled every STEP m), in `color`; `lay`: the land laid now (its
   *  heights may have changed). */
  show(r: Rect | null, f: Frame, color: number, opacity: number, lay: unknown) {
    if (!r) {
      this.line.visible = false;
      return;
    }
    this.line.visible = true;
    this.mat.color.setHex(color);
    this.mat.opacity = opacity;
    const k = `${r.x0},${r.z0},${r.x1},${r.z1},${f.y}`;
    if (k === this.key && lay === this.lay) return;
    this.key = k;
    this.lay = lay;
    const pts: number[] = [];
    const put = (x: number, z: number) => pts.push(x, terrainAt(x, z) + UP + f.y, z);
    const side = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
      for (let i = 0; i < n; i++) put(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
    };
    side(r.x0, r.z0, r.x1, r.z0);
    side(r.x1, r.z0, r.x1, r.z1);
    side(r.x1, r.z1, r.x0, r.z1);
    side(r.x0, r.z1, r.x0, r.z0);
    this.line.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    this.line.geometry = g;
  }
  dispose() {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    this.mat.dispose();
  }
}

export class GrowTool {
  // a piece being drawn: from where it was pressed to where the pointer is
  private drag: { from: { x: number; z: number }; at: { x: number; z: number } } | null = null;
  private ghost: Outline | null = null;
  private outlines: Outline[] = [];
  // the rule book's word on the draft as it is (each new piece judged by what it adds), and on the
  // rect being drawn
  private before: { d: GroundsEdits; problems: string[] } | null = null;
  private judged: { d: GroundsEdits; k: string; why: string | null } | null = null;

  constructor(
    private readonly host: GrowHost,
    private readonly scene: Scene,
  ) {}

  private get o() {
    return hud.get().god.grow;
  }
  private setO(p: Partial<GodHud["grow"]>) {
    hud.set((s) => ({ god: { ...s.god, grow: { ...s.god.grow, ...p } } }));
  }
  /** What's wrong with the draft as it is (once a draft). */
  private problems(d: GroundsEdits): string[] {
    if (this.before?.d !== d) this.before = { d, problems: checkEdits(d) };
    return this.before.problems;
  }
  /** Why `next` can't be (what it brings that `d` hadn't wrong), or null. */
  private why(d: GroundsEdits, next: GroundsEdits): string | null {
    return newProblem(this.problems(d), checkEdits(next));
  }
  /** The piece the panel would lay over `r` in draft `d`. */
  private def(d: GroundsEdits, r: Rect): GrowDef {
    const lift = Math.round(this.o.lift);
    return { key: newGrowKey(d), biome: this.o.biome, ...r, ...(lift && { lift }) };
  }
  get drawing(): boolean {
    return !!this.drag;
  }

  /** The left button down on the land: a piece drawn from here (or, let go where it was, a click). */
  down(at: Ground): boolean {
    if (!at) return false;
    this.drag = { from: { x: at.x, z: at.z }, at: { x: at.x, z: at.z } };
    return true;
  }
  move(at: Ground) {
    if (this.drag && at) this.drag.at = { x: at.x, z: at.z };
  }
  /** Let go: a click picks the piece under it (nothing: the picked one let go); a drag lays the
   *  piece drawn — refused with why. */
  up(at: Ground, click: boolean) {
    const dr = this.drag;
    this.drag = null;
    this.setO({ drawing: null, blocked: null });
    if (!dr) return;
    const d = this.host.draft();
    if (click) {
      const p = growAt(growDefs(d), dr.from.x, dr.from.z);
      return p ? this.pick(p) : this.deselect();
    }
    const b = this.def(d, snapRect(dr.from, at ?? dr.at));
    const next = addGrow(d, b);
    const why = this.why(d, next);
    if (why) return void toast(tr("godLandBlocked").replace("{why}", why), "warn");
    this.host.change(next);
    this.setO({ sel: b.key, name: "" });
  }
  cancel() {
    this.drag = null;
    this.setO({ drawing: null, blocked: null });
  }
  private pick(p: GrowDef) {
    this.setO({ sel: p.key, biome: p.biome, lift: p.lift ?? 0, name: p.name ?? "" });
  }
  deselect() {
    if (this.o.sel) this.setO({ sel: null, name: "" });
  }
  /** The panel's: the next piece's, or the picked one's changed (a step: `commit`) — refused with why. */
  setOpts(p: Partial<Pick<GodHud["grow"], "biome" | "lift" | "name">>, commit = true) {
    const lift = p.lift === undefined ? undefined : Math.max(-GROW_LIMITS.lift, Math.min(GROW_LIMITS.lift, p.lift));
    this.setO({ ...p, ...(lift !== undefined && { lift }) });
    const sel = this.o.sel;
    if (!sel || !commit) return;
    const d = this.host.draft();
    const cur = growDefs(d).find((x) => x.key === sel);
    if (!cur) return;
    const o = this.o;
    const name = o.name.trim().slice(0, 40);
    const patch = { biome: o.biome, lift: Math.round(o.lift) || undefined, name: name || undefined };
    if (cur.biome === patch.biome && (cur.lift ?? undefined) === patch.lift && (cur.name ?? undefined) === patch.name)
      return;
    const next = changeGrow(d, sel, patch);
    const why = this.why(d, next);
    if (why) return void toast(tr("godLandBlocked").replace("{why}", why), "warn");
    this.host.change(next);
  }
  /** Delete: the picked piece taken away — refused while what's on it would be left past the edge. */
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    const d = this.host.draft();
    const next = removeGrow(d, sel);
    const why = this.why(d, next);
    if (why) return void toast(tr("godLandStays").replace("{why}", why), "warn");
    this.host.change(next);
    this.setO({ sel: null, name: "" });
  }

  /** Each frame: every piece outlined (the picked one, or the one under the pointer, brighter), the
   *  one being drawn green or red. */
  frame(at: Ground, f: Frame) {
    const d = this.host.draft();
    const defs = growDefs(d);
    const o = this.o;
    const lay = this.host.laid?.() ?? d;
    // (undone, say: the picked one gone)
    if (o.sel && !defs.some((x) => x.key === o.sel)) this.setO({ sel: null, name: "" });
    const over = at && !this.drag ? growAt(defs, at.x, at.z) : null;
    while (this.outlines.length < defs.length) this.outlines.push(new Outline(this.scene));
    for (const [i, line] of this.outlines.entries()) {
      const p = defs[i];
      const lit = p && (p.key === o.sel || p.key === over?.key);
      line.show(p ?? null, f, AMBER, lit ? 1 : 0.4, lay);
    }
    this.ghost ??= new Outline(this.scene);
    const dr = this.drag;
    if (!dr) return this.ghost.show(null, f, GREEN, 1, lay);
    const r = snapRect(dr.from, dr.at);
    const k = `${r.x0},${r.z0},${r.x1},${r.z1},${o.biome},${o.lift}`;
    if (this.judged?.d !== d || this.judged.k !== k)
      this.judged = { d, k, why: this.why(d, addGrow(d, this.def(d, r))) };
    const why = this.judged.why;
    this.ghost.show(r, f, why ? RED : GREEN, 1, lay);
    const was = o.drawing;
    if (why !== o.blocked || was?.x0 !== r.x0 || was.z0 !== r.z0 || was.x1 !== r.x1 || was.z1 !== r.z1)
      this.setO({ blocked: why, drawing: r });
  }
  hide() {
    for (const l of this.outlines) l.show(null, { y: 0 }, AMBER, 0, null);
    this.ghost?.show(null, { y: 0 }, GREEN, 0, null);
  }
  dispose() {
    for (const l of this.outlines) l.dispose();
    this.outlines = [];
    this.ghost?.dispose();
    this.ghost = null;
  }
}
