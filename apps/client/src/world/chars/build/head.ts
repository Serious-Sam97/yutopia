import { type Vector2, Vector3 } from "three";
import type { HeadSurface, Kit } from "../kit";
import { band, ellipsoid, lathe, oval, type Prof, spline2 } from "../shapes";
import { Lookup, lerp } from "./body";

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
// lathe of the outline, squashed to `sx` wide and `sz` deep — `normal`,
// `at` and `front` are exact on it.
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
  ) {
    const prof = HEAD_ROUND.map(([r, y], i): Prof => {
      const pr = lerp(r, HEAD_POINTED[i][0], jaw);
      const py = lerp(y, HEAD_POINTED[i][1], jaw);
      return [lerp(pr, HEAD_SQUARE[i][0], square) * hh, lerp(py, HEAD_SQUARE[i][1], square) * hh];
    });
    this.pts = spline2(prof, samples);
    this.look = new Lookup(this.pts);
  }
  R(y: number) {
    return this.look.r(y);
  }
  normal(x: number, y: number, z: number): Vector3 {
    const t = y / this.hh;
    if (t > 0.997) return new Vector3(0, 1, 0);
    if (t < 0.003) return new Vector3(0, -1, 0);
    const d = this.hh * 0.002;
    const r = this.R(y);
    const dr = (this.R(y + d) - this.R(y - d)) / (2 * d);
    return new Vector3(x / (this.sx * this.sx), -r * dr, z / (this.sz * this.sz)).normalize();
  }
  /** A point on the head (t 0 chin … 1 crown, phi 0 front, + towards its left), `out` above the surface. */
  at(t: number, phi: number, out = 0): Vector3 {
    const y = Math.min(1, Math.max(0, t)) * this.hh;
    const r = this.R(y);
    const p = new Vector3(Math.sin(phi) * r * this.sx, y, Math.cos(phi) * r * this.sz);
    return p.addScaledVector(this.normal(p.x, p.y, p.z), out);
  }
  /** The face-side surface straight behind (x, y), and its normal. */
  front(x: number, y: number): { p: Vector3; n: Vector3 } {
    const r = this.R(y);
    const lim = r * this.sx * 0.995;
    const cx = Math.max(-lim, Math.min(lim, x));
    const q = Math.max(0, r * r - (cx / this.sx) ** 2);
    const p = new Vector3(cx, y, this.sz * Math.sqrt(q));
    return { p, n: this.normal(p.x, p.y, p.z) };
  }
}

/** The head, ears and nose, and the Ligne claire face: dot eyes, thin brows, a line for a mouth. */
export function buildHead(k: Kit, skin: string, earsShow: boolean) {
  const p = k.p;
  const hh = k.hh;
  const hs = new HeadShape(hh, p.head.width, p.head.depth, p.head.jaw, k.seg.profile, p.head.square);
  k.head = hs;
  const g = lathe(hs.pts, k.seg.radial + 8);
  g.scale(p.head.width, 1, p.head.depth);
  k.add("head", g, skin);

  const f = p.face;
  const ink = p.ink;
  const e = f.eyeSize * hh;
  const ey = f.eyeY * hh;
  const thin = hh * 0.0035;
  const strokes = Math.max(6, k.seg.curve * 2); // points along a brow, a lash, the mouth
  for (const side of [1, -1] as const) {
    const ex = side * f.eyeGap * hh;
    const o = (x: number) => ex + side * x; // + towards the outer corner
    // an upright dot (blink squashes it to a line: the "eye" tag)
    k.decal(oval(o(-0.04 * e), ey, 0.36 * e, 0.5 * e), thin * 0.2, thin * 0.15, 0, ink, "eye");
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
      const y = (f.eyeY - 0.04) * hh;
      const x = hs.R(y) * p.head.width;
      const ear = ellipsoid(s * 0.32, s * 0.62, s * 0.48, Math.max(8, k.seg.radial / 2), k.seg.ring * 2);
      ear.rotateY(side * 0.35);
      k.add("head", ear, skin, { at: new Vector3(side * x * 0.97, y, -0.02 * hh) });
    }
  }
  // a button nose, half sunk in the face
  if (f.nose > 0) {
    const s = f.nose * hh;
    const y = (f.eyeY + f.mouthY) * 0.5 * hh;
    const at = hs.front(0, y);
    k.add("head", ellipsoid(s * 0.85, s * 0.8, s, Math.max(8, k.seg.radial / 2), k.seg.ring * 2), skin, {
      at: at.p.addScaledVector(at.n, -s * 0.25),
    });
  }
  // the mouth: one thin line (talk opens it: the "mouth" tag)
  const my = f.mouthY * hh;
  const mw = f.mouthW * hh;
  k.decal(
    band(
      [
        [-mw * 0.5, my + mw * 0.1],
        [0, my - mw * 0.14],
        [mw * 0.5, my + mw * 0.1],
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
