import {
  ANIM,
  type ClientMessages,
  dirFromDelta,
  entry,
  footprint,
  type Grid,
  hangSpot,
  isSocial,
  type Point,
  placedFootprint,
  reachOf,
  SOCIAL_MS,
  SOCIAL_REACH,
  type WorldObjectDef,
} from "@yutopia/shared";
import { YONDRA_APP } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { type ActTarget, hud, toast } from "./store";

// The action queue, Sims-style: what you picked in the action menu, played out
// in order — walk up to it, do it, the next one. Moving yourself (keys, a
// click on the floor) drops the lot; each one can be cancelled from its chip.

export type Target = ActTarget;

export interface Queued {
  key: number;
  act: string;
  target: Target;
  title: string; // what it's done with (a thing's name, someone's name)
}

// What the queue needs from the world controller.
export interface ActionHost {
  me(): { x: number; y: number; d: number; a: number };
  setFacing(d: number): void;
  grid(): Grid;
  object(id: string): WorldObjectDef | undefined;
  person(sid: string): { x: number; y: number; uid: number; name: string } | undefined;
  walk(to: Point): boolean; // false: no way there
  walking(): boolean;
  stopWalking(): void;
  send<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]): void;
  activate(id: string): void; // what X does next to it
  machineBusy(): boolean; // a machine's still doing its thing
  busyFor(what: string, ms: number): void; // shown using something for a while
  playNote(id: string, n: number): void;
  openPanel(kind: string, objectId?: string): void;
  putDown(): void;
  myTask(): { id: number; boardId: number } | null;
}

const REACH = 1.6; // close enough to use a thing (tiles from its footprint)
const MAX = 6;

// A little tune for "play a tune" (semitones from middle C, beats)
const TUNE: [number, number][] = [
  [0, 1],
  [4, 1],
  [7, 1],
  [12, 2],
  [11, 1],
  [7, 1],
  [9, 1],
  [5, 2],
  [4, 1],
  [2, 1],
  [0, 3],
];
const BEAT = 260;

interface Running {
  q: Queued;
  phase: "walk" | "do";
  // done yet? (checked every frame once it's started)
  done?: () => boolean;
  startedAt: number;
  tries: number;
  spot?: Point; // where to stand to use it (in front of it)
}

export class ActionQueue {
  private items: Queued[] = [];
  private cur: Running | null = null;
  private nextKey = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private host: ActionHost) {}

  add(act: string, target: Target, title: string) {
    if (this.items.length >= MAX) return toast(tr("actQueueFull"), "warn");
    this.items.push({ key: this.nextKey++, act, target, title });
    this.publish();
  }

  // cancel one (the running one stops where it is)
  cancel(key: number) {
    if (this.cur?.q.key === key) this.stopCurrent();
    this.items = this.items.filter((q) => q.key !== key);
    this.publish();
  }

  clear() {
    if (!this.items.length && !this.cur) return;
    this.stopCurrent();
    this.items = [];
    this.publish();
  }

  get running(): boolean {
    return !!this.cur;
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
  }

  private stopCurrent() {
    if (this.cur?.phase === "walk") this.host.stopWalking();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.cur = null;
  }

  private publish() {
    hud.set({
      queue: this.items.map((q) => ({
        key: q.key,
        act: q.act,
        title: q.title,
        target: q.target,
        running: this.cur?.q.key === q.key,
      })),
    });
  }

  private finish() {
    const key = this.cur?.q.key;
    this.cur = null;
    this.items = this.items.filter((q) => q.key !== key);
    this.publish();
  }

  // every frame
  tick(now: number) {
    if (!this.cur) {
      const next = this.items[0];
      if (!next) return;
      this.cur = { q: next, phase: "walk", startedAt: now, tries: 0 };
      this.publish();
      if (!this.approach(this.cur)) {
        toast(tr("actCantReach"), "warn");
        return this.finish();
      }
    }
    const c = this.cur;
    if (c.phase === "walk") {
      if (this.host.walking()) return;
      if (!this.inReach(c.q)) {
        // the way changed (someone moved): try again, a couple of times
        if (++c.tries > 2 || !this.approach(c)) {
          toast(tr("actCantReach"), "warn");
          return this.finish();
        }
        return;
      }
      c.phase = "do";
      c.startedAt = now;
      c.done = this.perform(c.q) ?? undefined;
      if (!c.done) return this.finish();
      return;
    }
    // give up on anything that never ends (a minute is plenty)
    if (c.done?.() || now - c.startedAt > 60_000) this.finish();
  }

  // ── where to stand ──────────────────────────────────────────────────────
  private approach(c: Running): boolean {
    const t = c.q.target;
    const h = this.host;
    const me = h.me();
    if (t.type === "self") return true;
    if (t.type === "person") {
      const p = h.person(t.sid);
      if (!p) return false;
      if (this.inReach(c.q)) return true;
      // next to them: the open tile beside them nearest to me
      const reach = isSocial(c.q.act) ? SOCIAL_REACH[c.q.act] : 1.6;
      if (reach > 3) {
        // a wave: just come within sight
        const k = (Math.hypot(p.x - me.x, p.y - me.y) - reach + 1) / Math.hypot(p.x - me.x, p.y - me.y);
        return h.walk({ x: me.x + (p.x - me.x) * k, y: me.y + (p.y - me.y) * k });
      }
      const spot = besideOf(h.grid(), p, me);
      return !!spot && h.walk(spot);
    }
    const o = h.object(t.id);
    if (!o) return false;
    if (c.q.act === "sit" || c.q.act === "work" || c.q.act === "focus") {
      if (this.inReach(c.q)) return true;
      const seat = seatFor(h.grid(), o, me);
      return !!seat && h.walk(seat);
    }
    // in front of it, like you'd stand to use it
    c.spot ??= frontOf(h.grid(), o) ?? undefined;
    if (!c.spot) return false;
    return this.inReach(c.q, c.spot) || h.walk(c.spot);
  }

  private inReach(q: Queued, spot = this.cur?.spot): boolean {
    const h = this.host;
    const me = h.me();
    if (q.target.type === "self") return true;
    if (q.target.type === "person") {
      const p = h.person(q.target.sid);
      if (!p) return false;
      const reach = isSocial(q.act) ? SOCIAL_REACH[q.act] : 1.6;
      return Math.hypot(p.x - me.x, p.y - me.y) <= reach - 0.1;
    }
    const o = h.object(q.target.id);
    if (!o) return false;
    if (q.act === "sit" || q.act === "work" || q.act === "focus") {
      const seat = h.grid().seatAt(me.x, me.y);
      return !!seat && (q.act === "sit" ? within(o, me, 0.2) : within(o, me, 1.5));
    }
    // at its front (or, with nowhere in front to stand, near enough)
    if (spot) return Math.hypot(spot.x - me.x, spot.y - me.y) < 0.45;
    return within(o, me, REACH);
  }

  // ── doing it: returns when it's done, or null when it's done already ─────
  private perform(q: Queued): (() => boolean) | null {
    const h = this.host;
    const me = h.me();
    const later = (ms: number) => {
      const until = performance.now() + ms;
      return () => performance.now() > until;
    };
    if (q.target.type === "person") {
      const p = h.person(q.target.sid);
      if (!p) return null;
      h.setFacing(dirFromDelta(p.x - me.x, p.y - me.y, me.d as 0));
      if (isSocial(q.act)) {
        h.send("social", { to: q.target.sid, act: q.act });
        return later(SOCIAL_MS[q.act]);
      }
      if (q.act === "follow") hud.set({ following: p.uid });
      if (q.act === "profile") hud.set({ inspect: p.uid });
      return null;
    }
    if (q.target.type === "self") {
      if (q.act === "look") h.openPanel("avatar");
      if (q.act === "putDown") h.putDown();
      if (q.act === "unfocus") h.send("focus", { on: false });
      return null;
    }
    const o = h.object(q.target.id);
    if (!o) return null;
    const id = o.id;
    // face it
    if (q.act !== "sit" && q.act !== "work" && q.act !== "focus") {
      const { w, h: d } = placedFootprint(o);
      // (wall things: the spot on the wall they hang on)
      const at = entry(o.kind).wall ? hangSpot(o, 0) : { x: o.x + w / 2, y: o.y + d / 2 };
      const dx = at.x - me.x;
      const dy = at.y - me.y;
      if (Math.hypot(dx, dy) > 0.2) h.setFacing(dirFromDelta(dx, dy, me.d as 0));
    }
    switch (q.act) {
      case "sit":
        return null; // sitting happens by standing on the seat
      case "work":
        return null;
      case "focus":
        // once I've sat down (the room only lets you focus while seated)
        return () => {
          if (h.me().a !== ANIM.sit) return false;
          h.send("focus", { on: true });
          return true;
        };
      case "unfocus":
        h.send("focus", { on: false });
        return null;
      case "openCard": {
        const task = h.myTask();
        if (task) window.open(`${YONDRA_APP}/boards/${task.boardId}?card=${task.id}`, "_blank", "noopener");
        return null;
      }
      case "brew":
      case "pour":
      case "buy":
        h.activate(id);
        // the machine's moment, then the drink lands in the hand
        return () => !h.machineBusy();
      case "lightOn":
      case "lightOff":
        h.send("lamp:set", { id, on: q.act === "lightOn" });
        return null;
      case "roomLightsOn":
      case "roomLightsOff":
        h.send("lights:room", { id, on: q.act === "roomLightsOn" });
        return null;
      case "musicOn":
      case "musicOff":
        h.send("radio:set", { id, playing: q.act === "musicOn" });
        return null;
      case "doorOpen":
      case "doorClose":
      case "doorLock":
      case "doorUnlock": {
        const state = q.act === "doorClose" ? "closed" : q.act === "doorLock" ? "locked" : "open";
        h.send("door:set", { id, state: q.act === "doorUnlock" ? "closed" : state });
        return null;
      }
      case "tune": {
        // a little tune on the piano, heard by everyone
        let at = 0;
        for (const [n, beats] of TUNE) {
          this.timers.push(setTimeout(() => h.playNote(id, n), at));
          at += beats * BEAT;
        }
        h.busyFor("piano", at + 300);
        return later(at + 400);
      }
      default: {
        // play / open: the thing's panel, done when it's closed again
        h.activate(id);
        let opened = false;
        const since = performance.now();
        return () => {
          const open = !!hud.get().panel.kind;
          opened ||= open;
          return (opened && !open) || (!opened && performance.now() - since > 1500);
        };
      }
    }
  }
}

// Within `r` tiles of a thing's footprint.
function within(o: WorldObjectDef, p: Point, r: number) {
  return reachOf(o, p) <= r;
}

// Where to stand to use a thing: just in front of it (things face +y at rot
// 0, then +x, −y, −x; wall things are used from the floor in front of them).
const FRONT: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
function frontOf(grid: Grid, o: WorldObjectDef): Point | null {
  const { w, h } = placedFootprint(o);
  if (entry(o.kind).wall) {
    const at = hangSpot(o, 0.5);
    return grid.nearestOpen(at.x, at.y, 3);
  }
  const [fx, fy] = FRONT[(o.rot ?? 0) % 4];
  const x = o.x + w / 2 + fx * (w / 2 + 0.5);
  const y = o.y + h / 2 + fy * (h / 2 + 0.5);
  // a wide thing (a piano, a counter): its middle, else along its front
  return grid.fits(x, y) ? { x, y } : grid.nearestOpen(x, y, 2);
}

// The seat to sit on: the thing's own (a chair, the nearest place on a bench),
// or for a desk the chair at it nearest to me.
function seatFor(grid: Grid, o: WorldObjectDef, me: Point): Point | null {
  const { w, h } = footprint(o.kind, o.rot ?? 0);
  const pad = entry(o.kind).seat ? 0 : 1;
  let best: Point | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let y = o.y - pad; y < o.y + h + pad; y++)
    for (let x = o.x - pad; x < o.x + w + pad; x++) {
      if (!grid.seatAt(x + 0.5, y + 0.5)) continue;
      const d = Math.hypot(x + 0.5 - me.x, y + 0.5 - me.y);
      if (d < bestD) {
        bestD = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  return best;
}

// An open tile right beside someone, the one nearest to me.
function besideOf(grid: Grid, p: Point, me: Point): Point | null {
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  let best: Point | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const x = tx + dx + 0.5;
    const y = ty + dy + 0.5;
    if (!grid.fits(x, y)) continue;
    const d = Math.hypot(x - me.x, y - me.y);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}
