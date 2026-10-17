import { Path, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { band, extrude, mapVerts, subdivide, sweepTube } from "../shapes";

// Glasses — every AvatarLayers eyewear: glasses (soft rectangles), round,
// sunglasses (filled dark lenses). The frames are outlines with holes bent
// onto the face a little in front of it; the arms run back to the ears.

export function buildEyewear(k: Kit, kind: string, color: string) {
  if (kind === "none") return;
  const p = k.p;
  const hh = k.hh;
  const hs = k.head;
  const f = p.face;
  const e = f.eyeSize * hh;
  const ey = f.eyeY * hh + e * 0.1;
  const stand = 0.03 * hh; // how far in front of the face
  const rim = kind === "round" ? 0.16 * e : 0.2 * e;
  // one lens outline round (cx, cy)
  const lens = (cx: number, grow: number): Path => {
    const s = new Path();
    if (kind === "round") s.absellipse(cx, ey, 1.05 * e + grow, 1.05 * e + grow, 0, Math.PI * 2, false, 0);
    else {
      const w = (kind === "sunglasses" ? 1.45 : 1.3) * e + grow;
      const h = (kind === "sunglasses" ? 0.95 : 0.85) * e + grow;
      const r = Math.min(w, h) * 0.55;
      const top = kind === "sunglasses" ? h * 1.05 : h;
      s.moveTo(cx - w + r, ey + top);
      s.lineTo(cx + w - r, ey + top);
      s.quadraticCurveTo(cx + w, ey + top, cx + w, ey + top - r);
      s.lineTo(cx + w * (kind === "sunglasses" ? 0.92 : 1), ey - h + r);
      s.quadraticCurveTo(cx + w * 0.9, ey - h, cx + w - r, ey - h);
      s.lineTo(cx - w + r, ey - h);
      s.quadraticCurveTo(cx - w * 0.9, ey - h, cx - w * (kind === "sunglasses" ? 0.92 : 1), ey - h + r);
      s.lineTo(cx - w, ey + top - r);
      s.quadraticCurveTo(cx - w, ey + top, cx - w + r, ey + top);
    }
    return s;
  };
  const onFace = (shapes: Shape | Shape[], depth: number, lift: number) => {
    const g = subdivide(extrude(shapes, depth, depth * 0.5, k.seg.curve, Math.max(1, k.seg.bevel - 1)), k.bend);
    return mapVerts(g, (v) => {
      const s = hs.front(v.x, v.y);
      const z = v.z;
      v.copy(s.p).addScaledVector(s.n, z + lift);
    });
  };
  const centres = [1, -1].map((side) => side * (f.eyeGap * hh - 0.02 * e));
  // frames: a ring round each lens
  const frames = centres.map((cx) => {
    const s = new Shape(lens(cx, rim).getPoints(k.seg.curve * 3));
    s.holes.push(lens(cx, 0));
    return s;
  });
  k.add("head", onFace(frames, 0.006 * hh, stand), color);
  if (kind === "sunglasses") {
    const fill = centres.map((cx) => new Shape(lens(cx, rim * 0.2).getPoints(k.seg.curve * 3)));
    k.add("head", onFace(fill, 0.003 * hh, stand - 0.002 * hh), "#151515", { ink: 0 });
  }
  // the bridge
  const inner = centres[0] - (kind === "round" ? 1.05 : 1.3) * e - rim * 0.5;
  k.add(
    "head",
    onFace(
      band(
        [
          [-inner, ey + e * 0.25],
          [0, ey + e * 0.42],
          [inner, ey + e * 0.25],
        ],
        rim * 0.9,
        8,
      ),
      0.005 * hh,
      stand,
    ),
    color,
  );
  // the arms, back over the ears
  for (const side of [1, -1] as const) {
    const outer = side * (Math.abs(centres[0]) + (kind === "round" ? 1.05 : 1.3) * e + rim * 0.5);
    const a = hs.front(outer, ey + e * 0.3);
    const start = a.p.clone().addScaledVector(a.n, stand);
    const mid = hs.at(ey / hh + 0.02, side * 1.25, stand * 0.7);
    const ear = hs.at(ey / hh - 0.02, side * 1.75, stand * 0.25);
    k.add(
      "head",
      sweepTube([start, mid, ear], () => [rim * 0.45, rim * 0.45], {
        segs: Math.max(6, k.seg.tube / 2),
        radial: Math.max(4, k.seg.tubeRadial - 2),
        up: (q) => new Vector3(q.x, 0, q.z).normalize(),
      }),
      color,
      { keepNormals: true },
    );
  }
}
