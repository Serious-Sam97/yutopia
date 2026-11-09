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
  type MeshLambertMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { celBands } from "../cel";
import { litMaterial } from "../look/lit";
import { isLife } from "../look/look-mode";
import {
  CLOTHS,
  type Finish,
  type FinishRef,
  KIT_MATS,
  type KitMat,
  matOfPaint,
  refsOf,
  SELF_COLOURED,
  woodTone,
} from "./life-mats";

// The furniture kit (docs/plan/67-the-furniture.md, phase 0's mock; phase 1 grows it): things
// built in metres from real shapes — bevelled boxes, lathed profiles, tubes, extrusions, puffed
// cushions, folded leaves — each part flat-faceted and vertex-coloured, the whole merged into one
// geometry. A model's frame: x across its footprint (0..w), z down it (0..h), y up from the floor;
// it faces +z (a seat's front, rot 0).

export type V3 = [number, number, number];

// ── the life look's kit (plan 73 phase 6) ────────────────────────────────────────────────────────
// In the life look a part keeps its shape's own smooth shading (creased: hard past CREASE), its boxes
// are rounded, and every point has UVs in metres (projected along its face's most-facing axis) and its
// part's material (`mat`: KIT_MATS' index; life-mats.ts, from its paint) — the world draws each
// material's parts as a bucket of their own (tp/build.ts). Classic draws as it always has.
let LIFE: boolean | null = null;
const life = (): boolean => {
  if (LIFE === null) LIFE = isLife();
  return LIFE;
};
/** The kit in the life look or not (the benches: today's models under the life light); unset, the
 *  page's look. Models already built aren't redrawn. */
export function setLifeKit(on: boolean | null): void {
  LIFE = on;
}
export const isLifeKit = () => life();
const CREASE = 0.9; // (radians: a cylinder's 10 sides shade round, a box's edges stay edges)
/** A box's edges rounded this much (m) in the life look when it asked for none. */
const LIFE_BEVEL = 0.008;

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
  /** see-through, this opaque (0..1): a window's pane, merged with the rest (not a live part) */
  glass?: number;
  /** what it's made of in the life look (else by its paint: life-mats.ts) */
  mat?: KitMat;
}

/** How a live part moves (docs/plan/68-more-furniture.md, live parts: world/furn/liveparts.ts). */
export type LiveAnim =
  // a lava lamp's blob: up and down between lo and hi (m over its rest) over `period` s, stretched
  // as it moves
  | { kind: "lava"; lo: number; hi: number; period: number; phase: number }
  // a flame: flickering taller and shorter, swaying
  | { kind: "flame"; phase: number }
  // turning round its own y (or z) axis at `speed` rad/s
  | { kind: "spin"; axis: "y" | "z"; speed: number }
  // not moving: a part drawn apart for its material (a lava lamp's glass)
  | { kind: "still" }
  // a bulb blinking: lit for `on` of every `period` s, from `phase` of the way in (a marquee's chase)
  | { kind: "blink"; period: number; on: number; phase: number }
  // nodding: tipped round its own z by up to `amp` rad and back, over `period` s (a reindeer's head)
  | { kind: "nod"; amp: number; period: number; phase: number }
  // drifting round: turning round its own y at `speed` rad/s, bobbing `bob` m up and down over
  // `period` s (a snow globe's flakes)
  | { kind: "swirl"; speed: number; bob: number; period: number; phase: number }
  // a clock's hand: round its own z with the time, once every `period` s (12 h, 1 h, 1 min) — the
  // time where you are, or `zone` hours from UTC (a world-time clock's city)
  | { kind: "clock"; period: number; zone?: number };
/** A moving part of a model: its own geometry round its own origin, where it rests, how it moves. */
export interface LivePart {
  geo: BufferGeometry;
  glow: boolean;
  /** see-through, tinted by its colour (a lava lamp's glass and liquid) */
  glass: boolean;
  at: V3;
  rot: V3;
  anim: LiveAnim;
}

export class Model {
  private parts: BufferGeometry[] = [];
  private glows: BufferGeometry[] = [];
  private clears: BufferGeometry[] = [];
  private lives: LivePart[] = [];
  /** turned round the frame's middle (0.5, 0.5) when it's done, radians: a thing drawn facing −z
   *  that faces the room (+z) instead */
  facing = 0;
  /** drawn in the life look (smooth, UVs, materials): as the kit was when it was made */
  readonly life = life();
  /** the look's own picked colour (a sofa's fabric, `Look.fabric`): its parts are cloth, `cloth` */
  fabric: number | null = null;
  cloth: KitMat = "linen";
  private local: FinishRef[] = [];
  constructor(readonly tier: Tier) {}

  /** (the life look) this model's own finishes, first among the paint's guesses: a desk's black ash
   *  stained dark, its laminate panel no cloth. */
  finishes(list: Finish[]): this {
    this.local.push(...refsOf(list));
    return this;
  }
  private onlyMat: KitMat | null = null;
  private noCloth = false;
  /** (the life look) every part of this model one material, whatever its paint (a rug's carpet). */
  only(mat: KitMat): this {
    this.onlyMat = mat;
    return this;
  }
  /** (the life look) this model's paint is paint: no part of it cloth by its colour (a picture's). */
  paint(): this {
    this.noCloth = true;
    return this;
  }

  /** Add a part in the model's frame, its faces flat and in `color`. */
  add(g: BufferGeometry, color: number, o: PartOpts = {}): this {
    if (this.life && !o.glow && o.glass === undefined) return this.addLife(g, color, o);
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
    if (o.glass !== undefined) {
      geo.setAttribute("op", new Float32BufferAttribute(new Float32Array(n).fill(o.glass), 1));
      this.clears.push(geo);
    } else (o.glow ? this.glows : this.parts).push(geo);
    return this;
  }

  /** (the life look) a part smooth-shaded, its UVs in metres, its material and its colour on it */
  private addLife(g: BufferGeometry, color: number, o: PartOpts): this {
    const isCushion = g.userData.cushion === true;
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    E.set(...(o.rot ?? [0, 0, 0]), "YXZ");
    Q.setFromEuler(E);
    M.compose(new Vector3(...(o.at ?? [0, 0, 0])), Q, o.scale ? new Vector3(...o.scale) : ONE);
    g.applyMatrix4(M);
    const geo = toCreasedNormals(g, CREASE);
    if (geo !== g) g.dispose();
    const pos = geo.attributes.position.array as Float32Array;
    const n = geo.attributes.position.count;
    // UVs in metres: each triangle projected along its face's most-facing axis (the grain and the weave
    // at their true size, whichever way a face looks), u along the part's longest way where the face
    // has it — a leg's grain up it, a top's along it
    const uv = new Float32Array(n * 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox as NonNullable<typeof geo.boundingBox>;
    const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
    for (let t = 0; t < n; t += 3) {
      const a = t * 3;
      const ux = pos[a + 3] - pos[a];
      const uy = pos[a + 4] - pos[a + 1];
      const uz = pos[a + 5] - pos[a + 2];
      const vx = pos[a + 6] - pos[a];
      const vy = pos[a + 7] - pos[a + 1];
      const vz = pos[a + 8] - pos[a + 2];
      const nx = Math.abs(uy * vz - uz * vy);
      const ny = Math.abs(uz * vx - ux * vz);
      const nz = Math.abs(ux * vy - uy * vx);
      // (the face's two axes, the longer of the part's first: u)
      const facing = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
      const [a0, a1] = facing === 1 ? [0, 2] : facing === 0 ? [2, 1] : [0, 1];
      let [ua, va] = ext[a1] > ext[a0] * 1.15 ? [a1, a0] : [a0, a1];
      // (unless the face itself runs strongly the other way: one slat of a slatted front, merged into a
      // wide part, its grain up the slat)
      const span = (ax: number) =>
        Math.max(pos[a + ax], pos[a + 3 + ax], pos[a + 6 + ax]) -
        Math.min(pos[a + ax], pos[a + 3 + ax], pos[a + 6 + ax]);
      if (span(va) > span(ua) * 3) [ua, va] = [va, ua];
      for (let k = 0; k < 3; k++) {
        const i = (t + k) * 3;
        uv[(t + k) * 2] = pos[i + ua];
        uv[(t + k) * 2 + 1] = pos[i + va];
      }
    }
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    let by = o.mat ? { mat: o.mat, k: 1 } : matOfPaint(color, this.fabric, this.cloth, this.local);
    // (a cushion is cloth, whatever its paint, unless that's a cloth or leather already; a model of one
    // material is it; a model of paint has no cloth)
    if (isCushion && !o.mat && !CLOTHS.has(by.mat)) by = { mat: this.cloth, k: 1 };
    if (this.onlyMat && !o.mat) by = { mat: this.onlyMat, k: 1 };
    else if (this.noCloth && !o.mat && CLOTHS.has(by.mat)) by = { mat: "matte", k: 1 };
    // (a wood's texture is its colour: its paint only lightens or darkens it)
    // (as light as its paint — a stain's tone where a finish says one: black ash)
    if (SELF_COLOURED.has(by.mat))
      C.setScalar(Math.min(1.5, ("stain" in by ? (by.stain as number) : woodTone(by.mat, color)) * (o.tone ?? 1)));
    else C.set(color).multiplyScalar(o.tone ?? 1);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([C.r, C.g, C.b], i * 3);
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.setAttribute("mat", new Float32BufferAttribute(new Float32Array(n).fill(KIT_MATS.indexOf(by.mat)), 1));
    this.parts.push(geo);
    return this;
  }

  /** A part that moves (a lava lamp's blob, a flame): kept out of the merged model, built round
   *  its own origin and resting at `o.at`, moved each frame by `anim` (live parts: liveparts.ts). */
  live(g: BufferGeometry, color: number, anim: LiveAnim, o: Omit<PartOpts, "glass"> & { glass?: boolean } = {}): this {
    // (the life look: smooth, creased, as the rest of the kit's parts)
    let geo = g.index && !this.life ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const k of Object.keys(geo.attributes)) if (k !== "position") geo.deleteAttribute(k);
    if (o.scale) geo.scale(...o.scale);
    if (this.life) {
      const c = toCreasedNormals(geo, CREASE);
      if (c !== geo) geo.dispose();
      geo = c;
    } else geo.computeVertexNormals();
    C.set(color).multiplyScalar(o.tone ?? 1);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([C.r, C.g, C.b], i * 3);
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    this.lives.push({ geo, glow: !!o.glow, glass: !!o.glass, at: o.at ?? [0, 0, 0], rot: o.rot ?? [0, 0, 0], anim });
    return this;
  }

  /** Everything added, as one geometry (the parts let go); what glows, merged too, in its
   *  `userData.glow` (a BufferGeometry, or null); the live parts in `userData.live` (LivePart[]). */
  geometry(): BufferGeometry {
    const g = mergeGeometries(this.parts);
    const glow = this.glows.length ? mergeGeometries(this.glows) : null;
    const clear = this.clears.length ? mergeGeometries(this.clears) : null;
    for (const p of [...this.parts, ...this.glows, ...this.clears]) p.dispose();
    this.parts = [];
    this.glows = [];
    this.clears = [];
    if (!g) throw new Error("an empty model");
    if (this.facing)
      for (const x of [g, glow, clear]) x?.translate(-0.5, 0, -0.5).rotateY(this.facing).translate(0.5, 0, 0.5);
    // (the live parts turned as the model is: their rest and their heading)
    const live = this.lives.map((p) =>
      this.facing
        ? {
            ...p,
            at: [
              0.5 + (p.at[0] - 0.5) * Math.cos(this.facing) + (p.at[2] - 0.5) * Math.sin(this.facing),
              p.at[1],
              0.5 - (p.at[0] - 0.5) * Math.sin(this.facing) + (p.at[2] - 0.5) * Math.cos(this.facing),
            ] as V3,
            rot: [p.rot[0], p.rot[1] + this.facing, p.rot[2]] as V3,
          }
        : p,
    );
    this.lives = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.glow = glow;
    g.userData.clear = clear;
    g.userData.live = live;
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
  // (the life look: a box's edges rounded by its size — one that asked for none rounded only if it's 15 cm
  // or more and 4 cm through (one segment, 108 triangles; two, 300, from 30 cm), so a book, a brick, a
  // record's sleeve and a button stay boxes; one that asked for a bevel two segments from 30 cm. Rounding
  // every box made a furnished room 2.5 times today's triangles: a fireplace's bricks 34k, books 20k)
  if (life()) {
    const big = Math.max(w, h, d);
    const thin = Math.min(w, h, d);
    if (bevel <= 0 && big >= 0.15 && thin >= 0.04) {
      bevel = Math.min(LIFE_BEVEL, thin * 0.25);
      seg = big < 0.3 ? 1 : 2;
    } else if (bevel > 0 && big >= 0.3) seg = Math.max(seg, 2);
  }
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

/** Several shapes as one (each already where it goes): a live part made of many — a marquee's set of
 *  bulbs blinking together, one draw. */
export function merged(geos: BufferGeometry[]): BufferGeometry {
  const flat = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== "position") n.deleteAttribute(k);
    return n;
  });
  const g = mergeGeometries(flat);
  if (!g) throw new Error("nothing to merge");
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
  const sag = life();
  // (the life look: more cuts across, for the sag's dip to be round)
  const n = 2 + 2 * seg + (sag ? 4 : 0);
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
    let y = v.y * (1 + puff * k);
    // (the life look: the face that's sat or leant on dips softly in the middle, a little toward the
    // front — a cushion used, not a pillow; its rim stays full)
    if (sag && v.y > 0) {
      const sx = v.x / (w * 0.32);
      const sz = (v.z - d * 0.08) / (d * 0.36);
      y -= h * 0.16 * Math.exp(-(sx * sx + sz * sz));
    }
    p.setXYZ(i, v.x, y, v.z);
  }
  g.userData.cushion = true;
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
  return litMaterial({ vertexColors: true });
}

/** Cel, as the people are shaded (world/cel.ts, their bands), or (`strong`) the bench's bolder one —
 *  a deeper, harder shadow and a third band — over Lambert. */
export function toon(strong = false): MeshLambertMaterial {
  const m = litMaterial({ vertexColors: true });
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
