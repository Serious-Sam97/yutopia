import { CHUNK } from "../grounds.ts";
import { type FlowWorld, RUN_MIN } from "../move/flow.ts";
import { FLOW_MOVES } from "../move/flow-moves.ts";
import { type GroundSolid, type GroundWhat, groundSolidsIn } from "../shapes/grounds.ts";
import type { SolidBox3 } from "../shapes/index.ts";
import type { Frame } from "./body.ts";

// Flowmotion's world outdoors (docs/plan/56-the-controls.md F, phase 7): what can be swung round,
// ground along, run up or kicked off, read from the Grounds' own solids by what each is (the
// shapes table: shapes/grounds.ts) — no tags kept anywhere else, so god mode's edits and the Kart
// Park's layouts are in it as soon as their chunks are made again (`forget`).
//   poles:  upright and thin (a lamp post, a trunk, a snow pole, a mast), 2 m or more
//   rails:  a fence's, the tower's, the bridge's railings, the kart fence: thin and long, low
//   walls:  anything else boxed and 1.6 m or more (kicked off); a building's face, the tower, the
//           kart shed and tower, Motors: run up and along too (when RUN_MIN or more over the feet);
//           what's stacked flush on a face (a roof's first step on its wall) is the same wall, as
//           high as the stack — the top run over is where there's room to stand
// The building's own floors aren't here: Flowmotion is out on the Grounds.

const BODY_R = 0.25; // (flow.ts's)
const POLE_R = 0.5;
const POLE_H = 2;
const RAIL_T = 0.13; // half its thickness, at most
const RAIL_LEN = 0.6; // half its length, at least
const WALL_H = 1.6;

const RAILS: ReadonlySet<GroundWhat> = new Set(["fence", "tower_fence", "bridge_rail", "kart_fence"]);
const RUNS: ReadonlySet<GroundWhat> = new Set([
  "building",
  "roof",
  "building_wall",
  "tower",
  "kart_tower",
  "kart_shed",
  "motors",
]);
// (never anything to move off: under foot, overhead, or the world's own end)
const NOT: ReadonlySet<GroundWhat> = new Set(["street", "bridge_deck", "forecourt", "kart_island", "edge"]);

interface Pole {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}
interface Box {
  b: SolidBox3;
  /** its local +x and +z on the floor (three's turn: +x → (cos a, −sin a), +z → (sin a, cos a)) */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  run: boolean;
}
interface Parts {
  poles: Pole[];
  rails: Box[];
  walls: Box[];
}

const boxOf = (b: SolidBox3, run: boolean): Box => ({
  b,
  ax: Math.cos(b.a),
  az: -Math.sin(b.a),
  bx: Math.sin(b.a),
  bz: Math.cos(b.a),
  run,
});

/** How far (X, Z) is out from a box's footprint, and its face's outward normal there; null inside. */
function offOf(w: Box, X: number, Z: number): { dist: number; nx: number; nz: number } | null {
  const b = w.b;
  const dx = X - b.x;
  const dz = Z - b.z;
  const lx = dx * w.ax + dz * w.az;
  const lz = dx * w.bx + dz * w.bz;
  const ox = lx - Math.max(-b.hx, Math.min(b.hx, lx));
  const oz = lz - Math.max(-b.hz, Math.min(b.hz, lz));
  const dist = Math.hypot(ox, oz);
  if (dist < 1e-6) return null;
  return { dist, nx: (ox * w.ax + oz * w.bx) / dist, nz: (ox * w.az + oz * w.bz) / dist };
}

/** A chunk's solids sorted into what Flowmotion uses. */
export function flowParts(solids: GroundSolid[]): Parts {
  const out: Parts = { poles: [], rails: [], walls: [] };
  for (const { what, s, blocks } of solids) {
    if (NOT.has(what) || blocks === "seat" || blocks === "none") continue;
    if (s.t === "cyl") {
      if (s.r <= POLE_R && s.y1 - s.y0 >= POLE_H) out.poles.push(s);
      continue;
    }
    const thin = Math.min(s.hx, s.hz);
    const long = Math.max(s.hx, s.hz);
    if (RAILS.has(what) && thin <= RAIL_T && long >= RAIL_LEN) out.rails.push(boxOf(s, false));
    else if (s.hy * 2 >= WALL_H || what === "roof") out.walls.push(boxOf(s, RUNS.has(what)));
  }
  return out;
}

/** The Grounds' Flowmotion for a body on a floor (`frame`: that floor's place: the body's x, y,
 *  z are the floor's, the Grounds' the world's), chunk by chunk as it's asked, kept till `forget`. */
export class GroundsFlow implements FlowWorld {
  readonly moves = FLOW_MOVES;
  private readonly chunks = new Map<string, Parts>();

  constructor(
    private readonly frame: () => Frame,
    private readonly solidsIn: (cx: number, cz: number) => GroundSolid[] = groundSolidsIn,
  ) {}

  /** A chunk made again (an edit, a layout): asked afresh next time. */
  forget(cx: number, cz: number) {
    this.chunks.delete(`${cx},${cz}`);
  }

  private near(X: number, Z: number, reach: number): Parts[] {
    const out: Parts[] = [];
    const c0 = Math.floor((X - reach - 2) / CHUNK);
    const c1 = Math.floor((X + reach + 2) / CHUNK);
    const r0 = Math.floor((Z - reach - 2) / CHUNK);
    const r1 = Math.floor((Z + reach + 2) / CHUNK);
    for (let cx = c0; cx <= c1; cx++)
      for (let cz = r0; cz <= r1; cz++) {
        const k = `${cx},${cz}`;
        let p = this.chunks.get(k);
        if (!p) {
          p = flowParts(this.solidsIn(cx, cz));
          this.chunks.set(k, p);
        }
        out.push(p);
      }
    return out;
  }

  pole(x: number, y: number, z: number, reach: number) {
    const f = this.frame();
    const X = f.ox + x;
    const Z = f.oy + y;
    const Y = f.elev + z;
    let best: Pole | null = null;
    let bd = reach;
    for (const c of this.near(X, Z, reach))
      for (const p of c.poles) {
        // (beside me: its top over my feet, its foot under my waist)
        if (Y >= p.y1 - 0.3 || Y + 1 < p.y0) continue;
        const d = Math.hypot(X - p.x, Z - p.z) - p.r - BODY_R;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    return best && { x: best.x - f.ox, y: best.z - f.oy, r: best.r, top: best.y1 - f.elev };
  }

  wall(x: number, y: number, z: number, _ux: number, _uy: number, reach: number) {
    const f = this.frame();
    const X = f.ox + x;
    const Z = f.oy + y;
    const Y = f.elev + z;
    const near = this.near(X, Z, reach);
    let best: { nx: number; ny: number; d: number; top: number; run: boolean } | null = null;
    let bestTop = 0;
    for (const c of near)
      for (const w of c.walls) {
        const b = w.b;
        const top = b.y + b.hy;
        // (beside me: its top over my feet, and not all of it over my head)
        if (Y >= top || Y + 1.2 < b.y - b.hy) continue;
        const o = offOf(w, X, Z);
        if (!o) continue; // (inside it: nothing to be against)
        const d = o.dist - BODY_R;
        if (d >= reach || (best && d >= best.d)) continue;
        best = { nx: o.nx, ny: o.nz, d, top: 0, run: w.run };
        bestTop = top;
      }
    if (!best) return null;
    // what's stacked flush on it, face to face: the same wall, up to the stack's top
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of near)
        for (const w of c.walls) {
          const b = w.b;
          if (Math.abs(b.y - b.hy - bestTop) > 0.1 || b.y + b.hy <= bestTop + 1e-6) continue;
          const o = offOf(w, X, Z);
          if (!o || Math.abs(o.dist - BODY_R - best.d) > 0.05) continue;
          bestTop = b.y + b.hy;
          grew = true;
        }
    }
    best.top = bestTop - f.elev;
    best.run = best.run && bestTop - Y >= RUN_MIN;
    return best;
  }

  rail(x: number, y: number, z: number, reach: number) {
    const f = this.frame();
    const X = f.ox + x;
    const Z = f.oy + y;
    const Y = f.elev + z;
    let best: { x: number; y: number; z: number; ux: number; uy: number; back: number; ahead: number } | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const c of this.near(X, Z, reach))
      for (const r of c.rails) {
        const b = r.b;
        const top = b.y + b.hy;
        if (Math.abs(Y - top) > 0.5) continue;
        // along its length (its long side), and across
        const alongX = b.hx >= b.hz;
        const half = alongX ? b.hx : b.hz;
        const ux = alongX ? r.ax : r.bx;
        const uz = alongX ? r.az : r.bz;
        const dx = X - b.x;
        const dz = Z - b.z;
        const s = dx * ux + dz * uz;
        if (s < -half || s > half) continue;
        const across = Math.abs(-dx * uz + dz * ux);
        if (across > reach || across >= bd) continue;
        bd = across;
        best = {
          x: b.x + ux * s - f.ox,
          y: b.z + uz * s - f.oy,
          z: top - f.elev,
          ux,
          uy: uz,
          back: s + half,
          ahead: half - s,
        };
      }
    return best;
  }
}
