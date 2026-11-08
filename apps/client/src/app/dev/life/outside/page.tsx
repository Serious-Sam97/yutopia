"use client";

import { KH_FEEL } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 0d — a corner of the world outside in the life look (dev only): the headquarters'
// front (world/look/life-outdoor.ts), the lawn, its tufts and flower bed, bushes, two leafy trees
// (tools/art/life/build_tree.py), the pavement with lamp posts and a bench, the lot; the new man
// standing, the new woman on the bench; under a painted sky by the hour.
//   /dev/life/outside           noon
//   ?hour=dusk                  17h: a low warm sun, long shadows
//   ?hour=night                 the lamps lit, rooms lit, stars
//   ?view=close                 nearer, on the people and the bench
//   ?t=2.4                      frozen at 2.4 s in
// window.__life.ready once drawn (e2e/life-bench.mts).
const W = 44;
const BENCH = { x: 2.8, z: 6.0 };

export default function LifeOutside() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const hour = (q.get("hour") ?? "noon") as "noon" | "dusk" | "night";
    const view = q.get("view") ?? "wide";
    const frozen = q.get("t") !== null ? Number(q.get("t")) : null;
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const A = await import("@/world/look/life-assets");
      const C = await import("@/world/chars");
      await C.loadHero();
      const L = await import("@/world/look/life-person");
      const K = await import("@/world/look/life-kit");
      const O = await import("@/world/look/life-outdoor");
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
      const scene = new T.Scene();
      scene.fog = new T.Fog(O.SKY_COLOUR[hour], hour === "night" ? 30 : 60, hour === "night" ? 160 : 260);

      // the sun by the hour
      const sunDir = {
        noon: new T.Vector3(-0.45, 0.85, 0.55),
        dusk: new T.Vector3(0.62, 0.26, 0.74),
        night: new T.Vector3(0, 1, 0),
      }[hour];
      scene.add(O.lifeSky(hour, sunDir));
      const M = K.lifeMats();
      scene.add(O.lifeFacade(M, W, hour));
      scene.add(O.lifeGround(W));
      const tree = (await A.loadLifeGLTF(renderer, "/life/tree-leafy.glb")).scene;
      for (const [x, z, s, ry] of [
        [-12.5, 2.6, 1.3, 0.3],
        [13, 2.8, 1.2, 2.1],
      ] as const) {
        const t = tree.clone();
        t.position.set(x, 0, z);
        t.scale.setScalar(s);
        t.rotation.y = ry;
        t.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
          const m = (o as InstanceType<typeof T.Mesh>).material as
            | InstanceType<typeof T.MeshStandardMaterial>
            | undefined;
          if (m && /leaves/.test(m.name)) {
            m.alphaTest = 0.4;
            m.transparent = false;
            m.side = T.DoubleSide;
          }
        });
        scene.add(t);
      }
      const night = hour === "night";
      for (const x of [-16, -6, 6, 16]) {
        const p = O.lifeLampPost(M, night);
        p.position.set(x, 0, 7.1);
        p.traverse((o) => {
          o.castShadow = true;
        });
        scene.add(p);
        if (night) {
          // (pools, not a wash: a short reach, falling off fast)
          const l = new T.PointLight(0xffd08a, 34, 11, 2);
          l.position.set(x, 4.1, 7.1);
          if (Math.abs(x) < 10) {
            l.castShadow = true;
            l.shadow.mapSize.set(1024, 1024);
            l.shadow.radius = 4;
          }
          scene.add(l);
        }
      }
      const bench = O.lifeBench(M);
      bench.position.set(BENCH.x, 0, BENCH.z);
      bench.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      scene.add(bench);

      // the light
      const hemi = new T.HemisphereLight(
        night ? 0x2a3550 : hour === "dusk" ? 0xf2c9a8 : 0xdfeaff,
        night ? 0x101418 : 0x6a7a4a,
        night ? 0.3 : hour === "dusk" ? 1.25 : 1.2,
      );
      scene.add(hemi);
      const sun = new T.DirectionalLight(
        hour === "dusk" ? 0xffb070 : 0xfff0d8,
        night ? 0 : hour === "dusk" ? 3.4 : 3.2,
      );
      sun.position.copy(sunDir).multiplyScalar(60);
      sun.target.position.set(0, 0, 6);
      scene.add(sun, sun.target);
      sun.castShadow = !night;
      sun.shadow.mapSize.set(4096, 4096);
      sun.shadow.radius = 4;
      sun.shadow.blurSamples = 16;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.03;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -26;
      sc.right = sc.top = 26;
      sc.far = 140;
      const pm = new T.PMREMGenerator(renderer);
      const envScene = new T.Scene();
      envScene.add(O.lifeSky(hour, sunDir));
      const env = pm.fromScene(envScene, 0.04);
      scene.environment = env.texture;
      scene.environmentIntensity = night ? 0.25 : 0.6;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the people: he stands on the pavement, she sits on the bench
      const man = await L.loadLifePerson("/life/person-man-painted.glb", renderer);
      const woman = await L.loadLifePerson("/life/person-woman-painted.glb", renderer);
      for (const p of [man, woman]) {
        p.root.traverse((o) => {
          o.castShadow = true;
        });
        scene.add(p.root);
      }
      man.root.position.set(BENCH.x - 1.5, 0, BENCH.z + 0.6);
      man.root.rotation.y = 0.9;
      woman.root.position.set(BENCH.x + 0.3, 0, BENCH.z + 0.08);
      const seatY = 0.47;

      // the camera: from the lot, a little up, as one walks toward the doors
      const cam = new T.PerspectiveCamera(view === "close" ? 30 : 42, w / h, 0.1, 600);
      if (view === "close") {
        cam.position.set(4.6, 1.9, 12);
        cam.lookAt(1.6, 1.2, 5.6);
      } else {
        cam.position.set(6, 3.2, 31);
        cam.lookAt(-0.5, 5.2, 0);
      }

      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      composer.addPass(new RenderPass(scene, cam));
      const ao = new GTAOPass(scene, cam, w, h);
      ao.blendIntensity = 0.9;
      ao.updateGtaoMaterial({ radius: 0.6, distanceFallOff: 1, thickness: 1, scale: 1, samples: 16 });
      composer.addPass(ao);
      composer.addPass(new OutputPass());

      const loco = new C.Locomotion(KH_FEEL);
      loco.seed = 5;
      const sitter = new C.Motion3(0.47);
      let t = 0;
      const step = () => {
        const dt = 1 / 60;
        const mo = loco.update(
          dt,
          {
            dist: 0,
            speed: 0,
            ahead: 0,
            left: 0,
            crouch: false,
            aim: false,
            pitch: 0,
            yaw: 0,
            turn: 0,
            accel: 0,
            up: false,
            jump: null,
            verb: null,
            reduced: false,
          },
          C.heroNow()?.idle2Pose(t, 0, 2, true),
        );
        man.setPose(mo.pose as never, mo.lift);
        const gz = loco.gazeOut;
        man.setFace(gz?.blink ?? 0, 0, 0.35);
        man.setEyes(gz?.eyes[0] ?? 0, gz?.eyes[1] ?? 0);
        const so = sitter.update(dt, {
          dist: 0,
          walking: false,
          speed: 0,
          sit: true,
          typing: false,
          speaking: false,
          emote: "",
          reduced: false,
        });
        const drop = woman.sitDrop(seatY);
        woman.setPose(so.pose as never, [so.lift[0], so.lift[1] + drop * so.settle, so.lift[2]]);
        woman.setFace(so.blink, 0, 0.5);
        woman.setEyes(-0.5, 0.05);
        t += dt;
      };
      if (frozen !== null) while (t < frozen) step();
      let drawn = 0;
      const frame = () => {
        if (gone) return;
        if (frozen === null || drawn < 3) step();
        composer.render();
        drawn++;
        if (drawn > 30) (window as unknown as { __life: object }).__life = { ready: true, t };
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
