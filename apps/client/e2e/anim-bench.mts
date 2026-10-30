// /dev/anim (docs/plan/58-the-animation.md, phase 2): a still of a clip at a moment, and its report
// (pops, the feet's slide), for each "clip@t[:query]" asked (the dev client on :3100, the GPU).
//   node --experimental-strip-types e2e/anim-bench.mts <out dir> "jog@0.3:compare=1&onion=3" …
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/anim";
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
for (const arg of process.argv.slice(3)) {
  const [head, query = ""] = arg.split(":");
  const [clip, t = "0"] = head.split("@");
  await p.goto(`http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&t=${t}&play=0&${query}`);
  await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
    timeout: 120_000,
  });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => (window as unknown as { __anim: { report: () => unknown } }).__anim.report());
  const file = `${out}/bench-${clip.replace(/\W+/g, "-")}-${t}.png`;
  await p.screenshot({ path: file });
  console.log(arg, JSON.stringify(r).slice(0, 400), file);
}
await b.close();
