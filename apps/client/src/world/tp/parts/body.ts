import { elevOf } from "@yutopia/shared";
import type { Place } from "@yutopia/shared/physics";
import { BrowserPhysics } from "../physics3d";
import type { ThirdPersonView } from "../view";

/** What Body reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type BodyHost = Pick<
  ThirdPersonView,
  "allObjects" | "solidObjects" | "building" | "camera" | "gone" | "level" | "scene" | "structure"
>;

export class Body {
  constructor(private readonly c: BodyHost) {}

  // ── the physics world (docs/plan/50-the-volume.md; tp/physics3d.ts): my body moves on it ──
  physics: BrowserPhysics | null = null;

  /** (plan 58 5d) the world's physics for a ragdoll; someone's limp this frame; mine is */
  readonly ragSpace = () => this.physics?.ragdollSpace() ?? null;

  /** (plan 70 phase 9) The physics world and my floor's origin in it (a life-size board's men are
   *  kinematic boxes in it), or null before it's up. */
  physicsSpace() {
    return this.ragSpace();
  }

  limpNow = false;

  meLimp = false;

  /** (plan 61) what's worn swinging on Jolt — me and the nearest few: its own chunk, once the physics is in */
  sway: import("@/world/sway/hub").SwayHub | null = null;

  swayAsked = false;

  /** (plan 58 5d) I'm down on the ragdoll: the walker holds me still till I'm up */
  limpMe(): boolean {
    return this.meLimp;
  }

  meDrift: { dx: number; dz: number } | null = null;

  meUp: number | null = null;

  /** (plan 58 5d) Getting up off the ragdoll: the way my body's turned — the walker faces it, so up
   *  I don't turn back round to the way I'd faced before the fall. */
  limpFacing(): number | null {
    return this.meUp;
  }

  /** (plan 58 5d) How far my ragdoll's hips have gone from where I am (the scene's x, z = my floor's
   *  x, y): the walker follows them, so I get up where I lie and the camera stays on me. */
  limpDrift(): { dx: number; dz: number } | null {
    return this.meDrift;
  }

  /** (plan 58 4f) the ground under a spot on my floor, by Jolt's ray down (null: none, or no physics) */
  readonly groundAt = (x: number, y: number, from: number): number | null => {
    const hit = this.physics?.ray(x, from, y, 0, -1, 0, 1.4) ?? null;
    return hit === null ? null : from - hit;
  };

  physicsAsked = false;
  /** (told when Jolt's world is in: the controller asks its places of it from then) */
  onPhysics: (() => void) | null = null;

  /** Jolt's world in the browser, made once the view's up (until it's in, the grid moves me). */
  startPhysics(): void {
    if (this.physicsAsked) return;
    this.physicsAsked = true;
    void BrowserPhysics.start(this.c.scene, {
      world: () => ({ building: this.c.building, objects: this.c.solidObjects, structure: this.c.structure }),
      // (the scene's x, z the world's — plan 72's one frame — its heights from my floor's)
      at: () => ({ x: this.c.camera.position.x, z: this.c.camera.position.z }),
      frameOf: (level) => ({ elev: elevOf(level) }),
      frame: () => ({ x: 0, y: -elevOf(this.c.level), z: 0 }),
    })
      .then((p) => {
        if (this.c.gone) p.stop();
        else {
          this.physics = p;
          this.onPhysics?.();
        }
      })
      .catch((e) => console.warn("[physics] the browser's world couldn't start:", e));
  }

  /** My body on Jolt's world (the walker's: input/walker.ts) — null till it's in (and I hold still). */
  physicsBody(uid: number | null, level: number, clip: boolean, fly = false) {
    return this.physics?.body(uid, level, clip, fly) ?? null;
  }

  /** Someone's place on a floor (shared physics Place) — null till Jolt's in. */
  placeFor(uid: number | null, level: number): Place | null {
    return this.physics?.place(uid, level) ?? null;
  }

  /** What's under (x, y) from z down on `level` as Jolt has it (a roof, not the land under it); till
   *  the physics is in, `place`'s say (the floor's map). */
  groundUnder(place: Place, level: number, x: number, y: number, z: number): number {
    return this.physics?.groundUnder(level, x, y, z) ?? place.groundAt(x, y, z);
  }

  /** Every solid near you as Jolt holds it, drawn over the scene (the admins'): on, or off. */
  physicsDebug(on: boolean): void {
    this.physics?.showShapes(on);
  }

  /** The physics world, when its shapes are drawn (the admin panel's counts). */
  get physicsShown(): BrowserPhysics | null {
    return this.physics?.shapesShown ? this.physics : null;
  }
}
