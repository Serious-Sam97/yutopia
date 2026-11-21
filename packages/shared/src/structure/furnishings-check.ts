// What every hand-made layout is held to (docs/plan/113-the-furniture-by-hand.md, B): nothing through a wall or
// another piece, nothing standing in a window or the doorway, the stairs clear at both ends, every seat and counter
// reached from the door, every seat facing its table or the room, nothing facing a wall it can't be used against.
// Read off the pieces' own solids (shapes/index.ts kindSolids), on a 10 cm raster of each storey.
import { layoutOf } from "../building-styles.ts";
import { entry, type WorldObjectDef } from "../catalog.ts";
import { SEAT_SPEC } from "../furniture.ts";
import type { Building } from "../grounds.ts";
import { kindSolids, type Solid3 } from "../shapes/index.ts";
import { stairsLocal, stairsWell } from "../stairs.ts";
import { WALL_T } from "../units.ts";
import { frameOf, type Layout, stairsAt } from "./furnishings.ts";
import type { Floor, Wall } from "./types.ts";

/** Pieces that are meant to stand at a window (a diner's booths, a bed under a sill) by kind. */
const AT_WINDOW = new Set(["booth_seat", "booth_table", "rug", "round_rug", "runner_rug", "hay_bale"]);
/** What's walked over, not round (a rug). */
const FLAT = (o: WorldObjectDef) => kindSolids(o).every((s) => (s.t === "cyl" ? s.y1 : s.y + s.hy) < 0.06);
const SURFACE_KINDS = (k: string) => entry(k).surface !== undefined && !entry(k).wall;
void SEAT_SPEC;

interface Corners {
  pts: [number, number][];
  y0: number;
  y1: number;
}
function cornersOf(s: Solid3): Corners {
  if (s.t === "cyl")
    return {
      pts: [
        [s.x - s.r, s.z - s.r],
        [s.x + s.r, s.z - s.r],
        [s.x + s.r, s.z + s.r],
        [s.x - s.r, s.z + s.r],
      ],
      y0: s.y0,
      y1: s.y1,
    };
  const c = Math.cos(-s.a);
  const n = Math.sin(-s.a);
  const pts = (
    [
      [-s.hx, -s.hz],
      [s.hx, -s.hz],
      [s.hx, s.hz],
      [-s.hx, s.hz],
    ] as [number, number][]
  ).map(([u, v]): [number, number] => [s.x + u * c - v * n, s.z + u * n + v * c]);
  return { pts, y0: s.y - s.hy, y1: s.y + s.hy };
}
/** How deep two convex quads overlap across (SAT, the least push apart); 0 apart. */
function penetration(a: [number, number][], b: [number, number][]): number {
  let least = Number.POSITIVE_INFINITY;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      const L = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / L;
      const ny = (x1 - x0) / L;
      const pa = a.map(([x, y]) => x * nx + y * ny);
      const pb = b.map(([x, y]) => x * nx + y * ny);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0;
      least = Math.min(least, o);
    }
  return least;
}
const inside = (pts: [number, number][], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** A piece's facing in the world (its footprint's front: (−sin yaw, cos yaw)). */
const facing = (o: WorldObjectDef): [number, number] => [-Math.sin(o.yaw ?? 0), Math.cos(o.yaw ?? 0)];

/** Everything wrong with a building's laid layout: its storeys' floors (bottom up), its walls (shell and inside),
 *  the things laid (its pieces and its stairs). Empty: it holds. */
export function layoutProblems(
  b: Building,
  layout: Layout,
  floors: Floor[],
  walls: Wall[],
  things: WorldObjectDef[],
): string[] {
  const out: string[] = [];
  const f = frameOf(b);
  if (!f) return ["no frame"];
  const t = WALL_T / 2;
  const R = 0.1; // (the raster's cell)
  const stairs = layout.stairs ? stairsAt(b, layout.stairs) : null;
  const Lb = layoutOf(b);
  const doorAt: [number, number] = Lb ? [Lb.door.x, Lb.door.z] : [0, 0];
  const name = (o: WorldObjectDef) => `${o.kind} ${o.id.replace(`sp-${b.key}-`, "")}`;
  const pieceOf = (o: WorldObjectDef) => layout.pieces[Number(o.id.replace(`sp-${b.key}-p`, ""))];

  floors.forEach((fl, storey) => {
    const here = things.filter((o) => o.props?.level === fl.index);
    const pieces = here.filter((o) => o.kind !== "stairs");
    const solids = new Map(pieces.map((o) => [o.id, kindSolids(o).map(cornersOf)]));
    const ceil = fl.ceil ?? 3;
    // 1. inside the walls, under the ceiling
    for (const o of pieces)
      for (const c of solids.get(o.id) ?? []) {
        if (
          c.pts.some(
            ([x, y]) => x < b.x0 + t - 0.01 || x > b.x1 - t + 0.01 || y < b.z0 + t - 0.01 || y > b.z1 - t + 0.01,
          )
        )
          out.push(`${name(o)}: through the shell`);
        if (c.y1 > ceil + 0.01) out.push(`${name(o)}: through the ceiling`);
        for (const w of walls)
          if (w.floor === fl.index && !w.shell) {
            // (the wall as thick as it's built: half of it each side of its line — plan 113 review)
            const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
            const nx = (-(w.b[1] - w.a[1]) / L) * t;
            const ny = ((w.b[0] - w.a[0]) / L) * t;
            const seg: [number, number][] = [
              [w.a[0] + nx, w.a[1] + ny],
              [w.b[0] + nx, w.b[1] + ny],
              [w.b[0] - nx, w.b[1] - ny],
              [w.a[0] - nx, w.a[1] - ny],
            ];
            if (penetration(c.pts, seg) > 0.005) out.push(`${name(o)}: through an inside wall`);
          }
        // (the stairs: their whole footprint on the storey they go up from — the landing walked on, the flights —
        // and the well over them on the one they come up to — plan 113 review)
        if (stairs && !FLAT(o)) {
          const so = { x: stairs.x, y: stairs.y, yaw: (stairs.rot * Math.PI) / 2 };
          const foot = (v0: number): [number, number][] => [
            stairsPointish(so, 0, v0),
            stairsPointish(so, 4, v0),
            stairsPointish(so, 4, 7),
            stairsPointish(so, 0, 7),
          ];
          const zones = [...(storey < floors.length - 1 ? [foot(0)] : []), ...(storey > 0 ? [foot(2)] : [])];
          if (zones.some((z) => penetration(c.pts, z) > 0.01)) out.push(`${name(o)}: in the stairs`);
        }
      }
    // 2. nothing through anything else
    for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i];
        const c = pieces[j];
        if (FLAT(a) || FLAT(c) || entry(a.kind).onSurface || entry(c.kind).onSurface) continue;
        let worst = 0;
        for (const p of solids.get(a.id) ?? [])
          for (const q of solids.get(c.id) ?? []) {
            if (p.y1 <= q.y0 + 0.01 || q.y1 <= p.y0 + 0.01) continue;
            worst = Math.max(worst, penetration(p.pts, q.pts));
          }
        if (worst > 0.02) out.push(`${name(a)} and ${name(c)}: ${(worst * 100).toFixed(0)} cm into each other`);
      }
    // 3. windows and doors kept clear
    for (const w of walls) {
      if (w.floor !== fl.index || !w.shell) continue;
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ux = (w.b[0] - w.a[0]) / L;
      const uy = (w.b[1] - w.a[1]) / L;
      const [nx, ny] = [-uy, ux]; // (in: shell walls go round with their inside on the left)
      for (const [s0, s1, z0, z1] of w.gaps ?? []) {
        // (a door: down to the floor and no wider than a door, or the one the building's entered by — a shop's
        // windows go down to the floor too)
        const mx = w.a[0] + ux * ((s0 + s1) / 2);
        const my = w.a[1] + uy * ((s0 + s1) / 2);
        const front = storey === 0 && Math.hypot(mx - doorAt[0], my - doorAt[1]) < Math.max(1, (s1 - s0) / 2 + 0.2);
        const door = z0 < 0.05 && (front || (s1 - s0 <= 2.0 && z1 <= 2.8));
        const deep = door ? 1.3 : 0.35;
        const pad = door ? 0.3 : 0;
        const zone: [number, number][] = [
          [w.a[0] + ux * (s0 - pad), w.a[1] + uy * (s0 - pad)],
          [w.a[0] + ux * (s1 + pad), w.a[1] + uy * (s1 + pad)],
          [w.a[0] + ux * (s1 + pad) + nx * deep, w.a[1] + uy * (s1 + pad) + ny * deep],
          [w.a[0] + ux * (s0 - pad) + nx * deep, w.a[1] + uy * (s0 - pad) + ny * deep],
        ];
        for (const o of pieces) {
          if (FLAT(o) || (!door && (AT_WINDOW.has(o.kind) || pieceOf(o)?.atWindow))) continue;
          const tall = (solids.get(o.id) ?? []).some(
            (c) => c.y1 > (door ? 0.06 : z0 + 0.02) && penetration(c.pts, zone) > 0.01,
          );
          if (tall) out.push(`${name(o)}: ${door ? "in the doorway" : "in front of a window"}`);
        }
        if (door && stairs && storey < floors.length - 1) {
          const cells = stairsWell({ x: stairs.x, y: stairs.y, yaw: (stairs.rot * Math.PI) / 2 });
          if (cells.some(([x, y]) => inside(zone, x + 0.5, y + 0.5))) out.push("the stairs: in the doorway");
        }
      }
    }
    // the raster: what's walked (inside the walls, round every solid that isn't flat, a body's half-width off)
    const nx0 = Math.floor(b.x0 / R);
    const ny0 = Math.floor(b.z0 / R);
    const NX = Math.ceil(b.x1 / R) - nx0;
    const NY = Math.ceil(b.z1 / R) - ny0;
    const free = new Uint8Array(NX * NY);
    const BODY = 0.22;
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const x = (nx0 + i + 0.5) * R;
        const y = (ny0 + j + 0.5) * R;
        if (x < b.x0 + t + BODY || x > b.x1 - t - BODY || y < b.z0 + t + BODY || y > b.z1 - t - BODY) continue;
        free[j * NX + i] = 1;
      }
    const block = (pts: [number, number][], pad: number) => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      for (
        let j = Math.max(0, Math.floor((Math.min(...ys) - pad) / R) - ny0);
        j < Math.min(NY, Math.ceil((Math.max(...ys) + pad) / R) - ny0);
        j++
      )
        for (
          let i = Math.max(0, Math.floor((Math.min(...xs) - pad) / R) - nx0);
          i < Math.min(NX, Math.ceil((Math.max(...xs) + pad) / R) - nx0);
          i++
        ) {
          const x = (nx0 + i + 0.5) * R;
          const y = (ny0 + j + 0.5) * R;
          // (within pad of the quad: its edges' distance, or in it)
          let d = inside(pts, x, y) ? 0 : Number.POSITIVE_INFINITY;
          for (let k = 0; k < pts.length && d > 0; k++) {
            const [ax, ay] = pts[k];
            const [bx, by] = pts[(k + 1) % pts.length];
            const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
            const s = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2));
            d = Math.min(d, Math.hypot(x - (ax + s * (bx - ax)), y - (ay + s * (by - ay))));
          }
          if (d <= pad) free[j * NX + i] = 0;
        }
    };
    for (const o of pieces) for (const c of solids.get(o.id) ?? []) if (c.y1 > 0.3 && c.y0 < 1.8) block(c.pts, BODY);
    for (const w of walls)
      if (w.floor === fl.index && !w.shell)
        block(
          [
            [w.a[0], w.a[1]],
            [w.b[0], w.b[1]],
            [w.b[0], w.b[1]],
            [w.a[0], w.a[1]],
          ],
          BODY + t,
        );
    // (the stairs: their well walked only from their door's landing; the floor above's hole not at all)
    if (stairs) {
      const so = { x: stairs.x, y: stairs.y, yaw: (stairs.rot * Math.PI) / 2 };
      const holeBelow = storey > 0;
      const mine = storey < floors.length - 1;
      if (mine || holeBelow)
        for (let j = 0; j < NY; j++)
          for (let i = 0; i < NX; i++) {
            const x = (nx0 + i + 0.5) * R;
            const y = (ny0 + j + 0.5) * R;
            const { u, v } = stairsLocal(so, x, y);
            if (u < -0.05 || u > 4.05 || v < -0.05 || v > 7.05) continue;
            // (the well, v 2..7: the flights; walked onto from its door's landing, v 0..2)
            if (v > 1.95) free[j * NX + i] = 0;
          }
    }
    // the door in (the ground storey's) or the stairs' landing (a storey up): where the walking starts
    const cell = (x: number, y: number) => {
      const i = Math.floor(x / R) - nx0;
      const j = Math.floor(y / R) - ny0;
      return i >= 0 && j >= 0 && i < NX && j < NY ? j * NX + i : -1;
    };
    let start: [number, number] | null = null;
    if (storey === 0) {
      // (in at its door: 0.7 in from it)
      start = Lb ? [Lb.door.x - Lb.door.ox * 0.7, Lb.door.z - Lb.door.oz * 0.7] : null;
    } else if (stairs) {
      // (up the stairs: arrived by their door, a storey up — v 0..2 of the same spot)
      const so = { x: stairs.x, y: stairs.y, yaw: (stairs.rot * Math.PI) / 2 };
      const [lx, ly] = stairsPointish(so, 1.0, 1.0);
      start = [lx, ly];
    }
    const reached = new Uint8Array(NX * NY);
    if (start) {
      const s0 = cell(start[0], start[1]);
      if (s0 < 0 || !free[s0]) out.push(`storey ${storey}: where you come in is blocked`);
      else {
        const q = [s0];
        reached[s0] = 1;
        while (q.length) {
          const c = q.pop() as number;
          const i = c % NX;
          const j = (c - i) / NX;
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const a = i + di;
            const e = j + dj;
            if (a < 0 || e < 0 || a >= NX || e >= NY) continue;
            const k = e * NX + a;
            if (free[k] && !reached[k]) {
              reached[k] = 1;
              q.push(k);
            }
          }
        }
      }
    }
    // 4. every seat, counter and surface reached — at its front (a seat's), or round it (a table's)
    const reachAt = (x: number, y: number, r: number) => {
      for (let j = Math.floor((y - r) / R) - ny0; j <= Math.floor((y + r) / R) - ny0; j++)
        for (let i = Math.floor((x - r) / R) - nx0; i <= Math.floor((x + r) / R) - nx0; i++)
          if (i >= 0 && j >= 0 && i < NX && j < NY && reached[j * NX + i]) return true;
      return false;
    };
    for (const o of pieces) {
      const e = entry(o.kind);
      const [fx, fy] = facing(o);
      if (e.seat) {
        // (a seat's got to from behind or beside it — its front's at its table: anywhere round it, a step off)
        const r = Math.max(entry(o.kind).w, entry(o.kind).h) / 2 + 0.15;
        const round = Array.from({ length: 12 }, (_, k) => [
          o.x + Math.cos((k * Math.PI) / 6) * r,
          o.y + Math.sin((k * Math.PI) / 6) * r,
        ]);
        if (start && !round.some(([x, y]) => reachAt(x, y, 0.15))) out.push(`${name(o)}: not reached from the door`);
        // 5. facing its table, its counter, or the room
        // (its table: the one whose edge is nearest it, not whose middle — a long counter's middle is far off)
        const tables = pieces.filter((q) => q !== o && SURFACE_KINDS(q.kind) && !entry(q.kind).seat);
        let best: WorldObjectDef | null = null;
        let bd = Number.POSITIVE_INFINITY;
        for (const q of tables) {
          const d2 = nearestGap(solids.get(q.id) ?? [], o.x, o.y);
          if (d2 < bd) {
            bd = d2;
            best = q;
          }
        }
        const near = best && bd < 0.75 ? best : null;
        if (near) {
          const [dx, dy] = closestPoint(solids.get(near.id) ?? [], o.x, o.y);
          const L = Math.hypot(dx - o.x, dy - o.y) || 1;
          if (((dx - o.x) * fx + (dy - o.y) * fy) / L < 0.7) out.push(`${name(o)}: its back to ${name(near)}`);
        } else if (!clearAhead(o, solids, walls, fl, b, 0.6)) out.push(`${name(o)}: facing a wall or a piece`);
      } else if (e.surface !== undefined && !e.wall && start) {
        if (!reachAround(o, solids.get(o.id) ?? [], reachAt)) out.push(`${name(o)}: not reached from the door`);
      } else if (start && e.solid && !FLAT(o) && hasFront(o.kind)) {
        const d = e.h / 2 + 0.45;
        if (!reachAt(o.x + fx * d, o.y + fy * d, 0.25)) out.push(`${name(o)}: its front not reached`);
      }
    }
  });
  return [...new Set(out)];
}

/** Kinds used from their front (a wardrobe's doors, a shelf's goods, a stove's knobs): the floor before them reached. */
const hasFront = (k: string) =>
  [
    "wardrobe",
    "bookcase",
    "shelving",
    "grocery_shelf",
    "drinks_fridge",
    "fridge",
    "kitchen_stove",
    "kitchen_sink",
    "back_bar",
    "fireplace",
    "jukebox",
    "locker",
    "produce_stand",
    "horse_stall",
    "workbench",
  ].includes(k);

function nearestGap(cs: Corners[], x: number, y: number): number {
  let d = Number.POSITIVE_INFINITY;
  for (const c of cs) {
    const [px, py] = closestOn(c.pts, x, y);
    d = Math.min(d, Math.hypot(px - x, py - y));
  }
  return d;
}
function closestPoint(cs: Corners[], x: number, y: number): [number, number] {
  let best: [number, number] = [x, y];
  let d = Number.POSITIVE_INFINITY;
  for (const c of cs) {
    const p = closestOn(c.pts, x, y);
    const e = Math.hypot(p[0] - x, p[1] - y);
    if (e < d) {
      d = e;
      best = p;
    }
  }
  return best;
}
function closestOn(pts: [number, number][], x: number, y: number): [number, number] {
  if (inside(pts, x, y)) return [x, y];
  let best: [number, number] = pts[0];
  let d = Number.POSITIVE_INFINITY;
  for (let k = 0; k < pts.length; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[(k + 1) % pts.length];
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const s = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2));
    const p: [number, number] = [ax + s * (bx - ax), ay + s * (by - ay)];
    const e = Math.hypot(p[0] - x, p[1] - y);
    if (e < d) {
      d = e;
      best = p;
    }
  }
  return best;
}
/** Nothing within `d` before a piece's front: no wall, no other piece. */
function clearAhead(
  o: WorldObjectDef,
  solids: Map<string, Corners[]>,
  walls: Wall[],
  fl: Floor,
  b: Building,
  d: number,
): boolean {
  const [fx, fy] = facing(o);
  const e = entry(o.kind);
  const px = o.x + fx * (e.h / 2 + d);
  const py = o.y + fy * (e.h / 2 + d);
  const t = WALL_T / 2;
  if (px < b.x0 + t || px > b.x1 - t || py < b.z0 + t || py > b.z1 - t) return false;
  // (a low table before a sofa is what it faces: not in its way)
  for (const [id, cs] of solids) if (id !== o.id && cs.some((c) => c.y1 > 0.5 && inside(c.pts, px, py))) return false;
  void walls;
  void fl;
  return true;
}
function reachAround(o: WorldObjectDef, cs: Corners[], reachAt: (x: number, y: number, r: number) => boolean): boolean {
  for (const c of cs)
    for (const [x, y] of c.pts) {
      const dx = x - o.x;
      const dy = y - o.y;
      const L = Math.hypot(dx, dy) || 1;
      if (reachAt(x + (dx / L) * 0.45, y + (dy / L) * 0.45, 0.25)) return true;
    }
  return false;
}
/** A point of a staircase's own (u, v) in the world, its footprint's turn (stairs.ts stairsPoint, in metres). */
function stairsPointish(o: { x: number; y: number; yaw: number }, u: number, v: number): [number, number] {
  const q = Math.round(o.yaw / (Math.PI / 2)) & 3;
  let X = u;
  let Y = v;
  let W = 4;
  let H = 7;
  for (let i = 0; i < q; i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return [o.x + X, o.y + Y];
}
