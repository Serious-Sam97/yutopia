// The jog (the run without Shift, 2026-10-30): across a fixed camera, then a sprint and back to the
// jog, as a video (the dev client on :3100, the GPU); and its cadence measured on the way.
//   node --experimental-strip-types e2e/anim-jog.mts <out dir>
import { renameSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/anim";
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: out, size: { width: 1280, height: 720 } },
});
const p = await ctx.newPage();
await p.goto("http://localhost:3100/dev/move?v2=1");
await p.waitForFunction(() => !!(window as any).__move?.follow, null, { timeout: 120000 });
await p.evaluate(() => {
  for (const el of document.querySelectorAll<HTMLElement>("body *"))
    if (el.tagName === "CANVAS" ? el.clientWidth < 900 : !el.querySelector("canvas")) el.style.visibility = "hidden";
  const m = (window as any).__move;
  m.follow.tune.follow = "off";
  m.follow.tune.dist = 4.2;
  m.place(4, 46, 0);
  m.camera(-Math.PI / 2 + 0.25, 0.12);
});
await p.waitForTimeout(1800);
// (the camera looks north: D runs east, across the view)
await p.keyboard.down("KeyD");
await p.waitForTimeout(1200);
const jog = await p.evaluate(
  () =>
    new Promise<string>((res) => {
      const m = (window as any).__move;
      const t0 = performance.now();
      const ph0 = m.loco().gaitPh;
      let turns = 0;
      let last = ph0;
      const f = () => {
        const ph = m.loco().gaitPh;
        if (ph < last - 0.5) turns++;
        last = ph;
        if (performance.now() - t0 < 2000) setTimeout(f, 8);
        else {
          const b = m.body();
          res(
            `${b.gait} at ${Math.hypot(b.vx, b.vy).toFixed(2)} m/s, ${((turns + ph - ph0) / 2).toFixed(2)} strides a second`,
          );
        }
      };
      f();
    }),
);
console.log("jog:", jog);
await p.keyboard.down("ShiftLeft");
await p.waitForTimeout(1300); // sprinting
await p.keyboard.up("ShiftLeft");
await p.waitForTimeout(1800); // back to the jog
await p.keyboard.up("KeyD");
await p.waitForTimeout(1300);
const v = p.video();
await ctx.close();
if (v) renameSync(await v.path(), `${out}/jog.webm`);
await b.close();
