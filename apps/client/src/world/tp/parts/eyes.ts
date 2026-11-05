import { Color, type SpotLight, Vector3 } from "three";
import { EYES_LIFT } from "../../art/daylight";
import { nearLift, unseen } from "../../eyes";
import { inkLeft, mf } from "../fog3d";
import { litBalance } from "../light3d";
import type { Body3, ThirdPersonView } from "../view";

/** What Eyes reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type EyesHost = Pick<ThirdPersonView, "around" | "camera" | "dark" | "fogNow" | "light" | "mood" | "personTint">;

export class Eyes {
  constructor(private readonly c: EyesHost) {}

  // ── the eyes (docs/plan/44-the-night.md N3; world/eyes.ts, run by the dark's chunk) ──
  glareTint = new Color();

  ownTint = new Color();

  // The light on someone (the people's tint): the floor's light map; out on the land the land's own
  // (its lamps, the beams); headlamps; and in the dark what's seen right round me (myself too).
  // Out under the sky after dark, whoever's out of all of it and further off is unseen: no name,
  // no emote (docs/plan/44-the-night.md N4).
  lightOn(b: Body3, me: Body3 | undefined): Color {
    const c = this.c.personTint.setHex(this.c.light.tintAt(b.x, b.y));
    if (this.c.mood.onLand(b.x, b.y)) this.c.mood.landTint(b.x, b.y, c);
    if (this.c.mood.underSky(b.x, b.y)) {
      this.headlampTint(b.x, b.y, c);
      const d = me ? Math.hypot(b.x - me.x, b.y - me.y) : 0;
      const k = nearLift(d, this.c.dark);
      c.setRGB(Math.min(1, c.r + k), Math.min(1, c.g + k), Math.min(1, c.b + k * 1.1));
      if (unseen(c.r * 0.3 + c.g * 0.55 + c.b * 0.15, d, this.c.dark)) this.unseen.add(b.id);
    }
    return c;
  }

  unseen = new Set<string>(); // out in the dark, unseen this frame (N4: no name, no emote)

  // How much of someone the morning fog leaves, 0 … 1 (docs/plan/64-the-fog.md F5): by how far
  // they are from the camera, as the ink's lines go (fog3d.ts inkLeft) — all of them in here with
  // me (the room's out of it)
  fogSeen(b: Body3): number {
    const n = this.c.fogNow;
    if (n.haze <= 0 && n.wall <= 0) return 1;
    if (mf.mfBox.value > 0.5 && !this.c.mood.underSky(b.x, b.y)) return 1;
    const c = this.c.camera.position;
    const d = Math.hypot(c.x - b.x, c.y - ((b.z ?? 0) + 1.4), c.z - b.y);
    return inkLeft(d, n.haze, n.wall, mf.mfV.value);
  }

  /** Out in the dark and unseen this frame (no name, no emote; the dark's HUD hides its tag too). */
  isUnseen(id: string): boolean {
    return this.unseen.has(id);
  }

  /** How bright it is where `id` stands at (x, y), 0 … 1 (the people's tint's luminance): the
   *  rooms, a lamp's pool, headlamps or someone's torch on them — not their own torch. */
  glareAt(x: number, y: number, id: string): number {
    if (!this.c.mood.underSky(x, y)) return 1;
    const c = this.glareTint.setHex(this.c.light.tintAt(x, y));
    if (this.c.mood.onLand(x, y)) this.c.mood.landTint(x, y, c, id);
    this.headlampTint(x, y, c);
    return c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  }

  /** How adjusted my eyes are to the dark (0 … 1): the land, the campus, the cars and the lot
   *  lift a little. */
  setEyes(e: number) {
    this.c.around.setEyes(e);
    litBalance.lmEyes.value = EYES_LIFT.lot3 * e * this.c.dark;
  }

  /** The real headlamps (car/cars.ts gives them: the nearest lit car's), for the tint of
   *  whoever stands in them (docs/plan/44-the-night.md N2). */
  carBeams: SpotLight[] = [];

  beamDir = new Vector3();

  beamAt = new Vector3();

  // the light on someone out under the sky from those headlamps: a cone from each, fading ahead
  headlampTint(x: number, y: number, out: Color) {
    for (const s of this.carBeams) {
      if (s.intensity <= 0) continue;
      // (in the scene: they hang off the car module's own group)
      const at = s.getWorldPosition(this.beamAt);
      const d = s.target.getWorldPosition(this.beamDir).sub(at).setY(0).normalize();
      const px = x - at.x;
      const py = y - at.z;
      const along = px * d.x + py * d.z;
      const reach = s.distance * 0.6;
      if (along <= 0 || along >= reach) continue;
      const side = Math.abs(px * d.z - py * d.x);
      const half = 0.6 + along * Math.tan(s.angle);
      if (side >= half) continue;
      const k = (1 - along / reach) ** 2 * (1 - (side / half) ** 2) * (s.intensity / 120) * 0.6;
      out.r = Math.min(1, out.r + k);
      out.g = Math.min(1, out.g + k * 0.95);
      out.b = Math.min(1, out.b + k * 0.86);
    }
  }
}
