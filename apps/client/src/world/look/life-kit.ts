// Plan 73, phase 0c — the life look's things, by the code kit as F2 chose (furniture and buildings
// stay made by code: bevels and rounds on every edge, real UVs, and a painted texture library v0
// drawn on canvases here — wood, fabric, metal, plaster, floorboards). Three pieces for the mock: a
// three-seat sofa, a desk with its things, an office chair. (Dev only, for the mocks; the plant is
// organic, from tools/art/life/build_plant.py.)
//
// Every piece faces +z (its user stands or sits on the +z side), sits on y 0, centred on x and z,
// in metres.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { libMaterial } from "./life-matlib";

// ── the painted texture library v0 ──────────────────────────────────────────────────────────────

/** Smooth value noise, 0…1 (a few octaves of it, for painted mottling and grain). */
export function noise2(seed: number) {
  const h = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const v = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x: number, y: number, oct = 3) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    let tot = 0;
    for (let i = 0; i < oct; i++) {
      s += v(x * f, y * f) * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / tot;
  };
}

export function canvasTex(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, gg, b] = paint(x / w, y / h);
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, gg * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export const rgb = (hex: number): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b].map((x) => x ** (1 / 2.2)) as [number, number, number]; // (sRGB-ish, painted in)
};
export const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Wood, its grain along u: soft painted bands, a slow drift of tone, few dark lines — 1 m across. */
export function woodTex(light: number, dark: number, seed = 1): Texture {
  const n = noise2(seed);
  const L = rgb(light);
  const D = rgb(dark);
  return canvasTex(512, 256, (u, v) => {
    const warp = n(u * 3, v * 6, 3) * 2.2;
    const bands = 0.5 + 0.5 * Math.sin((v * 22 + warp) * Math.PI);
    const fine = n(u * 40, v * 90, 2);
    const t = 0.25 + 0.4 * bands ** 2.2 + 0.22 * n(u * 1.5, v * 3, 2) + 0.08 * fine;
    return mix3(L, D, Math.min(1, t));
  });
}

/** Upholstery: its colour with a soft painted mottle and the faintest weave — 0.5 m across. */
export function fabricTex(base: number, seed = 2): Texture {
  const n = noise2(seed);
  const B = rgb(base);
  return canvasTex(256, 256, (u, v) => {
    const mott = (n(u * 4, v * 4, 3) - 0.5) * 0.12;
    const weave = Math.sin(u * 256 * 0.9 * Math.PI) * Math.sin(v * 256 * 0.9 * Math.PI) * 0.018;
    const k = 1 + mott + weave;
    return [B[0] * k, B[1] * k, B[2] * k];
  });
}

/** Floorboards: planks 0.18 m wide, each its own tone, a soft dark seam between — 2 m across. */
export function floorTex(light: number, dark: number, seed = 3): Texture {
  const n = noise2(seed);
  const L = rgb(light);
  const D = rgb(dark);
  const PLANKS = 11;
  return canvasTex(1024, 1024, (u, v) => {
    const p = Math.floor(v * PLANKS);
    const inP = v * PLANKS - p;
    // (a fraction always 0…1: a negative one painted whole planks black)
    const r = Math.sin(p * 12.9898) * 43758.5453;
    const shift = r - Math.floor(r);
    const len = (u + shift) % 0.5;
    const seam = Math.min(1, Math.min(inP, 1 - inP) * 40) * Math.min(1, Math.min(len, 0.5 - len) * 160);
    const tone = 0.3 + 0.35 * ((((p * 0.618) % 1) + 1) % 1) + 0.2 * n(u * 2, v * 30, 3);
    const grain = 0.08 * Math.sin((inP * 6 + n(u * 4, p, 2) * 3) * Math.PI);
    const c = mix3(L, D, Math.min(1, tone + grain));
    const s = 0.55 + 0.45 * seam;
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}

/** Plaster: an even warm paint, a whisper of trowel mottle — 2 m across. */
export function plasterTex(base: number, seed = 4): Texture {
  const n = noise2(seed);
  const B = rgb(base);
  return canvasTex(256, 256, (u, v) => {
    const k = 1 + (n(u * 6, v * 6, 4) - 0.5) * 0.06;
    return [B[0] * k, B[1] * k, B[2] * k];
  });
}

// ── the materials ───────────────────────────────────────────────────────────────────────────────

const withRepeat = (t: Texture, k: number) => {
  t.repeat.set(k, k);
  return t;
};

export interface LifeMats {
  fabric: Material;
  accent: Material;
  wood: Material;
  darkWood: Material;
  metal: Material;
  plastic: Material;
  chairFabric: Material;
  white: Material;
  screen: Material;
}

export function lifeMats(): LifeMats {
  const cloth = (hex: number, seed: number) =>
    new MeshPhysicalMaterial({
      // (its half-metre canvas twice a metre: the kit's UVs are in metres, as the library's — phase 3)
      map: withRepeat(fabricTex(hex, seed), 2),
      roughness: 0.92,
      sheen: 0.6,
      sheenColor: new Color(hex).lerp(new Color(1, 1, 1), 0.45),
      sheenRoughness: 0.6,
    });
  const varnished = (light: number, dark: number, seed: number) =>
    new MeshPhysicalMaterial({
      map: woodTex(light, dark, seed),
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
  return {
    fabric: cloth(0x5f8290, 2),
    accent: cloth(0xd9a44c, 5),
    chairFabric: cloth(0x41454d, 7),
    wood: varnished(0xc49563, 0x8a5a36, 1),
    darkWood: varnished(0x7a5236, 0x4a2f1e, 9),
    metal: new MeshStandardMaterial({ color: 0x2f3236, roughness: 0.32, metalness: 0.85 }),
    plastic: new MeshStandardMaterial({ color: 0x26282c, roughness: 0.55 }),
    white: new MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.4 }),
    screen: new MeshStandardMaterial({ color: 0x1a2430, roughness: 0.15, emissive: 0x3b5a78, emissiveIntensity: 0.35 }),
  };
}

/** The same parts in the material library's materials (phase 3: look/life-matlib.ts) — the sofa linen,
 *  the cushions velvet, the chair tweed, oak and walnut, brushed steel. */
export function lifeLibMats(renderer: WebGLRenderer): LifeMats {
  const v0 = lifeMats();
  return {
    ...v0,
    fabric: libMaterial("linen", renderer, { color: 0x5f8290 }),
    accent: libMaterial("velvet", renderer, { color: 0xd9a44c }),
    chairFabric: libMaterial("tweed", renderer, { color: 0x41454d }),
    wood: libMaterial("oak", renderer),
    darkWood: libMaterial("walnut", renderer),
    metal: libMaterial("metal-brushed", renderer, { color: 0x3a3d42 }),
  };
}

// ── the shapes ─────────────────────────────────────────────────────────────────────────────────

/** UVs by where a face is in the world (metres × `k`), along its own two axes: grain and weave come
 *  out the same size on every part, and run along a long part. */
export function worldUV(g: BufferGeometry, k = 1, grainAlongZ = false): BufferGeometry {
  const p = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) [u, v] = grainAlongZ ? [z, x] : [x, z];
    else if (ax >= az) [u, v] = grainAlongZ ? [z, y] : [y, z];
    else [u, v] = [x, y];
    uv[i * 2] = u * k;
    uv[i * 2 + 1] = v * k;
  }
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

/** A box with its edges rounded (r), UV'd by the world. */
export function rbox(w: number, h: number, d: number, r: number, seg = 3, k = 1, alongZ = false): BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
  return worldUV(g, k, alongZ);
}

/** A cushion: a rounded box, its faces' middles swelling (`puff` of its height), a soft dip in its
 *  top's middle (`sag`, m) where it's been sat on. */
export function cushion(
  w: number,
  h: number,
  d: number,
  r: number,
  puff: number,
  sag = 0,
  channels = 0,
): BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 6, Math.min(r, h / 2, w / 2, d / 2) * 0.999);
  const p = g.getAttribute("position");
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const x = (v.x / w) * 2;
    const z = (v.z / d) * 2;
    const yy = (v.y / h) * 2;
    const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    v.y *= 1 + puff * k;
    // (the sides swell too, a little: a cushion is stuffed)
    v.x *= 1 + puff * 0.25 * Math.max(0, 1 - yy * yy) * Math.max(0, 1 - z * z);
    v.z *= 1 + puff * 0.25 * Math.max(0, 1 - yy * yy) * Math.max(0, 1 - x * x);
    if (v.y > 0) v.y -= sag * k;
    // (stitched channels across its front: a padded back's tufting, `channels` grooves)
    if (channels > 0 && v.z > 0) {
      const f = ((v.y / h + 0.5) * (channels + 1)) % 1;
      v.z -= 0.012 * Math.exp(-((f - 0.5) ** 2) / 0.004) * Math.max(0, 1 - x * x);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return worldUV(g, 1);
}

export function put(
  parent: Group,
  g: BufferGeometry,
  m: Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const mesh = new Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A leg that narrows to its foot. */
export function leg(h: number, r0: number, r1: number): BufferGeometry {
  return worldUV(new CylinderGeometry(r0, r1, h, 16, 1), 1, true);
}

// ── the pieces ─────────────────────────────────────────────────────────────────────────────────

/** A three-seat sofa, 2.1 m: a soft frame, three seat and three back cushions, rolled arms, two
 *  throw pillows, short tapered wooden legs. The seat's top at ~0.47. */
export function lifeSofa(M: LifeMats): Group {
  const g = new Group();
  const W = 2.1;
  const D = 0.92;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(g, leg(0.09, 0.022, 0.015), M.darkWood, sx * (W / 2 - 0.12), 0.045, sz * (D / 2 - 0.1));
  put(g, rbox(W, 0.22, D - 0.04, 0.05, 4), M.fabric, 0, 0.09 + 0.11, 0);
  // the back, and the arms (rolled: a rounded box and a bolster along its top)
  put(g, rbox(W, 0.5, 0.2, 0.07, 4), M.fabric, 0, 0.31 + 0.25, -D / 2 + 0.1);
  for (const sx of [-1, 1]) {
    put(g, rbox(0.2, 0.32, D - 0.02, 0.07, 4), M.fabric, sx * (W / 2 - 0.1), 0.31 + 0.16, 0);
    put(
      g,
      worldUV(new CylinderGeometry(0.115, 0.115, D - 0.02, 24, 1), 1, true),
      M.fabric,
      sx * (W / 2 - 0.1),
      0.31 + 0.32,
      0,
      Math.PI / 2,
    );
  }
  // seat and back cushions
  const cw = (W - 0.4) / 3;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * cw;
    put(g, cushion(cw - 0.01, 0.15, D - 0.26, 0.05, 0.16, i === 1 ? 0.012 : 0.004), M.fabric, x, 0.31 + 0.08, 0.06);
    put(g, cushion(cw - 0.01, 0.44, 0.16, 0.06, 0.14), M.fabric, x, 0.39 + 0.27, -D / 2 + 0.25, -0.2);
  }
  // two throw pillows, at the ends
  for (const sx of [-1, 1])
    put(
      g,
      cushion(0.4, 0.4, 0.12, 0.06, 0.35),
      M.accent,
      sx * (W / 2 - 0.36),
      0.62,
      -0.16,
      -0.32,
      sx * 0.35,
      sx * 0.12,
    );
  return g;
}

/** A desk, 1.4 × 0.7, its top at 0.75: oak with a soft edge, a drawer pedestal, tapered legs on the
 *  other side, a laptop, a mug and a notebook on it. */
export function lifeDesk(M: LifeMats): Group {
  const g = new Group();
  const W = 1.4;
  const D = 0.7;
  const H = 0.75;
  put(g, rbox(W, 0.035, D, 0.012, 3, 1), M.wood, 0, H - 0.0175, 0);
  // the pedestal (three drawers) on the right, two tapered legs on the left
  put(g, rbox(0.42, H - 0.04, D - 0.06, 0.012, 3, 1, true), M.wood, W / 2 - 0.24, (H - 0.04) / 2, 0);
  for (let i = 0; i < 3; i++) {
    const y = 0.12 + i * 0.22;
    put(g, rbox(0.38, 0.19, 0.02, 0.008, 3, 1), M.wood, W / 2 - 0.24, y + 0.03, D / 2 - 0.02);
    put(g, rbox(0.12, 0.012, 0.02, 0.005, 2), M.metal, W / 2 - 0.24, y + 0.1, D / 2 + 0.002);
  }
  for (const sz of [-1, 1])
    put(g, leg(H - 0.035, 0.024, 0.016), M.wood, -W / 2 + 0.07, (H - 0.035) / 2, sz * (D / 2 - 0.07));
  put(g, rbox(W - 0.5, 0.08, 0.02, 0.008, 2, 1), M.wood, -0.2, H - 0.08, -D / 2 + 0.04);
  // a laptop, open; a mug; a notebook
  const lap = new Group();
  put(lap, rbox(0.33, 0.016, 0.23, 0.006, 3), M.metal, 0, 0.008, 0);
  const lid = new Group();
  put(lid, rbox(0.33, 0.22, 0.008, 0.005, 3), M.metal, 0, 0.11, 0);
  put(lid, rbox(0.3, 0.19, 0.002, 0.002, 2), M.screen, 0, 0.11, 0.005);
  lid.position.set(0, 0.016, -0.115);
  lid.rotation.x = -0.32;
  lap.add(lid);
  lap.position.set(-0.15, H, -0.02);
  lap.rotation.y = 0.12;
  g.add(lap);
  put(g, worldUV(new CylinderGeometry(0.04, 0.036, 0.095, 24, 1), 1), M.white, 0.22, H + 0.0475, 0.08);
  put(g, rbox(0.15, 0.012, 0.21, 0.004, 2), M.accent, 0.22, H + 0.006, -0.16, 0, -0.25);
  return g;
}

/** An office chair: a padded seat at 0.47, a curved padded back, armrests, a gas lift, a five-star
 *  base on casters. */
export function lifeChair(M: LifeMats): Group {
  const g = new Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = put(
      g,
      rbox(0.3, 0.03, 0.05, 0.012, 3),
      M.plastic,
      Math.cos(a) * 0.15,
      0.075,
      Math.sin(a) * 0.15,
      0,
      -a,
    );
    arm.rotation.z = 0;
    put(g, new SphereGeometry(0.026, 16, 12), M.plastic, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
  }
  put(g, new CylinderGeometry(0.035, 0.035, 0.04, 20), M.plastic, 0, 0.08, 0);
  put(g, new CylinderGeometry(0.022, 0.022, 0.3, 20), M.metal, 0, 0.24, 0);
  put(g, rbox(0.22, 0.04, 0.22, 0.01, 2), M.plastic, 0, 0.4, 0);
  put(g, cushion(0.48, 0.07, 0.46, 0.03, 0.3, 0.006), M.chairFabric, 0, 0.44, 0.01);
  // the back: a stem from under the seat, a padded shell curving round the sitter
  put(g, rbox(0.05, 0.36, 0.025, 0.01, 2), M.plastic, 0, 0.5, -0.24, -0.08);
  const back = cushion(0.44, 0.5, 0.07, 0.035, 0.18, 0, 4);
  {
    const p = back.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.55 * p.getX(i) ** 2);
    back.computeVertexNormals();
  }
  put(g, back, M.chairFabric, 0, 0.85, -0.25, -0.1);
  // (its shell behind, a little wider, curved as it is)
  const shell = rbox(0.47, 0.54, 0.02, 0.01, 3);
  {
    const p = shell.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.55 * p.getX(i) ** 2);
    shell.computeVertexNormals();
  }
  put(g, shell, M.plastic, 0, 0.85, -0.295, -0.1);
  for (const sx of [-1, 1]) {
    put(g, rbox(0.03, 0.17, 0.03, 0.01, 2), M.plastic, sx * 0.25, 0.54, -0.02);
    put(g, rbox(0.07, 0.03, 0.26, 0.014, 3), M.plastic, sx * 0.25, 0.64, 0.0);
  }
  return g;
}

// ── the room's touches ────────────────────────────────────────────────────────────────────────

/** A rounded rectangle, extruded `h` up with its edges softened (a table's top, round in plan). */
function slab(w: number, d: number, h: number, r: number, bevel: number): BufferGeometry {
  const s = new Shape();
  const x0 = -w / 2;
  const z0 = -d / 2;
  s.moveTo(x0 + r, z0);
  s.lineTo(x0 + w - r, z0);
  s.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
  s.lineTo(x0 + w, z0 + d - r);
  s.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
  s.lineTo(x0 + r, z0 + d);
  s.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r);
  s.lineTo(x0, z0 + r);
  s.quadraticCurveTo(x0, z0, x0 + r, z0);
  const g = new ExtrudeGeometry(s, {
    depth: h - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 12,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, h - bevel, 0);
  g.computeVertexNormals();
  return worldUV(g, 1);
}

/** A coffee table, 1.0 × 0.55, its top at 0.42: oak, round-cornered, tapered legs; a book and a mug. */
export function lifeCoffeeTable(M: LifeMats): Group {
  const g = new Group();
  put(g, slab(1.0, 0.55, 0.04, 0.09, 0.012), M.wood, 0, 0.38, 0);
  put(g, slab(0.9, 0.45, 0.02, 0.07, 0.006), M.wood, 0, 0.12, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) put(g, leg(0.4, 0.02, 0.014), M.wood, sx * 0.4, 0.2, sz * 0.2, sz * 0.06, 0, -sx * 0.06);
  put(g, rbox(0.24, 0.03, 0.17, 0.006, 2), M.accent, -0.2, 0.435, 0.02, 0, 0.3);
  put(g, rbox(0.22, 0.025, 0.16, 0.006, 2), M.fabric, -0.21, 0.462, 0.03, 0, 0.18);
  put(g, new CylinderGeometry(0.04, 0.036, 0.095, 24, 1), M.white, 0.25, 0.4675, -0.05);
  return g;
}

/** A low bookcase, 0.9 × 1.15 × 0.32: oak, two shelves of books (each its own colour and height, a few
 *  leaning), a little box. Seeded. */
export function lifeBookcase(M: LifeMats, seed = 1): Group {
  const g = new Group();
  const W = 0.9;
  const H = 1.15;
  const D = 0.32;
  const t = 0.022;
  for (const sx of [-1, 1]) put(g, rbox(t, H, D, 0.006, 2, 1, true), M.wood, sx * (W / 2 - t / 2), H / 2, 0);
  for (const y of [0.04, 0.4, 0.77, H - t / 2]) put(g, rbox(W - 0.01, t, D, 0.006, 2), M.wood, 0, y, 0);
  put(g, rbox(W - 2 * t, H - 0.05, 0.01, 0.003, 1), M.darkWood, 0, H / 2, -D / 2 + 0.005);
  const COLS = [0x8c3b32, 0x2f5a6e, 0xd9a44c, 0x4e6b3c, 0xe8e0cf, 0x5b4a7a, 0x3a3d44, 0xb8603b, 0x7a9aa8];
  let r = seed * 9301 + 49297;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  const book = (hex: number) => new MeshStandardMaterial({ color: hex, roughness: 0.65 });
  const mats = COLS.map(book);
  for (const shelf of [0.04 + t / 2, 0.4 + t / 2, 0.77 + t / 2]) {
    let x = -W / 2 + t + 0.02;
    const end = W / 2 - t - (shelf > 0.5 ? 0.2 : 0.03);
    while (x < end) {
      const bw = 0.022 + rnd() * 0.03;
      const bh = 0.2 + rnd() * 0.1;
      const lean = rnd() > 0.88 ? 0.25 : 0;
      put(
        g,
        rbox(bw, bh, 0.2 + rnd() * 0.05, 0.004, 1),
        mats[Math.floor(rnd() * mats.length)],
        x + bw / 2 + lean * 0.12,
        shelf + bh / 2,
        0.01,
        0,
        0,
        -lean,
      );
      x += bw + 0.002 + lean * 0.15;
    }
  }
  put(g, rbox(0.14, 0.1, 0.14, 0.01, 2), M.accent, W / 2 - t - 0.11, 0.77 + t / 2 + 0.05, 0.02);
  return g;
}

/** A floor lamp: a weighted disc, a slim pole, a cream drum shade; `on`, it glows (its light is the
 *  scene's). */
export function lifeFloorLamp(M: LifeMats, on: boolean): Group {
  const g = new Group();
  put(g, new CylinderGeometry(0.15, 0.16, 0.025, 32), M.metal, 0, 0.0125, 0);
  put(g, new CylinderGeometry(0.011, 0.011, 1.45, 10), M.metal, 0, 0.74, 0);
  const shade = new MeshStandardMaterial({
    color: 0xf3ead8,
    roughness: 0.9,
    side: DoubleSide,
    emissive: on ? 0xffc27a : 0x000000,
    emissiveIntensity: on ? 1.6 : 0,
  });
  const lat = new LatheGeometry([new Vector2(0.21, 0), new Vector2(0.17, 0.3)], 40);
  put(g, lat, shade, 0, 1.42, 0);
  return g;
}

/** A painting: a soft painted landscape (sky, far hills, a field, a low sun) in a thin oak frame,
 *  `w` × `h` m. Seeded. */
export function lifePicture(M: LifeMats, w: number, h: number, seed = 1): Group {
  const g = new Group();
  const n = noise2(seed);
  const sky = rgb([0xf2c98a, 0xa9c6de, 0xe8a98a][seed % 3]);
  const top = rgb([0x7aa0c8, 0x5d84b0, 0xb07a9a][seed % 3]);
  const hill = rgb([0x5f7a5a, 0x4d6a6e, 0x6a5a7a][seed % 3]);
  const field = rgb([0xc9a45c, 0x8fae6a, 0xd6a07a][seed % 3]);
  const tex = canvasTex(256, Math.round((256 * h) / w), (u, v) => {
    const y = 1 - v;
    const horizon = 0.42 + 0.08 * n(u * 2, 1, 3);
    const far = 0.5 + 0.1 * n(u * 3 + 5, 2, 3);
    const sun = Math.exp(-((u - 0.7) ** 2 + (y - 0.62) ** 2 * 1.4) / 0.004);
    if (y > far) {
      const c = mix3(sky, top, (y - far) / (1 - far));
      return mix3(c, [1, 0.95, 0.85], Math.min(1, sun));
    }
    if (y > horizon) return mix3(hill, sky, ((y - horizon) / (far - horizon)) * 0.35);
    return mix3(field, hill, 0.3 * n(u * 6, y * 6, 3) + (horizon - y) * 0.4);
  });
  put(g, rbox(w + 0.06, h + 0.06, 0.03, 0.006, 2), M.wood, 0, 0, 0);
  const canvas = new Mesh(rbox(w, h, 0.005, 0.001, 1), new MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  // (the painting's own UVs, 0…1 over its face, not the world's)
  const uv = canvas.geometry.getAttribute("uv");
  const pos = canvas.geometry.getAttribute("position");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  canvas.position.z = 0.016;
  g.add(canvas);
  return g;
}

/** A window `w` × `h`: a painted white frame with a cross of glazing bars, an oak sill, the glass
 *  (faintly blue, see-through). Its middle at the origin, its face on z 0 (the room's side +z). */
export function lifeWindow(M: LifeMats, w: number, h: number): Group {
  const g = new Group();
  const f = 0.06;
  const depth = 0.12;
  const frame = new MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.45 });
  put(g, rbox(w + f * 2, f, depth, 0.008, 2), frame, 0, h / 2 + f / 2, 0);
  put(g, rbox(w + f * 2, f, depth, 0.008, 2), frame, 0, -h / 2 - f / 2, 0);
  for (const sx of [-1, 1]) put(g, rbox(f, h, depth, 0.008, 2), frame, sx * (w / 2 + f / 2), 0, 0);
  put(g, rbox(0.035, h, 0.04, 0.006, 2), frame, 0, 0, 0);
  put(g, rbox(w, 0.035, 0.04, 0.006, 2), frame, 0, h * 0.12, 0);
  put(g, rbox(w + f * 2 + 0.1, 0.035, 0.2, 0.01, 2), M.wood, 0, -h / 2 - f - 0.0175, 0.06);
  const glass = new Mesh(
    rbox(w, h, 0.004, 0.001, 1),
    new MeshPhysicalMaterial({ color: 0xdfeefa, roughness: 0.05, transparent: true, opacity: 0.12, metalness: 0 }),
  );
  glass.castShadow = false;
  g.add(glass);
  return g;
}

/** A curtain hung from y 0 down `h`, `w` wide, its folds across x; in `hex` linen. */
export function lifeCurtain(hex: number, w: number, h: number, seed = 1): Mesh {
  const g = new BufferGeometry();
  const NX = 48;
  const NY = 24;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= NY; j++)
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      const v = j / NY;
      const x = (u - 0.5) * w;
      // folds: deeper toward the hem, a gentle sway
      const z = 0.035 * Math.sin(u * Math.PI * 9 + seed) * (0.7 + 0.5 * v) + 0.01 * Math.sin(v * 3 + u * 7);
      pos.push(x, -v * h, z);
      uv.push(x * 2, -v * h * 2);
    }
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  g.setIndex(idx);
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new Mesh(
    g,
    new MeshPhysicalMaterial({
      map: fabricTex(hex, 21 + seed),
      roughness: 0.95,
      sheen: 0.5,
      sheenColor: new Color(hex).lerp(new Color(1, 1, 1), 0.5),
      side: DoubleSide,
    }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A round side table, its top at 0.55: oak, a pedestal, a round foot. */
export function lifeSideTable(M: LifeMats): Group {
  const g = new Group();
  put(g, worldUV(new CylinderGeometry(0.24, 0.24, 0.03, 40), 1), M.wood, 0, 0.535, 0);
  put(g, leg(0.5, 0.03, 0.022), M.wood, 0, 0.27, 0);
  put(g, worldUV(new CylinderGeometry(0.16, 0.17, 0.025, 32), 1), M.wood, 0, 0.0125, 0);
  return g;
}

/** A table lamp: a ceramic gourd base, a pleated cream shade; `on`, it glows. */
export function lifeTableLamp(M: LifeMats, on: boolean): Group {
  const g = new Group();
  const base = new LatheGeometry(
    [
      new Vector2(0.0, 0),
      new Vector2(0.07, 0),
      new Vector2(0.09, 0.06),
      new Vector2(0.075, 0.16),
      new Vector2(0.03, 0.22),
      new Vector2(0.02, 0.27),
      new Vector2(0.0, 0.27),
    ],
    32,
  );
  put(g, base, new MeshPhysicalMaterial({ color: 0x5f8290, roughness: 0.2, clearcoat: 0.6 }), 0, 0, 0);
  const shade = new MeshStandardMaterial({
    color: 0xf3ead8,
    roughness: 0.9,
    side: DoubleSide,
    emissive: on ? 0xffc27a : 0x000000,
    emissiveIntensity: on ? 1.4 : 0,
  });
  put(g, new LatheGeometry([new Vector2(0.17, 0), new Vector2(0.11, 0.2)], 40), shade, 0, 0.26, 0);
  void M;
  return g;
}

/** A glass vase of tulips: a few stems, each with a cupped head. */
export function lifeVase(seed = 1): Group {
  const g = new Group();
  put(
    g,
    new LatheGeometry(
      [
        new Vector2(0, 0),
        new Vector2(0.05, 0),
        new Vector2(0.055, 0.1),
        new Vector2(0.035, 0.18),
        new Vector2(0.04, 0.2),
      ],
      32,
    ),
    new MeshPhysicalMaterial({ color: 0xcfe4ea, roughness: 0.08, transparent: true, opacity: 0.45 }),
    0,
    0,
    0,
  );
  const stem = new MeshStandardMaterial({ color: 0x4f7a3c, roughness: 0.6 });
  const head = new MeshStandardMaterial({ color: [0xe0574a, 0xf2b84a, 0xe887a6][seed % 3], roughness: 0.55 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const lean = 0.18 + 0.1 * Math.sin(i * 3.1);
    const len = 0.32 + 0.06 * Math.cos(i * 1.7);
    const s = put(
      g,
      new CylinderGeometry(0.004, 0.005, len, 6),
      stem,
      0,
      0.15 + len / 2,
      0,
      Math.cos(a) * lean,
      0,
      Math.sin(a) * lean,
    );
    s.position.set(-Math.sin(a) * lean * len * 0.5, 0.15 + (len / 2) * Math.cos(lean), Math.cos(a) * lean * len * 0.5);
    const tip = new Vector3(-Math.sin(a) * lean * len, 0.15 + len * Math.cos(lean), Math.cos(a) * lean * len);
    const h = put(
      g,
      new LatheGeometry(
        [new Vector2(0, 0), new Vector2(0.022, 0.012), new Vector2(0.026, 0.035), new Vector2(0.018, 0.05)],
        16,
      ),
      head,
      tip.x,
      tip.y,
      tip.z,
    );
    h.rotation.set(Math.cos(a) * lean, 0, Math.sin(a) * lean);
  }
  return g;
}

/** The view out of a window: a painted sky over far wooded hills and a lawn — by night a deep blue,
 *  a few stars. Unlit (the outside is its own light). */
export function lifeOutside(night: boolean, w: number, h: number): Mesh {
  const n = noise2(31);
  const tex = canvasTex(512, 256, (u, v) => {
    const y = 1 - v;
    const ridge = 0.38 + 0.08 * n(u * 3, 2, 3);
    const trees = ridge + 0.04 + 0.05 * n(u * 30, 3, 2);
    if (night) {
      if (y > trees) {
        const star = n(u * 220, y * 110, 1) > 0.985 ? 0.6 : 0;
        return mix3([0.05, 0.07, 0.14], [0.02, 0.03, 0.07], y).map((c) => c + star) as [number, number, number];
      }
      return [0.02, 0.03, 0.04];
    }
    if (y > trees) return mix3([0.86, 0.9, 0.92], [0.55, 0.72, 0.9], (y - trees) / (1 - trees));
    if (y > ridge) return mix3([0.36, 0.5, 0.36], [0.52, 0.62, 0.55], (y - ridge) / 0.12);
    return mix3([0.48, 0.66, 0.36], [0.4, 0.58, 0.3], n(u * 8, y * 8, 2));
  });
  const view = new Mesh(rbox(w, h, 0.01, 0.001, 1), new MeshBasicMaterial({ map: tex }));
  // (the painting's own UVs, once across it: by the world it repeated in the window)
  const uv = view.geometry.getAttribute("uv");
  const pos = view.geometry.getAttribute("position");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return view;
}
