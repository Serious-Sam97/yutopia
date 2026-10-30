// Plan 58 G (the feel): a start, a sprint and a hard stop, a reversal, an arc, a stop — from a fixed
// camera, with plan 58 on (new) and off (old), as videos (the dev client on :3100, the GPU).
//   node --experimental-strip-types e2e/anim-feel.mts <out dir>
import { renameSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/anim";
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
for (const [name, q] of [
  ["feel-new", "v2=1"],
  ["feel-old", "v2=0"],
] as const) {
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: out, size: { width: 1280, height: 720 } },
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3100/dev/move?${q}`);
  await p.waitForFunction(() => !!(window as any).__move?.follow, null, { timeout: 120000 });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("body *"))
      if (el.tagName === "CANVAS" ? el.clientWidth < 900 : !el.querySelector("canvas")) el.style.visibility = "hidden";
    const m = (window as any).__move;
    m.follow.tune.follow = "off";
    m.follow.tune.dist = 4.2;
    m.place(14, 46, 0);
    m.camera(-Math.PI / 2 + 0.25, 0.16);
  });
  const key = async (k: string, ms: number) => {
    await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    await p.keyboard.up(k);
  };
  await p.waitForTimeout(2200); // standing
  // (the camera looks north: D runs east, across the view)
  await p.keyboard.down("KeyD");
  await p.waitForTimeout(1100); // the start, a run
  await p.keyboard.down("ShiftLeft");
  await p.waitForTimeout(1000); // sprinting
  await p.keyboard.up("ShiftLeft");
  await p.keyboard.up("KeyD");
  await p.waitForTimeout(1300); // the skid, the stop, settling
  await key("KeyA", 1300); // round, and back west
  await p.keyboard.down("KeyA");
  await p.waitForTimeout(500);
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(700); // an arc, north-west
  await p.keyboard.up("KeyA");
  await p.waitForTimeout(500);
  await p.keyboard.up("KeyW");
  await p.waitForTimeout(1600); // stopping, settling
  const v = p.video();
  await ctx.close();
  if (v) renameSync(await v.path(), `${out}/${name}.webm`);
  console.log(name);
}
await b.close();
