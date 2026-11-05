/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/65-the-weather.md: the stills, in the game as Ana (the dev stack, :3100 and
// :8100, the machine's GPU), with a mock of the green world and the snow lying on it patched into
// the 3D view's materials from here — no game code. The mock:
//   - the green (W3): the land's snow and deep snow drawn as grass and the woods' floor (by the
//     trees and the slope round each spot, worked out here from shared/grounds), the trails earth,
//     the pavements bare, the roads without their packed snow, leaves on the birches and the bare
//     trees, the woods' floor in its own colours, the pond and the river water, the ground's bounce
//     and the sky a green day's;
//   - the snow (W4): every lit outdoor surface whitening by how much it faces the sky, a world
//     noise and the place (later under the trees and by the ways coming in; islands, the shade and
//     the woods last, melting), and today's snow shapes (told apart by their cold white: there are
//     no tags yet) shown only once it's deep;
//   - the rain (W7): the wet darkening, a sheen, puddles, streaks.
//   node --experimental-strip-types e2e/weather-shots.mts [out dir]
//   QUALITY=medium: the Medium stills (noon only); SPOTS=lot,lawn,…; STATES=green,rain,…; HOURS=12,…;
//   SHEETS=1: only the contact sheets, from the stills already there
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium, type Page, request } from "@playwright/test";
import { groundSurfaceAt, slopeAt, treeDensity } from "@yutopia/shared/grounds";

const out = resolve(process.argv[2] ?? "../../design/screens/weather");
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const G = (x: number, y: number) => ({ x, y }); // the land's coords → the ground floor's

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
async function open(browser: Browser, email: string): Promise<Page> {
  const tok = await token(email);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log(`  ${email}:`, e.message));
  page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 400)));
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

// ── the land round a spot, from the shared Grounds (1 m a texel, MAP m square) ──
// r: the trees (their density), g: the slope, b: the ways near (1 on one, 0 six metres off),
// a: 1 (inside the map)
const MAP = 384;
function landMap(cx: number, cz: number): { data: string; x0: number; z0: number } {
  const x0 = Math.round(cx - MAP / 2);
  const z0 = Math.round(cz - MAP / 2);
  const px = new Uint8Array(MAP * MAP * 4);
  const hard = new Uint8Array(MAP * MAP);
  for (let j = 0; j < MAP; j++)
    for (let i = 0; i < MAP; i++) {
      const x = x0 + i + 0.5;
      const z = z0 + j + 0.5;
      const s = groundSurfaceAt(x, z);
      const k = (j * MAP + i) * 4;
      px[k] = Math.round(Math.min(1, treeDensity(x, z)) * 255);
      px[k + 1] = Math.round(Math.min(1, slopeAt(x, z) / 1.2) * 255);
      px[k + 3] = 255;
      hard[j * MAP + i] = s !== "snow" && s !== "deep" && s !== "rock" && s !== "ice" ? 1 : 0;
    }
  // the ways near: a chamfer distance (in metres) from the hard surfaces, 0 … 6
  const d = new Float32Array(MAP * MAP).fill(99);
  for (let i = 0; i < hard.length; i++) if (hard[i]) d[i] = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let j0 = 0; j0 < MAP; j0++)
      for (let i0 = 0; i0 < MAP; i0++) {
        const j = pass ? MAP - 1 - j0 : j0;
        const i = pass ? MAP - 1 - i0 : i0;
        const s = pass ? 1 : -1;
        let v = d[j * MAP + i];
        const ii = i + s;
        const jj = j + s;
        if (ii >= 0 && ii < MAP) v = Math.min(v, d[j * MAP + ii] + 1);
        if (jj >= 0 && jj < MAP) v = Math.min(v, d[jj * MAP + i] + 1);
        if (ii >= 0 && ii < MAP && jj >= 0 && jj < MAP) v = Math.min(v, d[jj * MAP + ii] + 1.414);
        d[j * MAP + i] = v;
      }
  for (let i = 0; i < d.length; i++) px[i * 4 + 2] = Math.round(Math.max(0, 1 - d[i] / 6) * 255);
  // the trees' density spread 6 m (a box blur, twice): their floor reaches under their crowns
  const R = 6;
  let den = Float32Array.from({ length: MAP * MAP }, (_, i) => px[i * 4] / 255);
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(MAP * MAP);
    for (let j = 0; j < MAP; j++)
      for (let i = 0; i < MAP; i++) {
        let sum = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const ii = pass ? i : i + k;
          const jj = pass ? j + k : j;
          if (ii < 0 || jj < 0 || ii >= MAP || jj >= MAP) continue;
          sum += den[jj * MAP + ii];
          n++;
        }
        tmp[j * MAP + i] = sum / n;
      }
    den = tmp;
  }
  for (let i = 0; i < den.length; i++) px[i * 4] = Math.round(Math.min(1, Math.max(den[i], px[i * 4] / 255)) * 255);
  return { data: Buffer.from(px).toString("base64"), x0, z0 };
}

// ── the mock's shader ──
// In every lit outdoor material's fragment, before its light: what the surface is (the green
// under it, the wet), then the snow on it. World position and normal from the view's.
const PARS = `
uniform float wxSnow; uniform float wxMelt; uniform float wxWet; uniform float wxPud; uniform float wxIce;
uniform vec3 wxSky; uniform vec2 wxOff;
uniform sampler2D wxMap; uniform vec4 wxMapO;
uniform sampler2D wxOpen; uniform vec4 wxOpenO;
uniform sampler2D wxSnowTex; uniform float wxDebug;
float wxH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wxN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxH(i), wxH(i + vec2(1.0, 0.0)), f.x), mix(wxH(i + vec2(0.0, 1.0)), wxH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wxF(vec2 p) { return 0.5 * wxN(p) + 0.3 * wxN(p * 2.13 + 7.1) + 0.2 * wxN(p * 4.7 + 3.3); }
float wxLum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
vec3 wxLin(vec3 s) { return pow(s, vec3(2.2)); }
`;
const BLOCK = `
{
  vec3 wxW = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition;
  vec3 wxNw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float wxUp = clamp(wxNw.y, 0.0, 1.0);
  vec2 wxG = wxW.xz - wxOff;
  vec2 wxMu = (wxG - wxMapO.xy) / wxMapO.z;
  vec4 wxM = texture2D(wxMap, wxMu);
  if (wxMu.x < 0.0 || wxMu.y < 0.0 || wxMu.x > 1.0 || wxMu.y > 1.0) wxM = vec4(0.0);
  vec3 wxB0 = diffuse;
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
  wxB0 *= vColor.rgb;
#endif
  float wxL = wxLum(wxB0);
  float wxSpread = max(wxB0.r, max(wxB0.g, wxB0.b)) - min(wxB0.r, min(wxB0.g, wxB0.b));
  float wxBlue = wxB0.b - wxB0.r;
  // today's snow (no tags: its cold white)
  bool wxPiece = wxL > 0.86 && wxBlue > 0.008 && wxBlue < 0.09 && wxSpread < 0.12;
#ifdef WX_TREE
  wxPiece = wxL > 0.74 && wxBlue > 0.008 && wxSpread < 0.16;
#endif
  bool wxSlush = distance(wxB0, vec3(0.397, 0.376, 0.337)) < 0.015 || distance(wxB0, vec3(0.392, 0.381, 0.352)) < 0.015 || distance(wxB0, vec3(0.693, 0.738, 0.783)) < 0.015;
  if (wxSlush && wxSnow < 0.15 && wxMelt < 0.5 && wxDebug < 0.5) discard;
  float wxDetail = 1.0;
#ifdef USE_MAP
  wxDetail = wxLum(texture2D(map, vMapUv).rgb) / 0.82;
#endif
  float wxN1 = wxF(wxW.xz * 0.07);
  float wxN2 = wxF(wxW.xz * 0.31 + 5.0);
  float wxNm = wxF(wxW.xz * 0.32 + 3.0);
  float wxWoods = smoothstep(0.08, 0.35, wxM.r);
  float wxWay = wxM.b;
  float wxPor = 0.55; // how much the wet darkens it
  float wxShine = 0.25; // how much it shines wet
  float wxPuddly = 0.0;
  bool wxOut = true;
#ifdef WX_LM
  // the floor's map: only its open tiles are under the sky
  vec2 wxTu = (wxW.xz - wxOpenO.xy) / wxOpenO.zw;
  wxOut = texture2D(wxOpen, wxTu).r > 0.5 && wxTu.x > 0.0 && wxTu.y > 0.0 && wxTu.x < 1.0 && wxTu.y < 1.0;
  wxPor = 0.9; wxShine = 0.8; wxPuddly = 1.0; wxWay = 1.0;
#endif
  // ── the green under it ──
  vec3 wxGrass;
  {
    vec3 g1 = wxLin(vec3(0.42, 0.51, 0.31));
    vec3 g2 = wxLin(vec3(0.49, 0.56, 0.34));
    vec3 g3 = wxLin(vec3(0.35, 0.44, 0.28));
    vec3 dry = wxLin(vec3(0.58, 0.57, 0.41));
    wxGrass = mix(mix(g3, g1, smoothstep(0.3, 0.62, wxN1)), g2, smoothstep(0.55, 0.8, wxN2) * 0.6);
    wxGrass = mix(wxGrass, dry, clamp(wxM.g * 0.9 + wxWay * 0.45, 0.0, 0.65) * smoothstep(0.25, 0.7, wxN2));
    vec3 needles = wxLin(vec3(0.38, 0.33, 0.23));
    vec3 moss = wxLin(vec3(0.31, 0.39, 0.22));
    vec3 floorC = mix(needles, moss, smoothstep(0.35, 0.65, wxF(wxW.xz * 0.15 + 2.0)));
    wxGrass = mix(wxGrass, floorC, wxWoods);
  }
  vec3 wxEarth = mix(wxLin(vec3(0.50, 0.42, 0.31)), wxLin(vec3(0.58, 0.54, 0.47)), smoothstep(0.45, 0.75, wxN2));
  bool wxGround = false;
#ifdef WX_LAND
  {
    // the land's own colour says its surface: the snow and deep snow (a cold white) are the green;
    // the trails (warm, pale) earth; the beds under the water (a dark ice) mud
    vec3 c = vColor.rgb;
    float l = wxLum(c);
    float b = c.b - c.r;
    if (b > 0.02 && l > 0.7) { diffuseColor.rgb = wxGrass * wxDetail; wxGround = true; wxPor = 0.45; wxShine = 0.12; }
    else if (b < 0.0 && l > 0.6 && l < 0.7) { diffuseColor.rgb = wxEarth * wxDetail; wxPor = 1.0; wxShine = 0.35; wxPuddly = 1.0; }
    else if (b > 0.06 && l < 0.68) { diffuseColor.rgb = wxLin(vec3(0.24, 0.22, 0.17)) * wxDetail; }
  }
#endif
#ifdef WX_GRASS
  diffuseColor.rgb = wxGrass * wxDetail; wxGround = true; wxPor = 0.45; wxShine = 0.12;
#endif
#ifdef WX_TRAIL
  diffuseColor.rgb = wxEarth * wxDetail; wxPor = 1.0; wxShine = 0.35; wxPuddly = 1.0;
#endif
#ifdef WX_WALK
  diffuseColor.rgb = wxLin(vec3(0.70, 0.69, 0.66)) * wxDetail; wxPor = 0.8; wxShine = 0.6; wxPuddly = 0.6;
#endif
#ifdef WX_HARD
  wxPor = 0.9; wxShine = 0.9; wxPuddly = 1.0; wxWay = 1.0;
#endif
#ifdef WX_CAR
  wxPor = 0.15; wxShine = 0.5;
#endif
  bool wxWater = false;
#ifdef WX_WATER
  if (wxIce < 0.5) {
    wxWater = true;
    diffuseColor.rgb = mix(wxLin(vec3(0.10, 0.17, 0.17)), wxLin(vec3(0.16, 0.24, 0.22)), wxF(wxW.xz * 0.05));
  }
#endif
#ifdef WX_LAND
  if (wxDebug > 1.5) { diffuseColor.rgb = wxM.rgb; wxOut = false; }
#endif
  // ── the snow on top ──
  // coming in it's a powder: a fine grain at two scales (the grass's dark strokes last) with soft
  // edges as wide as a pixel's change, so far off it averages to a pale veil, never a pattern;
  // thicker in broad drifts. (Its width is taken here, outside the branches.)
  float wxDtl = 1.0 - clamp(wxDetail, 0.0, 1.2) / 1.2;
  float wxGrain = 0.25 * wxN(wxW.xz * 11.0 + wxW.y * 3.1) + 0.15 * wxN(wxW.xz * 27.0 + wxW.y * 5.3 + 9.0) + 0.6 * wxDtl;
  float wxGw = fwidth(wxGrain);
  float wxDrift = wxF(wxW.xz * 0.05 + 6.0);
  float wxCov = 0.0;
  if (wxOut && !wxWater) {
    float face = smoothstep(0.4, 0.88, wxUp);
    float nf = wxN(wxW.xz * 3.1 + wxW.y * 1.7);
    float nb = wxF(wxW.xz * 0.045 + 11.0);
    float t0;
    float nff = wxN(wxW.xz * 6.3 + wxW.y * 2.9);
    float dt = 1.0 - clamp(wxDetail, 0.0, 1.2) / 1.2;
#ifdef WX_CAR
    wxWay = 0.0;
#endif
    float nb2 = wxF(wxW.xz * 0.13 + 4.0);
    if (wxMelt < 0.5) t0 = 0.03 + 0.8 * smoothstep(0.18, 0.82, wxGrain) - 0.9 * (wxDrift - 0.5) + 0.16 * wxWoods + 0.3 * wxWay;
    else t0 = smoothstep(0.3, 0.7, 0.4 * nb + 0.5 * nb2 + 0.1 * wxNm) - 0.3 * wxWoods + 0.32 * wxWay;
#ifdef WX_CAR
    // (a car: an even frost first, thickening; its own shapes come later)
    if (wxMelt < 0.5) t0 = -1.0;
#endif
#ifdef WX_CAR
    t0 -= 0.08;
#endif
#ifdef WX_TREE
    // the needles: frosted on their tops, never buried (the caps carry the snow)
    face = smoothstep(0.62, 0.95, wxUp);
    t0 = (wxMelt < 0.5 ? 0.2 : 0.05) + 0.55 * nff;
#endif
    t0 += (1.0 - face) * 1.3;
    bool wxCut = wxPiece && !wxGround;
#if defined(WX_LAND) || defined(WX_WATER)
    wxCut = false;
#endif
#ifdef WX_CAMPUS
    if (wxCut && wxDebug < 0.5) { diffuseColor.rgb = wxLin(vec3(0.66, 0.66, 0.64)) * wxDetail; wxCut = false; }
#endif
    if (wxCut) {
      // today's snow shapes: only when it's deep (no tags yet: they come in whole, in patches)
      float tp = wxMelt < 0.5 ? 0.42 + 0.35 * wxNm : 0.12 + 0.45 * wxNm - 0.15 * wxWoods;
      if (wxDebug > 0.5 && wxDebug < 1.5) { diffuseColor.rgb = vec3(1.0, 0.0, 1.0); wxOut = false; }
      else if (wxSnow < tp) discard;
      wxCov = 1.0;
    } else {
      if (wxMelt < 0.5) {
        float w = 0.14 + 1.2 * wxGw;
        wxCov = smoothstep(t0 - w, t0 + w, wxSnow);
        // the frost before it: the green paling all over (less on the ways and under the trees)
        wxCov = max(wxCov, face * 0.2 * smoothstep(0.0, 0.35, wxSnow) * (1.0 - 0.7 * wxWay) * (1.0 - 0.5 * wxWoods));
      } else wxCov = smoothstep(t0, t0 + 0.05, wxSnow);
#ifdef WX_CAR
      if (wxMelt < 0.5) wxCov = face * smoothstep(0.0, 0.45, wxSnow) * (0.8 + 0.2 * wxN(wxW.xz * 9.0 + wxW.y * 7.0));
#endif
      // (a first snow is a veil: the green through it)
      if (wxMelt < 0.5) wxCov *= 0.6 + 0.4 * smoothstep(0.05, 0.45, wxSnow);
#ifdef WX_TREE
      wxCov *= 0.5;
#endif
    }
    vec3 wxST = texture2D(wxSnowTex, wxW.xz / 14.0).rgb;
    vec3 fresh = wxLin(vec3(0.957, 0.969, 0.98)) * wxST;
#ifdef WX_LAND
    fresh = vColor.rgb * texture2D(wxSnowTex, vMapUv).rgb;
#endif
    vec3 old = mix(wxLin(vec3(0.78, 0.8, 0.82)), wxLin(vec3(0.9, 0.92, 0.94)), smoothstep(0.3, 0.8, wxNm));
    vec3 snowC = mix(fresh, old, wxMelt);
    if (wxCut) snowC = wxB0;
    if (wxOut) diffuseColor.rgb = mix(diffuseColor.rgb, snowC, wxCov);
  }
  // ── the wet ──
  {
    float wet = wxWet * (1.0 - wxCov) * (wxOut ? 1.0 : 0.0);
    vec3 V = normalize(cameraPosition - wxW);
    float fres = pow(1.0 - max(dot(V, wxNw), 0.0), 4.0);
    if (wxWater) {
      float rip = wxN(vec2(wxW.x * 0.35, wxW.z * 3.2)) * wxN(vec2(wxW.x * 1.1 + 3.0, wxW.z * 6.0));
      totalEmissiveRadiance += wxSky * (0.03 + 0.42 * fres) * (0.75 + 0.6 * rip);
    } else {
      diffuseColor.rgb *= 1.0 - 0.42 * wet * wxPor * (0.6 + 0.4 * wxUp);
      totalEmissiveRadiance += wxSky * wet * fres * wxUp * 0.3 * wxShine;
      float p = smoothstep(0.58, 0.63, wxF(wxW.xz * 0.16 + 1.7)) * step(0.97, wxUp) * wxPud * wxPuddly * (1.0 - wxCov) * (wxOut ? 1.0 : 0.0);
      diffuseColor.rgb *= 1.0 - 0.8 * p;
      totalEmissiveRadiance += wxSky * p * (0.18 + 0.75 * fres);
    }
  }
}
`;

interface State {
  name: string;
  snow: number; // 0 … 1 lying
  melt?: boolean; // going (islands, old snow, wet) rather than coming
  wet?: number;
  puddles?: number;
  falling?: "snow" | "rain";
  sky?: "clear" | "grey" | "snow";
}
const STATES: State[] = [
  { name: "green", snow: 0, sky: "clear" },
  { name: "rain", snow: 0, wet: 1, puddles: 1, falling: "rain", sky: "grey" },
  { name: "snow10", snow: 0.1, falling: "snow", sky: "snow" },
  { name: "snow30", snow: 0.3, falling: "snow", sky: "snow" },
  { name: "snow60", snow: 0.6, falling: "snow", sky: "snow" },
  { name: "snow100", snow: 1, sky: "snow" },
  { name: "melt50", snow: 0.5, melt: true, wet: 0.8, puddles: 0.3, sky: "grey" },
  { name: "melt20", snow: 0.2, melt: true, wet: 0.9, puddles: 0.5, sky: "grey" },
];
// the states seen at dusk and at night too (and on Medium)
const LATE = ["green", "rain", "snow30", "snow100"];

async function setState(p: Page, s: State, hour: number, land: { data: string; x0: number; z0: number }) {
  await p.evaluate(
    ([s, hour, land, src]) => {
      const win = window as any;
      const w = win.__yutopia;
      const tp = w.tp;
      const g = tp.around.grounds;
      const Col = tp.scene.fog.color.constructor;
      // the hour and the calm, held
      w.updateNight = () => {};
      w.hour = hour;
      w.model?.setClock(hour);
      tp.setHour(hour);
      if (w.life) w.life.weather = () => [0, 0];
      let U = win.__wx;
      if (!U) {
        // ── once: the uniforms, the textures, the materials patched ──
        const Tex = g.snowTex.constructor; // CanvasTexture
        const canvas = (n: number) => {
          const c = document.createElement("canvas");
          c.width = n;
          c.height = n;
          return c;
        };
        const tex = (c: HTMLCanvasElement, data = false) => {
          const t = new Tex(c);
          t.wrapS = t.wrapT = 1000; // RepeatWrapping
          if (data) {
            t.wrapS = t.wrapT = 1001; // ClampToEdge
            t.generateMipmaps = false;
            t.minFilter = t.magFilter = 1006; // Linear
            t.flipY = false;
          } else {
            t.colorSpace = "srgb";
            t.anisotropy = 4;
          }
          t.needsUpdate = true;
          return t;
        };
        // a seeded random
        let seed = 7;
        const rnd = () => {
          seed = (seed * 16807) % 2147483647;
          return seed / 2147483647;
        };
        // detail canvases (grey: the colour's the shader's), tileable by drawing each mark wrapped
        const wrapDraw = (n: number, x: number, y: number, f: (x: number, y: number) => void) => {
          for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) f(x + dx, y + dy);
        };
        const grassC = canvas(512);
        {
          const c = grassC.getContext("2d") as CanvasRenderingContext2D;
          c.fillStyle = "#d4d4d4";
          c.fillRect(0, 0, 512, 512);
          // soft darker clumps under the blades
          for (let i = 0; i < 260; i++) {
            const x = rnd() * 512;
            const y = rnd() * 512;
            const r = 6 + rnd() * 18;
            c.fillStyle = `rgba(150,150,150,${0.08 + rnd() * 0.1})`;
            wrapDraw(512, x, y, (x, y) => {
              c.beginPath();
              c.arc(x, y, r, 0, 7);
              c.fill();
            });
          }
          for (let i = 0; i < 9000; i++) {
            const x = rnd() * 512;
            const y = rnd() * 512;
            const l = 1.5 + rnd() * 3;
            const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
            const v = rnd() < 0.5 ? 228 + rnd() * 22 : 180 + rnd() * 25;
            c.strokeStyle = `rgb(${v},${v},${v})`;
            c.lineWidth = 0.8 + rnd() * 0.7;
            wrapDraw(512, x, y, (x, y) => {
              c.beginPath();
              c.moveTo(x, y);
              c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
              c.stroke();
            });
          }
          // clover, a little lighter, and a few small flowers
          for (let i = 0; i < 70; i++) {
            const x = rnd() * 512;
            const y = rnd() * 512;
            c.fillStyle = "rgba(240,240,240,0.7)";
            wrapDraw(512, x, y, (x, y) => {
              for (let k = 0; k < 3; k++) {
                c.beginPath();
                c.arc(x + Math.cos(k * 2.1) * 2.2, y + Math.sin(k * 2.1) * 2.2, 2.2, 0, 7);
                c.fill();
              }
            });
          }
          for (let i = 0; i < 26; i++) {
            const x = rnd() * 512;
            const y = rnd() * 512;
            c.fillStyle = "#ffffff";
            wrapDraw(512, x, y, (x, y) => {
              c.beginPath();
              c.arc(x, y, 1.6, 0, 7);
              c.fill();
            });
          }
        }
        const earthC = canvas(512);
        {
          const c = earthC.getContext("2d") as CanvasRenderingContext2D;
          c.fillStyle = "#d0d0d0";
          c.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 2600; i++) {
            const x = rnd() * 512;
            const y = rnd() * 512;
            const r = 0.8 + rnd() * 2.6;
            const v = rnd() < 0.55 ? 225 + rnd() * 30 : 150 + rnd() * 40;
            c.fillStyle = `rgb(${v},${v},${v})`;
            wrapDraw(512, x, y, (x, y) => {
              c.beginPath();
              c.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, 7);
              c.fill();
            });
          }
        }
        const asphC = canvas(512);
        {
          const c = asphC.getContext("2d") as CanvasRenderingContext2D;
          c.fillStyle = "#53575b";
          c.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 14000; i++) {
            const v = 62 + rnd() * 50;
            c.fillStyle = `rgb(${v},${v},${v})`;
            c.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
          }
          // a few patches, and cracks
          for (let i = 0; i < 6; i++) {
            c.fillStyle = `rgba(40,42,45,${0.25 + rnd() * 0.2})`;
            const x = rnd() * 512;
            const y = rnd() * 512;
            wrapDraw(512, x, y, (x, y) => c.fillRect(x, y, 30 + rnd() * 60, 20 + rnd() * 50));
          }
          c.strokeStyle = "rgba(30,31,33,0.6)";
          for (let i = 0; i < 10; i++) {
            let x = rnd() * 512;
            let y = rnd() * 512;
            c.beginPath();
            c.moveTo(x, y);
            for (let k = 0; k < 6; k++) {
              x += (rnd() - 0.5) * 30;
              y += (rnd() - 0.5) * 30;
              c.lineTo(x, y);
            }
            c.stroke();
          }
        }
        const walkC = canvas(256);
        {
          const c = walkC.getContext("2d") as CanvasRenderingContext2D;
          c.fillStyle = "#d2d2d2";
          c.fillRect(0, 0, 256, 256);
          for (let i = 0; i < 1800; i++) {
            const v = 190 + rnd() * 50;
            c.fillStyle = `rgb(${v},${v},${v})`;
            c.fillRect(rnd() * 256, rnd() * 256, 1 + rnd(), 1 + rnd());
          }
          c.strokeStyle = "rgba(120,120,120,0.6)";
          c.lineWidth = 1.2;
          c.strokeRect(0.5, 0.5, 255, 255);
        }
        U = {
          wxSnow: { value: 0 },
          wxMelt: { value: 0 },
          wxWet: { value: 0 },
          wxPud: { value: 0 },
          wxIce: { value: 0 },
          wxSky: { value: new Col(0.5, 0.6, 0.7) },
          wxOff: { value: [0, 0] },
          wxMap: { value: null },
          wxMapO: { value: [0, 0, 1, 0] },
          wxOpen: { value: null },
          wxOpenO: { value: [0, 0, 1, 1] },
          wxSnowTex: { value: g.snowTex },
          wxDebug: { value: 0 },
        };
        win.__wx = U;
        win.__wxDataTex = (c: HTMLCanvasElement) => tex(c, true);
        // a plain geometry's class (the land's blocks are made as one)
        let plain: any = null;
        g.root.traverse((o: any) => {
          if (!plain && o.material === g.landMat) plain = o.geometry.constructor;
        });
        win.__wxGeo = plain;
        win.__wxTex = { grass: tex(grassC), earth: tex(earthC), walk: tex(walkC), asphalt: tex(asphC) };
        // the Grounds' place in the scene (their coords → the world's)
        g.root.updateMatrixWorld(true);
        const e = g.root.matrixWorld.elements;
        U.wxOff.value = [e[12], e[14]];
        // the floor's open tiles (the lot: asphalt, concrete, open)
        {
          const map = tp.map;
          const H = map.tiles.length;
          const W = Math.max(...map.tiles.map((r: string) => r.length));
          const c = canvas(1);
          c.width = W;
          c.height = H;
          const cx = c.getContext("2d") as CanvasRenderingContext2D;
          const id = cx.createImageData(W, H);
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const t = map.tiles[y]?.[x];
              const open = !t || t === " " || t === "a" || t === "c";
              const k = (y * W + x) * 4;
              id.data[k] = open ? 255 : 0;
              id.data[k + 3] = 255;
            }
          cx.putImageData(id, 0, 0);
          const t = tex(c, true);
          t.minFilter = t.magFilter = 1003; // Nearest
          U.wxOpen.value = t;
          U.wxOpenO.value = [0, 0, W, H];
        }
        // ── the trees' leaves: crowns on the birches and the bare trees, on their own pools' matrices ──
        const kinds = g.kinds;
        const leafy = [
          ...kinds.birch.map((i: number) => [i, [0.4, 0.5, 0.25], 0.62, 0.24]),
          ...kinds.bare.map((i: number) => [i, [0.31, 0.41, 0.2], 0.6, 0.3]),
          [kinds.farBirch, [0.38, 0.48, 0.25], 0.62, 0.26],
          [kinds.farBare, [0.3, 0.39, 0.2], 0.6, 0.3],
        ];
        const lin = (v: number) => v ** 2.2;
        const crowns: any[] = [];
        for (const [pi, col, cy, cr] of leafy as [number, number[], number, number][]) {
          const pool = g.pools[pi];
          if (!pool?.mesh) continue;
          pool.geo.computeBoundingBox();
          const bb = pool.geo.boundingBox;
          const h = bb.max.y - bb.min.y;
          // an icosahedron, flat faced, a few clumps of it
          const t = (1 + Math.sqrt(5)) / 2;
          const V = [
            [-1, t, 0],
            [1, t, 0],
            [-1, -t, 0],
            [1, -t, 0],
            [0, -1, t],
            [0, 1, t],
            [0, -1, -t],
            [0, 1, -t],
            [t, 0, -1],
            [t, 0, 1],
            [-t, 0, -1],
            [-t, 0, 1],
          ].map((v) => {
            const l = Math.hypot(...v);
            return v.map((c) => c / l);
          });
          const F = [
            [0, 11, 5],
            [0, 5, 1],
            [0, 1, 7],
            [0, 7, 10],
            [0, 10, 11],
            [1, 5, 9],
            [5, 11, 4],
            [11, 10, 2],
            [10, 7, 6],
            [7, 1, 8],
            [3, 9, 4],
            [3, 4, 2],
            [3, 2, 6],
            [3, 6, 8],
            [3, 8, 9],
            [4, 9, 5],
            [2, 4, 11],
            [6, 2, 10],
            [8, 6, 7],
            [9, 8, 1],
          ];
          // once subdivided, jittered: lumpy
          const tris: number[][][] = [];
          for (const [a, b, c] of F) {
            const m = (p: number[], q: number[]) => {
              const v = p.map((x, i) => (x + q[i]) / 2);
              const l = Math.hypot(...v);
              return v.map((x) => x / l);
            };
            const A = V[a];
            const B = V[b];
            const C = V[c];
            const ab = m(A, B);
            const bc = m(B, C);
            const ca = m(C, A);
            tris.push([A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]);
          }
          const pos: number[] = [];
          const nor: number[] = [];
          const colA: number[] = [];
          const clumps = [
            [0, 0, 0, 1],
            [0.55, -0.2, 0.15, 0.72],
            [-0.5, -0.15, -0.25, 0.75],
            [0.1, 0.45, -0.1, 0.7],
            [-0.15, -0.35, 0.55, 0.65],
          ];
          const jit = (v: number[]) => {
            const k = 1 + 0.14 * Math.sin(v[0] * 7.1 + v[1] * 3.3 + v[2] * 5.7);
            return v.map((x) => x * k);
          };
          for (const [ox, oy, oz, s] of clumps)
            for (const tri of tris) {
              const P = tri.map((v) => {
                const j = jit(v);
                return [
                  (ox + j[0] * s) * cr * h,
                  bb.min.y + cy * h + (oy + j[1] * s * 0.85) * cr * h,
                  (oz + j[2] * s) * cr * h,
                ];
              });
              const u = P[1].map((x, i) => x - P[0][i]);
              const v = P[2].map((x, i) => x - P[0][i]);
              let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
              const nl = Math.hypot(...n) || 1;
              n = n.map((x) => x / nl);
              const shade = 0.78 + 0.32 * Math.max(0, n[1]) + 0.05 * Math.sin(P[0][0] * 9 + P[0][2] * 7);
              for (const q of P) {
                pos.push(...q);
                nor.push(...n);
                colA.push(lin(col[0] * shade), lin(col[1] * shade), lin(col[2] * shade));
              }
            }
          const Geo = win.__wxGeo;
          const Attr = pool.geo.attributes.position.constructor;
          const geo = new Geo();
          geo.setAttribute("position", new Attr(new Float32Array(pos), 3));
          geo.setAttribute("normal", new Attr(new Float32Array(nor), 3));
          geo.setAttribute("color", new Attr(new Float32Array(colA), 3));
          const IM = pool.mesh.constructor;
          const cap = pool.mesh.instanceMatrix.count;
          const im = new IM(geo, pool.mat, cap);
          im.frustumCulled = false;
          im.castShadow = true;
          im.layers.mask = pool.mesh.layers.mask;
          pool.mesh.parent.add(im);
          crowns.push({ pool, im });
        }
        win.__wxCrowns = crowns;
        // ── the woods' floor in its own colours (its upward faces were painted snow) ──
        const own: Record<string, number[]> = {
          shrub: [0.3, 0.4, 0.22],
          stump: [0.52, 0.42, 0.3],
          log: [0.4, 0.31, 0.22],
          stone: [0.44, 0.46, 0.43],
          boulder: [0.4, 0.42, 0.39],
        };
        for (const [k, i] of Object.entries(kinds.cover) as [string, number][]) {
          const geo = g.pools[i]?.geo;
          const c = geo?.attributes.color;
          if (!c) continue;
          const o = own[k];
          for (let v = 0; v < c.count; v++) {
            const r = c.getX(v);
            const gg = c.getY(v);
            const b = c.getZ(v);
            if (r * 0.3 + gg * 0.55 + b * 0.15 > 0.78 && b > r) {
              const j = 0.9 + 0.2 * ((v * 0.618) % 1);
              c.setXYZ(v, lin(o[0] * j), lin(o[1] * j), lin(o[2] * j));
            }
          }
          c.needsUpdate = true;
        }
        win.__wxRidge = (o: any) => {
          const m = o.material;
          if (!m || m.__wx || !m.isMeshBasicMaterial || !m.vertexColors || o.isSkinnedMesh) return;
          o.geometry.computeBoundingSphere?.();
          if ((o.geometry.boundingSphere?.radius ?? 0) < 400) return;
          m.__wx = true;
          const prev = m.onBeforeCompile;
          const k0 = m.customProgramCacheKey.call(m);
          m.onBeforeCompile = (sh: any, r: any) => {
            prev.call(m, sh, r);
            Object.assign(sh.uniforms, U);
            sh.fragmentShader = sh.fragmentShader
              .replace("#include <common>", "#include <common>\nuniform float wxSnow;")
              .replace(
                "#include <color_fragment>",
                `#include <color_fragment>
{
  float l = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  vec3 hill = pow(vec3(0.30, 0.38, 0.36), vec3(2.2)) * (0.55 + 0.9 * l);
  diffuseColor.rgb = mix(hill, diffuseColor.rgb, smoothstep(0.35, 0.8, wxSnow));
}`,
              );
          };
          m.customProgramCacheKey = () => `${k0}|wxridge`;
          m.needsUpdate = true;
        };
        win.__wxPatch = (m: any) => {
          if (m.__wx) return;
          if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return;
          if (m.blending === 2) return; // additive: a light
          m.__wx = true;
          const own = Object.getOwnPropertySymbols(m).find((s) => s.description === "own customProgramCacheKey");
          const ownKey = own ? m[own] : null;
          const k0 = ownKey ? null : m.customProgramCacheKey.call(m);
          const key = ownKey ? () => ownKey.call(m) : () => k0;
          const flags: string[] = [];
          const ts = g.shared.ts;
          if (m === g.landMat) flags.push("WX_LAND");
          else if (m.map && m.map === ts.snow) flags.push("WX_GRASS");
          else if (m.map && m.map === ts.trail) flags.push("WX_TRAIL");
          else if (m.map && (m.map === ts.walk || m.map === ts.slabs)) flags.push("WX_WALK");
          else if (m.map && m.map === ts.ice) flags.push("WX_WATER");
          const k = String(key());
          if (k.includes("lightmap")) flags.push("WX_LM");
          if (k.includes("-trees")) flags.push("WX_TREE");
          else if (k.includes("yutopia-outdoors")) flags.push("WX_CAMPUS");
          if (k.includes("-road") || k.includes("-paint")) flags.push("WX_HARD");
          if (k.includes("car-wear") || k.startsWith("(sh, r)")) flags.push("WX_CAR");
          // (the green's detail in place of the snow's)
          const T = win.__wxTex;
          if (flags.includes("WX_LAND") || flags.includes("WX_GRASS")) m.map = T.grass;
          if (flags.includes("WX_TRAIL")) m.map = T.earth;
          if (flags.includes("WX_WALK")) m.map = T.walk;
          if (k.includes("-road") && m.map) {
            m.__wxMaps = { winter: m.map, green: T.asphalt };
          }
          m.defines = { ...(m.defines ?? {}) };
          for (const f of flags) m.defines[f] = "";
          const prev = m.onBeforeCompile;
          m.onBeforeCompile = (sh: any, r: any) => {
            prev.call(m, sh, r);
            const at = sh.fragmentShader.includes("#include <lights_lambert_fragment>")
              ? "#include <lights_lambert_fragment>"
              : sh.fragmentShader.includes("#include <lights_physical_fragment>")
                ? "#include <lights_physical_fragment>"
                : null;
            if (!at || !sh.fragmentShader.includes("vViewPosition")) {
              win.__wxSkip = win.__wxSkip ?? {};
              const why = `${m.type} ${k.slice(0, 30)}`;
              win.__wxSkip[why] = (win.__wxSkip[why] ?? 0) + 1;
              return;
            }
            Object.assign(sh.uniforms, U);
            if (sh.fragmentShader.includes("float cover = clamp(base + snow * 0.6")) {
              sh.fragmentShader = sh.fragmentShader
                .replace(
                  "float cover = clamp(base + snow * 0.6 + (big - 0.5) * 0.8 + park * 0.18, 0.0, 1.0);",
                  "float wxWin = smoothstep(0.0, 0.2, base + snow);\n  float cover = clamp(base + snow * 0.6 + (big - 0.5) * 0.8 + park * 0.18, 0.0, 1.0) * wxWin;",
                )
                .replace(
                  "cover = max(cover, edge * (0.5 + snow * 0.45)",
                  "cover = max(cover, wxWin * edge * (0.5 + snow * 0.45)",
                )
                .replace(
                  "float salt = smoothstep(0.66, 0.78, rdFbm(P * 0.45 + 17.0)) * bare;",
                  "float salt = smoothstep(0.66, 0.78, rdFbm(P * 0.45 + 17.0)) * bare * wxWin;",
                )
                .replace(
                  "float wet = smoothstep(0.62, 0.8, rdFbm(P * 0.16 + 31.0)) * bare;",
                  "float wet = smoothstep(0.62, 0.8, rdFbm(P * 0.16 + 31.0)) * bare * max(wxWin * 0.7, wxWet);",
                );
            }
            sh.fragmentShader = sh.fragmentShader
              .replace("#include <common>", `#include <common>\n${src.PARS}`)
              .replace(at, `${src.BLOCK}\n${at}`);
          };
          m.customProgramCacheKey = () => `${key()}|wx${flags.join("")}`;
          m.needsUpdate = true;
        };
      }
      // ── each time: new materials patched (the land streams), the crowns' matrices, the values ──
      tp.scene.traverse((o: any) => {
        if (o.isSkinnedMesh || !o.isMesh) return;
        win.__wxRidge(o);
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) win.__wxPatch(m);
      });
      for (const cr of win.__wxCrowns) {
        const src = cr.pool.mesh;
        if (!src) continue;
        if (cr.im.instanceMatrix.count < src.instanceMatrix.count || cr.im.parent !== src.parent) {
          // (the pool grew, or was made again: a crown mesh to its size)
          cr.im.parent?.remove(cr.im);
          const im = new src.constructor(cr.im.geometry, src.material, src.instanceMatrix.count);
          im.frustumCulled = false;
          im.castShadow = true;
          im.layers.mask = src.layers.mask;
          src.parent?.add(im);
          cr.im = im;
        }
        cr.im.instanceMatrix.array.set(src.instanceMatrix.array.subarray(0, cr.im.instanceMatrix.array.length));
        cr.im.count = src.count;
        cr.im.instanceMatrix.needsUpdate = true;
        cr.im.visible = src.visible;
      }
      // the land round the spot
      if (win.__wxLandAt !== `${land.x0},${land.z0}`) {
        win.__wxLandAt = `${land.x0},${land.z0}`;
        const bin = atob(land.data);
        const n = Math.round(Math.sqrt(bin.length / 4));
        const c = document.createElement("canvas");
        c.width = n;
        c.height = n;
        const cx = c.getContext("2d") as CanvasRenderingContext2D;
        const id = cx.createImageData(n, n);
        for (let i = 0; i < bin.length; i++) id.data[i] = bin.charCodeAt(i);
        cx.putImageData(id, 0, 0);
        U.wxMap.value?.dispose();
        U.wxMap.value = win.__wxDataTex(c);
        U.wxMapO.value = [land.x0, land.z0, n, 0];
      }
      U.wxSnow.value = s.snow;
      U.wxDebug.value = (window as any).__wxDebugOn ?? 0;
      U.wxMelt.value = s.melt ? 1 : 0;
      U.wxWet.value = s.wet ?? 0;
      U.wxPud.value = s.puddles ?? 0;
      // (the pond's and the river's ice: only once the snow's been lying a while)
      U.wxIce.value = s.snow >= 0.6 ? 1 : 0;
      // the tyre tracks and the footprints (instanced, unlit, faded to the snow's colour): on snow only
      tp.scene.traverse((o: any) => {
        if (o.isInstancedMesh && o.material?.isMeshBasicMaterial && (o.instanceColor || o.geometry.attributes.aLeft))
          o.visible = s.snow > 0.15 || !!s.melt;
      });
      // the roads' own map (the winter's salt in it) only with snow about; a plain one green
      tp.scene.traverse((o: any) => {
        const m = o.material;
        if (m?.__wxMaps) {
          const want = s.snow > 0.15 || s.melt ? m.__wxMaps.winter : m.__wxMaps.green;
          if (m.map !== want) {
            m.map = want;
            m.needsUpdate = true;
          }
        }
      });
      // the slush on the roads (multiplied decals) only with snow about
      tp.scene.traverse((o: any) => {
        const m = o.material;
        if (m?.isMeshBasicMaterial && m.defines && "MF_WHITE" in m.defines && !("MF_SUN_SHADOW" in m.defines))
          o.visible = s.snow > 0.15 || !!s.melt;
      });
      // the roads: their packed snow by the snow, the ways clearing first
      const rs = Math.max(0, (s.snow - (s.melt ? 0.35 : 0.25)) / 0.75);
      if (win.__roadSnow) win.__roadSnow.value = rs;
      tp.scene.traverse((o: any) => {
        const m = o.material;
        if (!m || Array.isArray(m)) return;
        const pr = tp.renderer.properties.get(m);
        const u = pr?.uniforms;
        if (u?.rdBase) {
          if (m.__wxBase === undefined) m.__wxBase = u.rdBase.value;
          u.rdBase.value = m.__wxBase * rs;
        }
        if (u?.landBounce && !win.__wxBounce)
          win.__wxBounce = { u: u.landBounce.value, snow: u.landBounce.value.clone() };
        if (u?.landLight && !win.__wxLand) win.__wxLand = u.landLight.value;
      });
      // the ground's bounce: green-grey off grass, the snow's cold blue as it lies
      if (win.__wxBounce) {
        const b = win.__wxBounce;
        const k = Math.min(1, s.snow * 1.3);
        b.u.setRGB(0.58 + (b.snow.r - 0.58) * k, 0.66 + (b.snow.g - 0.66) * k, 0.5 + (b.snow.b - 0.5) * k);
      }
      // the sky: a green day's bluer, a wet day's low and grey, a snow day's today's
      const around = tp.around;
      const dome = around.domeMat?.uniforms;
      if (dome) {
        const lum = (c: any) => c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
        const toward = (c: any, r: number, gg: number, b: number, k: number) => {
          const l = lum(c);
          c.setRGB(c.r + (r * l - c.r) * k, c.g + (gg * l - c.g) * k, c.b + (b * l - c.b) * k);
        };
        if (s.sky === "clear") {
          toward(dome.top.value, 0.5, 0.8, 1.6, 0.85);
          toward(dome.mid.value, 0.72, 0.9, 1.3, 0.7);
          toward(dome.bot.value, 0.9, 0.98, 1.1, 0.4);
          toward(around.horizon, 0.92, 0.99, 1.08, 0.4);
        }
        if (s.sky === "grey") {
          for (const c of [dome.top.value, dome.mid.value, dome.bot.value, around.horizon]) {
            const l = lum(c) * 0.72;
            c.setRGB(l * 0.97, l, l * 1.03);
          }
        }
        tp.scene.fog.color.copy(around.horizon);
        if (!around.__wx) {
          around.__wx = true;
          const sw = around.setWeather.bind(around);
          around.setWeather = (a: number, b: number) => {
            sw(a, b);
            around.domeMat.uniforms.cloudK.value *= win.__wxCloud ?? 1;
          };
        }
        win.__wxCloud = s.sky === "clear" ? 0.18 : s.sky === "grey" ? 1.4 : 1;
        if (s.sky === "grey") {
          tp.scene.fog.near = 30;
          tp.scene.fog.far = 340;
        }
      }
      U.wxSky.value.copy(around.horizon);
      win.__wxFog = s.sky === "clear" ? [210, 1150, 0.88] : s.sky === "grey" ? [40, 420, 0.82] : null;
      if (!tp.__wxFrame) {
        tp.__wxFrame = true;
        // (the weather's frame: the view's Mood part — plan 72 phase 4)
        const wf = tp.mood.weatherFrame.bind(tp.mood);
        tp.mood.weatherFrame = (dt: number, b: any) => {
          wf(dt, b);
          const f = (window as any).__wxFog;
          if (!f) return;
          tp.scene.fog.near = f[0];
          tp.scene.fog.far = f[1];
          tp.scene.fog.color.copy(tp.around.horizon).multiplyScalar(f[2]);
        };
      }
      // the falling snow only when it's snowing
      for (const f of around.campus?.flakes ?? []) f.points.visible = s.falling === "snow";
      // the rain: thin streaks in a box round the camera, across the view
      let rain = win.__wxRain;
      if (!rain) {
        let basic: any = null;
        tp.scene.traverse((o: any) => {
          if (!basic && o.material?.isMeshBasicMaterial && !o.material.map && !o.isSkinnedMesh) basic = o;
        });
        const geo = new win.__wxGeo();
        const N = 9000;
        const pos = new Float32Array(N * 18);
        let sd = 11;
        const r = () => {
          sd = (sd * 16807) % 2147483647;
          return sd / 2147483647;
        };
        const yaw = tp.yaw;
        const sx = -Math.sin(yaw);
        const sz = Math.cos(yaw);
        for (let i = 0; i < N; i++) {
          let x = (r() - 0.5) * 24;
          const y = r() * 12 - 1;
          let z = (r() - 0.5) * 24;
          if (Math.hypot(x, z) < 3) {
            const a = r() * 6.283;
            x = Math.cos(a) * (3 + r() * 9);
            z = Math.sin(a) * (3 + r() * 9);
          }
          const L = 0.28 + r() * 0.25;
          const wdt = 0.006;
          const lean = 0.12;
          const q = [
            [x - sx * wdt, y, z - sz * wdt],
            [x + sx * wdt, y, z + sz * wdt],
            [x + sx * wdt + lean, y + L, z + sz * wdt],
            [x - sx * wdt + lean, y + L, z - sz * wdt],
          ];
          const tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
          for (const [j, v] of tri.entries()) pos.set(v, i * 18 + j * 3);
        }
        geo.setAttribute("position", new basic.geometry.attributes.position.constructor(pos, 3));
        const mat = new basic.material.constructor({
          color: 0xb8c2cc,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          fog: true,
        });
        rain = new basic.constructor(geo, mat);
        rain.frustumCulled = false;
        rain.renderOrder = 5;
        tp.scene.add(rain);
        win.__wxRain = rain;
      }
      rain.visible = s.falling === "rain";
      rain.position.copy(tp.camera.position);
      rain.position.y -= 4;
      const ll = win.__wxLand ? Math.max(win.__wxLand.r, win.__wxLand.g, win.__wxLand.b) : 1;
      rain.material.color.setRGB(0.72 * ll + 0.04, 0.76 * ll + 0.04, 0.8 * ll + 0.05);
    },
    [s, hour, land, { PARS, BLOCK }] as const,
  );
}

const me = (p: Page) =>
  p.evaluate(() => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    return { x: m.x as number, y: m.y as number, z: (m.z ?? 0) as number, level: m.level as number };
  });
// the camera behind me, looking at `to` (floor tiles)
async function frame(p: Page, to: { x: number; y: number }, v: { pitch?: number; dist?: number; lift?: number } = {}) {
  await p.evaluate(
    ([t, o]) => {
      const w = (window as any).__yutopia;
      const m = w.room.state.players.get(w.room.sessionId);
      const yaw = Math.atan2(t.y - m.y, t.x - m.x);
      const b = w.walker.body;
      b.yaw = yaw;
      if (w.walker.prev) w.walker.prev.yaw = yaw;
      const tp = w.tp;
      tp.mode = "free";
      tp.yaw = yaw;
      tp.pitch = o.pitch ?? 0.16;
      tp.dist = o.dist ?? 5.5;
      tp.dragged = 1e12;
      const T = tp.target;
      for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
      T.set(m.x, (m.z ?? 0) + (o.lift ?? 1.4), m.y);
      for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
    },
    [to, v] as const,
  );
  await p.waitForTimeout(1200);
}
const go = async (p: Page, at: { x: number; y: number }, level = 0) => {
  for (let k = 0; k < 4; k++) {
    if (k > 0) {
      // (a long jump that didn't take: by the arrival point first)
      await p.evaluate(() => (window as any).__yutopia.teleport("spawn"));
      await p.waitForTimeout(8000);
    }
    await p.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
    await p.waitForFunction((l) => (window as any).__yutopia.level === l, level, { timeout: 20_000 });
    const there = await p
      .waitForFunction(
        (a) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return Math.hypot(m.x - a.x, m.y - a.y) < 3;
        },
        at,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) {
      await p.waitForTimeout(7000);
      return;
    }
    console.log(`  (teleport to ${at.x}, ${at.y} didn't take: again)`);
  }
  throw new Error(`can't get to ${at.x}, ${at.y}`);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    // the 3D view's canvas alone: the HUD hidden
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    if (!document.getElementById("wxshot-css")) {
      const s = document.createElement("style");
      s.id = "wxshot-css";
      s.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
      document.head.appendChild(s);
    }
  });
  const file = `${out}/${quality === "high" ? "" : `${quality}-`}${name}.png`;
  await p.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

interface Spot {
  name: string;
  at: { x: number; y: number };
  to: { x: number; y: number };
  pitch?: number;
  dist?: number;
  car?: boolean; // stand by the nearest parked car and look at it
}
const SPOTS: Spot[] = [
  // the lot from the lobby's doors, looking west across it to the field and the trees
  { name: "lot", at: { x: 52, y: 22 }, to: { x: 0, y: 34 }, pitch: 0.14, dist: 6 },
  // the lawn north-east of the HQ, looking back at it and the water tower
  { name: "lawn", at: G(95, -95), to: G(20, 25), pitch: 0.12, dist: 6 },
  // the South woods trail, looking along it (dense woods both sides)
  { name: "trail", at: G(-258, 17), to: G(-278, -7), pitch: 0.12, dist: 4.5 },
  // the pond's south-west shore, looking over it to the dock and the woods
  { name: "pond", at: G(-240, -96), to: G(-236, -20), pitch: 0.1, dist: 4 },
  // Main Street, looking east along it
  { name: "main", at: G(380, -398), to: G(470, -405), pitch: 0.1, dist: 6 },
  // a car parked on Main Street, close
  { name: "car", at: G(380, -398), to: G(390, -405), pitch: 0.3, dist: 4.5, car: true },
];
const hh = (h: number) =>
  `${Math.floor(h)}${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, "0") : "00"}`.padStart(4, "0");

// ── the contact sheets: a page of the stills, screenshotted ──
async function sheets(browser: Browser) {
  const files = readdirSync(out).filter((f) => f.endsWith(".png") && !f.startsWith("sheet-"));
  const groups: Record<string, string[]> = {};
  for (const f of files) {
    const [spot] = f.replace(/^medium-/, "").split("-");
    const k = f.startsWith("medium-") ? "medium" : spot;
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  }
  const order = (f: string) => {
    const s = STATES.findIndex((x) => f.includes(`-${x.name}-`));
    const h = f.match(/-(\d{4})\.png$/)?.[1] ?? "";
    return `${h}-${String(s).padStart(2, "0")}-${f}`;
  };
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  for (const [k, fs] of Object.entries(groups)) {
    fs.sort((a, b) => order(a).localeCompare(order(b)));
    const html = `<html><body style="margin:0;background:#1b1d20;font:14px system-ui;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">
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
const ana = await open(browser, "ana@yutopia.test");
if (process.env.DEBUG)
  await ana.evaluate((d) => {
    (window as any).__wxDebugOn = d;
  }, Number(process.env.DEBUG));
const wantSpots = process.env.SPOTS?.split(",");
const wantStates = process.env.STATES?.split(",");
const hours = process.env.HOURS?.split(",").map(Number) ?? (quality === "high" ? [12, 19.25, 22] : [12]);
for (const s of SPOTS) {
  if (wantSpots && !wantSpots.includes(s.name)) continue;
  await go(ana, s.at, 0);
  await ready(ana).catch(() => {});
  let to = s.to;
  if (s.car) {
    // the nearest parked car: stand off its side, look at it
    const c = await ana.evaluate(() => {
      const w = (window as any).__yutopia;
      const tp = w.tp;
      const m = w.room.state.players.get(w.room.sessionId);
      let best: any = null;
      let bd = 1e9;
      const v = tp.camera.position.clone();
      tp.scene.traverse((o: any) => {
        const k = o.material?.customProgramCacheKey?.() ?? "";
        if (!o.isMesh || !String(k).startsWith("car-wear")) return;
        o.getWorldPosition(v);
        const d = Math.hypot(v.x - m.x, v.z - m.y);
        if (d < bd) {
          bd = d;
          best = { x: v.x, y: v.z };
        }
      });
      return best;
    });
    if (c) {
      await go(ana, { x: c.x + 3.2, y: c.y + 2.2 }, 0);
      to = c;
    }
  }
  const at = await me(ana);
  console.log(s.name, at);
  const land = landMap(at.x, at.y);
  await frame(ana, to, { pitch: s.pitch, dist: s.dist });
  for (const h of hours) {
    const states = STATES.filter((x) =>
      wantStates ? wantStates.includes(x.name) : h === 12 && quality === "high" ? true : LATE.includes(x.name),
    );
    for (const st of states) {
      // (twice: the materials compile after the first, and the uniforms they hand over are read then)
      await setState(ana, st, h, land);
      await ana.waitForTimeout(500);
      await setState(ana, st, h, land);
      await shot(ana, `${s.name}-${st.name}-${hh(h)}`);
    }
  }
}
if (process.env.SKIPS) console.log(await ana.evaluate(() => JSON.stringify((window as any).__wxSkip ?? {}, null, 1)));
await sheets(browser);
await browser.close();
