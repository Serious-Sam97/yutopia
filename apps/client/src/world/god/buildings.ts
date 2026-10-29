import { type BuildingKind, NATIVE_FACES, PREFABS } from "@yutopia/shared/grounds";
import {
  addBuilding,
  buildingAt,
  buildingBlocked,
  buildingDefOf,
  buildingLocked,
  changeBuilding,
  newBuildingKey,
  newBuildingName,
  plotAt,
  removeBuilding,
  SIGNED,
} from "@yutopia/shared/grounds-buildings";
import type { BuildingDef, GroundsEdits } from "@yutopia/shared/grounds-edits";
import type { Scene } from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";
import { ThingGhost } from "./thing-ghost";

// God mode's buildings tool (docs/plan/53-the-god-mode.md, phase 9; the mock 07-buildings). The
// panel's prefab (its kind, size, floors, door, walls, sign, whether you walk in) under the
// pointer as the box it'll take up — green where it can go, red with why (on a road, on another,
// too steep for its pad, on what's anchored); a click puts it down; R turns it a quarter (its
// sides swapped, its door round). Any building — a new one or the generator's — dragged moves
// it; a click picks it (the panel then changes it); Delete takes it away. What's anchored stays.

type Frame = { x: number; z: number; y: number };
type Ground = { x: number; z: number; h: number } | null;
type Face = GodHud["buildings"]["face"];
export interface BuildingsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
}
// R: a quarter clockwise from above (n → e → s → w)
const CLOCKWISE: Record<Face, Face> = { n: "e", e: "s", s: "w", w: "n" };
const FLOOR_H = 3.8;

export class BuildingsTool {
  private ghost: ThingGhost | null = null;
  // a building dragged: its key, where it was picked up from, where it is now
  private drag: { key: string; from: [number, number]; at: [number, number]; d: BuildingDef } | null = null;

  constructor(
    private readonly host: BuildingsHost,
    private readonly scene: Scene,
  ) {}

  private get o() {
    return hud.get().god.buildings;
  }
  private setO(p: Partial<GodHud["buildings"]>) {
    hud.set((s) => ({ god: { ...s.god, buildings: { ...s.god.buildings, ...p } } }));
  }
  /** The prefab as it'd be put down round (x, z). */
  private def(x: number, z: number, key: string): BuildingDef {
    const o = this.o;
    const d = this.host.draft();
    return {
      key,
      kind: o.kind,
      name: o.name.trim() || newBuildingName(d, o.kind),
      ...plotAt(x, z, o.w, o.d),
      floors: o.floors,
      face: o.face,
      ...(o.enter && { enter: true }),
      ...(o.tint && { tint: o.tint }),
      ...(SIGNED.has(o.kind) && o.sign.trim() && { sign: o.sign.trim().slice(0, 24) }),
    };
  }

  /** The left button down: a building under it picked up to drag (true), else not this tool's. */
  down(at: Ground): boolean {
    if (!at) return false;
    const key = buildingAt(at.x, at.z);
    const d = key ? buildingDefOf(key) : null;
    if (!key || !d) return false;
    const why = buildingLocked(key);
    if (why) {
      toast(tr("godThingLocked").replace("{why}", why), "warn");
      return true;
    }
    this.drag = { key, from: [at.x, at.z], at: [at.x, at.z], d };
    return true;
  }
  move(at: Ground) {
    if (this.drag && at) this.drag.at = [at.x, at.z];
  }
  up(at: Ground, click: boolean) {
    const dr = this.drag;
    if (dr) {
      this.drag = null;
      const dx = Math.round(dr.at[0] - dr.from[0]);
      const dz = Math.round(dr.at[1] - dr.from[1]);
      if (!dx && !dz) return this.pick(dr.key);
      const next = changeBuilding(this.host.draft(), dr.key, {
        x0: dr.d.x0 + dx,
        z0: dr.d.z0 + dz,
        x1: dr.d.x1 + dx,
        z1: dr.d.z1 + dz,
      });
      const why = buildingBlocked(next, dr.key);
      if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
      this.host.change(next);
      return;
    }
    if (!click || !at) return;
    const d = this.host.draft();
    const b = this.def(at.x, at.z, newBuildingKey(d));
    const next = addBuilding(d, b);
    const why = buildingBlocked(next, b.key);
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    this.host.change(next);
    this.setO({ sel: { key: b.key, locked: null }, name: b.name });
  }
  private pick(key: string) {
    const d = buildingDefOf(key);
    if (!d) return;
    this.setO({
      sel: { key, locked: buildingLocked(key) },
      kind: d.kind,
      w: d.x1 - d.x0,
      d: d.z1 - d.z0,
      floors: d.floors,
      face: d.face,
      tint: d.tint ?? null,
      enter: !!d.enter,
      name: d.name,
      sign: d.sign ?? "",
    });
  }
  /** The panel's: the next one's, or the picked one's changed (a step) — refused with why. */
  setOpts(p: Partial<Omit<GodHud["buildings"], "sel" | "blocked">>, commit = true) {
    const was = this.o;
    const next = { ...was, ...p };
    // (a new kind: within its limits; walked into: a door its inside has)
    const lim = PREFABS[next.kind];
    if (lim) {
      next.w = Math.max(lim.min, Math.min(lim.max, next.w));
      next.d = Math.max(lim.min, Math.min(lim.max, next.d));
      next.floors = Math.max(1, Math.min(lim.floors, next.floors));
    }
    const native = NATIVE_FACES[next.kind];
    if (next.enter && native && !native.includes(next.face)) next.face = native[0];
    this.setO(next);
    const sel = was.sel;
    if (!sel || !commit) return;
    if (sel.locked) return void toast(tr("godThingLocked").replace("{why}", sel.locked), "warn");
    const cur = buildingDefOf(sel.key);
    if (!cur) return;
    const cx = (cur.x0 + cur.x1) / 2;
    const cz = (cur.z0 + cur.z1) / 2;
    const patch: Partial<BuildingDef> = {
      name: next.name.trim() || cur.name,
      floors: next.floors,
      face: next.face,
      enter: next.enter || undefined,
      tint: next.tint ?? undefined,
      sign: SIGNED.has(next.kind) ? next.sign.trim().slice(0, 24) || undefined : undefined,
      ...plotAt(cx, cz, next.w, next.d),
    };
    const after = changeBuilding(this.host.draft(), sel.key, patch);
    const why = buildingBlocked(after, sel.key);
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    this.host.change(after);
  }
  setKind(kind: BuildingKind) {
    const lim = PREFABS[kind];
    const w = lim ? Math.round((lim.min + lim.max) / 2) : 12;
    const d = lim ? Math.max(lim.min, w - 2) : 10;
    this.setO({ kind, sel: null, w, d, floors: 1, face: NATIVE_FACES[kind]?.[0] ?? "s", name: "", sign: "" });
  }
  /** R: a quarter turn — its sides swapped, its door round (the picked one's too). */
  turn() {
    const o = this.o;
    let face = CLOCKWISE[o.face];
    const native = NATIVE_FACES[o.kind];
    // (walked into: round to the next door its inside has)
    if (o.enter && native) for (let i = 0; i < 4 && !native.includes(face); i++) face = CLOCKWISE[face];
    this.setOpts({ w: o.d, d: o.w, face });
  }
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    if (sel.locked) return void toast(tr("godThingLocked").replace("{why}", sel.locked), "warn");
    this.host.change(removeBuilding(this.host.draft(), sel.key));
    this.setO({ sel: null });
  }
  deselect() {
    this.setO({ sel: null });
  }

  /** Each frame: the box — the building dragged, the prefab to put down, the one under the pointer
   *  (or the one picked). */
  frame(at: Ground, f: Frame, only = false) {
    this.ghost ??= new ThingGhost(this.scene);
    const o = this.o;
    const box = (d: BuildingDef, tone: "ok" | "no" | "picked") => {
      const w = d.x1 - d.x0;
      const dd = d.z1 - d.z0;
      this.ghost?.show(
        { x: (d.x0 + d.x1) / 2, z: (d.z0 + d.z1) / 2 },
        0,
        [-w / 2, -dd / 2, w / 2, dd / 2, d.floors * FLOOR_H + 2],
        1,
        tone,
        f,
      );
    };
    const dr = this.drag;
    if (dr) {
      const dx = Math.round(dr.at[0] - dr.from[0]);
      const dz = Math.round(dr.at[1] - dr.from[1]);
      const moved = { ...dr.d, x0: dr.d.x0 + dx, z0: dr.d.z0 + dz, x1: dr.d.x1 + dx, z1: dr.d.z1 + dz };
      const why = buildingBlocked(changeBuilding(this.host.draft(), dr.key, moved), dr.key);
      box(moved, why ? "no" : "ok");
      if (why !== o.blocked) this.setO({ blocked: why });
      return;
    }
    const over = at ? buildingAt(at.x, at.z) : null;
    const shown = over ?? o.sel?.key ?? null;
    const d = shown ? buildingDefOf(shown) : null;
    if (d) {
      box(d, "picked");
      if (o.blocked) this.setO({ blocked: null });
      return;
    }
    // (Select's: nothing to put down)
    if (!at || only) return this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
    const b = this.def(at.x, at.z, "god-building-ghost");
    const why = buildingBlocked(addBuilding(this.host.draft(), b), b.key);
    box(b, why ? "no" : "ok");
    if (why !== o.blocked) this.setO({ blocked: why });
  }
  hide() {
    this.ghost?.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", { x: 0, z: 0, y: 0 });
  }
  dispose() {
    this.ghost?.dispose();
    this.ghost = null;
  }
}
