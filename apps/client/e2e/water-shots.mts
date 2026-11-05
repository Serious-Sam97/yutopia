/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/66-the-water.md: the stills, in the game as Ana (the dev stack, :3100 and
// :8100, the machine's GPU), with a mock of the water patched into the 3D view from here — no game
// code. The mock (water-course.ts has its shape):
//   - S1: the land under the pond and the river carved (the drawn land lowered in its vertex shader
//     by the change from today's) and the river's level running downhill;
//   - S7: a new surface over it — faceted waves, depth colour, the flow's streaks, foam at the
//     shores and white water on the drops, an ink line where it meets the land, the sky by angle
//     and a sun glint, clear in the shallows (the bed seen through it), the ice in from the shores;
//     rings round a still swimmer;
//   - S8: under it — a green murk by how much of the view's ray is under the level (every fogged
//     material), caustics on what's under, the surface's underside (its window to the sky).
// The physics is today's (Ana stands where she stood): the camera is set by hand before each frame.
//   node --experimental-strip-types e2e/water-shots.mts [out dir]
//   QUALITY=medium: the Medium stills (noon only); SPOTS=pond,…; STATES=noon,…;
//   PROFILE=1: only the river's profile; SHEETS=1: only the contact sheets; REAL=1: the game's own
//   water (phase 5), no mock — into design/screens/water/game
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page, request } from "@playwright/test";
import { landBounds, POND, POND_LEVEL, RIVER, terrainAt } from "@yutopia/shared/grounds";
import { along, delta, level, nearRiver, slope, speed, waterAt } from "./water-course.mts";

// (the land's box: shared land.ts — docs/plan/69)
const GROUNDS = landBounds();

const out = resolve(
  process.argv[2] ?? (process.env.REAL ? "../../design/screens/water/game" : "../../design/screens/water"),
);
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const OX = 60; // the land's coords → the scene's (the Grounds' group)
const OY = -0.05;
const OZ = 10;

// ── the profile: today's bed, the new level and bed, the banks, along the river (north → south) ──
function profile(): string {
  const W = 1800;
  const panel = (y0: number, h: number, lo: number, hi: number) => ({
    y: (v: number) => y0 + h - ((v - lo) / (hi - lo)) * h,
    y0,
    h,
    lo,
    hi,
  });
  const Z0 = -1000;
  const Z1 = 215;
  const X = (z: number) => 70 + ((z - Z0) / (Z1 - Z0)) * (W - 100);
  const L = RIVER.line;
  const big = panel(70, 470, -9, 8);
  const all = panel(610, 170, -9, 48);
  const path = (P: typeof big, f: (i: number) => number, step = 2) => {
    let d = "";
    for (let i = 0; i < L.length; i += step) {
      const v = Math.max(P.lo - 1, Math.min(P.hi + 1, f(i)));
      d += `${d ? "L" : "M"}${X(L[i][1]).toFixed(1)},${P.y(v).toFixed(1)}`;
    }
    return d;
  };
  const bank = (i: number) => {
    const [x, z] = L[i];
    const n = L[Math.min(L.length - 1, i + 1)];
    const p = L[Math.max(0, i - 1)];
    const tx = n[0] - p[0];
    const tz = n[1] - p[1];
    const l = Math.hypot(tx, tz) || 1;
    return Math.min(terrainAt(x - (tz / l) * 26, z + (tx / l) * 26), terrainAt(x + (tz / l) * 26, z - (tx / l) * 26));
  };
  const deep = (i: number) => {
    const w = waterAt(L[i][0], L[i][1]);
    return w ? w.level - w.depth : level[i];
  };
  const fill = (P: typeof big) => {
    let d = "";
    for (let i = 0; i < L.length; i += 2)
      d += `${d ? "L" : "M"}${X(L[i][1]).toFixed(1)},${P.y(Math.min(P.hi + 1, level[i])).toFixed(1)}`;
    for (let i = L.length - 1; i >= 0; i -= 2)
      d += `L${X(L[i][1]).toFixed(1)},${P.y(Math.max(P.lo - 1, deep(i))).toFixed(1)}`;
    return `${d}Z`;
  };
  // the drops: where the level falls fast (white water)
  const drops: [number, number][] = [];
  for (let i = 0; i < L.length; i++)
    if (slope[i] > 0.04) {
      const last = drops[drops.length - 1];
      if (last && L[i][1] - last[1] < 6) last[1] = L[i][1];
      else drops.push([L[i][1], L[i][1]]);
    }
  const grid = (P: typeof big, every: number) => {
    let s = "";
    for (let v = Math.ceil(P.lo / every) * every; v <= P.hi; v += every)
      s += `<line x1="70" x2="${W - 30}" y1="${P.y(v)}" y2="${P.y(v)}" stroke="#2c3138"/><text x="62" y="${P.y(v) + 4}" text-anchor="end">${v} m</text>`;
    return s;
  };
  const zs = (P: typeof big) => {
    let s = "";
    for (let z = -1000; z <= 200; z += 100)
      s += `<line x1="${X(z)}" x2="${X(z)}" y1="${P.y0}" y2="${P.y0 + P.h}" stroke="#2c3138"/><text x="${X(z)}" y="${P.y0 + P.h + 16}" text-anchor="middle">z ${z}</text>`;
    return s;
  };
  const mark = (z: number, label: string, P = big, col = "#c9a24a") =>
    `<line x1="${X(z)}" x2="${X(z)}" y1="${P.y0}" y2="${P.y0 + P.h}" stroke="${col}" stroke-dasharray="4 4"/><text x="${X(z) + 4}" y="${P.y0 + 14}" fill="${col}">${label}</text>`;
  const span = (z0: number, z1: number, label: string, y: number) =>
    `<rect x="${X(z0)}" y="${big.y0}" width="${Math.max(2, X(z1) - X(z0))}" height="${big.h}" fill="#ffffff" opacity="0.06"/><text x="${(X(z0) + X(z1)) / 2}" y="${y}" text-anchor="middle" fill="#eee">${label}</text>`;
  const cut = level.reduce((m, v, i) => Math.max(m, RIVER.h[i] - v), 0);
  const deck = { z: -404.6, h: 1.53 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="830" font-family="system-ui" font-size="13" fill="#bbb">
<rect width="100%" height="100%" fill="#16181b"/>
<text x="70" y="30" font-size="20" fill="#eee">The river, north → south (plan 66, S1): today's bed, the new level and bed</text>
<text x="70" y="52">x: z along the river (north at the left). Deepest cut below today's bed ${cut.toFixed(1)} m. Water: between the level and the bed's middle (2.8 m deep on the reaches, shallow on the drops).</text>
${grid(big, 2)}${zs(big)}
${span(-1000, -904, "the falls ↑ (44 m → 0.4)", big.y0 + 40)}
${drops.map(([a, b]) => `<rect x="${X(a)}" y="${big.y0}" width="${Math.max(2, X(b) - X(a))}" height="${big.h}" fill="#e8f2f0" opacity="0.10"/>`).join("")}
${span(-605, -579, "the rapid", big.y0 + 40)}
${span(-579, 104, "the long reach (deep, slow)", big.y0 + 60)}
${span(104, 215, "the cut / culvert?", big.y0 + 40)}
${mark(-580, "today's old land edge")}${mark(172, "the land's edge")}${mark(GROUNDS.z0, "the Grounds' north edge", big, "#7c8a99")}
<clipPath id="bigc"><rect x="70" y="${big.y0}" width="${W - 100}" height="${big.h}"/></clipPath><g clip-path="url(#bigc)">
<path d="${fill(big)}" fill="#1f6f78" opacity="0.55"/>
<path d="${path(big, bank)}" stroke="#7aa35a" stroke-width="1.5" fill="none"/>
<path d="${path(big, (i) => RIVER.h[i])}" stroke="#9aa0a6" stroke-width="2" fill="none" stroke-dasharray="6 3"/>
<path d="${path(big, (i) => level[i])}" stroke="#58c7e0" stroke-width="2.5" fill="none"/>
<path d="${path(big, deep)}" stroke="#2c8f9a" stroke-width="1.5" fill="none"/></g>
<rect x="${X(deck.z) - 6}" y="${big.y(deck.h)}" width="12" height="4" fill="#e0b060"/><text x="${X(deck.z) + 10}" y="${big.y(deck.h) - 4}" fill="#e0b060">the county road bridge's deck</text>
<g transform="translate(${W - 430},${big.y0 + big.h - 96})"><rect width="400" height="90" fill="#1d2025" stroke="#333"/>
<line x1="10" x2="40" y1="18" y2="18" stroke="#9aa0a6" stroke-width="2" stroke-dasharray="6 3"/><text x="48" y="22">today's bed (= today's water: it runs uphill)</text>
<line x1="10" x2="40" y1="38" y2="38" stroke="#58c7e0" stroke-width="2.5"/><text x="48" y="42">the new level (never rising southwards)</text>
<line x1="10" x2="40" y1="58" y2="58" stroke="#2c8f9a" stroke-width="1.5"/><text x="48" y="62">the new bed, its middle</text>
<line x1="10" x2="40" y1="78" y2="78" stroke="#7aa35a" stroke-width="1.5"/><text x="48" y="82">the land 26 m off its middle (the banks' top)</text></g>
<text x="70" y="${all.y0 - 10}" font-size="15" fill="#eee">The whole height (the falls)</text>
${grid(all, 10)}${zs(all)}
<path d="${path(all, bank)}" stroke="#7aa35a" stroke-width="1.5" fill="none"/>
<path d="${path(all, (i) => RIVER.h[i])}" stroke="#9aa0a6" stroke-width="2" fill="none" stroke-dasharray="6 3"/>
<path d="${path(all, (i) => level[i])}" stroke="#58c7e0" stroke-width="2.5" fill="none"/>
</svg>`;
}

// ── the land round a spot: the land's change and the water's level, 1 m a texel, MAP m square ──
// r g b: the change ((Δ + 32) × 100, 12 bits) then the level ((lv + 20) × 50, 12 bits; 0: no water)
const MAP = 640;
function landTex(cx: number, cz: number): { data: string; x0: number; z0: number } {
  const x0 = Math.round(cx - MAP / 2);
  const z0 = Math.round(cz - MAP / 2);
  const px = new Uint8Array(MAP * MAP * 4);
  for (let j = 0; j < MAP; j++)
    for (let i = 0; i < MAP; i++) {
      const x = x0 + i;
      const z = z0 + j;
      const d = Math.round((Math.max(-31.9, Math.min(8, delta(x, z))) + 32) * 100);
      const w = waterAt(x, z);
      const lv = w ? Math.max(1, Math.round((Math.min(61, w.level + OY) + 20) * 50)) : 0;
      const k = (j * MAP + i) * 4;
      px[k] = d >> 4;
      px[k + 1] = ((d & 15) << 4) | (lv >> 8);
      px[k + 2] = lv & 255;
      px[k + 3] = 255;
    }
  return { data: Buffer.from(px).toString("base64"), x0, z0 };
}

// ── the water's surface near a spot (the land's coords): positions, depth, flow ──
interface Mesh {
  p: number[];
  depth: number[];
  flow: number[]; // along, side, speed, 0
  dir: number[];
  idx: number[];
}
function riverMesh(cx: number, cz: number, r = 420): Mesh {
  const L = RIVER.line;
  const m: Mesh = { p: [], depth: [], flow: [], dir: [], idx: [] };
  const COLS = 26;
  let rows = 0;
  for (let i = 0; i < L.length; i++) {
    if (Math.hypot(L[i][0] - cx, L[i][1] - cz) > r) continue;
    const a = L[Math.max(0, i - 1)];
    const b = L[Math.min(L.length - 1, i + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / tl;
    const tz = (b[1] - a[1]) / tl;
    // (its left: three's, +x at yaw 0 facing +z)
    const nx = -tz;
    const nz = tx;
    for (let c = 0; c <= COLS; c++) {
      const off = -13 + (26 * c) / COLS;
      const x = L[i][0] + nx * off;
      const z = L[i][1] + nz * off;
      const land = terrainAt(x, z) + delta(x, z);
      m.p.push(x, level[i], z);
      m.depth.push(level[i] - land);
      m.flow.push(along[i], off / 11, speed[i], 0);
      m.dir.push(tx, tz);
    }
    if (rows > 0) {
      const s = (rows - 1) * (COLS + 1);
      for (let c = 0; c < COLS; c++) {
        const a0 = s + c;
        const b0 = s + COLS + 1 + c;
        m.idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
    rows++;
  }
  return m;
}
function pondMesh(): Mesh {
  const m: Mesh = { p: [], depth: [], flow: [], dir: [], idx: [] };
  const A = 120;
  const R = 40;
  for (let k = 0; k <= R; k++) {
    const r = (1.06 * k) / R;
    for (let a = 0; a < A; a++) {
      const t = (a / A) * Math.PI * 2;
      const x = POND.cx + Math.cos(t) * POND.rx * r;
      const z = POND.cz + Math.sin(t) * POND.rz * r;
      m.p.push(x, POND_LEVEL, z);
      m.depth.push(POND_LEVEL - (terrainAt(x, z) + delta(x, z)));
      m.flow.push(t * 30, r, 0, 1);
      m.dir.push(0.8, 0.6);
    }
    if (k > 0)
      for (let a = 0; a < A; a++) {
        const i0 = (k - 1) * A + a;
        const i1 = (k - 1) * A + ((a + 1) % A);
        const o0 = k * A + a;
        const o1 = k * A + ((a + 1) % A);
        m.idx.push(i0, i1, o0, i1, o1, o0);
      }
  }
  return m;
}
// reeds: thin blades in clumps where the water's shallow by the pond and the river's slow reach
function reeds(cx: number, cz: number): { p: number[]; c: number[] } {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const p: number[] = [];
  const c: number[] = [];
  for (let n = 0; n < 9000 && p.length < 9 * 2600; n++) {
    const x = cx + (rnd() - 0.5) * 520;
    const z = cz + (rnd() - 0.5) * 520;
    const w = waterAt(x, z);
    if (!w || w.depth > 0.5 || w.depth < 0.04 || w.speed > 0.6) continue;
    if (rnd() < 0.55) continue;
    const blades = 5 + Math.floor(rnd() * 7);
    for (let b = 0; b < blades; b++) {
      const bx = x + (rnd() - 0.5) * 0.9;
      const bz = z + (rnd() - 0.5) * 0.9;
      const y0 = w.level - w.depth;
      const h = w.depth + 0.6 + rnd() * 1.1;
      const lean = rnd() * Math.PI * 2;
      const lx = Math.cos(lean) * 0.25 * rnd();
      const lz = Math.sin(lean) * 0.25 * rnd();
      const a = rnd() * Math.PI;
      const wx = Math.cos(a) * 0.035;
      const wz = Math.sin(a) * 0.035;
      p.push(bx - wx, y0, bz - wz, bx + wx, y0, bz + wz, bx + lx, y0 + h, bz + lz);
      const g = 0.55 + rnd() * 0.25;
      const col = rnd() < 0.3 ? [0.55 * g, 0.5 * g, 0.28 * g] : [0.32 * g, 0.45 * g, 0.2 * g];
      for (let v = 0; v < 3; v++) c.push(...col);
    }
  }
  return { p, c };
}

// ── the shader text ──
const COMMON = `
uniform sampler2D uwTex; uniform vec2 uwO; uniform float uwT; uniform float uwCamLv; uniform vec3 uwCol;
uniform float uwK; uniform float uwSun;
float uwLevelAt(vec2 w) {
  ivec2 c = ivec2(floor(w - uwO + 0.5));
  if (c.x < 0 || c.y < 0 || c.x >= ${MAP} || c.y >= ${MAP}) return -1000.0;
  vec3 t = floor(texelFetch(uwTex, c, 0).rgb * 255.0 + 0.5);
  float q = mod(t.g, 16.0) * 256.0 + t.b;
  return q < 0.5 ? -1000.0 : q / 50.0 - 20.0;
}
float uwH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uwN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwH(i), uwH(i + vec2(1.0, 0.0)), f.x), mix(uwH(i + vec2(0.0, 1.0)), uwH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float uwCaustic(vec2 p, float t) {
  float a = uwN(p * 1.3 + vec2(t * 0.25, -t * 0.18));
  float b = uwN(p * 1.7 + vec2(-t * 0.2, t * 0.22) + 7.0);
  float v = 1.0 - abs(a - b) * 3.2;
  return pow(clamp(v, 0.0, 1.0), 6.0);
}
`;
// after the fog: the murk by how much of the ray from the camera is under the water's level
const UW = `
#ifdef USE_FOG
{
  vec3 P = vFogW; // (the fog's: where it is in the world)
  vec3 Rv = vFogW - cameraPosition;
  float Lr = length(Rv);
  float lv = uwLevelAt(P.xz);
  float d = 0.0;
  float under = 0.0;
  if (cameraPosition.y < uwCamLv) {
    d = P.y < uwCamLv ? Lr : Lr * clamp((uwCamLv - cameraPosition.y) / max(Rv.y, 1e-3), 0.0, 1.0);
    under = P.y < uwCamLv ? 1.0 : 0.0;
  } else if (lv > -999.0 && P.y < lv - 0.02) {
    d = Lr * clamp((lv - P.y) / max(cameraPosition.y - P.y, 1e-3), 0.0, 1.0);
    under = 1.0;
  }
#ifndef UW_SURFACE
  if (under > 0.5) {
    float deepK = clamp((max(lv, uwCamLv) - P.y) / 3.0, 0.0, 1.0);
    // (seen from over the water, through it, fainter)
    float seen = cameraPosition.y < uwCamLv ? 1.0 : 0.45;
    gl_FragColor.rgb += uwSun * uwCaustic(P.xz, uwT) * (0.45 - 0.25 * deepK) * seen * vec3(0.8, 1.0, 0.9);
  }
#endif
  if (d > 0.0) {
    float a = 1.0 - exp(-uwK * d);
    float up = clamp(normalize(Rv).y * 0.5 + 0.5, 0.0, 1.0);
    vec3 murk = uwCol * mix(0.35, 2.2, up * up);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.55, 0.85, 0.8), murk, a);
  }
}
#endif
`;
// the land the mock carved: wet mud and stones, by how far it was lowered (before the fog)
const MUD = `
{
  float k = smoothstep(0.05, 0.6, vUwCut);
  float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));
  float lvH = uwLevelAt(vFogW.xz);
  float wet = lvH > -999.0 && vFogW.y < lvH ? 1.0 : 0.0;
  vec3 mud = lum * mix(vec3(1.05, 0.86, 0.62) * 0.95, vec3(1.25, 1.12, 0.85) * 1.5, wet);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mud, k);
}
`;
const WATER_V = `
attribute float aDepth; attribute vec4 aFlow; attribute vec2 aDir;
uniform float uIce;
varying float vD; varying vec4 vF; varying vec2 vWp; varying float vIced;
`;
const WATER_BEGIN = `
#include <begin_vertex>
{
  vec2 p = position.xz;
  float sp = aFlow.z;
  float calm = smoothstep(0.0, 0.7, aDepth);
  vec2 nr = vec2(-aDir.y, aDir.x);
  float s1 = dot(p, aDir);
  float s2 = dot(p, nr);
  float side = aFlow.w > 0.5 ? aFlow.y : abs(aFlow.y);
  vIced = (1.0 - min(side, 1.0)) <= uIce * 1.02 - 0.01 ? 1.0 : 0.0;
  float w = 0.06 * sin(s1 * 0.9 - uwT * (1.1 + sp * 2.2) + s2 * 0.35)
    + 0.045 * sin(dot(p, vec2(0.61, -0.79)) * 1.3 + uwT * 0.8)
    + 0.03 * sin(dot(p, vec2(-0.83, 0.55)) * 2.1 - uwT * 1.3);
  w *= (0.45 + 0.55 * calm) * (1.0 + sp * 0.7) * (1.0 - vIced);
  transformed.y += w;
  vD = aDepth; vF = aFlow; vWp = p;
}
`;
const WATER_F = `
uniform float uIce; uniform float uRain; uniform vec3 uSunV; uniform vec3 uSunCol; uniform vec3 uSkyH; uniform vec3 uSkyZ;
uniform vec3 uSwim; uniform float uLit;
varying float vD; varying vec4 vF; varying vec2 vWp; varying float vIced;
`;
const WATER_COLOUR = `
#include <color_fragment>
float wFoam = 0.0;
float wIce = vIced;
{
  float d = vD;
  float sp = vF.z;
  vec3 shal = vec3(0.04, 0.12, 0.10);
  vec3 deep = vec3(0.004, 0.022, 0.028);
  vec3 c = mix(shal, deep, smoothstep(0.4, 2.6, d));
  float a = mix(0.28, 0.93, smoothstep(0.0, 1.6, d));
  // the flow's streaks, travelling with it
  float n1 = uwN(vec2(vF.x * 0.32 - uwT * sp * 0.32, vF.y * 9.0));
  c += step(0.8, n1) * smoothstep(0.15, 0.6, sp) * 0.05;
  // foam: the shore's lapping line, white water where it's fast
  float lap = 0.05 * sin(uwT * 1.4 + vWp.x * 0.45 + vWp.y * 0.3);
  float edge = 1.0 - smoothstep(0.06, 0.24, d + lap);
  float fn = uwN(vWp * 1.9 + vec2(0.0, -uwT * (0.15 + sp * 0.5)));
  wFoam = edge * step(0.42, fn) * step(0.035, d);
  float wn = uwN(vec2(vF.x * 0.9 - uwT * sp * 0.7, vF.y * 6.0 + vF.x * 0.1));
  wFoam = max(wFoam, smoothstep(1.0, 2.2, sp) * step(0.32, wn));
  // rings and a wake round a still swimmer
  if (uSwim.z > 0.5) {
    float r = distance(vWp, uSwim.xy);
    float ring = 1.0 - smoothstep(0.03, 0.09, abs(r - 0.42));
    for (int k = 0; k < 2; k++) {
      float t = fract(uwT * 0.45 + float(k) * 0.5);
      ring = max(ring, (1.0 - smoothstep(0.02, 0.07, abs(r - 0.45 - t * 2.2))) * (1.0 - t));
    }
    wFoam = max(wFoam, ring * 0.9);
  }
  // the rain's rings
  if (uRain > 0.01) {
    vec2 cell = floor(vWp * 1.3);
    vec2 f = fract(vWp * 1.3);
    float h = uwH(cell);
    float t = fract(uwT * (1.1 + h) + h * 7.0);
    vec2 cc = vec2(0.25 + 0.5 * uwH(cell + 3.1), 0.25 + 0.5 * uwH(cell + 7.7));
    float rr = (1.0 - smoothstep(0.0, 0.05, abs(length(f - cc) - t * 0.4))) * (1.0 - t) * step(h, uRain);
    c += rr * 0.12;
  }
  c = mix(c, vec3(0.75, 0.8, 0.78), wFoam);
  a = max(a, wFoam * 0.95);
  // the ink where it meets the land
  float ink = 1.0 - smoothstep(0.0, 0.06, abs(d));
  c = mix(c, vec3(0.06, 0.08, 0.09), ink * 0.8);
  a = max(a, ink);
  if (wIce > 0.5) { c = vec3(0.78, 0.85, 0.9) * (0.92 + 0.08 * uwN(vWp * 0.7)); a = 1.0; wFoam = 0.0; }
  diffuseColor.rgb = c;
  diffuseColor.a = a;
}
`;
const WATER_LIGHT = `
#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - max(dot(normal, V), 0.0), 3.0);
  vec3 sky = mix(uSkyH, uSkyZ, 0.4);
  float open = (1.0 - wFoam) * (1.0 - wIce);
  totalEmissiveRadiance += sky * (0.015 + 0.32 * fres) * open;
  vec3 R = reflect(-V, normal);
  float g = max(dot(R, uSunV), 0.0);
  float glint = (step(0.992, g) * 1.4 + pow(g, 60.0) * 0.4) * open;
  totalEmissiveRadiance += uSunCol * glint;
  diffuseColor.a = max(diffuseColor.a, min(1.0, fres * 0.85 + glint));
  diffuseColor.rgb *= uLit;
  totalEmissiveRadiance *= mix(uLit, 1.0, min(1.0, glint));
}
`;
// the surface from under it: bright, the sky through its window overhead, green past it
const UNDER_LIGHT = `
#include <emissivemap_fragment>
{
  vec3 f = normalize(vFogW - cameraPosition);
  float win = smoothstep(0.62, 0.72, f.y);
  float rip = uwN(vWp * 1.2 + vec2(uwT * 0.2, -uwT * 0.15));
  // past the window the surface mirrors the murk under it, silvered; inside it the sky, bright
  vec3 c = mix(uwCol * (3.0 + 1.6 * rip), uSkyZ * (1.1 + 0.4 * rip) + vec3(0.04), win);
  c += (1.0 - smoothstep(0.0, 0.035, abs(f.y - 0.66))) * vec3(0.35, 0.45, 0.42);
  c = mix(c, uwCol * 2.0, 1.0 - exp(-uwK * 0.45 * length(vFogW - cameraPosition)));
  diffuseColor.rgb = vec3(0.0);
  totalEmissiveRadiance = c;
}
`;

interface Setup {
  tex: { data: string; x0: number; z0: number };
  river: Mesh;
  pond: Mesh | null;
  reeds: { p: number[]; c: number[] };
}
/** The mock put into the view (once a spot: the land round it, the water near it). */
async function mock(p: Page, s: Setup) {
  await p.evaluate(
    ([s, src, o]) => {
      const win = window as any;
      const w = win.__yutopia;
      const tp = w.tp;
      const g = tp.around.grounds;
      let waterMesh: any = null;
      tp.scene.traverse((m: any) => {
        if (m.isMesh && m.material?.userData?.wx === "water" && !waterMesh) waterMesh = m;
      });
      const Geo = waterMesh.geometry.constructor;
      const BA = waterMesh.geometry.attributes.position.constructor;
      const MeshC = waterMesh.constructor;
      const Lam = waterMesh.material.constructor;
      const Tex = g.snowTex.constructor;
      const V3 = tp.camera.position.constructor;
      const Col = tp.scene.fog.color.constructor;
      let U = win.__uw;
      // (the game has them off: a mock's broken shader would draw nothing, silently)
      tp.renderer.debug.checkShaderErrors = true;
      if (!U) {
        U = {
          uwTex: { value: null },
          uwO: { value: [0, 0] },
          uwT: { value: 0 },
          uwCamLv: { value: -1000 },
          uwCol: { value: new Col(0.02, 0.09, 0.08) },
          uwK: { value: 0.14 },
          uwSun: { value: 1 },
          uIce: { value: 0 },
          uRain: { value: 0 },
          uSunV: { value: new V3(0, 1, 0) },
          uSunCol: { value: new Col(1, 1, 1) },
          uSkyH: { value: new Col(0.6, 0.7, 0.8) },
          uSkyZ: { value: new Col(0.4, 0.55, 0.75) },
          uSwim: { value: new V3(0, 0, 0) },
          uLit: { value: 1 },
        };
        win.__uw = U;
        const t0 = performance.now();
        const tick = () => {
          U.uwT.value = (performance.now() - t0) / 1000;
          requestAnimationFrame(tick);
        };
        tick();
        // the camera: set by hand before each frame (win.__uwCam: {from, to}); the sun's way in its
        // space for the glint, the level at the camera for the murk
        const post = tp.post;
        const r0 = post.render.bind(post);
        post.render = (moving: boolean, over: any) => {
          const c = win.__uwCam;
          const cam = tp.camera;
          if (c) {
            cam.position.set(c.from[0], c.from[1], c.from[2]);
            cam.lookAt(c.to[0], c.to[1], c.to[2]);
            cam.updateMatrixWorld(true);
            U.uwCamLv.value = c.lv ?? -1000;
          }
          let sun: any = null;
          tp.scene.traverse((l: any) => {
            if (l.isDirectionalLight && l.castShadow && !sun) sun = l;
          });
          if (sun) {
            const d = new V3().subVectors(sun.position, sun.target.position).normalize();
            const up = Math.max(0, d.y);
            d.transformDirection(cam.matrixWorldInverse);
            U.uSunV.value.copy(d);
            U.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.6, sun.intensity * 2.2) * Math.min(1, up * 6));
            U.uwSun.value = Math.min(1, sun.intensity * 2.5) * Math.min(1, up * 4);
          }
          const f = tp.scene.fog.color;
          U.uSkyH.value.copy(f);
          U.uSkyZ.value.setRGB(f.r * 0.72, f.g * 0.84, Math.min(1, f.b * 1.08));
          const lum = f.r * 0.3 + f.g * 0.55 + f.b * 0.15;
          U.uLit.value = Math.min(1, Math.max(0.04, lum * 2.2));
          U.uwCol.value.setRGB(0.012, 0.05, 0.048).multiplyScalar(Math.min(1.6, 0.1 + lum * 2.2));
          return r0(moving, over);
        };
      }
      // (REAL: the game's own water — plan 66 phase 5 — only the camera's set by hand)
      win.__uwReal = o.REAL;
      if (o.REAL) return;
      // the land's change and the level round this spot
      const cv = document.createElement("canvas");
      cv.width = o.MAP;
      cv.height = o.MAP;
      const cx = cv.getContext("2d") as CanvasRenderingContext2D;
      const bytes = Uint8ClampedArray.from(atob(s.tex.data), (ch) => ch.charCodeAt(0));
      cx.putImageData(new ImageData(bytes, o.MAP, o.MAP), 0, 0);
      const t = new Tex(cv);
      t.generateMipmaps = false;
      t.minFilter = t.magFilter = 1003; // Nearest
      t.flipY = false;
      t.needsUpdate = true;
      U.uwTex.value?.dispose?.();
      U.uwTex.value = t;
      U.uwO.value = [s.tex.x0 + o.OX, s.tex.z0 + o.OZ];
      // every fogged material: the murk; the land: lowered by the change
      const patch = (m: any) => {
        if (m.__uw || !m.fog || m.isRawShaderMaterial || m.blending === 2) return;
        m.__uw = true;
        const land = m === g.landMat;
        const prev = m.onBeforeCompile;
        const key0 = m.customProgramCacheKey;
        m.onBeforeCompile = (sh: any, r: any) => {
          prev.call(m, sh, r);
          if (
            !sh.fragmentShader.includes("#include <fog_fragment>") ||
            !sh.vertexShader.includes("#include <fog_vertex>")
          )
            return;
          // (a clone of a patched material carries the hook twice)
          if (sh.fragmentShader.includes("uwLevelAt")) return;
          Object.assign(sh.uniforms, U);
          sh.fragmentShader = sh.fragmentShader
            .replace(
              "#include <fog_pars_fragment>",
              `#include <fog_pars_fragment>\n${src.COMMON}${land ? "\nvarying float vUwCut;" : ""}`,
            )
            .replace("#include <fog_fragment>", `${land ? src.MUD : ""}#include <fog_fragment>\n${src.UW}`);
          if (land)
            sh.vertexShader = sh.vertexShader
              .replace(
                "#include <common>",
                `#include <common>\nuniform sampler2D uwTex; uniform vec2 uwO; varying float vUwCut;`,
              )
              .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  ivec2 c = ivec2(floor(wp.xz - uwO + 0.5));
  if (c.x >= 0 && c.y >= 0 && c.x < ${o.MAP} && c.y < ${o.MAP}) {
    vec3 t = floor(texelFetch(uwTex, c, 0).rgb * 255.0 + 0.5);
    float q = t.r * 16.0 + floor(t.g / 16.0);
    transformed.y += q / 100.0 - 32.0;
    vUwCut = 32.0 - q / 100.0;
  }
}`,
              );
        };
        m.customProgramCacheKey = () => `${key0.call(m)}|uw${land ? "L" : ""}`;
        m.needsUpdate = true;
      };
      tp.scene.traverse((m: any) => {
        const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mt of ms) patch(mt);
        // today's water and ice: hidden
        if (m.isMesh && (m.material?.userData?.wx === "water" || m.material?.userData?.wx === "ice") && !m.__uwNew)
          m.visible = false;
      });
      // the new surface (and its underside)
      for (const old of win.__uwMeshes ?? []) {
        old.parent?.remove(old);
        old.geometry.dispose();
      }
      win.__uwMeshes = [];
      const geo = (ms: any) => {
        const gg = new Geo();
        gg.setAttribute("position", new BA(new Float32Array(ms.p), 3));
        gg.setAttribute("aDepth", new BA(new Float32Array(ms.depth), 1));
        gg.setAttribute("aFlow", new BA(new Float32Array(ms.flow), 4));
        gg.setAttribute("aDir", new BA(new Float32Array(ms.dir), 2));
        gg.setIndex(ms.idx);
        gg.computeVertexNormals();
        return gg;
      };
      const mat = (under: boolean) => {
        const m = new Lam({ color: 0xffffff, transparent: !under, flatShading: true, side: under ? 1 : 0 });
        m.onBeforeCompile = (sh: any) => {
          Object.assign(sh.uniforms, U);
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", `#include <common>\nuniform float uwT;\n${src.WATER_V}`)
            .replace("#include <begin_vertex>", src.WATER_BEGIN);
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", `#include <common>\n${src.WATER_F}`)
            .replace("#include <color_fragment>", src.WATER_COLOUR)
            .replace("#include <emissivemap_fragment>", under ? src.UNDER_LIGHT : src.WATER_LIGHT)
            .replace("#include <fog_pars_fragment>", `#include <fog_pars_fragment>\n${src.COMMON}`)
            .replace(
              "#include <fog_fragment>",
              `#include <fog_fragment>\n${under ? "" : `#define UW_SURFACE\n${src.UW}`}`,
            );
        };
        m.customProgramCacheKey = () => (under ? "uw-under" : "uw-water");
        return m;
      };
      const add = (gg: any, m: any) => {
        const mesh = new MeshC(gg, m);
        mesh.__uwNew = true;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        // (in a group of its own on the scene: the Grounds' own group's materials are patched again by
        // the game, which takes the mock's shader off)
        if (!win.__uwRoot) {
          win.__uwRoot = new waterMesh.parent.constructor();
          win.__uwRoot.position.copy(waterMesh.parent.getWorldPosition(new V3()));
          tp.scene.add(win.__uwRoot);
        }
        win.__uwRoot.add(mesh);
        win.__uwMeshes.push(mesh);
      };
      win.__uwMat ??= [mat(false), mat(true)];
      for (const ms of [s.river, s.pond]) {
        if (!ms || !ms.p.length) continue;
        const gg = geo(ms);
        add(gg, win.__uwMat[0]);
        add(gg, win.__uwMat[1]);
      }
      if (s.reeds.p.length) {
        const gg = new Geo();
        gg.setAttribute("position", new BA(new Float32Array(s.reeds.p), 3));
        gg.setAttribute("color", new BA(new Float32Array(s.reeds.c), 3));
        gg.computeVertexNormals();
        win.__uwReedMat ??= new Lam({ vertexColors: true, side: 2 });
        add(gg, win.__uwReedMat);
      }
    },
    [
      s,
      { COMMON, UW, MUD, WATER_V, WATER_BEGIN, WATER_F, WATER_COLOUR, WATER_LIGHT, UNDER_LIGHT },
      { MAP, OX, OZ },
    ] as const,
  );
}

interface State {
  name: string;
  hour: number;
  sky: "clear" | "rain" | "cloudy";
  fog?: "fog" | "mist";
  ice?: number;
}
const STATES: State[] = [
  { name: "noon", hour: 12, sky: "clear" },
  { name: "rain", hour: 12, sky: "rain" },
  { name: "dusk", hour: 19.25, sky: "clear" },
  { name: "night", hour: 22, sky: "clear" },
  { name: "fog", hour: 7, sky: "cloudy", fog: "fog" },
  { name: "ice50", hour: 12, sky: "clear", ice: 0.5 },
];
async function setState(p: Page, st: State) {
  await p.evaluate((st) => {
    const w = (window as any).__yutopia;
    w.room.send("mod:weather", { to: st.sky, now: true });
    w.room.send("mod:fog", { fog: st.fog ?? "clear", now: true });
  }, st);
  await p.waitForTimeout(1500);
  await p.evaluate((st) => {
    const win = window as any;
    const w = win.__yutopia;
    const tp = w.tp;
    w.updateNight = () => {};
    w.hour = st.hour;
    w.model?.setClock(st.hour);
    tp.setHour(st.hour);
    if (w.life) w.life.weather = () => [0, 0];
    win.__uw.uIce.value = st.ice ?? 0;
    win.__uw.uRain.value = st.sky === "rain" ? 0.8 : 0;
    // (the game's own: its ice as the state says — the room's, held here: the server's is 0, melted)
    if (win.__uwReal) w.room.state.weather.ice = st.ice ?? 0;
  }, st);
}

interface Spot {
  name: string;
  /** where Ana stands (the land's coords): the Grounds stream round her */
  at: [number, number];
  /** the camera (the land's coords, its height over the water's level there) and what it looks at */
  from: [number, number, number];
  to: [number, number, number];
  /** a still swimmer's rings here (the land's coords) */
  swim?: [number, number];
  /** under the water: the camera's below the level */
  under?: boolean;
  states?: string[];
}
// what a camera's height is over: the water there, or the land (as carved) where it's higher
const lvAt = (x: number, z: number) => Math.max(waterAt(x, z)?.level ?? -1000, terrainAt(x, z) + delta(x, z));
// the river's middle at z (the land's x), or off it (+ its left looking downstream)
const river = (z: number, off = 0): number => {
  const L = RIVER.line;
  let i = 0;
  for (let k = 0; k < L.length; k++) if (Math.abs(L[k][1] - z) < Math.abs(L[i][1] - z)) i = k;
  return L[i][0] - off;
};
const SPOTS: Spot[] = [
  // the pond from over its water by the south shore, across it (the dock to the left)
  { name: "pond", at: [-240, -100], from: [-234, 2.2, -88], to: [-246, 0, -40], swim: [-238, -66] },
  // the dock's end, looking out over the pond
  { name: "dock", at: [-240, -100], from: [-252, 2.6, -85], to: [-232, 0, -45], swim: [-246, -70] },
  // the long reach upstream of the county road bridge, over the water, looking down to it
  { name: "bridge", at: [236, -440], from: [river(-445), 3, -445], to: [river(-405), 2, -405] },
  // from the bridge, looking downstream (south)
  {
    name: "reach",
    at: [262, -395],
    from: [river(-398), 7.4, -398],
    to: [river(-330), 0, -330],
    swim: [river(-360, 3), -360],
  },
  // the rapid, from over the water below it, upstream
  { name: "rapid", at: [285, -568], from: [river(-562), 2.6, -562], to: [river(-600), 1, -600] },
  // the falls, from the pool at their foot, up them
  { name: "falls", at: [236, -892], from: [river(-886), 3, -886], to: [river(-940), 14, -940] },
  // the south: over the water, towards the cut through the hills at the land's edge
  { name: "south", at: [244, 118], from: [river(100), 3, 100], to: [river(190), 2, 190] },
  // under: the pond's middle, along the bed and up at the surface
  {
    name: "under-pond",
    at: [-240, -100],
    from: [-238, -2.2, -48],
    to: [-246, -3.6, -70],
    under: true,
    states: ["noon", "dusk"],
  },
  { name: "under-up", at: [-240, -100], from: [-240, -2.6, -55], to: [-243, 1.9, -60], under: true, states: ["noon"] },
  // under the river, looking upstream into the current
  {
    name: "under-river",
    at: [236, -440],
    from: [river(-380), -1.6, -380],
    to: [river(-420), -2.6, -420],
    under: true,
    states: ["noon"],
  },
];

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const ready = (p: Page) =>
  p.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 120_000 },
  );
async function open(browser: Browser): Promise<Page> {
  const tok = await token("ana@yutopia.test");
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("  page:", e.message));
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      console.log(
        "  console:",
        m
          .text()
          .match(/ERROR:[^\n]*/g)
          ?.join(" | ") ?? m.text().slice(0, 300),
      ),
  );
  await page.addInitScript(
    ([t, q]) => {
      localStorage.setItem("yutopia:token", t);
      localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
    },
    [tok, quality] as const,
  );
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));
  return page;
}
const go = async (p: Page, at: [number, number]) => {
  // (a spot under a tree or in the water is refused: the nearest one that isn't, round it)
  const tries: [number, number][] = [[0, 0]];
  for (const r of [8, 16, 28])
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      tries.push([dx * r, dz * r]);
  for (const [dx, dz] of tries) {
    const to = { x: at[0] + dx + OX, y: at[1] + dz + OZ, level: 0 };
    await p.evaluate((a) => (window as any).__yutopia.teleport(a), to);
    const there = await p
      .waitForFunction(
        (a) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return w.level === 0 && Math.hypot(m.x - a.x, m.y - a.y) < 6;
        },
        to,
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) {
      await p.waitForTimeout(9000);
      return;
    }
  }
  console.log(`  (couldn't get to ${at}: shot from where I am)`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-uwshot", "");
    if (!document.getElementById("uwshot-css")) {
      const s = document.createElement("style");
      s.id = "uwshot-css";
      s.textContent = "*:not(:has([data-uwshot])):not([data-uwshot]){visibility:hidden!important}";
      document.head.appendChild(s);
    }
  });
  const file = `${out}/${quality === "high" ? "" : `${quality}-`}${name}.png`;
  await p.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

async function sheets(browser: Browser) {
  const files = readdirSync(out).filter((f) => f.endsWith(".png") && !f.startsWith("sheet-") && f !== "profile.png");
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const k = f.startsWith("medium-") ? "medium" : f.startsWith("under-") ? "under" : f.split("-")[0];
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  }
  const order = (f: string) => {
    const s = STATES.findIndex((x) => f.endsWith(`-${x.name}.png`));
    return `${String(s).padStart(2, "0")}-${f}`;
  };
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  for (const [k, fs] of Object.entries(groups)) {
    fs.sort((a, b) => order(a).localeCompare(order(b)));
    const html = `<html><body style="margin:0;background:#1b1d20;font:14px system-ui;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px">
${fs.map((f) => `<figure style="margin:0"><img src="file://${out}/${f}" style="width:100%;display:block"><figcaption style="padding:3px 2px">${f.replace(".png", "")}</figcaption></figure>`).join("\n")}
</div></body></html>`;
    const tmp = `${out}/.sheet.html`;
    writeFileSync(tmp, html);
    await page.goto(`file://${tmp}`);
    await page.waitForLoadState("load");
    await page.screenshot({ path: `${out}/sheet-${k}.png`, fullPage: true });
    console.log(`sheet-${k}.png (${fs.length})`);
  }
  await page.close();
}

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
});
if (process.env.SHEETS) {
  await sheets(browser);
  await browser.close();
  process.exit(0);
}
{
  const svg = profile();
  writeFileSync(`${out}/profile.svg`, svg);
  const page = await browser.newPage({ viewport: { width: 1800, height: 830 } });
  await page.setContent(svg);
  await page.screenshot({ path: `${out}/profile.png` });
  await page.close();
  console.log(`profile: ${out}/profile.png`);
  if (process.env.PROFILE) {
    await browser.close();
    process.exit(0);
  }
}
const ana = await open(browser);
const wantSpots = process.env.SPOTS?.split(",");
const wantStates = process.env.STATES?.split(",");
try {
  for (const s of SPOTS) {
    if (wantSpots && !wantSpots.includes(s.name)) continue;
    await go(ana, s.at);
    await ready(ana).catch(() => {});
    const cx = (s.from[0] + s.to[0]) / 2;
    const cz = (s.from[2] + s.to[2]) / 2;
    const near = nearRiver(cx, cz);
    const pondNear = Math.hypot(cx - POND.cx, cz - POND.cz) < 300;
    const t0 = Date.now();
    const setup: Setup = {
      tex: landTex(cx, cz),
      river: near || !pondNear ? riverMesh(cx, cz) : { p: [], depth: [], flow: [], dir: [], idx: [] },
      pond: pondNear ? pondMesh() : null,
      reeds: reeds(cx, cz),
    };
    console.log(s.name, `(the mock's data in ${Date.now() - t0} ms)`);
    await mock(ana, setup);
    const fl = lvAt(s.from[0], s.from[2]);
    const tl = lvAt(s.to[0], s.to[2]);
    const cam = {
      from: [
        s.from[0] + OX,
        (s.under ? (waterAt(s.from[0], s.from[2])?.level ?? fl) : fl) + s.from[1] + OY,
        s.from[2] + OZ,
      ],
      to: [s.to[0] + OX, tl + s.to[1] + OY, s.to[2] + OZ],
      lv: s.under ? (waterAt(s.from[0], s.from[2])?.level ?? -1000) + OY : -1000,
    };
    const swim = s.swim ? [s.swim[0] + OX, s.swim[1] + OZ, 1] : [0, 0, 0];
    await ana.evaluate(
      ([c, sw]) => {
        const win = window as any;
        win.__uwCam = c;
        win.__uw.uSwim.value.set(sw[0], sw[1], sw[2]);
      },
      [cam, swim] as const,
    );
    const states = STATES.filter((x) =>
      wantStates
        ? wantStates.includes(x.name)
        : s.states
          ? s.states.includes(x.name)
          : quality === "high" || x.name === "noon",
    );
    for (const st of states) {
      // (twice: the materials compile after the first)
      await setState(ana, st);
      await ana.waitForTimeout(1500);
      await setState(ana, st);
      await shot(ana, `${s.name}-${st.name}`);
    }
  }
} finally {
  await ana.evaluate(() => {
    const w = (window as any).__yutopia;
    w.room.send("mod:weather", { to: null, now: true });
    w.room.send("mod:fog", { fog: null, now: true });
  });
}
await sheets(browser);
await browser.close();
