// (plan 116) A cut part closed: first person's arms are a part of the body cut to the arm's triangles (bake.ts armsOf,
// life-people.ts lifeArms), and where the cut is — the elbow, the shoulder — the skin and the sleeve end in an open,
// ragged tube, seen whenever the cut comes into the picture. Here each open edge's loop is found (the vertices welded by
// where they are, so a texture's seam isn't taken for an edge) and closed by a fan from its middle: a new vertex there,
// riding the loop's first vertex's joints, its other attributes (the morphs' too) the loop's average.

import { BufferAttribute, BufferGeometry, type Material } from "three";

const caps = new WeakMap<BufferGeometry, BufferGeometry>();
/** how far from the cut the part's dissolved (m) */
const FADE = 0.1;

/** `g` (an index over shared attributes, cut from `whole`) with the edges the cut opened closed — not the part's own
 *  open edges (a sleeve's cuff); its own attributes then (copied, the caps' added). */
export function capCut(g: BufferGeometry, whole: BufferGeometry): BufferGeometry {
  const had = caps.get(g);
  if (had) return had;
  const index = g.getIndex();
  const pos = g.getAttribute("position");
  if (!index || !pos || index.count < 3) {
    caps.set(g, g);
    return g;
  }
  const n = pos.count;
  // weld by position (1/10 mm)
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const weld = new Int32Array(n).fill(-1);
  const first = new Map<string, number>();
  const used = new Set<number>();
  const wi = whole.getIndex();
  for (let t = 0; t < index.count; t++) used.add(index.getX(t));
  if (wi) for (let t = 0; t < wi.count; t++) used.add(wi.getX(t));
  for (const i of used) {
    const k = key(i);
    const f = first.get(k);
    if (f === undefined) {
      first.set(k, i);
      weld[i] = i;
    } else weld[i] = f;
  }
  // directed edges of the triangles (welded); an edge whose reverse isn't there is on the cut
  const edges = new Map<number, number>();
  const ek = (a: number, b: number) => a * n + b;
  const tri = (t: number) => [weld[index.getX(t)], weld[index.getX(t + 1)], weld[index.getX(t + 2)]];
  for (let t = 0; t + 2 < index.count; t += 3) {
    const [a, b, c] = tri(t);
    if (a === b || b === c || a === c) continue;
    edges.set(ek(a, b), b);
    edges.set(ek(b, c), c);
    edges.set(ek(c, a), a);
  }
  // (the whole part's edges: an edge open in the cut but closed in the whole is the cut's)
  const wholeEdges = new Set<number>();
  if (wi)
    for (let t = 0; t + 2 < wi.count; t += 3) {
      const a = weld[wi.getX(t)];
      const b = weld[wi.getX(t + 1)];
      const c = weld[wi.getX(t + 2)];
      wholeEdges.add(ek(a, b));
      wholeEdges.add(ek(b, c));
      wholeEdges.add(ek(c, a));
    }
  const next = new Map<number, number>();
  for (const [k, b] of edges) {
    const a = Math.floor(k / n);
    if (!edges.has(ek(b, a)) && (!wi || wholeEdges.has(ek(b, a)))) next.set(a, b);
  }
  // the loops
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let v: number | undefined = start;
    while (v !== undefined && !seen.has(v) && loop.length < 4000) {
      seen.add(v);
      loop.push(v);
      v = next.get(v);
    }
    if (v === start && loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) {
    if (!g.getAttribute("cutFade")) g.setAttribute("cutFade", new BufferAttribute(new Float32Array(n).fill(1), 1));
    caps.set(g, g);
    return g;
  }
  // the attributes, a vertex more for each loop
  const out = new BufferGeometry();
  const grow = (a: BufferAttribute, loopsOf: number[][], copyFirst: boolean): BufferAttribute => {
    const s = a.itemSize;
    const Arr = a.array.constructor as new (len: number) => typeof a.array;
    const arr = new Arr((n + loopsOf.length) * s);
    (arr as unknown as { set(x: ArrayLike<number>): void }).set(a.array as ArrayLike<number>);
    loopsOf.forEach((loop, li) => {
      for (let c = 0; c < s; c++) {
        let v = 0;
        if (copyFirst) v = a.getComponent(loop[0], c);
        else {
          for (const i of loop) v += a.getComponent(i, c);
          v /= loop.length;
        }
        (arr as unknown as number[])[(n + li) * s + c] = v;
      }
    });
    return new BufferAttribute(arr, s, a.normalized);
  };
  for (const [name, a] of Object.entries(g.attributes)) {
    if (!(a instanceof BufferAttribute)) continue;
    // (the joints a vertex rides: the loop's first vertex's — averaged they'd mean nothing)
    out.setAttribute(name, grow(a, loops, name === "skinIndex" || name === "skinWeight"));
  }
  for (const [name, list] of Object.entries(g.morphAttributes)) {
    (out.morphAttributes as Record<string, BufferAttribute[]>)[name] = list.map((a) =>
      grow(a as BufferAttribute, loops, false),
    );
  }
  out.morphTargetsRelative = g.morphTargetsRelative;
  // (and how far each vertex is from the cut: the last FADE m dissolved — a forearm pointed at the eye showed its cut
  // end as a hard cap; fadeAtCut draws it)
  // (to the nearest of the loops' own vertices — not their middles: a forearm's loop is 4–5 cm round, a sleeve's 8,
  // so measured to the middle its edge began a third to two-thirds drawn)
  const edge: number[] = [];
  for (const loop of loops) for (const v of loop) edge.push(pos.getX(v), pos.getY(v), pos.getZ(v));
  const fade = new Float32Array(n + loops.length);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let d2 = Number.POSITIVE_INFINITY;
    for (let k = 0; k < edge.length; k += 3) {
      const dx = x - edge[k];
      const dy = y - edge[k + 1];
      const dz = z - edge[k + 2];
      const e = dx * dx + dy * dy + dz * dz;
      if (e < d2) d2 = e;
    }
    fade[i] = Math.min(1, Math.max(0, (Math.sqrt(d2) - 0.01) / FADE));
  }
  out.setAttribute("cutFade", new BufferAttribute(fade, 1));
  // the triangles, and each loop's fan (wound against the edge's own triangle: facing out of the cut)
  const idx: number[] = [];
  for (let t = 0; t < index.count; t++) idx.push(index.getX(t));
  loops.forEach((loop, li) => {
    const c = n + li;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      idx.push(b, a, c);
    }
  });
  out.setIndex(idx);
  out.groups = g.groups.map((gr) => ({ ...gr }));
  if (out.groups.length)
    out.addGroup(index.count, idx.length - index.count, out.groups[out.groups.length - 1].materialIndex ?? 0);
  out.boundingBox = g.boundingBox;
  out.boundingSphere = g.boundingSphere;
  caps.set(g, out);
  return out;
}

/** (plan 116) `m` drawn dissolved where its geometry's `cutFade` is under 1 — a 4×4 ordered dither, so no blending:
 *  the cut end of a first-person arm fades out instead of showing as a cap. Its own hook and key kept. */
export function fadeAtCut(m: Material): void {
  if (m.userData.fadeAtCut) return;
  m.userData.fadeAtCut = true;
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    own.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float cutFade;\nvarying float vCutFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCutFade = cutFade;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vCutFade;
float cutBayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (vCutFade < cutBayer(gl_FragCoord.xy)) discard;",
      );
  };
  m.customProgramCacheKey = () => `${ownKey.call(m)}|cutfade`;
}
