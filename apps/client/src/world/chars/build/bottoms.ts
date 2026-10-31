import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import type { JointName } from "../rig";
import { arc, extrude, lathe, mapVerts, type Prof, spline2, subdivide, sweepTube } from "../shapes";
import { type Body, creaseRing, LIMBS, type LimbShape, Lookup, lerp, limbFold, shapeOver, shell, smooth } from "./body";
import { shade } from "./tops";

// Bottoms — every AvatarLayers bottom: jeans, trousers, cargo, joggers,
// shorts, skirt, longskirt (and a dress's skirt, in the top's colour). The
// seat is a shell over the hips; each trouser leg two closed shells (thigh,
// shin) that bend at the knee; skirts a thick A-line shell on the hips.

const SKIRTS = new Set(["skirt", "longskirt"]);

export function buildBottom(k: Kit, b: Body, a: AvatarLayers) {
  const R = k.seg.radial;
  const T = b.T;
  const hh = b.hh;
  const dress = a.top === "dress";
  const kind = dress ? "skirt" : a.bottom;
  const c = dress ? a.topColor : a.bottomColor;
  const fine = k.seg.radial >= 16;

  // the seat, over the hips up under the top's hem (not far past it: the
  // top rides the hips as far as this reaches, see index.ts)
  const seat = b.around(1.03, 0, 0.47 * T);
  seat.push([b.trunk.r(0.47 * T) * 0.6, 0.5 * T], [0, 0.5 * T]);
  k.add("hips", b.squash(lathe(seat, R)), c);
  // a waistband
  if (kind === "joggers" || kind === "cargo" || kind === "jeans")
    k.crease("hips", b.squash(creaseRing(b.trunk.r(0.36 * T) * 1.035, 0.36 * T, R)));
  // jeans' back pockets (`folds`, close up only): their outlines stitched on the seat
  if (kind === "jeans" && !dress && k.p.folds > 0 && k.seg.radial > 16)
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

  if (SKIRTS.has(kind)) {
    // an A-line skirt: a thick shell — down the inside, round the hem, up the outside
    const long = kind === "longskirt" && !dress;
    const top = 0.46 * T;
    const hem = -(b.legLen * (long ? 0.8 : 0.36));
    const rw = b.trunk.r(top);
    const rh = k.p.torso.hip * hh * (long ? 1.7 : 1.55);
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
    const N = 7;
    // (not in front, over the thighs: a hollow there and a seated thigh comes through it)
    const wave = (y: number, phi: number) =>
      1 -
      0.09 *
        k.p.folds *
        smooth(lerp(hem, top, 0.7), hem, y) *
        (1 - 0.9 * Math.max(0, Math.cos(phi)) ** 2) *
        Math.cos(N * phi);
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
        const up = ups[i];
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
    if (kind === "shorts") {
      k.add(`thigh${side}`, shell(b.thigh * 0.55, b.thighR * 1.22, b.thighR * 0.98, R, k.seg.ring, b.thighR * 1.16), c);
      return;
    }
    // trouser legs: thigh and shin shells, looser for cargo, tapered for joggers
    const loose = kind === "cargo" ? 1.12 : kind === "joggers" ? 1.06 : 1;
    const ankle = kind === "joggers" ? 1.15 : kind === "jeans" ? 1.5 : kind === "cargo" ? 1.55 : 1.45;
    const thighG = closedLimb(b.thigh, b.thighR * 1.1 * loose, b.kneeR * 1.18 * loose, b.thighR * 0.1, R, k.seg.ring);
    const shinLen = b.shin - b.ankleR * 0.6;
    const shinG = closedLimb(
      shinLen,
      b.kneeR * 1.18 * loose,
      b.ankleR * ankle,
      k.p.leg.calf * hh * 1.1 + b.kneeR * 0.04,
      R,
      k.seg.ring,
    );
    // (`anatomy`: the leg's shape shows through, less in a looser cut)
    const fit = k.p.anatomy * (kind === "cargo" ? 0.35 : 0.6);
    if (fit > 0) {
      shapeOver(thighG, b.thigh, sx, LIMBS.thigh, fit);
      shapeOver(shinG, b.shin, sx, LIMBS.shin, fit);
    }
    k.add(`thigh${side}`, thighG, c);
    k.add(`knee${side}`, shinG, c);
    // the hem at the ankle: turned up (jeans), an elastic cuff (joggers), plain
    const cuffR = b.ankleR * (kind === "joggers" ? 1.16 : ankle - 0.07);
    const cuffT = kind === "jeans" ? b.ankleR * 0.42 : kind === "joggers" ? b.ankleR * 0.36 : b.ankleR * 0.3;
    const cuffColor = kind === "jeans" ? shade(c, 1.18) : c;
    k.add(
      `knee${side}`,
      lathe(arc(cuffR, -b.shin + b.ankleR * 0.65, cuffT, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R),
      cuffColor,
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
      if (kind !== "trousers") {
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
      const hem = kind === "joggers" ? 0.82 : 0.86;
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
    if (kind === "jeans" || kind === "joggers") {
      const phi = sx * Math.PI * 0.5;
      k.crease(`thigh${side}`, along(phi, 1.16 * loose, b.thighR, b.kneeR * 1.05, b.thigh * 0.95, -b.thighR * 0.4));
      k.crease(`knee${side}`, along(phi, 1.24 * loose, b.kneeR, b.ankleR * ankle * 0.9, shinLen * 0.92, 0));
    }
    if (kind === "trousers") {
      k.crease(`thigh${side}`, along(0, 1.17, b.thighR, b.kneeR * 1.05, b.thigh * 0.9, -b.thighR * 0.5));
      k.crease(`knee${side}`, along(0, 1.25, b.kneeR, b.ankleR * ankle * 0.92, shinLen * 0.92, 0));
    }
    if (kind === "cargo" && fine) {
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
    if (kind === "joggers" && fine)
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

// a closed trouser leg: like the bare limb, a little looser
function closedLimb(len: number, rTop: number, rBot: number, swell: number, radial: number, ring: number) {
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
