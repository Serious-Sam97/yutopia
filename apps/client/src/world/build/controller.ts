import {
  areaAt,
  type ClientMessages,
  canPlace,
  carried,
  cornerNear,
  doorLeaves,
  type Edge,
  edgeAt,
  edgeBlocker,
  entry,
  type Face,
  faceHit,
  faceMat,
  faceNear,
  footprint,
  hangAt,
  hangCanon,
  hangNear,
  hangOf,
  hangSpot,
  hostOf,
  isDoorKind,
  isFacedWall,
  isFloor,
  isOpening,
  isWallEdge,
  joinedFaces,
  lockedEdge,
  type MapDef,
  NO_WALL,
  nearestEdge,
  openingEdges,
  openingNear,
  otherFace,
  type Panel,
  type Point,
  panelAt,
  panelKey,
  panelTile,
  placedFootprint,
  Q,
  runBetween,
  surfaceAt,
  takenId,
  tileAt,
  topAt,
  topCentre,
  topNear,
  topRect,
  topSize,
  VOID,
  type WorldObjectDef,
  WQ,
  WZ_PX,
  wallTakes,
} from "@yutopia/shared";
import type { SetupItem } from "@/lib/api";
import { tr, trMaybe } from "@/lib/i18n";
import { C } from "../art/palette";
import type { WorldController } from "../controller";
import type { EdgeGhost, FaceGhost, Outline, Pick } from "../model";
import { hud, toast, type WallTag, type WallView } from "../store";
import { buildSound } from "./sounds";

// Marks this chunk for `pnpm budget` (build mode loads on demand).
export const BUILD_CHUNK = "yutopia-build";

// biome-ignore lint/suspicious/noExplicitAny: decoded Colyseus schema objects
type S = any;

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
  `${o.x},${o.y},${o.rot ?? 0},${onTop(o) ? topRect(o).x + topRect(o).y * 1e4 : ""}`;

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
const LIFT = 10; // how high held things float

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
  private aim: { face: Face; along: number; z: number | null } | null = null;
  private flip = false;
  hoverPick: Pick | null = null;

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
    return this.room ? [...this.room.state.players.values()].map((p: S) => ({ x: p.x, y: p.y })) : [];
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
        def = { ...h.def, x: on.x, y: on.y, rot: on.rot, props: { ...(h.def.props ?? {}), c: on.props?.c } };
      } else if (fine && h.qx !== undefined && h.qy !== undefined)
        def = topAt(h.def, this.cell.x + h.qx, this.cell.y + h.qy);
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
      if (this.slotting() && this.aim) def = openingNear(def, this.aim.face, this.aim.along);
      const ok = canPlace(this.map, [...rest, ...sofar], def, bodies);
      sofar.push(def);
      out.push({ def, ok });
    }
    return out;
  }

  // One wall item in hand: it goes where the pointer meets a wall.
  private hanging(): boolean {
    return this.hand.length === 1 && !!entry(this.hand[0].def.kind).wall;
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
    else {
      const p = e.pointerWorld();
      const n = faceNear(this.map, p.x, p.y, slot ? (ch) => wallTakes(kind, ch) : undefined);
      if (n) aim = { face: n.face, along: n.along, z: null };
    }
    const was = this.aim;
    if (!aim) return false;
    // another wall: R's flip starts over
    if (!was || was.face.dir !== aim.face.dir || was.face.line !== aim.face.line) this.flip = false;
    this.aim = aim;
    const key = (a: typeof aim) => {
      const h = this.hand[0];
      const d = !h ? null : slot ? openingNear(h.def, a.face, a.along) : hangNear(h.def, a.face, a.along, a.z);
      return d ? `${d.x},${d.y},${d.rot},${d.props?.wu},${d.props?.wz}` : "";
    };
    return !was || key(was) !== key(aim);
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
      rot,
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
    if (this.hand.length === 1 && !cur.origin && cur.def.kind === b.kind && cur.def.rot === b.rot) return;
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
        rot: def.rot ?? 0,
        // moved: as stored (never drawing-only flags), in its new cell if on a
        // top, at its new spot if on a wall
        props: h.origin ? { ...(this.storedProps(h.origin.id) ?? {}), ...spotProps(def) } : def.props,
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
    return h ? { kind: h.def.kind, props: h.def.props, rot: h.def.rot ?? 0, count: this.hand.length } : null;
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
      return { id: o.id, kind: o.kind, x: d.x, y: d.y, rot: o.rot ?? 0, props: d.props };
    });
    if (items.length === 1) this.send("obj:put", { ...items[0], refId: sel[0].refId ?? null });
    else this.send("obj:batch", { items });
    buildSound("select");
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
          return entry(h.def.kind).wall || isOpening(h.def.kind)
            ? h
            : { ...h, def: { ...h.def, rot: ((h.def.rot ?? 0) + 1) % 4 } };
        }
        return turnAbout(h, pivot);
      });
      // a wall item: over to the wall's other side
      if (this.hanging()) this.flip = !this.flip;
      const b = hud.get().build;
      if (b.mode === "place" && this.hand.length === 1 && !this.hand[0].origin && !this.hanging() && !this.slotting())
        this.setBuild({ rot: this.hand[0].def.rot ?? 0 });
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
      defs.push(topNear({ ...o, rot: ((o.rot ?? 0) + 1) % 4 }, c.x, c.y));
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
        rot: d.rot ?? 0,
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
          rot: d.rot ?? 0,
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
      rot: o.rot ?? 0,
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
      rot: it.rot,
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
      this.setBuild({ mode: "place", kind: o.kind, props: this.copyable(o.props), rot: o.rot ?? 0 });
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
    const z = onTop(o) ? (Number(o.props?.z) || 0) + 30 : entry(o.kind).wall ? hangOf(o).z1 + 10 : 52;
    return this.client(c.x, c.y, z);
  }
  // a world point (`z` iso px up) in client px (the view answers from its canvas's corner)
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
        this.aim = { ...a, along: a.along + along / WQ, z: z - d[1] * WZ_PX };
      } else if (this.fine()) this.cell = { x: this.cell.x + mx, y: this.cell.y + my };
      else this.anchor = { x: this.anchor.x + mx, y: this.anchor.y + my };
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
      const canvas = this.w.tp?.renderer.domElement;
      if (canvas) canvas.style.cursor = "";
      this.setBuild({ selected: [], hover: null, wallTag: null, wallSel: [] });
      return;
    }
    if (bt.tool !== "walls") {
      model.setFaceGhosts([]);
      this.run = null;
      this.stroke = null;
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
      if (bb.wallMode === "build") return this.buildHover(x, y);
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
    this.hoverTile = { x: tx, y: ty };
    if (bb.tool === "walls" && this.boxing() && this.dragFrom)
      this.model.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
    else if (bb.tool === "walls" && this.painting) this.paintAt(tx, ty);
    if (bb.tool === "rooms" && this.dragFrom) this.model.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
    this.refreshOther();
  }

  // ── what the pointer is on ──
  private lastFloor: Point | null = null;
  private flipFace = false; // Tab: the other face of the panel under the pointer
  private flipOf: string | null = null; // (the edge it was flipped on)
  private panelNow(): Panel | null {
    const e = this.model;
    if (!e) return null;
    const through = e.lookedThrough();
    const p = panelAt(this.map, e.pointerRay(), this.lastFloor, (w) => through.has(`${w.dir}${w.x},${w.y}`));
    if (!p) return null;
    const k = `${p.dir}${p.x},${p.y}`;
    if (this.flipOf !== k) {
      this.flipOf = k;
      this.flipFace = false;
    }
    return this.flipFace ? otherFace(p) : p;
  }
  // The chip for a face: the room it looks into, what it is now and what the
  // brush would make it.
  private faceTag(p: Panel, to: string | null, why: string | null, n = 1): WallTag {
    const [tx, ty] = panelTile(p);
    const room = isFloor(tileAt(this.map, tx, ty)) ? (areaAt(this.map, tx + 0.5, ty + 0.5)?.name ?? null) : null;
    const ch = edgeAt(this.map, p);
    const from = faceMat(this.map, p, p.side) ?? (ch === "g" ? "g" : ch === "h" ? "h" : null);
    // (`far`: a face turned from the iso camera; the 3D view sees every side)
    return { kind: "face", far: false, room, from, to, why, n };
  }
  private setTag(tag: WallTag | null) {
    const was = hud.get().build.wallTag;
    if (JSON.stringify(was) !== JSON.stringify(tag)) this.setBuild({ wallTag: tag });
  }

  // ── Paint ──
  // a stroke: the panels painted so far, along the line it started on, on its side
  private stroke: { p: Panel; at: number; panels: Map<string, Panel> } | null = null;
  private paintable(p: Panel): string | null {
    const ch = edgeAt(this.map, p);
    if (isFacedWall(ch)) return null;
    if (ch === "g") return tr("wallWhyGlass");
    if (ch === "h") return tr("wallWhyHalf");
    return tr("wallWhyNone");
  }
  private paintHover() {
    const e = this.model;
    if (!e) return;
    const mat = hud.get().build.paint;
    if (this.stroke) {
      // along the stroke's line, on its side, every panel from where it was to the pointer
      const s = this.stroke;
      const along = this.alongFace(s.p);
      if (along !== null) {
        const to = Math.floor(along);
        const step = to >= s.at ? 1 : -1;
        for (let a = s.at; a !== to + step; a += step) {
          const q: Panel = s.p.dir === "h" ? { ...s.p, x: a } : { ...s.p, y: a };
          if (!this.paintable(q)) s.panels.set(panelKey(q), q);
        }
        s.at = to;
      }
      const list = [...s.panels.values()];
      e.setFaceGhosts(list.map((p) => ({ p, mat, ok: true })));
      this.setTag(list.length ? this.faceTag(list[list.length - 1], mat, null, list.length) : null);
      return;
    }
    const p = this.panelNow();
    if (!p) {
      e.setFaceGhosts([]);
      return this.setTag(null);
    }
    const why = this.paintable(p);
    // Shift: the faces round the room it looks into
    const list = this.shift && !why ? joinedFaces(this.map, this.objects(), p) : [p];
    e.setFaceGhosts(list.slice(0, 800).map((q) => ({ p: q, mat: why ? null : mat, ok: !why })));
    this.setTag(this.faceTag(p, why ? null : mat, why, list.length));
  }
  // Where along a panel's wall line the pointer is: on that face (the
  // pointer's ray meets its plane), else the floor under the pointer.
  private alongFace(p: Panel): number | null {
    const ray = this.model?.pointerRay();
    if (ray) {
      const plane = (p.dir === "h" ? p.y : p.x) + p.side * 0.1;
      const dn = p.dir === "h" ? ray.d.y : ray.d.x;
      if (Math.abs(dn) > 1e-9) {
        const t = (plane - (p.dir === "h" ? ray.o.y : ray.o.x)) / dn;
        if (t > 0) return p.dir === "h" ? ray.o.x + ray.d.x * t : ray.o.y + ray.d.y * t;
      }
    }
    const f = this.lastFloor;
    return f ? (p.dir === "h" ? f.x : f.y) : null;
  }
  private paintDown() {
    const p = this.panelNow();
    if (!p || this.paintable(p)) {
      if (p) buildSound("nope");
      return;
    }
    this.stroke = { p, at: p.dir === "h" ? p.x : p.y, panels: new Map([[panelKey(p), p]]) };
    this.paintHover();
  }
  private paintUp() {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    const mat = hud.get().build.paint;
    // a click with Shift: the room's faces on that side
    const faces =
      this.shift && s.panels.size === 1 ? joinedFaces(this.map, this.objects(), s.p) : [...s.panels.values()];
    const todo = faces.filter((p) => faceMat(this.map, p, p.side) !== mat);
    for (let i = 0; i < todo.length; i += 1200)
      this.send("map:faces", {
        faces: todo.slice(i, i + 1200).map((p) => ({ dir: p.dir, x: p.x, y: p.y, side: p.side })),
        mat,
      });
    buildSound(todo.length ? "drop" : "snap");
    this.paintHover();
  }
  // E over a face: its material in the brush
  private sampleFace(): boolean {
    const p = this.panelNow();
    const m = p ? faceMat(this.map, p, p.side) : null;
    if (!m) return false;
    this.setBuild({ paint: m });
    buildSound("select");
    this.paintHover();
    return true;
  }

  // ── Select (the inspector) ──
  private selectHover() {
    const e = this.model;
    if (!e) return;
    const p = this.panelNow();
    const sel = hud.get().build.wallSel;
    const key = new Set(sel.map(panelKey));
    const list: FaceGhost[] = sel.map((q) => ({ p: q, mat: null, ok: true, sel: true }));
    if (p && !key.has(panelKey(p))) list.push({ p, mat: null, ok: true });
    e.setFaceGhosts(list);
    this.setTag(p ? this.faceTag(p, null, null) : null);
  }
  private selectClick() {
    const p = this.panelNow();
    const sel = hud.get().build.wallSel;
    if (!p) {
      if (!this.shift) this.setBuild({ wallSel: [] });
    } else if (this.shift) {
      const k = panelKey(p);
      const has = sel.some((q) => panelKey(q) === k);
      this.setBuild({ wallSel: has ? sel.filter((q) => panelKey(q) !== k) : [...sel, p] });
    } else this.setBuild({ wallSel: [p] });
    buildSound("select");
    this.selectHover();
  }
  // The inspector's actions, on every selected panel.
  wallAction(act: "same" | "swap" | "remove") {
    const sel = hud.get().build.wallSel;
    if (!sel.length) return;
    const byMat = new Map<string, Panel[]>();
    const paint = (p: Panel, m: string | null) => {
      if (!m) return;
      byMat.set(m, [...(byMat.get(m) ?? []), p]);
    };
    if (act === "same" || act === "swap") {
      for (const p of sel) {
        const a = faceMat(this.map, p, p.side);
        const b = faceMat(this.map, p, -p.side);
        if (!a || !b) continue;
        paint(otherFace(p), a);
        if (act === "swap") paint(p, b);
      }
      for (const [mat, faces] of byMat)
        this.send("map:faces", { faces: faces.map((p) => ({ dir: p.dir, x: p.x, y: p.y, side: p.side })), mat });
    } else {
      const edges = sel.flatMap((p) => {
        const ch = edgeAt(this.map, p);
        if (!isWallEdge(ch)) return [];
        return act === "remove" ? [{ dir: p.dir, x: p.x, y: p.y, ch: NO_WALL }] : [];
      });
      if (edges.length) this.send("map:walls", { edges });
      if (act === "remove") this.setBuild({ wallSel: [] });
    }
    buildSound(act === "remove" ? "remove" : "drop");
  }

  // ── Build: straight runs between corners ──
  private run: { from: Point; press: Point } | null = null;
  private removing = false; // ⌘/Ctrl held: Build takes walls away
  // What Build does to an edge: build `ch`, take the wall away, or skip it (and why).
  private runEdge(e: Edge, remove: boolean): EdgeGhost & { ch: string; why: string | null; skip: boolean } {
    const cur = edgeAt(this.map, e);
    const objs = this.objects();
    if (remove) {
      if (!isWallEdge(cur)) return { e, ok: true, remove: true, ch: NO_WALL, why: null, skip: true };
      const why = edgeBlocker(this.map, objs, e, NO_WALL);
      return { e, ok: !why, remove: true, ch: NO_WALL, why, skip: !!why };
    }
    const ch = this.edgeChar(e);
    // never repaints a wall that's there (that's Paint's job); a window or
    // another kind of wall (glass, half) changes it
    if (cur === ch || (isFacedWall(cur) && /^[pwfbk]$/.test(ch)))
      return { e, ok: true, ch, why: tr("wallWhyThere"), skip: true };
    const why = edgeBlocker(this.map, objs, e, ch);
    return { e, ok: !why, ch, why, skip: !!why };
  }
  private runList(): ReturnType<BuildController["runEdge"]>[] {
    const r = this.run;
    const f = this.lastFloor;
    if (!r || !f) return [];
    const remove = this.removing || hud.get().build.paintMode === "erase";
    const to = cornerNear(f.x, f.y);
    const { edges } = runBetween(r.from, to);
    // a click without a drag: the edge it was pressed next to
    const list = edges.length ? edges : [nearestEdge(r.press.x, r.press.y)];
    return list.map((e) => this.runEdge(e, remove));
  }
  private buildHover(x: number, y: number) {
    const e = this.model;
    if (!e) return;
    if (this.boxing()) {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!this.dragFrom) {
        e.setEdgeGhosts([]);
        return this.setTag(null);
      }
      const r = this.dragRect(tx, ty);
      const list = ringEdges(r).map((q) => this.runEdge(q, false));
      e.setEdgeGhosts(list.filter((g) => !g.skip || g.why === null).map(({ e: q, ok }) => ({ e: q, ok })));
      return this.setTag(runTag(list, false, r));
    }
    e.setGhost(null, false);
    if (this.run) {
      const list = this.runList();
      e.setEdgeGhosts(
        list.filter((g) => !g.skip || !!g.why).map(({ e: q, ok, remove, skip }) => ({ e: q, ok: ok && !skip, remove })),
      );
      e.setFaceGhosts([]);
      return this.setTag(runTag(list, !!list[0]?.remove));
    }
    // not pressed: the edge a click would start on, and the wall face that's there
    const q = nearestEdge(x, y);
    const g = this.runEdge(q, this.removing || hud.get().build.paintMode === "erase");
    e.setEdgeGhosts(g.skip && !g.remove ? [] : [{ e: q, ok: g.ok && !g.skip, remove: g.remove }]);
    const p = isWallEdge(edgeAt(this.map, q)) ? this.panelNow() : null;
    e.setFaceGhosts(p && g.skip && !g.remove ? [{ p, mat: null, ok: true }] : []);
    this.setTag(p && g.skip && !g.remove ? this.faceTag(p, null, g.why) : g.why ? runTag([g], !!g.remove) : null);
  }
  private buildUp() {
    const list = this.runList();
    this.run = null;
    const edges = list.filter((g) => !g.skip).map((g) => ({ dir: g.e.dir, x: g.e.x, y: g.e.y, ch: g.ch }));
    for (let i = 0; i < edges.length; i += 600) this.send("map:walls", { edges: edges.slice(i, i + 600) });
    if (edges.length) buildSound(list[0]?.remove ? "remove" : "drop");
    else if (list.some((g) => g.why && g.why !== tr("wallWhyThere"))) {
      buildSound("nope");
      toast(list.find((g) => g.why)?.why ?? tr("buildNoFit"), "warn");
    }
    this.model?.setEdgeGhosts([]);
    this.setTag(null);
  }

  // ── walls / rooms tools ──
  private painting = false;
  private paintQueue = new Map<string, { x: number; y: number; ch: string }>();
  private paintTimer: ReturnType<typeof setTimeout> | null = null;
  private dragFrom: { x: number; y: number } | null = null;

  // What a wall brush puts on an edge: a material, or no wall. (Doors and
  // windows are things now: the catalog's Doors & windows.)
  private edgeChar(_e: Edge): string {
    return this.brushNow().slice(2);
  }

  private paintAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("w:")) return;
    this.paintQueue.set(`${tx},${ty}`, { x: tx, y: ty, ch: br });
    if (!this.paintTimer) this.paintTimer = setTimeout(() => this.flushPaint(), 80);
  }

  private flushPaint() {
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = null;
    if (!this.paintQueue.size) return;
    this.send("map:paint", { cells: [...this.paintQueue.values()] });
    this.paintQueue.clear();
  }

  private dragRect(tx: number, ty: number) {
    const a = this.dragFrom ?? { x: tx, y: ty };
    return { x: Math.min(a.x, tx), y: Math.min(a.y, ty), w: Math.abs(tx - a.x) + 1, h: Math.abs(ty - a.y) + 1 };
  }

  private downOther(x: number, y: number) {
    const b = hud.get().build;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (b.tool === "walls") {
      this.lastFloor = { x, y };
      if (b.wallMode === "paint") return this.paintDown();
      if (b.wallMode === "select") return;
      if (this.boxing()) {
        this.dragFrom = { x: tx, y: ty };
        if (b.wallMode === "floors") this.model?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
        else this.buildHover(x, y);
        return;
      }
      if (b.wallMode === "build") {
        this.run = { from: cornerNear(x, y), press: { x, y } };
        return this.buildHover(x, y);
      }
      // floors
      if (b.paintMode === "fill") return; // a click (buildClick) fills
      this.painting = true;
      this.paintAt(tx, ty);
      return;
    }
    if (b.tool === "rooms") {
      this.dragFrom = { x: tx, y: ty };
      this.model?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
    }
  }

  private upOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls" && b.wallMode === "paint") return this.paintUp();
    if (b.tool === "walls" && this.run) {
      this.lastFloor = { x, y };
      return this.buildUp();
    }
    if (this.painting) {
      this.painting = false;
      this.flushPaint();
    }
    if (b.tool === "walls" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      this.model?.setRectGhost(null);
      this.model?.setEdgeGhosts([]);
      this.setTag(null);
      this.paintBox(r);
    }
    if (b.tool === "rooms" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      if (r.w >= 2 && r.h >= 2) hud.set({ build: { ...hud.get().build, roomDraft: r } });
      else this.model?.setRectGhost(null);
    }
  }

  private refreshOther() {
    const model = this.model;
    if (!model) return;
    const bt = hud.get().build;
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

  clearRoomGhost() {
    this.model?.setRectGhost(null);
  }

  private clickOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls") {
      if (b.wallMode === "select") return this.selectClick();
      if (b.wallMode === "floors" && b.paintMode === "fill") return this.fillAt(Math.floor(x), Math.floor(y));
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
    if (key === "tab" && (b.wallMode === "paint" || b.wallMode === "select" || b.wallMode === "build")) {
      this.flipFace = !this.flipFace;
      buildSound("rotate");
      this.refreshOther();
      return true;
    }
    if (key === "e" && b.wallMode === "paint") return this.sampleFace();
    if (key === "escape") {
      if (this.run || this.stroke) {
        this.run = null;
        this.stroke = null;
        this.model?.setEdgeGhosts([]);
        this.refreshOther();
        return true;
      }
      if (b.wallSel.length) {
        this.setBuild({ wallSel: [] });
        this.refreshOther();
        return true;
      }
    }
    return false;
  }
  // Where the wall inspector goes (client px): over the first selected wall.
  wallAnchor(): { x: number; y: number } | null {
    const p = hud.get().build.wallSel[0];
    if (!p) return null;
    const [mx, my] = p.dir === "h" ? [p.x + 0.5, p.y + p.side * 0.1] : [p.x + p.side * 0.1, p.y + 0.5];
    return this.client(mx, my, 136);
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
  // The brush a paint stroke uses: Erase takes walls or floors away, whichever
  // the picked brush paints.
  private brushNow(): string {
    const b = hud.get().build;
    if (b.paintMode !== "erase") return b.brush;
    return b.brush.startsWith("w:") ? "w:." : VOID;
  }
  private boxing(): boolean {
    const b = hud.get().build;
    return b.paintMode === "box";
  }

  // Box: floors fill the rectangle, walls run around it (a wall that's there
  // stays as it is: Paint repaints).
  private paintBox(r: { x: number; y: number; w: number; h: number }) {
    const br = this.brushNow();
    if (br.startsWith("w:")) {
      // windows check the walls painted before them: walls first
      const all = ringEdges(r)
        .map((e) => this.runEdge(e, false))
        .filter((g) => !g.skip)
        .map((g) => ({ dir: g.e.dir, x: g.e.x, y: g.e.y, ch: g.ch }));
      for (let i = 0; i < all.length; i += 600) this.send("map:walls", { edges: all.slice(i, i + 600) });
      if (all.length) buildSound("drop");
      return;
    }
    const cells: { x: number; y: number; ch: string }[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y, ch: br });
    for (let i = 0; i < cells.length; i += 600) this.send("map:paint", { cells: cells.slice(i, i + 600) });
  }

  // Fill: floors flood the same floor up to walls (doors are in them).
  private fillAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("w:")) return;
    const start = tileAt(this.map, tx, ty);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height || start === br) return;
    const blocked = (e: Edge) => isWallEdge(edgeAt(this.map, e));
    const seen = new Set([`${tx},${ty}`]);
    const queue = [{ x: tx, y: ty }];
    const cells: { x: number; y: number; ch: string }[] = [];
    while (queue.length && cells.length < 2400) {
      const c = queue.shift() as Point;
      cells.push({ x: c.x, y: c.y, ch: br });
      const next: [number, number, Edge][] = [
        [c.x + 1, c.y, { x: c.x + 1, y: c.y, dir: "v" }],
        [c.x - 1, c.y, { x: c.x, y: c.y, dir: "v" }],
        [c.x, c.y + 1, { x: c.x, y: c.y + 1, dir: "h" }],
        [c.x, c.y - 1, { x: c.x, y: c.y, dir: "h" }],
      ];
      for (const [nx, ny, e] of next) {
        const k = `${nx},${ny}`;
        if (seen.has(k) || nx < 0 || ny < 0 || nx >= this.map.width || ny >= this.map.height) continue;
        if (tileAt(this.map, nx, ny) !== start || blocked(e)) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    for (let i = 0; i < cells.length; i += 600) this.send("map:paint", { cells: cells.slice(i, i + 600) });
  }
}

// The edges round a rectangle of tiles.
function ringEdges(r: { x: number; y: number; w: number; h: number }): Edge[] {
  const out: Edge[] = [];
  for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y: r.y, dir: "h" }, { x, y: r.y + r.h, dir: "h" });
  for (let y = r.y; y < r.y + r.h; y++) out.push({ x: r.x, y, dir: "v" }, { x: r.x + r.w, y, dir: "v" });
  return out;
}

// The chip for a run (or a box) being drawn: how many walls go up (or come
// down), how many are skipped, the first reason.
function runTag(
  list: { skip: boolean; why: string | null }[],
  remove: boolean,
  box?: { w: number; h: number },
): WallTag {
  const n = list.filter((g) => !g.skip).length;
  const why = list.find((g) => g.skip && g.why)?.why ?? null;
  return { kind: "run", n, remove, skipped: list.length - n, why, ...(box ? { w: box.w, h: box.h } : {}) };
}

// Where a moved thing is, beyond x / y / rot: its cell on a top, its spot on a wall.
function spotProps(d: WorldObjectDef): Record<string, unknown> {
  if (onTop(d)) return { c: d.props?.c };
  if (entry(d.kind).wall) return { wu: d.props?.wu, wz: d.props?.wz };
  return {};
}

// A wall item turned over to its wall's other side: the same spot if that
// fits, else the nearest along that face (up to two tiles either way).
function otherSide(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef): WorldObjectDef | null {
  const h = hangOf(o);
  const face: Face = { dir: h.dir, line: h.line, side: h.side > 0 ? -1 : 1 };
  const wz = Math.round(h.lift / WZ_PX);
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
  const { h: fh } = footprint(h.def.kind, h.def.rot ?? 0);
  return { ...h, def: { ...h.def, rot: ((h.def.rot ?? 0) + 1) % 4 }, dx: 1 - h.dy - fh, dy: h.dx };
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
    const { w, h: d } = footprint(h.def.kind, h.def.rot ?? 0);
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
  const { w, h: d } = footprint(h.def.kind, h.def.rot ?? 0);
  const cx = h.dx + w / 2 - p.x;
  const cy = h.dy + d / 2 - p.y;
  // (x, y) → (−y, x): the same clockwise turn as the footprint's
  const nx = p.x - cy;
  const ny = p.y + cx;
  return {
    ...h,
    def: { ...h.def, rot: ((h.def.rot ?? 0) + 1) % 4 },
    dx: Math.round(nx - d / 2),
    dy: Math.round(ny - w / 2),
  };
}

// A quarter turn of something held on its own on a surface, about the middle of
// the cell under the pointer.
function turnTop(h: Held): Held {
  const rot = ((h.def.rot ?? 0) + 1) % 4;
  const [w, d] = topSize(h.def);
  const ux = (h.qx ?? 0) + w / 2 - 0.5;
  const uy = (h.qy ?? 0) + d / 2 - 0.5;
  const [w2, d2] = topSize({ ...h.def, rot });
  return { ...h, def: { ...h.def, rot }, qx: Math.round(0.5 - uy - w2 / 2), qy: Math.round(0.5 + ux - d2 / 2) };
}

function rectOf(a: Point, b: Point) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
}
