// (plan 95 phase 0) The tyres' voice at the smallest moves: from a stop, taps of the throttle, a car-park turn at
// full lock, a pull-away, a cruise, an ordinary corner, a brake to a stop, a handbrake turn — each tyre bed's peak
// (scrub, the held squeal, the skid, the snow's squeak, the synth's chatter), the chirps and squeal shots, against
// speed, grip used, slip and the ground under the wheels. Sampled every frame in the page.
//   node --experimental-strip-types e2e/car-squeal.mts [url]
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



await page.waitForTimeout(2000);
// every frame: the beds' gains, the chirps, the grip
await page.evaluate(() => {
  const W = window as any;
  const Y = W.__yutopia;
  W.__sq = [];
  let chirp = 0;
  let squeal = 0;
  const tick = () => {
    const m = Y.cars.mine;
    if (m?.sim) {
      const s = m.sim;
      const snd = m.sound;
      const lv = (k: string) => snd?.beds?.get(k)?.g.gain.value ?? 0;
      if (snd && snd.chirpAt !== chirp) chirp = snd.chirpAt;
      if (snd && snd.squealAt !== squeal) squeal = snd.squealAt;
      W.__sq.push({
        kmh: Math.hypot(s.v.x, s.v.z) * 3.6,
        used: Math.max(...s.wheels.map((w: any) => w.used ?? 0)),
        slip: Math.max(...s.wheels.map((w: any) => w.slip ?? 0)),
        ground: [...new Set(s.wheels.map((w: any) => w.ground))].join("+"),
        scrub: lv("scrub"),
        held: lv("squeal-loop"),
        skid: lv("skid"),
        squeak: lv("snow-squeak"),
        synth: snd?.tyre?.sqg?.gain.value ?? 0,
        chirp,
        squeal,
        ctl: `thr ${(s.thr ?? 0).toFixed(2)} brk ${(s.brk ?? 0).toFixed(2)} g${s.gear} help ${s.helping ?? 0}`,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
// (ALL=1: DUMP's frames whatever their level)
if (process.env.ALL) await page.evaluate(() => ((window as any).__all = true));
const key = async (k: string, ms: number) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
};
const stop = async () => {
  await page.keyboard.down("Space");
  await page.keyboard.down("KeyS");
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const v = await page.evaluate(() => {
      const s = (window as any).__yutopia.cars.mine.sim;
      return Math.hypot(s.v.x, s.v.z);
    });
    if (v < 0.2) break;
  }
  await page.keyboard.up("KeyS");
  await page.keyboard.up("Space");
  await page.waitForTimeout(800);
};
const mark = () => page.evaluate(() => (window as any).__sq.length);
const report = async (name: string, from: number) => {
  const r = await page.evaluate((f) => {
    const a = (window as any).__sq.slice(f);
    const pk = (k: string) => a.reduce((m: any, x: any) => (x[k] > m.v ? { v: x[k], at: x } : m), { v: 0, at: null });
    const chirps = new Set(a.map((x: any) => x.chirp)).size - 1;
    const squeals = new Set(a.map((x: any) => x.squeal)).size - 1;
    const out: any = { frames: a.length, topKmh: Math.max(...a.map((x: any) => x.kmh)), chirps, squeals };
    for (const k of ["scrub", "held", "skid", "squeak", "synth"]) {
      const p = pk(k);
      out[k] = p.at ? `${p.v.toFixed(2)} @${p.at.kmh.toFixed(0)}km/h used ${p.at.used.toFixed(2)} slip ${p.at.slip.toFixed(1)}` : "0";
    }
    out.ground = [...new Set(a.map((x: any) => x.ground))].join(",");
    out.maxUsed = Math.max(...a.map((x: any) => x.used)).toFixed(2);
    out.maxSlip = Math.max(...a.map((x: any) => x.slip)).toFixed(1);
    return out;
  }, from);
  console.log(`== ${name}\n  ${JSON.stringify(r)}`);
  // (DUMP=1: the loud frames, a few)
  if (process.env.DUMP) {
    const rows = await page.evaluate((f) => {
      const a = (window as any).__sq.slice(f);
      return a
        .map((x: any, i: number) => ({ i, ...x }))
        .filter((x: any) => (window as any).__all || x.skid > 0.05 || x.held > 0.05 || x.squeak > 0.05)
        .filter((_: any, i: number, all: any[]) => i % Math.max(1, Math.floor(all.length / 14)) === 0)
        .map(
          (x: any) =>
            `    f${x.i} ${x.kmh.toFixed(0)} km/h used ${x.used.toFixed(2)} slip ${x.slip.toFixed(1)} ${x.ground} · held ${x.held.toFixed(2)} skid ${x.skid.toFixed(2)} squeak ${x.squeak.toFixed(2)} ${x.ctl ?? ""}`,
        );
    }, from);
    console.log(rows.join("\n"));
  }
};
// (each run from where it started: the car put back there, facing down the street)
// (out in the street — parked by the kerb, it drove along it half on the pavement: OUT_M=0 for that)
const home = await page.evaluate((k) => {
  const s = (window as any).__yutopia.cars.mine.sim;
  const q = s.q;
  const zx = 2 * (q.x * q.z + q.w * q.y);
  const zz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return { x: s.p.x + zx * k, y: s.p.y, z: s.p.z + zz * k, q: [q.x, q.y, q.z, q.w] };
}, Number(process.env.OUT_M ?? 3.5));
const back = () =>
  page.evaluate((h) => {
    const m = (window as any).__yutopia.cars.mine;
    m.drive.car.place(h.x, h.y + 0.05, h.z, h.q);
  }, home);
const run = async (name: string, f: () => Promise<void>) => {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  await stop();
  await back();
  await page.waitForTimeout(1500);
  const m = await mark();
  await f();
  await page.waitForTimeout(400);
  await report(name, m);
};
await run("tap W 0.3 s ×3", async () => {
  for (let i = 0; i < 3; i++) {
    await key("KeyW", 300);
    await page.waitForTimeout(1500);
  }
});
await run("car park: full lock D, W 0.25 s every 0.8 s", async () => {
  await page.keyboard.down("KeyD");
  for (let i = 0; i < 5; i++) {
    await key("KeyW", 250);
    await page.waitForTimeout(550);
  }
  await page.keyboard.up("KeyD");
});
await run("reverse tap S 0.4 s ×2", async () => {
  for (let i = 0; i < 2; i++) {
    await key("KeyS", 400);
    await page.waitForTimeout(1500);
  }
});
await run("pull away: W 1.5 s, coast", async () => {
  await key("KeyW", 1500);
  await page.waitForTimeout(1500);
});
await run("cruise: W 4 s, coast 2 s", async () => {
  await key("KeyW", 4000);
  await page.waitForTimeout(2000);
});
// (TURN=KeyA|KeyD, TURN_MS: the corner's way and how long)
const TURN = process.env.TURN ?? "KeyD";
const TURN_MS = Number(process.env.TURN_MS ?? 1200);
await run(`corner: W 3.5 s, then ${TURN} ${TURN_MS} ms`, async () => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3500);
  await page.keyboard.up("KeyW");
  await key(TURN, TURN_MS);
});
await run("brake: W 3.5 s, S till stopped", async () => {
  await key("KeyW", 3500);
  await key("KeyS", 2500);
});
await run("hard launch: W 2.5 s", async () => {
  await key("KeyW", 2500);
});
await run(`handbrake turn: W 3.5 s, ${TURN} + Space 1.5 s`, async () => {
  await key("KeyW", 3500);
  await page.keyboard.down(TURN);
  await key("Space", 1500);
  await page.keyboard.up(TURN);
});
await stop();
await browser.close();
