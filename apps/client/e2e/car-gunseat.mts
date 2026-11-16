// (plan 93 S2) A gun from the driver's seat: Ana in the town car, the revolver drawn (2), the right button —
// aimed out of her window (the view, a still) —, a shot (the server takes it: a round fewer); then going faster
// the same aim from outside (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-gunseat.mts [url]
// Was: Each frame of a drive down Main Street: where the car and its model
// and the camera are, its speed and gear — the frames where it moves back, or stops a frame.
//   node --experimental-strip-types e2e/car-jerk.mts [url] [quality]
// Plan 92 phase 10's drive: Ana in Main Street's first town car, held flat out west down the street ~12 s on a prod
// build (`next start -p 3107`) — the frames over 50 ms and when (s from the throttle), the worst, top speed, distance.
// PROF=1 (best on the dev client, :3100: names) adds a CPU profile of each stall over 90 ms, lined up by a mark.
//   node --experimental-strip-types e2e/car-town-drive.mts [url] [quality: high|low] [cpu slowdown] [still.png]
// (the same car each run: `mod:cars` puts it home first — run them one after another, never two at once)
import { chromium, request } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3107";
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
await page.goto(`${base}/`);
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

await page.waitForTimeout(2000);
const out = process.env.OUT ?? "/tmp";
const loaded = () =>
  page.evaluate(() => {
    const y = (window as any).__yutopia;
    const inv = y.dark?.inv ?? y.darkInv?.() ?? null;
    return inv?.quick?.[0]?.loaded ?? (window as any).__loaded ?? null;
  });
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.onMessage("dark:pockets", (m: any) => ((window as any).__loaded = m.inv?.quick?.[0]?.loaded));
  y.room.send("mod:refill", { kit: true });
  y.room.send("mod:dark", { mode: "peaceful" });
});
await page.waitForTimeout(1500);
const state = (tag: string) =>
  page.evaluate((tag) => {
    const y = (window as any).__yutopia;
    const g = y.cars.gunSeat();
    const cross = document.querySelector(".dk-cross") as HTMLElement | null;
    return `${tag}: gun "${y.room.state.players.get(y.room.sessionId).gun}", gun mode ${!!g?.aiming}, crosshair ${cross ? getComputedStyle(cross).display : "none"}`;
  }, tag);
console.log(await state("in the car"));
await page.screenshot({ path: `${out}/gunseat-0-car.png` });
await page.keyboard.press("Digit2");
await page.waitForTimeout(1800);
console.log(await state("2 pressed"));
await page.mouse.move(720, 450);
await page.mouse.move(760, 440, { steps: 4 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/gunseat-aim.png` });
console.log(
  "barrel vs aim:",
  await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine.vid);
    let e: any = null;
    for (const p of l.people.values()) if (p.seat === 0) e = p;
    const held = e?.gun?.held;
    if (!held) return "no gun held";
    const V = l.model.root.position.constructor;
    const barrel = held.barrel(new V());
    const aim = C.aimDir(l, 0, new V());
    const deg = (a: any, b: any) => ((Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180) / Math.PI).toFixed(1);
    const cam = (window as any).__yutopia.tp.camera;
    const scr = (v: any) => {
      const p = v.clone().project(cam);
      return [Math.round((p.x + 1) * 720), Math.round((1 - p.y) * 450)];
    };
    const mz = held.muzzle(new V());
    const inner = held.root.children[0];
    const back = mz.clone().addScaledVector(barrel, -0.25);
    const gun = inner.children[0];
    const real = (n: string) => {
      const o = gun.getObjectByName(n);
      if (!o) return "none";
      const w = o.getWorldPosition(new V());
      return `${n} real ${scr(w)} parent ${o.parent?.name} gunRot ${gun.rotation.x.toFixed(2)},${gun.rotation.y.toFixed(2)},${gun.rotation.z.toFixed(2)}`;
    };
    console.log(real("pt_front"), real("pt_rear"), real("pt_muzzle"));
    return `${real("pt_muzzle")} | ${real("pt_front")} | barrel·aim ${deg(barrel, aim)}° · on screen (1440×900): muzzle ${scr(mz)}, 25 cm back along the barrel ${scr(back)}, the gun's origin ${scr(inner.getWorldPosition(new V()))}, centre [720,450]`;
  }),
);
const before = await loaded();
await page.mouse.down({ button: "left" });
await page.mouse.up({ button: "left" });
await page.waitForTimeout(1200);
console.log("rounds", before, "→", await loaded());
// close looks at the hand on the gun: from outside the window, from above, from the front of the car
for (const [name, off] of [
  ["hand-out", [0, 0.08, 0.55]],
  ["hand-above", [0.05, 0.5, 0.15]],
  ["hand-front", [-0.55, 0.05, 0.2]],
] as const) {
  await page.evaluate((off) => {
    const C = (window as any).__yutopia.cars;
    (globalThis as any).__camPeek = () => {
      const l = C.live.get(C.mine.vid);
      if (!l) return null;
      let e: any = null;
      for (const p of l.people.values()) if (p.seat === 0) e = p;
      const V = l.model.root.position.constructor;
      const hand = e.m.bones.wristL.getWorldPosition(new V());
      // (offsets in the car's own frame: x its back, y up, z its left — the driver's side)
      const o = new V(off[0], off[1], off[2]).transformDirection(l.model.body.matrixWorld).multiplyScalar(Math.hypot(off[0], off[1], off[2]));
      const from = hand.clone().add(o);
      return { from: [from.x, from.y, from.z], to: [hand.x, hand.y, hand.z] };
    };
  }, off as unknown as number[]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/gunseat-${name}.png` });
}
await page.evaluate(() => ((globalThis as any).__camPeek = null));
await page.evaluate(() => ((globalThis as any).__aimCamOff = true));
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/gunseat-outside.png` });
await page.evaluate(() => ((globalThis as any).__aimCamOff = false));
await page.keyboard.press("Digit2");
await page.waitForTimeout(1500);
console.log(await state("2 again"));
await page.screenshot({ path: `${out}/gunseat-2-away.png` });
// the right hand: in the front passenger's seat (the car's right), the revolver out of that window
await page.evaluate(() => (window as any).__yutopia.interact());
await page.waitForTimeout(2500);
await page.evaluate((id) => (window as any).__yutopia.room.send("car:enter", { id, seat: 1 }), car.id);
await page.waitForTimeout(3500);
console.log("passenger:", await page.evaluate(() => (window as any).__yutopia.cars.mine?.seat));
await page.keyboard.press("Digit2");
await page.waitForTimeout(1800);
console.log(await state("passenger, 2 pressed"));
await page.mouse.move(700, 450, { steps: 3 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/gunseat-right-aim.png` });
await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  (globalThis as any).__camPeek = () => {
    const l = C.live.get(C.mine.vid);
    let e: any = null;
    for (const p of l.people.values()) if (p.seat === 1) e = p;
    if (!e) return null;
    const V = l.model.root.position.constructor;
    const hand = e.m.bones.wristR.getWorldPosition(new V());
    const o = new V(-0.4, 0.06, -0.18).transformDirection(l.model.body.matrixWorld).multiplyScalar(0.44);
    const from = hand.clone().add(o);
    return { from: [from.x, from.y, from.z], to: [hand.x, hand.y, hand.z] };
  };
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/gunseat-right-front.png` });
await page.evaluate(() => ((globalThis as any).__camPeek = null));
await page.keyboard.down("Space");
await page.waitForTimeout(1500);
await browser.close();
