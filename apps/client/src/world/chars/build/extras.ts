import { Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, extrude, lathe, type Prof, sweepTube } from "../shapes";
import { type Body, lerp } from "./body";
import { chestBand, chestDot, shade } from "./tops";

// One more thing — every AvatarLayers extra: walkman, scarf, earrings,
// necklace, backpack, watch.

/** A rounded box (w × h, d deep) facing +z. */
function box(w: number, h: number, d: number, r: number, k: Kit) {
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const bev = Math.min(r, d * 0.4);
  const g = extrude(s, Math.max(1e-4, d - 2 * bev), bev, k.seg.curve, k.seg.bevel);
  g.translate(0, 0, -d / 2);
  return g;
}

export function buildExtra(k: Kit, b: Body, kind: string, color: string, o: { earsShow: boolean; skin: string }) {
  if (kind === "none") return;
  const hh = b.hh;
  const T = b.T;
  const R = k.seg.radial;
  const toSpine = (g: ReturnType<typeof box>) => g.translate(0, -b.spineY, 0);
  switch (kind) {
    case "walkman": {
      // on the waistband at the right hip, its lead up to the collar
      const y = 0.4 * T;
      const x = -b.trunk.r(y) * 0.62;
      const at = b.surf(x, y, 1.08);
      const n = b.surfNormal(x, y, 1.08);
      const g = box(0.13 * hh, 0.17 * hh, 0.05 * hh, 0.02 * hh, k);
      g.lookAt(n);
      k.add("hips", g, color, { at: at.addScaledVector(n, 0.02 * hh) });
      const lead: Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        lead.push(b.surf(lerp(x * 0.9, -b.hh * 0.05, u), lerp(y + 0.08 * hh, 0.95 * T, u), 1.07));
      }
      k.add("spine", toSpine(sweepTube(lead, () => [0.005 * hh, 0.005 * hh], { segs: 12, radial: 4 })), "#151515", {
        keepNormals: true,
      });
      return;
    }
    case "scarf": {
      // wound round the neck, the two ends hanging down the front
      // a fat round roll on the neck (it rides the neck), the ends hanging in front
      const nr = k.p.neck.r * hh;
      const ring = lathe(arc(nr * 1.75, 0.04 * hh, 0.09 * hh, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R);
      k.add("neck", ring, color);
      const x0 = nr * 0.6;
      k.add(
        "spine",
        toSpine(
          chestBand(
            b,
            [
              [x0, T * 0.96],
              [x0 * 1.2, T * 0.76],
              [x0 * 1.1, T * 0.52],
            ],
            0.13 * hh,
            1.1,
          ),
        ),
        color,
      );
      k.add(
        "spine",
        toSpine(
          chestBand(
            b,
            [
              [x0 * 0.2, T * 0.95],
              [-x0 * 0.4, T * 0.78],
              [-x0 * 0.6, T * 0.62],
            ],
            0.12 * hh,
            1.13,
          ),
        ),
        shade(color, 0.88),
      );
      return;
    }
    case "earrings": {
      if (!o.earsShow) return;
      const hs = k.head;
      const f = k.p.face;
      const y = (f.eyeY - 0.04) * hh - f.ears * hh * 0.55;
      for (const side of [1, -1]) {
        const x = hs.R(y) * k.p.head.width * 0.97;
        const hoop = lathe(
          arc(0.05 * hh, 0, 0.012 * hh, -Math.PI / 2, Math.PI * 1.5, Math.max(2, k.seg.ring)),
          Math.max(8, R / 2),
        );
        hoop.rotateX(Math.PI / 2);
        hoop.rotateY(Math.PI / 2);
        k.add("head", hoop, color, { at: new Vector3(side * (x + 0.012 * hh), y - 0.05 * hh, -0.01 * hh) });
      }
      return;
    }
    case "necklace": {
      // a fine chain lying round the base of the neck, dipping in front, a pendant
      const pts: Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const phi = (i / 24) * Math.PI * 2;
        const front = Math.max(0, Math.cos(phi));
        const y = T * (0.975 - 0.1 * front ** 2);
        const x = Math.sin(phi) * b.trunk.r(y) * 1.05;
        pts.push(b.surf(x, y, 1.05, Math.cos(phi) >= 0 ? 1 : -1));
      }
      k.add("spine", toSpine(sweepTube(pts, () => [0.006 * hh, 0.006 * hh], { segs: 32, radial: 4 })), color, {
        keepNormals: true,
      });
      k.add("spine", toSpine(chestDot(b, 0, T * 0.86, 0.026 * hh, 1.06)), color);
      return;
    }
    case "backpack": {
      // a pack on the back, two straps over the shoulders
      const y = 0.62 * T;
      const at = b.surf(0, y, 1.08, -1);
      const g = box(0.6 * hh, 0.75 * hh, 0.22 * hh, 0.08 * hh, k);
      k.add("spine", toSpine(g.translate(at.x, at.y, at.z - 0.11 * hh)), color);
      const flap = box(0.5 * hh, 0.26 * hh, 0.05 * hh, 0.06 * hh, k);
      k.add("spine", toSpine(flap.translate(at.x, at.y + 0.2 * hh, at.z - 0.24 * hh)), shade(color, 0.85));
      for (const sx of [1, -1]) {
        const x = sx * b.trunk.r(0.85 * T) * 0.45;
        let yTop = 0.85 * T;
        while (yTop < T && b.trunk.r(yTop) > Math.abs(x)) yTop += T * 0.01;
        const strap = [
          b.surf(x * 1.1, 0.75 * T, 1.1, -1),
          b.surf(x, 0.9 * T, 1.08, -1),
          new Vector3(x, yTop + 0.02 * hh, 0),
          b.surf(x, 0.88 * T, 1.08, 1),
          b.surf(x * 1.15, 0.55 * T, 1.07, 1),
        ];
        k.add(
          "spine",
          toSpine(
            sweepTube(strap, () => [0.05 * hh, 0.014 * hh], {
              segs: k.seg.tube,
              radial: Math.max(4, k.seg.tubeRadial - 2),
              up: (q) => new Vector3(q.x, 0, q.z).normalize(),
            }),
          ),
          shade(color, 0.75),
          { keepNormals: true },
        );
      }
      return;
    }
    case "watch": {
      // on the left wrist: a strap round it and a round face on the outside
      const y = -b.fore + b.wR * 1.4;
      const strap = lathe(arc(b.wR * 1.08, y, b.wR * 0.32, -Math.PI / 2, Math.PI * 1.5, Math.max(2, k.seg.ring)), R);
      k.add("elbowL", strap, shade(color, 0.7));
      const face: Prof[] = [
        [0, -0.02 * hh],
        ...arc(0.04 * hh, -0.01 * hh, 0.01 * hh, -Math.PI / 2, Math.PI / 2, Math.max(2, k.seg.ring)),
        [0, 0],
      ];
      const g = lathe(face, Math.max(10, R / 2));
      g.rotateZ(-Math.PI / 2);
      k.add("elbowL", g, color, { at: new Vector3(b.wR * 1.25, y, 0) });
      return;
    }
  }
}
