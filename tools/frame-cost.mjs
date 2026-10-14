#!/usr/bin/env node
// Frame cost of the iso and third-person views on the REAL GPU, while idle in
// the Demo space (headless Chromium renders with SwiftShader, which says
// nothing about GPU cost — this opens a headed window instead).
//
//   cd apps/client && node ../../tools/frame-cost.mjs [iso|3p|both]
//
// Needs the dev stack up (Yondra API on :80, client on :3100) and the demo
// accounts (YutopiaDemoSeeder). Prints, per view: the screen's frame rate, what
// the live loop costs on the main thread over 3 s, and frames stepped by hand
// with the GPU waited on (gl.finish), with the pieces switched off one at a
// time so you can see where the time goes.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const API = process.env.YUTOPIA_E2E_API ?? "http://localhost";
const APP = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const mode = process.argv[2] ?? "both";
const ANA = { email: "ana@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" };

async function login() {
  const r = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(ANA),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return (await r.json()).token;
}

const COMMON = `
  const q=(a,p)=>{a=[...a].sort((x,y)=>x-y); return +(a[Math.floor(a.length*p)]||0).toFixed(2)};
  const stat=(a)=>({med:q(a,.5),p95:q(a,.95),n:a.length});
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  async function rafHz(ms){let n=0; const t0=performance.now(); await new Promise(res=>{const f=()=>{n++; if(performance.now()-t0<ms) requestAnimationFrame(f); else res()}; requestAnimationFrame(f)}); return +(n/(ms/1000)).toFixed(1)}
  const sum=(a)=>a.reduce((x,y)=>x+y,0);
`;

const ISO = `(async()=>{ ${COMMON}
  const c=window.__yutopia, e=c.engine, app=e.app, r=app.renderer, gl=r.gl;
  const out={view:"iso", dpr:devicePixelRatio, canvas:[app.canvas.width,app.canvas.height], quality:e.quality, night:+e.nightLevel().toFixed(2), objects:e.stats().objects, sortChildren:e.sortLayer.children.length, texMB:e.textureMB()};
  out.screenHz=await rafHz(2000);
  const render=r.render.bind(r); const upd=e.update.bind(e);
  const rt=[], ut=[]; let rebuilds=0;
  r.render=(...a)=>{ if(app.stage.renderGroup.structureDidChange) rebuilds++; const s=performance.now(); render(...a); rt.push(performance.now()-s)};
  e.update=(dt)=>{const s=performance.now(); upd(dt); ut.push(performance.now()-s)};
  await sleep(3000);
  out.live={seconds:3, framesDrawn:rt.length, drawListRebuilds:rebuilds, renderCpuMs:stat(rt), updateCpuMs:stat(ut), mainThreadBusyPct:+((sum(rt)+sum(ut))/30).toFixed(1)};
  r.render=render; e.update=upd;
  const cf=c.frame; c.frame=()=>{}; // the controller's loop, paused
  const step=(n,fn)=>{const t=[]; for(let i=0;i<n;i++){const s=performance.now(); fn(); gl.finish(); t.push(performance.now()-s)} return stat(t)};
  const both=()=>{e.update(1/60); r.render(app.stage)};
  for(let i=0;i<20;i++) both();
  const st=out.stepped={};
  st.full=step(90,both);
  st.renderOnly=step(90,()=>r.render(app.stage));
  st.updateOnly=step(90,()=>e.update(1/60));
  if(e.life){const lu=e.life.update.bind(e.life); e.life.update=()=>{}; st.noLife=step(90,both); e.life.update=lu;}
  const dc=e.drawClocks; e.drawClocks=()=>{}; st.noClocks=step(90,both); e.drawClocks=dc;
  const bv=e.bloomLayer.visible; e.bloomLayer.visible=false; st.noBloom=step(90,both); e.bloomLayer.visible=bv;
  if(e.post){e.post.setEnabled(false); st.noPost=step(90,both); e.post.setEnabled(true);}
  const tv=e.backdropLayer.visible; e.backdropLayer.visible=false; st.noBackdrop=step(90,both); e.backdropLayer.visible=tv;
  r.resolution=1; r.resize(r.width/2, r.height/2); for(let i=0;i<10;i++) both(); st.resolution1=step(90,both); r.resolution=2; r.resize(app.canvas.clientWidth, app.canvas.clientHeight);
  c.frame=cf;
  return out;
})()`;

const TP = `(async()=>{ ${COMMON}
  const c=window.__yutopia; const t0=performance.now(); while(!c.tp && performance.now()-t0<30000) await sleep(200); await sleep(3000);
  const tp=c.tp, r=tp.renderer, gl=r.getContext();
  const out={view:"3p", dpr:devicePixelRatio, pixelRatio:r.getPixelRatio(), size:[r.domElement.width,r.domElement.height], quality:tp.quality, post:!!tp.post, shadowMap:tp.sun.shadow.mapSize.x, people:tp.people.size};
  out.screenHz=await rafHz(2000);
  const fr=tp.frame.bind(tp); const ft=[]; tp.frame=(...a)=>{const s=performance.now(); fr(...a); ft.push(performance.now()-s)};
  const upd=c.engine.update.bind(c.engine); const ut=[]; c.engine.update=(dt)=>{const s=performance.now(); upd(dt); ut.push(performance.now()-s)};
  await sleep(3000);
  out.live={seconds:3, framesDrawn:ft.length, tpFrameCpuMs:stat(ft), isoUpdateCpuMs:stat(ut), mainThreadBusyPct:+((sum(ft)+sum(ut))/30).toFixed(1)};
  tp.frame=fr; c.engine.update=upd;
  let lastArgs=null; tp.frame=(...a)=>{lastArgs=a; fr(...a)}; await sleep(400); tp.frame=fr;
  const cf=c.frame; c.frame=()=>{};
  const step=(n,fn)=>{const t=[]; for(let i=0;i<n;i++){const s=performance.now(); fn(); gl.finish(); t.push(performance.now()-s)} return stat(t)};
  const one=()=>fr(1/60,lastArgs[1],lastArgs[2]);
  for(let i=0;i<20;i++) one();
  const st=out.stepped={};
  st.full=step(90,one);
  st.renderOnly=step(90,()=>{ if(tp.post) tp.post.render(false); else r.render(tp.scene,tp.camera)});
  const p=tp.post; tp.post=null; st.noPost=step(90,one); tp.post=p;
  const ppl=[...tp.people.values()]; const pu=ppl.map(x=>x.update.bind(x)); ppl.forEach((x,i)=>{x.update=(...a)=>{a[9]=false; return pu[i](...a)}}); st.noPeopleRedraw=step(90,one); ppl.forEach((x,i)=>{x.update=pu[i]});
  const pr=r.getPixelRatio(); r.setPixelRatio(1); tp.resize(); for(let i=0;i<10;i++) one(); st.pixelRatio1=step(90,one); r.setPixelRatio(pr); tp.resize();
  c.frame=cf;
  return out;
})()`;

const token = await login();
const browser = await chromium.launch({
  headless: false,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
try {
  for (const view of mode === "both" ? ["iso", "3p"] : [mode]) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(
      ([t, v]) => {
        localStorage.setItem("yutopia:token", t);
        const k = "yutopia:prefs";
        const p = JSON.parse(localStorage.getItem(k) ?? "{}");
        localStorage.setItem(k, JSON.stringify({ ...p, quality: "high", view: v, seenIntro: true }));
      },
      [token, view],
    );
    await page.goto(`${APP}/s/1`);
    await page.waitForFunction(() => window.__hud?.get().phase === "ready", null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__yutopia?.engine?.settled?.(), null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const r = await page.evaluate(view === "iso" ? ISO : TP);
    console.log(JSON.stringify(r, null, 1));
    await ctx.close();
  }
} finally {
  await browser.close();
}
