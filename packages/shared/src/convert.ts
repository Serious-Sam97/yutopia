import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import {
  type AreaDef,
  emptyEdges,
  hWall,
  isFloor,
  type MapDef,
  NO_WALL,
  setEdge,
  tileAt,
  VOID,
  WALL,
  type WallMat,
} from "./map.ts";

// Map v1 → v2: walls move from tiles to tile edges.
//
// Every wall tile merges into the floor next to it (north first, then west,
// south, east; repeated so corners join too), so rooms gain the tile the wall
// used to take. A wall goes on every edge between two tiles that weren't
// connected before (their "anchors" — the original floor each tile belongs to —
// are neither the same tile nor side-by-side floors), except doorways, which
// stay open. Rooms (areas) grow over the wall tiles that merged into them;
// wall items move onto the wall they hung on; doors move onto the edge.

export interface Converted {
  map: MapDef;
  objects: WorldObjectDef[]; // every object, positions updated
  changed: WorldObjectDef[]; // the ones that moved (to persist)
}

export function isV2(m: { hWalls?: unknown; vWalls?: unknown }): boolean {
  return Array.isArray(m.hWalls) && Array.isArray(m.vWalls);
}

// v1 doorway: a gap of 1–3 floor tiles in a wall line, floor on both sides
// (0 = the wall runs along x).
function doorwayRot(map: MapDef, x: number, y: number): 0 | 1 | null {
  const floor = (tx: number, ty: number) => isFloor(tileAt(map, tx, ty));
  const wall = (tx: number, ty: number) => tileAt(map, tx, ty) === WALL;
  if (!floor(x, y)) return null;
  const gap = (dx: number, dy: number) => {
    // across the gap there's floor on both sides; along it, walls at both ends
    const ok = (tx: number, ty: number) => floor(tx, ty) && floor(tx - dy, ty - dx) && floor(tx + dy, ty + dx);
    if (!ok(x, y)) return false;
    let a = 0;
    while (a < 3 && ok(x - dx * (a + 1), y - dy * (a + 1))) a++;
    let b = 0;
    while (b < 3 && ok(x + dx * (b + 1), y + dy * (b + 1))) b++;
    return a + b + 1 <= 3 && wall(x - dx * (a + 1), y - dy * (a + 1)) && wall(x + dx * (b + 1), y + dy * (b + 1));
  };
  if (gap(1, 0)) return 0;
  if (gap(0, 1)) return 1;
  return null;
}

export function convertV1(
  v1: MapDef,
  objects: WorldObjectDef[] = v1.objects,
  mats?: (a: AreaDef | null) => WallMat,
): Converted {
  const W = v1.width;
  const H = v1.height;
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const anchor = new Int32Array(W * H).fill(-1);
  const opening = new Set<string>(); // edges that stay open (doorways)

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloor(tileAt(v1, x, y))) anchor[idx(x, y)] = idx(x, y);
  // doorways join the room on their north / west side; their far edge is the opening
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = doorwayRot(v1, x, y);
      if (r === 0) {
        anchor[idx(x, y)] = anchor[idx(x, y - 1)];
        opening.add(`h${x},${y + 1}`);
      } else if (r === 1) {
        anchor[idx(x, y)] = anchor[idx(x - 1, y)];
        opening.add(`v${x + 1},${y}`);
      }
    }
  // wall tiles merge into a neighbour, a pass at a time: first only north or
  // west (so wall lines join the room above / to the left as a whole, corners
  // included), then south or east for what's left (the outer walls)
  const NW = [
    [0, -1],
    [-1, 0],
  ];
  const ALL = [...NW, [0, 1], [1, 0]];
  for (const dirs of [NW, ALL])
    for (let changed = true; changed; ) {
      changed = false;
      const next = anchor.slice();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (anchor[idx(x, y)] !== -1 || tileAt(v1, x, y) !== WALL) continue;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (inside(nx, ny) && anchor[idx(nx, ny)] !== -1) {
              next[idx(x, y)] = anchor[idx(nx, ny)];
              changed = true;
              break;
            }
          }
        }
      anchor.set(next);
    }

  // floors: each tile takes its anchor's floor
  const ch = (a: number) => tileAt(v1, a % W, Math.floor(a / W));
  const tiles: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const a = anchor[idx(x, y)];
      row += a === -1 ? VOID : ch(a);
    }
    tiles.push(row);
  }

  // areas grow over the wall tiles that merged into them (one tile per side at most)
  const inArea = (a: AreaDef, t: number) => {
    const ax = t % W;
    const ay = Math.floor(t / W);
    return ax >= a.x && ax < a.x + a.w && ay >= a.y && ay < a.y + a.h;
  };
  const grows = (a: AreaDef, cells: [number, number][]) => {
    let mine = 0;
    let n = 0;
    for (const [x, y] of cells) {
      if (!inside(x, y) || tileAt(v1, x, y) !== WALL) continue;
      n++;
      const t = anchor[idx(x, y)];
      if (t !== -1 && inArea(a, t)) mine++;
    }
    return n > 0 && mine * 2 >= n;
  };
  const areas = v1.areas.map((a) => {
    const next = { ...a };
    const row = (y: number) => Array.from({ length: a.w }, (_, i) => [a.x + i, y] as [number, number]);
    const col = (x: number) => Array.from({ length: a.h }, (_, i) => [x, a.y + i] as [number, number]);
    if (grows(a, row(a.y - 1))) {
      next.y -= 1;
      next.h += 1;
    }
    if (grows(a, row(a.y + a.h))) next.h += 1;
    if (grows(a, col(a.x - 1))) {
      next.x -= 1;
      next.w += 1;
    }
    if (grows(a, col(a.x + a.w))) next.w += 1;
    return next;
  });

  // walls on the edges between tiles that weren't connected
  const map: MapDef = { ...v1, tiles, areas, ...emptyEdges(W, H), objects: [] };
  // two anchors are connected if they're the same floor, side by side, or two
  // apart with a floor tile next to both (a corner or a straight line of floor)
  const floorAt = (x: number, y: number) => isFloor(tileAt(v1, x, y));
  const connected = (a: number, b: number) => {
    if (a === b) return true;
    const ax = a % W;
    const ay = Math.floor(a / W);
    const bx = b % W;
    const by = Math.floor(b / W);
    const d = Math.abs(ax - bx) + Math.abs(ay - by);
    if (d === 1) return true;
    if (d !== 2) return false;
    if (ax === bx) return floorAt(ax, (ay + by) / 2);
    if (ay === by) return floorAt((ax + bx) / 2, ay);
    return floorAt(ax, by) || floorAt(bx, ay);
  };
  const areaAtTile = (x: number, y: number) => {
    let best: AreaDef | null = null;
    for (const a of areas)
      if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h && (!best || (a.priority ?? 0) > (best.priority ?? 0)))
        best = a;
    return best;
  };
  const matOf = mats ?? ((a: AreaDef | null) => (a?.kind === "booth" ? "f" : "p"));
  // the wall's material follows the room on its visible side (south / east), or
  // the other side when that one is outside
  const wallFor = (vis: [number, number], other: [number, number]): string => {
    const [x, y] = isFloor(tileAt(map, vis[0], vis[1])) ? vis : other;
    return matOf(areaAtTile(x, y));
  };
  const tileAnchor = (x: number, y: number) => (inside(x, y) ? anchor[idx(x, y)] : -1);
  for (let y = 0; y <= H; y++)
    for (let x = 0; x < W; x++) {
      // north edge of (x, y): between (x, y - 1) and (x, y)
      const a = tileAnchor(x, y - 1);
      const b = tileAnchor(x, y);
      if (a === -1 && b === -1) continue;
      if (opening.has(`h${x},${y}`)) continue;
      if (a !== -1 && b !== -1 && connected(a, b)) continue;
      setEdge(map, { x, y, dir: "h" }, wallFor([x, y], [x, y - 1]));
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x <= W; x++) {
      const a = tileAnchor(x - 1, y);
      const b = tileAnchor(x, y);
      if (a === -1 && b === -1) continue;
      if (opening.has(`v${x},${y}`)) continue;
      if (a !== -1 && b !== -1 && connected(a, b)) continue;
      setEdge(map, { x, y, dir: "v" }, wallFor([x, y], [x - 1, y]));
    }

  // objects: doors onto their edge, wall items onto the wall they hung on
  const changed: WorldObjectDef[] = [];
  const out = objects.map((o) => {
    if (o.kind === "door") {
      const r = doorwayRot(v1, o.x, o.y);
      if (r === null) return o;
      const d = r === 0 ? { ...o, y: o.y + 1, rot: 0 } : { ...o, x: o.x + 1, rot: 1 };
      changed.push(d);
      return d;
    }
    if (entry(o.kind).wall) {
      const { w } = footprint(o.kind, 0);
      const here = Array.from({ length: w }, (_, i) => hWall(map, o.x + i, o.y) !== NO_WALL).every(Boolean);
      const above = Array.from({ length: w }, (_, i) => hWall(map, o.x + i, o.y - 1) !== NO_WALL).every(Boolean);
      if (!here && above) {
        const m = { ...o, y: o.y - 1 };
        changed.push(m);
        return m;
      }
    }
    return o;
  });
  map.objects = v1.objects === objects ? out : map.objects;
  return { map, objects: out, changed };
}
