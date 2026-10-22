import type { G, V } from "./campus";
import { face, SNOW } from "./snow3d";

// The Grounds' landmarks (docs/plan/33-the-look.md, phase 5): beams between any two points —
// a bridge's truss and rails, a water tower's legs and braces — and what's built of them.

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A square beam from p to q, `w` thick (its four sides; the ends left open). `snow`: a strip on
 *  its top when it's near level. */
export function beam(g: G, p: V, q: V, w: number, col: number, snow = false) {
  const d = norm(sub(q, p));
  const up: V = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const s = norm(cross(d, up));
  const u = norm(cross(s, d));
  const h = w / 2;
  const c = (o: V, a: number, b: number): V => add(add(o, s, a * h), u, b * h);
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  g.color(col);
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = corners[i];
    const [a1, b1] = corners[(i + 1) % 4];
    const out = add(add([0, 0, 0], s, a0 + a1), u, b0 + b1);
    face(g, c(p, a0, b0), c(p, a1, b1), c(q, a1, b1), c(q, a0, b0), out);
  }
  if (snow && Math.abs(d[1]) < 0.35) {
    g.color(SNOW);
    const t = h + 0.05;
    face(
      g,
      add(c(p, -1, 1), u, 0.01),
      add(c(p, 1, 1), u, 0.01),
      add(c(q, 1, 1), u, t * 0.6),
      add(c(q, -1, 1), u, t * 0.6),
    );
  }
}

/** A through truss along a deck from a to b (its two sides `half` out from the line): bottom
 *  and top chords, verticals every `bay`, diagonals between them (a Warren truss), struts across
 *  the top, a guard rail inside; snow along every chord. */
export function truss(g: G, a: V, b: V, half: number, height: number, bay: number, col: number) {
  const d = sub(b, a);
  const len = Math.hypot(d[0], d[2]);
  const n = Math.max(2, Math.round(len / bay));
  const side: V = norm([-d[2], 0, d[0]]);
  const at = (t: number, s: number, y: number): V => {
    const p = add(add(a, d, t), side, s * half);
    return [p[0], p[1] + y, p[2]];
  };
  for (const s of [1, -1]) {
    beam(g, at(0, s, 0), at(1, s, 0), 0.4, col, true);
    // the top chord stops a bay short of each end (its ends slope down)
    beam(g, at(0, s, 0), at(1 / n, s, height), 0.34, col);
    beam(g, at(1 / n, s, height), at(1 - 1 / n, s, height), 0.36, col, true);
    beam(g, at(1 - 1 / n, s, height), at(1, s, 0), 0.34, col);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      beam(g, at(t, s, 0), at(t, s, height), 0.22, col);
      // diagonals, alternating
      if (k < n - 1)
        beam(
          g,
          k % 2 ? at(t, s, 0) : at(t, s, height),
          k % 2 ? at(t + 1 / n, s, height) : at(t + 1 / n, s, 0),
          0.16,
          col,
        );
    }
    // the guard rail inside, at a car's bumper
    beam(g, add(at(0, s, 0.75), side, -s * 0.35), add(at(1, s, 0.75), side, -s * 0.35), 0.14, 0xb9bec4, true);
  }
  // struts across the top, between the verticals
  for (let k = 1; k < n; k++) {
    const t = k / n;
    beam(g, at(t, 1, height), at(t, -1, height), 0.2, col, true);
  }
}

/** A railing from a to b: posts every `step`, a top rail and a middle one, snow on the top. */
export function railing(g: G, a: V, b: V, h: number, step: number, col: number) {
  const d = sub(b, a);
  const len = Math.hypot(...d);
  const n = Math.max(1, Math.round(len / step));
  for (let k = 0; k <= n; k++) {
    const p = add(a, d, k / n);
    beam(g, p, add(p, [0, 1, 0], h + 0.08), 0.12, col);
  }
  beam(g, add(a, [0, 1, 0], h), add(b, [0, 1, 0], h), 0.1, col, true);
  beam(g, add(a, [0, 1, 0], h * 0.5), add(b, [0, 1, 0], h * 0.5), 0.07, col);
}
