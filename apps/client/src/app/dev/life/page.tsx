"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import { KH_FEEL } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 0b — the life look's people on a bench (dev only): the new people
// (tools/art/life/build_person.py → /life/person-*.glb) beside today's, all posed by one of the game's
// own Locomotion walkers, under the life light of phase 0a (soft sun shadows, the sky in the sheen,
// ground-truth AO, Khronos PBR Neutral's curve).
//   /dev/life                    today's man, the new man, today's woman, the new woman; idling
//   ?act=walk                    walking on the spot (1.5 m/s, the game's walk)
//   ?t=2.4                       frozen at 2.4 s in
//   ?spin=35                     everyone turned (deg, + to their left)
//   ?who=man|woman  ?today=0     fewer people
//   ?face=man|woman              close on that new person's face
//   ?hour=22                     night: the sun out, a lamp over them
//   ?style=painted|both          the repainted textures; both: photo and painted side by side
//   ?blink=1  ?smile=0.6  ?talk=0.5  ?eyes=0.6,0.2   the face held (else the walker's gaze: blinks, looks)
// window.__life.ready once drawn (for e2e/life-bench.mts).
const TODAY: Record<string, AvatarLayers> = {
  man: {
    ...DEFAULT_AVATAR,
    gender: "masculine",
    skin: "#e2b996",
    hair: "short",
    hairColor: "#3a2a1e",
    top: "shirt",
    topColor: "#2c3d5e",
    bottom: "jeans",
    bottomColor: "#3d4f6e",
    shoes: "sneakers",
    shoesColor: "#dedad2",
  },
  woman: {
    ...DEFAULT_AVATAR,
    gender: "feminine",
    skin: "#5b3a27",
    hair: "ponytail",
    hairColor: "#5a3c26",
    top: "shirt",
    topColor: "#5e2a36",
    bottom: "skirt",
    bottomColor: "#4c524c",
    shoesColor: "#1c1c1c",
  },
};

export default function LifeBench() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const act = q.get("act") ?? "idle";
    const frozen = q.get("t") !== null ? Number(q.get("t")) : null;
    const spin = (Number(q.get("spin") ?? 0) * Math.PI) / 180;
    const night = Number(q.get("hour") ?? 12) >= 20;
    const face = q.get("face");
    const whoQ = q.get("who");
    // ?style=painted: the repainted textures (build_person.py --paint); both: photo and painted side by side
    const style = q.get("style") ?? "photo";
    const withToday = q.get("today") !== "0" && !face && style !== "both";
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const C = await import("@/world/chars");
      await C.loadHero();
      const L = await import("@/world/look/life-person");
      if (gone || !host.current) return;
      const w = host.current.clientWidth;
      const h = host.current.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.toneMapping = T.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      host.current.appendChild(renderer.domElement);
      cleanup.push(() => renderer.dispose());
      const scene = new T.Scene();
      scene.background = new T.Color(night ? 0x0d1018 : 0xc9d6e2);
      // the floor and a wall behind
      const floor = new T.Mesh(
        new T.PlaneGeometry(30, 30).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ color: 0xb9ae9c, roughness: 0.92 }),
      );
      floor.receiveShadow = true;
      scene.add(floor);
      const wall = new T.Mesh(
        new T.PlaneGeometry(30, 8),
        new T.MeshStandardMaterial({ color: 0xe0d6c6, roughness: 0.95 }),
      );
      wall.position.set(0, 4, -3);
      wall.receiveShadow = true;
      scene.add(wall);
      // the light: a warm sun and the sky by day; at night a lamp over them and a little of the sky
      const hemi = new T.HemisphereLight(0xd8e6ff, 0x8a7560, night ? 0.12 : 1.3);
      scene.add(hemi);
      const sun = new T.DirectionalLight(0xfff0dc, night ? 0 : 2.6);
      sun.position.set(3, 6, 4.5);
      sun.castShadow = !night;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 5;
      sun.shadow.blurSamples = 16;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -4;
      sc.right = sc.top = 4;
      scene.add(sun);
      if (night) {
        const lamp = new T.SpotLight(0xffc98a, 40, 12, Math.PI / 3.2, 0.6, 1.6);
        lamp.position.set(0.6, 3.2, 1.6);
        lamp.target.position.set(0, 0.9, 0);
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(1024, 1024);
        lamp.shadow.radius = 4;
        scene.add(lamp, lamp.target);
      }
      // the sky in the sheen (the hemisphere's colours, as 0a's probe)
      const pm = new T.PMREMGenerator(renderer);
      const skyScene = new T.Scene();
      const skyMat = new T.ShaderMaterial({
        side: T.BackSide,
        uniforms: {
          top: { value: new T.Color(0xb8cff0).multiplyScalar(night ? 0.05 : 0.7) },
          ground: { value: new T.Color(0x6a5a48).multiplyScalar(night ? 0.03 : 0.5) },
        },
        vertexShader:
          "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 ground; varying vec3 vD; void main() { gl_FragColor = vec4(mix(ground, top, smoothstep(-0.2, 0.4, vD.y)), 1.0); }",
      });
      skyScene.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), skyMat));
      const env = pm.fromScene(skyScene, 0.02);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.5;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the people
      type Shown = {
        root: InstanceType<typeof T.Group>;
        setPose: (p: object, lift?: [number, number, number]) => void;
        face: (blink: number, talk: number, smile: number) => void;
        eyes: (x: number, y: number) => void;
        h: number;
        who: string;
      };
      const shown: Shown[] = [];
      const genders = whoQ ? [whoQ] : face ? [face] : ["man", "woman"];
      const f = new C.CharFactory();
      // (today's are baked by their factory, a little each frame: drawn once ready)
      const todays: InstanceType<typeof C.PersonModel>[] = [];
      for (const g of genders) {
        if (withToday) {
          const m = new C.PersonModel(f, TODAY[g], 0);
          todays.push(m);
          shown.push({
            root: m.root,
            setPose: (p, lift) => m.setPose(p as never, lift),
            face: (b, t) => m.setFace(b, t),
            eyes: (x, y) => m.setEyes(x, y),
            h: 1.75,
            who: `today-${g}`,
          });
        }
        for (const v of style === "both" ? ["", "-painted"] : style === "painted" ? ["-painted"] : [""]) {
          const lp = await L.loadLifePerson(`/life/person-${g}${v}.glb`, renderer);
          shown.push({
            root: lp.root,
            setPose: (p, lift) => lp.setPose(p as never, lift),
            face: (b, t, sm) => lp.setFace(b, t, sm),
            eyes: (x, y) => lp.setEyes(x, y),
            h: lp.height,
            who: g + v,
          });
          console.log(`life ${g}${v}: ${lp.height.toFixed(2)} m, ${L.trisOf(lp)} tris`);
        }
      }
      const gap = 0.95;
      shown.forEach((s, i) => {
        s.root.position.x = (i - (shown.length - 1) / 2) * gap;
        s.root.rotation.y = spin;
        s.root.traverse((o) => {
          o.castShadow = true;
        });
        scene.add(s.root);
      });

      // the camera
      const cam = new T.PerspectiveCamera(face ? 22 : 30, w / h, 0.05, 60);
      if (face) {
        const s = shown.find((x) => x.who === face + (style === "painted" ? "-painted" : "")) ?? shown[0];
        const y = s.h - 0.13;
        cam.position.set(s.root.position.x, y, 0.95);
        cam.lookAt(s.root.position.x, y - 0.01, 0);
      } else {
        const span = Math.max(1.6, shown.length * gap);
        cam.position.set(0, 1.05, span * 1.55 + 1.6);
        cam.lookAt(0, 0.92, 0);
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

      // one walker poses everyone
      const loco = new C.Locomotion(KH_FEEL);
      loco.seed = 2;
      const speed = act === "walk" ? 1.5 : 0;
      let t = 0;
      const step = () => {
        const dt = 1 / 60;
        const mo = loco.update(
          dt,
          {
            dist: speed * dt,
            speed,
            ahead: speed,
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
        t += dt;
        // the face: the walker's gaze (its blinks and glances), or as asked
        const gz = loco.gazeOut;
        const blink = q.get("blink") !== null ? Number(q.get("blink")) : (gz?.blink ?? 0);
        const ex = q.get("eyes")?.split(",").map(Number) ?? [gz?.eyes[0] ?? 0, gz?.eyes[1] ?? 0];
        const smile = Number(q.get("smile") ?? 0);
        const talk = Number(q.get("talk") ?? 0);
        for (const s of shown) {
          s.setPose(mo.pose, mo.lift);
          s.face(blink, talk, smile);
          s.eyes(ex[0] ?? 0, ex[1] ?? 0);
        }
      };
      if (frozen !== null) while (t < frozen) step();
      let drawn = 0;
      const frame = () => {
        if (gone) return;
        f.pump(1000);
        let ready = true;
        for (const m of todays) ready = m.update(1) && ready;
        if (frozen === null || drawn < 3) step();
        composer.render();
        drawn++;
        if (drawn > 30 && ready) (window as unknown as { __life: object }).__life = { ready: true, t };
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
