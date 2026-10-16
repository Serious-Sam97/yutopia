import { TILE_H, TILE_W, toScreen, type WorldObjectDef } from "@yutopia/shared";
import {
  ballAt,
  flightEvents,
  PONG_L,
  PONG_R,
  PONG_W,
  type PongBall,
  type PongFlight,
  type PongScore,
  type Racket,
  type RacketAt,
  type Rally,
  serveToss,
  solveServe,
  solveShot,
} from "@yutopia/shared/pong";
import { TABLES, tableAway, tableCentre, tableHeading, tablePx, toTable, toWorld } from "@yutopia/shared/tables";
import { Container, Graphics } from "pixi.js";
import { hud } from "../store";
import type { TableScene3 } from "../tp/tables3d";
import type { TableHost } from "./pool";
import { floorBounce, netBuzz, pock, tock } from "./sound";

// The game, from the player's side: the racket goes left and right with the
// mouse; it finds the ball's depth and height on its own. Where the ball will
// be met is marked (and where it will bounce): get there, and the hit happens
// as it arrives — within REACH_LAT of the racket's middle. The shot: where on
// the racket it meets the ball and which way you're moving aim it (the middle
// straight, an edge out wide), the buttons choose it — nothing a drive, left
// held a smash, right held a chop. Off-centre, greedy (a smash off a low ball)
// and against a fast ball, it scatters more (Pro: more still) — the net and
// the edges are real.
export type ShotType = "drive" | "smash" | "chop";
const REACH_LAT = 0.28; // m either side of the racket's middle
const SHOTS: Record<ShotType, { depth: number; speed: number; top: number; err: number }> = {
  drive: { depth: 0.72, speed: 9.5, top: 90, err: 1 },
  smash: { depth: 0.8, speed: 15, top: 25, err: 1.9 },
  chop: { depth: 0.55, speed: 6.4, top: -85, err: 0.7 },
};
const SWING_MS = 240;
type V = [number, number, number];
const SHOT_COLOR: Record<ShotType, number> = { drive: 0xffb35c, smash: 0xff5a36, chop: 0x6fb3ff };
const gauss = () => {
  let u = 0;
  for (let k = 0; k < 6; k++) u += Math.random();
  return (u - 3) / Math.SQRT2;
};
// where a ball coming to `seat` is best met: the top of its bounce on their
// side, not too far over the table, not too deep behind it
export function contactPlan(f: PongFlight, seat: number): { t: number; x: number; y: number; z: number } | null {
  const own = seat === 0 ? -1 : 1;
  if (f.kind === "toss") {
    if (f.by !== seat) return null;
    const t = f.t0 + 330;
    const b = ballAt(f, t).ball;
    return { t, x: b.x, y: b.y, z: b.z };
  }
  if (f.by === seat) return null;
  const ev = flightEvents(f);
  // the bounce I play: a rally ball's first, a serve's first on my side (its
  // first is on the server's); anything else — the net, long, back on their
  // side — isn't mine to play
  const tables = ev.filter((e) => e.k === "table");
  const bounce = f.kind === "serve" ? (tables[0]?.side === f.by ? tables[1] : undefined) : tables[0];
  if (!bounce || bounce.side !== seat) return null;
  const next = ev.find((e) => e.t > bounce.t);
  let best: { t: number; x: number; y: number; z: number } | null = null;
  let score = Number.NEGATIVE_INFINITY;
  for (let t = bounce.t + 25; t < bounce.t + 900 && (!next || t < next.t); t += 4) {
    const b = ballAt(f, t).ball;
    if (b.z < 0.04 && Math.abs(b.x) < HL) break;
    const back = b.x * own; // how far back towards me
    if (back > HL + 0.8) break;
    if (back < HL * 0.35) continue;
    const s = b.z - 0.12 * Math.abs(back - (HL + 0.12));
    if (s > score) {
      score = s;
      best = { t, x: b.x, y: b.y, z: b.z };
    }
  }
  return best;
}

// Ping-pong tables, live: the ball for everyone (one flight at a time, worked
// out from the server's event with the same physics), both rackets — mine
// under my mouse with no lag, the other player's as they stream it, Vortex's
// as he goes for his shot — the players at their ends, the sounds. At my
// table: my racket follows the pointer over my end (its height follows the
// ball), the swing's speed is the shot's power, left button brushes up
// (topspin), right button chops (backspin); I see the ball meet my racket here
// and tell the server. Someone else's hit reaches me late: that flight plays
// a little fast for a moment until it's caught up (no jump).

// biome-ignore lint/suspicious/noExplicitAny: colyseus schema instances
type S = any;
type Pt = { x: number; y: number };

const K = "pingpong_table" as const;
const G = TABLES[K];
const HL = PONG_L / 2;
const HW = PONG_W / 2;
const LPX = 45.25;
const ZPX = LPX * Math.cos(Math.PI / 6);
const HEAR = 12;
const SEND_MS = 33;
const CATCH = 260; // ms: a display behind real time closes the gap over about this long
const HANG = 0.2; // the display's pace while the ball waits at the receiver's racket…
// …for at most about as long as their hit takes to reach us (a round trip and a
// patch), never less than HOLD_MIN or more than HOLD_MAX
const HOLD_MIN = 160;
const HOLD_MAX = 450;
const REACH = 0.7; // m: "at their racket" (it streams a little behind)
const PROGRESS_KEY = "yutopia:pong-assist";

export interface PongInfo {
  id: string;
  phase: string;
  seats: ({ name: string; vortex: string; me: boolean } | null)[];
  mySeat: number;
  score: PongScore | null;
  rally: string;
  point: { no: number; winner: number; why: string; game?: boolean; match?: boolean } | null;
  canServe: boolean;
  serving: number; // who serves now
  speed: number; // km/h of the last hit
  assist: boolean;
  shot: ShotType;
  // the ball coming to me: is my racket where it will be met?
  coming: "" | "reach" | "left" | "right";
  record: { last: { w: string; l: string; how: string }[]; wins: Record<string, number> } | null;
}

interface PView {
  def: WorldObjectDef;
  slices: { root: Container; g: Graphics }[];
  front: Graphics;
  sig: string; // the server's flight (JSON)
  flight: PongFlight | null;
  seq: number;
  arrived: number; // local ms when this flight arrived
  lag: number; // how far behind real time it arrived (ms)
  // what's drawn: a flight and the server time it's shown at — its own clock,
  // so a hit that reaches us late carries on from where the ball is (no jump)
  dispF: PongFlight | null;
  dispT: number;
  hung: number; // (e2e) how long the drawing waited on this flight
  near: number; // (e2e) the closest the drawn ball came to the receiver's racket
  lastPos: { x: number; y: number; z: number } | null;
  local: PongFlight | null; // my hit, before the server takes it
  localAt: number;
  shown: number; // the display time already played (sounds)
  hitSeq: number; // the flight I've hit (once each)
  others: [RacketAt | null, RacketAt | null]; // the rackets as streamed, smoothed
  lastSpeed: number;
}

const zPx = (z: number) => (z >= 0 ? tablePx(K, z) : G.top * (1 + z / 0.76));
// a table-frame vector → three's world (X = tile x, Y = up, Z = tile y), turned with the table
function v3(v: [number, number, number], rot: number): [number, number, number] {
  const X = v[0];
  const Y = v[2];
  const Z = -v[1];
  const a = (-Math.PI / 2) * (rot & 3);
  return [X * Math.cos(a) + Z * Math.sin(a), Y, -X * Math.sin(a) + Z * Math.cos(a)];
}

export class PongTables {
  private views = new Map<string, PView>();
  private lastFrame = new Map<string, number>();
  private lastStep = new Map<string, number>();
  focus: string | null = null;
  assist = true;
  shot: ShotType = "drive";
  // my racket (table metres), and its recent path (server ms)
  private me: Racket = { x: -HL - 0.3, y: 0, z: 0.15, nx: 1, ny: 0, nz: 0.1, vx: 0, vy: 0, vz: 0 };
  private aim: Pt | null = null; // where the pointer puts it (only its y is used)
  private plan: { key: string; t: number; x: number; y: number; z: number; done: boolean } | null = null;
  private swingAt: [number, number] = [0, 0]; // when each end last swung (perf ms)
  private swingType: [ShotType, ShotType] = ["drive", "drive"];
  private sentAt = 0;
  private zoomBack = 0;
  private now = 0;
  private clock: (() => number) | null = null;
  private rtt: (() => number) | null = null;
  private standAt = 0;

  constructor(private host: TableHost) {
    try {
      this.assist = localStorage.getItem(PROGRESS_KEY) !== "pro";
    } catch {}
    // a hit of mine the server didn't take: back to the ball's real path at once
    host.room.onMessage?.("pong:no", (m: { id: string; seq: number; why: string }) => {
      const v = this.views.get(m.id);
      this.stat(`refused_${m.why}`);
      const t = this.table(m.id);
      (window as unknown as { __pongDrops?: unknown[] }).__pongDrops?.push({
        why: m.why,
        point: t?.point,
        local: v?.local ? { t0: v.local.t0, kind: v.local.kind } : null,
        flight: v?.flight
          ? {
              t0: v.flight.t0,
              kind: v.flight.kind,
              by: v.flight.by,
              ev: flightEvents(v.flight).map((e) => `${e.k}${e.side ?? ""}@${e.t - (v.flight?.t0 ?? 0)}`),
            }
          : null,
      });
      if (v?.local && v.local.kind !== "toss") {
        v.local = null;
        this.stat("dropped");
      }
    });
    void import("../media/clock").then((c) => {
      const http = host.worldHttp();
      if (http) void c.syncClock(http);
      this.clock = c.serverNow;
      this.rtt = () => c.clockSample()?.rtt ?? 120;
    });
  }
  private serverNow() {
    return this.clock ? this.clock() : Date.now();
  }

  // ── tables in the room ───────────────────────────────────────────────────
  refresh() {
    const defs = this.host.engine.allObjects().filter((o) => o.kind === K);
    const keep = new Set<string>();
    for (const def of defs) {
      keep.add(def.id);
      const old = this.views.get(def.id);
      if (old && old.def.x === def.x && old.def.y === def.y && (old.def.rot ?? 0) === (def.rot ?? 0)) {
        old.def = def;
        continue;
      }
      if (old) this.drop(def.id);
      const slices: PView["slices"] = [];
      for (let i = 0; i < 4; i++) {
        const root = new Container();
        root.zIndex = def.x + def.y + i + 1 + 0.004;
        const g = new Graphics();
        root.addChild(g);
        this.host.engine.mountLive(root);
        slices.push({ root, g });
      }
      const front = new Graphics();
      front.zIndex = def.x + def.y + 4 + 0.006;
      this.host.engine.mountLive(front);
      this.views.set(def.id, {
        def,
        slices,
        front,
        sig: "",
        flight: null,
        seq: -1,
        arrived: 0,
        lag: 0,
        dispF: null,
        dispT: 0,
        hung: 0,
        near: 9,
        lastPos: null,
        local: null,
        localAt: 0,
        shown: 0,
        hitSeq: -1,
        others: [null, null],
        lastSpeed: 0,
      });
    }
    for (const id of [...this.views.keys()]) if (!keep.has(id)) this.drop(id);
  }
  private drop(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    for (const s of v.slices) s.root.destroy({ children: true });
    v.front.destroy();
    this.views.delete(id);
    if (this.focus === id) this.lean(null);
  }
  private table(id: string): S | undefined {
    return this.host.room.state.pong?.get(id);
  }
  private mySeat(t: S | undefined): number {
    if (!t) return -1;
    for (const [k, s] of t.seats as Map<string, S>)
      if (s.sid === this.host.room.sessionId && !s.vortex) return Number(k);
    return -1;
  }
  private parse<T>(s: string | undefined): T | null {
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  }

  // ── the panel ────────────────────────────────────────────────────────────
  sit(id: string, seat: number) {
    this.host.send("pong:sit", { id, seat });
  }
  leave(id: string) {
    this.host.send("pong:leave", { id });
  }
  vortex(id: string, level: string | null) {
    this.host.send("pong:vortex", { id, level });
  }
  start(id: string, to: number, bestOf: number) {
    this.host.send("pong:start", { id, to, bestOf });
  }
  concede(id: string) {
    this.host.send("pong:concede", { id });
  }
  setAssist(on: boolean) {
    this.assist = on;
    try {
      localStorage.setItem(PROGRESS_KEY, on ? "assisted" : "pro");
    } catch {}
  }
  info(id: string): PongInfo | null {
    const v = this.views.get(id);
    if (!v) return null;
    const t = this.table(id);
    const seats: PongInfo["seats"] = [0, 1].map((k) => {
      const s = t?.seats.get(String(k));
      return s ? { name: s.name, vortex: s.vortex, me: s.sid === this.host.room.sessionId && !s.vortex } : null;
    });
    const score = this.parse<PongScore>(t?.score);
    const rally = this.parse<Rally>(t?.rally);
    const mySeat = this.mySeat(t);
    const props = v.def.props as Record<string, unknown> | undefined;
    return {
      id,
      phase: t?.phase ?? "lobby",
      seats,
      mySeat,
      score,
      rally: rally?.phase ?? "",
      point: this.parse(t?.point),
      canServe: this.canServe(id),
      serving: score?.server ?? 0,
      speed: v.lastSpeed,
      assist: this.assist,
      shot: this.shot,
      coming: this.comingHint(id),
      record: (props?.record as PongInfo["record"]) ?? null,
    };
  }
  private canServe(id: string): boolean {
    const t = this.table(id);
    const v = this.views.get(id);
    if (!t || !v || t.phase !== "play") return false;
    const score = this.parse<PongScore>(t.score);
    return !!score && score.server === this.mySeat(t) && !t.flight && !v.local && this.serverNow() >= Number(t.wait);
  }

  // ── the pointer ──────────────────────────────────────────────────────────
  // Left and right only: the racket goes to where the pointer is across the
  // table. Buttons pick the shot (held as the ball arrives); a click serves.
  pointer(
    type: "move" | "down" | "up",
    cx: number,
    cy: number,
    o: { button?: number; buttons?: number; shift?: boolean } = {},
  ) {
    const id = this.focus;
    const v = id ? this.views.get(id) : undefined;
    const t = id ? this.table(id) : undefined;
    const seat = this.mySeat(t);
    if (!id || !v || seat < 0) return;
    const b = o.buttons ?? 0;
    this.shot = b & 2 || o.shift ? "chop" : b & 1 ? "smash" : "drive";
    if (type === "down" && (o.button ?? 0) === 0 && this.canServe(id)) {
      this.shot = "drive";
      this.toss(id, v, seat);
    }
    const ray = this.host.engine.rayAt(cx, cy);
    if (ray.d.z >= -1e-6) return;
    const zp = zPx(0.15);
    const k = (zp - ray.o.z) / ray.d.z;
    const p = toTable(v.def, ray.o.x + ray.d.x * k, ray.o.y + ray.d.y * k);
    this.aim = { x: 0, y: Math.max(-HW - 0.45, Math.min(HW + 0.45, p.y)) };
  }
  // the keys do the same (A / D or ←/→ move; Space serves)
  key(k: "left" | "right" | "serve", down: boolean) {
    const id = this.focus;
    const v = id ? this.views.get(id) : undefined;
    const seat = this.mySeat(id ? this.table(id) : undefined);
    if (!id || !v || seat < 0) return;
    if (k === "serve") {
      if (down && this.canServe(id)) this.toss(id, v, seat);
      return;
    }
    this.keyDir[k === "left" ? 0 : 1] = down;
  }
  private keyDir: [boolean, boolean] = [false, false];
  // for the console: the ball's coming and where my racket is against it
  private comingHint(id: string): PongInfo["coming"] {
    const p = this.plan;
    if (!p || p.done || this.focus !== id) return "";
    const off = p.y - this.me.y;
    if (Math.abs(off) <= REACH_LAT) return "reach";
    // which way to move, as the player sees it (their screen's left / right)
    const seat = this.mySeat(this.table(id));
    const leftIsPlusY = seat === 0; // facing +x, +y is on the left
    return off > 0 === leftIsPlusY ? "left" : "right";
  }

  // ── every frame ──────────────────────────────────────────────────────────
  frame(dt: number, me: Pt) {
    this.now = performance.now();
    const pk = hud.get().panel;
    const want = pk.kind === "pong" && pk.objectId && this.views.has(pk.objectId) ? pk.objectId : null;
    if (want !== this.focus) this.lean(want);
    // (coming back to iso from 3D: lean in again)
    const td = this.host.threeD();
    if (td !== this.wasThreeD) {
      this.wasThreeD = td;
      this.leanSig = "";
    }
    if (this.focus && !td) this.relean();
    if (this.focus) this.moveRacket(this.focus, Math.min(0.05, dt));
    for (const [id, v] of this.views) this.update(id, v, me);
  }

  private lean(focus: string | null) {
    const engine = this.host.engine;
    const was = this.focus;
    this.focus = focus;
    this.aim = null;
    if (was && !focus) {
      const t = this.table(was);
      if (t && this.mySeat(t) >= 0 && t.phase !== "play") this.leave(was);
    }
    if (focus) {
      if (!was) this.zoomBack = engine.getZoom();
      this.leanSig = "";
      this.relean();
    } else {
      engine.pinCamera(null);
      engine.seeThrough = null;
      if (this.zoomBack) engine.setZoom(this.zoomBack);
    }
  }
  private leanSig = "";
  private wasThreeD = false;
  private relean() {
    const v = this.focus ? this.views.get(this.focus) : undefined;
    if (!v) return;
    const sig = `${v.def.id}|${window.innerWidth}x${window.innerHeight}`;
    if (sig === this.leanSig) return;
    this.leanSig = sig;
    const o = v.def;
    const [w, h] = (o.rot ?? 0) % 2 ? [G.h, G.w] : [G.w, G.h];
    // room for the players at the ends too
    const W = w + h + 2.2;
    const panel = Math.min(170, window.innerHeight * 0.26);
    const zoom = Math.min(
      ((window.innerWidth - 24) * 0.94) / (W * (TILE_W / 2)),
      ((window.innerHeight - panel - 40) * 0.92) / (W * (TILE_H / 2) + 90),
    );
    this.host.engine.pinCamera({
      x: o.x + w / 2,
      y: o.y + h / 2,
      z: G.top + 20 - panel / 2 / zoom,
      zoom,
      ease: true,
      zoomMax: 5,
    });
    this.host.engine.seeThrough = { x: o.x, y: o.y, w, h };
  }

  // What's drawn, on its own clock. A flight heading to someone whose hit
  // reaches us late (another player, Vortex — not me) hangs a moment at their
  // racket instead of flying on past it; when their hit arrives the new flight
  // takes over from where the ball is, then plays a little fast until it's
  // back on real time (well before it gets to me).
  private display(v: PView, seat: number, dtMs: number): { f: PongFlight; at: number } | null {
    const real = this.serverNow();
    const cur = v.local ?? v.flight;
    if (!cur) {
      v.dispF = null;
      v.dispT = real;
      return null;
    }
    if (!v.dispF) {
      v.dispF = cur;
      v.dispT = Math.max(cur.t0, real - Math.max(0, real - cur.t0));
    }
    // a new flight: shown once the drawn clock reaches its start (the old one
    // carries the ball there); one that starts behind the drawn clock takes
    // over at its start (a small step back at worst)
    let took = false;
    if (cur !== v.dispF) {
      if (v.dispF.t0 > cur.t0) {
        // back to an older flight (my hit wasn't taken): the ball is where that
        // flight has it now — keep the drawn time (a rollback, not a glitch)
        v.dispF = cur;
        v.lastPos = null;
        this.stat("rollbacks");
      } else if (v.dispT >= cur.t0) {
        // a newer one that started behind the drawn time: take over at its start
        if (cur.kind !== "toss") {
          this.stat("overshoot", v.dispT - cur.t0);
          (window as unknown as { __pongTakes?: unknown[] }).__pongTakes?.push({
            over: Math.round(v.dispT - cur.t0),
            hung: Math.round(v.hung),
            near: +v.near.toFixed(2),
            late: Math.round(real - cur.t0),
          });
        }
        v.hung = 0;
        v.near = 9;
        took = true;
        v.dispF = cur;
        v.dispT = cur.t0;
      }
      // (a toss starts a new rally: nothing to be continuous with)
      if (v.dispF === cur && cur.kind === "toss") v.lastPos = null;
    }
    const f = v.dispF;
    // who must hit this one next
    const receiver = f.kind === "toss" ? f.by : ((1 - f.by) as 0 | 1);
    // (catching up: at most 1.8× — a little quick, never a skip)
    let rate = 1 + Math.min(0.8, Math.max(0, real - v.dispT - 16) / CATCH);
    if (receiver !== seat && f === cur) {
      const b = ballAt(f, v.dispT).ball;
      const t = this.table(v.def.id);
      const r = t ? this.racketOf(v, t, receiver) : null;
      const d = r ? Math.hypot(b.x - r.x, b.y - r.y, b.z - r.z) : 9;
      v.near = Math.min(v.near, d);
      const at = d < REACH;
      const comingTo = receiver === 0 ? b.vx < 0 : b.vx > 0;
      // their hit reaches us about a round trip after it happens (theirs to the
      // server, the server's to us — ours stands in for theirs), plus a patch
      const rt = Number.isFinite(this.rtt?.() ?? Number.NaN) ? (this.rtt?.() ?? 120) : 120;
      const hold = Math.max(HOLD_MIN, Math.min(HOLD_MAX, rt * 1.25 + 110));
      if (at && (comingTo || f.kind === "toss") && real - v.dispT < hold) {
        rate = HANG;
        v.hung += dtMs;
      }
    }
    // (the frame a late hit takes over shows the ball at the racket; the
    // catching up starts on the next one)
    if (!took) v.dispT = Math.min(real, v.dispT + dtMs * rate);
    return { f, at: v.dispT };
  }

  // what was drawn this frame (3D, the camera, Vortex at rest follow the drawing)
  private drawn(v: PView): { f: PongFlight; at: number } | null {
    return v.dispF ? { f: v.dispF, at: v.dispT } : null;
  }

  // The toss: shown here at once (the server's echo is a frame or more away,
  // and the racket has to know where the ball is to meet it).
  private toss(id: string, v: PView, seat: number) {
    const at = this.serverNow();
    const y = this.me.y;
    this.host.send("pong:toss", { id, t: at, y });
    v.local = { t0: Math.round(at), ball: serveToss(seat as 0 | 1, y), by: seat as 0 | 1, kind: "toss" };
    v.localAt = this.now;
  }

  // the e2e's counters (only when the page set them up)
  private stat(k: string, n = 1) {
    const s = (window as unknown as { __pongStats?: Record<string, number> }).__pongStats;
    if (!s) return;
    if (k === "overshoot" || k === "maxStep") s[k] = Math.max(s[k] ?? 0, n);
    else s[k] = (s[k] ?? 0) + n;
  }

  // A test hook (window.__pongBot): instead of the pointer, go to the marked
  // spot (and serve) — everything after that is the real path.
  private botTossed = 0;
  private bot(id: string, v: PView, seat: number) {
    if (!(window as unknown as { __pongBot?: boolean }).__pongBot) return;
    if (this.canServe(id) && this.now - this.botTossed > 1500) {
      this.botTossed = this.now;
      this.toss(id, v, seat);
    }
    const p = this.plan;
    this.shot = "drive";
    // (a little off the middle, to send it somewhere)
    if (p && !p.done) this.aim = { x: 0, y: p.y + (Math.random() - 0.5) * 0.12 };
  }

  // My racket: across to the pointer; depth and height to where the ball will
  // be met; the hit when it gets there.
  private moveRacket(id: string, dt: number) {
    const v = this.views.get(id) as PView;
    const t = this.table(id);
    const seat = this.mySeat(t);
    if (seat < 0) return;
    const own = seat === 0 ? -1 : 1;
    const r = this.me;
    const px = r.x;
    const py = r.y;
    const pz = r.z;
    const real = this.serverNow();
    // the ball coming to me (the true flight): where I'll meet it
    const f = v.local ?? v.flight;
    const key = f ? `${f.t0}|${f.kind}|${f.by}` : "";
    if (!f) this.plan = null;
    else if (this.plan?.key !== key) {
      const p = contactPlan(f, seat);
      const rally = this.parse<Rally>(t?.rally);
      const live = rally?.phase !== "over" || v.local?.kind === "toss";
      this.plan = p && live && !(v.local && v.local.kind !== "toss") ? { key, ...p, done: false } : null;
    }
    this.bot(id, v, seat);
    // across: the pointer (or the keys)
    if (this.keyDir[0] || this.keyDir[1]) {
      const leftIsPlusY = seat === 0;
      const dir = (this.keyDir[0] ? 1 : -1) * (leftIsPlusY ? 1 : -1);
      const y = (this.aim?.y ?? r.y) + dir * 2.4 * dt;
      this.aim = { x: 0, y: Math.max(-HW - 0.45, Math.min(HW + 0.45, y)) };
    }
    if (this.aim) r.y += (this.aim.y - r.y) * (1 - Math.exp(-dt * 30));
    // depth and height: ready at my end, gliding to the contact as the ball comes
    const restX = own * (HL + 0.3);
    const restZ = 0.16;
    const p = this.plan;
    if (p && !p.done) {
      const k = Math.max(0, Math.min(1, 1 - (p.t - real) / 650));
      const e = k * k * (3 - 2 * k);
      r.x = restX + (p.x - restX) * e;
      r.z = restZ + (p.z - restZ) * e;
    } else {
      const back = 1 - Math.exp(-dt * 6);
      r.x += (restX - r.x) * back;
      r.z += (restZ - r.z) * back;
    }
    r.vx = (r.x - px) / Math.max(1e-3, dt);
    r.vy = (r.y - py) / Math.max(1e-3, dt);
    r.vz = (r.z - pz) / Math.max(1e-3, dt);
    r.nx = -own;
    r.ny = 0;
    r.nz = 0.15;
    // the hit: when the ball gets to the contact (once)
    let hit = false;
    if (p && !p.done && real >= p.t && t?.phase === "play") {
      p.done = true;
      if (Math.abs(p.y - r.y) <= REACH_LAT && f) {
        r.x = p.x;
        r.z = p.z;
        hit = true;
      } else this.stat("whiffs");
    }
    const at = real;
    if (hit || this.now - this.sentAt >= SEND_MS) {
      this.sentAt = this.now;
      this.host.send("pong:racket", { id, r: [r.x, r.y, r.z, r.nx, r.ny, r.nz, r.vx, r.vy, r.vz, at] });
    }
    // stand behind it (my body goes where my racket hand is)
    const behind = toWorld(v.def, r.x + own * 0.28, r.y + 0.12 * own);
    if (this.now - this.standAt > 60) {
      this.standAt = this.now;
      this.host.stand(behind.x, behind.y);
      const c = tableCentre(v.def);
      this.host.face(c.x, c.y);
    }
    if (hit && f && p) this.strike(id, v, seat, f, p);
  }

  // The shot: aimed by where it met the racket and the way I'm moving, chosen
  // by the buttons, scattered by how clean it was.
  private strike(id: string, v: PView, seat: number, f: PongFlight, p: { t: number; x: number; y: number; z: number }) {
    const own = seat === 0 ? -1 : 1;
    const far = -own;
    const r = this.me;
    const ball = ballAt(f, p.t).ball;
    const off = (ball.y - r.y) / REACH_LAT; // −1…1: which side of the middle it met
    const clean = 1 - Math.min(1, Math.abs(off));
    const serve = f.kind === "toss";
    let type = this.shot;
    // a smash wants a ball up high; off a low one it's a gamble
    const low = ball.z < 0.18;
    const s = SHOTS[type];
    // across: the edge sends it wide (the right part of the racket, to the right), the swing adds to it
    const lean = Math.max(-0.4, Math.min(0.4, r.vy * 0.07));
    let ty = Math.max(-HW + 0.1, Math.min(HW - 0.1, off * 0.5 * HW + lean));
    let tx = far * HL * s.depth;
    const incoming = Math.hypot(ball.vx, ball.vy, ball.vz);
    const spread =
      (this.assist ? 0.045 : 0.1) *
      (0.6 + 2.4 * (1 - clean) ** 2) *
      s.err *
      (type === "smash" && low ? 1.8 : 1) *
      (1 + incoming / 16);
    tx += far * gauss() * spread * 1.6;
    ty += gauss() * spread;
    let nb: PongBall;
    if (serve) {
      if (type === "smash") type = "drive";
      nb = solveServe(ball, seat as 0 | 1, ty, { speed: type === "chop" ? 5.2 : 6.6, top: type === "chop" ? -60 : 50 });
    } else {
      const speed = type === "smash" ? (low ? 12 : s.speed) : s.speed;
      nb = solveShot(ball, tx, ty, { speed: speed * (0.94 + Math.random() * 0.12), top: s.top });
    }
    // (my toss not echoed yet: it will be the server's next flight)
    const tossing = v.local?.kind === "toss";
    const seq = tossing ? (v.seq + 1) & 0xffff : v.seq;
    v.hitSeq = seq;
    this.stat("sent");
    this.host.send("pong:hit", { id, seq, t: p.t, b: [nb.x, nb.y, nb.z, nb.vx, nb.vy, nb.vz, nb.wx, nb.wy, nb.wz] });
    v.local = { t0: p.t, ball: nb, by: seat as 0 | 1, kind: serve ? "serve" : "hit" };
    v.localAt = this.now;
    v.shown = p.t;
    const sp = Math.hypot(nb.vx, nb.vy, nb.vz);
    v.lastSpeed = Math.round(sp * 3.6);
    this.swingAt[seat] = this.now;
    this.swingType[seat] = type;
    tock(sp, 0.9, 0);
  }

  private update(id: string, v: PView, me: Pt) {
    const t = this.table(id);
    const seat = this.mySeat(t);
    // a new flight from the server
    const sig: string = t?.flight ?? "";
    const seq = Number(t?.seq ?? 0);
    if (seq !== v.seq || sig !== v.sig) {
      const f = this.parse<PongFlight>(sig);
      const wasLocal = v.local;
      v.sig = sig;
      v.seq = seq;
      v.flight = f;
      v.arrived = this.now;
      v.lag = f ? Math.max(0, this.serverNow() - f.t0) : 0;
      // the echo of my toss after I've already served it: mine is newer, keep it
      if (wasLocal && f && f.t0 < wasLocal.t0 - 1 && f.by === wasLocal.by) return this.draw(id, v, t, this.drawn(v));
      // (the other side hitting back after my hit is my hit taken too: that ball
      // only went their way because the server took it)
      const confirmed =
        !!wasLocal &&
        !!f &&
        ((f.by === wasLocal.by && f.kind === wasLocal.kind && Math.abs(f.t0 - wasLocal.t0) < 2) ||
          (wasLocal.kind !== "toss" && f.by !== wasLocal.by && f.kind === "hit" && f.t0 > wasLocal.t0));
      if (confirmed) {
        // the server took my hit (or toss): carry on as it was (the same flight, drawn on)
        if (wasLocal.kind !== "toss") this.stat("taken");
        if (v.dispF === wasLocal && f.by === wasLocal.by) v.dispF = f;
      } else if (wasLocal && wasLocal.kind !== "toss") {
        this.stat("dropped");
        (window as unknown as { __pongDrops?: unknown[] }).__pongDrops?.push({
          why: "replaced",
          mine: { t0: wasLocal.t0, kind: wasLocal.kind },
          server: f ? { t0: f.t0, kind: f.kind, by: f.by } : null,
          rally: t?.rally,
        });
      }
      if (confirmed && f.by === wasLocal?.by) {
        // (no tock: I heard mine when I hit it)
      } else if (f && f.kind !== "toss") {
        // someone else's hit (or Vortex's): the tock, from there
        const sp = Math.hypot(f.ball.vx, f.ball.vy, f.ball.vz);
        if (f.by !== seat) {
          this.swingAt[f.by] = this.now;
          this.swingType[f.by] = sp > 12 ? "smash" : f.ball.wy * (f.by === 0 ? 1 : -1) < -30 ? "chop" : "drive";
          v.lastSpeed = Math.round(sp * 3.6);
          tock(sp, this.gain(v, me), this.pan(v, me));
        }
      }
      v.local = null;
      v.shown = f?.t0 ?? 0;
    }
    // my hit never taken: back to the server's
    if (v.local && this.now - v.localAt > 900) {
      if (v.local.kind !== "toss") {
        this.stat("dropped");
        (window as unknown as { __pongDrops?: unknown[] }).__pongDrops?.push({ why: "timeout" });
      }
      v.local = null;
    }
    // the rackets others stream
    for (const k of [0, 1] as const) {
      const a = this.parse<number[]>(k === 0 ? t?.r0 : t?.r1);
      if (!a || k === seat) continue;
      const want: RacketAt = {
        x: a[0],
        y: a[1],
        z: a[2],
        nx: a[3],
        ny: a[4],
        nz: a[5],
        vx: a[6],
        vy: a[7],
        vz: a[8],
        t: a[9],
      };
      const cur = v.others[k];
      v.others[k] = cur
        ? {
            ...want,
            x: cur.x + (want.x - cur.x) * 0.35,
            y: cur.y + (want.y - cur.y) * 0.35,
            z: cur.z + (want.z - cur.z) * 0.35,
          }
        : want;
    }
    // what's drawn this frame, and the sounds of what it touched since the last
    const sf = this.display(v, seat, Math.min(100, this.now - (this.lastFrame.get(id) ?? this.now)));
    this.lastFrame.set(id, this.now);
    if (sf) {
      // (the e2e: how far the drawn ball moved this frame, against how fast it goes)
      const b = ballAt(sf.f, sf.at).ball;
      if (v.lastPos) {
        const step = Math.hypot(b.x - v.lastPos.x, b.y - v.lastPos.y, b.z - v.lastPos.z);
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        const dtS = Math.max(0.016, Math.min(0.2, (this.now - (this.lastStep.get(id) ?? this.now)) / 1000));
        // (a catch-up runs up to 1.8× — that's motion, not a jump)
        if (step > Math.max(0.3, 2.4 * sp * dtS + 0.1)) {
          this.stat("jumps");
          this.stat("maxStep", step);
          const log = (window as unknown as { __pongJumps?: unknown[] }).__pongJumps;
          log?.push({
            step: +step.toFixed(2),
            kind: sf.f.kind,
            by: sf.f.by,
            into: Math.round(sf.at - sf.f.t0),
            lag: Math.round(this.serverNow() - sf.at),
            from: v.lastPos,
            to: { x: +b.x.toFixed(2), z: +b.z.toFixed(2) },
          });
        }
      }
      v.lastPos = { x: b.x, y: b.y, z: b.z };
      this.lastStep.set(id, this.now);
    } else v.lastPos = null;
    if (sf) {
      for (const e of flightEvents(sf.f)) {
        if (e.t <= v.shown || e.t > sf.at) continue;
        const g = this.gain(v, me);
        if (e.k === "table") pock(e.speed, g, this.pan(v, me));
        else if (e.k === "net") netBuzz(g * 0.7, this.pan(v, me));
        else floorBounce(g * 0.6, this.pan(v, me));
      }
      v.shown = Math.max(v.shown, sf.at);
    }
    this.draw(id, v, t, sf);
  }
  private gain(v: PView, me: Pt) {
    return Math.max(0, 1 - tableAway(v.def, me.x, me.y) / HEAR) * 0.9;
  }
  private pan(v: PView, me: Pt) {
    const c = tableCentre(v.def);
    return Math.max(-0.8, Math.min(0.8, (toScreen(c.x, c.y).x - toScreen(me.x, me.y).x) / 300));
  }

  // a seat's racket now: mine, streamed, Vortex's (going for his shot), or at rest
  private racketOf(v: PView, t: S | undefined, k: 0 | 1): Racket | null {
    const s = t?.seats.get(String(k));
    if (!s || t?.phase === "lobby") return null;
    const own = k === 0 ? -1 : 1;
    if (!s.vortex && s.sid === this.host.room.sessionId) return this.me;
    if (!s.vortex) return v.others[k];
    // Vortex: towards his next contact, then through it
    const cpu = this.parse<{ seq: number; t: number; x: number; y: number; z: number; whiff: boolean }>(t?.cpu);
    const now = this.serverNow();
    const rest: Racket = { x: own * (HL + 0.32), y: 0, z: 0.18, nx: -own, ny: 0, nz: 0.12, vx: 0, vy: 0, vz: 0 };
    if (!cpu || now > cpu.t + 380) {
      const sf = this.drawn(v);
      if (sf) {
        const b = ballAt(sf.f, sf.at).ball;
        rest.y = Math.max(-HW, Math.min(HW, b.y));
      }
      return rest;
    }
    const lead = Math.max(0, Math.min(1, 1 - (cpu.t - now) / 520));
    const ease = lead * lead * (3 - 2 * lead);
    const through = now > cpu.t ? (now - cpu.t) / 380 : 0;
    return {
      x: rest.x + (cpu.x + own * 0.04 - rest.x) * ease - own * through * 0.35,
      y: rest.y + (cpu.y - rest.y) * ease + (cpu.whiff ? 0.12 : 0),
      z: rest.z + (cpu.z - rest.z) * ease + through * 0.25,
      nx: -own,
      ny: 0,
      nz: 0.15 - through * 0.3,
      vx: 0,
      vy: 0,
      vz: 0,
    };
  }

  // How a seat's racket is held now: its blade's middle, its face and "up the
  // blade" (table frame). Diagonal, the tip up and out to the forehand side;
  // a hit swings it — forward and over for a drive, harder for a smash, down
  // and under for a chop.
  private pose(seat: 0 | 1, r: Racket): { x: number; y: number; z: number; N: V; U: V } {
    const own = seat === 0 ? -1 : 1;
    const far = -own;
    const right = seat === 0 ? -1 : 1; // the player's right hand, across the table
    const s = Math.max(0, Math.min(1, (this.now - this.swingAt[seat]) / SWING_MS));
    const swing = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
    const type = this.swingType[seat];
    const k = type === "smash" ? 1.4 : type === "chop" ? 0.8 : 1;
    const dz = type === "chop" ? -0.08 : 0.1;
    const x = r.x + far * 0.22 * swing * k;
    const y = r.y - right * 0.16 * swing * k;
    const z = r.z + dz * swing * k;
    // up the blade: 40° off upright towards the forehand, rolling over in the swing
    let U: V = [0, right * (0.64 - 1.1 * swing), 0.77];
    const ul = Math.hypot(...U);
    U = [U[0] / ul, U[1] / ul, U[2] / ul];
    // the face: at the other end, a little closed (open for a chop)
    const tilt = type === "chop" && swing > 0 ? 0.45 : 0.12 - 0.25 * swing;
    let N: V = [far, 0, tilt];
    const d = N[0] * U[0] + N[1] * U[1] + N[2] * U[2];
    N = [N[0] - d * U[0], N[1] - d * U[1], N[2] - d * U[2]];
    const nl = Math.hypot(...N) || 1;
    N = [N[0] / nl, N[1] / nl, N[2] / nl];
    return { x, y, z, N, U };
  }

  // ── drawing (iso) ────────────────────────────────────────────────────────
  private draw(id: string, v: PView, t: S | undefined, sf: { f: PongFlight; at: number } | null) {
    const o = v.def;
    const rot = o.rot ?? 0;
    const cols = rot % 2 === 0;
    const sliceOf = (wx: number, wy: number) => Math.max(0, Math.min(3, Math.floor(cols ? wx - o.x : wy - o.y)));
    for (const s of v.slices) s.g.clear();
    v.front.clear();
    const tint = this.host.engine.liveTint(tableCentre(o).x, tableCentre(o).y);
    for (const s of v.slices) s.g.tint = tint;
    v.front.tint = tint;
    const sc = (x: number, y: number, z: number) => {
      const w = toWorld(o, x, y);
      const p = toScreen(w.x, w.y);
      return { x: p.x, y: p.y - zPx(z), wx: w.x, wy: w.y };
    };
    const surface = (x: number, y: number) => (Math.abs(x) <= HL && Math.abs(y) <= HW ? 0 : -0.76);
    const g = v.front;
    const seat = this.mySeat(t);
    // what's coming to me: where it'll bounce, where I'll meet it, my reach
    if (this.focus === id && seat >= 0) this.drawGuides(g, sc, v, seat as 0 | 1, surface);
    // the ball: in flight, or in the server's hand
    let ball: PongBall | null = null;
    if (sf) ball = ballAt(sf.f, sf.at).ball;
    else if (t?.phase === "play") {
      const score = this.parse<PongScore>(t.score);
      const r = score ? this.racketOf(v, t, score.server) : null;
      if (r) ball = { x: r.x, y: r.y, z: r.z + 0.1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
    }
    if (ball) {
      const floorZ = surface(ball.x, ball.y);
      const sh = sc(ball.x, ball.y, floorZ);
      const p = sc(ball.x, ball.y, ball.z);
      // bigger than true: a 4 cm ball is two pixels at table distance
      const rr = Math.max(2.6, PONG_R * G.tpm * LPX * 1.9);
      const gs = v.slices[sliceOf(p.wx, p.wy)].g;
      const lift = Math.min(1, (ball.z - floorZ) / 0.8);
      gs.ellipse(sh.x, sh.y, rr * (1.25 - 0.35 * lift), rr * 0.6 * (1.25 - 0.35 * lift)).fill({
        color: 0x0c0806,
        alpha: 0.5 - 0.25 * lift,
      });
      // the line down to its shadow: how high it is, at a glance
      if (sf && ball.z - floorZ > 0.05) {
        const n = Math.max(2, Math.floor((sh.y - p.y) / 4));
        for (let i = 0; i < n; i += 2) {
          const a = p.y + ((sh.y - p.y) * i) / n;
          const b = p.y + ((sh.y - p.y) * (i + 1)) / n;
          g.moveTo(p.x, a).lineTo(p.x, b).stroke({ width: 0.6, color: 0xfff6e6, alpha: 0.35 });
        }
      }
      // a trail when it's quick
      if (sf) {
        const back = ballAt(sf.f, sf.at - 40).ball;
        const q = sc(back.x, back.y, back.z);
        g.moveTo(q.x, q.y)
          .lineTo(p.x, p.y)
          .stroke({ width: rr * 1.4, color: 0xffb35c, alpha: 0.25, cap: "round" });
      }
      g.circle(p.x, p.y, rr).fill(0xfbf5e9).stroke({ width: 0.8, color: 0x2a1a12 });
      g.circle(p.x - rr * 0.35, p.y - rr * 0.35, rr * 0.35).fill({ color: 0xffffff, alpha: 0.95 });
    }
    // the rackets
    for (const k of [0, 1] as const) {
      const r = this.racketOf(v, t, k);
      if (!r) continue;
      this.drawRacket(g, sc, surface, this.pose(k, r), k === seat ? this.shot : null);
    }
  }

  // Where the ball coming to me will bounce (a ring closing in), where I'll meet
  // it (a marker with a line to the floor), and my racket's reach across at
  // that depth — green when it's in reach, amber when I have to move.
  private drawGuides(
    g: Graphics,
    sc: (x: number, y: number, z: number) => { x: number; y: number },
    v: PView,
    seat: 0 | 1,
    surface: (x: number, y: number) => number,
  ) {
    const p = this.plan;
    const f = v.local ?? v.flight;
    if (!p || p.done || !f) return;
    const real = this.serverNow();
    const inReach = Math.abs(p.y - this.me.y) <= REACH_LAT;
    const col = inReach ? 0xa8e07a : 0xffb35c;
    const pulse = 0.5 + 0.5 * Math.sin(this.now / 110);
    // the bounce
    const b = flightEvents(f).find((e) => e.k === "table" && e.side === seat);
    if (b && real < b.t + 60) {
      const k = Math.max(0, Math.min(1, (b.t - real) / 700));
      const rad = (0.05 + 0.16 * k) * G.tpm * LPX;
      const c = sc(b.x, b.y, 0.002);
      g.ellipse(c.x, c.y, rad, rad * 0.5).stroke({ width: 1.1, color: 0xfff6e6, alpha: 0.85 });
      g.ellipse(c.x, c.y, 2, 1).fill({ color: 0xfff6e6, alpha: 0.9 });
    }
    // where I'll meet it
    const m = sc(p.x, p.y, p.z);
    const floor = sc(p.x, p.y, surface(p.x, p.y));
    for (let y = m.y; y < floor.y; y += 6)
      g.moveTo(m.x, y)
        .lineTo(m.x, Math.min(floor.y, y + 3))
        .stroke({ width: 0.8, color: col, alpha: 0.7 });
    g.ellipse(floor.x, floor.y, 6, 3).stroke({ width: 1, color: col, alpha: 0.8 });
    g.circle(m.x, m.y, 5 + 2 * pulse).stroke({ width: 1.6, color: col, alpha: 0.95 });
    // my reach, across at that depth and height
    const a = sc(p.x, this.me.y - REACH_LAT, p.z);
    const c = sc(p.x, this.me.y + REACH_LAT, p.z);
    g.moveTo(a.x, a.y).lineTo(c.x, c.y).stroke({ width: 4, color: col, alpha: 0.28, cap: "round" });
    g.moveTo(a.x, a.y).lineTo(c.x, c.y).stroke({ width: 1, color: col, alpha: 0.8, cap: "round" });
  }

  private drawRacket(
    g: Graphics,
    sc: (x: number, y: number, z: number) => { x: number; y: number },
    surface: (x: number, y: number) => number,
    q: { x: number; y: number; z: number; N: V; U: V },
    mine: ShotType | null,
  ) {
    const { N, U } = q;
    // across the blade: U × N
    const A: V = [U[1] * N[2] - U[2] * N[1], U[2] * N[0] - U[0] * N[2], U[0] * N[1] - U[1] * N[0]];
    const R = 0.075 * 1.3; // a little bigger than true, so it reads
    // its shadow below
    const s = sc(q.x, q.y, surface(q.x, q.y));
    g.ellipse(s.x, s.y, R * G.tpm * LPX * 0.9, R * G.tpm * LPX * 0.4).fill({ color: 0x0c0806, alpha: 0.22 });
    const pts: number[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const cs = Math.cos(a) * R;
      const sn = Math.sin(a) * R * 1.08;
      const p = sc(q.x + A[0] * cs + U[0] * sn, q.y + A[1] * cs + U[1] * sn, q.z + A[2] * cs + U[2] * sn);
      pts.push(p.x, p.y);
    }
    const h0 = sc(q.x - U[0] * R, q.y - U[1] * R, q.z - U[2] * R);
    const h1 = sc(q.x - U[0] * (R + 0.11), q.y - U[1] * (R + 0.11), q.z - U[2] * (R + 0.11));
    g.moveTo(h0.x, h0.y).lineTo(h1.x, h1.y).stroke({ width: 3.2, color: 0xd8b07a, cap: "round" });
    g.moveTo(h0.x, h0.y).lineTo(h1.x, h1.y).stroke({ width: 0.6, color: 0x2a1a12, alpha: 0.6, cap: "round" });
    // which rubber the camera sees (the iso camera looks from +x +y, 30° down)
    const facing = N[0] * Math.SQRT1_2 - N[1] * Math.SQRT1_2 + N[2] * 0.5;
    g.poly(pts)
      .fill(facing > 0 ? 0xc62a1e : 0x1c1a17)
      .stroke({ width: 1.2, color: mine ? SHOT_COLOR[mine] : 0xd8b07a });
    g.poly(pts).stroke({ width: 0.5, color: 0x2a1a12, alpha: 0.8 });
  }

  // ── for the controller ───────────────────────────────────────────────────
  vortexes(): { key: string; x: number; y: number; angle: number; mood: string }[] {
    const out: { key: string; x: number; y: number; angle: number; mood: string }[] = [];
    for (const [id, v] of this.views) {
      const t = this.table(id);
      if (!t) continue;
      for (const [k, s] of t.seats as Map<string, S>) {
        if (!s.vortex) continue;
        const seat = Number(k) as 0 | 1;
        const own = seat === 0 ? -1 : 1;
        const r = this.racketOf(v, t, seat);
        const at = toWorld(v.def, own * (HL + 0.62), Math.max(-HW, Math.min(HW, r?.y ?? 0)) + 0.1 * own);
        const c = tableCentre(v.def);
        const score = this.parse<PongScore>(t.score);
        const pt = this.parse<{ winner: number; why: string }>(t.point);
        const mine = score ? score.points[seat] : 0;
        const theirs = score ? score.points[1 - seat] : 0;
        const mood =
          score && score.winner >= 0
            ? score.winner === seat
              ? "smug"
              : "crying"
            : pt && pt.winner === seat && t.rally && this.parse<Rally>(t.rally)?.phase === "over"
              ? "happy"
              : pt && pt.winner === 1 - seat && this.parse<Rally>(t.rally)?.phase === "over"
                ? "seething"
                : mine > theirs + 2
                  ? "smug"
                  : theirs > mine + 2
                    ? "judging"
                    : "curious";
        out.push({ key: `pong:${id}:${k}`, x: at.x, y: at.y, angle: Math.atan2(c.y - at.y, c.x - at.x), mood });
      }
    }
    return out;
  }

  scene3d(into: TableScene3) {
    for (const [id, v] of this.views) {
      const t = this.table(id);
      const o = v.def;
      const rot = o.rot ?? 0;
      const sf = this.drawn(v);
      let ball: PongBall | null = sf ? ballAt(sf.f, sf.at).ball : null;
      if (!ball && t?.phase === "play") {
        const score = this.parse<PongScore>(t.score);
        const r = score ? this.racketOf(v, t, score.server) : null;
        if (r) ball = { x: r.x, y: r.y, z: r.z + 0.09, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
      }
      if (ball) {
        const w = toWorld(o, ball.x, ball.y);
        const under = Math.abs(ball.x) <= HL && Math.abs(ball.y) <= HW ? 0.001 : -0.76;
        const trail: [number, number, number][] = [];
        if (sf)
          for (let k = 7; k >= 0; k--) {
            const q = ballAt(sf.f, Math.max(sf.f.t0, sf.at - k * 16)).ball;
            const qw = toWorld(o, q.x, q.y);
            trail.push([qw.x, qw.y, zPx(q.z) / ZPX]);
          }
        into.pongBalls.push({ key: id, x: w.x, y: w.y, z: zPx(ball.z) / ZPX, shadowZ: zPx(under) / ZPX, trail });
      }
      // the guides to the ball coming to me
      const seat = this.mySeat(t);
      const p = this.plan;
      const f = v.local ?? v.flight;
      if (this.focus === id && seat >= 0 && p && !p.done && f) {
        const col = Math.abs(p.y - this.me.y) <= REACH_LAT ? 0xa8e07a : 0xffb35c;
        const W = (x: number, y: number, z: number): [number, number, number] => {
          const q = toWorld(o, x, y);
          return [q.x, q.y, zPx(z) / ZPX];
        };
        const m = W(p.x, p.y, p.z);
        const floorZ = Math.abs(p.x) <= HL && Math.abs(p.y) <= HW ? 0.002 : -0.76;
        const pulse = 0.5 + 0.5 * Math.sin(this.now / 110);
        // where I'll meet it: a glowing ring facing me, a drop to the floor
        into.rings.push({
          key: `${id}:meet`,
          x: m[0],
          y: m[1],
          z: m[2],
          r: (0.075 + 0.015 * pulse) * G.tpm,
          color: col,
          alpha: 0.95,
          face: true,
        });
        if (!into.bars) into.bars = [];
        const bars = into.bars;
        bars.push({ key: `${id}:drop`, a: m, b: W(p.x, p.y, floorZ), r: 0.006, color: col, alpha: 0.55 });
        // my racket's reach across, at that depth and height
        bars.push({
          key: `${id}:reach`,
          a: W(p.x, this.me.y - REACH_LAT, p.z),
          b: W(p.x, this.me.y + REACH_LAT, p.z),
          r: 0.012,
          color: col,
          alpha: 0.55,
        });
        const b = flightEvents(f).find((e) => e.k === "table" && e.side === seat);
        const real = this.serverNow();
        if (b && real < b.t + 60) {
          const k = Math.max(0, Math.min(1, (b.t - real) / 700));
          const q = W(b.x, b.y, 0.003);
          into.rings.push({
            key: `${id}:bounce`,
            x: q[0],
            y: q[1],
            z: q[2],
            r: (0.06 + 0.2 * k) * G.tpm,
            color: 0xfff6e6,
            alpha: 0.9,
          });
        }
      }
      for (const k of [0, 1] as const) {
        const r = this.racketOf(v, t, k);
        if (!r) continue;
        const q = this.pose(k, r);
        const w = toWorld(o, q.x, q.y);
        into.rackets.push({
          key: `${id}:${k}`,
          x: w.x,
          y: w.y,
          z: zPx(q.z) / ZPX,
          n: v3(q.N, rot),
          up: v3(q.U, rot),
          rubber: k === 0 ? 0xb3261e : 0x1f4ea8,
        });
      }
    }
  }

  // 3D: behind my end, a little above, easing across with the ball
  private camY = 0;
  gameCam(): { eye: [number, number, number]; look: [number, number, number] } | null {
    const v = this.focus ? this.views.get(this.focus) : undefined;
    if (!v) return null;
    const t = this.table(v.def.id);
    const seat = Math.max(0, this.mySeat(t));
    const own = seat === 0 ? -1 : 1;
    // behind my end and above it, the whole table in view, easing across with my racket
    this.camY += (Math.max(-0.45, Math.min(0.45, this.me.y * 0.4)) - this.camY) * 0.08;
    const top = G.top / ZPX;
    // (looking down at my half: my racket and where I meet the ball mid-screen,
    // above the console; the far end and the other player still in view)
    const eye = toWorld(v.def, own * (HL + 1.6), this.camY);
    const look = toWorld(v.def, own * 0.75, this.camY * 0.3);
    void tableHeading;
    return { eye: [eye.x, eye.y, top + 1.75], look: [look.x, look.y, top] };
  }

  atTable(): boolean {
    const t = this.focus ? this.table(this.focus) : undefined;
    return !!t && this.mySeat(t) >= 0;
  }

  dispose() {
    this.lean(null);
    for (const id of [...this.views.keys()]) this.drop(id);
  }
}
