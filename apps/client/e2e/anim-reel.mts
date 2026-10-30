import { renameSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2];
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
for (const [name, q] of [
  ["sandbox-new", "v2=1"],
  ["sandbox-old", "v2=0"],
] as const) {
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 760 },
    recordVideo: { dir: out, size: { width: 1280, height: 760 } },
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3100/dev/move?${q}`);
  await p.waitForFunction(() => !!(window as any).__move?.follow, null, { timeout: 120000 });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("body *"))
      if (el.tagName === "CANVAS" ? el.clientWidth < 900 : !el.querySelector("canvas")) el.style.visibility = "hidden";
    const m = (window as any).__move;
    m.follow.tune.dist = 4.6;
    m.follow.tune.follow = "off";
    m.place(3, 47, 0);
    m.camera(-0.95, 0.18);
  });
  await p.waitForTimeout(3500); // standing
  await p.keyboard.down(process.platform === "darwin" ? "ControlLeft" : "AltLeft");
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(2200);
  await p.keyboard.up(process.platform === "darwin" ? "ControlLeft" : "AltLeft"); // walking
  await p.waitForTimeout(1800); // running
  await p.keyboard.down("ShiftLeft");
  await p.waitForTimeout(1800); // sprinting
  await p.keyboard.press("Space");
  await p.waitForTimeout(1100); // a leap (running's jump)
  await p.keyboard.press("Space");
  await p.waitForTimeout(260);
  await p.keyboard.press("Space");
  await p.waitForTimeout(1100); // a jump and the flip in the air
  await p.keyboard.press("KeyC");
  await p.waitForTimeout(1300); // a slide
  await p.keyboard.up("ShiftLeft");
  await p.waitForTimeout(600);
  await p.keyboard.down("Space");
  await p.waitForTimeout(350);
  await p.keyboard.up("Space");
  await p.waitForTimeout(1000); // a hop
  await p.keyboard.up("KeyW");
  await p.waitForTimeout(2500); // stopped
  const v = p.video();
  await ctx.close();
  if (v) renameSync(await v.path(), `${out}/${name}.webm`);
  console.log(name);
}
await b.close();
