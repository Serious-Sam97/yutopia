import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import type { JointName } from "../rig";
import { arc, band, ellipsoid, lathe, oval, type Prof, ribbon, sweepTube } from "../shapes";
import { type Body, creaseRing, LIMBS, lerp, limbFold, shapeOver, shell, taper } from "./body";

// Tops — every AvatarLayers top: tee, tank, polo, shirt, sweater, turtleneck,
// hoodie, jacket, blazer, cardigan, dress (its skirt is in bottoms.ts). The
// chest is a shell over the trunk; collars, plackets, pockets and lapels are
// flat outlines laid onto it (`Body.onTrunk`), creases are drawn as lines.

export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}
export function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

export const LONG_SLEEVES = new Set(["hoodie", "sweater", "jacket", "turtleneck", "blazer", "cardigan", "shirt"]);
const LOOSE = new Set(["jacket", "blazer", "hoodie"]);
// how low the hem comes (share of the trunk's height)
const HEM: Record<string, number> = { blazer: 0.2, cardigan: 0.23, jacket: 0.27, hoodie: 0.27 };

export function buildTop(k: Kit, b: Body, a: AvatarLayers) {
  const kind = a.top;
  const c = a.topColor;
  const dark = shade(c, 0.82);
  const inner = lum(c) > 0.62 ? "#2a2a3a" : "#f4ece0"; // what shows in an open front
  const R = k.seg.radial;
  const T = b.T;
  const hh = b.hh;
  const fine = k.seg.radial >= 16; // buttons and the like only close up
  const toSpine = (g: BufferGeometry) => g.translate(0, -b.spineY, 0);
  const KK = LOOSE.has(kind) ? 1.06 : 1.045;

  // ── the chest: its hem rolled out over the seat ──
  const s0 = (HEM[kind] ?? 0.31) * T;
  const r0 = b.trunk.r(s0);
  const tank = kind === "tank";
  const topY = tank ? 0.66 * T : T;
  const pts: Prof[] = [
    [r0 * 0.9, s0 - 0.012 * T],
    [r0 * (KK + 0.015), s0 - 0.006 * T],
    [r0 * (KK + 0.03), s0 + 0.02 * T],
    ...b.around(KK, s0 + 0.04 * T, topY),
  ];
  if (tank) {
    // (its lower half: closed in towards the body, inside the skin)
    const rt = b.trunk.r(topY) * KK;
    pts.push([rt * 0.97, topY + 0.004 * T], [0, topY + 0.004 * T]);
  }
  k.add("spine", toSpine(b.squash(lathe(pts, R))), c);
  if (tank)
    // its upper half: a scooped neck in front, cut away under the arms, higher at the back
    k.add(
      "spine",
      toSpine(
        b.cover(
          0.62 * T,
          (phi) => {
            const cf = Math.cos(phi);
            const sides = Math.abs(Math.sin(phi)) ** 3;
            return T * (cf >= 0 ? lerp(0.86, 0.72, sides) - 0.04 * cf ** 8 : lerp(0.88, 0.72, sides));
          },
          KK,
        ),
      ),
      c,
    );
  // the hem as a line (a dress runs on into its skirt: no line)
  if (kind !== "dress") k.crease("spine", toSpine(b.squash(creaseRing(r0 * (KK + 0.025), s0, R))));
  // a ribbed band at the hem (knits)
  const knit = kind === "sweater" || kind === "cardigan" || kind === "hoodie";
  if (knit) k.add("spine", toSpine(b.ring(s0 + 0.02 * T, KK + 0.02, 0.022 * hh)), c);
  // seams (`folds`, close up only; lines, no body): down each side a little behind it and on
  // over the shoulder to the neck; a hem's stitching just above it (not a knit's band)
  const seams = k.p.folds > 0 && k.seg.radial > 16;
  if (seams && !tank) {
    for (const s of [1, -1] as const) {
      const line: Vector3[] = [];
      for (let i = 0; i <= 14; i++)
        line.push(b.around3(lerp(s0 + 0.03 * T, 0.975 * T, i / 14), s * (Math.PI / 2 + 0.14), KK + 0.006));
      k.crease("spine", toSpine(sweepTube(line, () => [1e-4, 1e-4], { segs: 28, radial: 4 })));
    }
    if (!knit && kind !== "dress") {
      const y = s0 + 0.035 * T;
      k.crease("spine", toSpine(b.squash(creaseRing(b.trunk.r(y) * (KK + 0.012), y, R))));
    }
  }

  // ── round the neck ──
  // (sized to the neck's root: with the trapezius it spreads there, and a neckline sized to the neck
  // itself sinks inside it — the crew ring, the collar's tabs, a turtleneck's foot)
  const nr0 = k.p.neck.r * hh;
  const nr = nr0 * lerp(1, 1.3 / 1.05, k.p.torso.trap);
  // (with the trapezius, the trunk's top round the neck is steep: a ring as wide as the neck sinks
  // under the top's own surface, so it's put at least just outside that)
  const trap = k.p.torso.trap;
  const neckRing = (tr: number, color: string, y = T * 0.975) => {
    const r = nr * 1.08 + tr * 0.7;
    const ring = trap > 0 ? Math.max(r, b.trunk.r(y) * (KK + 0.01) + tr * 0.3) : r;
    k.add("spine", toSpine(b.squash(lathe(arc(ring, y, tr, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R))), color);
  };
  const collarPoints = (len: number) => {
    // two pointed tabs lying on the chest either side of the neck (with the trapezius, a little
    // lower: the top round the neck is steep and narrow there, and squeezes them flat)
    const top = T * (0.985 - 0.035 * trap);
    for (const side of [1, -1] as const) {
      const s = new Shape();
      const x0 = side * nr * 0.2;
      const x1 = side * nr * 1.35;
      s.moveTo(x0, top);
      s.lineTo(x1, top - 0.01 * T);
      s.quadraticCurveTo(side * nr * 1.4, top - 0.035 * T, side * nr * 0.9, top - len);
      s.lineTo(x0, top - len * 0.35);
      s.closePath();
      k.add(
        "spine",
        toSpine(b.onTrunk(s, { depth: 0.004 * hh, bevel: 0.003 * hh, kk: KK + 0.012, lift: 0.002 * hh })),
        c,
      );
    }
  };
  const placket = (from: number, to: number, buttons: number) => {
    const line: Vector3[] = [];
    for (let i = 0; i <= 8; i++) line.push(b.surf(0, lerp(from, to, i / 8), KK + 0.004));
    k.crease("spine", toSpine(sweepTube(line, () => [1e-4, 1e-4], { segs: 8, radial: 4 })));
    if (fine)
      for (let i = 0; i < buttons; i++) {
        const y = lerp(from, to, (i + 0.5) / buttons);
        const at = b.surf(hh * 0.035, y, KK + 0.004);
        k.add(
          "spine",
          toSpine(ellipsoid(0.016 * hh, 0.016 * hh, 0.008 * hh, 10, 3).translate(at.x, at.y, at.z)),
          inner,
        );
      }
  };
  switch (kind) {
    case "turtleneck": {
      // a rolled tube up the neck
      const y0 = T * 0.93;
      const h = (b.chinY - b.neckBase) * 0.75 + (T - y0);
      // (its foot round the neck's root, its roll round the neck)
      const r = nr * 1.22;
      const rt = nr0 * 1.22;
      const prof: Prof[] = [
        [r * 0.95, y0],
        [r * 1.04, y0 + h * 0.15],
        [rt, y0 + h * 0.85],
        ...arc(rt - nr0 * 0.1, y0 + h, nr0 * 0.14, 0, Math.PI, k.seg.ring).map(([x, y]): Prof => [x, y]),
        [nr0 * 0.95, y0 + h * 0.9],
      ];
      // (it rides the neck: the neck joint sits at the trunk's top)
      k.add("neck", lathe(prof, R).translate(0, -T, 0), c);
      break;
    }
    case "sweater":
    case "hoodie":
      neckRing(0.05 * hh, c);
      break;
    case "shirt":
      neckRing(0.026 * hh, c);
      collarPoints(0.13 * hh);
      placket(T * 0.96, s0 + 0.03 * T, 5);
      break;
    case "polo":
      neckRing(0.026 * hh, c);
      collarPoints(0.11 * hh);
      placket(T * 0.96, T * 0.78, 2);
      break;
    case "jacket": {
      neckRing(0.045 * hh, dark);
      placket(T * 0.97, s0 + 0.02 * T, 0); // the zip
      // two chest pockets with flaps
      for (const side of [1, -1] as const) {
        const s = new Shape();
        const x = side * b.trunk.r(0.72 * T) * 0.45;
        s.moveTo(x - 0.07 * hh, 0.74 * T);
        s.lineTo(x + 0.07 * hh, 0.74 * T);
        s.lineTo(x + 0.065 * hh, 0.69 * T);
        s.lineTo(x - 0.065 * hh, 0.69 * T);
        s.closePath();
        k.add("spine", toSpine(b.onTrunk(s, { depth: 0.003 * hh, bevel: 0.003 * hh, kk: KK, lift: 0.002 * hh })), c);
      }
      break;
    }
    case "blazer":
    case "cardigan": {
      // open at the front in a V: the shirt underneath, lapels (blazer) or a button band
      const vY = kind === "blazer" ? 0.5 * T : 0.58 * T;
      const w = nr * 1.3;
      const v = new Shape();
      // (from just below the top of the trunk, where it rounds into the neck)
      v.moveTo(-w, T * 0.965);
      v.lineTo(w, T * 0.965);
      v.lineTo(0, vY);
      v.closePath();
      k.add("spine", toSpine(b.onTrunk(v, { depth: 0.002 * hh, bevel: 0.0015 * hh, kk: KK, lift: 0.009 * hh })), inner);
      if (kind === "blazer")
        for (const side of [1, -1] as const) {
          const l = new Shape();
          l.moveTo(side * w * 0.96, T * 0.962);
          l.lineTo(side * w * 1.55, T * 0.94);
          l.lineTo(side * w * 1.25, T * 0.83);
          l.lineTo(side * w * 0.12, vY + 0.02 * T);
          l.closePath();
          k.add("spine", toSpine(b.onTrunk(l, { depth: 0.004 * hh, bevel: 0.003 * hh, kk: KK, lift: 0.014 * hh })), c);
        }
      // the closing line from the V down, and its buttons
      placket(vY, s0 + 0.02 * T, kind === "blazer" ? 1 : 3);
      if (kind === "blazer")
        for (const side of [1, -1] as const) {
          // hip pocket flaps
          const s = new Shape();
          const x = side * b.trunk.r(0.3 * T) * 0.55;
          s.moveTo(x - 0.08 * hh, 0.33 * T);
          s.lineTo(x + 0.08 * hh, 0.33 * T);
          s.lineTo(x + 0.08 * hh, 0.3 * T);
          s.lineTo(x - 0.08 * hh, 0.3 * T);
          s.closePath();
          k.add("spine", toSpine(b.onTrunk(s, { depth: 0.003 * hh, bevel: 0.002 * hh, kk: KK, lift: 0.002 * hh })), c);
        }
      break;
    }
    default:
      // tee, tank, dress: a crew neck
      if (kind !== "tank") neckRing(0.022 * hh, dark);
  }

  if (kind === "hoodie") {
    // the kangaroo pocket
    const p = new Shape();
    const w = b.trunk.r(0.42 * T) * 0.55;
    p.moveTo(-w, 0.33 * T);
    p.lineTo(w, 0.33 * T);
    p.lineTo(w * 0.78, 0.5 * T);
    p.lineTo(-w * 0.78, 0.5 * T);
    p.closePath();
    k.add("spine", toSpine(b.onTrunk(p, { depth: 0.006 * hh, bevel: 0.004 * hh, kk: KK, lift: 0.003 * hh })), c);
    // the strings
    for (const side of [1, -1] as const) {
      // (down the chest's own surface, not straight across it: a fuller chest swallowed the middle)
      const along = [0, 0.33, 0.67, 1].map((u) =>
        b.surf(side * nr * lerp(0.5, 0.55, u), T * lerp(0.95, 0.8, u), KK + 0.03 + 0.012 * Math.sin(Math.PI * u)),
      );
      k.add(
        "spine",
        toSpine(
          sweepTube(along, () => [0.01 * hh, 0.01 * hh], {
            segs: Math.max(4, k.seg.tube / 3),
            radial: Math.max(4, k.seg.tubeRadial - 2),
          }),
        ),
        inner,
        { keepNormals: true },
      );
    }
    // the hood, bunched on the back below the neck
    const hood: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const phi = lerp(0.62, -0.62, i / 8) + Math.PI;
      const y = T * (0.94 - 0.05 * Math.cos(((i - 4) / 4) * (Math.PI / 2)));
      // (not inside the neck's root, where the trapezius draws the trunk in)
      const r = Math.max(b.trunk.r(y) * 1.12, nr * 1.75);
      hood.push(new Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * b.depthAt(y)));
    }
    k.add(
      "spine",
      toSpine(
        sweepTube(
          hood,
          (u) => {
            const s = Math.sqrt(Math.sin(Math.PI * u));
            return [0.075 * hh * s, 0.06 * hh * s];
          },
          { segs: k.seg.tube, radial: k.seg.tubeRadial },
        ),
      ),
      c,
      { keepNormals: true },
    );
  }

  if (tank) {
    // straps over the shoulders, from the neckline in front to the back
    for (const side of [1, -1] as const) {
      const x = side * b.trunk.r(0.84 * T) * 0.45;
      let yTop = 0.84 * T;
      while (yTop < T && b.trunk.r(yTop) > Math.abs(x)) yTop += T * 0.01;
      const strap = [
        b.surf(x, 0.8 * T, KK, 1),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), KK + 0.01, 1),
        new Vector3(x, yTop + 0.012 * hh, 0),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), KK + 0.01, -1),
        b.surf(x, 0.82 * T, KK, -1),
      ];
      k.add(
        "spine",
        toSpine(
          sweepTube(strap, () => [0.045 * hh, 0.012 * hh], {
            segs: k.seg.tube,
            radial: Math.max(4, k.seg.tubeRadial - 2),
            up: (q) => new Vector3(q.x, 0, q.z).normalize(),
          }),
        ),
        c,
        { keepNormals: true },
      );
    }
  }

  // ── folds: inked creases sweeping in from under each arm, one pulled at the waist, one behind
  // (the nearest level of detail only) ──
  const folds = k.p.folds > 0 && k.seg.radial > 16;
  if (folds && kind !== "tank") {
    const rc = b.trunk.r(0.7 * T);
    const crease = (pts: [number, number][], wd: number, side: 1 | -1 = 1) =>
      k.add(
        "spine",
        toSpine(
          b.lay(ribbon(pts, taper(wd * hh * k.p.folds)), {
            kk: KK,
            lift: 0.004 * hh,
            side,
          }),
        ),
        k.p.ink,
        { ink: 0 },
      );
    for (const s of [1, -1] as const) {
      crease(
        [
          [s * 0.9 * rc, 0.78 * T],
          [s * 0.74 * rc, 0.715 * T],
          [s * 0.52 * rc, 0.69 * T],
        ],
        0.008,
      );
      crease(
        [
          [s * 0.92 * rc, 0.68 * T],
          [s * 0.82 * rc, 0.635 * T],
          [s * 0.68 * rc, 0.62 * T],
        ],
        0.006,
      );
      crease(
        [
          [s * 0.5 * rc, 0.6 * T],
          [s * 0.38 * rc, 0.54 * T],
          [s * 0.3 * rc, 0.48 * T],
        ],
        0.005,
        -1,
      );
    }
    // (the waist's pull on one side only: two alike look drawn by a machine)
    crease(
      [
        [0.4 * rc, s0 + 0.04 * T],
        [0.33 * rc, s0 + 0.1 * T],
        [0.3 * rc, s0 + 0.15 * T],
      ],
      0.005,
    );
  }

  // ── sleeves ──
  if (tank) return;
  const long = LONG_SLEEVES.has(kind);
  const loose = LOOSE.has(kind) ? 1.08 : 1;
  for (const side of ["L", "R"] as const) {
    // (`anatomy`: the arm's shape shows through, less in a loose one)
    const sx = side === "L" ? 1 : -1;
    const fit = k.p.anatomy * (LOOSE.has(kind) ? 0.3 : 0.55);
    k.add(
      `shoulder${side}`,
      shapeOver(
        shell(long ? b.upper + b.fR * 0.4 : b.upper * 0.42, b.uR * 1.28 * loose, b.uR * 0.96, R, k.seg.ring),
        b.upper,
        sx,
        LIMBS.upper,
        fit,
      ),
      c,
    );
    if (kind === "polo") k.crease(`shoulder${side}`, creaseRing(b.uR * 1.27, -b.upper * 0.3, R));
    // (a short sleeve's hem stitched, shaped as the sleeve is)
    else if (seams && !long)
      k.crease(
        `shoulder${side}`,
        shapeOver(creaseRing(b.uR * 1.28 * loose * 1.03, -b.upper * 0.42 * 0.8, R), b.upper, sx, LIMBS.upper, fit),
      );
    // (folds: from the armpit down a short sleeve; in the crook of the elbow and bunched at the
    // cuff on a long one)
    const fold = (joint: JointName, pts: [number, number][], wd: number, r: number) =>
      k.add(
        joint,
        limbFold(k, pts, wd, () => r, sx),
        k.p.ink,
        { ink: 0 },
      );
    if (folds) {
      const ru = b.uR * 1.3 * loose;
      if (!long) {
        const len = b.upper * 0.42;
        fold(
          `shoulder${side}`,
          [
            [-1.25, -len * 0.22],
            [-0.95, -len * 0.42],
            [-0.7, -len * 0.55],
          ],
          0.006,
          ru,
        );
        fold(
          `shoulder${side}`,
          [
            [-1.05, -len * 0.55],
            [-0.85, -len * 0.7],
          ],
          0.004,
          ru,
        );
      } else {
        const u = b.upper;
        fold(
          `shoulder${side}`,
          [
            [-1.0, -u * 0.8],
            [-0.55, -u * 0.9],
            [-0.15, -u * 0.86],
          ],
          0.007,
          ru,
        );
        fold(
          `shoulder${side}`,
          [
            [-0.85, -u * 0.68],
            [-0.5, -u * 0.74],
          ],
          0.005,
          ru,
        );
        const f = b.fore - b.wR * 0.2;
        const rf = b.fR * 1.33 * loose;
        fold(
          `elbow${side}`,
          [
            [-0.9, -f * 0.12],
            [-0.5, -f * 0.2],
          ],
          0.005,
          rf,
        );
        fold(
          `elbow${side}`,
          [
            [0.15, -f * 0.76],
            [0.5, -f * 0.83],
            [0.85, -f * 0.78],
          ],
          0.005,
          rf * 0.92,
        );
        fold(
          `elbow${side}`,
          [
            [-0.3, -f * 0.7],
            [-0.65, -f * 0.78],
          ],
          0.004,
          rf * 0.94,
        );
      }
    }
    if (long) {
      k.add(
        `elbow${side}`,
        shapeOver(
          shell(b.fore - b.wR * 0.2, b.fR * 1.3 * loose, b.wR * 1.02, R, k.seg.ring, b.wR * 1.35),
          b.fore,
          sx,
          LIMBS.fore,
          fit,
        ),
        c,
      );
      k.add(
        `elbow${side}`,
        lathe(arc(b.wR * 1.3, -b.fore + b.wR * 0.25, b.wR * 0.32, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R),
        c,
      );
    }
  }
}

/** A short band laid on the chest (used for a scarf's tails). */
export function chestBand(b: Body, pts: [number, number][], width: number, kk: number) {
  return b.onTrunk(band(pts, width, 16), { depth: 0.01 * b.hh, bevel: 0.006 * b.hh, kk, lift: 0.004 * b.hh });
}

/** A round thing laid on the chest (a pendant). */
export function chestDot(b: Body, x: number, y: number, r: number, kk: number) {
  return b.onTrunk(oval(x, y, r, r), { depth: 0.004 * b.hh, bevel: 0.003 * b.hh, kk, lift: 0.004 * b.hh });
}
