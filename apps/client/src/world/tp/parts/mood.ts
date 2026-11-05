import { isFloor, rimeAt, STOREY, spDay, tileAt } from "@yutopia/shared";
import { beamAt } from "@yutopia/shared/beam";
import { waterAt } from "@yutopia/shared/grounds";
import { LONG_ROAD } from "@yutopia/shared/longroad";
import { type Color, type Fog, MeshLambertMaterial, Vector3 } from "three";
import { Bubbles } from "../bubbles3d";
import { GROUND } from "../campus";
import { FogBanks } from "../fog-banks";
import { farFor, flatLight, fogColour, hazeDensity, LIFT_TOP, mf, roomBounds } from "../fog3d";
import { landLight, litBalance, patchGrounds } from "../light3d";
import { Person3D } from "../person3d";
import { fogFor } from "../sky";
import type { Body3, ThirdPersonView } from "../view";
import { wx, wxNow } from "../wx3d";

/** What Mood reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type MoodHost = Pick<
  ThirdPersonView,
  | "around"
  | "banks"
  | "camera"
  | "fillOut"
  | "fogNow"
  | "fogWant"
  | "gcMix"
  | "god"
  | "groundPool"
  | "hour"
  | "lampFog"
  | "level"
  | "map"
  | "nightLevel"
  | "pool"
  | "post"
  | "quality"
  | "rime"
  | "room"
  | "roomAt"
  | "roomMap"
  | "scene"
  | "snowing"
  | "storm"
  | "stormFog"
  | "sun"
  | "sunIntensity"
  | "target"
  | "time"
  | "torch3"
  | "wind"
>;

export class Mood {
  constructor(private readonly c: MoodHost) {}

  // ── the Grounds' mood (docs/plan/27) ──
  // a storm: the fog closes in, white (as dark as the hour)
  weatherFrame(dt: number, me?: Body3) {
    const f = fogFor();
    const s = this.c.storm;
    const fog = this.c.scene.fog as Fog;
    // (god mode's camera, high over the land: the fog that far further off, and so the lens)
    const up = this.c.god ? this.c.god.dist * this.c.gcMix : 0;
    // (the weather's air: further on a clear day, closer in the rain — docs/plan/65, W3)
    const near = f.near + (210 - f.near) * wxNow.clear + (40 - f.near) * wxNow.rain;
    // (the long road: the air sees the far land — 2.6 km on a grey day, 14 km on a clear one, the
    // rain's 600 m; a storm and the morning's wall as ever — docs/plan/69, L6)
    const [usual, clearFar, rainFar] = LONG_ROAD ? [2600, 14000, 600] : [f.far, 1150, 420];
    const fogFar = usual + (clearFar - usual) * wxNow.clear + (rainFar - usual) * wxNow.rain;
    fog.near = near + up + (4 - near) * s;
    fog.far = fogFar + up * 1.6 + (55 - fogFar) * s;
    // (the far ridges: the haze the air has at 700 m, a clear day's kept off them as it was)
    const at = Math.min(1, Math.max(0, (700 - fog.near) / Math.max(1, fog.far - fog.near)));
    wx.wxHaze.value = 0.92 * at * (1 - wxNow.clear);
    const mist = this.morningFog(dt, me, up);
    // (in the wall nothing past its reach is seen: the camera sees no further, the sky brought in)
    const far = farFor(mist.wall, Math.max(f.cameraFar, up * 2.5), mf.mfV.value);
    if (Math.abs(this.c.camera.far - far) > 1) {
      this.c.camera.far = far;
      this.c.camera.updateProjectionMatrix();
      this.c.around.setReach(far);
    }
    const l = landLight.value;
    this.c.stormFog.setRGB(
      Math.min(1, l.r * 1.15) * 0.84,
      Math.min(1, l.g * 1.15) * 0.88,
      Math.min(1, l.b * 1.15) * 0.92,
    );
    fog.color.copy(this.c.around.horizon).lerp(this.c.stormFog, Math.min(1, s * 1.4));
    // the far land: its projection, the scene's haze; gone in the wall and a storm — but for god mode's
    // camera, over them both (its fog pushed out with it: the land it sees was an island in white)
    const seen = this.c.god ? 1 : (1 - Math.min(1, s * 2)) * (mist.wall < 0.02 ? 1 : 0);
    this.c.around.grounds?.far?.frame(this.c.camera, fog, seen);
  }

  // The morning fog (docs/plan/64-the-fog.md, F2): fog3d.ts's uniforms by the fog, the hour and
  // where I am; the sky, the ink and the light with it
  morningFog(dt: number, me: Body3 | undefined, up: number): { haze: number; wall: number; lift: number } {
    const n = this.c.fogNow;
    const k = 1 - Math.exp(-dt * 2);
    n.haze += (this.c.fogWant.haze - n.haze) * k;
    n.wall += (this.c.fogWant.wall - n.wall) * k;
    n.lift += (this.c.fogWant.lift - n.lift) * k;
    if (n.haze < 1e-3) n.haze = 0;
    if (n.wall < 1e-3) n.wall = 0;
    const { haze, wall } = n;
    mf.mfA.value = hazeDensity(haze);
    mf.mfW.value = wall;
    // (burning off: clear under a floor that rises)
    mf.mfLift.value = n.lift > 1e-3 ? LIFT_TOP * n.lift : -1000;
    // (from god mode's height the wall's further off, as the storm's is)
    mf.mfV.value = 18 + up;
    // its floor: the land's height 0 where the land is drawn (the campus moves with the floor shown)
    mf.mfY0.value = this.c.around.campus.root.position.y + GROUND;
    mf.mfT.value = this.c.time;
    mf.mfWind.value[0] = Math.cos(this.c.wind) * 0.004;
    mf.mfWind.value[1] = Math.sin(this.c.wind) * 0.004;
    fogColour(mf.mfCol.value, landLight.value, this.c.hour, wall);
    // towards the sun, gold while it's low (the wall's hardly)
    const el = this.c.sun.userData.el as number;
    const az = this.c.sun.userData.az as number;
    mf.mfSun.value.set(-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    const l = landLight.value;
    const lum = Math.max(l.r, l.g, l.b) * 1.2;
    const sc = this.c.sun.color;
    mf.mfSunCol.value.setRGB(Math.min(1, sc.r * lum), Math.min(1, sc.g * lum * 0.92), Math.min(1, sc.b * lum * 0.8));
    mf.mfSunK.value = (el > -0.12 ? Math.max(0, 1 - el / 0.7) * 0.5 : 0) * (1 - 0.85 * wall);
    // (the water's glint: plan 66 S7 — the sun up and out, none in the wall)
    const sv = mf.mfSun.value;
    wx.wxSun.value.set(
      sv.x,
      sv.y,
      sv.z,
      el > 0 ? Math.min(1, el / 0.15) * (1 - wall) * Math.min(1, this.c.sun.intensity * 2.5) : 0,
    );
    // none of it inside the room I'm in (a storm's neither)
    this.roomBox(me);
    // the rime on the trees: the day's (built through a foggy morning, there till noon), or what a
    // called one's left — eased over minutes
    const rimeWant = Math.max(rimeAt(spDay(Date.now()), this.c.hour), 0.9 * Math.max(haze, wall));
    this.c.rime += (rimeWant - this.c.rime) * (1 - Math.exp(-dt / (rimeWant > this.c.rime ? 240 : 600)));
    if (this.c.around.grounds) this.c.around.grounds.rime.value = this.c.rime;
    // the lamps' glows grown to halos in it
    if (this.c.around.grounds) this.c.around.grounds.halo = 1 + 1.4 * haze + 0.6 * wall;
    this.c.around.campus.lampFog = this.c.lampFog;
    // the banks over the low places (High only; made the first time they're wanted)
    const grounds = this.c.around.grounds;
    const banks = this.c.quality === "high" && grounds ? haze * (1 - wall) * (1 - n.lift) : 0;
    if (banks > 0.01 && !this.c.banks && grounds) this.c.banks = new FogBanks(grounds.root);
    if (this.c.banks) {
      const o = this.c.around.campus.root.position;
      const c = this.c.camera.position;
      this.c.banks.update(banks, mf.mfCol.value, this.c.wind, { x: c.x - o.x, z: c.z - o.z }, this.c.time);
    }
    // the sky whited out by it, the ink's lines going with what they outline, the light flat in the wall
    this.c.around.setFog(
      haze > 0 || wall > 0 ? Math.min(1, Math.max(haze * 1.1, wall * 2.5)) : 0,
      wall,
      mf.mfCol.value,
    );
    // (the ink: the haze where the camera is — none under its lifted floor — and none of it at all
    // in the room I'm in, its lines as they were)
    const inside = mf.mfBox.value > 0.5;
    const camY = this.c.camera.position.y;
    const lifted = camY < mf.mfY0.value + mf.mfLift.value;
    // (the ink takes the haze at eye height as 0.71 of its floor's: ink3d.ts, fog3d.ts inkLeft)
    const atCam = hazeDensity(haze) * Math.exp(-Math.max(0, camY - mf.mfY0.value) / mf.mfH.value);
    this.c.post?.setFog(inside || lifted ? 0 : atCam / 0.71, inside ? 0 : wall, mf.mfV.value);
    // (the sun itself dimmed: every surface's shadows go, the ice's too; the open sky's fill up — and
    // in the rain about half as much: no crisp sun shadows in a downpour. docs/plan/65)
    const flat = flatLight(Math.max(wall, 0.55 * wxNow.rain));
    this.c.sun.intensity = this.c.sunIntensity * flat.sun;
    litBalance.lmFillOut.value = this.c.fillOut * flat.fill;
    mf.mfFlat.value = 1 - flat.sun;
    return n;
  }

  // the room I'm in: the floor's indoor tiles round me (the lot's asphalt and concrete are out), or
  // a Grounds building's box out on the land; none on the open sky
  roomBox(me: Body3 | undefined) {
    const box = mf.mfBox;
    if (!me) {
      box.value = 0;
      return;
    }
    const tx = Math.floor(me.x);
    const ty = Math.floor(me.y);
    const z = me.z ?? 0;
    if (this.onLand(me.x, me.y)) {
      this.c.roomAt = "";
      const g = this.c.around.grounds;
      const o = this.c.around.campus.root.position;
      const lx = me.x - o.x;
      const lz = me.y - o.z;
      const b = g?.boxes.find((q) => lx >= q.x0 && lx <= q.x1 && lz >= q.z0 && lz <= q.z1);
      if (!b || z > o.y + GROUND + b.top) {
        box.value = 0;
        return;
      }
      box.value = 1;
      mf.mfBoxMin.value.set(b.x0 + o.x, z - 0.5, b.z0 + o.z);
      mf.mfBoxMax.value.set(b.x1 + o.x, o.y + GROUND + b.top, b.z1 + o.z);
      return;
    }
    const key = `${this.c.level}|${tx}|${ty}`;
    if (key !== this.c.roomAt || this.c.roomMap !== this.c.map) {
      this.c.roomAt = key;
      this.c.roomMap = this.c.map;
      const ground = this.c.level === 0;
      this.c.room = roomBounds(
        this.c.map.tiles,
        tx,
        ty,
        (ch) => !ch || ch === " " || (ground && (ch === "a" || ch === "c")),
      );
    }
    const r = this.c.room;
    box.value = r ? 1 : 0;
    if (!r) return;
    // (a little past its walls: a camera against one, a hair outside them, is still in here)
    mf.mfBoxMin.value.set(r.x0 - 0.35, z - 0.5, r.y0 - 0.35);
    mf.mfBoxMax.value.set(r.x1 + 0.35, z + STOREY, r.y1 + 0.35);
  }

  /** How high the camera — the ear — is over the land under it (m): the weather's ground sounds fade
   *  as it goes up (docs/plan/65, W8). 0 with no land about. */
  earUp(): number {
    const g = this.c.around.grounds;
    if (!g) return 0;
    const c = this.c.camera.position;
    const o = wx.wxOff.value;
    return Math.max(0, c.y - (g.topAt(c.x - o.x, c.z - o.z) + o.y));
  }

  // Wet from the rain (docs/plan/65, W7): soaked over three minutes or so out in it (faster in a
  // downpour), dried in four under cover or indoors, slower out in the open once it's stopped. Each
  // viewer keeps its own count.
  wetOn = new Map<string, number>();

  // Under the water (docs/plan/66-the-water.md, S8): the camera never half in it (kept 12 cm off its
  // surface, on the side the target's on); under it, the murk and the light on its bed (fog3d.ts), its
  // colour by the light out there — the sun's on its bed fading with depth
  underWater() {
    const U = mf.mfUw.value;
    U.z = 0;
    if (this.c.level !== 0 || this.c.god) return;
    const cam = this.c.camera.position;
    const o = wx.wxOff.value;
    const w = waterAt(cam.x - o.x, cam.z - o.z);
    if (!w) return;
    const lv = w.level + o.y;
    if (Math.abs(cam.y - lv) < 0.12) {
      cam.y = this.c.target.y >= lv ? lv + 0.12 : lv - 0.12;
      this.c.camera.updateMatrixWorld();
    }
    if (cam.y >= lv) return;
    const f = this.c.scene.fog?.color ?? mf.mfCol.value;
    const lum = f.r * 0.3 + f.g * 0.55 + f.b * 0.15;
    mf.mfUwCol.value.setRGB(0.012, 0.05, 0.048).multiplyScalar(Math.min(1.6, 0.1 + lum * 2.2));
    wx.wxUwCol.value.copy(mf.mfUwCol.value);
    U.set(
      lv,
      w.kind === "river" ? 0.2 : 0.14,
      1,
      Math.min(1, wx.wxSun.value.w * 1.2) * Math.max(0, 1 - (lv - cam.y) / 8),
    );
  }

  // Who's in the water near (plan 66 S7): their rings and wakes on it — the first eight each frame
  // (the view's own order: the nearest come first), where they are and how they go
  swimN = 0;

  swimWas = new Map<string, { x: number; z: number; t: number }>();

  readonly swimAt = new Vector3();

  bubbles: Bubbles | null = null;

  readonly bubbleAt = new Vector3();

  bubbleDt = 0;

  swimmer(id: string, p3: Person3D) {
    const S = wx.wxSwim.value;
    if (this.swimN >= S.length) return;
    const at = p3.root.getWorldPosition(this.swimAt).sub(wx.wxOff.value);
    const was = this.swimWas.get(id);
    const dt = was ? this.c.time - was.t : 0;
    const vx = was && dt > 0 ? (at.x - was.x) / dt : 0;
    const vz = was && dt > 0 ? (at.z - was.z) / dt : 0;
    this.swimWas.set(id, { x: at.x, z: at.z, t: this.c.time });
    // (under: bubbles off the head — S8)
    const w = this.c.level === 0 ? waterAt(at.x, at.z) : null;
    if (w && at.y < w.level - 1.7) {
      this.bubbles ??= new Bubbles(this.c.scene);
      this.bubbleAt.copy(at).add(wx.wxOff.value);
      this.bubbleAt.y += 1.55;
      this.bubbles.emit(id, this.bubbleAt, w.level + wx.wxOff.value.y, this.bubbleDt);
    }
    const v = S[this.swimN++];
    // (still, the rings alone: a speed just over none)
    v.set(at.x, at.z, Math.atan2(vz, vx), Math.max(0.01, Math.min(3, Math.hypot(vx, vz))));
  }

  /** How wet someone is (0 … 1): the steps' squelch after the water (docs/plan/66 S9). */
  wetness(id: string): number {
    return this.wetOn.get(id) ?? 0;
  }

  wetOf(b: Body3, dt: number): number {
    const sheltered = !!b.busy && (b.busy.startsWith("ride:") || b.busy.startsWith("drive:"));
    const out = !sheltered && this.underSky(b.x, b.y);
    const rain = wxNow.rain;
    const was = this.wetOn.get(b.id) ?? (out ? rain : 0);
    // (in the water to the chest, soaked at once; wading, half way in a few seconds — plan 66 S3)
    if ((b.swim ?? 0) >= 2) {
      this.wetOn.set(b.id, 1);
      return 1;
    }
    const rate = b.swim === 1 && was < 0.5 ? 0.15 : out && rain > 0.02 ? (0.4 + rain) / 180 : out ? -1 / 900 : -1 / 240;
    const k = Math.max(0, Math.min(1, was + rate * dt));
    this.wetOn.set(b.id, k);
    return k;
  }

  // Snow settling on people out under the sky (docs/plan/33-the-look.md): their shoulders and
  // heads white after six minutes or so out in a steady fall (a minute and a half in a storm), gone
  // again in a minute and a half indoors (or in a car, on the shuttle) — and out under the sky in
  // ten when it's stopped (docs/plan/65: only while it snows). Each viewer keeps its own count.
  snowOn = new Map<string, number>();

  snowFall(b: Body3, p3: Person3D, dt: number, hidden: boolean) {
    if (!Person3D.snowMat) {
      Person3D.snowMat = new MeshLambertMaterial({ color: 0xf2f5f8 });
      Person3D.snowMat.userData.wx = "none"; // (it is snow: no dusting on it — wx3d.ts)
      patchGrounds(Person3D.snowMat);
    }
    const sheltered = !!b.busy && (b.busy.startsWith("ride:") || b.busy.startsWith("drive:"));
    const out = !sheltered && this.underSky(b.x, b.y);
    const was = this.snowOn.get(b.id) ?? 0;
    const falling = Math.min(1, this.c.snowing * 1.5);
    const rate = !out ? -1 / 90 : falling > 0.02 ? ((1 + 3 * this.c.storm) * falling) / 360 : -1 / 600;
    const k = Math.max(0, Math.min(1, was + rate * dt));
    this.snowOn.set(b.id, k);
    p3.snowK = hidden ? 0 : k;
    p3.updateSnow();
  }

  // The mood (plan 58 C.6), someone's tension 0..1: the night out under the sky (wary, not afraid —
  // indoors, lit, hardly), and the shadowed close (all of it within 5 m, from 16 m). A shade's own is
  // the dark itself (person3d).
  moodOf(b: Body3, shades: Body3[]): number {
    const night = this.c.nightLevel * (this.underSky(b.x, b.y) ? 0.7 : 0.2);
    let near = 0;
    for (const s of shades) {
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      near = Math.max(near, Math.min(1, Math.max(0, (16 - d) / 11)));
    }
    return Math.min(1, Math.max(night, near * (0.6 + 0.4 * this.c.nightLevel)));
  }

  // out under the open sky: on the land, or the lot's open tiles (asphalt, concrete)
  underSky(x: number, y: number): boolean {
    if (this.c.level !== 0) return false;
    if (this.onLand(x, y)) return true;
    const ch = tileAt(this.c.map, Math.floor(x), Math.floor(y));
    return ch === "a" || ch === "c";
  }

  // out on the land (the ground floor's frame, off its own tiles)
  onLand(x: number, y: number): boolean {
    if (this.c.level !== 0 || !this.c.around.grounds) return false;
    return !isFloor(tileAt(this.c.map, Math.floor(x), Math.floor(y)));
  }

  // the light on someone out on the land: the hour's, the lamps' near, a beam's (`skip`: not
  // this one's own torch)
  landTint(x: number, y: number, out: Color, skip?: string) {
    out.copy(landLight.value);
    for (const p of [...this.c.pool, ...this.c.groundPool]) {
      if (p.intensity <= 0) continue;
      const d = Math.hypot(p.position.x - x, p.position.z - y) / (p.distance * 0.6);
      if (d >= 1) continue;
      const k = (1 - d) * (1 - d) * Math.min(1, p.intensity / 8) * 0.8;
      out.r += k * p.color.r;
      out.g += k * p.color.g;
      out.b += k * p.color.b;
    }
    for (const t of this.c.torch3) {
      if (!t.on || (skip && t.who === skip)) continue;
      // (shared beam.ts: the same test iso and the server make; a focused beam is the brighter)
      const k = beamAt(t.on, x, y) * (0.2 + 0.9 * this.c.nightLevel) * (t.on.focus ? 1.5 : 1);
      if (k <= 0) continue;
      out.r += k;
      out.g += k * 0.97;
      out.b += k * 0.9;
    }
    out.r = Math.min(1, out.r);
    out.g = Math.min(1, out.g);
    out.b = Math.min(1, out.b);
  }
}
