/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 73 phase 4.6 — the life look's legs against the rig's: for each clip on /dev/anim (the dev client on
// :3100, the GPU), the man and the woman, every frame: how far the life foot's ball (at the sole) is from
// the rig's ball (moves.ts's leg: THIGH, SHIN, ANKLE, BALL), the life legs fitted (chars/model.ts fitLeg).
//   node --experimental-strip-types e2e/life-legs.mts "walk" "jog" "sit down, sit, get up" …
import { chromium } from "@playwright/test";

const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
for (const clip of process.argv.slice(2)) {
  for (const gender of ["masculine", "feminine"]) {
    await p.goto(
      `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&play=0&look=life&gender=${gender}`,
    );
    await p.waitForFunction(() => (window as any).__anim?.ready === true, null, { timeout: 120000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const A = (window as any).__anim;
      const fr = A.bench.after as any[];
      const M = A.sway().after;
      const V = M.root.position.constructor;
      const Q = M.root.quaternion.constructor;
      const sole = M.lifeSole();
      const THIGH = (0.612 * 1.15 * 1.14) / 2,
        SHIN = THIGH,
        ANKLE = 0.061,
        BALL = 0.114,
        HIP_H = THIGH + SHIN + ANKLE;
      let worst = 0,
        at = -1,
        over5 = 0,
        n = 0;
      fr.forEach((f: any, i: number) => {
        M.root.position.set(f.root.x, f.root.y, f.root.z);
        M.root.rotation.y = f.root.yaw;
        M.fitLegs = false;
        M.setPose(f.pose, f.lift);
        M.root.updateMatrixWorld(true);
        const rig: any[] = [];
        for (const S of ["L", "R"]) {
          const th = M.bones[`thigh${S}`];
          const hip = th.getWorldPosition(new V());
          hip.y += HIP_H - M.lifeSole().ankleY * 0 - (M as any).life.hipY;
          const tq = th.getWorldQuaternion(new Q());
          const tk = M.bones[`knee${S}`].getWorldQuaternion(new Q());
          const fq = M.bones[`ankle${S}`].getWorldQuaternion(new Q());
          rig.push(
            hip
              .add(new V(0, -THIGH, 0).applyQuaternion(tq))
              .add(new V(0, -SHIN, 0).applyQuaternion(tk))
              .add(new V(0, -ANKLE, BALL).applyQuaternion(fq)),
          );
        }
        M.fitLegs = true;
        M.setPose(f.pose, f.lift);
        M.root.updateMatrixWorld(true);
        ["L", "R"].forEach((S, k) => {
          const an = M.bones[`ankle${S}`];
          const q = an.getWorldQuaternion(new Q());
          const ball = an.getWorldPosition(new V()).add(new V(0, -sole.ankleY, sole.ball).applyQuaternion(q));
          const d = ball.distanceTo(rig[k]);
          n++;
          if (d > 0.005) over5++;
          if (d > worst) {
            worst = d;
            at = i;
          }
        });
      });
      return { worst: +(worst * 100).toFixed(2), at, over5, n };
    });
    console.log(
      `${clip} (${gender}): the life ball off the rig's at most ${r.worst} cm (frame ${r.at}); over 5 mm in ${r.over5}/${r.n} foot-frames`,
    );
  }
}
await b.close();
