// Footprints in the snow (docs/plan/27-the-grounds.md): whoever walks on the
// open snow or deep in the woods leaves a print a stride, left and right; they
// fill back in over a few minutes. The controller records them (it moves
// everyone), the views draw them: iso as small sprites, 3D as instances.
// Coords: the ground floor's own (tiles), z the ground's height there.

export const PRINT_LIFE_MS = 4 * 60_000;
const STRIDE = 0.42; // tiles between prints
const KEEP = 1600;

export interface Print {
  id: number;
  x: number;
  y: number;
  z: number;
  a: number; // the way they were going (radians, in the floor's x/y)
  t: number; // when (performance.now())
}

export class Footprints {
  readonly list: Print[] = []; // oldest first
  private last = new Map<string, { x: number; y: number; d: number; side: number }>();
  private seq = 0;
  /** Bumped whenever the list changes (views redraw then). */
  version = 0;

  /** `who` is at (x, y) on the snow, feet at z. */
  step(who: string, x: number, y: number, z: number, now: number) {
    const l = this.last.get(who);
    if (!l) {
      this.last.set(who, { x, y, d: 0, side: 1 });
      return;
    }
    const dx = x - l.x;
    const dy = y - l.y;
    const d = Math.hypot(dx, dy);
    l.x = x;
    l.y = y;
    if (d > 2) {
      l.d = 0; // (a teleport, a snap: no trail across)
      return;
    }
    l.d += d;
    if (l.d < STRIDE || d < 1e-4) return;
    l.d = 0;
    l.side = -l.side;
    const a = Math.atan2(dy, dx);
    this.list.push({
      id: ++this.seq,
      x: x - Math.sin(a) * 0.12 * l.side,
      y: y + Math.cos(a) * 0.12 * l.side,
      z,
      a,
      t: now,
    });
    if (this.list.length > KEEP) this.list.shift();
    this.version++;
  }

  /** `who` is off the snow (or gone): the next step there starts afresh. */
  forget(who: string) {
    this.last.delete(who);
  }

  /** Drop the prints the snow has filled. */
  prune(now: number) {
    let n = 0;
    while (n < this.list.length && now - this.list[n].t > PRINT_LIFE_MS) n++;
    if (n) {
      this.list.splice(0, n);
      this.version++;
    }
  }

  clear() {
    this.list.length = 0;
    this.last.clear();
    this.version++;
  }
}

/** How much of a print is left (1 fresh … 0 filled in). */
export function printLeft(p: Print, now: number): number {
  return Math.max(0, 1 - (now - p.t) / PRINT_LIFE_MS);
}
