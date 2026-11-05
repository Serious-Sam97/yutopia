import { MV_AIM } from "@yutopia/shared/move";
import { Vector3 } from "three";
import type { GunFx } from "../guns3d";
import type { Body3, ThirdPersonView } from "../view";

/** What Guns reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type GunsHost = Pick<ThirdPersonView, "camera" | "hands" | "meId" | "mode" | "people3" | "time">;

export class Guns {
  constructor(private readonly c: GunsHost) {}

  // A gun (docs/plan/32-the-arms.md): what mine is doing (world/dark/arms.ts sets it: my body's and
  // my hands' gun pose it), and a shot's kick on my look — most of it comes back by itself, the
  // rest is mine to pull down.
  myGun: GunFx | null = null;

  kickIn = { up: 0, side: 0 }; // (rad, still to come)

  kickOut = { up: 0, side: 0 }; // (rad, settling back)

  kick(up: number, side: number, settle: number) {
    this.kickIn.up += up;
    this.kickIn.side += side;
    this.kickOut.up += up * settle;
    this.kickOut.side += side * settle;
  }

  // Everyone else's gun (plan 32, phase 4): their shots' kicks (by id, this view's time), and what
  // their hands are doing, eased from what the server says (`arm`: drawing, reloading, open).
  gunKicks = new Map<string, number>();

  gunFxs = new Map<string, GunFx & { turnTo: number }>();

  /** Where someone's gun's muzzle is drawn (the floor's coords, z up) — mine in first person where
   *  my hands show it — or null: no gun drawn (the flash and the tracers come out of it). */
  muzzleOf(id: string): { x: number; y: number; z: number } | null {
    const v = new Vector3();
    // (first person: my body isn't drawn; my hands are, by their own lens — where the world's
    // camera would show that same spot)
    if (id === this.c.meId && this.c.mode === "first") {
      if (!this.c.hands?.muzzleFor(this.c.camera, v)) return null;
    } else if (!this.c.people3.get(id)?.gunMuzzle(v)) return null;
    return { x: v.x, y: v.z, z: v.y };
  }

  /** Someone else fired (`arms:shot`): their gun kicks, their hammer falls. */
  gunShot(id: string) {
    this.gunKicks.set(id, this.c.time);
    const f = this.gunFxs.get(id);
    if (f) f.turnTo += 1;
  }

  otherGun(b: Body3, dt: number): GunFx | null {
    if (!b.gun) {
      this.gunFxs.delete(b.id);
      return null;
    }
    let f = this.gunFxs.get(b.id);
    if (!f) {
      f = { kick: 0, cock: 0, turn: 0, turnTo: 0, open: 0, loaded: 6, trigger: 0, reload: 0 };
      this.gunFxs.set(b.id, f);
    }
    const ease = (v: number, to: number, rate: number) => v + (to - v) * (1 - Math.exp(-dt * rate));
    const since = this.c.time - (this.gunKicks.get(b.id) ?? -9);
    const aiming = ((b.mv ?? 0) & MV_AIM) !== 0;
    const loading = b.arm === 2 || b.arm === 3;
    f.kick = since < 0.035 ? since / 0.035 : Math.exp(-(since - 0.035) * (b.gun === "shotgun" ? 9 : 13));
    f.cock = ease(f.cock, aiming && since > 0.12 ? 1 : 0, 18);
    f.turn = ease(f.turn, f.turnTo, 14);
    f.open = ease(f.open, loading ? 1 : 0, 12);
    f.reload = ease(f.reload, loading && !aiming ? 1 : 0, 8);
    f.trigger = since < 0.08 ? 1 : 0;
    return f;
  }

  /** How far down the sights (0..1), first person. */
  get ads(): number {
    return this.c.hands?.ads ?? 0;
  }
}
