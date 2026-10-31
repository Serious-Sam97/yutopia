import type { PhysicsWorld } from "@yutopia/shared/physics";
import type { PersonModel } from "@/world/chars";
import type { JointName } from "@/world/chars/rig";
import { Sway } from "./sway";

export { SWAY_CHUNK } from "./sway";

// The sway in the world (docs/plan/61-the-sway.md, phase 3): who swings on Jolt — me and the
// nearest few, within reach — each their own `Sway`, made as they come near and let go as they
// leave (the springs taking over as they hang), and the world stepped while any swings. Its own
// chunk, loaded with the 3D view's physics.

/** how many swing at once (me and six), and how near they come in and stay (m from the camera) */
export const SWAY_MANY = 7;
const IN = 12;
const OUT = 14;

/** One near: their model, how far from the camera (m), and whether they may (seen, motion not
 *  reduced, the whole body). */
export interface Near {
  id: string;
  model: PersonModel;
  d: number;
}

export class SwayHub {
  private readonly ones = new Map<string, Sway>();

  constructor(
    private readonly world: PhysicsWorld,
    private readonly origin: () => { x: number; y: number; z: number },
  ) {}

  /** Once a frame, after everyone's posed and before the world's step: who swings now (`me` always,
   *  if they may), their stand-ins and anchors to their bones, over `dt` s. */
  pre(near: Near[], dt: number, me?: string): void {
    // (the nearest first, me before anyone; one already swinging kept till it's past OUT)
    const by = near
      .filter((n) => n.d < (this.ones.has(n.id) ? OUT : IN))
      .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.d - b.d))
      .slice(0, SWAY_MANY);
    const keep = new Set(by.map((n) => n.id));
    for (const [id, s] of this.ones)
      if (!keep.has(id) || !by.some((n) => n.id === id && n.model === s.model)) {
        s.dispose();
        this.ones.delete(id);
      }
    for (const n of by) {
      let s = this.ones.get(n.id);
      if (!s) {
        s = new Sway(this.world, n.model, this.origin);
        this.ones.set(n.id, s);
      }
      s.pre(dt);
    }
  }

  /** After the world's step: the bags and the hair where Jolt has them. */
  post(): void {
    for (const s of this.ones.values()) s.post();
  }

  /** Anything swinging: the world wants its step. */
  get active(): boolean {
    for (const s of this.ones.values()) if (s.on) return true;
    return false;
  }

  /** The joints of theirs swung here (their springs leave them be). */
  skipOf(id: string): ReadonlySet<JointName> | undefined {
    return this.ones.get(id)?.skip;
  }

  /** Everyone's back to hanging (a teleport of the view, the floor changed). */
  reset(): void {
    for (const s of this.ones.values()) s.reset();
  }

  dispose(): void {
    for (const s of this.ones.values()) s.dispose();
    this.ones.clear();
  }
}
