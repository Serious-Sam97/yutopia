import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import type { JointName } from "../rig";
import { arc, ellipsoid, extrude, lathe, mapVerts, type Prof, spline2, subdivide, sweepTube } from "../shapes";
import { type Body, creaseRing, LIMBS, type LimbShape, Lookup, lerp, limbFold, shapeOver, shell, smooth } from "./body";
import { shaftTop } from "./shoes";
import { PATTERNS, shade } from "./tops";

// Bottoms — every AvatarLayers bottom, a recipe each (`BOTTOMS`; a dress's skirt too, in the top's
// colour). The seat is a shell over the hips; each trouser leg two closed shells (thigh, shin) that
// bend at the knee; skirts a thick A-line shell on the hips.

export interface Bottom {
  /** a skirt: its length × the leg, its flare × the hips; pleated in this many */
  skirt?: number;
  flare?: number;
  pleats?: number;
  /** shorts: their length × the thigh */
  shorts?: number;
  /** a trouser leg: its looseness, its ankle × the ankle; its hem's thickness × the ankle (0 none),
   *  that hem's radius, turned up (lighter); how much of the leg's shape shows through */
  loose?: number;
  ankle?: number;
  cuff?: number;
  cuffR?: number;
  turn?: boolean;
  fit?: number;
  /** a waistband; a seam down the outside or a pressed crease down the front; pockets; a stripe;
   *  a bib and its straps */
  band?: boolean;
  seam?: "side" | "crease";
  pockets?: "back" | "cargo";
  stripe?: boolean;
  bib?: boolean;
  /** its pattern when none's chosen */
  pattern?: string;
}
export const BOTTOMS: Record<string, Bottom> = {
  jeans: { ankle: 1.5, cuff: 0.42, turn: true, band: true, seam: "side", pockets: "back" },
  trousers: { ankle: 1.45, cuff: 0.3, seam: "crease" },
  cargo: { loose: 1.12, ankle: 1.55, cuff: 0.3, band: true, pockets: "cargo", fit: 0.35 },
  joggers: { loose: 1.06, ankle: 1.15, cuff: 0.36, cuffR: 1.16, band: true, seam: "side", stripe: true },
  shorts: { shorts: 0.55 },
  skirt: { skirt: 0.36, flare: 1.55 },
  longskirt: { skirt: 0.8, flare: 1.7 },
  // the wardrobe's second set (docs/plan/60)
  chinos: { loose: 1.03, ankle: 1.42, cuff: 0.3, band: true },
  wide: { loose: 1.38, ankle: 3.0, cuff: 0.22, seam: "crease", fit: 0.1 },
  leggings: { loose: 0.9, ankle: 1.02, cuff: 0, fit: 0.9 },
  overalls: { ankle: 1.5, cuff: 0.42, turn: true, seam: "side", bib: true },
  pleated: { skirt: 0.3, flare: 1.62, pleats: 14 },
  snowpants: { loose: 1.2, ankle: 1.65, cuff: 0.3, band: true, seam: "side", fit: 0.25 },
  // suit trousers: a straight leg with a pressed crease, tweed unless chosen otherwise
  suit: { loose: 1.06, ankle: 1.55, cuff: 0.3, seam: "crease", fit: 0.4, pattern: "tweed" },
};

export function buildBottom(k: Kit, b: Body, a: AvatarLayers) {
  const first = k.parts.length;
  bottomParts(k, b, a);
  // its pattern over its colour (a dress's skirt: the top's)
  const dress = a.top === "dress";
  const chosen = dress ? a.topPattern : a.bottomPattern;
  const own = dress ? undefined : BOTTOMS[a.bottom]?.pattern;
  const kind = PATTERNS[(chosen && chosen !== "none" ? chosen : own) ?? ""] ?? 0;
  const c = dress ? a.topColor : a.bottomColor;
  const c2 = (dress ? a.topColor2 : a.bottomColor2) ?? shade(c, 0.55);
  if (kind) for (const q of k.parts.slice(first)) if (q.color === c) q.pattern = [kind, c2];
}

function bottomParts(k: Kit, b: Body, a: AvatarLayers) {
  const R = k.seg.radial;
  const T = b.T;
  const hh = b.hh;
  const dress = a.top === "dress";
  const g = dress ? BOTTOMS.skirt : (BOTTOMS[a.bottom] ?? BOTTOMS.jeans);
  const c = dress ? a.topColor : a.bottomColor;
  const fine = k.seg.radial >= 16;

  // the seat, over the hips up under the top's hem (not far past it: the
  // top rides the hips as far as this reaches, see index.ts)
  const seat = b.around(1.03, 0, 0.47 * T);
  seat.push([b.trunk.r(0.47 * T) * 0.6, 0.5 * T], [0, 0.5 * T]);
  k.add("hips", b.squash(lathe(seat, R)), c);
  // a waistband
  if (g.band) k.crease("hips", b.squash(creaseRing(b.trunk.r(0.36 * T) * 1.035, 0.36 * T, R)));
  // jeans' back pockets (`folds`, close up only): their outlines stitched on the seat
  if (g.pockets === "back" && k.p.folds > 0 && k.seg.radial > 16)
    for (const s of [1, -1] as const) {
      const corners: [number, number][] = [
        [0.2, 0.27],
        [0.62, 0.27],
        [0.6, 0.13],
        [0.41, 0.085],
        [0.22, 0.13],
        [0.2, 0.27],
      ];
      const line: Vector3[] = [];
      for (let i = 0; i < corners.length - 1; i++)
        for (let j = 0; j < 4; j++) {
          const [x0, y0] = corners[i];
          const [x1, y1] = corners[i + 1];
          const y = lerp(y0, y1, j / 4) * T;
          line.push(b.surf(s * lerp(x0, x1, j / 4) * b.trunk.r(y), y, 1.045, -1));
        }
      line.push(line[0].clone());
      k.crease(
        "hips",
        sweepTube(line, () => [1e-4, 1e-4], { segs: 40, radial: 4 }),
      );
    }

  if (g.bib) {
    // overalls: a bib up the front over the top, straps over the shoulders to the back, buttons
    const bw = b.trunk.r(0.6 * T) * 0.5;
    const bib = new Shape();
    bib.moveTo(-bw, 0.34 * T);
    bib.lineTo(bw, 0.34 * T);
    bib.lineTo(bw * 0.92, 0.72 * T);
    bib.lineTo(-bw * 0.92, 0.72 * T);
    bib.closePath();
    k.add(
      "spine",
      b.onTrunk(bib, { depth: 0.008 * hh, bevel: 0.005 * hh, kk: 1.1, lift: 0.004 * hh }).translate(0, -b.spineY, 0),
      c,
    );
    for (const sx of [1, -1] as const) {
      const x = sx * bw * 0.75;
      let yTop = 0.84 * T;
      while (yTop < T && b.trunk.r(yTop) > Math.abs(x)) yTop += T * 0.01;
      const strap = [
        b.surf(x, 0.7 * T, 1.12, 1),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), 1.13, 1),
        new Vector3(x, yTop + 0.03 * hh, 0),
        b.surf(x, lerp(0.86 * T, yTop, 0.6), 1.13, -1),
        // (crossed behind, down to the waist on the other side)
        b.surf(x * 0.2, 0.62 * T, 1.13, -1),
        b.surf(-x * 0.9, 0.4 * T, 1.12, -1),
      ];
      k.add(
        "spine",
        sweepTube(strap, () => [0.045 * hh, 0.012 * hh], {
          segs: k.seg.tube,
          radial: Math.max(4, k.seg.tubeRadial - 2),
          up: (q) => new Vector3(q.x, 0, q.z).normalize(),
        }).translate(0, -b.spineY, 0),
        c,
        { keepNormals: true },
      );
      if (fine) {
        const at = b.surf(x, 0.69 * T, 1.14, 1);
        k.add(
          "spine",
          ellipsoid(0.022 * hh, 0.022 * hh, 0.01 * hh, 10, 3).translate(at.x, at.y - b.spineY, at.z),
          "#c9b28a",
        );
      }
    }
  }

  if (g.skirt) {
    // an A-line skirt: a thick shell — down the inside, round the hem, up the outside
    const long = g.skirt > 0.5;
    const top = 0.46 * T;
    const hem = -(b.legLen * g.skirt);
    const rw = b.trunk.r(top);
    const rh = k.p.torso.hip * hh * (g.flare ?? 1.55);
    const th = 0.02 * hh;
    const outer = spline2(
      [
        [rh, hem],
        [rh * 0.86, hem * 0.45],
        [k.p.torso.hip * hh * 1.1, 0.18 * T],
        [rw, top],
      ],
      Math.max(8, k.seg.profile / 2),
    );
    const pts: Prof[] = [];
    for (let i = outer.length - 1; i >= 0; i--) pts.push([outer[i].x - th * 1.6, outer[i].y + th * 0.6]);
    pts.push(...arc(rh - th * 0.8, hem + th * 0.5, th * 0.85, Math.PI, Math.PI * 2, k.seg.ring));
    for (const q of outer) pts.push([q.x, q.y]);
    // its front rides the thighs below the hip joints (sitting, a stride), the back stays
    const hip = b.hipY - b.torsoBot;
    // (`folds`: the hem waved, in and out between seven folds, more the lower — a hollow on every
    // fourth of the nearest level's 28 columns, so a fold's line lies in it, not under the faces
    // across it)
    // (pleated: twice as many, sharper, all the way round and up)
    const N = g.pleats ?? 7;
    const pleat = g.pleats ? 1 : 0;
    // (not in front, over the thighs: a hollow there and a seated thigh comes through it)
    const wave = (y: number, phi: number) =>
      1 -
      (0.09 - 0.03 * pleat) *
        k.p.folds *
        smooth(lerp(hem, top, 0.7), hem, y) *
        (1 - 0.9 * (1 - pleat) * Math.max(0, Math.cos(phi)) ** 2) *
        (pleat ? Math.abs(Math.cos(N * phi * 0.5)) * 2 - 1 : Math.cos(N * phi));
    const skirt = lathe(pts, R);
    if (k.p.folds > 0)
      mapVerts(skirt, (v) => {
        const f = wave(v.y, Math.atan2(v.x, v.z));
        v.x *= f;
        v.z *= f;
      });
    // (a skirt hangs from the hips over the seat, not drawn in with it: or a seated thigh comes through)
    k.add("hips", b.squash(skirt, 0, false), c, { skin: skirtSkin(hip, hem, rh) });
    // folds: long strokes up from the hem in its waves' hollows, gathered in to the hips (close up only)
    if (k.p.folds > 0 && k.seg.radial > 16) {
      const out = new Lookup(outer);
      const ups = [0.35, 0.25, 0.42, 0.3, 0.45, 0.28, 0.38];
      for (let i = 0; i < N; i++) {
        const phi = (2 * Math.PI * i) / N + 0.001;
        const up = pleat ? 0.6 : ups[i % 7];
        k.add(
          "hips",
          b.squash(
            limbFold(
              k,
              [
                [phi, hem * 0.95],
                [phi, lerp(hem, top, up * 0.5)],
                [phi, lerp(hem, top, up)],
              ],
              0.008,
              (y) => out.r(y) * wave(y, phi),
              1,
            ),
            0,
            false,
          ),
          k.p.ink,
          { ink: 0, skin: skirtSkin(hip, hem, rh) },
        );
      }
    }
    // (it swings on its spring from the hips, the hem most: plan 58 phase 2d)
    k.spring("skirt", [0, hip, 0], [0, hem - hip, 0], {
      hz: long ? 2.4 : 3,
      damp: 0.5,
      limit: long ? 0.35 : 0.4,
    });
    return;
  }

  const leg = (side: "L" | "R") => {
    const sx = side === "L" ? 1 : -1;
    if (g.shorts) {
      k.add(
        `thigh${side}`,
        shell(b.thigh * g.shorts, b.thighR * 1.22, b.thighR * 0.98, R, k.seg.ring, b.thighR * 1.16),
        c,
      );
      return;
    }
    // trouser legs: thigh and shin shells, looser or tapered as the recipe has them
    const loose = g.loose ?? 1;
    const ankle = (g.ankle ?? 1.45) * (shaftTop(k, a.shoes) > 0 && a.shoes !== "snowboots" ? 1.18 : 1);
    const thighG = closedLimb(b.thigh, b.thighR * 1.1 * loose, b.kneeR * 1.18 * loose, b.thighR * 0.1, R, k.seg.ring);
    // (over a boot's shaft, the leg stops short of the ankle and sits wider, stacked on it)
    const shaft = shaftTop(k, a.shoes);
    // (tucked into snow boots instead: the leg ends inside the shaft)
    const tucked = a.shoes === "snowboots";
    const shinLen = shaft > 0 ? b.shin - shaft + (tucked ? -0.08 : 0.03) * hh : b.shin - b.ankleR * 0.6;
    const shinG = closedLimb(
      shinLen,
      b.kneeR * 1.18 * loose,
      b.ankleR * ankle,
      k.p.leg.calf * hh * 1.1 + b.kneeR * 0.04,
      R,
      k.seg.ring,
    );
    // (`anatomy`: the leg's shape shows through, less in a looser cut)
    const fit = k.p.anatomy * (g.fit ?? 0.6);
    if (fit > 0) {
      shapeOver(thighG, b.thigh, sx, LIMBS.thigh, fit);
      shapeOver(shinG, b.shin, sx, LIMBS.shin, fit);
    }
    k.add(`thigh${side}`, thighG, c);
    k.add(`knee${side}`, shinG, c);
    // the hem at the ankle: turned up (lighter), an elastic cuff, plain — or none
    const cuffT = b.ankleR * (g.cuff ?? 0.3);
    if (cuffT > 0)
      k.add(
        `knee${side}`,
        lathe(
          arc(
            b.ankleR * (g.cuffR ?? ankle - 0.07),
            -shinLen + b.ankleR * 0.05,
            cuffT,
            -Math.PI / 2,
            Math.PI * 1.5,
            k.seg.ring * 2,
          ),
          R,
        ),
        g.turn ? shade(c, 1.18) : c,
      );
    // folds: whiskers off the crotch (not on trousers: they've their crease), behind the knee and
    // where the hem breaks over the shoe (the nearest level of detail only)
    if (k.p.folds > 0 && k.seg.radial > 16) {
      const L = b.thigh;
      const tTop = b.thighR * 1.1 * loose;
      const tBot = b.kneeR * 1.18 * loose;
      // (round the leg as the shell is, shaped as it is)
      const fitted = (shape: LimbShape, len: number, r: number, y: number, phi: number) =>
        r * (1 + fit * shape(Math.min(1, Math.max(0, -y / len)), Math.cos(phi), sx * Math.sin(phi)));
      const rThigh = (y: number, phi: number) => {
        const u = Math.min(1, Math.max(0, 1 + y / L));
        return fitted(LIMBS.thigh, L, tBot + (tTop - tBot) * u + Math.sin(Math.PI * u) * b.thighR * 0.1, y, phi);
      };
      const sTop = b.kneeR * 1.18 * loose;
      const sBot = b.ankleR * ankle;
      const sSwell = k.p.leg.calf * hh * 1.1 + b.kneeR * 0.04;
      const rShin = (y: number, phi: number) => {
        const u = Math.min(1, Math.max(0, 1 + y / shinLen));
        return fitted(LIMBS.shin, b.shin, sBot + (sTop - sBot) * u + Math.sin(Math.PI * u) * sSwell, y, phi);
      };
      const fold = (joint: JointName, pts: [number, number][], wd: number, r: (y: number, phi: number) => number) =>
        k.add(joint, limbFold(k, pts, wd, r, sx), k.p.ink, { ink: 0 });
      if (g.seam !== "crease") {
        fold(
          `thigh${side}`,
          [
            [-0.75, -L * 0.1],
            [-0.4, -L * 0.17],
            [-0.05, -L * 0.2],
          ],
          0.007,
          rThigh,
        );
        fold(
          `thigh${side}`,
          [
            [-0.7, -L * 0.22],
            [-0.35, -L * 0.28],
          ],
          0.005,
          rThigh,
        );
      }
      fold(
        `thigh${side}`,
        [
          [Math.PI - 0.5, -L * 0.86],
          [Math.PI, -L * 0.92],
          [Math.PI + 0.45, -L * 0.87],
        ],
        0.006,
        rThigh,
      );
      fold(
        `thigh${side}`,
        [
          [Math.PI - 0.3, -L * 0.78],
          [Math.PI + 0.2, -L * 0.8],
        ],
        0.004,
        rThigh,
      );
      const hem = g.stripe ? 0.82 : 0.86;
      fold(
        `knee${side}`,
        [
          [-0.7, -shinLen * hem],
          [-0.15, -shinLen * (hem - 0.06)],
          [0.45, -shinLen * (hem - 0.02)],
        ],
        0.006,
        rShin,
      );
      fold(
        `knee${side}`,
        [
          [0.75, -shinLen * (hem - 0.12)],
          [1.05, -shinLen * (hem - 0.06)],
        ],
        0.004,
        rShin,
      );
    }
    // lines down the leg: the outer seam (jeans, joggers' stripe), the front crease (trousers)
    const along = (phi: number, kk: number, r0: number, r1: number, len: number, from: number) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const r = lerp(r0, r1, u) * kk;
        pts.push(new Vector3(Math.sin(phi) * r, from - len * u, Math.cos(phi) * r));
      }
      return sweepTube(pts, () => [1e-4, 1e-4], { segs: 6, radial: 4 });
    };
    if (g.seam === "side") {
      const phi = sx * Math.PI * 0.5;
      k.crease(`thigh${side}`, along(phi, 1.16 * loose, b.thighR, b.kneeR * 1.05, b.thigh * 0.95, -b.thighR * 0.4));
      k.crease(`knee${side}`, along(phi, 1.24 * loose, b.kneeR, b.ankleR * ankle * 0.9, shinLen * 0.92, 0));
    }
    if (g.seam === "crease") {
      k.crease(`thigh${side}`, along(0, 1.17 * loose, b.thighR, b.kneeR * 1.05, b.thigh * 0.9, -b.thighR * 0.5));
      k.crease(`knee${side}`, along(0, 1.25 * loose, b.kneeR, b.ankleR * ankle * 0.92, shinLen * 0.92, 0));
    }
    if (g.pockets === "cargo" && fine) {
      // a big pocket on the outside of the thigh, with its flap
      const p = new Shape();
      const w = 0.075 * hh;
      const y0 = -b.thigh * 0.38;
      const h = 0.13 * hh;
      p.moveTo(-w, y0);
      p.lineTo(w, y0);
      p.lineTo(w, y0 - h);
      p.quadraticCurveTo(0, y0 - h * 1.12, -w, y0 - h);
      p.closePath();
      k.add(`thigh${side}`, onLimbSide(k, p, sx, b.thighR * 1.1 * loose, b.kneeR * 1.18 * loose, b.thigh), c);
      const flap = new Shape();
      flap.moveTo(-w * 1.08, y0 + 0.01 * hh);
      flap.lineTo(w * 1.08, y0 + 0.01 * hh);
      flap.lineTo(w * 1.02, y0 - 0.03 * hh);
      flap.lineTo(-w * 1.02, y0 - 0.03 * hh);
      flap.closePath();
      k.add(
        `thigh${side}`,
        onLimbSide(k, flap, sx, b.thighR * 1.1 * loose, b.kneeR * 1.18 * loose, b.thigh, 0.006 * hh),
        shade(c, 0.9),
      );
    }
    if (g.stripe && fine)
      // a stripe down the side
      k.add(
        `thigh${side}`,
        onLimbSide(
          k,
          stripe(-b.thighR * 0.3, -b.thigh * 0.95, 0.018 * hh),
          sx,
          b.thighR * 1.1 * loose,
          b.kneeR * 1.18 * loose,
          b.thigh,
        ),
        shade(c, 1.35),
        { ink: 0 },
      );
  };
  leg("L");
  leg("R");
}

// a closed trouser leg: like the bare limb, a little looser (a long sleeve too: tops.ts)
export function closedLimb(len: number, rTop: number, rBot: number, swell: number, radial: number, ring: number) {
  const pts: Prof[] = [];
  pts.push(...arc(0, -len, rBot, -Math.PI / 2, 0, ring));
  const mid = Math.max(6, ring);
  for (let i = 1; i < mid; i++) {
    const u = i / mid;
    pts.push([rBot + (rTop - rBot) * u + Math.sin(Math.PI * u) * swell, -len + len * u]);
  }
  pts.push(...arc(0, 0, rTop, 0, Math.PI / 2, ring));
  return lathe(pts, radial);
}

// a strip from y0 down to y1 (for a side stripe)
function stripe(y0: number, y1: number, w: number): Shape {
  const s = new Shape();
  s.moveTo(-w, y0);
  s.lineTo(w, y0);
  s.lineTo(w, y1);
  s.lineTo(-w, y1);
  s.closePath();
  return s;
}

// A flat outline (x across, y down the limb from the joint) laid on the
// outside of a leg's shell (radius rTop at 0 to rBot at −len).
function onLimbSide(
  k: Kit,
  shape: Shape,
  sx: number,
  rTop: number,
  rBot: number,
  len: number,
  lift = 0.003 * k.hh,
): BufferGeometry {
  const hh = k.hh;
  const g = subdivide(extrude(shape, 0.004 * hh, 0.003 * hh, k.seg.curve, 1), k.bend);
  return mapVerts(g, (v) => {
    const r = lerp(rTop, rBot, Math.min(1, Math.max(0, -v.y / len)));
    // round the leg: x across the outside face becomes an angle from the side
    // (the same turn on both legs, so neither comes out inside out)
    const phi = sx * Math.PI * 0.5 + v.x / r;
    const out = r + v.z + lift;
    v.set(Math.sin(phi) * out, v.y, Math.cos(phi) * out);
  });
}

/** A skirt's (or a long hem's) second bone: the thigh on that side, more so lower down and in front. */
export function skirtSkin(hipY: number, hemY: number, r: number) {
  return (x: number, y: number, z: number): [JointName, number][] => {
    const down = smooth(hipY, hipY + (hemY - hipY) * 0.7, y);
    const front = smooth(-0.25, 0.65, z / Math.max(1e-6, r));
    const side = smooth(0, r * 0.35, Math.abs(x));
    const thigh = down * front * (0.55 + 0.45 * side) * 0.9;
    // (and what's left of it, lower down, on the skirt's spring)
    const swing = (1 - thigh) * 0.75 * smooth(hipY + (hemY - hipY) * 0.1, hemY, y);
    return [
      [x >= 0 ? "thighL" : "thighR", thigh],
      ["skirt", swing],
    ];
  };
}
