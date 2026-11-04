import {
  ANIM,
  FAM_CHAIRS as CHAIRS,
  FAM_COMMANDERS as COMMANDERS,
  chairAt,
  entry,
  type Grid,
  type WorldObjectDef,
} from "@yutopia/shared";
import { legalMoves, outcome, parseFen, START, sqName } from "@yutopia/shared/games68/chess";
import { isChessLevel } from "@yutopia/shared/games68/engine";
import { replay } from "@yutopia/shared/games68/san";
import { Matrix4, Vector3 } from "three";
import { BOARDS, type Board, type ChessMen3, squareOn } from "../furn/chessmen3d";
import { hud } from "../store";
import { type ChessSound, chessSound } from "./sound";

// Chess at the table, played on the board itself (docs/plan/70-the-chess.md, phases 2–7): its own lazy
// chunk, loaded once a floor has a chess table.
//
// - Sat in one of its chairs, you play that side (the server keeps who: `chess:sit`); getting up gives
//   it back. Both taken: you watch, from beside the table.
// - The camera leans in behind your men at their height (the lean-in view); the wheel steps out (a
//   notch, the chair's view, over the top) and back; right-drag turns a little round the board; C jumps
//   between lean-in and over the top. A capture cuts close to the fight, a mate to the dropped crown.
// - The pointer's on the board (the HUD strip's overlay hands it over): a man of yours picked, its
//   squares glow, what it can take flinches; a square picked sends it there. The keys too: arrows move a
//   cursor over the squares, E / Enter / Space pick and send, Esc lets go, Q gets up.
// - The men themselves (instanced at rest, rigs when they do something) are the floor's, in
//   furn/chessmen3d.ts; this shows on them what you're doing (setUi, setFocus).

export const CHESS_CHUNK = "yutopia-chess";

// biome-ignore lint/suspicious/noExplicitAny: colyseus schema instances
type S = any;
type Pt = { x: number; y: number };
export interface ChessHost {
  model: {
    getObject(id: string): WorldObjectDef | undefined;
    allObjects(): WorldObjectDef[];
    rayAt(
      cx: number,
      cy: number,
    ): { o: { x: number; y: number; z: number }; d: { x: number; y: number; z: number } } | null;
  };
  room: { state: S; sessionId: string };
  send(type: string, msg: Record<string, unknown>): void;
  me(): { x: number; y: number; a: number; level?: number };
  grid(): Grid;
  walkTo(p: Pt): void;
  /** the floor's living men (the 3D view's), if it's drawn */
  men(): ChessMen3 | null;
  openPanel(kind: string, id: string): void;
  closePanel(kind: string): void;
  /** (phase 9) the physics world and my floor's origin in it: a life-size board's men are bodies */
  physics(): {
    world: { setVehicle(id: string, box: never): boolean; removeVehicle(id: string): void };
    origin(): { x: number; y: number; z: number };
  } | null;
  /** put me right here (no path): a stand-in carried with his man */
  stand(x: number, y: number): void;
}

/** What the HUD strip shows (hud.chess). */
export interface ChessHud {
  id: string;
  /** the side I'm playing, or null watching */
  side: "w" | "b" | null;
  names: { w: string; b: string };
  /** Vortex's level on a side he plays, or "" */
  vortex: { w: string; b: string };
  turn: "w" | "b";
  myTurn: boolean;
  /** play, check, mate, stalemate, fifty, material, resign, agreed */
  state: string;
  loser: "w" | "b" | null;
  offer: "w" | "b" | null;
  /** the game's moves so far, named (the last few shown) */
  moves: string[];
  picked: string | null;
  /** a pawn reaching the far rank: which man it becomes is asked */
  promo: boolean;
  view: View;
  /** the other chair's empty: Vortex can be asked to play */
  canVortex: boolean;
}

type View = "lean" | "notch" | "chair" | "top";
const VIEWS: View[] = ["lean", "notch", "chair", "top"];
/** The views behind white's men, in the table's model frame (m; x toward black, y up, z across): the
 *  eye, the point looked at, the lens. Black's are turned half round the board's middle. */
const EYE: Record<View, { eye: [number, number, number]; look: [number, number, number]; fov: number }> = {
  lean: { eye: [0.54, 0.935, 0.5], look: [1.08, 0.735, 0.5], fov: 54 },
  notch: { eye: [0.5, 1.02, 0.52], look: [1.06, 0.73, 0.5], fov: 46 },
  chair: { eye: [0.44, 1.24, 0.6], look: [1.06, 0.72, 0.5], fov: 43 },
  top: { eye: [0.86, 1.6, 0.5], look: [1.0, 0.72, 0.5], fov: 38 },
};
/** A watcher's: from beside the table, its near side. */
type Cam = { eye: [number, number, number]; look: [number, number, number]; fov: number };
const WATCH: Record<string, Cam> = {
  chess_table: { eye: [1.0, 1.28, 1.5], look: [1.0, 0.74, 0.5], fov: 40 },
  wizard_chess: { eye: [5, 4.6, 13.2], look: [5, 0.4, 5], fov: 50 },
};
/** (phase 9) The life-size board's: a commander's on the dais, high behind his men. */
const EYE_BIG: Record<View, Cam> = {
  lean: { eye: [-1.3, 2.9, 5], look: [3.6, 0.6, 5], fov: 58 },
  notch: { eye: [-2.2, 4.0, 5], look: [3.8, 0.4, 5], fov: 54 },
  chair: { eye: [-3.2, 5.6, 5], look: [4.2, 0, 5], fov: 50 },
  top: { eye: [3.8, 13, 5], look: [5, 0, 5], fov: 48 },
};
const MID: Record<string, [number, number]> = { chess_table: [1.0, 0.5], wizard_chess: [5, 5] };
const midOf = (kind: string) => MID[kind] ?? [1.0, 0.5];
/** Cutting close to a capture, a mate's crown: on unless turned off (the strip's setting). */
const CUTS_KEY = "yutopia.chessCuts";

const safe = (fen: unknown) => {
  try {
    return parseFen(typeof fen === "string" ? fen : START);
  } catch {
    return parseFen(START);
  }
};

export class ChessPlay {
  readonly chunk = CHESS_CHUNK;
  /** the table I'm sat at (playing) or watching */
  private at: { id: string; side: "w" | "b" | null } | null = null;
  private sentSide: { id: string; side: "w" | "b" } | null = null;
  private picked: number | null = null;
  private hover: number | null = null;
  private cursor = 52; // (e2: the keys' cursor, before the pointer's moved)
  private promoTo: { from: number; to: number } | null = null;
  private view: View = "lean";
  private orbit = 0;
  private hudSig = "";
  private uiSig = "";
  cuts = true;

  constructor(private readonly host: ChessHost) {
    try {
      this.cuts = localStorage.getItem(CUTS_KEY) !== "0";
    } catch {
      // (no storage: on)
    }
  }

  // ── sitting, watching, getting up ─────────────────────────────────────────────────────────────
  /** Use a chess table (E, a click): to a free chair, sat in it; both taken: watch. */
  use(id: string): void {
    const o = this.host.model.getObject(id);
    if (!o || !BOARDS[o.kind]) return;
    if (this.at?.id === id) return;
    const me = this.host.me();
    const props = o.props ?? {};
    // (phase 9: on a life-size board's squares, not commanding — stand in for the man here, or step out)
    if (COMMANDERS[o.kind]) {
      const mineIn = this.myStandIn(o);
      if (mineIn !== null) {
        this.host.send("chess:standin", { id, sq: null });
        return;
      }
      const sq = this.squareUnder(o, me.x, me.y);
      if (sq !== null && safe(props.fen).board[sq]) {
        this.host.send("chess:standin", { id, sq });
        return;
      }
    }
    const myUid = this.myUid();
    const free = (side: "w" | "b") => !props[side] || props[side] === myUid || this.away(Number(props[side]), o);
    const chairs = (CHAIRS[o.kind] ?? []).map((c, i) => ({
      side: (i === 0 ? "w" : "b") as "w" | "b",
      at: chairAt(o, c),
    }));
    const open = chairs
      .filter((c) => free(c.side) && !(props.vx && c.side === props.vxSide))
      .sort((a, b) => Math.hypot(a.at.x - me.x, a.at.y - me.y) - Math.hypot(b.at.x - me.x, b.at.y - me.y));
    if (open.length) {
      this.host.walkTo({ x: open[0].at.x, y: open[0].at.y });
      return;
    }
    // (both taken: watch, from beside it)
    this.at = { id, side: null };
    this.host.openPanel("chess", id);
    this.host.men()?.setFocus(id);
    this.publish();
  }
  /** Get up from the chair (Q, the strip's button, Esc with nothing picked), or stop watching. */
  standUp(): void {
    const at = this.at;
    if (!at) return;
    if (at.side) {
      const o = this.host.model.getObject(at.id);
      const me = this.host.me();
      // (a step back from the chair, away from the board)
      const g = this.host.grid();
      const spot = o ? this.chairOf(o, at.side) : null;
      const away = spot ? { x: me.x + (me.x - spot.mid.x) * 0.9, y: me.y + (me.y - spot.mid.y) * 0.9 } : me;
      const p = g.nearestOpen(away.x, away.y, 3);
      if (p) this.host.walkTo({ x: p.x + 0.5, y: p.y + 0.5 });
    }
    this.leave();
  }
  private leave() {
    const at = this.at;
    this.at = null;
    this.picked = null;
    this.hover = null;
    this.promoTo = null;
    if (at) {
      this.host.men()?.setUi(at.id, null);
      this.host.closePanel("chess");
    }
    this.host.men()?.setFocus(null);
    this.giveBack();
    this.publish();
  }
  private giveBack() {
    if (!this.sentSide) return;
    this.host.send("chess:sit", { id: this.sentSide.id, side: null });
    this.sentSide = null;
  }
  private myUid(): number {
    return Number(this.host.room.state.players.get(this.host.room.sessionId)?.uid ?? -1);
  }
  /** Someone holding a side who's walked off (the server frees it then too). */
  private away(uid: number, o: WorldObjectDef): boolean {
    let p: S = null;
    this.host.room.state.players.forEach((q: S) => {
      if (q.uid === uid) p = q;
    });
    if (!p) return true;
    const { w, h } = { w: entry(o.kind).w, h: entry(o.kind).h };
    return Math.hypot(p.x - (o.x + w / 2), p.y - (o.y + h / 2)) > 3.5;
  }
  /** A side's place at a board: its chair (a table), its commander's dais (life-size); and the
   *  board's middle (tiles). */
  private chairOf(o: WorldObjectDef, side: "w" | "b") {
    const c = (CHAIRS[o.kind] ?? COMMANDERS[o.kind] ?? [])[side === "w" ? 0 : 1];
    if (!c) return null;
    const at = chairAt(o, c);
    const [mu, mv] = midOf(o.kind);
    const mid = chairAt(o, { u: mu, v: mv, face: 0 });
    return { at, mid };
  }
  /** (phase 9) The square of a life-size board I stand on, or null. */
  private squareUnder(o: WorldObjectDef, x: number, y: number): number | null {
    const f = this.host.men()?.frameOf(o.id);
    if (!f) return null;
    const local = new Vector3(x, f.b.top, y).applyMatrix4(new Matrix4().copy(f.place).invert());
    const r = Math.floor((local.x - f.b.x0) / f.b.sq);
    const file = Math.floor((local.z - f.b.z0) / f.b.sq);
    return r < 0 || r > 7 || file < 0 || file > 7 ? null : (7 - r) * 8 + file;
  }
  /** (phase 9) The square I stand in for at a board, if I do. */
  private myStandIn(o: WorldObjectDef): number | null {
    const si = o.props?.si as Record<string, number> | undefined;
    const uid = this.myUid();
    for (const [k, v] of Object.entries(si ?? {})) if (v === uid) return Number(k);
    return null;
  }

  /** Each frame: am I sat in a chess chair (playing it), still watching; the HUD strip. */
  frame(): void {
    const me = this.host.me();
    // (the men's sounds, heard from where their table is: plan 70 phase 6)
    const men = this.host.men();
    if (men && !men.onSound)
      men.onSound = (kind, x, z, o) => {
        const m = this.host.me();
        const d = Math.hypot(x - m.x, z - m.y);
        const gain = Math.max(0, 1 - d / 12) ** 1.5 * 0.9;
        chessSound(kind as ChessSound, gain, 0, o);
      };
    const g = this.host.grid();
    const seat = me.a === ANIM.sit ? g.seatAt(me.x, me.y) : undefined;
    let sat: { id: string; side: "w" | "b" } | null = null;
    if (seat && BOARDS[seat.kind]) {
      const o = this.host.model.getObject(seat.id);
      if (o) {
        const w = this.chairOf(o, "w");
        const b = this.chairOf(o, "b");
        if (w && b) {
          const dw = Math.hypot(w.at.x - me.x, w.at.y - me.y);
          const db = Math.hypot(b.at.x - me.x, b.at.y - me.y);
          sat = { id: o.id, side: dw <= db ? "w" : "b" };
        }
      }
    }
    // (phase 9: a commander stands on his dais — the side's his while he's there)
    if (!sat && me.a !== ANIM.walk)
      for (const o of this.host.model.allObjects()) {
        if (!COMMANDERS[o.kind]) continue;
        for (const side of ["w", "b"] as const) {
          const c = this.chairOf(o, side);
          const keep = this.at?.id === o.id && this.at.side === side ? 1.0 : 0.6;
          if (c && Math.hypot(c.at.x - me.x, c.at.y - me.y) < keep) sat = { id: o.id, side };
        }
      }
    if (!sat && this.at?.side) {
      const o = this.table();
      const c = o && COMMANDERS[o.kind] ? this.chairOf(o, this.at.side) : null;
      if (c && Math.hypot(c.at.x - me.x, c.at.y - me.y) < 1.0) sat = { id: this.at.id, side: this.at.side };
    }
    this.lifeSize(me);
    if (sat) {
      if (this.at?.id !== sat.id || this.at.side !== sat.side) {
        if (this.at) this.leave();
        this.at = { ...sat };
        this.view = "lean";
        this.orbit = 0;
        this.host.openPanel("chess", sat.id);
        this.host.men()?.setFocus(sat.id);
      }
      if (this.sentSide?.id !== sat.id || this.sentSide.side !== sat.side) {
        this.giveBack();
        this.host.send("chess:sit", { id: sat.id, side: sat.side });
        this.sentSide = { ...sat };
      }
    } else if (this.at?.side) {
      // (up from the chair: the side given back)
      this.leave();
    } else if (this.at && !this.at.side) {
      // (watching: until I walk off)
      const o = this.host.model.getObject(this.at.id);
      if (!o || Math.hypot(o.x + 1 - me.x, o.y + 0.5 - me.y) > 4) this.leave();
    }
    if (this.at) {
      // (the strip closed some other way — the HUD's Esc, another panel opened: up from the table)
      const panel = hud.get().panel;
      if (panel.kind !== "chess" || panel.objectId !== this.at.id) {
        this.standUp();
        return;
      }
      this.host.men()?.setFocus(this.at.id);
      this.showUi();
    }
    this.publish();
  }

  // ── the life-size board (phase 9): its men as bodies, a stand-in carried ───────────────────────
  private bodies = new Set<string>();
  private bodySig = new Map<string, string>();
  private leftAt = 0;
  private lifeSize(me: { x: number; y: number }) {
    const men = this.host.men();
    const ph = this.host.physics();
    const seen = new Set<string>();
    for (const o of this.host.model.allObjects()) {
      if (!COMMANDERS[o.kind] || !men) continue;
      // (the men solid at a person's size, where they are now: kinematic boxes, as parked cars are)
      if (ph) {
        const org = ph.origin();
        for (const s of men.solids(o.id)) {
          const key = `chess:${o.id}:${s.key}`;
          seen.add(key);
          // (moved only when it's moved)
          const sig = `${s.x.toFixed(3)},${s.z.toFixed(3)},${s.y.toFixed(3)}`;
          if (this.bodySig.get(key) === sig) continue;
          this.bodySig.set(key, sig);
          ph.world.setVehicle(key, {
            t: "box",
            x: s.x + org.x,
            y: s.y + s.h / 2 + org.y,
            z: s.z + org.z,
            hx: s.r,
            hy: s.h / 2,
            hz: s.r,
            a: 0,
          } as never);
        }
      }
      // a stand-in: carried along with his man; stepped off his square a while, he's out
      const mine = this.myStandIn(o);
      if (mine === null) continue;
      const c = men.carried(o.id, mine);
      if (c) {
        this.host.stand(c.x, c.z);
        continue;
      }
      const under = this.squareUnder(o, me.x, me.y);
      if (under === mine) this.leftAt = 0;
      else if (!this.leftAt) this.leftAt = performance.now();
      if (this.leftAt && performance.now() - this.leftAt > 1200) {
        this.leftAt = 0;
        this.host.send("chess:standin", { id: o.id, sq: null });
      }
    }
    if (ph)
      for (const k of this.bodies)
        if (!seen.has(k)) {
          ph.world.removeVehicle(k);
          this.bodySig.delete(k);
        }
    this.bodies = seen;
  }

  // ── the game as it stands ─────────────────────────────────────────────────────────────────────
  private table(): WorldObjectDef | null {
    return this.at ? (this.host.model.getObject(this.at.id) ?? null) : null;
  }
  private myTurn(): boolean {
    const o = this.table();
    if (!o || !this.at?.side || o.props?.over) return false;
    const pos = safe(o.props?.fen);
    const end = outcome(pos);
    return pos.turn === this.at.side && (end === "play" || end === "check") && o.props?.[this.at.side] === this.myUid();
  }
  private movesFrom(sq: number): number[] {
    const o = this.table();
    if (!o) return [];
    return legalMoves(safe(o.props?.fen))
      .filter((m) => m.from === sq)
      .map((m) => m.to);
  }

  private showUi() {
    const o = this.table();
    if (!o || !this.at) return;
    const board = safe(o.props?.fen).board;
    const moves = this.picked != null ? [...new Set(this.movesFrom(this.picked))] : [];
    const ui = {
      picked: this.picked,
      moves: moves.filter((s) => !board[s]),
      takes: moves.filter((s) => !!board[s]),
      hover: this.at.side ? this.hover : null,
    };
    const sig = JSON.stringify([this.at.id, ui]);
    if (sig === this.uiSig) return;
    this.uiSig = sig;
    this.host.men()?.setUi(this.at.id, ui);
  }

  private publish() {
    const o = this.table();
    const at = this.at;
    if (!o || !at) {
      if (this.hudSig !== "") {
        this.hudSig = "";
        hud.set({ chess: null } as never);
      }
      return;
    }
    const p = o.props ?? {};
    const pos = safe(p.fen);
    const end = outcome(pos);
    const over = String(p.over ?? "");
    const state = over === "resign" || over === "agreed" ? over : end;
    const vx = String(p.vx ?? "");
    const vxSide = p.vxSide === "w" || p.vxSide === "b" ? p.vxSide : null;
    const other = at.side === "w" ? "b" : "w";
    const info: ChessHud = {
      id: at.id,
      side: at.side,
      names: { w: String(p.wn ?? ""), b: String(p.bn ?? "") },
      vortex: { w: vxSide === "w" ? vx : "", b: vxSide === "b" ? vx : "" },
      turn: pos.turn,
      myTurn: this.myTurn(),
      state,
      loser: p.loser === "w" || p.loser === "b" ? p.loser : end === "mate" ? pos.turn : null,
      offer: p.offer === "w" || p.offer === "b" ? p.offer : null,
      moves: replay(typeof p.log === "string" ? p.log : "").san,
      picked: this.picked != null ? sqName(this.picked) : null,
      promo: !!this.promoTo,
      view: this.view,
      canVortex: !!at.side && (!p[other] || this.away(Number(p[other]), o)) && !vx,
    };
    const sig = JSON.stringify(info);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    hud.set({ chess: info } as never);
  }

  // ── picking and sending ───────────────────────────────────────────────────────────────────────
  /** The square under a point of the screen on the table I'm at, or null. */
  private squareAt(cx: number, cy: number): number | null {
    const o = this.table();
    const f = o ? this.host.men()?.frameOf(o.id) : null;
    const ray = this.host.model.rayAt(cx, cy);
    if (!o || !f || !ray || ray.d.z >= -1e-6) return null;
    // (the ray's height in iso px, as the view gives it: 39.19 a tile)
    const top = (f.b.top * 39.19) / 1;
    const t = (top - ray.o.z) / ray.d.z;
    const world = new Vector3(ray.o.x + ray.d.x * t, f.b.top, ray.o.y + ray.d.y * t);
    const local = world.applyMatrix4(new Matrix4().copy(f.place).invert());
    const r = Math.floor((local.x - f.b.x0) / f.b.sq);
    const file = Math.floor((local.z - f.b.z0) / f.b.sq);
    if (r < 0 || r > 7 || file < 0 || file > 7) return null;
    return (7 - r) * 8 + file;
  }
  pointer(type: "move" | "down", cx: number, cy: number): void {
    if (!this.at?.side) return;
    const s = this.squareAt(cx, cy);
    if (type === "move") {
      this.hover = s;
      if (s != null) this.cursor = s;
      this.showUi();
      return;
    }
    if (s != null) this.choose(s);
  }
  /** A square chosen (a click, E on the cursor): pick a man of mine, or send the picked one there. */
  private choose(s: number) {
    const o = this.table();
    if (!o || !this.at?.side || !this.myTurn()) return;
    const pos = safe(o.props?.fen);
    const c = pos.board[s];
    const mine = !!c && (c === c.toUpperCase() ? "w" : "b") === this.at.side;
    if (this.picked != null && this.movesFrom(this.picked).includes(s)) {
      const piece = pos.board[this.picked].toLowerCase();
      const last = Math.floor(s / 8) === (this.at.side === "w" ? 0 : 7);
      if (piece === "p" && last) {
        this.promoTo = { from: this.picked, to: s };
        this.publish();
        return;
      }
      this.send(this.picked, s);
      return;
    }
    this.picked = mine && this.movesFrom(s).length ? s : null;
    this.showUi();
    this.publish();
  }
  /** The promotion asked for: q, r, b, n. */
  promote(to: string): void {
    const p = this.promoTo;
    if (!p || !"qrbn".includes(to)) return;
    this.send(p.from, p.to, to);
  }
  private send(from: number, to: number, promo = "q") {
    const o = this.table();
    if (!o) return;
    this.host.send("chess:move", { id: o.id, from, to, promo });
    this.picked = null;
    this.promoTo = null;
    this.showUi();
    this.publish();
  }
  /** The keys at the table: arrows (the cursor, as I look down the board), E / Enter / Space, Esc, Q, C,
   *  1–4 a promotion. True if it was mine. */
  key(code: string): boolean {
    if (!this.at) return false;
    const white = this.at.side !== "b";
    const step = (df: number, dr: number) => {
      const f = Math.max(0, Math.min(7, (this.cursor % 8) + (white ? df : -df)));
      const r = Math.max(0, Math.min(7, Math.floor(this.cursor / 8) - (white ? dr : -dr)));
      this.cursor = r * 8 + f;
      this.hover = this.cursor;
      this.showUi();
    };
    if (this.promoTo) {
      const pick = { Digit1: "q", Digit2: "r", Digit3: "b", Digit4: "n" }[code];
      if (pick) {
        this.promote(pick);
        return true;
      }
      if (code === "Escape") {
        this.promoTo = null;
        this.publish();
        return true;
      }
    }
    switch (code) {
      case "ArrowUp":
      case "KeyW":
        step(0, 1);
        return true;
      case "ArrowDown":
      case "KeyS":
        step(0, -1);
        return true;
      case "ArrowLeft":
      case "KeyA":
        step(-1, 0);
        return true;
      case "ArrowRight":
      case "KeyD":
        step(1, 0);
        return true;
      case "KeyE":
      case "Enter":
      case "Space":
        if (this.at.side) this.choose(this.cursor);
        return true;
      case "Escape":
        if (this.picked != null) {
          this.picked = null;
          this.showUi();
          this.publish();
        } else this.standUp();
        return true;
      case "KeyQ":
        this.standUp();
        return true;
      case "KeyC":
        this.view = this.view === "top" ? "lean" : "top";
        this.publish();
        return true;
    }
    return false;
  }
  /** The wheel: a step out (positive) or in. */
  zoom(dir: number): void {
    const i = VIEWS.indexOf(this.view);
    this.view = VIEWS[Math.max(0, Math.min(VIEWS.length - 1, i + Math.sign(dir)))];
    this.publish();
  }
  /** Right-drag: a little round the board (rad, kept within reach). */
  turn(d: number): void {
    this.orbit = Math.max(-0.7, Math.min(0.7, this.orbit + d));
  }

  // ── the table's actions (the strip's buttons) ─────────────────────────────────────────────────
  resign(): void {
    if (this.at?.side) this.host.send("chess:resign", { id: this.at.id });
  }
  draw(offer: boolean): void {
    if (this.at?.side) this.host.send("chess:draw", { id: this.at.id, offer });
  }
  newGame(): void {
    if (this.at) this.host.send("chess:new", { id: this.at.id });
  }
  /** Vortex to play the other side, at a level (null: he goes). */
  vortex(level: string | null): void {
    if (!this.at?.side || (level !== null && !isChessLevel(level))) return;
    this.host.send("chess:vortex", { id: this.at.id, level });
  }
  setCuts(on: boolean): void {
    this.cuts = on;
    try {
      localStorage.setItem(CUTS_KEY, on ? "1" : "0");
    } catch {
      // (no storage: for now only)
    }
  }

  // ── the camera ────────────────────────────────────────────────────────────────────────────────
  /** The table's camera (3D): the lean-in view or a step out, a watcher's; a capture's close cut, a
   *  mate's crown. Null when I'm not at a table. */
  gameCam(): {
    eye: [number, number, number];
    look: [number, number, number];
    fov?: number;
    snap?: boolean;
    lens?: number;
  } | null {
    const o = this.table();
    const men = this.host.men();
    const f = o ? men?.frameOf(o.id) : null;
    if (!o || !this.at || !f) return null;
    const black = this.at.side === "b";
    const big = !!COMMANDERS[o.kind];
    const v = this.at.side ? (big ? EYE_BIG : EYE)[this.view] : (WATCH[o.kind] ?? WATCH.chess_table);
    const BOARD_MID = midOf(o.kind);
    // (black's: turned half round the board's middle; the orbit turns either round it too)
    const turnAt = (p: [number, number, number]): [number, number, number] => {
      let [x, y, z] = p;
      if (black) {
        x = 2 * BOARD_MID[0] - x;
        z = 2 * BOARD_MID[1] - z;
      }
      const a = this.orbit;
      const dx = x - BOARD_MID[0];
      const dz = z - BOARD_MID[1];
      return [
        BOARD_MID[0] + dx * Math.cos(a) - dz * Math.sin(a),
        y,
        BOARD_MID[1] + dx * Math.sin(a) + dz * Math.cos(a),
      ];
    };
    let eye = turnAt(v.eye);
    let look = turnAt(v.look);
    let fov = v.fov;
    // the moments: cut close to a capture as the blow lands, then back; to a mate's dropped crown
    if (this.cuts && men) {
      const play = men.playing(o.id);
      const vic = play?.plan.victim;
      if (play && vic && play.t > vic.flinchAt + 0.15 && play.t < vic.breakAt + 0.9) {
        const [vx, vz] = squareOn(f.b, (7 - Math.round(vic.at[1])) * 8 + Math.round(vic.at[0]));
        const [ax, az] = squareOn(f.b, play.plan.move.from);
        // (low, from the side of the line between the taker and the taken, both in the picture)
        const dx = vx - ax;
        const dz = vz - az;
        const n = Math.hypot(dx, dz) || 1;
        const side = black ? -1 : 1;
        const g = f.b.sq / 0.065;
        eye = [
          vx - (dx / n) * 0.09 * g + (-dz / n) * 0.16 * side * g,
          f.b.top + 0.07 * g,
          vz - (dz / n) * 0.09 * g + (dx / n) * 0.16 * side * g,
        ];
        look = [vx - (dx / n) * 0.03 * g, f.b.top + 0.035 * g, vz - (dz / n) * 0.03 * g];
        fov = 40;
        // (a small shake as it breaks)
        const sh = Math.max(0, 1 - Math.abs(play.t - vic.breakAt) / 0.25) * 0.004;
        eye[1] += Math.sin(play.t * 90) * sh;
        eye[0] += Math.cos(play.t * 77) * sh;
      }
      const end = men.ended(o.id);
      if (end?.loser && end.s > 1.2 && end.s < 4.5) {
        const pos = safe(o.props?.fen);
        const k = pos.board.indexOf(end.loser === "w" ? "K" : "k");
        if (k >= 0) {
          const [kx, kz] = squareOn(f.b, k);
          const toward = end.loser === "w" ? 1 : -1;
          const push = Math.min(1, (end.s - 1.2) / 3);
          const cx = kx + toward * f.b.sq * 0.6;
          const g = f.b.sq / 0.065;
          eye = [cx + toward * (0.26 - push * 0.08) * g, f.b.top + (0.06 - push * 0.015) * g, kz + 0.12 * g];
          look = [cx - toward * 0.02 * g, f.b.top + 0.03 * g, kz + 0.01 * g];
          fov = 38;
        }
      }
    }
    const w = (p: [number, number, number]): [number, number, number] => {
      const q = new Vector3(...p).applyMatrix4(f.place);
      return [q.x, q.z, q.y];
    };
    // (the opponent across, a watcher beside: drawn; only someone right at the lens hidden)
    return { eye: w(eye), look: w(look), fov, lens: big ? 0.8 : 0.25 };
  }

  // ── Vortex in a chair (plan 70, phase 7) ─────────────────────────────────────────────────────
  /** Every chess table's Vortex on this floor: sat in the side's chair facing the board (sit: its
   *  seat's top), his face by the game. The controller draws them as it does the game tables'. */
  vortexes(): { key: string; x: number; y: number; angle: number; mood: string; sit?: number }[] {
    const out: { key: string; x: number; y: number; angle: number; mood: string; sit?: number }[] = [];
    for (const o of this.host.model.allObjects()) {
      const p = o.props ?? {};
      const side = p.vxSide;
      if (!BOARDS[o.kind] || !p.vx || (side !== "w" && side !== "b")) continue;
      const c = this.chairOf(o, side);
      if (!c) continue;
      out.push({
        key: `chess:${o.id}`,
        x: c.at.x,
        y: c.at.y,
        angle: Math.atan2(c.mid.y - c.at.y, c.mid.x - c.at.x),
        mood: vortexMood(o, side),
        // (sat in a table's chair; on a life-size board he floats at his own size behind his men)
        ...(CHAIRS[o.kind] ? { sit: 0.46 } : {}),
      });
    }
    return out;
  }

  /** Is the pointer the board's now (sat at a table: the strip's overlay takes it)? */
  get active(): boolean {
    return !!this.at;
  }
  get seated(): boolean {
    return !!this.at?.side;
  }

  refresh(): void {
    // (a table taken away while I'm at it)
    if (this.at && !this.host.model.getObject(this.at.id)) this.leave();
  }
  dispose(): void {
    this.leave();
  }
}

/** Vortex's face at a table he plays (`side`), by the game: thinking on his move, judging on yours
 *  (bored, then asleep if you take too long), shocked when you've just taken one of his, smug when
 *  he's just taken yours, malicious giving check, seething behind; at the end, ecstatic or crying. */
export function vortexMood(o: WorldObjectDef, side: "w" | "b"): string {
  const p = o.props ?? {};
  const pos = safe(p.fen);
  const end = outcome(pos);
  const over = String(p.over ?? "");
  const lost = (s: "w" | "b") => {
    const worth: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let n = 0;
    for (const c of pos.board) if (c && (c === c.toUpperCase()) === (s === "w")) n += worth[c.toLowerCase()];
    return 39 - n;
  };
  if (over === "resign") return p.loser === side ? "crying" : "ecstasy";
  if (end === "mate") return pos.turn === side ? "crying" : "ecstasy";
  if (over === "agreed" || end === "stalemate" || end === "fifty" || end === "material") return "sideeye";
  const since = Date.now() - (Number(p.lastAt) || 0);
  const lastTo = Array.isArray(p.last) ? Number((p.last as number[])[1]) : -1;
  // (the move just played: what it did to him)
  if (since < 4500 && lastTo >= 0) {
    const was = replay(typeof p.log === "string" ? p.log.split(" ").slice(0, -1).join(" ") : "").fens.at(-1) ?? START;
    const took = !!safe(was).board[lastTo];
    if (pos.turn === side && took) return "shocked";
    if (pos.turn !== side && took) return "smug";
    if (pos.turn !== side && end === "check") return "malicious";
  }
  if (pos.turn === side) return "focused";
  if (lost(side) - lost(side === "w" ? "b" : "w") >= 3) return "seething";
  return since > 60_000 ? "asleep" : since > 25_000 ? "bored" : "judging";
}

export type { Board };
