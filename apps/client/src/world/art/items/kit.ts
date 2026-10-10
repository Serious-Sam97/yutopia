// A tiny isometric illustrator: items are drawn in 3D (local tile units for x/y,
// px for z, at rot 0) out of shaded boxes, soft cushions, cylinders, face
// details and free-form shapes, then projected into one SVG per depth slice.
// Same hand as the people (`avatar-svg.ts`): warm ink outlines, light from the
// upper-left (top lightest, left face mid, right face darkest), soft gradients.
// See docs/art-style.md.

export const INK = "#2a1a12";
const HW = 32; // TILE_W / 2
const HH = 16; // TILE_H / 2
const EPS = 0.02;

export type Face = "n" | "e" | "s" | "w";
export type Pt = [number, number];
export type V3 = [number, number, number];
export interface Clip {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
// Seats split into the part drawn behind a sitter and the part in front.
export type Group = "all" | "back" | "front";

export interface ItemArt {
  svg: string;
  emit: string | null; // emissive layer (screens, VFDs, lamp light) or null
  x: number; // top-left of the drawing, px from the object's origin tile corner
  y: number;
  w: number;
  h: number;
}

// ── colour ─────────────────────────────────────────────────────────────────
function rgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// f < 1 darkens, f > 1 lifts towards white (same rule as the people)
export function sh(h: string, f: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)))
      .toString(16)
      .padStart(2, "0");
  const [r, g, b] = rgb(h);
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function mixc(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i] - v) * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}

// Deterministic 0..1 noise from integers (seeded details).
export function rnd(a: number, b = 0, seed = 0): number {
  let h = (a * 374761393 + b * 668265263 + Math.floor(seed * 1e6) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const f2 = (n: number) => Math.round(n * 100) / 100;
export const pts = (p: Pt[]) => p.map(([x, y]) => `${f2(x)},${f2(y)}`).join(" ");

// A material: one base colour; the three face tones come from it unless given.
export interface Mat {
  c: string;
  top?: string;
  left?: string; // the +y face (screen lower-left)
  right?: string; // the +x face (screen lower-right)
  gloss?: number; // 0..1 extra highlight on the top's front edges
  flat?: boolean; // no gradients (tiny parts)
}

interface Seg {
  glow: boolean;
  svg: string;
}
interface Prim {
  bb: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  segs: Seg[];
  rect: [number, number, number, number];
  i: number;
}

interface BoxSpec {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  mat: Mat;
  faces?: Partial<Record<Face, Mat>>; // per local face
  puff?: number; // px: soft, upholstered silhouette
  bias?: boolean; // seat back: sorted around a sitter
  line?: number; // outline width (default 1.3)
  glow?: boolean; // the whole box is emissive
  bevel?: boolean; // light line on the top's front edges (default true)
}

export interface Draw {
  m: (x: number, y: number, z: number) => Pt;
  vis: (f: Face | "t") => boolean;
  // polygon on a face (or "t" = a horizontal surface), clipped to the slice
  poly: (
    f: Face | "t",
    p: V3[],
    fill: string,
    o?: { stroke?: string; sw?: number; op?: number; glow?: boolean },
  ) => void;
  line: (f: Face | "t", a: V3, b: V3, stroke: string, sw?: number, op?: number) => void;
  raw: (svg: string, glow?: boolean) => void;
}

export class Sketch {
  readonly rot: number;
  readonly W: number;
  readonly H: number;
  readonly seed: number;
  private clip: Clip | null;
  private group: Group;
  private prims: Prim[] = [];
  private defs = new Map<string, string>();
  private shadows: string[] = [];
  private minX = 1e9;
  private minY = 1e9;
  private maxX = -1e9;
  private maxY = -1e9;

  private ox: number;
  private oy: number;

  // `offset`: shifts the whole drawing in local tiles before turning it (wall
  // items sit on the face of a thin wall, a little in front of their tile edge)
  constructor(o: {
    rot?: number;
    w: number;
    h: number;
    clip?: Clip | null;
    group?: Group;
    seed?: number;
    offset?: [number, number];
  }) {
    this.ox = o.offset?.[0] ?? 0;
    this.oy = o.offset?.[1] ?? 0;
    this.rot = (o.rot ?? 0) & 3;
    this.W = o.w;
    this.H = o.h;
    this.clip = o.clip ?? null;
    this.group = o.group ?? "all";
    this.seed = o.seed ?? 0;
  }

  // rot 0 local → rotated local (same turn as `rotateBoxes`: 90° clockwise steps)
  rp(x: number, y: number): Pt {
    let X = x + this.ox;
    let Y = y + this.oy;
    let H = this.H;
    let W = this.W;
    for (let i = 0; i < this.rot; i++) {
      [X, Y] = [H - Y, X];
      [W, H] = [H, W];
    }
    return [X, Y];
  }
  // rotated local → screen px (z up)
  static proj(X: number, Y: number, z: number): Pt {
    return [(X - Y) * HW, (X + Y) * HH - z];
  }
  m = (x: number, y: number, z: number): Pt => {
    const [X, Y] = this.rp(x, y);
    return Sketch.proj(X, Y, z);
  };
  // which world side a local face ends up on
  wface(f: Face): Face {
    const order: Face[] = ["n", "e", "s", "w"];
    return order[(order.indexOf(f) + this.rot) % 4];
  }
  private lface(world: Face): Face {
    const order: Face[] = ["n", "e", "s", "w"];
    return order[(order.indexOf(world) - this.rot + 8) % 4];
  }
  vis = (f: Face | "t") => f === "t" || this.wface(f) === "s" || this.wface(f) === "e";

  private rrect(x: number, y: number, w: number, d: number) {
    const [ax, ay] = this.rp(x, y);
    const [bx, by] = this.rp(x + w, y + d);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
  }

  private inGroup(bias: boolean, cx: number, cy: number) {
    if (this.group === "all") return true;
    const [W, H] = this.rot % 2 ? [this.H, this.W] : [this.W, this.H];
    const front = bias && cx + cy > W / 2 + H / 2;
    return this.group === "front" ? front : !front;
  }

  private inClip(X: number, Y: number) {
    const c = this.clip;
    return !c || (X >= c.x0 - EPS && X < c.x1 - EPS && Y >= c.y0 - EPS && Y < c.y1 - EPS);
  }

  private grow(p: Pt, pad = 0) {
    this.minX = Math.min(this.minX, p[0] - pad);
    this.minY = Math.min(this.minY, p[1] - pad);
    this.maxX = Math.max(this.maxX, p[0] + pad);
    this.maxY = Math.max(this.maxY, p[1] + pad);
  }

  // gradients, deduplicated per colour pair + direction
  grad(a: string, b: string, dir: "v" | "d" | "h" = "v"): string {
    const id = `g${this.defs.size}`;
    const key = `${a}${b}${dir}`;
    const found = this.defs.get(key);
    if (found) return `url(#${found.split('"')[1]})`;
    const [x2, y2] = dir === "v" ? [0, 1] : dir === "h" ? [1, 0] : [1, 1];
    this.defs.set(
      key,
      `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }
  radial(stops: [number, string, number][], id?: string): string {
    const key = `r${JSON.stringify(stops)}`;
    const found = this.defs.get(key);
    if (found) return `url(#${found.split('"')[1]})`;
    const rid = id ?? `r${this.defs.size}`;
    this.defs.set(
      key,
      `<radialGradient id="${rid}" cx="50%" cy="45%" r="60%">${stops
        .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
        .join("")}</radialGradient>`,
    );
    return `url(#${rid})`;
  }

  tones(mat: Mat) {
    const top = mat.top ?? sh(mat.c, 1.08);
    const left = mat.left ?? sh(mat.c, 0.84);
    const right = mat.right ?? sh(mat.c, 0.64);
    return { top, left, right };
  }

  // ── primitives ───────────────────────────────────────────────────────────
  box(b: BoxSpec, details?: (d: Draw) => void) {
    const r = this.rrect(b.x, b.y, b.w, b.d);
    if (!this.inGroup(!!b.bias, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)) return;
    let { x0, x1, y0, y1 } = r;
    const c = this.clip;
    if (c) {
      x0 = Math.max(x0, c.x0 - EPS);
      x1 = Math.min(x1, c.x1 + EPS);
      y0 = Math.max(y0, c.y0 - EPS);
      y1 = Math.min(y1, c.y1 + EPS);
      if (x1 <= x0 || y1 <= y0) return;
    }
    const cutR = !!c && r.x1 > c.x1 + EPS;
    const cutF = !!c && r.y1 > c.y1 + EPS;
    const cutL = !!c && r.x0 < c.x0 - EPS;
    const cutB = !!c && r.y0 < c.y0 - EPS;
    const z0 = b.z;
    const z1 = b.z + b.h;
    const P = (X: number, Y: number, z: number) => Sketch.proj(X, Y, z);
    const N = P(x0, y0, z1);
    const E = P(x1, y0, z1);
    const S = P(x1, y1, z1);
    const Wt = P(x0, y1, z1);
    const Eb = P(x1, y0, z0);
    const Sb = P(x1, y1, z0);
    const Wb = P(x0, y1, z0);
    for (const p of [N, E, S, Wt, Eb, Sb, Wb]) this.grow(p, 2);

    const faceMat = (world: Face) => b.faces?.[this.lface(world)] ?? b.mat;
    const topT = this.tones(b.mat).top;
    const leftT = this.tones(faceMat("s")).left;
    const rightT = this.tones(faceMat("e")).right;
    const flat = b.mat.flat || b.h < 3;

    // soft silhouettes: each edge bulges away from the box centre
    const puff = b.puff ?? 0;
    const cx = (N[0] + Sb[0]) / 2;
    const cy = (N[1] + Sb[1]) / 2;
    const seg = (a: Pt, q: Pt, cut: boolean) => {
      if (!puff || cut) return `L${f2(q[0])} ${f2(q[1])}`;
      const mx = (a[0] + q[0]) / 2;
      const my = (a[1] + q[1]) / 2;
      let nx = -(q[1] - a[1]);
      let ny = q[0] - a[0];
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const dot = nx * (mx - cx) + ny * (my - cy);
      if (Math.abs(dot) < 1.5) return `L${f2(q[0])} ${f2(q[1])}`;
      const s = dot > 0 ? puff : -puff;
      return `Q${f2(mx + nx * s)} ${f2(my + ny * s)} ${f2(q[0])} ${f2(q[1])}`;
    };
    // [corner, is the edge from this corner to the next one a slice cut?]
    const path = (p: [Pt, boolean][]) =>
      `M${f2(p[0][0][0])} ${f2(p[0][0][1])}${p.map((v, i) => seg(v[0], p[(i + 1) % p.length][0], v[1])).join("")}Z`;

    const glow = !!b.glow;
    const segs: Seg[] = [];
    let s = "";
    if (b.h > 0 && !cutR) {
      const fill = flat ? rightT : this.grad(sh(rightT, 1.06), sh(rightT, 0.84));
      s += `<path d="${path([
        [S, false],
        [E, cutB],
        [Eb, false],
        [Sb, cutF],
      ])}" fill="${fill}"/>`;
    }
    if (b.h > 0 && !cutF) {
      const fill = flat ? leftT : this.grad(sh(leftT, 1.06), sh(leftT, 0.82));
      s += `<path d="${path([
        [Wt, false],
        [S, cutR],
        [Sb, false],
        [Wb, cutL],
      ])}" fill="${fill}"/>`;
    }
    {
      const fill = flat ? topT : this.grad(sh(topT, 1.1), sh(topT, 0.95), "d");
      s += `<path d="${path([
        [N, cutB],
        [E, cutR],
        [S, cutF],
        [Wt, cutL],
      ])}" fill="${fill}"/>`;
    }
    segs.push({ glow, svg: s });

    // face details (drawers, screens, buttons…)
    if (details) {
      const d = this.drawer(segs);
      details(d);
    }

    // bevel light on the top's front edges, then ink
    let ink = "";
    const lw = b.line ?? 1.3;
    if (b.bevel !== false && b.h >= 2) {
      const hi = sh(topT, 1.45);
      const op = 0.55 + (b.mat.gloss ?? 0) * 0.4;
      if (!cutF)
        ink += `<path d="M${pts([Wt, S]).replace(" ", " L")}" stroke="${hi}" stroke-width=".8" opacity="${op}" fill="none" transform="translate(0 .7)"/>`;
      if (!cutR)
        ink += `<path d="M${pts([S, E]).replace(" ", " L")}" stroke="${hi}" stroke-width=".8" opacity="${op * 0.7}" fill="none" transform="translate(0 .7)"/>`;
    }
    if (lw > 0) {
      const thin = `stroke="${INK}" stroke-width="${f2(lw * 0.5)}" stroke-opacity=".55" fill="none" stroke-linecap="round"`;
      if (b.h > 0 && !cutF && !cutR && !puff) ink += `<path d="M${pts([S, Sb]).replace(" ", " L")}" ${thin}/>`;
      if (b.h > 0 && !cutF) ink += `<path d="M${f2(Wt[0])} ${f2(Wt[1])}${seg(Wt, S, cutF)}" ${thin}/>`;
      if (b.h > 0 && !cutR) ink += `<path d="M${f2(S[0])} ${f2(S[1])}${seg(S, E, cutR)}" ${thin}/>`;
      // silhouette, skipping edges that lie on a slice cut
      const sil: [Pt, Pt, boolean][] = [
        [N, E, cutB],
        [E, Eb, cutR || cutB || b.h === 0],
        [Eb, Sb, cutR || b.h === 0],
        [Sb, Wb, cutF || b.h === 0],
        [Wb, Wt, cutL || cutF || b.h === 0],
        [Wt, N, cutL],
      ];
      if (b.h === 0) {
        sil.push([E, S, cutR], [S, Wt, cutF]);
      }
      let d = "";
      for (const [a, q, cut] of sil) if (!cut) d += `M${f2(a[0])} ${f2(a[1])}${seg(a, q, false)}`;
      if (d)
        ink += `<path d="${d}" stroke="${INK}" stroke-width="${lw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (ink) segs.push({ glow: false, svg: ink });
    this.push({ x0, x1, y0, y1, z0, z1 }, segs);
  }

  // Vertical cylinder (pots, poles, mugs, bases). Top lighter, side shaded left→right.
  cyl(
    o: {
      x: number;
      y: number;
      z: number;
      r: number;
      h: number;
      mat: Mat;
      r2?: number;
      line?: number;
      bias?: boolean;
      glow?: boolean;
    },
    details?: (d: Draw) => void,
  ) {
    const [X, Y] = this.rp(o.x, o.y);
    if (!this.inClip(X, Y) || !this.inGroup(!!o.bias, X, Y)) return;
    const r2 = o.r2 ?? o.r; // top radius (tapered pots, shades)
    const [bx, by] = Sketch.proj(X, Y, o.z);
    const [tx, ty] = Sketch.proj(X, Y, o.z + o.h);
    const rx = o.r * HW * Math.SQRT2;
    const ry = o.r * HH * Math.SQRT2;
    const tx2 = r2 * HW * Math.SQRT2;
    const ty2 = r2 * HH * Math.SQRT2;
    this.grow([bx - rx, by + ry], 2);
    this.grow([bx + rx, by + ry], 2);
    this.grow([tx - tx2, ty - ty2], 2);
    this.grow([tx + tx2, ty + ty2], 2);
    const t = this.tones(o.mat);
    const lw = o.line ?? 1.1;
    const side = this.grad(sh(t.left, 1.12), sh(t.right, 0.9), "h");
    const body =
      o.h > 0
        ? `<path d="M${f2(tx - tx2)} ${f2(ty)} L${f2(bx - rx)} ${f2(by)} A${f2(rx)} ${f2(ry)} 0 0 0 ${f2(bx + rx)} ${f2(by)} L${f2(tx + tx2)} ${f2(ty)} Z" fill="${o.mat.flat ? t.left : side}"/>`
        : "";
    const top = `<ellipse cx="${f2(tx)}" cy="${f2(ty)}" rx="${f2(tx2)}" ry="${f2(ty2)}" fill="${o.mat.flat ? t.top : this.grad(sh(t.top, 1.1), sh(t.top, 0.92), "d")}"/>`;
    const ink =
      lw > 0
        ? `<path d="M${f2(tx - tx2)} ${f2(ty)} L${f2(bx - rx)} ${f2(by)} A${f2(rx)} ${f2(ry)} 0 0 0 ${f2(bx + rx)} ${f2(by)} L${f2(tx + tx2)} ${f2(ty)}" stroke="${INK}" stroke-width="${lw}" fill="none" stroke-linejoin="round"/><ellipse cx="${f2(tx)}" cy="${f2(ty)}" rx="${f2(tx2)}" ry="${f2(ty2)}" stroke="${INK}" stroke-width="${f2(lw * 0.8)}" fill="none"/>`
        : "";
    const segs: Seg[] = [{ glow: !!o.glow, svg: body + top }];
    if (details) details(this.drawer(segs));
    segs.push({ glow: false, svg: ink });
    this.push({ x0: X - o.r, x1: X + o.r, y0: Y - o.r, y1: Y + o.r, z0: o.z, z1: o.z + o.h }, segs);
  }

  // Free-form drawing anchored at a local point; `bb` is its 3D extent (for
  // sorting and bounds) and `pad` the screen px it may spill beyond that.
  shape(
    bb: { x: number; y: number; w: number; d: number; z: number; h: number },
    draw: (d: Draw) => void,
    o: { pad?: number; bias?: boolean } = {},
  ) {
    const r = this.rrect(bb.x, bb.y, bb.w, bb.d);
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    if (!this.inClip(cx, cy) || !this.inGroup(!!o.bias, cx, cy)) return;
    for (const [X, Y] of [
      [r.x0, r.y0],
      [r.x1, r.y0],
      [r.x0, r.y1],
      [r.x1, r.y1],
    ])
      for (const z of [bb.z, bb.z + bb.h]) this.grow(Sketch.proj(X, Y, z), o.pad ?? 2);
    const segs: Seg[] = [];
    draw(this.drawer(segs, false));
    this.push({ ...r, z0: bb.z, z1: bb.z + bb.h }, segs);
  }

  // Contact shadow footprint (soft, drawn on the floor under the item).
  shadow(x: number, y: number, w: number, d: number, op = 0.38, round = 0.25) {
    const r = this.rrect(x, y, w, d);
    const p = [
      Sketch.proj(r.x0, r.y0, 0),
      Sketch.proj(r.x1, r.y0, 0),
      Sketch.proj(r.x1, r.y1, 0),
      Sketch.proj(r.x0, r.y1, 0),
    ];
    this.shadows.push(
      `<polygon points="${pts(p)}" fill="${INK}" opacity="${op}" stroke="${INK}" stroke-opacity="${op}" stroke-width="${f2(round * 20)}" stroke-linejoin="round"/>`,
    );
  }
  shadowDot(x: number, y: number, r: number, op = 0.4) {
    const [X, Y] = this.rp(x, y);
    const [sx, sy] = Sketch.proj(X, Y, 0);
    this.shadows.push(
      `<ellipse cx="${f2(sx)}" cy="${f2(sy)}" rx="${f2(r * HW * Math.SQRT2)}" ry="${f2(r * HH * Math.SQRT2)}" fill="${INK}" opacity="${op}"/>`,
    );
  }

  private drawer(segs: Seg[], clipped = true): Draw {
    const clipPoly = (p: V3[]): V3[] => {
      let out = p.map(([x, y, z]) => {
        const [X, Y] = this.rp(x, y);
        return [X, Y, z] as V3;
      });
      const c = this.clip;
      if (!c || !clipped) return out;
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
    const add = (svg: string, glow = false) => {
      const last = segs[segs.length - 1];
      if (last && last.glow === glow) last.svg += svg;
      else segs.push({ glow, svg });
    };
    return {
      m: this.m,
      vis: this.vis,
      poly: (f, p, fill, o = {}) => {
        if (!this.vis(f)) return;
        const q = clipPoly(p);
        if (q.length < 3) return;
        const sp = q.map(([X, Y, z]) => Sketch.proj(X, Y, z));
        for (const p of sp) this.grow(p, 1);
        const st = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 0.7}" stroke-linejoin="round"` : "";
        add(
          `<polygon points="${pts(sp)}" fill="${fill}"${st}${o.op !== undefined ? ` opacity="${o.op}"` : ""}/>`,
          o.glow,
        );
      },
      line: (f, a, b, stroke, sw = 0.7, op = 1) => {
        if (!this.vis(f)) return;
        const q = clipPoly([a, b, b]);
        if (q.length < 2) return;
        const [p1, p2] = [q[0], q[1]].map(([X, Y, z]) => Sketch.proj(X, Y, z));
        this.grow(p1, 1);
        this.grow(p2, 1);
        add(
          `<path d="M${f2(p1[0])} ${f2(p1[1])}L${f2(p2[0])} ${f2(p2[1])}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}" stroke-linecap="round"/>`,
        );
      },
      raw: (svg, glow = false) => add(svg, glow),
    };
  }

  private push(bb: Prim["bb"], segs: Seg[]) {
    const a = Sketch.proj(bb.x0, bb.y0, bb.z1);
    const b = Sketch.proj(bb.x1, bb.y1, bb.z0);
    const l = Sketch.proj(bb.x0, bb.y1, 0);
    const r = Sketch.proj(bb.x1, bb.y0, 0);
    this.prims.push({ bb, segs, rect: [l[0], a[1], r[0], b[1]], i: this.prims.length });
  }

  // Back-to-front order: A before B when they overlap on screen and A is
  // fully behind B on some axis (lower x, lower y, or below).
  private sorted(): Prim[] {
    const P = this.prims;
    const n = P.length;
    const after: number[][] = P.map(() => []);
    const indeg = new Array(n).fill(0);
    const behind = (a: Prim, b: Prim) =>
      a.bb.x1 <= b.bb.x0 + 0.01 || a.bb.y1 <= b.bb.y0 + 0.01 || a.bb.z1 <= b.bb.z0 + 0.01;
    const centre = (p: Prim) => (p.bb.x0 + p.bb.x1) / 2 + (p.bb.y0 + p.bb.y1) / 2;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = P[i];
        const b = P[j];
        const overlap =
          a.rect[0] < b.rect[2] && b.rect[0] < a.rect[2] && a.rect[1] < b.rect[3] && b.rect[1] < a.rect[3];
        if (!overlap) continue;
        const ab = behind(a, b);
        const ba = behind(b, a);
        let first: number;
        if (ab && !ba) first = i;
        else if (ba && !ab) first = j;
        else if (ab && ba) first = centre(a) <= centre(b) ? i : j;
        else continue; // intersecting: keep the author's order
        const second = first === i ? j : i;
        after[first].push(second);
        indeg[second]++;
      }
    const out: Prim[] = [];
    const ready = P.filter((_, i) => indeg[i] === 0).map((p) => p.i);
    const done = new Set<number>();
    while (out.length < n) {
      if (!ready.length) {
        // a cycle: fall back to the author's order for what's left
        const k = P.findIndex((p) => !done.has(p.i));
        ready.push(k);
        indeg[k] = 0;
      }
      ready.sort((a, b) => a - b);
      const k = ready.shift() as number;
      if (done.has(k)) continue;
      done.add(k);
      out.push(P[k]);
      for (const j of after[k]) if (--indeg[j] === 0 && !done.has(j)) ready.push(j);
    }
    return out;
  }

  isEmpty() {
    return this.prims.length === 0;
  }

  // One SVG (+ emissive SVG) at `res` × the screen size.
  finish(res = 2): ItemArt | null {
    if (!this.prims.length) return null;
    const pad = 3;
    const x = Math.floor(this.minX - pad);
    const y = Math.floor(this.minY - pad);
    const w = Math.ceil(this.maxX + pad) - x;
    const h = Math.ceil(this.maxY + pad) - y;
    const order = this.sorted();
    const body = order.map((p) => p.segs.map((s) => s.svg).join("")).join("");
    const defs = `<defs>${[...this.defs.values()].join("")}</defs>`;
    const head = (extra = "") =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * res)}" height="${Math.round(h * res)}" viewBox="${x} ${y} ${w} ${h}">${defs}${extra}`;
    const svg = `${head()}${body}</svg>`;
    let emit: string | null = null;
    if (order.some((p) => p.segs.some((s) => s.glow && s.svg))) {
      // everything else in black (occludes, adds nothing), glow parts + a soft halo
      const fx =
        '<filter id="kk"><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter><filter id="hb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>';
      const e = order
        .map((p) =>
          p.segs
            .map((s) =>
              s.glow ? `<g filter="url(#hb)" opacity=".9">${s.svg}</g>${s.svg}` : `<g filter="url(#kk)">${s.svg}</g>`,
            )
            .join(""),
        )
        .join("");
      emit = `${head(`<defs>${fx}</defs>`)}${e}</svg>`;
    }
    return { svg, emit, x, y, w, h };
  }

  // The soft contact shadow of the whole item, or null.
  finishShadow(res = 1): ItemArt | null {
    if (!this.shadows.length) return null;
    // bounds of the footprint + blur
    const pad = 10;
    const [W, H] = this.rot % 2 ? [this.H, this.W] : [this.W, this.H];
    const x = Math.floor(-H * HW - pad);
    const y = Math.floor(-pad);
    const w = Math.ceil((W + H) * HW + pad * 2);
    const h = Math.ceil((W + H) * HH + pad * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * res)}" height="${Math.round(h * res)}" viewBox="${x} ${y} ${w} ${h}"><defs><filter id="sb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter></defs><g filter="url(#sb)">${this.shadows.join("")}</g></svg>`;
    return { svg, emit: null, x, y, w, h };
  }
}

// Face rectangles in local coords: on a face plane (s/n: y = plane, u = x;
// e/w: x = plane, u = y), from u0..u1 and z0..z1.
export function fr(f: Face, plane: number, u0: number, u1: number, z0: number, z1: number): V3[] {
  return f === "s" || f === "n"
    ? [
        [u0, plane, z1],
        [u1, plane, z1],
        [u1, plane, z0],
        [u0, plane, z0],
      ]
    : [
        [plane, u0, z1],
        [plane, u1, z1],
        [plane, u1, z0],
        [plane, u0, z0],
      ];
}
// A rectangle lying on a horizontal surface at height z.
export function tr(z: number, x0: number, y0: number, x1: number, y1: number): V3[] {
  return [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
}
// An ellipse on a face, as a polygon (local coords, 20 steps).
export function fe(f: Face, plane: number, u: number, z: number, ru: number, rz: number, n = 20): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const uu = u + Math.cos(a) * ru;
    const zz = z + Math.sin(a) * rz;
    out.push(f === "s" || f === "n" ? [uu, plane, zz] : [plane, uu, zz]);
  }
  return out;
}
// An ellipse lying on a horizontal surface.
export function te(z: number, x: number, y: number, r: number, n = 20): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
  }
  return out;
}
