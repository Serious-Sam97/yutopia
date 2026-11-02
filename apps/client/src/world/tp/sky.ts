import { isFloor, levelMap, type MapDef, tileAt, type WallCut } from "@yutopia/shared";
import { skyAt, strikeFar, strikeIn } from "@yutopia/shared/weather";
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { DARK_LEFT, type Daylight, darkK, EYES_LIFT } from "../art/daylight";
import { Campus, GROUND } from "./campus";
import { GroundsStream } from "./grounds-stream";
import { landBounce, landLight, litBalance, patchGrounds, patchOutdoors } from "./light3d";
import { Rain } from "./rain3d";
import { stepRoadSnow } from "./roads3d";
import { ROOFS, WxEase, wx, wxHold, wxNow } from "./wx3d";

// the themes' drawings and skies: the same lazy chunk the iso view loads
export type Themes = typeof import("../art/themes");

// What surrounds the building in 3D (as the iso view's backdrop, with the same
// sky by the hour): a sky dome with stars at night and an overcast deck, and the
// snow campus (tp/campus.ts) — the block, the lot, the field.

// the dome's radius (tiles): the campus reaches far (see fogFor)
const DOME_R = 760;

// How far the camera and the fog see: the campus is a landscape.
/** What's on the ground and coming down (the room's weather, docs/plan/65): the snow lying, how hard
 *  it's snowing, the cloud, how hard it's raining, the wet, the puddles, the air's temperature. */
export interface Ground {
  snow: number;
  falling: number;
  cloud?: number;
  rain?: number;
  wet?: number;
  puddles?: number;
  temp?: number;
  /** the rain's a sleet (short streaks, a few flakes) */
  sleet?: boolean;
  /** a thunderstorm's, 0 … 1: the lightning */
  thunder?: number;
  /** the water's ice, 0 … 1 (W6) */
  ice?: number;
}

/** How hard it's snowing by the schedule at a time (the roads' snow, coming in). */
function snowingAt(ms: number): number {
  const s = skyAt(ms);
  return s.kind === "snow" ? Math.max(s.storm, s.fall) : 0;
}

export function fogFor(): { near: number; far: number; cameraFar: number } {
  return { near: 120, far: 520, cameraFar: 1400 };
}

// A tileable overcast: soft grey mottling, lighter and darker patches.
function overcast(T: Themes): CanvasTexture {
  const S = 512;
  const { c, g } = T.canvas(S, S);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, S, S);
  const r = T.rng(81);
  for (let i = 0; i < 160; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 40 + r() * 120;
    const light = r() < 0.5;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, w);
        grd.addColorStop(0, light ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)");
        grd.addColorStop(1, light ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(x + ox, y + oy, w, w * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class Surroundings {
  readonly root = new Group();
  private dome: Mesh;
  private domeMat: ShaderMaterial;
  private stars: Points;
  readonly campus: Campus;
  /** the Grounds round a building with a ground floor (docs/plan/27) */
  readonly grounds: GroundsStream | null = null;
  private local = new Vector3();
  private tgt = new Vector3();
  private disposables: { dispose(): void }[] = [];

  // `cuts`: the walls' windows (shared wallCuts): the campus's façade opens there
  constructor(
    map: MapDef,
    private T: Themes,
    cuts: Map<string, WallCut> = new Map(),
  ) {
    const { rng } = T;
    // the dome: top → middle → horizon colours, as the iso sky
    this.domeMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color() },
        mid: { value: new Color() },
        bot: { value: new Color() },
        clouds: { value: overcast(T) },
        cloudK: { value: 1 },
        cloudOff: { value: [0, 0] },
      },
      vertexShader:
        "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      // the gradient, and an overcast deck: the cloud texture laid on a
      // plane overhead and seen through each direction, drifting, fading out
      // towards the horizon where the fog takes over
      fragmentShader: [
        "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform sampler2D clouds; uniform float cloudK; uniform vec2 cloudOff; varying vec3 vDir;",
        "void main() {",
        "  vec3 d = normalize(vDir); float t = clamp(d.y, -1.0, 1.0);",
        "  vec3 c = t > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, t)) : mix(mid, bot, smoothstep(0.0, 0.35, -t));",
        "  if (cloudK > 0.0 && d.y > 0.0) {",
        "    vec2 uv = d.xz / max(d.y, 0.05) * 0.55 + cloudOff;",
        "    float n = texture2D(clouds, uv).r;",
        "    float k = cloudK * smoothstep(0.0, 0.2, d.y);",
        "    c *= mix(1.0, 0.8 + 0.34 * n, k);",
        "  }",
        "  gl_FragColor = vec4(c, 1.0);",
        "#include <colorspace_fragment>",
        "}",
      ].join("\n"),
    });
    this.disposables.push(this.domeMat.uniforms.clouds.value as CanvasTexture);
    const R = DOME_R;
    this.dome = new Mesh(new SphereGeometry(R, 32, 16), this.domeMat);
    this.dome.renderOrder = -10;
    this.disposables.push(this.dome.geometry, this.domeMat);
    // stars: on the upper dome, only at night
    const r = rng(17);
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2;
      const el = Math.asin(0.05 + r() * 0.95);
      pts.push(Math.cos(a) * Math.cos(el) * R * 0.95, Math.sin(el) * R * 0.95, Math.sin(a) * Math.cos(el) * R * 0.95);
    }
    const sg = new BufferGeometry();
    sg.setAttribute("position", new Float32BufferAttribute(pts, 3));
    const sm = new PointsMaterial({
      color: 0xfffaeb,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    this.stars = new Points(sg, sm);
    this.stars.renderOrder = -9;
    this.disposables.push(sg, sm);
    this.root.add(this.dome, this.stars);

    // the campus draws the building itself
    this.campus = new Campus(map, T, cuts);
    this.root.add(this.campus.root);
    // all of it out under the sky: the open sky's balance of sun and fill (light3d.ts)
    const seen = new Set<Material>();
    this.campus.root.traverse((o) => {
      const m = (o as Mesh).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : [])
        if (!seen.has(x) && (x instanceof MeshLambertMaterial || x instanceof MeshStandardMaterial)) {
          seen.add(x);
          patchOutdoors(x);
        }
    });
    // the land all round, under the campus (its ground is the campus's GROUND);
    // the ground floor's own tiles (lobby, lot) are its floor's to draw. (After
    // the pass above: it patches its own materials, the trees' with more.)
    const g0 = map.levels?.some((l) => l.index === 0) ? levelMap(map, 0) : null;
    if (g0) {
      const ox = g0.ox ?? 0;
      const oy = g0.oy ?? 0;
      const covered = (bx: number, bz: number) => {
        const x = Math.floor(bx - ox);
        const y = Math.floor(bz - oy);
        return x >= 0 && y >= 0 && x < g0.width && y < g0.height && isFloor(tileAt(g0, x, y));
      };
      // (what lies on the ground floor — the lot's snow — lit as the floor is: `floorLit`, view.ts)
      this.grounds = new GroundsStream(
        T,
        covered,
        (m) => (m.userData.onFloor && this.floorLit ? this.floorLit(m) : patchGrounds(m)),
        map.width,
      );
      this.grounds.root.position.y = GROUND;
      this.campus.root.add(this.grounds.root);
      // (the snow doesn't fall in the Grounds' buildings)
      this.campus.roofs = this.grounds.boxes;
    }
  }

  readonly horizon = new Color();
  /** The ground floor's light (its light map, view.ts Light3.patch), for what lies on it. */
  floorLit: ((m: Material) => void) | null = null;
  private day: Daylight | null = null;
  private eyes = 0;
  private eyesSet = 0;

  /** How adjusted my eyes are to the dark (eyes.ts, 0 … 1): the land's light lifts a little. */
  setEyes(e: number) {
    this.eyes = e;
    // (a step at a time: setDay walks the campus's materials)
    if (Math.abs(e - this.eyesSet) < 0.02 && (e > 0 || this.eyesSet === 0)) return;
    this.eyesSet = e;
    if (this.day) this.setDay(this.day);
  }

  setDay(d: Daylight) {
    this.day = d;
    const [top, mid, bot] = this.T.keyed(this.T.SNOW_SKY, d.hour);
    this.sky.top.setHex(top, SRGBColorSpace);
    this.sky.mid.setHex(mid, SRGBColorSpace);
    this.sky.bot.setHex(bot, SRGBColorSpace);
    this.weatherSky();
    // (no stars in the pitch dark: the overcast — docs/plan/44-the-night.md)
    const over = Math.min(1, Math.max(0, (d.dark - 0.2) / 0.4));
    this.sky.stars = Math.max(0, d.night * 1.1 - 0.1) * (1 - over);
    this.fogSky();
    // the land's light (as the campus's things are tinted: the same by the hour), and in
    // the pitch dark next to none: the sky's light goes, the lamps' and the beams' stay
    const dk = darkK(d.dark, DARK_LEFT.land3 + EYES_LIFT.land3 * this.eyes);
    this.campus.setDay(d, mid, dk);
    litBalance.lmSkyLeft.value = dk;
    const k = (1 - 0.75 * d.night) * dk;
    landLight.value.setRGB(d.ambient[0] * k, d.ambient[1] * k, d.ambient[2] * k);
    this.landBase.copy(landLight.value);
    this.grounds?.setNight(d.night, landLight.value);
  }
  // (the land's light as the hour has it: a lightning's flash is laid over it — update)
  private landBase = new Color(1, 1, 1);

  // the sky by the hour (setDay), before the morning fog whites it out (fogSky)
  private sky = { top: new Color(), mid: new Color(), bot: new Color(), stars: 0 };
  private fog = { k: 0, wall: 0, col: new Color() };

  /** The morning fog (docs/plan/64-the-fog.md): how much of the sky it takes (0 … 1), the wall,
   *  its colour (linear). The dome goes to it, the stars and the overcast's pattern go. */
  setFog(k: number, wall: number, col: Color) {
    const f = this.fog;
    if (Math.abs(k - f.k) < 1e-4 && Math.abs(wall - f.wall) < 1e-4 && col.equals(f.col)) return;
    f.k = k;
    f.wall = wall;
    f.col.copy(col);
    this.fogSky();
  }
  private fogSky() {
    const u = this.domeMat.uniforms;
    const { k, wall, col } = this.fog;
    // (the top a little less, but for the wall's: no sky at all)
    (u.top.value as Color).copy(this.sky.top).lerp(col, wall > 0 ? k : k * 0.8);
    (u.mid.value as Color).copy(this.sky.mid).lerp(col, k);
    (u.bot.value as Color).copy(this.sky.bot).lerp(col, k);
    this.horizon.copy(u.mid.value as Color);
    (this.stars.material as PointsMaterial).opacity = this.sky.stars * (1 - k);
    u.cloudK.value = (1 - 0.7 * this.storm) * (1 - 0.85 * k) * this.cloudMul();
  }
  /** The overcast's pattern by the weather: thin on a clear day, thick on a wet one. */
  private cloudMul(): number {
    const { clear, rain } = this.wxSky;
    return (0.18 + 0.82 * (1 - clear)) * (1 + 0.4 * rain);
  }
  // the sky by the weather (docs/plan/65, W3: the approved mock's), eased: a clear day's bluer, a
  // wet one's low and grey; a snowy day's (and an overcast one's) today's
  private wxSky = { clear: 0, rain: 0 };
  private weatherSky() {
    const { clear, rain } = this.wxSky;
    const lum = (c: Color) => c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
    const toward = (c: Color, r: number, g: number, b: number, k: number) => {
      const l = lum(c);
      c.setRGB(c.r + (r * l - c.r) * k, c.g + (g * l - c.g) * k, c.b + (b * l - c.b) * k);
    };
    if (clear > 0.01) {
      toward(this.sky.top, 0.5, 0.8, 1.6, 0.85 * clear);
      toward(this.sky.mid, 0.72, 0.9, 1.3, 0.7 * clear);
      toward(this.sky.bot, 0.9, 0.98, 1.1, 0.4 * clear);
    }
    if (rain > 0.01)
      for (const c of [this.sky.top, this.sky.mid, this.sky.bot]) {
        const l = lum(c) * 0.72;
        c.lerp(new Color(l * 0.97, l, l * 1.03), rain);
      }
  }
  private storm = 0;

  /** How far the camera sees (the wall brings it in): the dome and the stars inside it. */
  setReach(far: number) {
    const k = Math.min(1, (far * 0.9) / DOME_R);
    this.dome.scale.setScalar(k);
    this.stars.scale.setScalar(k);
  }

  /** The weather (shared weather.ts): the snow and the sky follow it. */
  setWeather(storm: number, wind: number) {
    this.campus.weather.storm = storm;
    this.campus.weather.wind = wind;
    // (a storm's sky: the overcast thick and even — and the morning fog's thins it)
    this.storm = storm;
    this.domeMat.uniforms.cloudK.value = (1 - 0.7 * storm) * (1 - 0.85 * this.fog.k) * this.cloudMul();
    // (the woods sway harder in it)
    if (this.grounds) this.grounds.wind.value = 1 + 2.5 * storm;
  }

  /** What lies on the ground (the room's weather, docs/plan/65): the snow lying, 0 … 1 — the snow's
   *  layer follows it (wx3d.ts) — and how hard it's snowing now: the roads go white in it, and
   *  clear after (roads3d.ts). */
  setGround(g: Ground) {
    const { snow, falling, cloud = 1, rain = 0, wet = 0, puddles = 0, temp = -5 } = g;
    this.ground.rain = rain;
    this.ground.sleet = !!g.sleet;
    this.ground.thunder = g.thunder ?? 0;
    const now = performance.now();
    const dt = this.groundAt ? Math.min(1, (now - this.groundAt) / 1000) : 0;
    this.groundAt = now;
    this.wxEase.step(dt, snow);
    this.wxEase.icicles(dt, snow, wet, temp);
    wxNow.temp = temp;
    // (the wet: eased over half a minute; the first, or a call, at once — held by the stills)
    if (!wxHold.on) this.wetPud(dt, wet, puddles, g.ice ?? 1);
    wx.wxRain.value = rain;
    wx.wxT.value = (now / 1000) % 10_000;
    // the ground's bounce: green-grey off the grass, the snow's cold blue as it lies (W3)
    const k = Math.min(1, wx.wxSnow.value * 1.3);
    landBounce.value.setRGB(0.58 + (0.68 - 0.58) * k, 0.66 + (0.77 - 0.66) * k, 0.5 + (0.92 - 0.5) * k);
    // the sky by the weather (eased over ~20 s; the first, or a call made now, at once)
    const s = this.wxSky;
    const jump = Math.abs(1 - cloud - s.clear) > 0.3 || Math.abs(rain - s.rain) > 0.3;
    const e = this.skyAt && !jump ? Math.min(1, dt / 20) : 1;
    this.skyAt = now;
    s.clear += (1 - cloud - s.clear) * e;
    s.rain += (rain - s.rain) * e;
    wxNow.clear = s.clear;
    wxNow.rain = s.rain;
    // (drawn again as either moves: the rain going as the sky clears keeps their sum, not them)
    if (Math.abs(s.clear - this.skySet.clear) + Math.abs(s.rain - this.skySet.rain) > 0.01) {
      this.skySet.clear = s.clear;
      this.skySet.rain = s.rain;
      if (this.day) this.setDay(this.day);
    }
    stepRoadSnow(falling, snowingAt);
    // (the flakes: as hard as it's snowing, eased — none on a dry day)
    // (the first at once: no half a minute of flakes on a dry day as I come in; and none at all once
    // it's next to none — eased, it'd never quite be)
    const w = this.campus.weather;
    w.snowing = dt === 0 ? falling : w.snowing + (falling - w.snowing) * Math.min(1, dt / 4);
    if (w.snowing < 1e-3) w.snowing = 0;
    wxNow.snowing = w.snowing;
  }
  /** The wet and the puddles (the rain's rings in them as hard as it's raining — W7), eased over
   *  half a minute; the first, or a call, at once. */
  private wetPud(dt: number, wet: number, puddles: number, ice: number) {
    const ease = (v: number, to: number) =>
      dt === 0 || Math.abs(to - v) > 0.3 ? to : v + (to - v) * Math.min(1, dt / 30);
    wx.wxWet.value = ease(wx.wxWet.value, wet);
    wx.wxPud.value = ease(wx.wxPud.value, puddles);
    wx.wxIce.value = ease(wx.wxIce.value, ice);
  }
  // the rain (made the first time it rains), the lightning
  private rain: Rain | null = null;
  private rainCol = new Color();
  private tmpCol = new Color();
  private ground = { rain: 0, sleet: false, thunder: 0 };
  private flash = 0;
  private flashSlot = -1;
  /** A thunderstorm's lightning (W7): now and then, the same for everyone (by the clock, in 7 s
   *  slots, a hash says whether one strikes in it and when), a flash of a few frames that lights
   *  the sky and the land; more often the more thunder. Its thunder's the sound's (phase 9). */
  private lightning(dt: number) {
    const ms = Date.now();
    const s = strikeIn(ms, this.ground.thunder);
    if (s && s.slot !== this.flashSlot && ms >= s.at) {
      this.flashSlot = s.slot;
      // (a far one dimmer: its thunder's later too — weather-sound.ts. One seen late — come in after
      // it, back to a hidden tab — isn't flashed out of step with everyone's)
      if (ms - s.at < 300) this.flash = 1 - 0.55 * strikeFar(s.slot);
    }
    if (this.flash <= 0 && this.flashOn === 0) return;
    // (a double flicker over a fifth of a second)
    this.flash = Math.max(0, this.flash - dt * 5);
    const f = this.flash > 0.6 || (this.flash > 0.15 && this.flash < 0.35) ? this.flash : this.flash * 0.3;
    this.flashOn = f;
    landLight.value.copy(this.landBase).lerp(this.tmpCol.setRGB(1.6, 1.65, 1.8), f * 0.8);
    const u = this.domeMat.uniforms;
    (u.top.value as Color).copy(this.sky.top).lerp(this.tmpCol.setRGB(0.9, 0.92, 1), f * 0.7);
    (u.mid.value as Color).copy(this.sky.mid).lerp(this.tmpCol.setRGB(0.95, 0.96, 1), f * 0.7);
    if (f === 0) this.fogSky();
  }
  private flashOn = 0;
  /** The snow lying at once (a call made now; the e2e's stills). */
  setSnowNow(snow: number, melt?: number) {
    this.wxEase.set(snow, melt);
  }
  private wxEase = new WxEase();
  private skyAt = 0;
  /** the view's quality (view.ts): Medium and below, a thinner rain */
  quality = "high";
  private skySet = { clear: -1, rain: -1 };
  private groundAt = 0;
  // the roofs the dusting keeps off (the nearest few: wx3d.ts), looked for again as I move
  private roofsFrom = new Vector3(1e9, 0, 1e9);
  private roofsAt = 0;
  private roofsNear(x: number, z: number) {
    const boxes = this.grounds?.boxes;
    if (!boxes) return;
    const now = performance.now();
    if (Math.hypot(x - this.roofsFrom.x, z - this.roofsFrom.z) < 6 && now - this.roofsAt < 2000) return;
    this.roofsFrom.set(x, 0, z);
    this.roofsAt = now;
    const d = (b: (typeof boxes)[number]) =>
      Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
    // (the office's always, at its own size — the server's: a Large one's bigger than the Grounds'
    // headquarters — from its campus, in the Grounds' coords: no rain inside it, wherever its floors put
    // me)
    // (the Grounds' coords are the campus's, a ground four storeys under its studio: wxOff, update)
    const f = this.campus.footprint();
    const roof = f.roof - GROUND;
    const hq = [{ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, top: roof, eaves: roof }];
    const near = [
      ...hq,
      ...boxes
        .filter((b) => d(b) < 120)
        .sort((a, b) => d(a) - d(b))
        .slice(0, ROOFS - hq.length),
    ];
    const u = wx.wxRoofs.value;
    for (const [i, b] of near.entries()) {
      // (the Grounds' coords; a little in from the walls' faces, under the eaves)
      u[i * 2].set(b.x0 + 0.05, b.z0 + 0.05, b.x1 - 0.05, b.z1 - 0.05);
      u[i * 2 + 1].set(b.eaves - 0.1, 0, 0, 0);
    }
    wx.wxRoofN.value = near.length;
  }

  // the dome and the snow go with the camera; the overcast drifts
  update(dt: number, cam: Vector3, animate: boolean, target?: Vector3) {
    this.dome.position.copy(cam);
    this.stars.position.copy(cam);
    // the rain round the camera (rain3d.ts), lit as the land is, dimmer than the sky low down
    wx.wxSky.value.copy(this.horizon);
    // (made ahead: while the game's idle, a few seconds after it's in — its first fall built on the
    // frame it started was a 70 ms frame — and drawn once unseen, so all of it's on the GPU)
    if (!this.rain && this.grounds && this.rainSoon >= 0) this.rainSoon += dt;
    if (!this.rain && this.grounds && this.rainSoon > 6) {
      this.rainSoon = -1;
      const make = () => {
        if (this.gone || this.rain) return;
        this.rain = this.makeRain();
        this.rain.warm();
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(make, { timeout: 5000 });
      else setTimeout(make, 0);
    }
    if (this.rain || this.ground.rain > 0.01 || wx.wxWet.value > 0.2) {
      this.rain ??= this.makeRain();
      this.rainCol.copy(this.horizon).multiplyScalar(0.75).add(this.tmpCol.copy(landLight.value).multiplyScalar(0.15));
      this.rain.update(animate ? dt : 0, cam, {
        rain: this.ground.rain,
        sleet: this.ground.sleet,
        wind: this.campus.weather.wind,
        windK: this.storm,
        col: this.rainCol,
        quality: this.quality === "high" ? "high" : "medium",
      });
    }
    this.lightning(dt);
    if (animate) {
      const off = this.domeMat.uniforms.cloudOff.value as number[];
      off[0] += dt * 0.0035;
      off[1] += dt * 0.0015;
    }
    // (the campus moves with the floor shown: the camera in its coords)
    this.campus.update(dt, this.local.copy(cam).sub(this.campus.root.position), animate);
    // (the snow's noise in the Grounds' coords, wherever the campus is drawn)
    wx.wxOff.value.copy(this.root.position).add(this.campus.root.position).y += GROUND;
    this.roofsNear(this.local.x, this.local.z);
    if (this.grounds) {
      this.local.y -= GROUND;
      // (whose feet the camera looks at, in the Grounds' coords: trees between fade)
      const t = this.tgt.copy(target ?? cam).sub(this.campus.root.position);
      t.y -= GROUND;
      this.grounds.update(t.x, t.z, this.local, t);
    }
  }

  private rainSoon = 0;
  private gone = false;
  private makeRain(): Rain {
    return new Rain(this.root, this.campus.lite ? 4000 : 9000, (x, z) => {
      const g = this.grounds;
      if (!g) return null;
      const o = wx.wxOff.value;
      return g.heightAt(x - o.x, z - o.z) + o.y;
    });
  }

  dispose() {
    this.gone = true;
    this.rain?.dispose();
    for (const d of this.disposables) d.dispose();
    this.grounds?.dispose();
    this.campus.dispose();
  }
}
