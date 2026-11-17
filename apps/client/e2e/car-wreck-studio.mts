// (plan 94 phase 0) The wreck's mock on /dev/cars (a car not frozen into a still model there): the dents deep, the
// bumper gone, a headlamp and the windscreen broken, the left side's glass out, the driver's door hanging off its
// lower hinge, the bonnet off and lying on the ground in front. Stills to design/car-wreck.
//   node --experimental-strip-types e2e/car-wreck-studio.mts [url]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3100";
const out = process.env.OUT ?? "../../design/car-wreck";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.goto(`${base}/dev/cars`);
await page.waitForFunction(() => !!(window as any).__sheet?.car?.ready, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const snap = async (name: string, yaw: number, pitch: number, dist: number) => {
  const url = await page.evaluate(
    ([y, p, d]) => {
      const S = (window as any).__sheet;
      const c = S.cam;
      // (round the car's middle: yaw 0 its right side, + toward its nose)
      c.position.set(Math.sin(y) * Math.cos(p) * d, 0.8 + Math.sin(p) * d, Math.cos(y) * Math.cos(p) * d);
      c.lookAt(0, 0.7, 0);
      S.renderer.render(S.scene, c);
      return S.renderer.domElement.toDataURL("image/png");
    },
    [yaw, pitch, dist] as const,
  );
  const fs = await import("node:fs");
  fs.writeFileSync(`${out}/${name}`, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", name);
};
await snap("s0-as-it-is.png", -0.7, 0.18, 7.5);
await page.evaluate(() => {
  const S = (window as any).__sheet;
  const P = { bumperGone: 2, bumperHang: 1, mirrorL: 4, headL: 16, screen: 256, screenBad: 512, sideL: 1024 };
  S.st.dent = 1;
  S.st.parts = P.bumperHang | P.bumperGone | P.mirrorL | P.headL | P.screen | P.screenBad | P.sideL;
  S.pose();
  const car = S.car;
  // (the driver's door — the model's left: its side +1 — off its upper hinge, hanging open from its lower)
  const door = car.doors.find((d: any) => d.front && d.side === 1) ?? car.doors[0];
  door.open(0.95);
  door.group.rotation.x += 0.42;
  door.group.position.y -= 0.1;
  // (the bonnet off, lying on the road in front of the car, tipped)
  const bon = car.parts.get("bonnet");
  if (bon) {
    const lying = car.partCopy("bonnet");
    bon.holder.visible = false;
    if (lying) {
      lying.position.set(-3.2, 0.05, 0.6);
      lying.rotation.set(0.12, 0.7, 0.05);
      car.root.parent.add(lying);
    }
  }
  // (the rear bumper hanging off its one side)
  const rb = car.parts.get("bumper_r");
  if (rb) {
    rb.anim.rotation.y = 0.22;
    rb.anim.position.y -= 0.12;
  }
});
await page.waitForTimeout(800);
await snap("s1-wrecked-front.png", -0.7, 0.18, 7.5);
await snap("s2-wrecked-side.png", -1.55, 0.12, 7.5);
await snap("s3-wrecked-rear.png", 2.2, 0.2, 7.5);
await browser.close();
