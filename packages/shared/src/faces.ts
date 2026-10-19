import type { WorldObjectDef } from "./catalog.ts";
import { faceHit, type Ray } from "./hang.ts";
import {
  type Edge,
  type EdgeDir,
  edgeAt,
  isFacedWall,
  isFloor,
  isWallEdge,
  type MapDef,
  nearestEdge,
  tileAt,
} from "./map.ts";
import { isDoorKind, openingEdges } from "./openings.ts";

// Wall building, Sims-style (docs/plan/11-wall-building.md): a **panel** is one
// face of one wall edge — what a paint stroke paints, what the pointer points
// at, what the inspector shows. side +1: the face looking to +y / +x.
export interface Panel extends Edge {
  side: 1 | -1;
}
export const panelKey = (p: Panel): string => `${p.dir}${p.x},${p.y}${p.side > 0 ? "+" : "-"}`;
export const otherFace = (p: Panel): Panel => ({ ...p, side: p.side > 0 ? -1 : 1 });

// The tile a panel looks into.
export function panelTile(p: Panel): [number, number] {
  if (p.dir === "h") return [p.x, p.side > 0 ? p.y : p.y - 1];
  return [p.side > 0 ? p.x : p.x - 1, p.y];
}

// The panel the pointer is at: the wall face its ray meets first (walls the
// view looks through skipped), else — on the floor — the nearest edge with a
// wall there, on the side the floor point is on.
export function panelAt(
  map: MapDef,
  ray: Ray | null,
  floor: { x: number; y: number } | null,
  skip?: (e: Edge) => boolean,
): Panel | null {
  const hit = ray ? faceHit(map, ray, skip) : null;
  if (hit) {
    const a = Math.min(Math.floor(hit.along), (hit.face.dir === "h" ? map.width : map.height) - 1);
    return hit.face.dir === "h"
      ? { dir: "h", x: a, y: hit.face.line, side: hit.face.side }
      : { dir: "v", x: hit.face.line, y: a, side: hit.face.side };
  }
  if (!floor) return null;
  const e = nearestEdge(floor.x, floor.y);
  if (!isWallEdge(edgeAt(map, e))) return null;
  const side = (e.dir === "h" ? floor.y >= e.y : floor.x >= e.x) ? 1 : -1;
  return { ...e, side };
}

// Every face looking into the space the panel looks into: the floor joined to
// the tile in front of it across edges with no wall (doors close it like a
// wall), and each wall face round that floor, looking in. Glass and half walls
// bound it too but have no faces to paint. (Up to `cap` tiles: a whole open
// studio is fine; the map's outside never is floor.)
export function joinedFaces(map: MapDef, objects: WorldObjectDef[], p: Panel, cap = 6000): Panel[] {
  const doors = new Set(
    objects.filter((o) => isDoorKind(o.kind)).flatMap((o) => openingEdges(o).map((d) => `${d.dir}${d.x},${d.y}`)),
  );
  const closed = (e: Edge) => isWallEdge(edgeAt(map, e)) || doors.has(`${e.dir}${e.x},${e.y}`);
  const [sx, sy] = panelTile(p);
  if (!isFloor(tileAt(map, sx, sy))) return [p];
  const seen = new Set<number>([sy * map.width + sx]);
  const queue: [number, number][] = [[sx, sy]];
  const out: Panel[] = [];
  const face = (e: Edge, side: 1 | -1) => {
    if (isFacedWall(edgeAt(map, e))) out.push({ ...e, side });
  };
  while (queue.length && seen.size <= cap) {
    const [x, y] = queue.shift() as [number, number];
    const sides: [Edge, 1 | -1, number, number][] = [
      [{ dir: "h", x, y }, 1, x, y - 1], // north edge, its +y face looks in
      [{ dir: "h", x, y: y + 1 }, -1, x, y + 1],
      [{ dir: "v", x, y }, 1, x - 1, y],
      [{ dir: "v", x: x + 1, y }, -1, x + 1, y],
    ];
    for (const [e, side, nx, ny] of sides) {
      if (closed(e)) {
        face(e, side);
        continue;
      }
      if (!isFloor(tileAt(map, nx, ny))) continue;
      const k = ny * map.width + nx;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return out;
}

// The tile corner nearest a point (where wall runs start and end).
export const cornerNear = (x: number, y: number): { x: number; y: number } => ({ x: Math.round(x), y: Math.round(y) });

// A straight run of edges between two tile corners: along x when the pointer
// went further in x than in y, else along y (the end is brought onto that
// line). Empty when they're the same corner.
export function runBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { dir: EdgeDir; edges: Edge[]; end: { x: number; y: number } } {
  const dir: EdgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
  const end = dir === "h" ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const edges: Edge[] = [];
  if (dir === "h")
    for (let x = Math.min(a.x, end.x); x < Math.max(a.x, end.x); x++) edges.push({ dir: "h", x, y: a.y });
  else for (let y = Math.min(a.y, end.y); y < Math.max(a.y, end.y); y++) edges.push({ dir: "v", x: a.x, y });
  return { dir, edges, end };
}
