/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 81's feedback (2026-11-12): does the hold flicker? On the arms bench (/dev/arms), walking or running with
// the gun carried or aimed, every frame for 3 s: each elbow's and wrist's move against her hips — the median,
// the 95th percentile, the most (cm), how many frames over 2 cm, and where the left elbow jumped (its place on
// the fore-end, its swing). The wrists move at her pace; an elbow far past them is a flick.
//   node --experimental-strip-types e2e/arms-steady.mts   (GUN=revolver; POSES='[{"pose":"aim","move":1}]';
//   Q='&gender=masculine')
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.goto(
  `http://localhost:3100/dev/arms?gun=${process.env.GUN ?? "shotgun"}&view=side&top=tee${process.env.Q ?? ""}`,
);
await page.waitForFunction(() => (window as any).__revolver?.ready, null, { timeout: 120000 });
const poses = JSON.parse(process.env.POSES ?? '[{"pose":"ready","move":1},{"pose":"aim","move":1}]');
for (const s of poses) {
  await page.evaluate(
    (s) =>
      (window as any).__revolver.set({
        pitch: 0,
        move: 0,
        draw: 1,
        away: false,
        torch: false,
        kick: 0,
        trigger: 0,
        act: "",
        actT: 0,
        ...s,
      }),
    s,
  );
  await page.waitForTimeout(1200);
  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const P = (window as any).__revolver.person;
        const m = P.model;
        const V = m.bone("hips").position.constructor;
        const names = ["elbowR", "elbowL", "wristR", "wristL"];
        const last: Record<string, any> = {};
        const jumps: Record<string, number[]> = {};
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          const hips = m.bone("hips");
          hips.updateWorldMatrix(true, false);
          const inv = hips.matrixWorld.clone().invert();
          for (const k of names) {
            const p = m.bone(k).getWorldPosition(new V()).applyMatrix4(inv);
            jumps[k] ??= [];
            if (last[k]) jumps[k].push(p.distanceTo(last[k]));
            last[k] = p;
          }
          const e = m.bone("elbowL").getWorldPosition(new V()).applyMatrix4(inv);
          (window as any).__trace ??= [];
          (window as any).__trace.push({ x: P.lgForeX, sw: m.gripSwing.L, e: [e.x, e.y, e.z] });
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else {
            const out: Record<string, any> = { frames: n };
            for (const k of names) {
              const j = jumps[k].sort((a, b) => a - b);
              out[k] = {
                p50: +(j[Math.floor(j.length / 2)] * 100).toFixed(2),
                p95: +(j[Math.floor(j.length * 0.95)] * 100).toFixed(2),
                max: +(j[j.length - 1] * 100).toFixed(2),
                over2: j.filter((x) => x > 0.02).length,
              };
            }
            const tr = (window as any).__trace;
            const ev: any[] = [];
            for (let i = 1; i < tr.length; i++) {
              const a = tr[i - 1].e,
                b = tr[i].e;
              const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
              if (d > 0.02)
                ev.push({
                  i,
                  d: +(d * 100).toFixed(1),
                  x: [tr[i - 1].x, tr[i].x],
                  sw: [+tr[i - 1].sw.toFixed(3), +tr[i].sw.toFixed(3)],
                });
            }
            (window as any).__trace = [];
            out.events = ev.slice(0, 6);
            done(out);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(JSON.stringify(s), JSON.stringify(r));
}
await browser.close();
