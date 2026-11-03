import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { celBands } from "../cel";

// The furniture kit (docs/plan/67-the-furniture.md, phase 0's mock; phase 1 grows it): things
// built in metres from real shapes — bevelled boxes, lathed profiles, tubes, extrusions, puffed
// cushions, folded leaves — each part flat-faceted and vertex-coloured, the whole merged into one
// geometry. A model's frame: x across its footprint (0..w), z down it (0..h), y up from the floor;
// it faces +z (a seat's front, rot 0).

export type V3 = [number, number, number];
/** How much is drawn: 0 clean (few facets), 1 crafted, 2 rich. */
export type Tier = 0 | 1 | 2;

const M = new Matrix4();
const Q = new Quaternion();
const E = new Euler();
const ONE = new Vector3(1, 1, 1);
const C = new Color();

export interface PartOpts {
  at?: V3;
  rot?: V3; // radians, x y z (applied in that order, about the part's own origin)
  scale?: V3;
  /** a shade on the colour (1 as it is): the underside of a leaf, one plank of a few */
  tone?: number;
  /** lit from within (a screen, a VFD, a lamp's bulb): unshaded, and it blooms at night */
  glow?: boolean;
}

export class Model {
  private parts: BufferGeometry[] = [];
  private glows: BufferGeometry[] = [];
  /** turned round the frame's middle (0.5, 0.5) when it's done, radians: a thing drawn facing −z
   *  that faces the room (+z) instead */
  facing = 0;
  constructor(readonly tier: Tier) {}

  /** Add a part in the model's frame, its faces flat and in `color`. */
  add(g: BufferGeometry, color: number, o: PartOpts = {}): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const k of Object.keys(geo.attributes)) if (k !== "position") geo.deleteAttribute(k);
    // (yaw last: a part is tipped, then turned)
    E.set(...(o.rot ?? [0, 0, 0]), "YXZ");
    Q.setFromEuler(E);
    M.compose(new Vector3(...(o.at ?? [0, 0, 0])), Q, o.scale ? new Vector3(...o.scale) : ONE);
    geo.applyMatrix4(M);
    geo.computeVertexNormals(); // (unindexed: a normal a face — the facets)
    C.set(color).multiplyScalar(o.tone ?? 1);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([C.r, C.g, C.b], i * 3);
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    (o.glow ? this.glows : this.parts).push(geo);
    return this;
  }

  /** Everything added, as one geometry (the parts let go); what glows, merged too, in its
   *  `userData.glow` (a BufferGeometry, or null). */
  geometry(): BufferGeometry {
    const g = mergeGeometries(this.parts);
    const glow = this.glows.length ? mergeGeometries(this.glows) : null;
    for (const p of [...this.parts, ...this.glows]) p.dispose();
    this.parts = [];
    this.glows = [];
    if (!g) throw new Error("an empty model");
    if (this.facing)
      for (const x of glow ? [g, glow] : [g]) x.translate(-0.5, 0, -0.5).rotateY(this.facing).translate(0.5, 0, 0.5);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.glow = glow;
    return g;
  }
}

/** What makes one of a kind look unlike another: its look (`props.variant`; unset, 0), its paint or
 *  fabric (`props.color`), a seed from its id (a story detail, what's on its shelves), sat on. */
export interface Look {
  look: number;
  fabric: number | null;
  seed: number;
  occupied: boolean;
  /** switched on or off (`props.on`), or never said */
  on?: boolean;
}

// ── the shapes (each centred on its own origin unless it says) ──────────────────────────────────

/** A box `size` big; `bevel` m off its edges, cut in `seg` facets (1: a chamfer). */
export function box(size: V3, bevel = 0, seg = 1): BufferGeometry {
  const [w, h, d] = size;
  const r = Math.min(bevel, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return r > 0.0005 ? new RoundedBoxGeometry(w, h, d, seg, r) : new BoxGeometry(w, h, d);
}

/** An upright cylinder (r0 at its foot, r1 at its top), its foot at y 0. */
export function cyl(r0: number, r1: number, h: number, seg = 10): BufferGeometry {
  return new CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
}

/** A rod lying along `axis`, its middle at 0 (r0 at its −end, r1 at its +end). */
export function rod(r0: number, r1: number, len: number, axis: "x" | "z", seg = 10): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, len, seg);
  return axis === "x" ? g.rotateZ(-Math.PI / 2) : g.rotateX(Math.PI / 2);
}

/** A turned profile, [radius, y] from the foot up. */
export function lathe(profile: [number, number][], seg = 12): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(Math.max(r, 1e-4), y)),
    seg,
  );
}

export function ball(r: number, seg = 8): BufferGeometry {
  return new SphereGeometry(r, seg, Math.max(3, Math.round(seg * 0.6)));
}

/** A ring lying flat (round y), its middle at 0: radius `r`, its section `tr`. */
export function ring(r: number, tr: number, radial = 6, around = 24): BufferGeometry {
  return new TorusGeometry(r, tr, radial, around).rotateX(Math.PI / 2);
}

/** A tube along the points (a curve through them). */
export function tube(points: V3[], r: number, radial = 6, along = 16): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  return new TubeGeometry(curve, along, r, radial, false);
}

/** An outline (x, y) pushed `depth` along z, centred on z; `bevel` m round its faces. */
export function extrude(outline: [number, number][], depth: number, bevel = 0, curveSeg = 1): BufferGeometry {
  const s = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  const g = new ExtrudeGeometry(s, {
    depth: Math.max(1e-3, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.max(1, curveSeg),
    curveSegments: curveSeg,
  });
  return g.translate(0, 0, -(depth - 2 * bevel) / 2);
}

/** Flat four-cornered pieces lying on whatever they follow (a track's tarmac, its kerbs), each
 *  turned to face up whichever way its corners go round. */
export function quads(qs: V3[][]): BufferGeometry {
  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3) => {
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    pos.push(...a, ...(up >= 0 ? b : c), ...(up >= 0 ? c : b));
  };
  for (const [a, b, c, d] of qs) {
    tri(a, b, c);
    tri(a, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

/** A rounded rectangle's outline (for extrude), its middle at 0. */
export function roundRect(w: number, h: number, r: number, seg = 3): [number, number][] {
  const out: [number, number][] = [];
  const c = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  c(w / 2 - r, h / 2 - r, 0);
  c(-w / 2 + r, h / 2 - r, Math.PI / 2);
  c(-w / 2 + r, -h / 2 + r, Math.PI);
  c(w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2);
  return out;
}

/** A cushion: a rounded box whose top and bottom swell in the middle (`puff` of its height). */
export function cushion(size: V3, puff: number, seg = 2): BufferGeometry {
  const [w, h, d] = size;
  // a box cut in a grid (its faces' middles have points of their own to swell), its edges rounded by
  // pulling each point onto a ball of radius r round the box shrunk by r; `seg` more cuts as it grows
  const r = Math.min(h * 0.45, w / 4, d / 4);
  const n = 2 + 2 * seg;
  const g = new BoxGeometry(w, h, d, n, Math.max(2, seg), n);
  const p = g.attributes.position;
  const v = new Vector3();
  const inner = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(
      Math.max(-w / 2 + r, Math.min(w / 2 - r, v.x)),
      Math.max(-h / 2 + r, Math.min(h / 2 - r, v.y)),
      Math.max(-d / 2 + r, Math.min(d / 2 - r, v.z)),
    );
    v.sub(inner);
    if (v.lengthSq() > 1e-12) v.setLength(r);
    v.add(inner);
    // and swollen in the middle, top and bottom
    const x = (v.x / w) * 2;
    const z = (v.z / d) * 2;
    const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    p.setXYZ(i, v.x, v.y * (1 + puff * k), v.z);
  }
  return g;
}

/** Bend a part round y as it goes across x: z += k·x² (a chair's back wrapping the sitter). */
export function wrap(g: BufferGeometry, k: number): BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + k * p.getX(i) ** 2);
  return g;
}

/** Taper a part along y: its x and z × (1 at its foot … `top` at its head), from y0 to y1. */
export function taper(g: BufferGeometry, top: number, y0: number, y1: number): BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = 1 + (top - 1) * t;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  return g;
}

/** A leaf from its stalk along +z: `len` long, `wid` across at its widest, folded down from its
 *  midrib by `fold` (a share of its half-width), curling down by `bend` at its tip; `splits` cuts
 *  that many slits each side (a monstera's). Both faces, so it reads from under too. */
export function leaf(len: number, wid: number, fold: number, bend: number, seg = 6, splits = 0): BufferGeometry {
  const pos: number[] = [];
  const at = (t: number, side: number, rim: boolean): V3 => {
    // wide near the stalk, a heart's shoulders, to a point
    const half = rim ? (wid / 2) * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.75 : 0;
    const z = t * len;
    const y = -bend * t * t * len - (rim ? fold * half : 0);
    return [side * half, y, z];
  };
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg;
    const t1 = (i + 1) / seg;
    for (const side of [-1, 1]) {
      // a slit: this segment's rim pulled in to the midrib's side
      const slit = splits > 0 && i > 0 && i < seg - 1 && i % Math.max(1, Math.floor((seg - 1) / splits)) === 0;
      const m0 = at(t0, side, false);
      const m1 = at(t1, side, false);
      const r0 = at(t0, side, true);
      const r1 = slit ? lerp3(m1, at(t1, side, true), 0.35) : at(t1, side, true);
      const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
      // (wound so the top faces up whichever side)
      if (side > 0) {
        tri(m0, r1, r0);
        tri(m0, m1, r1);
        tri(m0, r0, r1);
        tri(m0, r1, m1);
      } else {
        tri(m0, r0, r1);
        tri(m0, r1, m1);
        tri(m0, r1, r0);
        tri(m0, m1, r1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
}

const lerp3 = (a: V3, b: V3, k: number): V3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

// ── the looks ────────────────────────────────────────────────────────────────────────────────────

/** Soft Lambert, as the world's things are lit today. */
export function lambert(): MeshLambertMaterial {
  return new MeshLambertMaterial({ vertexColors: true });
}

/** Cel, as the people are shaded (world/cel.ts, their bands), or (`strong`) the bench's bolder one —
 *  a deeper, harder shadow and a third band — over Lambert. */
export function toon(strong = false): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  const bands = strong
    ? `  vec3 n = normalize(vCelN);
  float l = dot(n, normalize(vec3(-0.6, 0.5, 0.62)));
  float dark = 1.0 - smoothstep(-0.04, 0.04, l);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.42, 0.47, 0.74), dark);
  diffuseColor.rgb *= mix(0.86, 1.0, smoothstep(0.42, 0.5, l)) * (1.0 - dark) + dark;
  float rim = smoothstep(0.55, 0.85, 1.0 - abs(n.z)) * smoothstep(0.05, 0.4, -n.x) * (1.0 - dark);
  diffuseColor.rgb += rim * 0.24 * vec3(1.0, 0.9, 0.75);`
    : celBands("vCelN");
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCelN;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvCelN = normalize(normalMatrix * normal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCelN;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n{\n${bands}\n}`);
  };
  m.customProgramCacheKey = () => (strong ? "furn-cel2" : "furn-cel");
  return m;
}
