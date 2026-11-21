import { isKit, KINDS, layoutOf } from "@yutopia/shared/building-styles";
import { type Building, type BuildingKind, PREFABS, terrainAt } from "@yutopia/shared/grounds";
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
} from "@yutopia/shared/grounds-buildings";
import type { BuildingDef, GroundsEdits } from "@yutopia/shared/grounds-edits";
import { DoubleSide, Mesh, MeshBasicMaterial, type Scene, Shape, ShapeGeometry } from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";
import { ThingGhost } from "./thing-ghost";

// God mode's buildings tool (docs/plan/53-the-god-mode.md, phase 9; the mock 07-buildings; plan 110 F10a). The
// panel's building (its kind, style, colours, size, floors, door, sign, whether you walk in, shut or open) under
// the pointer as the box it'll take up, as tall as its layout — green where it can go, red with why (on a road, on
// another, too steep for its pad, on what's anchored); a click puts it down; R turns it a quarter (its sides
// swapped, its door round). Any building — a new one or the generator's — dragged moves it; the picked one's
// corners dragged size it; a click picks it (the panel then changes it, its kind too); Delete takes it away.
// What's anchored stays.

type Frame = { y: number };
type Ground = { x: number; z: number; h: number } | null;
type Face = GodHud["buildings"]["face"];
export interface BuildingsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
}
// R: a quarter clockwise from above (n → e → s → w)
const CLOCKWISE: Record<Face, Face> = { n: "e", e: "s", s: "w", w: "n" };
const FLOOR_H = 3.8;
/** How near a picked building's corner a press takes the corner (m). */
const CORNER = 1.6;
const signed = (k: BuildingKind) => isKit(k) && KINDS[k].sign;
const enterable = (k: BuildingKind) => !isKit(k) || KINDS[k].enter;
const colOf = (c: GodHud["buildings"]["colours"]) => (Object.values(c).some(Boolean) ? { ...c } : undefined);
// which way out of its door each side looks (the Grounds' coords: north is −z)
const OUT: Record<Face, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/** An arrow on the ground, out of a building's door: which way it faces (flat, along +x). */
function doorArrow(): Mesh {
  const a = new Shape();
  a.moveTo(0, -0.7);
  a.lineTo(3.2, -0.7);
  a.lineTo(3.2, -1.7);
  a.lineTo(5.6, 0);
  a.lineTo(3.2, 1.7);
  a.lineTo(3.2, 0.7);
  a.lineTo(0, 0.7);
  a.closePath();
  const g = new ShapeGeometry(a).rotateX(-Math.PI / 2);
  const m = new Mesh(
    g,
    new MeshBasicMaterial({ color: 0xf1d79a, depthTest: false, transparent: true, opacity: 0.9, side: DoubleSide }),
  );
  m.renderOrder = 22;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

export class BuildingsTool {
  private ghost: ThingGhost | null = null;
  private arrow: Mesh | null = null;
  // a building dragged: its key, where it was picked up from, where it is now
  private drag: { key: string; from: [number, number]; at: [number, number]; d: BuildingDef } | null = null;
  // a picked building's corner dragged: which (its x and z ends), where it's at
  private corner: { key: string; cx: 0 | 1; cz: 0 | 1; at: [number, number]; d: BuildingDef } | null = null;

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
      ...(o.enter && enterable(o.kind) && { enter: true }),
      ...(o.tint && { tint: o.tint }),
      ...(o.style && { style: o.style }),
      ...(colOf(o.colours) && { colours: colOf(o.colours) }),
      ...(o.vacant && { vacant: true }),
      ...(signed(o.kind) && o.sign.trim() && { sign: o.sign.trim().slice(0, 24) }),
    };
  }

  /** The left button down: a building under it picked up to drag (true), else not this tool's. */
  down(at: Ground): boolean {
    if (!at) return false;
    // (the picked one's corner: sized)
    const sel = this.o.sel;
    const sd = sel && !sel.locked ? buildingDefOf(sel.key) : null;
    if (sel && sd)
      for (const cx of [0, 1] as const)
        for (const cz of [0, 1] as const)
          if (Math.hypot(at.x - (cx ? sd.x1 : sd.x0), at.z - (cz ? sd.z1 : sd.z0)) < CORNER) {
            this.corner = { key: sel.key, cx, cz, at: [at.x, at.z], d: sd };
            return true;
          }
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
    if (this.corner && at) this.corner.at = [at.x, at.z];
  }
  /** A corner dragged to `at`: the plot with that corner there, its other where it was, within its kind's limits. */
  private sized(c: NonNullable<BuildingsTool["corner"]>): BuildingDef {
    const lim = PREFABS[c.d.kind] ?? { min: 4, max: 60 };
    const ox = c.cx ? c.d.x0 : c.d.x1;
    const oz = c.cz ? c.d.z0 : c.d.z1;
    const w = Math.max(lim.min, Math.min(lim.max, Math.round(Math.abs(c.at[0] - ox))));
    const d = Math.max(lim.min, Math.min(lim.max, Math.round(Math.abs(c.at[1] - oz))));
    return {
      ...c.d,
      x0: c.cx ? ox : ox - w,
      x1: c.cx ? ox + w : ox,
      z0: c.cz ? oz : oz - d,
      z1: c.cz ? oz + d : oz,
    };
  }
  up(at: Ground, click: boolean) {
    const co = this.corner;
    if (co) {
      this.corner = null;
      const s = this.sized(co);
      if (s.x0 === co.d.x0 && s.x1 === co.d.x1 && s.z0 === co.d.z0 && s.z1 === co.d.z1) return;
      const next = changeBuilding(this.host.draft(), co.key, { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 });
      const why = buildingBlocked(next, co.key);
      if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
      this.host.change(next);
      this.setO({ w: s.x1 - s.x0, d: s.z1 - s.z0 });
      return;
    }
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
      style: d.style ?? null,
      colours: { ...(d.colours ?? {}) },
      vacant: !!d.vacant,
    });
  }
  /** The panel's: the next one's, or the picked one's changed (a step) — refused with why. */
  setOpts(p: Partial<Omit<GodHud["buildings"], "sel" | "blocked">>, commit = true) {
    const was = this.o;
    const next = { ...was, ...p };
    // (a new kind: within its limits; its style one of its kind's; walked into only if its kind is)
    const lim = PREFABS[next.kind];
    if (lim) {
      next.w = Math.max(lim.min, Math.min(lim.max, next.w));
      next.d = Math.max(lim.min, Math.min(lim.max, next.d));
      next.floors = Math.max(lim.minFloors, Math.min(lim.floors, next.floors));
    }
    if (next.style && isKit(next.kind) && !KINDS[next.kind].styles.some((st) => st.id === next.style))
      next.style = null;
    if (next.style !== was.style || next.kind !== was.kind) if (!("colours" in p)) next.colours = {};
    if (!enterable(next.kind)) next.enter = false;
    this.setO(next);
    const sel = was.sel;
    if (!sel || !commit) return;
    if (sel.locked) return void toast(tr("godThingLocked").replace("{why}", sel.locked), "warn");
    const cur = buildingDefOf(sel.key);
    if (!cur) return;
    const cx = (cur.x0 + cur.x1) / 2;
    const cz = (cur.z0 + cur.z1) / 2;
    const patch: Partial<BuildingDef> = {
      ...(next.kind !== cur.kind && { kind: next.kind }),
      name: next.name.trim() || cur.name,
      floors: next.floors,
      face: next.face,
      enter: next.enter || undefined,
      tint: next.tint ?? undefined,
      style: next.style ?? undefined,
      colours: colOf(next.colours),
      vacant: next.vacant || undefined,
      sign: signed(next.kind) ? next.sign.trim().slice(0, 24) || undefined : undefined,
      ...plotAt(cx, cz, next.w, next.d),
    };
    const after = changeBuilding(this.host.draft(), sel.key, patch);
    const why = buildingBlocked(after, sel.key);
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    this.host.change(after);
  }
  /** A kind: the next one's — or the picked one's changed to it, where it stands (plan 110 F10a). */
  setKind(kind: BuildingKind) {
    const lim = PREFABS[kind];
    const sel = this.o.sel;
    if (sel && !sel.locked) {
      this.setOpts({ kind, style: null, colours: {}, floors: lim?.minFloors ?? 1 });
      return;
    }
    const w = lim ? Math.round((lim.min + lim.max) / 2) : 12;
    const d = lim ? Math.max(lim.min, w - 2) : 10;
    const floors = lim ? Math.max(lim.minFloors, Math.min(lim.floors, 2)) : 1;
    this.setO({
      kind,
      sel: null,
      w,
      d,
      floors,
      face: "s",
      name: "",
      sign: "",
      style: null,
      colours: {},
      vacant: false,
      enter: false,
    });
  }
  /** R: a quarter turn — its sides swapped, its door round (the picked one's too). */
  turn() {
    const o = this.o;
    this.setOpts({ w: o.d, d: o.w, face: CLOCKWISE[o.face] });
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
    if (!this.arrow) {
      this.arrow = doorArrow();
      this.scene.add(this.arrow);
    }
    const o = this.o;
    // (`by`: drawn that far off its plot — sliding with the pointer; it's put down on whole metres)
    const box = (d: BuildingDef, tone: "ok" | "no" | "picked", by: [number, number] = [0, 0]) => {
      const w = d.x1 - d.x0;
      const dd = d.z1 - d.z0;
      const cx = (d.x0 + d.x1) / 2 + by[0];
      const cz = (d.z0 + d.z1) / 2 + by[1];
      // (as tall as it'll stand: its layout's top)
      const top = layoutOf(d as Building)?.top ?? d.floors * FLOOR_H + 2;
      this.ghost?.show({ x: cx, z: cz }, 0, [-w / 2, -dd / 2, w / 2, dd / 2, top], 1, tone, f);
      // the arrow out of its door, a metre off the wall
      const [ox, oz] = OUT[d.face];
      const ax = cx + ox * (w / 2 + 1);
      const az = cz + oz * (dd / 2 + 1);
      const a = this.arrow as Mesh;
      a.visible = true;
      a.position.set(ax, terrainAt(ax, az) + f.y + 0.3, az);
      a.rotation.y = Math.atan2(-oz, ox);
      // (as big as the building's half across, 6.7 m at least: read from high up)
      a.scale.setScalar(Math.max(1.2, Math.min(w, dd) / 9));
    };
    const co = this.corner;
    if (co) {
      const s = this.sized(co);
      const why = buildingBlocked(changeBuilding(this.host.draft(), co.key, s), co.key);
      box(s, why ? "no" : "ok");
      if (why !== o.blocked) this.setO({ blocked: why });
      return;
    }
    const dr = this.drag;
    if (dr) {
      const fx = dr.at[0] - dr.from[0];
      const fz = dr.at[1] - dr.from[1];
      const dx = Math.round(fx);
      const dz = Math.round(fz);
      const moved = { ...dr.d, x0: dr.d.x0 + dx, z0: dr.d.z0 + dz, x1: dr.d.x1 + dx, z1: dr.d.z1 + dz };
      const why = buildingBlocked(changeBuilding(this.host.draft(), dr.key, moved), dr.key);
      box(moved, why ? "no" : "ok", [fx - dx, fz - dz]);
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
    if (!at || only) {
      if (this.arrow) this.arrow.visible = false;
      return this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
    }
    const b = this.def(at.x, at.z, "god-building-ghost");
    const why = buildingBlocked(addBuilding(this.host.draft(), b), b.key);
    box(b, why ? "no" : "ok", [at.x - (b.x0 + b.x1) / 2, at.z - (b.z0 + b.z1) / 2]);
    if (why !== o.blocked) this.setO({ blocked: why });
  }
  hide() {
    this.ghost?.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", { y: 0 });
    if (this.arrow) this.arrow.visible = false;
  }
  dispose() {
    this.ghost?.dispose();
    this.ghost = null;
    if (this.arrow) {
      this.arrow.removeFromParent();
      this.arrow.geometry.dispose();
      (this.arrow.material as MeshBasicMaterial).dispose();
      this.arrow = null;
    }
  }
}
