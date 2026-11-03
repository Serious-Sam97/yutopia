import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  type Material,
  type Mesh,
  MeshDepthMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector4,
} from "three";
import { mergeGeometries as merge3 } from "three/addons/utils/BufferGeometryUtils.js";

// The snow as a layer (docs/plan/65-the-weather.md, W4, phase 3): what lies is the weather's, not
// the world's. Two parts, both from the room's `snow` (eased here, `wx.wxSnow`):
//   - the dusting: in every outdoor material's fragment, before its light, a surface facing the
//     sky whitens by how much it faces up, the snow lying and a world noise — coming in a fine
//     powder from the grain's high points out, going in islands (`wxMelt`);
//   - the shapes: every piece of snow geometry (the roofs' slabs, the drifts, the banks, the caps,
//     the pines' cones, the mounds, the icicles) tagged where it's made (`wxTag`: how far each
//     vertex stands above what it lies on, and the snow lying it comes in at), pressed down onto
//     it by (1 − grown) in the vertex shader, and dropped (out of the clip) under 2 % grown. The
//     shadow pass takes the same press (`wxDepth`).
// The tag's second number is the threshold negated (+ BURIED for a piece whose vertices each come
// in at their own): a geometry without the attribute reads 0 (or a stale 1 at that location from
// another program) and is never snow.

/** How many roofs the dusting knows of at once (the nearest). */
export const ROOFS = 8;
/** The layer's uniforms, the same objects in every shader. */
export const wx = {
  wxSnow: { value: 1 }, // the snow lying, 0 … 1 (the room's, eased)
  wxMelt: { value: 0 }, // 0: it's coming (a powder), 1: it's going (islands, old snow)
  wxWet: { value: 0 }, // how wet things are, 0 … 1 (the room's, eased: snow melting, the rain)
  wxPud: { value: 0 }, // the puddles, 0 … 1 (the room's, eased)
  wxRain: { value: 0 }, // how hard it's raining, 0 … 1: the rings in the puddles
  wxSky: { value: new Color(0.6, 0.65, 0.7) }, // the sky's colour low down (linear): the sheen's
  wxT: { value: 0 }, // seconds: the rings
  wxIce: { value: 1 }, // the water's ice, 0 … 1 (the room's, eased): in from the shores (W6)
  // its holes broken through (plan 66 S4): x, z (the Grounds'), radius, 1 if there's one
  wxHoles: { value: Array.from({ length: 8 }, () => new Vector4()) },
  // (plan 66 S7) the sun's way (the world's) and how much it glints off the water (0 down, overcast);
  // the swimmers and waders near: x, z (the Grounds'), the way they go (rad), how fast (m/s; 0 none)
  wxSun: { value: new Vector4(0, 1, 0, 0) },
  // (S8) the murk's colour under it (the view's: fog3d.ts mfUwCol's)
  wxUwCol: { value: new Color(0.012, 0.05, 0.048) },
  wxSwim: { value: Array.from({ length: 8 }, () => new Vector4()) },
  wxIcicle: { value: 1 }, // the icicles, 0 … 1: they hang when it's freezing after a thaw (sky.ts)
  wxOff: { value: new Vector3() }, // the Grounds' origin in the scene: the noise in their coords
  wxTex: { value: null as Texture | null }, // the snow's own picture (the land's): its grain
  wxTexOn: { value: 0 },
  wxGrass: { value: null as Texture | null }, // the green's detail: grass's blades, grey (grassTexture)
  // under a roof stays dry: the nearest roofs round the camera, two vec4 each — (x0, z0, x1, z1)
  // and (its underside's height, …) — in the Grounds' coords (sky.ts fills them)
  wxRoofs: { value: Array.from({ length: ROOFS * 2 }, () => new Vector4()) },
  wxRoofN: { value: 0 },
  // the air's haze on the far ridges, 0 … 1 (view.ts: as much as the fog has at 700 m on a grey day —
  // the ridges skip three's fog, and the far woods in front of them mustn't come out paler)
  wxHaze: { value: 0 },
};

/** How hard it's snowing now, 0 … 1 (the room's, eased: sky.ts; 1 till it's said — a still's): what
 *  falls on a windscreen. */
export const wxNow = { snowing: 1, clear: 0, rain: 0, temp: -6 };
/** The e2e's stills hold the snow where they set it (the room's left out). */
export const wxHold = { on: false };
// (the e2e reads it: the snow the view shows)
if (typeof window !== "undefined")
  (window as unknown as { __wxLayer?: { wx: typeof wx; hold: typeof wxHold } }).__wxLayer = { wx, hold: wxHold };

/** How far a piece that comes in at `at` has grown, with `snow` lying (`melt`: going — the shapes
 *  outlast the dusting a while). The shader's wxGrowOf. */
export function growOf(at: number, snow: number, melt: number): number {
  const s = snow + 0.28 * melt;
  const t = Math.min(1, Math.max(0, (s - at) / 0.22));
  return t * t * (3 - 2 * t);
}
/** Grown enough to draw (under it, it's dropped). */
export const SHOWN = 0.02;
/** Added to a tag's threshold: a piece whose vertices come in at their own snow (a drift along a
 *  wall, a bank) — pressed down under the ground when it's gone, never dropped. */
export const BURIED = 10;

/** Each piece's own threshold, from where it is: lo … hi (all of them grown by snow 1: hi ≤ 0.78). */
export function pieceAt(x: number, z: number, lo = 0.4, hi = 0.72): number {
  const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  return lo + (hi - lo) * h;
}
const hash = (i: number, j: number) => Math.abs(Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1;
/** A smooth threshold over the land (~6 m across): a drift along a wall builds in its own places
 *  first, never a step from one tile to the next. */
export function smoothAt(x: number, z: number, lo: number, hi: number): number {
  const u = x / 6;
  const v = z / 6;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fx = u - i;
  const fz = v - j;
  const ex = fx * fx * (3 - 2 * fx);
  const ez = fz * fz * (3 - 2 * fz);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * ex;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * ex;
  return lo + (hi - lo) * (a + (b - a) * ez);
}
/** When each kind of piece comes in (lo, hi): a roof's slab early, the drifts and the banks later,
 *  the icicles last. */
export const AT = {
  cap: [0.3, 0.55],
  roof: [0.35, 0.6],
  cone: [0.35, 0.62],
  bank: [0.42, 0.7],
  drift: [0.45, 0.74],
  mound: [0.5, 0.74],
  icicle: [0.76, 0.78],
} as const;
export const atOf = (kind: keyof typeof AT, x: number, z: number) => pieceAt(x, z, AT[kind][0], AT[kind][1]);

/** A geometry made snow: every vertex tagged to come in at `at`, pressed down by `drop(x, y, z)`
 *  (how far it stands over what it lies on: by default down to the geometry's own foot). */
export function tagged(g: BufferGeometry, at: number, drop?: (x: number, y: number, z: number) => number) {
  const p = g.getAttribute("position");
  let y0 = Number.POSITIVE_INFINITY;
  if (!drop) for (let i = 0; i < p.count; i++) y0 = Math.min(y0, p.getY(i));
  const t = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    t[i * 2] = drop ? drop(p.getX(i), p.getY(i), p.getZ(i)) : p.getY(i) - y0;
    t[i * 2 + 1] = -at;
  }
  g.setAttribute("wxTag", new Float32BufferAttribute(t, 2));
  return g;
}
export const isSnow = (g: BufferGeometry) => !!g.getAttribute("wxTag");

/** three's mergeGeometries, with the snow's tags: a part without them gets none (zeros), so snow
 *  and what it lies on merge into one mesh as they did. */
export function mergeGeometries(gs: BufferGeometry[], groups = false): BufferGeometry {
  if (gs.some(isSnow))
    for (const g of gs)
      if (!isSnow(g))
        g.setAttribute("wxTag", new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  return merge3(gs, groups);
}

/** The land round each of a block's (n + 1)² vertices, `step` apart, for the green under the snow
 *  (docs/plan/65 W3): (the woods — the deep snow's, spread ~6 m: their floor reaches under
 *  their crowns — and a way near: 1 on one, 0 six metres off). */
export function landAround(
  surf: readonly string[] | ((i: number, j: number) => string),
  n: number,
  step: number,
): Float32Array {
  const N = n + 1;
  // (worked out over the block and a margin round it — the woods' blur, a way's six metres — so two
  // blocks side by side agree on their shared edge: a lookup past the edge, else the edge's own)
  const R = Math.min(6, Math.max(1, Math.round(6 / step)));
  const M = typeof surf === "function" ? Math.max(R, Math.ceil(6 / step)) + 1 : 0;
  const W = N + 2 * M;
  const at = (i: number, j: number) => (typeof surf === "function" ? surf(i, j) : surf[j * N + i]);
  const woods = new Float32Array(W * W);
  const d = new Float32Array(W * W).fill(99);
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) {
      const s = at(i - M, j - M);
      woods[j * W + i] = s === "deep" ? 1 : 0;
      if (s === "path" || s === "asphalt" || s === "walk" || s === "floor") d[j * W + i] = 0;
    }
  // (the ways near: a chamfer distance, in metres)
  for (let pass = 0; pass < 2; pass++)
    for (let j0 = 0; j0 < W; j0++)
      for (let i0 = 0; i0 < W; i0++) {
        const j = pass ? W - 1 - j0 : j0;
        const i = pass ? W - 1 - i0 : i0;
        const o = pass ? 1 : -1;
        let v = d[j * W + i];
        const ii = i + o;
        const jj = j + o;
        if (ii >= 0 && ii < W) v = Math.min(v, d[j * W + ii] + step);
        if (jj >= 0 && jj < W) v = Math.min(v, d[jj * W + i] + step);
        if (ii >= 0 && ii < W && jj >= 0 && jj < W) v = Math.min(v, d[jj * W + ii] + step * Math.SQRT2);
        d[j * W + i] = v;
      }
  // (the woods spread: a box blur each way, ~6 m)
  let w = woods;
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(W * W);
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) {
        let sum = 0;
        let k = 0;
        for (let o = -R; o <= R; o++) {
          const ii = pass ? i : i + o;
          const jj = pass ? j + o : j;
          if (ii < 0 || jj < 0 || ii >= W || jj >= W) continue;
          sum += w[jj * W + ii];
          k++;
        }
        t[j * W + i] = sum / k;
      }
    w = t;
  }
  const out = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const q = (j + M) * W + i + M;
      const o = (j * N + i) * 2;
      out[o] = Math.max(w[q], woods[q] * 0.85);
      out[o + 1] = Math.max(0, 1 - d[q] / 6);
    }
  return out;
}

// ── the shaders ──

// (the icicles' thresholds, as the shader tells them: a little round AT.icicle)
const AT_ICICLE_LO = (AT.icicle[0] - 0.005).toFixed(3);
const AT_ICICLE_HI = (AT.icicle[1] + 0.01).toFixed(3);
const VERT_PARS = `
attribute vec2 wxTag;
uniform float wxSnow; uniform float wxMelt; uniform float wxIcicle;
float wxGrowOf(float at) { return smoothstep(at, at + 0.22, wxSnow + 0.28 * wxMelt); }
`;
const VERT_PRESS = `
float wxGr = 1.0;
bool wxClip = false;
if (wxTag.y < 0.0) {
  float at = -wxTag.y;
  wxClip = at < ${BURIED / 2}.0;
  at = wxClip ? at : at - ${BURIED}.0;
#ifdef USE_INSTANCING
  // (one piece drawn many times — the mounds at the trees' feet: each its own, round its tag's)
  if (wxClip) at = min(at + (fract(sin(dot((instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.18, 0.78);
#endif
  wxGr = wxGrowOf(at);
  // (an icicle — the last kind in, AT.icicle — only as long as there's been a thaw to freeze)
  if (wxClip && at > ${AT_ICICLE_LO} && at < ${AT_ICICLE_HI}) wxGr = min(wxGr, wxIcicle);
  transformed.y -= wxTag.x * (1.0 - wxGr);
}
`;
// (out of the clip: none of its fragments, and no discard in the outdoor shaders — their early z.
// Only a piece that comes in all at once: one whose vertices come in at their own snow is buried
// when it's gone, never half its triangle's corners thrown out)
const VERT_DROP = `
if (wxClip && wxGr < ${SHOWN}) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
`;
/** The press on a shader's vertex: the snow pieces grown as the snow lying is. */
export function pressShader(sh: { uniforms: Record<string, unknown>; vertexShader: string }) {
  sh.uniforms.wxSnow = wx.wxSnow;
  sh.uniforms.wxMelt = wx.wxMelt;
  sh.uniforms.wxIcicle = wx.wxIcicle;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_PRESS}`)
    .replace("#include <project_vertex>", `#include <project_vertex>\n${VERT_DROP}`);
}

// the water's vertices (plan 66 S7: grounds3d.ts `surface`): how deep to its bed, along it (m) and
// across it, its current (m/s), the foam fixed there (the rapid's rocks), its way; three slow waves,
// calm in the shallows, chopped where it's fast, none under its ice
const WATER_V_PARS = `
attribute float wxDepth; attribute vec4 wxFlow; attribute vec2 wxDir;
varying float vWxDepth; varying vec4 vWxFlow;
uniform float wxT; uniform float wxIce;
`;
const WATER_V = `
{
  float sp = wxFlow.z;
  vec2 p = position.xz;
  vec2 nr = vec2(-wxDir.y, wxDir.x);
  float iced = sp <= 1.2 && 1.0 - min(abs(wxSide), 1.0) <= wxIce * 1.02 - 0.01 ? 1.0 : 0.0;
  float w = 0.06 * sin(dot(p, wxDir) * 0.9 - wxT * (1.1 + sp * 2.2) + dot(p, nr) * 0.35)
    + 0.045 * sin(dot(p, vec2(0.61, -0.79)) * 1.3 + wxT * 0.8)
    + 0.03 * sin(dot(p, vec2(-0.83, 0.55)) * 2.1 - wxT * 1.3);
  transformed.y += w * (0.45 + 0.55 * smoothstep(0.0, 0.7, wxDepth)) * (1.0 + sp * 0.7) * (1.0 - iced);
  vWxDepth = wxDepth;
  vWxFlow = wxFlow;
}
`;

const FRAG_PARS = `
uniform float wxSnow; uniform float wxMelt; uniform float wxWet; uniform vec3 wxOff;
uniform vec3 wxSky; uniform float wxPud; uniform float wxRain; uniform float wxT; uniform float wxIce;
uniform vec4 wxHoles[8];
uniform vec4 wxSun; uniform vec4 wxSwim[8]; uniform vec3 wxUwCol;
uniform sampler2D wxTex; uniform float wxTexOn; uniform sampler2D wxGrass;
uniform vec4 wxRoofs[${ROOFS * 2}]; uniform int wxRoofN;
// (an integer hash: a float one goes regular a few hundred metres out — the town, the karts — where
// the lattice times its multipliers is past what a float holds the fraction of. An eighth's steps,
// so a cell and a cell's offset — the rings' — hash apart)
float wxH(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p * 8.0)) + 1048576);
  q = q * 1664525u + 1013904223u;
  q.x += q.y * 1664525u; q.y += q.x * 1664525u;
  q ^= q >> 16u;
  q.x += q.y * 1664525u; q.y += q.x * 1664525u;
  q ^= q >> 16u;
  return float(q.x ^ q.y) * (1.0 / 4294967295.0);
}
float wxN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxH(i), wxH(i + vec2(1.0, 0.0)), f.x), mix(wxH(i + vec2(0.0, 1.0)), wxH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wxF(vec2 p) { return 0.5 * wxN(p) + 0.3 * wxN(p * 2.13 + 7.1) + 0.2 * wxN(p * 4.7 + 3.3); }
`;
// Before the light (after the normal's made): what the surface is, then the snow over it. Its kinds:
// WX_LAND (the land: what was its snow is the green under it — grass, the woods' floor by the
// trees, drier on the slopes and by the ways — its trails earth, its ice none: phase 7's), WX_FIELD
// (the campus's open ground: all grass), WX_WAY (a trail, a pavement: last to whiten, first to
// clear), WX_TREE (the needles: frosted on top, never buried — the cones carry it), WX_CAR (an
// even frost first, thickening).
const FRAG = `
{
  vec3 wxW = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition - wxOff;
  vec3 wxNw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float wxUp = clamp(wxNw.y, 0.0, 1.0);
  float wxDetail = 1.0;
#ifdef USE_MAP
  wxDetail = dot(texture2D(map, vMapUv).rgb, vec3(0.3, 0.55, 0.15)) / 0.82;
#endif
  // (the snow's own colour on the land: its colour and picture as they were, all white)
  vec3 wxSnowC = diffuseColor.rgb;
  float wxWoods = 0.0;
  float wxWay = 0.0;
  bool wxOn = wxSnow > 0.001 && wxUp > 0.4;
  float wxCovered = 0.0;
#if defined(WX_LAND) || defined(WX_FIELD)
  {
    // ── the green under it (W3): the approved mock's ──
    // (how much of it is the green: 1 where its colour was the snow's — by weight, so a triangle
    // between the grass and a path blends, never a white one left between them)
    float green = 1.0;
    float near = 0.0;
    // (the pictures read here, outside the branches: their mip level's by the pixel's neighbours,
    // which a branch taken by some and not others leaves undefined — sparkles along an edge)
    vec3 wxGrassT = texture2D(wxGrass, wxW.xz / 14.0).rgb;
  #ifdef USE_MAP
    vec3 wxMapT = texture2D(map, vMapUv).rgb;
  #endif
  #ifdef WX_LAND
    vec3 c = vColor.rgb;
    float l = dot(c, vec3(0.3, 0.55, 0.15));
    float b = c.b - c.r;
    wxWoods = smoothstep(0.08, 0.6, vWxLand.x);
    near = vWxLand.y;
    green = smoothstep(0.0, 0.025, b) * smoothstep(0.62, 0.72, l);
    if (b > 0.12 && l > 0.5 && l < 0.7) {
      // the land under the water and at its edge: wet mud (the water and its ice are drawn over it)
      diffuseColor.rgb = vec3(0.045, 0.036, 0.024) * wxDetail;
      green = 0.0;
    } else if (green < 0.999) {
      // the rest: the rock as it is; a path (and the pavements under their own) earth and gravel
      if (l > 0.5) {
        float e = wxF(wxW.xz * 0.31 + 5.0);
        diffuseColor.rgb = mix(vec3(0.218, 0.149, 0.077), vec3(0.302, 0.258, 0.19), smoothstep(0.45, 0.75, e)) * wxDetail;
      }
      wxWay = (1.0 - green) * (l < 0.35 ? 0.0 : 1.0);
      vec3 sc = vec3(0.896, 0.922, 0.947);
    #ifdef USE_MAP
      sc *= wxMapT;
    #endif
      wxSnowC = mix(sc, wxSnowC, green);
    }
  #endif
    if (green > 0.001) {
      wxDetail = dot(wxGrassT, vec3(0.3, 0.55, 0.15)) / 0.82;
      float n1 = wxF(wxW.xz * 0.07);
      float n2 = wxF(wxW.xz * 0.31 + 5.0);
      // three greens by a world noise (no repeat), drier on the slopes and by the ways
      vec3 g = mix(mix(vec3(0.099, 0.165, 0.067), vec3(0.149, 0.227, 0.076), smoothstep(0.3, 0.62, n1)), vec3(0.207, 0.279, 0.093), smoothstep(0.55, 0.8, n2) * 0.6);
      float slope = clamp(sqrt(max(0.0, 1.0 - wxNw.y * wxNw.y)) / max(wxNw.y, 0.2) / 1.2, 0.0, 1.0);
      g = mix(g, vec3(0.301, 0.291, 0.141), clamp(slope * 0.9 + near * 0.45, 0.0, 0.65) * smoothstep(0.25, 0.7, n2));
      // under the trees: needles and moss
      vec3 floorC = mix(vec3(0.119, 0.088, 0.04), vec3(0.076, 0.126, 0.036), smoothstep(0.35, 0.65, wxF(wxW.xz * 0.15 + 2.0)));
      vec3 lawn = mix(g, floorC, wxWoods) * wxDetail;
      diffuseColor.rgb = mix(diffuseColor.rgb, lawn, green);
    }
    wxWay = max(wxWay, near * 0.6);
  }
#endif
  // coming in it's a powder: a fine grain at two scales (a picture's dark strokes last) with soft
  // edges as wide as a pixel's change, so far off it averages to a veil, never a pattern (its
  // width taken here, outside the branches)
  float wxDtl = 1.0 - clamp(wxDetail, 0.0, 1.2) / 1.2;
  float wxGrain = 0.25 * wxN(wxW.xz * 11.0 + wxW.y * 3.1) + 0.15 * wxN(wxW.xz * 27.0 + wxW.y * 5.3 + 9.0) + 0.6 * wxDtl;
  float wxGw = fwidth(wxGrain);
#ifdef WX_WAY
  wxWay = 1.0;
#endif
#ifdef WX_TRAIL
  wxWay = 0.35; // (a trail in the woods: trodden, never ploughed)
#endif
#ifdef WX_ROAD
  wxOn = false; // (a road's snow is its own: roads3d.ts — its wet, its sheen and puddles the layer's)
#endif
#ifdef WX_ICE
  // the water's ice (W6): in from the shores as it freezes, out from the middle as it thaws —
  // where it isn't, the water under it shows
  if (1.0 - min(abs(vWxSide), 1.0) > wxIce * 1.02 - 0.01) discard;
  // (and its holes, broken through: plan 66)
  for (int k = 0; k < 8; k++)
    if (wxHoles[k].w > 0.5 && distance(wxW.xz, wxHoles[k].xy) < wxHoles[k].z) discard;
  wxOn = false;
#endif
#ifdef WX_WATER
  // open water (W6; plan 66 S7, the approved mock's): coloured by how deep it is to its bed — clear in
  // the shallows, the bed seen through them — streaked along its current, a lapping foam line at the
  // shore, white where it's fast (the rapid, the falls) and round the rocks in it, rings and a wake
  // round anyone in it, the rain's rings; an ink line where it meets the land; the sky off it at a
  // glancing look and the sun's glint, broken by its facets. None of it where it's iced over.
  {
    float d = vWxDepth;
    float sp = vWxFlow.z;
    bool hole = false;
    for (int k = 0; k < 8; k++)
      if (wxHoles[k].w > 0.5 && distance(wxW.xz, wxHoles[k].xy) < wxHoles[k].z) hole = true;
    if (!hole && sp <= 1.2 && 1.0 - min(abs(vWxSide), 1.0) <= wxIce * 1.02 - 0.01) discard;
#ifdef WX_UNDER
    // from under it (S8): bright and rippling, the sky through its window overhead (Snell's: within
    // ~48° of straight up), past it the murk under it mirrored, silvered; a bright ring at the window's
    // edge
    {
      vec3 f = normalize((wxW + wxOff) - cameraPosition);
      float win = smoothstep(0.62, 0.72, f.y);
      float rip = wxN(wxW.xz * 1.2 + vec2(wxT * 0.2, -wxT * 0.15));
      vec3 uc = mix(wxUwCol * (3.0 + 1.6 * rip), wxSky * (1.1 + 0.4 * rip) + vec3(0.04), win);
      uc += (1.0 - smoothstep(0.0, 0.035, abs(f.y - 0.66))) * vec3(0.35, 0.45, 0.42);
      diffuseColor.rgb = vec3(0.0);
      totalEmissiveRadiance = uc;
      wxOn = false;
    }
#else
    vec3 c = mix(vec3(0.04, 0.12, 0.10), vec3(0.004, 0.022, 0.028), smoothstep(0.4, 2.6, d));
    float a = mix(0.28, 0.93, smoothstep(0.0, 1.6, d));
    float n1 = wxN(vec2(vWxFlow.x * 0.32 - wxT * sp * 0.32, vWxFlow.y * 9.0));
    c += step(0.8, n1) * smoothstep(0.15, 0.6, sp) * 0.05;
    float lap = 0.05 * sin(wxT * 1.4 + wxW.x * 0.45 + wxW.z * 0.3);
    float fn = wxN(wxW.xz * 1.9 + vec2(0.0, -wxT * (0.15 + sp * 0.5)));
    float foam = (1.0 - smoothstep(0.06, 0.24, d + lap)) * step(0.42, fn) * step(0.035, d);
    float wn = wxN(vec2(vWxFlow.x * 0.9 - wxT * sp * 0.7, vWxFlow.y * 6.0 + vWxFlow.x * 0.1));
    foam = max(foam, smoothstep(1.0, 2.2, sp) * step(0.32, wn));
    foam = max(foam, vWxFlow.w * step(0.35, fn));
    for (int k = 0; k < 8; k++) {
      vec4 sw = wxSwim[k];
      if (sw.w <= 0.0) continue;
      vec2 q = wxW.xz - sw.xy;
      float r = length(q);
      if (r > 5.0) continue;
      // (a ring where the body meets it, and two going out)
      float ring = 1.0 - smoothstep(0.02, 0.07, abs(r - 0.42));
      for (int j = 0; j < 2; j++) {
        float t = fract(wxT * 0.45 + float(j) * 0.5);
        ring = max(ring, (1.0 - smoothstep(0.015, 0.05, abs(r - 0.45 - t * 1.6))) * (1.0 - t) * (1.0 - t) * 0.6);
      }
      // (moving: a V behind, as long as it's going fast)
      vec2 f = vec2(cos(sw.z), sin(sw.z));
      float back = -dot(q, f);
      float side = abs(dot(q, vec2(-f.y, f.x)));
      float len = 0.8 + 1.8 * min(1.0, sw.w);
      float fade = 1.0 - back / len;
      float wake = back > 0.2 && back < len ? (1.0 - smoothstep(0.015, 0.06, abs(side - back * 0.32))) * fade * fade : 0.0;
      foam = max(foam, max(ring * 0.8, wake * 0.7 * min(1.0, sw.w)));
    }
    if (wxRain > 0.01) {
      vec2 cell = floor(wxW.xz * 1.3);
      vec2 fc = fract(wxW.xz * 1.3);
      float h = wxH(cell);
      float t = fract(wxT * (1.1 + h) + h * 7.0);
      vec2 cc = vec2(0.25 + 0.5 * wxH(cell + 3.1), 0.25 + 0.5 * wxH(cell + 7.7));
      c += (1.0 - smoothstep(0.0, 0.05, abs(length(fc - cc) - t * 0.4))) * (1.0 - t) * step(h, wxRain) * 0.12;
    }
    c = mix(c, vec3(0.75, 0.8, 0.78), foam);
    a = max(a, foam * 0.95);
    float ink = 1.0 - smoothstep(0.0, 0.06, abs(d));
    c = mix(c, vec3(0.06, 0.08, 0.09), ink * 0.8);
    a = max(a, ink);
    diffuseColor.rgb = c;
    diffuseColor.a = a;
    vec3 Vv = normalize(vViewPosition);
    float fres = pow(1.0 - max(dot(normal, Vv), 0.0), 3.0);
    float open = 1.0 - foam;
    totalEmissiveRadiance += mix(wxSky, wxSky * vec3(0.72, 0.84, 1.08), 0.4) * (0.015 + 0.32 * fres) * open;
    vec3 sunV = normalize((viewMatrix * vec4(wxSun.xyz, 0.0)).xyz);
    float g = max(dot(reflect(-Vv, normal), sunV), 0.0);
    float glint = (step(0.992, g) * 1.4 + pow(g, 60.0) * 0.4) * open * wxSun.w;
    totalEmissiveRadiance += vec3(1.0, 0.96, 0.88) * glint;
    diffuseColor.a = max(diffuseColor.a, min(1.0, fres * 0.85 + glint));
    wxOn = false;
#endif
  }
#endif
  // open to the sky: neither the snow nor the rain's wet under a roof (a floor's: only its tiles
  // under the sky — the light map's, light3d.ts — not its rooms, their desks and tables)
  bool wxOpen = true;
#ifdef WX_LM
  {
    vec2 lmIn = step(vec2(0.0), vLmUv) * step(vLmUv, vec2(1.0));
    wxOpen = lmIn.x * lmIn.y > 0.5 && texture2D(lmSky, clamp(vLmUv, 0.0, 1.0)).r > 0.5;
  }
#endif
  for (int i = 0; i < ${ROOFS}; i++) {
    if (i >= wxRoofN || !wxOpen) break;
    vec4 a = wxRoofs[i * 2];
    if (wxW.x > a.x && wxW.x < a.z && wxW.z > a.y && wxW.z < a.w && wxW.y < wxRoofs[i * 2 + 1].x) wxOpen = false;
  }
  wxOn = wxOn && wxOpen;
  if (wxOn) {
    float face = smoothstep(0.4, 0.88, wxUp);
    float wxNm = wxF(wxW.xz * 0.32 + 3.0);
    float cov = 0.0;
    // coming in: where it settles, by the grain, the drifts, the woods (a way: trodden, salted,
    // ploughed — still patchy with all of it lying). Its threshold here: the going's islands never
    // cover more than all of it lying did (a trail stays trodden as it goes, not whiter than white)
    float drift = wxF(wxW.xz * 0.05 + 6.0);
    float faceIn = face;
    float tIn = 0.03 + 0.8 * smoothstep(0.18, 0.82, wxGrain) - 0.9 * (drift - 0.5) + 0.16 * wxWoods + 0.55 * wxWay;
#ifdef WX_CAR
    tIn = -1.0;
#endif
#ifdef WX_TREE
    faceIn = smoothstep(0.62, 0.95, wxUp);
    tIn = 0.2 + 0.55 * wxN(wxW.xz * 6.3 + wxW.y * 2.9);
#endif
    tIn += (1.0 - faceIn) * 1.3;
    float wIn = 0.14 + 1.2 * wxGw;
    if (wxMelt < 0.999) {
      float w = wIn;
      float t0 = tIn;
      face = faceIn;
      float c = smoothstep(t0 - w, t0 + w, wxSnow);
      // the frost before it: everything paling (less on the ways and under the trees)
      c = max(c, face * 0.2 * smoothstep(0.0, 0.35, wxSnow) * (1.0 - 0.7 * wxWay) * (1.0 - 0.5 * wxWoods));
#ifdef WX_CAR
      c = face * smoothstep(0.0, 0.45, wxSnow) * (0.8 + 0.2 * wxN(wxW.xz * 9.0 + wxW.y * 7.0));
#endif
      // (a first snow's a veil: what's under it through it)
      c *= 0.6 + 0.4 * smoothstep(0.05, 0.45, wxSnow);
#ifdef WX_TREE
      c *= 0.5;
#endif
      cov = c * (1.0 - wxMelt);
    }
    if (wxMelt > 0.001) {
      // going: islands — the broad lows clear first, the ways soonest
      float nb = wxF(wxW.xz * 0.045 + 11.0);
      float nb2 = wxF(wxW.xz * 0.13 + 4.0);
      // (the woods' shade last; and where it drifted deepest coming in — the drifts' places)
      float t0 = smoothstep(0.3, 0.7, 0.4 * nb + 0.5 * nb2 + 0.1 * wxNm) - 0.3 * wxWoods - 0.3 * (drift - 0.5) + 0.32 * wxWay;
#ifdef WX_CAR
      t0 -= 0.08;
#endif
#ifdef WX_TREE
      face = smoothstep(0.62, 0.95, wxUp);
      t0 = 0.05 + 0.55 * wxN(wxW.xz * 6.3 + wxW.y * 2.9);
#endif
      t0 += (1.0 - face) * 1.3;
      float c = min(smoothstep(t0, t0 + 0.05 + wxGw, wxSnow), smoothstep(tIn - wIn, tIn + wIn, 1.0));
#ifdef WX_TREE
      c *= 0.5;
#endif
      cov += c * wxMelt;
    }
    vec3 fresh = vec3(0.904, 0.930, 0.955);
    if (wxTexOn > 0.5) fresh *= texture2D(wxTex, wxW.xz / 14.0).rgb;
#if defined(WX_LAND) || defined(WX_FIELD)
    // (the land's: today's snow, its own colour and picture where it is)
    fresh = wxSnowC;
#endif
    // (old snow: greyer in its hollows, and the snow's own grain in it — not a flat paint)
    vec3 old = mix(vec3(0.57, 0.6, 0.63), vec3(0.79, 0.83, 0.87), smoothstep(0.3, 0.8, wxNm));
    old *= 0.9 + 0.16 * wxGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(fresh, old, wxMelt * 0.6), cov);
    wxCovered = cov;
  }
  // ── the wet (the snow's meltwater, the rain's — W7): what isn't under snow darkens, by how much
  // it soaks up (earth most, a car's paint hardly); the hard and the smooth take a soft sheen, the
  // sky's colour towards a grazing look (a stylised highlight, not reflections); and puddles by
  // wxPud on what's flat — the ways, the trails' ruts, the lot — in a world noise: dark, flat, the
  // sky in them, rings while it rains ──
#if !defined(WX_WATER)
  if (wxOpen && wxWet > 0.001 && wxUp > 0.0 && wxCovered < 0.99) {
    float por = 0.45;
    float shine = 0.25;
    float puddly = 0.0;
#if defined(WX_LAND) || defined(WX_FIELD)
    por = 0.9; shine = 0.1; puddly = wxWay;
#endif
#ifdef WX_TRAIL
    por = 1.0; shine = 0.35; puddly = 1.0;
#endif
#ifdef WX_WAY
    por = 0.8; shine = 0.6; puddly = 0.6;
#endif
#ifdef WX_ROAD
    por = 0.9; shine = 0.9; puddly = 1.0;
#endif
#ifdef WX_CAR
    por = 0.12; shine = 0.5;
#endif
#ifdef WX_TREE
    por = 0.3; shine = 0.15;
#endif
#ifdef WX_LM
    por = 0.9; shine = 0.8; puddly = 1.0;
#endif
    float dry = 1.0 - wxCovered;
    float wet = wxWet * dry;
    diffuseColor.rgb *= 1.0 - 0.38 * wet * por * (0.6 + 0.4 * wxUp);
    vec3 V = normalize(cameraPosition - (wxW + wxOff));
    float fres = pow(1.0 - max(dot(V, wxNw), 0.0), 4.0);
    totalEmissiveRadiance += wxSky * wet * fres * wxUp * 0.22 * shine;
    if (wxPud > 0.001 && puddly > 0.0) {
      float p = smoothstep(0.61, 0.65, wxF(wxW.xz * 0.16 + 1.7) + 0.1 * (wxPud - 0.5)) * step(0.97, wxUp) * wxPud * puddly * dry;
      // (the rain's rings in them: a few at a time, each spreading and gone in under a second)
      float ring = 0.0;
      if (wxRain > 0.01 && p > 0.01) {
        vec2 cell = floor(wxW.xz * 1.6);
        vec2 f = fract(wxW.xz * 1.6);
        float h = wxH(cell);
        float t = fract(wxT * (1.1 + h) + h * 7.0);
        vec2 c = vec2(0.25 + 0.5 * wxH(cell + 3.1), 0.25 + 0.5 * wxH(cell + 7.7));
        float d = length(f - c);
        ring = (1.0 - smoothstep(0.0, 0.05, abs(d - t * 0.35))) * (1.0 - t) * step(h, wxRain);
      }
      // (dark water, the sky faint in it: brighter only looking along it)
      diffuseColor.rgb *= 1.0 - 0.7 * p;
      totalEmissiveRadiance += wxSky * p * (0.05 + 0.3 * fres + 0.18 * ring);
    }
  }
#endif
}
`;

export type WxKind =
  | "thing"
  | "land"
  | "field"
  | "way"
  | "trail"
  | "road"
  | "tree"
  | "car"
  | "water"
  | "under"
  | "ice"
  | "none";
const DEFINE: Record<WxKind, string> = {
  thing: "",
  land: "#define WX_LAND\n",
  field: "#define WX_FIELD\n",
  way: "#define WX_WAY\n",
  trail: "#define WX_TRAIL\n",
  road: "#define WX_ROAD\n",
  water: "#define WX_WATER\n",
  // (the water's surface from under it: plan 66 S8)
  under: "#define WX_WATER\n#define WX_UNDER\n",
  ice: "#define WX_ICE\n",
  tree: "#define WX_TREE\n",
  car: "#define WX_CAR\n",
  none: "",
};
/** What a material is to the snow (its userData.wx, set before it's patched): a thing by default;
 *  see-through ones take none (only the press). */
export function kindOf(m: Material): WxKind {
  const k = m.userData.wx as WxKind | undefined;
  if (k) return k;
  return m.transparent ? "none" : "thing";
}
/** The whole layer on an outdoor material's shader: the press and the dusting by its kind. */
export function layerShader(
  sh: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string },
  kind: WxKind,
  floor = false,
) {
  pressShader(sh);
  if (kind === "none") return;
  if (!wx.wxGrass.value && typeof document !== "undefined") wx.wxGrass.value = grassTexture();
  Object.assign(sh.uniforms, wx);
  // (a car's own: what fell on it since it last moved — car/sedan.ts `wearable` hands it over)
  const own = kind === "car" && !!sh.uniforms.wxCarSnow;
  // (the land: round each vertex, the woods and a way near — `landAround`)
  if (kind === "land")
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 wxLand;\nvarying vec2 vWxLand;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWxLand = wxLand;");
  // (the water and its ice: how far from its shore each vertex is — grounds3d.ts `wxSide`)
  const water = kind === "water" || kind === "under" || kind === "ice";
  if (water)
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float wxSide;\nvarying float vWxSide;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWxSide = wxSide;");
  // (the water's: how deep, along and across it, its current and fixed foam, its way — and its waves:
  // plan 66 S7)
  if (kind === "water" || kind === "under")
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${WATER_V_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WATER_V}`);
  sh.fragmentShader = sh.fragmentShader
    .replace(
      "#include <common>",
      `${DEFINE[kind]}${floor ? "#define WX_LM\n" : ""}#include <common>\n${FRAG_PARS}${kind === "land" ? "varying vec2 vWxLand;\n" : ""}${water ? "varying float vWxSide;\n" : ""}${kind === "water" || kind === "under" ? "varying float vWxDepth;\nvarying vec4 vWxFlow;\n" : ""}${own ? "uniform float wxCarSnow;\n" : ""}`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `${own ? FRAG.replaceAll("wxSnow", "wxCarSnow") : FRAG}\n#include <emissivemap_fragment>`,
    );
}

/** The grass's detail (W3): fine blades light and dark, soft clumps, a little clover and a few small
 *  flowers, all grey (the colour's the shader's), tileable — drawn once (the approved mock's). */
export function grassTexture(): CanvasTexture {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // (each mark drawn wrapped: no seam)
  const wrap = (x: number, y: number, f: (x: number, y: number) => void) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) f(x + dx, y + dy);
  };
  g.fillStyle = "#d4d4d4";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 6 + rnd() * 18;
    g.fillStyle = `rgba(150,150,150,${0.08 + rnd() * 0.1})`;
    wrap(x, y, (x, y) => {
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    });
  }
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const l = 1.5 + rnd() * 3;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
    const v = rnd() < 0.5 ? 228 + rnd() * 22 : 180 + rnd() * 25;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.8 + rnd() * 0.7;
    wrap(x, y, (x, y) => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    });
  }
  g.fillStyle = "rgba(240,240,240,0.7)";
  for (let i = 0; i < 70; i++)
    wrap(rnd() * S, rnd() * S, (x, y) => {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x + Math.cos(k * 2.1) * 2.2, y + Math.sin(k * 2.1) * 2.2, 2.2, 0, 7);
        g.fill();
      }
    });
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 26; i++)
    wrap(rnd() * S, rnd() * S, (x, y) => {
      g.beginPath();
      g.arc(x, y, 1.6, 0, 7);
      g.fill();
    });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** The shadow pass's material for anything with snow pieces in it: their press, so a slab's
 *  shadow grows with it. */
let depth: MeshDepthMaterial | null = null;
export function wxDepth(): MeshDepthMaterial {
  if (!depth) {
    depth = new MeshDepthMaterial();
    depth.onBeforeCompile = (sh) => pressShader(sh);
    depth.customProgramCacheKey = () => "wx-depth";
  }
  return depth;
}
/** A mesh that may hold snow: its shadow pressed as it is. */
export function snowShadow<M extends Mesh>(m: M): M {
  if (isSnow(m.geometry)) m.customDepthMaterial = wxDepth();
  return m;
}

// ── the client's side: the room's ground, eased ──

/** The snow lying as the view shows it: the room's (it steps it each second), eased over a few
 *  seconds; going (`melt`) when it's been falling a while, coming when it rises — over two
 *  minutes, so a turn doesn't jump. A first one, or an admin's call made now, sets it at once. */
export class WxEase {
  private snow = -1;
  private melt = 0;
  private ref = 0;
  private refAt = 0;
  step(dt: number, snow: number, now = Date.now()) {
    if (wxHold.on) return;
    // (the first time, or a jump only a call makes — "now" — at once; the rule's steps eased)
    if (this.snow < 0 || Math.abs(snow - this.snow) > 0.25) {
      this.snow = snow;
      this.ref = snow;
      this.refAt = now;
    } else this.snow += (snow - this.snow) * Math.min(1, dt / 2);
    // (which way it's going: over the last half minute)
    if (now - this.refAt > 30_000 || Math.abs(snow - this.ref) > 0.02) {
      const d = snow - this.ref;
      if (d < -1e-3) this.want = 1;
      else if (d > 1e-3) this.want = 0;
      this.ref = snow;
      this.refAt = now;
    }
    this.melt += (this.want - this.melt) * Math.min(1, dt / 120);
    if (Math.abs(this.want - this.melt) < 1e-3) this.melt = this.want;
    wx.wxSnow.value = this.snow;
    wx.wxMelt.value = this.melt;
  }
  private want = 0;
  /** The icicles (W4: "only when it's been freezing after a thaw"): they grow over half an hour
   *  while it's freezing with the snow lying and its meltwater about, and drip away above +1 °C.
   *  The first time, at once. */
  icicles(dt: number, snow: number, wet: number, temp: number) {
    if (wxHold.on) return;
    const want = snow > 0.4 && wet > 0.2 && temp < -0.5 ? 1 : temp > 1 || snow < 0.2 ? 0 : wx.wxIcicle.value;
    if (this.iced)
      wx.wxIcicle.value +=
        Math.sign(want - wx.wxIcicle.value) * Math.min(Math.abs(want - wx.wxIcicle.value), dt / 1800);
    else wx.wxIcicle.value = want;
    this.iced = true;
  }
  private iced = false;
  /** At once (a call made now, the e2e's): no easing. */
  set(snow: number, melt = this.melt) {
    this.snow = snow;
    this.ref = snow;
    this.melt = this.want = melt;
    wx.wxSnow.value = snow;
    wx.wxMelt.value = melt;
  }
}
