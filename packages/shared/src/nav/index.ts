// The navmesh (docs/plan/72-the-3d-core.md, phase 7: "the navmesh says how to get somewhere"):
// recast-navigation, a mesh a floor — its slab, walls and roof (and on the ground floor the land
// round it) built once into a tile cache; what's on it (furniture, clutter, a lift's stop, a
// locked door, a parked car) its obstacles, put in and taken out as things change (a tile's
// rebuild, a fraction of a millisecond). Built from the solids Jolt's world is made of
// (physics/build.ts), so the two never disagree about what's in the way; heights: the stairs are
// connectors between floors (structure/connectors.ts), their flights obstacles on a floor's mesh.
//
// Same answers as the tile grid's findPath (path.ts) gave: the waypoints after `from`, the last the
// target itself when it's on the mesh (else the nearest point of it near the target), null when
// there's no way. Paths stay on one floor.
import {
  exportTileCache,
  importTileCache,
  init,
  type NavMesh,
  NavMeshQuery,
  type Obstacle,
  type TileCache,
} from "recast-navigation";
import { getBoundingBox } from "recast-navigation/generators";
import type { Point } from "../geom.ts";
import { CHUNK, layoutVersion } from "../grounds.ts";
import { elevOf } from "../levels.ts";
import type { BuildingSolids } from "../physics/build.ts";
import { landOf } from "../physics/build.ts";
import { groundSolidsIn } from "../shapes/grounds.ts";
import type { Solid3 } from "../shapes/index.ts";
import { STOREY } from "../units.ts";
import { buildTileCache, meshProcess } from "./tilecache.ts";

let ready: Promise<void> | null = null;
/** Recast's wasm, once (the server's at a room's start, the browser's with the 3D view). */
export function loadNav(): Promise<void> {
  ready ??= init();
  return ready;
}

/** Cells 0.11 m across (a body's 0.22 m radius two of them: a 1 m door stays a way through), 0.05 m
 *  high; a body 1.7 m tall climbing 0.35 m, slopes to 45°. Tiles 48 cells (5.3 m). */
const CS = 0.11;
/** A body's radius (grid.ts BODY_R): the mesh is where a body's middle can be. */
const BODY_R = 0.22;
const CH = 0.05;
const CONFIG = {
  cs: CS,
  ch: CH,
  tileSize: 48,
  borderSize: 5,
  walkableRadius: Math.ceil(BODY_R / CS),
  walkableHeight: Math.ceil(1.7 / CH),
  walkableClimb: Math.floor(0.35 / CH),
  walkableSlopeAngle: 45,
  expectedLayersPerTile: 4,
  maxObstacles: 8192,
};
/** Out on the land (the windows): cells 0.15 m — a 1 m door still a way through, at half the work. */
const LAND_CS = 0.15;
const LAND_CONFIG = { ...CONFIG, cs: LAND_CS, walkableRadius: Math.ceil(BODY_R / LAND_CS), tileSize: 64 };
/** A way out on the land: a window round its two ends this far each way, its sides on the land's
 *  chunks — as far as the tile grid's findPath looked; a way longer than this across, none. */
const WINDOW_MARGIN = 40;
const WINDOW_MAX = 640;
/** A window kept is used again for ends this far inside it; this many kept. */
const WINDOW_INSET = 16;
const WINDOWS = 6;

/** A rectangle of the world (x, z). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const inRect = (r: Rect, p: Point, inset = 0) =>
  p.x >= r.x0 + inset && p.x <= r.x1 - inset && p.y >= r.z0 + inset && p.y <= r.z1 - inset;
// (a solid's footprint touches the rectangle)
const touches = (r: Rect, s: Solid3) => {
  const [x, z, e] = s.t === "box" ? [s.x, s.z, Math.hypot(s.hx, s.hz)] : [s.x, s.z, s.r];
  return x + e >= r.x0 && x - e <= r.x1 && z + e >= r.z0 && z - e <= r.z1;
};

/** How near a point the mesh is looked for (m): across, and up and down. */
const NEAR = { x: 0.6, y: 1.2, z: 0.6 };
/** …and, an end inside something (a desk's middle, under a parked car), how far round it: as the
 *  tile grid's findPath took the nearest open tile, 2 from where you start, 3 from the target. */
const FROM_NEAR = { x: 2, y: 1.2, z: 2 };
/** …up and down, on a mesh with land in it (m) */
const LAND_REACH = 600;
const TO_NEAR = { x: 3, y: 1.2, z: 3 };
/** The ground floor's land: its chunks within the floor's span and this margin (m). */
const LAND_MARGIN = 4;
/** Floors made lately, by what they were made of (a room made again — a test's, a restart — takes
 *  its floors from here: a few ms, not a second): their tile caches exported, newest last. */
const KEPT = new Map<string, Uint8Array>();
const KEPT_BYTES = 96 * 1024 * 1024;
const hashOf = (s: string) => {
  // (FNV-1a, two lanes: 64 bits of it, and the length)
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}:${s.length}`;
};
function keep(key: string, bytes: Uint8Array): void {
  KEPT.delete(key);
  KEPT.set(key, bytes);
  let total = 0;
  for (const v of KEPT.values()) total += v.byteLength;
  for (const [k, v] of KEPT) {
    if (total <= KEPT_BYTES) break;
    KEPT.delete(k);
    total -= v.byteLength;
  }
}

/** Triangles of solids (a box, a cylinder as its box), into flat arrays. */
class Soup {
  readonly positions: number[] = [];
  readonly indices: number[] = [];
  box(s: Solid3): void {
    const b =
      s.t === "box" ? s : { x: s.x, y: (s.y0 + s.y1) / 2, z: s.z, hx: s.r, hy: (s.y1 - s.y0) / 2, hz: s.r, a: 0 };
    const c = Math.cos(-b.a);
    const n = Math.sin(-b.a);
    const o = this.positions.length / 3;
    for (const [dx, dy, dz] of CORNERS) {
      const lx = dx * b.hx;
      const lz = dz * b.hz;
      this.positions.push(b.x + lx * c - lz * n, b.y + dy * b.hy, b.z + lx * n + lz * c);
    }
    for (const i of FACES) this.indices.push(o + i);
  }
  land(cx: number, cz: number): void {
    const L = landOf(cx, cz);
    const o = this.positions.length / 3;
    for (let j = 0; j < L.n; j++)
      for (let i = 0; i < L.n; i++) this.positions.push(L.x0 + i * L.step, L.h[j * L.n + i], L.z0 + j * L.step);
    for (let j = 0; j + 1 < L.n; j++)
      for (let i = 0; i + 1 < L.n; i++) {
        const a = o + j * L.n + i;
        this.indices.push(a, a + L.n, a + 1, a + 1, a + L.n, a + L.n + 1);
      }
    for (const t of groundSolidsIn(cx, cz)) this.box(t.s);
  }
}
const CORNERS = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
] as const;
// (each face wound so its outside is its front: a floor's top faces up)
const FACES = [
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
];

/** Which floor a static of the building's is on (its key: build.ts), and whether it's fixed (the
 *  floor's mesh) or an obstacle on it. */
function keyOf(k: string, floorOfThing: (id: string) => number | null): { level: number | null; fixed: boolean } {
  const m = /^(wall|slab|roof|clutter):(\d+):/.exec(k);
  if (m) return { level: Number(m[2]), fixed: m[1] !== "clutter" };
  const id = k.slice(k.indexOf(":") + 1);
  return { level: floorOfThing(id), fixed: false };
}

/** One floor's mesh: its fixed part built, its obstacles kept as they're given. */
export class FloorNav {
  private readonly obstacles = new Map<string, { sig: string; refs: Obstacle[] }>();
  private readonly query: NavMeshQuery;
  private constructor(
    readonly level: number,
    private readonly mesh: NavMesh,
    private readonly cache: TileCache,
    /** what its fixed part was made of (made again when it changes) */
    readonly fixedSig: string,
    /** where its land is (null: no land — a floor's mesh is all of it) */
    readonly covers: Rect | null = null,
  ) {
    // (a way across a window's wood, 400 m: thousands of polygons searched — the default 2048 nodes
    // gave up partway, and a partial way is none; a building's floor needs fewer — a few MB a pool)
    this.query = new NavMeshQuery(mesh, { maxNodes: covers ? 65535 : 8192 });
  }

  /** The floor's mesh from its fixed solids (and its land: the ground floor's span and margin), a
   *  few tiles at a time (`sliceMs` of work between giving the event loop back; 0: at once) — or as
   *  it was made last time from the same. */
  static async make(
    level: number,
    fixed: readonly Solid3[],
    fixedSig: string,
    /** the land in it (the ground floor's span and a margin; a window) — its chunks, and only the
     *  solids round it when `window` */
    land?: Rect,
    sliceMs = 8,
    window = false,
  ): Promise<FloorNav | null> {
    const key = hashOf(fixedSig);
    const kept = KEPT.get(key);
    if (kept) {
      keep(key, kept);
      const r = importTileCache(kept, meshProcess());
      return new FloorNav(level, r.navMesh, r.tileCache, fixedSig, land ?? null);
    }
    const soup = new Soup();
    for (const s of fixed) if (!window || !land || touches(land, s)) soup.box(s);
    if (land)
      for (let cz = Math.floor(land.z0 / CHUNK); cz * CHUNK < land.z1; cz++)
        for (let cx = Math.floor(land.x0 / CHUNK); cx * CHUNK < land.x1; cx++) {
          soup.land(cx, cz);
          // (a chunk's land is a few ms to make: the event loop back between them)
          if (sliceMs > 0) await new Promise<void>((r) => setTimeout(r, 0));
        }
    if (!soup.indices.length) return null;
    const { bbMin, bbMax } = getBoundingBox(soup.positions, soup.indices);
    // (a window: the land's chunks reach past it — the mesh only over it)
    if (window && land) {
      bbMin[0] = Math.max(bbMin[0], land.x0);
      bbMin[2] = Math.max(bbMin[2], land.z0);
      bbMax[0] = Math.min(bbMax[0], land.x1);
      bbMax[2] = Math.min(bbMax[2], land.z1);
    }
    const r = await buildTileCache(
      soup.positions,
      soup.indices,
      window ? LAND_CONFIG : CONFIG,
      [bbMin, bbMax],
      sliceMs,
    );
    if (!r) return null;
    keep(key, exportTileCache(r.navMesh, r.tileCache));
    return new FloorNav(level, r.navMesh, r.tileCache, fixedSig, land ?? null);
  }

  /** What's on the floor now, by key (a thing's, a lift's, a locked door's): what's new or changed
   *  put in, what's gone taken out, the tiles they touch made again. */
  setObstacles(next: ReadonlyMap<string, readonly Solid3[]>): void {
    for (const k of [...this.obstacles.keys()]) if (!next.has(k)) this.take(k);
    for (const [k, solids] of next) {
      const sig = JSON.stringify(solids);
      if (this.obstacles.get(k)?.sig === sig) continue;
      this.take(k);
      this.put(k, solids, sig);
    }
    this.settle();
  }
  private put(k: string, solids: readonly Solid3[], sig = JSON.stringify(solids)): void {
    const refs: Obstacle[] = [];
    for (const s of solids.flatMap(pieces)) {
      this.room();
      // (widened by a body's radius: the walls are, by the mesh's erosion — the tile cache's
      // obstacles aren't, and a thin one, a lift's wall or a shut door, marked no cell at all)
      const r =
        s.t === "box"
          ? this.cache.addBoxObstacle({ x: s.x, y: s.y, z: s.z }, { x: s.hx + BODY_R, y: s.hy, z: s.hz + BODY_R }, -s.a)
          : this.cache.addCylinderObstacle({ x: s.x, y: s.y0, z: s.z }, s.r + BODY_R, s.y1 - s.y0);
      if (r.obstacle) refs.push(r.obstacle);
    }
    this.obstacles.set(k, { sig, refs });
  }
  private take(k: string): void {
    const had = this.obstacles.get(k);
    if (!had) return;
    for (const o of had.refs) {
      this.room();
      this.cache.removeObstacle(o);
    }
    this.obstacles.delete(k);
  }
  private settle(): void {
    this.asked = 0;
    for (let i = 0; i < 400; i++) if (this.cache.update(this.mesh).upToDate) return;
  }
  // (the tile cache queues 64 obstacle requests — past that an add or a removal was let go without
  // a word, and a floor's hundreds of things went in as its first few dozen; an update takes the
  // queue in only once the tiles it has to make again are made: settled before it's full)
  private asked = 0;
  private room(): void {
    if (++this.asked >= 60) this.settle();
  }

  // the mesh's nearest point to p: close round it first, then out to `far` (a mesh with land in it:
  // up and down as far as the land goes — a place on it is asked at the floor's height, the land
  // anywhere from a gorge to a pass)
  private snap(p: { x: number; y: number; z: number }, far: { x: number; y: number; z: number }) {
    const tall = (e: { x: number; y: number; z: number }) => (this.covers ? { ...e, y: LAND_REACH } : e);
    for (const halfExtents of [tall(NEAR), tall(far)]) {
      const r = this.query.findNearestPoly(p, { halfExtents });
      if (r.success && r.nearestRef) return r;
    }
    return null;
  }

  /** The nearest point of the mesh to (x, y), its feet `z` over the floor (null: none near). */
  nearest(p: Point, z = 0): Point | null {
    const halfExtents = this.covers ? { ...NEAR, y: LAND_REACH } : NEAR;
    const r = this.query.findNearestPoly({ x: p.x, y: elevOf(this.level) + z, z: p.y }, { halfExtents });
    return r.success && r.nearestRef ? { x: r.nearestPoint.x, y: r.nearestPoint.z } : null;
  }

  /** The way from `from` to `to` on this floor: its waypoints after `from` (the last `to`, or the mesh
   *  nearest it), null when there's none. `open`: obstacles let through (a locked door's owner). */
  path(from: Point, to: Point, opts: { fromZ?: number; toZ?: number; open?: readonly string[] } = {}): Point[] | null {
    const e = elevOf(this.level);
    // (an owner's own locked doors let through for this one question)
    const lifted = (opts.open ?? []).flatMap((k) => {
      const o = this.obstacles.get(k);
      return o ? [[k, o.sig] as const] : [];
    });
    for (const [k] of lifted) this.take(k);
    if (lifted.length) this.settle();
    try {
      const a = { x: from.x, y: e + (opts.fromZ ?? 0), z: from.y };
      const b = { x: to.x, y: e + (opts.toZ ?? 0), z: to.y };
      const start = this.snap(a, FROM_NEAR);
      const end = this.snap(b, TO_NEAR);
      if (!start || !end) return null;
      const r = this.query.computePath(start.nearestPoint, end.nearestPoint, {
        halfExtents: NEAR,
        maxPathPolys: 8192,
        maxStraightPathPoints: 512,
      });
      const last = r.path.at(-1);
      // (a way that stops short — the target cut off: none)
      if (!r.success || !last || Math.hypot(last.x - end.nearestPoint.x, last.z - end.nearestPoint.z) > 0.05)
        return null;
      const out = r.path.slice(1).map((p) => ({ x: p.x, y: p.z }));
      // (the target itself when it's where the mesh is)
      if (out.length && Math.hypot(end.nearestPoint.x - to.x, end.nearestPoint.z - to.y) < 0.01)
        out[out.length - 1] = { x: to.x, y: to.y };
      return out;
    } finally {
      for (const [k, sig] of lifted) this.put(k, JSON.parse(sig) as Solid3[], sig);
      if (lifted.length) this.settle();
    }
  }

  dispose(): void {
    this.query.destroy();
    this.cache.destroy();
    this.mesh.destroy();
  }
}

/** Every floor's mesh, kept matching the building's solids. */
export class BuildingNav {
  private readonly floors = new Map<number, FloorNav>();
  // what each floor's being made from now (a newer one wins: the older let go when it's done)
  private readonly making = new Map<number, string>();
  // every floor's obstacles as last given (a floor made meanwhile takes them)
  private latest = new Map<number, Map<string, Solid3[]>>();
  private gone = false;
  // the ground floor's fixed solids, and the land windows made round ways out on the land
  private ground: { solids: Solid3[]; sig: string } = { solids: [], sig: "" };
  private windows: { rect: Rect; nav: FloorNav | null; key: string }[] = [];
  private readonly makingWindows = new Map<string, Promise<void>>();
  /** (`sliceMs`: work between giving the event loop back while a floor's made; 0: at once) */
  constructor(private readonly sliceMs = 8) {}

  /** The building as it is now (BuildingSolids: physics/build.ts): every floor's obstacles set at
   *  once; a floor whose fixed part changed made again (a few tiles at a time — till it's done the
   *  one there was answers). `floorOfThing`: a thing's floor by its id; `ground`: the ground floor's
   *  span (its land round it; none — no land). Done when every floor it made is in. */
  async sync(
    b: BuildingSolids,
    floorOfThing: (id: string) => number | null,
    ground?: { x0: number; z0: number; x1: number; z1: number },
  ): Promise<{ made: number[] }> {
    const fixed = new Map<number, { keys: string[]; solids: Solid3[] }>();
    const obstacles = new Map<number, Map<string, Solid3[]>>();
    for (const [k, v] of b.statics) {
      const { level, fixed: isFixed } = keyOf(k, floorOfThing);
      if (level === null) continue;
      if (isFixed) {
        const f = fixed.get(level) ?? { keys: [], solids: [] };
        f.keys.push(k);
        f.solids.push(...v.solids);
        fixed.set(level, f);
      } else {
        const m = obstacles.get(level) ?? new Map<string, Solid3[]>();
        m.set(k, v.solids);
        obstacles.set(level, m);
      }
    }
    // (the lifts' cars' floors at each stop: a way in — their landings' doors the obstacle while shut)
    for (const { level, s } of b.liftFloors ?? []) {
      const f = fixed.get(level) ?? { keys: [], solids: [] };
      f.keys.push(`liftfloor:${level}:${s.x},${s.z}`);
      f.solids.push(s);
      fixed.set(level, f);
    }
    // (parked cars stand on the ground floor or its land: obstacles there)
    for (const [k, c] of b.cars) {
      const level = Math.round((c.y - c.hy) / STOREY) < 1 ? 0 : null;
      if (level === null) continue;
      const m = obstacles.get(0) ?? new Map<string, Solid3[]>();
      m.set(k, [c]);
      obstacles.set(0, m);
    }
    this.latest = obstacles;
    // (the land windows: the ground floor changed — let go, made again when asked; else their things)
    const g = fixed.get(0);
    const gsig = g ? hashOf(`${JSON.stringify(g.solids)}|${layoutVersion}`) : "";
    if (gsig !== this.ground.sig) {
      for (const w of this.windows) w.nav?.dispose();
      this.windows = [];
      this.makingWindows.clear();
      this.ground = { solids: g?.solids ?? [], sig: gsig };
    } else for (const w of this.windows) w.nav?.setObstacles(this.within(w.rect));
    for (const [level, nav] of this.floors)
      if (!fixed.has(level)) {
        nav.dispose();
        this.floors.delete(level);
      } else nav.setObstacles(obstacles.get(level) ?? new Map());
    const made: number[] = [];
    for (const [level, f] of fixed) {
      const land =
        level === 0 && ground
          ? {
              x0: ground.x0 - LAND_MARGIN,
              z0: ground.z0 - LAND_MARGIN,
              x1: ground.x1 + LAND_MARGIN,
              z1: ground.z1 + LAND_MARGIN,
            }
          : undefined;
      // (the land's in it: its layout's version and the span with it)
      const sig = JSON.stringify(f.solids) + (land ? `|land ${layoutVersion} ${JSON.stringify(land)}` : "");
      if (this.floors.get(level)?.fixedSig === sig || this.making.get(level) === sig) continue;
      this.making.set(level, sig);
      const nav = await FloorNav.make(level, f.solids, sig, land, this.sliceMs);
      if (this.gone || this.making.get(level) !== sig) {
        nav?.dispose();
        continue;
      }
      this.making.delete(level);
      this.floors.get(level)?.dispose();
      if (!nav) {
        this.floors.delete(level);
        continue;
      }
      this.floors.set(level, nav);
      nav.setObstacles(this.latest.get(level) ?? new Map());
      made.push(level);
    }
    return { made };
  }

  // the ground floor's obstacles round a rectangle
  private within(r: Rect): Map<string, Solid3[]> {
    const out = new Map<string, Solid3[]>();
    for (const [k, v] of this.latest.get(0) ?? []) if (v.some((s) => touches(r, s))) out.set(k, v);
    return out;
  }

  /** The way on a floor (FloorNav.path); out on the land past the ground floor's mesh, on a window
   *  round the two ends — undefined while it's being made (ask again; `pathSoon` waits for it). */
  path(level: number, from: Point, to: Point, opts: Parameters<FloorNav["path"]>[2] = {}): Point[] | null | undefined {
    const f = this.floors.get(level);
    if (!f) return null;
    if (!f.covers || (inRect(f.covers, from) && inRect(f.covers, to))) return f.path(from, to, opts);
    const rect = windowFor(from, to);
    if (!rect) return null;
    const w = this.windows.find((q) => inRect(q.rect, from, WINDOW_INSET) && inRect(q.rect, to, WINDOW_INSET));
    if (w) {
      this.windows = [...this.windows.filter((q) => q !== w), w];
      return w.nav ? w.nav.path(from, to, opts) : null;
    }
    void this.makeWindow(rect);
    return undefined;
  }

  /** The way, a land window made first if it needs one. */
  async pathSoon(level: number, from: Point, to: Point, opts: Parameters<FloorNav["path"]>[2] = {}) {
    const now = this.path(level, from, to, opts);
    if (now !== undefined) return now;
    const rect = windowFor(from, to);
    if (rect) await this.makeWindow(rect);
    return this.path(level, from, to, opts) ?? null;
  }

  private makeWindow(rect: Rect): Promise<void> {
    const key = `${rect.x0},${rect.z0},${rect.x1},${rect.z1}`;
    const had = this.makingWindows.get(key);
    if (had) return had;
    const sig = this.ground.sig;
    const made = (async () => {
      const nav = await FloorNav.make(0, this.ground.solids, `window ${key} ${sig}`, rect, this.sliceMs, true);
      if (this.gone || this.ground.sig !== sig) return nav?.dispose();
      nav?.setObstacles(this.within(rect));
      this.windows.push({ rect, nav, key });
      while (this.windows.length > WINDOWS) this.windows.shift()?.nav?.dispose();
    })().finally(() => this.makingWindows.delete(key));
    this.makingWindows.set(key, made);
    return made;
  }

  floor(level: number): FloorNav | null {
    return this.floors.get(level) ?? null;
  }

  dispose(): void {
    this.gone = true;
    for (const f of this.floors.values()) f.dispose();
    this.floors.clear();
    for (const w of this.windows) w.nav?.dispose();
    this.windows = [];
  }
}

/** The window round a way's two ends (its sides on the land's chunks), null: too far to walk. */
function windowFor(a: Point, b: Point): Rect | null {
  const r = {
    x0: Math.floor((Math.min(a.x, b.x) - WINDOW_MARGIN) / CHUNK) * CHUNK,
    z0: Math.floor((Math.min(a.y, b.y) - WINDOW_MARGIN) / CHUNK) * CHUNK,
    x1: Math.ceil((Math.max(a.x, b.x) + WINDOW_MARGIN) / CHUNK) * CHUNK,
    z1: Math.ceil((Math.max(a.y, b.y) + WINDOW_MARGIN) / CHUNK) * CHUNK,
  };
  return (r.x1 - r.x0) * (r.z1 - r.z0) > WINDOW_MAX * WINDOW_MAX ? null : r;
}

/** A solid as obstacles the tile cache takes: a box longer than OBSTACLE_MAX cut along its length
 *  (an obstacle touches 8 tiles at most — a longer one was let go). */
const OBSTACLE_MAX = 4;
function pieces(s: Solid3): Solid3[] {
  if (s.t !== "box" || (s.hx * 2 <= OBSTACLE_MAX && s.hz * 2 <= OBSTACLE_MAX)) return [s];
  const nx = Math.ceil((s.hx * 2) / OBSTACLE_MAX);
  const nz = Math.ceil((s.hz * 2) / OBSTACLE_MAX);
  // (its own axes turned −a, as three.js turns it: build.ts)
  const c = Math.cos(-s.a);
  const n = Math.sin(-s.a);
  const out: Solid3[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const lx = -s.hx + (s.hx / nx) * (2 * i + 1);
      const lz = -s.hz + (s.hz / nz) * (2 * j + 1);
      out.push({ ...s, x: s.x + lx * c - lz * n, z: s.z + lx * n + lz * c, hx: s.hx / nx, hz: s.hz / nz });
    }
  return out;
}
