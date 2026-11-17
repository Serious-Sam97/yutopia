// (plan 95 phase 0) Where a shot lands: points on Main Street's first town car's real model (the bonnet from the
// front and the side, the windscreen, the front door's skin, its side window, the front tyre, the roof, the boot
// lid) found by casting onto its meshes; Ana's revolver aimed at each from standing height; what the server says it
// struck and where (its box's point), against the mesh's point and part; and where the hole was drawn.
//   node --experimental-strip-types e2e/car-aim.mts [url]
// (the same car each run: `mod:cars` puts it home first — run one at a time)
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


const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, car.id);
const fwd = [Math.cos(pp.a), Math.sin(pp.a)];
const right = [-Math.sin(pp.a), Math.cos(pp.a)];
const P = (u: number, w: number) => ({ x: pp.x + fwd[0] * u + right[0] * w, y: pp.z + fwd[1] * u + right[1] * w });
await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(-0.3, 5.5));
await page.waitForTimeout(3000);
const heard: any[] = [];
await page.exposeFunction("__carShot", (m: any) => heard.push(m));
await page.evaluate(() => {
  const y = (window as any).__yutopia;
  y.room.onMessage("car:shot", (m: any) => (window as any).__carShot(m));
  y.room.send("mod:hour", { h: 12 });
  y.room.send("mod:dark", { mode: "peaceful" });
  y.room.send("mod:refill", { kit: true });
});
await page.waitForTimeout(1500);
await page.keyboard.press("Digit2");
await page.waitForFunction(() => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).gun === "revolver", null, { timeout: 10000 });
await page.mouse.move(720, 450);
// (a ray against the model's meshes, in the page: its nearest triangle — the point, the material, the mesh)
await page.evaluate(() => {
  (window as any).__cast = (root: any, o: number[], d: number[]) => {
    let best: any = null;
    root.updateMatrixWorld(true);
    root.traverse((m: any) => {
      if (!m.isMesh || !m.visible) return;
      let v = m;
      let shown = true;
      while (v) {
        if (v.visible === false) shown = false;
        v = v.parent;
      }
      if (!shown) return;
      const g = m.geometry;
      const pos = g.getAttribute("position");
      if (!pos) return;
      const idx = g.index;
      const e = m.matrixWorld.elements;
      const tw = (i: number) => {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
      };
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < n; t += 3) {
        const a = tw(idx ? idx.getX(t) : t);
        const b = tw(idx ? idx.getX(t + 1) : t + 1);
        const c = tw(idx ? idx.getX(t + 2) : t + 2);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const tv = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
        const uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
        if (uu < 0 || uu > 1) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
        if (vv < 0 || uu + vv > 1) continue;
        const dist = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
        if (dist <= 0.001 || (best && dist >= best.t)) continue;
        let mat = m.material;
        if (Array.isArray(mat)) {
          const gr = g.groups.find((x: any) => t >= x.start && t < x.start + x.count);
          mat = mat[gr?.materialIndex ?? 0];
        }
        let part = "";
        let q = m;
        while (q && !part) {
          if (/door|bonnet|boot|bumper|mirror|wheel|tyre|hood|trunk/i.test(q.name ?? "")) part = q.name;
          q = q.parent;
        }
        best = { t: dist, p: [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist], mat: mat?.name ?? "", mesh: m.name, part, hole: !!m.isInstancedMesh };
      }
    });
    return best;
  };
});
// a point on the model (the car's own u forward, w right, h up from the ground): cast down from above, in from its
// right side, from ahead or behind — the three view's frame (y up)
const onMesh = (how: string, u: number, w: number, h: number) =>
  page.evaluate(
    ([id, how, u, w, h]) => {
      const y = (window as any).__yutopia;
      const L = y.cars.parked.get(id);
      const m = L?.full;
      if (!m) return null;
      const pp = L.pose;
      const c = Math.cos(pp.a);
      const s = Math.sin(pp.a);
      // server x, y (ground) = three x, z
      const at = (uu: number, ww: number, hh: number) => [pp.x + c * uu - s * ww, pp.y + hh, pp.z + s * uu + c * ww];
      const dirOf = (du: number, dw: number, dh: number) => [c * du - s * dw, dh, s * du + c * dw];
      const [o, d] =
        how === "top"
          ? [at(u as number, w as number, 4), [0, -1, 0]]
          : how === "side"
            ? [at(u as number, 3, h as number), dirOf(0, -1, 0)]
            : how === "front"
              ? [at(5, w as number, h as number), dirOf(-1, 0, 0)]
              : [at(-5, w as number, h as number), dirOf(1, 0, 0)];
      return (window as any).__cast(m.root, o, d);
    },
    [car.id, how, u, w, h] as const,
  );
// fire at a three-frame point from where Ana stands; what the server said; where the newest hole went
const fire = async (name: string, target: number[]) => {
  const n0 = heard.length;
  if (process.env.REAL) {
    await fireReal(name, target);
    // (the cylinder empty: a reload, then again)
    if (heard.length === n0) {
      await page.evaluate(() => (window as any).__yutopia.room.send("mod:refill", { kit: true }));
      await page.keyboard.press("KeyR");
      await page.waitForTimeout(3500);
      await fireReal(name, target);
    }
  }
  else {
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(900);
  await page.evaluate((t) => {
    const y = (window as any).__yutopia;
    const me = y.room.state.players.get(y.room.sessionId);
    const oz = me.z + 1.35;
    // (three: x, y up, z → the server's x, y, z up)
    const tx = t[0];
    const ty = t[2];
    const tz = t[1];
    const d = Math.hypot(tx - me.x, ty - me.y);
    y.room.send("arms:fire", { ox: me.x, oy: me.y, oz, yaw: Math.atan2(ty - me.y, tx - me.x), pitch: Math.atan2(tz - oz, d), lag: 0, seed: 7 });
  }, target);
  await page.waitForTimeout(1000);
  await page.mouse.up({ button: "right" });
  }
  const all = heard.slice(n0).flatMap((m) => m.hits ?? []);
  const hit = all.find((h: any) => h.id === car.id) ?? null;
  if (!hit) console.log(`    (heard ${heard.length - n0} shot messages: ${JSON.stringify(all)})`);
  const st = await page.evaluate(
    ([id, t]) => {
      const y = (window as any).__yutopia;
      const L = y.cars.parked.get(id);
      const m = L?.full;
      // the holes drawn: each instance's place, the nearest to the aim
      let near = 99;
      let n = 0;
      m?.root.updateMatrixWorld(true);
      m?.root.traverse((o: any) => {
        if (!o.isInstancedMesh || o.count === 0 || !o.userData.mark) return;
        const e = new Float32Array(16);
        for (let i = 0; i < o.count; i++) {
          o.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v: number, k: number) => (e[k] = v));
          const x = e[12];
          const yy = e[13];
          const z = e[14];
          const w = o.matrixWorld.elements;
          const wx = w[0] * x + w[4] * yy + w[8] * z + w[12];
          const wy = w[1] * x + w[5] * yy + w[9] * z + w[13];
          const wz = w[2] * x + w[6] * yy + w[10] * z + w[14];
          n++;
          near = Math.min(near, Math.hypot(wx - t[0], wy - t[1], wz - t[2]));
        }
      });
      const props = JSON.parse(y.room.state.objects.get(id).props);
      return { holesProp: (props.holes ?? "").split(";").filter(Boolean).length, holeMarks: n, nearestMark: near, dmg: props.dmg ?? "" };
    },
    [car.id, target] as const,
  );
  const off = hit ? Math.hypot(hit.x - target[0], hit.y - target[2], hit.z - target[1]) : -1;
  if (process.env.WRECK) {
    const d = String(st.dmg).split("|");
    console.log(`    wreck ${d[2] ?? 0} parts ${d[1] ?? 0}`);
  }
  // (DEPTH=1, plan 96 phase 0: each hole's middle against the skin under it now — + : the skin's over it, buried)
  if (process.env.DEPTH)
    console.log(
      "    hole depths:",
      JSON.stringify(
        await page.evaluate((id) => {
          const y = (window as any).__yutopia;
          const m = y.cars.parked.get(id)?.full;
          if (!m) return null;
          const C = y.cars;
          const V = m.root.position.constructor;
          const skins: any[] = [];
          m.root.traverseVisible((o: any) => {
            if (o.isMesh && !o.isInstancedMesh) skins.push(o);
          });
          m.root.updateMatrixWorld(true);
          const out: number[] = [];
          m.root.traverse((o: any) => {
            if (!o.isInstancedMesh || !o.userData.mark) return;
            const M = new (o.matrixWorld.constructor)();
            for (let i = 0; i < o.count; i++) {
              o.getMatrixAt(i, M);
              M.premultiply(o.matrixWorld);
              const H = new V().setFromMatrixPosition(M);
              const N = new V(M.elements[8], M.elements[9], M.elements[10]).normalize();
              C.rc.set(H.clone().addScaledVector(N, 0.3), N.clone().negate());
              C.rc.far = 0.6;
              const hit = C.rc.intersectObjects(skins, false)[0];
              out.push(hit ? +(hit.point.clone().sub(H).dot(N) * 1000).toFixed(1) : 999);
            }
          });
          return out;
        }, car.id),
      ),
      "(mm)",
    );
  console.log(
    `  ${name}: server struck ${hit?.struck ?? "nothing"} face ${hit?.face ?? "-"} · its point ${off.toFixed(2)} m from the aim · holes ${st.holesProp} kept, ${st.holeMarks} drawn, nearest mark ${st.nearestMark.toFixed(2)} m from the aim · dmg ${st.dmg}`,
  );
};
// (REAL=1: the game's own shot — the camera turned till the crosshair's on the point, the right button held,
// a click: the client's ray test on the model goes with it, plan 95 F4a)
const fireReal = async (name: string, target: number[]) => {
  const n0 = heard.length;
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(700);
  // (the camera's look: three's −z, x up z → toward the target, corrected a few times)
  for (let k = 0; k < 14; k++) {
    const e = await page.evaluate((t) => {
      const y = (window as any).__yutopia;
      const c = y.tp.camera;
      c.updateMatrixWorld();
      const m = c.matrixWorld.elements;
      const d = [-m[8], -m[9], -m[10]];
      const p = c.position;
      const v = [t[0] - p.x, t[1] - p.y, t[2] - p.z];
      const L = Math.hypot(v[0], v[1], v[2]);
      const yawNow = Math.atan2(d[2], d[0]);
      const yawWant = Math.atan2(v[2], v[0]);
      const pitNow = Math.asin(d[1]);
      const pitWant = Math.asin(v[1] / L);
      let dy = yawWant - yawNow;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      return { dy, dp: pitWant - pitNow, yaw: y.tp.yaw, pitch: y.tp.pitch };
    }, target);
    if (process.env.DEBUG) console.log(`    aim ${k}: off ${e.dy.toFixed(4)}, ${e.dp.toFixed(4)} · tp ${e.yaw.toFixed(3)}, ${e.pitch.toFixed(3)}`);
    if (Math.abs(e.dy) < 0.002 && Math.abs(e.dp) < 0.002) break;
    // (tp.yaw turns the camera the other way round three's x→z; its pitch down is +)
    await page.evaluate(
      ([dy, dp]) => {
        const y = (window as any).__yutopia;
        y.tp.yaw += dy;
        y.tp.pitch -= dp;
      },
      [e.dy, e.dp] as const,
    );
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  if (process.env.DEBUG)
    console.log(
      "    before the click:",
      JSON.stringify(
        await page.evaluate(() => {
          const y = (window as any).__yutopia;
          const me = y.room.state.players.get(y.room.sessionId);
          return { gun: me.gun, mv: me.mv, hud: (window as any).__hud.get().gun ?? null };
        }),
      ),
    );
  await page.mouse.down({ button: "left" });
  await page.waitForTimeout(60);
  await page.mouse.up({ button: "left" });
  // (SNAP=dir: a still straight after the shot)
  if (process.env.SNAP) await page.screenshot({ path: `${process.env.SNAP}/shot-${name.replace(/[^a-z]+/gi, "-")}.png` });
  await page.waitForTimeout(1000);
  await page.mouse.up({ button: "right" });
  return n0;
};
const stand = async (u: number, w: number) => {
  await page.evaluate((q) => (window as any).__yutopia.teleport({ x: q.x, y: q.y, level: 0 }), P(u, w));
  await page.waitForTimeout(2200);
};
const targets: [string, string, number, number, number, [number, number]][] = [
  ["bonnet, from ahead and to the right", "top", 1.55, 0.1, 0, [5.5, 2.5]],
  ["bonnet, from the side", "top", 1.45, 0.3, 0, [1.4, 5.5]],
  ["windscreen, from ahead", "front", 0, 0, 1.2, [6.5, 0.4]],
  ["front door's skin, from the side", "side", -0.2, 0, 0.75, [-0.2, 5.5]],
  ["front side window, from the side", "side", -0.3, 0, 1.15, [-0.3, 5.5]],
  ["roof, from the side", "top", -0.6, 0.2, 0, [-0.6, 5]],
  ["front tyre, from the side", "side", 1.33, 0, 0.3, [1.4, 5]],
  ["boot lid, from behind and to the right", "top", -2.0, 0, 0, [-4.8, 3.2]],
];
// (GLASS=1, plan 95 F5a: four rounds into its windscreen — stars, still in —, one into its front side window — a
// crack from there —, stills; a fifth into the windscreen — in —, a still of it falling)
if (process.env.GLASS) {
  targets.length = 0;
  for (const w of [-0.45, -0.15, 0.2, 0.42]) targets.push([`windscreen at ${w}`, "front", 0, w, 1.15, [6.5, 0.4]]);
  targets.push(["front side window", "side", -0.3, 0, 1.12, [-0.3, 5.5]]);
}
// (REPEAT=n: the targets n times over)
for (let k = 1; k < Number(process.env.REPEAT ?? 1); k++) targets.push(...targets.slice(0, targets.length / k));
// (FLATREC=1, plan 96 F5a: the blowout — its front right wheel's flat as far as it's gone and the body's drop,
// every frame in the page from its first)
if (process.env.FLATREC)
  await page.evaluate((id) => {
    const W = window as any;
    const C = W.__yutopia.cars;
    W.__flat = [];
    let t0 = 0;
    const tick = () => {
      const m = C.parked.get(id)?.full;
      const k = m?.flatK?.[1] ?? 0;
      if (!t0 && k > 0) t0 = performance.now();
      if (t0) W.__flat.push([(performance.now() - t0) / 1000, k, m.body.position.y, m.flatU.hub.value[1].w]);
      if (!t0 || performance.now() - t0 < 1500) requestAnimationFrame(tick);
    };
    tick();
  }, car.id);
for (const [name, how, u, w, h, at] of targets) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) continue;
  const t = await onMesh(how, u, w, h);
  if (!t) {
    console.log(`  ${name}: no mesh there`);
    continue;
  }
  console.log(`${name} — the model there: ${t.mat} (${t.part || t.mesh})`);
  await stand(at[0], at[1]);
  await fire(name, t.p);
}
// (OUT=dir: stills — the camera from where Ana stands, turned to a point of the car)
const look = async (file: string, at: [number, number], u: number, w: number, h: number, pitch = 0.1) => {
  await stand(at[0], at[1]);
  await page.evaluate(
    async ([q, pitch]) => {
      const y = (window as any).__yutopia;
      const V = y.tp.camera.position.constructor;
      let best = { yaw: 0, off: 9 };
      for (let i = 0; i < 36; i++) {
        const yaw = -Math.PI + (i / 36) * 2 * Math.PI;
        y.tp.yaw = yaw;
        await new Promise((r) => setTimeout(r, 80));
        const p = new V(q.x, q.h, q.z).project(y.tp.camera);
        if (p.z < 1 && Math.abs(p.x) < best.off) best = { yaw, off: Math.abs(p.x) };
      }
      y.tp.yaw = best.yaw;
      y.tp.pitch = pitch;
    },
    [
      (() => {
        const c = Math.cos(pp.a);
        const sn = Math.sin(pp.a);
        return { x: pp.x + c * u - sn * w, z: pp.z + sn * u + c * w, h: pp.y + h };
      })(),
      pitch,
    ] as const,
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${process.env.OUT}/${file}` });
};
if (process.env.FLATREC) {
  await page.waitForTimeout(1600);
  const f = (await page.evaluate(() => (window as any).__flat)) as number[][];
  const full = f.find((r) => r[1] >= 0.999);
  const most = f.reduce((a, r) => (r[1] > a[1] ? r : a), [0, 0, 0, 0]);
  const half = f.find((r) => r[1] >= 0.5);
  console.log(
    `the blowout: ${f.length} frames · half down at ${half ? half[0].toFixed(2) : "-"} s · deepest ${most[1].toFixed(2)} (the dip) at ${most[0].toFixed(2)} s, body ${(most[2] * 100).toFixed(1)} cm · settled at ${full ? full[0].toFixed(2) : "-"} s → ${f.length ? f[f.length - 1][1].toFixed(2) : "-"}, body ${f.length ? (f[f.length - 1][2] * 100).toFixed(1) : "-"} cm, squash ${f.length ? (f[f.length - 1][3] * 100).toFixed(1) : "-"} cm`,
  );
}
if (process.env.OUT && process.env.GLASS) {
  await look("glass-stars.png", [4.2, 0.8], 0.6, 0, 1.0, 0.0);
  await look("glass-side-crack.png", [-0.3, 3.4], -0.3, 0.8, 1.0, 0.0);
  // (the fifth: in)
  const t = await onMesh("front", 0, 0.05, 1.2);
  if (t) {
    await stand(6.5, 0.4);
    await fire("windscreen, the fifth", t.p);
    await page.waitForTimeout(120);
    await look("glass-in.png", [4.2, 0.8], 0.6, 0, 1.0, 0.0);
  }
}
// (a close still: stood there, the camera turned onto the point, a narrow lens)
const closeUp = async (file: string, at: [number, number], target: number[], fov = 22) => {
  await stand(at[0], at[1]);
  for (let k = 0; k < 14; k++) {
    const e = await page.evaluate((t) => {
      const y = (window as any).__yutopia;
      const c = y.tp.camera;
      c.updateMatrixWorld();
      const m = c.matrixWorld.elements;
      const d = [-m[8], -m[9], -m[10]];
      const p = c.position;
      const v = [t[0] - p.x, t[1] - p.y, t[2] - p.z];
      const L = Math.hypot(v[0], v[1], v[2]);
      let dy = Math.atan2(v[2], v[0]) - Math.atan2(d[2], d[0]);
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      return { dy, dp: Math.asin(v[1] / L) - Math.asin(d[1]) };
    }, target);
    if (Math.abs(e.dy) < 0.002 && Math.abs(e.dp) < 0.002) break;
    await page.evaluate(([dy, dp]) => {
      const y = (window as any).__yutopia;
      y.tp.yaw += dy;
      y.tp.pitch -= dp;
    }, [e.dy, e.dp] as const);
    await page.waitForTimeout(120);
  }
  // (held each frame: the game sets its lens as it goes)
  await page.evaluate((f) => {
    const W = window as any;
    const c = W.__yutopia.tp.camera;
    W.__lens = true;
    const hold = () => {
      if (!W.__lens) return;
      if (c.fov !== f) {
        c.fov = f;
        c.updateProjectionMatrix();
      }
      requestAnimationFrame(hold);
    };
    hold();
  }, fov);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.OUT}/${file}` });
  await page.evaluate(() => ((window as any).__lens = false));
};
if (process.env.OUT && !process.env.GLASS) {
  console.log(
    "flat state:",
    JSON.stringify(
      await page.evaluate((id) => {
        const m = (window as any).__yutopia.cars.parked.get(id)?.full;
        if (!m) return null;
        return {
          flatY: m.flatY.map((x: number) => +x.toFixed(3)),
          body: [m.body.rotation.x, m.body.rotation.z, m.body.position.y].map((x: number) => +x.toFixed(4)),
          hubs: m.flatU.hub.value.map((h: any) => +h.w.toFixed(2)),
          tyre: !!m.tyreMat,
          wheelY: m.wheels.map((w: any) => +(w.steer.position.y - w.rest.y).toFixed(3)),
        };
      }, car.id),
    ),
  );
  // (plan 96 F3a: the marks close — on its bonnet, on its door)
  const bon = await onMesh("top", 1.45, 0.2, 0);
  if (bon) await closeUp("marks-bonnet.png", [4.2, 2.2], bon.p, 24);
  const door = await onMesh("side", -0.2, 0, 0.75);
  if (door) await closeUp("marks-door.png", [-0.2, 3.2], door.p, 24);
  const wheel = await onMesh("side", 1.33, 0, 0.3);
  if (wheel) {
    await closeUp("flat-close-side.png", [1.3, 3.6], wheel.p);
    await closeUp("flat-close-ahead.png", [5, 2.2], wheel.p);
  }
  await look("flat-side.png", [1.6, 3.2], 1.33, 0.8, 0.3, -0.05);
  await look("flat-ahead.png", [4.2, 1.6], 1.33, 0.8, 0.3, -0.05);
  await look("shots-front.png", [5.5, 1.5], 1.0, 0, 0.9, 0.05);
}
if (!process.env.KEEP) await page.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
await page.waitForTimeout(500);
await browser.close();
