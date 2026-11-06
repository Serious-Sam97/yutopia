/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Phase 0 of docs/plan/64-the-fog.md: the stills, in the game as Ana (the dev stack, :3100 and
// :8100, the machine's GPU), with a mock of the morning fog patched into the 3D view's materials
// from here — no game code: each material that takes fog gets the morning's after three's own
// (height, drift, the sun's side, none inside the room I'm in).
//   node --experimental-strip-types e2e/fog-shots.mts [out dir]
//   QUALITY=medium: the Medium stills (6:30 and 7:30 only); SPOTS=lot,hq,…; TIERS=thick,…;
//   REAL=1: the game's own fog (phase 2) instead of the mock
import { type Browser, chromium, type Page, request } from "@playwright/test";
import { type FogKind, fogLift } from "@yutopia/shared/weather";

const out = process.argv[2] ?? "../../design/screens/fog";
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
  page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 300)));
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

// ── the mock ──
// The morning fog's air (F2): density a × e^(−(y − y0) / h) a tile, integrated along the view ray
// from where it leaves the room I'm in (a box, or none), drifting, gold towards a low sun.
const VERT_PARS = "#include <fog_pars_vertex>\nvarying vec3 vFogW;";
const VERT = `#include <fog_vertex>
{
  vec4 fw = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  fw = batchingMatrix * fw;
#endif
#ifdef USE_INSTANCING
  fw = instanceMatrix * fw;
#endif
  vFogW = (modelMatrix * fw).xyz;
}`;
const FRAG_PARS = `#include <fog_pars_fragment>
varying vec3 vFogW;
uniform float mfA; uniform float mfH; uniform float mfY0; uniform float mfSunK; uniform float mfT; uniform float mfBox;
uniform vec3 mfCol; uniform vec3 mfSunCol; uniform vec3 mfSun; uniform vec3 mfBoxMin; uniform vec3 mfBoxMax; uniform vec2 mfWind;
uniform float mfW; uniform float mfV;
float mfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mfNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mfHash(i), mfHash(i + vec2(1.0, 0.0)), f.x), mix(mfHash(i + vec2(0.0, 1.0)), mfHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const FRAG = `#include <fog_fragment>
#ifdef USE_FOG
if (mfA > 0.0) {
  vec3 ro = cameraPosition; vec3 rv = vFogW - ro; float L = length(rv); vec3 rd = rv / max(L, 1e-4);
  float t0 = 0.0;
  if (mfBox > 0.5) {
    vec3 inv = 1.0 / (rd + vec3(1e-6));
    vec3 tmax = max((mfBoxMin - ro) * inv, (mfBoxMax - ro) * inv);
    t0 = clamp(min(min(tmax.x, tmax.y), tmax.z), 0.0, L);
  }
  vec3 p0 = ro + rd * t0; float l = L - t0;
  float k = rd.y * l / mfH;
  float span = abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0;
  vec2 q = vFogW.xz * 0.012 + mfWind * mfT;
  float n = 0.65 * mfNoise(q) + 0.35 * mfNoise(q * 2.7 + 3.1);
  float od = mfA * exp(-(p0.y - mfY0) / mfH) * l * span * (0.6 + 0.8 * n);
  // the wall (a thick morning): by the distance squared, the first few metres clear, the same at any height
  float lw = max(0.0, l - 3.0) / mfV;
  od += mfW * 3.0 * lw * lw * (0.8 + 0.4 * n);
  float m = 1.0 - exp(-od);
  float s = pow(max(dot(rd, mfSun), 0.0), 5.0) * mfSunK;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(mfCol, mfSunCol, s), m);
}
#endif`;

interface Fog {
  fog: number; // 0 … 1: the morning's thickness × the hour's curve
  hour: number;
  box?: boolean; // none inside the room I'm in
  wall?: number; // 0 … 1: a thick morning's wall, Silent Hill's (~15 m)
  lift?: number; // 0 … 1: burning off, its floor risen (REAL only)
}

// REAL=1: the game's own fog (fog3d.ts, phase 2), not the mock — the view's setFog held to these
const REAL = !!process.env.REAL;
async function realFog(p: Page, f: Fog) {
  await p.evaluate((f) => {
    const w = (window as any).__yutopia;
    const tp = w.tp;
    w.updateNight = () => {};
    w.hour = f.hour;
    w.model?.setClock(f.hour);
    tp.setHour(f.hour);
    if (w.life) w.life.weather = () => [0, 0];
    if (!w.__setFog) {
      w.__setFog = tp.setFog.bind(tp);
      tp.setFog = () => {};
    }
    w.__setFog(f.fog, f.wall ?? 0, f.lift ?? 0);
    tp.fogNow.haze = f.fog;
    tp.fogNow.wall = f.wall ?? 0;
    tp.fogNow.lift = f.lift ?? 0;
  }, f);
}

async function setFog(p: Page, f: Fog) {
  if (REAL) return realFog(p, f);
  await p.evaluate(
    ([f, src]) => {
      const w = (window as any).__yutopia;
      const tp = w.tp;
      const V3 = tp.camera.position.constructor;
      const Col = tp.scene.fog.color.constructor;
      w.updateNight = () => {};
      w.hour = f.hour;
      w.model?.setClock(f.hour);
      tp.setHour(f.hour);
      if (w.life) w.life.weather = () => [0, 0];
      let U = (window as any).__mf;
      if (!U) {
        U = {
          mfA: { value: 0 },
          mfH: { value: 4.4 },
          mfY0: { value: 0 },
          mfSunK: { value: 0 },
          mfT: { value: 0 },
          mfBox: { value: 0 },
          mfW: { value: 0 },
          mfV: { value: 18 },
          mfCol: { value: new Col() },
          mfSunCol: { value: new Col() },
          mfSun: { value: new V3(0, 1, 0) },
          mfBoxMin: { value: new V3() },
          mfBoxMax: { value: new V3() },
          mfWind: { value: [0.004, 0.0015] },
        };
        (window as any).__mf = U;
        (window as any).__mfLand = null;
        const t0 = performance.now();
        const tick = () => {
          U.mfT.value = (performance.now() - t0) / 1000;
          requestAnimationFrame(tick);
        };
        tick();
        const ink = tp.post?.ink?.mat?.uniforms?.fade?.value;
        (window as any).__mfInk = ink ? [ink.x ?? ink[0], ink.y ?? ink[1]] : null;
      }
      // every material that takes fog, once (new ones as the land streams in)
      const seen = new Set();
      tp.scene.traverse((o: any) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          // (the far ridges — unlit, vertex coloured — and the snow's darkening decals, multiplied in:
          // unfogged in the game, they show through the wall; the decals go to white, not grey)
          if (!m.fog && m.isMeshBasicMaterial && (m.vertexColors || m.blending === 4)) m.fog = true;
          if (seen.has(m) || m.__mf || !m.fog || m.isRawShaderMaterial) continue;
          seen.add(m);
          m.__mf = true;
          const prev = m.onBeforeCompile;
          const key0 = Object.hasOwn(m, "customProgramCacheKey")
            ? m.customProgramCacheKey.bind(m)
            : (() => {
                const k = prev.toString();
                return () => k;
              })();
          m.onBeforeCompile = (s: any, r: any) => {
            prev.call(m, s, r);
            if (s.uniforms.landLight && !(window as any).__mfLand) (window as any).__mfLand = s.uniforms.landLight;
            const skip = (why: string) => {
              const k = `${m.type} ${m.name || ""} ${why}`;
              const win = window as any;
              win.__mfSkip = win.__mfSkip ?? {};
              win.__mfSkip[k] = (win.__mfSkip[k] ?? 0) + 1;
            };
            if (
              !s.vertexShader.includes("#include <fog_vertex>") ||
              !s.vertexShader.includes("#include <begin_vertex>")
            )
              return skip(
                `vertex: fog ${s.vertexShader.includes("fog_vertex")} begin ${s.vertexShader.includes("begin_vertex")}`,
              );
            if (s.vertexShader.includes("vFogW")) return;
            if (!s.fragmentShader.includes("#include <fog_fragment>")) return skip("no fog_fragment");
            Object.assign(s.uniforms, U);
            s.vertexShader = s.vertexShader
              .replace("#include <fog_pars_vertex>", src.VERT_PARS)
              .replace("#include <fog_vertex>", src.VERT);
            s.fragmentShader = s.fragmentShader
              .replace("#include <fog_pars_fragment>", src.FRAG_PARS)
              .replace(
                "#include <fog_fragment>",
                m.blending === 4 ? src.FRAG.replace("mix(mfCol, mfSunCol, s)", "vec3(1.0)") : src.FRAG,
              );
          };
          m.customProgramCacheKey = () => `${key0()}|mf`;
          m.needsUpdate = true;
        }
      });
      // the far ridges (unlit, unfogged): into it too
      const ridge = tp.around.grounds?.ridgeMat;
      if (ridge && !ridge.fog && f.fog > 0) {
        ridge.fog = true;
        ridge.needsUpdate = true;
      }
      // its amount: a haze ~150 m at eye height on open land at 1 (3 / 150, the land at 0)
      U.mfA.value = 0.028 * f.fog;
      const wall = f.wall ?? 0;
      U.mfW.value = wall;
      // its colour: as light as the land's light (black in the dark), blue grey at first light,
      // warm by 7:30, white by the time it goes
      const land = (window as any).__mfLand?.value ?? { r: 1, g: 1, b: 1 };
      const h = f.hour;
      const lerp = (a: number[], b: number[], t: number) =>
        a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));
      const tint =
        h < 6.5
          ? [0.82, 0.87, 0.97]
          : h < 8
            ? lerp([0.82, 0.87, 0.97], [1, 0.95, 0.88], (h - 6.5) / 1.5)
            : lerp([1, 0.95, 0.88], [0.96, 0.97, 1], (h - 8) / 1.5);
      const lift = 1.05;
      U.mfCol.value.setRGB(
        Math.min(1, land.r * lift) * tint[0],
        Math.min(1, land.g * lift) * tint[1],
        Math.min(1, land.b * lift) * tint[2],
      );
      // (the wall's: a flat light grey, most of the hour's colour gone)
      if (wall > 0) {
        const c = U.mfCol.value;
        const g = (c.r * 0.3 + c.g * 0.55 + c.b * 0.15) * 0.95;
        c.setRGB(c.r + (g - c.r) * 0.75 * wall, c.g + (g - c.g) * 0.75 * wall, c.b + (g - c.b) * 0.75 * wall);
      }
      // the sun's side: its colour, brighter, while it's low
      const el = tp.sun.userData.el as number;
      const az = tp.sun.userData.az as number;
      U.mfSun.value.set(-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
      const sc = tp.sun.color;
      const lum = Math.max(land.r, land.g, land.b) * 1.2;
      U.mfSunCol.value.setRGB(Math.min(1, sc.r * lum), Math.min(1, sc.g * lum * 0.92), Math.min(1, sc.b * lum * 0.8));
      U.mfSunK.value = (el > -0.12 ? Math.max(0, 1 - el / 0.7) * 0.5 : 0) * (1 - 0.85 * wall);
      // none inside the room I'm in: the tiles round me, not the open sky's (the lot's asphalt, concrete)
      U.mfBox.value = 0;
      if (f.box) {
        const map = w.rows(); // (the floor I'm on as rows from its corner, asked of the structure)
        const me = w.room.state.players.get(w.room.sessionId);
        const open = (x: number, y: number) => {
          const c = map.tiles[y]?.[x];
          return !c || c === " " || c === "a" || c === "c";
        };
        const sx = Math.floor(me.x);
        const sy = Math.floor(me.y);
        let x0 = sx;
        let x1 = sx;
        let y0 = sy;
        let y1 = sy;
        const q = [[sx, sy]];
        const done = new Set([`${sx},${sy}`]);
        while (q.length && done.size < 20000) {
          const [x, y] = q.pop() as number[];
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const k = `${x + dx},${y + dy}`;
            if (!done.has(k) && !open(x + dx, y + dy)) {
              done.add(k);
              q.push([x + dx, y + dy]);
            }
          }
        }
        U.mfBox.value = 1;
        U.mfBoxMin.value.set(x0, (me.z ?? 0) - 0.5, y0);
        U.mfBoxMax.value.set(x1 + 1, (me.z ?? 0) + 3.4, y1 + 1);
        (window as any).__mfBoxAt = [x0, y0, x1 + 1, y1 + 1];
      }
      // the sky: whited out by it, no stars
      const dome = tp.around.domeMat?.uniforms;
      // (the overcast's pattern thinned out with it: setWeather sets it each frame)
      const k0 = Math.min(1, Math.max(f.fog * 1.1, wall * 2.5));
      (window as any).__mfK = k0;
      if (!tp.around.__mf) {
        tp.around.__mf = true;
        const sw = tp.around.setWeather.bind(tp.around);
        tp.around.setWeather = (s: number, wd: number) => {
          sw(s, wd);
          tp.around.domeMat.uniforms.cloudK.value *= 1 - 0.85 * (window as any).__mfK;
        };
      }
      if (dome && f.fog > 0) {
        const k = k0;
        dome.top.value.lerp(U.mfCol.value, wall > 0 ? k : k * 0.8);
        dome.mid.value.lerp(U.mfCol.value, k);
        dome.bot.value.lerp(U.mfCol.value, k);
        tp.around.horizon.lerp(U.mfCol.value, k);
        tp.scene.fog.color.copy(tp.around.horizon);
        const stars = tp.around.stars?.material;
        if (stars) stars.opacity *= 1 - k;
      }
      // the ink goes with what it outlines
      const ink = tp.post?.ink?.mat?.uniforms?.fade?.value;
      const d = (window as any).__mfInk;
      if (ink && d) {
        const a = wall > 0.3 ? 5 : f.fog > 0 ? Math.min(d[0], 20 / Math.max(0.25, f.fog)) : d[0];
        const b = wall > 0.3 ? 22 : f.fog > 0 ? Math.min(d[1], 110 / Math.max(0.25, f.fog)) : d[1];
        if (ink.set) ink.set(a, b);
        else {
          ink[0] = a;
          ink[1] = b;
        }
      }
    },
    [f, { VERT_PARS, VERT, FRAG_PARS, FRAG }] as const,
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
  await p.evaluate(([a, l]) => (window as any).__yutopia.teleport({ ...a, level: l }), [at, level] as const);
  await p.waitForFunction((l) => (window as any).__yutopia.level === l, level, { timeout: 20_000 });
  await p.waitForTimeout(6000);
};
const shot = async (p: Page, name: string) => {
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    // the 3D view's canvas alone: the HUD hidden
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-fogshot", "");
    if (!document.getElementById("fogshot-css")) {
      const s = document.createElement("style");
      s.id = "fogshot-css";
      s.textContent = "*:not(:has([data-fogshot])):not([data-fogshot]){visibility:hidden!important}";
      document.head.appendChild(s);
    }
  });
  const file = `${out}/${quality === "high" ? "" : `${quality}-`}${name}.png`;
  await p.screenshot({ path: file });
  if (process.env.SKIPS)
    console.log(
      await p.evaluate(() => {
        const out: Record<string, number> = {};
        (window as any).__yutopia.tp.scene.traverse((o: any) => {
          const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of ms)
            if (!m.fog || m.isRawShaderMaterial || !m.__mf) {
              const k = `${o.type}/${m.type} fog:${m.fog} mf:${!!m.__mf} vis:${o.visible} u:${Object.keys(
                m.uniforms ?? {},
              )
                .slice(0, 6)
                .join(
                  ",",
                )} geo:${o.geometry?.type}/${o.geometry?.attributes?.position?.count} r:${o.geometry?.boundingSphere?.radius?.toFixed?.(0)} col:${m.color?.getHexString?.()} vc:${m.vertexColors} tr:${m.transparent} bl:${m.blending}`;
              out[k] = (out[k] ?? 0) + 1;
            }
        });
        return JSON.stringify({ skip: (window as any).__mfSkip ?? {}, unfogged: out }, null, 1);
      }),
    );
  console.log(`${name}: ${file}`);
};

// the mornings by the hour (F1): a mist, a fog (the haze), a thick one (the wall, lifting later);
// TIERS=thick: only those
const HOURS = [5.5, 6.5, 7.5, 9, 10];
const MORNINGS: Record<string, { fog: Record<number, number>; wall?: boolean }> = {
  fog: { fog: { 5.5: 0.85, 6.5: 1, 7.5: 0.95, 8.5: 0.8, 9: 0.6, 9.5: 0.35, 10: 0.15 } },
  mist: { fog: { 5.5: 0.4, 6.5: 0.45, 7.5: 0.4, 9: 0.15, 10: 0 } },
  thick: { fog: { 5.5: 0.9, 6.5: 1, 7.5: 1, 9: 0.8, 10: 0.35 }, wall: true },
};
const tiers = process.env.TIERS?.split(",") ?? Object.keys(MORNINGS);
const morning = (t: string, h: number, box?: boolean): Fog => {
  const m = MORNINGS[t];
  return { fog: m.fog[h], hour: h, box, wall: m.wall ? m.fog[h] : 0, lift: fogLift(t as FogKind, h) };
};
const hh = (h: number) => `${Math.floor(h)}${h % 1 ? "30" : "00"}`.padStart(4, "0");

interface Spot {
  name: string;
  at: { x: number; y: number };
  to: { x: number; y: number };
  level?: number;
  box?: boolean;
  pitch?: number;
  dist?: number;
}
// SET=banks (F3, phase 3): up over the low places; SET=lift: the burn-off, the ground clearing first
const BANKS: Spot[] = [
  // up behind me on the river's east bank, looking north up it
  { name: "bank-river", at: G(238, -300), to: G(258, -480), pitch: 0.42, dist: 24 },
  // the trail's footbridge, looking east down the ravine
  { name: "bank-ravine", at: G(-262, -238), to: G(-150, -172), pitch: 0.32, dist: 14 },
  // the pond's north shore, up behind me, looking south over it
  { name: "bank-pond", at: G(-240, -102), to: G(-238, 0), pitch: 0.4, dist: 20 },
];
const SPOTS: Spot[] = [
  // the lot's east aisle, looking west across it to the field and the trees
  { name: "lot", at: { x: 37.8, y: 30 }, to: { x: 0, y: 34 } },
  // the lawn north-east of the HQ, looking back at it and the water tower
  { name: "hq", at: G(95, -95), to: G(20, 25), pitch: 0.12, dist: 6 },
  // out on the frozen river, looking south down it
  { name: "river", at: G(258, -330), to: G(256, -100), pitch: 0.15, dist: 6 },
  // out on the frozen pond, looking south over it
  { name: "pond", at: G(-240, -86), to: G(-238, 0), pitch: 0.15, dist: 6 },
  // the lobby, looking out of its glass doors at the lot
  { name: "glass", at: { x: 64.5, y: 15 }, to: { x: 30, y: 40 }, box: true, pitch: 0.1, dist: 4 },
];

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const ana = await open(browser, "ana@yutopia.test");
const want = process.env.SPOTS?.split(",");
const set = process.env.SET;
if (set === "banks" || set === "lift") {
  const spots = set === "banks" ? BANKS : SPOTS.filter((s) => s.name === "hq" || s.name === "river");
  const hours = set === "banks" ? [6.5, 7.5, 9] : [7.5, 8.5, 9, 9.5, 10];
  for (const s of spots) {
    await go(ana, s.at, s.level ?? 0);
    await ready(ana).catch(() => {});
    console.log(s.name, await me(ana));
    await frame(ana, s.to, { pitch: s.pitch, dist: s.dist });
    if (set === "banks") {
      await realFog(ana, { fog: 0, hour: 7.5 });
      await shot(ana, `${s.name}-clear-0730`);
    }
    for (const h of hours) {
      await setFog(ana, morning("fog", h, s.box));
      // (the banks are made a sheet a frame: time for them all)
      await ana.waitForTimeout(set === "banks" ? 2500 : 400);
      await setFog(ana, morning("fog", h, s.box));
      await shot(ana, `${set === "lift" ? "lift-" : ""}${s.name}-fog-${hh(h)}`);
    }
  }
  await browser.close();
  process.exit(0);
}
for (const s of SPOTS) {
  if (want && !want.includes(s.name)) continue;
  await go(ana, s.at, s.level ?? 0);
  await ready(ana).catch(() => {});
  console.log(s.name, await me(ana));
  await frame(ana, s.to, { pitch: s.pitch, dist: s.dist });
  if (quality !== "high") {
    for (const t of tiers)
      for (const h of [6.5, 7.5]) {
        await setFog(ana, morning(t, h, s.box));
        await shot(ana, `${s.name}-${t}-${hh(h)}`);
      }
    continue;
  }
  if (!process.env.TIERS) {
    await setFog(ana, { fog: 0, hour: 7.5, box: s.box });
    await shot(ana, `${s.name}-clear-0730`);
  }
  for (const t of tiers)
    for (const h of HOURS) {
      // (twice: the land's light is read from the materials as they compile, after the first)
      await setFog(ana, morning(t, h, s.box));
      await ana.waitForTimeout(400);
      await setFog(ana, morning(t, h, s.box));
      await shot(ana, `${s.name}-${t}-${hh(h)}`);
    }
  if (s.box && !process.env.TIERS) {
    // the check: today's storm in the lobby (the mock off), looking into the building
    await setFog(ana, { fog: 0, hour: 12, box: true });
    await frame(ana, { x: 120, y: 15 }, { pitch: 0.1, dist: 4 });
    await shot(ana, "lobby-calm-1200");
    await ana.evaluate(() => {
      (window as any).__yutopia.life.weather = () => [1, 0];
    });
    await ana.waitForTimeout(1500);
    await shot(ana, "lobby-storm-1200");
    await ana.evaluate(() => {
      (window as any).__yutopia.life.weather = () => [0, 0];
    });
  }
}
await browser.close();
