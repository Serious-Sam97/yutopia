import {
  type BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Float32BufferAttribute,
  BufferGeometry as Geo,
  LatheGeometry,
  Shape,
  SplineCurve,
  Vector2,
  Vector3,
} from "three";

// The geometry kit the 3D people are made of (docs/plan/17-chars-3d.md): no
// raw boxes or coarse cylinders — every part is a lathe of a smooth profile,
// a bevelled extrusion of a curved outline, or a tube swept along a spline,
// and every one ends with welded, angle-weighted normals (no seams, no facets).

/** A profile point for a lathe: [radius, height]. */
export type Prof = [number, number];

/** Edit `geo`'s positions in place (then call `smoothNormals`). */
export function mapVerts(g: BufferGeometry, fn: (v: Vector3, i: number) => void): BufferGeometry {
  const pos = g.getAttribute("position");
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v, i);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  return g;
}

// Smooth normals across everything that meets at one point: the lathe's seam
// and poles, an extrusion's caps into its bevel. Each face counts by its
// corner angle, so long thin triangles (an extrusion's cap fan) don't skew it.
export function smoothNormals(g: BufferGeometry, eps = 1e-5): BufferGeometry {
  const pos = g.getAttribute("position");
  const n = pos.count;
  const weld = new Uint32Array(n);
  const keys = new Map<string, number>();
  const inv = 1 / eps;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let w = keys.get(k);
    if (w === undefined) {
      w = keys.size;
      keys.set(k, w);
    }
    weld[i] = w;
  }
  const acc = new Float64Array(keys.size * 3);
  const idx = g.getIndex();
  const tris = (idx ? idx.count : n) / 3;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const fn = new Vector3();
  const angle = (p: Vector3, q: Vector3, r: Vector3) => {
    e1.subVectors(q, p);
    e2.subVectors(r, p);
    const l = e1.length() * e2.length();
    return l > 0 ? Math.acos(Math.min(1, Math.max(-1, e1.dot(e2) / l))) : 0;
  };
  const add = (w: number, k: number) => {
    acc[w * 3] += fn.x * k;
    acc[w * 3 + 1] += fn.y * k;
    acc[w * 3 + 2] += fn.z * k;
  };
  for (let t = 0; t < tris; t++) {
    const ia = idx ? idx.getX(t * 3) : t * 3;
    const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    fn.subVectors(c, b).cross(e1.subVectors(a, b));
    const len = fn.length();
    if (len < 1e-14) continue;
    fn.divideScalar(len);
    add(weld[ia], angle(a, b, c));
    add(weld[ib], angle(b, c, a));
    add(weld[ic], angle(c, a, b));
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const w = weld[i] * 3;
    const l = Math.hypot(acc[w], acc[w + 1], acc[w + 2]) || 1;
    out[i * 3] = acc[w] / l;
    out[i * 3 + 1] = acc[w + 1] / l;
    out[i * 3 + 2] = acc[w + 2] / l;
  }
  g.setAttribute("normal", new Float32BufferAttribute(out, 3));
  return g;
}

/** A dense, evenly spaced run through `pts` (Catmull-Rom). */
export function spline2(pts: Prof[], samples: number): Vector2[] {
  const curve = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y)));
  return curve.getSpacedPoints(samples).map((p) => new Vector2(Math.max(0, p.x), p.y));
}

/** A quarter or half circle of profile points, from angle a0 to a1 (radians, 0 = +r). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Prof[] {
  const out: Prof[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r]);
  }
  return out;
}

/** Turn a profile (bottom to top) round the y axis; phi 0 faces +z. */
export function lathe(
  points: Vector2[] | Prof[],
  radial: number,
  phiStart = 0,
  phiLength = Math.PI * 2,
): BufferGeometry {
  const pts = points.map((p) => (Array.isArray(p) ? new Vector2(Math.max(0, p[0]), p[1]) : p));
  return new LatheGeometry(pts, radial, phiStart, phiLength);
}

// A limb, a neck or a finger: two round ends (radius rTop at y 0, rBot at
// y −len) joined by a smooth waist with a little swell — the joint centres
// are the sphere centres, so two limbs meeting at a joint stay seamless in
// any pose.
export function capsule(
  len: number,
  rTop: number,
  rBot: number,
  swell: number,
  radial: number,
  rings = 14,
): BufferGeometry {
  const pts: Prof[] = [];
  pts.push(...arc(0, -len, rBot, -Math.PI / 2, 0, rings));
  const mid = Math.max(6, rings);
  for (let i = 1; i < mid; i++) {
    const u = i / mid;
    const r = rBot + (rTop - rBot) * u + Math.sin(Math.PI * u) * swell;
    pts.push([r, -len + len * u]);
  }
  pts.push(...arc(0, 0, rTop, 0, Math.PI / 2, rings));
  return lathe(pts, radial);
}

/** A closed ellipsoid as a lathe (radii x, y, z). */
export function ellipsoid(rx: number, ry: number, rz: number, radial: number, rings = 24): BufferGeometry {
  const g = lathe(arc(0, 0, 1, -Math.PI / 2, Math.PI / 2, rings), radial);
  g.scale(rx, ry, rz);
  return g;
}

// A tube swept along a Catmull-Rom spline through `ctrl`, its cross-section
// an ellipse `radius(u)` → [width, thickness] (u 0..1 along it). The width
// lies across `up(p)` (e.g. a head's outward normal, so a lock of hair lies
// flat on the head); radius 0 at an end closes it.
export function sweepTube(
  ctrl: Vector3[],
  radius: (u: number) => [number, number],
  o: { segs?: number; radial?: number; up?: (p: Vector3) => Vector3; tension?: number } = {},
): BufferGeometry {
  const curve = new CatmullRomCurve3(ctrl, false, "centripetal", o.tension ?? 0.5);
  const S = o.segs ?? 48;
  const R = o.radial ?? 12;
  const pos: number[] = [];
  const idx: number[] = [];
  const nrm = new Vector3();
  const bin = new Vector3();
  const prev = new Vector3(0, 1, 0);
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const ref = o.up ? o.up(p) : prev;
    nrm.copy(ref).addScaledVector(t, -ref.dot(t));
    if (nrm.lengthSq() < 1e-10) nrm.set(t.y, -t.x, 0).add(new Vector3(0, 0, t.x === 0 ? 1 : 0));
    nrm.normalize();
    prev.copy(nrm);
    bin.crossVectors(t, nrm);
    const [rw, rh] = radius(u);
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2;
      pos.push(
        p.x + nrm.x * Math.cos(a) * rh + bin.x * Math.sin(a) * rw,
        p.y + nrm.y * Math.cos(a) * rh + bin.y * Math.sin(a) * rw,
        p.z + nrm.z * Math.cos(a) * rh + bin.z * Math.sin(a) * rw,
      );
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + j;
      const d = (i + 1) * R + ((j + 1) % R);
      idx.push(a, b, c, b, d, c);
    }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return smoothNormals(g);
}

// A thick stroke as a closed outline (round caps), to extrude: brows, lashes,
// closed eyes, a smile. `width(u)` lets it taper.
export function band(pts: [number, number][], width: number | ((u: number) => number), samples = 32): Shape {
  const curve = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y)));
  const w = typeof width === "number" ? () => width : width;
  const left: Vector2[] = [];
  const right: Vector2[] = [];
  const P: Vector2[] = [];
  const T: Vector2[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const n = new Vector2(-t.y, t.x);
    const h = Math.max(1e-5, w(u) / 2);
    P.push(p);
    T.push(t);
    left.push(p.clone().addScaledVector(n, h));
    right.push(p.clone().addScaledVector(n, -h));
  }
  const s = new Shape();
  s.moveTo(left[0].x, left[0].y);
  for (const p of left.slice(1)) s.lineTo(p.x, p.y);
  const capSteps = Math.max(3, Math.round(samples / 3));
  const cap = (c: Vector2, from: Vector2, h: number) => {
    const a0 = Math.atan2(from.y - c.y, from.x - c.x);
    for (let k = 1; k < capSteps; k++) {
      const a = a0 - (Math.PI * k) / capSteps;
      s.lineTo(c.x + Math.cos(a) * h, c.y + Math.sin(a) * h);
    }
  };
  cap(P[samples], left[samples], Math.max(1e-5, w(1) / 2));
  for (let i = samples; i >= 0; i--) s.lineTo(right[i].x, right[i].y);
  cap(P[0], right[0], Math.max(1e-5, w(0) / 2));
  s.closePath();
  return s;
}

/** Only the triangles of `g` that face +z (an extrusion seen only from the front: its back and
 *  walls dropped, its front's bevel kept, so it looks the same). */
export function frontOnly(g: BufferGeometry): BufferGeometry {
  const src = g.getIndex() ? g.toNonIndexed() : g;
  const p = src.getAttribute("position");
  const out: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (nz > 1e-12) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  if (src !== g) src.dispose();
  g.dispose();
  const f = new Geo();
  f.setAttribute("position", new Float32BufferAttribute(out, 3));
  return f;
}

/** A flat strip along a spline (x, y; z 0, facing +z), `width(u)` across: a brush stroke with no
 *  thickness, two triangles a step (an inked fold, seen only from the front). */
export function ribbon(pts: [number, number][], width: (u: number) => number, samples = 12): BufferGeometry {
  const curve = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y)));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const h = Math.max(1e-6, width(u) / 2);
    pos.push(p.x - t.y * h, p.y + t.x * h, 0, p.x + t.y * h, p.y - t.x * h, 0);
    if (i < samples) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** An ellipse outline. */
export function oval(cx: number, cy: number, rx: number, ry: number, rot = 0): Shape {
  const s = new Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, rot);
  return s;
}

// An extrusion of `shape` with a rounded bevel, its back at z 0 — the bevel
// grows the outline by `bevel`, so draw shapes that much smaller.
export function extrude(
  shape: Shape | Shape[],
  depth: number,
  bevel: number,
  curve = 24,
  bevelSegs = 5,
): BufferGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, depth),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevelSegs,
    curveSegments: curve,
  });
  g.translate(0, 0, bevel);
  return g;
}

// ── a little value noise (the clay finish's thumb-pressed surface) ──────────
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

/** Push every point out along its normal by a soft noise (world-space `seed` offset keeps parts unlike). */
export function lumpy(g: BufferGeometry, amp: number, freq: number, seed = 0): BufferGeometry {
  if (amp <= 0) return g;
  smoothNormals(g);
  const nrm = g.getAttribute("normal");
  const n = new Vector3();
  mapVerts(g, (v, i) => {
    n.fromBufferAttribute(nrm, i);
    const k =
      noise3(v.x * freq + seed, v.y * freq, v.z * freq) * 0.7 +
      noise3(v.x * freq * 2.7, v.y * freq * 2.7 + seed, v.z * freq * 2.7) * 0.3;
    v.addScaledVector(n, (k - 0.5) * 2 * amp);
  });
  return smoothNormals(g);
}

/** Turn every triangle the other way round (after a mirroring map). */
export function flipWinding(g: BufferGeometry): BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
    idx.needsUpdate = true;
    return g;
  }
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    for (let i = 0; i < a.count; i += 3)
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.getComponent(i + 1, c);
        a.setComponent(i + 1, c, a.getComponent(i + 2, c));
        a.setComponent(i + 2, c, t);
      }
    a.needsUpdate = true;
  }
  return g;
}

// Split long edges until none is longer than `maxEdge`: a flat outline bent
// onto a curved surface (a pocket on a chest) then follows the curve instead
// of cutting through it. The decision is made per edge (two triangles sharing
// an edge both split it, at the same midpoint), so nothing cracks; a triangle
// with one, two or three long edges becomes two, three or four, so long thin
// triangles (an outline's fan) only gain what they need. Keeps positions only
// (normals are welded after).
export function subdivide(g: BufferGeometry, maxEdge: number, maxPasses = 8): BufferGeometry {
  let geo = g.getIndex() ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  type P = [number, number, number];
  const len = (u: P, v: P) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  const mid = (u: P, v: P): P => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
  for (let pass = 0; pass < maxPasses; pass++) {
    const p = geo.getAttribute("position").array as ArrayLike<number>;
    const out: number[] = [];
    let split = 0;
    const tri = (a: P, b: P, c: P) => out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < p.length; i += 9) {
      const A: P = [p[i], p[i + 1], p[i + 2]];
      const B: P = [p[i + 3], p[i + 4], p[i + 5]];
      const C: P = [p[i + 6], p[i + 7], p[i + 8]];
      const ab = len(A, B) > maxEdge;
      const bc = len(B, C) > maxEdge;
      const ca = len(C, A) > maxEdge;
      const n = (ab ? 1 : 0) + (bc ? 1 : 0) + (ca ? 1 : 0);
      if (n) split++;
      if (n === 0) tri(A, B, C);
      else if (n === 3) {
        const m1 = mid(A, B);
        const m2 = mid(B, C);
        const m3 = mid(C, A);
        tri(A, m1, m3);
        tri(m1, B, m2);
        tri(m3, m2, C);
        tri(m1, m2, m3);
      } else {
        // turn the triangle so the split edges come first (same winding)
        let [a, b, c] = [A, B, C];
        if (n === 1) {
          if (bc) [a, b, c] = [B, C, A];
          else if (ca) [a, b, c] = [C, A, B];
          const m = mid(a, b);
          tri(a, m, c);
          tri(m, b, c);
        } else {
          // two long edges: rotate so they are a-b and b-c
          if (!ab) [a, b, c] = [B, C, A];
          else if (!bc) [a, b, c] = [C, A, B];
          const m1 = mid(a, b);
          const m2 = mid(b, c);
          tri(m1, b, m2);
          tri(a, m1, m2);
          tri(a, m2, c);
        }
      }
    }
    const next = new Geo();
    next.setAttribute("position", new Float32BufferAttribute(out, 3));
    geo.dispose();
    geo = next;
    if (!split) break;
  }
  for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
  return geo;
}
