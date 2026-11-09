"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 3 — the life look's material library on a board (dev only): every material of
// world/look/life-matlib-list.ts on a ball, a rounded block and a floor tile of it, under the life light
// (the sun's soft shadows, the sky's light, ground-truth AO, the life tone curve). Each texture loaded
// through the game's own way (life-matlib.ts libMaterial: KTX2 through the asset queue).
//   /dev/life/materials                 all of them
//   ?family=wood|floor|fabric|leather|metal|wall|tile|carpet|masonry|ground|plant   one family, nearer
//   ?id=oak                             one, close
//   ?tint=1                             the tintables in four picked colours each (with ?family=)
//   ?hour=22                            night: the sun out, lamps over the board
//   ?half=1                             Low's half-size textures
// window.__life.ready once every texture is in and drawn (e2e/life-bench.mts).

// (four picks a family: what a player might choose)
const PICKS: Record<string, number[]> = {
  fabric: [0x7a2e3a, 0x2f5d7c, 0xd8c9a8, 0x3f6b45],
  leather: [0x6e3f24, 0x2b2a29, 0xa8714a, 0x4a5a3e],
  metal: [0xc4c7cb, 0xc9a45c, 0xb87355, 0x2b2c2e],
  wall: [0xe9dcc6, 0xb9c7b4, 0xc7d3df, 0xd9b8a8],
  tile: [0xe4d9c4, 0x8fb3b0, 0x2f4a5c, 0xc97e5a],
  carpet: [0x8a8578, 0x5b3a4a, 0x3e5266, 0xb8ab90],
};

export default function LifeMaterials() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const family = q.get("family");
    const one = q.get("id");
    const tint = q.get("tint") === "1";
    const night = Number(q.get("hour") ?? 12) >= 20;
    const half = q.get("half") === "1";
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
      const { LIBRARY, MAT_IDS } = await import("@/world/look/life-matlib-list");
      const { libMaterial } = await import("@/world/look/life-matlib");
      const { setLifeTone } = await import("@/world/look/life-tone");
      if (gone || !host.current) return;
      const w = host.current.clientWidth;
      const h = host.current.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      setLifeTone(renderer);
      host.current.appendChild(renderer.domElement);
      cleanup.push(() => renderer.dispose());
      const scene = new T.Scene();
      scene.background = new T.Color(night ? 0x0b0d14 : 0xd6dde4);

      // what's on the board: [id, colour?, its label]
      type Id = (typeof MAT_IDS)[number];
      const items: { id: Id; color?: number; label: string }[] = [];
      const ids = MAT_IDS.filter((id) => (one ? id === one : !family || LIBRARY[id].family === family));
      for (const id of ids) {
        const def = LIBRARY[id];
        if (tint && def.tint) for (const c of PICKS[def.family] ?? [def.color]) items.push({ id, color: c, label: id });
        else if (!tint) items.push({ id, label: id });
      }
      const cols = tint ? 4 : Math.min(8, items.length);
      const rows = Math.ceil(items.length / cols);
      const CELL = 1.6;
      const ROW = 1.95; // (rows further apart: each label clear of the row in front)

      // geometry in metres (UVs too: the library's textures repeat by the metre)
      const metresUV = <G extends InstanceType<typeof T.BufferGeometry>>(g: G, sx: number, sy: number): G => {
        const uv = g.getAttribute("uv") as InstanceType<typeof T.BufferAttribute>;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
        return g;
      };
      const R = 0.3;
      const ball = metresUV(new T.SphereGeometry(R, 64, 32), 2 * Math.PI * R, Math.PI * R);
      const S = 0.5;
      const block = metresUV(new RoundedBoxGeometry(S, S, S, 4, 0.05), S, S);
      const TILE = 1.4;
      const tile = metresUV(new T.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2), TILE, TILE);
      const under = new T.Mesh(
        new T.PlaneGeometry(cols * CELL + 4, rows * ROW + 4).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ color: 0x5a5753, roughness: 0.95 }),
      );
      under.position.y = -0.002;
      under.receiveShadow = true;
      scene.add(under);
      const mats: { userData: { loaded?: Promise<void> } }[] = [];
      const spots: { x: number; z: number; label: string }[] = [];
      items.forEach((it, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = (c - (cols - 1) / 2) * CELL;
        const z = (r - (rows - 1) / 2) * ROW;
        const m = libMaterial(it.id, renderer, { color: it.color, half });
        mats.push(m);
        cleanup.push(() => m.dispose());
        const add = (g: typeof tile | typeof ball | typeof block, px: number, py: number, pz: number) => {
          const mesh = new T.Mesh(g, m);
          mesh.position.set(x + px, py, z + pz);
          mesh.castShadow = mesh.receiveShadow = true;
          scene.add(mesh);
        };
        add(tile, 0, 0, 0);
        add(ball, -0.32, R + 0.001, -0.1);
        add(block, 0.34, S / 2 + 0.001, -0.08);
        spots.push({
          x,
          z: z + TILE / 2,
          label: it.color ? `${it.label} #${it.color.toString(16).padStart(6, "0")}` : it.label,
        });
      });

      // the light: the sun's soft shadows and the sky by day; lamps over the board by night
      const W = cols * CELL;
      const D = rows * ROW;
      if (!night) {
        const sun = new T.DirectionalLight(0xfff0dc, 2.6);
        sun.position.set(-W * 0.3 - 4, 9, D * 0.4 + 5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(4096, 4096);
        const sc = sun.shadow.camera;
        sc.left = sc.bottom = -Math.max(W, D);
        sc.right = sc.top = Math.max(W, D);
        sc.near = 1;
        sc.far = 40;
        sun.shadow.radius = 4;
        sun.shadow.blurSamples = 12;
        sun.shadow.bias = -0.0004;
        scene.add(sun);
      } else
        for (let c = 0; c < Math.ceil(cols / 2); c++)
          for (let r = 0; r < Math.ceil(rows / 2); r++) {
            const lamp = new T.PointLight(0xffc27a, 6, 6, 1.6);
            lamp.position.set((c * 2 + 0.5 - (cols - 1) / 2) * CELL, 2.2, (r * 2 + 0.5 - (rows - 1) / 2) * ROW);
            scene.add(lamp);
          }
      const pm = new T.PMREMGenerator(renderer);
      const sky = new T.Scene();
      sky.add(
        new T.Mesh(
          new T.SphereGeometry(10, 32, 16),
          new T.ShaderMaterial({
            side: T.BackSide,
            uniforms: {
              top: { value: new T.Color(0xc0d4f0).multiplyScalar(night ? 0.03 : 0.75) },
              ground: { value: new T.Color(0x7a6048).multiplyScalar(night ? 0.02 : 0.45) },
            },
            vertexShader:
              "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
            fragmentShader:
              "uniform vec3 top; uniform vec3 ground; varying vec3 vD; void main() { gl_FragColor = vec4(mix(ground, top, smoothstep(-0.2, 0.4, vD.y)), 1.0); }",
          }),
        ),
      );
      const env = pm.fromScene(sky, 0.02);
      scene.environment = env.texture;
      scene.environmentIntensity = night ? 0.4 : 0.7;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the camera: the whole board from the front and above; one material close
      const cam = new T.PerspectiveCamera(30, w / h, 0.05, 200);
      if (one) {
        cam.position.set(0.9, 1.25, 2.3);
        cam.lookAt(0, 0.25, -0.05);
      } else {
        const span = Math.max(W / (w / h), D) + 0.6;
        const dist = (span / (2 * Math.tan((15 * Math.PI) / 180))) * 1.0;
        cam.position.set(0, dist * 0.62, dist * 0.82 + D * 0.15);
        cam.lookAt(0, 0, D * 0.06);
      }

      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, cam));
      const ao = new GTAOPass(scene, cam, w, h);
      ao.blendIntensity = 1;
      ao.updateGtaoMaterial({ radius: 0.35, distanceFallOff: 1, thickness: 1, scale: 1, samples: 16 });
      composer.addPass(ao);
      composer.addPass(new OutputPass());

      // labels under each tile (screen-placed)
      const v = new T.Vector3();
      const tagEls = spots.map((s) => {
        const d = document.createElement("div");
        d.textContent = s.label;
        d.style.cssText =
          "position:absolute;transform:translate(-50%,0);font:12px/1.2 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:1px 5px;border-radius:3px;white-space:nowrap";
        tags.current?.appendChild(d);
        return d;
      });
      const place = () => {
        spots.forEach((s, i) => {
          v.set(s.x, 0, s.z).project(cam);
          tagEls[i].style.left = `${((v.x + 1) / 2) * w}px`;
          tagEls[i].style.top = `${((1 - v.y) / 2) * h + 2}px`;
        });
      };
      if (one) for (const el of tagEls) el.style.display = "none";

      let loaded = false;
      Promise.all(mats.map((m) => m.userData.loaded)).then(() => {
        loaded = true;
      });
      let after = 0;
      const frame = () => {
        if (gone) return;
        composer.render();
        place();
        if (loaded && ++after === 20) (window as unknown as { __life: object }).__life = { ready: true };
        raf = requestAnimationFrame(frame);
      };
      frame();
    })();
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      for (const c of cleanup) c();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <div ref={tags} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
