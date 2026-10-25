/* biome-ignore-all lint/suspicious/noExplicitAny: e2e reads the world's window test hooks */
import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ANA, BIA, enter, test, token, walkTo } from "./helpers";

// Phase 0 of docs/plan/44-the-night.md: the night's mocks, saved to design/screens/night/.
// - From the game itself: tonight as it is, then the same frame with the proposed dark poked into the
//   running view (the sun or moon and the sky's fill off, the sky, ridges, stars and fog black, the
//   eyes as a faint fill); and the iso view with its light map painted over the game's own frame.
// - From the stills (/dev/grounds?shot=night-…, the "pitch" hour): headlights, the torch, a lamp, a
//   blizzard, someone in and out of the light. Notes laid over them in HTML.
// The dev world is left as it was (only Ana teleports; her torch goes back off).
// YUTOPIA_GPU=1 npx playwright test night-shots
if (process.env.YUTOPIA_GPU)
  test.use({
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  });
test.use({ viewport: { width: 1600, height: 900 } });
const OUT = process.env.NIGHT_OUT ?? "../../design/screens/night";

async function open(page: Page, view: "3p" | "iso", who = ANA) {
  await page.addInitScript((v) => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: v }));
  }, view);
  await enter(page, await token(who));
  await page.waitForFunction(() => !!(window as any).__yutopia?.cars, null, { timeout: 60_000 });
}
/** The clock held at `h`, no storm (its 1 s timer would set the hour back). */
const hold = (page: Page, h: number) =>
  page.evaluate((hh) => {
    const c = (window as any).__yutopia;
    c.updateNight = () => {};
    c.hour = hh;
    c.engine.setClock(hh);
    c.tp?.setHour(hh);
    if (c.life) c.life.weather = () => [0, 0];
  }, h);
/** Out on the lot (building coords; the ground floor's corner at (-60, -10)). */
const at = async (page: Page, x: number, z: number) => {
  await page.evaluate(([xx, zz]) => (window as any).__yutopia.teleport({ x: xx + 60, y: zz + 10, level: 0 }), [x, z]);
  await page.waitForTimeout(4000);
};
/** A picture from a camera of my own (building coords), the 3D view's renderer: a data URL. */
const look = (page: Page, from: number[], to: number[]) =>
  page.evaluate(
    ([f, a]) => {
      const tp = (window as any).__yutopia.tp;
      const fr = tp.groundsFrame();
      const cam = tp.camera.clone();
      cam.position.set(f[0] - fr.x, f[1] + fr.y, f[2] - fr.z);
      cam.lookAt(a[0] - fr.x, a[1] + fr.y, a[2] - fr.z);
      cam.updateMatrixWorld();
      tp.renderer.render(tp.scene, cam);
      return tp.renderer.domElement.toDataURL("image/png") as string;
    },
    [from, to],
  );

/** The proposed dark (N1, N3), poked into the running 3D view: `eyes` 0 (just out of the light)
 *  … 1 (adjusted). The sun or moon and the sky's fill go (everything under the sky is lit by what
 *  lights it, nothing else); the sky, the ridges, the stars and the fog go black; the eyes are a
 *  faint fill that the black fog takes back with distance. The shared uniforms are found through
 *  a compiled material's own (the view doesn't hand them out). */
const dark = (page: Page, eyes: number) =>
  page.evaluate((e) => {
    const tp = (window as any).__yutopia.tp;
    const w = window as any;
    if (!w.__night) {
      const u: Record<string, any> = {};
      tp.scene.traverse((o: any) => {
        for (const m of [o.material].flat()) {
          const pu = m && tp.renderer.properties.get(m)?.uniforms;
          if (!pu) continue;
          for (const k of ["landLight", "lmGlowK"]) if (pu[k] && !u[k]) u[k] = pu[k];
        }
      });
      const wf = tp.weatherFrame;
      tp.weatherFrame = function (this: any) {
        wf.call(this);
        if (w.__night) this.scene.fog.color.setRGB(0, 0, 0);
      };
      // the lamps' pools a touch stronger: islands
      if (u.lmGlowK) u.lmGlowK.value *= 1.3;
      w.__night = { u };
    }
    const n = w.__night;
    // no moon, no sky: the sun and the fill off (outdoor shots only: the rooms share them).
    // (linear: 0.01 on white snow is already grey on screen)
    tp.sun.intensity = 0;
    tp.hemi.intensity = 2.1 * (0.0015 + 0.0045 * e);
    n.u.landLight?.value.setRGB(1, 1, 1.15);
    // the sky near black, no stars (the overcast); the far ridges with it
    const d = tp.around.domeMat.uniforms;
    d.top.value.setRGB(0.0008, 0.001, 0.0016);
    d.mid.value.setRGB(0.0016, 0.002, 0.003);
    d.bot.value.setRGB(0.0024, 0.003, 0.0045);
    tp.around.horizon.setRGB(0, 0, 0);
    tp.around.stars.visible = false;
    tp.around.grounds?.statics.ridgeMat.color.setRGB(0.006, 0.007, 0.01);
    tp.scene.traverse((o: any) => {
      // the falling snow: seen only in a light (here, as dark as what's behind it)
      if (o.isPoints) o.material.color.setRGB(0.05, 0.055, 0.065);
      // no shine off the paint in the dark
      for (const m of [o.material].flat()) if (m && "envMapIntensity" in m) m.envMapIntensity = 0.04;
    });
  }, eyes);

/** Data URLs laid out on one canvas (cols × rows of `w` × `h`), a label on each, saved. */
async function sheet(
  page: Page,
  file: string,
  shots: { url: string; label: string }[],
  cols: number,
  w = 800,
  h = 450,
) {
  const rows = Math.ceil(shots.length / cols);
  const data = await page.evaluate(
    async ({ shots, cols, rows, w, h }) => {
      const c = document.createElement("canvas");
      c.width = cols * w;
      c.height = rows * h;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      for (const [i, s] of shots.entries()) {
        const img = new Image();
        img.src = s.url;
        await img.decode();
        const x = (i % cols) * w;
        const y = Math.floor(i / cols) * h;
        g.drawImage(img, x, y, w, h);
        g.font = "600 15px Inter, system-ui, sans-serif";
        const tw = g.measureText(s.label).width;
        g.fillStyle = "rgba(243,234,214,.94)";
        g.beginPath();
        g.roundRect(x + 14, y + 14, tw + 22, 28, 7);
        g.fill();
        g.fillStyle = "#2a1a12";
        g.fillText(s.label, x + 25, y + 33);
      }
      g.fillStyle = "#000";
      for (let i = 1; i < cols; i++) g.fillRect(i * w - 1, 0, 2, c.height);
      for (let i = 1; i < rows; i++) g.fillRect(0, i * h - 1, c.width, 2);
      return c.toDataURL("image/png");
    },
    { shots, cols, rows, w, h },
  );
  writeFileSync(`${OUT}/${file}.png`, Buffer.from(data.split(",")[1], "base64"));
}

// the mocks' notes: numbered paper cards, as the earlier plans' mocks
const NOTE_CSS = `<style>
.mk-note{position:absolute;max-width:270px;padding:9px 12px 10px;border-radius:8px;background:#f3ead6;color:#2a1a12;
  font:500 13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.mk-note b{font-weight:700}
.mk-note .n{display:inline-grid;place-items:center;width:20px;height:20px;margin:0 7px 0 -2px;border-radius:50%;
  background:#b5562f;color:#fff3e0;font:700 11px Inter,system-ui,sans-serif;vertical-align:1px}
.mk-ring{position:absolute;border:2px dashed #ffe9a8;border-radius:50%;box-shadow:0 0 14px rgba(255,233,168,.35)}
.mk-tag{position:absolute;transform:translate(-50%,-100%);display:flex;align-items:center;gap:6px;height:18px;padding:0 9px 0 7px;
  border-radius:9px;background:rgba(30,23,18,.78);color:#efe4cc;font:12px/18px 'Share Tech Mono',ui-monospace,monospace;letter-spacing:.3px;white-space:nowrap}
.mk-tag i{width:6.4px;height:6.4px;border-radius:50%;background:#6fbf73}
</style>`;
const note = (n: number, x: number, y: number, html: string, w = 270) =>
  `<div class="mk-note" style="left:${x}px;top:${y}px;max-width:${w}px"><span class="n">${n}</span>${html}</div>`;
const ring = (x: number, y: number, r: number) =>
  `<div class="mk-ring" style="left:${x - r}px;top:${y - r * 1.6}px;width:${r * 2}px;height:${r * 3.2}px"></div>`;
const tag = (x: number, y: number, name: string) =>
  `<div class="mk-tag" style="left:${x}px;top:${y}px"><i></i>${name}</div>`;

/** A still drawn, the notes over it, saved. `html` gets people's heads on screen (the shot's order). */
async function still(page: Page, shot: string, name: string, html: (heads: { x: number; y: number }[]) => string) {
  await page.goto(`/dev/grounds?shot=${shot.replace("?", "&")}`);
  await page.waitForFunction(() => (window as any).__shot === true, null, { timeout: 180_000 });
  const heads = await page.evaluate(() => {
    const g = (window as any).__g;
    const v = g.cam.position.clone();
    return g.people.map((p: any) => {
      // (where the body stands: the drawing's own root, at the person's x and z)
      let y = 0;
      g.scene.traverse((o: any) => {
        if (o.position && Math.abs(o.position.x - p.x) < 1e-3 && Math.abs(o.position.z - p.z) < 1e-3) y = o.position.y;
      });
      const s = v.set(p.x, y + 2.05, p.z).project(g.cam);
      return { x: ((s.x + 1) / 2) * innerWidth, y: ((1 - s.y) / 2) * innerHeight };
    });
  });
  await page.evaluate((h) => {
    document.querySelector("[data-status]")?.remove();
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:50;font-family:inherit";
    d.innerHTML = h;
    document.body.appendChild(d);
  }, NOTE_CSS + html(heads));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test("the lot tonight and in the dark; stepping out of the lobby (the game itself)", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "3p");
  await at(page, -8, 30);
  await hold(page, 23);
  await page.waitForTimeout(1500);
  const LOW = [
    [-4, 2.4, 30],
    [-40, 1, 28],
  ];
  const HIGH = [
    [-2, 9, 52],
    [-40, 0, 12],
  ];
  const DOOR = [
    [-11.4, 1.75, 10.5],
    [-17, 0.8, 30],
  ];
  const now = [await look(page, LOW[0], LOW[1]), await look(page, HIGH[0], HIGH[1])];
  const doorNow = await look(page, DOOR[0], DOOR[1]);
  await dark(page, 0.6);
  await page.waitForTimeout(500);
  const then = [await look(page, LOW[0], LOW[1]), await look(page, HIGH[0], HIGH[1])];
  await sheet(
    page,
    "01-lot-now-vs-dark",
    [
      { url: now[0], label: "Tonight, as it is" },
      { url: now[1], label: "Tonight, as it is (from above)" },
      { url: then[0], label: "The dark: what lamps light, nothing else" },
      { url: then[1], label: "The dark (from above)" },
    ],
    2,
  );
  const eyes: string[] = [];
  for (const e of [0, 0.3, 1]) {
    await dark(page, e);
    await page.waitForTimeout(300);
    eyes.push(await look(page, DOOR[0], DOOR[1]));
  }
  await sheet(
    page,
    "04-lobby-door",
    [
      { url: doorNow, label: "Out of the lobby tonight, as it is" },
      { url: eyes[0], label: "The dark · 0 s out of the light: blind" },
      { url: eyes[1], label: "5 s: the nearest shapes" },
      { url: eyes[2], label: "40 s: adjusted, grey and colourless" },
    ],
    2,
  );
});

test("the iso view: tonight, then its light map over the land (the game itself)", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "iso");
  await at(page, -10, 28);
  await hold(page, 23);
  // (facing west, out over the lot: her beam up and to the left on screen)
  await walkTo(page, -14 + 60, 28 + 10);
  await page.evaluate(() => (window as any).__yutopia.toggleTorch());
  await page.waitForTimeout(2500);
  try {
    await page.evaluate(() => {
      for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
    });
    const now = await page.screenshot();
    // the light map: black over the land and the lot; cut out of it the rooms (indoors is
    // untouched), the lamps' pools and her beam
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      const e = c.engine;
      const cv = e.app.canvas as HTMLCanvasElement;
      const r = cv.getBoundingClientRect();
      const o = document.createElement("canvas");
      o.width = r.width;
      o.height = r.height;
      o.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none`;
      cv.parentElement?.insertBefore(o, cv.nextSibling);
      const g = o.getContext("2d") as CanvasRenderingContext2D;
      const z = e.zoom;
      const S = (x: number, y: number): [number, number] => [
        e.world.position.x + (x - y) * 32 * z,
        e.world.position.y + (x + y) * 16 * z,
      ];
      g.fillStyle = "rgba(0,0,0,0.955)";
      g.fillRect(0, 0, o.width, o.height);
      g.globalCompositeOperation = "destination-out";
      // the rooms
      const m = e.map;
      g.fillStyle = "#000";
      for (let y = 0; y < m.height; y++)
        for (let x = 0; x < m.width; x++) {
          const ch = m.tiles[y][x];
          if (ch === " " || ch === "a" || ch === "c") continue;
          const p = [S(x, y), S(x + 1, y), S(x + 1, y + 1), S(x, y + 1)];
          g.beginPath();
          g.moveTo(...p[0]);
          for (const q of p.slice(1)) g.lineTo(...q);
          g.closePath();
          g.fill();
        }
      // a soft pool (radius in tiles) on the ground: an ellipse, as the iso grid squashes a circle
      const pool = (x: number, y: number, R: number, k: number) => {
        const [sx, sy] = S(x, y);
        g.save();
        g.translate(sx, sy);
        g.scale(1, 0.5);
        const rr = R * 32 * Math.SQRT2 * z;
        const grd = g.createRadialGradient(0, 0, 0, 0, 0, rr);
        grd.addColorStop(0, `rgba(0,0,0,${k})`);
        grd.addColorStop(0.55, `rgba(0,0,0,${k * 0.6})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(0, 0, rr, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      c.room.state.objects.forEach((ob: any) => {
        if (ob.kind === "lamp_post" && (ob.level ?? 0) === 0) pool(ob.x + 1.2, ob.y + 0.6, 5.5, 0.97);
      });
      // her beam: west (-x), a cone of 9 tiles, ±0.28 rad
      const me = c.meTile();
      const [ax, ay] = [me.x + 0.5, me.y + 0.5];
      const L = 9;
      const tip = (a: number) => S(ax + Math.cos(Math.PI + a) * L, ay + Math.sin(Math.PI + a) * L);
      const [hx, hy] = S(ax, ay);
      const grd = g.createRadialGradient(hx, hy, 0, hx, hy, L * 32 * Math.SQRT2 * z * 0.9);
      grd.addColorStop(0, "rgba(0,0,0,1)");
      grd.addColorStop(0.7, "rgba(0,0,0,0.75)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(hx, hy);
      for (let a = -0.28; a <= 0.281; a += 0.04) g.lineTo(...tip(a));
      g.closePath();
      g.fill();
      // …and round her feet, faintly: you always see where you are
      pool(ax, ay, 1.2, 0.5);
    });
    await page.waitForTimeout(300);
    const then = await page.screenshot();
    await sheet(
      page,
      "07-iso-night",
      [
        { url: `data:image/png;base64,${now.toString("base64")}`, label: "Iso tonight, as it is" },
        { url: `data:image/png;base64,${then.toString("base64")}`, label: "Iso in the dark: its light map" },
      ],
      1,
      1600,
      900,
    );
  } finally {
    await page.evaluate(() => {
      const c = (window as any).__yutopia;
      if (c.room?.state.players.get(c.room.sessionId)?.torch) c.toggleTorch();
    });
  }
});

test("the stills: headlights, the torch, a lamp, a blizzard, people in and out of the light", async ({ page }) => {
  test.setTimeout(600_000);
  await still(
    page,
    "night-driveway",
    "02-driveway-headlights",
    () =>
      note(
        1,
        40,
        620,
        "<b>Headlights are real light.</b> Bia's car lights the verge, the poles and the snow ahead of it. Only your car and the nearest other one get a real light; cars further off keep today's beam drawn on the snow.",
        330,
      ) +
      note(
        2,
        1180,
        150,
        "<b>Lamps stay as bright as they are.</b> They're points in the black a long way off, past the fog.",
        300,
      ) +
      note(3, 120, 270, "<b>Ana walks the verge</b>, a black shape against the lamp's pool behind her.", 250),
  );
  await still(
    page,
    "night-woods",
    "03-woods-torch",
    () =>
      note(
        1,
        40,
        40,
        "<b>The torch is the only light.</b> Away from it, the woods are black: no moon, no stars, no fill from the sky.",
        320,
      ) +
      note(
        2,
        1180,
        620,
        "<b>Your own body</b> is always drawn faintly, so you know where you are (here as Cai, from behind).",
        320,
      ),
  );
  await still(page, "night-woods?eyes=0", "03b-woods-torch-eyes-0", () =>
    note(1, 40, 40, "<b>Eyes 0</b>: just out of a light. Nothing but the beam.", 300),
  );
  await still(page, "night-woods?eyes=1", "03c-woods-torch-eyes-1", () =>
    note(
      1,
      40,
      40,
      "<b>Eyes 1</b>: after ~40 s in the dark. The trail at your feet and the nearest trunks come back, grey.",
      320,
    ),
  );
  await still(
    page,
    "night-lamp",
    "05-lamp-island",
    (h) =>
      ring(h[1].x, h[1].y + 70, 34) +
      note(1, 40, 40, "<b>A lamp is an island.</b> The guard on the bench is seen because he sits in its pool.", 300) +
      note(
        2,
        Math.min(1290, h[1].x - 300),
        Math.max(40, h[1].y - 150),
        "<b>Bia stands here</b>, past the pool's edge: only its last glow catches her, a shape you might miss. Her name stays hidden until she's lit past the threshold (N4).",
        290,
      ),
  );
  await still(
    page,
    "night-woods?storm=1&snow=30000",
    "06-blizzard-night-torch",
    () =>
      note(
        1,
        40,
        40,
        "<b>A blizzard at night</b>: the fog stays black (today it turns pale), and the snow driven past shows only near you.",
        330,
      ) +
      note(
        2,
        40,
        720,
        "<i>Not in this still:</i> the flakes inside the beam, lit white. That needs the snow drawn lit (phase 1).",
        330,
      ),
  );
  await still(
    page,
    "night-names-out",
    "08a-names-out",
    (h) =>
      ring(h[1].x, h[1].y + 70, 34) +
      note(
        1,
        Math.min(1290, h[1].x + 60),
        Math.max(40, h[1].y - 120),
        "<b>Bia is here</b>, nine steps ahead and off your beam. Her name tag is hidden too, until a light finds her or she's within 2.5 tiles.",
        290,
      ) +
      note(2, 40, 40, "<b>Her chat bubble would still show</b> (you can hear someone talk in the dark).", 300),
  );
  await still(
    page,
    "night-names-in",
    "08b-names-in",
    (h) =>
      tag(h[1].x, h[1].y, "Bia Demo") +
      note(
        1,
        Math.min(1290, h[1].x + 70),
        Math.max(40, h[1].y - 40),
        "<b>In your beam</b>: her body and her name come back together.",
        260,
      ),
  );
});

// Phase 1 built (docs/plan/44-the-night.md): the same frames as 01, 04 and 07 from the game as it
// now is at 23:00, nothing poked; saved to design/screens/night/built/.
test("built: the dark in the game itself (3D and iso)", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const BUILT = `${OUT}/built`;
  await open(page, "3p");
  await at(page, -8, 30);
  await hold(page, 23);
  await page.waitForTimeout(2500);
  const shot = async (file: string, from: number[], to: number[]) => {
    const url = await look(page, from, to);
    writeFileSync(`${BUILT}/${file}.png`, Buffer.from(url.split(",")[1], "base64"));
  };
  await shot("3d-lot-low", [-4, 2.4, 30], [-40, 1, 28]);
  await shot("3d-lot-high", [-2, 9, 52], [-40, 0, 12]);
  await shot("3d-door", [-11.4, 1.75, 10.5], [-17, 0.8, 30]);
  await shot("3d-woods", [-60, 4, -60], [-120, 1, -120]);
  await shot("3d-hq", [-36, 4, 26], [-8, 2, 18]);
  await page.screenshot({ path: `${BUILT}/3d-game.png` });
  // out in the snow off the lot, the torch on: the game's own camera behind her (the bloom, the haze)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
  await page.waitForTimeout(4000);
  await hold(page, 23);
  await page.evaluate(() => (window as any).__yutopia.toggleTorch());
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
  });
  await page.screenshot({ path: `${BUILT}/3d-torch.png` });
  await page.evaluate(() => (window as any).__yutopia.toggleTorch());
  const iso = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await open(iso, "iso");
  await at(iso, -10, 28);
  await hold(iso, 23);
  await iso.waitForTimeout(2500);
  await iso.evaluate(() => {
    for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
  });
  await iso.screenshot({ path: `${BUILT}/iso-lot.png` });
});

// Phase 2 (N2): a lot car with its lamps on at night (Ana in it), Bia ten steps ahead of its nose:
// the headlamps are real light on her and the lot, from Ana's seat and from Bia's side; then Bia
// in iso. Saved to design/screens/night/built/. Ana gets out after (the car stays in its bay).
test("built: headlamps on someone (3D and iso)", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const BUILT = `${OUT}/built`;
  const a = page;
  await open(a, "3p");
  await hold(a, 23);
  await a.evaluate(() => (window as any).__yutopia.room.send("mod:cars", {}));
  await a.waitForTimeout(800);
  const car = await a.evaluate(() => {
    const c = (window as any).__yutopia;
    const out: any[] = [];
    c.room.state.objects.forEach((o: any) => {
      const p = JSON.parse(o.props);
      if (o.kind !== "car" || p.driven || p.model === "offroad") return;
      const w = o.rot % 2 ? 2 : 5;
      const h = o.rot % 2 ? 5 : 2;
      out.push({
        id: o.id,
        x: o.x + w / 2 + (p.dx ?? 0),
        y: o.y + h / 2 + (p.dz ?? 0),
        a: Math.PI + (o.rot % 4) * (Math.PI / 2),
      });
    });
    return out[0];
  });
  const nose = (k: number) => ({ x: car.x + Math.cos(car.a) * k, y: car.y + Math.sin(car.a) * k });
  // (by its nose in the aisle; a free bay across it offers itself instead — docs/plan/43: closer then)
  for (const k of [3.4, 2.9, 2.5]) {
    await a.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), nose(k));
    const ok = await a
      .waitForFunction(() => /^car/.test((window as any).__hud.get().prompt?.kind ?? ""), null, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await a.evaluate(() => (window as any).__yutopia.interact());
  await expect
    .poll(
      () =>
        a.evaluate(
          () => (window as any).__yutopia.room.state.players.get((window as any).__yutopia.room.sessionId).busy,
        ),
      { timeout: 10_000 },
    )
    .toMatch(/^drive:car:/);
  const b = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await open(b, "3p", BIA);
    await hold(b, 23);
    const at = nose(10);
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
    await b.waitForTimeout(5000);
    await hold(a, 23);
    await a.waitForTimeout(2500);
    await a.evaluate(() => {
      for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
    });
    await a.screenshot({ path: `${BUILT}/3d-headlamps-driver.png` });
    // Bia's own view: from beside her, looking back at the car (building coords: the floor's + (-60, -10))
    const side = { x: at.x - 60 + Math.sin(car.a) * 4, z: at.y - 10 - Math.cos(car.a) * 4 };
    const url = await look(
      b,
      [side.x + Math.cos(car.a) * 3, 2.2, side.z + Math.sin(car.a) * 3],
      [car.x - 60, 0.8, car.y - 10],
    );
    writeFileSync(`${BUILT}/3d-headlamps-side.png`, Buffer.from(url.split(",")[1], "base64"));
    const lit = await b.evaluate(() => {
      const tp = (window as any).__yutopia.tp;
      return tp.carBeams.map((s: any) => s.intensity);
    });
    console.log("Bia's view: the real headlamps", lit);
    // the glare on her: in front of the car (in its beams) and behind it
    const glare = await b.evaluate(
      ([f, r]) => {
        const c = (window as any).__yutopia;
        const tp = c.tp;
        return [tp.glareAt(f.x, f.y, c.room.sessionId), tp.glareAt(r.x, r.y, c.room.sessionId)];
      },
      [at, nose(-8)],
    );
    console.log("glare in front, behind", glare);
    expect(glare[0], "headlamps in her face").toBeGreaterThan(0.2);
    expect(glare[1], "behind the car").toBeLessThan(0.15);
    // iso: the beam on the ground, on her (Bia again, in iso)
    await b.context().close();
    const iso = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    await open(iso, "iso", BIA);
    await hold(iso, 23);
    await iso.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), at);
    await iso.waitForTimeout(4000);
    await iso.evaluate(() => {
      for (const n of document.querySelectorAll("nextjs-portal")) n.remove();
    });
    await iso.screenshot({ path: `${BUILT}/iso-headlamps.png` });
  } finally {
    await a.evaluate(() => (window as any).__yutopia.interact());
  }
});

// Phase 3 (N3): the eyes. Out on the lawn at 23:00 they adjust (frames at ~1, 6 and 42 s, the same
// camera); into a lamp's pool, put out within a second. Saved to design/screens/night/built/.
test("built: the eyes adjust, and a lamp puts them out", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "3p");
  await hold(page, 23);
  const eyes = () => page.evaluate(() => (window as any).__yutopia.tp.around.eyes as number);
  // (indoors first: the dark's chunk loads the first time out, and the eyes start from the rooms' light)
  await page.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
  await page.waitForFunction(() => (window as any).__yutopia.engine?.grounds?.land.visible, null, { timeout: 60_000 });
  await hold(page, 23);
  const frames: { url: string; label: string }[] = [];
  const shot = async (label: string) => {
    const e = await eyes();
    frames.push({ url: await look(page, [-102, 3.2, -44], [-90, 0.6, -36]), label: `${label} · eyes ${e.toFixed(2)}` });
    return e;
  };
  await page.waitForTimeout(1000);
  const e1 = await shot("1 s out");
  await page.waitForTimeout(5000);
  const e6 = await shot("6 s");
  await page.waitForTimeout(36_000);
  const e42 = await shot("42 s");
  console.log("eyes", e1, e6, e42);
  expect(e42).toBeGreaterThan(0.95);
  expect(e1).toBeLessThan(0.05);
  // under one of the lot's lamps (its head out over the aisle): put out
  const lamp = await page.evaluate(() => {
    const c = (window as any).__yutopia;
    let at: { x: number; y: number } | null = null;
    c.room.state.objects.forEach((o: any) => {
      if (!at && o.kind === "lamp_post") at = { x: o.x + 1.4, y: o.y + 0.5 };
    });
    return at;
  });
  expect(lamp, "a lamp post on the lot").toBeTruthy();
  await page.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), lamp as { x: number; y: number });
  console.log(
    "glare under it",
    await page.evaluate(
      (p) => {
        const c = (window as any).__yutopia;
        return c.tp.glareAt(p.x, p.y, c.room.sessionId);
      },
      lamp as { x: number; y: number },
    ),
  );
  await page.waitForTimeout(1200);
  const inLamp = await eyes();
  console.log("in a lamp's pool", inLamp);
  expect(inLamp).toBeLessThan(0.05);
  await sheet(page, "built/3d-eyes", [...frames, { url: frames[0].url, label: "(back in a light: as at 1 s)" }], 2);
});

// Phase 4 (N4): seen and unseen. Ana out on the lawn at 23:00, her torch on; Bia eight steps off
// to the side of the beam: no name over her in Ana's view (3D), her body as dark as the snow; then
// six steps along the beam: her name back. Then the same in iso. Saved to design/screens/night/built/.
test("built: seen and unseen (two people, 3D and iso)", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const BUILT = `${OUT}/built`;
  const a = page;
  await open(a, "3p");
  await hold(a, 23);
  await a.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
  await a.waitForFunction(() => (window as any).__yutopia.engine?.grounds?.land.visible, null, { timeout: 60_000 });
  await hold(a, 23);
  await a.evaluate(() => (window as any).__yutopia.toggleTorch());
  const b = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  try {
    await open(b, "3p", BIA);
    await hold(b, 23);
    const bid = await b.evaluate(() => (window as any).__yutopia.room.sessionId as string);
    await a.waitForTimeout(2500);
    // Ana's beam, as her view has it
    const beam = await a.evaluate(() => {
      const c = (window as any).__yutopia;
      const t = c.tp.torch3.find((x: any) => x.on && x.who === c.room.sessionId);
      return t ? { x: t.on.x, y: t.on.y, yaw: t.on.yaw } : null;
    });
    expect(beam, "Ana's torch on").toBeTruthy();
    const B = beam as { x: number; y: number; yaw: number };
    const along = (k: number, side: number) => ({
      x: B.x + Math.cos(B.yaw) * k - Math.sin(B.yaw) * side,
      y: B.y + Math.sin(B.yaw) * k + Math.cos(B.yaw) * side,
    });
    const state = () =>
      a.evaluate((id) => {
        const tp = (window as any).__yutopia.tp;
        const t = tp.tagEls.get(id);
        const pill = t?.name.parentElement as HTMLElement | undefined;
        return {
          unseen: tp.unseen.has(id),
          name: pill ? pill.style.display !== "none" && t.root.style.display !== "none" : false,
        };
      }, bid);
    // off to the side, out of the beam
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), along(6, 8));
    await a.waitForTimeout(3000);
    const off = await state();
    await a.screenshot({ path: `${BUILT}/3d-unseen.png` });
    // in the beam
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), along(6, 0));
    await a.waitForTimeout(3000);
    const on = await state();
    await a.screenshot({ path: `${BUILT}/3d-seen.png` });
    console.log("Bia off the beam", off, "in it", on);
    expect(off.unseen, "off the beam: unseen").toBe(true);
    expect(off.name, "off the beam: no name").toBe(false);
    expect(on.unseen, "in the beam: seen").toBe(false);
    expect(on.name, "in the beam: her name").toBe(true);
    // iso: Ana again, in iso (Bia stays in the beam's place): her tag shown; then off it, hidden
    await a.evaluate(() => (window as any).__yutopia.toggleTorch());
    await b.evaluate((p) => (window as any).__yutopia.teleport({ ...p, level: 0 }), along(6, 8));
    const iso = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    await a
      .context()
      .close()
      .catch(() => {});
    await open(iso, "iso");
    await hold(iso, 23);
    await iso.evaluate(() => (window as any).__yutopia.teleport({ x: -40, y: -30, level: 0 }));
    await iso.waitForTimeout(5000);
    await hold(iso, 23);
    await iso.waitForTimeout(1500);
    const isoTag = await iso.evaluate((id) => (window as any).__yutopia.engine.avatars.get(id)?.tag.visible, bid);
    await iso.screenshot({ path: `${BUILT}/iso-unseen.png` });
    console.log("iso: Bia's tag off every light", isoTag);
    expect(isoTag, "iso: no name out of every light").toBe(false);
  } finally {
    await b
      .context()
      .close()
      .catch(() => {});
  }
});
