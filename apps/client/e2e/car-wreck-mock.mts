// (plan 94 phase 0) The wreck's and the fire's mocks, made in the game on Main Street's town car at night: wrecked (a door
// hanging, the bonnet gone, dents, glass, lamps), on fire, the blast's frame, the burnt-out wreck. Stills by an own
// camera to design/car-wreck (OUT=dir to override).
//   node --experimental-strip-types e2e/car-wreck-mock.mts [url]
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

const out = process.env.OUT ?? "../../design/car-wreck";
await page.evaluate(() => (window as any).__yutopia.room.send("mod:hour", { h: 21 }));
const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x + Math.cos(q.a) * 7, y: q.z + Math.sin(q.a) * 7 + 3, level: 0 }), pp);
await page.waitForFunction((id) => (window as any).__yutopia.cars.parked.get(id)?.full?.ready && (window as any).__yutopia.cars.parked.get(id)?.level === "near", car.id, { timeout: 30000 });
await page.waitForTimeout(3000);
// the mocks' own: a glow texture, flames, smoke — on the page
await page.evaluate((id) => {
  const W = window as any;
  const C = W.__yutopia.cars;
  const p = C.parked.get(id);
  const f = p.full;
  const T = f.root.constructor; // (Group: three's classes reached through the scene's objects)
  W.__mock = { C, p, f };
}, car.id);
const still = async (name: string, mode: "front" | "side") => {
  const url = await page.evaluate((m) => {
    const W = window as any;
    const { p, f } = W.__mock;
    const y = W.__yutopia;
    const V = f.root.position.constructor;
    f.root.updateMatrixWorld(true);
    const c = f.root.localToWorld(new V(0, 0.7, 0));
    const a = p.pose.a;
    // (the model's nose is −x: its world forward from the root's turn)
    const fw = f.root.localToWorld(new V(-1, 0.7, 0)).sub(c).normalize();
    const side = new V(-fw.z, 0, fw.x);
    const cam = y.tp.camera.clone();
    cam.fov = 42;
    cam.updateProjectionMatrix();
    const k = m === "front" ? [4.2, 3.2] : [1.2, 5.6];
    cam.position.copy(c).addScaledVector(fw, k[0]).addScaledVector(side, k[1]);
    cam.position.y += 1.2;
    cam.lookAt(c);
    void a;
    y.tp.renderer.render(y.tp.scene, cam);
    return y.tp.renderer.domElement.toDataURL("image/png");
  }, mode);
  const fs = await import("node:fs");
  fs.writeFileSync(`${out}/${name}`, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", name);
};
await still("0-as-it-is.png", "front");
// A — wrecked: dents deep, the bumper gone, lamps out, the windscreen badly cracked, the left side's glass gone,
// the driver's door hanging on its lower hinge, the bonnet off and lying in front
await page.evaluate(() => {
  const W = window as any;
  const { f } = W.__mock;
  const P = { bumperGone: 2, bumperHang: 1, mirrorL: 4, headL: 16, headR: 32, screen: 256, screenBad: 512, sideL: 1024 };
  const bits = P.bumperGone | P.bumperHang | P.mirrorL | P.headL | P.headR | P.screen | P.screenBad | P.sideL;
  f.setWear(0.55, [1, 0.4, 1, 0.35, 0.55], bits);
  f.setParts?.(bits);
  const fix = (o: any) => {
    o.updateMatrix();
    o.updateMatrixWorld(true);
  };
  const door = f.doors.find((d: any) => d.front && d.side === 1) ?? f.doors[0];
  door.group.rotation.y = door.side * 0.55;
  door.group.rotation.x = 0.32;
  door.group.position.y -= 0.12;
  fix(door.group);
  const bon = f.parts.get("bonnet");
  if (bon) {
    W.__mock.bonnetAt = bon.anim.position.clone();
    bon.anim.position.y -= 0.55;
    bon.anim.position.x -= 1.4;
    bon.anim.rotation.z = 0.9;
    bon.anim.rotation.x = 0.25;
    fix(bon.anim);
  }
});
await page.waitForTimeout(600);
await still("1-wrecked.png", "front");
await still("1b-wrecked-side.png", "side");
// B — on fire: flames out of the engine bay (teardrop sprites, normal blending: no blown-out glow), their light,
// a black smoke column
await page.evaluate(() => {
  const W = window as any;
  const { C, f } = W.__mock;
  const S = W.__yutopia.tp.scene;
  const puff = C.spray.puffs[0].s;
  const Sprite = puff.constructor;
  const SM = puff.material.constructor;
  const Tex = puff.material.map.constructor;
  const flame = (core: string, mid: string) => {
    // (a flame's tongue made of many small soft blobs, jittered up a wavering line: turbulent, not a shape)
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 128;
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const t = Math.random();
      const y = 124 - t * 116;
      const x = 32 + Math.sin(t * 7 + Math.random()) * 10 * t + (Math.random() - 0.5) * 18 * (1 - t * 0.6);
      const r = (1 - t) * 16 + 4;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, t < 0.35 ? core : mid);
      gr.addColorStop(1, "rgba(120,20,0,0)");
      g.globalAlpha = 0.18 + (1 - t) * 0.25;
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return new Tex(cv);
  };
  const tA = flame("rgba(255,236,170,1)", "rgba(255,140,30,0.9)");
  const tB = flame("rgba(255,200,90,0.95)", "rgba(230,80,10,0.8)");
  const V = f.root.position.constructor;
  W.__mock.fire = [];
  for (let i = 0; i < 40; i++) {
    const m = new SM({ map: i % 3 ? tB : tA, transparent: true, depthWrite: false, opacity: 0.9, rotation: (Math.random() - 0.5) * 0.3 });
    const s = new Sprite(m);
    const at = f.root.localToWorld(new V(-1.1 + (Math.random() - 0.5) * 1.0, 0.75 + Math.random() * 0.35, (Math.random() - 0.5) * 1.0));
    const k = 0.25 + Math.random() * 0.35;
    s.scale.set(k, k * 2.2, 1);
    s.position.copy(at);
    s.position.y += k * 0.9;
    S.add(s);
    W.__mock.fire.push(s);
  }
  const pt = W.__yutopia.tp.pool?.[0]?.clone?.();
  if (pt) {
    pt.color.setHex(0xff8a3a);
    pt.intensity = 6;
    pt.distance = 12;
    pt.visible = true;
    pt.position.copy(f.root.localToWorld(new V(-1.2, 1.6, 0)));
    S.add(pt);
    W.__mock.light = pt;
  }
  const P = C.root.worldToLocal(f.root.localToWorld(new V(-1.0, 2.0, 0)));
  for (let i = 0; i < 22; i++)
    C.spray.puff(P.x + (Math.random() - 0.5) * 0.8, P.y + i * 0.28, P.z + (Math.random() - 0.5) * 0.8, 0.15, 0.6, 0, 3 + i * 0.2, 6, 0x0e0d0c, 0.95);
});
await page.waitForTimeout(700);
await still("2-on-fire.png", "front");
// C — the blast's frame: a fireball going smoky at its edge, its light, the bonnet thrown up, bits flying
await page.evaluate(() => {
  const W = window as any;
  const { C, f } = W.__mock;
  const S = W.__yutopia.tp.scene;
  const puff = C.spray.puffs[0].s;
  const Sprite = puff.constructor;
  const SM = puff.material.constructor;
  const Tex = puff.material.map.constructor;
  // (a cloud's puff: a lumpy soft blob)
  const cloud = (inner: string, outer: string) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d") as CanvasRenderingContext2D;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 34;
      const x = 64 + Math.cos(a) * d;
      const y = 64 + Math.sin(a) * d;
      const r = 14 + Math.random() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, inner);
      gr.addColorStop(0.6, outer);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.35;
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return new Tex(cv);
  };
  const hot = cloud("rgba(255,240,190,1)", "rgba(255,120,20,0.8)");
  const warm = cloud("rgba(255,150,40,1)", "rgba(140,40,10,0.8)");
  const smoke = cloud("rgba(60,52,46,1)", "rgba(25,22,20,0.8)");
  const V = f.root.position.constructor;
  for (const s of W.__mock.fire) s.visible = false;
  W.__mock.ball = [];
  const C0 = f.root.localToWorld(new V(-0.9, 1.3, 0));
  for (let i = 0; i < 46; i++) {
    const r = Math.random();
    const map = r < 0.3 ? hot : r < 0.7 ? warm : smoke;
    const s = new Sprite(new SM({ map, transparent: true, depthWrite: false, opacity: 0.95, rotation: Math.random() * 6 }));
    // (hot in the heart, smoke on the outside and above)
    const out = map === smoke ? 1.6 + Math.random() * 1.2 : map === warm ? 0.8 + Math.random() * 0.9 : Math.random() * 0.7;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random();
    const k = map === smoke ? 1.8 + Math.random() * 1.4 : 1.1 + Math.random() * 1.1;
    s.scale.set(k, k, 1);
    s.position.set(C0.x + Math.cos(a) * out, C0.y + up * 1.6 + (map === smoke ? 1.0 : 0), C0.z + Math.sin(a) * out);
    s.renderOrder = map === smoke ? 1 : map === warm ? 2 : 3;
    S.add(s);
    W.__mock.ball.push(s);
  }
  if (W.__mock.light) {
    W.__mock.light.intensity = 30;
    W.__mock.light.distance = 25;
  }
  const bon = f.parts.get("bonnet");
  if (bon) {
    bon.anim.position.y += 3.6;
    bon.anim.position.x += 0.4;
    bon.anim.rotation.z = 2.4;
    bon.anim.updateMatrix();
    bon.anim.updateMatrixWorld(true);
  }
});
await page.waitForTimeout(120);
await still("3-blast.png", "front");
// D — burnt out: the paint charred, the glass gone, the tyres burnt, a thin smoke
await page.evaluate(() => {
  const W = window as any;
  const { f } = W.__mock;
  const S = W.__yutopia.tp.scene;
  for (const s of W.__mock.fire) S.remove(s);
  for (const s of W.__mock.ball ?? []) S.remove(s);
  if (W.__mock.light) S.remove(W.__mock.light);
  // (the bonnet back down where it fell: on the road in front, burnt with it)
  const bon = f.parts.get("bonnet");
  if (bon) {
    bon.anim.position.y -= 3.9;
    bon.anim.position.x -= 1.6;
    bon.anim.rotation.set(0.12, 0.5, 0.15);
    bon.anim.updateMatrix();
    bon.anim.updateMatrixWorld(true);
  }
  f.root.traverse((o: any) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      const n = (m.name ?? "") as string;
      if (/glass|lens|emit|tyre|tire|rubber/.test(n)) {
        o.visible = false;
        continue;
      }
      if (!m.userData.__burnt) {
        m.userData.__burnt = true;
        // (all of it charred: the paint near black, here and there a rust; the metal of the wheels dark)
        if (m.color) m.color.lerp(new m.color.constructor(/paint/.test(n) ? 0x1a1512 : 0x121110), 0.95);
        if (m.vertexColors) m.vertexColors = false;
        if (m.map) m.map = null;
        if (m.roughness !== undefined) m.roughness = 1;
        if (m.metalness !== undefined) m.metalness = 0.15;
        if (m.emissive) m.emissive.setHex(0);
        m.needsUpdate = true;
      }
    }
  });
});
await page.waitForTimeout(800);
await still("4-burnt-out.png", "front");
await still("4b-burnt-out-side.png", "side");
await browser.close();
