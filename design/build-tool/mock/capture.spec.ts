/* biome-ignore-all lint/suspicious/noExplicitAny: a mock's capture (docs/plan/72 phase 0) — copied into apps/client/e2e to run, removed after */
import { readFileSync, writeFileSync } from "node:fs";
import { BIA, enter, test, token } from "./helpers";

// The free-form build tool's mocks (docs/plan/72-the-3d-core.md, phase 0): each shot the game's own 3D
// view of a floor (as Bia, on the dev world, on Metal; people and pets hidden, the hour held), with the
// mock's pieces drawn into its scene as real 3D — walls being drawn, an arc, slabs, guides, ghosts —
// through a camera of the shot's own. Writes <OUT>/<name>.jpg and <name>.json (each named anchor's
// place on the picture, for the HTML over it: build-tool.html).
//   SHOTS=design/build-tool/mock/shots.json OUT=design/build-tool/mock/bg [ONLY=a,b]
test.use({ bypassCSP: true, launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] } });

const THREE_DIR = `${process.cwd()}/../../node_modules/.pnpm/three@0.186.1/node_modules/three/build`;

test("build tool mock shots", async ({ page }) => {
  test.setTimeout(900_000);
  const shots = JSON.parse(readFileSync(process.env.SHOTS as string, "utf8")) as any[];
  const only = process.env.ONLY?.split(",");
  const W = 1440;
  const H = 900;
  await page.setViewportSize({ width: W, height: H });
  await page.addInitScript(() => {
    const k = "yutopia:prefs";
    const p = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...p, view: "3p", cam3p: "free", quality: "high" }));
  });
  await enter(page, await token(BIA));
  await page.waitForFunction(() => !!(window as any).__yutopia.tp?.body.physics, null, { timeout: 60_000 });
  // three, its own copy, to make the mock's pieces with (the renderer takes them as any): its ES module
  // files served at /__mock3/ from the repo's
  await page.route("**/__mock3/*", (route) => {
    const file = new URL(route.request().url()).pathname.split("/").pop() as string;
    route.fulfill({ contentType: "text/javascript", body: readFileSync(`${THREE_DIR}/${file}`, "utf8") });
  });
  await page.addScriptTag({
    type: "module",
    content: "import * as T from '/__mock3/three.module.js'; window.MOCK3 = T;",
  });
  await page.waitForFunction(() => !!(window as any).MOCK3, null, { timeout: 30_000 });
  let at = "";
  for (const s of shots) {
    if (only && !only.some((o) => s.name.startsWith(o))) continue;
    // (the same place as the shot before: no teleport, no wait — the reel's frames)
    const here = JSON.stringify([s.stand, s.level]);
    if (here !== at) {
      at = here;
      await page.evaluate((t) => (window as any).__yutopia.teleport(t), { ...s.stand, level: s.level });
      await page.waitForFunction((l) => (window as any).__yutopia.level === l, s.level, { timeout: 20_000 });
      await page.waitForTimeout(4000);
    }
    const out = await page.evaluate(
      (q) => {
        const T = (window as any).MOCK3;
        const c = (window as any).__yutopia;
        const tp = c.tp;
        c.updateNight = () => {};
        c.hour = q.hour ?? 13;
        c.engine?.setClock?.(c.hour);
        if (c.life) c.life.weather = () => [0, 0];
        tp.setHour(c.hour);
        // the floor I'm on is at the scene's 0; its places are the world's (x, y → x, z)
        const g = new T.Group();
        g.name = "mock";
        const amber = 0xf2a43a; // (deeper than the HUD's: it has to read on the pale floors)
        const bright = 0xffd27a;
        const mat = (o: any) =>
          new T.MeshLambertMaterial({
            color: o.color ?? amber,
            emissive: o.color ?? amber,
            emissiveIntensity: 0.35,
            transparent: true,
            opacity: o.opacity ?? 0.6,
            depthWrite: false,
            side: T.DoubleSide,
          });
        // a line as a thin flat ribbon (a GL line is a pixel wide): from a to b at their heights
        const ribbon = (a: number[], b: number[], color = amber, w = 0.06, opacity = 1) => {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0));
          if (len < 1e-4) return;
          const m = new T.Mesh(
            new T.BoxGeometry(len, w * 0.5, w),
            new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }),
          );
          m.position.set((a[0] + b[0]) / 2, ((a[2] ?? 0) + (b[2] ?? 0)) / 2 + 0.02, (a[1] + b[1]) / 2);
          const dir = new T.Vector3(b[0] - a[0], (b[2] ?? 0) - (a[2] ?? 0), b[1] - a[1]).normalize();
          m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), dir);
          g.add(m);
        };
        const edges = (mesh: any, color = amber) => {
          const e = new T.LineSegments(new T.EdgesGeometry(mesh.geometry), new T.LineBasicMaterial({ color }));
          e.position.copy(mesh.position);
          e.rotation.copy(mesh.rotation);
          g.add(e);
        };
        // (outdoors: a wall's foot on the land under its middle — the physics' ground)
        const ground = (x: number, y: number) => tp.body.physics?.groundUnder(q.level, x, y, 60) ?? 0;
        const wall = (o: any) => {
          if (o.base === "ground") o = { ...o, base: ground((o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2) };
          const [ax, ay] = o.a;
          const [bx, by] = o.b;
          const len = Math.hypot(bx - ax, by - ay);
          const h = o.h ?? 3.27;
          const t = o.th ?? 0.2;
          const lit = o.solid ? new T.MeshLambertMaterial({ color: o.color ?? 0xe8e1d4 }) : mat(o);
          const m = new T.Mesh(new T.BoxGeometry(len, h, t), lit);
          m.position.set((ax + bx) / 2, (o.base ?? 0) + h / 2, (ay + by) / 2);
          m.rotation.y = -Math.atan2(by - ay, bx - ax);
          g.add(m);
          // (its top, a bright line along it: where the ghost ends)
          if (!o.solid || o.edges) {
            const z = (o.base ?? 0) + h;
            ribbon([ax, ay, z], [bx, by, z], o.edge ?? bright, 0.08);
            ribbon([ax, ay, o.base ?? 0], [bx, by, o.base ?? 0], o.edge ?? amber, 0.06, 0.9);
          }
        };
        const arc = (o: any) => {
          const n = o.n ?? 16;
          const [cx, cy] = o.c;
          for (let i = 0; i < n; i++) {
            const t0 = o.a0 + ((o.a1 - o.a0) * i) / n;
            const t1 = o.a0 + ((o.a1 - o.a0) * (i + 1)) / n;
            wall({
              ...o,
              a: [cx + Math.cos(t0) * o.r, cy + Math.sin(t0) * o.r],
              b: [cx + Math.cos(t1) * o.r, cy + Math.sin(t1) * o.r],
              edges: false,
            });
          }
        };
        const slab = (o: any) => {
          const sh = new T.Shape(o.ring.map(([x, y]: number[]) => new T.Vector2(x, y)));
          const geo = new T.ShapeGeometry(sh);
          geo.rotateX(Math.PI / 2);
          const m = new T.Mesh(geo, mat({ ...o, opacity: o.opacity ?? 0.28 }));
          m.position.y = (o.z ?? 0) + 0.02;
          g.add(m);
          for (let i = 0; i < o.ring.length; i++) {
            const [ax, ay] = o.ring[i];
            const [bx, by] = o.ring[(i + 1) % o.ring.length];
            ribbon([ax, ay, o.z ?? 0], [bx, by, o.z ?? 0], o.edge ?? bright, 0.08);
          }
        };
        // a dashed guide: dashes 0.3 m, gaps 0.2
        const guide = (o: any) => {
          for (let i = 0; i + 1 < o.pts.length; i++) {
            const a = o.pts[i];
            const b = o.pts[i + 1];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0));
            for (let u = 0; u < len; u += 0.5) {
              const v = Math.min(len, u + 0.3);
              const at = (k: number) => [
                a[0] + ((b[0] - a[0]) * k) / len,
                a[1] + ((b[1] - a[1]) * k) / len,
                (a[2] ?? 0) + (((b[2] ?? 0) - (a[2] ?? 0)) * k) / len,
              ];
              ribbon(at(u), at(v), o.color ?? amber, o.w ?? 0.05, 0.95);
            }
          }
        };
        const dot = (o: any) => {
          const m = new T.Mesh(
            new T.SphereGeometry(o.r ?? 0.11, 16, 12),
            new T.MeshBasicMaterial({ color: o.color ?? amber, depthTest: o.depth ?? false }),
          );
          m.position.set(o.at[0], o.at[2] ?? 0.05, o.at[1]);
          m.renderOrder = 20;
          g.add(m);
        };
        const box = (o: any) => {
          const lit = o.solid ? new T.MeshLambertMaterial({ color: o.color ?? 0xe8e1d4 }) : mat(o);
          const m = new T.Mesh(new T.BoxGeometry(o.w, o.h, o.d), lit);
          // (its foot: given, or the land's under it; `up` more over that)
          const z0 = (o.at[2] === "ground" ? ground(o.at[0], o.at[1]) : (o.at[2] ?? 0)) + (o.up ?? 0);
          m.position.set(o.at[0], z0 + o.h / 2, o.at[1]);
          m.rotation.set(o.pitch ?? 0, o.yaw ?? 0, 0, "YXZ");
          g.add(m);
          if (!o.solid) edges(m, o.edge ?? amber);
        };
        // a built slab with its sides: a polygon stood up from z0 to z1 (a mezzanine, a stage)
        const prism = (o: any) => {
          const sh = new T.Shape(o.ring.map(([x, y]: number[]) => new T.Vector2(x, -y)));
          const geo = new T.ExtrudeGeometry(sh, { depth: o.z1 - (o.z0 ?? 0), bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: o.color ?? 0x8a5a34 }));
          m.position.y = o.z0 ?? 0;
          g.add(m);
        };
        for (const o of q.objects ?? []) ({ wall, arc, slab, guide, dot, box, prism })[o.t as "wall"](o);
        tp.scene.add(g);
        // the camera: the shot's own
        const cam = tp.camera.clone();
        cam.fov = q.fov ?? 50;
        cam.zoom = 1; // (the game's camera may be zoomed, or offset: the shot's is plain)
        cam.clearViewOffset?.();
        cam.aspect = q.W / q.H;
        cam.position.set(q.eye[0], q.eye[2], q.eye[1]);
        cam.lookAt(q.look[0], q.look[2], q.look[1]);
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        const hid: any[] = [];
        for (const p of tp.people.values()) if (p.root.visible) hid.push(p.root);
        for (const p of tp.people3.values()) if (p.root.visible) hid.push(p.root);
        for (const e of tp.pets3.values()) if (e.model.root.visible) hid.push(e.model.root);
        for (const r of hid) r.visible = false;
        const size = tp.renderer.getSize(new T.Vector2());
        tp.renderer.setSize(q.W, q.H, false);
        tp.renderer.setRenderTarget(null);
        tp.renderer.render(tp.scene, cam);
        const url = tp.renderer.domElement.toDataURL("image/jpeg", 0.92);
        tp.renderer.setSize(size.x, size.y, false);
        for (const r of hid) r.visible = true;
        tp.scene.remove(g);
        // the anchors on the picture
        const anchors: Record<string, [number, number]> = {};
        for (const [k, p] of Object.entries(q.anchors ?? {}) as [string, number[]][]) {
          const v = new T.Vector3(p[0], p[2] ?? 0, p[1]).project(cam);
          anchors[k] = [Math.round(((v.x + 1) / 2) * q.W), Math.round(((1 - v.y) / 2) * q.H)];
        }
        return { url, anchors };
      },
      { ...s, W, H },
    );
    writeFileSync(`${process.env.OUT}/${s.name}.jpg`, Buffer.from(out.url.split(",")[1], "base64"));
    writeFileSync(`${process.env.OUT}/${s.name}.json`, JSON.stringify(out.anchors));
  }
});
