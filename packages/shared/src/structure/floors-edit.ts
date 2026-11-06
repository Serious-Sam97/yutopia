// A building's floors made and taken away (docs/plan/72-the-3d-core.md, phase 11: the tile-map
// adapter deleted): a floor the generators draw (building.ts blankLevel, map-edit.ts blankMap —
// tile maps, as every generator's) turned into the structure's pieces and put into the world's
// structure, a floor taken out of it. The generators' input — the home floor's footprint — read off
// the structure as rows (theirs: they're drawn in tiles).
import { isFloor, type TileMap } from "../map.ts";
import { structureFromMap } from "./from-map.ts";
import { cellTop } from "./query.ts";
import type { Floor, Room, Slab, Structure, Wall, XY } from "./types.ts";

export interface FloorPieces {
  floor: Floor;
  slabs: Slab[];
  walls: Wall[];
  rooms: Room[];
}

const shiftRing = (r: XY[], dx: number, dy: number): XY[] => r.map(([x, y]): XY => [x + dx, y + dy]);

/** Floor `index` of a generated tile map (its places its own: an older map's, the home floor's corner
 *  at 0, 0) as the structure's pieces, moved to the world's by `at` (the home floor's corner). */
export function floorPieces(tm: TileMap, index: number, at: XY = [0, 0]): FloorPieces | null {
  const s = structureFromMap(tm);
  const f = s.floors.find((q) => q.index === index);
  if (!f) return null;
  const [dx, dy] = at;
  return {
    floor: {
      ...f,
      grid: { ...f.grid, x0: f.grid.x0 + dx, y0: f.grid.y0 + dy },
      ...(f.spawn ? { spawn: [f.spawn[0] + dx, f.spawn[1] + dy] as XY } : {}),
    },
    slabs: s.slabs
      .filter((x) => x.floor === index)
      .map((x) => ({
        ...x,
        id: `${x.id}-${Date.now().toString(36)}`,
        outline: shiftRing(x.outline, dx, dy),
        holes: x.holes.map((h) => shiftRing(h, dx, dy)),
      })),
    walls: s.walls
      .filter((w) => w.floor === index)
      .map((w) => ({
        ...w,
        id: `${w.id}-${Date.now().toString(36)}`,
        a: [w.a[0] + dx, w.a[1] + dy] as XY,
        b: [w.b[0] + dx, w.b[1] + dy] as XY,
      })),
    rooms: s.rooms
      .filter((r) => r.floor === index)
      .map((r) => ({
        ...r,
        outline: shiftRing(r.outline, dx, dy),
        rect: [r.rect[0] + dx, r.rect[1] + dy, r.rect[2] + dx, r.rect[3] + dy] as Room["rect"],
      })),
  };
}

/** The structure with floor `p.floor.index` as `p` (put in, or in place of the one there: its slabs,
 *  walls, rooms; its roofs gone with it). */
export function withFloor(s: Structure, p: FloorPieces): Structure {
  const i = p.floor.index;
  return {
    ...s,
    floors: [...s.floors.filter((f) => f.index !== i), p.floor].sort((a, b) => a.index - b.index),
    slabs: [...s.slabs.filter((x) => x.floor !== i), ...p.slabs],
    walls: [...s.walls.filter((w) => w.floor !== i), ...p.walls],
    rooms: [...s.rooms.filter((r) => r.floor !== i), ...p.rooms],
    ...(s.roofs ? { roofs: s.roofs.filter((r) => r.floor !== i) } : {}),
  };
}

/** The structure without floor `i` (its slabs, walls, rooms, roofs). */
export function withoutFloor(s: Structure, i: number): Structure {
  return {
    ...s,
    floors: s.floors.filter((f) => f.index !== i),
    slabs: s.slabs.filter((x) => x.floor !== i),
    walls: s.walls.filter((w) => w.floor !== i),
    rooms: s.rooms.filter((r) => r.floor !== i),
    ...(s.roofs ? { roofs: s.roofs.filter((r) => r.floor !== i) } : {}),
  };
}

/** A floor's footprint as a generator's rows (its cells with floor: "_"), from its corner. */
export function footprintRows(s: Structure, floor: number): { tiles: string[]; width: number; height: number } {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return { tiles: [], width: 0, height: 0 };
  const { x0, y0, w, h } = f.grid;
  const tiles: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) row += isFloor(cellTop(s, floor, x0 + x, y0 + y)) ? "_" : " ";
    tiles.push(row);
  }
  return { tiles, width: w, height: h };
}
