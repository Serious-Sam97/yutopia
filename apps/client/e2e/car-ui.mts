// (plan 94 P10) The car's walnut HUD in the world: Ana in a town car — the plate, the keys' slip, the car at a glance
// knocked about (dents, the windscreen cracked, a flat, smoking), the chips, F1; what's shown and stills (OUT=dir).
// PHONE=1: a phone's screen (touch).
//   OUT=dir node --experimental-strip-types e2e/car-ui.mts [url]
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
const phone = !!process.env.PHONE;
const page = phone
  ? await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage()
  : await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
await page.evaluate(() => {
  const r = (window as any).__yutopia.room;
  r.send("mod:cars", {});
  // (the shared dev world may have her down, or the dark out: up, peaceful, midday)
  r.send("mod:heal", {});
  r.send("mod:dark", { mode: "peaceful" });
  r.send("mod:hour", { h: 12 });
});
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


const out = process.env.OUT ?? "/tmp";
const tag = phone ? "phone-" : "";
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/${tag}ui-1-in.png` });
const hud = () =>
  page.evaluate(() => {
    const el = document.querySelector(".carhud") as HTMLElement | null;
    if (!el) return null;
    const q = (s: string) => el.querySelector(s) as HTMLElement | null;
    const shown = (s: string) => {
      const e = q(s);
      return !!e && getComputedStyle(e).display !== "none";
    };
    return {
      kmh: q("[data-q=kmh]")?.textContent,
      gear: q("[data-q=gear]")?.textContent,
      mode: q("[data-q=mode]")?.textContent,
      fuel: q("[data-q=fueln]")?.textContent,
      engine: q("[data-q=engn]")?.textContent,
      chips: [...el.querySelectorAll(".chip")].map((c) => c.textContent),
      card: shown("[data-q=card]"),
      keys: (q("[data-q=keys]") as HTMLElement)?.style.opacity,
      keysShown: shown("[data-q=keys]"),
      note: q("[data-q=note]")?.textContent,
      plate: shown("[data-q=plate]"),
      oldHint: !!document.querySelector("[data-hint]"),
    };
  });
console.log("in:", JSON.stringify(await hud()));
if (!phone) {
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyS");
  await page.keyboard.down("Space");
  await page.waitForTimeout(500);
  await page.keyboard.up("Space");
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(450);
  await page.keyboard.up("KeyA");
  await page.waitForTimeout(1800);
  console.log("driving:", JSON.stringify(await hud()));
  await page.screenshot({ path: `${out}/${tag}ui-2-driving.png` });
  await page.keyboard.up("KeyW");
  await page.keyboard.down("Space");
  await page.waitForTimeout(2500);
  await page.keyboard.up("Space");
}
// knocked about: dents, the windscreen cracked, a flat, smoking (as the server and my sim would have it)
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const m = C.mine;
  m.dmg.zones = [0.85, 0.2, 0.55, 0.1, 0];
  m.dmg.parts |= 256 | 4096 | 16 | (1 << 20);
  m.dmg.fire = 1;
  C.station = 2;
});
await page.keyboard.press("KeyN");
await page.waitForTimeout(1500);
console.log("knocked:", JSON.stringify(await hud()));
await page.screenshot({ path: `${out}/${tag}ui-3-knocked.png` });
if (!phone) {
  await page.waitForTimeout(8000);
  console.log("after 10 s:", JSON.stringify((await hud())?.keys));
  await page.keyboard.press("F1");
  await page.waitForTimeout(800);
  console.log("F1:", JSON.stringify((await hud())?.keys));
  await page.keyboard.press("F1");
  await page.waitForTimeout(800);
  console.log("F1 again:", JSON.stringify((await hud())?.keys));
}
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
