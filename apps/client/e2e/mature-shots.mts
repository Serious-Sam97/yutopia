/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// The mature-look investigation: the same frames of the live game (as Bia, High, the dev stack) in
// today's look and in candidate looks, patched into the page from here — the finish pass's grade, the
// ink pass, the cel bands and the world's albedo — no game code changed.
//   node --experimental-strip-types e2e/mature-shots.mts [out dir]
//   SPOTS=lot,…  LOOKS=today,film,…
import { mkdirSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/mature";
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const want = process.env.SPOTS?.split(",");

interface Spot {
  name: string;
  at: { x: number; y: number };
  level: number;
  to: { x: number; y: number };
  pitch?: number;
  dist?: number;
  lift?: number;
  face?: boolean;
  /** no post haze (it can't see glass: what's behind a window takes the haze over the glass's tint) */
  noHaze?: boolean;
  hours: number[];
}
const SPOTS: Spot[] = [
  { name: "lot", at: { x: -24, y: 18 }, level: 0, to: { x: 10, y: 18 }, pitch: 0.12, dist: 6, hours: [12, 17, 22] },
  { name: "corner", at: { x: -16, y: -14 }, level: 0, to: { x: 10, y: 10 }, pitch: 0.18, dist: 6, hours: [12] },
  {
    name: "lobby",
    at: { x: 3, y: 12 },
    level: 0,
    to: { x: -5, y: 12 },
    pitch: 0.06,
    dist: 2.6,
    noHaze: true,
    hours: [12, 22],
  },
  { name: "grounds", at: { x: 5, y: 6 }, level: 4, to: { x: 5, y: -5 }, pitch: 0.1, dist: 4, hours: [12, 17] },
  {
    name: "face",
    at: { x: -16, y: 18 },
    level: 0,
    to: { x: 10, y: 18 },
    pitch: 0.04,
    dist: 1.15,
    face: true,
    hours: [12, 22],
  },
];

// A look: the finish pass's grade (null: today's shader, untouched), the ink, the cel bands, the albedo.
interface Look {
  name: string;
  grade: null | {
    expo: number; // linear exposure before the curve
    shoulder: number; // where the highlights start to roll off (display, 1 = none)
    sat: number;
    contrast: number; // 0 none … 1 a full smoothstep S
    shade: [number, number, number]; // tint of the darks
    light: [number, number, number]; // tint of the lights
    lift: [number, number, number]; // the blacks' floor
    vig: number;
    vigC: [number, number, number];
    grain: number;
  };
  ink: { rgb: [number, number, number]; k: number; lo: number; hi: number; fade: [number, number] } | null;
  haze: { rgb: [number, number, number]; k: number } | null;
  cel: { tint: [number, number, number]; rim: number; soft: number } | null;
  albedo: { sat: number; val: number } | null; // the world's own colours (not the people's)
}
const LOOKS: Look[] = [
  { name: "today", grade: null, ink: null, haze: null, cel: null, albedo: null },
  {
    // the grade alone: a filmic shoulder, neutral-cool shade, warm light, a little less colour
    name: "film",
    grade: {
      expo: 1.0,
      shoulder: 0.72,
      sat: 0.86,
      contrast: 0.28,
      shade: [0.9, 0.95, 1.02],
      light: [1.03, 1.0, 0.95],
      lift: [0.035, 0.03, 0.028],
      vig: 0.36,
      vigC: [0.06, 0.05, 0.045],
      grain: 0.022,
    },
    ink: null,
    haze: null,
    cel: null,
    albedo: null,
  },
  {
    // + the world's colours muted and the cel/ink calmed: graphic-novel
    name: "muted",
    grade: {
      expo: 1.0,
      shoulder: 0.7,
      sat: 0.9,
      contrast: 0.32,
      shade: [0.9, 0.95, 1.02],
      light: [1.03, 1.0, 0.95],
      lift: [0.035, 0.03, 0.028],
      vig: 0.38,
      vigC: [0.06, 0.05, 0.045],
      grain: 0.022,
    },
    ink: { rgb: [0.16, 0.12, 0.1], k: 0.6, lo: 0.016, hi: 0.06, fade: [14, 70] },
    haze: null,
    cel: { tint: [0.68, 0.7, 0.78], rim: 0.45, soft: 1 },
    albedo: { sat: 0.7, val: 0.94 },
  },
  {
    // low key, teal darks and amber lights, the air thick with distance: small-town noir (the HUD's look)
    name: "noir",
    grade: {
      expo: 0.84,
      shoulder: 0.66,
      sat: 0.8,
      contrast: 0.42,
      shade: [0.86, 0.97, 1.04],
      light: [1.06, 0.99, 0.88],
      lift: [0.03, 0.035, 0.04],
      vig: 0.5,
      vigC: [0.035, 0.035, 0.04],
      grain: 0.03,
    },
    ink: { rgb: [0.12, 0.11, 0.12], k: 0.75, lo: 0.025, hi: 0.08, fade: [12, 60] },
    haze: { rgb: [0.42, 0.47, 0.52], k: 0.012 },
    cel: { tint: [0.62, 0.68, 0.76], rim: 0.6, soft: 0.6 },
    albedo: { sat: 0.62, val: 0.9 },
  },
  {
    // colour kept but harmonised; the ink a darker shade of what it outlines, softer cel steps: painterly
    name: "painted",
    grade: {
      expo: 1.0,
      shoulder: 0.74,
      sat: 0.95,
      contrast: 0.25,
      shade: [0.92, 0.94, 1.03],
      light: [1.04, 1.0, 0.93],
      lift: [0.04, 0.035, 0.035],
      vig: 0.3,
      vigC: [0.08, 0.06, 0.05],
      grain: 0.016,
    },
    ink: { rgb: [0.42, 0.3, 0.26], k: 0.85, lo: 0.012, hi: 0.05, fade: [16, 80] },
    haze: { rgb: [0.72, 0.76, 0.82], k: 0.006 },
    cel: { tint: [0.7, 0.66, 0.8], rim: 0.8, soft: 2.2 },
    albedo: { sat: 0.82, val: 0.96 },
  },
];
const wantLooks = process.env.LOOKS?.split(",");
const looks = LOOKS.filter((l) => !wantLooks || wantLooks.includes(l.name));

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

const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const tok = await token("bia@yutopia.test");
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto(base);
await ready(page);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:dark", { mode: "peaceful" }));

const go = async (at: { x: number; y: number }, level: number) => {
  for (let k = 0; k < 3; k++) {
    await page.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
    const there = await page
      .waitForFunction(
        ([a, l]) => {
          const w = (window as any).__yutopia;
          const m = w.room.state.players.get(w.room.sessionId);
          return w.level === l && Math.hypot(m.x - a.x, m.y - a.y) < 3;
        },
        [at, level] as const,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (there) {
      await page.waitForTimeout(6000);
      return;
    }
  }
  throw new Error(`can't get to ${at.x}, ${at.y} on ${level}`);
};
const frame = async (s: Spot) =>
  page.evaluate((s) => {
    const w = (window as any).__yutopia;
    const m = w.room.state.players.get(w.room.sessionId);
    const yaw = Math.atan2(s.to.y - m.y, s.to.x - m.x);
    const b = w.walker.body;
    b.yaw = s.face ? yaw + Math.PI : yaw;
    if (w.walker.prev) w.walker.prev.yaw = b.yaw;
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = yaw;
    tp.pitch = s.pitch ?? 0.16;
    tp.dist = s.dist ?? 5.5;
    tp.dragged = 1e12;
    const T = tp.target;
    for (const k of ["set", "copy", "lerp", "add"]) delete T[k];
    T.set(m.x, (m.z ?? 0) + (s.lift ?? (s.face ? 1.55 : 1.4)), m.y);
    for (const k of ["set", "copy", "lerp", "add"]) T[k] = () => T;
  }, s);
const hold = (h: number) =>
  page.evaluate((h) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.hour = h;
    w.model?.setClock?.(h);
    w.engine?.setClock?.(h);
    w.tp.setHour(h);
    if (w.life) w.life.weather = () => [0, 0];
  }, h);

// Put a look on the page: the finish and ink passes' shaders swapped (today's kept to go back to),
// every material of the scene recompiled with the cel/albedo edits under a key of the look's.
const apply = (look: Look) =>
  page.evaluate((L) => {
    const w = (window as any).__yutopia;
    const tp = w.tp;
    const post = tp.post;
    if (!post) throw new Error("no post (not High?)");
    const fin = post.finish.material;
    const ink = post.ink.mat;
    w.__mature ??= {
      finFrag: fin.fragmentShader,
      inkFrag: ink.fragmentShader,
      inkCol: ink.uniforms.ink.value.clone(),
      inkFade: ink.uniforms.fade.value.clone(),
      setNight: post.ink.setNight.bind(post.ink),
      look: null,
    };
    const keep = w.__mature;
    keep.look = L;
    // -- the grade
    if (!L.grade) {
      fin.fragmentShader = keep.finFrag;
    } else {
      const g = L.grade;
      const u = fin.uniforms;
      const set = (k: string, val: any) => {
        if (u[k]) u[k].value = val;
        else u[k] = { value: val };
      };
      const V3 = Object.getPrototypeOf(ink.uniforms.ink.value).constructor; // Color
      set("expo", g.expo);
      set("shoulder", g.shoulder);
      set("sat", g.sat);
      set("contrast", g.contrast);
      set("shadeT", new V3(...g.shade));
      set("lightT", new V3(...g.light));
      set("lift", new V3(...g.lift));
      set("vig", g.vig);
      set("vigC", new V3(...g.vigC));
      u.grain.value = g.grain;
      fin.fragmentShader = `
        uniform sampler2D tDiffuse; uniform float frame; uniform float grain; uniform vec2 res; varying vec2 vUv;
        uniform float expo; uniform float shoulder; uniform float sat; uniform float contrast;
        uniform vec3 shadeT; uniform vec3 lightT; uniform vec3 lift; uniform float vig; uniform vec3 vigC;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 roll(vec3 x) {
          float k = shoulder;
          vec3 o = k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k)));
          return mix(x, o, step(vec3(k), x));
        }
        void main() {
          vec4 s = texture2D(tDiffuse, vUv);
          vec4 c = sRGBTransferOETF(vec4(max(s.rgb * expo, 0.0), s.a));
          c.rgb = roll(c.rgb);
          float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb *= mix(shadeT, lightT, smoothstep(0.1, 0.8, l));
          l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(vec3(l), c.rgb, sat);
          c.rgb = clamp(c.rgb, 0.0, 1.0);
          c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), contrast);
          c.rgb = c.rgb * (1.0 - lift) + lift;
          float d = distance(vUv, vec2(0.5)) / 0.7071;
          float v = smoothstep(0.3, 1.0, d) * vig;
          c.rgb = mix(c.rgb, vigC, v);
          c.a = mix(c.a, 1.0, v);
          float n = hash(floor(vUv * res) + frame) - 0.5;
          c.rgb += n * grain * c.a;
          gl_FragColor = c;
        }`;
    }
    fin.needsUpdate = true;
    // -- the ink (and the haze, which needs the depth the ink has)
    const iu = ink.uniforms;
    if (!iu.hazeK) {
      iu.hazeK = { value: 0 };
      iu.hazeC = { value: keep.inkCol.clone() };
      iu.lo = { value: 0.012 };
      iu.hi = { value: 0.05 };
    }
    if (L.ink) {
      iu.ink.value.setRGB(...L.ink.rgb.map((x: number) => x / 2.2));
      iu.fade.value.set(...L.ink.fade);
      iu.lo.value = L.ink.lo;
      iu.hi.value = L.ink.hi;
      post.ink.setNight = (n: number) => {
        iu.strength.value = (L.ink.k * (0.8 - 0.4 * n)) / 0.8;
      };
    } else {
      iu.ink.value.copy(keep.inkCol);
      iu.fade.value.copy(keep.inkFade);
      iu.lo.value = 0.012;
      iu.hi.value = 0.05;
      post.ink.setNight = keep.setNight;
    }
    iu.hazeK.value = L.haze ? L.haze.k : 0;
    if (L.haze) iu.hazeC.value.setRGB(...L.haze.rgb).convertSRGBToLinear();
    ink.fragmentShader =
      L.ink || L.haze
        ? keep.inkFrag
            .replace(
              "uniform float fogV;",
              "uniform float fogV; uniform float hazeK; uniform vec3 hazeC; uniform float lo; uniform float hi;",
            )
            .replace("smoothstep(0.012, 0.05, k)", "smoothstep(lo, hi, k)")
            .replace(
              "gl_FragColor = vec4(mix(c.rgb, c.rgb * ink * 2.2, e * w * strength), c.a);",
              `vec3 o = mix(c.rgb, c.rgb * ink * 2.2, e * w * strength);
      // (the air: what's far takes the haze's colour, the lamps' glow less so)
      float hz = 1.0 - exp(-max(0.0, d - 4.0) * hazeK);
      o = mix(o, hazeC * (0.35 + 0.65 * smoothstep(0.0, 0.5, dot(hazeC, vec3(0.33)))), hz);
      gl_FragColor = vec4(o, c.a);`,
            )
        : keep.inkFrag;
    ink.needsUpdate = true;
    // -- the materials: cel bands and the world's own colours
    const tag = L.cel || L.albedo ? `|mature-${L.name}` : "";
    const seen = new Set<any>();
    tp.scene.traverse((o: any) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (!m.__mature) {
          m.__mature = { obc: m.onBeforeCompile, key: m.customProgramCacheKey, skinned: !!o.isSkinnedMesh };
        }
        const o0 = m.__mature;
        if (!tag) {
          m.onBeforeCompile = o0.obc;
          m.customProgramCacheKey = o0.key;
        } else {
          m.onBeforeCompile = function (sh: any, r: any) {
            o0.obc.call(this, sh, r);
            const look = (window as any).__yutopia.__mature.look;
            let f: string = sh.fragmentShader;
            if (look.cel) {
              const [a, b, c] = look.cel.tint;
              f = f.replaceAll("vec3(0.6, 0.64, 0.86)", `vec3(${a.toFixed(3)}, ${b.toFixed(3)}, ${c.toFixed(3)})`);
              f = f.replace(/rim \* ([0-9.]+) \*/g, (_, x) => `rim * ${(Number(x) * look.cel.rim).toFixed(3)} *`);
              const s = look.cel.soft;
              f = f.replaceAll(
                "smoothstep(-0.2, 0.12, l)",
                `smoothstep(${(-0.04 - 0.16 * s).toFixed(3)}, ${(-0.04 + 0.16 * s).toFixed(3)}, l)`,
              );
            }
            if (look.albedo && !o0.skinned && f.includes("#include <color_fragment>")) {
              f = f.replace(
                "#include <color_fragment>",
                `#include <color_fragment>
  { float al = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(vec3(al), diffuseColor.rgb, ${look.albedo.sat.toFixed(3)}) * ${look.albedo.val.toFixed(3)}; }`,
              );
            }
            sh.fragmentShader = f;
          };
          m.customProgramCacheKey = function () {
            return (o0.key ? o0.key.call(this) : "") + tag;
          };
        }
        m.needsUpdate = true;
      }
    });
  }, look);

const shot = async (name: string) => {
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-wxshot", "");
    if (!document.getElementById("wxshot-css")) {
      const st = document.createElement("style");
      st.id = "wxshot-css";
      st.textContent = "*:not(:has([data-wxshot])):not([data-wxshot]){visibility:hidden!important}";
      document.head.appendChild(st);
    }
  });
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  console.log(`${name}: ${file}`);
};

for (const s of SPOTS) {
  if (want && !want.includes(s.name)) continue;
  await go(s.at, s.level);
  await frame(s);
  for (const h of s.hours) {
    await hold(h);
    await page.waitForTimeout(400);
    for (const L of looks) {
      await hold(h);
      await apply(s.noHaze ? { ...L, haze: null } : L);
      await shot(`${s.name}-${String(h).padStart(2, "0")}-${L.name}`);
    }
  }
  await apply(LOOKS[0]);
}
await browser.close();
