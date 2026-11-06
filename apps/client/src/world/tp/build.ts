import {
  cutsSig,
  type DressItem,
  type DressKind,
  doorLeaves,
  doorShut,
  doorSlides,
  dressItems,
  edgeKey,
  entry,
  HALF_WALL,
  hangOf,
  hangStrip,
  hasActions,
  isDoorKind,
  isFloor,
  isFreeThing,
  isOpening,
  isWallEdge,
  isWindow,
  isWindowKind,
  type MapDef,
  NO_WALL,
  openingEdges,
  placedFootprint,
  quarterOf,
  rotOf,
  topCentre,
  WALL_H,
  type WallCut,
  type WorldObjectDef,
  wallCuts,
} from "@yutopia/shared";
import { crossings, slabBoxes } from "@yutopia/shared/physics/structure-solids";
import { cellOf, floorsSig, freeCuts, inRing, type Ring, type Roof, roofFaces } from "@yutopia/shared/structure";
import { ART_PX, artPx, SLAB, WALL_T } from "@yutopia/shared/units";
import {
  BackSide,
  Box3,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  FrontSide,
  type Frustum,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  type Object3D,
  PlaneGeometry,
  RedFormat,
  Shape,
  ShapeUtils,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
} from "three";
import { FloorBake, type FloorSlab } from "../art/floors";
import { piece, WALL_H as WALL_PX } from "../art/furniture";
import { INK } from "../art/items/kit";
import { type LightSource, lightSources } from "../art/light";
import { ChessMen3, isBoard } from "../furn/chessmen3d";
import { animateLive } from "../furn/liveparts";
import { isNative, isNativeDress, liveInto, nativeDressInto, nativeInto, openingInto } from "../furn/native";
import { CEL, fadePiece, type Piece, yuLit } from "../look/yulit";
import { boxInParent, type Slab } from "./below-cull";
import { type Geo, MeshSketch, type Opts3, Out } from "./kit3d";
import { edgesOfMap, type FreeWall, piecesOf, turnOut, type WallEdges } from "./walls3d";

// (the walls and posts are still the item art's drawings, measured in its px: phase 8 redraws them)
const zt = (px: number) => px / ART_PX;

import { poolTable3 } from "./pooltable3d";

// the item drawings: the same lazy chunk the iso engine loads (art/scene.ts)
export type Items = typeof import("../art/items");

// The Studio as a three.js scene, from the same data the iso engine draws:
// the floor bake (seen from above), walls on tile edges, every item drawn by
// its own sketch (in 3D), the rooms' clutter.
//   walls  — built once per layout (and again when a door or window comes,
//            goes or moves: they cut the walls); the upper part of each wall
//            run (4 edges) is its own group, to turn see-through when it hides you
//   areas  — furniture + clutter merged per 6×6-tile area; `update` redraws
//            only the areas whose things changed (a door swinging, someone
//            sitting down, a lamp switched on, build-mode edits)
//   tall   — furniture taller than 1.25 tiles stands on its own and fades too
//   floor  — baked again only when what stands on it moves

/** A cell's side (m): the floor's walls and things are merged a cell at a time, one mesh per
 *  material, cells square to the world (docs/plan/72 phase 8: an edit rebuilds only its cells). */
const CELL = 8;
const TALL = 1.25; // tiles: furniture taller than this can fade
const RUN = 4; // wall edges per fade group
// the merged meshes' fade flags: a slot per fade group, 255 drawn, 0 dropped (World3.faded)
const FLAG_W = 256;
function flagTexture(data: Uint8Array, rows: number): DataTexture {
  const t = new DataTexture(data, FLAG_W, rows, RedFormat, UnsignedByteType);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
// props that change nothing drawn (what plays, how loud)
const QUIET_PROPS = new Set(["media", "radio", "volume", "playlists"]);
// …and those of a kind (plan 70: a chess table's game — its men are drawn apart from the position,
// furn/chessmen3d.ts, so a move never redraws the table's area)
const QUIET_OF: Record<string, Set<string>> = {
  chess_table: new Set(["fen", "last", "lastAt", "over", "w", "b", "wn", "bn"]),
};

export interface FadeGroup {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // plan AABB, the world's (World3.corner added)
  top: number; // tiles
  objects: Object3D[];
  alpha: number;
  own?: Map<Material, Material>; // per-group see-through copies, made on the first fade
  item?: boolean; // a tall piece of furniture (not a wall run)
  wall?: boolean; // …that hangs on a wall (it goes with its wall)
  index?: number; // its slot in the merged meshes' fade flags (World3.faded)
}

// Something you can click: its 3D bounds (the world's, World3.corner added; z = height).
export interface Pick3 {
  id: string;
  use: boolean; // something to use (live clicks); everything is picked in build mode
  dress?: { kind: string }; // a piece of the rooms' clutter
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

// One built piece: its meshes, cards, contact shadows and clickable bounds.
interface Built {
  objs: Object3D[];
  cards: Object3D[];
  soft: Out["soft"];
  picks: Pick3[];
  dispose: { dispose(): void }[];
}

/** Live parts are moved within this many tiles of the camera's target, at most this many a frame. */
const LIVE_NEAR = 18;
const LIVE_MAX = 64;

export class World3 {
  readonly root = new Group();
  readonly materials = {
    lit: new MeshLambertMaterial({ vertexColors: true }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    clear: new MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }),
    // the glass as two meshes, its back faces then its front faces (twoSided, below)
    clearBack: new MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: BackSide }),
    clearFront: new MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: FrontSide }),
    ink: new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
  };
  picks: Pick3[] = [];
  fades: FadeGroup[] = [];
  /** Where this floor's own frame is in the world (its map's corner: a world floor's drawn from its
   *  local view, shared structure/fold.ts — tp/view.ts places `root` there). Its picks and fades
   *  are the world's. */
  get corner(): { x: number; y: number } {
    return { x: this.map.ox ?? 0, y: this.map.oy ?? 0 };
  }
  /** the cell a place of this floor is in (cellKey) */
  private cellOf(x: number, y: number): string {
    return cellKey(x, y, this.corner);
  }
  cards: Object3D[] = []; // turned to the camera every frame
  lights: LightSource[] = [];
  stats = { triangles: 0, meshes: 0, cards: 0, ms: 0, areas: 0 };

  private walls: Built[] = [];
  private wallFades: FadeGroup[] = [];
  private wallParts = new Map<string, { built: Built; fade?: FadeGroup }>();
  private areas = new Map<string, { sig: string; built: Built }>();
  private tall = new Map<string, { sig: string; built: Built; fade: FadeGroup }>();
  private tallIds = new Set<string>(); // things known to stand tall (drawn on their own)
  private floor: { meshes: Mesh[]; chunks: Map<string, Mesh>; sig: string } | null = null;
  private objects: WorldObjectDef[] = [];
  private cardN = 0;
  private posts = new Set<string>(); // "x,y" of every wall post (doors stop at them too)
  private cuts = new Map<string, WallCut>(); // doors' and windows' holes, by edge
  /** the floor's walls as drawn (the structure's: walls3d.ts; a map's edges where there's none) */
  private edges: WallEdges;
  private cutSig = "";
  // a floor that isn't mine never fades: its walls' solid parts drawn merged (setFading)
  private fading = true;
  // ── drawn merged (docs/plan/38-the-lag.md, round 4) ──
  // Every opaque piece — the walls' low parts and runs, each area's things, the tall
  // things — is drawn merged a cell (CELL m, the world's) at a time, one mesh per material; the
  // pieces themselves wait out of the scene (`held`): three walks every object in the scene
  // every frame, and on a big furnished floor that walk cost more than the drawing. Each
  // merged point carries its fade group (`aFade`, 0: none). A group that fades has its
  // points dropped by the merged mesh's shader (`flags`) and its own pieces put back in the
  // scene, faded as before (view.ts applyFade): what's faded is drawn exactly as it was.
  private held = new Group();
  private chunks = new Map<string, { meshes: Set<Mesh>; merged: Mesh[]; dirty: boolean }>();
  private chunkOf = new Map<Mesh, string>();
  private fadeOfMesh = new Map<Mesh, FadeGroup>();
  private fadeMeshes = new Map<FadeGroup, Mesh[]>();
  private fadeFree: number[] = [];
  private fadeN = 0;
  private flagRows = 4;
  private flagData = new Uint8Array(FLAG_W * 4).fill(255);
  private flagsU = { value: flagTexture(this.flagData, 4) };
  private unmergedNow = false;
  // the pieces that aren't merged (glass, ink, cards, decals: see-through, or each its own
  // texture) in a group an area, so a whole area out of view is left out with one test
  // instead of three testing each of its pieces (cullLoose) — none of them casts a shadow
  private loose = new Map<string, { group: Group; box: Box3; dirty: boolean; world: Box3; at: number[] }>();
  private looseHid = new Set<Group>();

  // `light`: the room's light, as a part of a lit material (tp/light3d.ts Light3.piece; none: three's
  // lights alone)
  constructor(
    private items: Items,
    public map: MapDef,
    objects: WorldObjectDef[],
    private anisotropy = 4,
    light: ((m: Material) => Piece) | null = null,
    // the stairwells (shared wellsOf): no floor where the stairs from below come
    // up, no ceiling over this floor's own
    private wells: { floor: Set<string>; ceiling: Set<string> } = { floor: new Set(), ceiling: new Set() },
    edges?: WallEdges,
    /** the floor's indoor slabs' rings, a slab's together (its own frame, each read even-odd; the
     *  floor is any of them — they may overlap, phase 11.7: the structure's — the ceiling over
     *  them); none: its tiles */
    private rings: Ring[][] | null = null,
    /** all its slabs' rings (the lot's too: what's floor at all — below-cull's slab and shell) */
    private floorRings: Ring[][] | null = null,
    /** its slabs each with its material (its own frame): the floor's look painted per slab
     *  (art/floors.ts FloorBake); none: its tiles */
    private slabs: FloorSlab[] | null = null,
    /** its mezzanines (phase 11.7): slabs over its height — their rings, material, how high */
    private decks: Deck[] | null = null,
    /** its roofs (phase 11.7), in its own frame, their eaves over its floor */
    private roofs: Roof[] | null = null,
  ) {
    const t0 = performance.now();
    this.edges = edges ?? edgesOfMap(map);
    // (the floor is moved by the view, which makes its matrix then: not every frame)
    this.root.matrixAutoUpdate = false;
    this.lightFn = light;
    // (the shared materials read the fade flags: World3.faded — a piece itself has no
    // `aFade`, reads 0, and is drawn)
    for (const m of [this.materials.lit, this.materials.clearBack, this.materials.clearFront]) m.userData.fade = true;
    // (the kit's things are in the lit buffers, marked: shaded cel, as the people — world/furn/look.ts)
    this.materials.lit.userData.cel = true;
    yuLit(this.materials.glow, { fade: this.fade });
    yuLit(this.materials.ink, { fade: this.fade });
    this.light(this.materials.lit);
    this.light(this.materials.clear);
    this.light(this.materials.clearBack);
    this.light(this.materials.clearFront);
    this.cuts = wallCuts(objects);
    this.cutSig = cutsSig(objects);
    this.buildWalls();
    this.buildDecks();
    this.buildRoofs();
    this.update(objects);
    this.stats.ms = performance.now() - t0;
  }

  // ── walls (once per layout; a new layout: again only the pieces it touches) ──
  // The walls are pieces, each drawn and merged on its own (`wallParts`): the low parts an
  // area at a time (`low|<area>`), the upper parts a run of up to RUN edges along a line at a
  // time (`run|h|<y>|<n>`, each fading as one), and the ceiling. `only`: build just these
  // pieces (World3.relayout — what an edit touched), the rest kept as they are.
  private buildWalls(only?: Set<string>) {
    const { post, wall, WALL_HALF_T } = this.items;
    const map = this.map;
    const E = this.edges;
    const want = (k: string) => !only || only.has(k);
    const low = new Map<string, Out>();
    const lowOf = (x: number, y: number) => getOr(low, this.cellOf(x, y), () => new Out());
    const runs = new Map<string, { out: Out; x0: number; y0: number; x1: number; y1: number; top: number }>();
    const runOf = (dir: "h" | "v", x: number, y: number, top: number) => {
      const k = runKey(dir, x, y);
      const r = getOr(runs, k, () => ({ out: new Out(), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, top: 0 }));
      const [ax, ay, bx, by] = dir === "h" ? [x, y - 0.1, x + 1, y + 0.1] : [x - 0.1, y, x + 0.1, y + 1];
      r.x0 = Math.min(r.x0, ax);
      r.y0 = Math.min(r.y0, ay);
      r.x1 = Math.max(r.x1, bx);
      r.y1 = Math.max(r.y1, by);
      r.top = Math.max(r.top, top);
      return r;
    };
    const sketch = (o: Opts3) => new MeshSketch(o);
    // posts where walls turn, meet or end (a straight run of one height has none)
    const half = (c: string) => c === HALF_WALL;
    const posts = new Map<string, { height: number; ch: string; e: string; w: string; s: string }>();
    for (let Y = 0; Y <= map.height; Y++)
      for (let X = 0; X <= map.width; X++) {
        const w = E.h(X - 1, Y);
        const e = E.h(X, Y);
        const n = E.v(X, Y - 1);
        const s = E.v(X, Y);
        const touching = [w, e, n, s].filter(isWallEdge);
        if (!touching.length) continue;
        const straight =
          (isWallEdge(w) && isWallEdge(e) && !isWallEdge(n) && !isWallEdge(s) && half(w) === half(e)) ||
          (isWallEdge(n) && isWallEdge(s) && !isWallEdge(w) && !isWallEdge(e) && half(n) === half(s));
        if (straight) continue;
        const height = touching.every(half) ? 34 : WALL_PX;
        posts.set(`${X},${Y}`, { height, ch: touching.find((c) => !half(c)) ?? touching[0], e, w, s });
      }
    const addWall = (dir: "h" | "v", x: number, y: number, ch: string) => {
      const wantLow = want(`low|${this.cellOf(x, y)}`);
      const wantRun = want(`run|${runKey(dir, x, y)}`);
      if (!wantLow && !wantRun) return;
      // a wall stops at the post's faces: running on to the joint, its faces
      // would lie in the post's own (in other colours) and flicker
      const [ax, ay, bx, by] = dir === "h" ? [x, y, x + 1, y] : [x, y, x, y + 1];
      const a0 = posts.has(`${ax},${ay}`) ? WALL_HALF_T : 0;
      const a1 = posts.has(`${bx},${by}`) ? 1 - WALL_HALF_T : 1;
      const clip = dir === "h" ? { x0: a0, x1: a1, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: a0, y1: a1 };
      const top = ch === HALF_WALL ? 34 : WALL_PX;
      const run = wantRun ? runOf(dir, x, y, zt(top)) : null;
      const back = E.back({ dir, x, y });
      const c = this.cuts.get(edgeKey({ dir, x, y }));
      const cut = c ? ([artPx(c.z0), artPx(c.z1)] as const) : null; // (the art's px)
      if (back === NO_WALL) {
        // one material through and through: drawn once, its face mirrored onto the other side
        const at = { w: 1, h: 1, seed: 0.37, clip, at: [x, y] as [number, number], mirror: true };
        if (wantLow) wall(sketch({ ...at, out: lowOf(x, y) }), dir, ch, "low", undefined, cut);
        if (run) wall(sketch({ ...at, out: run.out }), dir, ch, "high", undefined, cut);
        return;
      }
      // two faces: the front half as it is, the back half drawn as the front of
      // the sketch turned round from the tile behind (its +y / +x face lands on −y / −x)
      const bch = isWindow(ch) ? back.toUpperCase() : back;
      const behind: [number, number] = dir === "h" ? [x, y - 1] : [x - 1, y];
      const bclip = dir === "h" ? { x0: a0, x1: a1, y0: 0, y1: 2 } : { x0: 0, x1: 2, y0: a0, y1: a1 };
      const parts: ["low" | "high", Out][] = [];
      if (wantLow) parts.push(["low", lowOf(x, y)]);
      if (run) parts.push(["high", run.out]);
      for (const [part, out] of parts) {
        wall(sketch({ w: 1, h: 1, seed: 0.37, clip, at: [x, y], out }), dir, ch, part, "front", cut);
        wall(sketch({ w: 1, h: 1, seed: 0.37, clip: bclip, at: behind, rot: 2, out }), dir, bch, part, "back", cut);
      }
    };
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const ch = E.h(x, y);
        if (isWallEdge(ch)) addWall("h", x, y, ch);
      }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= map.width; x++) {
        const ch = E.v(x, y);
        if (isWallEdge(ch)) addWall("v", x, y, ch);
      }
    // walls on neither axis, or off the metres (walls3d.ts): pieces along their own line, each the
    // x-wall's piece turned and placed; a post at each end the lattice's posts don't hold
    const freeEnds = new Set<string>();
    if (!only || only.has(FREE))
      for (const fw of E.free)
        this.freeWall(fw, posts, freeEnds, (id) => getOr(low, `${FREE}|${id}`, () => new Out()), runs, sketch);
    this.posts = new Set(posts.keys());
    for (const [key, { height, ch, e, w, s }] of posts) {
      const [X, Y] = key.split(",").map(Number);
      if (want(`low|${this.cellOf(X, Y)}`))
        post(sketch({ w: 1, h: 1, at: [X, Y], out: lowOf(X, Y) }), height, "low", ch);
      // the upper part fades with the run it belongs to most (h first)
      const [dir, rx, ry] = postRun(X, Y, e, w, s);
      if (want(`run|${runKey(dir, rx, ry)}`))
        post(sketch({ w: 1, h: 1, at: [X, Y], out: runOf(dir, rx, ry, zt(height)).out }), height, "high", ch);
    }
    // (each piece built replaces the one it was; one of `only` that has no walls now goes)
    const made = new Set<string>();
    for (const [k, out] of low) {
      made.add(`low|${k}`);
      this.setWallPart(`low|${k}`, { built: this.mount(out, k) });
    }
    if (!only) this.buildCeiling();
    for (const [k, r] of runs) {
      const b = this.mount(r.out, this.cellOf((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
      const c = this.corner;
      const f: FadeGroup = {
        x0: r.x0 + c.x,
        y0: r.y0 + c.y,
        x1: r.x1 + c.x,
        y1: r.y1 + c.y,
        top: r.top,
        objects: b.objs,
        alpha: 1,
      };
      made.add(`run|${k}`);
      this.setWallPart(`run|${k}`, { built: b, fade: f });
      this.tagFade(b, f);
    }
    if (only) for (const k of only) if (!made.has(k)) this.setWallPart(k, null);
    // (the walls off the lattice drawn again: one of theirs that's gone, gone)
    if (only?.has(FREE))
      for (const k of [...this.wallParts.keys()])
        if (k.includes(`|${FREE}|`) && !made.has(k)) this.setWallPart(k, null);
    this.listWalls();
  }

  // A wall on neither axis or off the metres (walls3d.ts): a metre at a time along it, each piece
  // the x-wall's (drawn from the origin along +x, both faces) turned and placed; its low parts in
  // the area each piece's middle is in, its upper parts in runs of RUN pieces (`free|<id>|<n>`,
  // each fading as one); a post at each end that isn't one of the lattice's (or already has one).
  private freeWall(
    fw: FreeWall,
    posts: Map<string, unknown>,
    freeEnds: Set<string>,
    lowOf: (id: string) => Out,
    runs: Map<string, { out: Out; x0: number; y0: number; x1: number; y1: number; top: number }>,
    sketch: (o: Opts3) => MeshSketch,
  ) {
    const { post, wall } = this.items;
    // (its doors' and windows' holes: the pieces split where they start and end — phase 11.6)
    const holes = freeCuts(this.objects, fw.id);
    const pieces = piecesOf(
      fw,
      holes.flatMap((c) => [c.u0, c.u1]),
    );
    // (its own height and thickness — phase 11.4 — else its kind's)
    const top = fw.height !== undefined ? artPx(fw.height) : fw.ch === HALF_WALL ? 34 : WALL_PX;
    const WALL_HALF_T = (fw.thick ?? WALL_T) / 2;
    const shape = { top, t: WALL_HALF_T };
    const ends = [fw.a, fw.b].map((p) => `${p[0]},${p[1]}`);
    const postAt = ends.map((k) => !posts.has(k));
    const lowOut = lowOf(fw.id);
    pieces.forEach((p, i) => {
      const a0 = i === 0 && postAt[0] ? WALL_HALF_T : 0;
      const a1 = i === pieces.length - 1 && postAt[1] ? p.len - WALL_HALF_T : p.len;
      const clip = { x0: a0, x1: a1, y0: -1, y1: 1 };
      const bclip = { x0: a0, x1: a1, y0: 0, y1: 2 };
      // (a door's or window's hole through this piece: the art's px up)
      const mid = p.u + p.len / 2;
      const h = holes.find((c) => c.u0 < mid && mid < c.u1);
      const cut = h ? ([artPx(h.z0), artPx(h.z1)] as const) : null;
      const lo = new Out();
      const hi = new Out();
      for (const [part, out] of [
        ["low", lo],
        ["high", hi],
      ] as const) {
        if (fw.back === NO_WALL) {
          wall(
            sketch({ w: 1, h: 1, seed: 0.37, clip, at: [0, 0], mirror: true, out }),
            "h",
            fw.ch,
            part,
            undefined,
            cut,
            shape,
          );
        } else {
          const bch = isWindow(fw.ch) ? fw.back.toUpperCase() : fw.back;
          wall(sketch({ w: 1, h: 1, seed: 0.37, clip, at: [0, 0], out }), "h", fw.ch, part, "front", cut, shape);
          wall(
            sketch({ w: 1, h: 1, seed: 0.37, clip: bclip, at: [0, -1], rot: 2, out }),
            "h",
            bch,
            part,
            "back",
            cut,
            shape,
          );
        }
        turnOut(out, p.angle, p.at[0], p.at[1], fw.base ?? 0);
      }
      appendOut(lowOut, lo);
      const k = `${FREE}|${fw.id}|${Math.floor(i / RUN)}`;
      const r = getOr(runs, k, () => ({ out: new Out(), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, top: 0 }));
      appendOut(r.out, hi);
      for (const [x, y] of [p.at, [p.at[0] + Math.cos(p.angle) * p.len, p.at[1] + Math.sin(p.angle) * p.len]]) {
        r.x0 = Math.min(r.x0, x - 0.1);
        r.y0 = Math.min(r.y0, y - 0.1);
        r.x1 = Math.max(r.x1, x + 0.1);
        r.y1 = Math.max(r.y1, y + 0.1);
      }
      r.top = Math.max(r.top, zt(top));
    });
    // its posts: square to the wall (an arc: to its first or last chord), at each end not already
    // one of the lattice's
    [fw.a, fw.b].forEach((at, i) => {
      const angle = (i === 0 ? pieces[0] : pieces.at(-1))?.angle ?? 0;
      // (two walls off the lattice meeting: one post)
      if (!postAt[i] || !pieces.length || freeEnds.has(ends[i])) return;
      freeEnds.add(ends[i]);
      for (const [part, out] of [
        ["low", lowOut],
        [
          "high",
          getOr(runs, `${FREE}|${fw.id}|${i === 0 ? 0 : Math.floor((pieces.length - 1) / RUN)}`, () => ({
            out: new Out(),
            x0: at[0] - 0.1,
            y0: at[1] - 0.1,
            x1: at[0] + 0.1,
            y1: at[1] + 0.1,
            top: zt(top),
          })).out,
        ],
      ] as const) {
        const o = new Out();
        post(sketch({ w: 1, h: 1, at: [0, 0], out: o }), top, part, fw.ch, WALL_HALF_T);
        turnOut(o, angle, at[0], at[1], fw.base ?? 0);
        appendOut(out, o);
      }
    });
  }

  // a wall piece put in (or taken away: null), the one it replaces taken down
  private setWallPart(key: string, part: { built: Built; fade?: FadeGroup } | null) {
    const had = this.wallParts.get(key);
    if (had) this.unmount(had.built);
    if (part) this.wallParts.set(key, part);
    else this.wallParts.delete(key);
  }
  // (the lists the rest reads — a new array each time: below-cull.ts's shell keys on it)
  private listWalls() {
    const parts = [...this.wallParts.values()];
    this.walls = parts.map((p) => p.built);
    this.wallFades = parts.flatMap((p) => (p.fade ? [p.fade] : []));
  }

  // Mezzanines (phase 11.7): each a slab of its floor's material at its height — its top, its edge
  // and its underside, inked round, lit as the room is.
  private deckRoot: Group | null = null;
  private dropDecks() {
    if (!this.deckRoot) return;
    this.deckRoot.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      for (const x of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) x.dispose();
    });
    this.deckRoot.removeFromParent();
    this.deckRoot = null;
  }
  private buildDecks() {
    this.dropDecks();
    if (!this.decks?.length) return;
    const g = new Group();
    for (const d of this.decks) {
      // (a shape in x and −y, extruded up its thickness and laid in the floor's plane: x, up, y)
      const shape = new Shape(d.rings[0].map(([x, y]) => new Vector2(x, -y)));
      for (const h of d.rings.slice(1)) shape.holes.push(new Shape(h.map(([x, y]) => new Vector2(x, -y))));
      const geo = new ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, d.over - SLAB, 0);
      const mat = new MeshLambertMaterial({ color: DECK_COLOR[d.top] ?? 0x8f6038 });
      this.light(mat);
      const mesh = new Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const ink = new LineSegments(new EdgesGeometry(geo, 30), new LineBasicMaterial({ color: 0x1e1712 }));
      g.add(mesh, ink);
    }
    this.root.add(g);
    this.deckRoot = g;
  }

  // Roofs (phase 11.7): each face of each (shared roof.ts roofFaces: slopes, gables, a flat lid and
  // its edge) a mesh, inked round; hidden while I'm under one (roofsFor).
  private roofRoot: Group | null = null;
  private roofGroups: { outline: [number, number][]; g: Group }[] = [];
  private dropRoofs() {
    if (!this.roofRoot) return;
    this.roofRoot.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      for (const x of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) x.dispose();
    });
    this.roofRoot.removeFromParent();
    this.roofRoot = null;
    this.roofGroups = [];
  }
  private buildRoofs() {
    this.dropRoofs();
    if (!this.roofs?.length) return;
    const root = new Group();
    const mats = {
      slope: new MeshLambertMaterial({ color: 0x585e66, side: DoubleSide }),
      gable: new MeshLambertMaterial({ color: 0xefe4cc, side: DoubleSide }),
      flat: new MeshLambertMaterial({ color: 0x6f6a62, side: DoubleSide }),
      edge: new MeshLambertMaterial({ color: 0x3b3029, side: DoubleSide }),
    };
    const ink = new LineBasicMaterial({ color: 0x1e1712 });
    for (const r of this.roofs) {
      const g = new Group();
      for (const f of roofFaces(r)) {
        // (a face is flat: a flat roof's may be any shape — triangulated in its own x, y)
        const pts = f.pts;
        const tris =
          pts.length === 3
            ? [[0, 1, 2]]
            : pts.length === 4
              ? [
                  [0, 1, 2],
                  [0, 2, 3],
                ]
              : ShapeUtils.triangulateShape(
                  pts.map(([x, y]) => new Vector2(x, y)),
                  [],
                );
        const pos: number[] = [];
        for (const [a, b, c] of tris) for (const i of [a, b, c]) pos.push(pts[i][0], pts[i][2], pts[i][1]);
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        const mesh = new Mesh(geo, mats[f.part]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
        const loop: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [p, q] = [pts[i], pts[(i + 1) % pts.length]];
          loop.push(p[0], p[2], p[1], q[0], q[2], q[1]);
        }
        const lg = new BufferGeometry();
        lg.setAttribute("position", new Float32BufferAttribute(loop, 3));
        g.add(new LineSegments(lg, ink));
      }
      root.add(g);
      this.roofGroups.push({ outline: r.outline, g });
    }
    this.root.add(root);
    this.roofRoot = root;
  }
  /** The roofs over this floor shown but the one over (x, y) — this floor's own frame (I'm under it). */
  roofsFor(x: number, y: number) {
    for (const { outline, g } of this.roofGroups) g.visible = !inRing(outline, x, y);
  }

  // Ceilings over every floor tile at the walls' height, facing down: seen
  // from below only (a low free camera, eye level), never from above.
  private buildCeiling() {
    const map = this.map;
    const z = WALL_H;
    const pos: number[] = [];
    // from the structure: its indoor slabs less the wells going up (physics/structure-solids.ts
    // slabBoxes: the same rectangles Jolt's slabs are), each a quad wound to face down
    if (this.rings) {
      const holes = [...this.wells.ceiling].map((k): [number, number, number, number] => {
        const [x, y] = k.split(",").map(Number);
        return [x, y, x + 1, y + 1];
      });
      for (const b of this.rings.flatMap((r) => slabBoxes(r, holes, 0))) {
        const [x0, x1, y0, y1] = [b.x - b.hx, b.x + b.hx, b.z - b.hz, b.z + b.hz];
        pos.push(x0, z, y0, x1, z, y0, x1, z, y1, x0, z, y0, x1, z, y1, x0, z, y1);
      }
    }
    // (none outdoors — the lot is open sky — nor over a stairwell)
    const under = (x: number, y: number) => {
      const ch = cellOf(map, x, y);
      return isFloor(ch) && ch !== "a" && ch !== "c" && !this.wells.ceiling.has(`${x},${y}`);
    };
    if (!this.rings)
      for (let y = 0; y < map.height; y++) {
        let x = 0;
        while (x < map.width) {
          if (!under(x, y)) {
            x++;
            continue;
          }
          let x1 = x;
          while (x1 < map.width && under(x1, y)) x1++;
          // a run of floor along x: one quad, wound to face down
          pos.push(x, z, y, x1, z, y, x1, z, y + 1, x, z, y, x1, z, y + 1, x, z, y + 1);
          x = x1;
        }
      }
    if (!pos.length) {
      this.setWallPart("ceiling", null);
      return;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new MeshLambertMaterial({ color: 0xd9ccb0 });
    this.light(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = "ceiling";
    this.root.add(mesh);
    still(mesh);
    this.setWallPart("ceiling", {
      built: { objs: [mesh], cards: [], soft: { rects: [], dots: [] }, picks: [], dispose: [geo, mat] },
    });
  }

  // what the last `update` drew again (areas, tall things): their contact shadows on the floor's
  // bake change with them (relayout bakes again round them too — a wall can move a room's
  // dressing to its far side)
  private redrawn: TileRect | null = null;
  private redrew(r: { x0: number; y0: number; x1: number; y1: number }) {
    const b = { x0: Math.floor(r.x0), y0: Math.floor(r.y0), x1: Math.ceil(r.x1), y1: Math.ceil(r.y1) };
    this.redrawn = this.redrawn ? union(this.redrawn, b) : b;
  }
  // (a fade group's rect is the world's: back to the floor's own)
  private redrewFade(f: FadeGroup) {
    const c = this.corner;
    this.redrew({ x0: f.x0 - c.x, y0: f.y0 - c.y, x1: f.x1 - c.x, y1: f.y1 - c.y });
  }
  private redrewArea(k: string) {
    // (a cell is the world's: back to the floor's own)
    const [ax, ay] = k.split(",").map(Number);
    const c = this.corner;
    this.redrew({ x0: ax * CELL - c.x, y0: ay * CELL - c.y, x1: (ax + 1) * CELL - c.x, y1: (ay + 1) * CELL - c.y });
  }

  // ── a new layout on the same floor (again only what it touches) ──────────────
  /** The same floor with its layout changed — a wall built or taken away, a face painted, a
   *  tile laid (the Walls and Rooms tools): the walls and the ceiling made again, the floor
   *  baked again, the things kept as they're drawn. Only the dressing that changed (`update`'s
   *  areas) and the doors and windows whose frame meets a post that came or went are drawn
   *  again. Building the whole floor anew cost ~0.5 s a wall on a furnished floor (the things,
   *  not the walls). The caller builds anew instead for a floor of another size or other
   *  stairwells. */
  relayout(
    map: MapDef,
    objects: WorldObjectDef[],
    edges?: WallEdges,
    rings?: Ring[][] | null,
    floorRings?: Ring[][] | null,
    slabs?: FloorSlab[] | null,
    decks?: Deck[] | null,
    roofs?: Roof[] | null,
  ) {
    // (an edit before this one not yet done: now, at once)
    this.flushSoon();
    const was = this.posts;
    const old = this.map;
    const oldEdges = this.edges;
    const floorWas = this.floor;
    this.map = map;
    this.edges = edges ?? edgesOfMap(map);
    const ringsWas = this.rings;
    this.rings = rings ?? null;
    this.floorRings = floorRings ?? null;
    this.slabs = slabs ?? null;
    const decksWas = JSON.stringify(this.decks);
    this.decks = decks ?? null;
    if (JSON.stringify(this.decks) !== decksWas) this.buildDecks();
    const roofsWas = JSON.stringify(this.roofs);
    this.roofs = roofs ?? null;
    if (JSON.stringify(this.roofs) !== roofsWas) this.buildRoofs();
    const touched = touchedWalls(old, map, oldEdges, this.edges);
    this.buildWalls(touched.keys);
    // where the floor's bake changes: round the edges that changed (the AO reaches ~2 tiles),
    // and the doors and windows drawn again below; all of it if the tiles changed
    let near: TileRect | null = touched.box && grow(touched.box, FLOOR_REACH);
    // (the ceiling covers the floor tiles: again only if they changed)
    if (floorsSig(old) !== floorsSig(map) || JSON.stringify(ringsWas) !== JSON.stringify(this.rings)) {
      this.buildCeiling();
      this.listWalls();
      near = { x0: 0, y0: 0, x1: map.width, y1: map.height };
    }
    this.collect();
    // An edit's work over three frames (docs/plan/72 phase 8, an edit's cost): its walls in this
    // one; the things it touched (a door's frame, a room's dressing) the next; the floor's bake
    // the one after (bakeSoon). `flushSoon` does what's left at once.
    this.later = () => this.relaidThings(objects, was, near, floorWas);
    this.later.id = raf(() => this.flushSoon(false));
  }

  private later: ((() => void) & { id?: unknown }) | null = null;
  private relaidThings(objects: WorldObjectDef[], was: Set<string>, near: TileRect | null, floorWas: unknown) {
    // a door's or window's frame stops at a post at either end (drawObject): drawn again
    // where one of those posts came or went
    for (const o of objects) {
      if (!isOpening(o.kind)) continue;
      const edges = openingEdges(o);
      const first = edges[0];
      const last = edges[edges.length - 1];
      if (!first || !last) continue;
      const ends = [`${first.x},${first.y}`, first.dir === "h" ? `${last.x + 1},${last.y}` : `${last.x},${last.y + 1}`];
      if (ends.every((k) => was.has(k) === this.posts.has(k))) continue;
      const t = this.tall.get(o.id);
      if (t) t.sig = "";
      else {
        const a = this.areas.get(this.cellOf(...anchorOf(o)));
        if (a) a.sig = "";
      }
      // (its contact shadow on the floor: baked again too)
      const box = grow({ x0: first.x, y0: first.y, x1: last.x + 1, y1: last.y + 1 }, FLOOR_REACH);
      near = near ? union(near, box) : box;
    }
    this.update(objects);
    if (this.redrawn) {
      const box = grow(this.redrawn, SOFT_REACH);
      near = near ? union(near, box) : box;
    }
    // (`update` stops early when none of the things changed)
    this.collect();
    // the floor's bake reads the walls too (their AO): again near what changed — all of it if the
    // things changed too (`update` has baked it whole then) or the tiles did
    // (the next frame: an edit's own frame has the walls — docs/plan/72 phase 8, an edit's cost)
    if (this.floor === floorWas) this.bakeSoon(near ?? undefined);
  }
  /** What an edit left for the frames after (`bake`: its floor's bake too), now: the checks
   *  compare it at once; the next edit starts from it. */
  flushSoon(bake = true) {
    const f = this.later;
    this.later = null;
    f?.();
    if (bake) this.flushBake();
  }

  // ── furniture + clutter (again where it changed) ────────────────────────────
  update(objects: WorldObjectDef[]) {
    this.objects = objects;
    this.redrawn = null;
    // a door or window came, went or moved: the walls again, with their holes
    const sig = cutsSig(objects);
    let rewalled = false;
    if (sig !== this.cutSig) {
      this.cutSig = sig;
      this.cuts = wallCuts(objects);
      for (const k of [...this.wallParts.keys()]) this.setWallPart(k, null);
      this.buildWalls();
      rewalled = true;
    }
    const byArea = new Map<string, { objs: WorldObjectDef[]; dress: DressItem[]; sig: string[] }>();
    const area = (k: string) => getOr(byArea, k, () => ({ objs: [], dress: [], sig: [] }));
    const tallNow = new Map<string, { o: WorldObjectDef; sig: string }>();
    for (const o of objects) {
      const sig = objectSig(o);
      if (this.tallIds.has(o.id)) {
        tallNow.set(o.id, { o, sig });
        continue;
      }
      const at = anchorOf(o);
      const a = area(this.cellOf(at[0], at[1]));
      a.objs.push(o);
      a.sig.push(sig);
    }
    for (const d of dressItems(this.map, objects)) {
      const at = dressAt(d);
      const a = area(this.cellOf(at[0], at[1]));
      a.dress.push(d);
      a.sig.push(`d|${d.kind}|${d.x}|${d.y}|${d.z}|${bucket(d.seed)}`);
    }
    let changed = false;
    // areas: rebuilt when their things changed, dropped when empty
    for (const [k, a] of byArea) {
      const sig = a.sig.sort().join(";");
      const had = this.areas.get(k);
      if (had?.sig === sig) continue;
      changed = true;
      const out = new Out();
      const picks: Pick3[] = [];
      for (const o of a.objs) {
        const one = this.drawObject(o);
        if (one.tall) {
          // stands tall: on its own from now on (this area is redrawn without it)
          this.tallIds.add(o.id);
          tallNow.set(o.id, { o, sig: objectSig(o) });
          continue;
        }
        if (one.pick) picks.push(one.pick);
        append(out, one.out);
      }
      for (const d of a.dress) {
        const one = new Out();
        this.drawDress(d, one);
        const b = boundsOf(one);
        if (b) picks.push({ id: d.id, use: false, dress: { kind: d.kind }, ...b });
        append(out, one);
      }
      if (had) this.unmount(had.built);
      this.redrewArea(k);
      const built = this.mount(out, k);
      built.picks = picks;
      // a tall thing found while drawing changes this area's list: keep it from redrawing next time
      const left = a.objs.filter((o) => !this.tallIds.has(o.id)).map(objectSig);
      const keep = [...left, ...a.sig.filter((x) => x.startsWith("d|"))].sort().join(";");
      this.areas.set(k, { sig: keep, built });
    }
    this.syncLive(objects);
    this.syncChess(objects);
    for (const [k, had] of this.areas)
      if (!byArea.has(k)) {
        this.unmount(had.built);
        this.areas.delete(k);
        this.redrewArea(k);
        changed = true;
      }
    // tall furniture
    for (const [id, t] of tallNow) {
      const had = this.tall.get(id);
      if (had?.sig === t.sig) continue;
      changed = true;
      if (had) this.unmount(had.built);
      const one = this.drawObject(t.o);
      const built = this.mount(one.out, this.cellOf(...anchorOf(t.o)));
      if (one.pick) built.picks = [one.pick];
      // a wall item: the strip along its face of the wall, and the wall's thickness;
      // a window: its stretch of the wall line
      const pane = isWindowKind(t.o.kind);
      const hang = !!entry(t.o.kind).wall || pane;
      const r = pane ? edgeRect(t.o) : hang ? hangStrip(t.o, 0.3) : footRect(t.o);
      if (hang && !pane) {
        const hg = hangOf(t.o);
        if (hg.dir === "h") [r.y0, r.y1] = [Math.min(r.y0, hg.line - 0.1), Math.max(r.y1, hg.line + 0.1)];
        else [r.x0, r.x1] = [Math.min(r.x0, hg.line - 0.1), Math.max(r.x1, hg.line + 0.1)];
      }
      const fade: FadeGroup = {
        x0: r.x0 + this.corner.x,
        y0: r.y0 + this.corner.y,
        x1: r.x1 + this.corner.x,
        y1: r.y1 + this.corner.y,
        top: hang ? WALL_H : one.top, // (a wall item fades exactly when its wall does)
        objects: built.objs,
        alpha: 1,
        item: true,
        wall: hang,
      };
      this.tall.set(id, { sig: t.sig, built, fade });
      this.tagFade(built, fade);
      this.redrewFade(fade);
      if (had) this.redrewFade(had.fade);
    }
    for (const [id, had] of this.tall)
      if (!tallNow.has(id)) {
        this.unmount(had.built);
        this.redrewFade(had.fade);
        this.tall.delete(id);
        this.tallIds.delete(id);
        changed = true;
      }
    this.rechunk();
    if (!changed && !rewalled && this.floor) return;
    this.collect();
    this.bakeFloor();
  }

  /** The floor's slab for below-cull.ts: the tiles its floor is drawn on (opaque, at the
   *  floor's level), and a key that changes when it's baked again. Null until it's baked. */
  slab(): { slab: Slab; key: unknown } | null {
    if (!this.floor?.meshes.length) return null;
    const map = this.map;
    const wells = this.wells.floor;
    return {
      key: this.floor,
      slab: {
        at: this.root.position,
        w: map.width,
        h: map.height,
        covers: (x, y) => this.isFloorAt(x, y) && !wells.has(`${x},${y}`),
      },
    };
  }

  /** Tile (x, y) of this floor is floor (its slabs' — the structure's, read even-odd at its middle —
   *  or, with none, its tiles). */
  private isFloorAt(x: number, y: number): boolean {
    if (!this.floorRings) return isFloor(cellOf(this.map, x, y));
    const m = this.floorMask();
    return x >= 0 && y >= 0 && x < m.w && y < m.h && m.bits[y * m.w + x] === 1;
  }
  // (the slabs read once a row, kept till they change: the cull asks every tile several times)
  private mask: { rings: Ring[][]; w: number; h: number; bits: Uint8Array } | null = null;
  private floorMask() {
    const groups = this.floorRings as Ring[][];
    if (this.mask?.rings === groups) return this.mask;
    const { width: w, height: h } = this.map;
    const bits = new Uint8Array(w * h);
    // (any slab's: they may overlap)
    for (const rings of groups)
      for (let y = 0; y < h; y++) {
        const xs = crossings(rings, y + 0.5);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < w && x + 0.5 < xs[k + 1]; x++) bits[y * w + x] = 1;
      }
    const rings = groups;
    this.mask = { rings, w, h, bits };
    return this.mask;
  }

  /** The floor's walls for below-cull.ts: the tiles a sight line could leave the floor by
   *  below the walls' top — a well, or an edge between floor and not-floor that isn't a
   *  solid full wall (a window, a door, glass, a half wall, no wall) — and that top (tiles).
   *  `key` changes when the walls are built again. */
  shell(): { bad: (x: number, y: number) => boolean; top: number; key: unknown } {
    const inside = (x: number, y: number) => this.isFloorAt(x, y);
    const solid = (dir: "h" | "v", x: number, y: number) => {
      const ch = dir === "h" ? this.edges.h(x, y) : this.edges.v(x, y);
      return (
        isWallEdge(ch) &&
        ch === ch.toLowerCase() &&
        ch !== "g" &&
        ch !== HALF_WALL &&
        !this.cuts.has(edgeKey({ dir, x, y }))
      );
    };
    // an edge between inside and outside that a line can pass
    const gap = (dir: "h" | "v", x: number, y: number) => {
      const [ax, ay] = dir === "h" ? [x, y - 1] : [x - 1, y];
      return inside(ax, ay) !== inside(x, y) && !solid(dir, x, y);
    };
    const wells = this.wells.floor;
    return {
      top: WALL_H,
      key: this.walls,
      bad: (x, y) =>
        wells.has(`${x},${y}`) || gap("h", x, y) || gap("h", x, y + 1) || gap("v", x, y) || gap("v", x + 1, y),
    };
  }

  /** Does this floor fade (mine: walls and tall things turn see-through when they'd hide
   *  me)? A floor that doesn't (below mine) has every fade put back to whole. */
  setFading(on: boolean) {
    if (on === this.fading) return;
    this.fading = on;
    if (on) return;
    for (const f of this.fades) {
      if (f.alpha >= 0.999) continue;
      f.alpha = 1;
      for (const o of f.objects) {
        const m = o as Mesh;
        if (m.userData.base) m.material = m.userData.base as Material;
      }
      this.faded(f);
    }
  }

  // what a built piece can be merged as: solid (lit, glow — always), or see-through (glass,
  // ink — only with `mergeClear`: merged, overlapping ones blend in another order); null: not
  private kindOf(o: Object3D): "solid" | "clear" | null {
    const m = o as Mesh;
    const base = (m.userData.base as Material | undefined) ?? (m.material as Material);
    const M = this.materials;
    if (m.isMesh && (base === M.lit || base === M.glow)) return "solid";
    if (
      (m.isMesh || (m as unknown as LineSegments).isLineSegments) &&
      (base === M.clearBack || base === M.clearFront || base === M.ink)
    )
      return "clear";
    return null;
  }

  /** Glass and ink merged an area at a time too (fewer draws; where two see-through pieces
   *  overlap they blend in the merged order, not three's back-to-front: an outline behind
   *  glass a few levels lighter or darker — chosen by the user, 2026-10-24, for ~40% of the
   *  3D frame on a big furnished floor: docs/plan/38-the-lag.md, round 4). */
  private mergeClear = true;
  private clearPieces = new Set<Mesh>();
  setMergeClear(on: boolean) {
    if (on === this.mergeClear) return;
    this.mergeClear = on;
    for (const m of this.clearPieces) {
      const k = m.userData.chunk as string;
      if (on) this.register(m, k);
      else this.unregister(m);
      this.place(m);
      this.looseOf(k).dirty = true;
    }
    this.rechunk();
  }

  private register(m: Mesh, k: string) {
    this.chunkOf.set(m, k);
    getOr(this.chunks, k, () => ({ meshes: new Set<Mesh>(), merged: [], dirty: true })).meshes.add(m);
    this.dirty(k);
  }

  private unregister(m: Mesh) {
    const k = this.chunkOf.get(m);
    if (k === undefined) return;
    this.chunks.get(k)?.meshes.delete(m);
    this.dirty(k);
    this.chunkOf.delete(m);
  }

  // a fade group's solid pieces: their slot in the flags, so the merged mesh can drop them
  private tagFade(b: Built, f: FadeGroup) {
    const list = b.objs.filter((o): o is Mesh => !!this.kindOf(o) && o.userData.chunk !== undefined);
    if (!list.length) return;
    let i = this.fadeFree.pop();
    if (i === undefined) {
      i = ++this.fadeN;
      if (i >= FLAG_W * this.flagRows) this.growFlags();
    }
    f.index = i;
    this.flagData[i] = 255;
    this.flagsU.value.needsUpdate = true;
    this.fadeMeshes.set(f, list);
    for (const m of list) {
      this.fadeOfMesh.set(m, f);
      this.dirty(m.userData.chunk as string);
    }
  }

  private growFlags() {
    const rows = this.flagRows * 2;
    const data = new Uint8Array(FLAG_W * rows).fill(255);
    data.set(this.flagData);
    this.flagData = data;
    this.flagRows = rows;
    this.flagsU.value.dispose();
    this.flagsU.value = flagTexture(data, rows);
  }

  private dirty(k: string) {
    const c = getOr(this.chunks, k, () => ({ meshes: new Set<Mesh>(), merged: [], dirty: true }));
    c.dirty = true;
  }

  /** A fade group's alpha changed (view.ts fadeWalls, after applyFade): faded, its own
   *  pieces are drawn (with their faded materials) and its part of the merged mesh isn't;
   *  whole again, the merged mesh draws it. Its shadow: the merged mesh casts it all along
   *  (the shadow's depth pass doesn't read the flags), as a faded piece's always did. */
  faded(f: FadeGroup) {
    const i = f.index;
    const list = i ? this.fadeMeshes.get(f) : undefined;
    if (!i || !list) return;
    const on = f.alpha < 0.999;
    if (on === (this.flagData[i] === 0)) return;
    this.flagData[i] = on ? 0 : 255;
    this.flagsU.value.needsUpdate = true;
    for (const m of list) this.place(m);
  }

  // where a piece belongs now: drawn itself (not merged, faded, or the old way for tests) in
  // its own place — the floor's root (solid), its area's loose group (see-through) — or held
  private place(m: Mesh) {
    const f = this.fadeOfMesh.get(m);
    const faded = !!f?.index && this.flagData[f.index] === 0;
    const home = m.userData.home as Object3D;
    if (!this.chunkOf.has(m) || this.unmergedNow || faded) {
      if (m.parent !== home) home.add(m);
      // (faded: the merged mesh casts its shadow already)
      m.castShadow = this.unmergedNow || !this.chunkOf.has(m) ? (m.userData.cast as boolean) : false;
    } else if (m.parent !== this.held) this.held.add(m);
  }

  private looseOf(k: string) {
    let l = this.loose.get(k);
    if (!l) {
      const group = new Group();
      group.matrixAutoUpdate = false;
      group.userData.loose = true;
      group.userData.looseKey = k;
      this.root.add(group);
      l = { group, box: new Box3(), dirty: true, world: new Box3(), at: [] };
      this.loose.set(k, l);
    }
    return l;
  }

  /** An area's loose pieces' bounds, in the floor's space (cards: round their turn); null if
   *  one can't be bounded (never left out). For below-cull.ts too. */
  looseBox(g: Object3D): Box3 | null {
    const l = this.loose.get(g.userData.looseKey as string);
    if (!l || l.group !== g) return null;
    if (l.dirty) {
      l.dirty = false;
      l.box.makeEmpty();
      const one = new Box3();
      for (const c of l.group.children) {
        const b = boxInParent(c as Mesh, one);
        if (!b) {
          l.box.min.setScalar(Number.NEGATIVE_INFINITY);
          l.box.max.setScalar(Number.POSITIVE_INFINITY);
          break;
        }
        l.box.union(b);
      }
      l.at = [];
    }
    return Number.isFinite(l.box.min.x) ? l.box : null;
  }

  /** Before a render (any camera: the view's, a car's mirror, the warm-up's): each area's
   *  loose pieces left out if their bounds are out of `frustum` — what three would find
   *  piece by piece. Only what this hid is shown again. */
  cullLoose(frustum: Frustum) {
    const m = this.root.matrixWorld.elements;
    for (const [k, l] of this.loose) {
      l.group.userData.looseKey = k;
      const box = this.unmergedNow ? null : this.looseBox(l.group);
      let inView = true;
      if (box) {
        if (l.at.length !== 16 || l.at.some((v, i) => v !== m[i])) {
          l.world.copy(box).applyMatrix4(this.root.matrixWorld);
          l.at = [...m];
        }
        inView = frustum.intersectsBox(l.world);
      }
      if (!inView && l.group.visible) {
        l.group.visible = false;
        this.looseHid.add(l.group);
      } else if (inView && this.looseHid.has(l.group)) {
        l.group.visible = true;
        this.looseHid.delete(l.group);
      }
    }
  }

  /** (tests) Drawn the old way — every piece on its own, nothing merged — or not: the same
   *  picture either way (e2e/merge-ab.spec.ts renders a frame both ways). */
  setUnmerged(on: boolean) {
    if (on === this.unmergedNow) return;
    this.unmergedNow = on;
    if (on) for (const g of this.looseHid) g.visible = true;
    this.looseHid.clear();
    for (const c of this.chunks.values()) {
      for (const m of c.merged) m.visible = !on;
      for (const m of c.meshes) this.place(m);
    }
  }

  // the areas whose pieces changed: merged again
  private rechunk() {
    for (const [k, c] of this.chunks) {
      if (!c.dirty) continue;
      c.dirty = false;
      for (const m of c.merged) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      c.merged = this.merge([...c.meshes]);
      for (const m of c.merged) {
        m.visible = !this.unmergedNow;
        (m.userData.home as Object3D).add(m);
        still(m);
      }
      if (this.loose.has(k)) (this.loose.get(k) as { dirty: boolean }).dirty = true;
      if (!c.meshes.size) this.chunks.delete(k);
    }
  }

  // one mesh per material and shadow settings: their points one after another, as they
  // were (the pieces sit in the floor's own space), each with its fade group's slot
  private merge(list: Mesh[]): Mesh[] {
    const groups = new Map<string, Mesh[]>();
    for (const m of list) {
      const base = (m.userData.base as Material | undefined) ?? (m.material as Material);
      const k = `${base.uuid}|${m.userData.cast}|${m.receiveShadow}|${m.renderOrder}`;
      getOr(groups, k, () => []).push(m);
    }
    const out: Mesh[] = [];
    for (const g of groups.values()) {
      let n = 0;
      for (const m of g) n += m.geometry.getAttribute("position").count;
      const lines = !!(g[0] as unknown as LineSegments).isLineSegments;
      const pos = new Float32Array(n * 3);
      const nor = new Float32Array(lines ? 0 : n * 3);
      const col = new Float32Array(n * 4);
      const fade = new Float32Array(n);
      let at = 0;
      for (const m of g) {
        const geo = m.geometry;
        const c = geo.getAttribute("position").count;
        pos.set((geo.getAttribute("position").array as Float32Array).subarray(0, c * 3), at * 3);
        if (!lines) nor.set((geo.getAttribute("normal").array as Float32Array).subarray(0, c * 3), at * 3);
        col.set((geo.getAttribute("color").array as Float32Array).subarray(0, c * 4), at * 4);
        fade.fill(this.fadeOfMesh.get(m)?.index ?? 0, at, at + c);
        at += c;
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
      if (!lines) geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
      geo.setAttribute("color", new Float32BufferAttribute(col, 4));
      geo.setAttribute("aFade", new Float32BufferAttribute(fade, 1));
      geo.computeBoundingSphere();
      const first = g[0];
      const base = (first.userData.base as Material | undefined) ?? (first.material as Material);
      // (the shared material itself: drawn in the same order among the rest as its pieces
      // were — three sorts by material — and the pieces, with no `aFade`, read 0: kept)
      const mesh = lines ? (new LineSegments(geo, base) as unknown as Mesh) : new Mesh(geo, base);
      mesh.userData.home = first.userData.home;
      mesh.castShadow = first.userData.cast as boolean;
      mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder;
      mesh.name = "merged";
      out.push(mesh);
    }
    return out;
  }

  // (the fade flags as a part of the shared materials: look/yulit.ts)
  private readonly fade = fadePiece(this.flagsU, FLAG_W);

  // what clicks, fades, cards and lights see: everything built, gathered
  private collect() {
    const all = [
      ...this.walls,
      ...[...this.areas.values()].map((a) => a.built),
      ...[...this.tall.values()].map((t) => t.built),
    ];
    // (what's clicked and what fades are the world's: the scene's — the floor's frame placed at its
    // corner, `corner`)
    const c = this.corner;
    this.picks = all
      .flatMap((b) => b.picks)
      .map((p) => ({ ...p, x0: p.x0 + c.x, y0: p.y0 + c.y, x1: p.x1 + c.x, y1: p.y1 + c.y }));
    this.cards = all.flatMap((b) => b.cards);
    this.fades = [...this.wallFades, ...[...this.tall.values()].map((t) => t.fade)];
    this.lights = lightSources(this.objects);
    this.stats.areas = this.areas.size;
  }

  // one thing drawn on its own (also build mode's ghosts)
  drawObject(o0: WorldObjectDef): { out: Out; top: number; tall: boolean; pick: Pick3 | null } {
    const { drawItem, hasItemArt, itemSketchOpts } = this.items;
    const e = entry(o0.kind);
    // (placed free — plan 72 phase 11.9: drawn as if at no turn with its middle at the origin, then
    // turned by its yaw and set at its middle)
    const freeTurn = isFreeThing(o0) ? { yaw: o0.yaw ?? 0, x: o0.x, y: o0.y } : null;
    const o: WorldObjectDef = freeTurn
      ? { ...o0, x: -e.w / 2, y: -e.h / 2, yaw: 0, props: { ...(o0.props ?? {}), free: false } }
      : o0;
    const out = new Out();
    if (isOpening(o.kind) && o.props?.free === true) {
      // in a wall drawn free (phase 11.6): its model along that wall from where it starts, turned by
      // the wall's heading (its yaw); the older art drawn along x and turned the same
      const n = Math.max(1, e.w);
      if (isNative(o.kind)) openingInto(out, o, 0, n);
      else {
        const leaves = isDoorKind(o.kind) && doorLeaves(o.kind) > 0 && (!doorShut(o) || doorSlides(o.kind));
        for (const part of leaves ? ["edge", "leaf"] : ["edge"]) {
          const own = new Out();
          const s = new MeshSketch({ rot: 0, w: n, h: 1, at: [0, 0], out: own });
          drawItem(s, { kind: o.kind, id: o.id, rot: 0, props: { ...(o.props ?? {}), _part: part } });
          s.end();
          turnOut(own, o.yaw ?? 0, o.x, o.y);
          appendOut(out, own);
        }
      }
    } else if (isOpening(o.kind)) {
      // a door or window in its wall (rot 3 on west edges)
      const rot = quarterOf(o) % 2 === 1 ? 3 : 0;
      // open leaves (and a barn door, always: it rolls along the face) are drawn whole
      const leaves = isDoorKind(o.kind) && doorLeaves(o.kind) > 0 && (!doorShut(o) || doorSlides(o.kind));
      // the frame stops at a post at either end (the wall beside it ends in one),
      // or its faces would lie in the post's and flicker
      const edges = openingEdges(o);
      const first = edges[0];
      const last = edges[edges.length - 1];
      const n = edges.length;
      const T = this.items.WALL_HALF_T;
      const a0 = this.posts.has(`${first.x},${first.y}`) ? T : 0;
      const a1 = this.posts.has(first.dir === "h" ? `${last.x + 1},${last.y}` : `${last.x},${last.y + 1}`) ? n - T : n;
      const clip = first.dir === "h" ? { x0: a0, x1: a1, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: a0, y1: a1 };
      if (isNative(o.kind))
        // (plan 68 phase 13: redrawn by the kit — world/furn/openings.ts)
        openingInto(out, o, a0, a1);
      else
        for (const part of leaves ? ["edge", "leaf"] : ["edge"]) {
          const s = new MeshSketch({ rot, w: n, h: 1, at: [o.x, o.y], out, clip: part === "edge" ? clip : null });
          drawItem(s, { kind: o.kind, id: o.id, rot, props: { ...(o.props ?? {}), _part: part } });
          s.end();
        }
    } else {
      const rot = rotOf(o);
      const ref = { kind: o.kind, id: o.id, rot, props: o.props };
      const at = anchorOf(o);
      // (the item art's px: its drawings are lifted in them)
      const lift = artPx(e.onSurface ? Number(o.props?.z) || 0 : e.wall ? hangOf(o).lift : 0);
      if (isNative(o.kind)) {
        // redrawn by the kit (docs/plan/67-the-furniture.md: world/furn/native.ts)
        nativeInto(out, o);
      } else if (o.kind === "pool_table") {
        // its own model in 3D: real pockets to drop the balls into (tp/pooltable3d.ts)
        poolTable3(out, { x: o.x, y: o.y }, rot, itemSketchOpts(ref).seed);
      } else if (hasItemArt(o.kind)) {
        // things on a surface are drawn around the middle of a 1×1 tile
        const s = new MeshSketch({ ...itemSketchOpts(ref), ...(e.onSurface ? { w: 1, h: 1 } : {}), at, lift, out });
        drawItem(s, ref);
        s.end();
      } else {
        // no drawing yet: the old box art
        const p = piece(o.kind, o.props ?? {}, o.id);
        const s = new MeshSketch({ rot, w: e.w, h: e.h, at, lift, out });
        for (const b of p.boxes)
          s.box({
            x: b.x,
            y: b.y,
            w: b.w,
            d: b.d,
            z: b.z,
            h: b.h,
            glow: b.glow,
            mat: { c: hexStr(b.color), top: b.top !== undefined ? hexStr(b.top) : undefined },
            line: b.outline === false ? 0 : 1,
          });
      }
    }
    if (freeTurn) turnOut(out, freeTurn.yaw, freeTurn.x, freeTurn.y);
    const top = topOf(out);
    // what clicks reach: in the live world (as iso) things to use, or with
    // something to do — a chair, my desk; in build mode, everything
    const b = boundsOf(out);
    return {
      out,
      top,
      // on their own (to fade): tall furniture, and what hangs on a wall (it goes with its wall)
      // (a window goes with its wall too; a door stays, like the wall's skirting)
      // (stairs are walked on: they never fade out under you)
      tall:
        !isDoorKind(o.kind) && !e.onSurface && o.kind !== "stairs" && (e.wall || isWindowKind(o.kind) || top > TALL),
      pick: b ? { id: o.id, use: !!e.interact || hasActions(o), ...b } : null,
    };
  }

  private drawDress(d: DressItem, out: Out) {
    // (the kit's, as the same thing put down by hand: docs/plan/67-the-furniture.md)
    if (isNativeDress(d.kind)) return nativeDressInto(out, { ...d, ...xyOf(dressAt(d)) });
    const seed = bucket(d.seed);
    const s = new MeshSketch({ w: 1, h: 1, seed, at: dressAt(d), out });
    this.items.dressing(s, d.kind as DressKind, artPx(d.z), seed);
    s.end();
  }

  // ── meshes ─────────────────────────────────────────────────────────────────
  private mount(out: Out, chunk?: string): Built {
    const { lit, glow, clearBack, clearFront, ink } = this.materials;
    const built: Built = { objs: [], cards: [], soft: out.soft, picks: [], dispose: [] };
    const tri = (g: Geo, mat: Material | [Material, Material], shadow: boolean) => {
      if (g.empty) return;
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(g.pos, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(g.nor, 3));
      geo.setAttribute("color", new Float32BufferAttribute(g.col, 4));
      geo.computeBoundingSphere();
      built.dispose.push(geo);
      for (const m of twoSided(geo, mat)) {
        m.castShadow = shadow;
        m.receiveShadow = shadow;
        m.userData.tris = g.pos.length / 9;
        built.objs.push(m);
      }
    };
    tri(out.lit, lit, true);
    tri(out.glow, glow, false);
    tri(out.clear, [clearBack, clearFront], false);
    if (out.lines.length) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(out.lines, 3));
      geo.setAttribute("color", new Float32BufferAttribute(out.lineCol, 4));
      geo.computeBoundingSphere();
      built.dispose.push(geo);
      built.objs.push(new LineSegments(geo, ink));
    }
    // decals: free-hand drawing on faces, stuck to them
    for (const dc of out.decals) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(dc.pos, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(dc.nor, 3));
      geo.setAttribute("uv", new Float32BufferAttribute(dc.uv, 2));
      geo.computeBoundingSphere();
      const common = {
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      };
      const mat = dc.glow ? new MeshBasicMaterial({ ...common, toneMapped: false }) : new MeshLambertMaterial(common);
      if (!dc.glow) this.light(mat);
      built.dispose.push(geo, mat);
      const m = new Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 1;
      built.objs.push(m);
      cardTexture(dc.svg).then((t) => {
        if (!t || !built.objs.length) return;
        mat.map = t;
        mat.needsUpdate = true;
        m.visible = true;
      });
    }
    // cards: free-hand drawing, turned to the camera
    for (const c of out.cards) {
      const geo = new PlaneGeometry(c.u1 - c.u0, c.v1 - c.v0);
      // cards all turn the same way: neighbours in a row would share one plane
      // when you look along it, so each stands a hair nearer or further
      geo.translate((c.u0 + c.u1) / 2, (c.v0 + c.v1) / 2, (this.cardN++ % 8) * 0.0015);
      // (a glow card stands where its lit card does: drawn a hair nearer, or the two flicker)
      const card = (side: typeof BackSide | typeof FrontSide) => {
        const mat = c.glow
          ? new MeshBasicMaterial({
              transparent: true,
              depthWrite: false,
              toneMapped: false,
              side,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -4,
            })
          : new MeshLambertMaterial({ transparent: true, alphaTest: 0.04, side });
        if (!c.glow) this.light(mat);
        return mat;
      };
      // (two-sided and see-through: its back faces, then its front faces — twoSided)
      const mats = [card(BackSide), card(FrontSide)];
      built.dispose.push(geo, ...mats);
      const meshes = twoSided(geo, [mats[0], mats[1]]);
      meshes[0].userData.cardBack = true; // (the 3D view leaves it out while the card's front faces it)
      for (const m of meshes) {
        m.position.set(c.x, c.z, c.y);
        m.visible = false;
        m.renderOrder = c.glow ? 2 : 1;
        built.cards.push(m);
        built.objs.push(m);
      }
      cardTexture(c.svg).then((t) => {
        if (!t || !built.objs.length) return;
        for (const mat of mats) {
          mat.map = t;
          mat.needsUpdate = true;
        }
        for (const m of meshes) m.visible = true;
      });
    }
    for (const m of built.objs) {
      // (nothing built here moves but the cards, turned to the camera: their matrices made once)
      if (!built.cards.includes(m)) still(m);
      const kind = chunk ? this.kindOf(m) : null;
      if (chunk && kind) {
        // drawn merged with its area's (rechunk), held out of the scene meanwhile — glass and
        // ink only with mergeClear: until then in its area's loose group, as anything loose
        m.userData.cast = m.castShadow;
        m.userData.chunk = chunk;
        m.userData.home = kind === "solid" ? this.root : this.looseOf(chunk).group;
        if (kind === "clear") {
          this.clearPieces.add(m as Mesh);
          m.userData.loose = chunk;
          this.looseOf(chunk).dirty = true;
        }
        if (kind === "solid" || this.mergeClear) this.register(m as Mesh, chunk);
        this.place(m as Mesh);
      } else if (chunk) {
        const l = this.looseOf(chunk);
        m.userData.loose = chunk;
        l.group.add(m);
        l.dirty = true;
      } else this.root.add(m);
    }
    this.stats.triangles += built.objs.reduce((n, m) => n + ((m.userData.tris as number) ?? 0), 0);
    this.stats.meshes += built.objs.length;
    this.stats.cards += built.cards.length;
    return built;
  }

  private unmount(b: Built) {
    for (const m of b.objs) {
      m.removeFromParent();
      const lk = m.userData.loose as string | undefined;
      if (lk !== undefined) {
        const l = this.loose.get(lk);
        if (l) {
          l.dirty = true;
          if (!l.group.children.length) {
            l.group.removeFromParent();
            this.looseHid.delete(l.group);
            this.loose.delete(lk);
          }
        }
      }
      this.stats.triangles -= (m.userData.tris as number) ?? 0;
      this.clearPieces.delete(m as Mesh);
      this.unregister(m as Mesh);
      if (m.userData.chunk !== undefined) {
        const f = this.fadeOfMesh.get(m as Mesh);
        this.fadeOfMesh.delete(m as Mesh);
        if (f && this.fadeMeshes.delete(f) && f.index) {
          this.flagData[f.index] = 255;
          this.fadeFree.push(f.index);
          f.index = undefined;
        }
      }
    }
    this.stats.meshes -= b.objs.length;
    this.stats.cards -= b.cards.length;
    for (const d of b.dispose) d.dispose();
    b.objs = [];
  }

  // After a lost WebGL context comes back: three uploads every texture again
  // from its source, and the floor's (one big, GPU-backed canvas) is the one
  // Chrome empties in a GPU reset — so it's drawn afresh.
  rebakeFloor() {
    if (this.floor) this.floor = { ...this.floor, sig: "" };
    this.bakeFloor();
  }

  // ── the floor, from above, with the items' contact shadows ────────────────
  // (baked again only when something on it moves or comes or goes; `near`: a new layout —
  // World3.relayout — bakes again only the chunks that come within it, the rest kept)
  private bakeFloor(near?: TileRect) {
    const sig = this.objects
      .map((o) => `${o.id}|${o.kind}|${o.x}|${o.y}|${quarterOf(o)}`)
      .sort()
      .join(";");
    if (!near && this.floor?.sig === sig) return;
    const map = this.map;
    const px = Math.max(16, Math.min(64, Math.floor(4096 / Math.max(map.width, map.height))));
    // in pieces of at most 1024 px a side, as the iso view bakes it: a canvas
    // the size of the whole floor (12 M px on a big map) is slow in Chrome, and
    // on some of them comes out blank
    const CH = Math.max(1, Math.floor(1024 / px));
    // only near the edit: the chunks it reaches, their AO worked out a tile past them (the
    // drawing's scaling reads one pixel over each chunk's edge)
    const kept = near && this.floor ? this.floor.chunks : null;
    const hit = (cx: number, cy: number, w: number, h: number) =>
      !kept || !near || (cx < near.x1 && cx + w > near.x0 && cy < near.y1 && cy + h > near.y0);
    let aoOnly: TileRect | undefined;
    if (kept)
      for (let cy = 0; cy < map.height; cy += CH)
        for (let cx = 0; cx < map.width; cx += CH) {
          const w = Math.min(CH, map.width - cx);
          const h = Math.min(CH, map.height - cy);
          if (!hit(cx, cy, w, h)) continue;
          aoOnly = aoOnly
            ? {
                x0: Math.min(aoOnly.x0, cx - 1),
                y0: Math.min(aoOnly.y0, cy - 1),
                x1: Math.max(aoOnly.x1, cx + w + 1),
                y1: Math.max(aoOnly.y1, cy + h + 1),
              }
            : { x0: cx - 1, y0: cy - 1, x1: cx + w + 1, y1: cy + h + 1 };
        }
    if (kept && !aoOnly) return; // (nothing of the floor's within reach)
    const bake = new FloorBake(map, this.objects, this.wells.floor, aoOnly, this.slabs);
    // (what's floor: the slabs' — the structure's — or the tiles'; less the wells)
    const floorAt = (x: number, y: number) => this.isFloorAt(x, y) && !this.wells.floor.has(`${x},${y}`);
    const softs = [...this.areas.values(), ...this.tall.values()].map((a) => a.built.soft);
    if (!kept) this.dropFloor();
    const chunks = new Map<string, Mesh>();
    for (let cy = 0; cy < map.height; cy += CH)
      for (let cx = 0; cx < map.width; cx += CH) {
        const w = Math.min(CH, map.width - cx);
        const h = Math.min(CH, map.height - cy);
        const key = `${cx},${cy}`;
        if (kept && !hit(cx, cy, w, h)) {
          const m = kept.get(key);
          if (m) chunks.set(key, m);
          continue;
        }
        const was = kept?.get(key);
        if (was) dropFloorMesh(this.root, was);
        // one quad per run of floor tiles (the void outside is cut by the
        // shape, never by the texture's alpha: a lost canvas can't take the floor away)
        const pos: number[] = [];
        const nor: number[] = [];
        const uv: number[] = [];
        for (let y = cy; y < cy + h; y++) {
          let x = cx;
          while (x < cx + w) {
            if (!floorAt(x, y)) {
              x++;
              continue;
            }
            let x1 = x;
            while (x1 < cx + w && floorAt(x1, y)) x1++;
            // (u along x, v down from the chunk's top row, as the canvas is laid)
            const u0 = (x - cx) / w;
            const u1 = (x1 - cx) / w;
            const v0 = 1 - (y - cy) / h;
            const v1 = 1 - (y + 1 - cy) / h;
            pos.push(x, 0, y, x, 0, y + 1, x1, 0, y + 1, x, 0, y, x1, 0, y + 1, x1, 0, y);
            uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
            for (let i = 0; i < 6; i++) nor.push(0, 1, 0);
            x = x1;
          }
        }
        if (!pos.length) continue;
        const plan = bake.drawPlan(px, cx, cy, w, h);
        softShadows(plan, px, cx, cy, w, h, softs);
        const tex = new CanvasTexture(plan);
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = this.anisotropy;
        const mat = new MeshLambertMaterial({ map: tex });
        this.light(mat);
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        geo.computeBoundingSphere();
        const mesh = new Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.name = "floor";
        this.root.add(mesh);
        still(mesh);
        chunks.set(key, mesh);
      }
    this.floor = { meshes: [...chunks.values()], chunks, sig };
  }

  private dropFloor() {
    for (const m of this.floor?.meshes ?? []) dropFloorMesh(this.root, m);
    this.floor = null;
  }

  // The room's light on its lit materials: the floor I'm on takes the light
  // map, the others (kept built, below mine) don't (it's mine, in my floor's
  // coords). Switching only swaps the shader variant (both stay compiled).
  private lightFn: ((m: Material) => Piece) | null = null;
  private litMats = new Set<Material>();
  // (one of the family: the room's light, the cel bands on what's marked, the fade flags — look/yulit.ts)
  private light(m: Material) {
    this.litMats.add(m);
    yuLit(m, {
      light: this.lightFn?.(m) ?? null,
      cel: m.userData.cel ? CEL : null,
      fade: m.userData.fade ? this.fade : null,
    });
  }
  setLight(fn: ((m: Material) => Piece) | null) {
    this.lightFn = fn;
    for (const m of this.litMats) this.light(m);
  }

  // ── live parts (plan 68: a lava lamp's blobs, a fire's flames) ─────────────────────────────────
  /** Each placed thing's moving parts, kept apart from the merged buffers (furn/liveparts.ts). */
  private live = new Map<string, { sig: string; group: Group }>();
  private liveRoot = new Group();
  private glassMat: Material | null = null;
  private syncLive(objects: WorldObjectDef[]) {
    const seen = new Set<string>();
    for (const o of objects) {
      if (!isNative(o.kind)) continue;
      const sig = objectSig(o);
      seen.add(o.id);
      const had = this.live.get(o.id);
      if (had?.sig === sig) continue;
      if (had) this.liveRoot.remove(had.group);
      if (!this.glassMat) {
        this.glassMat = new MeshLambertMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        });
        this.light(this.glassMat);
      }
      const g = liveInto(o, this.materials.lit, this.materials.glow, this.glassMat);
      if (!g) {
        this.live.delete(o.id);
        continue;
      }
      this.liveRoot.add(g);
      this.live.set(o.id, { sig, group: g });
    }
    for (const [id, l] of this.live)
      if (!seen.has(id)) {
        this.liveRoot.remove(l.group);
        this.live.delete(id);
      }
    if (!this.liveRoot.parent && this.live.size) this.root.add(this.liveRoot);
  }
  // ── the living men (plan 70): every chess table's men, where its game has them ─────────────────────
  private chess: ChessMen3 | null = null;
  private syncChess(objects: WorldObjectDef[]) {
    if (!this.chess) {
      if (!objects.some((o) => isBoard(o.kind))) return;
      this.chess = new ChessMen3(this.materials.lit);
      this.root.add(this.chess.root);
    }
    this.chess.sync(objects);
  }
  /** How many chessmen this floor draws (for tests). */
  get chessmen(): number {
    return this.chess?.drawn ?? 0;
  }
  /** This floor's living men (the chess chunk shows its marks on them, follows their moves). */
  get chessMen(): ChessMen3 | null {
    return this.chess;
  }

  /** Move the live parts to time `t` (s): only those near `near` (world, this floor's frame) — the
   *  rest hold still — and at most LIVE_MAX of them a frame. */
  animateLive(t: number, near: { x: number; z: number }): void {
    // (the living men: their moves, their endings, the focus breathing — plan 70)
    this.chess?.frame(performance.now() / 1000);
    let n = 0;
    for (const { group } of this.live.values()) {
      const p = group.position;
      if ((p.x - near.x) ** 2 + (p.z - near.z) ** 2 > LIVE_NEAR * LIVE_NEAR) continue;
      animateLive(group, t);
      if (++n >= LIVE_MAX) break;
    }
  }

  // the floor's bake near an edit, the next frame (more edits meanwhile: their rects together)
  private soon: { near: TileRect | undefined; whole: boolean; id: number } | null = null;
  private bakeSoon(near?: TileRect) {
    if (this.soon) {
      this.soon.whole ||= !near;
      this.soon.near = this.soon.near && near ? union(this.soon.near, near) : (this.soon.near ?? near);
      return;
    }
    this.soon = { near, whole: !near, id: raf(() => this.flushBake()) as unknown as number };
  }
  private flushBake() {
    const s = this.soon;
    if (!s) return;
    this.soon = null;
    this.bakeFloor(s.whole ? undefined : s.near);
  }

  dispose() {
    this.soon = null;
    this.later = null;
    this.dropDecks();
    this.dropRoofs();
    this.glassMat?.dispose();
    this.chess?.dispose();
    for (const b of this.walls) this.unmount(b);
    for (const a of this.areas.values()) this.unmount(a.built);
    for (const t of this.tall.values()) this.unmount(t.built);
    for (const f of [...this.wallFades, ...[...this.tall.values()].map((t) => t.fade)])
      for (const m of f.own?.values() ?? []) m.dispose();
    this.dropFloor();
    for (const c of this.chunks.values()) for (const m of c.merged) m.geometry.dispose();
    this.chunks.clear();
    this.flagsU.value.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

// the next frame (node's tests: the next turn)
const raf = (f: () => void): unknown =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(f) : setTimeout(f, 0);
// The items' contact shadows on a floor piece (tiles cx, cy, w by h at `px`
// a tile), soft without a canvas filter (a filtered fill on a big canvas is
// what Chrome draws slowly, or not at all): a few fills of each shape, from a
// little inside its edge to a little outside, each as faint as the sum needs.
function softShadows(
  plan: HTMLCanvasElement,
  px: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  softs: Out["soft"][],
) {
  const g = plan.getContext("2d") as CanvasRenderingContext2D;
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.setTransform(px, 0, 0, px, -cx * px, -cy * px);
  g.fillStyle = INK;
  const STEPS = 3;
  const blur = Math.max(1, px * 0.05) / px; // tiles
  const layer = (op: number) => 1 - (1 - op) ** (1 / STEPS);
  const inside = (x0: number, y0: number, x1: number, y1: number) =>
    x1 >= cx - 1 && x0 <= cx + w + 1 && y1 >= cy - 1 && y0 <= cy + h + 1;
  for (const soft of softs) {
    for (const r of soft.rects) {
      if (!inside(r.x0, r.y0, r.x1, r.y1)) continue;
      g.globalAlpha = layer(r.op * 0.8);
      for (let i = 0; i < STEPS; i++) {
        const d = blur * ((2 * i) / (STEPS - 1) - 1);
        const rw = r.x1 - r.x0 + 2 * d;
        const rh = r.y1 - r.y0 + 2 * d;
        if (rw <= 0 || rh <= 0) continue;
        const rad = Math.max(0, Math.min(r.round * 0.5 + d, rw / 2, rh / 2));
        g.beginPath();
        g.roundRect(r.x0 - d, r.y0 - d, rw, rh, rad);
        g.fill();
      }
    }
    for (const dot of soft.dots) {
      if (!inside(dot.x - dot.r, dot.y - dot.r, dot.x + dot.r, dot.y + dot.r)) continue;
      g.globalAlpha = layer(dot.op * 0.8);
      for (let i = 0; i < STEPS; i++) {
        const rr = dot.r + blur * ((2 * i) / (STEPS - 1) - 1);
        if (rr <= 0) continue;
        g.beginPath();
        g.arc(dot.x, dot.y, rr, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
}

/** The cell a place of a floor is in (its frame's; `c` the floor's corner in the world: cells are
 *  the world's). */
const cellKey = (x: number, y: number, c: { x: number; y: number }) =>
  `${Math.floor((x + c.x) / CELL)},${Math.floor((y + c.y) / CELL)}`;
/** A mezzanine as World3 draws it (its floor's own frame): its rings (outline, then holes), its
 *  material, how far over the floor its top is (m). */
export interface Deck {
  rings: [number, number][][];
  top: string;
  over: number;
}
// (a mezzanine's colour by its material: the floors' swatches)
const DECK_COLOR: Record<string, number> = {
  ".": 0x8f6038,
  ",": 0x6b6a3a,
  _: 0xe6dcc4,
  ":": 0x7a3b2e,
  "~": 0x2f2620,
  x: 0x4a4740,
};

/** The wall parts of walls off the lattice (World3.freeWall): `free|<wall>|<run>`; as a key of
 *  `buildWalls(only)`, all of them again. */
const FREE = "free";
/** What one sketch drew, added to another's (a turned piece into its area's or run's). */
function appendOut(to: Out, from: Out): void {
  for (const k of ["lit", "glow", "clear"] as const) {
    to[k].pos.push(...from[k].pos);
    to[k].nor.push(...from[k].nor);
    to[k].col.push(...from[k].col);
  }
  to.lines.push(...from.lines);
  to.lineCol.push(...from.lineCol);
  to.cards.push(...from.cards);
  to.decals.push(...from.decals);
  to.soft.rects.push(...from.soft.rects);
  to.soft.dots.push(...from.soft.dots);
}
// the run an edge's upper part is drawn and fades in (up to RUN edges along its line)
const runKey = (dir: "h" | "v", x: number, y: number) =>
  dir === "h" ? `h|${y}|${Math.floor(x / RUN)}` : `v|${x}|${Math.floor(y / RUN)}`;
// a post's upper part fades with the run it belongs to most (h first): that run's edge
// (`e`, `w`, `s`: the edges east, west and south of the post)
function postRun(X: number, Y: number, e: string, w: string, s: string): ["h" | "v", number, number] {
  if (isWallEdge(e) || isWallEdge(w)) return ["h", Math.max(0, isWallEdge(e) ? X : X - 1), Y];
  return ["v", X, isWallEdge(s) ? Y : Y - 1];
}

/** The wall pieces (World3's `low|…`, `run|…`) a new layout touches: at each end of every edge
 *  that changed (its wall, its back face), in the old layout and the new, the pieces of every
 *  wall meeting there (its end is clipped to the post there, which may have come or gone) and
 *  of the post itself. Every other piece comes out of `buildWalls` exactly as it was. */
export function touchedWalls(
  a: MapDef,
  b: MapDef,
  ea: WallEdges = edgesOfMap(a),
  eb: WallEdges = edgesOfMap(b),
): { keys: Set<string>; box: TileRect | null } {
  const corner = { x: b.ox ?? 0, y: b.oy ?? 0 };
  const areaKey = (x: number, y: number) => cellKey(x, y, corner);
  const pts = new Set<string>();
  const changed = (dir: "h" | "v", x: number, y: number) =>
    (dir === "h" ? ea.h(x, y) !== eb.h(x, y) : ea.v(x, y) !== eb.v(x, y)) ||
    ea.back({ dir, x, y }) !== eb.back({ dir, x, y });
  const W = Math.max(a.width, b.width);
  const H = Math.max(a.height, b.height);
  for (let y = 0; y <= H; y++)
    for (let x = 0; x < W; x++)
      if (changed("h", x, y)) {
        pts.add(`${x},${y}`);
        pts.add(`${x + 1},${y}`);
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x <= W; x++)
      if (changed("v", x, y)) {
        pts.add(`${x},${y}`);
        pts.add(`${x},${y + 1}`);
      }
  const out = new Set<string>();
  for (const k of pts) {
    const [X, Y] = k.split(",").map(Number);
    for (const m of [ea, eb]) {
      const e = m.h(X, Y);
      const w = m.h(X - 1, Y);
      const n = m.v(X, Y - 1);
      const s = m.v(X, Y);
      const meeting: ["h" | "v", number, number, string][] = [
        ["h", X, Y, e],
        ["h", X - 1, Y, w],
        ["v", X, Y - 1, n],
        ["v", X, Y, s],
      ];
      let any = false;
      for (const [d, x, y, ch] of meeting) {
        if (!isWallEdge(ch)) continue;
        any = true;
        out.add(`low|${areaKey(x, y)}`);
        out.add(`run|${runKey(d, x, y)}`);
      }
      if (!any) continue;
      out.add(`low|${areaKey(X, Y)}`);
      const [d, rx, ry] = postRun(X, Y, e, w, s);
      out.add(`run|${runKey(d, rx, ry)}`);
    }
  }
  // (the walls off the lattice: all of them again when any changed — and the lattice's pieces at
  // their ends, where a post may have come or gone)
  if (JSON.stringify(ea.free) !== JSON.stringify(eb.free)) {
    out.add(FREE);
    for (const w of [...ea.free, ...eb.free])
      for (const [x, y] of [w.a, w.b]) {
        const p = { x0: Math.floor(x), y0: Math.floor(y), x1: Math.ceil(x), y1: Math.ceil(y) };
        pts.add(`${p.x0},${p.y0}`);
        if (Number.isInteger(x) && Number.isInteger(y)) {
          out.add(`low|${areaKey(x, y)}`);
          for (const [d, rx, ry] of [
            ["h", x, y],
            ["h", x - 1, y],
            ["v", x, y],
            ["v", x, y - 1],
          ] as const)
            out.add(`run|${runKey(d, rx, ry)}`);
        }
      }
  }
  let box: TileRect | null = null;
  for (const k of pts) {
    const [X, Y] = k.split(",").map(Number);
    const p = { x0: X, y0: Y, x1: X, y1: Y };
    box = box ? union(box, p) : p;
  }
  return { keys: out, box };
}

/** A rect of tiles (x1, y1 past its last). */
type TileRect = { x0: number; y0: number; x1: number; y1: number };
const grow = (r: TileRect, by: number): TileRect => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });
const union = (a: TileRect, b: TileRect): TileRect => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});
// how far a wall's darkening reaches across the floor's bake (art/floors.ts aoCanvas: walls
// RW 0.95 tiles from the tile's neighbours — 2 tiles, and one more to be safe)
const FLOOR_REACH = 3;
// how far a thing's contact shadow reaches past its area or footprint on the floor's bake
const SOFT_REACH = 2;

function dropFloorMesh(root: Object3D, m: Mesh) {
  root.remove(m);
  m.geometry.dispose();
  const mat = m.material as MeshLambertMaterial;
  mat.map?.dispose();
  mat.dispose();
}

function getOr<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

// where an object's sketch starts (things on a surface: around their spot on it)
function anchorOf(o: WorldObjectDef): [number, number] {
  if (entry(o.kind).onSurface) {
    const c = topCentre(o);
    return [c.x - 0.5, c.y - 0.5];
  }
  // wall items: where their drawing is along the wall (hang.ts)
  if (entry(o.kind).wall) {
    const h = hangOf(o);
    return [h.ax, h.ay];
  }
  return [o.x, o.y];
}

// a door's or window's stretch of its wall line, the wall's thickness deep
function edgeRect(o: WorldObjectDef): { x0: number; y0: number; x1: number; y1: number } {
  const n = Math.max(1, entry(o.kind).w);
  return quarterOf(o) % 2 === 0
    ? { x0: o.x, y0: o.y - 0.1, x1: o.x + n, y1: o.y + 0.1 }
    : { x0: o.x - 0.1, y0: o.y, x1: o.x + 0.1, y1: o.y + n };
}

function footRect(o: WorldObjectDef): { x0: number; y0: number; x1: number; y1: number } {
  const { w, h } = placedFootprint(o);
  return { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h };
}

// the clutter's sketch is centred on (0.5, 0.5); frames hang on the edge at y
const xyOf = ([x, y]: [number, number]) => ({ x: x + 0.5, y: y + 0.5 });
const dressAt = (d: DressItem): [number, number] => [d.x - 0.5, d.kind === "frame" ? d.y : d.y - 0.5];
// seeds are bucketed (as in iso) so look-alike pieces share a drawing
const bucket = (seed: number) => (Math.floor(seed * 12) + 0.5) / 12;

// everything about a thing that changes how it's drawn
function objectSig(o: WorldObjectDef): string {
  const p = Object.entries(o.props ?? {})
    .filter(([k]) => !QUIET_PROPS.has(k) && !QUIET_OF[o.kind]?.has(k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `${o.id}|${o.kind}|${o.x}|${o.y}|${quarterOf(o)}|${JSON.stringify(p)}`;
}

// the highest point drawn (tiles)
function topOf(o: Out): number {
  let top = 0;
  for (const g of [o.lit, o.glow, o.clear])
    for (let i = 1; i < g.pos.length; i += 3) if (g.pos[i] > top) top = g.pos[i];
  return top;
}

// the 3D box around what's drawn (tiles), padded a little for easy clicking
function boundsOf(o: Out): Omit<Pick3, "id" | "use" | "dress"> | null {
  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (const g of [o.lit, o.glow, o.clear])
    for (let i = 0; i < g.pos.length; i += 3) {
      const x = g.pos[i];
      const h = g.pos[i + 1];
      const y = g.pos[i + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (h < z0) z0 = h;
      if (h > z1) z1 = h;
    }
  // free-hand cards (leaves, shades) count too: a box round each, as wide as it turns
  for (const c of o.cards) {
    const r = Math.max(Math.abs(c.u0), Math.abs(c.u1)) * 0.75;
    x0 = Math.min(x0, c.x - r);
    x1 = Math.max(x1, c.x + r);
    y0 = Math.min(y0, c.y - r);
    y1 = Math.max(y1, c.y + r);
    z0 = Math.min(z0, c.z + c.v0);
    z1 = Math.max(z1, c.z + c.v1);
  }
  if (x1 < x0) return null;
  const p = 0.04;
  return { x0: x0 - p, y0: y0 - p, z0: z0 - p, x1: x1 + p, y1: y1 + p, z1: z1 + p };
}

// add one sketch's buffers to another (no spread: these get long)
function append(dst: Out, src: Out) {
  const cat = (a: number[], b: number[]) => {
    for (let i = 0; i < b.length; i++) a.push(b[i]);
  };
  for (const k of ["lit", "glow", "clear"] as const) {
    cat(dst[k].pos, src[k].pos);
    cat(dst[k].nor, src[k].nor);
    cat(dst[k].col, src[k].col);
  }
  cat(dst.lines, src.lines);
  cat(dst.lineCol, src.lineCol);
  dst.cards.push(...src.cards);
  dst.decals.push(...src.decals);
  dst.soft.rects.push(...src.soft.rects);
  dst.soft.dots.push(...src.soft.dots);
}

const hexStr = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// SVG → texture, shared between equal drawings (never disposed: other pieces may use it)
const cardCache = new Map<string, Promise<Texture | null>>();
export function cardTexture(svg: string): Promise<Texture | null> {
  let p = cardCache.get(svg);
  if (!p) {
    p = new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      img
        .decode()
        .then(() => {
          const t = new Texture(img);
          t.colorSpace = SRGBColorSpace;
          t.needsUpdate = true;
          resolve(t);
        })
        .catch(() => resolve(null))
        .finally(() => URL.revokeObjectURL(url));
    });
    cardCache.set(svg, p);
  }
  return p;
}

// A see-through, two-sided surface as two meshes: its back faces, then its front faces.
// three.js draws such a material in two passes itself, flipping its side between them —
// and every flip marks the material changed, so each pass looks its shader up again (on
// every glass mesh and card, every frame: a third of an indoor 3D frame,
// docs/plan/38-the-lag.md). Two meshes made one after the other, each with its side fixed,
// draw in that same order (the same depth, the next id) with the same shaders: the same
// picture, no lookups. A single material: one mesh, as before.
function twoSided(geo: BufferGeometry, mat: Material | [Material, Material]): Mesh[] {
  if (!Array.isArray(mat)) return [new Mesh(geo, mat)];
  const back = new Mesh(geo, mat[0]);
  const front = new Mesh(geo, mat[1]);
  return [back, front];
}

// A mesh that won't move: its matrix made now, not again every frame.
function still(o: Object3D) {
  o.updateMatrix();
  o.matrixAutoUpdate = false;
}
