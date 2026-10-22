import { CHUNK, groundAt, groundSurfaceAt, groundsRng, type Tree, treeDensity } from "@yutopia/shared/grounds";
import {
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The woods' floor (docs/plan/33-the-look.md, phase 3): what lies between the
// trees — snowed-on shrubs, stumps, a fallen log now and then, stones; boulders
// on the steep rock (the ravine's walls, the ridges). Only to look at: they're
// low, or stand where nobody walks (the shared Grounds' walking is the trees',
// the server's as well as ours, and this isn't in it). Made per chunk from its
// own seed: the same for everyone.

export type Cover = "shrub" | "stump" | "log" | "stone" | "boulder";
export interface Lying {
  kind: Cover;
  x: number;
  y: number;
  z: number;
  ry: number;
  s: number;
}

const SNOW = new Color(0xf2f5f8);

/** Faceted, its faces coloured: snow on whatever faces up, `base` (a little varied) on the rest. */
function snowedOn(g: BufferGeometry, base: number, r: () => number, up = 0.55): BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g;
  if (f !== g) g.dispose();
  f.computeVertexNormals();
  const pos = f.getAttribute("position");
  const nor = f.getAttribute("normal");
  const col = new Float32Array(pos.count * 3);
  const b = new Color(base);
  for (let i = 0; i < pos.count; i += 3) {
    const ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3;
    const c = ny > up ? SNOW : b.clone().multiplyScalar(0.85 + r() * 0.3);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  f.setAttribute("color", new Float32BufferAttribute(col, 3));
  return f;
}

/** Its corners nudged (a rock isn't a regular solid). */
function rough<T extends BufferGeometry>(g: T, r: () => number, k: number): T {
  const pos = g.getAttribute("position");
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(r() - 0.5) * k, (r() - 0.5) * k, (r() - 0.5) * k];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  return g;
}

const merge = (parts: BufferGeometry[]) => {
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return m;
};

/** A low shrub under snow: a few small green blobs (snow on their tops), bare twigs poking out. */
export function shrubGeometry(r: () => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const s = 0.28 + r() * 0.22;
    const g = rough(new IcosahedronGeometry(s, 0), r, 0.08).scale(1, 0.85, 1);
    g.translate((r() - 0.5) * 1.0, s * 0.6 + r() * 0.25, (r() - 0.5) * 1.0);
    parts.push(snowedOn(g, i % 2 ? 0x34452f : 0x46502f, r, 0.72));
  }
  for (let i = 0; i < 7; i++) {
    const l = 0.5 + r() * 0.5;
    const g = new CylinderGeometry(0.008, 0.02, l, 3).translate(0, l / 2, 0);
    g.rotateZ((r() - 0.5) * 1.3).rotateY(r() * Math.PI * 2);
    g.translate((r() - 0.5) * 0.7, 0.15, (r() - 0.5) * 0.7);
    parts.push(snowedOn(g, 0x3a2f28, r, 2));
  }
  return merge(parts);
}

/** A stump, its cut top under a cap of snow. */
export function stumpGeometry(r: () => number): BufferGeometry {
  const bark = new CylinderGeometry(0.28, 0.36, 0.55, 7).translate(0, 0.27, 0);
  const cap = new CylinderGeometry(0.31, 0.29, 0.08, 7).translate(0, 0.58, 0);
  return merge([snowedOn(rough(bark, r, 0.05), 0x3a2e26, r, 2), snowedOn(cap, 0xf2f5f8, r)]);
}

/** A fallen log along x, snow along its top, its broken ends showing the wood. */
export function logGeometry(r: () => number): BufferGeometry {
  const L = 3.4;
  const g = new CylinderGeometry(0.22, 0.26, L, 7, 1).rotateZ(Math.PI / 2).translate(0, 0.2, 0);
  const wood = snowedOn(rough(g, r, 0.04), 0x3d3129, r, 0.8);
  const top = new CylinderGeometry(0.2, 0.22, L * 0.92, 7, 1, true, 0, Math.PI)
    .rotateZ(Math.PI / 2)
    .rotateX(Math.PI / 2)
    .scale(1, 0.55, 1)
    .translate(0, 0.33, 0);
  return merge([wood, snowedOn(top, 0xf2f5f8, r, -1)]);
}

/** A stone half in the snow. */
export function stoneGeometry(r: () => number): BufferGeometry {
  const g = rough(new DodecahedronGeometry(0.42, 0), r, 0.14).scale(1, 0.62, 0.85).translate(0, 0.08, 0);
  return snowedOn(g, 0x6c7178, r, 0.5);
}

/** A boulder (the steep rock's): big, broken, snow on its ledges. */
export function boulderGeometry(r: () => number): BufferGeometry {
  const g = rough(new IcosahedronGeometry(1.3, 1), r, 0.45).scale(1.25, 0.8, 1).translate(0, 0.45, 0);
  return snowedOn(g, 0x5f646b, r, 0.6);
}

const KINDS: Cover[] = ["shrub", "stump", "log", "stone", "boulder"];
export const COVERS = KINDS;

/** What lies in chunk (cx, cz), clear of its trees. */
export function coverIn(cx: number, cz: number, trees: Tree[]): Lying[] {
  const r = groundsRng(cx * 7919 + cz * 104729 + 17);
  const out: Lying[] = [];
  const clear = (x: number, z: number, d: number) => trees.every((t) => Math.hypot(t.x - x, t.z - z) > d);
  for (let i = 0; i < 30; i++) {
    const x = cx * CHUNK + r() * CHUNK;
    const z = cz * CHUNK + r() * CHUNK;
    const p = r();
    const surf = groundSurfaceAt(x, z);
    let kind: Cover | null = null;
    if (surf === "rock") kind = p < 0.45 ? "boulder" : p < 0.75 ? "stone" : null;
    else if (surf === "deep")
      kind = p < 0.3 ? "shrub" : p < 0.38 ? "stump" : p < 0.43 ? "log" : p < 0.55 ? "stone" : null;
    else if (surf === "snow" && treeDensity(x, z) > 0.04) kind = p < 0.12 ? "shrub" : p < 0.18 ? "stone" : null;
    if (!kind) continue;
    if (!clear(x, z, kind === "log" ? 2.4 : kind === "boulder" ? 2 : 1.1)) continue;
    // (a log needs its length on the same snow)
    if (kind === "log") {
      const a = r() * Math.PI;
      const ok = [-1.6, 1.6].every((k) => groundSurfaceAt(x + Math.cos(a) * k, z - Math.sin(a) * k) === "deep");
      if (!ok) continue;
      out.push({ kind, x, y: groundAt(x, z) - 0.05, z, ry: a, s: 0.85 + r() * 0.3 });
      continue;
    }
    const s = kind === "boulder" ? 0.7 + r() * 0.9 : 0.7 + r() * 0.6;
    out.push({ kind, x, y: groundAt(x, z) - (kind === "boulder" ? 0.3 * s : 0.04), z, ry: r() * Math.PI * 2, s });
  }
  return out;
}
