/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
// Plan 110's stills (docs/plan/110-the-buildings.md phase 13): the city kinds laid in a God mode draft east of
// the farm (the trees there cleared in the same draft), drawn through a camera of its own; every kind's style
// pictures as God mode's panel shows them. The draft's deleted after: nothing's published.
//   YUTOPIA_SHOTS=<dir> npx playwright test e2e/buildings-shots.spec.ts
import { writeFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { WoodsStroke } from "@yutopia/shared/grounds-brush";
import { ANA, clearDrafts, enter, holdHour, makeDraft, test, token, useWorld } from "./helpers";

test.use({ launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const OUT = process.env.YUTOPIA_SHOTS ?? "/tmp";

type B = {
  kind: string;
  style: string;
  w: number;
  d: number;
  floors: number;
  sign?: string;
  name: string;
  enter?: boolean;
};
const ROWS: B[][] = [
  [
    { kind: "apartments", style: "walk-up", w: 24, d: 18, floors: 5, sign: "THE ELMS", name: "The Elms" },
    { kind: "townhouses", style: "brick-row", w: 30, d: 12, floors: 3, name: "Row" },
    { kind: "office", style: "glass-office", w: 26, d: 24, floors: 7, sign: "MERIDIAN", name: "Meridian" },
    { kind: "cornershop", style: "brick-corner", w: 16, d: 16, floors: 3, sign: "CORNER MART", name: "Corner" },
    {
      kind: "library",
      style: "carnegie",
      w: 26,
      d: 20,
      floors: 1,
      sign: "PUBLIC LIBRARY",
      name: "Library",
      enter: true,
    },
    { kind: "clinic", style: "modern-clinic", w: 22, d: 18, floors: 2, sign: "CLINIC", name: "Clinic" },
  ],
  [
    {
      kind: "school",
      style: "brick-school",
      w: 30,
      d: 22,
      floors: 2,
      sign: "PINE SCHOOL",
      name: "School",
      enter: true,
    },
    { kind: "police", style: "brick-civic", w: 24, d: 18, floors: 2, sign: "POLICE", name: "Police" },
    { kind: "fire", style: "brick-classic", w: 26, d: 20, floors: 2, sign: "ENGINE 7", name: "Fire", enter: true },
    { kind: "garage", style: "concrete-garage", w: 34, d: 34, floors: 4, sign: "PARKING", name: "Garage" },
    { kind: "hotel", style: "deco-hotel", w: 22, d: 20, floors: 5, sign: "ROYAL", name: "Hotel" },
    { kind: "church", style: "gothic", w: 18, d: 26, floors: 1, name: "St Mary", enter: true },
  ],
];

test("plan 110 showcase stills", async ({ page }) => {
  test.setTimeout(400_000);
  const space = await useWorld("demo");
  page.on("pageerror", (e) => console.log(`[page error] ${e.stack ?? e.message}`));
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, quality: "high", view: "3p", cam3p: "chase" }));
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const tok = await token(ANA);
  await clearDrafts(tok);
  await makeDraft(tok, "e2e: showcase");
  await enter(page, tok, space);
  await holdHour(page, Number(process.env.HOUR ?? 11));
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: 600, y: -250, level: 0 }));
  await page.waitForTimeout(4000);
  // the town as it stands: Main Street, Church Street, the farm
  const still = async (name: string, eye: readonly number[], look: readonly number[]) => {
    const data = await page.evaluate(
      ([e, l]) => {
        const y = (window as any).__yutopia;
        const t = y.tp;
        const cam = t.camera.clone();
        cam.fov = 50;
        cam.aspect = 16 / 9;
        cam.updateProjectionMatrix();
        cam.position.set(e[0], y.G.groundAt(e[0], e[2]) + e[1], e[2]);
        cam.lookAt(l[0], y.G.groundAt(l[0], l[2]) + l[1], l[2]);
        cam.updateMatrixWorld();
        t.renderer.render(t.scene, cam);
        return t.renderer.domElement.toDataURL("image/png");
      },
      [eye, look] as const,
    );
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  };
  if (process.env.TOWN !== "0") {
    const spots = [
      ["town-main", { x: 380, y: -404 }, [361, 2.0, -404], [392, 5, -399]],
      ["town-main-shops", { x: 380, y: -404 }, [370, 2.0, -400], [362, 4, -390]],
      ["town-hall", { x: 380, y: -404 }, [394, 2.0, -403], [391, 5, -418]],
      ["town-church-street", { x: 420, y: -480 }, [420, 2.0, -510], [408, 5, -470]],
      ["town-houses", { x: 420, y: -480 }, [419, 2.0, -452], [410, 4, -463]],
      ["town-farm", { x: 452, y: -282 }, [430, 3.0, -276], [452, 4, -306]],
      ["sign-market", { x: 366, y: -400 }, [370, 2.4, -401.5], [368, 4.2, -396]],
      ["in-bar", { x: 456, y: -400 }, [452, 1.8, -394.9], [458, 0.9, -384]],
      ["in-market", { x: 366, y: -400 }, [362, 1.8, -394.9], [368, 0.9, -384]],
      ["in-farmhouse", { x: 447, y: -266 }, [449.5, 1.8, -261], [443, 0.7, -253]],
      ["in-diner", { x: 345, y: -400 }, [341, 1.8, -394.9], [347, 0.9, -386]],
    ] as const;
    for (const [name, at, eye, look] of spots) {
      await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
      await page.waitForTimeout(9000);
      await still(name, eye, look);
    }
    if (process.env.TOWN === "only") return;
    await page.evaluate(() => (window as any).__yutopia.teleport({ x: 600, y: -250, level: 0 }));
    await page.waitForTimeout(4000);
  }
  await page.keyboard.press("o");
  await expect
    .poll(() => page.evaluate(() => (window as any).__hud.get().god).then((g: any) => g.on && g.loaded), {
      timeout: 20_000,
    })
    .toBe(true);
  for (const [ri, row] of ROWS.entries()) {
    const z = -290;
    let x = 476;
    const add = row.map((b, i) => {
      const x0 = Math.round(x);
      x += b.w + 8;
      return {
        key: `god-building-${i + 1}`,
        kind: b.kind,
        name: b.name,
        x0,
        z0: z - b.d,
        x1: x0 + b.w,
        z1: z,
        floors: b.floors,
        face: "s",
        style: b.style,
        ...(b.sign && { sign: b.sign }),
        ...(b.enter && { enter: true }),
      };
    });
    const span = x - 476;
    // (the strip and the ground before it cleared of trees, in the draft)
    const base = await page.evaluate(() => (window as any).__yutopia.god.draftNow());
    const st = new WoodsStroke(base, "clear", "pine", 1, 40);
    for (let zz = z - 40; zz <= z + 75; zz += 14) for (let xx = 450; xx <= 476 + span + 30; xx += 14) st.apply(xx, zz);
    const cleared = st.edits();
    await page.evaluate(
      ([e, a]) => {
        const g = (window as any).__yutopia.god;
        g.change({ ...e, buildings: { add: a } });
      },
      [cleared, add] as const,
    );
    await page.waitForTimeout(14_000);
    const shots: [string, [number, number, number], [number, number, number]][] = [
      [`row${ri + 1}-wide`, [476 + span / 2, 30, z + 70], [476 + span / 2, 4, z - 14]],
      [`row${ri + 1}-left`, [476 + span * 0.12, 2.2, z + 30], [476 + span * 0.3, 8, z - 10]],
      [`row${ri + 1}-mid`, [476 + span * 0.5, 2.2, z + 30], [476 + span * 0.5, 8, z - 10]],
      [`row${ri + 1}-right`, [476 + span * 0.88, 2.2, z + 30], [476 + span * 0.7, 8, z - 10]],
    ];
    // (inside the ones walked into: from just in at the door, looking to the back)
    for (const b of add.filter((u) => u.enter)) {
      const mx = (b.x0 + b.x1) / 2;
      shots.push([`inside-${b.kind}`, [mx - 2, 2.4, b.z1 - 1.2], [mx + 1, 1.2, b.z0 + 1]]);
    }
    for (const [name, eye, look] of shots) {
      const data = await page.evaluate(
        ([e, l]) => {
          const y = (window as any).__yutopia;
          const t = y.tp;
          const cam = t.camera.clone();
          cam.fov = 50;
          cam.aspect = 16 / 9;
          cam.updateProjectionMatrix();
          const g0 = y.G.groundAt(e[0], e[2]);
          cam.position.set(e[0], g0 + e[1], e[2]);
          cam.lookAt(l[0], y.G.terrainAt(l[0], l[2]) + l[1], l[2]);
          cam.updateMatrixWorld();
          t.renderer.render(t.scene, cam);
          return t.renderer.domElement.toDataURL("image/png");
        },
        [eye, look] as const,
      );
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(data.split(",")[1], "base64"));
    }
  }
  // every kind's styles, as the panel draws them
  await page.keyboard.press("7");
  // (the pointer's readout sits over the panel's foot: out of the pictures)
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("p, span, h3"))) {
      if (/^pointer$/i.test(el.textContent?.trim() ?? "")) {
        const box = el.closest(".cabinet") as HTMLElement | null;
        if (box) box.style.display = "none";
      }
    }
  });
  for (const k of [
    "house",
    "townhouses",
    "apartments",
    "farmhouse",
    "shop",
    "cornershop",
    "bar",
    "diner",
    "hotel",
    "gas",
    "office",
    "warehouse",
    "garage",
    "church",
    "school",
    "police",
    "fire",
    "clinic",
    "library",
    "shelter",
    "gatehouse",
    "barn",
    "silo",
    "shed",
    "boathouse",
  ]) {
    await page.locator(`[data-kind="${k}"]`).click();
    await page.locator("[data-style]").first().scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.locator("[data-style] img").count(), { timeout: 30_000 })
      .toBe(
        await page
          .locator("[data-style]")
          .count()
          .then((n) => n - 1),
      );
    await page.waitForTimeout(200);
    await page.locator('[role="radiogroup"]:has([data-style])').screenshot({ path: `${OUT}/styles-${k}.png` });
  }
  await page.keyboard.press("o");
  await clearDrafts(tok);
});
