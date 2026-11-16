// Ruts in deep snow (docs/plan/93-the-car-in-the-world.md S6): each wheel that goes through deep snow (or mud)
// presses a rut; another wheel along it presses it deeper (the second pass is a full rut); the snow falling fills
// them back in. A wheel in a rut has the packed snow under it — a little more grip, less to plough — and is
// pulled into its middle, as a real rut takes the wheel: the next car follows the last.
//
// Pure: each client keeps one, fed by the tracks of every car it draws (car/cars.ts), read by its own car's sim
// through `CarWorld.rut` (car/drive.ts). The Grounds' coords (the building's: x, z on the ground).

export interface RutHit {
  /** signed distance from the rut's middle (m; + to its left as it was laid: its own (−dz, dx)) */
  off: number;
  /** how deep, 0..1 (one pass 0.5, two or more 1) */
  k: number;
  /** the way it runs (unit) */
  dx: number;
  dz: number;
}

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** 0..1 */
  depth: number;
  cell: number;
}

const CELL = 4;
/** a pass's depth; a rut's widest (from its middle, m) — past it, not in it */
export const RUT_PASS = 0.5;
export const RUT_HALF = 0.3;
const MAX = 4000;

const key = (cx: number, cz: number) => ((cx + 4096) << 13) | (cz + 4096);

export class Ruts {
  private segs: (Seg | null)[] = [];
  private free: number[] = [];
  private grid = new Map<number, number[]>();
  private n = 0;
  /** bumped as they change (a view redraws then) */
  version = 0;

  get count(): number {
    return this.n;
  }

  /** A wheel's step through deep snow, from (x0, z0) to (x1, z1): along a rut there already, deeper; else a new
   *  one. */
  lay(x0: number, z0: number, x1: number, z1: number) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05 || len > 3) return;
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    // (along one that's there: its middle near this step's, the same way or the opposite)
    const near = this.nearest(mx, mz, 0.14);
    if (near && Math.abs(near.dot(dx, dz)) > 0.9) {
      near.s.depth = Math.min(1, near.s.depth + RUT_PASS);
      this.version++;
      return;
    }
    if (this.n >= MAX) this.dropShallowest();
    const cell = key(Math.floor(mx / CELL), Math.floor(mz / CELL));
    const s: Seg = { ax: x0, az: z0, bx: x1, bz: z1, depth: RUT_PASS, cell };
    const i = this.free.pop() ?? this.segs.length;
    this.segs[i] = s;
    const list = this.grid.get(cell);
    if (list) list.push(i);
    else this.grid.set(cell, [i]);
    this.n++;
    this.version++;
  }

  /** The rut under a wheel at (x, z), if it's in one (within RUT_HALF of its middle). */
  at(x: number, z: number, out: RutHit): RutHit | null {
    const near = this.nearest(x, z, RUT_HALF);
    if (!near) return null;
    out.off = near.off;
    out.k = near.s.depth;
    out.dx = near.dx;
    out.dz = near.dz;
    return out;
  }

  /** The snow falling fills them (`by`: the depth gone this time, 0..1). */
  fill(by: number) {
    if (by <= 0 || !this.n) return;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (!s) continue;
      s.depth -= by;
      if (s.depth <= 0.02) this.remove(i);
    }
    this.version++;
  }

  /** Each rut (for drawing): its ends and depth. */
  each(fn: (ax: number, az: number, bx: number, bz: number, depth: number) => void) {
    for (const s of this.segs) if (s) fn(s.ax, s.az, s.bx, s.bz, s.depth);
  }

  clear() {
    this.segs = [];
    this.free = [];
    this.grid.clear();
    this.n = 0;
    this.version++;
  }

  private nearest(x: number, z: number, within: number) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best: Seg | null = null;
    let bd = within;
    let boff = 0;
    let bdx = 1;
    let bdz = 0;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const list = this.grid.get(key(cx + i, cz + j));
        if (!list) continue;
        for (const idx of list) {
          const s = this.segs[idx];
          if (!s) continue;
          const ex = s.bx - s.ax;
          const ez = s.bz - s.az;
          const L = Math.hypot(ex, ez) || 1;
          const ux = ex / L;
          const uz = ez / L;
          const px = x - s.ax;
          const pz = z - s.az;
          const along = px * ux + pz * uz;
          // (a little past its ends: the next one's join)
          if (along < -0.1 || along > L + 0.1) continue;
          const off = -px * uz + pz * ux; // (+ to its left: (−uz, ux))
          if (Math.abs(off) < bd) {
            bd = Math.abs(off);
            best = s;
            boff = off;
            bdx = ux;
            bdz = uz;
          }
        }
      }
    if (!best) return null;
    return { s: best, off: boff, dx: bdx, dz: bdz, dot: (dx: number, dz: number) => dx * bdx + dz * bdz };
  }

  private remove(i: number) {
    const s = this.segs[i];
    if (!s) return;
    const list = this.grid.get(s.cell);
    if (list) {
      const at = list.indexOf(i);
      if (at >= 0) list.splice(at, 1);
      if (!list.length) this.grid.delete(s.cell);
    }
    this.segs[i] = null;
    this.free.push(i);
    this.n--;
  }

  private dropShallowest() {
    let lo = 2;
    let at = -1;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (s && s.depth < lo) {
        lo = s.depth;
        at = i;
      }
    }
    if (at >= 0) this.remove(at);
  }
}
