import { Color, CylinderGeometry, ShapeUtils, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { type Draw, type Face, INK, type Mat, mixc, type Pt, Sketch, sh, type V3 } from "../art/items/kit";

// The item kit (art/items/kit.ts) in 3D: the same item drawings — boxes,
// cylinders, details on faces — go into vertex buffers instead of an isometric
// SVG. Details land on every face (not just the two the iso camera sees), and
// free-hand SVG (`raw`: leaves, glows, screen content) becomes a camera-facing
// card cut from the iso drawing.
//
// Units: x/y in tiles; heights come in iso px and are turned into tiles with
// ZPX (the iso camera looks down 30°, so a px of height is 1/cos 30° of a px of
// ground, and a tile edge is 45.25 px long).

export const LPX = 45.25; // iso px per tile of horizontal length
export const ZPX = LPX * Math.cos(Math.PI / 6); // iso px of height per tile (39.19)
export const zt = (z: number) => z / ZPX;

const EPS = 0.02;

// Overlapping faces in one plane fight over the depth buffer (they flicker as
// the camera moves). The iso view paints in order, the later on top; here the
// later one goes a hair in front instead — box faces lying in an earlier box's
// face, details on faces, an outline over its own fill (see Layers).
// (camera near = 0.1: a 24-bit depth buffer tells STEP apart out to ~40 tiles)
const STEP = 0.0012; // tiles between one layer and the next
const NEAR = 0.003; // closer than this to what's drawn: the same plane
const LIFT = 0.003; // details off their face, at least
const PUSH_MAX = 0.006; // a box face moves out at most this (its sides grow with it)

// ── buffers ──────────────────────────────────────────────────────────────────
// Non-indexed triangles: position, normal, rgba colour (linear).
export class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  get empty() {
    return this.pos.length === 0;
  }
  // (wound to face `n`, whatever order the corners come in)
  tri(a: V3, b: V3, c: V3, n: V3, rgba: number[]) {
    const ok = dot(cross(sub(b, a), sub(c, a)), n) >= 0;
    for (const p of ok ? [a, b, c] : [a, c, b]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
  // a, b, c, d counter-clockwise seen from the side `n` points to
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, rgba: number[]) {
    this.tri(a, b, c, n, rgba);
    this.tri(a, c, d, n, rgba);
  }
}

// A card: free-hand SVG drawn the iso way, shown upright and turned to the
// camera around its vertical axis. (u, v) in tiles around the anchor.
export interface Card {
  svg: string;
  x: number;
  y: number;
  z: number; // tiles
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  px: number; // texture px per iso px
  glow: boolean;
}

export interface Soft {
  // contact shadows, plan tiles: rects (with rounding) and dots
  rects: { x0: number; y0: number; x1: number; y1: number; op: number; round: number }[];
  dots: { x: number; y: number; r: number; op: number }[];
}

// A decal: free-hand SVG drawn on a box's or a cylinder's faces (a flyer, the
// fluting of a column, what's on a screen), mapped back onto those faces. The
// iso drawing of a flat face is an affine image of it, so each vertex's UV is
// just where the iso view put it: exact on the face, seen from anywhere.
export interface Decal {
  svg: string;
  pos: number[];
  nor: number[];
  uv: number[];
  glow: boolean;
}

// What's drawn flat on faces so far (one per Out, so the slices of a wall and
// its post see each other): `place` puts the next thing in front of all it
// overlaps in its plane. Heights run along the face's normal; (a, b) are the
// face's own axes (t: x, y — n/s: x, z — e/w: y, z), in world tiles.
interface Mark {
  base: number;
  top: number;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}
export class Layers {
  private cells = new Map<string, Mark[]>();
  // returns the height to draw at: `min` or more
  place(f: Face | "t", h: number, a0: number, a1: number, b0: number, b1: number, min = h): number {
    const bin = Math.round(h * 20);
    const c0 = Math.floor(a0);
    const c1 = Math.floor(a1);
    let top = Number.NEGATIVE_INFINITY;
    for (let k = bin - 1; k <= bin + 1; k++)
      for (let c = c0; c <= c1; c++)
        for (const m of this.cells.get(`${f}${k}|${c}`) ?? [])
          if (
            m.top > top &&
            h >= m.base - NEAR &&
            h <= m.top + NEAR &&
            Math.min(m.a1, a1) - Math.max(m.a0, a0) > 1e-4 &&
            Math.min(m.b1, b1) - Math.max(m.b0, b0) > 1e-4
          )
            top = m.top;
    const at = Math.max(min, top + STEP);
    const m = { base: h, top: at, a0, a1, b0, b1 };
    for (let c = c0; c <= c1; c++) {
      const key = `${f}${bin}|${c}`;
      const list = this.cells.get(key);
      if (list) list.push(m);
      else this.cells.set(key, [m]);
    }
    return at;
  }
}

export class Out {
  layers = new Layers(); // what lies on faces, in order (see STEP)
  lit = new Geo();
  glow = new Geo();
  clear = new Geo(); // see-through (glass, op < 1)
  lines: number[] = []; // segments (ink), xyz pairs
  lineCol: number[] = [];
  cards: Card[] = [];
  decals: Decal[] = [];
  soft: Soft = { rects: [], dots: [] };
}

// ── colours ──────────────────────────────────────────────────────────────────
const tmp = new Color();
function rgba(css: string, alpha = 1): number[] | null {
  const s = css.trim();
  if (!s || s === "none" || s === "transparent") return null;
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const [r, g, b, a] = m[1].split(",").map((v) => Number.parseFloat(v));
    tmp.setRGB(r / 255, g / 255, b / 255, "srgb");
    return [tmp.r, tmp.g, tmp.b, (Number.isFinite(a) ? a : 1) * alpha];
  }
  try {
    tmp.setStyle(s);
  } catch {
    return null;
  }
  return [tmp.r, tmp.g, tmp.b, alpha];
}

// face → outward normal (world, three axes: x, up, y→z)
const NORMAL: Record<Face | "t", V3> = {
  n: [0, 0, -1],
  s: [0, 0, 1],
  e: [1, 0, 0],
  w: [-1, 0, 0],
  t: [0, 1, 0],
};
// a little of the illustration's light: side faces a touch darker than tops
const SIDE_TONE: Record<Face, number> = { n: 0.94, s: 0.97, e: 0.9, w: 0.92 };

type BoxSpec = Parameters<Sketch["box"]>[0];
type CylSpec = Parameters<Sketch["cyl"]>[0];
type ShapeBB = Parameters<Sketch["shape"]>[0];
interface Clip {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Opts3 {
  rot?: number;
  w: number;
  h: number;
  seed?: number;
  offset?: [number, number];
  clip?: Clip | null;
  // world placement of the sketch's origin (tiles) and a lift (iso px)
  at: [number, number];
  lift?: number;
  // walls: details drawn on the s/e face are mirrored onto n/w (the iso view
  // only ever sees one side of a wall; in 3D both are seen)
  mirror?: boolean;
  out: Out;
}

export class MeshSketch extends Sketch {
  private o3: Opts3;
  private cl: Clip | null;
  private gdefs = new Map<string, { id: string; svg: string; mid: string }>();
  private raw: { svg: string; glow: boolean }[] = [];
  private rawBB: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; pad: number } | null = null;

  constructor(o: Opts3) {
    super({ rot: o.rot, w: o.w, h: o.h, seed: o.seed, offset: o.offset });
    this.o3 = o;
    this.cl = o.clip ?? null;
  }

  private get out() {
    return this.o3.out;
  }

  // rotated-local tiles + iso px height → world (three axes)
  private wp(X: number, Y: number, z: number): V3 {
    return [X + this.o3.at[0], zt(z + (this.o3.lift ?? 0)), Y + this.o3.at[1]];
  }

  private lfaceOf(world: Face): Face {
    const order: Face[] = ["n", "e", "s", "w"];
    return order[(order.indexOf(world) - this.rot + 8) % 4];
  }

  // ── gradients: kept for cards, a mid colour for meshes ─────────────────────
  override grad(a: string, b: string, dir: "v" | "d" | "h" = "v"): string {
    const key = `${a}${b}${dir}`;
    let d = this.gdefs.get(key);
    if (!d) {
      const id = `g${this.gdefs.size}`;
      const [x2, y2] = dir === "v" ? [0, 1] : dir === "h" ? [1, 0] : [1, 1];
      d = {
        id,
        svg: `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
        mid: mixc(a, b, 0.5),
      };
      this.gdefs.set(key, d);
    }
    return `url(#${d.id})`;
  }
  override gradAt(a: string, b: string, p1: Pt, p2: Pt): string {
    const key = `u${a}${b}${p1.join(",")},${p2.join(",")}`;
    let d = this.gdefs.get(key);
    if (!d) {
      const id = `u${this.gdefs.size}`;
      d = {
        id,
        svg: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
        mid: mixc(a, b, 0.5),
      };
      this.gdefs.set(key, d);
    }
    return `url(#${d.id})`;
  }
  override radial(stops: [number, string, number][], id?: string): string {
    const key = `r${JSON.stringify(stops)}`;
    let d = this.gdefs.get(key);
    if (!d) {
      const rid = id ?? `r${this.gdefs.size}`;
      d = {
        id: rid,
        svg: `<radialGradient id="${rid}" cx="50%" cy="45%" r="60%">${stops
          .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
          .join("")}</radialGradient>`,
        mid: stops[0]?.[1] ?? "#888888",
      };
      this.gdefs.set(key, d);
    }
    return `url(#${d.id})`;
  }
  private paint(fill: string, alpha = 1): number[] | null {
    const m = /^url\(#([^)]+)\)$/.exec(fill.trim());
    if (m) {
      for (const d of this.gdefs.values()) if (d.id === m[1]) return rgba(d.mid, alpha);
      return null;
    }
    return rgba(fill, alpha);
  }

  // ── primitives ───────────────────────────────────────────────────────────
  override box(b: BoxSpec, details?: (d: Draw) => void) {
    const [ax, ay] = this.rp(b.x, b.y);
    const [bx, by] = this.rp(b.x + b.w, b.y + b.d);
    let x0 = Math.min(ax, bx);
    let x1 = Math.max(ax, bx);
    let y0 = Math.min(ay, by);
    let y1 = Math.max(ay, by);
    const c = this.cl;
    if (c) {
      x0 = Math.max(x0, c.x0);
      x1 = Math.min(x1, c.x1);
      y0 = Math.max(y0, c.y0);
      y1 = Math.min(y1, c.y1);
      if (x1 <= x0 + 1e-4 || y1 <= y0 + 1e-4) return;
    }
    const z0 = b.z;
    let z1 = b.z + b.h;
    // faces lying in what's already drawn (this sketch's out): out a hair
    if (!((b.puff ?? 0) > 0 && b.h >= 3)) {
      const [ox, oy] = this.o3.at;
      const [X0, X1, Y0, Y1] = [x0 + ox, x1 + ox, y0 + oy, y1 + oy];
      const Z0 = this.wp(0, 0, z0)[1];
      const Z1 = this.wp(0, 0, z1)[1];
      const L = this.out.layers;
      const out = (f: Face | "t", h: number, a0: number, a1: number, b0: number, b1: number) =>
        Math.min(PUSH_MAX, L.place(f, h, a0, a1, b0, b1) - h);
      const t = out("t", Z1, X0, X1, Y0, Y1);
      if (b.h > 0) {
        const n = out("n", -Y0, X0, X1, Z0, Z1);
        const s = out("s", Y1, X0, X1, Z0, Z1);
        const w = out("w", -X0, Y0, Y1, Z0, Z1);
        const e = out("e", X1, Y0, Y1, Z0, Z1);
        // (a slice's cut ends stay on the cut)
        if (!(c && x0 <= c.x0 + 1e-4)) x0 -= w;
        if (!(c && x1 >= c.x1 - 1e-4)) x1 += e;
        if (!(c && y0 <= c.y0 + 1e-4)) y0 -= n;
        if (!(c && y1 >= c.y1 - 1e-4)) y1 += s;
      }
      z1 += t * ZPX;
    }
    const op = b.op ?? 1;
    const target = b.glow ? this.out.glow : op < 1 ? this.out.clear : this.out.lit;
    const faceMat = (world: Face): Mat => b.faces?.[this.lfaceOf(world)] ?? b.mat;
    const top = rgba(b.mat.top ?? sh(b.mat.c, 1.08), op) as number[];
    const side = (f: Face) => {
      const m = faceMat(f);
      const base = rgba(m.c, op) as number[];
      return [base[0] * SIDE_TONE[f], base[1] * SIDE_TONE[f], base[2] * SIDE_TONE[f], base[3]];
    };
    const puff = b.puff ?? 0;
    if (puff > 0 && b.h >= 3) {
      // upholstery: a rounded box
      const w = x1 - x0;
      const d = y1 - y0;
      const h = zt(b.h);
      const r = Math.min((puff / LPX) * 1.6, w / 2 - 0.001, d / 2 - 0.001, h / 2 - 0.001);
      const rb = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, r));
      const g = rb.index ? rb.toNonIndexed() : rb;
      const p = g.getAttribute("position");
      const n = g.getAttribute("normal");
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const base = this.wp(cx, cy, z0);
      const cols = { t: top, n: side("n"), s: side("s"), e: side("e"), w: side("w") };
      for (let i = 0; i < p.count; i += 3) {
        const tri: V3[] = [];
        const nn: V3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          tri.push([p.getX(i + k) + base[0], p.getY(i + k) + h / 2 + base[1], p.getZ(i + k) + base[2]]);
          nn[0] += n.getX(i + k);
          nn[1] += n.getY(i + k);
          nn[2] += n.getZ(i + k);
        }
        const f: Face | "t" =
          nn[1] > Math.max(Math.abs(nn[0]), Math.abs(nn[2]))
            ? "t"
            : Math.abs(nn[0]) > Math.abs(nn[2])
              ? nn[0] > 0
                ? "e"
                : "w"
              : nn[2] > 0
                ? "s"
                : "n";
        const col = cols[f];
        for (let k = 0; k < 3; k++) {
          const v = tri[k];
          target.pos.push(v[0], v[1], v[2]);
          target.nor.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
          target.col.push(col[0], col[1], col[2], col[3]);
        }
      }
      g.dispose();
      rb.dispose();
    } else {
      const A = this.wp(x0, y0, z0);
      const B = this.wp(x1, y0, z0);
      const C = this.wp(x1, y1, z0);
      const D = this.wp(x0, y1, z0);
      const At = this.wp(x0, y0, z1);
      const Bt = this.wp(x1, y0, z1);
      const Ct = this.wp(x1, y1, z1);
      const Dt = this.wp(x0, y1, z1);
      target.quad(Dt, Ct, Bt, At, NORMAL.t, top);
      if (b.h > 0) {
        target.quad(B, A, At, Bt, NORMAL.n, side("n"));
        target.quad(D, C, Ct, Dt, NORMAL.s, side("s"));
        target.quad(C, B, Bt, Ct, NORMAL.e, side("e"));
        target.quad(A, D, Dt, At, NORMAL.w, side("w"));
      }
      // ink: the outline, like the drawings (not on cut ends of walls)
      const lw = b.line ?? 1.3;
      if (lw > 0 && b.h >= 1.5) {
        const ink = rgba(INK, 0.5 * Math.min(1, lw / 1.3)) as number[];
        const seg = (p: V3, q: V3) => {
          this.out.lines.push(...p, ...q);
          this.out.lineCol.push(...ink, ...ink);
        };
        const cutX0 = !!c && x0 <= c.x0 + 1e-4;
        const cutX1 = !!c && x1 >= c.x1 - 1e-4;
        const cutY0 = !!c && y0 <= c.y0 + 1e-4;
        const cutY1 = !!c && y1 >= c.y1 - 1e-4;
        if (!cutY0) seg(At, Bt);
        if (!cutX1) seg(Bt, Ct);
        if (!cutY1) seg(Ct, Dt);
        if (!cutX0) seg(Dt, At);
        if (!cutX0 && !cutY0) seg(A, At);
        if (!cutX1 && !cutY0) seg(B, Bt);
        if (!cutX1 && !cutY1) seg(C, Ct);
        if (!cutX0 && !cutY1) seg(D, Dt);
      }
    }
    // free-hand drawing on its faces: a decal on the faces the iso view saw (top, +y, +x)
    this.onFace = [];
    details?.(this.drawer3(!!b.glow));
    const raws = this.onFace;
    this.onFace = null;
    if (raws.length)
      this.decal(raws, [
        {
          n: NORMAL.t,
          q: [
            [x0, y1, z1],
            [x1, y1, z1],
            [x1, y0, z1],
            [x0, y0, z1],
          ],
        },
        {
          n: NORMAL.s,
          q: [
            [x0, y1, z0],
            [x1, y1, z0],
            [x1, y1, z1],
            [x0, y1, z1],
          ],
        },
        {
          n: NORMAL.e,
          q: [
            [x1, y1, z0],
            [x1, y0, z0],
            [x1, y0, z1],
            [x1, y1, z1],
          ],
        },
      ]);
  }

  override cyl(o: CylSpec, details?: (d: Draw) => void) {
    const [X, Y] = this.rp(o.x, o.y);
    const c = this.cl;
    if (c && (X < c.x0 - EPS || X >= c.x1 - EPS || Y < c.y0 - EPS || Y >= c.y1 - EPS)) return;
    const r2 = o.r2 ?? o.r;
    const target = o.glow ? this.out.glow : this.out.lit;
    const top = rgba(o.mat.top ?? sh(o.mat.c, 1.08)) as number[];
    const side = rgba(o.mat.c) as number[];
    const h = zt(o.h);
    const base = this.wp(X, Y, o.z);
    const seg = Math.max(10, Math.min(28, Math.round(o.r * 60)));
    const g = new CylinderGeometry(r2, o.r, Math.max(h, 1e-4), seg, 1, o.h <= 0).toNonIndexed();
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      const ny = n.getY(i);
      if (ny < -0.5) continue; // bottoms are never seen
      const col = ny > 0.5 ? top : side;
      target.pos.push(p.getX(i) + base[0], p.getY(i) + h / 2 + base[1], p.getZ(i) + base[2]);
      target.nor.push(n.getX(i), ny, n.getZ(i));
      target.col.push(col[0], col[1], col[2], col[3]);
    }
    // the bottom cap's triangles were skipped vertex by vertex: drop partial triangles
    trimPartial(target);
    g.dispose();
    const lw = o.line ?? 1.1;
    if (lw > 0) {
      const ink = rgba(INK, 0.45) as number[];
      const yTop = base[1] + h;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        this.out.lines.push(
          base[0] + Math.cos(a0) * r2,
          yTop,
          base[2] + Math.sin(a0) * r2,
          base[0] + Math.cos(a1) * r2,
          yTop,
          base[2] + Math.sin(a1) * r2,
        );
        this.out.lineCol.push(...ink, ...ink);
      }
    }
    // free-hand drawing on it: a decal round the half the iso view saw, and its top
    this.onFace = [];
    details?.(this.drawer3(!!o.glow));
    const raws = this.onFace;
    this.onFace = null;
    if (raws.length) {
      const faces: { n: V3; q: V3[] }[] = [];
      const N = 24;
      const k = 1.01;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2;
        const a1 = ((i + 1) / N) * Math.PI * 2;
        const am = (a0 + a1) / 2;
        if (Math.cos(am) + Math.sin(am) <= 0) continue; // the side away from the iso camera
        const p = (a: number, r: number, z: number): V3 => [X + Math.cos(a) * r * k, Y + Math.sin(a) * r * k, z];
        faces.push({
          n: [Math.cos(am), 0, Math.sin(am)],
          q: [p(a0, o.r, o.z), p(a1, o.r, o.z), p(a1, r2, o.z + o.h), p(a0, r2, o.z + o.h)],
        });
      }
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2;
        const a1 = ((i + 1) / N) * Math.PI * 2;
        const zt0 = o.z + o.h;
        faces.push({
          n: NORMAL.t,
          q: [
            [X, Y, zt0],
            [X + Math.cos(a1) * r2, Y + Math.sin(a1) * r2, zt0],
            [X + Math.cos(a0) * r2, Y + Math.sin(a0) * r2, zt0],
          ],
        });
      }
      this.decal(raws, faces);
    }
  }

  override shape(bb: ShapeBB, draw: (d: Draw) => void, o: { pad?: number; bias?: boolean } = {}) {
    const [ax, ay] = this.rp(bb.x, bb.y);
    const [bx, by] = this.rp(bb.x + bb.w, bb.y + bb.d);
    const r = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
    const c = this.cl;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    if (c && (cx < c.x0 - EPS || cx >= c.x1 - EPS || cy < c.y0 - EPS || cy >= c.y1 - EPS)) return;
    this.withRaw({ ...r, z0: bb.z, z1: bb.z + bb.h, pad: o.pad ?? 2 }, () => draw(this.drawer3(false)));
  }

  override shadow(x: number, y: number, w: number, d: number, op = 0.38, round = 0.25) {
    const [ax, ay] = this.rp(x, y);
    const [bx, by] = this.rp(x + w, y + d);
    const [ox, oy] = this.o3.at;
    this.out.soft.rects.push({
      x0: Math.min(ax, bx) + ox,
      y0: Math.min(ay, by) + oy,
      x1: Math.max(ax, bx) + ox,
      y1: Math.max(ay, by) + oy,
      op,
      round,
    });
  }
  override shadowDot(x: number, y: number, r: number, op = 0.4) {
    const [X, Y] = this.rp(x, y);
    this.out.soft.dots.push({ x: X + this.o3.at[0], y: Y + this.o3.at[1], r, op });
  }

  // raw SVG drawn while `f` runs is collected into this sketch's card
  private withRaw(bb: NonNullable<MeshSketch["rawBB"]>, f: () => void) {
    const n = this.raw.length;
    f();
    if (this.raw.length === n) return;
    const r = this.rawBB;
    this.rawBB = r
      ? {
          x0: Math.min(r.x0, bb.x0),
          x1: Math.max(r.x1, bb.x1),
          y0: Math.min(r.y0, bb.y0),
          y1: Math.max(r.y1, bb.y1),
          z0: Math.min(r.z0, bb.z0),
          z1: Math.max(r.z1, bb.z1),
          pad: Math.max(r.pad, bb.pad),
        }
      : bb;
  }

  private drawer3(glowAll: boolean): Draw {
    const toR = (p: V3): V3 => {
      const [X, Y] = this.rp(p[0], p[1]);
      return [X, Y, p[2]];
    };
    const clipR = (pts: V3[]): V3[] => {
      const c = this.cl;
      if (!c) return pts;
      let out = pts;
      const planes: [0 | 1, number, 1 | -1][] = [
        [0, c.x0, 1],
        [0, c.x1, -1],
        [1, c.y0, 1],
        [1, c.y1, -1],
      ];
      for (const [ax, v, sgn] of planes) {
        const res: V3[] = [];
        for (let i = 0; i < out.length; i++) {
          const a = out[i];
          const q = out[(i + 1) % out.length];
          const ia = (a[ax] - v) * sgn >= -1e-6;
          const iq = (q[ax] - v) * sgn >= -1e-6;
          if (ia) res.push(a);
          if (ia !== iq) {
            const t = (v - a[ax]) / (q[ax] - a[ax]);
            res.push([a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t, a[2] + (q[2] - a[2]) * t]);
          }
        }
        out = res;
        if (!out.length) break;
      }
      return out;
    };
    // one decal (rotated-local points) on a world face, and its mirror on walls
    const emit = (
      wf: Face | "t",
      pts: V3[],
      fill: number[] | null,
      stroke: number[] | null,
      sw: number,
      glow: boolean,
    ) => {
      const faces: [Face | "t", V3[]][] = [[wf, pts]];
      if (this.o3.mirror && wf === "s") faces.push(["n", pts.map(([X, Y, z]) => [X, -Y, z] as V3)]);
      if (this.o3.mirror && wf === "e") faces.push(["w", pts.map(([X, Y, z]) => [-X, Y, z] as V3)]);
      for (const [f, p] of faces) {
        const n = NORMAL[f];
        const base = p.map(([X, Y, z]) => this.wp(X, Y, z));
        // in front of what it overlaps (its outline in front of its fill)
        const lifted = (h: number) => {
          const d = h - dot(base[0], n);
          return base.map((w) => [w[0] + n[0] * d, w[1] + n[1] * d, w[2] + n[2] * d] as V3);
        };
        const world = lifted(this.lay(f, fill ? base : this.outline(base, n, sw)));
        if (fill) {
          const flat = world.map((w) =>
            f === "t"
              ? new Vector2(w[0], w[2])
              : f === "n" || f === "s"
                ? new Vector2(w[0], w[1])
                : new Vector2(w[2], w[1]),
          );
          if (ShapeUtils.isClockWise(flat)) {
            flat.reverse();
            world.reverse();
          }
          const tris = ShapeUtils.triangulateShape(flat, []);
          const target = glow ? this.out.glow : fill[3] < 1 ? this.out.clear : this.out.lit;
          for (const [a, b, c] of tris) {
            // keep the winding facing out
            const A = world[a];
            const B = world[b];
            const C = world[c];
            const cr = cross(sub(B, A), sub(C, A));
            if (dot(cr, n) >= 0) target.tri(A, B, C, n, fill);
            else target.tri(A, C, B, n, fill);
          }
        }
        if (stroke) {
          const edge = fill ? lifted(this.lay(f, this.outline(base, n, sw))) : world;
          for (let i = 0; i < edge.length; i++) this.strip(edge[i], edge[(i + 1) % edge.length], n, sw, stroke);
        }
      }
    };
    return {
      m: this.m,
      vis: () => true,
      poly: (f, p, fill, o = {}) => {
        const q = clipR(p.map(toR));
        if (q.length < 3) return;
        const wf = f === "t" ? "t" : this.wface(f);
        const fc = this.paint(fill, o.op ?? 1);
        const sc = o.stroke ? this.paint(o.stroke, o.op ?? 1) : null;
        emit(wf, q, fc, sc, o.sw ?? 0.7, glowAll || !!o.glow);
      },
      line: (f, a, b, stroke, sw = 0.7, op = 1) => {
        const q = clipR([toR(a), toR(b), toR(b)]);
        if (q.length < 2) return;
        const col = this.paint(stroke, op);
        if (!col) return;
        const wf = f === "t" ? "t" : this.wface(f);
        const pairs: [Face | "t", V3, V3][] = [[wf, q[0], q[1]]];
        if (this.o3.mirror && wf === "s") pairs.push(["n", [q[0][0], -q[0][1], q[0][2]], [q[1][0], -q[1][1], q[1][2]]]);
        if (this.o3.mirror && wf === "e") pairs.push(["w", [-q[0][0], q[0][1], q[0][2]], [-q[1][0], q[1][1], q[1][2]]]);
        for (const [f2, A, B] of pairs) {
          const n = NORMAL[f2];
          const wa = this.wp(A[0], A[1], A[2]);
          const wb = this.wp(B[0], B[1], B[2]);
          const lift = this.lay(f2, stripQuad(wa, wb, n, sw) ?? [wa, wb]) - dot(wa, n);
          this.strip(
            [wa[0] + n[0] * lift, wa[1] + n[1] * lift, wa[2] + n[2] * lift],
            [wb[0] + n[0] * lift, wb[1] + n[1] * lift, wb[2] + n[2] * lift],
            n,
            sw,
            col,
          );
        }
      },
      raw: (svg, glow = false) => {
        (this.onFace ?? this.raw).push({ svg, glow: glowAll || glow });
      },
    };
  }

  // the corners of a closed outline's strips (what it covers)
  private outline(pts: V3[], n: V3, sw: number): V3[] {
    const all: V3[] = [];
    for (let i = 0; i < pts.length; i++) all.push(...(stripQuad(pts[i], pts[(i + 1) % pts.length], n, sw) ?? []));
    return all.length ? all : pts;
  }

  // A detail on face `f` (the world points it covers): the height along the
  // face's normal to draw it at.
  private lay(f: Face | "t", pts: V3[]): number {
    const [ai, bi] = f === "t" ? [0, 2] : f === "n" || f === "s" ? [0, 1] : [2, 1];
    let a0 = 1e9;
    let a1 = -1e9;
    let b0 = 1e9;
    let b1 = -1e9;
    for (const q of pts) {
      a0 = Math.min(a0, q[ai]);
      a1 = Math.max(a1, q[ai]);
      b0 = Math.min(b0, q[bi]);
      b1 = Math.max(b1, q[bi]);
    }
    const h = dot(pts[0], NORMAL[f]);
    return this.out.layers.place(f, h, a0, a1, b0, b1, h + LIFT);
  }

  // a line on a face: a thin quad, `sw` iso px wide
  private strip(a: V3, b: V3, n: V3, sw: number, col: number[]) {
    const q = stripQuad(a, b, n, sw);
    if (!q) return;
    const [A, B, C, D] = q;
    const target = col[3] < 1 ? this.out.clear : this.out.lit;
    const cr = cross(sub(B, A), sub(C, A));
    if (dot(cr, n) >= 0) target.quad(A, B, C, D, n, col);
    else target.quad(A, D, C, B, n, col);
  }

  // raw SVG drawn while a box's / cylinder's details run (null otherwise)
  private onFace: { svg: string; glow: boolean }[] | null = null;

  // Map free-hand SVG back onto faces (rotated-local points, iso px heights):
  // each vertex's UV is where the iso view drew it.
  private decal(raws: { svg: string; glow: boolean }[], faces: { n: V3; q: V3[] }[], px = 4) {
    const pts = faces.flatMap((f) => f.q.map(([X, Y, z]) => Sketch.proj(X, Y, z)));
    const pad = 6;
    const sx0 = Math.floor(Math.min(...pts.map((p) => p[0])) - pad);
    const sx1 = Math.ceil(Math.max(...pts.map((p) => p[0])) + pad);
    const sy0 = Math.floor(Math.min(...pts.map((p) => p[1])) - pad);
    const sy1 = Math.ceil(Math.max(...pts.map((p) => p[1])) + pad);
    const w = sx1 - sx0;
    const h = sy1 - sy0;
    const defs = [...this.gdefs.values()].map((d) => d.svg).join("");
    for (const glow of [false, true]) {
      const body = raws
        .filter((r) => r.glow === glow)
        .map((r) => r.svg)
        .join("");
      if (!body) continue;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * px)}" height="${Math.round(h * px)}" viewBox="${sx0} ${sy0} ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
      const d: Decal = { svg, pos: [], nor: [], uv: [], glow };
      const lift = 0.005;
      const vert = ([X, Y, z]: V3, n: V3) => {
        const wp = this.wp(X, Y, z);
        d.pos.push(wp[0] + n[0] * lift, wp[1] + n[1] * lift, wp[2] + n[2] * lift);
        d.nor.push(n[0], n[1], n[2]);
        const [sx, sy] = Sketch.proj(X, Y, z);
        d.uv.push((sx - sx0) / w, 1 - (sy - sy0) / h);
      };
      for (const f of faces) {
        // a fan, wound to face out
        for (let i = 1; i + 1 < f.q.length; i++) {
          const tri = [f.q[0], f.q[i], f.q[i + 1]];
          const wa = this.wp(...tri[0]);
          const wb = this.wp(...tri[1]);
          const wc = this.wp(...tri[2]);
          const ok = dot(cross(sub(wb, wa), sub(wc, wa)), f.n) >= 0;
          for (const v of ok ? tri : [tri[0], tri[2], tri[1]]) vert(v, f.n);
        }
      }
      this.out.decals.push(d);
    }
  }

  // Close the sketch: the raw SVG (if any) becomes this item's card.
  end(px = 3) {
    if (!this.raw.length || !this.rawBB) return;
    const bb = this.rawBB;
    const corners: Pt[] = [];
    for (const X of [bb.x0, bb.x1])
      for (const Y of [bb.y0, bb.y1]) for (const z of [bb.z0, bb.z1]) corners.push(Sketch.proj(X, Y, z));
    const pad = bb.pad + 4;
    const sx0 = Math.floor(Math.min(...corners.map((p) => p[0])) - pad);
    const sx1 = Math.ceil(Math.max(...corners.map((p) => p[0])) + pad);
    const sy0 = Math.floor(Math.min(...corners.map((p) => p[1])) - pad);
    const sy1 = Math.ceil(Math.max(...corners.map((p) => p[1])) + pad);
    // anchor: the middle of the box at its base
    const cx = (bb.x0 + bb.x1) / 2;
    const cy = (bb.y0 + bb.y1) / 2;
    const [ax, ay] = Sketch.proj(cx, cy, bb.z0);
    const defs = [...this.gdefs.values()].map((d) => d.svg).join("");
    for (const glow of [false, true]) {
      const body = this.raw
        .filter((r) => r.glow === glow)
        .map((r) => r.svg)
        .join("");
      if (!body) continue;
      const w = sx1 - sx0;
      const h = sy1 - sy0;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * px)}" height="${Math.round(h * px)}" viewBox="${sx0} ${sy0} ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
      const wpos = this.wp(cx, cy, bb.z0);
      this.out.cards.push({
        svg,
        x: wpos[0],
        y: wpos[2],
        z: wpos[1],
        u0: (sx0 - ax) / LPX,
        u1: (sx1 - ax) / LPX,
        v0: -(sy1 - ay) / ZPX,
        v1: -(sy0 - ay) / ZPX,
        px,
        glow,
      });
    }
  }
}

// a line on a face as a thin quad, `sw` iso px wide (null if it has no length)
function stripQuad(a: V3, b: V3, n: V3, sw: number): [V3, V3, V3, V3] | null {
  const d = sub(b, a);
  if (Math.hypot(d[0], d[1], d[2]) < 1e-5) return null;
  const p = cross(d, n);
  const pl = Math.hypot(p[0], p[1], p[2]) || 1;
  const w = Math.max(0.006, sw / LPX) / 2;
  const o: V3 = [(p[0] / pl) * w, (p[1] / pl) * w, (p[2] / pl) * w];
  return [
    [a[0] - o[0], a[1] - o[1], a[2] - o[2]],
    [b[0] - o[0], b[1] - o[1], b[2] - o[2]],
    [b[0] + o[0], b[1] + o[1], b[2] + o[2]],
    [a[0] + o[0], a[1] + o[1], a[2] + o[2]],
  ];
}

function trimPartial(g: Geo) {
  // vertices were pushed one by one (some skipped): keep whole triangles only
  const extra = (g.pos.length / 3) % 3;
  if (!extra) return;
  g.pos.length -= extra * 3;
  g.nor.length -= extra * 3;
  g.col.length -= extra * 4;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
