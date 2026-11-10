import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  type Material,
  MeshDepthMaterial,
  Quaternion,
  RGBADepthPacking,
  SRGBColorSpace,
  Vector3,
} from "three";
import { tinted } from "./campus";
import { pineGeometry } from "./grounds3d";
import { lifeDress } from "./life-dress";
import { shrubGeometry } from "./woods3d";
import { mergeGeometries, pressShader, wx } from "./wx3d";

// Plan 73 phase 8.1 — the woods in the life look: the same pools and the one material (grounds-stream.ts),
// new shapes. A leafy tree (a curving trunk, limbs, a crown of leaf cards round a dark core) and a pine
// whose tiers' edges are drooping boughs of needles. The cards' pictures are a small atlas on the woods'
// material: its left half white (what isn't a card reads there — a trunk, a stone, a snow cap: their UVs
// set to it, `solidUV`), a leaf cluster, a needle spray; grey, their colour the vertices' (the season's
// is the snow layer's, wx3d.ts), cut out by alpha.

/** Where in the atlas: the solid white, the leaves, the needles (u ranges). */
const SOLID: [number, number] = [0.1, 0.4];
const LEAF: [number, number] = [0.4, 0.6];
const NEEDLE: [number, number] = [0.6, 0.8];
const GRASS: [number, number] = [0.8, 1];

let atlas: CanvasTexture | null = null;
/** The cards' atlas (made once). */
export function treeAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const W = 640;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let seed = 9;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, H);
  // the leaves: a cluster of small ovals, each its own tone and turn, a vein's line
  const lx = 256;
  const lw = 128;
  for (let i = 0; i < 90; i++) {
    const x = lx + 10 + r() * (lw - 20);
    const y = 12 + r() * (H - 24);
    // (rounder towards the middle: a cluster, not a square)
    const dx = (x - lx - lw / 2) / (lw / 2);
    const dy = (y - H / 2) / (H / 2);
    if (dx * dx + dy * dy > 1) continue;
    const v = 205 + Math.floor(r() * 50);
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.ellipse(0, 0, 5 + r() * 4, 10 + r() * 6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(0,0,0,0.18)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(0, 10);
    g.stroke();
    g.restore();
  }
  // the needles: a spray along the card (v up it), thin strokes out from its spine, fewer at its tip
  const nx = 384;
  const nw = 128;
  g.lineCap = "round";
  for (let i = 0; i < 260; i++) {
    const t = r();
    const y = H - 6 - t * (H - 12);
    const half = (nw / 2 - 6) * (1 - t * 0.55);
    const side = r() < 0.5 ? -1 : 1;
    const len = half * (0.55 + r() * 0.45);
    const v = 175 + Math.floor(r() * 80);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1.6 + r() * 1.2;
    g.beginPath();
    g.moveTo(nx + nw / 2, y);
    g.lineTo(nx + nw / 2 + side * len, y - len * 0.45);
    g.stroke();
  }
  g.strokeStyle = "rgb(120,120,120)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(nx + nw / 2, H - 4);
  g.lineTo(nx + nw / 2, 6);
  g.stroke();
  // the grass: blades fanning up from the foot, curving, of all lengths (no spine: a tuft, not a frond)
  const gx = 512;
  const gw = 128;
  for (let i = 0; i < 70; i++) {
    const foot = gx + gw / 2 + (r() - 0.5) * 30;
    const lean = (r() - 0.5) * 1.4;
    const len = (0.45 + r() * 0.55) * (H - 10);
    const v = 160 + Math.floor(r() * 95);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 2 + r() * 2.5;
    g.beginPath();
    g.moveTo(foot, H - 2);
    g.quadraticCurveTo(foot + lean * len * 0.25, H - len * 0.6, foot + lean * len * 0.6, H - len);
    g.stroke();
  }
  atlas = new CanvasTexture(c);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** The woods' material in the life look: the atlas on it, its cards cut out (each card's two faces its
 *  own geometry: the material stays one-sided). */
export function lifeTreeMaterial<M extends Material & { map: unknown; alphaTest: number }>(m: M): M {
  m.map = treeAtlas();
  m.alphaTest = 0.5;
  return m;
}
let depth: MeshDepthMaterial | null = null;
/** The woods' shadows: the cards cut out in them too (and the snow's press, as wx3d's). */
export function lifeTreeDepth(): MeshDepthMaterial {
  if (!depth) {
    depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: treeAtlas(), alphaTest: 0.5 });
    depth.onBeforeCompile = (sh) => pressShader(sh);
    depth.customProgramCacheKey = () => "life-tree-depth";
  }
  return depth;
}

/** A geometry's UVs all at the atlas's solid white (what isn't a card). */
export function solidUV<G extends BufferGeometry>(g: G): G {
  const n = g.getAttribute("position").count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) uv.set(SOLID, i * 2);
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return g;
}

type V3 = [number, number, number];
const lin = (v: number) => v ** 2.2;
/** Cards: quads (centre, two half-axes), each its own normal and colour; UVs across `u` of the atlas. */
class Cards {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  quad(c: Vector3, a: Vector3, b: Vector3, n: Vector3, rgb: V3, u: [number, number], flip = false) {
    const P = [c.clone().sub(a).sub(b), c.clone().add(a).sub(b), c.clone().add(a).add(b), c.clone().sub(a).add(b)];
    const U: [number, number][] = [
      [u[0], 0],
      [u[1], 0],
      [u[1], 1],
      [u[0], 1],
    ];
    if (flip) U.reverse();
    // (both faces, wound each way, lit alike: the material's one-sided — two-sided, every trunk's and
    // cone's back was shaded too, 1.5 ms of High's town frame: plan 73)
    for (const i of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
      this.pos.push(P[i].x, P[i].y, P[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(...rgb);
      this.uv.push(U[i][0], U[i][1]);
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    return g;
  }
}
const UP = new Vector3(0, 1, 0);
/** A tapered tube between two points (its sides only), its bark colour. */
function limb(a: Vector3, b: Vector3, r0: number, r1: number, hex: number, seg = 7): BufferGeometry {
  const d = b.clone().sub(a);
  const g = new CylinderGeometry(r1, r0, d.length(), seg, 1, true).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return solidUV(tinted(g, hex));
}

/** A leafy tree: a trunk curving a little up to its crown, limbs out and up from it, twigs off each;
 *  a crown of leaf cards round their tips over a dark core. `col` its leaves' green (sRGB 0–1); `H` its
 *  height; `spread` how broad its crown. */
export function lifeLeafyGeometry(
  r: () => number,
  o: { col: V3; H?: number; spread?: number; bark?: number } = { col: [0.36, 0.5, 0.22] },
): BufferGeometry {
  const H = o.H ?? 8;
  const spread = o.spread ?? 1;
  const bark = o.bark ?? 0x5a4a3c;
  const parts: BufferGeometry[] = [];
  // the trunk: five pieces up a gentle bend
  const ph = r() * Math.PI * 2;
  const top = H * 0.55;
  const spine: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    spine.push(new Vector3(Math.sin(ph) * 0.25 * t * t, t * top, Math.cos(ph) * 0.25 * t * t));
  }
  for (let i = 0; i < 5; i++) parts.push(limb(spine[i], spine[i + 1], 0.26 - i * 0.03, 0.23 - i * 0.03, bark, 9));
  // the limbs and their twigs; their ends the crown's clusters
  const tips: Vector3[] = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const at = spine[3 + Math.floor(r() * 2.99)].clone();
    const dir = new Vector3(Math.cos(a), 0.7 + r() * 0.6, Math.sin(a)).normalize();
    const len = H * (0.22 + r() * 0.1) * spread;
    const end = at.clone().add(dir.clone().multiplyScalar(len));
    parts.push(limb(at, end, 0.1, 0.05, bark));
    tips.push(end);
    for (let k = 0; k < 2; k++) {
      const d2 = dir
        .clone()
        .add(new Vector3((r() - 0.5) * 1.2, 0.2 + r() * 0.4, (r() - 0.5) * 1.2))
        .normalize();
      const e2 = end.clone().add(d2.multiplyScalar(len * 0.55));
      parts.push(limb(end, e2, 0.045, 0.02, bark, 5));
      tips.push(e2);
    }
  }
  tips.push(spine[5].clone().add(new Vector3(0, H * 0.12, 0)));
  // the crown's middle and size: round the tips
  const mid = tips.reduce((s, t) => s.add(t), new Vector3()).multiplyScalar(1 / tips.length);
  const c = new Color();
  const tone = (k: number): V3 => {
    c.setRGB(lin(o.col[0] * k), lin(o.col[1] * k), lin(o.col[2] * k));
    return [c.r, c.g, c.b];
  };
  // a dark core under the cards: no sky through the crown's middle
  for (const t of tips.filter((_, i) => i % 3 === 0)) {
    const core = new IcosahedronGeometry(H * 0.1 * spread, 0).toNonIndexed();
    core.translate(t.x * 0.8 + mid.x * 0.2, t.y * 0.8 + mid.y * 0.2 - 0.2, t.z * 0.8 + mid.z * 0.2);
    const cc = tone(0.7);
    parts.push(solidUV(tinted(core, new Color(cc[0], cc[1], cc[2]).getHex())));
  }
  // the cards: a cluster round each tip, turned every way, lit as the crown's outside is
  const cards = new Cards();
  // (fourteen, a little larger: the woods are drawn whole, every instance a frame — their triangles
  // were High's cost; plan 73)
  for (const t of tips)
    for (let i = 0; i < 14; i++) {
      const p = t
        .clone()
        .add(new Vector3((r() - 0.5) * 2, (r() - 0.5) * 1.4, (r() - 0.5) * 2).multiplyScalar(0.8 * spread));
      const out = p.clone().sub(mid).normalize();
      const s = (0.8 + r() * 0.4) * spread;
      const q = new Quaternion().setFromAxisAngle(
        new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        r() * Math.PI,
      );
      const a = new Vector3(s, 0, 0).applyQuaternion(q);
      const b = new Vector3(0, s, 0).applyQuaternion(q);
      // (lighter to the top and the outside, darker under)
      const k = 0.78 + 0.28 * Math.max(0, out.y) + (r() - 0.5) * 0.16;
      cards.quad(p, a, b, out, tone(k), LEAF);
    }
  // (its shadow: the solid parts and a lump a tip where the leaves are — the shadow pass draws no cards,
  // their cut-outs were High's cost out in the woods: plan 73 phase 11)
  const solid = parts.map((g) => g.clone());
  for (const t of tips) {
    const lump = new IcosahedronGeometry(0.85 * spread, 0).toNonIndexed();
    lump.translate(t.x, t.y, t.z);
    solid.push(solidUV(tinted(lump, 0x2f4a26)));
  }
  parts.push(cards.build());
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  m.userData.cards = true;
  m.userData.shadow = mergeGeometries(solid, false);
  for (const g of solid) g.dispose();
  return m;
}

/** A spruce: today's tiers (their cones, their snow) with drooping boughs of needles round each tier's
 *  edge — its silhouette ragged and soft, as the cones alone were hard. `o` as pineGeometry's. */
export function lifePineGeometry(
  r: () => number,
  o: { tiers?: number; H?: number; width?: number; snow?: number } = {},
): BufferGeometry {
  const base = solidUV(pineGeometry(r, o));
  const tiers = o.tiers ?? 7;
  const H = o.H ?? 10.5;
  const wide = o.width ?? 1;
  const cards = new Cards();
  const c = new Color();
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y0 = 1.1 + k * (H - 2.6);
    const rad = 2.7 * wide * (1 - k * 0.82);
    const h = (2.6 - k * 0.9) * (H / 10.5) ** 0.5;
    const n = Math.max(6, Math.round(rad * 5));
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + r() * 0.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // from in on the tier to just past its rim, drooping
      const reach = rad * (1.02 + r() * 0.16);
      const from = new Vector3(ca * rad * 0.35, y0 + h * 0.55, sa * rad * 0.35);
      const to = new Vector3(ca * reach, y0 - 0.05 - r() * 0.25, sa * reach);
      const along = to.clone().sub(from);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const side = new Vector3(-sa, 0, ca).multiplyScalar(0.32 + rad * 0.12);
      const nrm = new Vector3(ca * 0.45, 1, sa * 0.45).normalize();
      const v = 0.85 + r() * 0.3;
      c.setRGB(lin(0.15 * v), lin(0.22 * v), lin(0.18 * v));
      cards.quad(mid, side, along.multiplyScalar(0.5), nrm, [c.r, c.g, c.b], NEEDLE);
    }
  }
  const m = mergeGeometries([base, cards.build()], false);
  // (its shadow its tiers' cones: no cards in the shadow pass)
  m.userData.shadow = base;
  m.userData.cards = true;
  return m;
}

/** A far leafy tree (150 m and on): a trunk and three plain lumps of crown — ~70 triangles (the far birch's
 *  crowned lumps were 212, ten thousand of them a frame on High: plan 73). `col` its green (sRGB 0–1). */
export function lifeFarLeafyGeometry(col: V3, H = 8): BufferGeometry {
  const parts: BufferGeometry[] = [
    solidUV(tinted(new CylinderGeometry(0.12, 0.2, H * 0.6, 4, 1, true).translate(0, H * 0.3, 0), 0x564638)),
  ];
  const c = new Color();
  for (const [x, y, z, r, k] of [
    [0, 0.68, 0, 0.3, 1],
    [0.18, 0.58, 0.1, 0.22, 0.85],
    [-0.16, 0.6, -0.12, 0.22, 0.9],
  ]) {
    const g = new IcosahedronGeometry(H * r, 0).toNonIndexed().translate(H * x, H * y, H * z);
    c.setRGB(lin(col[0] * k), lin(col[1] * k), lin(col[2] * k));
    parts.push(solidUV(tinted(g, c.getHex())));
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
}

/** A bush on the woods' floor: today's shrub's lumps under a coat of leaf cards. */
export function lifeBushGeometry(r: () => number): BufferGeometry {
  const core = solidUV(shrubGeometry(r));
  const cards = new Cards();
  const c = new Color();
  const mid = new Vector3(0, 0.5, 0);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const e = (r() - 0.3) * 1.2;
    const out = new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) * 0.8 + 0.2, Math.sin(a) * Math.cos(e)).normalize();
    const p = mid.clone().add(new Vector3(out.x * 0.62, out.y * 0.42, out.z * 0.62));
    const s = 0.22 + r() * 0.14;
    const q = new Quaternion().setFromAxisAngle(
      new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      r() * Math.PI,
    );
    const k = 0.75 + 0.3 * Math.max(0, out.y) + (r() - 0.5) * 0.15;
    c.setRGB(lin(0.3 * k), lin(0.42 * k), lin(0.19 * k));
    cards.quad(
      p,
      new Vector3(s, 0, 0).applyQuaternion(q),
      new Vector3(0, s, 0).applyQuaternion(q),
      out,
      [c.r, c.g, c.b],
      LEAF,
    );
  }
  const m = mergeGeometries([core, cards.build()], false);
  m.userData.shadow = core;
  m.userData.cards = true;
  return m;
}

/** A plant by a house (phase 8.2): a tuft of grass, a flower clump, a bush. */
export interface Plant {
  kind: "tuft" | "flower" | "bush";
  x: number;
  y: number;
  z: number;
  /** a flower's colour (sRGB hex) */
  hex?: number;
  s?: number;
}
/** Plants as one geometry of cards (crossed for a tuft or a flower, a ball of them for a bush) — each
 *  vertex its plant's foot height (`foot`: they lie flat into it as the snow comes, `plantMaterial`). */
export function lifePlantsGeometry(items: Plant[], r: () => number): BufferGeometry {
  const cards = new Cards();
  const foot: number[] = [];
  const c = new Color();
  const ofs = (n: number, y: number) => {
    for (let i = 0; i < n * 12; i++) foot.push(y);
  };
  for (const p of items) {
    const s = p.s ?? 1;
    if (p.kind === "bush") {
      const mid = new Vector3(p.x, p.y + 0.45 * s, p.z);
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2;
        const e = (r() - 0.25) * 1.3;
        const out = new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize();
        const at = mid.clone().add(new Vector3(out.x * 0.5 * s, out.y * 0.4 * s, out.z * 0.5 * s));
        const q = new Quaternion().setFromAxisAngle(
          new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
          r() * Math.PI,
        );
        const z = (0.2 + r() * 0.12) * s;
        const k = 0.72 + 0.32 * Math.max(0, out.y) + (r() - 0.5) * 0.15;
        c.setRGB(lin(0.28 * k), lin(0.42 * k), lin(0.18 * k));
        cards.quad(
          at,
          new Vector3(z, 0, 0).applyQuaternion(q),
          new Vector3(0, z, 0).applyQuaternion(q),
          out,
          [c.r, c.g, c.b],
          LEAF,
        );
      }
      ofs(34, p.y);
      continue;
    }
    const tuft = p.kind === "tuft";
    const h = (tuft ? 0.22 + r() * 0.14 : 0.18 + r() * 0.08) * s;
    const w = (tuft ? 0.22 : 0.2) * s;
    const a0 = r() * Math.PI;
    if (tuft) {
      const k = 0.85 + r() * 0.3;
      c.setRGB(lin(0.36 * k), lin(0.5 * k), lin(0.22 * k));
    } else c.setHex(p.hex ?? 0xe7c25a);
    for (let j = 0; j < 2; j++) {
      const a = a0 + (j * Math.PI) / 2;
      const across = new Vector3(Math.cos(a) * w, 0, Math.sin(a) * w);
      const up = new Vector3(0, h, 0);
      const at = new Vector3(p.x, p.y + h, p.z);
      cards.quad(at, across, up, new Vector3(0, 1, 0), [c.r, c.g, c.b], tuft ? GRASS : LEAF);
    }
    ofs(2, p.y);
  }
  const g = cards.build();
  g.setAttribute("foot", new Float32BufferAttribute(foot, 1));
  return g;
}
/** The plants' material: the atlas, cut out; no snow dusted on them — they lie down into their foot as
 *  it comes (wxSnow), gone under it. Through the Grounds' hook (`userData.grounds`). */
export function plantMaterial<M extends Material & { map: unknown; alphaTest: number }>(m: M): M {
  lifeTreeMaterial(m);
  m.userData.wx = "none";
  m.userData.grounds = {
    key: "-plants",
    patch(sh: { uniforms: Record<string, unknown>; vertexShader: string }) {
      sh.uniforms.plSnow = wx.wxSnow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float foot;\nuniform float plSnow;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed.y = mix(transformed.y, foot - 0.05, smoothstep(0.2, 0.55, plSnow));",
        );
    },
  };
  return m;
}

// (the campus's woods reach these through the hooks: its module doesn't import this one)
lifeDress.trees = {
  leafy: lifeLeafyGeometry,
  pine: lifePineGeometry,
  material: (m) => {
    lifeTreeMaterial(m as Material & { map: unknown; alphaTest: number });
  },
  depth: lifeTreeDepth,
  plants: lifePlantsGeometry,
  plantMaterial: (m) => {
    plantMaterial(m as Material & { map: unknown; alphaTest: number });
  },
};
