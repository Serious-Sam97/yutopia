// Plan 110 (docs/plan/110-the-buildings.md) — the buildings drawn from their layouts (shared building-kit.ts,
// building-styles.ts): their walls with the openings cut, their roofs, gables and boxes, and the kit's parts
// (tools/art/buildings → public/life/buildings/kit.glb) placed, coloured by role — all merged a material at a
// time, near and far (the far without the parts: its windows a pane of glass each). The Grounds (grounds3d.ts)
// gather what's near each other into one batch a material, so a street of buildings is a few draws.
//
// The kit is one GLB: a node a part, a mesh a role under it (bkit.py ROLES). It carries no UVs: what takes a
// picture (a skin, a roof) gets its own here, in metres on its plane, so the pictures run on from wall to part.

import type { Colours } from "@yutopia/shared/building-kit";
import { headRise, type KMat, type Layout, OPENINGS, ROLE_HEX, type Role } from "@yutopia/shared/building-kit";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Int8BufferAttribute,
  type Material,
  Matrix3,
  Matrix4,
  type Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  Uint8BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import { asset } from "@/lib/asset";
import { litMaterial } from "../look/lit";
import { type RoomOpts, roomQuads } from "./kit-rooms";
import { lifeDress } from "./life-dress";

// ── the kit ──────────────────────────────────────────────────────────────────────────────────────────────────
interface PartMesh {
  role: Role;
  pos: Float32Array;
  nor: Float32Array;
  idx: Uint32Array;
}
let kit: Map<string, PartMesh[]> | null = null;
let loading: Promise<boolean> | null = null;
/** Is the kit in (the buildings can be drawn)? */
export const kitReady = (): boolean => !!kit;
/** The kit loaded (once): true when it's in. */
export function loadKit(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      await MeshoptDecoder.ready;
      const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset("/life/buildings/kit.glb"));
      const root = g.scene.getObjectByName("kit") ?? g.scene;
      root.updateMatrixWorld(true);
      const out = new Map<string, PartMesh[]>();
      const inv = new Matrix4();
      for (const node of root.children) {
        inv.copy(node.matrixWorld).invert();
        const list: PartMesh[] = [];
        node.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const name = m.name || "";
          const role = (name.split("|")[1] ?? (Array.isArray(m.material) ? "" : m.material.name)).split(".")[0] as Role;
          const rel = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
          const nm = new Matrix3().getNormalMatrix(rel);
          const P = m.geometry.getAttribute("position") as BufferAttribute;
          const N = m.geometry.getAttribute("normal") as BufferAttribute | undefined;
          const pos = new Float32Array(P.count * 3);
          const nor = new Float32Array(P.count * 3);
          const v = new Vector3();
          for (let i = 0; i < P.count; i++) {
            v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(rel);
            pos.set([v.x, v.y, v.z], i * 3);
            if (N) v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
            else v.set(0, 1, 0);
            nor.set([v.x, v.y, v.z], i * 3);
          }
          const I = m.geometry.getIndex();
          const idx = I
            ? Uint32Array.from({ length: I.count }, (_, i) => I.getX(i))
            : Uint32Array.from({ length: P.count }, (_, i) => i);
          list.push({ role, pos, nor, idx });
        });
        // (the part's name: the node's, as Blender named it — the loader keeps `|` and `~`)
        out.set(node.name, list);
      }
      // (the glTF exporter's empties: one a part; their meshes by role)
      kit = out;
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      return true;
    } catch (e) {
      console.warn("the buildings' kit didn't load", e);
      return false;
    }
  })();
  return loading;
}

// ── what's gathered: a material's triangles ──────────────────────────────────────────────────────────────────
export class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  get empty() {
    return this.idx.length === 0;
  }
  private vert(x: number, y: number, z: number, n: Vector3, c: Color, u: number, w: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, w);
    return i;
  }
  /** a flat polygon (fanned), facing `n` (its winding turned to), its UVs in metres on its plane */
  fan(pts: [number, number, number][], hint: [number, number, number], c: Color, shade?: (y: number) => number) {
    if (pts.length < 3) return;
    const n = newell(pts);
    if (n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0) {
      pts = [...pts].reverse();
      n.negate();
    }
    const sc = new Color();
    const base = pts.map((p) => {
      const [u, w] = planeUV(p[0], p[1], p[2], n);
      return this.vert(p[0], p[1], p[2], n, shade ? sc.copy(c).multiplyScalar(shade(p[1])) : c, u, w);
    });
    for (let i = 1; i + 1 < base.length; i++) this.idx.push(base[0], base[i], base[i + 1]);
  }
  /** a flat polygon, each point its own shade of `c` (`ks`) */
  fanK(pts: [number, number, number][], hint: [number, number, number], c: Color, ks: number[]) {
    if (pts.length < 3) return;
    const n = newell(pts);
    let order = pts.map((_, i) => i);
    if (n.x * hint[0] + n.y * hint[1] + n.z * hint[2] < 0) {
      order = order.reverse();
      n.negate();
    }
    const sc = new Color();
    const base = order.map((i) => {
      const p = pts[i];
      const [u, w] = planeUV(p[0], p[1], p[2], n);
      return this.vert(p[0], p[1], p[2], n, sc.copy(c).multiplyScalar(ks[i] ?? 1), u, w);
    });
    for (let i = 1; i + 1 < base.length; i++) this.idx.push(base[0], base[i], base[i + 1]);
  }
  /** a part's mesh placed by `m` (its normals by `nm`), coloured `c` */
  geo(p: PartMesh, m: Matrix4, nm: Matrix3, c: Color, uvs: boolean) {
    const o = this.pos.length / 3;
    const v = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < p.pos.length; i += 3) {
      v.set(p.pos[i], p.pos[i + 1], p.pos[i + 2]).applyMatrix4(m);
      n.set(p.nor[i], p.nor[i + 1], p.nor[i + 2])
        .applyMatrix3(nm)
        .normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r, c.g, c.b);
      if (uvs) {
        const [u, w] = planeUV(v.x, v.y, v.z, n);
        this.uv.push(u, w);
      } else this.uv.push(0, 0);
    }
    // (a mirroring scale turns its triangles inside out)
    const flip = m.determinant() < 0;
    for (let i = 0; i < p.idx.length; i += 3)
      if (flip) this.idx.push(o + p.idx[i], o + p.idx[i + 2], o + p.idx[i + 1]);
      else this.idx.push(o + p.idx[i], o + p.idx[i + 1], o + p.idx[i + 2]);
  }
  /** another's gathered onto this */
  take(a: Acc) {
    const o = this.pos.length / 3;
    for (const x of a.pos) this.pos.push(x);
    for (const x of a.nor) this.nor.push(x);
    for (const x of a.col) this.col.push(x);
    for (const x of a.uv) this.uv.push(x);
    for (const i of a.idx) this.idx.push(o + i);
  }
  /** Packed small: positions as floats, normals and colours a byte each, UVs only when `uvs` (a picture's) */
  pack(uvs: boolean): Pack {
    const n = this.pos.length / 3;
    const nor = new Int8Array(n * 3);
    for (let i = 0; i < nor.length; i++) nor[i] = Math.round(Math.max(-1, Math.min(1, this.nor[i])) * 127);
    const col = new Uint8Array(n * 3);
    for (let i = 0; i < col.length; i++) col[i] = Math.round(Math.max(0, Math.min(1, this.col[i])) * 255);
    return {
      n,
      pos: Float32Array.from(this.pos),
      nor,
      col,
      uv: uvs ? Float32Array.from(this.uv) : null,
      idx: Uint32Array.from(this.idx),
    };
  }
  build(): BufferGeometry {
    return packGeometry([this.pack(true)]);
  }
}
/** A batch packed: what's kept of a building's till its cell's made (then let go). */
export interface Pack {
  n: number;
  pos: Float32Array;
  nor: Int8Array;
  col: Uint8Array;
  uv: Float32Array | null;
  idx: Uint32Array;
}
/** Packs as one geometry (their vertices one after another, their indices moved on). */
export function packGeometry(ps: Pack[]): BufferGeometry {
  const n = ps.reduce((a, p) => a + p.n, 0);
  const ni = ps.reduce((a, p) => a + p.idx.length, 0);
  const uvs = ps.some((p) => p.uv);
  const pos = new Float32Array(n * 3);
  const nor = new Int8Array(n * 3);
  const col = new Uint8Array(n * 3);
  const uv = uvs ? new Float32Array(n * 2) : null;
  const idx = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let o = 0;
  let oi = 0;
  for (const p of ps) {
    pos.set(p.pos, o * 3);
    nor.set(p.nor, o * 3);
    col.set(p.col, o * 3);
    if (uv && p.uv) uv.set(p.uv, o * 2);
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + o;
    o += p.n;
    oi += p.idx.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new Int8BufferAttribute(nor, 3, true));
  g.setAttribute("color", new Uint8BufferAttribute(col, 3, true));
  if (uv) g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(idx instanceof Uint32Array ? new Uint32BufferAttribute(idx, 1) : new Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
function newell(pts: [number, number, number][]): Vector3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return new Vector3(nx, ny, nz).normalize();
}
/** UVs in metres on the plane a normal faces (along its wall and up; a roof's along its eave and up its slope). */
function planeUV(x: number, y: number, z: number, n: Vector3): [number, number] {
  const ay = Math.abs(n.y);
  if (ay > 0.92) return [x, z];
  // (a wall's or a slope's: along its horizontal, and up the slope's length)
  const h = Math.hypot(n.x, n.z) || 1;
  const tx = -n.z / h;
  const tz = n.x / h;
  const along = x * tx + z * tz;
  // (a slope's up its length: its height over its run's cosine)
  const up = ay > 0.05 ? y / Math.max(0.2, h) : y;
  return [along, up];
}

// ── the materials' keys: the layout's (a skin, a cover, paint, glass, a glow) and the parts' own of the library's
// (their stone, brick, concrete, wood) ──
type BaseKey =
  | KMat
  | "role:stone"
  | "role:brick"
  | "role:concrete"
  | "role:wood"
  // (plan 111: the rooms behind the glass, their night's light, the far level's panes)
  | "room"
  | "room-lit"
  | "pane"
  | "pane-lit";
/** A material's key: the layout's or a role's; `p:` before it, a part's — drawn the same, pulled a hair toward the
 *  eye (polygonOffset), so a part on a wall or a box wins where their faces lie in one plane (plan 111). */
export type MatKey = BaseKey | `p:${BaseKey}`;
/** A part's key's own (without its `p:`). */
const baseOf = (k: MatKey): BaseKey => (k.startsWith("p:") ? (k.slice(2) as BaseKey) : (k as BaseKey));
/** (the life look) The library's material each key is drawn in (life-matlib-list.ts; tools/art/life/materials.mts). */
const LIB: Partial<Record<BaseKey, string>> = {
  "skin:clapboard": "clapboard",
  "skin:shingle": "shingle-wall",
  "skin:batten": "batten",
  "skin:brick": "brick",
  "skin:stone": "limestone",
  "skin:fieldstone": "fieldstone",
  "skin:stucco": "stucco",
  "skin:concrete": "concrete",
  "skin:metal": "corrugated",
  "skin:panel": "panel",
  "roof:slate": "roof-slate",
  "roof:shingle": "roof-shingle",
  "roof:metal": "roof-metal",
  "roof:membrane": "concrete",
  "roof:copper": "roof-metal",
  "roof:tin": "corrugated",
  "role:stone": "limestone",
  "role:brick": "brick",
  "role:concrete": "concrete",
  "role:wood": "pine",
};
/** Each library material's mean albedo (sRGB; measured from its painting): a colour over it divided by this keeps
 *  its tone — a building's walls the colour picked for them. */
const MEAN: Record<string, number> = {
  clapboard: 0xe3e3e3,
  "shingle-wall": 0xd5d5d5,
  batten: 0xdddddd,
  stucco: 0xe6e6e6,
  fieldstone: 0x888176,
  limestone: 0xcbc1b0,
  panel: 0xe3e3e3,
  corrugated: 0xd5d5d5,
  "roof-shingle": 0xb5b5b5,
  "roof-metal": 0xdedede,
  brick: 0x9e664f,
  "roof-slate": 0x53585f,
  concrete: 0xa39f9a,
  pine: 0xd4ad74,
};
/** Whether the buildings are drawn in the library's materials (the life look, its renderer in). */
const libOn = (): boolean => !!lifeDress.on && !!lifeDress.material;
/** A colour as it's laid in a key's vertices: over its library material's mean when it has one. */
function toned(k: MatKey, c: string): Color {
  const out = new Color(c);
  const id = libOn() ? LIB[baseOf(k)] : undefined;
  if (!id) return out;
  const m = new Color(MEAN[id] ?? 0xffffff);
  return out.setRGB(Math.min(1, out.r / m.r), Math.min(1, out.g / m.g), Math.min(1, out.b / m.b));
}

// ── a building's batches ─────────────────────────────────────────────────────────────────────────────────────
export type Batches = Map<MatKey, Acc>;
/** A building's batches packed (what a cell keeps of it). */
export type Packed = Map<MatKey, Pack>;
/** Whether a material's batch keeps its UVs (one with a picture). */
const PLAIN = new Set<string>(["paint", "glow", "glass", "glass-lit", "room", "room-lit", "pane", "pane-lit"]);
export const takesUV = (k: MatKey) => !PLAIN.has(baseOf(k));
/** Batches packed small. */
export function packBatches(b: Batches): Packed {
  const out: Packed = new Map();
  for (const [k, a] of b) if (!a.empty) out.set(k, a.pack(takesUV(k)));
  return out;
}
const col = new Color();
function hex(c: string): Color {
  return col.set(c).clone();
}
function acc(m: Batches, k: MatKey): Acc {
  let a = m.get(k);
  if (!a) {
    a = new Acc();
    m.set(k, a);
  }
  return a;
}
/** Each role's colour on this building. */
function roleColour(r: Role, c: Colours): string {
  switch (r) {
    case "skin":
      return c.walls;
    case "trim":
      return c.trim;
    case "sash":
      return c.trim;
    case "door":
      return c.door;
    case "roof":
      return c.roof;
    case "canvas":
      return c.canvas;
    default:
      return ROLE_HEX[r];
  }
}
/** A building's layout into near batches and far ones (y over the ground `y0`). */
export function kitBatches(
  L: Layout,
  y0: number,
  c: Colours,
  rooms?: RoomOpts | null,
): { near: Batches; far: Batches } {
  const near: Batches = new Map();
  const far: Batches = new Map();
  const skin = (L.walls[0]?.mat ?? "skin:clapboard") as KMat;
  const roofMat = (L.polys.find((p) => p.mat.startsWith("roof:"))?.mat ?? "roof:shingle") as KMat;
  const lib = libOn();
  // the walls, their openings cut (the far: whole, a pane in each)
  for (const w of L.walls) wall(w, y0, acc(near, w.mat), acc(far, w.mat), far, toned(w.mat, w.colour));
  for (const p of L.polys) {
    const pts = p.pts.map((q) => [q[0], q[1] + y0, q[2]] as [number, number, number]);
    const cc = toned(p.mat, p.colour);
    acc(near, p.mat).fan(pts, p.n, cc);
    acc(far, p.mat).fan(pts, p.n, cc);
  }
  for (const b of L.boxes) {
    const cc = toned(b.mat, b.colour);
    for (const t of [near, far]) boxInto(acc(t, b.mat), b.x0, b.y0 + y0, b.z0, b.x1, b.y1 + y0, b.z1, cc);
  }
  // the parts
  if (kit) {
    const m = new Matrix4();
    const r = new Matrix4();
    const s = new Matrix4();
    const nm = new Matrix3();
    for (const p of L.parts) {
      const meshes = kit.get(p.part);
      if (!meshes) continue;
      m.makeTranslation(p.x, p.y + y0, p.z);
      r.makeRotationY(p.ry);
      s.makeScale(p.sx, p.sy, 1);
      m.multiply(r).multiply(s);
      nm.getNormalMatrix(m);
      for (const pm of meshes) {
        const own: BaseKey =
          pm.role === "glass"
            ? "glass"
            : pm.role === "lamp" || pm.role === "neon"
              ? "glow"
              : pm.role === "skin"
                ? skin
                : pm.role === "roof"
                  ? roofMat
                  : lib && (pm.role === "stone" || pm.role === "brick" || pm.role === "concrete" || pm.role === "wood")
                    ? `role:${pm.role}`
                    : "paint";
        // (its glass and glows as they are; the rest a part's, pulled toward the eye)
        const k: MatKey = own === "glass" || own === "glow" ? own : `p:${own}`;
        acc(near, k).geo(pm, m, nm, toned(k, roleColour(pm.role, c)), takesUV(k));
      }
    }
  }
  // the rooms behind the openings (plan 111): near only
  if (rooms) {
    const cc = new Color();
    for (const q of roomQuads(L, y0, rooms)) {
      const a = acc(near, q.lit ? "room-lit" : "room");
      if (q.ks) a.fanK(q.pts, q.n, cc.setHex(q.c), q.ks);
      else a.fan(q.pts, q.n, cc.setHex(q.c));
    }
  }
  return { near, far };
}
function boxInto(a: Acc, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Color) {
  a.fan(
    [
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [0, 1, 0],
    c,
  );
  a.fan(
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    [0, 0, -1],
    c,
  );
  a.fan(
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [0, 0, 1],
    c,
  );
  a.fan(
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    [-1, 0, 0],
    c,
  );
  a.fan(
    [
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    [1, 0, 0],
    c,
  );
}
/** A wall's skin in strips between its openings' edges (each opening's head — an arch's, a lancet's, a round
 *  window's — filled round with the skin), its top the roof's where it's raised; the far one whole, a pane of
 *  glass in each opening. */
function wall(w: Layout["walls"][number], y0: number, a: Acc, af: Acc, far: Batches, tone?: Color) {
  const [ax, az] = w.a;
  const [bx, bz] = w.b;
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1e-3) return;
  const tx = (bx - ax) / L;
  const tz = (bz - az) / L;
  const n: [number, number, number] = [w.o[0], 0, w.o[1]];
  const c = tone ?? hex(w.colour);
  // (the splash of years at a wall's foot: its lowest 0.7 m darker toward the ground, a ground floor's only)
  const GRIME = 0.7;
  const grime = w.y0 < 1.5 ? (y: number) => 0.8 + 0.2 * Math.min(1, Math.max(0, (y - y0 - w.y0) / GRIME)) : null;
  const top = (s: number): number => {
    const t = w.top;
    if (!t || t.length < 2) return w.y1;
    for (let i = 0; i + 1 < t.length; i++) {
      const [sa, ya] = t[i];
      const [sb, yb] = t[i + 1];
      if (s >= sa - 1e-6 && s <= sb + 1e-6) return ya + ((yb - ya) * (s - sa)) / (sb - sa || 1);
    }
    return w.y1;
  };
  const P = (s: number, y: number): [number, number, number] => [ax + tx * s, y + y0, az + tz * s];
  // the openings, clipped to the wall (and their heads' boxes)
  const holes = w.holes
    .map((h) => {
      const rise = headRise({ w: h.s1 - h.s0, head: h.head });
      const yTop = h.head === "round" ? h.y1 : h.y1 + rise;
      return { ...h, s0: Math.max(0, h.s0), s1: Math.min(L, h.s1), y0: Math.max(w.y0, h.y0), yT: yTop, rise };
    })
    .filter((h) => h.s1 - h.s0 > 0.01 && h.yT > w.y0 + 0.01 && h.y0 < top((h.s0 + h.s1) / 2) - 0.01);
  const cuts = new Set<number>([0, L]);
  for (const h of holes) {
    cuts.add(h.s0);
    cuts.add(h.s1);
  }
  for (const [s] of w.top ?? []) if (s > 0 && s < L) cuts.add(s);
  const xs = [...cuts].sort((p, q) => p - q);
  for (let i = 0; i + 1 < xs.length; i++) {
    const sa = xs[i];
    const sb = xs[i + 1];
    if (sb - sa < 1e-4) continue;
    const mid = (sa + sb) / 2;
    const ys = holes
      .filter((h) => h.s0 <= mid && h.s1 >= mid)
      .map((h) => [h.y0, Math.min(h.yT, top(mid))] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    let y = w.y0;
    // (a band cut at the grime's top, so its shade fades within it)
    const band = (ya: number, yb: number) => {
      const g = w.y0 + GRIME;
      if (grime && ya < g && yb > g + 1e-4) {
        a.fan([P(sa, ya), P(sb, ya), P(sb, g), P(sa, g)], n, c, grime);
        a.fan([P(sa, g), P(sb, g), P(sb, yb), P(sa, yb)], n, c, grime);
      } else a.fan([P(sa, ya), P(sb, ya), P(sb, yb), P(sa, yb)], n, c, grime ?? undefined);
    };
    for (const [h0, h1] of ys) {
      if (h0 > y + 1e-4) band(y, h0);
      y = Math.max(y, h1);
    }
    const ta = top(sa);
    const tb = top(sb);
    if (ta > y + 1e-4 || tb > y + 1e-4)
      a.fan([P(sa, y), P(sb, y), P(sb, Math.max(y, tb)), P(sa, Math.max(y, ta))], n, c);
    // the far one: whole
    af.fan([P(sa, w.y0), P(sb, w.y0), P(sb, ta), P(sa, ta)], n, c);
  }
  // the heads' corners filled with the skin
  for (const h of holes) {
    if (!h.head) continue;
    const wd = h.s1 - h.s0;
    const sm = (h.s0 + h.s1) / 2;
    const arc: [number, number][] = [];
    const seg = 10;
    if (h.head === "arch") {
      const r = wd / 2;
      for (let k = 0; k <= seg; k++) {
        const t = Math.PI - (Math.PI * k) / seg;
        arc.push([sm + Math.cos(t) * r, h.y1 + Math.sin(t) * r]);
      }
    } else if (h.head === "pointed") {
      const r = wd;
      const ang = Math.acos(0.5);
      for (let k = 0; k <= seg; k++) {
        const t = Math.PI - (ang * k) / seg;
        arc.push([h.s1 + Math.cos(t) * r, h.y1 + Math.sin(t) * r]);
      }
      for (let k = 1; k <= seg; k++) {
        const t = ang - (ang * k) / seg;
        arc.push([h.s0 + Math.cos(t) * r, h.y1 + Math.sin(t) * r]);
      }
    } else {
      // a round window: the circle in its box, the four corners filled
      const r = wd / 2;
      const cy = (h.y0 + h.y1) / 2;
      for (const [qa, qb, cs, cyy] of [
        [Math.PI / 2, Math.PI, h.s0, h.y1],
        [0, Math.PI / 2, h.s1, h.y1],
        [Math.PI, 1.5 * Math.PI, h.s0, h.y0],
        [1.5 * Math.PI, 2 * Math.PI, h.s1, h.y0],
      ] as const) {
        const pts: [number, number, number][] = [P(cs, cyy)];
        for (let k = 0; k <= 6; k++) {
          const t = qa + ((qb - qa) * k) / 6;
          pts.push(P(sm + Math.cos(t) * r, cy + Math.sin(t) * r));
        }
        a.fan(pts, n, c);
      }
      continue;
    }
    const apex = h.yT;
    // left: from the spring up the arc to the apex, round by the box's top-left corner
    const mid = Math.floor(arc.length / 2);
    const left: [number, number, number][] = [P(h.s0, apex)];
    for (const [s, y] of arc.slice(0, mid + 1)) left.push(P(s, Math.min(y, apex)));
    a.fan(left, n, c);
    const right: [number, number, number][] = [P(h.s1, apex)];
    for (const [s, y] of arc.slice(mid).reverse()) right.push(P(s, Math.min(y, apex)));
    a.fan(right, n, c);
  }
  // the far one's panes, a hair out
  for (const h of holes) {
    if (h.y1 - h.y0 < 0.4) continue;
    const lit = Math.sin(h.s0 * 7.3 + h.y0 * 3.1 + ax) > 0.35;
    const g = acc(far, lit ? "pane-lit" : "pane");
    const o = 0.03;
    const Q = (s: number, y: number): [number, number, number] => [
      ax + tx * s + w.o[0] * o,
      y + y0,
      az + tz * s + w.o[1] * o,
    ];
    g.fan(
      [
        Q(h.s0 + 0.08, h.y0 + 0.08),
        Q(h.s1 - 0.08, h.y0 + 0.08),
        Q(h.s1 - 0.08, Math.min(h.y1, top(h.s0)) - 0.05),
        Q(h.s0 + 0.08, Math.min(h.y1, top(h.s0)) - 0.05),
      ],
      n,
      hex(lit ? "#6a5a48" : "#3c4249"),
    );
  }
}
export { OPENINGS };

// ── the materials (one each, shared by every building) ───────────────────────────────────────────────────────
const mats = new Map<string, Material>();
/** The tiles of each skin's and cover's picture: its metres a repeat. */
const TILE: Record<string, number> = {
  clapboard: 1.1,
  shingle: 1.4,
  batten: 1.8,
  brick: 1.2,
  stone: 2.4,
  fieldstone: 2.0,
  stucco: 2.0,
  concrete: 2.4,
  metal: 0.912,
  panel: 3.0,
  slate: 1.44,
  "roof-shingle": 1.32,
  "roof-metal": 1.8,
  membrane: 4,
  copper: 1.8,
  tin: 0.76,
};
/** A material by its key (its picture painted once); `glow(m, on, kind)` lights the ones lit at night. */
/** The keys lit at night: how bright, as what. */
const GLOWS: Partial<Record<string, [number, string]>> = {
  glow: [1.2, "lamp"],
  "pane-lit": [0.9, "windows"],
  "room-lit": [1, "windows"],
};
export function kitMaterial(k: MatKey, glow: (m: Material, on: number, kind: string) => void): Material {
  let m = mats.get(k);
  const g = GLOWS[k];
  if (m) {
    if (g) glow(m, g[0], g[1]);
    return m;
  }
  // (a part's: made as its own key's is — its own, its textures coming to it as to that one's —, pulled toward
  // the eye a unit or two of depth: where it lies in one plane with a wall or a box, it wins; nothing behind shows)
  const b = baseOf(k);
  const libId = libOn() ? LIB[b] : undefined;
  if (libId && lifeDress.material) m = lifeDress.material(libId);
  else if (b === "paint") m = litMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  else if (b === "glass" || b === "glass-lit") {
    // (plan 111: see-through — the room behind it seen straight on, the sky in it at a glance: a mirror of the sky
    // (metal: all it gives back is what's round it), as much of it as its alpha, by the angle; drawn after what's behind it, not writing depth)
    m = litMaterial({ color: 0x9aa4ac, roughness: 0.05, metalness: 1, transparent: true, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <opaque_fragment>",
        `float kitFres = 1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
gl_FragColor = vec4(outgoingLight, mix(0.3, 0.92, kitFres * kitFres * kitFres));`,
      );
    };
    m.customProgramCacheKey = () => "kit-glass";
    // (its own look: the Grounds' land-light patch would take its hook's place — grounds-stream patchAdded)
    m.userData.ownLook = true;
  } else if (b === "room") m = litMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  else if (b === "room-lit") {
    // (a room lit at night: its own colours glowing — its lamps' warm light over what's in it, darker in from the
    // window as the room is; nothing by day — grounds3d setNight; its own look: the Grounds' patch would take its
    // hook's place)
    m = litMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: 0xffc890, emissiveIntensity: 0 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = emissive * vColor.rgb * 8.0;",
      );
    };
    m.customProgramCacheKey = () => "kit-room-lit";
    m.userData.ownLook = true;
  } else if (b === "pane") m = litMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.2 });
  else if (b === "pane-lit")
    m = litMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xffc87a, emissiveIntensity: 0 });
  else if (k === "glow")
    m = litMaterial({ vertexColors: true, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  else {
    const [kind, id] = b.split(":") as ["skin" | "roof", string];
    const pic = kind === "roof" ? `roof-${id}` : id;
    const t = new CanvasTexture(paint(pic));
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    const T =
      TILE[
        pic === "roof-slate"
          ? "slate"
          : pic === "roof-membrane"
            ? "membrane"
            : pic === "roof-copper"
              ? "copper"
              : pic === "roof-tin"
                ? "tin"
                : pic
      ] ?? 1.5;
    t.repeat.set(1 / T, 1 / T);
    m = litMaterial({
      vertexColors: true,
      map: t,
      roughness: kind === "roof" ? 0.85 : 0.9,
      metalness: id === "metal" || id === "tin" || id === "copper" ? 0.3 : 0,
    });
  }
  if (b !== k) {
    m.polygonOffset = true;
    // (units only: the slope's term grows at a glance and pulled faces set back in the wall through it)
    m.polygonOffsetFactor = 0;
    m.polygonOffsetUnits = -3;
  }
  m.userData.shared = true;
  m.userData.kit = k;
  mats.set(k, m);
  if (g) glow(m, g[0], g[1]);
  return m;
}

// ── the pictures: light, so a building's colour (in its vertices) is the tone ────────────────────────────────
function canvas(w: number, h: number): [HTMLCanvasElement | OffscreenCanvas, CanvasRenderingContext2D] {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(w, h);
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}
function hash(i: number, j: number, s = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}
function grey(v: number) {
  const k = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${k},${k},${k})`;
}
function paint(id: string): HTMLCanvasElement {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = grey(0.92);
  g.fillRect(0, 0, S, S);
  const noise = (k: number, a: number) => {
    for (let i = 0; i < k; i++) {
      g.fillStyle = `rgba(${hash(i, 1) > 0.5 ? "255,255,255" : "0,0,0"},${a * hash(i, 2)})`;
      g.fillRect(hash(i, 3) * S, hash(i, 4) * S, 1 + hash(i, 5) * 3, 1 + hash(i, 6) * 3);
    }
  };
  switch (id) {
    case "clapboard": {
      // 10 boards a 1.1 m tile: each lighter at its top, its lap's shadow under it
      const n = 10;
      for (let i = 0; i < n; i++) {
        const y0 = (i * S) / n;
        const h = S / n;
        const gr = g.createLinearGradient(0, y0, 0, y0 + h);
        gr.addColorStop(0, grey(0.98));
        gr.addColorStop(0.85, grey(0.88));
        gr.addColorStop(1, grey(0.7));
        g.fillStyle = gr;
        g.fillRect(0, y0, S, h);
      }
      noise(400, 0.05);
      break;
    }
    case "shingle": {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const y0 = (i * S) / n;
        let x = -hash(i, 9) * 30;
        while (x < S) {
          const w = 14 + hash(Math.round(x), i) * 26;
          g.fillStyle = grey(0.82 + hash(Math.round(x), i, 2) * 0.16);
          g.fillRect(x, y0, w - 2, S / n - 3);
          g.fillStyle = grey(0.55);
          g.fillRect(x + w - 2, y0, 2, S / n);
          x += w;
        }
        g.fillStyle = grey(0.6);
        g.fillRect(0, y0 + S / n - 3, S, 3);
      }
      break;
    }
    case "batten": {
      // boards 0.3 m (6 a 1.8 m tile), a batten over each seam
      g.fillStyle = grey(0.86);
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 6; i++) {
        const x = (i * S) / 6;
        g.fillStyle = grey(0.8 + hash(i, 4) * 0.1);
        g.fillRect(x + 2, 0, S / 6 - 4, S);
        g.fillStyle = grey(0.62);
        g.fillRect(x - 4, 0, 8, S);
        g.fillStyle = grey(0.97);
        g.fillRect(x - 3, 0, 4, S);
      }
      noise(600, 0.08);
      break;
    }
    case "brick": {
      // 18 courses a 1.2 m tile, 5.5 bricks a course, the mortar light
      g.fillStyle = grey(0.95);
      g.fillRect(0, 0, S, S);
      const rows = 18;
      const per = 5.5;
      const bw = S / per;
      const bh = S / rows;
      for (let j = 0; j < rows; j++)
        for (let i = -1; i < per + 1; i++) {
          const x = i * bw + (j % 2 ? bw / 2 : 0);
          g.fillStyle = grey(0.78 + hash(i + 7, j) * 0.13);
          g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
        }
      break;
    }
    case "stone":
    case "fieldstone": {
      g.fillStyle = grey(0.7);
      g.fillRect(0, 0, S, S);
      const rows = id === "stone" ? 8 : 10;
      for (let j = 0; j < rows; j++) {
        let x = -hash(j, 3) * 40;
        while (x < S) {
          const w = id === "stone" ? 60 + hash(Math.round(x), j) * 30 : 24 + hash(Math.round(x), j) * 34;
          const h = S / rows;
          g.fillStyle = grey(0.74 + hash(Math.round(x), j, 5) * 0.22);
          if (id === "stone") g.fillRect(x + 2, j * h + 2, w - 4, h - 4);
          else {
            g.beginPath();
            g.ellipse(
              x + w / 2,
              j * h + h / 2,
              w / 2 - 2,
              h / 2 - 1.5,
              hash(Math.round(x), j, 7) * 0.4,
              0,
              Math.PI * 2,
            );
            g.fill();
          }
          x += w;
        }
      }
      break;
    }
    case "stucco":
      noise(2500, 0.07);
      break;
    case "concrete": {
      noise(2000, 0.06);
      g.fillStyle = grey(0.72);
      g.fillRect(0, S / 2 - 1, S, 2);
      g.fillRect(S / 2 - 1, 0, 2, S);
      for (const [x, y] of [
        [S / 4, S / 4],
        [(3 * S) / 4, S / 4],
        [S / 4, (3 * S) / 4],
        [(3 * S) / 4, (3 * S) / 4],
      ]) {
        g.beginPath();
        g.arc(x, y, 2.5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "metal": {
      // corrugated: 12 ribs a 0.91 m tile
      for (let x = 0; x < S; x++) {
        const v = 0.78 + 0.18 * Math.sin((x / S) * Math.PI * 2 * 12);
        g.fillStyle = grey(v);
        g.fillRect(x, 0, 1, S);
      }
      break;
    }
    case "panel": {
      g.fillStyle = grey(0.9);
      g.fillRect(0, 0, S, S);
      g.fillStyle = grey(0.55);
      g.fillRect(0, 0, S, 2);
      g.fillRect(0, 0, 2, S);
      g.fillRect(S / 2, 0, 2, S);
      noise(300, 0.03);
      break;
    }
    case "roof-slate": {
      const rows = 8;
      for (let j = 0; j < rows; j++) {
        const h = S / rows;
        for (let i = -1; i < 9; i++) {
          const x = i * (S / 8) + (j % 2 ? S / 16 : 0);
          g.fillStyle = grey(0.62 + hash(i, j) * 0.25);
          g.fillRect(x + 1, j * h + 1, S / 8 - 2, h - 2);
        }
        g.fillStyle = grey(0.4);
        g.fillRect(0, j * h + h - 2, S, 2);
      }
      break;
    }
    case "roof-shingle": {
      const rows = 10;
      for (let j = 0; j < rows; j++) {
        const h = S / rows;
        for (let i = -1; i < 7; i++) {
          const x = i * (S / 6) + (j % 2 ? S / 12 : 0);
          g.fillStyle = grey(0.68 + hash(i, j, 3) * 0.2);
          g.fillRect(x + 1, j * h, S / 6 - 2, h - 3);
        }
        g.fillStyle = grey(0.42);
        g.fillRect(0, j * h + h - 3, S, 3);
      }
      break;
    }
    case "roof-metal": {
      for (let x = 0; x < S; x++) {
        const f = (x % (S / 4)) / (S / 4);
        g.fillStyle = grey(f < 0.06 ? 0.98 : f < 0.1 ? 0.6 : 0.82);
        g.fillRect(x, 0, 1, S);
      }
      break;
    }
    case "roof-tin": {
      for (let x = 0; x < S; x++) {
        g.fillStyle = grey(0.75 + 0.18 * Math.sin((x / S) * Math.PI * 2 * 8));
        g.fillRect(x, 0, 1, S);
      }
      break;
    }
    case "roof-copper":
      noise(1500, 0.08);
      break;
    default:
      noise(3000, 0.1);
  }
  return c as HTMLCanvasElement;
}
