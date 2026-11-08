// Plan 73, phase 0d — the life look outside, by the code kit (life-kit.ts's helpers and painted
// canvases): the headquarters' front (banded plaster, framed windows lit at night, a glass entrance
// under a canopy with the name), the lawn with grass tufts and a flower bed, bushes, the pavement and
// its kerb, the lot with its painted bays, lamp posts, a bench, and a painted sky by the hour. (Dev only,
// for the mocks; the tree is organic, from tools/art/life/build_tree.py.)
//
// The facade runs along x on z 0, facing +z; the lot lies toward +z.
import {
  BackSide,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTex, type LifeMats, lifeWindow, mix3, noise2, put, rbox, rgb, worldUV } from "./life-kit";

export type Hour = "noon" | "dusk" | "night";

// ── painted ground ─────────────────────────────────────────────────────────────────────────────

/** Asphalt: a warm dark grey, soft lighter wear, a fine aggregate — 4 m across. */
export function asphaltTex(seed = 41): Texture {
  const n = noise2(seed);
  return canvasTex(512, 512, (u, v) => {
    const wear = n(u * 3, v * 3, 4);
    const grit = n(u * 120, v * 120, 1);
    const k = 0.26 + 0.06 * wear + 0.035 * grit;
    return [k * 1.02, k, k * 0.98];
  });
}

/** Concrete paving: pale warm slabs 1.5 m square, a darker joint, a faint mottle — 3 m across. */
export function pavingTex(seed = 42): Texture {
  const n = noise2(seed);
  return canvasTex(512, 512, (u, v) => {
    const fu = (u * 2) % 1;
    const fv = (v * 2) % 1;
    const joint = Math.min(1, Math.min(fu, 1 - fu, fv, 1 - fv) * 90);
    const k = (0.72 + 0.06 * n(u * 5, v * 5, 3)) * (0.75 + 0.25 * joint);
    return [k, k * 0.98, k * 0.94];
  });
}

/** A lawn: a lush painted green, soft lighter and darker drifts, a fine stipple of blades — 4 m. */
export function lawnTex(seed = 43): Texture {
  const n = noise2(seed);
  const a = rgb(0x5c8a3a);
  const b = rgb(0x7aa64a);
  return canvasTex(512, 512, (u, v) => {
    const drift = n(u * 4, v * 4, 4);
    const blades = n(u * 160, v * 40, 1);
    const c = mix3(a, b, drift * 0.8 + blades * 0.25);
    return [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92];
  });
}

/** Plaster for a facade, warm cream — 4 m. */
function facadeTex(seed = 44): Texture {
  const n = noise2(seed);
  const B = rgb(0xece0c8);
  return canvasTex(256, 256, (u, v) => {
    const k = 1 + (n(u * 5, v * 5, 4) - 0.5) * 0.07;
    return [B[0] * k, B[1] * k, B[2] * k];
  });
}

/** A card of grass blades (or flowers on stems) on a clear ground, for the tufts. */
function tuftTex(flowers: boolean, seed: number): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let r = seed * 9301 + 49297;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  for (let i = 0; i < 26; i++) {
    const x = 20 + rnd() * 88;
    const h = 60 + rnd() * 60;
    const lean = (rnd() - 0.5) * 30;
    g.strokeStyle = `hsl(${88 + rnd() * 20}, ${45 + rnd() * 15}%, ${28 + rnd() * 18}%)`;
    g.lineWidth = 3 + rnd() * 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
    g.stroke();
    if (flowers && i % 3 === 0) {
      g.fillStyle = ["#f2c14e", "#e86a5c", "#f4f0e6", "#b88ad6", "#f29ab8"][Math.floor(rnd() * 5)];
      g.beginPath();
      g.arc(x + lean, 128 - h, 7 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f6d36b";
      g.beginPath();
      g.arc(x + lean, 128 - h, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Many tufts (two crossed cards each) scattered over a rectangle: one draw. */
function tufts(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  count: number,
  flowers: boolean,
  seed: number,
  height = 1,
): InstancedMesh {
  const quad = new PlaneGeometry(0.34, 0.3).translate(0, 0.15, 0);
  const cross = quad.clone().rotateY(Math.PI / 2);
  const both = new PlaneGeometry(0.34, 0.3).translate(0, 0.15, 0);
  // (two crossed planes, merged by hand: positions, normals, uvs, the index)
  const merged = mergeTwo(both, cross);
  quad.dispose();
  const mat = new MeshStandardMaterial({
    map: tuftTex(flowers, seed),
    alphaTest: 0.4,
    side: DoubleSide,
    roughness: 0.9,
  });
  const im = new InstancedMesh(merged, mat, count);
  let r = seed * 7919 + 1;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const s = 0.7 + rnd() * 0.7;
    q.setFromAxisAngle(up, rnd() * Math.PI);
    m.compose(
      new Vector3(x0 + rnd() * (x1 - x0), 0, z0 + rnd() * (z1 - z0)),
      q,
      new Vector3(s, s * (0.8 + rnd() * 0.5) * height, s),
    );
    im.setMatrixAt(i, m);
  }
  im.receiveShadow = true;
  return im;
}

function mergeTwo(a: PlaneGeometry, b: PlaneGeometry): PlaneGeometry {
  const out = new PlaneGeometry();
  const cat = (k: string, size: number) => {
    const x = a.getAttribute(k).array as Float32Array;
    const y = b.getAttribute(k).array as Float32Array;
    const z = new Float32Array(x.length + y.length);
    z.set(x);
    z.set(y, x.length);
    out.setAttribute(k, new (a.getAttribute(k).constructor as typeof import("three").BufferAttribute)(z, size));
  };
  cat("position", 3);
  cat("normal", 3);
  cat("uv", 2);
  const ia = Array.from(a.index?.array ?? []);
  const off = a.getAttribute("position").count;
  const ib = Array.from(b.index?.array ?? []).map((i) => i + off);
  out.setIndex([...ia, ...ib]);
  return out;
}

// ── the building's front ───────────────────────────────────────────────────────────────────────

/** The headquarters' front, `w` wide, four storeys (3.3 m): banded plaster, a stone plinth, a cornice,
 *  framed windows on the upper floors (some lit at night), a glass entrance under a canopy with the
 *  name on it. */
export function lifeFacade(M: LifeMats, w: number, hour: Hour, seed = 1): Group {
  const g = new Group();
  const FLOORS = 4;
  const H = 3.3 * FLOORS;
  const plaster = new MeshStandardMaterial({ map: facadeTex(), roughness: 0.92 });
  (plaster.map as Texture).repeat.set(w / 4, H / 4);
  (plaster.map as Texture).wrapS = (plaster.map as Texture).wrapT = 1000;
  const wall = new Mesh(new PlaneGeometry(w, H), plaster);
  wall.position.set(0, H / 2, 0);
  wall.receiveShadow = true;
  g.add(wall);
  const trim = new MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.6 });
  const stone = new MeshStandardMaterial({ color: 0x9a9184, roughness: 0.85 });
  put(g, rbox(w, 0.6, 0.12, 0.02, 2), stone, 0, 0.3, 0.06);
  for (let f = 1; f < FLOORS; f++) put(g, rbox(w, 0.18, 0.1, 0.02, 2), trim, 0, f * 3.3, 0.05);
  put(g, rbox(w + 0.3, 0.45, 0.35, 0.04, 3), trim, 0, H + 0.1, 0.12);
  // windows: three upper floors, every 3 m; at night some rooms lit, some dark
  let r = seed * 9301 + 49297;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  const night = hour === "night";
  const dark = new MeshPhysicalMaterial({ color: 0x2c3a48, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.4 });
  const lit = new MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc878, emissiveIntensity: 1.25 });
  const warmDay = new MeshPhysicalMaterial({ color: 0x46566a, roughness: 0.1, envMapIntensity: 1.3 });
  for (let f = 1; f < FLOORS; f++)
    for (let x = -w / 2 + 2.2; x < w / 2 - 1.5; x += 3) {
      // (none over the entrance on the first floor: the name hangs there)
      if (f === 1 && Math.abs(x) < 4.2) continue;
      const win = lifeWindow(M, 1.3, 1.65);
      win.position.set(x, f * 3.3 + 1.55, 0.07);
      g.add(win);
      const pane = new Mesh(
        rbox(1.3, 1.65, 0.01, 0.002, 1),
        night ? (rnd() > 0.45 ? lit : dark) : rnd() > 0.5 ? dark : warmDay,
      );
      pane.position.set(x, f * 3.3 + 1.55, 0.02);
      g.add(pane);
      put(g, rbox(1.55, 0.06, 0.16, 0.01, 2), trim, x, f * 3.3 + 0.62, 0.1);
    }
  // the entrance: a glass front between dark frames, the doors in the middle, a canopy on two columns
  const EW = 11;
  const glassIn = new MeshPhysicalMaterial({
    color: night ? 0xffe0a8 : 0x7d93a4,
    roughness: 0.05,
    envMapIntensity: 1.4,
    emissive: night ? 0xffc070 : 0x5a4028,
    emissiveIntensity: night ? 1.0 : 0.35,
  });
  const frame = new MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 });
  put(g, rbox(EW, 2.9, 0.04, 0.005, 1), glassIn, 0, 0.6 + 1.45, 0.08);
  for (let i = 0; i <= 8; i++) put(g, rbox(0.07, 2.9, 0.1, 0.01, 2), frame, -EW / 2 + (i * EW) / 8, 2.05, 0.1);
  put(g, rbox(EW + 0.1, 0.09, 0.12, 0.01, 2), frame, 0, 3.5, 0.1);
  put(g, rbox(EW + 0.1, 0.09, 0.12, 0.01, 2), frame, 0, 0.62, 0.1);
  // the canopy and its name
  put(g, rbox(8, 0.3, 2.6, 0.05, 3), trim, 0, 3.95, 1.3);
  for (const sx of [-1, 1]) put(g, worldUV(new CylinderGeometry(0.14, 0.16, 3.8, 24), 1), trim, sx * 3.6, 1.9, 2.4);
  const sign = document.createElement("canvas");
  sign.width = 1024;
  sign.height = 160;
  const sg = sign.getContext("2d") as CanvasRenderingContext2D;
  sg.fillStyle = "#33363b";
  sg.fillRect(0, 0, 1024, 160);
  sg.fillStyle = night ? "#fff2d8" : "#f4ead6";
  sg.font = "600 112px Georgia, 'Times New Roman', serif";
  sg.textAlign = "center";
  sg.textBaseline = "middle";
  sg.letterSpacing = "28px";
  sg.fillText("YUTOPIA", 512, 86);
  const st = new CanvasTexture(sign);
  st.colorSpace = SRGBColorSpace;
  const signMesh = new Mesh(
    new PlaneGeometry(5.2, 0.81),
    new MeshStandardMaterial({
      map: st,
      roughness: 0.5,
      emissive: night ? 0xffffff : 0x000000,
      emissiveMap: night ? st : null,
      emissiveIntensity: night ? 0.55 : 0,
    }),
  );
  signMesh.position.set(0, 4.55, 0.06);
  g.add(signMesh);
  put(g, rbox(5.4, 0.95, 0.06, 0.01, 2), frame, 0, 4.55, 0.02);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  wall.castShadow = false;
  return g;
}

// ── the ground and what stands on it ───────────────────────────────────────────────────────────

/** The ground before the front: a lawn strip with a flower bed along the plinth and tufts, the path
 *  to the doors, the pavement and its kerb, the lot with its bays. */
export function lifeGround(w: number): Group {
  const g = new Group();
  const lawn = new MeshStandardMaterial({ map: lawnTex(), roughness: 0.95 });
  (lawn.map as Texture).repeat.set(w / 4, 1.2);
  (lawn.map as Texture).wrapS = (lawn.map as Texture).wrapT = 1000;
  const pave = new MeshStandardMaterial({ map: pavingTex(), roughness: 0.85 });
  (pave.map as Texture).wrapS = (pave.map as Texture).wrapT = 1000;
  const asphalt = new MeshStandardMaterial({ map: asphaltTex(), roughness: 0.92 });
  (asphalt.map as Texture).wrapS = (asphalt.map as Texture).wrapT = 1000;
  const flat = (mat: MeshStandardMaterial, x0: number, x1: number, z0: number, z1: number, y: number, rep: number) => {
    const m = new Mesh(new PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat.clone());
    const map = (m.material as MeshStandardMaterial).map;
    if (map) {
      const t = map.clone();
      t.repeat.set((x1 - x0) / rep, (z1 - z0) / rep);
      t.needsUpdate = true;
      (m.material as MeshStandardMaterial).map = t;
    }
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const X0 = -w / 2;
  const X1 = w / 2;
  // lawn either side of the path, the path, the pavement, the kerb, the lot (and the land round it)
  flat(lawn, X0, -2.2, 0, 4.8, 0.02, 4);
  flat(lawn, 2.2, X1, 0, 4.8, 0.02, 4);
  flat(pave, -2.2, 2.2, 0, 4.8, 0.025, 3);
  flat(pave, X0, X1, 4.8, 7.5, 0.04, 3);
  put(g, rbox(w, 0.14, 0.22, 0.04, 3), new MeshStandardMaterial({ color: 0xc8c2b6, roughness: 0.8 }), 0, 0.07, 7.5);
  flat(asphalt, X0, X1, 7.6, 40, 0.0, 4);
  flat(lawn, X0 - 40, X0, 0, 40, 0.01, 4);
  flat(lawn, X1, X1 + 40, 0, 40, 0.01, 4);
  flat(lawn, -80, 80, -60, 0, 0.0, 4);
  flat(lawn, -80, 80, 40, 90, 0.0, 4);
  // the bays: white lines, 2.6 m apart, 5 m long, two rows facing an aisle
  const line = new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  for (let x = X0 + 1; x < X1 - 1; x += 2.6) {
    for (const z of [8.1 + 2.5, 20.5 + 2.5]) {
      const l = new Mesh(new PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2), line);
      l.position.set(x, 0.012, z);
      l.receiveShadow = true;
      g.add(l);
    }
  }
  // tufts on the lawn, a flower bed under the windows
  // (a kept lawn: short, sparse tufts — tall ones read as a meadow; the bed under the windows taller)
  g.add(tufts(X0 + 0.5, -2.6, 1.0, 4.6, 700, false, 3, 0.3));
  g.add(tufts(2.6, X1 - 0.5, 1.0, 4.6, 700, false, 5, 0.3));
  g.add(tufts(X0 + 0.5, -2.6, 0.15, 0.85, 500, true, 7, 0.8));
  g.add(tufts(2.6, X1 - 0.5, 0.15, 0.85, 500, true, 9, 0.8));
  // bushes along the plinth, either side of the doors
  const leafy = new MeshStandardMaterial({ color: 0x4e7a34, roughness: 0.85, flatShading: false });
  for (const x of [-6.2, -4.6, 4.6, 6.2, -11, -14.5, 11, 14.5]) {
    // (its corners welded first: unwelded, each face kept its own normal and the bush came out faceted)
    const geo = mergeVertices(new IcosahedronGeometry(0.7, 5));
    const p = geo.getAttribute("position");
    const n = noise2(Math.round(x * 10));
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.18 * (n(v.x * 3 + 5, v.y * 3 + v.z * 2, 2) - 0.5) * 2;
      v.multiplyScalar(k);
      v.y = Math.max(-0.1, v.y * 0.85);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    put(g, geo, leafy, x, 0.55, 1.1);
  }
  return g;
}

/** A street lamp, 4.2 m: a dark pole, a lantern head; `on`, it glows. */
export function lifeLampPost(M: LifeMats, on: boolean): Group {
  const g = new Group();
  const iron = new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.45, metalness: 0.6 });
  put(g, new CylinderGeometry(0.06, 0.09, 4.0, 14), iron, 0, 2.0, 0);
  put(g, new CylinderGeometry(0.16, 0.18, 0.3, 14), iron, 0, 0.15, 0);
  put(g, rbox(0.34, 0.06, 0.34, 0.02, 2), iron, 0, 4.03, 0);
  const glass = new MeshStandardMaterial({
    color: 0xfff4dc,
    roughness: 0.3,
    emissive: on ? 0xffd08a : 0x000000,
    emissiveIntensity: on ? 2.2 : 0,
  });
  put(g, new CylinderGeometry(0.12, 0.09, 0.38, 12), glass, 0, 4.25, 0);
  put(g, new CylinderGeometry(0.02, 0.18, 0.14, 12), iron, 0, 4.5, 0);
  void M;
  return g;
}

/** A park bench, 1.6 m: oak slats on dark iron ends. */
export function lifeBench(M: LifeMats): Group {
  const g = new Group();
  const iron = new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.45, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    put(g, rbox(0.06, 0.45, 0.5, 0.02, 2), iron, sx * 0.72, 0.225, 0);
    put(g, rbox(0.06, 0.45, 0.06, 0.02, 2), iron, sx * 0.72, 0.62, -0.24, -0.25);
  }
  for (let i = 0; i < 4; i++) put(g, rbox(1.6, 0.03, 0.09, 0.01, 2, 1), M.wood, 0, 0.45, -0.18 + i * 0.12);
  for (let i = 0; i < 3; i++)
    put(g, rbox(1.6, 0.09, 0.03, 0.01, 2, 1), M.wood, 0, 0.6 + i * 0.12, -0.27 - i * 0.025, -0.25);
  return g;
}

// ── the sky ────────────────────────────────────────────────────────────────────────────────────

/** The sky by the hour: a painted dome — a gradient from the horizon, soft clouds, a sun's glow (or
 *  stars at night). Unlit. */
export function lifeSky(hour: Hour, sunDir: Vector3): Mesh {
  const n = noise2(51);
  const P = {
    noon: { top: 0x5e93d6, hor: 0xcfe2f2, cloud: 0xffffff, sun: 0xfff6e0 },
    dusk: { top: 0x5a6fa8, hor: 0xf6b07a, cloud: 0xf8d2b8, sun: 0xffc27a },
    night: { top: 0x070b1a, hor: 0x18213a, cloud: 0x1e2638, sun: 0x000000 },
  }[hour];
  const top = rgb(P.top);
  const hor = rgb(P.hor);
  const cloud = rgb(P.cloud);
  const sun = rgb(P.sun);
  const sd = sunDir.clone().normalize();
  const tex = canvasTex(1024, 512, (u, v) => {
    // (an equirectangular dome: u round, v from the top down)
    const lon = u * Math.PI * 2;
    const lat = (0.5 - v) * Math.PI;
    const dir = new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    const up = Math.max(0, dir.y);
    let c = mix3(hor, top, up ** 0.55);
    if (hour === "night") {
      const star = n(u * 600, v * 300, 1) > 0.986 && dir.y > 0.05 ? 0.7 : 0;
      c = [c[0] + star, c[1] + star, c[2] + star];
    } else {
      const glow = Math.max(0, dir.dot(sd)) ** 24;
      c = mix3(c, sun, Math.min(1, glow * (hour === "dusk" ? 1.2 : 0.7)));
    }
    const cl = n(u * 9, v * 14, 4);
    const k = Math.max(0, Math.min(1, (cl - 0.55) * 4)) * Math.min(1, up * 4) * (1 - up * 0.6);
    return mix3(c, cloud, k * (hour === "night" ? 0.35 : 0.85));
  });
  const m = new Mesh(
    new SphereGeometry(300, 48, 24),
    new MeshBasicMaterial({ map: tex, side: BackSide, fog: false, depthWrite: false }),
  );
  m.renderOrder = -1;
  return m;
}

export const SKY_COLOUR: Record<Hour, number> = { noon: 0xcfe2f2, dusk: 0xf0b88c, night: 0x141c30 };
