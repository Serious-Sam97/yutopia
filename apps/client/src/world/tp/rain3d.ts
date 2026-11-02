import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { ROOFS, wx } from "./wx3d";

// The rain (docs/plan/65-the-weather.md, W7):
//   - the streaks: thin quads in a box round the camera, stretched along the fall and the wind,
//     wrapped in the vertex shader (no work a frame on the CPU); fewer in a light rain, short ones
//     with a few flakes in a sleet; none under the roofs the snow's layer knows (wx3d.ts wxRoofs);
//   - the splashes: small rings on the ground round the camera, a few hundred re-used;
//   - the drips: from the nearest roofs' edges for a while after it stops.
// All in the scene's coords; the roofs in the Grounds' (wx3d.ts wxOff).

const BOX = new Vector3(34, 22, 34);

const VERT = `
attribute vec2 corner;
attribute vec3 seed;
uniform float rT; uniform vec3 rCam; uniform vec3 rBox; uniform vec3 rVel; uniform float rLen;
uniform float rShow; uniform float rW;
uniform vec4 wxRoofs[${ROOFS * 2}]; uniform int wxRoofN; uniform vec3 wxOff;
varying float vA;
varying float vU;
void main() {
  vA = 0.0;
  vU = corner.x;
  // (fewer in a light rain: the first of them, scattered at random, are a thinner rain all over)
  if (seed.z > rShow) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 p = seed * rBox + rVel * rT * (0.85 + 0.3 * seed.z);
  p = rCam + mod(p - rCam, rBox) - rBox * 0.5;
  vec3 g = p - wxOff;
  for (int i = 0; i < ${ROOFS}; i++) {
    if (i >= wxRoofN) break;
    vec4 a = wxRoofs[i * 2];
    if (g.x > a.x && g.x < a.z && g.z > a.y && g.z < a.w && g.y < wxRoofs[i * 2 + 1].x + 0.3) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  }
  vec3 dir = normalize(rVel);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(dir, toCam));
  vec3 q = p + dir * corner.y * rLen + side * corner.x * rW;
  // (the near ones thin out — none through the camera — and the far ones fade)
  float d = length(cameraPosition - p);
  vA = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(rBox.x * 0.32, rBox.x * 0.5, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
}
`;
const FRAG = `
uniform vec3 rCol; uniform float rOpacity;
varying float vA;
varying float vU;
void main() {
  float a = rOpacity * vA * (1.0 - abs(vU));
  if (a < 0.004) discard;
  gl_FragColor = vec4(rCol, a);
}
`;

/** A splash's ring (white, its alpha the ring). */
function ringTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.5)";
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.beginPath();
    g.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return new CanvasTexture(c);
}

const SPLASHES = 260;
const DRIPS = 80;

export class Rain {
  readonly streaks: Mesh;
  private mat: ShaderMaterial;
  private splash: InstancedMesh;
  private splashAt: { x: number; y: number; z: number; t: number }[] = [];
  private spare: { x: number; y: number; z: number; t: number }[] = [];
  private splashMat: MeshBasicMaterial;
  private drips: InstancedMesh;
  private dripAt: { x: number; y: number; z: number; v: number; floor: number }[] = [];
  private dripMat: MeshBasicMaterial;
  private m4 = new Matrix4();
  private q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private s = new Vector3();
  private p = new Vector3();
  private t = 0;
  private next = 0;
  private after = 0; // seconds since it last rained (the drips: for a while after)
  constructor(
    root: Group,
    count: number,
    /** the ground's height at (x, z) in the scene, null where there's no open ground (a floor) */
    private ground: (x: number, z: number) => number | null,
  ) {
    const pos: number[] = [];
    const corner: number[] = [];
    const seed: number[] = [];
    const idx: number[] = [];
    let h = 7;
    const r = () => {
      h = (h * 16807) % 2147483647;
      return h / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const s = [r(), r(), r()];
      for (const [u, v] of [
        [-1, -0.5],
        [1, -0.5],
        [1, 0.5],
        [-1, 0.5],
      ]) {
        pos.push(0, 0, 0);
        corner.push(u, v);
        seed.push(...s);
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("corner", new Float32BufferAttribute(corner, 2));
    g.setAttribute("seed", new Float32BufferAttribute(seed, 3));
    g.setIndex(idx);
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        rT: { value: 0 },
        rCam: { value: new Vector3() },
        rBox: { value: BOX.clone() },
        rVel: { value: new Vector3(0, -9, 0) },
        rLen: { value: 0.9 },
        rW: { value: 0.012 },
        rShow: { value: 0 },
        rCol: { value: new Color(0.7, 0.75, 0.8) },
        rOpacity: { value: 0.35 },
        wxRoofs: wx.wxRoofs,
        wxRoofN: wx.wxRoofN,
        wxOff: wx.wxOff,
      },
      transparent: true,
      depthWrite: false,
    });
    this.streaks = new Mesh(g, this.mat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 5;
    this.streaks.visible = false;
    root.add(this.streaks);
    // the splashes: flat rings on the ground, re-used
    const ring = ringTexture();
    this.splashMat = new MeshBasicMaterial({
      map: ring,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.splash = new InstancedMesh(new PlaneGeometry(1, 1), this.splashMat, SPLASHES);
    this.splash.instanceMatrix.setUsage(DynamicDrawUsage);
    this.splash.count = 0;
    this.splash.frustumCulled = false;
    root.add(this.splash);
    // the drips: short streaks falling from the eaves
    this.dripMat = new MeshBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.55, depthWrite: false });
    this.drips = new InstancedMesh(new PlaneGeometry(0.012, 0.28), this.dripMat, DRIPS);
    this.drips.instanceMatrix.setUsage(DynamicDrawUsage);
    this.drips.count = 0;
    this.drips.frustumCulled = false;
    root.add(this.drips);
  }

  private warming = 0;
  /** Drawn once unseen in the next frames (made ahead of the first rain: sky.ts). */
  warm(): void {
    this.warming = 2;
  }

  /** A frame: `rain` how hard (0 … 1), `sleet`, the wind (radians, 0 … 1 strong), the light on it
   *  (`col`, linear), the camera (scene coords). */
  update(
    dt: number,
    cam: Vector3,
    o: { rain: number; sleet: boolean; wind: number; windK: number; col: Color; quality: "high" | "medium" | "low" },
  ) {
    this.t += dt;
    const u = this.mat.uniforms;
    const rain = o.rain;
    this.after = rain > 0.05 ? 0 : this.after + dt;
    // (a warm frame: drawn unseen — every streak culled in its shader at rShow 0 — so its buffers,
    // texture and shader are on the GPU before the first drop)
    const warm = this.warming > 0;
    if (warm) this.warming--;
    this.streaks.visible = rain > 0.01 || warm;
    if (this.streaks.visible) {
      u.rT.value = this.t % 1000;
      (u.rCam.value as Vector3).copy(cam);
      const fall = o.sleet ? 4.5 : 9;
      const w = 1.5 + 4 * o.windK;
      (u.rVel.value as Vector3).set(Math.cos(o.wind) * w, -fall, Math.sin(o.wind) * w);
      u.rLen.value = o.sleet ? 0.3 : 0.45 + 0.35 * rain;
      u.rW.value = o.sleet ? 0.02 : 0.012;
      u.rShow.value = Math.min(1, rain * 1.2) * (o.quality === "high" ? 1 : 0.55);
      (u.rCol.value as Color).copy(o.col);
      u.rOpacity.value = 0.14 + 0.14 * rain;
    }
    // the splashes: born as it rains near you, a ring spreading out and gone in a third of a second
    if (rain > 0.02) {
      this.next += dt * rain * (o.quality === "high" ? 700 : 350);
      while (this.next >= 1) {
        this.next -= 1;
        const a = Math.random() * Math.PI * 2;
        const d = 0.8 + Math.sqrt(Math.random()) * 11;
        const x = cam.x + Math.cos(a) * d;
        const z = cam.z + Math.sin(a) * d;
        const y = this.ground(x, z);
        if (y === null || this.under(x, y, z) || this.splashAt.length >= SPLASHES) continue;
        // (one gone before, used again: no new object a splash)
        const sp = this.spare.pop() ?? { x: 0, y: 0, z: 0, t: 0 };
        sp.x = x;
        sp.y = y + 0.02;
        sp.z = z;
        sp.t = 0;
        this.splashAt.push(sp);
      }
    }
    let n = 0;
    for (const sp of this.splashAt) {
      sp.t += dt;
      if (sp.t > 0.32) {
        this.spare.push(sp);
        continue;
      }
      const k = sp.t / 0.32;
      this.p.set(sp.x, sp.y, sp.z);
      this.s.setScalar(0.04 + 0.13 * k);
      this.m4.compose(this.p, this.q, this.s);
      this.splash.setMatrixAt(n, this.m4);
      this.splashAt[n++] = sp;
    }
    // (none drawn and none to come: nothing sent to the GPU)
    if (n || this.splash.count) this.splash.instanceMatrix.needsUpdate = true;
    this.splashAt.length = n;
    // (and one splash, a speck far under the ground, the warm frame's: its ring's texture sent)
    if (warm && n === 0) {
      this.m4.makeScale(1e-4, 1e-4, 1e-4).setPosition(cam.x, cam.y - 500, cam.z);
      this.splash.setMatrixAt(n++, this.m4);
      this.splash.instanceMatrix.needsUpdate = true;
    }
    this.splash.count = n;
    this.splashMat.opacity = 0.18 * Math.min(1, rain * 2);
    this.splashMat.color.copy(o.col);
    // the drips: from the nearest roofs' eaves, for five minutes after the rain, thinning out (as long
    // as they're heard: weather-sound.ts DRIPS_FOR)
    const drip = rain > 0.05 ? 0.4 : this.after < 300 ? (1 - this.after / 300) * Math.min(1, wx.wxWet.value * 2) : 0;
    if (drip > 0.01 && wx.wxRoofN.value > 0 && Math.random() < dt * 40 * drip) {
      const i = Math.floor(Math.random() * wx.wxRoofN.value);
      const a = wx.wxRoofs.value[i * 2];
      const top = wx.wxRoofs.value[i * 2 + 1].x + 0.1;
      // (a point along its edge)
      const side = Math.floor(Math.random() * 4);
      const f = Math.random();
      const gx = side < 2 ? a.x + (a.z - a.x) * f : side === 2 ? a.x - 0.25 : a.z + 0.25;
      const gz = side >= 2 ? a.y + (a.w - a.y) * f : side === 0 ? a.y - 0.25 : a.w + 0.25;
      const x = gx + wx.wxOff.value.x;
      const z = gz + wx.wxOff.value.z;
      const floor = this.ground(x, z);
      if (floor !== null && Math.hypot(x - cam.x, z - cam.z) < 30 && this.dripAt.length < DRIPS)
        this.dripAt.push({ x, y: top + wx.wxOff.value.y, z, v: 0, floor });
    }
    n = 0;
    for (const dr of this.dripAt) {
      dr.v += 9.8 * dt;
      dr.y -= dr.v * dt;
      if (dr.y < dr.floor) continue;
      this.p.set(dr.x, dr.y, dr.z);
      this.s.set(1, 1, 1);
      this.m4.compose(this.p, IDENT, this.s);
      this.drips.setMatrixAt(n, this.m4);
      this.dripAt[n++] = dr;
    }
    if (n || this.drips.count) this.drips.instanceMatrix.needsUpdate = true;
    this.dripAt.length = n;
    this.drips.count = n;
    this.dripMat.color.copy(o.col);
  }
  /** Under a roof the snow's layer knows (scene coords). */
  private under(x: number, y: number, z: number): boolean {
    const o = wx.wxOff.value;
    for (let i = 0; i < wx.wxRoofN.value; i++) {
      const a = wx.wxRoofs.value[i * 2];
      if (x - o.x > a.x && x - o.x < a.z && z - o.z > a.y && z - o.z < a.w && y - o.y < wx.wxRoofs.value[i * 2 + 1].x)
        return true;
    }
    return false;
  }
  dispose() {
    this.streaks.geometry.dispose();
    this.mat.dispose();
    this.splash.geometry.dispose();
    this.splashMat.map?.dispose();
    this.splashMat.dispose();
    this.drips.geometry.dispose();
    this.dripMat.dispose();
    for (const o of [this.streaks, this.splash, this.drips]) o.removeFromParent();
  }
}
const IDENT = new Quaternion();
