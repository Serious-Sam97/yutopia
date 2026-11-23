// Plan 116's guard: first person's view model never moves the third person. On the arms bench (/dev/arms, its eye
// view: the game's own Hands1P beside the body everyone else sees), for every gun at the hip, aimed and mid-reload:
// the body's bones read, the view model stepped a frame, the bones read again — not a hair different.
import { expect, test } from "@playwright/test";

const GPU = process.env.YUTOPIA_GPU === "1";
const JOINTS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "elbowL",
  "wristL",
  "fingersL",
  "indexL",
  "thumbL",
  "shoulderR",
  "elbowR",
  "wristR",
  "fingersR",
  "indexR",
  "thumbR",
];

for (const gun of ["revolver", "shotgun", "ak47", "sniper", "daybreak"])
  for (const pose of ["ready", "aim", "reload"])
    test(`the view model leaves the third person alone: ${gun}, ${pose}`, async ({ page }) => {
      test.skip(!GPU, "needs the GPU: YUTOPIA_GPU=1");
      test.setTimeout(120_000);
      await page.goto(`/dev/arms?gun=${gun}&view=eye&pose=${pose}&t=0.4`);
      // biome-ignore lint/suspicious/noExplicitAny: the bench's own hook
      await page.waitForFunction(() => !!(window as any).__fp?.hands?.shown, null, { timeout: 90_000 });
      const moved = await page.evaluate((joints) => {
        // biome-ignore lint/suspicious/noExplicitAny: the bench's own hook
        const f = (window as any).__fp;
        const read = () =>
          joints.map((j: string) => {
            const b = f.person.model.bone(j);
            b.updateWorldMatrix(true, false);
            return Array.from(b.matrixWorld.elements as number[]);
          });
        let worst = 0;
        for (let i = 0; i < 5; i++) {
          const before = read();
          f.hands.update(f.p, f.person.motionOut, 1 / 60, f.eyeCam, 0, false, false);
          const after = read();
          for (let k = 0; k < before.length; k++)
            for (let e = 0; e < 16; e++) worst = Math.max(worst, Math.abs(before[k][e] - after[k][e]));
        }
        return worst;
      }, JOINTS);
      expect(moved, "the body's bones moved by the view model").toBe(0);
    });
