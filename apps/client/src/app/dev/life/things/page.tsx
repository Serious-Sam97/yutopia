"use client";

import type { WorldObjectDef } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 6 — the kit's things in the life look (dev only): a row of them as the world draws
// them (furn/native.ts into an Out, a bucket a material: tp/kit-mats.ts), on oak floorboards against a
// plaster wall, under the life light (the sun's soft shadows, the sky in the sheen, ground-truth AO,
// Khronos PBR Neutral's curve).
//   /dev/life/things              the sample: sofa, armchair, task chair, dining table, desk, bookcase,
//                                 floor lamp, plant
//   ?kit=old                      today's models (flat, one colour a part) under the same light
//   ?set=sofa,chair:2,…           kinds (and looks) of your own; ?kind=chair  every look of a kind
//   ?hour=22                      night: the lamps lit, the sun out
//   ?near=1                       low and close (small things: the desktop's)
//   ?col=3                        close on one of the row      ?spin=0.6  the row turned (radians)
// window.__life.ready once drawn and the textures in (e2e/life-bench.mts `things:`).
const SAMPLE = ["sofa:0", "armchair:1", "chair:0", "dining_table:0", "desk:0", "bookcase:0", "lamp:0", "plant:3"];

export default function LifeThings() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const cleanup: (() => void)[] = [];
    const q = new URLSearchParams(location.search);
    const old = q.get("kit") === "old";
    const night = Number(q.get("hour") ?? 12) >= 20;
    (async () => {
      const T = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const LM = await import("@/world/look/look-mode");
      // (the life look on this page, and its kit — or today's models under its light)
      LM.setLookModeForTest("life");
      const K = await import("@/world/furn/kit");
      K.setLifeKit(!old);
      const N = await import("@/world/furn/native");
      const { Out } = await import("@/world/tp/kit3d");
      const KM = await import("@/world/tp/kit-mats");
      const { litMaterial } = await import("@/world/look/lit");
      const ML = await import("@/world/look/life-matlib");
      const { entry } = await import("@yutopia/shared");
      if (gone || !host.current) return;
      const w = host.current.clientWidth;
      const h = host.current.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.toneMapping = T.NeutralToneMapping;
      host.current.appendChild(renderer.domElement);
      cleanup.push(() => renderer.dispose());
      KM.setKitRenderer(renderer);
      const scene = new T.Scene();
      scene.background = new T.Color(night ? 0x0b0d14 : 0xd6dde4);
      const waits: Promise<unknown>[] = [];

      // the row: each thing at its footprint, a gap between
      const kind = q.get("kind");
      const list = kind
        ? (N.LOOK_NAMES[kind] ?? [""]).map((_, i) => `${kind}:${i}`)
        : (q.get("set")?.split(",") ?? SAMPLE);
      const out = new Out(!old);
      // (what moves — a hanging chair, a hammock's cloth, a rocker's swing — its own meshes, as the world
      // draws them: furn/native.ts liveInto)
      const lives: WorldObjectDef[] = [];
      let x = 0;
      const xs: { x: number; w: number; h: number }[] = [];
      for (const [i, s] of list.entries()) {
        const [k, v] = s.split(":");
        const e = entry(k);
        const def: WorldObjectDef = { id: `t${i}`, kind: k, x, y: 0, props: { variant: Number(v ?? 0) } };
        N.nativeInto(out, def);
        lives.push(def);
        xs.push({ x, w: e.w, h: e.h });
        x += e.w + 0.6;
      }
      const span = x - 0.6;
      const mesh = (g: InstanceType<typeof Out>["lit"], m: InstanceType<typeof T.Material>, shadow = true) => {
        if (g.empty) return;
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.Float32BufferAttribute(g.pos, 3));
        geo.setAttribute("normal", new T.Float32BufferAttribute(g.nor, 3));
        geo.setAttribute("color", new T.Float32BufferAttribute(g.col, 4));
        if (g.uv.length) geo.setAttribute("uv", new T.Float32BufferAttribute(g.uv, 2));
        const me = new T.Mesh(geo, m);
        me.castShadow = me.receiveShadow = shadow;
        scene.add(me);
      };
      mesh(out.lit, litMaterial({ vertexColors: true }));
      for (const [name, g] of out.mats) {
        const m = KM.kitMaterial(name);
        if (m.userData.loaded) waits.push(m.userData.loaded);
        mesh(g, m);
      }
      mesh(out.glow, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
      const liveLit = litMaterial({ vertexColors: true });
      const liveGlow = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      const liveGlass = litMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false });
      for (const def of lives) {
        const g = N.liveInto(def, liveLit, liveGlow, liveGlass);
        if (!g) continue;
        g.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
        });
        scene.add(g);
      }
      mesh(out.clear, litMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }), false);

      // the room: oak floorboards, a plaster wall behind the row
      const inMetres = <G extends InstanceType<typeof T.PlaneGeometry>>(g: G, sx: number, sy: number): G => {
        const uv = g.getAttribute("uv") as InstanceType<typeof T.BufferAttribute>;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
        return g;
      };
      const floorM = ML.libMaterial("floor-oak", renderer);
      const wallM = ML.libMaterial("plaster", renderer, { color: 0xe9dcc6 });
      waits.push(floorM.userData.loaded, wallM.userData.loaded);
      const FW = span + 6;
      const floor = new T.Mesh(inMetres(new T.PlaneGeometry(FW, 40), FW, 40).rotateX(-Math.PI / 2), floorM);
      floor.position.set(span / 2, 0, 19.75);
      floor.receiveShadow = true;
      scene.add(floor);
      const wall = new T.Mesh(inMetres(new T.PlaneGeometry(FW, 8), FW, 8), wallM);
      wall.position.set(span / 2, 4, -0.25);
      wall.receiveShadow = true;
      scene.add(wall);

      // the light: the sky and a low warm sun from the front left; at night two warm lamps
      scene.add(new T.HemisphereLight(0xfff1e2, 0x9a7a5c, night ? 0.08 : 1.6));
      const sun = new T.DirectionalLight(0xffe2c0, night ? 0 : 3.6);
      sun.position.set(span / 2 - 4, 7, 6);
      sun.target.position.set(span / 2, 0, 0.5);
      scene.add(sun.target);
      sun.castShadow = !night;
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.radius = 5;
      sun.shadow.blurSamples = 16;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -(span / 2 + 3);
      sc.right = sc.top = span / 2 + 3;
      sc.far = 40;
      scene.add(sun);
      if (night)
        for (const lx of [span * 0.3, span * 0.75]) {
          const l = new T.PointLight(0xffc27a, 8, 7, 1.6);
          l.position.set(lx, 1.9, 1.4);
          scene.add(l);
        }
      const pm = new T.PMREMGenerator(renderer);
      const skyScene = new T.Scene();
      skyScene.add(
        new T.Mesh(
          new T.SphereGeometry(10, 32, 16),
          new T.ShaderMaterial({
            side: T.BackSide,
            uniforms: {
              top: { value: new T.Color(0xc0d4f0).multiplyScalar(night ? 0.04 : 0.7) },
              ground: { value: new T.Color(0x7a6048).multiplyScalar(night ? 0.03 : 0.5) },
            },
            vertexShader:
              "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
            fragmentShader:
              "uniform vec3 top; uniform vec3 ground; varying vec3 vD; void main() { gl_FragColor = vec4(mix(ground, top, smoothstep(-0.2, 0.4, vD.y)), 1.0); }",
          }),
        ),
      );
      const env = pm.fromScene(skyScene, 0.02);
      scene.environment = env.texture;
      scene.environmentIntensity = night ? 0.5 : 0.7;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the camera: the whole row, or close on one
      const cam = new T.PerspectiveCamera(32, w / h, 0.05, 80);
      const col = q.get("col");
      if (col !== null && xs[Number(col)]) {
        const c = xs[Number(col)];
        const cx = c.x + c.w / 2;
        const d = Math.max(c.w, 0.9) * 1.25 + 0.7;
        cam.position.set(cx + d * 0.38, 1.45, c.h / 2 + d);
        cam.lookAt(cx, 0.5, c.h / 2);
      } else if (q.get("near") === "1") {
        // (small things — the desktop's — low and close)
        const d = span * 0.6 + 0.7;
        cam.position.set(span / 2 + 0.3, 0.8, d);
        cam.lookAt(span / 2, 0.1, 0.4);
      } else {
        const d = span * 0.95 + 2;
        cam.position.set(span / 2 + 0.6, 2.3, d);
        cam.lookAt(span / 2, 0.65, 0.5);
      }
      const spin = Number(q.get("spin") ?? 0);
      if (spin) {
        const piv = new T.Vector3(span / 2, 0, 0.5);
        cam.position
          .sub(piv)
          .applyAxisAngle(new T.Vector3(0, 1, 0), spin)
          .add(piv);
        cam.lookAt(piv.x, 0.6, piv.z);
      }

      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, cam));
      const ao = new GTAOPass(scene, cam, w, h);
      ao.blendIntensity = 1;
      ao.updateGtaoMaterial({ radius: 0.45, distanceFallOff: 1, thickness: 1, scale: 1, samples: 16 });
      composer.addPass(ao);
      composer.addPass(new OutputPass());

      let drawn = 0;
      let texIn = false;
      Promise.all(waits).then(() => {
        texIn = true;
      });
      const frame = () => {
        if (gone) return;
        composer.render();
        drawn++;
        if (drawn > 20 && texIn)
          (window as unknown as { __life: object }).__life = {
            ready: true,
            tris: renderer.info.render.triangles,
            calls: renderer.info.render.calls,
            mats: [...out.mats.keys()],
          };
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
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#000" }} />;
}
