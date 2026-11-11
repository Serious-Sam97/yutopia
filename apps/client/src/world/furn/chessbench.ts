import { avatarFromSeed, emptyEdges, quarterYaw, setEdge, type TileMap, type WorldObjectDef } from "@yutopia/shared";
import { parseFen, START } from "@yutopia/shared/games68/chess";
import * as T from "three";
import { Post3 } from "../tp/post3d";
import { type SeatShape, seatFit } from "../tp/seats3d";
import {
  type ChessSet,
  KINDS,
  type ManKind,
  makeMan,
  NAMES,
  type Pose,
  pose,
  type Rig,
  SETS,
  type Side,
  UNIT,
} from "./fam/chessmen";
import { PLAY } from "./fam/gameroom";
import { toon } from "./kit";
import { modelOf, seedOf } from "./native";

// /dev/chess (docs/plan/70-the-chess.md, phase 0): the chess mocks. The chess table (plan 68's, its men
// taken off) in a room of the game's, the living men (fam/chessmen.ts) on it, two people sat at it,
// the game's post (ink, bloom, grain) over all. Shots:
//   ?shot=men&side=w|b&set=0..2&turn=   the six in a row, on a slab
//   ?shot=turn&k=p|r|n|b|q|k&set=        one man four ways (white front, ¾, back; black ¾)
//   ?shot=board&view=white|black|top|watch|room&set=&sel=1&hud=1&night=1   a game in the middle
//   ?shot=today&view=…                   today's table (plan 68's Staunton men), for the change
//   ?shot=story&story=knight|rook|promo|castle|check|mate&f=0..&set=   a storyboard's frame

export interface ChessOpts {
  shot: string;
  set: number;
  side: Side;
  k: ManKind;
  view: string;
  story: string;
  f: number;
  sel: boolean;
  hud: boolean;
  night: boolean;
  turn: number;
  /** Vortex in black's chair (the computer opponent), in this mood */
  vortex: string;
  w: number;
  h: number;
}

const TX = 3;
const TZ = 3;
const { x0: BX, z0: BZ, sq: SQ } = PLAY.chess_table;
const BY = PLAY.chess_table.top + 0.0005; // the men's feet on the board
const MID = "r1bq1rk1/pp2bppp/2n2n2/3p4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 3 10";

/** A square's middle (file 0..7 along z, rank 0..7 along x; fractions between), world x z. */
const at = (fi: number, ri: number): [number, number] => [TX + BX + (ri + 0.5) * SQ, TZ + BZ + (fi + 0.5) * SQ];
const fr = (name: string): [number, number] => ["abcdefgh".indexOf(name[0]), Number(name[1]) - 1];
/** facing along (dfile, drank) */
const yawTo = (df: number, dr: number) => Math.atan2(dr, df);
const FACE: Record<Side, number> = { w: Math.PI / 2, b: -Math.PI / 2 };

// ── what a frame shows ──────────────────────────────────────────────────────────────────────────
interface ManAt {
  /** the man starting on this square */
  from: string;
  /** where it is now (file, rank: fractions between squares), its height over the board (m) */
  to?: [number, number];
  y?: number;
  yaw?: number;
  pose?: string | Pose;
  hide?: boolean;
  /** (the king) his crown off his head: in his raised hand, or gone */
  crown?: "hand" | "off";
  /** tipped over (a broken man), rad round its own z */
  tip?: number;
}
interface Frame {
  fen: string;
  men: ManAt[];
  runes?: { sq: string; kind: "sel" | "move" | "take" }[];
  /** a man breaking: where, whose colour, how far on (0 whole … 1 flown apart … 2 lying, 3 swept off) */
  shards?: { at: [number, number]; side: Side; t: number; seed: number }[];
  dust?: { at: [number, number]; r: number; n: number; seed: number }[];
  ghosts?: { at: [number, number]; k: ManKind; side: Side }[];
  halo?: [number, number];
  /** a crown lying on the board, its side, tipped */
  crown?: { at: [number, number]; side: Side; yaw: number };
  heaps?: boolean;
  /** the camera: eye and look as (file, rank, m over the board), the lens */
  cam: { eye: [number, number, number]; look: [number, number, number]; fov?: number };
  cap: string;
}

const KNIGHT_DIR = yawTo(-1, 2);
const STORIES: Record<string, Frame[]> = {
  knight: (() => {
    const cam = {
      eye: [9.6, 2.4, 0.15] as [number, number, number],
      look: [5.6, 1.0, 0.03] as [number, number, number],
    };
    const f = (cap: string, m: Partial<ManAt>, x: Partial<Frame> = {}): Frame => ({
      fen: START,
      men: [{ from: "g1", ...m }],
      cam,
      cap,
      ...x,
    });
    return [
      f(
        "1 · picked: the knight salutes, its squares glow",
        { pose: "salute" },
        {
          runes: [
            { sq: "g1", kind: "sel" },
            { sq: "f3", kind: "move" },
            { sq: "h3", kind: "move" },
          ],
          cam: { eye: [8.6, -1.4, 0.2], look: [5.8, 1.4, 0.02] },
        },
      ),
      f("2 · it turns to face f3", { yaw: KNIGHT_DIR, pose: "step" }, { runes: [{ sq: "f3", kind: "move" }] }),
      f("3 · rears", { yaw: KNIGHT_DIR, pose: "rear" }, { runes: [{ sq: "f3", kind: "move" }] }),
      f("4 · leaps the pawns", { to: [5.5, 1.0], y: 0.055, yaw: KNIGHT_DIR, pose: "leap" }),
      f(
        "5 · lands hard",
        { to: [5, 2], yaw: KNIGHT_DIR, pose: "land" },
        { dust: [{ at: [5, 2], r: 0.03, n: 14, seed: 3 }] },
      ),
      f("6 · turns back to face the enemy", { to: [5, 2], yaw: FACE.w, pose: "rest" }),
    ];
  })(),
  rook: (() => {
    const fen = "r3k2r/ppp2ppp/2n1bn2/3p4/8/2N2N2/PPP2PPP/3RKB1R w Kkq - 0 12";
    const side = {
      eye: [-2.2, 3.3, 0.13] as [number, number, number],
      look: [3, 3.4, 0.03] as [number, number, number],
    };
    const f = (cap: string, men: ManAt[], x: Partial<Frame> = {}): Frame => ({ fen, men, cam: side, cap, ...x });
    return [
      f(
        "1 · the rook picked; the pawn on d5 sees it coming",
        [
          { from: "d1", pose: "salute" },
          { from: "d5", pose: "flinch" },
        ],
        {
          runes: [
            { sq: "d1", kind: "sel" },
            { sq: "d2", kind: "move" },
            { sq: "d3", kind: "move" },
            { sq: "d4", kind: "move" },
            { sq: "d5", kind: "take" },
          ],
          cam: { eye: [3.0, -1.9, 0.11], look: [3, 4, 0.03] },
        },
      ),
      f(
        "2 · it grinds up the file",
        [
          { from: "d1", to: [3, 2.2], yaw: 0 + FACE.w, pose: "step" },
          { from: "d5", pose: "flinch" },
        ],
        { dust: [{ at: [3, 1.5], r: 0.022, n: 12, seed: 5 }] },
      ),
      f("3 · one square short, it draws back its fist", [
        { from: "d1", to: [3, 3.05], pose: "windup" },
        { from: "d5", pose: "flinch" },
      ]),
      f(
        "4 · the blow: the pawn cracks apart",
        [
          { from: "d1", to: [3, 3.3], pose: "strike" },
          { from: "d5", hide: true },
        ],
        {
          shards: [{ at: [3, 4], side: "b", t: 1, seed: 7 }],
          dust: [{ at: [3, 4], r: 0.035, n: 18, seed: 8 }],
        },
      ),
      f(
        "5 · it steps in; the rubble's swept off the board",
        [
          { from: "d1", to: [3, 4], pose: "step" },
          { from: "d5", hide: true },
        ],
        { shards: [{ at: [1.2, 4], side: "b", t: 2, seed: 7 }] },
      ),
      f(
        "6 · the rubble heaped by the board, at white's left",
        [
          { from: "d1", to: [3, 4], pose: "rest" },
          { from: "d5", hide: true },
        ],
        { heaps: true, cam: { eye: [-3.4, 1.0, 0.3], look: [1.5, 3.6, 0.0], fov: 40 } },
      ),
    ];
  })(),
  promo: (() => {
    const fen = "6k1/1P3ppp/8/8/8/8/5PPP/6K1 w - - 0 40";
    const cam = {
      eye: [3.6, 8.9, 0.13] as [number, number, number],
      look: [1.0, 6.7, 0.035] as [number, number, number],
    };
    const f = (cap: string, men: ManAt[], x: Partial<Frame> = {}): Frame => ({ fen, men, cam, cap, ...x });
    return [
      f("1 · the pawn on b7 picked", [{ from: "b7", pose: "salute" }], {
        runes: [
          { sq: "b7", kind: "sel" },
          { sq: "b8", kind: "move" },
        ],
      }),
      f("2 · it reaches the far rank and glows", [{ from: "b7", to: [1, 7], pose: "rest" }], { halo: [1, 7] }),
      f("3 · four ghosts rise round it: pick one", [{ from: "b7", to: [1, 7], pose: "salute" }], {
        halo: [1, 7],
        ghosts: [
          { at: [0.05, 6.35], k: "q", side: "w" },
          { at: [1.0, 6.05], k: "r", side: "w" },
          { at: [1.95, 6.35], k: "b", side: "w" },
          { at: [2.3, 7.2], k: "n", side: "w" },
        ],
      }),
      f("4 · the pawn bursts into the queen", [{ from: "b7", hide: true }], {
        ghosts: [{ at: [1, 7], k: "q", side: "w" }],
        shards: [{ at: [1, 7], side: "w", t: 0.7, seed: 11 }],
        halo: [1, 7],
      }),
      f("5 · a queen", [{ from: "b7", hide: true }], {
        shards: [{ at: [1, 7], side: "w", t: 2, seed: 11 }],
      }),
    ];
  })(),
  castle: (() => {
    const fen = "r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R2QK2R w KQkq - 0 8";
    const cam = {
      eye: [6.0, -2.0, 0.16] as [number, number, number],
      look: [5.4, 0.6, 0.03] as [number, number, number],
    };
    const f = (cap: string, men: ManAt[]): Frame => ({ fen, men, cam, cap });
    return [
      f("1 · castling: the king walks two squares", [
        { from: "e1", to: [4.7, 0], yaw: yawTo(1, 0), pose: "step" },
        { from: "h1", pose: "rest" },
      ]),
      f("2 · the rook steps round him", [
        { from: "e1", to: [6, 0], yaw: yawTo(1, 0) - 0.6, pose: "rest" },
        { from: "h1", to: [6.7, 0.55], yaw: yawTo(-1, 0.6), pose: "step" },
      ]),
      f("3 · …in front of him, to f1", [
        { from: "e1", to: [6, 0], yaw: FACE.w, pose: "rest" },
        { from: "h1", to: [5.35, 0.45], yaw: yawTo(-1, -0.6), pose: "step" },
      ]),
      f("4 · done", [
        { from: "e1", to: [6, 0], yaw: FACE.w, pose: "rest" },
        { from: "h1", to: [5, 0], yaw: FACE.w, pose: "rest" },
      ]),
    ];
  })(),
  check: (() => {
    const fen = "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";
    const B = yawTo(-4, 4);
    const toB = yawTo(-3, -3);
    return [
      {
        fen,
        men: [{ from: "f1", to: [3, 2], yaw: B, pose: "step" }],
        cam: { eye: [3.8, -1.7, 0.18], look: [2.4, 4.4, 0.03] },
        cap: "1 · the bishop glides out",
      },
      {
        fen,
        men: [
          { from: "f1", to: [1, 4], yaw: yawTo(3, 3), pose: "salute" },
          { from: "e8", yaw: toB, pose: "guard" },
          { from: "d8", pose: { head: [0, 0.7, 0] } },
          { from: "c7", pose: { head: [0.1, 0.6, 0] } },
          { from: "f7", pose: { head: [0, -0.6, 0] } },
        ],
        cam: { eye: [5.8, 9.4, 0.21], look: [2.2, 5.0, 0.02] },
        cap: "2 · check: the king turns to it, sword up; his men look round",
      },
      {
        fen,
        men: [
          { from: "f1", to: [1, 4], yaw: yawTo(3, 3), pose: "salute" },
          { from: "e8", yaw: toB, pose: "guard" },
          { from: "d8", pose: { head: [0, 0.7, 0] } },
          { from: "c7", pose: { head: [0.1, 0.6, 0] } },
        ],
        cam: { eye: [0.2, 3.1, 0.07], look: [4, 7, 0.05], fov: 34 },
        cap: "3 · from the bishop",
      },
    ];
  })(),
  mate: (() => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
    const Q: ManAt = { from: "d8", to: [7, 3], yaw: yawTo(-3, -3), pose: { armR: [-1.45, 0, 0], body: [0.1, 0, 0] } };
    const toQ = yawTo(3, 3);
    return [
      {
        fen,
        men: [Q, { from: "e1", yaw: toQ, pose: "guard" }],
        cam: { eye: [2.4, -1.2, 0.1], look: [6, 2.6, 0.04] },
        cap: "1 · the queen to h4: mate",
      },
      {
        fen,
        men: [Q, { from: "e1", pose: "beaten" }],
        cam: { eye: [5.4, 1.6, 0.07], look: [4, 0, 0.05], fov: 34 },
        cap: "2 · the king lowers his sword",
      },
      {
        fen,
        men: [Q, { from: "e1", pose: "uncrown", crown: "hand" }],
        cam: { eye: [5.4, 1.6, 0.07], look: [4, 0, 0.055], fov: 34 },
        cap: "3 · takes off his crown",
      },
      {
        fen,
        men: [Q, { from: "e1", pose: "beaten", crown: "off" }],
        crown: { at: [4.6, 0.6], side: "w", yaw: 0.6 },
        cam: { eye: [6.3, 2.0, 0.055], look: [4.3, 0.25, 0.02], fov: 40 },
        cap: "4 · and drops it on the board",
      },
      {
        fen,
        men: [
          { ...Q, pose: "cheer" },
          { from: "e1", pose: "beaten", crown: "off" },
          { from: "e5", pose: "cheer" },
          { from: "f7", pose: "cheer" },
          { from: "g8", pose: "cheer" },
          { from: "c8", pose: "cheer" },
          { from: "b8", pose: "cheer" },
        ],
        crown: { at: [4.6, 0.6], side: "w", yaw: 0.6 },
        cam: { eye: [5.3, -1.0, 0.11], look: [6.3, 3.6, 0.045], fov: 40 },
        cap: "5 · black's men raise their weapons",
      },
    ];
  })(),
};

// ── the board's views (table-local x z, m up) ───────────────────────────────────────────────────
const VIEWS: Record<
  string,
  { eye: [number, number, number]; look: [number, number, number]; fov: number; cap: string }
> = {
  white: { eye: [0.44, 1.24, 0.6], look: [1.06, 0.72, 0.5], fov: 43, cap: "from white's chair" },
  black: { eye: [1.56, 1.24, 0.4], look: [0.94, 0.72, 0.5], fov: 43, cap: "from black's chair" },
  // the lean-in camera (the user's pick, 2026-11-04): low behind your men, the board ahead at their height
  lean: { eye: [0.54, 0.935, 0.5], look: [1.08, 0.735, 0.5], fov: 54, cap: "lean-in, behind white's men" },
  "lean-black": { eye: [1.46, 0.935, 0.5], look: [0.92, 0.735, 0.5], fov: 54, cap: "lean-in, behind black's men" },
  "lean-mid": { eye: [0.5, 1.02, 0.52], look: [1.06, 0.73, 0.5], fov: 46, cap: "lean-in, one notch out on the wheel" },
  top: { eye: [0.84, 1.6, 0.5], look: [1.0, 0.72, 0.5], fov: 38, cap: "over the top (wheel out)" },
  watch: { eye: [1.0, 1.28, 1.5], look: [1.0, 0.74, 0.5], fov: 40, cap: "a watcher's, from the side" },
  room: { eye: [3.8, 1.9, 3.4], look: [1.0, 0.8, 0.5], fov: 38, cap: "the table in the room" },
  // (shot=world) the second table, turned a quarter, a game just begun
  turned: { eye: [4.6, 1.45, 3.2], look: [3.5, 0.74, 2.0], fov: 36, cap: "a table turned a quarter, in the world" },
};

// ── the bits round the men ──────────────────────────────────────────────────────────────────────
function runeTexture(): T.Texture {
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
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

const rnd = (s: number) => {
  let x = s * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
};

export async function runChess(el: HTMLElement, o: ChessOpts): Promise<() => void> {
  const { World3 } = await import("../tp/build");
  const C = await import("../chars");
  await C.loadHero();
  const set: ChessSet = SETS[o.set] ?? SETS[1];
  const frame: Frame | null = o.shot === "story" ? (STORIES[o.story]?.[o.f] ?? null) : null;

  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(o.w, o.h);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  C.inkResolution(o.w, o.h);
  const scene = new T.Scene();
  scene.background = new T.Color(o.night ? "#121318" : "#cfc8bb");
  const camera = new T.PerspectiveCamera(40, o.w / o.h, 0.02, 100);

  // ── the room ──
  const W = 9;
  const H = 9;
  const map: TileMap = {
    key: "chess",
    name: "chess",
    width: W,
    height: H,
    tiles: [" ".repeat(W), ...Array.from({ length: H - 1 }, () => ` ${".".repeat(W - 1)}`)],
    ...emptyEdges(W, H),
    spawn: { x: 2.5, y: 4.5 },
    areas: [],
    objects: [],
  };
  for (let x = 1; x < W; x++) setEdge(map, { x, y: 1, dir: "h" }, "p");
  for (let y = 1; y < H; y++) setEdge(map, { x: 1, y, dir: "v" }, "p");
  let id = "t0";
  for (let i = 0; i < 400; i++)
    if (Math.abs(seedOf(`t${i}`) - 0.62) < 0.03) {
      id = `t${i}`;
      break;
    }
  // (plan 70 phase 1: `shot=world` — the tables placed in the floor, drawn by the game's own World3,
  // the men by its chessmen3d: one as the bench's, one turned a quarter with a game just begun)
  const inWorld = o.shot === "world";
  const placed: WorldObjectDef[] = inWorld
    ? [
        { id, kind: "chess_table", x: TX, y: TZ, yaw: 0, props: { variant: o.set, fen: MID } },
        {
          id: "w2",
          kind: "chess_table",
          x: TX + 3,
          y: TZ + 1,
          yaw: Math.PI / 2,
          props: { variant: (o.set + 1) % 3, fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" },
        },
      ]
    : [];
  const world = new World3(map, placed, 8);
  scene.add(world.root);
  (window as unknown as { __world?: unknown }).__world = world;

  const mat = toon();
  const today = o.shot === "today";
  const showTable = o.shot !== "men" && o.shot !== "turn" && !inWorld;
  const tableDef: WorldObjectDef = {
    id,
    kind: "chess_table",
    x: 0,
    y: 0,
    yaw: quarterYaw(0),
    props: { variant: o.set, fen: today ? MID : "8/8/8/8/8/8/8/8 w - - 0 1" },
  };
  if (showTable) {
    const table = new T.Mesh(modelOf(tableDef), mat);
    table.position.set(TX, 0, TZ);
    table.castShadow = true;
    table.receiveShadow = true;
    scene.add(table);
  }

  // ── the men ──
  const rigs = new Map<string, Rig>();
  const put = (r: Rig, x: number, z: number, y: number, yaw: number) => {
    r.root.position.set(x, y, z);
    r.root.rotation.y = yaw;
    scene.add(r.root);
  };
  let cap = "";
  if (o.shot === "men" || o.shot === "turn") {
    // a slab of the table's wood, the men on it
    const top = [0x5a3a22, 0x8f9093, 0x1c1a19][o.set] ?? 0x5a3a22;
    const slab = new T.Mesh(new T.BoxGeometry(0.62, 0.72, 0.2), new T.MeshLambertMaterial({ color: top }));
    slab.position.set(4.5, 0.36, 2.4);
    slab.receiveShadow = true;
    scene.add(slab);
    if (o.shot === "men") {
      KINDS.forEach((k, i) => {
        const r = makeMan(k, o.side, set, mat);
        pose(r, "rest");
        put(r, 4.5 - 0.225 + i * 0.09, 2.42, 0.72, o.turn + (k === "n" ? 0.75 : 0));
      });
      cap = `${set.name} · ${o.side === "w" ? "white" : "black"} · pawn rook knight bishop queen king`;
    } else {
      const ways: [Side, number][] = [
        ["w", 0],
        ["w", 0.8],
        ["b", -0.8],
        ["w", Math.PI],
      ];
      ways.forEach(([s, yaw], i) => {
        const r = makeMan(o.k, s, set, mat);
        pose(r, "rest");
        put(r, 4.5 - 0.165 + i * 0.11, 2.42, 0.72, yaw);
      });
      cap = `${set.name} · ${NAMES[o.k]} · front, ¾, black ¾, back`;
    }
  } else if (!today && !inWorld) {
    const fen = frame?.fen ?? MID;
    const pos = parseFen(fen);
    pos.board.forEach((c, i) => {
      if (!c) return;
      const side: Side = c === c.toUpperCase() ? "w" : "b";
      const r = makeMan(c.toLowerCase() as ManKind, side, set, mat);
      const f = i % 8;
      const rk = 7 - Math.floor(i / 8);
      const [x, z] = at(f, rk);
      put(r, x, z, BY, FACE[side]);
      pose(r, "rest");
      rigs.set("abcdefgh"[f] + (rk + 1), r);
    });
    // (a picked man in the middle game: the knight on c3; its squares; the pawn it could take flinching)
    if (!frame && o.sel) {
      const n = rigs.get("c3");
      if (n) pose(n, "salute");
      const p = rigs.get("d5");
      if (p) {
        pose(p, "flinch");
        p.root.rotation.y = FACE.b + 0.5;
      }
    }
    for (const m of frame?.men ?? []) {
      const r = rigs.get(m.from);
      if (!r) continue;
      if (m.hide) {
        r.root.visible = false;
        continue;
      }
      if (m.to) {
        const [x, z] = at(m.to[0], m.to[1]);
        r.root.position.set(x, BY + (m.y ?? 0), z);
      }
      if (m.yaw !== undefined) r.root.rotation.y = m.yaw;
      if (m.pose) pose(r, m.pose);
      if (m.crown && r.part.crown) {
        if (m.crown === "off") r.part.crown.visible = false;
        else if (r.part.handL) {
          r.part.handL.add(r.part.crown);
          r.part.crown.position.set(0, 0.03, 0);
          r.part.crown.rotation.set(0.5, 0, -0.3);
        }
      }
    }
  }

  // ── runes on squares, ghosts, a halo, shards, dust, a dropped crown, the heaps ──
  const runeTex = runeTexture();
  const runes =
    frame?.runes ??
    (o.shot === "board" && o.sel
      ? [
          { sq: "c3", kind: "sel" as const },
          ...["a4", "b5", "e4", "e2", "b1"].map((s) => ({ sq: s, kind: "move" as const })),
          { sq: "d5", kind: "take" as const },
        ]
      : []);
  for (const r of runes) {
    const [fi, ri] = fr(r.sq);
    const [x, z] = at(fi, ri);
    const m = new T.Mesh(
      new T.PlaneGeometry(SQ * 0.98, SQ * 0.98),
      new T.MeshBasicMaterial({
        map: runeTex,
        color: r.kind === "take" ? 0xff5a30 : r.kind === "sel" ? 0xfff0c8 : 0xffc65a,
        transparent: true,
        opacity: r.kind === "sel" ? 0.85 : 0.75,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, BY + 0.0008, z);
    scene.add(m);
  }
  const ghostMat = new T.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.24,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  for (const g of frame?.ghosts ?? []) {
    const r = makeMan(g.k, g.side, set, frame?.shards?.length ? mat : ghostMat);
    pose(r, "rest");
    const [x, z] = at(...g.at);
    put(r, x, z, BY + (frame?.shards?.length ? 0 : 0.015), FACE[g.side]);
    if (frame?.shards?.length) r.root.scale.setScalar(0.9);
  }
  if (frame?.halo) {
    const [x, z] = at(...frame.halo);
    const halo = new T.Mesh(
      new T.SphereGeometry(0.03, 16, 12),
      new T.MeshBasicMaterial({
        color: 0xffc65a,
        transparent: true,
        opacity: 0.12,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    halo.position.set(x, BY + 0.035, z);
    halo.scale.set(1, 1.3, 1);
    scene.add(halo);
    const glow = new T.PointLight(0xffc06a, 0.6, 0.4, 1.2);
    glow.position.set(x, BY + 0.05, z);
    scene.add(glow);
  }
  const shardMats = new Map<number, T.Material>();
  const shards = (cx: number, cz: number, side: Side, t: number, seed: number) => {
    const R = rnd(seed);
    const col = set.body[side === "w" ? 0 : 1];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const s = (0.003 + R() * 0.006) * (i < 3 ? 1.6 : 1);
      const g = new T.DodecahedronGeometry(s, 0);
      g.scale(1, 0.55 + R() * 0.7, 0.7 + R() * 0.5);
      if (!shardMats.has(col)) shardMats.set(col, toonColor(col));
      const m = new T.Mesh(g, shardMats.get(col));
      const a = R() * Math.PI * 2;
      const out = t <= 1 ? 0.006 + t * (0.012 + R() * 0.03) : 0.004 + R() * 0.02;
      const y = t < 1.5 ? 0.008 + t * (0.01 + R() * 0.045) : s * 0.5;
      m.position.set(cx + Math.cos(a) * out, BY + y, cz + Math.sin(a) * out);
      m.rotation.set(R() * 6, R() * 6, R() * 6);
      m.castShadow = true;
      scene.add(m);
    }
  };
  for (const s of frame?.shards ?? []) {
    const [x, z] = at(...s.at);
    shards(x, z, s.side, s.t, s.seed);
    if (s.t <= 1) {
      // (what's left standing of it: its plinth, cracked, tipping)
      const r = makeMan("p", s.side, set, mat);
      for (const [k, g] of Object.entries(r.part)) if (k !== "plinth") g.visible = false;
      put(r, x + 0.004, z, BY, 0.4);
      r.root.rotation.z = 0.25;
    }
  }
  const dustMat = new T.MeshLambertMaterial({
    color: o.set === 0 ? 0xc8a878 : 0xcfcabd,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  for (const d of frame?.dust ?? []) {
    const R = rnd(d.seed);
    const [x, z] = at(...d.at);
    for (let i = 0; i < d.n; i++) {
      const m = new T.Mesh(new T.IcosahedronGeometry(0.004 + R() * 0.007, 0), dustMat);
      const a = R() * Math.PI * 2;
      const r = d.r * (0.4 + R() * 0.6);
      m.position.set(x + Math.cos(a) * r, BY + 0.003 + R() * 0.02, z + Math.sin(a) * r);
      scene.add(m);
    }
  }
  if (frame?.crown) {
    const k = makeMan("k", frame.crown.side, set, mat);
    const cr = k.part.crown;
    const [x, z] = at(...frame.crown.at);
    const g = new T.Group();
    g.scale.setScalar(UNIT);
    cr.position.set(0, 0, 0);
    g.add(cr);
    g.position.set(x, BY + 0.0035, z);
    g.rotation.set(0, frame.crown.yaw, Math.PI / 2 - 0.35, "YXZ");
    scene.add(g);
  }
  // the heaps: what each side has lost, by the board at its taker's left
  const heaps = (o.shot === "board" && !frame) || frame?.heaps;
  if (heaps) {
    const lost: [Side, number, number, number][] = [
      ["b", TX + 0.86, TZ + 0.16, 21],
      ["w", TX + 1.23, TZ + 0.82, 33],
    ];
    for (const [side, x, z, seed] of lost) {
      shards(x, z, side, 2, seed);
      shards(x + 0.03, z - 0.004, side, 2, seed + 1);
      const r = makeMan("p", side, set, mat);
      pose(r, "rest");
      put(r, x + 0.012, z, PLAY.chess_table.top + 0.0115, 0.7);
      r.root.rotation.z = Math.PI / 2;
      r.part.head.visible = false;
    }
  }

  // ── people at the table (not in the sheets) ──
  const f = new C.CharFactory();
  interface Who {
    m: InstanceType<typeof C.PersonModel>;
    mo: InstanceType<typeof C.Motion3>;
    at: [number, number];
    yaw: number;
  }
  const people: Who[] = [];
  const SEAT: SeatShape = { top: PLAY.chess_table.seat, front: 0.2, back: -0.2, lean: [0, 0.12] };
  if (showTable || inWorld) {
    const [[sx0, sz0], [sx1, sz1]] = PLAY.chess_table.seats;
    for (const [seed, x, z, yaw] of [
      [7, sx0, sz0, Math.PI / 2],
      [11, sx1, sz1, -Math.PI / 2],
    ] as const) {
      if (o.vortex && seed === 11) continue;
      const m = new C.PersonModel(f, avatarFromSeed(seed), 0);
      scene.add(m.root);
      people.push({ m, mo: new C.Motion3(0.3 + seed * 0.01), at: [TX + x, TZ + z], yaw });
    }
  }
  // Vortex over black's chair: his drawing (exactly Yondra's, as the world draws him: stand3d.ts Vortex3),
  // turned to the camera, a little bob, his face by the game
  let vortex: T.Mesh | null = null;
  let vortexReady = !o.vortex;
  if (o.vortex && showTable) {
    const { vortexSvg } = await import("../art/vortex/vortexArt");
    const svg = vortexSvg(o.vortex as "smug", "chess").replace("<svg ", '<svg width="480" height="450" ');
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const tex = new T.Texture(img);
    tex.colorSpace = T.SRGBColorSpace;
    img.decode().then(() => {
      tex.needsUpdate = true;
      vortexReady = true;
    });
    // (his 240×225 drawing at the world's size, 1.378 m wide — tp/stand3d.ts Vortex3 — sat: smaller
    // than his floating self, a seated person's size, low over the seat to peer at the board)
    const VW = 1.378 * 0.62;
    const geo = new T.PlaneGeometry(VW, (VW * 225) / 240).translate(0, (VW * 225) / 240 / 2, 0);
    vortex = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: T.DoubleSide }));
    const [sx1, sz1] = PLAY.chess_table.seats[1];
    vortex.position.set(TX + sx1 - 0.02, PLAY.chess_table.seat - 0.04, TZ + sz1);
    scene.add(vortex);
  }
  const sit = (p: Who) => {
    const m = p.m;
    if (!m.ready) return false;
    const leg = m.leg();
    const { along, recline } = seatFit(SEAT, leg.thigh);
    const drop = m.sitDrop(SEAT.top);
    const fit = { drop, stand: leg.hipY, thigh: leg.thigh, floor: 0, recline, ahead: 0, arms: null };
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const inp = {
      dist: 0,
      walking: false,
      speed: 0,
      sit: true,
      typing: false,
      speaking: false,
      emote: "",
      reduced: false,
      seat: fit,
    };
    let out = p.mo.update(1 / 60, inp);
    for (let i = 0; i < 150 && (out.settle < 1 || i < 60); i++) out = p.mo.update(1 / 60, inp);
    m.root.rotation.y = p.yaw;
    m.root.position.set(p.at[0] + along * fx, 0, p.at[1] + along * fz);
    m.setPose(out.pose, [out.lift[0], out.lift[1] + drop * out.settle, out.lift[2]], out.reach);
    return true;
  };

  // ── light: the room's, and the board's own warm pool ──
  scene.add(new T.HemisphereLight("#f3efe6", "#6c5f50", o.night ? 0.1 : 0.8));
  const key = new T.DirectionalLight("#fff3e0", o.night ? 0.06 : 1.25);
  key.position.set(TX + 5, 8, TZ + 6);
  key.target.position.set(TX + 1, 0.7, TZ + 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 20 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.01;
  scene.add(key, key.target);
  const spot = new T.SpotLight("#ffcf8a", o.night ? 5.5 : 4, 3.2, 0.42, 0.75, 1.3);
  const cx = o.shot === "men" || o.shot === "turn" ? 4.5 : TX + 1;
  const cz = o.shot === "men" || o.shot === "turn" ? 2.42 : TZ + 0.5;
  spot.position.set(cx - 0.2, 2.5, cz + 0.15);
  spot.target.position.set(cx, 0.72, cz);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 0.5;
  spot.shadow.bias = -0.0002;
  scene.add(spot, spot.target);
  if (o.night) {
    const lamp = new T.PointLight("#ffb46a", 1.5, 7, 1.4);
    lamp.position.set(TX + 3.2, 2.6, TZ + 2.6);
    scene.add(lamp);
  }

  // ── the camera ──
  if (o.shot === "men" || o.shot === "turn") {
    camera.fov = 26;
    const look = new T.Vector3(4.5, 0.72 + 0.04, 2.42);
    camera.position.set(4.5, 0.72 + 0.11, 2.42 + (o.shot === "turn" ? 0.5 : 0.66));
    camera.lookAt(look);
  } else if (frame) {
    const [ex, ez] = at(frame.cam.eye[0], frame.cam.eye[1]);
    const [lx, lz] = at(frame.cam.look[0], frame.cam.look[1]);
    camera.fov = frame.cam.fov ?? 38;
    camera.position.set(ex, BY + frame.cam.eye[2], ez);
    camera.lookAt(lx, BY + frame.cam.look[2], lz);
    cap = `${o.story} — ${frame.cap}`;
  } else {
    const v = VIEWS[o.view] ?? VIEWS.white;
    camera.fov = v.fov;
    camera.position.set(TX + v.eye[0], v.eye[1], TZ + v.eye[2]);
    camera.lookAt(TX + v.look[0], v.look[1], TZ + v.look[2]);
    cap = `${today ? "Today" : set.name} · ${v.cap}${o.night ? " · night" : ""}`;
  }
  camera.updateProjectionMatrix();

  const post = new Post3(renderer, scene, camera);
  post.setSize(o.w, o.h, renderer.getPixelRatio());
  post.setNight(o.night ? 1 : 0);

  // ── the caption, and the HUD strip's mock ──
  const label = document.createElement("div");
  label.textContent = cap;
  Object.assign(label.style, {
    position: "absolute",
    left: "18px",
    top: "16px",
    font: "600 14px ui-sans-serif, system-ui",
    letterSpacing: "0.04em",
    color: "#f3ead8",
    background: "rgba(20,18,16,.62)",
    padding: "5px 10px",
    borderRadius: "4px",
    pointerEvents: "none",
  });
  el.appendChild(label);
  if (o.hud) el.appendChild(hudStrip(o.sel, o.vortex ? "Vortex <em>rook level</em>" : "Theo"));

  let stop = false;
  let frames = 0;
  const tick = () => {
    if (stop) return;
    f.pump(40);
    let ready = 0;
    for (const p of people) {
      p.m.update();
      if (sit(p)) ready++;
    }
    if (vortex) {
      // (turned to the camera round his own up, as the world turns him)
      vortex.rotation.y = Math.atan2(camera.position.x - vortex.position.x, camera.position.z - vortex.position.z);
    }
    post.render(false);
    frames++;
    if (ready === people.length && vortexReady && frames > 30)
      (window as unknown as { __shot?: boolean }).__shot = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (window as unknown as { __chess?: unknown }).__chess = { scene, camera, rigs };
  return () => {
    stop = true;
    world.dispose();
    renderer.dispose();
    el.innerHTML = "";
  };
}

function toonColor(c: number): T.Material {
  const m = toon();
  m.vertexColors = false;
  m.color.set(c);
  return m;
}

/** The HUD strip (the manuscript-in-wood look, plan 45): names, whose move, the last moves, actions. */
function hudStrip(picked: boolean, them: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Special+Elite&display=swap">
<div class="cs">
  <div class="cs-row">
    <span class="cs-side"><i class="cs-dot w"></i>Mara <em>you</em></span>
    <span class="cs-vs">·</span>
    <span class="cs-side"><i class="cs-dot b"></i>${them}</span>
  </div>
  <div class="cs-zig"></div>
  <div class="cs-turn">${picked ? "Knight c3 — pick a square" : "White to move"}</div>
  <div class="cs-moves">8. Bd3 Bd6&nbsp;&nbsp;9. O-O O-O&nbsp;&nbsp;<b>10. …</b></div>
  <div class="cs-acts">
    <span class="cs-btn">Offer draw</span><span class="cs-btn">Resign <small>(hold)</small></span><span class="cs-btn">Get up <small>Q</small></span>
  </div>
</div>
<style>
.cs{position:absolute;right:18px;top:18px;width:300px;background:#17140f;color:#e9dfca;border:5px solid #5b3a22;
 box-shadow:inset 0 0 0 1px #2a1d12,0 6px 18px rgba(0,0,0,.45);border-radius:3px;padding:12px 14px 12px;font-family:'Special Elite',ui-monospace,monospace;font-size:12.5px}
.cs-row{display:flex;align-items:center;gap:8px;font-family:'Cormorant Garamond',serif;font-size:17px;letter-spacing:.14em;text-transform:uppercase}
.cs-side{display:flex;align-items:center;gap:7px}.cs-side em{font-style:normal;font-family:'Special Elite';font-size:10px;letter-spacing:.05em;color:#d9a85a;text-transform:none}
.cs-vs{color:#7c6a52}.cs-dot{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid #9c8a6c}.cs-dot.w{background:#e7dcc6}.cs-dot.b{background:#2a2622}
.cs-zig{height:6px;margin:8px 0 7px;background:linear-gradient(135deg,transparent 33%,#6d5338 33% 50%,transparent 50%) 0 0/8px 6px,linear-gradient(45deg,transparent 33%,#6d5338 33% 50%,transparent 50%) 0 0/8px 6px;opacity:.7}
.cs-turn{color:#f2c879;margin-bottom:4px}.cs-moves{color:#a99678;margin-bottom:10px}.cs-moves b{color:#e9dfca;font-weight:normal}
.cs-acts{display:flex;gap:6px;flex-wrap:wrap}.cs-btn{border:1px solid #6d5338;padding:3px 7px;border-radius:2px;color:#d8ccb4;background:#211b14}.cs-btn small{color:#8d7a5e}
</style>`;
  return d;
}
