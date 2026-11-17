/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// (plan 97) A car's whole life, for the memory probes: e2e/car-memory.mts (life after life on the dev world) and
// e2e/memcheck.mts (one a cycle). Someone (an admin: `mod:*`) takes the town's first car (the lot's if the town has
// none), drives it 3 s, has its front crashed in to smoking, gets out and shoots it up: four stars and a fifth in
// on its windscreen, a side window, a door five times, the front tyre, the wing. Then the blast, the debris' two
// it lies (2 s here: `debrisS`), every car put home fresh, and back where they began.
//   short: (the nightly job's, F2a) no windscreen, the side window, one door round and the tyre — the blast still
//   comes (the smoking front and the wing's rounds)
// The in-page code that installs the counters goes in as strings: tsx (the nightly job's runner) wraps named
// functions in a `__name` the page doesn't have.
import type { Page } from "@playwright/test";

/** For `page.addInitScript({ content })`: sound nodes made, by kind, and those still alive in JS (a
 *  FinalizationRegistry: after a GC) — `window.__sound()`. */
export const SOUND_TALLY = `(() => {
  const made = {};
  const gone = {};
  const reg = new FinalizationRegistry((k) => { gone[k] = (gone[k] || 0) + 1; });
  const AC = window.BaseAudioContext && window.BaseAudioContext.prototype;
  if (AC)
    for (const name of Object.getOwnPropertyNames(AC)) {
      if (!/^create(?!Buffer$|PeriodicWave$)/.test(name) || typeof AC[name] !== "function") continue;
      const f = AC[name];
      AC[name] = function (...a) {
        const n = f.apply(this, a);
        const k = name.slice(6);
        made[k] = (made[k] || 0) + 1;
        reg.register(n, k);
        return n;
      };
    }
  window.__sound = () => {
    const alive = {};
    let n = 0;
    for (const k of Object.keys(made)) {
      alive[k] = made[k] - (gone[k] || 0);
      n += alive[k];
    }
    return { made: Object.values(made).reduce((a, b) => a + b, 0), alive, n };
  };
})()`;

/** For `page.evaluate` once the world's up: every geometry by the code that first gave it an attribute (the two
 *  frames nearest it outside three; let go when it's disposed or collected) — `window.__geoSites()`, the
 *  furniture's by what wears it, or "unused"; and every shadow-casting light that got a map, in the scene or
 *  not — `window.__shadowMaps()`. */
export const CENSUS = `(() => {
  const W = window;
  if (W.__geoSites) return;
  let BG = null;
  W.__yutopia.tp.scene.traverse((c) => { if (!BG && c.geometry) BG = c.geometry; });
  for (let pr = BG && Object.getPrototypeOf(BG); pr; pr = Object.getPrototypeOf(pr))
    if (Object.hasOwn(pr, "dispose") && Object.hasOwn(pr, "setAttribute")) { BG = pr; break; }
  const refs = new Set();
  const of = new WeakMap();
  const s0 = BG.setAttribute;
  const d0 = BG.dispose;
  BG.setAttribute = function (...a) {
    if (!of.has(this)) {
      const st = (new Error().stack || "").split("\\n").slice(2);
      const site = st
        .filter((l) => !/node_modules|<anonymous>/.test(l))
        .slice(0, W.__censusDepth || 2)
        .map((l) => l.trim().replace(/^at /, "").replace(/\\(?(webpack-internal:\\/\\/\\/\\(app-pages-browser\\)\\/\\.\\/src\\/|https?:\\/\\/[^)]*\\/)/, "").replace(/\\)$/, ""))
        .join(" < ");
      const r = new WeakRef(this);
      refs.add(r);
      of.set(this, { r, site });
    }
    return s0.apply(this, a);
  };
  BG.dispose = function (...a) {
    const e = of.get(this);
    if (e) refs.delete(e.r);
    return d0.apply(this, a);
  };
  const sm = W.__yutopia.tp.renderer.shadowMap;
  const r0 = sm.render;
  const shadowed = [];
  sm.render = function (lights, ...a) {
    for (const l of lights || [])
      if (l.castShadow && !(l.shadow && l.shadow.map) && !shadowed.some((e) => e.l === l)) {
        const path = [];
        for (let o = l; o; o = o.parent) path.push(o.name || o.type);
        shadowed.push({ l, what: l.type + " " + path.join(" < "), t: Math.round(performance.now() / 1000) });
      }
    return r0.call(this, lights, ...a);
  };
  W.__shadowMaps = () => {
    const scene = W.__yutopia.tp.scene;
    return shadowed
      .filter((e) => e.l.shadow && e.l.shadow.map)
      .map((e) => {
        let o = e.l;
        while (o.parent) o = o.parent;
        return (o === scene ? "in " : "OFF ") + e.what + " @" + e.t + "s";
      });
  };
  W.__geoSites = () => {
    const wearer = new Map();
    W.__yutopia.tp.scene.traverse((m) => {
      if (!m.geometry || wearer.has(m.geometry)) return;
      let who = "";
      for (let x = m; x && !who; x = x.parent)
        who = x.userData && x.userData.kind ? x.userData.kind + " " + (x.userData.id || "") : x.name;
      wearer.set(m.geometry, who || m.type);
    });
    const o = {};
    for (const r of refs) {
      const g = r.deref();
      if (!g) { refs.delete(r); continue; }
      let k = (of.get(g) || {}).site || "?";
      if (k.includes("native.ts")) k += " @ " + (wearer.get(g) || "unused");
      o[k] = (o[k] || 0) + 1;
    }
    return o;
  };
})()`;

/** The cars' own lists and the sound, as the page has them now. */
export const carCounts = (page: Page) =>
  page.evaluate(() => {
    const W = window as any;
    const C = W.__yutopia.cars;
    let full = 0;
    for (const p of C.parked.values()) if (p.full) full++;
    return {
      carsLive: C.live.size as number,
      carsFull: full,
      debris: C.debris.bits.length as number,
      fireLoops: C.fireLoops.size as number,
      hops: C.hops.size as number,
      fireLights: (W.__yutopia.tp.fireLights?.length ?? 0) as number,
      soundAlive: (W.__sound?.().n ?? 0) as number,
    };
  });

/** What a census has, its car code's geometries summed (glb.ts, seatfit.ts, cars.ts, fx.ts …). */
export const carGeos = (sites: Record<string, number>) =>
  Object.entries(sites).reduce((a, [k, v]) => (/(^|[ /])(tp\/)?car\//.test(k.split(" < ")[0]) ? a + v : a), 0);

/** The makers that moved between two censuses, the most first. */
export function movedSites(a: Record<string, number>, b: Record<string, number>, n = 8): [string, number][] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)] as [string, number])
    .filter(([, d]) => d !== 0)
    .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
    .slice(0, n);
}

/** The listeners a life needs (once a page): the server's word on each round (`car:shot`) and each blast. */
export async function armCarLife(page: Page): Promise<{ heard: unknown[] }> {
  const heard: unknown[] = [];
  await page.exposeFunction("__carShot", (m: unknown) => heard.push(m));
  await page.evaluate(() => {
    const W = window as any;
    W.__blasts = 0;
    W.__yutopia.room.onMessage("car:shot", (m: unknown) => W.__carShot(m));
    W.__yutopia.room.onMessage("car:blast", () => {
      W.__blasts++;
    });
  });
  return { heard };
}

export interface LifeLog {
  car: string;
  screen: number;
  side: number;
  engine: number;
  blasts: number;
  fireMax: number;
  propsAfter: { dmg: unknown; holes: unknown };
  burnt?: Record<string, number>;
}

/** One car's life, from wherever they stand back to `home`. `atBurnt` counts at the wreck (fire out, debris
 *  down). Every step waits for what it's waiting for — a round's word from the server, the teleport landed, the
 *  seat taken — not a fixed time: a life is ~20 s. */
export async function carLife(
  page: Page,
  armed: { heard: unknown[] },
  o: {
    home: { x: number; y: number; level?: number };
    short?: boolean;
    debrisS?: number;
    atBurnt?: () => Promise<Record<string, number>>;
  },
): Promise<LifeLog> {
  const send = (type: string, msg: unknown = {}) =>
    page.evaluate(([t, m]) => (window as any).__yutopia.room.send(t, m), [type, msg] as const);
  const until = (fn: string, ms: number, arg?: unknown) =>
    page
      .waitForFunction(fn, arg, { timeout: ms, polling: 50 })
      .then(() => true)
      .catch(() => false);
  /** Teleported, and the page has her there (her own position within half a metre). */
  const tp = async (q: { x: number; y: number; level?: number }) => {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y, level: p.level ?? 0 }), q);
    await until(
      `(() => { const y = window.__yutopia; const m = y.room.state.players.get(y.room.sessionId); return m && Math.hypot(m.x - ${q.x}, m.y - ${q.y}) < 0.5; })()`,
      3000,
    );
  };
  await send("mod:cars");
  await send("mod:heal");
  await send("mod:dark", { mode: "peaceful" });
  await send("mod:hour", { h: 12 });
  // (the debris lies `debrisS` here, not the game's 2 minutes: what's tested is that it goes, not how long it lies)
  await page.evaluate((s) => {
    (window as any).__yutopia.cars.debris.keepS = s;
  }, o.debrisS ?? 2);
  // the town's first car (by x), else the lot's — parked, fresh
  const car = await page.evaluate(() => {
    const out: { id: string; x: number; y: number; town: boolean }[] = [];
    (window as any).__yutopia.room.state.objects.forEach((ob: any) => {
      const p = JSON.parse(ob.props);
      if (ob.kind !== "car" || p.driven || p.dmg) return;
      out.push({ id: ob.id, x: ob.x, y: ob.y, town: /^town-car/.test(ob.id) });
    });
    out.sort((a, b) => Number(b.town) - Number(a.town) || a.x - b.x);
    return out[0] ?? null;
  });
  if (!car) throw new Error("car life: no car");
  // in: by its door, the prompt, then the seat (the act's walk to the door and in)
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
    await tp({ x: car.x + 1 + dx, y: car.y + 1 + dy });
    if (!(await until("/^car/.test(window.__hud.get().prompt?.kind ?? '')", 1500))) continue;
    await page.evaluate(() => (window as any).__yutopia.interact());
    inCar = await until("window.__yutopia.cars.driving()", 6000);
    if (inCar) break;
  }
  if (!inCar) throw new Error(`car life: couldn't get in ${car.id}`);
  // a short drive, the front crashed in past its worst (the server has it smoking), out
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyS");
  const vid: string = await page.evaluate(() => {
    const C = (window as any).__yutopia.cars;
    C.mine.dmg.zones[0] = 0.5;
    return C.mine.vid;
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    (window as any).__yutopia.cars.mine.dmg.zones[0] = 0.99;
  });
  if (
    !(await until(
      `String(window.__yutopia.room.state.vehicles.get(${JSON.stringify(vid)})?.dmg ?? "").split("|")[3] === "1"`,
      15_000,
    ))
  )
    throw new Error(`car life: ${vid} never smoked`);
  await page.keyboard.press("KeyX");
  const oid = vid.replace(/^car:/, "");
  await until(`!window.__yutopia.cars.driving() && !!window.__yutopia.cars.parked.get(${JSON.stringify(oid)})?.pose`, 8000);
  const pp = await page.evaluate((id) => (window as any).__yutopia.cars.parked.get(id)?.pose ?? null, oid);
  if (!pp) throw new Error(`car life: ${oid} not parked after getting out`);
  const fwd = [Math.cos(pp.a), Math.sin(pp.a)];
  const right = [-Math.sin(pp.a), Math.cos(pp.a)];
  const P = (u: number, w: number) => ({ x: pp.x + fwd[0] * u + right[0] * w, y: pp.z + fwd[1] * u + right[1] * w });
  // armed
  // (the kit in the pack first — a key pressed before it's there draws nothing —, then the revolver in hand)
  await send("mod:refill", { kit: true });
  let drawn = false;
  for (let k = 0; k < 4 && !drawn; k++) {
    await page.waitForTimeout(300);
    await page.keyboard.press("Digit2");
    drawn = await until(
      "window.__yutopia.room.state.players.get(window.__yutopia.room.sessionId).gun === 'revolver'",
      2500,
    );
  }
  if (!drawn) throw new Error("car life: the revolver never drawn");
  await page.mouse.move(720, 450);
  /** A round at `t`, `h` up: true once the server's said where it went (~50 ms here). */
  const once = async (t: { x: number; y: number }, h: number) => {
    const n0 = armed.heard.length;
    await page.evaluate(
      ([t, g]) => {
        const y = (window as any).__yutopia;
        const me = y.room.state.players.get(y.room.sessionId);
        const oz = me.z + 1.35;
        const d = Math.hypot(t.x - me.x, t.y - me.y);
        y.room.send("arms:fire", {
          ox: me.x,
          oy: me.y,
          oz,
          yaw: Math.atan2(t.y - me.y, t.x - me.x),
          pitch: Math.atan2((g as number) - oz, d),
          lag: 0,
          seed: 9,
        });
      },
      [t, pp.y + h] as const,
    );
    for (let k = 0; k < 20 && armed.heard.length === n0; k++) await page.waitForTimeout(25);
    return armed.heard.length > n0;
  };
  const fireAt = async (t: { x: number; y: number }, h: number) => {
    if (await once(t, h)) return true;
    // (the cylinder empty: a reload — refilled first —, then again as soon as it takes one)
    await page.mouse.up({ button: "right" });
    await send("mod:refill", { kit: true });
    await page.keyboard.press("KeyR");
    await page.mouse.down({ button: "right" });
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(250);
      if (await once(t, h)) return true;
    }
    return false;
  };
  const volley = async (stand: { x: number; y: number }, shots: [number, number, number][]) => {
    await tp(stand);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(400);
    let hit = 0;
    for (const [u, w, h] of shots) {
      if (await fireAt(P(u, w), h)) hit++;
      // (nothing heard of the first, reloaded or not: the rest won't be either — on, not 3 s a round)
      else if (!hit) break;
    }
    await page.mouse.up({ button: "right" });
    return hit;
  };
  // (its fire field, the most it reached, watched in the page)
  await page.evaluate((id) => {
    const W = window as any;
    W.__fireMax = 0;
    W.__fireUntil = performance.now() + 60_000;
    W.__fireTick = () => {
      const ob = W.__yutopia.room.state.objects.get(id) ?? W.__yutopia.room.state.vehicles.get(`car:${id}`);
      const f = Number(String((ob?.props ? JSON.parse(ob.props).dmg : ob?.dmg) ?? "").split("|")[3] ?? 0);
      if (f > W.__fireMax) W.__fireMax = f;
      if (performance.now() < W.__fireUntil) requestAnimationFrame(W.__fireTick);
    };
    W.__fireTick();
  }, oid);
  const b0: number = await page.evaluate(() => (window as any).__blasts);
  const blown = () => page.evaluate((b) => (window as any).__blasts > b, b0);
  // the windscreen from its front: four stars, a fifth in
  const screen = o.short
    ? 0
    : await volley(P(6.5, 0.4), [
        [0, -0.45, 1.15],
        [0, -0.15, 1.15],
        [0, 0.2, 1.15],
        [0, 0.42, 1.15],
        [0, 0, 1.15],
      ]);
  // its street side: the front side window, the front door to hanging (5), the front tyre
  const side = await volley(
    P(-0.3, 5.5),
    o.short
      ? [
          [-0.2, 0, 1.12],
          [-0.35, 0, 0.62],
          [1.37, 0, 0.32],
        ]
      : [
          [-0.2, 0, 1.12],
          [-0.35, 0, 0.62],
          [-0.45, 0, 0.6],
          [-0.25, 0, 0.66],
          [-0.4, 0, 0.7],
          [-0.3, 0, 0.58],
          [1.37, 0, 0.32],
        ],
  );
  // the wing, till it blows (plan 95: it burns ≥10 s first) — not if it's gone up already
  const engine = (await blown())
    ? 0
    : await volley(P(1.2, 7), [
        [1.75, 0, 0.72],
        [1.75, 0, 0.72],
        [1.75, 0, 0.72],
        [1.75, 0, 0.72],
      ]);
  await until(`window.__blasts > ${b0}`, 45_000);
  // (its pieces thrown and down)
  await page.waitForTimeout(1000);
  const burnt = o.atBurnt ? await o.atBurnt() : undefined;
  // (till the debris has gone — Jolt's crates with it)
  if (!(await until("window.__yutopia.cars.debris.bits.length === 0", ((o.debrisS ?? 2) + 20) * 1000)))
    console.log("  car life: debris still there");
  const blasts: number = (await page.evaluate(() => (window as any).__blasts)) - b0;
  const fireMax: number = await page.evaluate(() => (window as any).__fireMax);
  await send("mod:heal");
  // every car home, fresh; back where they began
  await send("mod:cars");
  await until(`!JSON.parse(window.__yutopia.room.state.objects.get(${JSON.stringify(oid)})?.props ?? "{}").dmg`, 5000);
  const propsAfter = await page.evaluate((id) => {
    const ob = (window as any).__yutopia.room.state.objects.get(id);
    const p = ob ? JSON.parse(ob.props) : {};
    return { dmg: p.dmg ?? null, holes: p.holes ?? null };
  }, oid);
  await page.keyboard.press("Digit2");
  await tp(o.home);
  await page.waitForTimeout(1000);
  return { car: car.id, screen, side, engine, blasts, fireMax, propsAfter, burnt };
}
