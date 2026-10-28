// A body on Jolt (docs/plan/50-the-volume.md, C): the shared move's body (shared/move) moved by
// Jolt's character, and its questions — where it fits, what's under it, whether a way is clear —
// answered by Jolt's world: for the walker in the 3D view, its vault and mantle probes, and the
// server's check of every move. The body lives on a floor (levels.ts): its x, y the floor's,
// its z up from its floor; Jolt's world is the building's, in one space — `Frame` maps one to the
// other (a storey up, a corner over).
import { BODY_R, type Grid, STEP } from "../grid.ts";
import { JUMP_G } from "../jump.ts";
import { STOREY } from "../levels.ts";
import type { Body, Collider, Mover } from "../move/step.ts";
import { BODY, type Mask, type Pass, type PhysicsWorld } from "./world.ts";

/** Where a floor is in the building: its corner, its height. */
export interface Frame {
  ox: number;
  oy: number;
  elev: number;
}

/** How deep under the feet the ground is looked for: past it, nothing (no walking off the world). */
const DEEP = 3 * STOREY;
/** Walking on the land, the feet are kept to it this far down (downhill: the grid's 0.6); indoors
 *  a step's height (off anything higher, a fall). */
const STICK_LAND = 0.6;

/** Who's asking, and through what: a mask (an admin through walls: `clip`; flying so, `ghost`), the
 *  doors they pass. */
export interface Through {
  mask: Mask;
  pass: Pass | null;
}

/** The six questions of the move, of Jolt's world (the grid still says where the stairs, the land
 *  and their speeds are — what's underfoot, not what's in the way). Where the land isn't built
 *  yet (the server's first seconds, the browser's far chunks), the grid's own answers. */
export class JoltCollider implements Collider {
  constructor(
    private readonly world: PhysicsWorld,
    private readonly grid: Grid,
    private readonly frame: Frame,
    private readonly through: Through = { mask: "all", pass: null },
  ) {}

  /** Jolt can answer here: on the building's floor, or on land that's built. */
  private ready(x: number, y: number): boolean {
    if (!this.grid.onLand(x, y)) return true;
    const X = this.frame.ox + x;
    const Z = this.frame.oy + y;
    return this.world.has(`land:${Math.floor(X / 32)},${Math.floor(Z / 32)}`);
  }

  fitsAt(x: number, y: number, z: number, r = BODY_R): boolean {
    if (!this.ready(x, y)) return this.grid.fitsAt(x, y, z, r);
    const f = this.frame;
    const X = f.ox + x;
    const Z = f.oy + y;
    const Y = f.elev + z;
    // (from a step over the feet: a step is walked onto, not into; the land is never in the way —
    // a slope's uphill side is ground, not a wall: grid.ts — and through walls nothing is)
    if (this.through.mask === "all" && !this.world.fits(X, Y + STEP, Z, r, BODY.h - STEP, "tops", this.through.pass))
      return false;
    // and something under it, near enough (no walking off the world's edge)
    return this.world.groundUnder(X, Y + STEP, Z, r, DEEP, "all") !== null;
  }

  groundAt(x: number, y: number, z: number, r = BODY_R): number {
    if (!this.ready(x, y)) return this.grid.groundAt(x, y, z, r);
    const f = this.frame;
    const X = f.ox + x;
    const Z = f.oy + y;
    const top = f.elev + z + STEP;
    // the land under the middle of you (a slope's uphill side isn't a step to stand on); the top
    // of anything else under any of you
    const land = this.world.rayHit(X, top, Z, 0, -1, 0, DEEP, "land");
    const on = this.world.groundUnder(X, top, Z, r, DEEP, "tops", this.through.pass);
    const g = Math.max(land === null ? Number.NEGATIVE_INFINITY : top - land, on ?? Number.NEGATIVE_INFINITY);
    return g === Number.NEGATIVE_INFINITY ? -2 * STOREY : g - f.elev;
  }

  clear(a: { x: number; y: number }, b: { x: number; y: number }, r = BODY_R, z = 0): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.1));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.fitsAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z, r)) return false;
    }
    return true;
  }

  onRamp(x: number, y: number): boolean {
    return this.grid.onRamp(x, y);
  }
  onLand(x: number, y: number): boolean {
    return this.grid.onLand(x, y);
  }
  speedAt(x: number, y: number): number {
    return this.grid.speedAt(x, y);
  }
}

/** The body moved by Jolt's character (CharacterVirtual): it slides along what's in the way,
 *  walks up a step, keeps to the floor going down and stops on slopes past 45°; the move's own
 *  sim (shared/move) still says where it means to go, its jumps and verbs. Moved from outside (a
 *  verb's path, a snap, a teleport, the stairs into the next floor's frame) it's put there. */
export class CharacterMover implements Mover {
  private id: number | null = null;
  private readonly at: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN];
  private readonly p: [number, number, number] = [0, 0, 0];

  constructor(
    private readonly world: PhysicsWorld,
    /** the body's floor now (it changes on the stairs) */
    private readonly frame: () => Frame,
    private readonly through: () => Through = () => ({ mask: "all", pass: null }),
    /** out on the land (the grid's onLand, the body's floor's coords) */
    private readonly onLand: (x: number, y: number) => boolean = () => false,
  ) {}

  step(b: Body, dt: number, stepUp: number, blocked?: (x: number, y: number) => boolean, fly = false): boolean {
    const f = this.frame();
    const X = f.ox + b.x;
    const Y = f.elev + b.z;
    const Z = f.oy + b.y;
    if (this.id === null) this.id = this.world.addCharacter(X, Y, Z);
    const id = this.id;
    if (id === null) return false;
    // (put somewhere since: there)
    if (Math.abs(X - this.at[0]) > 1e-5 || Math.abs(Y - this.at[1]) > 1e-5 || Math.abs(Z - this.at[2]) > 1e-5)
      this.world.placeCharacter(id, X, Y, Z);
    // up and down: a jump's or a fall's (gravity), a flier's own; on the ground none (kept to it)
    if (b.up && !fly) b.vz -= JUMP_G * dt;
    const vz = b.up || fly ? b.vz : 0;
    const t = this.through();
    const grounded = this.world.moveCharacter(id, b.vx, vz, b.vy, dt, !b.up && !fly, {
      stepUp,
      stickDown: this.onLand(b.x, b.y) ? STICK_LAND : stepUp + 0.01,
      mask: t.mask,
      pass: t.pass,
    });
    const p = this.p;
    this.world.characterAt(id, p);
    let nx = p[0] - f.ox;
    let ny = p[2] - f.oy;
    // (a car on the move, the grid's: in the way like a wall — one that came onto me, walked out of)
    if (blocked?.(nx, ny) && !blocked(b.x, b.y)) {
      nx = b.x;
      ny = b.y;
      this.world.placeCharacter(id, X, p[1], Z);
      p[0] = X;
      p[2] = Z;
    }
    // a blocked way's speed gone (along a wall, what's left of it)
    const dx = nx - b.x;
    const dy = ny - b.y;
    const want = (v: number, d: number) =>
      Math.abs(v * dt) > 1e-6 && Math.abs(d) < Math.abs(v * dt) - 1e-4 ? d / dt : v;
    b.vx = Math.sign(dx) === Math.sign(b.vx) || dx === 0 ? want(b.vx, dx) : 0;
    b.vy = Math.sign(dy) === Math.sign(b.vy) || dy === 0 ? want(b.vy, dy) : 0;
    const rose = p[1] - Y;
    b.x = nx;
    b.y = ny;
    b.z = p[1] - f.elev;
    this.at[0] = p[0];
    this.at[1] = p[1];
    this.at[2] = p[2];
    // the head on a ceiling: no higher
    if (b.vz > 0 && rose < b.vz * dt * 0.5) b.vz = 0;
    if (fly) {
      b.up = !grounded;
      return false;
    }
    if (b.up) {
      if (grounded && b.vz <= 0) {
        b.up = false;
        b.vz = 0;
        return true;
      }
      return false;
    }
    // off an edge (further down than the floor's kept to): falling
    if (!grounded) {
      b.up = true;
      b.vz = 0;
    }
    return false;
  }

  /** Its Jolt character gone (the 3D view closed, the world made again). */
  dispose(): void {
    if (this.id !== null) this.world.removeCharacter(this.id);
    this.id = null;
    this.at[0] = Number.NaN;
  }
}
