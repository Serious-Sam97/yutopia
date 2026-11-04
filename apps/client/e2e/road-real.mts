/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// docs/plan/69-the-long-road.md: the long road in the game itself (no mock) — Cai teleported along it
// (the dev stack, :3100 and :8100; Cai, not Ana: whoever's playing as Ana keeps their tab), each spot's
// camera set by hand from the spine (as road-shots.mts set the mock's).
//   node --experimental-strip-types e2e/road-real.mts [out dir]
//   SPOTS=wood,…; HOUR=12.5; QUALITY=high
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page, request } from "@playwright/test";
import { terrainAt } from "@yutopia/shared/grounds";
import { ALT, at, LAKE, LOOKOUT, PASS, SPINE } from "@yutopia/shared/longroad";

const out = resolve(process.argv[2] ?? "../../design/screens/road/game");
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
const quality = process.env.QUALITY ?? "high";
const hour = Number(process.env.HOUR ?? 12.5);
const OX = 60;
const OZ = 10;

// a point on the road at km, `o` off it (its left), `up` over the road's height (absolute heights)
const frame = (i: number) => {
  const a = SPINE[Math.max(0, i - 3)];
  const b = SPINE[Math.min(SPINE.length - 1, i + 3)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
};
const on = (km: number, o = 0, up = 1.7): [number, number, number] => {
  const i = at(km);
  const f = frame(i);
  return [SPINE[i][0] + f.tz * o, ALT[i] + up, SPINE[i][1] - f.tx * o];
};
interface Spot {
  name: string;
  stand: [number, number];
  from: [number, number, number];
  to: [number, number, number];
}
const spot = (name: string, km: number, from: [number, number, number], to: [number, number, number]): Spot => {
  const i = at(km);
  return { name, stand: [SPINE[i][0], SPINE[i][1]], from, to };
};
const SPOTS: Spot[] = [
  { name: "opened", stand: [500, -403], from: [500, 3.6, -401.5], to: [700, 3, -408] },
  // (Main Street, west: the town's street things, its square — drawn by the rest, round the town)
  { name: "town", stand: [470, -405], from: [478, 4.5, -401], to: [380, 2, -407] },
  spot("edge", 0.6, on(0.55, 1.5), on(1.4, 0, 5)),
  spot("wood", 3.05, on(3.05, 1.8), on(3.25, 0, 3)),
  spot("gorge", 5.99, on(5.99, 3.6, 2.6), on(5.6, 90, -30)),
  spot("hairpin", 8.0, on(8.05, -6, 22), on(7.6, 0, -4)),
  spot("pass", ALT.length && PASS ? 11.1 : 11.1, on(11.05, 2), on(11.5, 0, -8)),
  {
    name: "lookout",
    stand: [SPINE[LOOKOUT][0], SPINE[LOOKOUT][1]],
    from: [SPINE[LOOKOUT][0] - 10, ALT[LOOKOUT] + 2, SPINE[LOOKOUT][1] - 6],
    to: [LAKE.cx - 600, LAKE.level + 30, LAKE.cz],
  },
];

// (TOPS=name:x:z:up;…: straight down on (x, z) from `up` over the land — god mode's view; VIEWS=
// name:fx:fy:fz:tx:ty:tz;…: from a point to a point, absolute heights, stood under the first)
for (const t of process.env.TOPS?.split(";").filter(Boolean) ?? []) {
  const [name, x, z, up] = t.split(":");
  const h = terrainAt(Number(x), Number(z));
  SPOTS.push({
    name,
    stand: [Number(x), Number(z)],
    from: [Number(x), h + Number(up), Number(z) + 0.5],
    to: [Number(x), h, Number(z)],
  });
}
for (const t of process.env.VIEWS?.split(";").filter(Boolean) ?? []) {
  const [name, ...n] = t.split(":");
  const v = n.map(Number);
  SPOTS.push({ name, stand: [v[0], v[2]], from: [v[0], v[1], v[2]], to: [v[3], v[4], v[5]] });
}

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
    { timeout: 180_000 },
  );

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
const tok = await token("cai@yutopia.test");
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q }));
  },
  [tok, quality] as const,
);
await page.goto(base);
await ready(page);
const want = process.env.SPOTS?.split(",");
for (const s of SPOTS) {
  if (want && !want.includes(s.name)) continue;
  await page.evaluate((to) => (window as any).__yutopia.teleport(to), {
    x: s.stand[0] + OX,
    y: s.stand[1] + OZ,
    level: 0,
  });
  await ready(page).catch(() => {});
  await page.waitForTimeout(12_000);
  await page.evaluate(
    ([s, h, nofar, nowater]) => {
      const win = window as any;
      const w = win.__yutopia;
      const tp = w.tp;
      w.updateNight = () => {};
      w.hour = h;
      tp.setHour(h);
      const g = tp.around.grounds;
      // (NOFAR=1: the far land hidden — what's the near scene's alone)
      if (nofar && g.far) {
        g.far.frame = () => {};
        g.far.root.visible = false;
      }
      // (NOWATER=1: the water's and the ice's meshes hidden)
      if (nowater)
        g.root.traverse((o: any) => {
          const k = o.material?.userData?.wx;
          if (k === "water" || k === "ice" || k === "under") o.visible = false;
        });
      const V3 = tp.camera.position.constructor;
      const b = g.root.getWorldPosition(new V3());
      win.__rr = { b, s };
      if (!win.__rrHooked) {
        win.__rrHooked = true;
        const post = tp.post;
        const r0 = post.render.bind(post);
        post.render = (moving: boolean, over: any) => {
          const { b, s } = win.__rr;
          tp.camera.position.set(b.x + s.from[0], b.y + s.from[1], b.z + s.from[2]);
          tp.camera.lookAt(b.x + s.to[0], b.y + s.to[1], b.z + s.to[2]);
          tp.camera.updateMatrixWorld(true);
          return r0(moving, over);
        };
      }
    },
    [s, hour, !!process.env.NOFAR, !!process.env.NOWATER] as const,
  );
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    big?.setAttribute("data-rrshot", "");
    if (!document.getElementById("rrshot-css")) {
      const st = document.createElement("style");
      st.id = "rrshot-css";
      st.textContent = "*:not(:has([data-rrshot])):not([data-rrshot]){visibility:hidden!important}";
      document.head.appendChild(st);
    }
  });
  const file = `${out}/${s.name}.png`;
  await page.screenshot({ path: file });
  console.log(`${s.name}: ${file}`);
}
await browser.close();
