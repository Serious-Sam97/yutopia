import { Shape, type Vector2, Vector3 } from "three";
import type { HeadSurface, Kit } from "../kit";
import { band, ellipsoid, lathe, mapVerts, oval, type Prof, smoothNormals, spline2 } from "../shapes";
import { Lookup, lerp, smooth } from "./body";

const IRIS = "#5a3d2b";

// The head's outline, chin to crown (radius, height; 0.5 = half the head's height).
const HEAD_ROUND: Prof[] = [
  [0, 0],
  [0.2, 0.012],
  [0.36, 0.07],
  [0.46, 0.2],
  [0.5, 0.42],
  [0.49, 0.62],
  [0.43, 0.8],
  [0.3, 0.935],
  [0.13, 0.993],
  [0, 1],
];
// a wide, flat jaw: the outline goes straight down from the cheeks and turns
// in late to a broad chin
const HEAD_SQUARE: Prof[] = [
  [0, 0],
  [0.27, 0.008],
  [0.43, 0.055],
  [0.49, 0.16],
  [0.505, 0.4],
  [0.49, 0.62],
  [0.43, 0.8],
  [0.3, 0.935],
  [0.13, 0.993],
  [0, 1],
];
const HEAD_POINTED: Prof[] = [
  [0, 0],
  [0.1, 0.02],
  [0.25, 0.1],
  [0.4, 0.26],
  [0.48, 0.44],
  [0.5, 0.6],
  [0.46, 0.79],
  [0.33, 0.935],
  [0.14, 0.993],
  [0, 1],
];

// The head as a surface we can stand things on: hair, eyes, brows. It's the
// lathe of the outline, squashed to `sx` wide and `sz` deep, and (`form`) pushed
// in and out round it by `shape(y, phi)` — a cheekbone, the brow, the back of the
// skull — so it isn't one outline turned; `normal`, `at` and `front` follow it.
export class HeadShape implements HeadSurface {
  private look: Lookup;
  readonly pts: Vector2[];
  constructor(
    readonly hh: number,
    readonly sx: number,
    readonly sz: number,
    jaw: number,
    samples: number,
    square = 0,
    lean = 0,
    readonly shape: ((y: number, phi: number) => number) | null = null,
  ) {
    const prof = HEAD_ROUND.map(([r, y], i): Prof => {
      const pr = lerp(r, HEAD_POINTED[i][0], jaw);
      const py = lerp(y, HEAD_POINTED[i][1], jaw);
      const ty = lerp(py, HEAD_SQUARE[i][1], square);
      // (lean: the cheeks and jaw drawn in, most at the jaw, the skull kept)
      const tr = lerp(pr, HEAD_SQUARE[i][0], square) * (1 - lean * 0.13 * Math.exp(-(((ty - 0.24) / 0.2) ** 2)));
      return [tr * hh, ty * hh];
    });
    this.pts = spline2(prof, samples);
    this.look = new Lookup(this.pts);
  }
  /** The outline's radius at y, at the side (where things hang: ears, headphones, a brim). */
  R(y: number) {
    return this.look.r(y) * (this.shape?.(y, Math.PI / 2) ?? 1);
  }
  /** The radius at y, `phi` round from the front. */
  r(y: number, phi: number) {
    return this.look.r(y) * (this.shape?.(y, phi) ?? 1);
  }
  private point(y: number, phi: number): Vector3 {
    const r = this.r(y, phi);
    return new Vector3(Math.sin(phi) * r * this.sx, y, Math.cos(phi) * r * this.sz);
  }
  normal(x: number, y: number, z: number): Vector3 {
    const t = y / this.hh;
    if (t > 0.997) return new Vector3(0, 1, 0);
    if (t < 0.003) return new Vector3(0, -1, 0);
    if (!this.shape) {
      // (one outline turned: exact)
      const d = this.hh * 0.002;
      const r = this.look.r(y);
      const dr = (this.look.r(y + d) - this.look.r(y - d)) / (2 * d);
      return new Vector3(x / (this.sx * this.sx), -r * dr, z / (this.sz * this.sz)).normalize();
    }
    const phi = Math.atan2(x / this.sx, z / this.sz);
    const d = this.hh * 0.002;
    const dy = this.point(y + d, phi).sub(this.point(y - d, phi));
    const dp = this.point(y, phi + 0.004).sub(this.point(y, phi - 0.004));
    return dp.cross(dy).normalize();
  }
  /** A point on the head (t 0 chin … 1 crown, phi 0 front, + towards its left), `out` above the surface. */
  at(t: number, phi: number, out = 0): Vector3 {
    const y = Math.min(1, Math.max(0, t)) * this.hh;
    const p = this.point(y, phi);
    return p.addScaledVector(this.normal(p.x, p.y, p.z), out);
  }
  /** The face-side surface straight behind (x, y), and its normal. */
  front(x: number, y: number): { p: Vector3; n: Vector3 } {
    if (!this.shape) {
      const r = this.look.r(y);
      const lim = r * this.sx * 0.995;
      const cx = Math.max(-lim, Math.min(lim, x));
      const q = Math.max(0, r * r - (cx / this.sx) ** 2);
      const p = new Vector3(cx, y, this.sz * Math.sqrt(q));
      return { p, n: this.normal(p.x, p.y, p.z) };
    }
    // (the angle whose point is at x: the radius changes slowly round, so a few turns find it)
    let phi = 0;
    for (let i = 0; i < 4; i++) {
      const lim = this.r(y, phi) * this.sx * 0.995;
      phi = Math.asin(Math.max(-1, Math.min(1, Math.max(-lim, Math.min(lim, x)) / (this.r(y, phi) * this.sx))));
    }
    const p = this.point(y, phi);
    return { p, n: this.normal(p.x, p.y, p.z) };
  }
}

/** `form`: how the head's pushed out (and in) round it, a share of its radius — the back of the
 *  skull, a forehead narrower than the skull behind it, cheekbones and the hollow under them, the
 *  brow over the eyes. The sides (where things hang) stay as the outline has them. */
export function headForm(hh: number, form: number, eyeY: number) {
  if (form <= 0) return null;
  const bell = (v: number, c: number, w: number) => Math.exp(-(((v - c) / w) ** 2));
  return (y: number, phi: number) => {
    const t = y / hh;
    const c = Math.cos(phi);
    const a = Math.abs(Math.atan2(Math.sin(phi), c)); // 0 the front … π the back
    const front = Math.max(0, c);
    return (
      1 +
      form *
        (0.06 * bell(t, 0.55, 0.18) * Math.max(0, -c) ** 1.5 -
          0.04 * bell(t, 0.74, 0.14) * front * Math.abs(Math.sin(phi)) +
          0.05 * bell(t, 0.42, 0.07) * bell(a, 0.75, 0.3) -
          0.035 * bell(t, 0.27, 0.07) * bell(a, 0.85, 0.35) +
          0.025 * bell(t, eyeY + 0.1, 0.04) * front ** 4)
    );
  };
}

/** The head, ears and nose, and the Ligne claire face: dot eyes, thin brows, a line for a mouth. */
export function buildHead(k: Kit, skin: string, earsShow: boolean) {
  const p = k.p;
  const hh = k.hh;
  const hs = new HeadShape(
    hh,
    p.head.width,
    p.head.depth,
    p.head.jaw,
    k.seg.profile,
    p.head.square,
    p.head.lean,
    headForm(hh, p.head.form, p.face.eyeY),
  );
  k.head = hs;
  const g = lathe(hs.pts, k.seg.radial + 8);
  g.scale(p.head.width, 1, p.head.depth);
  const shape = hs.shape;
  if (shape)
    mapVerts(g, (v) => {
      const f = shape(v.y, Math.atan2(v.x / p.head.width, v.z / p.head.depth));
      v.x *= f;
      v.z *= f;
    });
  k.add("head", g, skin);

  const f = p.face;
  const ink = p.ink;
  const e = f.eyeSize * hh;
  const ey = f.eyeY * hh;
  const thin = hh * 0.0035;
  const strokes = Math.max(6, k.seg.curve * 2); // points along a brow, a lash, the mouth
  // (real eyes but far off: a dot, as they were; the glint and the lower lid close up only)
  const iris = f.iris > 0 && k.seg.radial > 9;
  const near = k.seg.radial > 16;
  for (const side of [1, -1] as const) {
    const ex = side * f.eyeGap * hh;
    const o = (x: number) => ex + side * x; // + towards the outer corner
    if (iris) {
      // an eye: the white, an almond (blink squashes it: "white"), and over it the iris, the
      // pupil and the glint, which look about ("eye"); the glint on the light's side, both eyes
      const white = new Shape();
      white.moveTo(o(-0.74 * e), ey - 0.02 * e);
      white.bezierCurveTo(o(-0.5 * e), ey + 0.5 * e, o(0.4 * e), ey + 0.56 * e, o(0.76 * e), ey + 0.08 * e);
      white.bezierCurveTo(o(0.46 * e), ey - 0.4 * e, o(-0.42 * e), ey - 0.44 * e, o(-0.74 * e), ey - 0.02 * e);
      k.decal(white, thin * 0.2, thin * 0.1, 0, "#f3eee4", "white");
      k.decal(oval(o(0), ey + 0.04 * e, 0.36 * e, 0.4 * e), thin * 0.2, thin * 0.1, thin * 0.3, IRIS, "eye");
      k.decal(oval(o(0), ey + 0.04 * e, 0.17 * e, 0.19 * e), thin * 0.2, thin * 0.1, thin * 0.6, ink, "eye");
      if (near)
        k.decal(
          oval(ex - 0.12 * e, ey + 0.17 * e, 0.075 * e, 0.075 * e),
          thin * 0.2,
          thin * 0.1,
          thin * 0.9,
          "#ffffff",
          "eye",
        );
      // shut: the line where the lids meet, a little low in the middle — drawn, but kept to a point
      // until a blink ends ("shut", bake.ts)
      k.decal(
        band(
          [
            [o(-0.78 * e), ey + 0.02 * e],
            [o(-0.05 * e), ey - 0.1 * e],
            [o(0.86 * e), ey + 0.1 * e],
          ],
          (u) => e * (0.04 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.1))),
          strokes,
        ),
        thin * 0.2,
        thin * 0.1,
        thin * 1.6,
        ink,
        "shut",
      );
      // the upper lid, heavy, flicked out at the corner; a fine lower one (a blink closes them on
      // the eye: "lid")
      k.decal(
        band(
          [
            [o(-0.8 * e), ey + 0.0 * e],
            [o(-0.3 * e), ey + 0.46 * e],
            [o(0.4 * e), ey + 0.46 * e],
            [o(0.9 * e), ey + 0.12 * e],
          ],
          (u) => e * (0.07 + 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.15))),
          strokes,
        ),
        thin * 0.2,
        thin * 0.1,
        thin * 1.2,
        ink,
        "lid",
      );
      if (near)
        k.decal(
          band(
            [
              [o(-0.3 * e), ey - 0.36 * e],
              [o(0.3 * e), ey - 0.3 * e],
              [o(0.66 * e), ey - 0.06 * e],
            ],
            e * 0.05,
            strokes,
          ),
          thin * 0.2,
          thin * 0.1,
          thin * 1.2,
          ink,
          "lid",
        );
    }
    // an upright dot (blink squashes it to a line: the "eye" tag)
    else
      k.decal(oval(o(-0.04 * e), ey, 0.36 * e, 0.5 * e * (1 - 0.22 * f.lid)), thin * 0.2, thin * 0.15, 0, ink, "eye");
    // the upper lid: a line over the eye, longer than it, the outer end down
    if (f.lid > 0 && f.iris === 0)
      k.decal(
        band(
          [
            [o(-0.5 * e), ey + 0.44 * e],
            [o(0.02 * e), ey + 0.56 * e],
            [o(0.58 * e), ey + 0.3 * e],
          ],
          e * 0.13 * f.lid,
          strokes,
        ),
        thin * 0.2,
        thin * 0.1,
        0,
        ink,
      );
    // lashes: two flicks off the outer corner
    if (f.lashes)
      for (const [x0, y0, x1, y1] of [
        [0.26, 0.36, 0.62, 0.66],
        [0.34, 0.12, 0.72, 0.3],
      ])
        k.decal(
          band(
            [
              [o(x0 * e), ey + y0 * e],
              [o(x1 * e), ey + y1 * e],
            ],
            e * 0.13,
            strokes,
          ),
          thin * 0.2,
          thin * 0.1,
          0,
          ink,
        );
    // the brow, over the eye: an arch (`browArch` 1), straight and low, or high and fine
    const arch = f.browArch;
    const by = ey + e * (1.75 + 0.15 * arch);
    k.decal(
      band(
        [
          [o(-0.64 * e), by - 0.06 * e * arch],
          [o(0.06 * e), by + 0.13 * e * arch],
          [o(0.7 * e), by - 0.03 * e - 0.08 * e * Math.max(0, arch - 1)],
        ],
        f.brows * e * 0.55,
        strokes,
      ),
      thin * 0.2,
      thin * 0.15,
      thin * 0.2,
      ink,
    );
    if (f.ears > 0 && earsShow) {
      const s = f.ears * hh;
      const y = (f.eyeY - 0.04 - 0.03 * f.earBack) * hh;
      const x = hs.R(y) * p.head.width;
      const ear = ellipsoid(s * 0.32, s * 0.62, s * 0.48, Math.max(8, k.seg.radial / 2), k.seg.ring * 2);
      ear.rotateY(side * 0.35);
      // (`earBack`: further round towards the back, on the head's own surface there, standing off it
      // a little: out over the hair's edge)
      const at =
        f.earBack > 0
          ? hs.at(y / hh, side * (Math.PI / 2 + 0.22 * f.earBack), 0.1 * s * f.earBack)
          : new Vector3(side * x * 0.97, y, -0.02 * hh);
      k.add("head", ear, skin, { at });
    }
  }
  // a button nose, half sunk in the face (`bridge`: narrower, longer, up the face)
  if (f.nose > 0) {
    const s = f.nose * hh;
    const b = f.bridge;
    const y = ((f.eyeY + f.mouthY) * 0.5 + 0.03 * b) * hh;
    const at = hs.front(0, y);
    const nose = ellipsoid(s * (0.85 - 0.3 * b), s * (0.8 + 0.6 * b), s, Math.max(8, k.seg.radial / 2), k.seg.ring * 2);
    k.add("head", nose, skin, {
      at: at.p.addScaledVector(at.n, -s * 0.25),
    });
  }
  // the mouth: one thin line (talk opens it: the "mouth" tag)
  const my = f.mouthY * hh;
  const mw = f.mouthW * hh;
  k.decal(
    band(
      [
        [-mw * 0.5, my + mw * 0.1 * f.smile],
        [0, my - mw * 0.14 * f.smile],
        [mw * 0.5, my + mw * 0.1 * f.smile],
      ],
      mw * 0.06,
      strokes,
    ),
    thin * 0.2,
    thin * 0.15,
    thin * 1.2, // (over stubble)
    ink,
    "mouth",
  );
}

/** `jawLine`: the head's underside made a jaw — everything on the head (it, the face, the hair, a
 *  hat) lifted more the further back it is, low down (up to 0.17 hh): the chin stays the lowest, the underside
 *  rises behind it to the nape, where the neck meets the skull, not a bowl as low behind as the
 *  chin. The face's front hardly moves. Run once everything's on the head. */
export function jawLine(k: Kit) {
  const J = k.p.head.jawLine;
  if (J <= 0) return;
  const hh = k.hh;
  const r = 0.5 * hh * k.p.head.depth;
  // (it's gone by 0.5 hh, under a hat's brim, which stays level; under ~0.2 hh, or a fold: the
  // lift falls off faster than y rises)
  const lift = 0.17 * hh * J;
  const w = 0.5 * hh * k.p.head.width;
  // the jaw's corner under the ear (out at the side, low, forward of the ear: a square jaw most), and
  // the chin brought forward a little (in the middle, at the bottom of the face)
  const corner = 0.13 * J * (1 - 0.6 * Math.min(1, k.p.head.jaw));
  const chin = 0.035 * hh * J;
  const bell = (v: number, c: number, s: number) => Math.exp(-(((v - c) / s) ** 2));
  for (const part of k.parts) {
    if (part.joint !== "head") continue;
    mapVerts(part.geo, (v) => {
      const side = Math.min(1, Math.abs(v.x) / w) ** 2;
      const ahead = smooth(-0.12 * hh, 0.08 * hh, v.z);
      v.x *= 1 + corner * bell(v.y, 0.15 * hh, 0.08 * hh) * side * ahead;
      v.z += chin * bell(v.y, 0.06 * hh, 0.06 * hh) * smooth(0, r, v.z) * (1 - side);
      const back = Math.min(1, Math.max(0, (r - v.z) / (2 * r)));
      const low = smooth(-0.2 * hh, 0.02 * hh, v.y) * (1 - smooth(0.18 * hh, 0.5 * hh, v.y));
      v.y += lift * back * low;
    });
    if (!part.own) smoothNormals(part.geo);
  }
}
