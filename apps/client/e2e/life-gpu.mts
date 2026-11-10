/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 73 phase 11 (dev only) — where High's frame goes, as Ana on the dev stack at a spot and a held
// camera: the whole frame's GPU time (the post's render, the scene and every pass: timer queries over 240
// frames) and the frames' gaps (rAF); the far woods' triangles by shape; then again with a thing switched
// off (the AO, the bloom, the woods). The look by LOOKQ (life, life&out=old, …).
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
// GPU time a frame, by timer queries over 240 frames: the scene's render (its shadow pass in it) and the
// whole frame's (the post's render: the scene and every pass after it)
const gpu = () =>
  p.evaluate(
    () =>
      new Promise<string>((done) => {
        const tp = (window as any).__yutopia.tp;
        const gl = tp.renderer.getContext() as WebGL2RenderingContext;
        const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        if (!ext) return done("no timer query");
        const qs: { q: WebGLQuery; kind: "scene" | "frame" }[] = [];
        const got = { scene: [] as number[], frame: [] as number[] };
        const render = tp.renderer.render.bind(tp.renderer);
        const post = tp.post;
        const postRender = post?.render.bind(post);
        let n = 0;
        let inFrame = false;
        tp.renderer.render = (s: any, c: any) => {
          if (s !== tp.scene || inFrame || n >= 240) return render(s, c);
          const q = gl.createQuery() as WebGLQuery;
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          render(s, c);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          qs.push({ q, kind: "scene" });
        };
        if (post)
          post.render = (...a: unknown[]) => {
            if (n >= 240) return postRender(...a);
            n++;
            const q = gl.createQuery() as WebGLQuery;
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            inFrame = true;
            postRender(...a);
            inFrame = false;
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            qs.push({ q, kind: "frame" });
          };
        const poll = () => {
          for (let i = qs.length - 1; i >= 0; i--) {
            const e = qs[i];
            if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) continue;
            got[e.kind].push(gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(e.q);
            qs.splice(i, 1);
          }
          if (n >= 240 && !qs.length) {
            tp.renderer.render = render;
            if (post) post.render = postRender;
            const med = (v: number[]) => (v.length ? v.sort((a, b) => a - b)[v.length >> 1].toFixed(2) : "-");
            done(`gpu: scene ${med(got.scene)} ms, whole frame ${med(got.frame)} ms`);
          } else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }),
  );
const tp = "window.__yutopia.tp";
console.log(
  await p.evaluate(() => {
    const by = new Map<string, number[]>();
    (window as any).__yutopia.tp.scene.traverse((o: any) => {
      if (!o.isInstancedMesh || o.material?.userData?.wx !== "tree" || !o.count || o.geometry.userData.cards) return;
      const g = o.geometry;
      const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const k = `${t}${g.userData.shadow ? "s" : ""}`;
      const v = by.get(k) ?? [0, 0];
      v[0] += o.count;
      v[1] += t * o.count;
      by.set(k, v);
    });
    return [...by]
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, 12)
      .map(([k, [n, t]]) => `${k} tris: ${n} trees, ${(t / 1e6).toFixed(2)}M`)
      .join(" | ");
  }),
);
const steps: [string, string][] = [
  ["base", "0"],
  ["- AO", `(() => { const ao = ${tp}.post?.ao; if (ao) ao.enabled = false; })()`],
  ["- bloom", `(() => { const b = ${tp}.post?.bloom; if (b) b.enabled = false; })()`],
  ["- woods", each("if (m.userData?.wx === 'tree') m.visible = false;")],
];
// (the woods' share of the scene's triangles and instances)
console.log(
  await p.evaluate(() => {
    const tp = (window as any).__yutopia.tp;
    let inst = 0;
    let tris = 0;
    let solidTris = 0;
    const kinds: string[] = [];
    tp.scene.traverse((o: any) => {
      if (!o.isInstancedMesh || o.material?.userData?.wx !== "tree" || !o.visible || !o.count) return;
      const g = o.geometry;
      const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
      inst += o.count;
      tris += t * o.count;
      if (!g.userData.cards) solidTris += t * o.count;
      kinds.push(`${o.count}x${t}${g.userData.cards ? "c" : ""}`);
    });
    return JSON.stringify({ inst, tris, solidTris, kinds: kinds.slice(0, 40) });
  }),
);
for (const [n, fn] of steps) {
  await p.evaluate(fn);
  await p.waitForTimeout(2000);
  console.log(n.padEnd(20), await gpu(), "|", await gapsNow());
}
await b.close();
