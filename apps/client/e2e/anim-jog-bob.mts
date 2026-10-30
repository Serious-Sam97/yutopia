// The jog's height frame by frame in /dev/move (the hips, the head and the ankles over the ground, and
// what footPlant saw): a shake shows as a jump between frames.
//   AT=4,46 node --experimental-strip-types e2e/anim-jog-bob.mts <out dir>
import { chromium } from "@playwright/test";

const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const S = process.argv[2];
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: S, size: { width: 320, height: 180 } },
});
const p = await ctx.newPage();
await p.goto(`http://localhost:3100/dev/move?v2=1${process.argv[3] ?? ""}`);
await p.waitForFunction(() => !!(window as any).__move?.follow, null, { timeout: 120000 });
await p.evaluate((AT) => {
  const m = (window as any).__move;
  m.place(...AT.split(",").map(Number), 0);
  m.camera(-Math.PI / 2 + 0.25, 0.12);
}, process.env.AT ?? "4,46");
await p.waitForTimeout(1500);
await p.keyboard.down("KeyD");
await p.waitForTimeout(1500);
const rows = await p.evaluate(
  () =>
    new Promise<number[][]>((res) => {
      const m = (window as any).__move;
      const out: number[][] = [];
      const f = () => {
        const md = m.model;
        const v = new md.root.position.constructor();
        md.bones.hips.getWorldPosition(v);
        const hy = v.y;
        md.bones.head.getWorldPosition(v);
        const he = v.y;
        md.bones.ankleL.getWorldPosition(v);
        const al = v.y;
        md.bones.ankleR.getWorldPosition(v);
        const ar = v.y;
        const pl = m.planted();
        out.push([
          performance.now(),
          md.root.position.y,
          hy,
          he,
          al,
          ar,
          m.loco().gaitPh,
          pl?.drop ?? 0,
          pl?.under[0] ?? 0,
          pl?.under[1] ?? 0,
          pl?.sole[0] ?? 0,
          pl?.sole[1] ?? 0,
          m.loco().driveW,
          m.loco().skidW,
          m.loco().landT,
          m.loco().turnW,
        ]);
        if (out.length < 150) requestAnimationFrame(f);
        else res(out);
      };
      requestAnimationFrame(f);
    }),
);
const r0 = rows[0][0];
const col = (i: number) => rows.map((r) => r[i] - r[1]);
const st = (a: number[]) =>
  `${Math.min(...a).toFixed(3)}..${Math.max(...a).toFixed(3)} (${((Math.max(...a) - Math.min(...a)) * 100).toFixed(1)} cm)`;
console.log(
  "under max",
  Math.max(...rows.map((r) => Math.max(Math.abs(r[8]), Math.abs(r[9])))).toFixed(2),
  "root",
  st(rows.map((r) => r[1])),
  "hips",
  st(col(2)),
  "head",
  st(col(3)),
  "ankles",
  st(col(4)),
  st(col(5)),
);
console.log(
  rows
    .slice(36, 60)
    .map(
      (r) =>
        `${(r[0] - r0).toFixed(0)} ph ${r[6].toFixed(2)} drive ${r[12].toFixed(2)} skid ${r[13].toFixed(2)} land ${r[14].toFixed(2)} turn ${r[15].toFixed(2)} under ${r[8].toFixed(2)},${r[9].toFixed(2)} hips ${(r[2] - r[1]).toFixed(3)} head ${(r[3] - r[1]).toFixed(3)} L ${(r[4] - r[1]).toFixed(3)} R ${(r[5] - r[1]).toFixed(3)}`,
    )
    .join("\n"),
);
await ctx.close();
await b.close();
