import { byteFace, faceByte, parseAvatar } from "@yutopia/shared";
import { inLandBounds, terrainAt, waterAt } from "@yutopia/shared/grounds";
import { buildingAt } from "@yutopia/shared/grounds-buildings";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import {
  type NpcPlaceDef,
  PLACE_LIMITS,
  type PlacedType,
  placeOf,
  placesOf,
  type RoutePoint,
} from "@yutopia/shared/npc/places";
import type { Structure } from "@yutopia/shared/structure";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Raycaster,
  type Scene,
  Vector2,
} from "three";
import { cast } from "@/lib/admin";
import { tr } from "@/lib/i18n";
import { type GodFloor, type GodHud, type GodNpcRow, hud, toast } from "../store";
import type { Body3, ThirdPersonView } from "../tp/view";

// God mode's NPCs (docs/plan/121-npcs-on-the-map.md, phases 7–9): the cast listed (the API's: the made ones and the
// town's, not Vortex — F3.2a), one held under the pointer as themselves and put down with a click (R turns them), then
// what their type needs — a circle's size (wander), stops clicked one after another (route, Enter ends it), a home (a
// town building clicked) —; Select's NPC picked, dragged, turned, taken off the map. All of it the draft's `npcs`
// section (F1a), one place each (F2a). Inside (F4c, F4.1a): a town building's storey or a studio floor shown with its
// outside cut away (the 3D view's level, the controller's viewLevel), the pointer on that floor's plane. The draft's
// placed people drawn for the admin alone (tp.godBodies), their circles and routes as lines.

type Frame = { y: number };
/** A spot on a floor: the land (level 0) or the inside shown. */
export type Spot = { x: number; z: number; level: number } | null;
export interface NpcsHost {
  draft(): GroundsEdits;
  published(): GroundsEdits;
  change(next: GroundsEdits): void;
  snap(): GodHud["snap"];
  tp(): ThirdPersonView | null;
  structure(): Structure | null;
  /** the land's height under (x, z) where people stand on it (the world's grid) */
  ground(x: number, z: number): number;
}
const RAD = Math.PI / 180;
const AMBER = 0xf1d79a;
const GREEN = 0x8fd18a;
const RED = 0xe0705a;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const PICK_R = 0.9;

/** Every NPC placed as these edits have them, kept whole in `add` (a placement's change folded in). */
export function putPlace(e: GroundsEdits, d: NpcPlaceDef): GroundsEdits {
  const s = e.npcs ?? {};
  const add = (s.add ?? []).filter((p) => p.key !== d.key);
  const change = { ...(s.change ?? {}) };
  delete change[d.key];
  const remove = (s.remove ?? []).filter((k) => k !== d.key);
  return {
    ...e,
    npcs: {
      add: [...add, d],
      ...(Object.keys(change).length ? { change } : {}),
      ...(remove.length ? { remove } : {}),
    },
  };
}
export function dropPlace(e: GroundsEdits, key: string): GroundsEdits {
  const s = e.npcs;
  if (!s) return e;
  const add = (s.add ?? []).filter((p) => p.key !== key);
  const change = { ...(s.change ?? {}) };
  delete change[key];
  const remove = (s.remove ?? []).filter((k) => k !== key);
  const out = { ...e };
  if (add.length || Object.keys(change).length || remove.length)
    out.npcs = {
      ...(add.length ? { add } : {}),
      ...(Object.keys(change).length ? { change } : {}),
      ...(remove.length ? { remove } : {}),
    };
  else delete out.npcs;
  return out;
}

export class NpcsTool {
  private readonly root = new Group();
  private readonly lines: Line[] = [];
  private readonly ray = new Raycaster();
  private looks = new Map<string, ReturnType<typeof parseAvatar>>();
  private loading = false;
  /** the pointer's spot this frame (the held one drawn there) */
  private at: Spot = null;
  /** the world's placed NPCs (`place:<key>`) the draft moves or takes off the map: not drawn for the admin, the
   *  draft's own drawn instead */
  hidden: ReadonlySet<string> = new Set();
  // one dragged: its key, where it is now, the grab's offset
  private drag: { key: string; x: number; z: number; off: [number, number]; moved: boolean } | null = null;

  constructor(
    private readonly host: NpcsHost,
    scene: Scene,
  ) {
    this.root.renderOrder = 999;
    scene.add(this.root);
  }

  private get o() {
    return hud.get().god.npcs;
  }
  private setO(p: Partial<GodHud["npcs"]>) {
    hud.set((s) => ({ god: { ...s.god, npcs: { ...s.god.npcs, ...p } } }));
  }
  private row(key: string): GodNpcRow | undefined {
    return this.o.cast?.find((r) => r.key === key);
  }
  private label(key: string): string {
    const r = this.row(key);
    return r?.name || r?.role || key;
  }
  private look(key: string) {
    const s = this.row(key)?.look ?? "";
    let l = this.looks.get(s);
    if (!l) {
      l = parseAvatar(s || "{}");
      this.looks.set(s, l);
    }
    return l;
  }

  // ── the cast ──
  /** The cast from the API (once; again on asking): the NPCs tool's list. */
  load(again = false) {
    if (this.loading || (this.o.cast && !again)) return;
    this.loading = true;
    cast
      .list()
      .then((r) => {
        this.setO({
          failed: false,
          cast: r.npcs
            .filter((d) => d.behaviour.type !== "vortex")
            .map((d) => ({
              key: d.key,
              name: d.name,
              role: d.role.en,
              town: d.town,
              type: d.behaviour.type,
              look: d.look ? JSON.stringify(d.look) : "",
            })),
        });
      })
      .catch(() => {
        this.setO({ failed: true });
        toast(tr("godNpcCastFailed"), "warn");
      })
      .finally(() => {
        this.loading = false;
      });
  }

  // ── where the pointer is ──
  /** The spot under the pointer: on the land, or (inside shown) on that floor's plane. */
  spotAt(clientX: number, clientY: number): Spot {
    const tp = this.host.tp();
    if (!tp) return null;
    const fl = this.o.floor;
    if (!fl) {
      const g = tp.landUnder(clientX, clientY);
      return g ? { x: g.x, z: g.z, level: 0 } : null;
    }
    // (the floor shown is the scene's 0)
    const r = tp.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    this.ray.setFromCamera(
      new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      tp.camera,
    );
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t, level: fl.level };
  }
  private snapped(x: number, z: number): [number, number] {
    const s = this.host.snap();
    return s ? [Math.round(x / s) * s, Math.round(z / s) * s] : [r2(x), r2(z)];
  }
  /** Why no one can stand at (x, z) of this floor, or null. */
  blocked(at: NonNullable<Spot>): string | null {
    if (at.level === 0) {
      if (!inLandBounds(at.x, at.z)) return tr("godNpcOff");
      if (waterAt(at.x, at.z)) return tr("godNpcWater");
      if (buildingAt(at.x, at.z)) return tr("godNpcBuilding");
      return null;
    }
    const f = this.host.structure()?.floors.find((q) => q.index === at.level);
    if (!f) return tr("godNpcFloorOff");
    const { x0, y0, w, h } = f.grid;
    return at.x >= x0 && at.x <= x0 + w && at.z >= y0 && at.z <= y0 + h ? null : tr("godNpcFloorOff");
  }

  // ── the draft's ──
  /** The placed one under `at` on its floor (the nearest within reach), or null. */
  hits(at: Spot): string | null {
    if (!at) return null;
    let best: string | null = null;
    let bd = PICK_R;
    for (const p of placesOf(this.host.draft())) {
      if (p.level !== at.level) continue;
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bd) {
        bd = d;
        best = p.key;
      }
    }
    return best;
  }
  /** One of the cast held to place (or, already placed, picked — the camera to them is the panel's). */
  hold(key: string | null) {
    if (key && this.row(key)?.type === "vortex") return void toast(tr("godNpcVortex"), "warn");
    this.setO({ held: key, step: "", sel: key && placeOf(this.host.draft(), key) ? key : this.o.sel });
  }
  pick(key: string | null) {
    this.setO({ sel: key, step: "", held: null });
  }
  deselect() {
    this.setO({ sel: null, step: "" });
  }
  /** A click with the NPCs tool: the held one put down; a step's (a route's stop, a home); else one picked. */
  click(at: Spot) {
    const o = this.o;
    if (!at) return;
    if (o.held) return this.place(at);
    if (o.sel && o.step === "route") return this.addStop(at);
    if (o.sel && o.step === "home") return this.setHome(at);
    this.pick(this.hits(at));
  }
  private place(at: NonNullable<Spot>) {
    const key = this.o.held;
    if (!key) return;
    const [x, z] = this.snapped(at.x, at.z);
    const why = this.blocked({ x, z, level: at.level });
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    const d = this.host.draft();
    const was = placeOf(d, key);
    // (placed again: their type's needs and home kept, the place new)
    const next: NpcPlaceDef = { ...(was ?? {}), key, x, z, a: r3(this.o.a * RAD), level: at.level };
    this.host.change(putPlace(d, next));
    toast(tr("godNpcPlaced").replace("{name}", this.label(key)), "info");
    this.setO({ held: null, sel: key, step: "" });
  }
  private addStop(at: NonNullable<Spot>) {
    const key = this.o.sel;
    const p = key ? placeOf(this.host.draft(), key) : undefined;
    if (!p) return;
    const [x, z] = this.snapped(at.x, at.z);
    const why = this.blocked({ x, z, level: at.level });
    if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
    const route: RoutePoint[] = [...(p.route ?? []), { x, z, level: at.level }].slice(0, PLACE_LIMITS.route);
    this.host.change(putPlace(this.host.draft(), { ...p, route }));
  }
  /** The route drawn so far: its last stop taken back (Backspace). */
  backStop() {
    const key = this.o.sel;
    const p = key ? placeOf(this.host.draft(), key) : undefined;
    if (!p?.route?.length) return;
    this.host.change(putPlace(this.host.draft(), { ...p, route: p.route.slice(0, -1) }));
  }
  private setHome(at: NonNullable<Spot>) {
    const key = this.o.sel;
    const p = key ? placeOf(this.host.draft(), key) : undefined;
    if (!p) return;
    const b = at.level === 0 ? buildingAt(at.x, at.z) : null;
    // (a town building with a ground storey to stay in: its space's — plan 112)
    const home = b && this.host.structure()?.floors.some((f) => f.space === b && (f.storey ?? 0) === 0) ? b : null;
    if (!home) return void toast(tr("godNpcNoHome"), "warn");
    this.host.change(putPlace(this.host.draft(), { ...p, home }));
    toast(tr("godNpcHome").replace("{name}", this.label(p.key)).replace("{home}", home), "info");
    this.setO({ step: "" });
  }
  /** The panel's: the picked one's placement changed (their type, circle, route's loop and pause, no home). */
  setPicked(patch: Partial<Omit<NpcPlaceDef, "key" | "x" | "z" | "level">> & { home?: string | undefined }) {
    const key = this.o.sel;
    const p = key ? placeOf(this.host.draft(), key) : undefined;
    if (!p) return;
    const next: NpcPlaceDef = { ...p, ...patch };
    for (const k of Object.keys(next) as (keyof NpcPlaceDef)[]) if (next[k] === undefined) delete next[k];
    this.host.change(putPlace(this.host.draft(), next));
  }
  setStep(step: GodHud["npcs"]["step"]) {
    this.setO({ step });
  }
  setType(type: PlacedType | "") {
    this.setPicked({ type: type || undefined });
  }
  /** R: the held one (or the picked one) turned 15° (Shift: back). */
  turn(by: number) {
    const sel = this.o.sel;
    if (this.o.held || !sel) return this.setO({ a: Math.round((((this.o.a + by) % 360) + 360) % 360) });
    const p = placeOf(this.host.draft(), sel);
    if (p) this.host.change(putPlace(this.host.draft(), { ...p, a: r3(p.a + by * RAD) }));
  }
  wheelTurn(by: number) {
    if (this.o.held) this.setO({ a: Math.round((((this.o.a + by) % 360) + 360) % 360) });
  }
  /** Delete: the picked one taken off the map. */
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    this.host.change(dropPlace(this.host.draft(), sel));
    this.setO({ sel: null, step: "" });
  }

  // ── Select's: dragged ──
  grab(at: Spot): boolean {
    const key = this.hits(at);
    const p = key ? placeOf(this.host.draft(), key) : undefined;
    if (!at || !key || !p) return false;
    this.drag = { key, x: p.x, z: p.z, off: [p.x - at.x, p.z - at.z], moved: false };
    return true;
  }
  move(at: Spot) {
    const dr = this.drag;
    if (!dr || !at) return;
    [dr.x, dr.z] = this.snapped(at.x + dr.off[0], at.z + dr.off[1]);
    dr.moved = true;
  }
  up() {
    const dr = this.drag;
    if (!dr) return;
    this.drag = null;
    const p = placeOf(this.host.draft(), dr.key);
    if (p && dr.moved && Math.hypot(dr.x - p.x, dr.z - p.z) > 0.05) {
      const why = this.blocked({ x: dr.x, z: dr.z, level: p.level });
      if (why) toast(tr("godThingBlocked").replace("{why}", why), "warn");
      else this.host.change(putPlace(this.host.draft(), { ...p, x: dr.x, z: dr.z }));
    }
    this.pick(dr.key);
  }
  get dragging(): boolean {
    return !!this.drag;
  }

  // ── the inside shown ──
  /** The insides God mode can show: each town building's storeys (by their space), the studio's floors above its
   *  ground. */
  floors(): GodFloor[] {
    const s = this.host.structure();
    if (!s) return [];
    const out: GodFloor[] = [];
    for (const f of s.floors) {
      if ((f as { away?: boolean }).away) continue;
      if (f.space !== undefined)
        out.push({ level: f.index, label: f.name || `${f.space} · ${f.storey ?? 0}`, z: f.z, cut: f.space });
      else if (f.index > 0 && !f.outdoor)
        out.push({ level: f.index, label: `Studio · ${f.name || f.index}`, z: f.z, cut: null });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  /** Where a floor's middle is (the camera's to it). */
  middleOf(level: number): { x: number; z: number } | null {
    const f = this.host.structure()?.floors.find((q) => q.index === level);
    return f ? { x: f.grid.x0 + f.grid.w / 2, z: f.grid.y0 + f.grid.h / 2 } : null;
  }

  // ── drawn ──
  /** Each frame: the pointer's spot; the held one there as themselves (green where they can stand, red where not);
   *  the draft's placed ones as they'd be; the picked one's circle and route; a ring round each placed on this
   *  floor. */
  frame(pointer: { x: number; y: number } | null, f: Frame, active: boolean) {
    const tp = this.host.tp();
    if (!tp) return;
    const o = this.o;
    const view = o.floor?.level ?? 0;
    this.at = active && pointer ? this.spotAt(pointer.x, pointer.y) : null;
    const draft = this.host.draft();
    const pub = this.host.published();
    const places = placesOf(draft);
    const bodies: Body3[] = [];
    // (the world's ones the draft has elsewhere, or not at all)
    const hidden = new Set<string>();
    for (const was of placesOf(pub)) {
      const now = places.find((p) => p.key === was.key);
      const dragged = this.drag?.key === was.key;
      if (!now || dragged || now.x !== was.x || now.z !== was.z || now.level !== was.level || now.a !== was.a)
        hidden.add(`place:${was.key}`);
    }
    this.hidden = hidden;
    const yOf = (x: number, z: number, level: number) =>
      level === 0 ? terrainAt(x, z) + f.y + 0.06 : level === view ? 0.06 : Number.NaN;
    // (the draft's placed ones that aren't where the world has them: drawn there for the admin)
    for (const p of places) {
      const was = placeOf(pub, p.key);
      const dr = this.drag?.key === p.key ? this.drag : null;
      const x = dr ? dr.x : p.x;
      const z = dr ? dr.z : p.z;
      if (!dr && was && was.x === p.x && was.z === p.z && was.level === p.level && was.a === p.a) continue;
      bodies.push(this.body(`god:${p.key}`, p.key, x, z, p.a, p.level));
    }
    // the held one at the pointer
    let ring: { x: number; z: number; level: number; colour: number } | null = null;
    if (o.held && this.at) {
      const [x, z] = this.snapped(this.at.x, this.at.z);
      const why = this.blocked({ x, z, level: this.at.level });
      if (why !== o.blocked) this.setO({ blocked: why });
      bodies.push(this.body("god:held", o.held, x, z, o.a * RAD, this.at.level));
      ring = { x, z, level: this.at.level, colour: why ? RED : GREEN };
    }
    tp.godBodies = bodies.length ? () => bodies : null;
    // the lines: a ring under each placed on this floor, the picked one's circle and route
    let n = 0;
    const line = (pts: [number, number, number][], colour: number, loop: boolean) => {
      const ok = pts.filter((q) => Number.isFinite(q[1]));
      if (ok.length < 2) return;
      let l = this.lines[n];
      if (!l || l instanceof LineLoop !== loop) {
        if (l) {
          this.root.remove(l);
          l.geometry.dispose();
        }
        const mat = new LineBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthTest: false });
        l = loop ? new LineLoop(new BufferGeometry(), mat) : new Line(new BufferGeometry(), mat);
        l.renderOrder = 999;
        this.lines[n] = l;
        this.root.add(l);
      }
      (l.material as LineBasicMaterial).color.setHex(colour);
      l.geometry.setAttribute("position", new Float32BufferAttribute(ok.flat(), 3));
      l.geometry.computeBoundingSphere();
      l.visible = true;
      n++;
    };
    const circle = (x: number, z: number, level: number, r: number, colour: number) => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        pts.push([px, yOf(px, pz, level), pz]);
      }
      line(pts, colour, true);
    };
    if (active || o.sel) {
      for (const p of places) {
        const dr = this.drag?.key === p.key ? this.drag : null;
        const x = dr ? dr.x : p.x;
        const z = dr ? dr.z : p.z;
        if (p.level !== view && !(p.level === 0 && view === 0)) continue;
        const picked = p.key === o.sel;
        circle(x, z, p.level, 0.55, picked ? AMBER : 0xcfc6b0);
        if (!picked) continue;
        if (p.r) circle(x, z, p.level, p.r, AMBER);
        if (p.route?.length) {
          const stops = [{ x, z, level: p.level }, ...p.route];
          const pts = stops.map((s): [number, number, number] => [s.x, yOf(s.x, s.z, s.level), s.z]);
          if (p.loop) pts.push(pts[0]);
          line(pts, AMBER, false);
          for (const s of p.route) circle(s.x, s.z, s.level, 0.3, AMBER);
        }
      }
    }
    if (ring) circle(ring.x, ring.z, ring.level, 0.6, ring.colour);
    for (let i = n; i < this.lines.length; i++) this.lines[i].visible = false;
  }
  private body(id: string, key: string, x: number, z: number, a: number, level: number): Body3 {
    const r = this.row(key);
    const ground = level === 0 ? this.host.ground(x, z) : 0;
    return {
      id,
      name: r ? (r.name && r.role ? `${r.name} · ${r.role}` : r.name || r.role) : key,
      avatar: this.look(key),
      x,
      y: z,
      z: ground,
      ground,
      yaw: byteFace(faceByte(Math.cos(a), Math.sin(a))),
      a: 0,
      status: "online",
      speaking: false,
      emote: "",
      mic: false,
      bot: true,
      level,
    } as unknown as Body3;
  }
  hide() {
    this.hidden = new Set();
    for (const l of this.lines) l.visible = false;
    const tp = this.host.tp();
    if (tp) tp.godBodies = null;
  }
  dispose() {
    this.hide();
    for (const l of this.lines) {
      l.geometry.dispose();
      (l.material as LineBasicMaterial).dispose();
    }
    this.root.parent?.remove(this.root);
  }
}
