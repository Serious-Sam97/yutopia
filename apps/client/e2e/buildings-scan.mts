/* biome-ignore-all lint/suspicious/noExplicitAny: reads the world's window test hooks */
// Plan 111 phase 0 — the buildings' scan (docs/plan/111-buildings-fixes.md). Run against the dev client, as Bia.
//
// 1. **Each kind × style on its own**: built in a scene of its own from the kit (grounds3d.ts' dev `__kit`), drawn
//    through the game's renderer and materials from four sides, at 10, 30 and 80 m past its plot's edge. For each
//    view it counts:
//    - flicker: pixels that flip when the camera's nudged by under a millimetre (depth fights);
//    - see-through: pixels that change when the materials are two-sided (a face seen from its back: a hole).
// 2. **Cull truth**: in town, the view's culling on vs off at a few spots, four ways each. Any pixel that differs is
//    something wrongly left out (plan 111's invisible buildings).
//
//   node --experimental-strip-types e2e/buildings-scan.mts <out dir> [kind …]
//   ONLY=scan|cull, QUALITY=high
// The report goes to <out dir>/scan.md, and the worst views' stills (magenta: the pixels counted) beside it.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, request } from "@playwright/test";

const OUT = process.argv[2];
if (!OUT) throw new Error("an out dir");
const kindsWanted = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
const base = process.env.BASE ?? "http://localhost:3100";
const api = process.env.YUTOPIA_E2E_API ?? "http://localhost:8100";
const only = process.env.ONLY ?? "";
const ctx = await request.newContext();
const tok = (
  await (
    await ctx.post(`${api}/api/login`, {
      data: { email: "bia@yutopia.test", password: process.env.YUTOPIA_DEMO_PASSWORD ?? "yutopia-demo" },
      headers: { Accept: "application/json" },
    })
  ).json()
).token;
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
await page.addInitScript(
  ([t, q]) => {
    localStorage.setItem("yutopia:token", t);
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: q, view: "3p" }));
  },
  [tok, process.env.QUALITY ?? "high"] as const,
);
await page.goto(base);
await page.waitForFunction(() => (window as any).__hud?.get()?.phase === "ready", null, { timeout: 240_000 });
await page.waitForFunction(() => !!(window as any).__kit && !!(window as any).__yutopia?.tp?.around?.grounds, null, {
  timeout: 120_000,
});
await page.evaluate(() => (window as any).__kit.loadKit());

type View = { name: string; flicker: number; through: number; url?: string };
const lines: string[] = [`# Buildings scan — ${new Date().toISOString().slice(0, 16)}`, ""];

// ── 1. each kind × style ──
if (only !== "cull") {
  const styles: [string, string][] = await page.evaluate(
    (want) =>
      Object.entries((window as any).__kit.KINDS)
        .filter(([k]) => !want.length || want.includes(k))
        .flatMap(([k, d]: any) => d.styles.map((s: any) => [k, s.id])),
    kindsWanted,
  );
  lines.push(
    "## Kinds × styles",
    "",
    "flicker / see-through pixels (of 480×270), worst of four sides, at 10 · 30 · 80 m",
    "",
  );
  lines.push("| kind | style | 10 m | 30 m | 80 m |", "|---|---|---|---|---|");
  let total = 0;
  for (const [kind, style] of styles) {
    const views: View[] = await page.evaluate(
      ([kind, style]) => {
        const K = (window as any).__kit;
        const y = (window as any).__yutopia;
        const t = y.tp;
        const T = t.scene.constructor; // three's Scene
        const kd = K.KINDS[kind];
        const w = Math.round(Math.min(kd.max, Math.max(kd.min, kd.min + (kd.max - kd.min) * 0.4)));
        const d = Math.round(Math.max(kd.min, w * 0.8));
        const floors = Math.max(kd.floors[0], Math.min(kd.floors[1], 3));
        const b = {
          key: `scan-${kind}-${style}`,
          kind,
          name: kd.name,
          x0: 0,
          z0: 0,
          x1: w,
          z1: d,
          floors,
          face: "s",
          style,
          ...(kd.sign && { sign: kd.name.toUpperCase().slice(0, 10) }),
        };
        const L = K.layoutOf(b);
        if (!L) return [];
        const scene = new T();
        scene.background = t.scene.background;
        scene.environment = t.scene.environment;
        // (the light: the game's sun and sky, borrowed)
        t.scene.traverse((o: any) => {
          if (o.isHemisphereLight || o.isAmbientLight) scene.add(o.clone());
          if (o.isDirectionalLight) {
            const l = o.clone();
            l.castShadow = false;
            l.position.set(-40, 80, 60);
            l.target.position.set(0, 0, 0);
            scene.add(l, l.target);
          }
        });
        const { near } = K.kitBatches(L, 0, K.coloursOf(b), K.roomUse(kind));
        const meshes: any[] = [];
        let Mesh: any = null;
        t.scene.traverse((o: any) => {
          if (!Mesh && o.type === "Mesh") Mesh = o.constructor;
        });
        for (const [k, a] of near) {
          if (a.empty) continue;
          const m = new Mesh(
            a.build(),
            K.kitMaterial(k, () => {}),
          );
          m.userData.real = m.material;
          // (a colour of its own, from its key)
          let h = 0;
          for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
          m.userData.flat = K.flat(((h * 2654435761) >>> 8) & 0xffffff);
          meshes.push(m);
          scene.add(m);
        }
        const mats = new Set(meshes.map((m) => m.material));
        const W = 480;
        const H = 270;
        const cam = t.camera.clone();
        cam.fov = 50;
        cam.aspect = W / H;
        cam.near = 0.1;
        cam.far = 1400;
        cam.updateProjectionMatrix();
        const c2 = document.createElement("canvas");
        c2.width = W;
        c2.height = H;
        const g2 = c2.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        const r = t.renderer;
        // (into a target with no MSAA, read back: a nudge flips only what fights, not the edges' samples)
        const rt = K.target(W, H);
        const px = new Uint8Array(W * H * 4);
        const shot = () => {
          r.setRenderTarget(rt);
          r.render(scene, cam);
          r.readRenderTargetPixels(rt, 0, 0, W, H, px);
          r.setRenderTarget(null);
          // (rows bottom-up: flipped for the picture)
          const out = new Uint8ClampedArray(W * H * 4);
          for (let yy = 0; yy < H; yy++) out.set(px.subarray((H - 1 - yy) * W * 4, (H - yy) * W * 4), yy * W * 4);
          return out;
        };
        const cx = w / 2;
        const cz = d / 2;
        const half = Math.hypot(w, d) / 2;
        const top = Math.max(
          ...meshes.map((m) => {
            m.geometry.computeBoundingBox();
            return m.geometry.boundingBox.max.y;
          }),
        );
        const out: { name: string; flicker: number; through: number; url?: string }[] = [];
        for (const dist of [10, 30, 80])
          for (const [i, a] of [0.6, 2.2, 3.8, 5.4].entries()) {
            const R = half + dist;
            const eyeY = dist === 10 ? 1.7 : Math.min(top * 0.6 + dist * 0.15, 30);
            const ex = cx + Math.cos(a) * R;
            const ez = cz + Math.sin(a) * R;
            const at = (dx: number, dy: number) => {
              cam.position.set(ex + dx, eyeY + dy, ez);
              cam.lookAt(cx, Math.min(top * 0.45, eyeY + R * 0.3), cz);
              cam.updateMatrixWorld();
            };
            at(0, 0);
            const b0 = shot().slice();
            // (the fights: each batch flat in its own colour, so only surfaces swapping count)
            for (const m of meshes) m.material = m.userData.flat;
            const f0 = shot().slice();
            const flips = new Uint8Array(W * H);
            for (let k = 1; k <= 6; k++) {
              at(0.0007 * Math.cos(k * 2.4), 0.0007 * Math.sin(k * 1.7));
              const s = shot();
              for (let p = 0; p < W * H; p++) {
                const q = p * 4;
                if (Math.abs(s[q] - f0[q]) + Math.abs(s[q + 1] - f0[q + 1]) + Math.abs(s[q + 2] - f0[q + 2]) > 40)
                  flips[p]++;
              }
            }
            for (const m of meshes) m.material = m.userData.real;
            at(0, 0);
            for (const m of mats) {
              m.side = 2;
              m.needsUpdate = true;
            }
            const two = shot().slice();
            for (const m of mats) {
              m.side = 0;
              m.needsUpdate = true;
            }
            let flicker = 0;
            let through = 0;
            const img = g2.createImageData(W, H);
            for (let p = 0; p < W * H; p++) {
              const q = p * 4;
              const f = flips[p] >= 2;
              const th =
                Math.abs(two[q] - b0[q]) + Math.abs(two[q + 1] - b0[q + 1]) + Math.abs(two[q + 2] - b0[q + 2]) > 60;
              if (f) flicker++;
              if (th) through++;
              img.data[q] = f ? 255 : th ? 0 : b0[q];
              img.data[q + 1] = f ? 0 : th ? 255 : b0[q + 1];
              img.data[q + 2] = f ? 255 : th ? 255 : b0[q + 2];
              img.data[q + 3] = 255;
            }
            const v: (typeof out)[number] = { name: `${dist}m-${i}`, flicker, through };
            if (flicker > 40 || through > 200) {
              g2.putImageData(img, 0, 0);
              v.url = c2.toDataURL("image/png");
            }
            out.push(v);
          }
        rt.dispose();
        for (const m of meshes) {
          m.geometry.dispose();
          m.userData.flat.dispose();
        }
        return out;
      },
      [kind, style] as const,
    );
    const worst = (dist: number) => {
      const vs = views.filter((v) => v.name.startsWith(`${dist}m`));
      return `${Math.max(0, ...vs.map((v) => v.flicker))} / ${Math.max(0, ...vs.map((v) => v.through))}`;
    };
    lines.push(`| ${kind} | ${style} | ${worst(10)} | ${worst(30)} | ${worst(80)} |`);
    for (const v of views) {
      total += v.flicker;
      if (v.url) writeFileSync(`${OUT}/${kind}-${style}-${v.name}.png`, Buffer.from(v.url.split(",")[1], "base64"));
    }
    console.log(kind, style, worst(10), worst(30), worst(80));
  }
  lines.push("", `Flicker pixels, all views: **${total}**`, "");
}

// ── 2. cull truth in town ──
if (only !== "scan") {
  lines.push("## Cull truth", "", "pixels that differ with the view's culling off, four ways at each spot", "");
  lines.push("| spot | N | E | S | W |", "|---|---|---|---|---|");
  const SPOTS: [string, number, number][] = [
    ["main-street", 396, -404],
    ["church-street", 420, -470],
    ["church-street-south", 420, -500],
    ["farm", 452, -290],
    ["gatehouse", -20, -390],
  ];
  for (const [name, x, z] of SPOTS) {
    await page.evaluate((p) => (window as any).__yutopia.teleport({ x: p[0], y: p[1], level: 0 }), [x, z]);
    await page.waitForFunction(() => !(window as any).__yutopia.tp.around.grounds.statics.left, null, {
      timeout: 120_000,
    });
    await page.waitForTimeout(2500);
    const r: { n: number; url?: string }[] = await page.evaluate(
      ([x, z]) => {
        const y = (window as any).__yutopia;
        const t = y.tp;
        const W = 480;
        const H = 270;
        const cam = t.camera.clone();
        cam.fov = 60;
        cam.aspect = W / H;
        cam.updateProjectionMatrix();
        const c2 = document.createElement("canvas");
        c2.width = W;
        c2.height = H;
        const g2 = c2.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        const shot = () => {
          t.renderer.render(t.scene, cam);
          g2.drawImage(t.renderer.domElement, 0, 0, W, H);
          return g2.getImageData(0, 0, W, H).data.slice();
        };
        const out: { n: number; url?: string }[] = [];
        for (const a of [Math.PI / 2, 0, -Math.PI / 2, Math.PI]) {
          const gy = y.G.groundAt(x, z);
          cam.position.set(x, gy + 6, z);
          cam.lookAt(x + Math.cos(a) * 30, gy + 4, z + Math.sin(a) * 30);
          cam.updateMatrixWorld();
          t.culling.outCull = true;
          const on = shot();
          t.culling.outCull = false;
          const off = shot();
          t.culling.outCull = true;
          let n = 0;
          const img = g2.createImageData(W, H);
          for (let p = 0; p < W * H; p++) {
            const q = p * 4;
            const dd = Math.abs(on[q] - off[q]) + Math.abs(on[q + 1] - off[q + 1]) + Math.abs(on[q + 2] - off[q + 2]);
            const bad = dd > 60;
            if (bad) n++;
            img.data[q] = bad ? 255 : off[q];
            img.data[q + 1] = bad ? 0 : off[q + 1];
            img.data[q + 2] = bad ? 255 : off[q + 2];
            img.data[q + 3] = 255;
          }
          const v: { n: number; url?: string } = { n };
          if (n > 200) {
            g2.putImageData(img, 0, 0);
            v.url = c2.toDataURL("image/png");
          }
          out.push(v);
        }
        return out;
      },
      [x, z] as const,
    );
    lines.push(`| ${name} | ${r.map((v) => v.n).join(" | ")} |`);
    r.forEach((v, i) => {
      if (v.url) writeFileSync(`${OUT}/cull-${name}-${"NESW"[i]}.png`, Buffer.from(v.url.split(",")[1], "base64"));
    });
    console.log("cull", name, r.map((v) => v.n).join(" "));
  }
}
writeFileSync(`${OUT}/scan.md`, `${lines.join("\n")}\n`);
await browser.close();
