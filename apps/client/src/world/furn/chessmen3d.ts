import type { WorldObjectDef } from "@yutopia/shared";
import { inCheck, kingOf, outcome, parseFen, START } from "@yutopia/shared/games68/chess";
import {
  actorAt,
  type Fr,
  type MovePlan,
  PROMO_MORPH,
  planMove,
  sqToFr,
  victimAt,
} from "@yutopia/shared/games68/choreo";
import {
  AdditiveBlending,
  type BufferGeometry,
  CanvasTexture,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { litMaterial } from "../look/lit";
import {
  crownGeometry,
  type ManKind,
  makeMan,
  manGeometry,
  POSES,
  pose,
  type Rig,
  SETS,
  type Side,
  UNIT,
} from "./fam/chessmen";
import { PLAY } from "./fam/gameroom";
import { CEL_ALPHA } from "./look";
import { placeOf } from "./native";

// The living men (docs/plan/70-the-chess.md, phases 1–5): every chess board's men where the room's game
// has them (`props.fen`), drawn apart from the table (which never has them: a move never redraws it).
//
// - At rest they're instanced: one instanced mesh per set, side and man for the whole floor (12 draws
//   for the boards of one look in view, however many). Each is its rig at rest, flattened.
// - A man that does something is a rig instead (fam/chessmen.ts makeMan), posed every frame: the men
//   of a move as it's played out (shared games68/choreo.ts: who goes where and how, the taken man's
//   flinch and break), a man picked and those it threatens, a king in check on his guard, the end of a
//   game (the beaten king's crown taken off and dropped, the winners' weapons up, both kings bowing at
//   a draw); and at the board someone's at (`focus`), all of them, breathing and looking.
// - Round them: the marks on squares (a man picked, where it can go, what it can take), the chips and
//   dust of a man broken, and each side's losses heaped as rubble by the board at its taker's left —
//   worked out from the position, so the heaps are there for whoever comes later too.

/** A board's measures in its kind's model frame (m): its a1 corner (ranks along x, files along z), a
 *  square, its top, the men's scale (fam/chessmen.ts UNIT a unit), where each side's losses heap. */
export interface Board {
  x0: number;
  z0: number;
  sq: number;
  top: number;
  unit: number;
  /** white's lost men, black's (model frame x, z) */
  heaps: [[number, number], [number, number]];
  /** what the heaps lie on (m up) */
  heapTop: number;
}
export const BOARDS: Record<string, Board> = {
  chess_table: {
    x0: PLAY.chess_table.x0,
    z0: PLAY.chess_table.z0,
    sq: PLAY.chess_table.sq,
    top: PLAY.chess_table.top + 0.0005,
    unit: UNIT,
    // (white's losses by black's left, past the clock; black's by white's left: white sits at low x
    // facing +x, its left −z)
    heaps: [
      [1.23, 0.82],
      [0.86, 0.16],
    ],
    heapTop: PLAY.chess_table.top,
  },
  // (phase 9) the life-size board on the floor: 1.1 m squares, the men a person's size (the king
  // ~1.85 m); the heaps on its border at each taker's left
  wizard_chess: {
    x0: PLAY.wizard_chess.x0,
    z0: PLAY.wizard_chess.z0,
    sq: PLAY.wizard_chess.sq,
    top: PLAY.wizard_chess.top + 0.006,
    unit: 0.95,
    heaps: [
      [8.2, 9.75],
      [1.8, 0.25],
    ],
    heapTop: PLAY.wizard_chess.top,
  },
};

/** The kinds the living men stand on. */
export const isBoard = (kind: string): boolean => kind in BOARDS;

/** White faces +x (toward the black end), black −x, in the model's frame; a rig faces +z at 0. */
const FACE: Record<Side, number> = { w: Math.PI / 2, b: -Math.PI / 2 };
/** choreo's yaw (0: facing +rank, +π/2: +file) as a rig's turn round y in the model's frame */
const rigYaw = (yaw: number) => Math.PI / 2 - yaw;

/** A (file, rank) on a board, in its model's frame (x, z). */
export function onBoard(b: Board, [f, r]: Fr): [number, number] {
  return [b.x0 + (r + 0.5) * b.sq, b.z0 + (f + 0.5) * b.sq];
}
/** A chess.ts square (a8 = 0) on a board. */
export const squareOn = (b: Board, i: number): [number, number] => onBoard(b, sqToFr(i));

const geos = new Map<string, BufferGeometry>();
/** In the world's colours: RGBA, the cel's mark (look.ts). */
function celRgba(g: BufferGeometry): BufferGeometry {
  const c = g.attributes.color;
  if (!c || c.itemSize === 4) return g;
  const out = new Float32Array(c.count * 4);
  for (let i = 0; i < c.count; i++) out.set([c.getX(i), c.getY(i), c.getZ(i), CEL_ALPHA], i * 4);
  g.setAttribute("color", new Float32BufferAttribute(out, 4));
  return g;
}
/** A man's geometry at rest in the world's colours, built once. */
function geoOf(set: number, side: Side, kind: ManKind, unit: number): BufferGeometry {
  const key = `${set}|${side}|${kind}|${unit}`;
  let g = geos.get(key);
  if (!g) {
    g = celRgba(manGeometry(kind, side, SETS[set], unit));
    geos.set(key, g);
  }
  return g;
}

function safeFen(fen: unknown) {
  try {
    if (typeof fen === "string") return parseFen(fen);
  } catch {
    // (a position that won't read: the men as they start)
  }
  return parseFen(START);
}
/** A table's position as its board (a8 first): its game's, or the start if it has none or it won't read. */
export const boardOf = (o: WorldObjectDef): string[] => safeFen(o.props?.fen).board;
const fenOf = (o: WorldObjectDef) => (typeof o.props?.fen === "string" ? o.props.fen : START);
/** A table's look (its set of men): its variant, 0..2. */
const setOf = (o: WorldObjectDef) => Math.max(0, Math.min(SETS.length - 1, Number(o.props?.variant) || 0));
const sideOf = (c: string): Side => (c === c.toUpperCase() ? "w" : "b");
const sqOf = ([f, r]: Fr) => (7 - Math.round(r)) * 8 + Math.round(f);

/** Where each man of a table stands at rest (the floor's frame), by its set, side and kind. */
export function menOf(o: WorldObjectDef): { set: number; side: Side; kind: ManKind; sq: number; at: Matrix4 }[] {
  const b = BOARDS[o.kind];
  if (!b) return [];
  const place = placeOf(o);
  const set = setOf(o);
  const out: { set: number; side: Side; kind: ManKind; sq: number; at: Matrix4 }[] = [];
  boardOf(o).forEach((c, i) => {
    if (!c) return;
    const side = sideOf(c);
    const [x, z] = squareOn(b, i);
    const at = new Matrix4().makeRotationY(FACE[side]).setPosition(x, b.top, z).premultiply(place);
    out.push({ set, side, kind: c.toLowerCase() as ManKind, sq: i, at });
  });
  return out;
}

/** What each side has lost, from the position (the full set less what's left): white's, black's —
 *  the most worth first. */
export function lostOf(board: string[]): [ManKind[], ManKind[]] {
  const full: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const out: [ManKind[], ManKind[]] = [[], []];
  for (const [si, white] of [
    [0, true],
    [1, false],
  ] as const) {
    const have: Record<string, number> = {};
    for (const c of board)
      if (c && (c === c.toUpperCase()) === white) have[c.toLowerCase()] = (have[c.toLowerCase()] ?? 0) + 1;
    // (a promoted pawn counts as the man it became: whatever's over the full set came from the pawns)
    let extra = 0;
    for (const k of ["n", "b", "r", "q"]) extra += Math.max(0, (have[k] ?? 0) - full[k]);
    for (const k of ["q", "r", "b", "n", "p"] as ManKind[]) {
      const lost = k === "p" ? full.p - (have.p ?? 0) - extra : Math.max(0, full[k] - (have[k] ?? 0));
      for (let i = 0; i < lost; i++) out[si].push(k);
    }
  }
  return out;
}

/** What the player at a table shows on it (the chess chunk's): a man picked, where it can go, what it
 *  can take, the square under the pointer. */
export interface ChessUi {
  picked: number | null;
  moves: number[];
  takes: number[];
  hover: number | null;
}

interface Playing {
  plan: MovePlan;
  t0: number;
  /** the rigs of the move: its actors, the taken man, a promotion's new man */
  actors: Rig[];
  victim: Rig | null;
  promo: Rig | null;
  shards: Group | null;
  dust: Group | null;
  /** s into the move at the last frame (the sounds fire as their moments are passed) */
  was: number;
}
interface Ending {
  /** a mate or a resignation: the beaten side; a draw: both kings bow */
  kind: "beaten" | "draw";
  loser: Side | null;
  t0: number;
  crown: Group | null;
  /** its crown's ring heard */
  rang?: boolean;
}
interface TableState {
  o: WorldObjectDef;
  b: Board;
  set: number;
  fen: string;
  board: string[];
  /** the table's frame in the floor: everything of it hangs here, in its model's frame */
  group: Group;
  play: Playing | null;
  ending: Ending | null;
  /** the rigs standing in for men at rest (by square): the focus's, a picked man, a king on guard */
  rigs: Map<number, Rig>;
  heaps: Group | null;
  heapKey: string;
  marks: Group;
  ui: ChessUi | null;
  /** (phase 9) the squares people stand in for (no man drawn there: the person is the man) */
  si: Set<number>;
  /** the position its king last raised his guard in (the sound once) */
  guarded?: string;
}

const rnd = (seed: number) => {
  let x = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
};

export class ChessMen3 {
  readonly root = new Group();
  private meshes = new Map<string, InstancedMesh>();
  private tables = new Map<string, TableState>();
  private instSig = "";
  private focusId: string | null = null;
  private now = 0;
  private runeTex: CanvasTexture | null = null;
  private runeMats = new Map<string, MeshBasicMaterial>();
  private runeGeos = new Map<number, PlaneGeometry>();
  private dustMat = litMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0.5, depthWrite: false });
  private shardMats = new Map<number, Material>();
  private pool = new Map<string, Rig[]>();
  constructor(private readonly mat: Material) {
    this.root.name = "chessmen";
  }

  /** The floor's things: each board's men again if a table or its game changed (a move: played out). */
  sync(objects: WorldObjectDef[]): void {
    const seen = new Set<string>();
    for (const o of objects) {
      const b = BOARDS[o.kind];
      if (!b) continue;
      seen.add(o.id);
      let t = this.tables.get(o.id);
      const fen = fenOf(o);
      if (!t) {
        const group = new Group();
        group.matrixAutoUpdate = false;
        const marks = new Group();
        group.add(marks);
        this.root.add(group);
        t = {
          o,
          b,
          set: setOf(o),
          fen,
          board: safeFen(fen).board,
          group,
          play: null,
          ending: null,
          rigs: new Map(),
          heaps: null,
          heapKey: "",
          marks,
          ui: null,
          si: new Set(),
        };
        this.tables.set(o.id, t);
        this.startEnding(t, false);
      } else if (fen !== t.fen) {
        // a move: played out if it's one move on from what we had and fresh (a late arrival snaps)
        const before = t.fen;
        t.o = o;
        t.fen = fen;
        t.board = safeFen(fen).board;
        this.endPlay(t);
        const at = Number(o.props?.lastAt) || 0;
        const fresh = !at || Math.abs(Date.now() - at) < 10_000;
        const last = Array.isArray(o.props?.last) ? (o.props.last as [number, number]) : undefined;
        const plan = fresh ? planMove(before, fen, last) : null;
        if (plan) this.startPlay(t, plan);
        this.clearEnding(t);
        this.startEnding(t, !!plan);
      } else if (String(o.props?.over ?? "") !== String(t.o.props?.over ?? "")) {
        t.o = o;
        this.clearEnding(t);
        this.startEnding(t, false);
      }
      t.o = o;
      t.set = setOf(o);
      t.si = standIns(o);
      t.group.matrix.copy(placeOf(o));
      t.group.matrixWorldNeedsUpdate = true;
      this.heapsFor(t);
    }
    for (const [id, t] of this.tables)
      if (!seen.has(id)) {
        this.endPlay(t);
        this.clearEnding(t);
        for (const r of t.rigs.values()) this.free(r);
        this.root.remove(t.group);
        this.tables.delete(id);
      }
    this.instance();
  }

  /** The table the player's at (its men all rigs, breathing), or none. */
  setFocus(id: string | null): void {
    if (this.focusId === id) return;
    this.focusId = id;
    this.lampOn(id);
    this.instance(true);
  }
  // the board's light (plan 70 phase 5): a warm pool on the table someone's at — painted, not a light
  // (a new light would have every lit material compile again, and costs every draw)
  private lamp: Mesh | null = null;
  private lampOn(id: string | null) {
    this.lamp?.parent?.remove(this.lamp);
    const t = id ? this.tables.get(id) : null;
    if (!t) return;
    if (!this.lamp) {
      const s = 256;
      const cv = document.createElement("canvas");
      cv.width = cv.height = s;
      const g = cv.getContext("2d") as CanvasRenderingContext2D;
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, "rgba(255,214,150,0.42)");
      grd.addColorStop(0.45, "rgba(255,196,120,0.22)");
      grd.addColorStop(1, "rgba(255,180,100,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      const tex = new CanvasTexture(cv);
      tex.colorSpace = SRGBColorSpace;
      this.lamp = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      this.lamp.rotation.x = -Math.PI / 2;
      this.lamp.renderOrder = 2;
    }
    const b = t.b;
    const span = b.sq * 8;
    this.lamp.scale.setScalar(span * 1.9);
    this.lamp.position.set(b.x0 + span / 2, b.top + 0.0006, b.z0 + span / 2);
    t.group.add(this.lamp);
  }
  /** What the player shows on a table (null: nothing). */
  setUi(id: string, ui: ChessUi | null): void {
    const t = this.tables.get(id);
    if (!t) return;
    if (ui?.picked != null && ui.picked !== t.ui?.picked) {
      const [x, z] = squareOn(t.b, ui.picked);
      const q = new Vector3(x, t.b.top, z).applyMatrix4(t.group.matrix);
      this.onSound?.("pick", q.x, q.z, { wood: t.set === 0 });
    }
    t.ui = ui;
    this.drawMarks(t);
    this.instance(true);
  }
  /** The move a table's playing out now and how far in (s), for the camera's moments; or null. */
  playing(id: string): { plan: MovePlan; t: number } | null {
    const p = this.tables.get(id)?.play;
    return p ? { plan: p.plan, t: this.now - p.t0 } : null;
  }
  /** Seconds since a table's game ended (its crown dropped from 1.4 on), or null. */
  ended(id: string): { s: number; loser: Side | null } | null {
    const e = this.tables.get(id)?.ending;
    return e ? { s: this.now - e.t0, loser: e.loser } : null;
  }
  /** A table's frame in the floor and its board (the chess chunk's camera and pointer). */
  frameOf(id: string): { place: Matrix4; b: Board } | null {
    const t = this.tables.get(id);
    return t ? { place: t.group.matrix, b: t.b } : null;
  }

  /** (phase 9) Where the men of a board stand now, for the physics (solid at a person's size):
   *  each by a key, its middle (the floor's x, z), its plinth's radius, its height (m). The people
   *  standing in are bodies of their own. */
  solids(id: string): { key: string; x: number; z: number; r: number; h: number; y: number }[] {
    const t = this.tables.get(id);
    if (!t) return [];
    const out: { key: string; x: number; z: number; r: number; h: number; y: number }[] = [];
    const v = new Vector3();
    const put = (key: string, x: number, z: number, kind: string, lift = 0) => {
      v.set(x, t.b.top + lift, z).applyMatrix4(t.group.matrix);
      const h = { p: 1.05, r: 1.25, n: 1.35, b: 1.5, q: 1.6, k: 1.8 }[kind] ?? 1.4;
      out.push({ key, x: v.x, z: v.z, r: 0.42 * (t.b.unit / 0.95), h: h * (t.b.unit / 0.95), y: v.y });
    };
    const skip = this.skipped(t);
    for (const [i, c] of t.board.entries()) {
      if (!c || t.si.has(i)) continue;
      if (t.play && skip.has(i) && !t.rigs.has(i)) continue;
      const [x, z] = squareOn(t.b, i);
      put(`s${i}`, x, z, c.toLowerCase());
    }
    if (t.play)
      t.play.plan.actors.forEach((a, i) => {
        const r = t.play?.actors[i];
        if (!r || r.root.userData.standIn) return;
        put(`a${i}`, r.root.position.x, r.root.position.z, a.kind, r.root.position.y - t.b.top);
      });
    return out;
  }
  /** (phase 9) A board's move playing out for a stand-in: where the man that's `sq` after the move
   *  is now (the floor's x, z), or null when it's not moving. */
  carried(id: string, sq: number): { x: number; z: number } | null {
    const t = this.tables.get(id);
    const p = t?.play;
    if (!t || !p) return null;
    const i = p.plan.actors.findIndex((a) => sqOf(a.to) === sq);
    if (i < 0) return null;
    const m = actorAt(p.plan, i, this.now - p.t0);
    const [x, z] = onBoard(t.b, m.at);
    const v = new Vector3(x, t.b.top, z).applyMatrix4(t.group.matrix);
    return { x: v.x, z: v.z };
  }

  /** How many men are drawn, instanced and as rigs (for tests). */
  get drawn(): number {
    let n = 0;
    for (const m of this.meshes.values()) if (m.visible) n += m.count;
    for (const t of this.tables.values()) {
      n += t.rigs.size;
      if (t.play) n += t.play.actors.length;
    }
    return n;
  }
  /** How many men a table has as rigs now (for tests). */
  rigsAt(id: string): number {
    const t = this.tables.get(id);
    return (t?.rigs.size ?? 0) + (t?.play?.actors.length ?? 0);
  }

  // ── the men at rest: instanced, less those drawn as rigs ───────────────────────────────────────
  private instance(force = false) {
    const want = new Map<string, { set: number; side: Side; kind: ManKind; unit: number; at: Matrix4[] }>();
    const sig: string[] = [];
    for (const t of this.tables.values()) {
      this.rigsFor(t);
      const skip = this.skipped(t);
      sig.push(`${t.o.id}|${t.fen}|${t.set}|${[...skip].join(",")}|${t.group.matrix.elements.join(",")}`);
      for (const m of menOf(t.o)) {
        if (skip.has(m.sq)) continue;
        const key = `${m.set}|${m.side}|${m.kind}|${t.b.unit}`;
        const w = want.get(key) ?? { set: m.set, side: m.side, kind: m.kind, unit: t.b.unit, at: [] };
        want.set(key, w);
        w.at.push(m.at);
      }
    }
    const s = sig.join(";");
    if (!force && s === this.instSig) return;
    this.instSig = s;
    for (const [key, w] of want) {
      let mesh = this.meshes.get(key);
      if (mesh && mesh.instanceMatrix.count < w.at.length) {
        this.root.remove(mesh);
        mesh.dispose();
        mesh = undefined;
      }
      if (!mesh) {
        // (room for a few tables' worth: a set's 8 pawns a side, more as tables come)
        mesh = new InstancedMesh(geoOf(w.set, w.side, w.kind, w.unit), this.mat, Math.max(8, w.at.length * 2));
        mesh.name = `chessmen:${key}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.meshes.set(key, mesh);
        this.root.add(mesh);
      }
      for (const [i, m] of w.at.entries()) mesh.setMatrixAt(i, m);
      mesh.count = w.at.length;
      mesh.instanceMatrix.needsUpdate = true;
      // (culled by where its men are now: three works the sphere out again when it's null)
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
      mesh.visible = true;
    }
    for (const [key, mesh] of this.meshes)
      if (!want.has(key)) {
        mesh.count = 0;
        mesh.visible = false;
      }
  }
  /** The squares (of the position now) a table draws as rigs, not instanced. */
  private skipped(t: TableState): Set<number> {
    const s = new Set<number>([...t.rigs.keys(), ...t.si]);
    if (t.play) for (const a of t.play.plan.actors) s.add(sqOf(a.to));
    return s;
  }

  // ── rigs ─────────────────────────────────────────────────────────────────────────────────────
  private rig(t: TableState, side: Side, kind: ManKind): Rig {
    const key = `${t.set}|${side}|${kind}|${t.b.unit}`;
    const r = this.pool.get(key)?.pop() ?? celRig(makeMan(kind, side, SETS[t.set], this.mat, t.b.unit));
    r.root.userData.key = key;
    r.root.visible = true;
    r.root.scale.setScalar(1);
    pose(r, "rest");
    t.group.add(r.root);
    return r;
  }
  private free(r: Rig) {
    r.root.parent?.remove(r.root);
    r.root.userData.standIn = false;
    if (r.part.crown && r.part.head && r.part.crown.parent !== r.part.head) {
      // (a crown taken off goes back on the head)
      r.part.head.add(r.part.crown);
      r.part.crown.position.set(0, r.kind === "k" ? 0.27 : 0.22, 0);
      r.part.crown.rotation.set(0, 0, 0);
    }
    if (r.part.crown) r.part.crown.visible = true;
    const key = String(r.root.userData.key);
    const list = this.pool.get(key) ?? [];
    list.push(r);
    this.pool.set(key, list);
  }
  /** Which men at rest a table draws as rigs: all of them at the focus; else a picked man and those it
   *  threatens, the kings in a check or at a game's end. */
  private rigsFor(t: TableState) {
    const want = new Set<number>();
    const focus = t.o.id === this.focusId;
    const played = new Set(t.play ? t.play.plan.actors.map((a) => sqOf(a.to)) : []);
    // (the focus's men breathing: at a table, where they're seen close; not a life-size board's —
    // from its dais they're a few metres off, and 32 posed bodies cost their draws twice, shadows too)
    if (focus && t.b.unit <= UNIT * 2)
      for (const [i, c] of t.board.entries()) if (c && !played.has(i) && !t.si.has(i)) want.add(i);
    if (t.ui?.picked != null && t.board[t.ui.picked]) want.add(t.ui.picked);
    for (const i of t.ui?.takes ?? []) if (t.board[i]) want.add(i);
    const pos = safeFen(t.fen);
    if (inCheck(pos) || t.ending)
      for (const side of ["w", "b"] as const) {
        const k = kingOf(pos, side);
        if (k >= 0) want.add(k);
      }
    if (t.ending?.kind === "beaten")
      for (const [i, c] of t.board.entries()) if (c && sideOf(c) !== t.ending.loser) want.add(i);
    for (const i of played) want.delete(i);
    for (const i of t.si) want.delete(i);
    for (const [i, r] of t.rigs)
      if (!want.has(i) || !t.board[i] || r.kind !== t.board[i].toLowerCase() || r.side !== sideOf(t.board[i])) {
        this.free(r);
        t.rigs.delete(i);
      }
    for (const i of want)
      if (!t.rigs.has(i)) {
        const c = t.board[i];
        const r = this.rig(t, sideOf(c), c.toLowerCase() as ManKind);
        const [x, z] = squareOn(t.b, i);
        r.root.position.set(x, t.b.top, z);
        r.root.rotation.set(0, FACE[sideOf(c)], 0);
        t.rigs.set(i, r);
      }
  }

  // ── a move played out ──────────────────────────────────────────────────────────────────────────
  private startPlay(t: TableState, plan: MovePlan) {
    const si = standIns(t.o);
    const actors = plan.actors.map((a) => {
      const r = this.rig(t, a.side, a.kind);
      // (a man someone stands in for: the person goes, carried — no stone one)
      if (si.has(sqOf(a.to))) r.root.userData.standIn = true;
      return r;
    });
    const victim = plan.victim ? this.rig(t, plan.victim.side, plan.victim.kind) : null;
    if (victim && t.si.has(sqOf(plan.victim?.at ?? [0, 0]))) victim.root.userData.standIn = true;
    t.play = { plan, t0: this.now, actors, victim, promo: null, shards: null, dust: null, was: -0.001 };
  }
  private endPlay(t: TableState) {
    const p = t.play;
    if (!p) return;
    for (const r of p.actors) this.free(r);
    if (p.victim) this.free(p.victim);
    if (p.promo) this.free(p.promo);
    p.shards?.parent?.remove(p.shards);
    p.dust?.parent?.remove(p.dust);
    t.play = null;
  }
  private playFrame(t: TableState) {
    const p = t.play;
    if (!p) return;
    const s = this.now - p.t0;
    const plan = p.plan;
    if (s >= plan.duration + 0.05) {
      this.endPlay(t);
      this.instance(true);
      return;
    }
    const k = t.b.unit / UNIT;
    this.playSounds(t, p, s);
    plan.actors.forEach((_, i) => {
      const r = p.actors[i];
      const m = actorAt(plan, i, s);
      const [x, z] = onBoard(t.b, m.at);
      r.root.position.set(x, t.b.top + m.lift * k, z);
      r.root.rotation.set(0, rigYaw(m.yaw), 0);
      r.root.visible = !r.root.userData.standIn;
      pose(r, m.pose in POSES ? m.pose : "rest", m.k);
    });
    // the taken man: flinching, then broken into chips and dust that settle and are swept off
    if (plan.victim && p.victim) {
      const v = victimAt(plan, s);
      const [x, z] = onBoard(t.b, plan.victim.at);
      p.victim.root.position.set(x, t.b.top, z);
      p.victim.root.rotation.set(0, rigYaw(v.yaw), 0);
      if (v.state === "flinch") pose(p.victim, "flinch", v.k);
      else if (v.state === "whole") pose(p.victim, "rest");
      p.victim.root.visible = (v.state === "whole" || v.state === "flinch") && !p.victim.root.userData.standIn;
      if ((v.state === "breaking" || v.state === "gone") && !p.victim.root.userData.standIn) {
        if (!p.shards) {
          p.shards = this.shardsAt(t, x, z, plan.victim.side, plan.move.from * 64 + plan.move.to);
          p.dust = this.dustAt(t, x, z, plan.move.to);
        }
        this.shardsFrame(t, p, s - plan.victim.breakAt, plan.victim.side);
      }
    }
    // a promotion: the pawn shrinks into chips, the new man rises from them
    if (plan.promo) {
      const e = (s - plan.promo.at_s) / PROMO_MORPH;
      if (e > 0) {
        if (!p.promo) p.promo = this.rig(t, plan.promo.side, plan.promo.to as ManKind);
        const [x, z] = onBoard(t.b, plan.promo.at);
        const f = Math.min(1, e);
        p.actors[0].root.scale.setScalar(Math.max(0.001, 1 - f));
        p.promo.root.position.set(x, t.b.top, z);
        p.promo.root.rotation.set(0, FACE[plan.promo.side], 0);
        p.promo.root.scale.setScalar(Math.max(0.001, f));
        pose(p.promo, "salute", 1 - f);
        if (!p.shards) p.shards = this.shardsAt(t, x, z, plan.promo.side, 7 + plan.move.to, 8);
        if (!plan.victim) this.shardsFrame(t, p, (e * PROMO_MORPH) / 2, null);
      }
    }
  }

  // the moves' sounds (plan 70 phase 6): each moment as it's passed — a man's steps along his way, the
  // rook's grind, the bishop's glide, the knight rearing and landing, the blow drawn back and landing,
  // the taken man crumbling and his chips swept off, a promotion
  private playSounds(t: TableState, p: Playing, s: number) {
    const was = p.was;
    p.was = s;
    if (!this.onSound) return;
    const passed = (at: number) => was < at && at <= s;
    const plan = p.plan;
    const say = (kind: string, at: Fr, len?: number) => {
      const [x, z] = onBoard(t.b, at);
      const w = new Vector3(x, t.b.top, z).applyMatrix4(t.group.matrix);
      this.onSound?.(kind, w.x, w.z, { wood: t.set === 0, len });
    };
    plan.actors.forEach((a, i) => {
      for (const leg of a.legs) {
        if (leg.kind === "act") {
          if (passed(leg.t0) && (leg.pose === "rear" || leg.pose === "land" || leg.pose === "windup"))
            say(leg.pose, leg.from);
          continue;
        }
        if (leg.kind !== "go") continue;
        const len = leg.t1 - leg.t0;
        if (leg.gait === "r" && passed(leg.t0)) say("grind", leg.from, len);
        else if (leg.gait === "b" && passed(leg.t0)) say("glide", leg.from, len);
        else if (leg.gait !== "n" && leg.gait !== "r" && leg.gait !== "b") {
          // (footfalls: a pawn's hops, a king's slow tread, a queen's strides)
          const every = leg.gait === "p" ? 0.24 : leg.gait === "k" ? 0.36 : 0.26;
          for (let f = leg.t0 + every * 0.5; f < leg.t1; f += every)
            if (passed(f)) say(leg.gait === "p" || leg.gait === "trot" ? "step" : "tread", actorAt(plan, i, f).at);
        }
      }
      if (passed(a.end)) say("step", a.to);
    });
    if (plan.victim) {
      if (passed(plan.victim.breakAt)) {
        say("hit", plan.victim.at);
        say("crumble", plan.victim.at);
      }
      if (passed(plan.victim.breakAt + 0.9)) say("sweep", plan.victim.at);
    }
    if (plan.promo && passed(plan.promo.at_s)) say("morph", plan.promo.at);
  }
  /** The men's sounds (the chess chunk's: heard from where the table is): what, where (the floor's x, z). */
  onSound: ((kind: string, x: number, z: number, o: { wood: boolean; len?: number }) => void) | null = null;

  // chips: a broken man's (or a promoted pawn's) bits, flying out, falling, then swept off the board to
  // the heap; dust puffing out and fading
  private shardsAt(t: TableState, x: number, z: number, side: Side, seed: number, n = 14): Group {
    const g = new Group();
    const R = rnd(seed);
    const s = t.b.unit / UNIT;
    const col = SETS[t.set].body[side === "w" ? 0 : 1];
    for (let i = 0; i < n; i++) {
      const r = (0.002 + R() * 0.004) * s * (i < 3 ? 1.5 : 1);
      const m = new Mesh(
        new DodecahedronGeometry(r, 0).scale(1, 0.55 + R() * 0.7, 0.7 + R() * 0.5),
        this.shardMat(col),
      );
      const a = R() * Math.PI * 2;
      m.userData.v = [
        Math.cos(a) * (0.08 + R() * 0.18) * s,
        (0.25 + R() * 0.35) * s,
        Math.sin(a) * (0.08 + R() * 0.18) * s,
      ];
      m.userData.p0 = [x, t.b.top + (0.01 + R() * 0.03) * s, z];
      m.userData.spin = [R() * 12, R() * 12];
      m.userData.r = r;
      m.castShadow = true;
      g.add(m);
    }
    t.group.add(g);
    return g;
  }
  private shardsFrame(t: TableState, p: Playing, s: number, swept: Side | null) {
    const g = p.shards;
    if (!g) return;
    const k = t.b.unit / UNIT;
    const heap = swept ? t.b.heaps[swept === "w" ? 0 : 1] : null;
    for (const m of g.children) {
      const v = m.userData.v as number[];
      const p0 = m.userData.p0 as number[];
      const r = m.userData.r as number;
      const tt = Math.max(0, Math.min(s, 0.6));
      let x = p0[0] + v[0] * tt;
      let z = p0[2] + v[2] * tt;
      const y = Math.max(t.b.top + r * 0.5, p0[1] + v[1] * tt - 4.9 * k * tt * tt);
      // (swept off to its side's heap past the board's edge, from 0.9 s on; a promotion's just fade)
      const e = Math.max(0, Math.min(1, (s - 0.9) / 0.7));
      if (heap && e > 0) {
        const ease = e * e * (3 - 2 * e);
        x += (heap[0] - x) * ease;
        z += (heap[1] - z) * ease;
      }
      m.visible = e < 1;
      m.position.set(x, y, z);
      const spin = m.userData.spin as number[];
      m.rotation.set(spin[0] * tt, spin[1] * tt, 0);
    }
    const d = p.dust;
    if (d) {
      const e = Math.max(0, Math.min(1, s / 1.2));
      d.scale.setScalar(0.6 + e * 1.4);
      this.dustMat.opacity = 0.5 * (1 - e);
      d.visible = e < 1;
    }
  }
  private dustAt(t: TableState, x: number, z: number, seed: number): Group {
    const g = new Group();
    const R = rnd(seed + 99);
    const s = t.b.unit / UNIT;
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(new IcosahedronGeometry((0.004 + R() * 0.006) * s, 0), this.dustMat);
      const a = R() * Math.PI * 2;
      const r = 0.02 * s * (0.4 + R() * 0.6);
      m.position.set(Math.cos(a) * r, (0.004 + R() * 0.02) * s, Math.sin(a) * r);
      g.add(m);
    }
    g.position.set(x, t.b.top, z);
    t.group.add(g);
    return g;
  }
  private shardMat(col: number): Material {
    let m = this.shardMats.get(col);
    if (!m) {
      m = litMaterial({ color: col });
      this.shardMats.set(col, m);
    }
    return m;
  }

  // ── the heaps: each side's losses as rubble by the board ──────────────────────────────────────
  private heapsFor(t: TableState) {
    const lost = lostOf(t.board);
    const key = `${t.set}|${lost[0].join("")}|${lost[1].join("")}`;
    if (key === t.heapKey) return;
    t.heapKey = key;
    if (t.heaps) t.group.remove(t.heaps);
    const g = new Group();
    const s = t.b.unit / UNIT;
    lost.forEach((men, si) => {
      if (!men.length) return;
      const side: Side = si === 0 ? "w" : "b";
      const [hx, hz] = t.b.heaps[si];
      const R = rnd(si * 131 + men.length * 7);
      const col = SETS[t.set].body[si];
      // (chips piled: the more lost, the bigger the heap)
      const n = Math.min(60, 6 + men.length * 5);
      const wide = (0.025 + men.length * 0.004) * s;
      for (let i = 0; i < n; i++) {
        const r = (0.003 + R() * 0.006) * s;
        const m = new Mesh(
          new DodecahedronGeometry(r, 0).scale(1, 0.6 + R() * 0.6, 0.7 + R() * 0.5),
          this.shardMat(col),
        );
        const a = R() * Math.PI * 2;
        const d = Math.sqrt(R()) * wide;
        m.position.set(hx + Math.cos(a) * d, t.b.heapTop + r * (0.5 + (1 - d / wide) * 1.4), hz + Math.sin(a) * d);
        m.rotation.set(R() * 6, R() * 6, R() * 6);
        m.castShadow = true;
        g.add(m);
      }
      // (the most worth of what's lost lies on top of it, broken: its head gone)
      const lying = celRig(makeMan(men[0], side, SETS[t.set], this.mat, t.b.unit));
      if (lying.part.head) lying.part.head.visible = false;
      lying.root.position.set(hx + 0.01 * s, t.b.heapTop + 0.018 * s, hz);
      lying.root.rotation.set(0, 0.7 + si, Math.PI / 2, "YXZ");
      g.add(lying.root);
    });
    t.heaps = g;
    t.group.add(g);
  }

  // ── the end of a game, a check ────────────────────────────────────────────────────────────────
  private clearEnding(t: TableState) {
    t.ending?.crown?.parent?.remove(t.ending.crown);
    t.ending = null;
  }
  /** Start (or set at once, seen late) a table's ending from its game: a mate or a resignation, a draw. */
  private startEnding(t: TableState, afterMove: boolean) {
    const over = String(t.o.props?.over ?? "");
    const pos = safeFen(t.fen);
    const end = outcome(pos);
    const loser: Side | null =
      over === "resign" ? (t.o.props?.loser === "b" ? "b" : "w") : end === "mate" ? pos.turn : null;
    const draw = !loser && (over === "agreed" || end === "stalemate" || end === "fifty" || end === "material");
    if (!loser && !draw) return;
    const at = Number(t.o.props?.lastAt) || 0;
    const fresh = afterMove || (!!at && Math.abs(Date.now() - at) < 10_000);
    const t0 = fresh ? this.now + (t.play ? t.play.plan.duration : 0) : this.now - 60;
    t.ending = { kind: loser ? "beaten" : "draw", loser, t0, crown: null };
  }
  private endingFrame(t: TableState) {
    const pos = safeFen(t.fen);
    // a king in check: his guard up, turned to the man that gave it (the last to move)
    if (!t.ending && inCheck(pos)) {
      const k = kingOf(pos, pos.turn);
      const r = t.rigs.get(k);
      const last = Array.isArray(t.o.props?.last) ? (t.o.props.last as number[])[1] : -1;
      if (r && !t.play) {
        if (t.guarded !== t.fen) {
          t.guarded = t.fen;
          const [gx, gz] = squareOn(t.b, k);
          const q = new Vector3(gx, t.b.top, gz).applyMatrix4(t.group.matrix);
          this.onSound?.("guard", q.x, q.z, { wood: t.set === 0 });
        }
        pose(r, "guard");
        if (last >= 0) {
          const [kf, kr] = sqToFr(k);
          const [lf, lr] = sqToFr(last);
          r.root.rotation.y = rigYaw(Math.atan2(lf - kf, lr - kr));
        }
      }
      return;
    }
    const e = t.ending;
    if (!e || t.play) return;
    const s = this.now - e.t0;
    if (s < 0) return;
    const grow = t.b.unit / UNIT;
    if (e.kind === "draw") {
      for (const side of ["w", "b"] as const) {
        const r = t.rigs.get(kingOf(pos, side));
        if (r) pose(r, "bow", Math.min(1, s / 0.6));
      }
      return;
    }
    const loser = e.loser as Side;
    const k = kingOf(pos, loser);
    const king = t.rigs.get(k);
    if (!king) return;
    king.root.rotation.y = FACE[loser];
    // beaten (0–0.6 s), the crown taken off (0.6–1.4), dropped (1.4–1.9), rolling to rest before him
    if (s < 0.6) pose(king, "beaten", s / 0.6);
    else if (s < 1.4) {
      pose(king, "uncrown", Math.min(1, (s - 0.6) / 0.4));
      if (king.part.crown && king.part.handL && king.part.crown.parent !== king.part.handL) {
        king.part.handL.add(king.part.crown);
        king.part.crown.position.set(0, 0.03, 0);
        king.part.crown.rotation.set(0.5, 0, -0.3);
      }
    } else {
      pose(king, "beaten");
      if (king.part.crown) king.part.crown.visible = false;
      if (!e.crown) {
        const c = new Mesh(celRgba(crownGeometry(true, loser, SETS[t.set], t.b.unit)), this.mat);
        c.castShadow = true;
        const g = new Group();
        g.add(c);
        t.group.add(g);
        e.crown = g;
      }
      const [kx, kz] = squareOn(t.b, k);
      const toward = loser === "w" ? 1 : -1;
      const rx = kx + toward * t.b.sq * 0.6;
      const rz = kz + t.b.sq * 0.25;
      if (!e.rang) {
        e.rang = true;
        const w = new Vector3(rx, t.b.top, rz).applyMatrix4(t.group.matrix);
        this.onSound?.("crown", w.x, w.z, { wood: t.set === 0 });
      }
      const f = Math.min(1, (s - 1.4) / 0.5);
      const bounce = Math.abs(Math.sin(f * Math.PI * 2.5)) * (1 - f) * 0.02 * grow;
      const high = (1 - f) * (1 - f) * 0.07 * grow;
      e.crown.position.set(kx + (rx - kx) * f, t.b.top + 0.0035 * grow + high + bounce, kz + (rz - kz) * f);
      e.crown.rotation.set(0, 0.6 + f * 2.4, (Math.PI / 2 - 0.35) * Math.min(1, f * 1.3), "YXZ");
    }
    // the winners' weapons up for a while
    for (const [i, r] of t.rigs) {
      if (i === k || sideOf(t.board[i]) === loser) continue;
      const c = s > 1.4 && s < 5 ? Math.min(1, (s - 1.4) / 0.4) * Math.min(1, (5 - s) / 0.6) : 0;
      pose(r, c > 0 ? "cheer" : "rest", c);
    }
  }

  // ── idle life at the focus: breathing, looking at what's going on ──────────────────────────────
  private idleFrame(t: TableState) {
    if (t.o.id === this.focusId) {
      const pos = safeFen(t.fen);
      const look = t.ui?.hover ?? t.ui?.picked ?? null;
      for (const [i, r] of t.rigs) {
        if (r.kind === "k" && (t.ending || inCheck(pos))) continue;
        if (t.ending?.kind === "beaten" && sideOf(t.board[i]) !== t.ending.loser) continue;
        const breath = Math.sin(this.now * 1.6 + i * 1.37) * 0.025;
        pose(r, { body: [breath, 0, 0], head: [-breath * 0.6, 0, 0] });
        // (heads turned to the square the player points at)
        if (look != null && look !== i && r.part.head) {
          const [f, rk] = sqToFr(i);
          const [lf, lr] = sqToFr(look);
          const want = Math.atan2(lf - f, lr - rk) - (sideOf(t.board[i]) === "w" ? 0 : Math.PI);
          const turn = Math.atan2(Math.sin(want), Math.cos(want));
          r.part.head.rotation.y = -Math.max(-0.7, Math.min(0.7, turn));
        }
      }
    }
    const ui = t.ui;
    if (!ui) return;
    if (ui.picked != null) {
      const r = t.rigs.get(ui.picked);
      if (r) pose(r, "salute");
    }
    for (const i of ui.takes) {
      const r = t.rigs.get(i);
      if (r) pose(r, "flinch", 0.8);
    }
  }

  // ── the marks on squares ──────────────────────────────────────────────────────────────────────
  private drawMarks(t: TableState) {
    t.marks.clear();
    const ui = t.ui;
    if (!ui) return;
    const put = (i: number, kind: string, scale = 1) => {
      const [x, z] = squareOn(t.b, i);
      const m = new Mesh(this.runeGeo(t.b), this.runeMat(kind));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, t.b.top + 0.0008 * (t.b.unit / UNIT), z);
      m.scale.setScalar(scale);
      m.renderOrder = 3;
      t.marks.add(m);
    };
    if (ui.hover != null) put(ui.hover, "hover", 0.9);
    if (ui.picked != null) put(ui.picked, "sel");
    for (const i of ui.moves) put(i, "move");
    for (const i of ui.takes) put(i, "take");
  }
  private runeGeo(b: Board): PlaneGeometry {
    let g = this.runeGeos.get(b.sq);
    if (!g) {
      g = new PlaneGeometry(b.sq * 0.98, b.sq * 0.98);
      this.runeGeos.set(b.sq, g);
    }
    return g;
  }
  private runeMat(kind: string): MeshBasicMaterial {
    let m = this.runeMats.get(kind);
    if (!m) {
      this.runeTex ??= runeTexture();
      const color = { take: 0xff5a30, sel: 0xfff0c8, move: 0xffc65a, hover: 0x9fd8ff }[kind] ?? 0xffc65a;
      m = new MeshBasicMaterial({
        map: this.runeTex,
        color,
        transparent: true,
        opacity: kind === "hover" ? 0.5 : 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.runeMats.set(kind, m);
    }
    return m;
  }

  /** Each frame (s, a steady clock): the moves played out, the endings, the focus breathing. */
  frame(now: number): void {
    this.now = now;
    for (const t of this.tables.values()) {
      if (t.play) this.playFrame(t);
      if (!t.play && t.rigs.size === 0 && !t.ending) continue;
      this.idleFrame(t);
      this.endingFrame(t);
    }
  }

  dispose(): void {
    for (const t of this.tables.values()) this.endPlay(t);
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
    this.tables.clear();
    this.root.clear();
    this.dustMat.dispose();
    for (const m of this.runeMats.values()) m.dispose();
    this.runeTex?.dispose();
  }
}

/** (phase 9) The squares people stand in for at a board (`props.si`: square → who). */
export function standIns(o: WorldObjectDef): Set<number> {
  const si = o.props?.si;
  return new Set(si && typeof si === "object" ? Object.keys(si as object).map(Number) : []);
}

/** A rig in the world's colours (its parts' meshes RGBA, the cel's mark). */
function celRig(r: Rig): Rig {
  r.root.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (m.isMesh) celRgba(m.geometry);
  });
  return r;
}

/** The marks' rune: a soft glow, a ring, eight ticks round it. */
function runeTexture(): CanvasTexture {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.55, "rgba(255,255,255,0.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.33, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const [r0, r1] = i % 2 ? [0.36, 0.42] : [0.36, 0.46];
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(a) * s * r0, s / 2 + Math.sin(a) * s * r0);
    g.lineTo(s / 2 + Math.cos(a) * s * r1, s / 2 + Math.sin(a) * s * r1);
    g.stroke();
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}
