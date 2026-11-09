/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 11 (dev only) — where High's frame goes, as Ana on the dev stack at a spot and a held
// camera: the scene's own render timed on the GPU (EXT_disjoint_timer_query_webgl2, 300 frames) and the
// frames' gaps (rAF), then again with a thing switched off — the trees' and plants' cards (the atlas),
// the AO. The look by LOOKQ (life, life&out=old, …).
//   LOOKQ=life node --experimental-strip-types e2e/life-gpu.mts "x,y,yaw,pitch,dist"
import { chromium, request } from "@playwright/test";

const [x, y, yaw, pitch, dist] = (process.argv[2] ?? "420,-420,1.5708,0.2,8").split(",").map(Number);
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post("http://localhost:8100/api/login", {
      data: { email: "ana@yutopia.test", password: "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await p.goto(`http://localhost:3100/?look=${process.env.LOOKQ ?? "life"}`);
await p.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready", null, { timeout: 180000 });
await p.evaluate(([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }), [x, y]);
await p.waitForTimeout(22000);
await p.evaluate(
  ([yaw, pitch, dist]) => {
    const w = (window as any).__yutopia;
    w.updateNight = () => {};
    w.tp.setHour(12);
    const tp = w.tp;
    tp.mode = "free";
    tp.yaw = yaw;
    tp.pitch = pitch;
    tp.dist = dist;
    tp.dragged = 1e12;
  },
  [yaw, pitch, dist],
);
await p.waitForTimeout(3000);
const gapsNow = () =>
  p.evaluate(
    () =>
      new Promise<string>((done) => {
        const g: number[] = [];
        let last = performance.now();
        const t = (n: number) => {
          g.push(n - last);
          last = n;
          if (g.length < 200) requestAnimationFrame(t);
          else {
            g.sort((a, b) => a - b);
            done(`median ${g[100].toFixed(1)} p95 ${g[190].toFixed(1)} slow ${g.filter((x) => x > 20).length}/200`);
          }
        };
        requestAnimationFrame(t);
      }),
  );
const each = (fn: string) =>
  `(() => { window.__yutopia.tp.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { ${fn} } }); })()`;
// GPU time of the scene's render each frame, by the timer query, over 300 frames
const gpu = () =>
  p.evaluate(
    () =>
      new Promise<string>((done) => {
        const tp = (window as any).__yutopia.tp;
        const gl = tp.renderer.getContext() as WebGL2RenderingContext;
        const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        if (!ext) return done("no timer query");
        const qs: WebGLQuery[] = [];
        const out: number[] = [];
        const render = tp.renderer.render.bind(tp.renderer);
        let n = 0;
        tp.renderer.render = (s: any, c: any) => {
          if (s === tp.scene && n < 300) {
            const q = gl.createQuery() as WebGLQuery;
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            render(s, c);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            qs.push(q);
            n++;
          } else render(s, c);
        };
        const poll = () => {
          for (let i = qs.length - 1; i >= 0; i--) {
            const q = qs[i];
            if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
              gl.deleteQuery(q);
              qs.splice(i, 1);
            }
          }
          if (n >= 300 && !qs.length) {
            tp.renderer.render = render;
            out.sort((a, b) => a - b);
            done(
              `scene gpu median ${out[out.length >> 1].toFixed(2)} ms p90 ${out[Math.floor(out.length * 0.9)].toFixed(2)} (${out.length})`,
            );
          } else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }),
  );
const steps: [string, string][] = [
  ["base", "0"],
  ["- atlas cards", each("if (m.alphaTest > 0 && m.map?.image?.width === 640) m.visible = false;")],
  ["+ atlas cards", each("if (m.alphaTest > 0 && m.map?.image?.width === 640) m.visible = true;")],
  ["- AO", "(() => { const ao = window.__yutopia.tp.post?.ao; if (ao) ao.enabled = false; })()"],
];
for (const [n, fn] of steps) {
  await p.evaluate(fn);
  await p.waitForTimeout(2000);
  console.log(n.padEnd(20), await gpu(), "|", await gapsNow());
}
await b.close();
