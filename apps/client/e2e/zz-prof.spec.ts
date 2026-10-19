/* biome-ignore-all lint/suspicious/noExplicitAny: probe */
import { ANA, enter, test, token } from "./helpers";
if (process.env.GPU) test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false"] } });
for (const view of (process.env.VIEWS ?? "3p,iso").split(",")) test(`prof ${view}`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript((v) => { const k = "yutopia:prefs"; const p = JSON.parse(localStorage.getItem(k) ?? "{}"); localStorage.setItem(k, JSON.stringify({ ...p, view: v })); }, view);
  await enter(page, await token(ANA));
  if (view === "3p") await page.waitForFunction(() => !!(window as any).__yutopia.tp, null, { timeout: 60_000 });
  await page.evaluate(() => { const w = window as any; w.__g0 = []; let last = performance.now(); const f = (t: number) => { w.__g0.push(t - last); last = t; if (w.__g0.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForTimeout(4000);
  console.log("while warming, worst frames:", JSON.stringify(await page.evaluate(() => [...(window as any).__g0].sort((a: number, b: number) => b - a).slice(0, 5).map(Math.round))), "floors built:", await page.evaluate(() => (window as any).__yutopia.tp?.floors?.size));
  console.log("GPU", await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext; const e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; }));
  await page.evaluate(() => {
    const w = window as any; const c = w.__yutopia; w.__prof = {};
    const wrap = (obj: any, name: string, label: string) => { if (!obj || typeof obj[name] !== "function") return; const f = obj[name].bind(obj); obj[name] = (...a: any[]) => { const t = performance.now(); const r = f(...a); const d = performance.now() - t; w.__prof[label] = Math.max(w.__prof[label] ?? 0, d); return r; }; };
    if (c.tp) { for (const n of ["update", "surround", "placeFloors", "placeAround", "frame", "setHour"]) wrap(c.tp, n, `tp.${n}`); wrap(c.tp.light, "update", "tp.light.update"); wrap(c.tp.renderer, "render", "gl.render"); wrap(c.tp.light, "setHour", "tp.light.setHour"); }
    for (const n of ["setMap", "setObjects", "setWells", "refreshFlat", "update", "render"]) wrap(c.engine, n, `engine.${n}`);
    for (const n of ["rebuildGrid", "setLevel", "applyMapFromState"]) wrap(c, n, `c.${n}`);
  });
  for (const [l, x, y] of [[3, 10.5, 10.5], [0, 70.5, 20.5], [4, 10.5, 10.5], [3, 10.5, 10.5], [0, 70.5, 20.5], [4, 10.5, 10.5]]) {
    await page.evaluate(() => { const w = window as any; w.__prof = {}; w.__gaps = []; let last = performance.now(); const f = (t: number) => { w.__gaps.push(t - last); last = t; if (w.__gaps.length < 300) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.evaluate(([l, x, y]: number[]) => (window as any).__yutopia.teleport({ x, y, level: l }), [l, x, y]);
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => { const w = window as any; const ri = w.__yutopia.tp?.renderer?.info; return { gl: ri && { programs: ri.programs?.length, tex: ri.memory.textures, geo: ri.memory.geometries }, prof: Object.fromEntries(Object.entries(w.__prof).map(([k, v]: any) => [k, Math.round(v)]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 9)), worst: [...w.__gaps].sort((a: number, b: number) => b - a).slice(0, 3).map(Math.round) }; });
    console.log(view, "->", l, JSON.stringify(r));
  }
});
