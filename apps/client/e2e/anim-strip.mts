// A filmstrip of a clip on /dev/anim (docs/plan/58-the-animation.md, phase 4c): stills from `from`
// to `to` every `step` s, cropped round the body and tiled in a row (the dev client on :3100, the GPU).
//   node --experimental-strip-types e2e/anim-strip.mts <out.png> "jog, turn back" 1.8 2.4 0.05 [query]
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [out, clip, from, to, step, query = "view=side"] = process.argv.slice(2);
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
await p.goto(
  `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&compare=0&trail=0&play=0&${query}`,
);
await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
  timeout: 120_000,
});
const dir = mkdtempSync(join(tmpdir(), "strip-"));
const files: string[] = [];
for (let t = Number(from), i = 0; t <= Number(to) + 1e-6; t += Number(step), i++) {
  await p.evaluate((x) => (window as unknown as { __anim: { seek: (t: number) => void } }).__anim.seek(x), t);
  await p.waitForTimeout(120);
  const f = join(dir, `${String(i).padStart(3, "0")}.png`);
  await p.screenshot({ path: f, clip: { x: 470, y: 40, width: 340, height: 680 } });
  files.push(f);
}
await b.close();
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-i",
  join(dir, "%03d.png"),
  "-vf",
  `scale=170:-1,tile=${files.length}x1`,
  "-frames:v",
  "1",
  out,
]);
console.log(out, files.length);
