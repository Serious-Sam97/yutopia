import { parkedBody } from "./car/park.ts";
import { entry, footprint, placedFootprint, quarterOf, quarterYaw, type WorldObjectDef } from "./catalog.ts";
import { FAM_CHAIRS, FAM_SHAPES } from "./fam/index.ts";
import type { Part } from "./fam/units.ts";
import type { Point } from "./geom.ts";
import { chairAt, outdoorsOf } from "./ground.ts";
import { hangEdges, hangFits, hangOf } from "./hang.ts";
import { onLevel } from "./levels.ts";
import { liftHere, stopOver } from "./lift.ts";
import { type Edge, isFloor, type MapDef } from "./map.ts";
import { isOpening, openingBlocker } from "./openings.ts";
import { cellOf, wallBetweenOf } from "./structure/query.ts";
import { fitsOnSurface, splitAll } from "./tops.ts";

// One placement rule for client (ghost preview) and server (authority).
export function canPlace(map: MapDef, others: WorldObjectDef[], o: WorldObjectDef, bodies: Point[] = []): boolean {
  const e = entry(o.kind);
  // only what's on this floor counts (levels.ts)
  others = onLevel(others, map);
  // doors and windows: set into a wall (openings.ts)
  if (isOpening(o.kind)) return openingBlocker(map, others, o, hungOnEdge(others)) === null;
  // tabletops: all of them on one surface's top, clear of the rest there
  if (e.onSurface) return fitsOnSurface(others, o);
  // wall items: on a face of a wall, anywhere it fits (hang.ts)
  if (e.wall) return hangFits(map, others, o);
  const { w, h } = placedFootprint(o);
  const base = taken(
    map,
    others.filter((x) => x.id !== o.id),
  );
  const out = outdoorsOf(map);
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const tx = o.x + dx;
      const ty = o.y + dy;
      const floor = isFloor(cellOf(map, tx, ty));
      if (!floor && !out?.walkable(tx, ty)) return false;
      // (parkour's out of doors: on the land, never a floor)
      if (e.outdoor && floor) return false;
      if (e.solid && (base.solid.has(`${tx},${ty}`) || base.boxOn(tx, ty))) return false;
      // never straddling a wall
      if (dx > 0 && wallBetweenOf(map, tx - 1, ty, tx, ty) !== ".") return false;
      if (dy > 0 && wallBetweenOf(map, tx, ty - 1, tx, ty) !== ".") return false;
      if (!e.solid && !e.seat) continue;
      // seats and solids can't share a tile with another seat
      if (base.seats.has(`${tx},${ty}`)) return false;
      if (e.solid) for (const b of bodies) if (Math.floor(b.x) === tx && Math.floor(b.y) === ty) return false;
    }
  return true;
}

/** What's on a floor's tiles for placing (the tile tool's rule — phase 11's free tool has its own):
 *  the tiles solid things stand on and a lift's empty shaft, the seats' tiles, and the boxes not
 *  on the tiles (a parked car's body, the chess table's) with a tile's middle in them. */
function taken(map: MapDef, things: readonly WorldObjectDef[]) {
  const solid = new Set<string>();
  const seats = new Set<string>();
  const boxes: { x: number; y: number; hx: number; hy: number; a: number }[] = [];
  for (const o of things) {
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, quarterOf(o));
    const each = (f: (x: number, y: number) => void) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) f(o.x + dx, o.y + dy);
    };
    if (o.kind === "elevator") {
      // (the floor's grid is its floor's: a stop up on a mezzanine isn't on it — plan 72 phase 11)
      if (!stopOver(o) && !liftHere(o, map)) each((x, y) => solid.add(`${x},${y}`));
      continue;
    }
    if (e.seat) each((x, y) => seats.add(`${x},${y}`));
    for (const c of FAM_CHAIRS[o.kind] ?? []) {
      const at = chairAt(o, c);
      seats.add(`${Math.floor(at.x)},${Math.floor(at.y)}`);
    }
    if (isOpening(o.kind)) continue;
    if (o.kind === "car") {
      if (!o.props?.driven) boxes.push(parkedBody(o));
      continue;
    }
    if (!e.solid || e.wall) continue;
    // (a kind with chairs round it — the chess table — is its body's box, its chairs' tiles open)
    if (FAM_CHAIRS[o.kind]) {
      const [body] = (FAM_SHAPES as Record<string, { parts: Part[] }>)[o.kind]?.parts ?? [];
      if (body?.t === "box") {
        const a = chairAt(o, { u: body.u0, v: body.v0, face: 0 });
        const c = chairAt(o, { u: body.u1, v: body.v1, face: 0 });
        boxes.push({
          x: (a.x + c.x) / 2,
          y: (a.y + c.y) / 2,
          // (5 cm in all round: its chairs' tiles are open)
          hx: Math.abs(c.x - a.x) / 2 - 0.05,
          hy: Math.abs(c.y - a.y) / 2 - 0.05,
          a: 0,
        });
        continue;
      }
    }
    each((x, y) => solid.add(`${x},${y}`));
  }
  // (a tile's middle within 0.3 of a box)
  const boxOn = (tx: number, ty: number) =>
    boxes.some((b) => {
      const dx = tx + 0.5 - b.x;
      const dy = ty + 0.5 - b.y;
      const u = Math.abs(dx * Math.cos(b.a) + dy * Math.sin(b.a)) - b.hx;
      const v = Math.abs(-dx * Math.sin(b.a) + dy * Math.cos(b.a)) - b.hy;
      return Math.hypot(Math.max(u, 0), Math.max(v, 0)) < 0.3;
    });
  return { solid, seats, boxOn };
}

// What hangs on an edge (either face), as openingBlocker wants it.
export function hungOnEdge(objects: WorldObjectDef[]): (e: Edge) => [number, number, string][] {
  return (e) =>
    objects.flatMap((x): [number, number, string][] => {
      if (!entry(x.kind).wall) return [];
      const h = hangOf(x);
      return hangEdges(h).some((s) => s.dir === e.dir && s.x === e.x && s.y === e.y)
        ? [[h.z0, h.z1, entry(x.kind).label]]
        : [];
    });
}

// Layout templates for a room: the builder swaps the furniture in one go.
export interface Template {
  key: string;
  name: string;
  area: string;
  objects: WorldObjectDef[];
}

const KINDS_REPLACED = [
  "desk",
  "chair",
  "plant",
  "lamp",
  "sofa",
  "armchair",
  "coffee_table",
  "rug",
  "tape_shelf",
  "tabletop", // what stood on the old desks goes with them
  "computer", // (their computers too)
];
export function replacedByTemplate(kind: string): boolean {
  return KINDS_REPLACED.includes(kind);
}

function pods(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const px of [3, 7, 11, 15])
    for (const py of [5, 11]) {
      const pod = `${px}-${py}`;
      out.push({ id: `seat-${pod}-a`, kind: "chair", x: px, y: py, yaw: quarterYaw(0), props: { desk: true } });
      out.push({ id: `seat-${pod}-b`, kind: "chair", x: px + 1, y: py, yaw: quarterYaw(0), props: { desk: true } });
      out.push({ id: `desk-${pod}-n`, kind: "desk", x: px, y: py + 1, yaw: quarterYaw(0) });
      out.push({ id: `desk-${pod}-s`, kind: "desk", x: px, y: py + 2, yaw: quarterYaw(2) });
      out.push({ id: `seat-${pod}-c`, kind: "chair", x: px, y: py + 3, yaw: quarterYaw(2), props: { desk: true } });
      out.push({ id: `seat-${pod}-d`, kind: "chair", x: px + 1, y: py + 3, yaw: quarterYaw(2), props: { desk: true } });
    }
  return out;
}

function rows(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const py of [4, 8, 12, 16])
    for (const px of [3, 6, 9, 12, 15]) {
      out.push({ id: `row-desk-${px}-${py}`, kind: "desk", x: px, y: py, yaw: quarterYaw(2) });
      out.push({
        id: `row-seat-${px}-${py}-a`,
        kind: "chair",
        x: px,
        y: py + 1,
        yaw: quarterYaw(2),
        props: { desk: true },
      });
      out.push({
        id: `row-seat-${px}-${py}-b`,
        kind: "chair",
        x: px + 1,
        y: py + 1,
        yaw: quarterYaw(2),
        props: { desk: true },
      });
    }
  return out;
}

function library(): WorldObjectDef[] {
  const out: WorldObjectDef[] = [];
  for (const [i, px] of [3, 9, 15].entries()) {
    out.push({ id: `lib-shelf-${i}-a`, kind: "tape_shelf", x: px, y: 3, yaw: quarterYaw(0) });
    out.push({ id: `lib-shelf-${i}-b`, kind: "tape_shelf", x: px + 2, y: 3, yaw: quarterYaw(0) });
    out.push({ id: `lib-rug-${i}`, kind: "rug", x: px, y: 9, yaw: quarterYaw(0) });
    out.push({ id: `lib-table-${i}`, kind: "coffee_table", x: px + 1, y: 10, yaw: quarterYaw(0) });
    out.push({ id: `lib-chair-${i}-a`, kind: "armchair", x: px, y: 10, yaw: quarterYaw(1), props: { desk: true } });
    out.push({ id: `lib-chair-${i}-b`, kind: "armchair", x: px + 3, y: 10, yaw: quarterYaw(3), props: { desk: true } });
    out.push({ id: `lib-desk-${i}`, kind: "desk", x: px, y: 15, yaw: quarterYaw(2) });
    out.push({ id: `lib-seat-${i}-a`, kind: "chair", x: px, y: 16, yaw: quarterYaw(2), props: { desk: true } });
    out.push({ id: `lib-seat-${i}-b`, kind: "chair", x: px + 1, y: 16, yaw: quarterYaw(2), props: { desk: true } });
    out.push({ id: `lib-lamp-${i}`, kind: "lamp", x: px + 3, y: 15, yaw: quarterYaw(0) });
  }
  out.push({ id: "lib-sofa", kind: "sofa", x: 8, y: 6, yaw: quarterYaw(0) });
  return out;
}

// (desks come set up: monitors, keyboards, a mug — each its own thing)
export const TEMPLATES: Template[] = [
  { key: "pods", name: "Desk pods", area: "tracking", objects: splitAll(pods()).objects },
  { key: "rows", name: "Studio rows", area: "tracking", objects: splitAll(rows()).objects },
  { key: "library", name: "Tape library", area: "tracking", objects: splitAll(library()).objects },
];
