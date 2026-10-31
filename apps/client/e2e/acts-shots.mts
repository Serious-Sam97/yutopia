/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Stills of every interaction in the 3D world — sat on each kind of seat (and mid-sit-down), typing at
// a desk (with close-ups of the hands on the keys), at a computer stood, busy at each thing, holding
// and sipping a drink, in the park's seats, in a car as driver and as passenger — close, from the
// front three-quarters and from the side, for a look at what the character pass (plan 59: longer
// legs, the crotch higher, the head shorter) and the wardrobe (60–61) put out of place.
// Ana on the dev stack (:3100, :8100), the machine's GPU. What it puts out on her floor (acts-*) is
// removed after; the lot's cars are put back (`mod:cars`).
//   node --experimental-strip-types e2e/acts-shots.mts [out dir]        (ONLY=seats,desks,uses,held,park,car)
//   PROBE=<file.json> node --experimental-strip-types e2e/acts-shots.mts (the world's things, to a file)
import { writeFileSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";
import { KART_STANDS, kartSeats } from "../../../packages/shared/src/kart/park.ts";

const out = process.argv[2] ?? "../../design/acts/before";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const only = process.env.ONLY?.split(",");
const want = (k: string) => !only || only.includes(k);
const HOME = 4; // Ana's floor (the building's home floor)

async function token(email: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${api}/api/login`, {
    data: { email, password: pass },
    headers: { Accept: "application/json" },
  });
  return (await res.json()).token;
}
const ready = (p: Page) =>
  p.waitForFunction(
    () => {
      const h = (window as any).__hud?.get();
      return h?.phase === "ready" && h.loading?.on === false;
    },
    null,
    { timeout: 120_000 },
  );

// ── in the page: the body, a bone, where she faces, a still from a camera of our own ──
function install() {
  const W = window as any;
  const V = () => new W.__yutopia.tp.camera.position.constructor();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  W.__acts = {
    sleep,
    // mine on foot (the view's people), or in a car (the car's own rig)
    model() {
      const c = W.__yutopia;
      const p = c.tp.people3.get(c.room.sessionId);
      if (p) return p.model;
      for (const l of c.cars?.live?.values() ?? []) {
        const e = l.people.get(c.room.sessionId);
        if (e) return e.m;
      }
      return null;
    },
    bone(n: string) {
      const v = V();
      W.__acts.model().bone(n).getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    },
    face() {
      const m = W.__acts.model();
      m.root.updateMatrixWorld(true);
      const o = V();
      m.root.getWorldPosition(o);
      const f = V().set(0, 0, 1);
      m.root.localToWorld(f);
      return Math.atan2(f.z - o.z, f.x - o.x);
    },
    chest() {
      const h = W.__acts.bone("hips");
      const n = W.__acts.bone("neck");
      return { x: (h.x + n.x) / 2, y: (h.y + n.y) / 2, z: (h.z + n.z) / 2 };
    },
    hands() {
      const a = W.__acts.bone("wristL");
      const b = W.__acts.bone("wristR");
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    },
    // the first surface straight down at (x, z), from `from` (her own body and the people left out)
    down(x: number, z: number, from = 2.5) {
      const c = W.__yutopia;
      const tp = c.tp;
      const ray = tp.ray;
      const me = W.__acts.model()?.root;
      ray.set(V().set(x, from, z), V().set(0, -1, 0));
      ray.far = 10;
      ray.camera = tp.camera;
      // (meshes only, those drawn: sprites and lines want more than a ray)
      const meshes: any[] = [];
      const walk = (o: any) => {
        if (!o.visible) return;
        if (o.isMesh && !o.isInstancedMesh) meshes.push(o);
        for (const k of o.children) walk(k);
      };
      walk(tp.scene);
      const hits = ray.intersectObjects(meshes, false);
      for (const h of hits) {
        let o = h.object;
        let skip = !o.visible || !o.isMesh;
        while (o && !skip) {
          if (o === me || !o.visible) skip = true;
          o = o.parent;
        }
        for (const [, p] of tp.people3) if (!skip && isIn(h.object, p.root)) skip = true;
        if (!skip) return h.point.y;
      }
      return null;
      function isIn(o: any, root: any) {
        for (let q = o; q; q = q.parent) if (q === root) return true;
        return false;
      }
    },
    // a still: the camera `ang` rad round from where she faces (0: in front; −π/2 her left), `el` up,
    // `dist` from `at` (her chest by default). `clipY`: everything above that height cut away.
    shot(o: any) {
      const c = W.__yutopia;
      const tp = c.tp;
      const cam = tp.camera;
      const r = tp.renderer;
      const t = o.face ?? W.__acts.face();
      const at = { ...(o.at ?? (o.on === "hands" ? W.__acts.hands() : W.__acts.chest())) };
      if (o.up) at.y += o.up;
      if (o.fwd) {
        at.x += Math.cos(t) * o.fwd;
        at.z += Math.sin(t) * o.fwd;
      }
      const a = t + (o.ang ?? 0.6);
      const d = o.dist ?? 2.6;
      const el = o.el ?? 0.25;
      const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near };
      cam.position.set(
        at.x + Math.cos(a) * Math.cos(el) * d,
        at.y + Math.sin(el) * d,
        at.z + Math.sin(a) * Math.cos(el) * d,
      );
      cam.fov = o.fov ?? 50;
      cam.near = 0.05;
      cam.updateProjectionMatrix();
      cam.lookAt(at.x, at.y, at.z);
      cam.updateMatrixWorld();
      // (the others out of it: Vortex, the folk, anyone about)
      const hide: any[] = [];
      for (const [, p] of tp.people) if (p.root.visible) hide.push(p.root);
      for (const [id, p] of tp.people3) if (id !== c.room.sessionId && p.root.visible) hide.push(p.root);
      for (const h of hide) h.visible = false;
      if (o.clipY != null) r.clippingPlanes = [{ normal: V().set(0, -1, 0), constant: o.clipY }];
      const cv = tp.snapshot();
      r.clippingPlanes = [];
      for (const h of hide) h.visible = true;
      cam.position.copy(saved.p);
      cam.quaternion.copy(saved.q);
      cam.fov = saved.fov;
      cam.near = saved.near;
      cam.updateProjectionMatrix();
      return cv ? cv.toDataURL("image/png") : null;
    },
    // walked onto a seat: the still once she's half sat down
    async sitDown(seat: { x: number; y: number; id?: string }, view: any) {
      const c = W.__yutopia;
      // (as the action menu's Sit does: walked to in front of it — else straight onto it)
      if (seat.id) c.actions.add("sit", { type: "object", id: seat.id }, seat.id);
      else c.walkTo(seat);
      const t0 = performance.now();
      const trail: string[] = [];
      for (;;) {
        await frame();
        const p = c.tp.people3.get(c.room.sessionId);
        if (p)
          trail.push(
            `${c.me.x.toFixed(2)},${c.me.y.toFixed(2)} a${c.me.a} root ${p.root.position.x.toFixed(2)},${p.root.position.z.toFixed(2)} k${(p.settled ?? 0).toFixed(2)}`,
          );
        if (c.me.a === 2 && p && (p.settled ?? p.sitW ?? 0) >= 0.5) {
          (W as any).__trail = trail.slice(-12);
          break;
        }
        if (performance.now() - t0 > 15_000) return { url: null, why: `a=${c.me.a} sitW=${p?.sitW}` };
      }
      return { url: W.__acts.shot(view), sitW: c.tp.people3.get(c.room.sessionId)?.sitW };
    },
    // in a car: the still a moment into getting in (its door open, sliding in)
    async getIn(id: string, seat: number, ms: number, view: any) {
      const c = W.__yutopia;
      c.room.send("car:enter", { id, seat });
      const t0 = performance.now();
      for (;;) {
        await frame();
        for (const l of c.cars?.live?.values() ?? [])
          if (l.people.has(c.room.sessionId)) {
            const e0 = l.people.get(c.room.sessionId);
            const was = { at: e0.at, time: c.cars.time, door: [...l.doorUntil] };
            await sleep(ms);
            const e1 = l.people.get(c.room.sessionId);
            return { url: W.__acts.shot(view), was, now: { at: e1?.at, time: c.cars.time } };
          }
        if (performance.now() - t0 > 10_000) return { url: null, why: c.room.state.players.get(c.room.sessionId).busy };
      }
    },
  };
}

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  pageerror:", e.message));
await page.addInitScript(
  (t) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high", view: "3p", cam3p: "chase" }));
  },
  await token("ana@yutopia.test"),
);
await page.goto(base);
await ready(page);

if (process.env.PROBE) {
  const r = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    const objs: any[] = [];
    c.room.state.objects.forEach((o: any) => {
      objs.push({ id: o.id, k: o.kind, x: o.x, y: o.y, r: o.rot, p: o.props });
    });
    return { level: c.level, map: c.map, levels: c.room.state.levels, objs };
  });
  writeFileSync(process.env.PROBE, JSON.stringify(r, null, 1));
  await browser.close();
  process.exit(0);
}

await page.evaluate(install);
const C = <T,>(fn: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    ([f, a]) =>
      new Function("c", "A", "a", `return (async () => { ${f} })()`)(
        (window as any).__yutopia,
        (window as any).__acts,
        a,
      ),
    [fn, arg] as const,
  ) as Promise<T>;
const save = (name: string, url: string | null | undefined) => {
  if (!url) return console.log(`  ${name}: no still`);
  writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(",")[1], "base64"));
  console.log(`${name}: ${out}/${name}.png`);
};
const shot = async (name: string, view: Record<string, unknown> = {}) =>
  save(name, await page.evaluate((v) => (window as any).__acts.shot(v), view));
// the clock at 1 pm, no storm, the shadowed off
const hold = () =>
  C(`
    c.updateNight = () => {};
    c.hour = 13;
    c.model?.setClock?.(13);
    c.engine?.setClock?.(13);
    c.tp?.setHour(13);
    if (c.life) c.life.weather = () => [0, 0];
    c.room.send("mod:dark", { mode: "peaceful" });
  `);
const me = () =>
  C<{ x: number; y: number; level: number; a: number; busy: string; held: string }>(`
    const p = c.room.state.players.get(c.room.sessionId);
    return { x: p.x, y: p.y, level: p.level, a: c.me.a, busy: p.busy, held: p.held };
  `);
async function tp(x: number, y: number, level = HOME, settle = 1800) {
  // (sent again if it didn't take: one sent as a seat is left can be lost)
  for (let i = 0; ; i++) {
    // (sat in the park: up first, in the same breath — still on a bench, she'd be sat again)
    await C(
      `if (c.room.state.players.get(c.room.sessionId).busy === "ride:park") c.room.send("park:stand", {});
       c.room.send("teleport", { to: { x: a[0], y: a[1], level: a[2] } });`,
      [x, y, level],
    );
    const ok = await page
      .waitForFunction(
        ([px, py, l]) => {
          const c = (window as any).__yutopia;
          const p = c.room.state.players.get(c.room.sessionId);
          return p && p.level === l && Math.hypot(p.x - px, p.y - py) < (l === 0 ? 2 : 0.6) && c.level === l;
        },
        [x, y, level],
        { timeout: 6000 },
      )
      .then(() => true)
      .catch(() => false);
    if (ok) break;
    if (i >= 4) throw new Error(`no teleport to ${x}, ${y} (${level}): ${JSON.stringify(await me())}`);
  }
  await ready(page);
  await page.waitForTimeout(settle);
  await hold();
}
// turned to face a point (tiles), as the action menu turns you
const faceTo = (x: number, y: number) =>
  C(
    `
    const yaw = Math.atan2(a[1] - c.me.y, a[0] - c.me.x);
    c.walker.body.yaw = yaw;
    if (c.walker.prev) c.walker.prev.yaw = yaw;
  `,
    [x, y],
  );
// busy at something (shown on the body), as the controller says it while its panel is open
const busy = (what: string) =>
  C(
    `
    c.usingWhat = a;
    c.usingUntil = a ? performance.now() + 1e9 : 0;
  `,
    what,
  );
const log = (what: string, v: unknown) => console.log(`  ${what}:`, JSON.stringify(v));

// the things, out on Ana's floor (her office's west of them; a partition at x 15, y 1..12)
const PUT: Record<string, unknown>[] = [
  { id: "acts-chair", kind: "chair", x: 10, y: 11, rot: 0 },
  { id: "acts-armchair", kind: "armchair", x: 13, y: 11, rot: 0 },
  { id: "acts-beanbag", kind: "beanbag", x: 7, y: 11, rot: 0 },
  { id: "acts-sofa", kind: "sofa", x: 19, y: 11, rot: 0 },
  { id: "acts-bench", kind: "bench", x: 24, y: 11, rot: 0 },
  // a desk with a computer and a keyboard, its chair (the sitter on +y, facing −y)
  { id: "acts-desk", kind: "desk", x: 9, y: 15, rot: 2 },
  { id: "acts-desk-chair", kind: "chair", x: 9, y: 16, rot: 2, props: { desk: true } },
  { id: "acts-desk-pc", kind: "computer", x: 9, y: 15, rot: 2, props: { c: [1, 0], z: 25 } },
  { id: "acts-desk-kb", kind: "tabletop", x: 9, y: 15, rot: 2, props: { d: "keyboard", c: [1, 3], z: 25 } },
  // a bare desk and its chair (sat at, nothing to type on)
  { id: "acts-mdesk", kind: "desk", x: 13, y: 15, rot: 2 },
  { id: "acts-mdesk-chair", kind: "chair", x: 13, y: 16, rot: 2, props: { desk: true } },
  // the reception desk (higher), a computer and a keyboard on it
  { id: "acts-rec", kind: "reception", x: 17, y: 15, rot: 2 },
  { id: "acts-rec-chair", kind: "chair", x: 18, y: 16, rot: 2, props: { desk: true } },
  { id: "acts-rec-pc", kind: "computer", x: 18, y: 15, rot: 2, props: { c: [1, 0], z: 29 } },
  { id: "acts-rec-kb", kind: "tabletop", x: 18, y: 15, rot: 2, props: { d: "keyboard", c: [1, 3], z: 29 } },
  // a desk with no chair: the computer used stood
  { id: "acts-sdesk", kind: "desk", x: 22, y: 15, rot: 2 },
  { id: "acts-sdesk-pc", kind: "computer", x: 22, y: 15, rot: 2, props: { c: [1, 0], z: 25 } },
  { id: "acts-sdesk-kb", kind: "tabletop", x: 22, y: 15, rot: 2, props: { d: "keyboard", c: [1, 3], z: 25 } },
  { id: "acts-counter", kind: "counter", x: 4, y: 12, rot: 0 },
  { id: "acts-coffee", kind: "coffee_machine", x: 4, y: 12, rot: 0, props: { c: [0, 1], z: 26 } },
  { id: "acts-water", kind: "water_cooler", x: 9, y: 20, rot: 0 },
  { id: "acts-vending", kind: "vending", x: 12, y: 20, rot: 0 },
  { id: "acts-arcade", kind: "arcade", x: 15, y: 19, rot: 0 },
  { id: "acts-piano", kind: "piano", x: 19, y: 19, rot: 0 },
  { id: "acts-slot", kind: "slot_track", x: 23, y: 19, rot: 0 },
  { id: "acts-pool", kind: "pool_table", x: 27, y: 14, rot: 0 },
  { id: "acts-pong", kind: "pingpong_table", x: 27, y: 7, rot: 0 },
  { id: "acts-wb", kind: "whiteboard", x: 12, y: 0, rot: 0 },
];

// the still pair (and more) for someone sat or busy, settled
async function pair(name: string, extra: Record<string, unknown> = {}) {
  await shot(`${name}-front`, { ang: 0.6, el: 0.22, ...extra });
  await shot(`${name}-side`, { ang: -Math.PI / 2, el: 0.08, ...extra });
}

try {
  await tp(5, 10.6);
  await C(`c.send("item:drop", {}); c.room.send("park:stand", {});`);
  for (const o of PUT) {
    await C(`c.send("obj:put", a);`, o);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(800);
  const missing = await C<string[]>(
    `return a.filter((id) => !c.model.getObject(id));`,
    PUT.map((o) => o.id),
  );
  if (missing.length) console.log("  not placed:", missing);
  // her standing, for reference: the ankles' and the toes' height on a bare floor
  await tp(5, 10.6);
  log(
    "standing",
    await C(
      `return { ankleL: A.bone("ankleL"), toeL: A.bone("toeL"), hips: A.bone("hips"), head: A.bone("head"), floor: A.down(5.3, 10.3) };`,
    ),
  );

  // ── seats: walked onto from in front, mid-sit-down, then settled ──
  if (want("seats")) {
    const seats: [string, number, number, number][] = [
      ["chair", 10.5, 11.5, 0],
      ["armchair", 13.5, 11.5, 0],
      ["beanbag", 7.5, 11.5, 0],
      ["sofa", 20.5, 11.5, 0],
      ["bench", 25.5, 11.5, 0],
    ];
    for (const [name, x, y] of seats) {
      await tp(x, y + 1.9);
      const r = await page.evaluate(
        ([sx, sy, id]) => (window as any).__acts.sitDown({ x: sx, y: sy, id }, { ang: 0.9, el: 0.22 }),
        [x, y, `acts-${name}`] as const,
      );
      save(`${name}-sitdown`, r.url);
      if (process.env.TRAIL) console.log(await page.evaluate(() => (window as any).__trail));
      await page.waitForTimeout(2600);
      await pair(name);
      log(name, {
        ...(await me()),
        hips: await C(`return A.bone("hips")`),
        cushion: await C(`return A.down(a[0], a[1] + 0.12)`, [x, y]),
        heel: await C(`return A.bone("ankleL")`),
      });
    }
  }

  // ── desks: sat typing (hands on the keys?), sat at a bare desk, the reception's, stood at one ──
  if (want("desks")) {
    const desks: [string, number, number, boolean][] = [
      ["desk-typing", 9.5, 16.5, true],
      ["desk-bare", 13.5, 16.5, false],
      ["reception-typing", 18.5, 16.5, true],
    ];
    for (const [name, x, y, kb] of desks) {
      await tp(x, y + 1.6);
      const r = await page.evaluate(
        ([sx, sy]) => (window as any).__acts.sitDown({ x: sx, y: sy }, { ang: 1.1, el: 0.25, dist: 2.8 }),
        [x, y],
      );
      save(`${name}-sitdown`, r.url);
      if (process.env.TRAIL) console.log(await page.evaluate(() => (window as any).__trail));
      await page.waitForTimeout(2600);
      // (the front from over the desk, past the monitor; the side from her left at seat height)
      await shot(`${name}-front`, { ang: 0.55, el: 0.3, dist: 2.6 });
      await shot(`${name}-side`, { ang: -Math.PI / 2, el: 0.05, dist: 2.4 });
      // the hands: at desk height from the side, over the shoulder, from the front
      await shot(`${name}-hands-side`, { on: "hands", ang: -Math.PI / 2, el: 0.0, dist: 1.0, fov: 45 });
      await shot(`${name}-hands-shoulder`, { on: "hands", ang: Math.PI - 0.45, el: 0.7, dist: 1.15, fov: 45 });
      await shot(`${name}-hands-front`, { on: "hands", ang: 0.35, el: 0.45, dist: 1.2, fov: 45 });
      const m = await C<any>(
        `
        const f = (n) => A.bone(n);
        const tips = { L: f("indexL"), R: f("indexR"), fL: f("fingersL"), fR: f("fingersR"), wL: f("wristL"), wR: f("wristR") };
        const under = {};
        for (const k of Object.keys(tips)) under[k] = A.down(tips[k].x, tips[k].z, tips[k].y - 0.005);
        // the keyboard's top and the desk's along the middle, from her side (z up to the desk's back)
        const prof = [];
        for (let z = a[1] - 0.1; z >= a[1] - 1.2; z -= 0.05) prof.push([+z.toFixed(2), A.down(a[0], z)]);
        return { busy: c.room.state.players.get(c.room.sessionId).busy, typing: c.model.atWork(c.me.x, c.me.y), tips, under,
          prof, hips: f("hips"), kneeL: f("kneeL"), kneeR: f("kneeR"), elbowL: f("elbowL"), elbowR: f("elbowR"),
          ankleL: f("ankleL"), head: f("head") };
      `,
        [x, y],
      );
      log(name, m);
      void kb;
    }
    // stood at a computer (busy with it, as its panel open does)
    await tp(22.5, 16.45);
    await faceTo(22.5, 15.3);
    await busy("computer");
    await page.waitForTimeout(2600);
    await shot("computer-standing-front", { ang: 0.55, el: 0.3, dist: 2.6 });
    await shot("computer-standing-side", { ang: -Math.PI / 2, el: 0.05, dist: 2.4 });
    await shot("computer-standing-hands-side", { on: "hands", ang: -Math.PI / 2, el: 0.0, dist: 1.0, fov: 45 });
    await shot("computer-standing-hands-shoulder", { on: "hands", ang: Math.PI - 0.45, el: 0.7, dist: 1.15, fov: 45 });
    log(
      "computer-standing",
      await C(`
        const f = (n) => A.bone(n);
        const L = f("indexL"), R = f("indexR");
        const prof = [];
        for (let z = 16.3; z >= 15.1; z -= 0.05) prof.push([+z.toFixed(2), A.down(22.5, z)]);
        return { busy: c.room.state.players.get(c.room.sessionId).busy, L, R, underL: A.down(L.x, L.z, L.y - 0.005), underR: A.down(R.x, R.z, R.y - 0.005), prof, hips: f("hips") };
      `),
    );
    await busy("");
  }

  // ── busy at things, stood in front of them ──
  if (want("uses")) {
    // [name, busy, where she stands, what she faces, the front still's angle (round past the thing)]
    const uses: [string, string, number, number, number, number, number][] = [
      ["arcade", "arcade", 15.5, 20.35, 15.5, 19.5, 1.15],
      ["piano", "piano", 20, 20.45, 20, 19.5, 0.9],
      ["slotcar", "slotcar", 25, 22.45, 25, 21, 0.6],
      ["pool", "pool", 29, 16.45, 29, 15, 0.6],
      ["pong", "pong", 26.35, 8, 28.5, 8, 0.6],
      // (where the action menu stands you for a wall thing: hangSpot 0.7 out)
      ["whiteboard", "whiteboard", 13, 0.85, 13, 0, 1.3],
    ];
    for (const [name, what, x, y, fx, fy, front] of uses) {
      await tp(x, y);
      await faceTo(fx, fy);
      await busy(what);
      await page.waitForTimeout(2600);
      await shot(`${name}-front`, { ang: front, el: 0.22, dist: 2.6 });
      await shot(`${name}-side`, { ang: -Math.PI / 2, el: 0.08, dist: 2.6 });
      log(
        name,
        await C(`
          const wL = A.bone("wristL"), wR = A.bone("wristR"), iL = A.bone("indexL"), iR = A.bone("indexR");
          // (what's under each hand, and how far ahead the thing is at hand height)
          return { busy: c.room.state.players.get(c.room.sessionId).busy, wL, wR,
            underL: A.down(iL.x, iL.z, iL.y - 0.005), underR: A.down(iR.x, iR.z, iR.y - 0.005), hips: A.bone("hips") };
        `),
      );
      await busy("");
      await page.waitForTimeout(400);
    }
  }

  // ── the machines (their moment, then the drink in the hand), the drink held, a sip, on the sofa ──
  if (want("held")) {
    const machines: [string, string, number, number, number, number][] = [
      ["coffee", "acts-coffee", 4.4, 13.5, 4.4, 12.4],
      ["water", "acts-water", 9.5, 21.35, 9.5, 20.5],
      ["vending", "acts-vending", 12.5, 21.35, 12.5, 20.5],
    ];
    for (const [name, id, x, y, fx, fy] of machines) {
      await C(`c.send("item:drop", {});`);
      await tp(x, y);
      await faceTo(fx, fy);
      await page.waitForTimeout(500);
      // the button pressed (the machine's act held a moment, as its own second and a half has it)
      await busy(name);
      await page.waitForTimeout(1000);
      save(`${name}-use-front`, await C<string | null>(`return A.shot({ ang: 1.0, el: 0.22 })`));
      save(`${name}-use-side`, await C<string | null>(`return A.shot({ ang: -Math.PI / 2, el: 0.08 })`));
      log(`${name} press`, await C(`const i = A.bone("indexR"); return { indexR: i, hips: A.bone("hips") };`));
      await busy("");
      await page.waitForTimeout(600);
      await C(`c.activateObject(a, false);`, id);
      await page
        .waitForFunction(
          () => {
            const c = (window as any).__yutopia;
            return !!c.room.state.players.get(c.room.sessionId).held;
          },
          null,
          { timeout: 10_000 },
        )
        .catch(() => console.log(`  ${name}: nothing in the hand`));
      const held = (await me()).held;
      await page.waitForTimeout(900);
      // held, between sips
      await shot(`${held || name}-standing-front`, { ang: 1.0, el: 0.22 });
      await shot(`${held || name}-standing-side`, { ang: -Math.PI / 2, el: 0.08 });
      // mid-sip: the hand at the mouth (the first sip comes ~2–2.5 s after taking it)
      const sip = await C<{ url: string | null; d: number }>(`
        const t0 = performance.now();
        let best = 9;
        while (performance.now() - t0 < 12000) {
          await new Promise((r) => requestAnimationFrame(r));
          const w = A.bone("wristR"), h = A.bone("head");
          const d = Math.hypot(w.x - h.x, w.y - h.y, w.z - h.z);
          best = Math.min(best, d);
          // (past the hand's nearest: tipped at the lips)
          if (best < 0.3 && d > best + 0.002) return { url: A.shot({ ang: 0.9, el: 0.12, dist: 1.6, up: 0.25 }), side: A.shot({ ang: -Math.PI / 2, el: 0.05, dist: 1.6, up: 0.25 }), d: best };
        }
        return { url: null, d: best };
      `);
      save(`${held || name}-sip-front`, sip.url);
      save(`${held || name}-sip-side`, (sip as any).side);
      log(`${name} sip`, { held, nearest: sip.d });
      if (name === "coffee") {
        // sat on the sofa with it
        await tp(20.5, 13.3);
        await C(`c.walkTo({ x: 20.5, y: 11.5 });`);
        await page.waitForTimeout(3500);
        await pair("sofa-mug");
        // and a gamepad on the sofa
        await C(`c.send("item:drop", {});`);
        await busy("gamepad");
        await page.waitForTimeout(2600);
        await pair("sofa-gamepad");
        await busy("");
      }
    }
    await C(`c.send("item:drop", {});`);
  }

  // ── the Kart Park: a bench by the fire, a seat up the stands ──
  if (want("park")) {
    const seats = kartSeats();
    const G = (x: number, z: number) => ({ x: x + 60, y: z + 10 });
    const bench = seats.findIndex((s) => s.stand === undefined && Math.abs(Math.sin(s.a)) > 0.5);
    const st = KART_STANDS[0];
    const mid = (st.x0 + st.x1) / 2;
    let stand = -1;
    let bestD = 1e9;
    seats.forEach((s, i) => {
      if (s.stand !== 0 || s.row !== 1 || s.crowd) return;
      const d = Math.abs(s.x - mid);
      if (d < bestD) {
        bestD = d;
        stand = i;
      }
    });
    for (const [name, i] of [
      ["park-bench", bench],
      ["stands", stand],
    ] as const) {
      if (i < 0) {
        console.log(`  ${name}: no seat`);
        continue;
      }
      const s = seats[i];
      const at = G(s.out[0], s.out[1]);
      await tp(at.x, at.y, 0, 3000);
      const r = await C<{ url: string | null; busy: string }>(
        `
        c.room.send("park:sit", { i: a });
        const t0 = performance.now();
        while (performance.now() - t0 < 8000) {
          await new Promise((r) => requestAnimationFrame(r));
          if (c.room.state.players.get(c.room.sessionId).busy === "ride:park") { await A.sleep(250); return { url: A.shot({ ang: 0.9, el: 0.2 }), busy: "ride:park" }; }
        }
        return { url: null, busy: c.room.state.players.get(c.room.sessionId).busy };
      `,
        i,
      );
      save(`${name}-sitdown`, r.url);
      if (process.env.TRAIL) console.log(await page.evaluate(() => (window as any).__trail));
      await page.waitForTimeout(2600);
      await pair(name);
      log(name, {
        busy: r.busy,
        hips: await C(`return A.bone("hips")`),
        seatTop: s.top,
        under: await C(`const h = A.bone("hips"); return A.down(h.x, h.z, h.y - 0.02)`),
        // (the heel over what's under it: 0.06 stood on it)
        heel: await C(`const f = A.bone("ankleL"); return f.y - A.down(f.x, f.z, f.y + 0.02)`),
      });
      await C(`c.room.send("park:stand", {});`);
      await page.waitForTimeout(3000);
    }
  }

  // ── a car of the lot: getting in, the driver, getting out; then the passenger ──
  if (want("car")) {
    await tp(5, 10.6, HOME, 500);
    await C(`c.room.send("mod:cars", {});`);
    await page.waitForTimeout(1000);
    const car = await C<{ id: string; x: number; y: number; a: number } | undefined>(`
      const cars = [];
      c.room.state.objects.forEach((o) => {
        const p = JSON.parse(o.props);
        if (o.kind !== "car" || p.driven || p.model === "offroad" || p.role === "show" || p.owner || p.retire) return;
        const w = o.rot % 2 ? 2 : 5, h = o.rot % 2 ? 5 : 2;
        cars.push({ id: o.id, x: o.x + w / 2 + (p.dx ?? 0), y: o.y + h / 2 + (p.dz ?? 0), a: Math.PI + (o.rot % 4) * (Math.PI / 2) });
      });
      return cars.find((k) => k.id === "car-4") ?? cars[0];
    `);
    if (!car) console.log("  car: none in the lot");
    else {
      const aisle = { x: car.x + Math.cos(car.a) * 3.4, y: car.y + Math.sin(car.a) * 3.4 };
      for (const [role, seat, side] of [
        ["driver", 0, -1],
        ["passenger", 1, 1],
      ] as const) {
        await tp(aisle.x, aisle.y, 0, 3000);
        await C(`if (c.cars?.cam) c.cars.cam.mode = "chase";`);
        // getting in: a moment in (the door open, sliding across)
        const g = await page.evaluate(
          ([id, s, sd]) =>
            (window as any).__acts.getIn(id, s, 220, { ang: (sd * Math.PI) / 2 - sd * 0.5, el: 0.25, dist: 2.8 }),
          [car.id, seat, side] as const,
        );
        save(`car-${role}-getin`, g.url);
        if (process.env.TRAIL) console.log(JSON.stringify({ was: (g as any).was, now: (g as any).now }));
        await page.waitForTimeout(2500);
        // its doors held open, the camera at her door, a little ahead; through the closed window
        await C(`
          for (const l of c.cars.live.values()) if (l.people.has(c.room.sessionId)) l.doorUntil = l.doorUntil.map(() => 1e9);
        `);
        await page.waitForTimeout(1200);
        await shot(`car-${role}-door`, { ang: side * (Math.PI / 2 - 0.45), el: 0.15, dist: 2.2 });
        await shot(`car-${role}-side`, { ang: (side * Math.PI) / 2, el: 0.05, dist: 2.0 });
        await shot(`car-${role}-front`, { ang: side * 0.35, el: 0.3, dist: 3.2 });
        const head = await C<{ y: number }>(`return A.bone("head")`);
        await shot(`car-${role}-top`, { ang: Math.PI, el: 1.4, dist: 2.6, clipY: head.y + 0.22 });
        await shot(`car-${role}-top-side`, { ang: (side * Math.PI) / 2, el: 0.9, dist: 2.4, clipY: head.y + 0.22 });
        log(`car ${role}`, {
          ...(await me()),
          hips: await C(`return A.bone("hips")`),
          ankleL: await C(`return A.bone("ankleL")`),
          head,
        });
        await C(
          `for (const l of c.cars.live.values()) if (l.people.has(c.room.sessionId)) l.doorUntil = l.doorUntil.map(() => 0);`,
        );
        // getting out
        const o = await C<string | null>(`
          c.room.send("car:leave", {});
          const t0 = performance.now();
          while (performance.now() - t0 < 6000) {
            await new Promise((r) => requestAnimationFrame(r));
            if (!c.room.state.players.get(c.room.sessionId).busy && c.tp.people3.get(c.room.sessionId)) { await A.sleep(200); return A.shot({ ang: 0.6, el: 0.25, dist: 3 }); }
          }
          return null;
        `);
        save(`car-${role}-getout`, o);
        await page.waitForTimeout(1500);
      }
    }
  }
} finally {
  await C(
    `
    c.send("item:drop", {});
    c.room.send("park:stand", {});
    if (c.room.state.players.get(c.room.sessionId).busy.startsWith("drive:") || c.room.state.players.get(c.room.sessionId).busy.startsWith("ride:car")) c.room.send("car:leave", {});
    c.usingUntil = 0;
    c.send("obj:removeMany", { ids: a });
  `,
    PUT.map((o) => o.id),
  ).catch((e) => console.log("  cleanup:", e.message));
  await page.waitForTimeout(1500);
  await C(`c.room.send("mod:cars", {}); c.room.send("teleport", { to: { x: 5, y: 10.6, level: 4 } });`).catch(() => {});
  await page.waitForTimeout(1500);
  await browser.close();
}
