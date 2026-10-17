import { BufferGeometry, Float32BufferAttribute, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, ellipsoid, extrude, lathe, type Prof, sweepTube } from "../shapes";
import { lerp, smooth } from "./body";
import { shade } from "./tops";

// On the head — every AvatarLayers accessory: headphones, cap, beanie, beret,
// bucket hat, bandana, headband. Each sits over the hair (`crown`: how far
// the hair stands off the scalp) on the head's own surface.

export const HATS = new Set(["cap", "beanie", "beret", "bucket"]);

// Where each hat's rim comes down to (0 chin … 1 crown) round the head (phi 0 front).
// (a bandana isn't a hat, but the fringe hangs from under it too)
const RIMS: Record<string, [number, number]> = {
  cap: [0.66, 0.55],
  beanie: [0.72, 0.5],
  beret: [0.8, 0.66],
  bucket: [0.58, 0.54],
  bandana: [0.7, 0.46],
};
const levelOf =
  ([tf, tb]: [number, number]) =>
  (phi: number) =>
    tb + (tf - tb) * ((Math.cos(phi) + 1) / 2);
/** The rim line of a hat (hair hangs out from under it), or null for no hat. */
export function hatLine(kind: string): ((phi: number) => number) | null {
  return RIMS[kind] ? levelOf(RIMS[kind]) : null;
}

export function buildHeadwear(k: Kit, kind: string, color: string, crown: number, sideHair = crown) {
  if (kind === "none") return;
  const hs = k.head;
  const hh = k.hh;
  const dark = shade(color, 0.7);
  const centre = new Vector3(0, hh * 0.48, 0);
  const up = (q: Vector3) => q.clone().sub(centre).normalize();
  const on = crown + 0.012 * hh; // just over the hair

  // a dome: the head's surface lifted by `out`, down to `edge(phi)`, its rim rolled in
  const dome = (edge: (phi: number) => number, out: number, roll = 0.02 * hh) => {
    const rows = Math.max(4, k.seg.capRows);
    const cols = k.seg.radial + 8;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const u = r / rows;
      for (let c = 0; c <= cols; c++) {
        const phi = (c / cols) * Math.PI * 2;
        const q = hs.at(1 - u * (1 - edge(phi)), phi, out + roll * (1 - smooth(0.85, 1, u) * 1.6));
        pos.push(q.x, q.y, q.z);
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + cols + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  const level = (tf: number, tb: number) => (phi: number) => lerp(tb, tf, (Math.cos(phi) + 1) / 2);
  // a band all the way round the head, on its surface
  const loop = (t: (phi: number) => number, out: number, w: number, thick: number) => {
    const pts: Vector3[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * Math.PI * 2;
      pts.push(hs.at(t(phi), phi, out));
    }
    return sweepTube(pts, () => [w, thick], {
      segs: Math.max(24, k.seg.tube * 2),
      radial: Math.max(4, k.seg.tubeRadial - 2),
      up,
    });
  };

  switch (kind) {
    case "cap": {
      // a crown with a seam, and a curved brim over the brow
      const edge = level(...RIMS.cap);
      k.add("head", dome(edge, on), color);
      const fy = hs.at(edge(0), 0, on);
      const brim = new Shape();
      const W = hs.R(fy.y) * k.p.head.width * 0.95;
      brim.moveTo(-W, 0);
      brim.quadraticCurveTo(-W * 0.9, 0.42 * hh, 0, 0.46 * hh);
      brim.quadraticCurveTo(W * 0.9, 0.42 * hh, W, 0);
      brim.quadraticCurveTo(0, 0.12 * hh, -W, 0);
      const g = extrude(brim, 0.008 * hh, 0.006 * hh, k.seg.curve, k.seg.bevel);
      // lie it flat (its y becomes forward), tipped down a little, at the front of the crown
      g.rotateX(Math.PI / 2 + 0.36);
      // (its back edge tucked under the crown's rim, so no forehead shows between)
      k.add("head", g, color, { at: new Vector3(0, fy.y + 0.022 * hh, fy.z - 0.05 * hh) });
      if (k.seg.radial >= 16)
        k.add("head", ellipsoid(0.03 * hh, 0.02 * hh, 0.03 * hh, 10, 3), dark, { at: hs.at(1, 0, on + 0.004 * hh) });
      return;
    }
    case "beanie": {
      // a knit dome over the ears with a turned-up band
      const edge = level(...RIMS.beanie);
      k.add("head", dome(edge, on + 0.01 * hh, 0.01 * hh), color);
      k.add(
        "head",
        loop((phi) => edge(phi) + 0.05, on + 0.03 * hh, 0.065 * hh, 0.03 * hh),
        color,
        { keepNormals: true },
      );
      return;
    }
    case "beret": {
      // a soft cap fitted to the head, its flat top puffed out over one side
      k.add("head", dome(level(...RIMS.beret), on), color);
      const g = ellipsoid(0.4 * hh, 0.09 * hh, 0.38 * hh, k.seg.radial, k.seg.ring * 2);
      g.rotateZ(-0.24);
      k.add("head", g, color, { at: hs.at(0.95, Math.PI * 0.42, on + 0.015 * hh) });
      k.add("head", ellipsoid(0.02 * hh, 0.04 * hh, 0.02 * hh, 8, 3), color, { at: hs.at(1, 0.6, on + 0.08 * hh) });
      return;
    }
    case "bucket": {
      // a dome and a brim sloping down all round
      // (the crown comes down past where the brim joins, so nothing shows between)
      const edge = level(...RIMS.bucket);
      k.add("head", dome(edge, on + 0.012 * hh), color);
      const y = hs.at(0.62, 0, on).y;
      const r0 = hs.R(y) * Math.max(k.p.head.width, k.p.head.depth) + on;
      const prof: Prof[] = [
        [r0 * 0.98, y + 0.02 * hh],
        [r0 * 1.02, y - 0.004 * hh],
        [r0 * 1.36, y - 0.2 * hh],
        ...arc(r0 * 1.36, y - 0.21 * hh, 0.012 * hh, Math.PI * 0.5, -Math.PI * 0.5, k.seg.ring).map(
          ([x, yy]): Prof => [x, yy],
        ),
        [r0 * 1.0, y - 0.03 * hh],
      ];
      // (a sloped brim: down the outside, round its edge, back up underneath)
      k.add(
        "head",
        lathe(prof.reverse(), k.seg.radial).scale(
          k.p.head.width / Math.max(k.p.head.width, k.p.head.depth),
          1,
          k.p.head.depth / Math.max(k.p.head.width, k.p.head.depth),
        ),
        color,
      );
      return;
    }
    case "bandana": {
      // tied round the forehead, the knot and its two ends at the back
      k.add("head", loop(level(0.76, 0.5), on, 0.07 * hh, 0.018 * hh), color, { keepNormals: true });
      const knot = hs.at(0.5, Math.PI, on + 0.02 * hh);
      k.add("head", ellipsoid(0.05 * hh, 0.04 * hh, 0.04 * hh, 10, 3), color, { at: knot });
      for (const sx of [1, -1]) {
        const tail = [
          knot,
          knot.clone().add(new Vector3(sx * 0.06 * hh, -0.12 * hh, -0.04 * hh)),
          knot.clone().add(new Vector3(sx * 0.1 * hh, -0.24 * hh, -0.03 * hh)),
        ];
        k.add(
          "head",
          sweepTube(tail, (u) => [0.05 * hh * (1 - u * 0.3), 0.012 * hh], {
            segs: 8,
            radial: 4,
            up: () => new Vector3(0, 0, -1),
          }),
          color,
          { keepNormals: true },
        );
      }
      return;
    }
    case "headband":
    case "headphones": {
      // a band over the top from ear to ear (headphones: further off, with cups)
      const phones = kind === "headphones";
      const out = phones ? on + 0.04 * hh : on;
      // (over the ears it clears the hair there, which can stand much further out)
      const side = Math.max(out, sideHair + 0.02 * hh);
      const pts: Vector3[] = [];
      // the cups: on the hair over the ears, not buried in it
      const cupAt = (sx: number) => hs.at(0.44, sx * (Math.PI / 2), Math.max(out * 0.6, sideHair + 0.005 * hh));
      if (phones) {
        // a real headband: one smooth arc in the plane through the ears, from
        // the top of one cup up over the hair (clear of it) and down to the
        // other — rounded a little square, as they're made
        const c = cupAt(1);
        const top = hs.at(1, 0, out + 0.02 * hh).y;
        const x0 = Math.abs(c.x) + 0.012 * hh;
        const y0 = c.y + 0.07 * hh;
        const n = 2.6; // superellipse: 2 an ellipse, higher squarer
        const steps = Math.max(16, k.seg.tube);
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI - Math.PI / 2; // −π/2 one side … π/2 the other
          const sn = Math.sin(th);
          const cs = Math.cos(th);
          pts.push(
            new Vector3(x0 * Math.sign(sn) * Math.abs(sn) ** (2 / n), y0 + (top - y0) * Math.abs(cs) ** (2 / n), c.z),
          );
        }
      } else
        for (let i = 0; i <= 12; i++) {
          const f = (i / 12) * 2 - 1; // −1 right ear … 1 left ear
          const phi = f * (Math.PI / 2) + 0.25;
          pts.push(hs.at(lerp(1, 0.55, Math.abs(f) ** 2), phi, lerp(out, side, Math.abs(f) ** 3)));
        }
      k.add(
        "head",
        sweepTube(
          pts,
          (u) => {
            const end = Math.min(1, u / 0.04, (1 - u) / 0.04);
            return [(phones ? 0.04 : 0.05) * hh * Math.sqrt(Math.max(0.05, end)), 0.016 * hh];
          },
          { segs: Math.max(12, k.seg.tube), radial: Math.max(4, k.seg.tubeRadial - 2), up },
        ),
        phones ? dark : color,
        { keepNormals: true },
      );
      if (phones)
        for (const sx of [1, -1]) {
          const at = cupAt(sx);
          const cup = lathe(
            [
              [0, -0.04 * hh],
              ...arc(0.1 * hh, -0.02 * hh, 0.02 * hh, -Math.PI / 2, Math.PI / 2, k.seg.ring).map(
                ([x, y]): Prof => [x, y],
              ),
              [0, 0.0],
            ],
            k.seg.radial,
          );
          cup.rotateZ(sx * (Math.PI / 2));
          k.add("head", cup, color, { at });
        }
      return;
    }
  }
}
