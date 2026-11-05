// A body on Jolt (docs/plan/50-the-volume.md, C): the shared move's body (shared/move) moved by
// Jolt's character. Its questions — where it fits, what's under it, whether a way is clear — are a
// floor's Place's (physics/place.ts). The body lives on a floor (levels.ts): its z up from its
// floor; Jolt's world is the building's, in one space — `Frame` maps one to the other (a storey
// up; a corner over, on an older map's floors).
import { JUMP_G } from "../jump.ts";
import type { Body, Mover } from "../move/step.ts";
import type { Mask, Pass, PhysicsWorld } from "./world.ts";

/** A floor in the building: its height (every floor's x, y the world's — plan 72's one frame). */
export interface Frame {
  elev: number;
}

/** Walking on the land, the feet are kept to it this far down (downhill: the grid's 0.6); indoors
 *  a step's height (off anything higher, a fall). */
const STICK_LAND = 0.6;

/** Who's asking, and through what: a mask (an admin through walls: `clip`; flying so, `ghost`), the
 *  doors they pass. */
export interface Through {
  mask: Mask;
  pass: Pass | null;
}

/** The body moved by Jolt's character (CharacterVirtual): it slides along what's in the way,
 *  walks up a step, keeps to the floor going down and stops on slopes past 45°; the move's own
 *  sim (shared/move) still says where it means to go, its jumps and verbs. Moved from outside (a
 *  verb's path, a snap, a teleport, the stairs into the next floor's frame) it's put there. */
export class CharacterMover implements Mover {
  /** along the ground on slopes (PhysicsWorld.moveCharacter's `along`): /dev/move's for now */
  along = false;
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

  /** The land under (x, y) is in the world (or it isn't land: the building's floors are). */
  ready(x: number, y: number): boolean {
    if (!this.onLand(x, y)) return true;
    return this.world.has(`land:${Math.floor(x / 32)},${Math.floor(y / 32)}`);
  }

  step(b: Body, dt: number, stepUp: number, blocked?: (x: number, y: number) => boolean, fly = false): boolean {
    const f = this.frame();
    const X = b.x;
    const Y = f.elev + b.z;
    const Z = b.y;
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
      along: this.along,
    });
    const p = this.p;
    this.world.characterAt(id, p);
    let nx = p[0];
    let ny = p[2];
    // (a car on the move, the grid's: in the way like a wall — one that came onto me, walked out of)
    if (blocked?.(nx, ny) && !blocked(b.x, b.y)) {
      nx = b.x;
      ny = b.y;
      this.world.placeCharacter(id, X, p[1], Z);
      p[0] = X;
      p[2] = Z;
    }
    // a blocked way's speed gone (along a wall, what's left of it) — not a step's: walking up one the
    // body goes less far across while Jolt lifts it, and taking that as a wall cut a jog to 1.3 m/s
    // at a 10 cm kerb (it stalled at every step)
    const rose = p[1] - Y;
    const climbed = this.along && !b.up && !fly && rose > 0.002;
    const dx = nx - b.x;
    const dy = ny - b.y;
    const want = (v: number, d: number) =>
      Math.abs(v * dt) > 1e-6 && Math.abs(d) < Math.abs(v * dt) - 1e-4 ? d / dt : v;
    if (!climbed) {
      b.vx = Math.sign(dx) === Math.sign(b.vx) || dx === 0 ? want(b.vx, dx) : 0;
      b.vy = Math.sign(dy) === Math.sign(b.vy) || dy === 0 ? want(b.vy, dy) : 0;
    }
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
