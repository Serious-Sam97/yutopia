import { LAMPS as GROUND_LAMPS, KART_LAND, standLights } from "@yutopia/shared/grounds";
import { Vector3 } from "three";
import { daylight } from "../../art/daylight";
import type { LightSource } from "../../art/light";
import type { ThirdPersonView } from "../view";
import { GROUND_POOL } from "./common";

/** What Sun reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type SunHost = Pick<
  ThirdPersonView,
  | "around"
  | "building"
  | "camera"
  | "dark"
  | "deaths"
  | "flares"
  | "groundPool"
  | "hour"
  | "lamps"
  | "level"
  | "light"
  | "pool"
  | "quality"
  | "sun"
  | "target"
  | "time"
  | "world"
  | "yaw"
>;

export class Sun {
  constructor(private readonly c: SunHost) {}

  sunX = new Vector3();

  sunY = new Vector3();

  sunZ = new Vector3();

  sunAt = new Vector3();

  placeSun() {
    const el = this.c.sun.userData.el as number;
    const az = this.c.sun.userData.az as number;
    const t = this.c.target;
    // azimuth: east → south → west over the day; +y is "south" on the map
    const dx = -Math.cos(az) * Math.cos(el);
    const dz = Math.sin(az) * Math.cos(el);
    const dy = Math.sin(el);
    // the shadows cover what's in view: a box round you, reaching further ahead
    // the further back the camera stands (a far free camera saw them stop
    // short); its size in steps, so its texels stay put between them
    const sc = this.c.sun.shadow.camera;
    const cam = this.c.camera.position;
    const back = Math.hypot(cam.x - t.x, cam.z - t.z);
    const R = 14 + 2 * Math.round(Math.max(0, back - 6) * 0.75);
    if (sc.right !== R) {
      Object.assign(sc, { left: -R, right: R, top: R, bottom: -R, far: 2 * R + 50 });
      sc.updateProjectionMatrix();
    }
    const ahead = (R - 14) * 0.6 + 2;
    const fx = t.x + Math.cos(this.c.yaw) * ahead;
    const fz = t.z + Math.sin(this.c.yaw) * ahead;
    // the shadow map moves with you a whole texel at a time (snapped in the
    // light's view): sliding with you, every shadow's edge crawled and shimmered
    const texel = (sc.right - sc.left) / this.c.sun.shadow.mapSize.x;
    const z = this.sunZ.set(dx, dy, dz).normalize();
    const x = this.sunX.set(z.z, 0, -z.x).normalize(); // up × z
    const y = this.sunY.crossVectors(z, x);
    const p = this.sunAt.set(fx, 0, fz);
    const u = p.dot(x);
    const v = p.dot(y);
    p.addScaledVector(x, Math.round(u / texel) * texel - u).addScaledVector(y, Math.round(v / texel) * texel - v);
    const far = R + 20;
    this.c.sun.position.set(p.x + dx * far, p.y + dy * far, p.z + dz * far);
    this.c.sun.target.position.copy(p);
  }

  // The point lights go to the lamps nearest the camera's target that light
  // where it is (a lamp in the next room shone through the wall onto this one's
  // things); each fades in and out with its distance, with the last one in
  // reach when there are more lamps than lights, and as a wall or a door comes
  // between — every frame: a lamp switching on or off as you walked by was a
  // flash on the floor round it.
  lampSeen = new Map<string, number>(); // how much each lamp lights where you are (eased)

  assignLamps(dt: number) {
    const d = daylight(this.c.hour);
    const t = this.c.target;
    const ease = 1 - Math.exp(-dt * 6);
    const seen = new Map<string, number>();
    const all: { l: LightSource; d: number; w: number }[] = [];
    for (const l of this.c.world.lights) {
      const dist = Math.hypot(l.x - t.x, l.y - t.z);
      if (dist >= LAMP_REACH) continue;
      const key = `${l.x},${l.y}`;
      const want = this.c.light.reaches(l, t.x, t.z) ? 1 : 0;
      const was = this.lampSeen.get(key) ?? want;
      const w = Math.abs(want - was) < 0.01 ? want : was + (want - was) * ease;
      seen.set(key, w);
      if (w > 0.001) all.push({ l, d: dist, w });
    }
    this.lampSeen = seen;
    all.sort((a, b) => a.d - b.d);
    const near = all.slice(0, this.c.lamps);
    const edge = Math.min(LAMP_REACH, all[this.c.lamps]?.d ?? LAMP_REACH);
    // (the light map has their pools; this lights what stands up — in the pitch dark, all of it: a
    // lamp post's people and cars as lit as its pool, docs/plan/44-the-night.md)
    const k = (0.15 + 1.1 * d.night) * (1 + 7 * d.dark);
    this.c.pool.forEach((p, i) => {
      const n = near[i];
      const fade = n ? Math.min(1, Math.max(0, (edge - n.d) / LAMP_FADE)) : 0;
      if (!n || fade <= 0) {
        p.intensity = 0;
        return;
      }
      p.color.setHex(n.l.color);
      p.position.set(n.l.x, n.l.h ?? 1.05, n.l.y);
      p.distance = n.l.radius * 1.4;
      p.intensity = n.l.intensity * k * fade * fade * (3 - 2 * fade) * n.w;
    });
    this.groundLamps(d.night);
  }

  // the Grounds' lamps after dark (the ground floor's frame): a pool of their
  // own (in the lot's they took its lamps' places and, as bright as they are,
  // their fade at the pool's edge was a pop), the nearest lit, fading over 10 tiles
  groundLamps(night: number) {
    const g = this.c.around.grounds;
    const on = Math.min(1, Math.max(0, night * 1.3 - 0.1));
    const n = this.c.quality === "high" ? GROUND_POOL : this.c.quality === "medium" ? 2 : 1;
    const near: {
      x: number;
      y: number;
      h: number;
      c: (typeof GROUND_LAMP)[string];
      d: number;
      flare?: boolean;
      color?: number;
    }[] = [];
    // a death first of all (short, and the brightest thing there; the ground floor's)
    for (const f of this.c.level === 0 ? this.c.deaths : []) {
      const d = Math.hypot(f.x - this.c.target.x, f.y - this.c.target.z);
      const smooth = (a: number, b: number) => {
        const k = Math.max(0, Math.min(1, (f.t - a) / (b - a)));
        return k * k * (3 - 2 * k);
      };
      const k = Math.max(Math.exp(-f.t * 9), 0.35 * smooth(0.45, 1.05) * (1 - smooth(1.15, 1.9)));
      if (d < GROUND_REACH && k > 0.01)
        near.push({
          x: f.x,
          y: f.y,
          h: f.z + DEATH_LAMP.h,
          c: { ...DEATH_LAMP, intensity: DEATH_LAMP.intensity * k },
          d: -2,
          flare: true,
          color: f.t < 0.2 ? 0xfff4e6 : 0xffd08a,
        });
    }
    // flares first, day or night: red, ~6 over 11 tiles (the mocks' 02-hud-night), flickering
    // (my floor's: dark/arms.ts hands over only those)
    for (const f of this.c.flares) {
      const d = Math.hypot(f.x - this.c.target.x, f.y - this.c.target.z);
      if (d < GROUND_REACH)
        near.push({
          x: f.x + 0.1,
          y: f.y,
          h: f.z + 0.5,
          c: { ...FLARE_LAMP, intensity: FLARE_LAMP.intensity * (0.85 + 0.15 * Math.sin(this.c.time * 23 + f.t * 7)) },
          d: -1,
          flare: true,
        });
    }
    if (g && this.c.level === 0 && on > 0) {
      const t = this.c.target;
      for (const l of GROUND_LAMPS) {
        const x = l.x;
        const y = l.z;
        const d = Math.hypot(x - t.x, y - t.z);
        if (d < GROUND_REACH)
          near.push({ x, y, h: g.heightAt(l.x, l.z) + GROUND_LAMP[l.kind].h, c: GROUND_LAMP[l.kind], d });
      }
      // (the Kart Park's stands: lamps under their roofs, floods over the straight — not posts)
      for (const l of STAND_LIGHTS) {
        const x = l.x;
        const y = l.z;
        const d = Math.hypot(x - t.x, y - t.z);
        if (d < GROUND_REACH) near.push({ x, y, h: g.heightAt(l.x, l.z) + l.h, c: l, d, color: 0xffe6bc });
      }
      near.sort((a, b) => a.d - b.d);
    }
    const edge = Math.min(GROUND_REACH, near[n]?.d ?? GROUND_REACH);
    this.c.groundPool.forEach((p, i) => {
      const l = i < n ? near[i] : undefined;
      const fade = l ? Math.min(1, Math.max(0, (edge - l.d) / 10)) : 0;
      if (!l || fade <= 0) {
        p.intensity = 0;
        return;
      }
      p.position.set(l.x, l.h, l.y);
      // (a little wider in the pitch dark: an island of snow — docs/plan/44-the-night.md N2)
      p.distance = l.c.radius * (1.4 + 0.35 * this.c.dark);
      p.color.setHex(l.color ?? (l.flare ? 0xff3a24 : 0xffd29a));
      p.intensity = l.flare ? l.c.intensity : l.c.intensity * on * fade * fade * (3 - 2 * fade);
    });
  }
}

const LAMP_REACH = 16; // tiles from the camera's target a lamp gets one within

// the Grounds' lamps after dark (docs/plan/27, the night): how high the head
// hangs (tiles over the ground), how far and how hard it lights; the pool's
// lights reach further out there (the road ahead lit, lamp to lamp)
const GROUND_LAMP: Record<string, { h: number; radius: number; intensity: number }> = {
  cobra: { h: 8.4, radius: 15, intensity: 26 },
  town: { h: 4.4, radius: 10, intensity: 11 },
  lone: { h: 4.4, radius: 10, intensity: 11 },
  porch: { h: 2.2, radius: 6, intensity: 4 },
  flood: { h: 12.8, radius: 30, intensity: 70 },
};

const STAND_LIGHTS = KART_LAND ? standLights() : [];

// a flare burning on the snow (docs/plan/30-the-dark.md D6), lighting like a ground lamp, red
const FLARE_LAMP = { h: 0.5, radius: 8, intensity: 6 };

// one of the shadowed shot down: the shot's flash through it, then the light it burns away in
const DEATH_LAMP = { h: 1.1, radius: 9, intensity: 8 };

const GROUND_REACH = 44;

const LAMP_FADE = 4; // …fading out over the last few
