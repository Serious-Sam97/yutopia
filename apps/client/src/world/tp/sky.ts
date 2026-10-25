import { isFloor, levelMap, type MapDef, tileAt, type WallCut } from "@yutopia/shared";
import { stormAt } from "@yutopia/shared/weather";
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
import { landLight, litBalance, patchGrounds, patchOutdoors } from "./light3d";
import { stepRoadSnow } from "./roads3d";

// the themes' drawings and skies: the same lazy chunk the iso view loads
export type Themes = typeof import("../art/themes");

// What surrounds the building in 3D (as the iso view's backdrop, with the same
// sky by the hour): a sky dome with stars at night and an overcast deck, and the
// snow campus (tp/campus.ts) — the block, the lot, the field.

// the dome's radius (tiles): the campus reaches far (see fogFor)
const DOME_R = 760;

// How far the camera and the fog see: the campus is a landscape.
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
    const u = this.domeMat.uniforms;
    (u.top.value as Color).setHex(top, SRGBColorSpace);
    (u.mid.value as Color).setHex(mid, SRGBColorSpace);
    (u.bot.value as Color).setHex(bot, SRGBColorSpace);
    this.horizon.setHex(mid, SRGBColorSpace);
    // (no stars in the pitch dark: the overcast — docs/plan/44-the-night.md)
    const over = Math.min(1, Math.max(0, (d.dark - 0.2) / 0.4));
    (this.stars.material as PointsMaterial).opacity = Math.max(0, d.night * 1.1 - 0.1) * (1 - over);
    // the land's light (as the campus's things are tinted: the same by the hour), and in
    // the pitch dark next to none: the sky's light goes, the lamps' and the beams' stay
    const dk = darkK(d.dark, DARK_LEFT.land3 + EYES_LIFT.land3 * this.eyes);
    this.campus.setDay(d, mid, dk);
    litBalance.lmSkyLeft.value = dk;
    const k = (1 - 0.75 * d.night) * dk;
    landLight.value.setRGB(d.ambient[0] * k, d.ambient[1] * k, d.ambient[2] * k);
    this.grounds?.setNight(d.night, landLight.value);
  }

  /** The weather (shared weather.ts): the snow and the sky follow it. */
  setWeather(storm: number, wind: number) {
    this.campus.weather.storm = storm;
    this.campus.weather.wind = wind;
    // (a storm's sky: the overcast thick and even)
    this.domeMat.uniforms.cloudK.value = 1 - 0.7 * storm;
    // (the woods sway harder in it)
    if (this.grounds) this.grounds.wind.value = 1 + 2.5 * storm;
    // (and the roads go white in it, and clear after: roads3d.ts)
    stepRoadSnow(storm, stormAt);
  }

  // the dome and the snow go with the camera; the overcast drifts
  update(dt: number, cam: Vector3, animate: boolean, target?: Vector3) {
    this.dome.position.copy(cam);
    this.stars.position.copy(cam);
    if (animate) {
      const off = this.domeMat.uniforms.cloudOff.value as number[];
      off[0] += dt * 0.0035;
      off[1] += dt * 0.0015;
    }
    // (the campus moves with the floor shown: the camera in its coords)
    this.campus.update(dt, this.local.copy(cam).sub(this.campus.root.position), animate);
    if (this.grounds) {
      this.local.y -= GROUND;
      // (whose feet the camera looks at, in the Grounds' coords: trees between fade)
      const t = this.tgt.copy(target ?? cam).sub(this.campus.root.position);
      t.y -= GROUND;
      this.grounds.update(t.x, t.z, this.local, t);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.grounds?.dispose();
    this.campus.dispose();
  }
}
