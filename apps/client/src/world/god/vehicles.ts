import type { WorldObjectDef } from "@yutopia/shared";
import {
  addVehicle,
  type CarRole,
  changeVehicle,
  godLook,
  homeProps,
  homesOf,
  isCarKind,
  movedProps,
  newVehicleKey,
  parkAt,
  parkedPose,
  removeVehicle,
  vehicleSteps,
} from "@yutopia/shared/car";
import { heightAt, inLandBounds, waterAt } from "@yutopia/shared/grounds";
import { buildingAt } from "@yutopia/shared/grounds-buildings";
import { sectionEffects } from "@yutopia/shared/grounds-draft";
import type { GroundsEdits, VehicleDef } from "@yutopia/shared/grounds-edits";
import type { Scene } from "three";
import { tr } from "@/lib/i18n";
import type { Cars } from "../car/cars";
import { type GodHud, hud, toast } from "../store";
import { ThingGhost } from "./thing-ghost";

// God mode's vehicles (docs/plan/102-god-mode-vehicles.md): the draft's vehicles drawn for the admin alone (the world's
// with the draft's changes laid over them — the server's own reconcile, shared car/homes.ts vehicleSteps); Select's
// vehicle — picked under the pointer, dragged to move it, R to turn it, Delete to take it away; one in use (driven,
// ridden, rolling) shown, not picked; a player's own moved only. And the Vehicles tool's: the kind and look held under
// the pointer (its own model, its box green where it can stand, red where it can't), a click to place it — its home.

type Frame = { y: number };
type Ground = { x: number; z: number; h: number } | null;
export interface VehiclesHost {
  /** the draft's edits (what's published, none open) */
  draft(): GroundsEdits;
  /** what's published (what the world's vehicles are now) */
  published(): GroundsEdits;
  change(next: GroundsEdits): void;
  snap(): GodHud["snap"];
  cars(): Cars | null;
  objects(): Iterable<WorldObjectDef>;
}
const RAD = Math.PI / 180;
const GHOST = "god:ghost";
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class VehiclesTool {
  private ghost: ThingGhost | null = null;
  // the draft's vehicles as drawn: built again when the draft, what's published or the world's objects change
  private view = new Map<string, WorldObjectDef | null>();
  private viewOf: { draft: GroundsEdits | null; pub: GroundsEdits | null; objs: number } = {
    draft: null,
    pub: null,
    objs: -1,
  };
  private held: WorldObjectDef | null = null;
  // one dragged (Select's): its key, its pose when picked up, where it is now, the grab's offset
  private drag: {
    key: string;
    from: { x: number; z: number; a: number };
    x: number;
    z: number;
    a: number;
    off: [number, number];
  } | null = null;

  constructor(
    private readonly host: VehiclesHost,
    private readonly scene: Scene,
  ) {}

  private get o() {
    return hud.get().god.vehicles;
  }
  private setO(p: Partial<GodHud["vehicles"]>) {
    hud.set((s) => ({ god: { ...s.god, vehicles: { ...s.god.vehicles, ...p } } }));
  }
  private object(id: string): WorldObjectDef | null {
    for (const o of this.host.objects()) if (o.id === id) return o;
    return null;
  }

  // ── the draft's vehicles, drawn ──
  /** The draft's vehicles as the cars draw them (each frame: built again only when something changed). */
  showDraft() {
    const draft = this.host.draft();
    const pub = this.host.published();
    const objs = hud.get().objectsVersion;
    const v = this.viewOf;
    if (v.draft !== draft || v.pub !== pub || v.objs !== objs) {
      this.viewOf = { draft, pub, objs };
      this.view = this.build(pub, draft);
    }
    const cars = this.host.cars();
    if (!cars) return;
    const dr = this.drag;
    if (dr) {
      // (the one dragged: where it's held, at once)
      const base = this.view.get(dr.key) ?? this.object(dr.key);
      if (base) {
        const view = new Map(this.view);
        view.set(dr.key, this.placed(base, dr.x, dr.z, dr.a, true));
        return cars.setGodView(view, this.held);
      }
    }
    cars.setGodView(this.view.size ? this.view : null, this.held);
  }
  /** The world's vehicles as the draft leaves them: by id, the object then (null: taken away). */
  private build(pub: GroundsEdits, draft: GroundsEdits): Map<string, WorldObjectDef | null> {
    const out = new Map<string, WorldObjectDef | null>();
    for (const st of vehicleSteps(pub, draft, sectionEffects)) {
      const o = this.object(st.id);
      if ("home" in st) {
        const h = st.home;
        out.set(st.id, {
          id: st.id,
          kind: "car",
          ...parkAt(h.x, h.z, h.a, heightAt(h.x, h.z), homeProps(h, o?.props ?? {})),
        });
      } else if ("gone" in st) out.set(st.id, null);
      else if (!o || o.kind !== "car") continue;
      else if (!st.once) {
        if (!o.props?.ownerId) out.set(st.id, null);
      } else {
        const pose = parkedPose(o);
        const c = st.once;
        const props = movedProps(o.props ?? {}, c, 0);
        out.set(st.id, this.placed({ ...o, props }, c.x ?? pose.x, c.z ?? pose.y, c.a ?? pose.a, false));
      }
    }
    return out;
  }
  /** `o` set down at (x, z) heading `a` (`now`: drawn there at once — held, dragged). */
  private placed(o: WorldObjectDef, x: number, z: number, a: number, now: boolean): WorldObjectDef {
    const props = { ...(o.props ?? {}) };
    if (now) props.ghost = 1;
    else delete props.ghost;
    return { ...o, ...parkAt(x, z, a, heightAt(x, z), props) };
  }
  hideDraft() {
    this.host.cars()?.setGodView(null, null);
    this.viewOf = { draft: null, pub: null, objs: -1 };
    this.held = null;
  }

  // ── Select's ──
  /** The vehicle under `at` (Select's): its id, in use or not. */
  hits(at: { x: number; z: number }): { id: string; inUse: boolean } | null {
    return this.host.cars()?.godVehicleAt(at.x, at.z) ?? null;
  }
  /** The vehicle under `at` picked up to drag (true); one in use said so (true: the press is this tool's). */
  grab(at: Ground): boolean {
    if (!at) return false;
    const hit = this.hits(at);
    if (!hit) return false;
    if (hit.inUse) {
      toast(tr("godVehicleInUse"), "warn");
      return true;
    }
    const v = this.host.cars()?.godVehicle(hit.id);
    if (!v) return false;
    this.drag = {
      key: hit.id,
      from: { x: v.x, z: v.z, a: v.a },
      x: v.x,
      z: v.z,
      a: v.a,
      off: [v.x - at.x, v.z - at.z],
    };
    return true;
  }
  private snapped(x: number, z: number): [number, number] {
    const s = this.host.snap();
    return s ? [Math.round(x / s) * s, Math.round(z / s) * s] : [r2(x), r2(z)];
  }
  move(at: Ground) {
    const dr = this.drag;
    if (!dr || !at) return;
    [dr.x, dr.z] = this.snapped(at.x + dr.off[0], at.z + dr.off[1]);
  }
  /** The button up: the one dragged put down where it is (a step), or a click on it: picked. */
  up() {
    const dr = this.drag;
    if (!dr) return;
    this.drag = null;
    const moved = Math.hypot(dr.x - dr.from.x, dr.z - dr.from.z) > 0.05 || Math.abs(dr.a - dr.from.a) > 0.001;
    if (moved) {
      const why = this.blocked(dr.x, dr.z, dr.key);
      if (why) toast(tr("godThingBlocked").replace("{why}", why), "warn");
      else this.host.change(changeVehicle(this.host.draft(), dr.key, { x: dr.x, z: dr.z, a: r3(dr.a) }));
    }
    this.pick(dr.key);
  }
  get dragging(): boolean {
    return !!this.drag;
  }
  /** Picked: the panel's. */
  pick(key: string) {
    const v = this.host.cars()?.godVehicle(key);
    const o = this.object(key);
    if (!v) return this.setO({ sel: null });
    const draft = this.host.draft();
    const home = homesOf(draft).find((h) => h.id === key) ?? null;
    const real = o ? parkedPose(o) : null;
    this.setO({
      sel: {
        key,
        kind: v.kind,
        owned: !!o?.props?.ownerId,
        home: !!home,
        placed: !!draft.vehicles?.add?.some((d) => d.key === key),
        // (a home whose vehicle stands away from it: "send home")
        away: !!(home && real && Math.hypot(real.x - home.x, real.y - home.z) > 1.5),
        variant: v.look.variant,
        colour: v.look.colour,
        colour2: v.look.colour2 ?? null,
        role: (typeof o?.props?.role === "string" ? o.props.role : (home?.role ?? "")) as GodHud["vehicles"]["role"],
        plate: typeof o?.props?.plate === "string" ? o.props.plate : (home?.plate ?? ""),
      },
    });
  }
  deselect() {
    this.setO({ sel: null });
  }
  /** R: the one dragged (or picked) turned 15° (Shift: back); held to place, its heading. */
  turn(by: number) {
    const dr = this.drag;
    if (dr) {
      dr.a += by * RAD;
      return;
    }
    const sel = this.o.sel;
    if (!sel) return this.setO({ a: Math.round((((this.o.a + by) % 360) + 360) % 360) });
    const v = this.host.cars()?.godVehicle(sel.key);
    if (v) this.host.change(changeVehicle(this.host.draft(), sel.key, { a: r3(v.a + by * RAD) }));
  }
  /** The wheel: the one dragged, or the one held to place, turned `by` degrees. */
  wheelTurn(by: number) {
    if (this.drag) this.drag.a += by * RAD;
    else if (!this.o.sel) this.setO({ a: Math.round((((this.o.a + by) % 360) + 360) % 360) });
  }
  /** Delete: the picked one taken away (a player's own: never). */
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    if (sel.owned) return void toast(tr("godVehicleOwned"), "warn");
    this.host.change(removeVehicle(this.host.draft(), sel.key));
    this.setO({ sel: null });
  }
  /** The panel's: the picked one's variant, colours, role, plate changed (a step; a player's own: never). */
  setPicked(
    p: Partial<Pick<NonNullable<GodHud["vehicles"]["sel"]>, "variant" | "colour" | "colour2" | "role" | "plate">>,
  ) {
    const sel = this.o.sel;
    if (!sel) return;
    if (sel.owned) return void toast(tr("godVehicleOwned"), "warn");
    const next = { ...sel, ...p };
    this.setO({ sel: next });
    const patch: Partial<Omit<VehicleDef, "key">> = {};
    if (p.variant !== undefined || p.colour !== undefined || p.colour2 !== undefined)
      patch.look = {
        variant: next.variant,
        colour: next.colour,
        ...(next.colour2 !== null && { colour2: next.colour2 }),
      };
    if (p.role !== undefined) patch.role = p.role;
    if (p.plate !== undefined) patch.plate = p.plate.toUpperCase().slice(0, 8);
    this.host.change(changeVehicle(this.host.draft(), sel.key, patch));
  }

  // ── the Vehicles tool's: placing ──
  /** Why a vehicle can't stand at (x, z) (`self`: the one moved), or null. */
  blocked(x: number, z: number, self?: string): string | null {
    if (!inLandBounds(x, z)) return tr("godVehicleOff");
    if (waterAt(x, z)) return tr("godVehicleWater");
    if (buildingAt(x, z)) return tr("godVehicleBuilding");
    const other = this.hits({ x, z });
    if (other && other.id !== self && other.id !== GHOST) return tr("godVehicleOther");
    return null;
  }
  /** A click with the Vehicles tool: the kind and look held placed there (a step). */
  place(at: Ground) {
    if (!at) return;
    const o = this.o;
    if (!isCarKind(o.kind)) return;
    const [x, z] = this.snapped(at.x, at.z);
    const why = this.blocked(x, z);
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    const d = this.host.draft();
    const def: VehicleDef = {
      key: newVehicleKey(d),
      model: o.kind,
      x,
      z,
      a: r3(o.a * RAD),
      look: { variant: o.variant, colour: o.colour, ...(o.colour2 !== null && { colour2: o.colour2 }) },
      ...(o.role && { role: o.role as CarRole }),
    };
    this.host.change(addVehicle(d, def));
  }

  /** Each frame: the box round what's under the pointer (else the picked one; dragged, where it's held — red where it
   *  can't stand); with the Vehicles tool (`placing`), the one held under the pointer. */
  frame(at: Ground, f: Frame, placing: boolean) {
    this.ghost ??= new ThingGhost(this.scene);
    const cars = this.host.cars();
    const o = this.o;
    const dr = this.drag;
    if (dr) {
      const v = cars?.godVehicle(dr.key);
      const why = this.blocked(dr.x, dr.z, dr.key);
      if (v) this.ghost.show({ x: dr.x, z: dr.z }, -dr.a, v.foot, 1, why ? "no" : "ok", f);
      this.held = null;
      return;
    }
    const over = at && !placing ? this.hits(at) : null;
    const shown = over?.id ?? o.sel?.key ?? null;
    const v = shown ? cars?.godVehicle(shown) : null;
    if (v && !placing) {
      this.held = null;
      return this.ghost.show({ x: v.x, z: v.z }, -v.a, v.foot, 1, over?.inUse ? "no" : "picked", f);
    }
    if (!placing || !at || !isCarKind(o.kind)) {
      this.held = null;
      return this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
    }
    // the one held: its own model, where it'd stand
    const [x, z] = this.snapped(at.x, at.z);
    const a = o.a * RAD;
    const look = godLook({ variant: o.variant, colour: o.colour, ...(o.colour2 !== null && { colour2: o.colour2 }) });
    const props: Record<string, unknown> = { level: 0, model: o.kind, look, ghost: 1, ...(o.role && { role: o.role }) };
    this.held = { id: GHOST, kind: "car", ...parkAt(x, z, a, heightAt(x, z), props) };
    const why = this.blocked(x, z);
    const g = cars?.godVehicle(GHOST);
    if (g) this.ghost.show({ x, z }, -a, g.foot, 1, why ? "no" : "ok", f);
    else this.ghost.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", f);
    if (why !== o.blocked) this.setO({ blocked: why });
  }
  hide() {
    this.held = null;
    this.ghost?.show(null, 0, [0, 0, 0, 0, 0], 1, "ok", { y: 0 });
  }
  dispose() {
    this.hideDraft();
    this.ghost?.dispose();
    this.ghost = null;
  }
}
