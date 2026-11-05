// The adapter (docs/plan/72-the-3d-core.md, phase 6): a structure as the tile maps the code not yet
// ported reads — the home floor's map with the others in `levels`, each by its corner. World maps
// (MapDef.world): every place in them the world's, their tile rows starting at their corner.
// Read-only for phases 7–10; deleted in phase 11 with the tile build tool.
import type { AreaDef, LevelDef, MapDef } from "../map.ts";
import { hasBacks, NO_WALL, VOID } from "../map.ts";
import { cellsOf } from "./rings.ts";
import type { Floor, Structure } from "./types.ts";

interface Grid {
  width: number;
  height: number;
  tiles: string[];
  hWalls: string[];
  vWalls: string[];
  hBacks?: string[];
  vBacks?: string[];
  areas: AreaDef[];
}

// Each floor's grid kept by what it's made of (applyOps keeps the walls, slabs and rooms an edit
// didn't touch; the floor too): an edit makes the floor it's on again, not every floor
// (docs/plan/72 phase 8, an edit's cost). The grids are shared — read-only, as maps are.
const grids = new WeakMap<Floor, { parts: unknown[]; grid: Grid }>();

/** One floor's tile grid, as the old maps had it. */
export function floorGrid(s: Structure, f: Floor): Grid {
  const parts: unknown[] = [f.grid.x0, f.grid.y0, f.grid.w, f.grid.h];
  for (const x of s.slabs) if (x.floor === f.index) parts.push(x);
  parts.push(null);
  for (const x of s.walls) if (x.floor === f.index) parts.push(x);
  parts.push(null);
  for (const x of s.rooms) if (x.floor === f.index) parts.push(x);
  const had = grids.get(f);
  if (had && had.parts.length === parts.length && had.parts.every((p, i) => p === parts[i])) return had.grid;
  const grid = makeGrid(s, f);
  grids.set(f, { parts, grid });
  return grid;
}

function makeGrid(s: Structure, f: Floor): Grid {
  const { x0, y0, w, h } = f.grid;
  const tiles = Array.from({ length: h }, () => Array<string>(w).fill(VOID));
  for (const slab of s.slabs)
    if (slab.floor === f.index)
      cellsOf(slab.outline, slab.holes, w, h, x0, y0, (x, y) => {
        tiles[y][x] = slab.top;
      });
  const hw = Array.from({ length: h + 1 }, () => Array<string>(w).fill(NO_WALL));
  const vw = Array.from({ length: h }, () => Array<string>(w + 1).fill(NO_WALL));
  const hb = Array.from({ length: h + 1 }, () => Array<string>(w).fill(NO_WALL));
  const vb = Array.from({ length: h }, () => Array<string>(w + 1).fill(NO_WALL));
  for (const wall of s.walls) {
    if (wall.floor !== f.index) continue;
    const [ax, ay] = [wall.a[0] - x0, wall.a[1] - y0];
    const [bx, by] = [wall.b[0] - x0, wall.b[1] - y0];
    if (ay === by) {
      for (let x = Math.min(ax, bx); x < Math.max(ax, bx); x++)
        if (ay >= 0 && ay <= h && x >= 0 && x < w) {
          hw[ay][x] = wall.front;
          if (wall.back) hb[ay][x] = wall.back;
        }
    } else if (ax === bx) {
      for (let y = Math.min(ay, by); y < Math.max(ay, by); y++)
        if (ax >= 0 && ax <= w && y >= 0 && y < h) {
          vw[y][ax] = wall.front;
          if (wall.back) vb[y][ax] = wall.back;
        }
    }
  }
  const areas: AreaDef[] = s.rooms
    .filter((r) => r.floor === f.index)
    .map((r) => {
      const [rx0, ry0, rx1, ry1] = r.rect;
      // (its outline when it isn't its rectangle: the walls' face it fills — phase 10; its rectangle
      // kept as drawn, what a map made from it again keeps)
      const box =
        r.outline.length === 4 && r.outline.every(([x, y]) => (x === rx0 || x === rx1) && (y === ry0 || y === ry1));
      return {
        key: r.key,
        ...r.props,
        x: rx0,
        y: ry0,
        w: rx1 - rx0,
        h: ry1 - ry0,
        ...(box ? {} : { outline: r.outline.map(([x, y]): [number, number] => [x, y]) }),
      } as AreaDef;
    });
  const out: Grid = {
    width: w,
    height: h,
    tiles: tiles.map((r) => r.join("")),
    hWalls: hw.map((r) => r.join("")),
    vWalls: vw.map((r) => r.join("")),
    areas,
  };
  const backs = { hBacks: hb.map((r) => r.join("")), vBacks: vb.map((r) => r.join("")) };
  return hasBacks(backs) ? { ...out, ...backs } : out;
}

/** The structure as the home floor's map, the other floors in `levels` (objects left empty: things
 *  aren't structure). */
export function mapFromStructure(s: Structure): MapDef {
  const home = s.floors.find((f) => f.index === s.home) ?? s.floors[0];
  const g = floorGrid(s, home);
  const levels: LevelDef[] = s.floors
    .filter((f) => f !== home)
    .map((f) => {
      const lg = floorGrid(s, f);
      return {
        index: f.index,
        name: f.name,
        ox: f.grid.x0,
        oy: f.grid.y0,
        ...(f.outdoor ? { outdoor: true } : {}),
        ...lg,
        ...(f.spawn ? { spawn: { x: f.spawn[0], y: f.spawn[1] } } : {}),
      };
    });
  return {
    key: s.key,
    name: s.name,
    ...g,
    world: true,
    ox: home.grid.x0,
    oy: home.grid.y0,
    spawn: { x: s.spawn[0], y: s.spawn[1] },
    objects: [],
    ...(levels.length ? { floor: s.home, levels } : {}),
    ...(s.core ? { core: { x: s.core[0], y: s.core[1] } } : {}),
  };
}
