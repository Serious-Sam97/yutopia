// Plan 66 phase 4 (docs/plan/66-the-water.md): the swim body on /dev/anim for sign-off — stills of each
// mode at a few moments from ¾ front and the side, a video of every "swim: …" clip (frame by frame,
// 30 a second, looped twice where it's a cycle), a contact sheet of the stills, and each clip's numbers:
// the bench's pops, the feet's worst slide, and the loop's seam (how far the last frame's joints are
// from the first's). The dev client on :3100, the GPU; no login (the bench joins nothing).
//   node --experimental-strip-types e2e/swim-shots.mts [out dir]
//   ONLY=crawl: just the clips whose name has it · NOVIDEO=1 · NOSTILLS=1 · SHEETS=1: only the sheet
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "../../design/anim/swim");
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const only = process.env.ONLY;
type Fr = { pose: Record<string, number[]>; lift: number[]; root: { x: number; y: number; z: number } };
type A = {
  ready: boolean;
  seek: (t: number) => void;
  report: () => { pops: number; popsAt: { t: number; what: string }[]; feet: { worst: number } | null };
  bench: { after: Fr[] | null };
};

/** The clips: the view its video's from, and its stills' moments (a cycle's are fractions of the
 *  length, `cyc`; a one-shot's are seconds). */
const CLIPS: { name: string; video: "34" | "side"; stills?: number[]; cyc?: boolean; loop?: boolean }[] = [
  { name: "tread", video: "34", stills: [0, 1 / 6, 1 / 3], cyc: true, loop: true },
  { name: "breaststroke", video: "34", stills: [0, 0.14, 0.24, 0.32, 0.39, 0.45], cyc: true, loop: true },
  { name: "crawl", video: "34", stills: [0, 0.125, 0.25, 0.375], cyc: true, loop: true },
  { name: "under", video: "side", stills: [0, 0.15, 0.25, 0.34, 0.4], cyc: true, loop: true },
  { name: "wade knee-deep", video: "side", stills: [0, 0.125, 0.25], cyc: true, loop: true },
  { name: "wade waist-deep", video: "34", stills: [0, 0.125, 0.25], cyc: true, loop: true },
  { name: "duck dive", video: "side", stills: [1.15, 1.45, 1.75, 2.05, 2.4] },
  { name: "dive in", video: "side", stills: [0.95, 1.15, 1.35, 1.5, 1.9] },
  { name: "tread → breaststroke → crawl", video: "34" },
  { name: "surface → under → surface", video: "side" },
  { name: "walk → wade → float", video: "side" },
  { name: "swim → stand → wade out", video: "side" },
];
const slug = (s: string) =>
  s
    .replace(/→/g, "to")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
// (a seek drawn: two frames on)
const at = async (t: number) => {
  await p.evaluate(async (x) => {
    (window as unknown as { __anim: A }).__anim.seek(x);
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
  }, t);
};

async function shots() {
  const report: string[] = [];
  for (const c of CLIPS) {
    if (only && !c.name.includes(only)) continue;
    const name = `swim: ${c.name}`;
    await p.goto(`${base}/dev/anim?clip=${encodeURIComponent(name)}&t=0&play=0&compare=0&trail=0&view=three-quarter`);
    await p.waitForFunction(() => (window as unknown as { __anim?: A }).__anim?.ready === true, null, {
      timeout: 120_000,
    });
    await p.addStyleTag({ content: "main > :not(#stage) { display: none !important; }" });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const a = (window as unknown as { __anim: A }).__anim;
      const f = a.bench.after ?? [];
      // (the loop's seam: the last frame against the first, the joints' and the hips' height)
      let seam = 0;
      const A0 = f[0];
      const Z = f[f.length - 1];
      if (A0 && Z) {
        for (const j of Object.keys(A0.pose))
          for (let k = 0; k < 3; k++) seam = Math.max(seam, Math.abs((Z.pose[j]?.[k] ?? 0) - (A0.pose[j]?.[k] ?? 0)));
      }
      const rep = a.report();
      return {
        len: (f.length - 1) / 120,
        pops: rep.pops,
        popsAt: rep.popsAt.slice(0, 6),
        slide: rep.feet?.worst ?? 0,
        seam,
        lift: A0 && Z ? Math.abs(Z.lift[1] - A0.lift[1]) : 0,
      };
    });
    const line = `${c.name}: ${r.len.toFixed(2)} s, pops ${r.pops}${r.pops ? ` (${r.popsAt.map((x) => `${x.t.toFixed(2)} ${x.what}`).join("; ")})` : ""}, worst foot slide ${r.slide.toFixed(2)} m/s${c.loop ? `, seam ${r.seam.toFixed(3)} rad / hips ${r.lift.toFixed(3)} m` : ""}`;
    console.log(line);
    report.push(line);
    const s = slug(c.name);
    if (!process.env.NOSTILLS && c.stills)
      for (const [i, u] of c.stills.entries()) {
        const t = c.cyc ? u * r.len : u;
        for (const [view, key] of [
          ["34", "Digit4"],
          ["side", "Digit1"],
        ] as const) {
          await p.keyboard.press(key);
          await at(t);
          await p.waitForTimeout(150);
          await p.locator("#stage").screenshot({ path: `${out}/${s}-${i + 1}-${view}.png` });
        }
      }
    if (!process.env.NOVIDEO) {
      await p.keyboard.press(c.video === "34" ? "Digit4" : "Digit1");
      const dir = mkdtempSync(join(tmpdir(), "swim-"));
      const n = Math.round(r.len * 30);
      for (let i = 0; i < n; i++) {
        await at(i / 30);
        await p.locator("#stage").screenshot({ path: join(dir, `${String(i).padStart(4, "0")}.png`) });
      }
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        ...(c.loop ? ["-stream_loop", "1"] : []),
        "-framerate",
        "30",
        "-i",
        join(dir, "%04d.png"),
        "-vf",
        "scale=960:-2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        `${out}/${s}.mp4`,
      ]);
      rmSync(dir, { recursive: true });
    }
  }
  if (!only) writeFileSync(`${out}/numbers.txt`, `${report.join("\n")}\n`);
}

async function sheet() {
  const order = CLIPS.map((c) => slug(c.name));
  const files = readdirSync(out).filter((f) => f.endsWith(".png") && !f.startsWith("sheet"));
  const rank = (f: string) => order.findIndex((o) => new RegExp(`^${o}-\\d`).test(f));
  files.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y, undefined, { numeric: true }));
  const html = `<html><body style="margin:0;background:#1b1d20;font:15px system-ui;color:#ddd">
<div style="padding:10px 10px 0;font-size:20px">Plan 66 phase 4 — the swim body (/dev/anim, "swim (plan 66)")</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px">
${files
  .map(
    (f) =>
      `<figure style="margin:0"><figcaption style="padding:3px 2px">${f
        .replace(".png", "")
        .replace(/-(\d+)-(34|side)$/, " $1 — $2")
        .replace(/— 34$/, "— ¾ front")
        .replace(/-/g, " ")}</figcaption><img src="file://${out}/${f}" style="width:100%;display:block"></figure>`,
  )
  .join("\n")}
</div></body></html>`;
  const tmp = `${out}/.sheet.html`;
  writeFileSync(tmp, html);
  const pg = await b.newPage({ viewport: { width: 1920, height: 1000 } });
  await pg.goto(`file://${tmp}`);
  await pg.waitForLoadState("load");
  await pg.screenshot({ path: `${out}/sheet-swim.png`, fullPage: true });
  rmSync(tmp);
  console.log(`sheet-swim.png (${files.length})`);
}

if (!process.env.SHEETS) await shots();
if (!only) await sheet();
await b.close();
