import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import { type AreaDef, areaAt, holdsItems, hWall, isFloor, isWallEdge, type MapDef, tileAt, vWall } from "./map.ts";

// Dressing: the clutter that makes a room lived in, chosen per room as a preset
// and placed by rules, the same on every client and on the server (so a plant
// in a corner also blocks walking). Seeded by the room's key: everyone sees
// the same mug on the same desk. Furniture always wins: dressing only uses
// free spots, and moves out of the way when something is placed.
export const DRESSINGS = ["tidy", "lived", "busy"] as const;
export type Dressing = (typeof DRESSINGS)[number];
export const isDressing = (d: unknown): d is Dressing =>
  typeof d === "string" && (DRESSINGS as readonly string[]).includes(d);

export type DressKind =
  // on surfaces (desks, tables, shelves)
  | "papers"
  | "mug"
  | "tapes"
  | "binder"
  | "succulent"
  | "vinyl"
  // on walls
  | "frame"
  // on the floor
  | "plant"
  | "boxes"
  | "cable"
  | "bin";

export interface DressItem {
  id: string;
  kind: DressKind;
  x: number; // world tiles (float): where it stands / hangs
  y: number;
  z: number; // px above the floor (surfaces)
  seed: number; // 0..1, picks a look
  solid: boolean; // blocks walking (floor items)
  host?: string; // the object it sits on
  tile?: [number, number]; // floor items: the tile they take
}

const DENSITY: Record<Dressing, number> = { tidy: 0.25, lived: 0.55, busy: 0.85 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Free spots on top of furniture, in rot-0 local tiles, and the surface height.
const SURFACES: Record<string, { z: number; at: [number, number][]; kinds: DressKind[] }> = {
  desk: {
    z: 25,
    at: [
      [0.12, 0.55],
      [1.88, 0.5],
      [1.02, 0.86],
    ],
    kinds: ["papers", "mug", "tapes", "binder", "succulent"],
  },
  coffee_table: {
    z: 13,
    at: [
      [1.65, 0.4],
      [1.0, 0.72],
    ],
    kinds: ["vinyl", "mug", "papers", "succulent"],
  },
  reception: {
    z: 29,
    at: [
      [0.3, 0.5],
      [0.72, 0.62],
    ],
    kinds: ["papers", "succulent", "binder", "mug"],
  },
  meeting_table: {
    z: 25,
    at: [
      [1.4, 0.4],
      [3.4, 1.6],
      [4.2, 0.4],
      [5.4, 1.55],
      [2.2, 1.6],
    ],
    kinds: ["papers", "mug", "binder", "mug"],
  },
  tape_shelf: { z: 46, at: [[0.9, 0.5]], kinds: ["tapes", "succulent", "vinyl"] },
};

// rot-0 local → world, the same turn as everything else (90° clockwise steps)
function place(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return [o.x + x, o.y + y];
}

// inside the room, and the room is the one in charge there (not a nested corner)
function inArea(map: MapDef, a: AreaDef, x: number, y: number) {
  return x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h && areaAt(map, x + 0.5, y + 0.5)?.key === a.key;
}

export function dressItems(map: MapDef, objects: Iterable<WorldObjectDef>): DressItem[] {
  const objs = [...objects];
  const out: DressItem[] = [];
  const taken = new Set<string>(); // tiles with furniture (or dressing already)
  const near = new Set<string>(); // tiles that must stay free: doorways, seats' fronts
  for (const o of objs) {
    const e = entry(o.kind);
    if (e.wall || o.kind === "door") {
      if (o.kind === "door") {
        const odd = (o.rot ?? 0) % 2 === 1;
        for (let d = -1; d <= 1; d++)
          for (const [x, y] of odd
            ? [
                [o.x - 1, o.y + d],
                [o.x, o.y + d],
              ]
            : [
                [o.x + d, o.y - 1],
                [o.x + d, o.y],
              ])
            near.add(`${x},${y}`);
      }
      continue;
    }
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken.add(`${o.x + dx},${o.y + dy}`);
  }
  const hung = new Set<string>();
  for (const o of objs)
    if (entry(o.kind).wall) for (let i = 0; i < footprint(o.kind, 0).w; i++) hung.add(`${o.x + i},${o.y}`);
  if (map.spawn) near.add(`${Math.floor(map.spawn.x)},${Math.floor(map.spawn.y)}`);

  for (const a of map.areas) {
    if (!isDressing(a.dressing)) continue;
    const p = DENSITY[a.dressing];
    const r = rng(hash(`${a.key}|${a.dressing}`));
    // ── surfaces ──
    for (const o of objs) {
      const s = SURFACES[o.kind];
      if (!s) continue;
      const [cx, cy] = place(o, entry(o.kind).w / 2, entry(o.kind).h / 2);
      if (areaAt(map, cx, cy)?.key !== a.key) continue;
      s.at.forEach(([lx, ly], i) => {
        if (r() > p * 0.9) return;
        const [x, y] = place(o, lx, ly);
        out.push({
          id: `d-${o.id}-${i}`,
          kind: s.kinds[Math.floor(r() * s.kinds.length)],
          x,
          y,
          z: s.z,
          seed: r(),
          solid: false,
          host: o.id,
        });
      });
    }
    // ── walls: framed pictures on free stretches of solid wall ──
    let lastFrame = -9;
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) {
        if (
          !inArea(map, a, x, y) ||
          !isFloor(tileAt(map, x, y)) ||
          !holdsItems(hWall(map, x, y)) ||
          hung.has(`${x},${y}`)
        )
          continue;
        if (hung.has(`${x - 1},${y}`) || hung.has(`${x + 1},${y}`) || near.has(`${x},${y}`)) continue;
        if (x - lastFrame < 3 || r() > p * 0.55) continue;
        lastFrame = x;
        out.push({ id: `d-${a.key}-f${x}-${y}`, kind: "frame", x: x + 0.5, y, z: 0, seed: r(), solid: false });
      }
    // ── floor: corners first (plants), then along the back wall ──
    const free = (x: number, y: number) =>
      inArea(map, a, x, y) && isFloor(tileAt(map, x, y)) && !taken.has(`${x},${y}`) && !near.has(`${x},${y}`);
    const wallN = (x: number, y: number) => isWallEdge(hWall(map, x, y));
    const wallS = (x: number, y: number) => isWallEdge(hWall(map, x, y + 1));
    const wallW = (x: number, y: number) => isWallEdge(vWall(map, x, y));
    const wallE = (x: number, y: number) => isWallEdge(vWall(map, x + 1, y));
    const besideDressing = (x: number, y: number) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => taken.has(`d${x + dx},${y + dy}`));
    const floorItem = (x: number, y: number, kind: DressKind, solid: boolean) => {
      taken.add(`${x},${y}`);
      taken.add(`d${x},${y}`);
      out.push({
        id: `d-${a.key}-${kind}-${x}-${y}`,
        kind,
        x: x + 0.5,
        y: y + 0.5,
        z: 0,
        seed: r(),
        solid,
        tile: [x, y],
      });
    };
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) {
        if (!free(x, y) || besideDressing(x, y)) continue;
        const corner = (wallN(x, y) || wallS(x, y)) && (wallW(x, y) || wallE(x, y));
        if (corner && r() < p) floorItem(x, y, "plant", true);
      }
    if (a.w >= 4 && a.h >= 4)
      for (let x = a.x; x < a.x + a.w; x++) {
        const y = a.y;
        if (!free(x, y) || !wallN(x, y) || besideDressing(x, y) || !free(x, y + 1)) continue;
        const k = r();
        if (k < p * 0.18) floorItem(x, y, "boxes", true);
        else if (k < p * 0.3) floorItem(x, y, "bin", true);
        else if (k < p * 0.42) floorItem(x, y, "cable", false);
        else if (k < p * 0.5) floorItem(x, y, "plant", true);
      }
  }
  return out;
}
