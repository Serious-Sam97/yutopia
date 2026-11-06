/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 72 phase 11.2: Bia draws walls free in Build on the dev stack (:3100, :8100) with the real
// mouse and keys — a run corner after corner, a length typed, Backspace, Box, Erase; stills of the
// ghost, the snaps and the chip; every wall undone at the end.
//   node --experimental-strip-types e2e/free-walls.mts [out dir]
import { mkdirSync } from "node:fs";
import { chromium, type Page, request } from "@playwright/test";

const out = process.argv[2] ?? "../../design/build-tool/free-walls";
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const pass = process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo";
mkdirSync(out, { recursive: true });

const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post(`${api}/api/login`, {
      data: { email: "bia@yutopia.test", password: pass },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("page:", e.message, (e.stack ?? "").split("\n").slice(1, 12).join("\n")));
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
await page.addInitScript((t) => {
  localStorage.setItem("yutopia:token", t);
  localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "high" }));
}, tok);
await page.goto(base);
await page.waitForFunction(
  () => {
    const h = (window as any).__hud?.get();
    return h?.phase === "ready" && h.loading?.on === false;
  },
  null,
  { timeout: 120_000 },
);
await page.waitForTimeout(1500);
// (floor 3's open floor, by the stairs: room to draw)
await page.evaluate(() => (window as any).__yutopia.teleport({ x: 20, y: 20, level: 3 }));
await page.waitForTimeout(2500);
const shot = async (name: string) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
};
const state = () =>
  page.evaluate(() => {
    const w = (window as any).__yutopia;
    const s = w.structure;
    return {
      level: w.level,
      me: [w.me.x, w.me.y],
      walls: s.walls.filter((q: any) => q.floor === w.level).length,
      tag: (window as any).__hud.get().build.wallTag,
      grid: s.floors.find((f: any) => f.index === w.level)?.grid,
    };
  });
const st0 = await state();
console.log("start", st0);
await page.evaluate(async () => {
  const w = (window as any).__yutopia;
  await w.loadBuild();
  const hud = (window as any).__hud;
  hud.set((s: any) => ({
    build: { ...s.build, on: true, tool: "walls", wallMode: "build", paintMode: "line", brush: "w:b" },
  }));
  w.refreshGhost();
});
await page.waitForTimeout(800);
const mouse = page.mouse;
const kb = (k: string) => page.keyboard.press(k);
const click = async (x: number, y: number) => {
  await mouse.move(x, y, { steps: 4 });
  await mouse.down();
  await mouse.up();
  await page.waitForTimeout(120);
};
const count = async () => (await state()).walls - st0.walls;

// a run on the floor ahead: three corners clicked, the pointer out for the fourth
await click(820, 640);
await mouse.move(1080, 560, { steps: 8 });
console.log("ghost tag", (await state()).tag);
await shot("01-ghost");
await click(1080, 560);
await page.waitForTimeout(400);
console.log("after 1:", await count());
await mouse.move(1160, 700, { steps: 8 });
await shot("02-second");
await click(1160, 700);
await page.waitForTimeout(400);
console.log("after 2:", await count());
// a length typed for the third
await mouse.move(950, 760, { steps: 8 });
for (const k of ["1", ".", "5"]) await kb(k);
console.log("typed tag", (await state()).tag);
await shot("03-typed");
await kb("Enter");
await page.waitForTimeout(400);
console.log("after typed:", await count());
await kb("Backspace");
await page.waitForTimeout(500);
console.log("after backspace:", await count());
await kb("Escape");
await shot("04-run");

// an arc: its start, its end, then out to bow it, and a click
await page.evaluate(() =>
  (window as any).__hud.set((s: any) => ({ build: { ...s.build, paintMode: "arc", brush: "w:w" } })),
);
await click(700, 660);
await click(1120, 660);
await mouse.move(910, 560, { steps: 10 });
console.log("arc tag", (await state()).tag);
await shot("05a-arc-bow");
await click(910, 560);
await page.waitForTimeout(500);
console.log(
  "after arc:",
  await count(),
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.structure.walls.filter((q: any) => q.floor === w.level && q.bow).map((q: any) => [q.a, q.b, q.bow]);
  }),
);
await kb("Escape");
await mouse.move(600, 820, { steps: 4 });
await shot("05b-arc-in");
await page.evaluate(() => (window as any).__hud.set((s: any) => ({ build: { ...s.build, brush: "w:b" } })));

// a rail 0.1 thick, drawn; then Adjust: its top dragged up to 2.4 m, then a click (ceiling, 0.3)
await page.evaluate(() =>
  (window as any).__hud.set((s: any) => ({
    build: { ...s.build, paintMode: "line", brush: "w:p", wallHeight: 1.1, wallThick: 0.1 },
  })),
);
await click(640, 700);
await click(1000, 700);
await kb("Escape");
await page.waitForTimeout(500);
const rail = await page.evaluate(() => {
  const w = (window as any).__yutopia;
  return w.structure.walls.filter((q: any) => q.floor === w.level && q.height < 1.2).at(-1);
});
console.log("rail", rail && [rail.a, rail.b, rail.height, rail.thick]);
const scr = (x: number, y: number, z: number) =>
  page.evaluate(
    ([px, py, pz]) => {
      const w = (window as any).__yutopia;
      const r = w.hostRect();
      const q = w.model.worldToClient(px, py, pz);
      return { x: r.left + q.x, y: r.top + q.y };
    },
    [x, y, z] as const,
  );
const [rx, ry] = [(rail.a[0] + rail.b[0]) / 2, (rail.a[1] + rail.b[1]) / 2];
await page.evaluate(() =>
  (window as any).__hud.set((s: any) => ({
    build: { ...s.build, paintMode: "adjust", wallHeight: 3.266, wallThick: 0.3 },
  })),
);
const foot = await scr(rx, ry, 0.05);
const top = await scr(rx, ry, 2.4);
await mouse.move(foot.x, foot.y, { steps: 4 });
console.log("adjust hover tag", (await state()).tag);
await mouse.down();
await mouse.move(top.x, top.y, { steps: 12 });
console.log("adjust drag tag", (await state()).tag);
await shot("05c-adjust-drag");
await mouse.up();
await page.waitForTimeout(600);
const h1 = await page.evaluate(
  (id) => (window as any).__yutopia.structure.walls.find((q: any) => q.id === id),
  rail.id,
);
console.log("after drag", h1 && [h1.height, h1.thick]);
await mouse.move(foot.x, foot.y, { steps: 4 });
await mouse.down();
await mouse.up();
await page.waitForTimeout(600);
const h2 = await page.evaluate(
  (id) => (window as any).__yutopia.structure.walls.find((q: any) => q.id === id),
  rail.id,
);
console.log("after click", h2 && [h2.height, h2.thick]);
await mouse.move(foot.x + 200, foot.y + 80, { steps: 4 });
await shot("05d-adjusted");
await page.evaluate(() =>
  (window as any).__hud.set((s: any) => ({ build: { ...s.build, wallHeight: 3.266, wallThick: 0.2, brush: "w:b" } })),
);

// Box: a drag
await page.evaluate(() => (window as any).__hud.set((s: any) => ({ build: { ...s.build, paintMode: "box" } })));
await mouse.move(600, 560, { steps: 4 });
await mouse.down();
await mouse.move(700, 700, { steps: 10 });
console.log("box tag", (await state()).tag);
await shot("05-box");
await mouse.up();
await page.waitForTimeout(600);
console.log("after box:", await count());
// the box closed round a room: named at the prompt
const prompt = await page.waitForSelector('[data-testid="found-room"] input', { timeout: 5000 }).catch(() => null);
await prompt?.click({ timeout: 5000 }).catch((e) => console.log("prompt click failed:", String(e).slice(0, 200)));
console.log("found-room prompt", !!prompt);
await shot("06a-found-room");
if (prompt) {
  await page.keyboard.type("Nook");
  await kb("Enter");
  await page.waitForTimeout(1200);
}
console.log(
  "rooms",
  await page.evaluate(() => {
    const w = (window as any).__yutopia;
    return w.structure.rooms
      .filter((r: any) => r.floor === w.level && /new-room|Nook/i.test(`${r.key} ${r.props.name}`))
      .map((r: any) => [r.key, r.props.name, r.outline.length]);
  }),
);

// Erase: on the run's first wall
await page.evaluate(() => (window as any).__hud.set((s: any) => ({ build: { ...s.build, paintMode: "erase" } })));
await mouse.move(950, 600, { steps: 6 });
console.log("erase tag", (await state()).tag);
await shot("06-erase");
await mouse.down();
await mouse.up();
await page.waitForTimeout(600);
console.log("after erase:", await count());
await shot("07-after");

// all undone
for (let i = 0; i < 14 && (await state()).walls !== st0.walls; i++) {
  await page.evaluate(() => (window as any).__yutopia.undo());
  await page.waitForTimeout(500);
  const h = await page.evaluate(() => {
    const b = (window as any).__hud.get().build;
    return [b.history.undo, b.history.undoLabel];
  });
  console.log("undo", i, await count(), JSON.stringify(h));
}
console.log("undone", (await state()).walls - st0.walls, "walls left over");
await browser.close();
