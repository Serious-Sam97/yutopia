// What the 3D view draws a floor's walls from (docs/plan/72-the-3d-core.md, phase 8: drawing
// structures): the structure's walls — segments with two faces — not the floor's tile edges. A wall
// along x or y on whole metres is drawn a metre at a time as the walls always were (the same pieces,
// the same posts: the same picture); one at any other angle or off the metres (phase 11's tool makes
// them) is drawn as pieces along its own line, each the x-wall's piece turned and placed there.
//
// Floor-local frame, as World3 draws (its corner subtracted: tp/view.ts places the floor's root).
import type { Edge, MapDef } from "@yutopia/shared";
import { HALF_WALL, HALF_WALL_H, NO_WALL, WALL_H, WALL_T } from "@yutopia/shared";
import { backOf, hWallOf, isArc, layoutSig, vWallOf, type Wall, wallPoints } from "@yutopia/shared/structure";
import type { Out } from "./kit3d";

/** A wall on neither axis, or off the metres: its two ends (floor-local), its faces. */
export interface FreeWall {
  id: string;
  a: [number, number];
  b: [number, number];
  ch: string;
  back: string;
  /** an arc's points, a to b (floor-local; shared structure/arc.ts): drawn along them */
  pts?: [number, number][];
  /** its own height and thickness (m; phase 11.4), when not its kind's and WALL_T */
  height?: number;
  thick?: number;
  /** stood over its floor (m: a mezzanine's height — phase 11.7) */
  base?: number;
}

/** A floor's walls as the drawing asks them: the edges of the tile lattice (a char on an edge along
 *  x — the north edge of tile x, y — or along y, the west edge; "." none), each edge's back face,
 *  and the walls that aren't on the lattice. */
export interface WallEdges {
  h(x: number, y: number): string;
  v(x: number, y: number): string;
  back(e: Edge): string;
  free: readonly FreeWall[];
  /** a key that changes when any of it does (the floor's layout signature's walls) */
  sig: string;
}

const EPS = 1e-6;
const whole = (v: number) => Math.abs(v - Math.round(v)) < EPS;

/** The structure's walls of one floor (`floor`: its index), seen from the floor's corner. */
export function edgesOfWalls(
  walls: readonly Wall[],
  floor: number,
  corner: { x: number; y: number },
  /** the floor's height (world): a wall standing higher (on a mezzanine) is drawn up there */
  z0?: number,
): WallEdges {
  const h = new Map<string, string>();
  const v = new Map<string, string>();
  const hb = new Map<string, string>();
  const vb = new Map<string, string>();
  const free: FreeWall[] = [];
  const sig: string[] = [];
  for (const w of walls) {
    if (w.floor !== floor) continue;
    const a: [number, number] = [w.a[0] - corner.x, w.a[1] - corner.y];
    const b: [number, number] = [w.b[0] - corner.x, w.b[1] - corner.y];
    const back = w.back ?? NO_WALL;
    sig.push(`${w.id}:${a}:${b}:${w.front}:${back}:${w.bow ?? 0}`);
    const lift = z0 === undefined ? 0 : Math.round((w.base - z0) * 1000) / 1000;
    const shape = { ...ownShape(w), ...(lift ? { base: lift } : {}) };
    sig.push(`${w.height}:${w.thick ?? ""}:${lift}`);
    if (isArc(w)) {
      const pts = wallPoints(w).map((p): [number, number] => [p[0] - corner.x, p[1] - corner.y]);
      free.push({ id: w.id, a, b, ch: w.front, back, pts, ...shape });
      continue;
    }
    if (shape.height !== undefined || shape.thick !== undefined || lift) {
      // (its own height or thickness: drawn as a free wall, along its line)
      free.push({ id: w.id, a, b, ch: w.front, back, ...shape });
      continue;
    }
    const onX = Math.abs(a[1] - b[1]) < EPS;
    const onY = Math.abs(a[0] - b[0]) < EPS;
    if ((onX || onY) && whole(a[0]) && whole(a[1]) && whole(b[0]) && whole(b[1])) {
      if (onX) {
        const y = Math.round(a[1]);
        const [x0, x1] = [Math.round(Math.min(a[0], b[0])), Math.round(Math.max(a[0], b[0]))];
        for (let x = x0; x < x1; x++) {
          h.set(`${x},${y}`, w.front);
          if (back !== NO_WALL) hb.set(`${x},${y}`, back);
        }
      } else {
        const x = Math.round(a[0]);
        const [y0, y1] = [Math.round(Math.min(a[1], b[1])), Math.round(Math.max(a[1], b[1]))];
        for (let y = y0; y < y1; y++) {
          v.set(`${x},${y}`, w.front);
          if (back !== NO_WALL) vb.set(`${x},${y}`, back);
        }
      }
      continue;
    }
    free.push({ id: w.id, a, b, ch: w.front, back });
  }
  sig.sort();
  return {
    h: (x, y) => h.get(`${x},${y}`) ?? NO_WALL,
    v: (x, y) => v.get(`${x},${y}`) ?? NO_WALL,
    back: (e) => (e.dir === "h" ? hb : vb).get(`${e.x},${e.y}`) ?? NO_WALL,
    free,
    sig: sig.join("|"),
  };
}

/** A wall's height and thickness when they aren't its kind's (a half wall's, a wall's) and WALL_T. */
function ownShape(w: Wall): { height?: number; thick?: number } {
  const kind = w.front === HALF_WALL ? HALF_WALL_H : WALL_H;
  return {
    ...(Math.abs(w.height - kind) > 1e-3 ? { height: w.height } : {}),
    ...(w.thick !== undefined && Math.abs(w.thick - WALL_T) > 1e-6 ? { thick: w.thick } : {}),
  };
}

/** A floor's walls by its cells' edges (asked of its structure — or a tile map's rows: the tests',
 *  the dev pages'). */
export function edgesOfMap(map: MapDef): WallEdges {
  return {
    h: (x, y) => hWallOf(map, x, y),
    v: (x, y) => vWallOf(map, x, y),
    back: (e) => backOf(map, e),
    free: [],
    sig: `${map.ox ?? 0},${map.oy ?? 0}|${layoutSig(map)}`,
  };
}

/** A free wall's pieces: a metre at a time along it from `a` (the last what's left), each placed by
 *  where it starts and the wall's heading (radians, three's y-up turn of a piece drawn along +x). */
export function piecesOf(
  w: FreeWall,
  marks: readonly number[] = [],
): { at: [number, number]; len: number; angle: number; u: number }[] {
  // (an arc: along each of its chords in turn; a straight one also split at `marks` — m along it
  // from `a`: where its doors' and windows' holes start and end)
  const pts = w.pts ?? [w.a, w.b];
  const out: { at: [number, number]; len: number; angle: number; u: number }[] = [];
  let u0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < EPS) continue;
    const ux = dx / L;
    const uy = dy / L;
    const angle = Math.atan2(uy, ux);
    const cuts = new Set<number>();
    for (let u = 0; u < L - EPS; u += 1) cuts.add(u);
    // (the marks along the whole wall: an arc's chord takes those that fall on it)
    for (const m of marks) if (m - u0 > EPS && m - u0 < L - EPS) cuts.add(m - u0);
    const us = [...cuts].sort((p, q) => p - q);
    for (const [k, u] of us.entries()) {
      const next = k + 1 < us.length ? us[k + 1] : L;
      out.push({ at: [a[0] + ux * u, a[1] + uy * u], len: Math.min(1, next - u), angle, u: u0 + u });
    }
    u0 += L;
  }
  return out;
}

/** Turn what a sketch drew (three's frame: x, up, z = the floor's y) about the up axis by `angle`
 *  (the floor's x towards its y) and move it by (x, z): a piece drawn along +x from the origin,
 *  placed along a wall. Its faces, ink, decals and cards. */
export function turnOut(out: Out, angle: number, x: number, z: number, lift = 0): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pt = (arr: number[], i: number, move: boolean) => {
    const px = arr[i];
    const pz = arr[i + 2];
    arr[i] = px * c - pz * s + (move ? x : 0);
    arr[i + 2] = px * s + pz * c + (move ? z : 0);
    if (move && lift) arr[i + 1] += lift;
  };
  for (const g of [out.lit, out.glow, out.clear]) {
    for (let i = 0; i < g.pos.length; i += 3) pt(g.pos, i, true);
    for (let i = 0; i < g.nor.length; i += 3) pt(g.nor, i, false);
  }
  for (const d of out.decals) {
    for (let i = 0; i < d.pos.length; i += 3) pt(d.pos, i, true);
    for (let i = 0; i < d.nor.length; i += 3) pt(d.nor, i, false);
  }
}
