import { BufferGeometry, Float32BufferAttribute, Shape, type Vector2, Vector3 } from "three";
import type { Kit, Skin } from "../kit";
import { arc, capsule, ellipsoid, extrude, lathe, mapVerts, type Prof, ribbon, spline2, subdivide } from "../shapes";

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const SOCK_UP = 0.6;
const SOCK_OUT = 0.12;
const SOCK_IN = 0.05;

/** A bell: 1 at `c`, about a third gone `w` either side. */
export const bell = (v: number, c: number, w: number) => Math.exp(-(((v - c) / w) ** 2));

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
  readonly chestY: number; // the chest joint, up the trunk
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
    this.torsoBot = this.hipY - this.thighR * p.torso.pelvis;
    const T = this.neckBase - this.torsoBot;
    this.T = T;
    this.spineY = 0.42 * T;
    this.chestY = 0.66 * T;
    const sq = p.torso.squareness;
    const stations: Prof[] = [
      // (the trunk's bottom, a bowl between the thighs: `bowl` flattens it, up into the hips)
      [0, 0],
      [p.torso.hip * 0.55 * hh, 0.025 * T * p.torso.bowl],
      [p.torso.hip * 0.93 * hh, 0.11 * T * p.torso.bowl],
      [p.torso.hip * hh, 0.24 * T * lerp(1, p.torso.bowl, 0.5)],
      [p.torso.waist * hh, 0.5 * T],
      [p.torso.chest * hh, 0.7 * T],
      [p.torso.shoulder * hh, lerp(0.8, 0.84, sq) * T],
      // (`trap`: from the shoulder's point a slope up to the neck, not a round flat top)
      [
        p.torso.shoulder * lerp(0.82, 0.95, sq) * lerp(1, 0.95, p.torso.trap) * (1 - SOCK_IN * p.arm.socket) * hh,
        lerp(0.9, 0.93, sq) * T,
      ],
      [Math.max(p.neck.r * 1.5, p.torso.shoulder * lerp(0.45, 0.62, sq) * lerp(1, 0.74, p.torso.trap)) * hh, 0.985 * T],
      [0, T],
    ];
    // the mesh follows the level of detail; where things go (the shoulders,
    // a hem) is read off a fine copy, so the skeleton is the same at every level
    this.profile = spline2(stations, k.seg.profile);
    this.trunk = new Lookup(spline2(stations, 128));
    const shAt = lerp(0.8, 0.84, sq) * T;
    // (`socket`: the arm up into the shoulder and a little out, its top at the trunk's corner — not
    // hung below a round of trunk; the trunk's top over it drawn in to meet it)
    const sock = p.arm.socket;
    this.shY = shAt - p.arm.upper * hh * (0.15 - SOCK_UP * sock);
    this.shX = this.trunk.r(shAt) - p.arm.upper * hh * (0.55 - SOCK_OUT * sock);
    this.upper = p.arm.len * H * 0.5;
    this.fore = p.arm.len * H * 0.42;
    this.uR = p.arm.upper * hh;
    this.fR = p.arm.fore * hh;
    this.wR = p.arm.wrist * hh;
    this.thigh = this.legLen * 0.5;
    this.shin = this.legLen * 0.5;
    this.hipX = p.leg.gap * hh;

    k.joint("hips", 0, this.torsoBot);
    // (what the springs keep out of: the head, and the chest round its middle)
    const mid = (y: number) => this.trunk.r(y) * (1 + p.torso.depth) * 0.5 * 1.08;
    k.collide.push(
      { joint: "head", at: [0, 0.5 * hh, 0], r: 0.56 * hh * p.head.width },
      { joint: "chest", at: [0, 0.72 * this.T - this.chestY, 0], r: mid(0.72 * this.T) },
    );
    // (the springs' places when nothing's worn on them: the builders put them where things hang)
    k.joint("hair", 0, 0.5 * hh, 0);
    k.joint("skirt", 0, 0.5 * this.T, 0);
    k.joint("scarf", 0, 0.3 * this.T, 0);
    k.joint("pack", 0, 0.2 * this.T, 0);
    k.joint("spine", 0, this.spineY);
    k.joint("chest", 0, this.chestY - this.spineY);
    // (the neck's root set back by `neckBack`, or with `neckFwd` in the middle of the trunk's top — of a
    // collar — and the head forward of it as much as ever)
    k.joint("neck", 0, this.neckBase - this.torsoBot - this.chestY, -p.head.neckBack * hh * (1 - p.head.neckFwd));
    k.joint("head", 0, this.chinY - this.neckBase, p.head.neckBack * hh);
    for (const side of [1, -1] as const) {
      const S = side > 0 ? "L" : "R";
      k.joint(`shoulder${S}`, side * this.shX, this.shY - this.chestY);
      k.joint(`elbow${S}`, 0, -this.upper);
      k.joint(`wrist${S}`, 0, -this.fore);
      // the hand's (the mitten's: fingers down −y, the thumb forward +z): the knuckles across the
      // palm, the index on the thumb's side; the thumb's root
      const l = p.hand.size * hh;
      const w = l * 0.62;
      k.joint(`fingers${S}`, 0, -0.5 * l, -0.1 * w);
      k.joint(`index${S}`, 0, -0.5 * l, 0.22 * w);
      k.joint(`thumb${S}`, 0, -0.1 * l, 0.28 * w);
      k.joint(`thigh${S}`, side * this.hipX, this.hipY - this.torsoBot);
      k.joint(`knee${S}`, 0, -this.thigh);
      k.joint(`ankle${S}`, 0, -this.shin);
    }
  }

  /** How deep the trunk is (front to back) at height y, as a share of its width. */
  depthAt(y: number, seat = true) {
    const t = this.k.p.torso;
    return (
      t.depth *
      lerp(1, 0.8, smooth(0.55 * this.T, 0.95 * this.T, y)) *
      // (`seat`: the bottom in between the thighs, not a round below and behind them)
      (seat ? 1 - t.seat * 0.24 * (1 - smooth(0.04 * this.T, 0.3 * this.T, y)) : 1)
    );
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
      s += t.bust * front ** 0.5 * bell(y, 0.71 * T, t.bustH * T) * bell(across, 0.42, 0.26);
    }
    return s;
  }

  /** Flatten a lathe made round the trunk's axis into the trunk's shape (y0: its height offset;
   *  `seat` false: as deep as the trunk was before it was drawn in, for what hangs from the hips). */
  squash(g: BufferGeometry, y0 = 0, seat = true): BufferGeometry {
    return mapVerts(g, (v) => {
      v.z *= this.depthAt(v.y + y0, seat) * this.swell(v.x, v.y + y0, v.z);
    });
  }

  /** The trunk's outline scaled out by `k` between two heights (for a garment over it). */
  around(k: number, from: number, to: number, lift = 0): Prof[] {
    const out: Prof[] = [];
    for (const q of this.profile) if (q.y >= from && q.y <= to) out.push([q.x * k, q.y + lift]);
    return out;
  }

  /** A ring round the trunk at height y (a hem, a waistband), `r` thick, `k` out from the skin. */
  ring(y: number, k: number, r: number, segs = this.k.seg.ring * 2): BufferGeometry {
    const R0 = this.trunk.r(y) * k;
    return this.squash(lathe(arc(R0 + r * 0.4, y, r, -Math.PI / 2, Math.PI * 1.5, segs), this.k.seg.radial));
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
    return this.lay(subdivide(extrude(shape, o.depth, o.bevel, this.k.seg.curve, 1), this.k.bend), o);
  }

  /** Flat geometry (x across, y up the trunk, z out) laid onto the trunk, as `onTrunk`. */
  lay(g: BufferGeometry, o: { kk?: number; lift?: number; side?: 1 | -1 }): BufferGeometry {
    const side = o.side ?? 1;
    const kk = o.kk ?? 1.045;
    return mapVerts(g, (v) => {
      // (behind, x runs the other way, so the outline isn't drawn inside out)
      const x = side > 0 ? v.x : -v.x;
      const z = v.z;
      const s = this.surf(x, v.y, kk, side);
      v.copy(s.addScaledVector(this.surfNormal(x, v.y, kk, side), z + (o.lift ?? 0)));
    });
  }

  /** The bare figure: trunk, neck, arms, hands, legs — less what clothes hide all of. */
  build(skin: string, hidden: { arms?: boolean; legs?: boolean; trunk?: boolean } = {}) {
    const k = this.k;
    const R = k.seg.radial;
    // the trunk in two: the hips up past the waist, and the chest (it rides
    // the spine) down over it — they overlap, so a bend never opens a gap
    // (none where a top covers it all, down to the seat: docs/plan/60)
    const T = this.T;
    if (!hidden.trunk) {
      const low = this.around(1, 0, 0.56 * T);
      low.push([this.trunk.r(0.56 * T) * 0.6, 0.6 * T], [0, 0.6 * T]);
      k.add("hips", this.squash(lathe(low, R)), skin);
      const high = this.around(0.995, 0.4 * T, T);
      high.unshift([0, 0.38 * T], [this.trunk.r(0.4 * T) * 0.6, 0.38 * T]);
      k.add("spine", this.squash(lathe(high, R)).translate(0, -this.spineY, 0), skin);
    }
    // neck
    const nl = this.chinY - this.neckBase + 0.32 * this.hh;
    const nr = k.p.neck.r * this.hh;
    // (with the trapezius, the neck spreads into it at its root)
    const root = lerp(1.05, 1.3, k.p.torso.trap);
    k.add("neck", capsule(nl, nr, nr * root, 0, R, k.seg.ring).translate(0, nl - 0.06 * this.hh, 0), skin);
    // (`anatomy`: its front — the cords from under the ears down to the hollow between the
    // collarbones, inked close up, and an Adam's apple)
    if (k.p.anatomy > 0) {
      const NL = k.p.neck.len * this.hh; // (what shows: the trunk's top to the chin)
      const rAt = (y: number) => lerp(nr * root, nr, Math.min(1, Math.max(0, (y + 0.06 * this.hh) / nl)));
      if (k.seg.radial > 16)
        for (const s of [1, -1] as const)
          k.add(
            "neck",
            limbFold(
              k,
              [
                [s * 1.25, NL * 0.85],
                [s * 0.75, NL * 0.45],
                [s * 0.22, NL * 0.04],
              ],
              0.004,
              rAt,
              1,
            ),
            k.p.ink,
            { ink: 0 },
          );
      if (k.p.neck.apple > 0) {
        const y = NL * 0.55;
        const a = nr * 0.3 * k.p.neck.apple;
        k.add("neck", ellipsoid(a * 0.8, a * 1.2, a, Math.max(8, R / 2), k.seg.ring * 2), skin, {
          at: new Vector3(0, y, rAt(y) - a * 0.45),
        });
      }
    }
    // arms and hands
    for (const side of ["L", "R"] as const) {
      const sx = side === "L" ? 1 : -1;
      const shaped = k.p.anatomy > 0;
      if (!hidden.arms) {
        k.add(
          `shoulder${side}`,
          shaped
            ? this.limb(this.upper, this.uR, this.fR, this.uR * 0.06, sx, LIMBS.upper)
            : capsule(this.upper, this.uR, this.fR, this.uR * 0.06, R, k.seg.ring),
          skin,
        );
        k.add(
          `elbow${side}`,
          shaped
            ? this.limb(this.fore, this.fR, this.wR, this.fR * 0.08, sx, LIMBS.fore)
            : capsule(this.fore, this.fR, this.wR, this.fR * 0.08, R, k.seg.ring),
          skin,
        );
      }
      k.add(`wrist${side}`, this.mitten(), skin, { skin: this.handSkin(side) });
      if (!hidden.legs) {
        k.add(
          `thigh${side}`,
          shaped
            ? this.limb(this.thigh, this.thighR, this.kneeR, this.thighR * 0.08, sx, LIMBS.thigh)
            : capsule(this.thigh, this.thighR, this.kneeR, this.thighR * 0.08, R, k.seg.ring),
          skin,
        );
        const calf = k.p.leg.calf * this.hh;
        k.add(
          `knee${side}`,
          shaped
            ? this.limb(this.shin, this.kneeR, this.ankleR, calf * 0.4, sx, LIMBS.shin)
            : capsule(this.shin, this.kneeR, this.ankleR, calf, R, k.seg.ring),
          skin,
        );
      }
    }
  }

  /** A limb shaped like one (`anatomy`): a capsule's round ends at the joints (fewer rows to them:
   *  they're mostly inside the next part) and more rows between them, `swell` round its middle,
   *  then pushed out by `bulge(u, front, out)` (u 0 the top … 1 the bottom; front 1 in front, −1
   *  behind; out 1 on the outside, −1 on the inside), a share of its radius. */
  limb(len: number, rTop: number, rBot: number, swell: number, sx: 1 | -1, bulge: LimbShape): BufferGeometry {
    const rings = this.k.seg.ring;
    const cap = Math.max(2, rings - 2);
    const pts: Prof[] = [];
    pts.push(...arc(0, -len, rBot, -Math.PI / 2, 0, cap));
    const mid = Math.max(6, rings + 4);
    for (let i = 1; i < mid; i++) {
      const u = i / mid;
      pts.push([rBot + (rTop - rBot) * u + Math.sin(Math.PI * u) * swell, -len + len * u]);
    }
    pts.push(...arc(0, 0, rTop, 0, Math.PI / 2, cap));
    return shapeOver(lathe(pts, this.k.seg.radial), len, sx, bulge);
  }

  /** The mitten's weights (wrist space): the thumb's lobe on the thumb; below the knuckles the
   *  fingers, the index on the thumb's side — blended across, so a bend stretches, never tears. */
  handSkin(side: "L" | "R"): Skin {
    const l = this.k.p.hand.size * this.hh;
    const w = l * 0.62;
    const fingers = this.k.p.hand.fingers > 0 && this.k.seg.radial > 16; // (close up only)
    return (_x, y, z) => {
      const thumb = smooth(0.3 * w, 0.48 * w, z) * smooth(-0.64 * l, -0.52 * l, y);
      // (fingers drawn: the bend spread down them, so they curve rather than fold at the knuckle)
      const along = fingers ? lerp(0.55, 1, smooth(0.56 * l, 0.95 * l, -y)) : 1;
      const below = smooth(0.42 * l, 0.56 * l, -y) * (1 - thumb) * along;
      const index = smooth(0.02 * w, 0.24 * w, z);
      return [
        [`thumb${side}`, thumb],
        [`index${side}`, below * index],
        [`fingers${side}`, below * (1 - index)],
      ];
    };
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
    const fingers = k.p.hand.fingers > 0 && k.seg.radial > 16; // (close up only)
    if (fingers) {
      // four fingers, index to little: each a rounded tip, a round gap between two (not a point:
      // the bevel shoots a point out into a spike up the arm); the index's side kept in from the
      // thumb's lobe (its weights are the thumb's)
      const edge = [0.36, 0.13, -0.11, -0.33, -0.5];
      const notch = [-0.72, -0.84, -0.85, -0.82, -0.7];
      const tip = [-1.02, -1.07, -1.01, -0.92];
      const gx = 0.05 * w;
      const gy = 0.05 * w;
      sh.bezierCurveTo(w * 0.4, -l * 0.56, w * 0.37, -l * 0.64, w * edge[0], l * notch[0]);
      let x0 = w * edge[0];
      for (let i = 0; i < 4; i++) {
        const last = i === 3;
        const x1 = w * edge[i + 1];
        const y1 = l * notch[i + 1];
        const xe = last ? x1 : x1 + gx;
        const ye = last ? y1 : y1 - gy;
        sh.bezierCurveTo(x0, l * tip[i], xe, l * tip[i], xe, ye);
        if (!last) sh.bezierCurveTo(x1 + gx, ye + 1.33 * gy, x1 - gx, ye + 1.33 * gy, x1 - gx, ye);
        x0 = x1 - gx;
      }
      sh.bezierCurveTo(-w * 0.52, -l * 0.6, -w * 0.5, -l * 0.52, -w * 0.48, -l * 0.46);
    } else {
      sh.bezierCurveTo(w * 0.46, -l * 0.7, w * 0.38, -l * 0.96, w * 0.02, -l * 0.98);
      sh.bezierCurveTo(-w * 0.36, -l * 1.0, -w * 0.5, -l * 0.74, -w * 0.48, -l * 0.46);
    }
    sh.bezierCurveTo(-w * 0.46, -l * 0.22, -w * 0.4, -l * 0.06, -w * 0.34, l * 0.06);
    // (with fingers, more curves to the outline: fewer points to each)
    const g = extrude(sh, t, b, fingers ? Math.ceil(k.seg.curve / 2) : k.seg.curve, k.seg.bevel + 1);
    g.translate(0, 0, -(t + 2 * b) / 2);
    // (the fingers thinner to their tips)
    if (fingers)
      mapVerts(g, (v) => {
        v.z *= lerp(1, 0.66, smooth(-0.5 * l, -1.0 * l, v.y));
      });
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

/** How a limb's shaped (`anatomy`), out from round by a share of its radius at u (0 its top … 1 its
 *  bottom), `front` (1 in front … −1 behind) and `out` (1 the outside … −1 the inside). */
export const LIMBS = {
  // the deltoid's cap out at the side, the biceps in front, the triceps behind; in at the elbow
  upper: (u: number, front: number, out: number) =>
    0.09 * bell(u, 0.14, 0.12) * Math.max(0, out) +
    0.11 * bell(u, 0.5, 0.17) * Math.max(0, front) +
    0.06 * bell(u, 0.36, 0.18) * Math.max(0, -front) -
    0.05 * bell(u, 0.9, 0.06),
  // the forearm's muscle high on the outside and front, drawn down to a wrist that's deeper than
  // it's wide (the palm turned in)
  fore: (u: number, front: number, out: number) =>
    0.18 * bell(u, 0.22, 0.17) * Math.max(0, 0.6 * out + 0.5 * front) - 0.12 * bell(u, 0.84, 0.1) * out * out,
  // the quads in front, the sweep out at the side; above the knee in at the sides, the kneecap in front
  thigh: (u: number, front: number, out: number) =>
    0.07 * bell(u, 0.45, 0.22) * Math.max(0, front) +
    0.05 * bell(u, 0.3, 0.2) * Math.max(0, out) -
    0.07 * bell(u, 0.82, 0.08) * out * out +
    0.07 * bell(u, 0.95, 0.05) * Math.max(0, front) ** 2,
  // the calf behind, high and fuller on the inside; the shin flatter; a slim ankle
  shin: (u: number, front: number, out: number) =>
    0.3 * bell(u, 0.28, 0.17) * Math.max(0, -front) ** 1.2 +
    0.12 * bell(u, 0.34, 0.15) * Math.max(0, -out) -
    0.04 * bell(u, 0.4, 0.25) * Math.max(0, front) -
    0.1 * bell(u, 0.88, 0.06),
};
export type LimbShape = (u: number, front: number, out: number) => number;

/** Shape something round a limb's axis (joint space, down −y, `len` long) by `bulge` (× `amount`:
 *  a sleeve or trouser leg follows the limb, less). */
export function shapeOver(g: BufferGeometry, len: number, sx: 1 | -1, bulge: LimbShape, amount = 1): BufferGeometry {
  return mapVerts(g, (v) => {
    if (v.y >= 0 || v.y <= -len) return;
    const h = Math.hypot(v.x, v.z);
    if (h < 1e-9) return;
    const f = 1 + amount * bulge(-v.y / len, v.z / h, (sx * v.x) / h);
    v.x *= f;
    v.z *= f;
  });
}

/** A brush stroke's width along it: rounded on at its start, full near it, drawn out to a point. */
export const taper = (wd: number) => (u: number) =>
  wd * Math.sqrt(Math.min(1, u / 0.1)) * Math.sin(Math.PI * (0.15 + 0.85 * u)) ** 0.7;

/** An inked fold laid round a limb's shell (joint space, the limb down −y): `pts` as (angle from
 *  the front, − in towards the body, + out; y), `r(y, phi)` the shell's radius there, `sx` the side (the
 *  left 1). Drawn in the ink's colour, with no line round it. */
export function limbFold(
  k: Kit,
  pts: [number, number][],
  wd: number,
  r: (y: number, phi: number) => number,
  sx: 1 | -1,
) {
  const r0 = r(pts[0][1], sx * pts[0][0]);
  // (mirrored as points: the strip still faces out)
  const g = ribbon(
    pts.map(([phi, y]): [number, number] => [sx * phi * r0, y]),
    taper(wd * k.hh * k.p.folds),
  );
  return mapVerts(g, (v) => {
    const phi = v.x / r0;
    const out = r(v.y, phi) + 0.004 * k.hh;
    v.set(Math.sin(phi) * out, v.y, Math.cos(phi) * out);
  });
}

/** A hair-thin ring round a limb at `y` (a hem drawn as a line). */
export function creaseRing(r: number, y: number, radial: number): BufferGeometry {
  return lathe(arc(r, y, 1e-4, -Math.PI / 2, Math.PI * 1.5, 4), radial);
}
