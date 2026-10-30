// Plan 58 phase 10 (docs/plan/58-the-animation.md): a pose sheet of every animation — each clip on
// /dev/anim at a quarter, half and three quarters of the way, labelled, tiled a group to a page (the
// dev client on :3100, the GPU). The census (anim-census.mts) has the numbers; this is for the eye.
//   node --experimental-strip-types e2e/anim-sheet.mts <out dir> [group…]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../design/anim/sheet";
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
await p.goto("http://localhost:3100/dev/anim?play=0&compare=0&trail=0");
await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
  timeout: 120_000,
});
// (the list of clips and their groups and lengths, from the page's own select)
const clips = (await p.evaluate(() =>
  [...document.querySelectorAll("select option")].map((o) => ({
    name: (o as HTMLOptionElement).value,
    group: (o.parentElement as HTMLOptGroupElement).label ?? "",
  })),
)) as { name: string; group: string }[];
const groups = new Map<string, string[]>();
for (const c of clips)
  if (!only.length || only.includes(c.group)) groups.set(c.group, [...(groups.get(c.group) ?? []), c.name]);
let n = 0;
for (const [group, names] of groups) {
  const dir = mkdtempSync(join(tmpdir(), "sheet-"));
  const rows: string[] = [];
  for (const name of names) {
    await p.goto(
      `http://localhost:3100/dev/anim?clip=${encodeURIComponent(name)}&live=1&compare=0&trail=0&play=0&view=three-quarter&zoom=0.75&at=0.8`,
    );
    await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
      timeout: 120_000,
    });
    await p.waitForTimeout(500);
    // (its length from its table: a frame each 1/120 s)
    const len = await p.evaluate(
      () =>
        ((window as unknown as { __anim: { bench: { after?: unknown[] } } }).__anim.bench.after?.length ?? 240) / 120,
    );
    const shots: string[] = [];
    for (const [k, u] of [0.25, 0.5, 0.75].entries()) {
      await p.evaluate((x) => (window as unknown as { __anim: { seek: (t: number) => void } }).__anim.seek(x), u * len);
      await p.waitForTimeout(150);
      await p.evaluate(
        (label) => {
          let el = document.getElementById("sheet-label");
          if (!el) {
            el = document.createElement("div");
            el.id = "sheet-label";
            Object.assign(el.style, {
              position: "fixed",
              left: "472px",
              top: "44px",
              font: "600 15px system-ui",
              color: "#333",
              zIndex: "9",
            });
            document.body.appendChild(el);
          }
          el.textContent = label;
        },
        k === 0 ? name : "",
      );
      const f = join(dir, `${String(n).padStart(4, "0")}-${k}.png`);
      await p.screenshot({ path: f, clip: { x: 470, y: 40, width: 340, height: 640 } });
      shots.push(f);
    }
    const row = join(dir, `row-${String(n++).padStart(4, "0")}.png`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      ...shots.flatMap((s) => ["-i", s]),
      "-filter_complex",
      "hstack=inputs=3,scale=510:-1",
      row,
    ]);
    rows.push(row);
  }
  // (rows two to a line, a group to a page)
  const file = join(out, `${group.replace(/[^a-z0-9]+/gi, "-")}.png`);
  const cols = 2;
  const filled = [...rows];
  // (an odd one out: a blank beside it)
  if (filled.length % cols) {
    const blank = join(dir, "blank.png");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0xe9e2d2:s=510x320",
      "-frames:v",
      "1",
      blank,
    ]);
    filled.push(blank);
  }
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...filled.flatMap((s) => ["-i", s]),
    "-filter_complex",
    `${filled.map((_, i) => `[${i}]`).join("")}xstack=inputs=${filled.length}:layout=${filled.map((_, i) => `${(i % cols) * 510}_${Math.floor(i / cols) * 320}`).join("|")}`,
    file,
  ]);
  console.log(file, names.length);
}
await b.close();
