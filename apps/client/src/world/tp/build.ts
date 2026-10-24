import {
  backAt,
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
  hWall,
  isDoorKind,
  isFloor,
  isOpening,
  isWallEdge,
  isWindow,
  isWindowKind,
  type MapDef,
  NO_WALL,
  openingEdges,
  placedFootprint,
  rotOf,
  tileAt,
  topCentre,
  vWall,
  type WallCut,
  type WorldObjectDef,
  wallCuts,
} from "@yutopia/shared";
import {
  BackSide,
  Box3,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  DoubleSide,
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
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";
import { FloorBake } from "../art/floors";
import { piece, WALL_H } from "../art/furniture";
import { INK } from "../art/items/kit";
import { type LightSource, lightSources } from "../art/light";
import { boxInParent, type Slab } from "./below-cull";
import { type Geo, MeshSketch, type Opts3, Out, zt } from "./kit3d";
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

const AREA = 6; // tiles per merged area side
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

export interface FadeGroup {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // plan AABB, tiles
  top: number; // tiles
  objects: Object3D[];
  alpha: number;
  own?: Map<Material, Material>; // per-group see-through copies, made on the first fade
  item?: boolean; // a tall piece of furniture (not a wall run)
  wall?: boolean; // …that hangs on a wall (it goes with its wall)
  index?: number; // its slot in the merged meshes' fade flags (World3.faded)
}

// Something you can click: its 3D bounds (tiles; z = height).
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
  cards: Object3D[] = []; // turned to the camera every frame
  lights: LightSource[] = [];
  stats = { triangles: 0, meshes: 0, cards: 0, ms: 0, areas: 0 };

  private walls: Built[] = [];
  private wallFades: FadeGroup[] = [];
  private areas = new Map<string, { sig: string; built: Built }>();
  private tall = new Map<string, { sig: string; built: Built; fade: FadeGroup }>();
  private tallIds = new Set<string>(); // things known to stand tall (drawn on their own)
  private floor: { meshes: Mesh[]; sig: string } | null = null;
  private objects: WorldObjectDef[] = [];
  private cardN = 0;
  private posts = new Set<string>(); // "x,y" of every wall post (doors stop at them too)
  private cuts = new Map<string, WallCut>(); // doors' and windows' holes, by edge
  private cutSig = "";
  // a floor that isn't mine never fades: its walls' solid parts drawn merged (setFading)
  private fading = true;
  // ── drawn merged (docs/plan/38-the-lag.md, round 4) ──
  // Every opaque piece — the walls' low parts and runs, each area's things, the tall
  // things — is drawn merged an area (AREA tiles) at a time, one mesh per material; the
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

  // `light`: how lit materials take the room's light (the iso light map)
  constructor(
    private items: Items,
    readonly map: MapDef,
    objects: WorldObjectDef[],
    private anisotropy = 4,
    light: (m: Material) => void = () => {},
    // the stairwells (shared wellsOf): no floor where the stairs from below come
    // up, no ceiling over this floor's own
    private wells: { floor: Set<string>; ceiling: Set<string> } = { floor: new Set(), ceiling: new Set() },
  ) {
    const t0 = performance.now();
    // (the floor is moved by the view, which makes its matrix then: not every frame)
    this.root.matrixAutoUpdate = false;
    this.lightFn = light;
    // (the shared materials read the fade flags: World3.faded — a piece itself has no
    // `aFade`, reads 0, and is drawn)
    for (const m of [this.materials.lit, this.materials.clearBack, this.materials.clearFront]) m.userData.fade = true;
    this.withFade(this.materials.glow);
    this.withFade(this.materials.ink);
    this.light(this.materials.lit);
    this.light(this.materials.clear);
    this.light(this.materials.clearBack);
    this.light(this.materials.clearFront);
    this.cuts = wallCuts(objects);
    this.cutSig = cutsSig(objects);
    this.buildWalls();
    this.update(objects);
    this.stats.ms = performance.now() - t0;
  }

  // ── walls (once per layout) ────────────────────────────────────────────────
  private buildWalls() {
    const { post, wall, WALL_HALF_T } = this.items;
    const map = this.map;
    const low = new Map<string, Out>();
    const lowOf = (x: number, y: number) => getOr(low, areaKey(x, y), () => new Out());
    const runs = new Map<string, { out: Out; x0: number; y0: number; x1: number; y1: number; top: number }>();
    const runOf = (dir: "h" | "v", x: number, y: number, top: number) => {
      const k = dir === "h" ? `h|${y}|${Math.floor(x / RUN)}` : `v|${x}|${Math.floor(y / RUN)}`;
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
        const w = hWall(map, X - 1, Y);
        const e = hWall(map, X, Y);
        const n = vWall(map, X, Y - 1);
        const s = vWall(map, X, Y);
        const touching = [w, e, n, s].filter(isWallEdge);
        if (!touching.length) continue;
        const straight =
          (isWallEdge(w) && isWallEdge(e) && !isWallEdge(n) && !isWallEdge(s) && half(w) === half(e)) ||
          (isWallEdge(n) && isWallEdge(s) && !isWallEdge(w) && !isWallEdge(e) && half(n) === half(s));
        if (straight) continue;
        const height = touching.every(half) ? 34 : WALL_H;
        posts.set(`${X},${Y}`, { height, ch: touching.find((c) => !half(c)) ?? touching[0], e, w, s });
      }
    const addWall = (dir: "h" | "v", x: number, y: number, ch: string) => {
      // a wall stops at the post's faces: running on to the joint, its faces
      // would lie in the post's own (in other colours) and flicker
      const [ax, ay, bx, by] = dir === "h" ? [x, y, x + 1, y] : [x, y, x, y + 1];
      const a0 = posts.has(`${ax},${ay}`) ? WALL_HALF_T : 0;
      const a1 = posts.has(`${bx},${by}`) ? 1 - WALL_HALF_T : 1;
      const clip = dir === "h" ? { x0: a0, x1: a1, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: a0, y1: a1 };
      const top = ch === HALF_WALL ? 34 : WALL_H;
      const run = runOf(dir, x, y, zt(top));
      const back = backAt(map, { dir, x, y });
      const c = this.cuts.get(edgeKey({ dir, x, y }));
      const cut = c ? ([c.z0, c.z1] as const) : null;
      if (back === NO_WALL) {
        // one material through and through: drawn once, its face mirrored onto the other side
        const at = { w: 1, h: 1, seed: 0.37, clip, at: [x, y] as [number, number], mirror: true };
        wall(sketch({ ...at, out: lowOf(x, y) }), dir, ch, "low", undefined, cut);
        wall(sketch({ ...at, out: run.out }), dir, ch, "high", undefined, cut);
        return;
      }
      // two faces: the front half as it is, the back half drawn as the front of
      // the sketch turned round from the tile behind (its +y / +x face lands on −y / −x)
      const bch = isWindow(ch) ? back.toUpperCase() : back;
      const behind: [number, number] = dir === "h" ? [x, y - 1] : [x - 1, y];
      const bclip = dir === "h" ? { x0: a0, x1: a1, y0: 0, y1: 2 } : { x0: 0, x1: 2, y0: a0, y1: a1 };
      for (const [part, out] of [
        ["low", lowOf(x, y)],
        ["high", run.out],
      ] as const) {
        wall(sketch({ w: 1, h: 1, seed: 0.37, clip, at: [x, y], out }), dir, ch, part, "front", cut);
        wall(sketch({ w: 1, h: 1, seed: 0.37, clip: bclip, at: behind, rot: 2, out }), dir, bch, part, "back", cut);
      }
    };
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const ch = hWall(map, x, y);
        if (isWallEdge(ch)) addWall("h", x, y, ch);
      }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= map.width; x++) {
        const ch = vWall(map, x, y);
        if (isWallEdge(ch)) addWall("v", x, y, ch);
      }
    this.posts = new Set(posts.keys());
    for (const [key, { height, ch, e, w, s }] of posts) {
      const [X, Y] = key.split(",").map(Number);
      post(sketch({ w: 1, h: 1, at: [X, Y], out: lowOf(X, Y) }), height, "low", ch);
      // the upper part fades with the run it belongs to most (h first)
      const hx = isWallEdge(e) ? X : X - 1;
      const run =
        isWallEdge(e) || isWallEdge(w)
          ? runOf("h", Math.max(0, hx), Y, zt(height))
          : runOf("v", X, isWallEdge(s) ? Y : Y - 1, zt(height));
      post(sketch({ w: 1, h: 1, at: [X, Y], out: run.out }), height, "high", ch);
    }
    for (const [k, out] of low) this.walls.push(this.mount(out, k));
    this.buildCeiling();
    for (const r of runs.values()) {
      const b = this.mount(r.out, areaKey((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2));
      this.walls.push(b);
      const f: FadeGroup = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, top: r.top, objects: b.objs, alpha: 1 };
      this.wallFades.push(f);
      this.tagFade(b, f);
    }
  }

  // Ceilings over every floor tile at the walls' height, facing down: seen
  // from below only (a low free camera, eye level), never from above.
  private buildCeiling() {
    const map = this.map;
    const z = zt(WALL_H);
    const pos: number[] = [];
    // (none outdoors — the lot is open sky — nor over a stairwell)
    const under = (x: number, y: number) => {
      const ch = tileAt(map, x, y);
      return isFloor(ch) && ch !== "a" && ch !== "c" && !this.wells.ceiling.has(`${x},${y}`);
    };
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
    if (!pos.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new MeshLambertMaterial({ color: 0xd9ccb0 });
    this.light(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = "ceiling";
    this.root.add(mesh);
    still(mesh);
    this.walls.push({ objs: [mesh], cards: [], soft: { rects: [], dots: [] }, picks: [], dispose: [geo, mat] });
  }

  // ── furniture + clutter (again where it changed) ────────────────────────────
  update(objects: WorldObjectDef[]) {
    this.objects = objects;
    // a door or window came, went or moved: the walls again, with their holes
    const sig = cutsSig(objects);
    let rewalled = false;
    if (sig !== this.cutSig) {
      this.cutSig = sig;
      this.cuts = wallCuts(objects);
      for (const b of this.walls) this.unmount(b);
      this.walls = [];
      this.wallFades = [];
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
      const a = area(areaKey(at[0], at[1]));
      a.objs.push(o);
      a.sig.push(sig);
    }
    for (const d of dressItems(this.map, objects)) {
      const at = dressAt(d);
      const a = area(areaKey(at[0], at[1]));
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
      const built = this.mount(out, k);
      built.picks = picks;
      // a tall thing found while drawing changes this area's list: keep it from redrawing next time
      const left = a.objs.filter((o) => !this.tallIds.has(o.id)).map(objectSig);
      const keep = [...left, ...a.sig.filter((x) => x.startsWith("d|"))].sort().join(";");
      this.areas.set(k, { sig: keep, built });
    }
    for (const [k, had] of this.areas)
      if (!byArea.has(k)) {
        this.unmount(had.built);
        this.areas.delete(k);
        changed = true;
      }
    // tall furniture
    for (const [id, t] of tallNow) {
      const had = this.tall.get(id);
      if (had?.sig === t.sig) continue;
      changed = true;
      if (had) this.unmount(had.built);
      const one = this.drawObject(t.o);
      const built = this.mount(one.out, areaKey(...anchorOf(t.o)));
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
        ...r,
        top: hang ? zt(WALL_H) : one.top, // (a wall item fades exactly when its wall does)
        objects: built.objs,
        alpha: 1,
        item: true,
        wall: hang,
      };
      this.tall.set(id, { sig: t.sig, built, fade });
      this.tagFade(built, fade);
    }
    for (const [id, had] of this.tall)
      if (!tallNow.has(id)) {
        this.unmount(had.built);
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
        covers: (x, y) => isFloor(tileAt(map, x, y)) && !wells.has(`${x},${y}`),
      },
    };
  }

  /** The floor's walls for below-cull.ts: the tiles a sight line could leave the floor by
   *  below the walls' top — a well, or an edge between floor and not-floor that isn't a
   *  solid full wall (a window, a door, glass, a half wall, no wall) — and that top (tiles).
   *  `key` changes when the walls are built again. */
  shell(): { bad: (x: number, y: number) => boolean; top: number; key: unknown } {
    const map = this.map;
    const inside = (x: number, y: number) => isFloor(tileAt(map, x, y));
    const solid = (dir: "h" | "v", x: number, y: number) => {
      const ch = dir === "h" ? hWall(map, x, y) : vWall(map, x, y);
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
      top: zt(WALL_H),
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

  // (chained after whatever patched it before — the room's light map, light3d.ts)
  private withFade(m: Material) {
    const inner = m.onBeforeCompile;
    const key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      inner.call(m, sh, r);
      sh.uniforms.fadeFlags = this.flagsU;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFade;\nuniform sampler2D fadeFlags;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
  if (aFade > 0.5) {
    int fi = int(aFade + 0.5);
    if (texelFetch(fadeFlags, ivec2(fi % ${FLAG_W}, fi / ${FLAG_W}), 0).r < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`,
        );
    };
    m.customProgramCacheKey = () => `${key.call(m)}|fade`;
    m.needsUpdate = true;
  }

  // what clicks, fades, cards and lights see: everything built, gathered
  private collect() {
    const all = [
      ...this.walls,
      ...[...this.areas.values()].map((a) => a.built),
      ...[...this.tall.values()].map((t) => t.built),
    ];
    this.picks = all.flatMap((b) => b.picks);
    this.cards = all.flatMap((b) => b.cards);
    this.fades = [...this.wallFades, ...[...this.tall.values()].map((t) => t.fade)];
    this.lights = lightSources(this.objects);
    this.stats.areas = this.areas.size;
  }

  // one thing drawn on its own (also build mode's ghosts)
  drawObject(o: WorldObjectDef): { out: Out; top: number; tall: boolean; pick: Pick3 | null } {
    const { drawItem, hasItemArt, itemSketchOpts } = this.items;
    const e = entry(o.kind);
    const out = new Out();
    if (isOpening(o.kind)) {
      // a door or window in its wall (rot 3 on west edges)
      const rot = (o.rot ?? 0) % 2 === 1 ? 3 : 0;
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
      for (const part of leaves ? ["edge", "leaf"] : ["edge"]) {
        const s = new MeshSketch({ rot, w: n, h: 1, at: [o.x, o.y], out, clip: part === "edge" ? clip : null });
        drawItem(s, { kind: o.kind, id: o.id, rot, props: { ...(o.props ?? {}), _part: part } });
        s.end();
      }
    } else {
      const rot = rotOf(o);
      const ref = { kind: o.kind, id: o.id, rot, props: o.props };
      const at = anchorOf(o);
      const lift = e.onSurface ? Number(o.props?.z) || 0 : e.wall ? hangOf(o).lift : 0;
      if (o.kind === "pool_table") {
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
    const seed = bucket(d.seed);
    const s = new MeshSketch({ w: 1, h: 1, seed, at: dressAt(d), out });
    this.items.dressing(s, d.kind as DressKind, d.z, seed);
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
  // (baked again only when something on it moves or comes or goes)
  private bakeFloor() {
    const sig = this.objects
      .map((o) => `${o.id}|${o.kind}|${o.x}|${o.y}|${o.rot ?? 0}`)
      .sort()
      .join(";");
    if (this.floor?.sig === sig) return;
    const map = this.map;
    const px = Math.max(16, Math.min(64, Math.floor(4096 / Math.max(map.width, map.height))));
    // in pieces of at most 1024 px a side, as the iso view bakes it: a canvas
    // the size of the whole floor (12 M px on a big map) is slow in Chrome, and
    // on some of them comes out blank
    const CH = Math.max(1, Math.floor(1024 / px));
    const bake = new FloorBake(map, this.objects, 1, 1024, this.wells.floor);
    const floorAt = (x: number, y: number) => isFloor(tileAt(map, x, y)) && !this.wells.floor.has(`${x},${y}`);
    const softs = [...this.areas.values(), ...this.tall.values()].map((a) => a.built.soft);
    this.dropFloor();
    const meshes: Mesh[] = [];
    for (let cy = 0; cy < map.height; cy += CH)
      for (let cx = 0; cx < map.width; cx += CH) {
        const w = Math.min(CH, map.width - cx);
        const h = Math.min(CH, map.height - cy);
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
        meshes.push(mesh);
      }
    this.floor = { meshes, sig };
  }

  private dropFloor() {
    for (const m of this.floor?.meshes ?? []) {
      this.root.remove(m);
      m.geometry.dispose();
      const mat = m.material as MeshLambertMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.floor = null;
  }

  // The room's light on its lit materials: the floor I'm on takes the light
  // map, the others (kept built, below mine) don't (it's mine, in my floor's
  // coords). Switching only swaps the shader variant (both stay compiled).
  private lightFn: (m: Material) => void = () => {};
  private litMats = new Set<Material>();
  private light(m: Material) {
    this.litMats.add(m);
    this.lightFn(m);
    if (m.userData.fade) this.withFade(m);
  }
  setLight(fn: ((m: Material) => void) | null) {
    this.lightFn = fn ?? (() => {});
    for (const m of this.litMats) {
      if (fn) fn(m);
      else {
        m.onBeforeCompile = () => {};
        m.customProgramCacheKey = () => "";
        m.needsUpdate = true;
      }
      if (m.userData.fade) this.withFade(m);
    }
  }

  dispose() {
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

const areaKey = (x: number, y: number) => `${Math.floor(x / AREA)},${Math.floor(y / AREA)}`;

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
  return (o.rot ?? 0) % 2 === 0
    ? { x0: o.x, y0: o.y - 0.1, x1: o.x + n, y1: o.y + 0.1 }
    : { x0: o.x - 0.1, y0: o.y, x1: o.x + 0.1, y1: o.y + n };
}

function footRect(o: WorldObjectDef): { x0: number; y0: number; x1: number; y1: number } {
  const { w, h } = placedFootprint(o);
  return { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h };
}

// the clutter's sketch is centred on (0.5, 0.5); frames hang on the edge at y
const dressAt = (d: DressItem): [number, number] => [d.x - 0.5, d.kind === "frame" ? d.y : d.y - 0.5];
// seeds are bucketed (as in iso) so look-alike pieces share a drawing
const bucket = (seed: number) => (Math.floor(seed * 12) + 0.5) / 12;

// everything about a thing that changes how it's drawn
function objectSig(o: WorldObjectDef): string {
  const p = Object.entries(o.props ?? {})
    .filter(([k]) => !QUIET_PROPS.has(k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `${o.id}|${o.kind}|${o.x}|${o.y}|${o.rot ?? 0}|${JSON.stringify(p)}`;
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
