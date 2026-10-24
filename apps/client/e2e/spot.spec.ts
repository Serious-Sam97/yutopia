/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { ANA, BIA, enter, test, token } from "./helpers";

// Someone's own bay (docs/plan/43-the-spot.md, phase 1): Ana stands in a free bay of the lot, the
// prompt offers it, X claims it, the board goes up with her name (3D and iso), the side panel has
// her bay; in it again, she gives it up. The dev world is left as it was (her claim taken down).
// YUTOPIA_SHOTS=<dir> saves pictures along the way. On the machine's GPU.
test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const SHOTS = process.env.YUTOPIA_SHOTS;
// D-05 (shared lot.ts): row D's fifth slot, in the building's coords; its board on the pavement's kerb
const BAY = { id: "d-05", label: "D-05", x: -15.8, z: 14.8, post: -12.88 };

async function open(page: Page, view: "3p" | "iso", who: typeof ANA = ANA) {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v }));
  }, view);
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia?.cars, null, { timeout: 60_000 });
}
const board = (page: Page) =>
  page.evaluate((id) => {
    const o = (window as any).__yutopia.room.state.objects.get(`bay-${id}`);
    return o ? { kind: o.kind as string, props: JSON.parse(o.props) } : null;
  }, BAY.id);
/** Into the bay (at `dx` from its middle), on the ground floor. */
const into = (page: Page, dx = 0) =>
  page.evaluate(
    ([x, z]) => {
      // (the ground floor's corner in the building's coords: shared GROUND_OFFSET)
      (window as any).__yutopia.teleport({ x: x + 60, y: z + 10, level: 0 });
    },
    [BAY.x + dx, BAY.z],
  );
/** A picture from my own camera (the building's coords), the 3D view's renderer. */
async function look(page: Page, from: number[], at: number[], file: string) {
  const data = await page.evaluate(
    ([f, a]) => {
      const tp = (window as any).__yutopia.tp;
      const fr = tp.groundsFrame();
      const cam = tp.camera.clone();
      cam.position.set(f[0] - fr.x, f[1] + fr.y, f[2] - fr.z);
      cam.lookAt(a[0] - fr.x, a[1] + fr.y, a[2] - fr.z);
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png");
    },
    [from, at],
  );
  if (SHOTS) writeFileSync(`${SHOTS}/${file}.png`, Buffer.from(data.split(",")[1], "base64"));
}

test("a bay claimed standing in it, the board up with the name, given up again", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "3p");
  // (any bay of Ana's from before: given up, so this one's free to claim)
  await page.evaluate(() => {
    const c = (window as any).__yutopia;
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind === "bayboard" && p.ownerId === c.myUid()) c.room.send("spot:free", { bay: p.bay });
    });
  });
  await expect.poll(() => board(page)).toBeNull();
  await into(page);
  await page.waitForFunction(
    (label) => {
      const p = (window as any).__hud.get().prompt;
      return p?.kind === "spot:claim" && String(p.label).includes(label);
    },
    BAY.label,
    { timeout: 20_000 },
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/game-claim-prompt.png` });
  await page.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(async () => (await board(page))?.props.ownerId, { timeout: 10_000 }).toBeTruthy();
  const b = await board(page);
  expect(b?.kind).toBe("bayboard");
  expect(String(b?.props.ownerName)).toMatch(/^Ana/);
  // mine now: the prompt gives it up, the side panel has it
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "spot:free", null, {
    timeout: 10_000,
  });
  await expect.poll(() => page.evaluate(() => (window as any).__hud.get().myBay)).toBe(BAY.label);
  // the board in 3D: from the aisle, from the pavement
  await page.waitForTimeout(2500);
  await look(page, [-21.5, 1.8, 11], [BAY.post, 1.5, BAY.z], "game-3d-aisle");
  await look(page, [-10.4, 1.75, 12.6], [BAY.post, 1.55, BAY.z], "game-3d-pavement");
  // "My bay": from the doors, back into it
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 60 - 11, y: 10 + 18, level: 0 }));
  await page.waitForTimeout(800);
  await page.evaluate(() => (window as any).__yutopia.teleport("bay"));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = (window as any).__yutopia;
          const p = c.room.state.players.get(c.room.sessionId);
          return [p.x - 60, p.y - 10];
        }),
      { timeout: 10_000 },
    )
    .toEqual([expect.closeTo(BAY.x - 1.6, 0), expect.closeTo(BAY.z, 0)]);
  await page.evaluate(() => (window as any).__hud.set({ side: "people" }));
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/game-side-panel.png` });
  await page.evaluate(() => (window as any).__hud.set({ side: null }));
  // in iso: the board, its label
  await page.close();
  const iso = await page.context().newPage();
  await open(iso, "iso");
  await into(iso, -2.2);
  await iso.waitForTimeout(4000);
  if (SHOTS) await iso.screenshot({ path: `${SHOTS}/game-iso.png` });
  // given up: in it, X
  await into(iso);
  await iso.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "spot:free", null, {
    timeout: 20_000,
  });
  await iso.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(() => board(iso), { timeout: 10_000 }).toBeNull();
  await expect.poll(() => iso.evaluate(() => (window as any).__hud.get().myBay)).toBeNull();
});

test("MOTORS: by a car on show, the dealer's panel, one taken — beside her in the collection bay", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "3p");
  // on the forecourt, by the sedan on show (MOTORS: shared grounds.ts)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 506.4 + 60, y: -393.6 + 10, level: 0 }));
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "motors", null, { timeout: 30_000 });
  // (the vehicles on show are there, and none offers its wheel)
  const show = await page.evaluate(() => {
    const out: string[] = [];
    (window as any).__yutopia.room.state.objects.forEach((o: any) => {
      if (/^motors-/.test(o.id)) out.push(o.id);
    });
    return out.sort();
  });
  expect(show).toHaveLength(8);
  await page.waitForTimeout(2500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/game-motors-prompt.png` });
  await page.evaluate(() => (window as any).__yutopia.interact());
  await expect(page.locator("[data-motors-list]")).toBeVisible();
  await page.locator("[data-motors-model=pickup]").click();
  await page.locator("[data-motors-colour='7']").click();
  await page.locator("[data-motors-plate]").fill("ana.86");
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/game-motors-panel.png` });
  const before = await page.evaluate(() => Date.now());
  await page.locator("[data-motors-take]").click();
  await expect(page.locator("[data-motors-list]")).toBeHidden();
  await expect
    .poll(
      () =>
        page.evaluate((t) => {
          const c = (window as any).__yutopia;
          let found: any = null;
          c.room.state.objects.forEach((o: any) => {
            const p = JSON.parse(o.props);
            if (
              o.kind === "car" &&
              p.ownerId === c.myUid() &&
              !p.retire &&
              parseInt(o.id.split("-").pop(), 36) >= t - 5000
            )
              found = { id: o.id, p };
          });
          return found;
        }, before),
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const mine = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    let found: any = null;
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind === "car" && p.ownerId === c.myUid() && !p.retire) found = p;
    });
    return found;
  });
  expect(mine.model).toBe("pickup");
  expect(mine.plate).toBe("ANA·86");
  expect(mine.variant).toBe(7);
  // the forecourt in 3D: from the street, and the new one by its way in (heights over the town's
  // ground, higher than the lot's)
  await page.waitForTimeout(3000);
  const gy = await page.evaluate(() => (window as any).__yutopia.G.groundAt(520, -392) as number);
  await look(page, [503, gy + 4.6, -406.5], [513, gy + 1.0, -388.5], "game-motors-3d");
  await look(page, [519.4, gy + 1.8, -397.2], [523.8, gy + 1.0, -389.6], "game-motors-new");
  await look(page, [523.4, gy + 1.0, -396.4], [523.8, gy + 0.7, -392], "game-motors-plate");
  // in iso
  await page.close();
  const iso = await page.context().newPage();
  await open(iso, "iso");
  await iso.evaluate(() => (window as any).__yutopia.teleport({ x: 515 + 60, y: -394 + 10, level: 0 }));
  await iso.waitForTimeout(5000);
  if (SHOTS) await iso.screenshot({ path: `${SHOTS}/game-motors-iso.png` });
});

test("the keys, two people: Bia only beside in Ana's car; lent, she drives it, has it on her GPS; taken back", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const a = page;
  const b = await (await browser.newContext()).newPage();
  await open(a, "3p");
  // Ana's own car, a new one from MOTORS (on the forecourt: no pool car beside it to get into instead)
  const mine = () => a.evaluate(() => (window as any).__hud.get().myCar?.id ?? "");
  await a.waitForTimeout(1500);
  const was = await mine();
  await a.evaluate(() => (window as any).__yutopia.teleport({ x: 512 + 60, y: -393.5 + 10, level: 0 }));
  await a.waitForTimeout(2000);
  await a.evaluate(() => (window as any).__yutopia.room.send("car:buy", { model: "sedan", colour: 1, plate: "" }));
  await expect.poll(mine, { timeout: 15_000 }).not.toBe(was);
  // (her keys with nobody to begin with)
  await a.evaluate(() => (window as any).__yutopia.room.send("car:lend", { to: null }));
  await open(b, "iso", BIA);
  const biaUid = await b.evaluate(() => (window as any).__yutopia.myUid());
  // Bia by its side, on the ground floor
  const side = await a.evaluate(() => {
    const c = (window as any).__yutopia;
    const id = (window as any).__hud.get().myCar.id;
    const o = c.room.state.objects.get(id);
    const p = JSON.parse(o.props);
    const w = o.rot % 2 ? 2 : 5;
    const h = o.rot % 2 ? 5 : 2;
    const a = Math.PI + (o.rot % 4) * (Math.PI / 2);
    const x = o.x + w / 2 + (p.dx ?? 0);
    const y = o.y + h / 2 + (p.dz ?? 0);
    // (beside it: its west side when it lies along z — on the forecourt the rail's east of the
    // collection bay — else its south side)
    return Math.abs(Math.sin(a)) > 0.5 ? { x: x - 2.4, y, id } : { x, y: y + 2.4, id };
  });
  await b.evaluate((p) => (window as any).__yutopia.teleport({ x: p.x, y: p.y, level: 0 }), side);
  await b.waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, { timeout: 30_000 });
  // (her iso view drawn round her: a second browser loads slowly)
  await b.waitForTimeout(8000);
  // not hers: in beside
  expect(await b.evaluate(() => (window as any).__hud.get().prompt.label)).toMatch(/^Get in · Ana/);
  if (SHOTS) await b.screenshot({ path: `${SHOTS}/game-keys-beside.png` });
  // Ana, on Bia's card: lend
  await a.evaluate((uid) => (window as any).__hud.set({ inspect: uid }), biaUid);
  await expect(a.locator("[data-keys]")).toContainText("Lend my car keys");
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/game-keys-card.png` });
  await a.locator("[data-keys]").click();
  await expect(a.locator("[data-keys]")).toContainText("Take my keys back");
  // Bia: the keys, the wheel, the side panel, the GPS
  await expect
    .poll(() => b.evaluate(() => (window as any).__hud.get().keys?.from), { timeout: 10_000 })
    .toMatch(/^Ana/);
  await b.waitForFunction(() => /^Drive · Ana/.test((window as any).__hud.get().prompt?.label ?? ""), null, {
    timeout: 10_000,
  });
  await b.evaluate(() => (window as any).__hud.set({ side: "people" }));
  await expect(b.locator("[data-keys-held]")).toBeVisible();
  if (SHOTS) await b.screenshot({ path: `${SHOTS}/game-keys-held.png` });
  await b.evaluate(() => (window as any).__hud.set({ side: null }));
  await b.evaluate(() => (window as any).__yutopia.togglePhone(true));
  await b.waitForTimeout(2200);
  await b.evaluate(() => (window as any).__yutopia.phone.open("maps"));
  await expect(b.locator("[data-gps]")).toBeVisible();
  await b.locator("[data-gps-search]").click();
  await expect(b.locator("[data-gps-place='car:keys']")).toContainText("Ana's car");
  if (SHOTS) await b.locator("[data-gps]").screenshot({ path: `${SHOTS}/game-gps-keys.png` });
  // Ana's GPS: My car, picked
  await a.evaluate(() => (window as any).__hud.set({ inspect: null }));
  await a.evaluate(() => (window as any).__yutopia.togglePhone(true));
  await a.waitForTimeout(2200);
  await a.evaluate(() => (window as any).__yutopia.phone.open("maps"));
  await a.locator("[data-gps-search]").click();
  await a.locator("[data-gps-place='car:mine']").click();
  await expect(a.locator("[data-gps-card]")).toContainText("My car");
  await a.waitForTimeout(1500);
  if (SHOTS) await a.locator("[data-gps]").screenshot({ path: `${SHOTS}/game-gps-mine.png` });
  // taken back: Bia's keys gone, beside again
  await a.evaluate(() => (window as any).__yutopia.room.send("car:lend", { to: null }));
  await expect.poll(() => b.evaluate(() => (window as any).__hud.get().keys), { timeout: 10_000 }).toBeNull();
});

test("row D: a free bay beside a parked car offers its claim; a bay with a pool car in it, from its open end", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page, "iso");
  // row D's plain bays (shared lot.ts: x −15.8, slots 2.8 apart from z −0.6), which have a pool car
  const D = [1, 2, 3, 4, 5, 13, 14, 15, 16, 17];
  const zOf = (s: number) => -0.6 + (s + 0.5) * 2.8;
  const full = await page.evaluate((zs: number[]) => {
    const c = (window as any).__yutopia;
    const cars: { x: number; z: number }[] = [];
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind !== "car" || p.ownerId || p.driven || (p.level ?? 0) !== 0) return;
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      cars.push({ x: o.x + w / 2 + (p.dx ?? 0) - 60, z: o.y + h / 2 + (p.dz ?? 0) - 10 });
    });
    return zs.map((z) => cars.some((q) => Math.abs(q.x + 15.8) < 2.8 && Math.abs(q.z - z) < 1.4));
  }, D.map(zOf));
  const taken = D.filter((_, i) => full[i]);
  const beside = D.filter((s, i) => !full[i] && taken.some((t) => Math.abs(t - s) === 1));
  test.skip(!taken.length || !beside.length, "no pool car in row D to stand by");
  const at = async (x: number, s: number) => {
    await page.evaluate(
      ([xx, zz]) => (window as any).__yutopia.teleport({ x: xx + 60, y: zz + 10, level: 0 }),
      [x, zOf(s)],
    );
    await page.waitForTimeout(1500);
    return page.evaluate(() => (window as any).__hud.get().prompt);
  };
  const label = (s: number) => `D-${String(s).padStart(2, "0")}`;
  // (in the middle of a free one: its claim, not the car next door)
  expect((await at(-15.8, beside[0]))?.label).toContain(`Claim this bay · ${label(beside[0])}`);
  // (a step out of a full one's open end, in the aisle)
  const s = taken[0];
  expect((await at(-19.0, s))?.label).toContain(`Claim this bay · ${label(s)}`);
  await page.evaluate(() => (window as any).__yutopia.interact());
  const id = `bay-d-${String(s).padStart(2, "0")}`;
  await expect.poll(() => page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)).toBe(true);
  // (given up again: the dev world as it was)
  await page.waitForFunction(() => (window as any).__hud.get().prompt?.kind === "spot:free", null, { timeout: 10_000 });
  await page.evaluate(() => (window as any).__yutopia.interact());
  await expect.poll(() => page.evaluate((i) => !!(window as any).__yutopia.room.state.objects.get(i), id)).toBe(false);
});
