import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import { doorEdge, doorFits, Grid } from "./grid.ts";
import type { Point } from "./iso.ts";
import { holdsItems, hWall, type MapDef, wallBetween } from "./map.ts";

// One placement rule for client (ghost preview) and server (authority).
export function canPlace(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef, bodies: Point[] = []): boolean {
  const e = entry(o.kind);
  if (o.kind === "door") {
    // a door fills a gap in a wall line (an edge), one door per edge
    const e = doorEdge(o);
    if (!doorFits(map, e)) return false;
    return !others.some((x) => {
      if (x.id === o.id || x.kind !== "door") return false;
      const d = doorEdge(x);
      return d.dir === e.dir && d.x === e.x && d.y === e.y;
    });
  }
  const { w, h } = footprint(o.kind, e.wall ? 0 : (o.rot ?? 0));
  const floor = Grid.from(map, []);
  const base = Grid.from(
    map,
    others.filter((x) => x.id !== o.id),
  );
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const tx = o.x + dx;
      const ty = o.y + dy;
      if (!floor.ok(tx, ty)) return false;
      if (e.wall) {
        // hangs on the wall along the tile's north edge, no other wall item there
        if (!holdsItems(hWall(map, tx, ty))) return false;
        const clash = others.some(
          (x) => x.id !== o.id && entry(x.kind).wall && tx >= x.x && tx < x.x + footprint(x.kind, 0).w && ty === x.y,
        );
        if (clash) return false;
        continue;
      }
      if (e.solid && !base.ok(tx, ty)) return false;
      // never straddling a wall
      if (dx > 0 && wallBetween(map, tx - 1, ty, tx, ty) !== ".") return false;
      if (dy > 0 && wallBetween(map, tx, ty - 1, tx, ty) !== ".") return false;
      if (!e.solid && !e.seat) continue;
      // seats and solids can't share a tile with another seat
      if (base.seats.has(base.idx(tx, ty))) return false;
      if (e.solid) for (const b of bodies) if (Math.floor(b.x) === tx && Math.floor(b.y) === ty) return false;
    }
  return true;
}

// Layout templates for a room: the builder swaps the furniture in one go.
export interface Template {
  key: string;
  name: string;
  area: string;
  objects: WorldObjectDef[];
}

const KINDS_REPLACED = ["desk", "chair", "plant", "lamp", "sofa", "armchair", "coffee_table", "rug", "tape_shelf"];
export function replacedByTemplate(kind: string): boolean {
  return KINDS_REPLACED.includes(kind);
}

function pods(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const px of [3, 7, 11, 15])
    for (const py of [5, 11]) {
      const pod = `${px}-${py}`;
      out.push({ id: `seat-${pod}-a`, kind: "chair", x: px, y: py, rot: 0, props: { desk: true } });
      out.push({ id: `seat-${pod}-b`, kind: "chair", x: px + 1, y: py, rot: 0, props: { desk: true } });
      out.push({ id: `desk-${pod}-n`, kind: "desk", x: px, y: py + 1, rot: 0 });
      out.push({ id: `desk-${pod}-s`, kind: "desk", x: px, y: py + 2, rot: 2 });
      out.push({ id: `seat-${pod}-c`, kind: "chair", x: px, y: py + 3, rot: 2, props: { desk: true } });
      out.push({ id: `seat-${pod}-d`, kind: "chair", x: px + 1, y: py + 3, rot: 2, props: { desk: true } });
    }
  return out;
}

function rows(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const py of [4, 8, 12, 16])
    for (const px of [3, 6, 9, 12, 15]) {
      out.push({ id: `row-desk-${px}-${py}`, kind: "desk", x: px, y: py, rot: 2 });
      out.push({ id: `row-seat-${px}-${py}-a`, kind: "chair", x: px, y: py + 1, rot: 2, props: { desk: true } });
      out.push({ id: `row-seat-${px}-${py}-b`, kind: "chair", x: px + 1, y: py + 1, rot: 2, props: { desk: true } });
    }
  return out;
}

function library(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const [i, px] of [3, 9, 15].entries()) {
    out.push({ id: `lib-shelf-${i}-a`, kind: "tape_shelf", x: px, y: 3, rot: 0 });
    out.push({ id: `lib-shelf-${i}-b`, kind: "tape_shelf", x: px + 2, y: 3, rot: 0 });
    out.push({ id: `lib-rug-${i}`, kind: "rug", x: px, y: 9, rot: 0 });
    out.push({ id: `lib-table-${i}`, kind: "coffee_table", x: px + 1, y: 10, rot: 0 });
    out.push({ id: `lib-chair-${i}-a`, kind: "armchair", x: px, y: 10, rot: 1, props: { desk: true } });
    out.push({ id: `lib-chair-${i}-b`, kind: "armchair", x: px + 3, y: 10, rot: 3, props: { desk: true } });
    out.push({ id: `lib-desk-${i}`, kind: "desk", x: px, y: 15, rot: 2 });
    out.push({ id: `lib-seat-${i}-a`, kind: "chair", x: px, y: 16, rot: 2, props: { desk: true } });
    out.push({ id: `lib-seat-${i}-b`, kind: "chair", x: px + 1, y: 16, rot: 2, props: { desk: true } });
    out.push({ id: `lib-lamp-${i}`, kind: "lamp", x: px + 3, y: 15, rot: 0 });
  }
  out.push({ id: "lib-sofa", kind: "sofa", x: 8, y: 6, rot: 0 });
  return out;
}

export const TEMPLATES: Template[] = [
  { key: "pods", name: "Desk pods", area: "tracking", objects: pods() },
  { key: "rows", name: "Studio rows", area: "tracking", objects: rows() },
  { key: "library", name: "Tape library", area: "tracking", objects: library() },
];
