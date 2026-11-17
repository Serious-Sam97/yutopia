// (plan 95 F1a) The window wound: Ana at the wheel of Main Street's first town car, N — her window down into the
// door over 1.5 s (each 150 ms: how far, the glass's drop, shown or not; the motor heard once), N again — up.
// Stills from beside her door, the camera turned round to it (OUT=dir): partway, down, partway up.
//   OUT=dir node --experimental-strip-types e2e/car-window.mts [url]
// (the same car each run: `mod:cars` puts it home first — run them one after another, never two at once)
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const quality = process.argv[3] ?? "high";
const cpu = Number(process.argv[4] ?? 1);
const shot = process.argv[5];
const ctx = await request.newContext();
const r = await ctx.post("http://localhost:8100/api/login", {
  data: { email: "ana@yutopia.test", password: "yutopia-demo" },
  headers: { Accept: "application/json" },
});
const tok = (await r.json()).token;
const browser = await chromium.launch({
  args: [
    "--use-angle=metal",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => /stall|long|slow/i.test(m.text()) && console.log("  console:", m.text().slice(0, 300)));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t as string);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p", cam3p: "chase", maxFps: 0 }));
    const W = window as any;
    W.__f = [];
    let last = performance.now();
    const tick = (t: number) => {
      W.__f.push(t - last);
      if (t - last > 50) {
        W.__s ??= [];
        W.__s.push([Math.round(t), Math.round(t - last)]);
      }
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
  [tok, quality] as const,
);
await page.goto(`${base}/${process.env.FEEL ? `?feel=${process.env.FEEL}` : ""}`);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 240_000 },
);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await page.waitForTimeout(1500);
// a town car on Main Street, parked along it
const car = await page.evaluate(() => {
  const c = (window as any).__yutopia;
  const out: any[] = [];
  c.room.state.objects.forEach((o: any) => {
    const p = JSON.parse(o.props);
    if (o.kind !== "car" || p.driven || !/^town-car/.test(o.id)) return;
    out.push({ id: o.id, x: o.x, y: o.y, yaw: o.yaw, p });
  });
  out.sort((a, b) => a.x - b.x);
  return out[0];
});
console.log("car", JSON.stringify(car));
const pose = await page.evaluate((id) => {
  const c = (window as any).__yutopia;
  return c.cars.where().find((w: any) => w.id === id) ?? null;
}, car.id);
console.log("where", JSON.stringify(pose));
// by it, then in
await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x + 1.6, y: p.y + 1.6, level: 0 }), car);
await page.waitForTimeout(6000);
let inCar = false;
for (const [dx, dy] of [
  [1.4, 1.0],
  [-1.4, 1.0],
  [1.4, -1.0],
  [-1.4, -1.0],
  [1.0, 1.4],
  [-1.0, 1.4],
  [1.0, -1.4],
  [-1.0, -1.4],
]) {
  await page.evaluate(
    ([x, y]) => (window as any).__yutopia.teleport({ x, y, level: 0 }),
    [car.x + 1 + dx, car.y + 1 + dy],
  );
  await page.waitForTimeout(1200);
  const k = await page.evaluate(() => (window as any).__hud.get().prompt?.kind ?? "");
  if (/^car/.test(k)) {
    await page.evaluate(() => (window as any).__yutopia.interact());
    await page.waitForTimeout(450);
    const door = await page.evaluate(() => {
      const C = (window as any).__yutopia.cars;
      const m = C.mine;
      if (!m) return null;
      const l = C.live.get(m.vid);
      const mod = l?.model;
      return { seat: m.seat, doors: l?.doors?.map((x: number) => +x.toFixed(2)), names: mod?.e?.doors, doorOf: mod?.doorOf?.(m.seat) };
    });
    console.log("door on entry", JSON.stringify(door));
    await page.waitForTimeout(2600);
    inCar = await page.evaluate(() => (window as any).__yutopia.cars.driving());
    if (inCar) break;
  }
}
console.log("driving", inCar);
if (!inCar) process.exit(1);
await page.waitForTimeout(2500);
const out = process.env.OUT ?? "/tmp";
// (the motor heard: counted)
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const snd = C.mine.sound;
  (window as any).__motor = 0;
  if (snd) {
    const was = snd.windowMotor.bind(snd);
    snd.windowMotor = (...a: any[]) => {
      (window as any).__motor++;
      return was(...a);
    };
  }
});
const state = () =>
  page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine.vid);
    const m = l.model;
    const door = m.doorOf(C.mine.seat);
    let drop = -1;
    let shown = 0;
    let n = 0;
    m.root.traverse((x: any) => {
      const r = x.userData.winRest;
      if (x.userData.pane !== 2 + door || !r) return;
      n++;
      drop = Math.max(drop, Math.hypot(x.position.x - r.x, x.position.y - r.y, x.position.z - r.z));
      if (x.visible) shown++;
    });
    return { k: +(m.winK?.[door] ?? -1).toFixed(2), drop: +drop.toFixed(3), shown, meshes: n, motor: (window as any).__motor, win: l.win };
  });
const pitch = Number(process.env.PITCH ?? -0.1);
const turn = async (yaw: number) => {
  await page.evaluate(
    ([y, p, f]) => {
      const C = (window as any).__yutopia.cars;
      C.cam.look.yaw = y;
      C.cam.look.pitch = p;
      C.mouseAt = C.time;
      // (FOV=deg: a narrower lens, the window close)
      const cam = (window as any).__yutopia.tp.camera;
      if (f > 0 && cam.fov !== f) {
        cam.fov = f;
        cam.updateProjectionMatrix();
      }
    },
    [yaw, pitch, Number(process.env.FOV ?? 0)] as const,
  );
};
// (out into the street, clear of the diner's wall by her door: 4 m to its right)
await page.evaluate((k) => {
  const m = (window as any).__yutopia.cars.mine;
  const s = m.sim;
  const q = s.q;
  // (its right: the car's own z)
  const zx = 2 * (q.x * q.z + q.w * q.y);
  const zz = 1 - 2 * (q.x * q.x + q.y * q.y);
  m.drive.car.place(s.p.x + zx * k, s.p.y + 0.05, s.p.z + zz * k, [q.x, q.y, q.z, q.w]);
}, Number(process.env.OUT_M ?? 4));
await page.waitForTimeout(1500);
const yaw = Number(process.env.YAW ?? 1.1);
// (RED=1: her window's glass tinted red, to see where it goes — a check of the slide, not the look)
if (process.env.RED)
  await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const m = C.live.get(C.mine.vid).model;
    const door = m.doorOf(C.mine.seat);
    m.root.traverse((x: any) => {
      if (x.userData.pane !== 2 + door || !x.material) return;
      x.material = x.material.clone();
      x.material.color?.setRGB(1, 0, 0);
      x.material.opacity = 0.85;
      x.material.transparent = true;
    });
  });
await turn(yaw);
await page.waitForTimeout(600);
console.log("up:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/window-0-up.png` });
await page.keyboard.press("KeyN");
const t0 = Date.now();
let snapped = 0;
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(150);
  await turn(yaw);
  const st = await state();
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)} s:`, JSON.stringify(st));
  if (snapped === 0 && st.k > 0.4) {
    snapped = 1;
    await page.screenshot({ path: `${out}/window-1-going-down.png` });
  }
}
await page.screenshot({ path: `${out}/window-2-down.png` });
await page.keyboard.press("KeyN");
await page.waitForTimeout(700);
await turn(yaw);
console.log("going up:", JSON.stringify(await state()));
await page.screenshot({ path: `${out}/window-3-going-up.png` });
await page.waitForTimeout(1200);
console.log("up again:", JSON.stringify(await state()));
await page.keyboard.press("KeyX");
await page.waitForTimeout(2500);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await page.waitForTimeout(500);
await browser.close();
