import {
  areaAt,
  type ClientMessages,
  canBeFree,
  canPlace,
  carried,
  doorLeaves,
  entry,
  type Face,
  FLIGHT_RISE,
  faceHit,
  faceNear,
  footprint,
  freeFits,
  hangAt,
  hangCanon,
  hangNear,
  hangOf,
  hangSpot,
  hostOf,
  isDoorKind,
  isFreeThing,
  isOpening,
  liftRect,
  lockedEdge,
  type MapDef,
  openingEdges,
  openingNear,
  type Point,
  placedFootprint,
  placeFree,
  Q,
  quarterOf,
  quarterYaw,
  type Ray,
  type ServerMessages,
  surfaceAt,
  takenId,
  topAt,
  topCentre,
  topNear,
  topRect,
  topSize,
  type WorldObjectDef,
  WQ,
  WZ,
  wallTakes,
} from "@yutopia/shared";
import {
  FACE_PAINTS,
  freeOpeningWhy,
  frontNormal,
  isArc,
  openingAlong,
  placeOnWall,
  roomStretches,
  stopOnDeckWhy,
  stretchAt,
  type Wall,
  wallPoints,
  workingHeights,
} from "@yutopia/shared/structure";

import type { SetupItem } from "@/lib/api";
import { tr, trMaybe } from "@/lib/i18n";
import { C } from "../art/palette";
import type { WorldController } from "../controller";
import type { Outline, Pick, SegGhost } from "../model";
import { hud, toast, type WallTag, type WallView } from "../store";
import { FreeFloors, FreeRoofs } from "./freefloors";
import { FreeWalls } from "./freewalls";
import { buildSound } from "./sounds";

// Marks this chunk for `pnpm budget` (build mode loads on demand).
export const BUILD_CHUNK = "yutopia-build";

// Something in your hand: where it goes (def), where it came from (null for a
// new copy), and its offset from the tile under the pointer. Things on a
// surface held on their own move by quarter-tile cells instead (qx, qy: from
// the cell under the pointer, on the top it's over); held with the desk they
// stand on, they ride along with it.
interface Held {
  def: WorldObjectDef;
  origin: WorldObjectDef | null;
  dx: number;
  dy: number;
  qx?: number;
  qy?: number;
  ride?: { host: string; hostFrom: WorldObjectDef; from: WorldObjectDef };
}

const onTop = (o: { kind: string }) => !!entry(o.kind).onSurface;
const ghostId = () => `ghost-${Math.random().toString(36).slice(2, 8)}`;
// where a thing is, for "has its move arrived yet?"
const spotKey = (o: WorldObjectDef) =>
  `${o.x},${o.y},${quarterOf(o)},${onTop(o) ? topRect(o).x + topRect(o).y * 1e4 : ""}`;

interface Press {
  sx: number; // where the button went down (screen px)
  sy: number;
  pick: Pick | null;
  carry: boolean; // pressed while carrying: drop on release, or drag sideways to turn it
  dragging: boolean; // pressed on a thing and moved: it's being dragged
  turned: number; // quarter turns made by dragging sideways
}

const DRAG_PX = 6; // movement that turns a press into a drag
const TURN_PX = 42; // sideways drag per quarter turn (the Sims gesture)
const LIFT = 0.2552; // how high held things float (m)

// Build mode, loaded when an owner first opens it. Furniture works like The
// Sims: the hand picks up what you point at (its drawn shape), carries it with
// its footprint green or red below, turns with R / the wheel / a sideways drag,
// drops with a click (Esc puts it back), and Shift keeps placing copies. Groups:
// Shift-click or drag a box to select, then move, turn, copy or delete them
// together. The walls, rooms, desks and map tools paint and drag as before.
export class BuildController {
  private hand: Held[] = [];
  private anchor = { x: 0, y: 0 }; // tile the hand is over
  private cell = { x: 0, y: 0 }; // quarter-tile cell it's over (things on a surface)
  private press: Press | null = null;
  private boxFrom: Point | null = null;
  private pending = new Map<string, { key: string; until: number }>();
  private pendingTimer: ReturnType<typeof setInterval> | null = null;
  private shift = false;
  private lastWheel = 0;
  // one wall item in hand: the face it's aimed at (where along it, how high;
  // z null keeps its height), and R's "the other side of this wall"
  // (a door or window aimed at a wall drawn free — phase 11.6: that wall, where along it)
  private aim: { face: Face; along: number; z: number | null; free?: { wall: Wall; p: [number, number] } } | null =
    null;
  private flip = false;
  // one thing that stands on the floor in hand (plan 72 phase 11.9): its middle at the pointer, on the
  // grid (Shift: near free), turned 15° at a time — placed free unless that's whole tiles at a
  // quarter turn
  private freeAt: { x: number; y: number } | null = null;
  hoverPick: Pick | null = null;
  // Floors: drawn free (plan 72 phase 11.7)
  private floors = new FreeFloors({
    structure: () => this.w.structure,
    level: () => this.w.level,
    send: (m) => this.send("struct:slabs", m),
    show: (polys, marks) => this.model?.setPolyGhosts(polys, marks),
    shift: () => this.shift,
  });
  // Roofs (plan 72 phase 11.7)
  private roofs = new FreeRoofs({
    structure: () => this.w.structure,
    level: () => this.w.level,
    send: (m) => this.send("struct:roofs", m),
    show: (polys) => this.model?.setPolyGhosts(polys),
    removing: () => this.removing,
  });
  /** How high a new flight of steps rises (plan 72 phase 11.8): to the working height (a mezzanine's),
   *  else this floor's highest mezzanine, else the usual. */
  private riseNow(): number {
    const over = hud.get().build.over ?? 0;
    if (over > 0) return over;
    const hs = this.w.structure ? workingHeights(this.w.structure, this.w.level) : [0];
    return hs.at(-1) || FLIGHT_RISE;
  }
  /** Where the pointer is at the working height (a mezzanine's: its ray meets that plane; the
   *  floor's: as the view gave it). */
  private atWorking(x: number, y: number): [number, number] {
    const over = hud.get().build.over ?? 0;
    const r = over > 0 ? this.model?.pointerRay() : null;
    if (!r || Math.abs(r.d.z) < 1e-6) return [x, y];
    const t = (over - r.o.z) / r.d.z;
    return t > 0 ? [r.o.x + r.d.x * t, r.o.y + r.d.y * t] : [x, y];
  }
  // Build's Line, Box and Erase: walls drawn free (plan 72 phase 11)
  private free = new FreeWalls({
    structure: () => this.w.structure,
    ray: () => this.model?.pointerRay() ?? null,
    level: () => this.w.level,
    send: (m) => this.send("struct:walls", m),
    show: (segs, marks) => this.model?.setSegGhosts(segs, marks),
    tag: (t) => this.setTag(t),
    shift: () => this.shift,
    removing: () => this.removing,
  });

  constructor(private w: WorldController) {
    window.addEventListener("keydown", this.onMods);
    window.addEventListener("keyup", this.onMods);
    window.addEventListener("blur", this.onBlur);
    // leaving build mode tidies up here, not in the panel: the panel unmounts in
    // the same render that turns it off (and people stayed unclickable after)
    this.wasOn = hud.get().build.on;
    this.unsub = hud.subscribe(() => {
      const on = hud.get().build.on;
      if (on === this.wasOn) return;
      this.wasOn = on;
      this.refresh();
    });
  }
  private wasOn: boolean;
  private unsub: () => void;

  dispose() {
    this.unsub();
    window.removeEventListener("keydown", this.onMods);
    window.removeEventListener("keyup", this.onMods);
    window.removeEventListener("blur", this.onBlur);
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    this.cancel();
  }

  private onMods = (e: KeyboardEvent) => {
    const was = `${this.shift}${this.removing}`;
    this.shift = e.shiftKey;
    this.removing = e.ctrlKey || e.metaKey;
    // the Walls tool shows what Shift / ⌘ would do
    if (was !== `${this.shift}${this.removing}` && hud.get().build.on && hud.get().build.tool === "walls")
      this.refreshOther();
  };
  private onBlur = () => {
    this.shift = false;
    this.removing = false;
  };

  private get model() {
    return this.w.model;
  }
  private get map() {
    return this.w.map;
  }
  private get room() {
    return this.w.room;
  }
  private send<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]) {
    this.w.send(type, msg);
  }
  private furniture(): boolean {
    const b = hud.get().build;
    return b.on && b.tool === "furniture";
  }
  private setBuild(patch: Partial<ReturnType<typeof hud.get>["build"]>) {
    hud.set((s) => ({ build: { ...s.build, ...patch } }));
  }

  // ── what's around ────────────────────────────────────────────────────────
  private objects(): WorldObjectDef[] {
    return this.model?.allObjects() ?? [];
  }
  private bodies(): Point[] {
    return this.room ? [...this.room.state.players.values()].map((p) => ({ x: p.x, y: p.y })) : [];
  }
  private holder(id: string): { uid: number; name: string } | null {
    const h: string | undefined = this.room?.state.holds?.get(id);
    if (!h) return null;
    const [uid, ...name] = h.split("|");
    return { uid: Number(uid), name: name.join("|") };
  }
  // An object's stored props (the model's copy carries drawing-only flags like
  // a chair's `occupied`, which must never be saved).
  private storedProps(id: string): Record<string, unknown> | undefined {
    const o = this.room?.state.objects.get(id);
    if (!o) return undefined;
    try {
      return JSON.parse(o.props || "{}");
    } catch {
      return {};
    }
  }
  private heldByOther(id: string): string | null {
    const h = this.holder(id);
    return h && h.uid !== this.w.myUid() ? h.name : null;
  }

  // ── the hand ─────────────────────────────────────────────────────────────
  private placed(): { def: WorldObjectDef; ok: boolean }[] {
    const away = new Set(this.hand.flatMap((h) => (h.origin ? [h.origin.id] : [])));
    const rest = this.objects().filter((o) => !away.has(o.id));
    const bodies = this.bodies();
    const out: { def: WorldObjectDef; ok: boolean }[] = [];
    const sofar: WorldObjectDef[] = [];
    // hosts before what sits on them, so a desk and its mug move together
    const order = [...this.hand].sort(
      (a, b) => Number(!!entry(a.def.kind).onSurface) - Number(!!entry(b.def.kind).onSurface),
    );
    const fine = this.fine();
    for (const h of order) {
      let def: WorldObjectDef;
      const host = h.ride ? sofar.find((d) => d.id === h.ride?.host) : undefined;
      if (h.ride && host) {
        // on a desk in the same hand: where the desk takes it
        const on = carried(h.ride.hostFrom, host, [h.ride.hostFrom, h.ride.from])[0] ?? h.ride.from;
        def = {
          ...h.def,
          x: on.x,
          y: on.y,
          yaw: quarterYaw(quarterOf(on)),
          props: { ...(h.def.props ?? {}), c: on.props?.c },
        };
      } else if (fine && h.qx !== undefined && h.qy !== undefined)
        def = topAt(h.def, this.cell.x + h.qx, this.cell.y + h.qy);
      else if (this.freeOne() && this.freeAt) def = placeFree(h.def, this.freeAt.x, this.freeAt.y, h.def.yaw ?? 0);
      else def = { ...h.def, x: this.anchor.x + h.dx, y: this.anchor.y + h.dy };
      // a mug in hand shows at the height of the desk or table it's over
      if (onTop(def)) {
        const under = hostOf([...rest, ...sofar], def);
        def.props = { ...(def.props ?? {}), z: under ? (entry(under.kind).surface ?? 0) : 0 };
      }
      // one wall item in hand: on the face it's aimed at, its middle at the
      // pointer (R: the same spot on the wall's other side)
      if (this.hanging() && this.aim) {
        const f = this.aim.face;
        def = hangNear(def, this.flip ? { ...f, side: f.side > 0 ? -1 : 1 } : f, this.aim.along, this.aim.z);
      }
      // a door or window in hand: into the wall it's aimed at, its middle at the pointer
      let freeWhy: string | null | undefined;
      if (this.slotting() && this.aim?.free) {
        // into a wall drawn free: its middle at the pointer, along that wall
        const { wall, p } = this.aim.free;
        const on = { wall: wall.id, at: openingAlong(wall, p, def.kind) };
        def = { ...def, ...placeOnWall(wall, on.at, def.kind), props: { ...(def.props ?? {}), free: true, on } };
        freeWhy = freeOpeningWhy({ walls: this.free.wallsHere() }, this.w.level, def.kind, on, rest, h.origin?.id);
      } else if (this.slotting() && this.aim) {
        def = openingNear(def, this.aim.face, this.aim.along);
        if (def.props?.free) def = { ...def, props: { ...def.props, free: false } };
      }
      if (freeWhy === undefined && isFreeThing(def))
        freeWhy = this.w.structure ? freeFits(def, [...rest, ...sofar], this.w.structure, this.w.level) : "not loaded";
      // a lift's stop at the working height (plan 72 phase 11): up on that mezzanine, all of it on it
      if (def.kind === "elevator") {
        const deck = hud.get().build.over ?? 0;
        const { deck: _d, ...props } = def.props ?? {};
        def = { ...def, props: deck > 0 ? { ...props, deck } : props };
        if (deck > 0)
          freeWhy = this.w.structure
            ? stopOnDeckWhy(this.w.structure, this.w.level, liftRect(def), deck)
            : "not loaded";
      }
      const ok = freeWhy !== undefined ? freeWhy === null : canPlace(this.map, [...rest, ...sofar], def, bodies);
      sofar.push(def);
      out.push({ def, ok });
    }
    return out;
  }

  // One wall item in hand: it goes where the pointer meets a wall.
  private hanging(): boolean {
    return this.hand.length === 1 && !!entry(this.hand[0].def.kind).wall;
  }
  // One thing in hand that can stand free (on the floor, not the building's own; plan 72 phase 11.9).
  private freeOne(): boolean {
    if (this.hand.length !== 1 || this.hand[0].ride || !canBeFree(this.hand[0].def.kind) || this.fine()) return false;
    // (free once turned off the quarters, or with Shift: a spot of its own; else on the tile under the
    // pointer, as things always went)
    const yaw = this.hand[0].def.yaw ?? 0;
    const offQuarter = Math.abs(yaw / (Math.PI / 2) - Math.round(yaw / (Math.PI / 2))) > 1e-6;
    return offQuarter || this.shift;
  }
  // One door or window in hand (shared openings.ts): it goes into the wall the
  // pointer is at, edge by edge.
  private slotting(): boolean {
    return this.hand.length === 1 && isOpening(this.hand[0].def.kind);
  }

  // The wall face under the pointer (the first one it meets, facing it; the
  // walls cut away for the view are looked through), else the face nearest
  // the floor under the pointer (the only way to reach the faces this view
  // can't see).
  private aimWall(): boolean {
    const e = this.model;
    if (!e) return false;
    const ray = e.pointerRay();
    const through = e.lookedThrough();
    const hit = ray ? faceHit(this.map, ray, (w) => through.has(`${w.dir}${w.x},${w.y}`)) : null;
    const kind = this.hand[0]?.def.kind ?? "";
    const slot = isOpening(kind);
    let aim: typeof this.aim = null;
    if (hit) aim = { face: hit.face, along: hit.along, z: hit.z };
    // a door or window: a wall drawn free the ray meets first (or the nearest to the floor under the
    // pointer, as the tile walls' faceNear)
    if (slot && ray) {
      const f = this.freeWallHit(ray);
      const near = (q: { along: number; face: Face }) => {
        const [px, py] = q.face.dir === "h" ? [q.along, q.face.line] : [q.face.line, q.along];
        return Math.hypot(px - ray.o.x, py - ray.o.y) / (Math.hypot(ray.d.x, ray.d.y) || 1);
      };
      if (f && (!hit || f.t < near(hit))) aim = { face: { dir: "h", line: 0, side: 1 }, along: 0, z: null, free: f };
    }
    if (!aim) {
      const p = e.pointerWorld();
      const n = faceNear(this.map, p.x, p.y, slot ? (ch) => wallTakes(kind, ch) : undefined);
      if (n) aim = { face: n.face, along: n.along, z: null };
    }
    const was = this.aim;
    if (!aim) return false;
    // another wall: R's flip starts over
    if (!was || was.face.dir !== aim.face.dir || was.face.line !== aim.face.line || was.free?.wall !== aim.free?.wall)
      this.flip = false;
    this.aim = aim;
    const key = (a: typeof aim) => {
      const h = this.hand[0];
      if (a?.free) return `free|${a.free.wall.id}|${h ? openingAlong(a.free.wall, a.free.p, h.def.kind) : 0}`;
      const d = !h ? null : slot ? openingNear(h.def, a.face, a.along) : hangNear(h.def, a.face, a.along, a.z);
      return d ? `${d.x},${d.y},${quarterOf(d)},${d.props?.wu},${d.props?.wz}` : "";
    };
    return !was || key(was) !== key(aim);
  }

  /** The wall drawn free (straight, off the tile lines, on my floor) the pointer's ray meets first,
   *  under its top: the wall, the point on its line, how far along the ray. */
  private freeWallHit(ray: Ray): { wall: Wall; p: [number, number]; t: number } | null {
    let best: { wall: Wall; p: [number, number]; t: number } | null = null;
    for (const w of this.free.wallsHere()) {
      // (an arc by its chords — 11.11: doors and windows in arcs too)
      const pts = wallPoints(w);
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        const den = ray.d.x * ey - ray.d.y * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - ray.o.x) * ey - (a[1] - ray.o.y) * ex) / den;
        const s = ((a[0] - ray.o.x) * ray.d.y - (a[1] - ray.o.y) * ray.d.x) / den;
        if (t <= 0 || s < 0 || s > 1) continue;
        const z = ray.o.z + ray.d.z * t;
        if (z < 0 || z > w.height) continue;
        if (!best || t < best.t) best = { wall: w, p: [a[0] + ex * s, a[1] + ey * s], t };
      }
    }
    return best;
  }

  // Only things that stand on surfaces in hand: they move cell by cell.
  private fine(): boolean {
    return this.hand.length > 0 && this.hand.every((h) => onTop(h.def) && !h.ride);
  }

  // The point under the pointer on the top it's over (the highest surface
  // there), else on the floor (world tiles).
  private surfacePoint(): Point {
    const e = this.model;
    if (!e) return { x: this.anchor.x + 0.5, y: this.anchor.y + 0.5 };
    const away = new Set(this.hand.flatMap((h) => (h.origin ? [h.origin.id] : [])));
    const rest = this.objects().filter((o) => !away.has(o.id));
    const heights = [
      ...new Set(rest.map((o) => entry(o.kind).surface).filter((z): z is number => z !== undefined)),
    ].sort((a, b) => b - a);
    for (const z of heights) {
      const w = e.pointerWorld(z);
      const host = surfaceAt(rest, Math.floor(w.x), Math.floor(w.y));
      if (host && entry(host.kind).surface === z) return w;
    }
    return e.pointerWorld();
  }
  private pointerCell(): Point {
    const p = this.surfacePoint();
    return { x: Math.floor(p.x * Q), y: Math.floor(p.y * Q) };
  }
  // A new thing for a surface, its middle under the pointer.
  private centred(def: WorldObjectDef): Held {
    const [w, h] = topSize(def);
    return { def, origin: null, dx: 0, dy: 0, qx: -Math.floor(w / 2), qy: -Math.floor(h / 2) };
  }

  private drawHand() {
    const e = this.model;
    if (!e) return;
    const placed = this.placed();
    // (a wall item, a door or a window shows exactly where it would go: not lifted)
    e.setGhosts(placed, this.hand.length && !this.hanging() && !this.slotting() ? LIFT : 0);
    const fits = placed.every((p) => p.ok);
    if (hud.get().build.fits !== fits) this.setBuild({ fits });
    this.syncHidden();
    this.drawOutlines();
  }

  private syncHidden() {
    const ids = new Set<string>(this.pending.keys());
    for (const h of this.hand) if (h.origin) ids.add(h.origin.id);
    this.model?.setHidden(ids);
  }

  private setHand(hand: Held[]) {
    this.freeAt = null;
    this.hand = hand;
    if (this.hanging() || this.slotting()) this.aimWall();
    else {
      this.aim = null;
      this.flip = false;
    }
    this.setBuild({
      held: hand.flatMap((h) => (h.origin ? [h.origin.id] : [])),
      carrying: hand.length,
    });
    this.drawHand();
  }

  // A new thing from the catalog (or a copy) on the pointer.
  private fresh(kind: string, props: Record<string, unknown> | null, rot: number): WorldObjectDef {
    const def: WorldObjectDef = {
      id: `ghost-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      x: this.anchor.x,
      y: this.anchor.y,
      yaw: quarterYaw(rot),
      props: props ?? (kind === "chair" ? { desk: true } : undefined),
    };
    // (a wall item at its own height until it's aimed somewhere)
    return entry(kind).wall ? hangCanon({ ...def, props: { ...(def.props ?? {}), wz: 0 } }) : def;
  }

  // Props worth copying: not whose desk it is, nor which room it labels.
  private copyable(props: Record<string, unknown> | undefined): Record<string, unknown> {
    const { ownerId: _o, ownerName: _n, roomKey: _r, occupied: _s, passing: _p, ...rest } = props ?? {};
    return rest;
  }

  // Place mode keeps the catalog item on the pointer.
  private syncPlace() {
    const b = hud.get().build;
    if (b.mode !== "place") return;
    const cur = this.hand[0];
    if (this.hand.length === 1 && !cur.origin && cur.def.kind === b.kind && quarterOf(cur.def) === b.rot) return;
    if (this.hand.some((h) => h.origin)) return; // moving something: leave it
    this.setHand([this.freshHeld(b.kind, b.props, b.rot)]);
  }
  private freshHeld(kind: string, props: Record<string, unknown> | null, rot: number): Held {
    const def = this.fresh(kind, props, rot);
    if (!onTop(def)) return { def, origin: null, dx: 0, dy: 0 };
    this.cell = this.pointerCell();
    return this.centred(def);
  }

  // Pick up placed things (one, or the selection it belongs to). Things on a
  // surface come along with what they sit on.
  private async pickUp(pick: Pick) {
    let id = pick.id;
    if (pick.dress) {
      // generated clutter becomes a real object first (server: dress:take)
      this.send("dress:take", { id: pick.id });
      id = takenId(pick.id);
      const ok = await this.waitFor(() => !!this.model?.getObject(id));
      if (!ok) return;
    }
    const obj = this.model?.getObject(id);
    if (!obj || !entry(obj.kind).buildable) return;
    // a door or window of someone else's locked room stays where it is
    const locked = isOpening(obj.kind)
      ? openingEdges(obj)
          .map((e) => lockedEdge(this.map, this.objects(), e, this.w.myUid()))
          .find(Boolean)
      : null;
    if (locked) {
      buildSound("nope");
      toast(`${locked}.`, "warn");
      return;
    }
    const by = this.heldByOther(id);
    if (by) {
      buildSound("nope");
      toast(tr("buildHeldBy").replace("{name}", by), "warn");
      return;
    }
    const sel = hud.get().build.selected;
    const ids = new Set(sel.includes(id) ? sel : [id]);
    const all = this.objects();
    for (const i of [...ids]) {
      const o = all.find((x) => x.id === i);
      if (o) for (const r of carried(o, o, all)) ids.add(r.id);
    }
    const group = all.filter((o) => ids.has(o.id) && entry(o.kind).buildable && !this.heldByOther(o.id));
    // held where you grabbed it: the hand keeps its offset, so nothing jumps
    const t = this.pointerTile();
    this.anchor = t;
    this.setHand(this.holding(group, all, t, null));
    this.send("obj:hold", { ids: group.map((o) => o.id) });
    this.setBuild({ selected: group.map((o) => o.id) });
    buildSound("pickup");
  }

  // A hand for these things, offset from tile t (and, for things on a surface
  // alone, from the pointer's cell). `ids`: new ids for copies (else moved).
  private holding(group: WorldObjectDef[], all: WorldObjectDef[], t: Point, ids: Map<string, string> | null): Held[] {
    const tops = group.every(onTop);
    if (tops) this.cell = this.pointerCell();
    const inHand = new Set(group.map((o) => o.id));
    return group.map((o) => {
      const base = ids ? { ...o, id: ids.get(o.id) ?? ghostId(), props: this.copyable(o.props) } : { ...o };
      const copy = hangCanon(base);
      const h: Held = { def: copy, origin: ids ? null : o, dx: o.x - t.x, dy: o.y - t.y };
      if (tops) {
        const r = topRect(o);
        h.qx = r.x - this.cell.x;
        h.qy = r.y - this.cell.y;
      } else if (onTop(o)) {
        const host = hostOf(all, o);
        if (host && inHand.has(host.id))
          h.ride = { host: ids?.get(host.id) ?? host.id, hostFrom: host, from: { ...o, id: copy.id } };
      }
      return h;
    });
  }

  private waitFor(cond: () => boolean, ms = 2500): Promise<boolean> {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (cond()) return res(true);
        if (performance.now() - t0 > ms) return res(false);
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  private pointerTile(): Point {
    const e = this.model;
    if (!e) return this.anchor;
    const w = e.pointerWorld();
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  // Put it all down where it is, if it fits. Shift keeps a copy on the pointer.
  private drop(): boolean {
    if (!this.hand.length) return false;
    const placed = this.placed();
    if (!placed.every((p) => p.ok)) {
      buildSound("nope");
      toast(tr("buildNoFit"), "warn");
      return false;
    }
    const byId = new Map(this.hand.map((h) => [h.def.id, h]));
    const items = placed.map(({ def }) => {
      const h = byId.get(def.id) as Held;
      return {
        ...(h.origin ? { id: h.origin.id } : {}),
        kind: def.kind,
        x: def.x,
        y: def.y,
        yaw: def.yaw ?? 0,
        // moved: as stored (never drawing-only flags), in its new cell if on a
        // top, at its new spot if on a wall
        props: h.origin
          ? {
              ...(this.storedProps(h.origin.id) ?? {}),
              ...spotProps(def),
              ...(def.kind === "elevator" && { deck: def.props?.deck }),
            }
          : def.kind === "flight" && def.props?.rise === undefined
            ? { ...(def.props ?? {}), rise: this.riseNow() }
            : def.props,
      };
    });
    if (items.length === 1) {
      const it = items[0];
      const h = this.hand[0];
      this.send("obj:put", { ...it, refId: h.origin ? (h.origin.refId ?? null) : null });
    } else this.send("obj:batch", { items });
    // the originals stay hidden until their move arrives (no flash back)
    const until = performance.now() + 2500;
    for (const { def } of placed) {
      const h = byId.get(def.id) as Held;
      if (h.origin) this.pending.set(h.origin.id, { key: spotKey(def), until });
      this.model?.puff(...this.middle(def), "drop");
    }
    this.watchPending();
    buildSound("drop");
    const b = hud.get().build;
    const again = b.mode === "place" && this.shift;
    const copies = !this.hand.some((h) => h.origin) && this.hand.length > 1 && this.shift;
    if (again) this.setHand([this.freshHeld(b.kind, b.props, b.rot)]);
    else if (copies) {
      const ids = new Map(this.hand.map((h) => [h.def.id, ghostId()]));
      this.setHand(
        this.hand.map((h) => ({
          ...h,
          def: { ...h.def, id: ids.get(h.def.id) ?? ghostId() },
          ride: h.ride ? { ...h.ride, host: ids.get(h.ride.host) ?? h.ride.host } : undefined,
        })),
      );
    } else {
      this.setHand([]);
      if (b.mode === "place") this.setBuild({ mode: "hand", props: null });
    }
    if (!again && !copies)
      this.setBuild({ selected: placed.flatMap(({ def }) => (byId.get(def.id)?.origin ? [def.id] : [])) });
    return true;
  }

  private watchPending() {
    if (this.pendingTimer) return;
    this.pendingTimer = setInterval(() => this.checkPending(), 60);
  }

  // Moves that have arrived show again (checked as the room's changes land,
  // and on a timer as a fallback).
  checkPending() {
    if (!this.pending.size && !this.pendingTimer) return;
    const now = performance.now();
    for (const [id, p] of this.pending) {
      const o = this.model?.getObject(id);
      if (now > p.until || !o || spotKey(o) === p.key) this.pending.delete(id);
    }
    this.syncHidden();
    if (!this.pending.size && this.pendingTimer) {
      clearInterval(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  // What's in hand, for the action bar: the first thing and how many.
  handInfo(): { kind: string; props?: Record<string, unknown>; rot: number; count: number } | null {
    const h = this.hand[0];
    return h ? { kind: h.def.kind, props: h.def.props, rot: quarterOf(h.def), count: this.hand.length } : null;
  }

  // Design tool: a new look for the selection (variant, decor kind, or a reshuffle).
  setLook(patch: Record<string, unknown> | "shuffle") {
    const sel = this.selectedObjects().filter((o) => !this.heldByOther(o.id));
    if (!sel.length) return;
    const items = sel.map((o) => {
      const props = { ...(this.storedProps(o.id) ?? {}), ...(patch === "shuffle" ? { seed: Math.random() } : patch) };
      // a thing on a surface keeps its middle (a monitor is bigger than a mug)
      const c = onTop(o) ? topCentre(o) : null;
      const d = c ? topNear({ ...o, props }, c.x, c.y) : { ...o, props };
      return { id: o.id, kind: o.kind, x: d.x, y: d.y, yaw: o.yaw ?? 0, props: d.props };
    });
    if (items.length === 1) this.send("obj:put", { ...items[0], refId: sel[0].refId ?? null });
    else this.send("obj:batch", { items });
    buildSound("select");
  }

  /** (plan 67) The piece being put down from the catalog: its look or paint (the held card's picker,
   *  L for the next look); `color: ""` back to how it comes. */
  placeLook(patch: Record<string, unknown>) {
    const b = hud.get().build;
    if (b.mode !== "place" || !b.kind) return;
    const props: Record<string, unknown> = { ...(b.props ?? {}), ...patch };
    if (props.color === "") delete props.color;
    this.setBuild({ props });
    this.setHand(
      this.hand.map((h) => {
        if (h.origin) return h;
        const p: Record<string, unknown> = { ...(h.def.props ?? {}), ...props };
        if (!("color" in props)) delete p.color;
        return { ...h, def: { ...h.def, props: p } };
      }),
    );
    buildSound("select");
  }
  /** The next look of what's being placed, or of what's selected. */
  nextLook() {
    const b = hud.get().build;
    const kind = b.mode === "place" ? b.kind : (this.selectedObjects()[0]?.kind ?? null);
    if (!kind) return;
    const n = entry(kind).variants ?? 1;
    if (n < 2) return;
    const now = b.mode === "place" ? b.props?.variant : this.selectedObjects()[0]?.props?.variant;
    const v = ((typeof now === "number" ? now : (entry(kind).look ?? 0)) + 1) % n;
    if (b.mode === "place") this.placeLook({ variant: v });
    else this.setLook({ variant: v });
  }

  // The toolbar's Move: pick up the selection.
  pickSelection() {
    const id = hud.get().build.selected[0];
    if (id) void this.pickUp({ id, dress: false });
  }

  // Put down what's on the pointer (a card dragged in from the catalog).
  commit() {
    if (this.furniture() && this.hand.length) this.drop();
  }
  private pointerOnBin(): boolean {
    const e = this.model;
    if (!e) return false;
    const el = document.elementFromPoint(e.pointerAt.x, e.pointerAt.y);
    return !!el?.closest("[data-build-bin]");
  }

  // Esc: everything back where it came from.
  cancel(): boolean {
    if (!this.hand.length) return false;
    const had = this.hand.some((h) => h.origin);
    this.setHand([]);
    if (had) this.send("obj:hold", { ids: [] });
    if (hud.get().build.mode === "place") this.setBuild({ mode: "hand", props: null });
    this.press = null;
    return true;
  }

  // A quarter turn clockwise: what you hold turns around the pointer; a
  // selection turns where it stands.
  rotate() {
    if (this.hand.length) {
      const fine = this.fine();
      // (things riding on a desk in hand turn with it)
      // the held things turn about their own middle (one thing turns in place),
      // not about the tile under the pointer
      const pivot = handMiddle(this.hand);
      const one = this.hand.filter((h) => !h.ride).length === 1;
      this.hand = this.hand.map((h) => {
        if (fine) return turnTop(h);
        if (h.ride) return h;
        // one thing: turns where it stands (on its first tile, like The Sims)
        if (one) {
          // a door: R swings it the other way (a window has no turn)
          if (isDoorKind(h.def.kind) && doorLeaves(h.def.kind)) return { ...h, def: swung(h.def) };
          // (one that can stand free: 15° at a time — plan 72 phase 11.9)
          if (canBeFree(h.def.kind)) return { ...h, def: { ...h.def, yaw: (h.def.yaw ?? 0) + Math.PI / 12 } };
          return entry(h.def.kind).wall || isOpening(h.def.kind)
            ? h
            : { ...h, def: { ...h.def, yaw: quarterYaw(quarterOf(h.def) + 1) } };
        }
        return turnAbout(h, pivot);
      });
      // a wall item: over to the wall's other side
      if (this.hanging()) this.flip = !this.flip;
      const b = hud.get().build;
      if (b.mode === "place" && this.hand.length === 1 && !this.hand[0].origin && !this.hanging() && !this.slotting())
        this.setBuild({ rot: quarterOf(this.hand[0].def) });
      buildSound("rotate");
      return this.drawHand();
    }
    const sel = this.selectedObjects();
    if (!sel.length) {
      const b = hud.get().build;
      return this.setBuild({ rot: (b.rot + 1) % 4 });
    }
    // things on a desk that's turning ride along (the server carries them);
    // things on a surface on their own turn where they stand
    const all = this.objects();
    const turning = new Set(sel.map((o) => o.id));
    const alone = sel.filter((o) => onTop(o) && !turning.has(hostOf(all, o)?.id ?? ""));
    const group = sel.filter((o) => !onTop(o));
    const ids = new Set(sel.map((o) => o.id));
    const rest = all.filter((o) => !ids.has(o.id));
    const defs: WorldObjectDef[] = [];
    if (group.length) {
      // turn the group about its corner, then check it all fits
      const pivot = { x: Math.min(...group.map((o) => o.x)), y: Math.min(...group.map((o) => o.y)) };
      if (group.length === 1 && isOpening(group[0].kind)) {
        // a door swings the other way; a window stays as it is
        if (!isDoorKind(group[0].kind) || !doorLeaves(group[0].kind)) return;
        defs.push(swung(group[0]));
      } else if (group.length === 1 && entry(group[0].kind).wall) {
        // a wall item on its own goes over to the wall's other side, as near as it fits
        const turned = otherSide(this.map, rest, group[0]);
        if (!turned) {
          buildSound("nope");
          toast(tr("buildNoFit"), "warn");
          return;
        }
        defs.push(turned);
      } else {
        const turned = group.map((o) => turn({ def: o, origin: o, dx: o.x - pivot.x, dy: o.y - pivot.y }));
        const nx = Math.min(...turned.map((t) => t.dx));
        const ny = Math.min(...turned.map((t) => t.dy));
        defs.push(...turned.map((t) => ({ ...t.def, x: pivot.x + t.dx - nx, y: pivot.y + t.dy - ny })));
      }
    }
    for (const o of alone) {
      const c = topCentre(o);
      defs.push(topNear({ ...o, yaw: quarterYaw((quarterOf(o) + 1) % 4) }, c.x, c.y));
    }
    const sofar: WorldObjectDef[] = [];
    for (const d of defs) {
      if (!canPlace(this.map, [...rest, ...sofar], d, this.bodies())) {
        buildSound("nope");
        toast(tr("buildNoFit"), "warn");
        return;
      }
      sofar.push(d);
    }
    const props = (d: WorldObjectDef) => ({
      ...(this.storedProps(d.id) ?? {}),
      ...spotProps(d),
    });
    if (defs.length === 1) {
      const d = defs[0];
      this.send("obj:put", {
        id: d.id,
        kind: d.kind,
        x: d.x,
        y: d.y,
        yaw: quarterYaw(quarterOf(d)),
        refId: d.refId ?? null,
        props: props(d),
      });
    } else
      this.send("obj:batch", {
        items: defs.map((d) => ({
          id: d.id,
          kind: d.kind,
          x: d.x,
          y: d.y,
          yaw: d.yaw ?? 0,
          props: props(d),
        })),
      });
    buildSound("rotate");
  }

  private selectedObjects(): WorldObjectDef[] {
    const sel = new Set(hud.get().build.selected);
    return this.objects().filter((o) => sel.has(o.id) && entry(o.kind).buildable);
  }

  // Delete what you hold or what's selected, with a poof.
  remove(): boolean {
    const held = this.hand.flatMap((h) => (h.origin ? [h.origin] : []));
    const list = held.length ? held : this.hand.length ? [] : this.selectedObjects();
    if (this.hand.length) this.cancel();
    if (!list.length) return this.hand.length > 0;
    const busy = list.find((o) => this.heldByOther(o.id));
    if (busy) {
      toast(tr("buildHeldBy").replace("{name}", this.heldByOther(busy.id) ?? ""), "warn");
      return true;
    }
    if (list.length === 1) this.send("obj:remove", { id: list[0].id });
    else this.send("obj:removeMany", { ids: list.map((o) => o.id) });
    for (const o of list) this.model?.puff(...this.middle(o), "poof");
    buildSound("remove");
    this.setBuild({ selected: [] });
    return true;
  }

  // Copies of the selection (or of what's held) on the pointer.
  duplicate() {
    const src = this.hand.length ? this.hand.map((h) => h.def) : this.selectedObjects();
    if (!src.length) return;
    if (this.hand.some((h) => h.origin)) this.cancel();
    const t = this.pointerTile();
    this.anchor = t;
    // the copies' corner on the pointer
    const corner = { x: Math.min(...src.map((o) => o.x)), y: Math.min(...src.map((o) => o.y)) };
    const ids = new Map(src.map((o) => [o.id, ghostId()]));
    const hand = this.holding(src, this.objects(), corner, ids);
    if (this.fine()) {
      const qx = Math.min(...hand.map((h) => h.qx ?? 0));
      const qy = Math.min(...hand.map((h) => h.qy ?? 0));
      for (const h of hand) {
        h.qx = (h.qx ?? 0) - qx;
        h.qy = (h.qy ?? 0) - qy;
      }
    }
    this.setHand(hand);
    buildSound("pickup");
  }

  // ── my setups: the selection (and what's on it) saved to place again ────
  setupOfSelection(): SetupItem[] | null {
    const sel = this.selectedObjects();
    if (!sel.length) return null;
    const all = this.objects();
    const ids = new Set(sel.map((o) => o.id));
    for (const o of sel) for (const r of carried(o, o, all)) ids.add(r.id);
    const group = all.filter((o) => ids.has(o.id) && entry(o.kind).buildable);
    const x0 = Math.min(...group.map((o) => o.x));
    const y0 = Math.min(...group.map((o) => o.y));
    return group.map((o) => ({
      kind: o.kind,
      dx: o.x - x0,
      dy: o.y - y0,
      yaw: o.yaw ?? 0,
      props: Object.keys(this.copyable(o.props)).length ? this.copyable(o.props) : null,
    }));
  }

  // A saved setup on the pointer, as new copies (dropped all at once).
  placeSetup(items: SetupItem[]) {
    if (!items.length) return;
    if (this.hand.length) this.cancel();
    this.setBuild({ mode: "hand", selected: [] });
    const t = this.pointerTile();
    this.anchor = t;
    const src: WorldObjectDef[] = items.map((it, i) => ({
      id: `setup-${i}`,
      kind: it.kind,
      x: t.x + it.dx,
      y: t.y + it.dy,
      yaw: it.yaw,
      props: it.props ?? undefined,
    }));
    const ids = new Map(src.map((o) => [o.id, ghostId()]));
    this.setHand(this.holding(src, src, t, ids));
    buildSound("pickup");
  }

  // Eyedropper / C: start placing copies of a thing in the room.
  private copyFrom(pick: Pick | null) {
    if (!pick) return;
    if (pick.dress) {
      const kind =
        pick.kind === "frame" ? "frame" : ["plant", "boxes", "bin", "cable"].includes(pick.kind) ? "decor" : "tabletop";
      this.setBuild({ mode: "place", kind, props: { d: pick.kind, seed: Math.random() }, rot: 0 });
    } else {
      const o = this.model?.getObject(pick.id);
      if (!o || !entry(o.kind).buildable) return;
      this.setBuild({ mode: "place", kind: o.kind, props: this.copyable(o.props), rot: quarterOf(o) });
    }
    this.hand = [];
    this.syncPlace();
    buildSound("select");
    toast(tr("buildCopying").replace("{item}", this.labelOf(pick)));
  }

  private labelOf(p: Pick): string {
    if (p.dress) return trMaybe(`decor_${p.kind}`) ?? p.kind;
    const o = this.model?.getObject(p.id);
    if (!o) return "";
    if (o.kind === "decor" || o.kind === "tabletop")
      return trMaybe(`decor_${String(o.props?.d)}`) ?? entry(o.kind).label;
    return entry(o.kind).label;
  }

  // ── outlines and the hover tag ───────────────────────────────────────────
  private drawOutlines() {
    const e = this.model;
    if (!e) return;
    const b = hud.get().build;
    const list: Outline[] = [];
    if (this.furniture()) {
      for (const id of b.selected)
        if (!this.hand.some((h) => h.origin?.id === id)) list.push({ id, color: C.vfd, fill: 0.1 });
      for (const [id] of this.room?.state.holds?.entries() ?? [])
        if (this.heldByOther(id)) list.push({ id, color: C.rust, fill: 0.12 });
      const hp = this.hoverPick;
      if (hp && !this.hand.length && !b.selected.includes(hp.id) && (hp.dress || !this.heldByOther(hp.id)))
        list.push({ id: hp.id, dress: hp.dress, color: b.mode === "eyedrop" ? 0x8fd0ff : C.amber, fill: 0.1 });
    }
    e.setOutlines(list);
  }

  private setHover(p: Pick | null) {
    const same = p?.id === this.hoverPick?.id && p?.dress === this.hoverPick?.dress;
    this.hoverPick = p;
    if (!same) {
      const b = hud.get().build;
      const n = this.under.length;
      this.setBuild({
        hover:
          p && !this.hand.length
            ? {
                label: this.labelOf(p),
                by: p.dress ? null : this.heldByOther(p.id),
                of: { i: n ? this.cycle % n : 0, n },
              }
            : null,
      });
      // (on the 3D view's canvas: it leaves its own hover cursor alone in build mode)
      const canvas = this.w.tp?.renderer.domElement;
      if (b.on && canvas) canvas.style.cursor = p ? (b.mode === "eyedrop" ? "copy" : "grab") : "default";
    }
    this.drawOutlines();
  }

  // Where the hover tag / item toolbar goes (client px): above the thing.
  anchorOf(id: string): { x: number; y: number } | null {
    const m = this.model;
    const o = m?.getObject(id);
    if (!o || !m) return null;
    const { w, h } = placedFootprint(o);
    const c = onTop(o) ? topCentre(o) : entry(o.kind).wall ? hangSpot(o, 0.15) : { x: o.x + w / 2, y: o.y + h / 2 };
    const z = onTop(o) ? (Number(o.props?.z) || 0) + 0.77 : entry(o.kind).wall ? hangOf(o).z1 + 0.26 : 1.33;
    return this.client(c.x, c.y, z);
  }
  // a world point (`z` m up) in client px (the view answers from its canvas's corner)
  private client(x: number, y: number, z: number): { x: number; y: number } | null {
    const p = this.model?.worldToClient(x, y, z);
    if (!p) return null;
    const r = this.w.hostRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  // A thing's middle on the floor plan (world tiles).
  private middle(o: WorldObjectDef): [number, number] {
    if (onTop(o)) {
      const c = topCentre(o);
      return [c.x, c.y];
    }
    if (entry(o.kind).wall) {
      const p = hangSpot(o, 0.3);
      return [p.x, p.y];
    }
    const { w, h } = placedFootprint(o);
    return [o.x + w / 2, o.y + h / 2];
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  hover(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on || !this.model) return;
    if (b.pickSpawn) {
      // picking the arrival point: the tile under the pointer, and whether it can be
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      return this.model.showSpawn(true, { x: tx, y: ty, ok: this.w.grid.ok(tx, ty) });
    }
    if (b.tool !== "furniture") return this.hoverOther(x, y);
    const e = this.model;
    const pr = this.press;
    if (pr && !pr.carry && pr.pick && !pr.dragging && b.mode === "hand") {
      if (Math.hypot(e.pointerAt.x - pr.sx, e.pointerAt.y - pr.sy) > DRAG_PX) {
        pr.dragging = true;
        void this.pickUp(pr.pick);
      }
      return;
    }
    if (pr?.carry) {
      // a sideways drag while pressing turns what you hold (and doesn't move it)
      const steps = Math.floor(Math.abs(e.pointerAt.x - pr.sx) / TURN_PX);
      while (pr.turned < steps) {
        pr.turned++;
        this.rotate();
      }
      if (pr.turned) return;
    }
    if (this.boxFrom) {
      const t = { x: Math.floor(x), y: Math.floor(y) };
      e.setRectGhost({ ...rectOf(this.boxFrom, t), ok: true });
      return;
    }
    if (this.fine()) {
      const c = this.pointerCell();
      if (c.x !== this.cell.x || c.y !== this.cell.y) {
        this.cell = c;
        buildSound("snap");
        this.drawHand();
      }
      return;
    }
    if (this.hanging() || this.slotting()) {
      this.anchor = { x: Math.floor(x), y: Math.floor(y) };
      if (this.aimWall()) {
        buildSound("snap");
        this.drawHand();
      }
      return;
    }
    if (this.freeOne()) {
      // its middle at the pointer, on the grid (Shift: near free)
      const g = this.shift ? 0.05 : hud.get().build.snapGrid || 0.5;
      const c = { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
      if (!this.freeAt || c.x !== this.freeAt.x || c.y !== this.freeAt.y) {
        this.freeAt = c;
        this.anchor = { x: Math.floor(x), y: Math.floor(y) };
        buildSound("snap");
        this.drawHand();
      }
      return;
    }
    // (a lift's stop at a mezzanine's working height: where the pointer meets that plane)
    if (this.hand.length === 1 && this.hand[0].def.kind === "elevator") [x, y] = this.atWorking(x, y);
    if (this.hand.length) {
      const t = { x: Math.floor(x), y: Math.floor(y) };
      if (t.x !== this.anchor.x || t.y !== this.anchor.y) {
        this.anchor = t;
        buildSound("snap");
        this.drawHand();
      }
      return;
    }
    this.setHover(this.pickNow());
  }

  // What's under the pointer, front first; Tab steps to the next one behind
  // it (back to the front when the pointer moves onto something else).
  private cycle = 0;
  private under: Pick[] = [];
  private pickNow(): Pick | null {
    const all = this.model?.picksAt() ?? [];
    const key = (l: Pick[]) => l.map((p) => p.id).join(",");
    if (key(all) !== key(this.under)) this.cycle = 0;
    this.under = all;
    return all.length ? all[this.cycle % all.length] : null;
  }

  down(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on || !this.model) return;
    if (b.tool !== "furniture") return this.downOther(x, y);
    const e = this.model;
    if (this.hand.length) {
      this.press = { sx: e.pointerAt.x, sy: e.pointerAt.y, pick: null, carry: true, dragging: false, turned: 0 };
      return;
    }
    const pick = this.pickNow();
    if (pick || b.mode === "eyedrop") {
      this.press = { sx: e.pointerAt.x, sy: e.pointerAt.y, pick, carry: false, dragging: false, turned: 0 };
      return;
    }
    // empty floor: drag a box to select
    this.boxFrom = { x: Math.floor(x), y: Math.floor(y) };
    e.setRectGhost({ x: this.boxFrom.x, y: this.boxFrom.y, w: 1, h: 1, ok: true });
  }

  up(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on) return;
    if (b.tool !== "furniture") return this.upOther(x, y);
    const pr = this.press;
    this.press = null;
    // released over the catalog's bin (checked where the pointer is now: the 3D
    // canvas holds the pointer through a drag, so the bin never hears it): what you hold goes
    if (this.hand.some((h) => h.origin) && this.pointerOnBin()) {
      this.remove();
      return;
    }
    if (pr?.carry) {
      if (!pr.turned) this.drop();
      return;
    }
    if (pr?.dragging) {
      // let the pick-up land (dress pieces wait for the server) then drop
      void this.waitFor(() => this.hand.length > 0, 2600).then((ok) => {
        if (ok) this.drop();
      });
      return;
    }
    if (pr) {
      if (b.mode === "eyedrop") return this.copyFrom(pr.pick);
      if (!pr.pick) return;
      if (this.shift && !pr.pick.dress) {
        const sel = new Set(b.selected);
        if (sel.has(pr.pick.id)) sel.delete(pr.pick.id);
        else sel.add(pr.pick.id);
        buildSound("select");
        this.setBuild({ selected: [...sel] });
        return this.drawOutlines();
      }
      void this.pickUp(pr.pick);
      return;
    }
    if (this.boxFrom) {
      const r = rectOf(this.boxFrom, { x: Math.floor(x), y: Math.floor(y) });
      this.boxFrom = null;
      this.model?.setRectGhost(null);
      const inBox = this.objects().filter((o) => {
        if (!entry(o.kind).buildable || isOpening(o.kind)) return false;
        const { w, h } = placedFootprint(o);
        return o.x < r.x + r.w && o.x + w > r.x && o.y < r.y + r.h && o.y + h > r.y;
      });
      const single = r.w === 1 && r.h === 1;
      const ids = single ? [] : inBox.map((o) => o.id);
      const keep = this.shift ? b.selected : [];
      this.setBuild({ selected: [...new Set([...keep, ...ids])] });
      if (ids.length) buildSound("select");
      this.drawOutlines();
    }
  }

  // A click (tap): furniture works on press/release; other tools click here.
  click(x: number, y: number) {
    const b = hud.get().build;
    if (b.pickSpawn) {
      this.send("map:spawn", { x: Math.floor(x), y: Math.floor(y) });
      this.setBuild({ pickSpawn: false });
      this.model?.showSpawn(true);
      return;
    }
    if (b.tool === "furniture") return;
    this.clickOther(x, y);
  }

  // Build mode's wheel: turns what you hold (instead of zooming).
  wheel(deltaY: number): boolean {
    if (!this.furniture() || !this.hand.length) return false;
    const now = performance.now();
    if (now - this.lastWheel > 140) {
      this.lastWheel = now;
      if (deltaY !== 0) this.rotate();
    }
    return true;
  }

  // Keys while building (true = handled).
  key(key: string): boolean {
    const b = hud.get().build;
    if (!b.on) return false;
    if (this.wallKey(key)) return true;
    const furn = b.tool === "furniture";
    if (key === "r") {
      if (furn) this.rotate();
      else this.setBuild({ rot: (b.rot + 1) % 4 });
    } else if (furn && (key === "delete" || key === "backspace")) {
      if (!this.remove()) return false;
    } else if (furn && key === "e") this.setMode(b.mode === "eyedrop" ? "hand" : "eyedrop");
    else if (furn && key === "l") this.nextLook();
    else if (furn && key === "h") this.setMode("hand");
    else if (furn && key === "c") {
      // copies of what you hold (put back first), or of what you point at
      const held = this.hand.find((h) => h.origin)?.origin;
      const pick: Pick | null = held
        ? { id: held.id, dress: false }
        : (this.hoverPick ?? (b.selected[0] ? { id: b.selected[0], dress: false } : null));
      if (held) this.cancel();
      this.copyFrom(pick);
    } else if (furn && key === "m" && b.selected.length) void this.pickUp({ id: b.selected[0], dress: false });
    else if (furn && key === "tab" && !this.hand.length && this.under.length > 1) {
      // the next thing stacked under the pointer
      this.cycle = (this.cycle + 1) % this.under.length;
      buildSound("select");
      this.setHover(this.under[this.cycle]);
    } else if (furn && this.hand.length && key.startsWith("arrow")) {
      // keyboard: nudge what you hold a tile at a time; Enter puts it down
      // (things on a surface: a quarter tile at a time). By the camera: ↑ is away from it
      // along its yaw, → to its right, each snapped to the nearest world axis.
      const d = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }[key] ?? [0, 0];
      const yaw = this.w.tp?.yaw ?? -Math.PI * 0.75;
      const [fx, fy, rx, ry] = [Math.cos(yaw), Math.sin(yaw), -Math.sin(yaw), Math.cos(yaw)];
      const vx = fx * -d[1] + rx * d[0];
      const vy = fy * -d[1] + ry * d[0];
      const [mx, my] = Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)];
      if (this.hanging() && this.aim) {
        // on a wall: ← → along it a quarter tile (the way it runs as the camera sees it), ↑ ↓ up
        // and down a step
        const a = this.aim;
        const k = hangOf(this.placed()[0].def);
        const z = a.z ?? (k.z0 + k.z1) / 2;
        const along = d[0] * (Math.sign(a.face.dir === "h" ? rx : ry) || 1);
        this.aim = { ...a, along: a.along + along / WQ, z: z - d[1] * WZ };
      } else if (this.fine()) this.cell = { x: this.cell.x + mx, y: this.cell.y + my };
      else if (this.freeOne() && this.freeAt) {
        // (standing free: its own spot a metre over — the anchor follows it)
        this.freeAt = { x: this.freeAt.x + mx, y: this.freeAt.y + my };
        this.anchor = { x: Math.floor(this.freeAt.x), y: Math.floor(this.freeAt.y) };
      } else this.anchor = { x: this.anchor.x + mx, y: this.anchor.y + my };
      buildSound("snap");
      this.drawHand();
    } else if (furn && this.hand.length && key === "enter") this.drop();
    else if (key === "escape") {
      if (this.cancel()) buildSound("remove");
      else if (furn && b.selected.length) this.setBuild({ selected: [] });
      else if (furn && b.mode !== "hand") this.setMode("hand");
      else this.setBuild({ on: false });
      this.drawOutlines();
    } else return false;
    return true;
  }

  setMode(mode: "hand" | "place" | "eyedrop") {
    if (mode !== "place") this.cancel();
    this.setBuild({ mode, ...(mode !== "place" ? { props: null } : {}) });
    this.refresh();
  }

  // The UI changed something (tool, catalog item, brush…): redraw.
  refresh() {
    const model = this.model;
    if (!model) return;
    const bt = hud.get().build;
    model.passAvatars = bt.on;
    model.passObjects = bt.on && bt.tool === "walls";
    model.showSpawn(bt.on && (bt.tool === "map" || bt.pickSpawn));
    model.setBuildGrid(bt.on && (bt.tool === "furniture" || bt.tool === "walls" || bt.tool === "rooms"));
    model.wallView = bt.on ? bt.wallView : null;
    if (!bt.on) {
      this.cancel();
      model.setGhosts([], 0);
      model.setOutlines([]);
      model.setHidden([]);
      model.setEdgeGhosts([]);
      model.setFaceGhosts([]);
      this.free.end();
      const canvas = this.w.tp?.renderer.domElement;
      if (canvas) canvas.style.cursor = "";
      this.setBuild({ selected: [], hover: null, wallTag: null });
      return;
    }
    if (bt.tool !== "walls") {
      model.setFaceGhosts([]);
      this.free.end();
      this.paintFrom = null;
      if (bt.wallTag) this.setBuild({ wallTag: null });
    }
    if (bt.tool === "furniture") {
      model.setEdgeGhost(null, false);
      if (bt.mode === "place") this.syncPlace();
      else if (
        this.hand.some((h) => !h.origin) &&
        !this.hand.some((h) => h.origin) &&
        this.hand.length === 1 &&
        bt.mode === "hand"
      )
        this.setHand([]);
      return this.drawHand();
    }
    if (this.hand.length) this.cancel();
    model.setOutlines([]);
    this.refreshOther();
  }

  // ── walls, rooms, desks, map ──
  // The Walls tool, Sims-style (docs/plan/11-wall-building.md): Build draws
  // straight runs of walls (and openings) between tile corners, ⌘/Ctrl-drag or
  // Erase takes them away; Paint puts a material on wall faces (one, a drag
  // along a line, Shift: the room's); Floors paints tiles; Select picks walls
  // for the inspector. The face under the pointer is always shown.
  private hoverTile = { x: -1, y: -1 };

  private hoverOther(x: number, y: number) {
    const bb = hud.get().build;
    if (!this.model) return;
    if (bb.tool === "walls") {
      this.lastFloor = { x, y };
      if (bb.wallMode === "paint") return this.paintHover();
      if (bb.wallMode === "select") return this.selectHover();
      if (bb.wallMode === "build") return this.free.hover(...this.atWorking(x, y));
      if (bb.wallMode === "floors") return this.floors.hover(...this.atWorking(x, y));
      if (bb.wallMode === "roof") return this.roofs.hover(...this.atWorking(x, y));
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
    this.hoverTile = { x: tx, y: ty };
    this.refreshOther();
  }

  // ── what the pointer is on ──
  private lastFloor: Point | null = null;
  private flipFace = false; // Tab: the other face of the wall under the pointer
  private setTag(tag: WallTag | null) {
    const was = hud.get().build.wallTag;
    if (JSON.stringify(was) !== JSON.stringify(tag)) this.setBuild({ wallTag: tag });
  }

  // ── Paint (plan 72 phase 11: on the structure's walls — the tile tools' panels retired) ──
  // A click paints the stretch of the face under the pointer between the walls meeting it; a drag
  // along it, from where it started to where it's let go; with Shift, every face round the room it
  // looks into. Glass and half walls have no sides.
  private paintFrom: { wall: Wall; side: 1 | -1; t: number } | null = null;
  private paintTo = 0;
  /** The face under the pointer: the wall its ray meets first, which side (as it's drawn — shared
   *  frontNormal), how far along it (m from its a). */
  private paintFreeAim(): { wall: Wall; side: 1 | -1; t: number } | null {
    const ray = this.model?.pointerRay();
    const st = this.w.structure;
    const f = st?.floors.find((q) => q.index === this.w.level) ?? null;
    const fz = f?.z ?? 0;
    if (!ray) return null;
    let best: { wall: Wall; side: 1 | -1; t: number; d: number } | null = null;
    for (const w of this.free.wallsHere()) {
      const pts = wallPoints(w);
      let along = 0;
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        const seg = Math.hypot(ex, ey);
        const den = ray.d.x * ey - ray.d.y * ex;
        if (Math.abs(den) > 1e-9) {
          const d = ((a[0] - ray.o.x) * ey - (a[1] - ray.o.y) * ex) / den;
          const u = ((a[0] - ray.o.x) * ray.d.y - (a[1] - ray.o.y) * ray.d.x) / den;
          const z = ray.o.z + ray.d.z * d;
          const z0 = w.base - fz;
          // (a wall the view looks through — cut away, faded — isn't aimed at: the one past it is)
          const hit = (): boolean => !this.model?.throughAt(a[0] + ex * u, a[1] + ey * u);
          if (d > 0 && u >= 0 && u <= 1 && z >= z0 && z <= z0 + w.height && (!best || d < best.d) && hit()) {
            // (from its front's side the ray runs against its front)
            const [nx, ny] = frontNormal(w, f);
            const front = ray.d.x * nx + ray.d.y * ny < 0;
            const side: 1 | -1 = front !== this.flipFace ? 1 : -1;
            best = { wall: w, side, t: along + u * seg, d };
          }
        }
        along += seg;
      }
    }
    return best ? { wall: best.wall, side: best.side, t: best.t } : null;
  }
  /** A stretch of a wall's face as a ghost: its points from `from` to `to` (m along it). */
  private stretchGhost(w: Wall, from: number, to: number, ok: boolean, mat?: string): SegGhost | null {
    const pts = wallPoints(w);
    const out: [number, number][] = [];
    let along = 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const at = (t: number): [number, number] => [a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg];
      const s0 = Math.max(from - along, 0);
      const s1 = Math.min(to - along, seg);
      if (s1 > s0 + 1e-6) {
        if (!out.length) out.push(at(s0));
        out.push(at(s1));
      }
      along += seg;
    }
    if (out.length < 2) return null;
    return {
      a: out[0],
      b: out[out.length - 1],
      h: w.height,
      t: w.thick,
      ok,
      ...(mat ? { mat } : {}),
      ...(out.length > 2 ? { pts: out } : {}),
    };
  }
  /** What a press at `fp` paints now: the drag's stretch, the one round it, a room's (Shift). */
  private paintPlan(
    fp: { wall: Wall; side: 1 | -1; t: number },
    to: number | null,
  ): { room: string } | { stretch: { from: number; to: number } } | null {
    const st = this.w.structure;
    if (!st) return null;
    if (this.shift) {
      const room = this.roomFacing(fp);
      return room ? { room } : null;
    }
    const s =
      to !== null && Math.abs(to - fp.t) > 0.3
        ? { from: Math.min(fp.t, to), to: Math.max(fp.t, to) }
        : stretchAt(st, fp.wall, fp.t);
    return { stretch: s };
  }
  /** The room a face looks into: the one just off it on its side. */
  private roomFacing(fp: { wall: Wall; side: 1 | -1; t: number }): string | null {
    const st = this.w.structure;
    if (!st) return null;
    const f = st.floors.find((q) => q.index === this.w.level) ?? null;
    const [nx, ny] = frontNormal(fp.wall, f);
    const L = Math.hypot(fp.wall.b[0] - fp.wall.a[0], fp.wall.b[1] - fp.wall.a[1]) || 1;
    const t = Math.max(0, Math.min(L, fp.t)) / L;
    const [px, py] = [
      fp.wall.a[0] + (fp.wall.b[0] - fp.wall.a[0]) * t,
      fp.wall.a[1] + (fp.wall.b[1] - fp.wall.a[1]) * t,
    ];
    const a = areaAt(this.map, px + nx * fp.side * 0.3, py + ny * fp.side * 0.3);
    return a && st.rooms.some((r) => r.key === a.key) ? a.key : null;
  }
  private paintHover() {
    const e = this.model;
    if (!e) return;
    const mat = hud.get().build.paint;
    const held = this.paintFrom;
    const fp = held ?? this.paintFreeAim();
    if (held) {
      const now = this.paintFreeAim();
      if (now && now.wall.id === held.wall.id) this.paintTo = now.t;
    }
    e.setFaceGhosts([]);
    if (!fp) {
      e.setSegGhosts([]);
      return this.setTag(null);
    }
    const w = fp.wall;
    const was = fp.side > 0 ? w.front : (w.back ?? w.front);
    const ok = (FACE_PAINTS as readonly string[]).includes(w.front);
    const plan = ok ? this.paintPlan(fp, held ? this.paintTo : null) : null;
    const st = this.w.structure;
    const ghosts =
      plan && "room" in plan && plan.room && st
        ? roomStretches(st, plan.room, mat)
            .map((q) => {
              const qw = st.walls.find((x) => x.id === q.id);
              return qw ? this.stretchGhost(qw, q.from, q.to, true, mat) : null;
            })
            .filter((g) => !!g)
        : [
            this.stretchGhost(
              w,
              plan && "stretch" in plan ? plan.stretch.from : 0,
              plan && "stretch" in plan ? plan.stretch.to : 0,
              ok,
              mat,
            ) ?? this.stretchGhost(w, 0, 1e9, ok, mat),
          ];
    e.setSegGhosts(ghosts.filter((g): g is NonNullable<typeof g> => !!g));
    this.setTag({
      kind: "face",
      far: fp.side < 0,
      room: this.roomFacing(fp) ? (areaAt(this.map, w.a[0], w.a[1])?.name ?? null) : null,
      from: was,
      to: ok ? mat : null,
      why: ok ? null : w.front === "g" ? tr("wallWhyGlass") : tr("wallWhyHalf"),
      n: ghosts.length,
    });
  }
  private paintDown() {
    const fp = this.paintFreeAim();
    if (!fp) return;
    if (!(FACE_PAINTS as readonly string[]).includes(fp.wall.front)) return void buildSound("nope");
    this.paintFrom = fp;
    this.paintTo = fp.t;
    this.paintHover();
  }
  private paintUp() {
    const fp = this.paintFrom;
    this.paintFrom = null;
    if (!fp) return;
    const mat = hud.get().build.paint;
    const plan = this.paintPlan(fp, this.paintTo);
    if (!plan) return void buildSound("nope");
    if ("room" in plan) this.send("struct:paint", { level: this.w.level, room: plan.room, mat });
    else
      this.send("struct:paint", {
        level: this.w.level,
        stretches: [{ id: fp.wall.id, side: fp.side, from: plan.stretch.from, to: plan.stretch.to, mat }],
      });
    buildSound("drop");
    this.paintHover();
  }
  // E over a face: its material in the brush
  private sampleFace(): boolean {
    const fp = this.paintFreeAim();
    if (!fp || !(FACE_PAINTS as readonly string[]).includes(fp.wall.front)) return false;
    this.setBuild({ paint: fp.side > 0 ? fp.wall.front : (fp.wall.back ?? fp.wall.front) });
    buildSound("select");
    this.paintHover();
    return true;
  }

  // ── Select (the inspector): a wall picked, its card over it ──
  private selectHover() {
    const e = this.model;
    if (!e) return;
    const fp = this.paintFreeAim();
    const picked = this.freeWall(hud.get().build.freeSel);
    const ghost = (w: Wall, ok: boolean) => ({
      a: w.a,
      b: w.b,
      h: w.height,
      t: w.thick,
      ok,
      ...(isArc(w) ? { pts: wallPoints(w) } : {}),
    });
    e.setFaceGhosts([]);
    e.setSegGhosts([
      ...(picked ? [ghost(picked, true)] : []),
      ...(fp && fp.wall !== picked ? [ghost(fp.wall, true)] : []),
    ]);
    this.setTag(null);
  }
  private selectClick() {
    const fp = this.paintFreeAim();
    this.setBuild({ freeSel: fp ? fp.wall.id : null });
    buildSound("select");
    this.selectHover();
  }

  private removing = false; // ⌘/Ctrl held: Build takes walls away (freewalls.ts)

  private downOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls") {
      this.lastFloor = { x, y };
      if (b.wallMode === "paint") return this.paintDown();
      if (b.wallMode === "select") return;
      if (b.wallMode === "build") return this.free.down(...this.atWorking(x, y));
      if (b.wallMode === "roof") return this.roofs.down(...this.atWorking(x, y));
      // floors: drawn free (phase 11.7)
      return this.floors.down(...this.atWorking(x, y));
    }
  }

  private upOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls" && b.wallMode === "paint") return this.paintUp();
    if (b.tool === "walls" && b.wallMode === "build") return this.free.up(...this.atWorking(x, y));
    if (b.tool === "walls" && b.wallMode === "floors") return this.floors.up(...this.atWorking(x, y));
    if (b.tool === "walls" && b.wallMode === "roof") return this.roofs.up(...this.atWorking(x, y));
  }

  private refreshOther() {
    const model = this.model;
    if (!model) return;
    const bt = hud.get().build;
    if (!FreeWalls.owns()) {
      this.free.end();
      model.setSegGhosts([]);
    }
    if (!FreeFloors.owns() && !FreeRoofs.owns()) {
      this.floors.end();
      this.roofs.end();
      model.setPolyGhosts([]);
    }
    model.setCueLift(bt.tool === "walls" ? (bt.over ?? 0) : 0);
    if (bt.tool === "walls" && bt.wallMode !== "floors") {
      // (the mode's hover draws what it shows)
      if (this.lastFloor) this.hoverOther(this.lastFloor.x, this.lastFloor.y);
      return;
    }
    model.setEdgeGhosts([]);
    model.setFaceGhosts([]);
    model.setGhost(null, false);
    if (bt.wallTag) this.setBuild({ wallTag: null });
  }

  /** The building changed (an edit's operations came in): what the free walls show, again. */
  structChanged() {
    if (FreeWalls.owns()) this.free.redraw();
  }
  /** The server's word on walls drawn free: their ids. */
  wallsOk(m: ServerMessages["struct:walls:ok"]) {
    this.free.ok(m);
  }

  clearRoomGhost() {
    this.model?.setRectGhost(null);
  }

  private clickOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls") {
      if (b.wallMode === "select") return this.selectClick();
      if (b.wallMode === "floors") return; // (freefloors.ts: on the release)
      return;
    }
    if (b.tool === "desks") {
      const hit = this.model?.objectAtTile(Math.floor(x), Math.floor(y));
      if (hit && entry(hit.kind).seat) this.setBuild({ deskDraft: hit.id });
    }
  }

  // Keys for the Walls tool (true = handled): Tab the other face, E sample a
  // face (Paint), [ ] the walls' view, Esc lets go of a run / the selection.
  private wallKey(key: string): boolean {
    const b = hud.get().build;
    if (key === "[" || key === "]") {
      const views: WallView[] = ["down", "cut", "up"];
      const i = views.indexOf(b.wallView) + (key === "]" ? 1 : -1);
      this.setWallView(views[Math.max(0, Math.min(2, i))]);
      return true;
    }
    if (b.tool !== "walls") return false;
    if (b.wallMode === "build" && this.free.key(key)) return true;
    if (b.wallMode === "floors" && this.floors.key(key)) return true;
    if (b.wallMode === "roof" && this.roofs.key(key)) return true;
    if (key === "tab" && (b.wallMode === "paint" || b.wallMode === "select" || b.wallMode === "build")) {
      this.flipFace = !this.flipFace;
      buildSound("rotate");
      this.refreshOther();
      return true;
    }
    if (key === "e" && b.wallMode === "paint") return this.sampleFace();
    if (key === "escape") {
      if (this.paintFrom) {
        this.paintFrom = null;
        this.refreshOther();
        return true;
      }
      if (b.freeSel) {
        this.setBuild({ freeSel: null });
        this.refreshOther();
        return true;
      }
    }
    return false;
  }
  // Where the wall inspector goes (client px): over the first selected wall.
  /** A wall drawn free of my floor by its id. */
  freeWall(id: string | null): Wall | null {
    return id ? (this.free.wallsHere().find((w) => w.id === id) ?? null) : null;
  }
  /** The inspector's actions on the wall drawn free picked: the other side as this one, the sides
   *  swapped, the wall taken away. */
  freeWallAction(act: "same" | "swap" | "remove") {
    const w = this.freeWall(hud.get().build.freeSel);
    if (!w) return;
    if (act === "remove") {
      this.send("struct:walls", { level: this.w.level, remove: [w.id] });
      this.setBuild({ freeSel: null });
      this.model?.setSegGhosts([]);
      return void buildSound("remove");
    }
    const back = w.back ?? w.front;
    if (back === w.front) return;
    this.send("struct:walls", {
      level: this.w.level,
      set: [act === "swap" ? { id: w.id, front: back, back: w.front } : { id: w.id, back: w.front }],
    });
    buildSound("drop");
  }
  wallAnchor(): { x: number; y: number } | null {
    const fw = this.freeWall(hud.get().build.freeSel);
    if (fw) {
      const m = wallPoints(fw)[Math.floor(wallPoints(fw).length / 2)];
      const fz = this.w.structure?.floors.find((f) => f.index === this.w.level)?.z ?? 0;
      return this.client(m[0], m[1], fw.base - fz + fw.height + 0.2);
    }
    return null;
  }
  setWallView(v: WallView) {
    this.setBuild({ wallView: v });
    if (this.model) this.model.wallView = v;
    buildSound("select");
  }

  // Desks tool: drag a person from the panel onto a seat.
  seatAt(clientX: number, clientY: number): WorldObjectDef | null {
    const w = this.model?.screenToWorld(clientX, clientY);
    if (!w) return null;
    const o = this.model?.objectAtTile(Math.floor(w.x), Math.floor(w.y));
    return o && entry(o.kind).seat ? o : null;
  }
  showSeatDrop(at: { x: number; y: number } | null) {
    if (!at) return this.model?.setRectGhost(null);
    const w = this.model?.screenToWorld(at.x, at.y);
    if (!w) return;
    const seat = this.seatAt(at.x, at.y);
    const t = seat ?? { x: Math.floor(w.x), y: Math.floor(w.y) };
    this.model?.setRectGhost({ x: t.x, y: t.y, w: 1, h: 1, ok: !!seat });
  }
}

// Where a moved thing is, beyond x / y / rot: its cell on a top, its spot on a wall.
function spotProps(d: WorldObjectDef): Record<string, unknown> {
  if (onTop(d)) return { c: d.props?.c };
  if (entry(d.kind).wall) return { wu: d.props?.wu, wz: d.props?.wz };
  // (a thing that can stand free: whether it does)
  if (canBeFree(d.kind)) return { free: d.props?.free === true };
  // (a door or window: in a wall drawn free by its wall and spot; else on the tile lines)
  if (isOpening(d.kind)) return d.props?.free ? { free: true, on: d.props.on } : { free: false };
  return {};
}

// A wall item turned over to its wall's other side: the same spot if that
// fits, else the nearest along that face (up to two tiles either way).
function otherSide(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef): WorldObjectDef | null {
  const h = hangOf(o);
  const face: Face = { dir: h.dir, line: h.line, side: h.side > 0 ? -1 : 1 };
  const wz = Math.round(h.lift / WZ);
  for (let k = 0; k <= 2 * WQ; k++)
    for (const s of k ? [1, -1] : [1]) {
      const def = hangAt(o, face, h.u0 + s * k, wz);
      if (canPlace(map, others, def)) return def;
    }
  return null;
}

// A quarter turn clockwise of something held, about the pointer's tile.
// A door swung the other way (props.swing: 1 into its own tile, −1 the other).
function swung(o: WorldObjectDef): WorldObjectDef {
  return { ...o, props: { ...(o.props ?? {}), swing: Number(o.props?.swing) < 0 ? 1 : -1 } };
}

function turn(h: Held): Held {
  const e = entry(h.def.kind);
  if (e.wall || isOpening(h.def.kind)) return h; // things on (and in) walls face the room
  const { h: fh } = footprint(h.def.kind, quarterOf(h.def));
  return { ...h, def: { ...h.def, yaw: quarterYaw((quarterOf(h.def) + 1) % 4) }, dx: 1 - h.dy - fh, dy: h.dx };
}

// The middle of what's in hand (tile offsets from the pointer's tile).
function handMiddle(hand: Held[]): Point {
  const solid = hand.filter((h) => !h.ride && !entry(h.def.kind).wall && !isOpening(h.def.kind));
  if (!solid.length) return { x: 0.5, y: 0.5 };
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const h of solid) {
    const { w, h: d } = footprint(h.def.kind, quarterOf(h.def));
    x0 = Math.min(x0, h.dx);
    y0 = Math.min(y0, h.dy);
    x1 = Math.max(x1, h.dx + w);
    y1 = Math.max(y1, h.dy + d);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

// A quarter turn clockwise of something held, about a point (tile offsets):
// its middle turns about the point, its footprint turns with it.
function turnAbout(h: Held, p: Point): Held {
  const e = entry(h.def.kind);
  if (e.wall || isOpening(h.def.kind)) return h; // things on (and in) walls face the room
  const { w, h: d } = footprint(h.def.kind, quarterOf(h.def));
  const cx = h.dx + w / 2 - p.x;
  const cy = h.dy + d / 2 - p.y;
  // (x, y) → (−y, x): the same clockwise turn as the footprint's
  const nx = p.x - cy;
  const ny = p.y + cx;
  return {
    ...h,
    def: { ...h.def, yaw: quarterYaw((quarterOf(h.def) + 1) % 4) },
    dx: Math.round(nx - d / 2),
    dy: Math.round(ny - w / 2),
  };
}

// A quarter turn of something held on its own on a surface, about the middle of
// the cell under the pointer.
function turnTop(h: Held): Held {
  const rot = (quarterOf(h.def) + 1) % 4;
  const [w, d] = topSize(h.def);
  const ux = (h.qx ?? 0) + w / 2 - 0.5;
  const uy = (h.qy ?? 0) + d / 2 - 0.5;
  const [w2, d2] = topSize({ ...h.def, yaw: quarterYaw(rot) });
  return {
    ...h,
    def: { ...h.def, yaw: quarterYaw(rot) },
    qx: Math.round(0.5 - uy - w2 / 2),
    qy: Math.round(0.5 + ux - d2 / 2),
  };
}

function rectOf(a: Point, b: Point) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
}
