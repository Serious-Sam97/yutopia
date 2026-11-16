// (plan 93 S7) Mending and the tow rope: Ana given a wrench and a tow rope; Main Street's town car knocked about
// (driven a moment, its wear told: the engine dead, a lamp, a flat) and left; at its bonnet the prompt, bent over
// it, the bonnet up — the engine, then the lamps; at its back left wheel the spare; a tow rope from its back to the
// car behind it, drawn; stills (OUT=dir).
//   OUT=dir node --experimental-strip-types e2e/car-mend.mts [url]
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
let shown = 0;
page.on("pageerror", (e) => {
  if (shown++ < 2) console.log("  page:", e.message, (e.stack ?? "").split("\n").slice(0, 6).join(" / "));
});
page.on("console", (m) => m.type() === "error" && console.log("  console:", m.text().slice(0, 300)));
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

const out = process.env.OUT ?? "/tmp";
const pp0 = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
const spec = await page.evaluate((id) => {
  const s = (window as any).__yutopia.cars.parked.get(id)?.spec;
  return { front: s.front, wheelbase: s.wheelbase, track: s.track, width: s.body.width, ahead: s.body.ahead, behind: s.body.behind };
}, car.id);
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.send("mod:refill", { tools: true });
  y.room.send("mod:hour", { h: 12 });
});
const atCar = (P: any, u: number, w: number) => ({
  x: P.x + Math.cos(P.a) * u - Math.sin(P.a) * w,
  y: P.z + Math.sin(P.a) * u + Math.cos(P.a) * w,
});
const go = async (q: { x: number; y: number }, ms = 2000) => {
  await page.evaluate((v) => (window as any).__yutopia.teleport({ x: v.x, y: v.y, level: 0 }), q);
  await page.waitForTimeout(ms);
};
const busy = () => page.evaluate(() => { const y = (window as any).__yutopia; return y.room.state.players.get(y.room.sessionId).busy; });
const enter = async (id: string) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate((v) => (window as any).__yutopia.room.send("car:enter", { id: v, seat: 0 }), id);
    await page.waitForTimeout(2500);
    if ((await busy()).startsWith("drive:")) return true;
  }
  return false;
};
const leave = async () => {
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => (window as any).__yutopia.room.send("car:leave", {}));
    await page.waitForTimeout(1200);
    if ((await busy()) === "") return true;
  }
  return false;
};
// knocked about: in, its wear told, out
await go(atCar(pp0, 0.3, -(spec.width / 2 + 0.8)), 2500);
console.log("in:", await enter(car.id));
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  const parts = 65536 | 16 | 16384;
  y.room.send("car:wear", { grime: 0, dmg: [0.5, 0, 0, 0.3, 0], parts });
  setTimeout(() => y.room.send("car:wear", { grime: 0, dmg: [0.95, 0, 0, 0.3, 0], parts }), 300);
});
await page.waitForTimeout(1200);
console.log("out:", await leave());
await page.waitForTimeout(2500);
const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
console.log("dmg:", await page.evaluate((id) => JSON.parse((window as any).__yutopia.room.state.objects.get(id).props).dmg, car.id));
const prompt = () => page.evaluate(() => (window as any).__hud.get().prompt);
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  (window as any).__nos = [];
  y.room.onMessage("car:no", (m: any) => (window as any).__nos.push(m.why));
});
const where = () => page.evaluate(() => { const y = (window as any).__yutopia; const p = y.room.state.players.get(y.room.sessionId); return { me: [+y.me.x.toFixed(2), +y.me.y.toFixed(2)], srv: [+p.x.toFixed(2), +p.y.toFixed(2)], nos: (window as any).__nos }; });
const mendHere = async (q: { x: number; y: number }, wait: number, still?: string) => {
  await go(q, 2200);
  console.log("  prompt:", JSON.stringify(await prompt()), JSON.stringify(await where()), JSON.stringify(q));
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(2200);
  const k = await page.evaluate(() => {
    const y = (window as any).__yutopia;
    return { work: y.tp.kneeling.get(y.room.sessionId), busy: y.room.state.players.get(y.room.sessionId).busy, label: (window as any).__hud.get().prompt?.label };
  });
  console.log("  at work:", JSON.stringify(k), JSON.stringify(await where()));
  if (still) await page.screenshot({ path: `${out}/${still}` });
  console.log(
    "  bonnet:",
    JSON.stringify(
      await page.evaluate((id) => {
        const C = (window as any).__yutopia.cars;
        const p = C.parked.get(id);
        const part = p?.full?.parts?.get("bonnet");
        return { anim: [...C.bonnets.entries()], level: p?.level, baked: p?.baked, part: part ? [part.anim.rotation.x, part.anim.rotation.y, part.anim.rotation.z].map((n: number) => +n.toFixed(2)) : "none" };
      }, car.id),
    ),
  );
  await page.waitForTimeout(wait);
  console.log("  after:", await page.evaluate((id) => JSON.parse((window as any).__yutopia.room.state.objects.get(id).props).dmg, car.id));
};
// at its bonnet (the camera behind her: her and the open bonnet from the side a little)
const nose = atCar(pp, spec.ahead + 0.45, 0);
await mendHere(nose, 9000, "mend-0-bonnet.png");
await mendHere(nose, 3000);
console.log("next:", JSON.stringify(await (async () => { await go(nose, 1500); return prompt(); })()));
// the flat at the back left
const rl = atCar(pp, -(spec.wheelbase - spec.front), -(spec.width / 2 + 0.45));
await mendHere(rl, 19500, "mend-1-tyre.png");
// a tow rope: the next car along (town-car-1) driven up behind town-car-2 and left there, then from town-car-2's
// back… no: from town-car-1's front to town-car-2's back — town-car-2 tows it
await page.waitForFunction(() => !!(window as any).__yutopia.cars.parked.get("town-car-1"), null, { timeout: 20000 });
const P1 = await page.evaluate(() => (window as any).__yutopia.cars.parked.get("town-car-1")?.pose ?? null);
await go(atCar(P1, 0.3, -(spec.width / 2 + 0.8)), 2500);
console.log("in 1:", await enter("town-car-1"));
await page.keyboard.down("KeyW");
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  const gap = await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine?.vid);
    const p2 = C.parked.get("town-car-2")?.pose;
    return l && p2 ? p2.x - l.pose.p.x : 99;
  });
  if (gap < 16.5) break;
}
await page.keyboard.up("KeyW");
// (braked to a stop — held S past it would back it up)
await page.keyboard.down("KeyS");
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  const v = await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    const l = C.live.get(C.mine?.vid);
    return l ? Math.hypot(l.pose.v.x, l.pose.v.z) : 0;
  });
  if (v < 0.3) break;
}
await page.keyboard.up("KeyS");
await page.waitForTimeout(800);
console.log("out 1:", await leave());
await page.waitForTimeout(3000);
const pair = await page.evaluate(() => {
  const C = (window as any).__yutopia.cars;
  const of = (id: string) => {
    const p = C.parked.get(id);
    return p && { id, pose: p.pose, ahead: p.spec.body.ahead, behind: p.spec.body.behind };
  };
  return { a: of("town-car-2"), b: of("town-car-1") };
});
console.log("pair:", JSON.stringify(pair && { a: pair.a?.pose, b: pair.b?.pose }));
if (pair?.a && pair.b) {
  await go(atCar(pair.a.pose, -(pair.a.behind + 0.35), 0.75));
  console.log("  back eye:", JSON.stringify(await prompt()), JSON.stringify(await where()));
  console.log(
    "  carry:",
    JSON.stringify(
      await page.evaluate(() => {
        const C = (window as any).__yutopia.cars;
        const d = (window as any).__dark;
        return { rope: C.host.items("towrope"), wrench: C.host.items("wrench"), pending: C.rope, inv: d?.inv && [...d.inv.pockets, ...d.inv.quick].map((x: any) => x?.id ?? null) };
      }),
    ),
  );
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(600);
  await go(atCar(pair.b.pose, pair.b.ahead + 0.35, 0.75));
  console.log("  its front eye:", JSON.stringify(await prompt()));
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(1500);
  console.log(
    "  tied:",
    await page.evaluate(([a, b]) => {
      const st = (window as any).__yutopia.room.state.objects;
      return [JSON.parse(st.get(a).props).towing, JSON.parse(st.get(b).props).towedBy];
    }, [pair.a.id, pair.b.id] as const),
  );
  // (the rope from the side, by an own camera: stood off between them, a little up)
  await page.waitForTimeout(800);
  const url = await page.evaluate(([a, b]) => {
    const y = (window as any).__yutopia;
    const C = y.cars;
    const pa = C.parked.get(a).pose;
    const pb = C.parked.get(b).pose;
    const cam = y.tp.camera.clone();
    const V = cam.position.constructor;
    const mid = new V((pa.x + pb.x) / 2, pa.y + 0.5, (pa.z + pb.z) / 2);
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const L = Math.hypot(dx, dz) || 1;
    // (the cars' group may sit off the world's origin)
    C.root.localToWorld(mid);
    cam.fov = 50;
    cam.updateProjectionMatrix();
    cam.position.set(mid.x - (dz / L) * 5.5, mid.y + 1.2, mid.z + (dx / L) * 5.5);
    cam.lookAt(mid);
    y.tp.renderer.render(y.tp.scene, cam);
    return y.tp.renderer.domElement.toDataURL("image/png");
  }, [pair.a.id, pair.b.id] as const);
  const fs = await import("node:fs");
  fs.writeFileSync(`${out}/mend-2-rope.png`, Buffer.from(url.split(",")[1], "base64"));
  // untied again: the rope back
  await go(atCar(pair.b.pose, pair.b.ahead + 0.35, 0.75));
  console.log("  untie:", JSON.stringify(await prompt()));
  await page.evaluate(() => (window as any).__yutopia.interact());
  await page.waitForTimeout(1200);
}
await browser.close();
