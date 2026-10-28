import { toScreen, type WorldObjectDef } from "@yutopia/shared";
import { BALL_R, POOL_L, POOL_W, type PoolBall, type PoolShot, PoolSim, placeOk } from "@yutopia/shared/pool";
import { aimGuide, onTheEight, POOL_POCKETS, type PoolGame, unpackBalls, unpackGame } from "@yutopia/shared/pool-game";
import { OFF_TABLE } from "@yutopia/shared/pool-throw";
import {
  standFor,
  TABLES,
  tableAngle,
  tableAway,
  tableCentre,
  tableHeading,
  tablePx,
  tableTurn,
  toTable,
  toWorld,
} from "@yutopia/shared/tables";
import type { WorldModel } from "../model";
import { hud, toast } from "../store";
import type { TableScene3 } from "../tp/tables3d";
import { ballQuat, type Q } from "./ballart";
import { chalk, clack, cueTip, cushion, pocketDrop } from "./sound";

// Pool tables, live (world/tables, a lazy chunk loaded once a space has a game
// table): every table's balls for everyone — at rest where the server's game
// has them, rolling when a shot is being played (each client replays the shot
// through the same physics, from the same layout) — the shooter's cue as they
// aim (everyone sees it move), the other players' cues by their sides, the
// billiard lamp, the potted balls in the return tray, the sounds from where
// the table is. At a table's controls: a game camera takes over (gameCam), and
// the pointer aims, pulls back and shoots.

// biome-ignore lint/suspicious/noExplicitAny: colyseus schema instances
type S = any;
type Send = (type: string, msg: Record<string, unknown>) => void;
type Pt = { x: number; y: number };

export interface TableHost {
  model: WorldModel;
  // biome-ignore lint/suspicious/noExplicitAny: a server message's body
  room: { state: S; sessionId: string; onMessage?: (type: string, cb: (m: any) => void) => unknown };
  send: Send;
  walkTo(p: Pt): void;
  face(x: number, y: number): void;
  // put me right here (no path: ping-pong's footwork follows the racket)
  stand(x: number, y: number): void;
  worldHttp(): string;
}

const K = "pool_table" as const;
const G = TABLES[K];
const ZPX = 45.25 * Math.cos(Math.PI / 6); // iso px of height per tile (tablePx's unit)
const R_T = BALL_R * G.tpm; // a ball's radius, tiles
const BALL_Z = tablePx(K, BALL_R); // px: a ball's centre
const CLOTH_Z = G.top;
const CUE_LEN = 1.45; // m
const HEAR = 12; // tiles
const AIM_MS = 100;
const SETTLE_MS = 420; // the aim holds still this long: the shooter walks round to it

// ── a ball going down ────────────────────────────────────────────────────────
// The physics drops a ball the moment it's past the pocket's drop line (and
// puts it at the hole's centre). On screen it goes on from where it was: over
// the lip into the mouth, down the hole, a moment at the bottom of the pocket,
// then off down the return to the tray. A ring of its colour opens out of the
// pocket as it drops (you see at a glance which went where).
interface Drop {
  pocket: number;
  at: number; // ms
  from: Pt;
  speed: number; // m/s
}
// how deep the pockets are (m below the cloth; the 3D table's holes are this deep)
export const POCKET_DEPTH = 0.085;
// a hole's radius, m (the item's art: 0.105 / 0.098 tiles at 1.55 tiles a metre)
const holeR = (side: boolean) => (side ? 0.098 : 0.105) / G.tpm;
const DROP_FALL = 0.3; // s down the hole
const DROP_REST = 0.45; // s at the bottom, then down the return
function dropAt(d: Drop, now: number): { x: number; y: number; sink: number; flash: number; done: boolean } {
  const pk = POOL_POCKETS[d.pocket];
  const u = (now - d.at) / 1000;
  const dist = Math.hypot(pk.x - d.from.x, pk.y - d.from.y);
  const ts = Math.max(0.04, Math.min(0.16, dist / Math.max(0.5, d.speed)));
  // the hole's lip: the ball tips over it on its way in
  if (u < ts) {
    const k = u / ts;
    return {
      x: d.from.x + (pk.x - d.from.x) * k,
      y: d.from.y + (pk.y - d.from.y) * k,
      sink: k * k * BALL_R * 0.5,
      flash: -1,
      done: false,
    };
  }
  const tf = u - ts;
  // falling (a little slower than true, so it's seen), then resting deep in the pocket
  const sink = Math.min(
    POCKET_DEPTH,
    BALL_R * 0.5 + 0.5 * 2.2 * tf * tf * (1 / (DROP_FALL * DROP_FALL)) * POCKET_DEPTH,
  );
  const flash = tf < 0.5 ? tf / 0.5 : -1;
  return { x: pk.x, y: pk.y, sink, flash, done: tf > DROP_FALL + DROP_REST };
}
const BALL_HEX = [0xf4efe2, 0xf2b21c, 0x1f4ea8, 0xc8322b, 0x56307f, 0xe8691b, 0x1d7748, 0x7b2331, 0x2a2a2a];
const flashColor = (id: number) => (id === 8 ? 0xf4ecd8 : BALL_HEX[id > 8 ? id - 8 : id]);

export interface PoolInfo {
  id: string;
  phase: string; // lobby / play / done
  seats: ({ name: string; uid: number; vortex: string; me: boolean } | null)[];
  mySeat: number;
  turn: number;
  myTurn: boolean;
  groups: (string | null)[];
  left: [number, number]; // balls of their group still on the table
  down: number[][][]; // each seat's group: [id, down 0|1] in order
  onEight: boolean;
  called: number;
  inHand: string;
  placing: boolean; // the cue ball is in my hand, following the pointer
  rolling: boolean;
  winner: number;
  clock: number;
  clockLeft: number; // s
  guide: string;
  result: {
    no: number;
    seat: number;
    foul: string | null;
    potted: number[];
    outcome: string | null;
    assigned: string | null;
    winner: number;
    miscue?: boolean;
  } | null;
  power: number;
  spinX: number;
  spinY: number;
  cam: "top" | "cue";
  holding: "ball" | "cue" | ""; // a ball or the cue of a table's in my hand (tables/pballs.ts)
  vortexThinking: boolean;
  record: { last: { w: string; l: string; how: string }[]; wins: Record<string, number> } | null;
}

interface View {
  def: WorldObjectDef;
  shown: PoolBall[];
  gameSig: string;
  game: PoolGame | null;
  sim: PoolSim | null;
  simNo: number; // the shot the sim plays (−1: mine, not confirmed yet)
  pendingAt: number;
  evSeen: number;
  seenNo: number;
  born: boolean;
  drops: Map<number, Drop>;
  last: Map<number, Pt>; // where each ball on the cloth was last frame (a drop starts there)
  strikeAt: number;
  strike: (PoolShot & { seat: number }) | null;
  dirty: boolean;
}

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
// a point kept on the cloth (a ball's whole width inside the cushions)
const onCloth = (p: Pt): Pt => ({
  x: Math.max(-POOL_L / 2 + BALL_R, Math.min(POOL_L / 2 - BALL_R, p.x)),
  y: Math.max(-POOL_W / 2 + BALL_R, Math.min(POOL_W / 2 - BALL_R, p.y)),
});

export class PoolTables {
  private views = new Map<string, View>();
  focus: string | null = null;
  cam: "top" | "cue" = "top";
  // my cue, while I aim
  private angle = Math.PI;
  private power = 0; // pulled back, 0..1
  private spinX = 0;
  private spinY = 0;
  private called = -1;
  private press: { x: number; y: number; angle: number } | null = null;
  private drag: Pt | null = null; // the cue ball in my hand (table metres)
  // ball in hand after a foul: the cue ball comes up into my hand by itself
  // and follows the pointer (no button held) until a click puts it down
  private hover = false;
  private swallowUp = false; // that click's release isn't a shot
  private handFor = -1; // the shot whose foul put it in my hand
  private warnedAt = 0;
  private fine: { at: number; angle: number } | null = null;
  private sentAt = 0;
  private sentSig = "";
  private movedAt = 0;
  private walkedTo = "";
  private now = 0;

  constructor(private host: TableHost) {}

  // ── tables in the room ───────────────────────────────────────────────────
  refresh() {
    const defs = this.host.model.allObjects().filter((o) => o.kind === K);
    const keep = new Set<string>();
    for (const def of defs) {
      keep.add(def.id);
      const old = this.views.get(def.id);
      if (old && old.def.x === def.x && old.def.y === def.y && (old.def.rot ?? 0) === (def.rot ?? 0)) {
        old.def = def;
        continue;
      }
      if (old) this.drop(def.id);
      this.views.set(def.id, this.makeView(def));
    }
    for (const id of [...this.views.keys()]) if (!keep.has(id)) this.drop(id);
  }

  private makeView(def: WorldObjectDef): View {
    return {
      def,
      shown: [],
      gameSig: "",
      game: null,
      sim: null,
      simNo: 0,
      pendingAt: 0,
      evSeen: 0,
      seenNo: 0,
      born: false,
      drops: new Map(),
      last: new Map(),
      strikeAt: 0,
      strike: null,
      dirty: true,
    };
  }

  private drop(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    if (this.focus === id) this.setFocus(null);
  }

  private table(id: string): S | undefined {
    return this.host.room.state.pool?.get(id);
  }
  private mySeat(t: S | undefined): number {
    if (!t) return -1;
    for (const [k, s] of t.seats as Map<string, S>)
      if (s.sid === this.host.room.sessionId && !s.vortex) return Number(k);
    return -1;
  }
  private rolling(v: View) {
    return !!v.sim;
  }
  private myTurn(id: string): boolean {
    const v = this.views.get(id);
    const t = this.table(id);
    if (!v?.game || !t || t.phase !== "play" || v.game.winner >= 0) return false;
    return this.mySeat(t) === v.game.turn && !this.rolling(v) && Date.now() >= num(t.until) - 400;
  }

  // ── the panel ────────────────────────────────────────────────────────────
  sit(id: string, seat: number) {
    this.host.send("pool:sit", { id, seat });
  }
  leave(id: string) {
    this.host.send("pool:leave", { id });
  }
  vortex(id: string, level: string | null) {
    this.host.send("pool:vortex", { id, level });
  }
  start(id: string, clock: number, guide: string) {
    this.host.send("pool:start", { id, clock, guide });
  }
  concede(id: string) {
    this.host.send("pool:concede", { id });
  }
  setSpin(x: number, y: number) {
    const l = Math.hypot(x, y);
    const k = l > 1 ? 1 / l : 1;
    this.spinX = x * k;
    this.spinY = y * k;
    chalk(0.25);
  }
  setPower(p: number) {
    this.power = Math.max(0, Math.min(1, p));
  }
  setCam(c: "top" | "cue") {
    this.cam = c;
  }
  nudge(rad: number) {
    this.angle += rad;
    this.movedAt = performance.now();
  }
  // the console's Shoot (the power slider's power)
  shootNow() {
    if (this.focus) this.shoot(this.focus);
  }
  // Space held: the power grows little by little (the cue draws back with it);
  // let go and it's played. Esc (`cancel`) puts the cue down.
  private chargeAt: number | null = null;
  static readonly CHARGE_MS = 1700; // empty to full
  charge(on: boolean, cancel = false) {
    const id = this.focus;
    if (on) {
      if (id && this.myTurn(id) && this.chargeAt === null && !this.press && !this.drag && !this.hover) {
        this.chargeAt = performance.now();
        this.power = 0;
      }
      return;
    }
    if (this.chargeAt === null) return;
    this.chargeAt = null;
    if (!cancel && id && this.power > 0.02) this.shoot(id);
    else this.power = 0;
  }
  get charging() {
    return this.chargeAt !== null;
  }

  info(id: string): PoolInfo | null {
    const v = this.views.get(id);
    if (!v) return null;
    const t = this.table(id);
    const g = v.game;
    const seats: PoolInfo["seats"] = [0, 1].map((k) => {
      const s = t?.seats.get(String(k));
      return s
        ? { name: s.name, uid: s.uid, vortex: s.vortex, me: s.sid === this.host.room.sessionId && !s.vortex }
        : null;
    });
    const mySeat = this.mySeat(t);
    const groups = g?.groups ?? [null, null];
    const down = [0, 1].map((k) => {
      const grp = groups[k];
      const ids = grp === "solids" ? [1, 2, 3, 4, 5, 6, 7] : grp === "stripes" ? [9, 10, 11, 12, 13, 14, 15] : [];
      return ids.map((id) => [id, (v.shown.find((b) => b.id === id)?.down ?? -1) >= 0 ? 1 : 0]);
    });
    let result: PoolInfo["result"] = null;
    try {
      result = t?.result ? JSON.parse(t.result) : null;
    } catch {}
    let record: PoolInfo["record"] = null;
    const props = v.def.props as Record<string, unknown> | undefined;
    if (props?.record && typeof props.record === "object") record = props.record as PoolInfo["record"];
    const clock = num(t?.clock);
    const turnAt = num(t?.turnAt);
    const level = g ? (t?.seats.get(String(g.turn))?.vortex ?? "") : "";
    return {
      id,
      phase: t?.phase ?? "lobby",
      seats,
      mySeat,
      turn: g?.turn ?? 0,
      myTurn: this.myTurn(id),
      groups,
      left: [0, 1].map((k) => down[k].filter((d) => !d[1]).length) as [number, number],
      down,
      onEight: !!g && g.broken && onTheEight(g),
      called: this.called,
      inHand: g?.inHand ?? "",
      placing: this.focus === id && !!this.drag,
      rolling: this.rolling(v),
      winner: g?.winner ?? -1,
      clock,
      clockLeft:
        clock && t?.phase === "play" ? Math.max(0, clock - (Date.now() - Math.max(turnAt, num(t?.until))) / 1000) : 0,
      guide: t?.guide ?? "short",
      result,
      power: this.power,
      spinX: this.spinX,
      spinY: this.spinY,
      cam: this.cam,
      holding: this.held(),
      vortexThinking: !!level && t?.phase === "play" && !this.rolling(v),
      record,
    };
  }

  // a ball or the cue in my hand (shared/pool-throw.ts)
  private held(): "ball" | "cue" | "" {
    const me = this.host.room.state.players.get(this.host.room.sessionId);
    return /^pball:/.test(me?.held ?? "") ? "ball" : me?.gun === "cue" ? "cue" : "";
  }

  // ── the pointer (the panel's overlay hands it over) ────────────────────────
  // where the pointer is on the table, in metres (at a ball's height)
  private tablePoint(v: View, cx: number, cy: number): Pt | null {
    const ray = this.host.model.rayAt(cx, cy);
    if (!ray || ray.d.z >= -1e-6) return null;
    const t = (BALL_Z - ray.o.z) / ray.d.z;
    const wx = ray.o.x + ray.d.x * t;
    const wy = ray.o.y + ray.d.y * t;
    return toTable(v.def, wx, wy);
  }
  private cueBall(v: View): PoolBall | undefined {
    return v.game?.balls.find((b) => b.id === 0 && b.down < 0);
  }

  pointer(type: "move" | "down" | "up" | "cancel", cx: number, cy: number, o: { shift?: boolean } = {}) {
    const id = this.focus;
    const v = id ? this.views.get(id) : undefined;
    if (!id || !v || !this.myTurn(id)) {
      this.press = null;
      this.drag = null;
      this.hover = false;
      return;
    }
    const g = v.game as PoolGame;
    const cue = this.cueBall(v);
    const p = this.tablePoint(v, cx, cy);
    if (type === "cancel") {
      this.press = null;
      this.drag = null;
      this.hover = false;
      this.power = 0;
      return;
    }
    if (type === "down") {
      if (!p || !cue) return;
      if (this.hover) {
        // it follows the pointer: this click puts it down
        this.swallowUp = true;
        this.place(id, g, cue, onCloth(p));
        return;
      }
      if (g.inHand && Math.hypot(p.x - cue.x, p.y - cue.y) < BALL_R * 2.6) {
        this.drag = { x: cue.x, y: cue.y };
        return;
      }
      if (onTheEight(g)) {
        const pk = POOL_POCKETS.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.09);
        if (pk >= 0) {
          this.called = pk;
          return;
        }
      }
      this.press = { x: cx, y: cy, angle: this.angle };
      this.power = 0;
      return;
    }
    if (type === "up") {
      if (this.swallowUp) {
        this.swallowUp = false;
        return;
      }
      if (this.drag && cue) {
        // dragged and let go: down there, if it may go there (else back in my hand)
        this.hover = true;
        this.place(id, g, cue, this.drag);
        return;
      }
      if (this.press) {
        this.press = null;
        if (this.power > 0.02) this.shoot(id);
        else this.power = 0;
      }
      return;
    }
    // move
    if (!p || !cue) return;
    if (this.drag) {
      this.drag = onCloth(p);
      return;
    }
    if (this.press) {
      // pulling back: the pointer's way from the press, against the aim, on screen
      const model = this.host.model;
      const a = toWorld(v.def, cue.x, cue.y);
      const b = toWorld(v.def, cue.x + Math.cos(this.angle) * 0.2, cue.y + Math.sin(this.angle) * 0.2);
      const sa = model.worldToClient(a.x, a.y, BALL_Z);
      const sb = model.worldToClient(b.x, b.y, BALL_Z);
      const dl = Math.hypot(sb.x - sa.x, sb.y - sa.y) || 1;
      const ux = (sb.x - sa.x) / dl;
      const uy = (sb.y - sa.y) / dl;
      const pull = -((cx - this.press.x) * ux + (cy - this.press.y) * uy);
      this.power = Math.max(0, Math.min(1, pull / 240));
      return;
    }
    const want = Math.atan2(p.y - cue.y, p.x - cue.x);
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < BALL_R * 1.5) return;
    if (o.shift) {
      // fine: a tenth of the pointer's turn
      if (!this.fine) this.fine = { at: want, angle: this.angle };
      let d = want - this.fine.at;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angle = this.fine.angle + d * 0.1;
    } else {
      this.fine = null;
      this.angle = want;
    }
    this.movedAt = performance.now();
  }

  // the cue ball in my hand put down at `d` (where it may go)
  private place(id: string, g: PoolGame, cue: PoolBall, d: Pt) {
    if (!placeOk(g.balls, d.x, d.y, g.inHand === "kitchen")) {
      this.drag = d;
      if (this.now - this.warnedAt > 1500) {
        this.warnedAt = this.now;
        toast("The cue ball can't go there.", "warn");
      }
      return;
    }
    this.host.send("pool:place", { id, x: d.x, y: d.y });
    Object.assign(cue, { x: d.x, y: d.y });
    this.drag = null;
    this.hover = false;
    chalk(0.18);
  }

  private shoot(id: string) {
    const v = this.views.get(id);
    const t = this.table(id);
    if (!v?.game || !t || !this.myTurn(id)) return;
    const g = v.game;
    if (onTheEight(g) && this.called < 0) {
      toast("Call a pocket for the 8 — click it.", "warn");
      this.power = 0;
      return;
    }
    const shot: PoolShot = {
      angle: this.angle,
      power: Math.max(0.03, this.power),
      spinX: this.spinX,
      spinY: this.spinY,
    };
    this.host.send("pool:shot", { id, ...shot, called: this.called });
    // play it here at once: the same physics from the same layout the server has
    v.sim = new PoolSim(g.balls, shot);
    v.simNo = -1;
    v.pendingAt = performance.now();
    v.evSeen = 0;
    v.strike = { ...shot, seat: g.turn };
    v.strikeAt = performance.now();
    this.power = 0;
    this.called = -1;
  }

  // ── every frame ──────────────────────────────────────────────────────────
  frame(dt: number, me: Pt) {
    this.now = performance.now();
    const pk = hud.get().panel;
    const want = pk.kind === "pool" && pk.objectId && this.views.has(pk.objectId) ? pk.objectId : null;
    if (want !== this.focus) this.setFocus(want);
    if (this.chargeAt !== null) {
      if (!this.focus || !this.myTurn(this.focus)) this.chargeAt = null;
      else {
        // slow at first, so a soft touch is easy to hold; full in CHARGE_MS
        const k = Math.min(1, (this.now - this.chargeAt) / PoolTables.CHARGE_MS);
        this.power = k ** 1.35;
      }
    }
    for (const [id, v] of this.views) this.update(id, v, Math.min(0.1, dt), me);
    if (this.focus) this.mine(this.focus, me);
  }

  // The table whose console is open (the 3D view's game camera follows it); closing it
  // before a game gives the seat back.
  private setFocus(focus: string | null) {
    const was = this.focus;
    this.focus = focus;
    this.press = null;
    this.drag = null;
    this.power = 0;
    this.called = -1;
    this.walkedTo = "";
    this.handFor = -1;
    this.topSide = null;
    this.hover = false;
    this.swallowUp = false;
    if (was && !focus) {
      const t = this.table(was);
      if (t && this.mySeat(t) >= 0 && t.phase !== "play") this.leave(was);
    }
  }

  // my side of it: walking round to the shot, sending my aim
  private mine(id: string, me: Pt) {
    const v = this.views.get(id);
    const t = this.table(id);
    if (!v?.game || !t) return;
    const g = v.game;
    const cue = this.cueBall(v);
    if (!this.myTurn(id) || !cue) {
      if (this.hover) {
        this.hover = false;
        this.drag = null;
      }
      return;
    }
    const now = this.now;
    // ball in hand after a foul: it comes up into my hand at once (the break's
    // own placing, behind the line, starts with it already down)
    const no = num(t.shotNo);
    if (g.inHand && g.shots > 0 && this.handFor !== no) {
      this.handFor = no;
      this.drag = { x: cue.x, y: cue.y };
      this.hover = true;
      this.press = null;
      this.chargeAt = null;
      this.power = 0;
    }
    // stream the aim
    const aim: Record<string, unknown> = {
      id,
      a: Math.round(this.angle * 1e4) / 1e4,
      p: Math.round(this.power * 100) / 100,
      sx: Math.round(this.spinX * 100) / 100,
      sy: Math.round(this.spinY * 100) / 100,
    };
    if (this.drag) Object.assign(aim, { cx: this.drag.x, cy: this.drag.y, drag: true });
    const sig = JSON.stringify(aim);
    if (sig !== this.sentSig && now - this.sentAt > AIM_MS) {
      this.sentSig = sig;
      this.sentAt = now;
      this.host.send("pool:aim", aim);
    }
    // walk round to stand behind the shot once the aim settles (or as I pull)
    if ((now - this.movedAt > SETTLE_MS || this.press || this.chargeAt !== null) && !this.drag) {
      const at = standFor(v.def, cue.x, cue.y, this.angle, 0.38);
      const key = `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
      if (key !== this.walkedTo && Math.hypot(at.x - me.x, at.y - me.y) > 0.3) {
        this.walkedTo = key;
        this.host.walkTo(at);
      }
      const c = toWorld(v.def, cue.x, cue.y);
      this.host.face(c.x, c.y);
    }
    void g;
  }

  private update(id: string, v: View, dt: number, me: Pt) {
    const t = this.table(id);
    const now = this.now;
    // the layout at rest
    const gs: string = t?.game ?? "";
    if (gs !== v.gameSig) {
      v.gameSig = gs;
      v.game = unpackGame(gs);
      v.dirty = true;
    }
    // a new shot: play it (mine is already playing)
    const no = num(t?.shotNo);
    if (no !== v.seenNo) {
      if (v.born && t?.shot && t?.before) {
        let shot: (PoolShot & { seat: number; called: number }) | null = null;
        try {
          shot = JSON.parse(t.shot);
        } catch {}
        if (shot) {
          const mine =
            v.sim &&
            v.simNo === -1 &&
            v.strike &&
            Math.abs(v.strike.angle - shot.angle) < 1e-9 &&
            v.strike.power === shot.power;
          if (mine) v.simNo = no;
          else {
            v.sim = new PoolSim(unpackBalls(JSON.parse(t.before)), shot);
            v.simNo = no;
            v.evSeen = 0;
            v.strike = shot;
            v.strikeAt = now;
          }
        }
      }
      v.seenNo = no;
    }
    v.born = true;
    // my shot never confirmed (refused): back to the layout
    if (v.sim && v.simNo === -1 && now - v.pendingAt > 2500) v.sim = null;

    const dist = tableAway(v.def, me.x, me.y);
    const heard = Math.max(0, 1 - dist / HEAR);
    const pan = this.panOf(v, me);
    if (v.sim) {
      for (const b of v.shown) if (b.down < 0) v.last.set(b.id, { x: b.x, y: b.y });
      v.sim.step(dt);
      for (; v.evSeen < v.sim.events.length; v.evSeen++) {
        const e = v.sim.events[v.evSeen];
        const gain = heard * 0.9;
        if (e.k === "cue" || e.k === "miscue") cueTip(e.speed, gain, pan, e.k === "miscue");
        else if (e.k === "ball") clack(e.speed, gain, pan);
        else if (e.k === "rail" || e.k === "jaw") cushion(e.speed, gain * 0.8, pan);
        else if (e.k === "pocket") {
          pocketDrop(e.speed, gain, pan);
          const pk = POOL_POCKETS[e.b ?? 0];
          v.drops.set(e.a, { pocket: e.b ?? 0, at: now, from: v.last.get(e.a) ?? pk, speed: e.speed });
        }
      }
      v.shown = v.sim.balls;
      if (v.sim.done && v.simNo !== -1) {
        v.sim = null;
        v.dirty = true;
      }
    }
    if (!v.sim) {
      // (out of a game, balls taken off the table aren't on it: tables/pballs.ts has them)
      v.shown = (v.game?.balls ?? []).filter((b) => b.down !== OFF_TABLE);
      // the cue ball in someone's hand, where they hold it
      const aim = this.aimOf(t);
      const mineNow = this.focus === id && this.drag;
      const cue = v.shown.find((b) => b.id === 0);
      if (cue && mineNow && this.drag)
        v.shown = v.shown.map((b) => (b.id === 0 ? { ...b, x: this.drag?.x ?? b.x, y: this.drag?.y ?? b.y } : b));
      else if (cue && aim?.drag && aim.cx != null && aim.cy != null && this.mySeat(t) !== v.game?.turn)
        v.shown = v.shown.map((b) => (b.id === 0 ? { ...b, x: aim.cx as number, y: aim.cy as number } : b));
    }
  }

  private aimOf(
    t: S | undefined,
  ): { a: number; p: number; sx: number; sy: number; cx?: number; cy?: number; drag?: boolean } | null {
    if (!t?.aim) return null;
    try {
      return JSON.parse(t.aim);
    } catch {
      return null;
    }
  }

  private panOf(v: View, me: Pt) {
    const c = tableCentre(v.def);
    const a = toScreen(c.x, c.y);
    const b = toScreen(me.x, me.y);
    return Math.max(-0.8, Math.min(0.8, (a.x - b.x) / 300));
  }

  // where the cue ball was hit from (the replay's start)
  private strikeFrom(v: View): Pt | null {
    if (!v.sim) return null;
    const t = this.table(v.def.id);
    if (v.simNo === -1) return v.game?.balls.find((b) => b.id === 0) ?? null;
    try {
      const before = unpackBalls(JSON.parse(t?.before ?? "[]"));
      return before.find((b) => b.id === 0) ?? null;
    } catch {
      return null;
    }
  }

  private cuePoints(cx: number, cy: number, a: number, pull: number, sx: number, sy: number) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const gap = 0.012 + Math.max(-0.08, pull) * 0.24;
    // the tip where it hits the ball: across by the side spin, up by the top/draw
    const ex = dy;
    const ey = -dx;
    const ox = sx * 0.5 * BALL_R;
    const tipX = cx - dx * (BALL_R + gap) + ex * ox;
    const tipY = cy - dy * (BALL_R + gap) + ey * ox;
    const tipZ = BALL_R + sy * 0.5 * BALL_R;
    const elev = 0.11; // the butt raised (radians)
    const buttX = tipX - dx * CUE_LEN * Math.cos(elev);
    const buttY = tipY - dy * CUE_LEN * Math.cos(elev);
    const buttZ = tipZ + CUE_LEN * Math.sin(elev);
    return { tip: [tipX, tipY, tipZ] as const, butt: [buttX, buttY, buttZ] as const };
  }

  // the seated players who aren't shooting hold their cues upright
  private waitingSpots(v: View, t: S | undefined): { seat: number; x: number; y: number }[] {
    const out: { seat: number; x: number; y: number }[] = [];
    const g = v.game;
    if (!t || t.phase === "lobby") return out;
    for (const [k, s] of t.seats as Map<string, S>) {
      const seat = Number(k);
      if (g && g.turn === seat && t.phase === "play") continue;
      if (s.vortex) {
        const w = this.vortexSpot(v, t, seat);
        out.push({ seat, ...w });
        continue;
      }
      const p = this.host.room.state.players.get(s.sid);
      if (p) out.push({ seat, x: p.x, y: p.y });
    }
    return out;
  }
  // where Vortex stands: behind his shot when it's his turn (once he's drawing
  // the cue back; while he thinks, behind the cue ball looking down the table),
  // else at the foot end
  private vortexSpot(v: View, t: S, seat: number): Pt & { d: number } {
    const g = v.game;
    const aim = this.aimOf(t);
    if (g && g.turn === seat && t.phase === "play") {
      const cue = v.shown.find((b) => b.id === 0 && b.down < 0) ?? g.balls.find((b) => b.id === 0);
      if (cue) {
        const a = aim && aim.p > 0 ? aim.a : Math.atan2(-cue.y, -cue.x);
        const at = standFor(v.def, cue.x, cue.y, a, 0.4);
        const c = toWorld(v.def, cue.x, cue.y);
        return { ...at, d: Math.atan2(c.y - at.y, c.x - at.x) };
      }
    }
    const at = standFor(v.def, G.len / 2, seat ? 0.25 : -0.25, Math.PI, 0.5);
    const c = tableCentre(v.def);
    return { ...at, d: Math.atan2(c.y - at.y, c.x - at.x) };
  }

  // The way round a table: its footprint grown by `gap`, as a loop (world
  // tiles) — Vortex goes round it, never across.
  private loop(def: WorldObjectDef, gap = 0.4) {
    const rot = def.rot ?? 0;
    const [w, h] = rot % 2 ? [G.h, G.w] : [G.w, G.h];
    const x0 = def.x - gap;
    const y0 = def.y - gap;
    const x1 = def.x + w + gap;
    const y1 = def.y + h + gap;
    const W = x1 - x0;
    const H = y1 - y0;
    const P = 2 * (W + H);
    const sOf = (p: Pt): number => {
      const cx = Math.max(x0, Math.min(x1, p.x));
      const cy = Math.max(y0, Math.min(y1, p.y));
      const d = [Math.abs(cy - y0), Math.abs(cx - x1), Math.abs(cy - y1), Math.abs(cx - x0)];
      const e = d.indexOf(Math.min(...d));
      return e === 0 ? cx - x0 : e === 1 ? W + (cy - y0) : e === 2 ? W + H + (x1 - cx) : 2 * W + H + (y1 - cy);
    };
    const at = (s: number): Pt => {
      let k = ((s % P) + P) % P;
      if (k < W) return { x: x0 + k, y: y0 };
      k -= W;
      if (k < H) return { x: x1, y: y0 + k };
      k -= H;
      if (k < W) return { x: x1 - k, y: y1 };
      k -= W;
      return { x: x0, y: y1 - k };
    };
    return { P, sOf, at };
  }

  // Vortexes at tables (each game its own): for the controller to draw like people.
  private vortexAt = new Map<string, { s: number; t: number }>();
  vortexes(): { key: string; x: number; y: number; angle: number; mood: string }[] {
    const out: { key: string; x: number; y: number; angle: number; mood: string }[] = [];
    for (const [id, v] of this.views) {
      const t = this.table(id);
      if (!t) continue;
      for (const [k, s] of t.seats as Map<string, S>) {
        if (!s.vortex) continue;
        const key = `pool:${id}:${k}`;
        const want = this.vortexSpot(v, t, Number(k));
        // he floats round the table to it (never across), ~2.4 tiles a second
        const lp = this.loop(v.def);
        const goal = lp.sOf(want);
        const was = this.vortexAt.get(key);
        let along = was ? was.s : goal;
        let d = goal - along;
        d -= Math.round(d / lp.P) * lp.P;
        const step = 2.4 * Math.min(0.1, (this.now - (was?.t ?? this.now)) / 1000);
        along += Math.sign(d) * Math.min(Math.abs(d), step);
        this.vortexAt.set(key, { s: along, t: this.now });
        const at = Math.abs(d) <= step ? want : lp.at(along);
        const r = this.resultOf(t);
        const g = v.game;
        const mood =
          g && g.winner >= 0
            ? g.winner === Number(k)
              ? "smug"
              : "crying"
            : r && r.seat === Number(k) && r.foul
              ? "seething"
              : g && g.turn === Number(k)
                ? "judging"
                : r && r.seat !== Number(k) && r.foul
                  ? "happy"
                  : "curious";
        out.push({ key, x: at.x, y: at.y, angle: want.d, mood });
      }
    }
    for (const key of [...this.vortexAt.keys()]) if (!out.some((o) => o.key === key)) this.vortexAt.delete(key);
    return out;
  }
  private resultOf(t: S): PoolInfo["result"] {
    try {
      return t.result ? JSON.parse(t.result) : null;
    } catch {
      return null;
    }
  }

  // ── 3D ───────────────────────────────────────────────────────────────────
  scene3d(into: TableScene3) {
    const zt = (px: number) => px / ZPX;
    for (const [id, v] of this.views) {
      const o = v.def;
      const rot = o.rot ?? 0;
      const t = this.table(id);
      let trayI = 0;
      for (const b of v.shown) {
        const drop = b.down >= 0 ? v.drops.get(b.id) : undefined;
        const f = drop ? dropAt(drop, this.now) : null;
        let wx: number;
        let wy: number;
        let z = BALL_Z;
        const alpha = 1;
        if (b.down >= 0 && (!f || f.done)) {
          const [tx, ty] = tableTurn(G.w - 0.13, 0.66 + trayI++ * (2 * R_T + 0.004), rot, G.w, G.h);
          wx = o.x + tx;
          wy = o.y + ty;
          z = 19.4 + R_T * ZPX;
        } else if (f && drop) {
          // into the pocket: over the lip and down the hole (the 3D table's are real holes)
          ({ x: wx, y: wy } = toWorld(o, f.x, f.y));
          z = BALL_Z - f.sink * G.tpm * ZPX;
          if (f.flash >= 0) {
            const pk = POOL_POCKETS[drop.pocket];
            const w = toWorld(o, pk.x, pk.y);
            into.rings.push({
              key: `${id}:flash${b.id}`,
              x: w.x,
              y: w.y,
              z: zt(CLOTH_Z) + 0.006,
              r: holeR(pk.side) * G.tpm * (1.05 + 0.9 * f.flash),
              color: flashColor(b.id),
              alpha: 0.95 * (1 - f.flash),
            });
          }
        } else ({ x: wx, y: wy } = toWorld(o, b.x, b.y));
        into.balls.push({
          key: `${id}:${b.id}`,
          id: b.id,
          x: wx,
          y: wy,
          z: zt(z),
          r: R_T,
          q: ballQuat(b.q as Q, rot),
          alpha,
        });
      }
      const g = v.game;
      const cueBall = v.shown.find((b) => b.id === 0 && b.down < 0);
      const aim = this.aimOf(t);
      const mine = this.focus === id && g && this.mySeat(t) === g.turn;
      if (t?.phase === "play" && g && cueBall) {
        let a: number | null = null;
        let pull = 0;
        let sx = 0;
        let sy = 0;
        let from: Pt = cueBall;
        if (v.sim && v.strike && this.now - v.strikeAt < 260) {
          a = v.strike.angle;
          pull = -0.06 * Math.min(1, ((this.now - v.strikeAt) / 260) * 4);
          sx = v.strike.spinX;
          sy = v.strike.spinY;
          from = this.strikeFrom(v) ?? cueBall;
        } else if (!v.sim && mine && !this.drag) {
          a = this.angle;
          pull = this.power;
          sx = this.spinX;
          sy = this.spinY;
        } else if (!v.sim && aim && !aim.drag) {
          a = aim.a;
          pull = aim.p;
          sx = aim.sx;
          sy = aim.sy;
        }
        if (a != null) {
          const { tip, butt } = this.cuePoints(from.x, from.y, a, pull, sx, sy);
          const A = toWorld(o, tip[0], tip[1]);
          const B = toWorld(o, butt[0], butt[1]);
          into.cues.push({
            key: `${id}:shot`,
            tip: [A.x, A.y, zt(tablePx(K, tip[2]))],
            butt: [B.x, B.y, zt(tablePx(K, butt[2]))],
          });
        }
        if (mine && !v.sim && !this.drag && t.guide !== "pro") {
          const gd = aimGuide(g.balls, this.angle);
          const z = zt(BALL_Z);
          const W = (mx: number, my: number): [number, number, number] => {
            const w = toWorld(o, mx, my);
            return [w.x, w.y, z];
          };
          if (gd.dist) {
            into.lines.push({
              key: `${id}:g0`,
              pts: [W(cueBall.x, cueBall.y), W(gd.gx, gd.gy)],
              color: 0xf4ecd8,
              alpha: 0.8,
            });
            const gw = toWorld(o, gd.gx, gd.gy);
            into.rings.push({ key: `${id}:ghost`, x: gw.x, y: gw.y, z, r: R_T, color: 0xf4ecd8, alpha: 0.9 });
            if (gd.hit >= 0) {
              const ob = g.balls.find((b) => b.id === gd.hit) as PoolBall;
              const L = t.guide === "long" ? 0.7 : 0.22;
              into.lines.push({
                key: `${id}:g1`,
                pts: [W(ob.x, ob.y), W(ob.x + gd.ox * L, ob.y + gd.oy * L)],
                color: 0xf4ecd8,
                alpha: 0.85,
              });
              const Lc = t.guide === "long" ? 0.3 : 0.1;
              if (gd.cx || gd.cy)
                into.lines.push({
                  key: `${id}:g2`,
                  pts: [W(gd.gx, gd.gy), W(gd.gx + gd.cx * Lc, gd.gy + gd.cy * Lc)],
                  color: 0xbfd4ff,
                  alpha: 0.7,
                });
            }
          }
        }
        if (mine && !v.sim && onTheEight(g))
          POOL_POCKETS.forEach((pk, i) => {
            const w = toWorld(o, pk.x, pk.y);
            into.rings.push({
              key: `${id}:pk${i}`,
              x: w.x,
              y: w.y,
              z: zt(CLOTH_Z + 0.4),
              r: R_T * 2.4,
              color: this.called === i ? 0xffa630 : 0xf4ecd8,
              alpha: this.called === i ? 0.95 : 0.5,
            });
          });
        if (mine && !v.sim && g.inHand) {
          const c = this.drag ?? cueBall;
          const w = toWorld(o, c.x, c.y);
          const ok = !this.drag || placeOk(g.balls, c.x, c.y, g.inHand === "kitchen");
          const pulse = this.drag ? 0.5 + 0.5 * Math.sin(this.now / 160) : 0;
          into.rings.push({
            key: `${id}:hand`,
            x: w.x,
            y: w.y,
            z: zt(CLOTH_Z + 0.3),
            r: R_T * (2.3 + pulse * 0.35),
            color: ok ? 0xf4ecd8 : 0xd8553a,
            alpha: 0.8,
          });
        }
      }
      // waiting players' cues, standing
      for (const w of this.waitingSpots(v, t))
        into.cues.push({
          key: `${id}:wait${w.seat}`,
          tip: [w.x + 0.2, w.y + 0.14, 1.85],
          butt: [w.x + 0.16, w.y + 0.1, 0.02],
        });
      const c = tableCentre(o);
      into.lamps.push({
        key: id,
        x: c.x,
        y: c.y,
        z: zt(CLOTH_Z) + 1.25,
        along: tableHeading(0, rot),
        len: 1.35 * G.tpm,
        ghost: this.focus === id && this.cam === "top" ? 1 : 0,
      });
    }
  }

  // The game camera (3D): over the table, or down the cue.
  private topSide: { id: string; side: number } | null = null;
  gameCam(): { eye: [number, number, number]; look: [number, number, number] } | null {
    const v = this.focus ? this.views.get(this.focus) : undefined;
    if (!v) return null;
    const o = v.def;
    const c = tableCentre(o);
    const zTop = G.top / ZPX;
    const cue = v.shown.find((b) => b.id === 0 && b.down < 0);
    const t = this.table(o.id);
    const g = v.game;
    const aiming = this.cam === "cue" && cue && t?.phase === "play" && !v.sim;
    if (aiming && cue) {
      const mine = g && this.mySeat(t) === g.turn;
      const a = mine ? this.angle : (this.aimOf(t)?.a ?? this.angle);
      const w = toWorld(o, cue.x, cue.y);
      const h = tableHeading(a, o.rot ?? 0);
      const dx = Math.cos(h);
      const dy = Math.sin(h);
      return { eye: [w.x - dx * 1.25, w.y - dy * 1.25, zTop + 0.62], look: [w.x + dx * 1.1, w.y + dy * 1.1, zTop] };
    }
    // over the table, the long side across the picture; from the side I was on
    // when I came to it — picked once: I walk round the table to every shot,
    // and following me there turned the whole picture round
    const h = tableHeading(0, o.rot ?? 0);
    const px = -Math.sin(h);
    const py = Math.cos(h);
    if (this.topSide?.id !== o.id) {
      const me = this.host.room.state.players.get(this.host.room.sessionId);
      this.topSide = { id: o.id, side: me && (me.x - c.x) * px + (me.y - c.y) * py < 0 ? -1 : 1 };
    }
    const side = this.topSide.side;
    return {
      eye: [c.x + px * side * 1.05, c.y + py * side * 1.05, zTop + 3.6],
      look: [c.x + px * side * 0.12, c.y + py * side * 0.12, zTop],
    };
  }

  // for the busy pose: at a table with a seat, playing
  atTable(): boolean {
    const t = this.focus ? this.table(this.focus) : undefined;
    return !!t && this.mySeat(t) >= 0;
  }
  tableAngle(id: string, h: number) {
    const v = this.views.get(id);
    return v ? tableAngle(h, v.def.rot ?? 0) : h;
  }

  dispose() {
    this.setFocus(null);
    for (const id of [...this.views.keys()]) this.drop(id);
  }
}
