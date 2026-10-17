import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import type { JointName } from "../rig";
import { arc, extrude, lathe, mapVerts, type Prof, spline2, subdivide, sweepTube } from "../shapes";
import { type Body, creaseRing, lerp, shell, smooth } from "./body";
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
    k.add("hips", b.squash(lathe(pts, R)), c, { skin: skirtSkin(hip, hem, rh) });
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
  return (x: number, y: number, z: number): [JointName, number] => {
    const down = smooth(hipY, hipY + (hemY - hipY) * 0.7, y);
    const front = smooth(-0.25, 0.65, z / Math.max(1e-6, r));
    const side = smooth(0, r * 0.35, Math.abs(x));
    return [x >= 0 ? "thighL" : "thighR", down * front * (0.55 + 0.45 * side) * 0.9];
  };
}
