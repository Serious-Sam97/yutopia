import { isFloor, type MapDef, type Theme, tileAt, type WallCut } from "@yutopia/shared";
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Daylight } from "../art/daylight";
import { Campus } from "./campus";

// the themes' drawings and skies: the same lazy chunk the iso view loads
export type Themes = typeof import("../art/themes");

// What surrounds the studio in 3D, by the space's theme (as the iso view's
// backdrops, with the same skies by the hour): a sky dome with stars at night,
// and — clouds: the building floats among drifting clouds; city: a tower in a
// skyline whose windows light up at night; snow: a chalet in falling snow. The
// building gets a body under its floor's outer edge (its "shell").

// the dome's radius (tiles): the snow campus reaches far (see fogFor)
const domeR = (theme: Theme) => (theme === "snow" ? 760 : 160);

// How far the camera and the fog see, by theme: the campus is a landscape.
export function fogFor(theme: Theme): { near: number; far: number; cameraFar: number } {
  return theme === "snow" ? { near: 120, far: 520, cameraFar: 1400 } : { near: 40, far: 150, cameraFar: 200 };
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
  private clouds: { mesh: Mesh; speed: number; r: number; a: number; y: number }[] = [];
  private campus: Campus | null = null;
  private windows: MeshLambertMaterial | null = null;
  private ground: MeshBasicMaterial | null = null;
  private shellMat: MeshLambertMaterial;
  private disposables: { dispose(): void }[] = [];
  private cx: number;
  private cy: number;

  // `cuts`: the walls' windows (shared wallCuts): the campus's façade opens there
  constructor(
    readonly theme: Theme,
    map: MapDef,
    private T: Themes,
    cuts: Map<string, WallCut> = new Map(),
  ) {
    const { rng } = T;
    this.cx = map.width / 2;
    this.cy = map.height / 2;
    // the dome: top → middle → horizon colours, as the theme's sky
    this.domeMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color() },
        mid: { value: new Color() },
        bot: { value: new Color() },
        clouds: { value: theme === "snow" ? overcast(T) : null },
        cloudK: { value: theme === "snow" ? 1 : 0 },
        cloudOff: { value: [0, 0] },
      },
      vertexShader:
        "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      // the gradient, and (snow) an overcast deck: the cloud texture laid on a
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
    if (theme === "snow") this.disposables.push(this.domeMat.uniforms.clouds.value as CanvasTexture);
    const R = domeR(theme);
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

    this.shellMat = new MeshLambertMaterial({
      // the iso shells: the tower's warm stone, the campus's mirrored glass, the cloud island's sandstone
      color: theme === "city" ? 0x8a7866 : theme === "snow" ? 0x4a5866 : 0xd9cba9,
      side: DoubleSide,
    });
    this.disposables.push(this.shellMat);
    if (theme === "snow") {
      // the campus draws the building itself (the studio is its top floor)
      this.campus = new Campus(map, T, cuts);
      this.root.add(this.campus.root);
    } else {
      const depth = theme === "city" ? 26 : 1.4;
      this.root.add(this.shell(map, depth));
      if (theme === "city") this.city(depth);
      else this.cloudy();
    }
  }

  // the building's body: walls down from the floor's outer edge (and a base under it)
  private shell(map: MapDef, depth: number): Mesh {
    const pos: number[] = [];
    const quad = (ax: number, ay: number, bx: number, by: number) => {
      // from a to b along the edge, the outside on the left (seen from above)
      pos.push(ax, 0, ay, bx, 0, by, bx, -depth, by, ax, 0, ay, bx, -depth, by, ax, -depth, ay);
    };
    const f = (x: number, y: number) => isFloor(tileAt(map, x, y));
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!f(x, y)) continue;
        if (!f(x, y - 1)) quad(x + 1, y, x, y);
        if (!f(x, y + 1)) quad(x, y + 1, x + 1, y + 1);
        if (!f(x - 1, y)) quad(x, y, x, y + 1);
        if (!f(x + 1, y)) quad(x + 1, y + 1, x + 1, y);
        // the base under the floor, facing down (a hair above the ground the
        // snow and city themes lay at -depth, so the two never fight)
        const b = -depth + 0.02;
        pos.push(x, b, y, x + 1, b, y, x + 1, b, y + 1, x, b, y, x + 1, b, y + 1, x, b, y + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    this.disposables.push(g);
    const m = new Mesh(g, this.shellMat);
    m.receiveShadow = true;
    return m;
  }

  private cloudy() {
    // fluffy clouds all around, above and below the building, drifting
    const r = this.T.rng(29);
    for (let i = 0; i < 46; i++) {
      const tex = new CanvasTexture(this.T.cloudCanvas(1000 + (i % 9)));
      tex.colorSpace = SRGBColorSpace;
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const w = 10 + r() * 22;
      const mesh = new Mesh(new PlaneGeometry(w, w * (180 / 420)), mat);
      this.disposables.push(tex, mat, mesh.geometry);
      const y = r() < 0.6 ? -6 - r() * 22 : 2 + r() * 16;
      this.clouds.push({ mesh, speed: 0.004 + r() * 0.01, r: 40 + r() * 80, a: r() * Math.PI * 2, y });
      this.root.add(mesh);
    }
  }

  private city(depth: number) {
    // streets far below, a ring of towers with windows that light up at night
    const ground = new MeshBasicMaterial({ color: 0x2c2f38 });
    this.ground = ground;
    const g = new Mesh(new PlaneGeometry(800, 800).rotateX(-Math.PI / 2), ground);
    g.position.set(this.cx, -depth, this.cy);
    const win = this.T.canvas(64, 128);
    const rr = this.T.rng(5);
    win.g.fillStyle = "#000";
    win.g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 10)
      for (let x = 4; x < 64; x += 10) {
        if (rr() < 0.45) continue;
        win.g.fillStyle = rr() < 0.2 ? "#9fd8ff" : "#ffd28a";
        win.g.fillRect(x, y, 5, 6);
      }
    const tex = new CanvasTexture(win.c);
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshLambertMaterial({
      color: 0x3a3a4a,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0,
    });
    this.windows = mat;
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const n = 140;
    const towers = new InstancedMesh(box, mat, n);
    const r = this.T.rng(11);
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = 34 + r() * 90;
      const w = 4 + r() * 8;
      const h = 10 + r() * 45;
      m.compose(
        new Vector3(this.cx + Math.cos(a) * d, -depth, this.cy + Math.sin(a) * d),
        new Quaternion(),
        new Vector3(w, h, w * (0.7 + r() * 0.6)),
      );
      towers.setMatrixAt(i, m);
    }
    this.disposables.push(ground, g.geometry, tex, mat, box);
    this.root.add(g, towers);
  }

  readonly horizon = new Color();

  setDay(d: Daylight) {
    const [top, mid, bot] =
      this.theme === "city"
        ? this.T.keyed(this.T.CITY_SKY, d.hour)
        : this.theme === "snow"
          ? this.T.keyed(this.T.SNOW_SKY, d.hour)
          : this.T.keyed(this.T.CLOUD_SKY, d.hour);
    const u = this.domeMat.uniforms;
    (u.top.value as Color).setHex(top, SRGBColorSpace);
    (u.mid.value as Color).setHex(mid, SRGBColorSpace);
    (u.bot.value as Color).setHex(bot, SRGBColorSpace);
    this.horizon.setHex(mid, SRGBColorSpace);
    (this.stars.material as PointsMaterial).opacity = Math.max(0, d.night * 1.1 - 0.1);
    const amb = new Color(d.ambient[0], d.ambient[1], d.ambient[2]);
    for (const c of this.clouds) (c.mesh.material as MeshBasicMaterial).color.copy(amb);
    if (this.windows) this.windows.emissiveIntensity = d.night * 1.2;
    this.campus?.setDay(d, mid);
    // the ground far below goes dark at night like the iso backdrops (snow under the moon, the city's streets)
    if (this.ground)
      this.ground.color
        .setHex(0x2c2f38)
        .multiply(amb)
        .multiplyScalar(1 - 0.62 * d.night);
  }

  // the dome and the snow go with the camera; clouds drift
  update(dt: number, cam: Vector3, animate: boolean) {
    this.dome.position.copy(cam);
    this.stars.position.copy(cam);
    if (animate && this.theme === "snow") {
      const off = this.domeMat.uniforms.cloudOff.value as number[];
      off[0] += dt * 0.0035;
      off[1] += dt * 0.0015;
    }
    for (const c of this.clouds) {
      if (animate) c.a += c.speed * dt;
      c.mesh.position.set(this.cx + Math.cos(c.a) * c.r, c.y, this.cy + Math.sin(c.a) * c.r);
      c.mesh.lookAt(cam);
    }
    this.campus?.update(dt, cam, animate);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.campus?.dispose();
  }
}
