import type { AvatarLayers } from "@yutopia/shared";
import { type BufferGeometry, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, extrude, flipWinding, lathe, mapVerts, oval, type Prof, sweepTube } from "../shapes";
import { type Body, lerp, smooth } from "./body";
import { shade } from "./tops";

// Shoes — every AvatarLayers shoe: sneakers, hightops, boots, loafers,
// sandals. Each is its side profile extruded across the foot's width with a
// round bevel, over a slightly wider sole; drawn on the ankle joints.

interface Cut {
  top: number; // how high the upper comes, × the foot's height
  sole: number; // sole thickness × the foot's sole
  soleColor: (c: string) => string;
}
const CUTS: Record<string, Cut> = {
  sneakers: { top: 1, sole: 1, soleColor: () => "#f4efe6" },
  hightops: { top: 1.75, sole: 1.1, soleColor: () => "#f4efe6" },
  boots: { top: 2.3, sole: 1.5, soleColor: (c) => shade(c, 0.45) },
  loafers: { top: 0.66, sole: 0.8, soleColor: (c) => shade(c, 0.6) },
  sandals: { top: 0, sole: 0.9, soleColor: (c) => c },
};

export function buildShoes(k: Kit, b: Body, a: AvatarLayers) {
  const p = k.p;
  const hh = b.hh;
  const cut = CUTS[a.shoes] ?? CUTS.sneakers;
  const fl = p.foot.len * hh;
  const fh = p.foot.height * hh;
  const sole = p.foot.sole * hh * cut.sole;
  const fw = p.foot.width * hh;
  const bev = Math.min(p.bevel * hh * 0.8, fw * 0.3);
  const y0 = -b.ankleY;
  const c = a.shoesColor;
  const fine = k.seg.radial >= 16;
  // (`foot.shape`: a shoe's own shape, not a slab — round at the toe seen from above, the heel
  // drawn in, the top narrower than the sole; across the foot, at each point along it and up it)
  const sh = p.foot.shape;
  const shoe = (g: BufferGeometry) =>
    sh > 0
      ? mapVerts(g, (v) => {
          const t = Math.max(0, v.z - 0.4 * fl) / (0.38 * fl);
          const toe = Math.sqrt(Math.max(0.12, 1 - t * t));
          const heel = lerp(1, 0.84, smooth(-0.12 * fl, -0.34 * fl, v.z));
          const top = lerp(1, 0.72, smooth(y0 + sole, y0 + 0.8 * fh, v.y));
          v.x *= lerp(1, toe * heel * top, sh);
        })
      : g;

  // the upper's side profile (toe forward, +x before it's turned): up to `top`
  const upper = (top: number, toe = 1) => {
    const s = new Shape();
    const h = Math.max(fh * 0.55, fh * top);
    s.moveTo(-0.26 * fl, y0 + sole * 0.6);
    s.lineTo(0.5 * fl, y0 + sole * 0.6);
    s.quadraticCurveTo(0.7 * fl, y0 + sole * 0.6, 0.7 * fl, y0 + sole + 0.3 * fh * toe * (1 + 0.35 * sh));
    s.quadraticCurveTo(0.68 * fl, y0 + lerp(0.66, 0.76, sh) * fh, 0.34 * fl, y0 + Math.min(h, 0.74 * fh));
    if (h > fh) {
      // up the shin (high-tops, boots)
      s.quadraticCurveTo(0.14 * fl, y0 + 0.82 * fh, 0.12 * fl, y0 + fh);
      s.lineTo(0.12 * fl, y0 + h);
      s.lineTo(-0.22 * fl, y0 + h);
      s.lineTo(-0.24 * fl, y0 + fh);
    } else {
      s.quadraticCurveTo(0.14 * fl, y0 + 0.8 * h, 0.06 * fl, y0 + h);
      s.lineTo(-0.2 * fl, y0 + h);
    }
    s.quadraticCurveTo(-0.32 * fl, y0 + Math.min(h, fh) * 0.9, -0.3 * fl, y0 + sole + 0.15 * fh);
    s.quadraticCurveTo(-0.3 * fl, y0 + sole * 0.6, -0.26 * fl, y0 + sole * 0.6);
    return s;
  };
  const soleShape = (heel: boolean) => {
    const s = new Shape();
    const sb = sole * 0.45;
    s.moveTo(-0.3 * fl + sb, y0 + sb * 0.6);
    if (heel) {
      // a block heel, then the sole thins under the arch
      s.lineTo(-0.08 * fl, y0 + sb * 0.6);
      s.quadraticCurveTo(0.02 * fl, y0 + sole * 0.5, 0.14 * fl, y0 + sole * 0.45);
      s.lineTo(0.66 * fl, y0 + sole * 0.45);
    } else s.lineTo(0.66 * fl, y0 + sb * 0.6);
    s.quadraticCurveTo(0.76 * fl, y0 + sb * 0.6, 0.76 * fl, y0 + sole * 0.55);
    s.quadraticCurveTo(0.76 * fl, y0 + sole - sb * 0.6, 0.66 * fl, y0 + sole - sb * 0.6);
    s.lineTo(-0.3 * fl + sb, y0 + sole - sb * 0.6);
    s.quadraticCurveTo(-0.34 * fl, y0 + sole * 0.5, -0.3 * fl + sb, y0 + sb * 0.6);
    return s;
  };
  // across the foot (+x toe → +z forward), centred on the ankle
  const across = (shape: Shape | Shape[], width: number, bevel: number): BufferGeometry => {
    const d = Math.max(1e-4, width - 2 * bevel);
    const g = extrude(shape, d, bevel, k.seg.curve, k.seg.bevel + 1);
    g.translate(0, 0, -(d + 2 * bevel) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  };
  // a flat outline on the outside face of the shoe (x along the foot, y up)
  const onSide = (shape: Shape, sx: number, width: number) => {
    const g = extrude(shape, 0.003 * hh, 0.002 * hh, 6, 1);
    mapVerts(g, (v) => v.set(sx * (width * 0.5 + v.z), v.y, v.x));
    shoe(g);
    // (on the left foot that mapping is a mirror: turn the faces back out)
    return sx > 0 ? flipWinding(g) : g;
  };

  // the toe's joint at the ball of the foot, on the sole: the shoe's front rides it, blended over
  // the ball (a boot's stiffer: over a longer stretch)
  const ball = 0.42 * fl;
  const give = a.shoes === "boots" ? 0.16 * fl : 0.1 * fl;
  const first = k.parts.length;
  for (const side of ["L", "R"] as const) k.joint(`toe${side}`, 0, y0 + sole * 0.5, ball);

  for (const side of ["L", "R"] as const) {
    const sx = side === "L" ? 1 : -1;
    const J = `ankle${side}` as const;
    const soleG = shoe(across(soleShape(a.shoes === "boots"), fw * 1.06, sole * 0.27));
    if (a.shoes === "sandals") {
      // a bare foot on the sole, two straps over it
      k.add(J, across(upper(0.55, 0.7), fw * 0.9, bev), shade(a.skin, 1));
      k.add(J, soleG, cut.soleColor(c));
      for (const at of [0.42, 0.05]) {
        const x = at * fl;
        const yTop = y0 + fh * (at > 0.2 ? 0.5 : 0.62) + sole * 0.5;
        const strap = [
          new Vector3(-fw * 0.5, y0 + sole * 0.9, x),
          new Vector3(-fw * 0.32, yTop, x),
          new Vector3(fw * 0.32, yTop, x),
          new Vector3(fw * 0.5, y0 + sole * 0.9, x),
        ];
        k.add(
          J,
          sweepTube(strap, () => [0.03 * hh, 0.01 * hh], {
            segs: k.seg.tube,
            radial: Math.max(4, k.seg.tubeRadial - 2),
            up: () => new Vector3(0, 1, 0),
          }),
          c,
          {
            keepNormals: true,
          },
        );
      }
      continue;
    }
    k.add(J, shoe(across(upper(Math.min(1, cut.top)), fw, bev)), c);
    k.add(J, soleG, cut.soleColor(c));
    if (cut.top > 1) {
      // high-tops and boots: a round shaft up the shin (under trouser legs)
      const top = y0 + fh * cut.top;
      const r0 = b.ankleR * (a.shoes === "boots" ? 1.36 : 1.3);
      const r1 = r0 * (a.shoes === "boots" ? 1.08 : 1.02);
      const prof: Prof[] = [
        [0, y0 + fh * 0.5],
        [r0 * 0.9, y0 + fh * 0.52],
        [r0, y0 + fh * 0.7],
        [r1, top - r0 * 0.25],
        ...arc(r1 - r0 * 0.12, top - r0 * 0.12, r0 * 0.12, 0, Math.PI / 2, Math.max(2, k.seg.ring)).map(
          ([x, y]): Prof => [x, y],
        ),
        [0, top],
      ];
      k.add(J, lathe(prof, k.seg.radial).translate(0, 0, -0.05 * fl), c);
    }
    if (!fine) continue;
    switch (a.shoes) {
      case "sneakers": {
        // a swoosh of a stripe on the outside
        const st = new Shape();
        st.moveTo(-0.2 * fl, y0 + sole + 0.22 * fh);
        st.quadraticCurveTo(0.15 * fl, y0 + sole + 0.12 * fh, 0.42 * fl, y0 + sole + 0.38 * fh);
        st.quadraticCurveTo(0.12 * fl, y0 + sole + 0.24 * fh, -0.2 * fl, y0 + sole + 0.34 * fh);
        st.closePath();
        k.add(J, onSide(st, sx, fw), shade(c, 1.4), { ink: 0 });
        // laces: three short lines across the instep
        for (const t of [0.12, 0.22, 0.32]) {
          const x = t * fl;
          const y = y0 + fh * (0.84 - t * 0.6);
          k.crease(
            J,
            sweepTube([new Vector3(-fw * 0.22, y, x), new Vector3(fw * 0.22, y, x)], () => [1e-4, 1e-4], {
              segs: 2,
              radial: 4,
            }),
          );
        }
        break;
      }
      case "hightops": {
        // the round ankle patch
        k.add(J, onSide(oval(-0.05 * fl, y0 + fh * 1.2, fh * 0.17, fh * 0.17), sx, b.ankleR * 2.75), shade(c, 1.35), {
          ink: 0,
        });
        break;
      }
      case "boots": {
        // the shaft's top band
        k.crease(
          J,
          sweepTube(
            [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
              const ang = (i / 8) * Math.PI * 2;
              const r = b.ankleR * 1.36 * 1.08 + 1e-4;
              return new Vector3(Math.sin(ang) * r, y0 + fh * cut.top * 0.9, -0.05 * fl + Math.cos(ang) * r);
            }),
            () => [1e-4, 1e-4],
            { segs: 16, radial: 4 },
          ),
        );
        break;
      }
      case "loafers": {
        // the strap across the vamp
        const y = y0 + fh * 0.58;
        k.add(
          J,
          sweepTube(
            [
              new Vector3(-fw * 0.5, y - fh * 0.06, 0.3 * fl),
              new Vector3(0, y + fh * 0.03, 0.33 * fl),
              new Vector3(fw * 0.5, y - fh * 0.06, 0.3 * fl),
            ],
            () => [0.025 * hh, 0.006 * hh],
            { segs: 8, radial: 4, up: () => new Vector3(0, 1, 0.4).normalize() },
          ),
          shade(c, 0.8),
          { keepNormals: true },
        );
        break;
      }
    }
  }
  // (everything on the feet from here: its front on the toe)
  for (const part of k.parts.slice(first)) {
    if (part.skin || !part.joint.startsWith("ankle")) continue;
    const toe = part.joint === "ankleL" ? "toeL" : "toeR";
    part.skin = (_x, _y, z) => [toe, smooth(ball - give, ball + give, z)];
  }
}
