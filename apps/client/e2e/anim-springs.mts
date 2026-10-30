// The springs (docs/plan/58-the-animation.md, phase 2d): /dev/anim playing a driven clip, as a video
// for each look asked (the dev client on :3100, the GPU).
//   node --experimental-strip-types e2e/anim-springs.mts <out dir> "hair=ponytail&bottom=skirt&extra=scarf" …
import { renameSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/anim";
const clip = process.env.CLIP ?? "start, jog, stop";
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
let n = 0;
for (const look of process.argv.slice(3)) {
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: out, size: { width: 1280, height: 720 } },
  });
  const p = await ctx.newPage();
  await p.goto(
    `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&compare=0&trail=0&speed=${process.env.SPEED ?? "0.5"}&view=${process.env.VIEW ?? "side"}&${look}`,
  );
  await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
    timeout: 120_000,
  });
  await p.waitForTimeout(Number(process.env.SECS ?? 8) * 1000);
  const v = p.video();
  await ctx.close();
  const file = `${out}/springs-${++n}.webm`;
  if (v) renameSync(await v.path(), file);
  console.log(look, file);
}
await b.close();
