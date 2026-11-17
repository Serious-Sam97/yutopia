// (plan 94 P1) The fire, in the world: Ana's town car crashed past its worst (its front's damage, as her sim sets
// it) — smoking —, then from the street side two rounds into its front wing — burning —, two more — burning on, then the blast 10 s
// after it caught (plan 95 F7a) —,
// then burnt out; each stage as the server and her client have it, stills (OUT=dir). At dusk: the fire's light.
//   OUT=dir node --experimental-strip-types e2e/car-fire.mts [url]
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
await page.evaluate(() => {
  const r = (window as any).__yutopia.room;
  r.send("mod:cars", {});
  // (the shared dev world may have her down, or the dark out: up, peaceful, midday)
  r.send("mod:heal", {});
  r.send("mod:dark", { mode: "peaceful" });
  r.send("mod:hour", { h: 18.6 });
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


await page.waitForTimeout(2500);
const out = process.env.OUT ?? "/tmp";
// its front crashed in past its worst (as my sim's knocks would): the server has it smoking
const vid = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  C.mine.dmg.zones[0] = 0.5;
  return C.mine.vid;
});
await page.waitForTimeout(1300);
await page.evaluate(() => {
  (window as any).__yutopia.cars.mine.dmg.zones[0] = 0.99;
});
const stage = () =>
  page.evaluate((id) => {
    const Y = (window as any).__yutopia;
    const v = Y.room.state.vehicles.get(id);
    const o = Y.room.state.objects.get(id.replace(/^car:/, ""));
    const dmg = v?.dmg ?? (o ? JSON.parse(o.props).dmg : "");
    const p = Y.cars.parked.get(id.replace(/^car:/, ""));
    return { dmg, fire: Number(String(dmg).split("|")[3] ?? 0), seen: p?.fire ?? Y.cars.live.get(id)?.fire, lights: Y.tp.fireLights.length };
  }, vid);
await page.waitForFunction(
  (id) => String((window as any).__yutopia.room.state.vehicles.get(id)?.dmg ?? "").split("|")[3] === "1",
  vid,
  { timeout: 8000 },
);
console.log("crashed:", JSON.stringify(await stage()));
await page.keyboard.press("KeyX");
await page.waitForTimeout(3500);
const oid = vid.replace(/^car:/, "");
const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, oid);
const fwd = [Math.cos(pp.a), Math.sin(pp.a)];
const right = [-Math.sin(pp.a), Math.cos(pp.a)];
const P = (u: number, w: number) => ({ x: pp.x + fwd[0] * u + right[0] * w, y: pp.z + fwd[1] * u + right[1] * w });
// (the street side, off its front wing)
const look = async (file: string, u: number, w: number) => {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(u, w));
  await page.waitForTimeout(1600);
  await page.evaluate(async (q) => {
    const y = (window as any).__yutopia;
    const V = y.tp.camera.position.constructor;
    let best = { yaw: 0, off: 9 };
    for (let i = 0; i < 24; i++) {
      const yaw = -Math.PI + (i / 24) * 2 * Math.PI;
      y.tp.yaw = yaw;
      await new Promise((r) => setTimeout(r, 90));
      const p = new V(q.x, q.h + 1, q.z).project(y.tp.camera);
      if (p.z < 1 && Math.abs(p.x) < best.off) best = { yaw, off: Math.abs(p.x) };
    }
    y.tp.yaw = best.yaw;
    y.tp.pitch = 0.2;
  }, { x: pp.x, z: pp.z, h: pp.y });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${file}` });
};
await look("fire-1-smoke.png", 0.4, 6.5);
console.log("smoking:", JSON.stringify(await stage()));
// armed, by its front wing on the street side
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(1.2, 5.5));
await page.waitForTimeout(1800);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:refill", { kit: true }));
await page.waitForTimeout(800);
await page.keyboard.press("Digit2");
await page.waitForFunction(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun === "revolver", null, { timeout: 10000 });
await page.mouse.move(720, 450);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(1200);
const shoot = async () => {
  await page.evaluate(
    ([t, g]) => {
      const y = (window as any).__yutopia;
      const me = y.room.state.players.get(y.room.sessionId);
      const oz = me.z + 1.35;
      const tz = (g as number) + 0.72;
      const d = Math.hypot((t as any).x - me.x, (t as any).y - me.y);
      y.room.send("arms:fire", { ox: me.x, oy: me.y, oz, yaw: Math.atan2((t as any).y - me.y, (t as any).x - me.x), pitch: Math.atan2(tz - oz, d), lag: 0, seed: 9 });
    },
    [P(1.75, 0), pp.y] as const,
  );
  await page.waitForTimeout(800);
};
// (plan 95 F7a: when it caught, watched in the page — its props' fire field turning 2)
await page.evaluate((id) => {
  const W = window as any;
  W.__caught = 0;
  const tick = () => {
    const o = W.__yutopia.room.state.objects.get(id);
    const f = Number(String(JSON.parse(o?.props ?? "{}").dmg ?? "").split("|")[3] ?? 0);
    if (!W.__caught && f >= 2) W.__caught = performance.now();
    if (!W.__caught) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, car.id);
await shoot();
await shoot();
await page.mouse.up({ button: "right" });
await page.waitForTimeout(1500);
console.log("shot twice:", JSON.stringify(await stage()));
await look("fire-2-burning.png", 0.4, 6.5);
console.log("burning:", JSON.stringify(await stage()));
console.log(
  "sounds in:",
  JSON.stringify(
    await page.evaluate(() => {
      const C = (window as any).__yutopia.cars;
      const n = (k: string) => {
        const b = C.hitBufs.get(k);
        return Array.isArray(b) ? b.length : (b ?? "none");
      };
      return { fire: n("fire"), catch: n("fire-catch"), blast: n("blast"), loops: C.fireLoops.size, ctx: (window as any).__yutopia.cars.mine ? "in car" : "on foot" };
    }),
  ),
);
// (plan 96 F2a: its hop recorded from its first frame)
await page.evaluate((id) => {
  const W = window as any;
  const C = W.__yutopia.cars;
  W.__hop = [];
  let t0 = 0;
  const tick = () => {
    const h = C.hops.get(id);
    if (!t0 && h) t0 = performance.now();
    if (!t0) {
      requestAnimationFrame(tick);
      return;
    }
    const pk = C.parked.get(id);
    const live = C.live.get(`car:${id}`);
    const root = live?.model.root ?? pk?.full?.root ?? pk?.far?.root;
    if (root && h?.base) {
      const e = new (root.rotation.constructor)().setFromQuaternion(h.base.q.clone().invert().multiply(root.quaternion));
      W.__hop.push([(performance.now() - t0) / 1000, root.position.y - h.base.p.y, (e.x * 180) / Math.PI, (e.z * 180) / Math.PI]);
    }
    if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
  };
  tick();
}, car.id);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(1.2, 7));
await page.waitForTimeout(1500);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(900);
await shoot();
await page.mouse.up({ button: "right" });
// (the blast's moment: turned to it, a still at once)
await page.evaluate(() => {
  (window as any).__blastSeen = 0;
  (window as any).__yutopia.room.onMessage("car:blast", () => {
    (window as any).__blastSeen = performance.now();
  });
});
await page.mouse.down({ button: "right" });
await page.waitForTimeout(500);
await shoot();
await page.mouse.up({ button: "right" });
await page.waitForTimeout(300);
// (plan 95 F7a: shot past its blast's heat, it burns on — 10 s from catching, then it goes)
console.log("shot four times:", JSON.stringify(await stage()), "blown yet", await page.evaluate(() => (window as any).__blastSeen > 0));
await page.waitForFunction(() => (window as any).__blastSeen > 0, null, { timeout: 20_000 });
// (plan 96 F2a: its hop — the model's height over where it stood and its tip, every frame in the page from the
// blast; stills at its top and just after it's down)

const at = (t: number) =>
  page.waitForFunction((tt) => {
    const h = (window as any).__hop;
    return h.length && h[h.length - 1][0] >= tt;
  }, t, { timeout: 15_000 });
await at(0.28);
await page.screenshot({ path: `${out}/fire-3-hop-top.png` });
await at(0.95);
await page.screenshot({ path: `${out}/fire-3-hop-down.png` });
await page.waitForTimeout(1500);
const hop = (await page.evaluate(() => (window as any).__hop)) as number[][];
const top = hop.reduce((a, r) => (r[1] > a[1] ? r : a), [0, 0, 0, 0]);
const tip = hop.reduce((a, r) => Math.max(a, Math.abs(r[2]), Math.abs(r[3])), 0);
const down = hop.find((r) => r[0] > top[0] && r[1] < 0.01);
console.log(
  `the hop: ${hop.length} frames · top ${top[1].toFixed(2)} m at ${top[0].toFixed(2)} s · tipped up to ${tip.toFixed(0)}° · down at ${down ? down[0].toFixed(2) : "-"} s · last ${hop.length ? hop[hop.length - 1][0].toFixed(2) : "-"} s`,
);
await page.screenshot({ path: `${out}/fire-3-blast.png` });
console.log(
  "blown:",
  JSON.stringify(await stage()),
  "after burning",
  await page.evaluate(() => (((window as any).__blastSeen - (window as any).__caught) / 1000).toFixed(1)),
  "s",
);
const me = await page.evaluate(() => {
  const y = (window as any).__yutopia;
  const p = y.room.state.players.get(y.room.sessionId);
  return { hp: p.hp, fell: p.fellAt > 0 };
});
console.log("Ana:", JSON.stringify(me));
await page.waitForTimeout(2500);
console.log(
  "thrown:",
  JSON.stringify(
    await page.evaluate((q) => {
      const C = (window as any).__yutopia.cars;
      return C.debris.bits.map((b: any) => {
        const p = b.o.position;
        return { d: +Math.hypot(p.x - q.x, p.z - q.z).toFixed(1), y: +(p.y - C.G.heightAt(p.x, p.z)).toFixed(2) };
      });
    }, { x: pp.x, z: pp.z }),
  ),
);
await page.waitForTimeout(5000);
await page.evaluate(() => (window as any).__yutopia.room.send("mod:heal", {}));
await look("fire-4-burnt.png", 0.4, 6.5);
console.log("burnt:", JSON.stringify(await stage()));
await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await browser.close();
