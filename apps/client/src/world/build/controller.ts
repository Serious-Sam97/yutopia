import {
  areaAt,
  type ClientMessages,
  canPlace,
  carried,
  doorEdge,
  type Edge,
  edgeAt,
  edgeBlocker,
  entry,
  footprint,
  hostOf,
  isWallEdge,
  nearestEdge,
  type Point,
  Q,
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
} from "@yutopia/shared";
import type { SetupItem } from "@/lib/api";
import { tr, trMaybe } from "@/lib/i18n";
import { C } from "../art/palette";
import type { WorldController } from "../controller";
import type { Outline, Pick } from "../engine";
import { hud, toast } from "../store";
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
  private overBin = false; // the pointer is over the catalog's bin
  private lastWheel = 0;
  hoverPick: Pick | null = null;

  constructor(private w: WorldController) {
    window.addEventListener("keydown", this.onMods);
    window.addEventListener("keyup", this.onMods);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onMods);
    window.removeEventListener("keyup", this.onMods);
    window.removeEventListener("blur", this.onBlur);
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    this.cancel();
  }

  private onMods = (e: KeyboardEvent) => {
    this.shift = e.shiftKey;
  };
  private onBlur = () => {
    this.shift = false;
  };

  private get engine() {
    return this.w.engine;
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
    return this.engine?.allObjects() ?? [];
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
  // An object's stored props (the engine's copy carries drawing-only flags like
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
      const ok = canPlace(this.map, [...rest, ...sofar], def, bodies);
      sofar.push(def);
      out.push({ def, ok });
    }
    return out;
  }

  // Only things that stand on surfaces in hand: they move cell by cell.
  private fine(): boolean {
    return this.hand.length > 0 && this.hand.every((h) => onTop(h.def) && !h.ride);
  }

  // The point under the pointer on the top it's over (the highest surface
  // there), else on the floor (world tiles).
  private surfacePoint(): Point {
    const e = this.engine;
    if (!e) return { x: this.anchor.x + 0.5, y: this.anchor.y + 0.5 };
    const r = e.app.canvas.getBoundingClientRect();
    const away = new Set(this.hand.flatMap((h) => (h.origin ? [h.origin.id] : [])));
    const rest = this.objects().filter((o) => !away.has(o.id));
    const heights = [
      ...new Set(rest.map((o) => entry(o.kind).surface).filter((z): z is number => z !== undefined)),
    ].sort((a, b) => b - a);
    for (const z of heights) {
      const w = e.screenToWorld(r.left + e.pointerAt.gx, r.top + e.pointerAt.gy + z * e.zoom);
      const host = surfaceAt(rest, Math.floor(w.x), Math.floor(w.y));
      if (host && entry(host.kind).surface === z) return w;
    }
    return e.screenToWorld(r.left + e.pointerAt.gx, r.top + e.pointerAt.gy);
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
    const e = this.engine;
    if (!e) return;
    const placed = this.placed();
    // walls between the camera and what you carry lower out of the way
    const first = placed[0]?.def;
    if (first) e.focusAt = { x: first.x + 0.5, y: first.y + 0.5 };
    e.setGhosts(placed, this.hand.length ? LIFT : 0);
    const fits = placed.every((p) => p.ok);
    if (hud.get().build.fits !== fits) this.setBuild({ fits });
    this.syncHidden();
    this.drawOutlines();
  }

  private syncHidden() {
    const ids = new Set<string>(this.pending.keys());
    for (const h of this.hand) if (h.origin) ids.add(h.origin.id);
    this.engine?.setHidden(ids);
  }

  private setHand(hand: Held[]) {
    this.hand = hand;
    // nothing in hand, no bin: the catalog's bin goes away while it may still be
    // under the pointer (so it never hears it leave)
    if (!hand.length) this.overBin = false;
    this.setBuild({
      held: hand.flatMap((h) => (h.origin ? [h.origin.id] : [])),
      carrying: hand.length,
    });
    this.drawHand();
  }

  // A new thing from the catalog (or a copy) on the pointer.
  private fresh(kind: string, props: Record<string, unknown> | null, rot: number): WorldObjectDef {
    return {
      id: `ghost-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      x: this.anchor.x,
      y: this.anchor.y,
      rot,
      props: props ?? (kind === "chair" ? { desk: true } : undefined),
    };
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
      const ok = await this.waitFor(() => !!this.engine?.getObject(id));
      if (!ok) return;
    }
    const obj = this.engine?.getObject(id);
    if (!obj || !entry(obj.kind).buildable) return;
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
      const copy = ids ? { ...o, id: ids.get(o.id) ?? ghostId(), props: this.copyable(o.props) } : { ...o };
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
    const e = this.engine;
    if (!e) return this.anchor;
    const r = e.app.canvas.getBoundingClientRect();
    const w = e.screenToWorld(r.left + e.pointerAt.gx, r.top + e.pointerAt.gy);
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
        // moved: as stored (never drawing-only flags), in its new cell if on a top
        props: h.origin
          ? { ...(this.storedProps(h.origin.id) ?? {}), ...(onTop(def) ? { c: def.props?.c } : {}) }
          : def.props,
      };
    });
    if (items.length === 1) {
      const it = items[0];
      const h = this.hand[0];
      this.send("obj:put", { ...it, refId: h.origin?.refId ?? null });
    } else this.send("obj:batch", { items });
    // the originals stay hidden until their move arrives (no flash back)
    const until = performance.now() + 2500;
    for (const { def } of placed) {
      const h = byId.get(def.id) as Held;
      if (h.origin) this.pending.set(h.origin.id, { key: spotKey(def), until });
      this.engine?.puff(...this.middle(def), "drop");
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
      const o = this.engine?.getObject(id);
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
  setOverBin(on: boolean) {
    this.overBin = on;
  }
  private pointerOnBin(): boolean {
    const e = this.engine;
    if (!e) return false;
    const r = e.app.canvas.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + e.pointerAt.gx, r.top + e.pointerAt.gy);
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
        if (one)
          return entry(h.def.kind).wall || h.def.kind === "door"
            ? h
            : { ...h, def: { ...h.def, rot: ((h.def.rot ?? 0) + 1) % 4 } };
        return turnAbout(h, pivot);
      });
      const b = hud.get().build;
      if (b.mode === "place" && this.hand.length === 1 && !this.hand[0].origin)
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
      const turned = group.map((o) => turn({ def: o, origin: o, dx: o.x - pivot.x, dy: o.y - pivot.y }));
      const nx = Math.min(...turned.map((t) => t.dx));
      const ny = Math.min(...turned.map((t) => t.dy));
      defs.push(...turned.map((t) => ({ ...t.def, x: pivot.x + t.dx - nx, y: pivot.y + t.dy - ny })));
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
      ...(onTop(d) ? { c: d.props?.c } : {}),
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
    for (const o of list) this.engine?.puff(...this.middle(o), "poof");
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
      const o = this.engine?.getObject(pick.id);
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
    const o = this.engine?.getObject(p.id);
    if (!o) return "";
    if (o.kind === "decor" || o.kind === "tabletop")
      return trMaybe(`decor_${String(o.props?.d)}`) ?? entry(o.kind).label;
    return entry(o.kind).label;
  }

  // ── outlines and the hover tag ───────────────────────────────────────────
  private drawOutlines() {
    const e = this.engine;
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
    const o = p && !p.dress ? this.engine?.getObject(p.id) : null;
    if (this.engine && !this.hand.length) this.engine.focusAt = o ? { x: o.x + 0.5, y: o.y + 0.5 } : null;
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
      const canvas = this.engine?.app.canvas;
      if (b.on && canvas) canvas.style.cursor = p ? (b.mode === "eyedrop" ? "copy" : "grab") : "default";
    }
    this.drawOutlines();
  }

  // Where the hover tag / item toolbar goes (client px): above the thing.
  anchorOf(id: string): { x: number; y: number } | null {
    const o = this.engine?.getObject(id);
    if (!o || !this.engine) return null;
    if (onTop(o)) {
      const c = topCentre(o);
      return this.engine.worldToClient(c.x, c.y, (Number(o.props?.z) || 0) + 30);
    }
    const { w, h } = footprint(o.kind, entry(o.kind).wall ? 0 : (o.rot ?? 0));
    return this.engine.worldToClient(o.x + w / 2, o.y + h / 2, entry(o.kind).wall ? 70 : 52);
  }

  // A thing's middle on the floor plan (world tiles).
  private middle(o: WorldObjectDef): [number, number] {
    if (onTop(o)) {
      const c = topCentre(o);
      return [c.x, c.y];
    }
    const { w, h } = footprint(o.kind, entry(o.kind).wall ? 0 : (o.rot ?? 0));
    return [o.x + w / 2, o.y + h / 2];
  }

  // ── pointer ──────────────────────────────────────────────────────────────
  hover(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on || !this.engine) return;
    if (b.pickSpawn) {
      // picking the arrival point: the tile under the pointer, and whether it can be
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      return this.engine.showSpawn(true, { x: tx, y: ty, ok: this.w.grid.ok(tx, ty) });
    }
    if (b.tool !== "furniture") return this.hoverOther(x, y);
    const e = this.engine;
    const pr = this.press;
    if (pr && !pr.carry && pr.pick && !pr.dragging && b.mode === "hand") {
      if (Math.hypot(e.pointerAt.gx - pr.sx, e.pointerAt.gy - pr.sy) > DRAG_PX) {
        pr.dragging = true;
        void this.pickUp(pr.pick);
      }
      return;
    }
    if (pr?.carry) {
      // a sideways drag while pressing turns what you hold (and doesn't move it)
      const steps = Math.floor(Math.abs(e.pointerAt.gx - pr.sx) / TURN_PX);
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
    const all = this.engine?.picksAt() ?? [];
    const key = (l: Pick[]) => l.map((p) => p.id).join(",");
    if (key(all) !== key(this.under)) this.cycle = 0;
    this.under = all;
    return all.length ? all[this.cycle % all.length] : null;
  }

  down(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on || !this.engine) return;
    if (b.tool !== "furniture") return this.downOther(x, y);
    const e = this.engine;
    if (this.hand.length) {
      this.press = { sx: e.pointerAt.gx, sy: e.pointerAt.gy, pick: null, carry: true, dragging: false, turned: 0 };
      return;
    }
    const pick = this.pickNow();
    if (pick || b.mode === "eyedrop") {
      this.press = { sx: e.pointerAt.gx, sy: e.pointerAt.gy, pick, carry: false, dragging: false, turned: 0 };
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
    // released over the catalog's bin (checked where the pointer is now, not
    // only by the flag): what you hold goes
    if (this.overBin && this.hand.some((h) => h.origin) && this.pointerOnBin()) {
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
      this.engine?.setRectGhost(null);
      const inBox = this.objects().filter((o) => {
        if (!entry(o.kind).buildable || o.kind === "door") return false;
        const { w, h } = footprint(o.kind, entry(o.kind).wall ? 0 : (o.rot ?? 0));
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
      this.engine?.showSpawn(true);
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
      // (things on a surface: a quarter tile at a time)
      const d = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }[key] ?? [0, 0];
      if (this.fine()) this.cell = { x: this.cell.x + d[0], y: this.cell.y + d[1] };
      else this.anchor = { x: this.anchor.x + d[0], y: this.anchor.y + d[1] };
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
    const engine = this.engine;
    if (!engine) return;
    const bt = hud.get().build;
    engine.passAvatars = bt.on;
    engine.showSpawn(bt.on && (bt.tool === "map" || bt.pickSpawn));
    engine.setBuildGrid(bt.on && (bt.tool === "furniture" || bt.tool === "walls" || bt.tool === "rooms"));
    if (!bt.on) {
      this.cancel();
      engine.focusAt = null;
      engine.setGhosts([], 0);
      engine.setOutlines([]);
      engine.setHidden([]);
      this.setBuild({ selected: [], hover: null });
      return;
    }
    if (bt.tool === "furniture") {
      engine.setEdgeGhost(null, false);
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
    engine.setOutlines([]);
    this.refreshOther();
  }

  // ── walls, rooms, desks, map (moved here unchanged from the world controller) ──
  private hoverTile = { x: -1, y: -1 };

  private hoverOther(x: number, y: number) {
    const bb = hud.get().build;
    const br = this.brushNow();
    if (!this.engine) return;
    if (bb.tool === "walls" && this.boxing()) {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
      this.hoverTile = { x: tx, y: ty };
      if (this.dragFrom) this.engine.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
      return;
    }
    if (bb.tool === "walls" && (br.startsWith("w:") || br.startsWith("door"))) {
      const e = this.edgeAtPointer(x, y);
      if (this.hoverEdge && e.x === this.hoverEdge.x && e.y === this.hoverEdge.y && e.dir === this.hoverEdge.dir)
        return;
      this.hoverEdge = e;
      if (this.painting) this.paintEdge(e);
      this.refreshOther();
      return;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
    this.hoverTile = { x: tx, y: ty };
    const b = hud.get().build;
    if (b.tool === "walls" && this.painting) this.paintAt(tx, ty);
    if (b.tool === "rooms" && this.dragFrom) this.engine.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
    this.refreshOther();
  }

  // ── walls / rooms tools ──
  private painting = false;
  private paintQueue = new Map<string, { x: number; y: number; ch: string }>();
  private paintTimer: ReturnType<typeof setTimeout> | null = null;
  private dragFrom: { x: number; y: number } | null = null;

  private hoverEdge: Edge | null = null;
  private dragDir: "h" | "v" | null = null; // a wall drag stays on one line direction

  // The edge under the pointer; while dragging a wall, along the drag's direction
  // only (so passing over a corner never paints a stray wall across the line).
  private edgeAtPointer(x: number, y: number): Edge {
    if (this.painting && this.dragDir === "v") return { x: Math.round(x), y: Math.floor(y), dir: "v" };
    if (this.painting && this.dragDir === "h") return { x: Math.floor(x), y: Math.round(y), dir: "h" };
    return nearestEdge(x, y);
  }
  private edgeQueue = new Map<string, Edge & { ch: string }>();

  // What a wall brush puts on an edge: a material, a window in the wall that's
  // there (plaster if none), or no wall.
  private edgeChar(e: Edge): string {
    const brush = this.brushNow();
    if (brush !== "w:window") return brush.slice(2);
    const cur = edgeAt(this.map, e);
    return isWallEdge(cur) && /^[pwfbk]$/.test(cur) ? cur.toUpperCase() : "P";
  }

  private paintEdge(e: Edge) {
    this.edgeQueue.set(`${e.dir}${e.x},${e.y}`, { ...e, ch: this.edgeChar(e) });
    if (!this.paintTimer) this.paintTimer = setTimeout(() => this.flushPaint(), 80);
  }

  private paintAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("door") || br.startsWith("w:")) return;
    this.paintQueue.set(`${tx},${ty}`, { x: tx, y: ty, ch: br });
    if (!this.paintTimer) this.paintTimer = setTimeout(() => this.flushPaint(), 80);
  }

  private flushPaint() {
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = null;
    if (this.edgeQueue.size) {
      this.send("map:walls", { edges: [...this.edgeQueue.values()] });
      this.edgeQueue.clear();
    }
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
    const br = this.brushNow();
    if (b.tool === "walls" && this.boxing()) {
      this.dragFrom = { x: tx, y: ty };
      this.engine?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
    } else if (b.tool === "walls" && b.paintMode === "fill") {
      // a click (buildClick) fills
    } else if (b.tool === "walls" && br.startsWith("w:")) {
      const e = nearestEdge(x, y);
      this.painting = true;
      this.dragDir = e.dir;
      this.paintEdge(e);
    } else if (b.tool === "walls" && !br.startsWith("door")) {
      this.painting = true;
      this.paintAt(tx, ty);
    } else if (b.tool === "rooms") {
      this.dragFrom = { x: tx, y: ty };
      this.engine?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
    }
  }

  private upOther(x: number, y: number) {
    const b = hud.get().build;
    if (this.painting) {
      this.painting = false;
      this.dragDir = null;
      this.flushPaint();
    }
    if (b.tool === "walls" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      this.engine?.setRectGhost(null);
      this.paintBox(r);
    }
    if (b.tool === "rooms" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      if (r.w >= 2 && r.h >= 2) hud.set({ build: { ...hud.get().build, roomDraft: r } });
      else this.engine?.setRectGhost(null);
    }
  }

  private refreshOther() {
    const engine = this.engine;
    if (!engine) return;
    const bt = hud.get().build;
    if (bt.tool === "walls") {
      const e = this.hoverEdge;
      const br = this.brushNow();
      if (this.boxing() || (bt.paintMode === "fill" && !br.startsWith("door"))) {
        engine.setEdgeGhost(null, false);
        return engine.setGhost(null, false);
      }
      if (br.startsWith("door") && e) {
        engine.setEdgeGhost(null, false);
        const d = {
          id: "ghost-door",
          kind: "door",
          x: e.x,
          y: e.y,
          rot: e.dir === "h" ? 0 : 1,
          props: { state: "closed", glass: br === "door:glass" },
        };
        return engine.setGhost(d, canPlace(this.map, engine.allObjects(), d));
      }
      engine.setGhost(null, false);
      if (br.startsWith("w:") && e)
        return engine.setEdgeGhost(e, edgeBlocker(this.map, engine.allObjects(), e, this.edgeChar(e)) === null);
      return engine.setEdgeGhost(null, false);
    }
    engine.setEdgeGhost(null, false);
    engine.setGhost(null, false);
  }

  clearRoomGhost() {
    this.engine?.setRectGhost(null);
  }

  private clickOther(x: number, y: number) {
    const b = hud.get().build;
    if (b.tool === "walls") {
      if (b.paintMode === "fill" && !b.brush.startsWith("door")) return this.fillAt(Math.floor(x), Math.floor(y));
      if (b.brush.startsWith("door")) {
        // a door on the edge you clicked next to (click a door to remove it)
        const e = nearestEdge(x, y);
        const hit = this.engine?.allObjects().find((o) => {
          if (o.kind !== "door") return false;
          const d = doorEdge(o);
          return d.dir === e.dir && d.x === e.x && d.y === e.y;
        });
        if (hit) this.send("obj:remove", { id: hit.id });
        else
          this.send("obj:put", {
            kind: "door",
            x: e.x,
            y: e.y,
            rot: e.dir === "h" ? 0 : 1,
            ...(b.brush === "door:glass" ? { props: { glass: true } } : {}),
          });
      }
      return;
    }
    if (b.tool === "desks") {
      const hit = this.engine?.objectAtTile(Math.floor(x), Math.floor(y));
      if (hit && entry(hit.kind).seat) this.setBuild({ deskDraft: hit.id });
    }
  }

  // Desks tool: drag a person from the panel onto a seat.
  seatAt(clientX: number, clientY: number): WorldObjectDef | null {
    const w = this.engine?.screenToWorld(clientX, clientY);
    if (!w) return null;
    const o = this.engine?.objectAtTile(Math.floor(w.x), Math.floor(w.y));
    return o && entry(o.kind).seat ? o : null;
  }
  showSeatDrop(at: { x: number; y: number } | null) {
    if (!at) return this.engine?.setRectGhost(null);
    const w = this.engine?.screenToWorld(at.x, at.y);
    if (!w) return;
    const seat = this.seatAt(at.x, at.y);
    const t = seat ?? { x: Math.floor(w.x), y: Math.floor(w.y) };
    this.engine?.setRectGhost({ x: t.x, y: t.y, w: 1, h: 1, ok: !!seat });
  }
  // The brush a paint stroke uses: Erase takes walls or floors away, whichever
  // the picked brush paints.
  private brushNow(): string {
    const b = hud.get().build;
    if (b.paintMode !== "erase") return b.brush;
    return b.brush.startsWith("w:") || b.brush.startsWith("door") ? "w:." : VOID;
  }
  private boxing(): boolean {
    const b = hud.get().build;
    return b.paintMode === "box" && !b.brush.startsWith("door");
  }

  // Box: floors fill the rectangle, walls run around it.
  private paintBox(r: { x: number; y: number; w: number; h: number }) {
    const br = this.brushNow();
    if (br.startsWith("w:")) {
      const edges: Edge[] = [];
      for (let x = r.x; x < r.x + r.w; x++) edges.push({ x, y: r.y, dir: "h" }, { x, y: r.y + r.h, dir: "h" });
      for (let y = r.y; y < r.y + r.h; y++) edges.push({ x: r.x, y, dir: "v" }, { x: r.x + r.w, y, dir: "v" });
      // windows check the walls painted before them: walls first
      const all = edges.map((e) => ({ ...e, ch: this.edgeChar(e) }));
      for (let i = 0; i < all.length; i += 600) this.send("map:walls", { edges: all.slice(i, i + 600) });
      return;
    }
    const cells: { x: number; y: number; ch: string }[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y, ch: br });
    for (let i = 0; i < cells.length; i += 600) this.send("map:paint", { cells: cells.slice(i, i + 600) });
  }

  // Fill room: floors flood the same floor up to walls and doors; walls repaint
  // the room you click in.
  private fillAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("w:")) {
      const area = areaAt(this.map, tx + 0.5, ty + 0.5);
      const mat = br.slice(2);
      if (!area) return toast(tr("buildFillOutside"), "warn");
      if (!/^[pwfbkg]$/.test(mat)) return toast(tr("buildFillMaterial"), "warn");
      this.send("map:room:walls", { key: area.key, wall: mat });
      return;
    }
    const start = tileAt(this.map, tx, ty);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height || start === br) return;
    const doors = new Set(
      (this.engine?.allObjects() ?? [])
        .filter((o) => o.kind === "door")
        .map((o) => {
          const d = doorEdge(o);
          return `${d.dir}${d.x},${d.y}`;
        }),
    );
    const blocked = (e: Edge) => doors.has(`${e.dir}${e.x},${e.y}`) || isWallEdge(edgeAt(this.map, e));
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

// A quarter turn clockwise of something held, about the pointer's tile.
function turn(h: Held): Held {
  const e = entry(h.def.kind);
  if (e.wall || h.def.kind === "door") return h; // things on walls face the room
  const { h: fh } = footprint(h.def.kind, h.def.rot ?? 0);
  return { ...h, def: { ...h.def, rot: ((h.def.rot ?? 0) + 1) % 4 }, dx: 1 - h.dy - fh, dy: h.dx };
}

// The middle of what's in hand (tile offsets from the pointer's tile).
function handMiddle(hand: Held[]): Point {
  const solid = hand.filter((h) => !h.ride && !entry(h.def.kind).wall && h.def.kind !== "door");
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
  if (e.wall || h.def.kind === "door") return h; // things on walls face the room
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
