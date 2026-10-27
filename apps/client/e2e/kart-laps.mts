// The kart's sandbox lapped by a script (docs/plan/46-the-karts.md, phase 1): the tests' simple
// driver (pure pursuit, drifting the bends) put at the wheel through __kart.drive, two laps,
// shots at the moments that matter, the frame times. The dev client on :3100, the GPU.
//   node --experimental-strip-types e2e/kart-laps.mts [out dir]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "/tmp";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("  error:", e.message));
await page.goto(`${base}/dev/kart${process.env.Q ?? ""}`);
await page.waitForFunction(() => !!(window as unknown as { __kart?: unknown }).__kart, null, { timeout: 120_000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  // biome-ignore lint/suspicious/noExplicitAny: the sandbox's dev hook
  const K = (window as any).__kart;
  const t = K.track;
  const S = K.spec;
  const at = K.trackAt;
  const st: { worst: number; last: number; frames: number; shots: string[] } = {
    worst: 0,
    last: performance.now(),
    frames: 0,
    shots: [],
  };
  // biome-ignore lint/suspicious/noExplicitAny: a probe
  (window as any).__st = st;
  const tick = () => {
    const now = performance.now();
    st.worst = Math.max(st.worst, now - st.last);
    st.last = now;
    st.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // biome-ignore lint/suspicious/noExplicitAny: a probe
  K.drive = (k: any, world: any) => {
    const here = world.locate(k.x, k.z, k.y);
    const s = here ? here.s : 0;
    const speed = k.vx * Math.cos(k.a) + k.vz * Math.sin(k.a);
    const v = Math.max(1, speed);
    const look = 5 + v * 0.45;
    const q = at(t, s + look);
    const path = v > 3 ? Math.atan2(k.vz, k.vx) : k.a;
    let d = Math.atan2(q.z - k.z, q.x - k.x) - path;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const yawWant = (v * 2 * Math.sin(d)) / look;
    const bend = (a0: number, a1: number) => {
      let sum = 0;
      for (let a = a0; a <= a1; a += 2) sum += at(t, s + a).k;
      return sum / ((a1 - a0) / 2 + 1);
    };
    const clamp = (x: number) => Math.max(-1, Math.min(1, x));
    if (v > S.driftMin + 2) {
      const ahead = bend(6, 30);
      if (k.drift === 0 && Math.abs(ahead) > 1 / 90 && (!k.air || k.hopping))
        return { throttle: 1, brake: 0, steer: Math.sign(ahead), hop: true, digital: false };
      if (k.drift !== 0) {
        const near = bend(2, 14);
        const keep = Math.sign(near) === k.drift && Math.abs(near) > 1 / 140 && k.tier < 3;
        const f = Math.min(1, v / 8);
        const steer = clamp(((yawWant / f) * k.drift - S.driftYaw) / S.driftSteer) * k.drift;
        return { throttle: 1, brake: 0, steer, hop: keep, digital: false };
      }
    }
    const f = Math.min(1, v / 7) * (1 - S.yawFade * Math.min(1, v / S.vmax));
    return { throttle: 1, brake: 0, steer: clamp(yawWant / (S.yaw * f)), hop: false, digital: false };
  };
  K.restart();
});
// biome-ignore lint/suspicious/noExplicitAny: the sandbox's dev hook
const state = () =>
  page.evaluate(() => {
    const K = (window as any).__kart;
    const k = K.k;
    const on = null;
    return {
      t: k.t,
      lap: K.laps.lap,
      last: K.laps.last,
      best: K.laps.best,
      tier: k.tier,
      drift: k.drift,
      air: k.air,
      hopping: k.hopping,
      boost: k.boost,
      y: k.y,
      ghost: !!K.best,
      on,
    };
  });
const shots = new Set<string>();
const t0 = Date.now();
while (Date.now() - t0 < 120_000) {
  const s = await state();
  const take = async (name: string) => {
    if (shots.has(name)) return;
    shots.add(name);
    await page.screenshot({ path: `${out}/kart-lap-${name}.png` });
    console.log(`shot ${name} at sim ${s.t.toFixed(1)} s`);
  };
  if (s.t < 6 && s.t > 2.5) await take("lights");
  if (s.drift !== 0 && s.tier === 3 && s.lap === 0) await take("purple");
  if (s.air && !s.hopping && s.y > 2.6) await take("jump");
  if (s.y > 6.5) await take("bridge");
  if (s.boost > 0 && s.drift === 0 && s.lap === 0 && s.t > 12) await take("boost");
  if (s.lap === 1 && s.ghost && s.t - (s.last ?? 0) > 14) await take("ghost");
  if (s.lap >= 2) break;
  await page.waitForTimeout(60);
}
const s = await state();
// biome-ignore lint/suspicious/noExplicitAny: a probe
const st = await page.evaluate(() => (window as any).__st);
console.log(
  `laps ${s.lap} · last ${s.last?.toFixed(2)} · best ${s.best?.toFixed(2)} · worst frame ${st.worst.toFixed(0)} ms over ${st.frames} frames`,
);
await browser.close();
