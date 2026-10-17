import { BufferGeometry, Float32BufferAttribute, Shape, type Vector2, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, capsule, extrude, lathe, mapVerts, type Prof, spline2, subdivide } from "../shapes";

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A profile (radius by height) looked up at any height. */
export class Lookup {
  readonly ys: number[];
  readonly rs: number[];
  constructor(pts: Vector2[]) {
    const s = [...pts].sort((a, b) => a.y - b.y);
    this.ys = s.map((p) => p.y);
    this.rs = s.map((p) => p.x);
  }
  r(y: number): number {
    const { ys, rs } = this;
    if (y <= ys[0]) return rs[0];
    if (y >= ys[ys.length - 1]) return rs[rs.length - 1];
    let lo = 0;
    let hi = ys.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (ys[m] <= y) lo = m;
      else hi = m;
    }
    const t = (y - ys[lo]) / Math.max(1e-9, ys[hi] - ys[lo]);
    return rs[lo] + (rs[hi] - rs[lo]) * t;
  }
}

// Where everything goes, from the floor up, and the bare figure. Clothes are
// shells over it (tops.ts, bottoms.ts …), so a tank top shows real shoulders
// and a skirt real knees. Heights in the trunk (`T`, `y` below) are measured
// from the bottom of the trunk (the hips joint).
export class Body {
  readonly hh: number;
  readonly footH: number;
  readonly ankleY: number;
  readonly legLen: number;
  readonly hipY: number;
  readonly thighR: number;
  readonly kneeR: number;
  readonly ankleR: number;
  readonly chinY: number;
  readonly neckBase: number;
  readonly torsoBot: number;
  readonly T: number; // trunk height
  readonly spineY: number; // the spine joint, up the trunk
  readonly profile: Vector2[]; // the trunk's outline (radius, y)
  readonly trunk: Lookup;
  readonly shY: number; // the shoulder joints, up the trunk
  readonly shX: number;
  readonly upper: number; // shoulder → elbow
  readonly fore: number; // elbow → wrist
  readonly uR: number;
  readonly fR: number;
  readonly wR: number;
  readonly thigh: number; // hip → knee
  readonly shin: number; // knee → ankle
  readonly hipX: number;

  constructor(readonly k: Kit) {
    const p = k.p;
    const H = p.height;
    const hh = k.hh;
    this.hh = hh;
    this.footH = p.foot.height * hh;
    this.ankleY = this.footH * 0.6;
    this.legLen = p.leg.len * H;
    this.hipY = this.ankleY + this.legLen;
    this.thighR = p.leg.thigh * hh;
    this.kneeR = p.leg.knee * hh;
    this.ankleR = p.leg.ankle * hh;
    this.chinY = H - hh;
    this.neckBase = this.chinY - p.neck.len * hh;
    this.torsoBot = this.hipY - this.thighR * 0.95;
    const T = this.neckBase - this.torsoBot;
    this.T = T;
    this.spineY = 0.42 * T;
    const sq = p.torso.squareness;
    const stations: Prof[] = [
      [0, 0],
      [p.torso.hip * 0.55 * hh, 0.025 * T],
      [p.torso.hip * 0.93 * hh, 0.11 * T],
      [p.torso.hip * hh, 0.24 * T],
      [p.torso.waist * hh, 0.5 * T],
      [p.torso.chest * hh, 0.7 * T],
      [p.torso.shoulder * hh, lerp(0.8, 0.84, sq) * T],
      [p.torso.shoulder * lerp(0.82, 0.95, sq) * hh, lerp(0.9, 0.93, sq) * T],
      [Math.max(p.neck.r * 1.5, p.torso.shoulder * lerp(0.45, 0.62, sq)) * hh, 0.985 * T],
      [0, T],
    ];
    // the mesh follows the level of detail; where things go (the shoulders,
    // a hem) is read off a fine copy, so the skeleton is the same at every level
    this.profile = spline2(stations, k.seg.profile);
    this.trunk = new Lookup(spline2(stations, 128));
    const shAt = lerp(0.8, 0.84, sq) * T;
    this.shY = shAt - p.arm.upper * hh * 0.15;
    this.shX = this.trunk.r(shAt) - p.arm.upper * hh * 0.55;
    this.upper = p.arm.len * H * 0.5;
    this.fore = p.arm.len * H * 0.42;
    this.uR = p.arm.upper * hh;
    this.fR = p.arm.fore * hh;
    this.wR = p.arm.wrist * hh;
    this.thigh = this.legLen * 0.5;
    this.shin = this.legLen * 0.5;
    this.hipX = p.leg.gap * hh;

    k.joint("hips", 0, this.torsoBot);
    k.joint("spine", 0, this.spineY);
    k.joint("neck", 0, this.neckBase - this.torsoBot - this.spineY, -p.head.neckBack * hh);
    k.joint("head", 0, this.chinY - this.neckBase, p.head.neckBack * hh);
    for (const side of [1, -1] as const) {
      const S = side > 0 ? "L" : "R";
      k.joint(`shoulder${S}`, side * this.shX, this.shY - this.spineY);
      k.joint(`elbow${S}`, 0, -this.upper);
      k.joint(`wrist${S}`, 0, -this.fore);
      k.joint(`thigh${S}`, side * this.hipX, this.hipY - this.torsoBot);
      k.joint(`knee${S}`, 0, -this.thigh);
      k.joint(`ankle${S}`, 0, -this.shin);
    }
  }

  /** How deep the trunk is (front to back) at height y, as a share of its width. */
  depthAt(y: number) {
    return this.k.p.torso.depth * lerp(1, 0.8, smooth(0.55 * this.T, 0.95 * this.T, y));
  }

  // a belly in front, low on the trunk, and a seat behind — strongest at the
  // middle line, gone by the sides
  swell(x: number, y: number, z: number) {
    const T = this.T;
    const bell = (v: number, c: number, w: number) => Math.exp(-(((v - c) / w) ** 2));
    const front = (z * z) / Math.max(1e-9, x * x + z * z);
    const t = this.k.p.torso;
    let s = 1 + t.belly * front * (z > 0 ? bell(y, 0.5 * T, 0.2 * T) : 0.3 * bell(y, 0.16 * T, 0.1 * T));
    // a bust: two soft rounds high on the chest, either side of the middle
    if (t.bust > 0 && z > 0) {
      const across = Math.abs(x) / Math.max(1e-9, Math.hypot(x, z)); // 0 the middle … 1 the side
      s += t.bust * front ** 0.5 * bell(y, 0.71 * T, 0.085 * T) * bell(across, 0.42, 0.26);
    }
    return s;
  }

  /** Flatten a lathe made round the trunk's axis into the trunk's shape (y0: its height offset). */
  squash(g: BufferGeometry, y0 = 0): BufferGeometry {
    return mapVerts(g, (v) => {
      v.z *= this.depthAt(v.y + y0) * this.swell(v.x, v.y + y0, v.z);
    });
  }

  /** The trunk's outline scaled out by `k` between two heights (for a garment over it). */
  around(k: number, from: number, to: number, lift = 0): Prof[] {
    const out: Prof[] = [];
    for (const q of this.profile) if (q.y >= from && q.y <= to) out.push([q.x * k, q.y + lift]);
    return out;
  }

  /** A ring round the trunk at height y (a hem, a waistband), `r` thick, `k` out from the skin. */
  ring(y: number, k: number, r: number): BufferGeometry {
    const R0 = this.trunk.r(y) * k;
    return this.squash(
      lathe(arc(R0 + r * 0.4, y, r, -Math.PI / 2, Math.PI * 1.5, this.k.seg.ring * 2), this.k.seg.radial),
    );
  }

  /** A point on a garment over the trunk (`kk` out from the skin) at (x, y), in front (side 1) or behind (−1). */
  surf(x: number, y: number, kk = 1.045, side: 1 | -1 = 1): Vector3 {
    const R = this.trunk.r(y) * kk;
    const cx = Math.max(-R * 0.995, Math.min(R * 0.995, x));
    const z0 = Math.sqrt(Math.max(0, R * R - cx * cx));
    return new Vector3(cx, y, side * z0 * this.depthAt(y) * this.swell(cx, y, side * z0));
  }
  /** The outward normal there. */
  surfNormal(x: number, y: number, kk = 1.045, side: 1 | -1 = 1): Vector3 {
    const e = this.hh * 0.004;
    const a = this.surf(x, y, kk, side);
    const dx = this.surf(x + e, y, kk, side).sub(a);
    const dy = this.surf(x, y + e, kk, side).sub(a);
    const n = dx.cross(dy).normalize();
    return n.z * side < 0 ? n.negate() : n;
  }

  /** A point round the trunk at height y, angle phi (0 front, + its left), `kk` out from the skin. */
  around3(y: number, phi: number, kk: number): Vector3 {
    const R = this.trunk.r(y) * kk;
    const x = Math.sin(phi) * R;
    const z = Math.cos(phi) * R;
    return new Vector3(x, y, z * this.depthAt(y) * this.swell(x, y, z));
  }

  /** A garment over the trunk from `from` up to an edge that varies round it (`to(phi)`), the edge rolled in. */
  cover(from: number, to: (phi: number) => number, kk: number): BufferGeometry {
    const rows = Math.max(6, Math.round(this.k.seg.profile / 2));
    const cols = this.k.seg.radial;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const u = r / rows;
      for (let c = 0; c <= cols; c++) {
        const phi = (c / cols) * Math.PI * 2;
        const top = to(phi);
        // the last row turns in to the skin: a round edge, not a cut
        const y = lerp(from, top, Math.min(1, u * 1.04));
        const k = u < 0.92 ? kk : lerp(kk, 0.99, smooth(0.92, 1, u));
        const q = this.around3(y, phi, k);
        pos.push(q.x, q.y, q.z);
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + cols + 1;
        // (rows run upwards and phi round to the left: this way round faces out)
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  /** A flat outline (x across, y up the trunk) laid onto the trunk: a pocket, a lapel, a placket. */
  onTrunk(
    shape: Shape | Shape[],
    o: { depth: number; bevel: number; kk?: number; lift?: number; side?: 1 | -1 },
  ): BufferGeometry {
    const side = o.side ?? 1;
    const kk = o.kk ?? 1.045;
    const g = subdivide(extrude(shape, o.depth, o.bevel, this.k.seg.curve, 1), this.k.bend);
    return mapVerts(g, (v) => {
      // (behind, x runs the other way, so the outline isn't drawn inside out)
      const x = side > 0 ? v.x : -v.x;
      const z = v.z;
      const s = this.surf(x, v.y, kk, side);
      v.copy(s.addScaledVector(this.surfNormal(x, v.y, kk, side), z + (o.lift ?? 0)));
    });
  }

  /** The bare figure: trunk, neck, arms, hands, legs — less what clothes hide all of. */
  build(skin: string, hidden: { arms?: boolean; legs?: boolean } = {}) {
    const k = this.k;
    const R = k.seg.radial;
    // the trunk in two: the hips up past the waist, and the chest (it rides
    // the spine) down over it — they overlap, so a bend never opens a gap
    const T = this.T;
    const low = this.around(1, 0, 0.56 * T);
    low.push([this.trunk.r(0.56 * T) * 0.6, 0.6 * T], [0, 0.6 * T]);
    k.add("hips", this.squash(lathe(low, R)), skin);
    const high = this.around(0.995, 0.4 * T, T);
    high.unshift([0, 0.38 * T], [this.trunk.r(0.4 * T) * 0.6, 0.38 * T]);
    k.add("spine", this.squash(lathe(high, R)).translate(0, -this.spineY, 0), skin);
    // neck
    const nl = this.chinY - this.neckBase + 0.32 * this.hh;
    const nr = k.p.neck.r * this.hh;
    k.add("neck", capsule(nl, nr, nr * 1.05, 0, R, k.seg.ring).translate(0, nl - 0.06 * this.hh, 0), skin);
    // arms and hands
    for (const side of ["L", "R"] as const) {
      if (!hidden.arms) {
        k.add(`shoulder${side}`, capsule(this.upper, this.uR, this.fR, this.uR * 0.06, R, k.seg.ring), skin);
        k.add(`elbow${side}`, capsule(this.fore, this.fR, this.wR, this.fR * 0.08, R, k.seg.ring), skin);
      }
      k.add(`wrist${side}`, this.mitten(), skin);
      if (!hidden.legs) {
        k.add(`thigh${side}`, capsule(this.thigh, this.thighR, this.kneeR, this.thighR * 0.08, R, k.seg.ring), skin);
        k.add(`knee${side}`, capsule(this.shin, this.kneeR, this.ankleR, k.p.leg.calf * this.hh, R, k.seg.ring), skin);
      }
    }
  }

  // A mitten, palm side on: fingers down −y, the thumb forward (+z once turned).
  mitten(): BufferGeometry {
    const k = this.k;
    const l = k.p.hand.size * this.hh;
    const w = l * 0.62;
    const b = Math.min(k.p.bevel * this.hh, k.p.hand.thick * this.hh * 0.4);
    const t = Math.max(1e-4, k.p.hand.thick * this.hh - b * 2);
    const sh = new Shape();
    sh.moveTo(-w * 0.34, l * 0.06);
    sh.lineTo(w * 0.28, l * 0.06);
    sh.bezierCurveTo(w * 0.36, -l * 0.08, w * 0.42, -l * 0.18, w * 0.62, -l * 0.3);
    sh.bezierCurveTo(w * 0.78, -l * 0.42, w * 0.6, -l * 0.56, w * 0.42, -l * 0.47);
    sh.bezierCurveTo(w * 0.46, -l * 0.7, w * 0.38, -l * 0.96, w * 0.02, -l * 0.98);
    sh.bezierCurveTo(-w * 0.36, -l * 1.0, -w * 0.5, -l * 0.74, -w * 0.48, -l * 0.46);
    sh.bezierCurveTo(-w * 0.46, -l * 0.22, -w * 0.4, -l * 0.06, -w * 0.34, l * 0.06);
    const g = extrude(sh, t, b, k.seg.curve, k.seg.bevel + 1);
    g.translate(0, 0, -(t + 2 * b) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }
}

// A sleeve, a trouser leg, shorts: a domed shell over a joint, open at the
// bottom with the hem rolled in to `rIn`.
export function shell(len: number, r: number, rIn: number, radial: number, ring: number, dome = r): BufferGeometry {
  const hem = Math.min(r - rIn, len * 0.2);
  const pts: Prof[] = [
    [rIn, -len + hem * 1.2],
    [lerp(rIn, r, 0.6), -len + hem * 0.15],
    [r, -len + hem * 0.5],
    [r * 1.02, -len * 0.6],
    [lerp(r, dome, 0.5), -len * 0.25],
  ];
  const head = arc(0, 0, dome, 0, Math.PI / 2, ring);
  return lathe(
    spline2([...pts, ...head.slice(0, 1)], Math.max(8, ring * 3))
      .map((v) => [v.x, v.y] as Prof)
      .concat(head.slice(1)),
    radial,
  );
}

/** A hair-thin ring round a limb at `y` (a hem drawn as a line). */
export function creaseRing(r: number, y: number, radial: number): BufferGeometry {
  return lathe(arc(r, y, 1e-4, -Math.PI / 2, Math.PI * 1.5, 4), radial);
}
