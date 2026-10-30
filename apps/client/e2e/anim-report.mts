// /dev/anim's report for clips, in full (docs/plan/58-the-animation.md, phase 4c): pops by time and
// joint, each foot's worst slide and its share on the ground (the dev client on :3100, the GPU).
//   node --experimental-strip-types e2e/anim-report.mts "jog, turn back" … (TENSION=1 for the dark)
import { chromium } from "@playwright/test";

const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
for (const clip of process.argv.slice(2)) {
  await p.goto(
    `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&play=0&tension=${process.env.TENSION ?? 0}`,
  );
  await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
    timeout: 120_000,
  });
  await p.waitForTimeout(600);
  const r = (await p.evaluate(() => (window as unknown as { __anim: { report: () => unknown } }).__anim.report())) as {
    pops: number;
    popsAt: { t: number; what: string }[];
    feet: { L: number; R: number; down: number[]; sunk: number } | null;
  };
  const pops = r.popsAt.map((q) => `${q.t.toFixed(2)} ${q.what}`).join("; ");
  const f = r.feet;
  console.log(
    `${clip}: ${r.pops} pops${pops ? ` (${pops})` : ""}; slide L ${f?.L.toFixed(2)} R ${f?.R.toFixed(2)} m/s, sunk ${((f?.sunk ?? 0) * 100).toFixed(1)} cm`,
  );
}
await b.close();
