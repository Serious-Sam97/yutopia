// A reel of the sway (docs/plan/61): clips on /dev/anim with the sway on — swung on Jolt on the
// left, today's springs on the right — each recorded from the moment it's ready, joined into one.
//   node --experimental-strip-types e2e/sway-reel.mts <out.mp4> [items]
// (`items`: each thing that swings, worn in turn, jogging and jumping)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = process.argv[2];
const ITEMS: [string, string, number][] = [
  ["jog, jump", "view=side&extra=satchel&hair=ponytail", 1],
  ["jog, jump", "view=back&extra=backpack&hair=braids", 1],
  ["jog, jump", "view=back&extra=tote&hair=highpony", 1],
  ["jog, jump", "view=three-quarter&extra=crossbody&hair=pigtails", 1],
  ["jog, jump", "view=three-quarter&extra=fannypack&zoom=1.6&at=1&compare=0", 1],
  ["jog, jump", "view=three-quarter&extra=lanyard&zoom=1.6&at=1.1&compare=0", 1],
  ["jog, jump", "view=three-quarter&extra=scarf&zoom=1.6&at=1.1&compare=0", 1],
  ["jog, jump", "view=three-quarter&top=shirttie&extra=none&zoom=1.6&at=1.1&compare=0", 1],
  ["jog, jump", "view=front&extra=earrings&hair=pixie&zoom=2.4&at=1.45&compare=0", 0.5],
];
const CLIPS: [string, string, number][] =
  process.argv[3] === "items"
    ? ITEMS
    : [
        ["start, walk, stop", "view=side", 1],
        ["start, jog, stop", "view=side", 1],
        ["start, jog, stop", "view=back", 1],
        ["sprint, skid", "view=side", 1],
        ["sprint, turn back", "view=side", 1],
        ["stand, jump", "view=side", 1],
        ["jog, jump", "view=side", 1],
        ["jog, jump", "view=back", 0.25],
        ["jog off a 1.5 m ledge", "view=side", 1],
        ["jog off a 4 m drop", "view=side", 1],
        ["sit down, sit, get up", "view=three-quarter", 1],
        ["jog off an 8 m drop, limp", "view=side", 1],
      ];
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const dir = mkdtempSync(join(tmpdir(), "sway-reel-"));
const parts: string[] = [];
for (const [i, [clip, query, speed]] of CLIPS.entries()) {
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const t0 = Date.now();
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  error:", e.message));
  await p.goto(
    `http://localhost:3100/dev/anim?${query}&clip=${encodeURIComponent(clip)}&live=1&sway=1&trail=0&zoom=0.85&at=0.8&speed=${speed}`,
  );
  await p.waitForFunction(() => (window as unknown as { __anim?: { ready: boolean } }).__anim?.ready === true, null, {
    timeout: 120_000,
  });
  // (from the top of the clip)
  await p.evaluate(() => (window as unknown as { __anim: { seek: (t: number) => void } }).__anim.seek(0));
  const from = (Date.now() - t0) / 1000 + 0.3;
  const len = await p.evaluate(
    () => (window as unknown as { __anim: { bench: { after: unknown[] | null } } }).__anim.bench.after?.length ?? 0,
  );
  const secs = Math.min(14, len / 120 / speed + 0.4);
  await p.waitForTimeout(secs * 1000 + 300);
  const v = p.video();
  await ctx.close();
  const raw = (await v?.path()) ?? "";
  const f = join(dir, `${String(i).padStart(2, "0")}.mp4`);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    String(from),
    "-t",
    String(secs),
    "-i",
    raw,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    f,
  ]);
  parts.push(f);
  console.log(clip, query, `${secs.toFixed(1)} s`);
}
await b.close();
writeFileSync(join(dir, "list.txt"), parts.map((f) => `file '${f}'`).join("\n"));
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  join(dir, "list.txt"),
  "-c",
  "copy",
  out,
]);
console.log(out);
