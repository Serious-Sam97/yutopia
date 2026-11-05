// Today's tile maps as a structure (docs/plan/72-the-3d-core.md, phase 6): every floor of the
// building in world metres (each floor's tiles moved by its corner, the home floor's at 0, 0 —
// the land's own frame), its walls joined along their runs, its tiles traced into slabs, its areas
// as rooms (with the outline their walls make: faces.ts). to-map.ts gives the same maps back.
import { elevOf, floorsOf, homeOf, levelMap } from "../levels.ts";
import { backAt, HALF_WALL, hWall, isFloor, type MapDef, NO_WALL, vWall } from "../map.ts";
import { HALF_WALL_H, WALL_H } from "../units.ts";
import { roomsFromWalls } from "./faces.ts";
import { foldMap } from "./fold.ts";
import { traceRegion } from "./rings.ts";
import { type Floor, type Room, type Slab, STRUCTURE_VERSION, type Structure, type Wall, type XY } from "./types.ts";

const heightOf = (ch: string): number => (ch === HALF_WALL ? HALF_WALL_H : WALL_H);

/** (An older map is folded into the world's frame first: fold.ts.) */
export function structureFromMap(map0: MapDef): Structure {
  const map = foldMap(map0);
  const home = homeOf(map);
  const floors: Floor[] = [];
  const slabs: Slab[] = [];
  const walls: Wall[] = [];
  const rooms: Room[] = [];
  for (const index of floorsOf(map)) {
    const lm = levelMap(map, index);
    if (!lm) continue;
    // (a world map's floor: its tile rows start at its corner, its places the world's)
    const ox = lm.ox ?? 0;
    const oy = lm.oy ?? 0;
    const z = elevOf(index);
    const def = map.levels?.find((l) => l.index === index);
    floors.push({
      index,
      name: index === home ? map.name : lm.name,
      z,
      ...(def?.outdoor ? { outdoor: true } : {}),
      ...(def?.spawn ? { spawn: [def.spawn.x, def.spawn.y] as XY } : {}),
      grid: { x0: ox, y0: oy, w: lm.width, h: lm.height },
    });
    // the slabs: each floor char's cells traced
    const chars = new Set<string>();
    for (const row of lm.tiles) for (const ch of row) if (isFloor(ch)) chars.add(ch);
    let n = 0;
    for (const top of [...chars].sort())
      for (const s of traceRegion(lm.width, lm.height, (x, y) => lm.tiles[y][x] === top, ox, oy))
        slabs.push({ id: `s${index}-${n++}`, floor: index, z, top, outline: s.outline, holes: s.holes });
    // the walls: each run of edges alike (the same front, the same back) one segment
    const run = (dir: "h" | "v", line: number, len: number) => {
      let start = -1;
      let front = "";
      let back = "";
      const close = (end: number) => {
        if (start < 0) return;
        const a: XY = dir === "h" ? [start + ox, line + oy] : [line + ox, start + oy];
        const b: XY = dir === "h" ? [end + ox, line + oy] : [line + ox, end + oy];
        walls.push({
          id: `w${index}-${dir}${line}-${start}`,
          floor: index,
          a,
          b,
          base: z,
          height: heightOf(front),
          front,
          ...(back !== NO_WALL ? { back } : {}),
        });
        start = -1;
      };
      for (let i = 0; i <= len; i++) {
        const w = dir === "h" ? { dir, x: i + ox, y: line + oy } : { dir, x: line + ox, y: i + oy };
        const ch = i < len ? (dir === "h" ? hWall(lm, w.x, w.y) : vWall(lm, w.x, w.y)) : NO_WALL;
        const bk = i < len && ch !== NO_WALL ? backAt(lm, w) : NO_WALL;
        if (start >= 0 && (ch !== front || bk !== back)) close(i);
        if (start < 0 && ch !== NO_WALL) {
          start = i;
          front = ch;
          back = bk;
        }
      }
    };
    for (let y = 0; y <= lm.height; y++) run("h", y, lm.width);
    for (let x = 0; x <= lm.width; x++) run("v", x, lm.height);
    // the rooms: each area's rectangle, the rest of it as it was
    for (const area of lm.areas) {
      const { key, x, y, w, h, ...props } = area;
      const [x0, y0, x1, y1] = [x, y, x + w, y + h];
      rooms.push({ key, floor: index, outline: [], rect: [x0, y0, x1, y1], props });
    }
  }
  return {
    version: STRUCTURE_VERSION,
    key: map.key,
    name: map.name,
    home,
    spawn: [map.spawn.x, map.spawn.y],
    ...(map.core ? { core: [map.core.x, map.core.y] as XY } : {}),
    floors,
    slabs,
    walls,
    // (each room the outline its walls make)
    rooms: roomsFromWalls({ walls }, rooms),
  };
}
