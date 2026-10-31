import { Path, Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { band, extrude, mapVerts, subdivide, sweepTube } from "../shapes";

// Glasses — every AvatarLayers eyewear: glasses (soft rectangles), round,
// sunglasses (tinted lenses), aviators, cat-eyes, half-rims, snow goggles. The frames are outlines with holes bent
// onto the face a little in front of it; the arms run back to the ears.

// (round the head from one temple behind it to the other: the goggles' strap)
const lerpAng = (u: number) => (u * 2 - 1) * (Math.PI - 0.9) + Math.PI;

export function buildEyewear(k: Kit, kind: string, color: string) {
  if (kind === "none") return;
  const p = k.p;
  const hh = k.hh;
  const hs = k.head;
  const f = p.face;
  const e = f.eyeSize * hh;
  const ey = f.eyeY * hh + e * 0.1;
  const stand = 0.03 * hh; // how far in front of the face
  const avi = kind === "aviators";
  // (fine frames — wire for aviators)
  const fine = avi ? 0.3 : 0.6;
  const rim = (kind === "round" ? 0.16 * e : 0.2 * e) * fine;
  const half = (kind === "round" ? 1.05 : 1.3) * e; // a lens's half width
  // one lens outline round (cx, cy)
  const lens = (cx: number, grow: number): Path => {
    const s = new Path();
    if (avi) {
      // a teardrop: flat along the top, round and deep toward the nose's side below
      const w = 1.4 * e + grow;
      const t = 0.75 * e + grow;
      const d = 1.25 * e + grow;
      const sx = Math.sign(cx) || 1; // + towards the outer side
      s.moveTo(cx - sx * w, ey + t * 0.9);
      s.quadraticCurveTo(cx, ey + t * 1.15, cx + sx * w, ey + t * 0.8);
      s.bezierCurveTo(cx + sx * w * 1.1, ey - d * 0.4, cx + sx * w * 0.4, ey - d * 1.05, cx - sx * w * 0.25, ey - d);
      s.bezierCurveTo(cx - sx * w * 0.9, ey - d * 0.9, cx - sx * w * 1.05, ey - d * 0.1, cx - sx * w, ey + t * 0.9);
    } else if (kind === "cateye") {
      // flat below, the top swept up to a point at the outer corner
      const w = 1.35 * e + grow;
      const h = 0.75 * e + grow;
      const sx = Math.sign(cx) || 1;
      s.moveTo(cx - sx * w, ey + h * 0.7);
      s.quadraticCurveTo(cx, ey + h * 1.15, cx + sx * w * 1.12, ey + h * 1.45);
      s.quadraticCurveTo(cx + sx * w * 0.95, ey - h * 0.6, cx + sx * w * 0.4, ey - h);
      s.quadraticCurveTo(cx - sx * w * 0.6, ey - h * 1.05, cx - sx * w * 0.95, ey - h * 0.3);
      s.quadraticCurveTo(cx - sx * w * 1.02, ey + h * 0.2, cx - sx * w, ey + h * 0.7);
    } else if (kind === "round") s.absellipse(cx, ey, 1.05 * e + grow, 1.05 * e + grow, 0, Math.PI * 2, false, 0);
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
  if (kind === "goggles") {
    // snow goggles: one wide lens across both eyes in a thick frame, tinted, a strap round the head
    const gw = Math.abs(centres[0]) + 1.6 * e;
    const gh = 1.05 * e;
    const outline = (grow: number) => {
      const s = new Shape();
      const w = gw + grow;
      const h = gh + grow;
      s.moveTo(-w + h, ey + h);
      s.lineTo(w - h, ey + h);
      s.quadraticCurveTo(w, ey + h, w, ey);
      s.quadraticCurveTo(w, ey - h, w - h, ey - h);
      s.quadraticCurveTo(0, ey - h * 0.55, -w + h, ey - h);
      s.quadraticCurveTo(-w, ey - h, -w, ey);
      s.quadraticCurveTo(-w, ey + h, -w + h, ey + h);
      return s;
    };
    const frame = outline(0.28 * e);
    frame.holes.push(outline(0));
    k.add("head", onFace(frame, 0.02 * hh, stand * 1.3), color);
    k.add("head", onFace(outline(0.05 * e), 0.004 * hh, stand * 1.2), "#d98a3a", { ink: 0 });
    k.add(
      "head",
      onFace(
        band(
          [
            [-0.9 * e, ey + 0.1 * e],
            [-0.2 * e, ey + 0.7 * e],
          ],
          0.2 * e,
          6,
        ),
        0.002 * hh,
        stand * 1.3 + 0.001 * hh,
      ),
      "#f3e6c8",
      {
        ink: 0,
      },
    );
    const strap: Vector3[] = [];
    for (let i = 0; i <= 16; i++) strap.push(hs.at(ey / hh, lerpAng(i / 16), stand * 0.6));
    k.add(
      "head",
      sweepTube(strap, () => [0.06 * hh, 0.012 * hh], {
        segs: 24,
        radial: 4,
        up: (q) => new Vector3(q.x, 0, q.z).normalize(),
      }),
      "#2a2420",
      { keepNormals: true },
    );
    return;
  }
  // frames: a ring round each lens (half-rims: a bar along each lens's top only)
  const frames = centres.map((cx) => {
    if (kind === "halfrim") {
      const top: [number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        top.push([cx + (u * 2 - 1) * half, ey + 0.85 * e - 0.25 * e * (u * 2 - 1) ** 4]);
      }
      return band(top, 0.34 * e, 10);
    }
    const s = new Shape(lens(cx, rim).getPoints(k.seg.curve * 3));
    s.holes.push(lens(cx, 0));
    return s;
  });
  k.add("head", onFace(frames, 0.006 * hh, stand), color);
  if (kind === "sunglasses" || avi) {
    const fill = centres.map((cx) => new Shape(lens(cx, rim * 0.2).getPoints(k.seg.curve * 3)));
    // (tinted, not black — a glint across each lens)
    const tint = avi ? "#4a3f36" : "#1f2a33";
    k.add("head", onFace(fill, 0.003 * hh, stand - 0.002 * hh), tint, { ink: 0 });
    k.add(
      "head",
      onFace(
        centres.map((cx) =>
          band(
            [
              [cx - 0.7 * e, ey + 0.1 * e],
              [cx - 0.1 * e, ey + 0.65 * e],
            ],
            0.16 * e,
            6,
          ),
        ),
        0.002 * hh,
        stand + 0.001 * hh,
      ),
      "#c9d4dc",
      { ink: 0 },
    );
  }
  // the bridge (aviators: a double one, the brow bar over the nose too)
  if (avi)
    k.add(
      "head",
      onFace(
        band(
          [
            [-centres[0] + 0.2 * e, ey + 0.72 * e],
            [0, ey + 0.8 * e],
            [centres[0] - 0.2 * e, ey + 0.72 * e],
          ],
          rim * 1.1,
          8,
        ),
        0.004 * hh,
        stand,
      ),
      color,
    );
  const inner = centres[0] - half - rim * 0.5;
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
    const outer = side * (Math.abs(centres[0]) + (avi ? 1.4 * e : half) + rim * 0.5);
    const a = hs.front(outer, ey + e * 0.3);
    const start = a.p.clone().addScaledVector(a.n, stand);
    const mid = hs.at(ey / hh + 0.02, side * 1.25, stand * 0.7);
    const ear = hs.at(ey / hh - 0.02, side * 1.75, stand * 0.25);
    k.add(
      "head",
      sweepTube([start, mid, ear], () => [Math.max(rim, 0.06 * e) * 0.45, Math.max(rim, 0.06 * e) * 0.45], {
        segs: Math.max(6, k.seg.tube / 2),
        radial: Math.max(4, k.seg.tubeRadial - 2),
        up: (q) => new Vector3(q.x, 0, q.z).normalize(),
      }),
      color,
      { keepNormals: true },
    );
  }
}
