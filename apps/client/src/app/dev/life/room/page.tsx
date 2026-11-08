"use client";

import { type AvatarLayers, DEFAULT_AVATAR, type WorldObjectDef } from "@yutopia/shared";
import { KH_FEEL } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 0c — a corner of a room in the life look (dev only): the life kit's sofa, desk and
// office chair (world/look/life-kit.ts), the rubber tree (tools/art/life/build_plant.py), painted
// floorboards and plaster, a rug; the new man at the desk, the new woman on the sofa; under the life
// light (soft sun shadows, the sky in the sheen, ground-truth AO, Khronos PBR Neutral's curve).
//   /dev/life/room              the life kit
//   ?kit=today                  the same room with today's models and people (the same light)
//   ?hour=22                    night: the sun out, a floor lamp and the desk's laptop
//   ?view=close                 nearer, on the sofa and the plant   ?view=desk  on the desk and chair
//   ?t=2.4                      frozen at 2.4 s in
// window.__life.ready once drawn (e2e/life-bench.mts).
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
    shoesColor: "#dedad2",
  },
  woman: {
    ...DEFAULT_AVATAR,
    gender: "feminine",
    skin: "#5b3a27",
    hair: "ponytail",
    hairColor: "#1c140f",
    top: "shirt",
    topColor: "#5e2a36",
    bottom: "skirt",
    bottomColor: "#4c524c",
    shoesColor: "#1c1c1c",
  },
};

// where everything stands (m; the back wall at z −1.25, the left wall at x −3.3)
const SOFA = { x: -1.35, z: -0.68 };
const PLANT = { x: -2.95, z: -0.88 };
const DESK = { x: 1.45, z: -0.85 };
const CHAIR = { x: 1.5, z: -0.3 };
const SEAT_Y = 0.47;
const COFFEE = { x: -1.35, z: 0.62 };
const LAMP = { x: -2.95, z: -0.05 };
const SIDE = { x: -0.05, z: -0.9 };
// the window, over the desk (its middle; the life kit only — today's room has none)
const WIN = { x: 1.45, y: 1.55, w: 1.3, h: 1.25 };
const BOOKS = { x: -3.12, z: 0.55 };

export default function LifeRoom() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const today = q.get("kit") === "today";
    const night = Number(q.get("hour") ?? 12) >= 20;
    const view = q.get("view") ?? "room";
    const frozen = q.get("t") !== null ? Number(q.get("t")) : null;
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
      const C = await import("@/world/chars");
      await C.loadHero();
      const L = await import("@/world/look/life-person");
      const K = await import("@/world/look/life-kit");
      const N = await import("@/world/furn/native");
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
      scene.background = new T.Color(night ? 0x0b0d14 : 0xd6dde4);

      // the room: floorboards, plaster walls with a skirting board, a rug
      const M = K.lifeMats();
      const floorTex = today ? null : K.floorTex(0xc79a68, 0x8d6240);
      floorTex?.repeat.set(4, 4);
      const floor = new T.Mesh(
        new T.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial(floorTex ? { map: floorTex, roughness: 0.55 } : { color: 0xa87b52, roughness: 0.8 }),
      );
      floor.position.set(0, 0, 2.75);
      floor.receiveShadow = true;
      scene.add(floor);
      const wallTex = today ? null : K.plasterTex(0xe9dcc6);
      const wallMat = new T.MeshStandardMaterial(
        wallTex ? { map: wallTex, roughness: 0.92 } : { color: 0xe6d8c0, roughness: 0.95 },
      );
      // (the back wall, a window cut in it over the desk: the life kit's)
      const wallShape = new T.Shape();
      wallShape.moveTo(-3.3, 0);
      wallShape.lineTo(4.7, 0);
      wallShape.lineTo(4.7, 3.2);
      wallShape.lineTo(-3.3, 3.2);
      wallShape.lineTo(-3.3, 0);
      if (!today) {
        const hole = new T.Path();
        hole.moveTo(WIN.x - WIN.w / 2, WIN.y - WIN.h / 2);
        hole.lineTo(WIN.x - WIN.w / 2, WIN.y + WIN.h / 2);
        hole.lineTo(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2);
        hole.lineTo(WIN.x + WIN.w / 2, WIN.y - WIN.h / 2);
        hole.lineTo(WIN.x - WIN.w / 2, WIN.y - WIN.h / 2);
        wallShape.holes.push(hole);
      }
      wallTex?.repeat.set(0.5, 0.5);
      const back = new T.Mesh(new T.ShapeGeometry(wallShape), wallMat);
      back.position.set(0, 0, -1.25);
      back.castShadow = true;
      back.receiveShadow = true;
      const side = new T.Mesh(new T.PlaneGeometry(8, 3.2), wallMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(-3.3, 1.6, 2.75);
      side.receiveShadow = true;
      scene.add(back, side);
      if (!today) {
        // a thick wall: its reveal round the window (so the sun comes through a box, not a cut-out)
        const reveal = new T.MeshStandardMaterial({ color: 0xece2d2, roughness: 0.9 });
        const T_ = 0.16;
        for (const [x, y, w2, h2] of [
          [WIN.x, WIN.y + WIN.h / 2 + 0.01, WIN.w + 0.02, 0.02],
          [WIN.x, WIN.y - WIN.h / 2 - 0.01, WIN.w + 0.02, 0.02],
          [WIN.x - WIN.w / 2 - 0.01, WIN.y, 0.02, WIN.h],
          [WIN.x + WIN.w / 2 + 0.01, WIN.y, 0.02, WIN.h],
        ] as const) {
          const r = new T.Mesh(new T.BoxGeometry(w2, h2, T_), reveal);
          r.position.set(x, y, -1.25 - T_ / 2);
          r.castShadow = r.receiveShadow = true;
          scene.add(r);
        }
        const out = new T.Mesh(new T.PlaneGeometry(30, 14), wallMat);
        out.position.set(0.7, 1.6, -1.25 - T_);
        out.rotation.y = Math.PI;
        out.castShadow = true;
        scene.add(out);
        const win = K.lifeWindow(M, WIN.w, WIN.h);
        win.position.set(WIN.x, WIN.y, -1.25 - 0.06);
        scene.add(win);
        // (seen from up high, the window looks down onto it: its horizon set where those sight lines
        // land, so the sky and the treeline show, not only lawn)
        const view = K.lifeOutside(night, 16, 4.4);
        view.position.set(WIN.x, 0.55, -7);
        scene.add(view);
        // curtains on a rod either side
        const rod = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, WIN.w + 0.9, 12), M.metal);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(WIN.x, WIN.y + WIN.h / 2 + 0.22, -1.17);
        scene.add(rod);
        for (const sx of [-1, 1]) {
          const c = K.lifeCurtain(0xc8c09a, 0.5, WIN.h + 0.75, sx > 0 ? 2 : 5);
          c.position.set(WIN.x + sx * (WIN.w / 2 + 0.2), WIN.y + WIN.h / 2 + 0.2, -1.16);
          scene.add(c);
        }
      }
      if (!today) {
        const skirt = new T.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.45 });
        const sb = new T.Mesh(new RoundedBoxGeometry(8, 0.12, 0.025, 2, 0.008), skirt);
        sb.position.set(0.7, 0.06, -1.24);
        const ss = new T.Mesh(new RoundedBoxGeometry(0.025, 0.12, 8, 2, 0.008), skirt);
        ss.position.set(-3.29, 0.06, 2.75);
        sb.receiveShadow = ss.receiveShadow = true;
        scene.add(sb, ss);
        const rug = new T.Mesh(
          new RoundedBoxGeometry(2.3, 0.012, 1.5, 2, 0.005),
          new T.MeshPhysicalMaterial({
            map: K.fabricTex(0xb6614a, 11),
            roughness: 1,
            sheen: 0.8,
            sheenColor: new T.Color(0xf0c0a0),
          }),
        );
        rug.position.set(SOFA.x, 0.006, SOFA.z + 1.0);
        rug.receiveShadow = true;
        scene.add(rug);
      }

      // the things
      const place = (o: InstanceType<typeof T.Object3D>, at: { x: number; z: number }, yaw = 0) => {
        o.position.set(at.x, 0, at.z);
        o.rotation.y = yaw;
        o.traverse((x) => {
          x.castShadow = true;
          x.receiveShadow = true;
        });
        scene.add(o);
      };
      if (today) {
        // today's models, as the world draws them (centred on their own footprint)
        const lam = new T.MeshLambertMaterial({ vertexColors: true });
        const todayOf = (def: Partial<WorldObjectDef> & { kind: string; variant: number }) => {
          const geo = N.modelOf({ id: "look", x: 0, y: 0, rot: 0, ...def, props: { variant: def.variant } } as never);
          geo.computeBoundingBox();
          const b = geo.boundingBox as InstanceType<typeof T.Box3>;
          const m = new T.Mesh(geo, lam);
          const g = new T.Group();
          m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          g.add(m);
          console.log(
            `today ${def.kind}: ${(b.max.x - b.min.x).toFixed(2)} × ${(b.max.y - b.min.y).toFixed(2)} × ${(b.max.z - b.min.z).toFixed(2)}`,
          );
          return g;
        };
        place(todayOf({ kind: "sofa", variant: 0 }), SOFA);
        place(todayOf({ kind: "plant", variant: 3 }), PLANT);
        place(todayOf({ kind: "desk", variant: 0 }), DESK);
        place(todayOf({ kind: "chair", variant: 1 }), CHAIR, Math.PI + 0.25);
      } else {
        place(K.lifeSofa(M), SOFA);
        place(K.lifeDesk(M), DESK);
        place(K.lifeChair(M), CHAIR, Math.PI + 0.25);
        place(K.lifeCoffeeTable(M), COFFEE, 0.04);
        place(K.lifeBookcase(M, 3), BOOKS, Math.PI / 2);
        place(K.lifeFloorLamp(M, night), LAMP);
        place(K.lifeSideTable(M), SIDE);
        const tl = K.lifeTableLamp(M, night);
        tl.position.set(SIDE.x, 0.55, SIDE.z);
        scene.add(tl);
        const vase = K.lifeVase(1);
        vase.position.set(COFFEE.x + 0.12, 0.42, COFFEE.z + 0.02);
        scene.add(vase);
        for (const [x, y, w, h, seed] of [
          [-1.8, 1.5, 0.62, 0.46, 1],
          [-0.98, 1.56, 0.42, 0.56, 2],
        ] as const) {
          const pic = K.lifePicture(M, w, h, seed);
          pic.position.set(x, y, -1.23);
          pic.traverse((o) => {
            o.castShadow = true;
            o.receiveShadow = true;
          });
          scene.add(pic);
        }
        const plant = (await new GLTFLoader().loadAsync("/life/plant-rubber.glb")).scene;
        plant.traverse((o) => {
          const m = (o as InstanceType<typeof T.Mesh>).material as
            | InstanceType<typeof T.MeshStandardMaterial>
            | undefined;
          if (m && /leaf/.test(m.name)) m.side = T.DoubleSide;
        });
        place(plant, PLANT);
      }

      // the light: by day a low warm sun through the window side and the sky; at night a floor lamp
      // and the laptop's glow
      const hemi = new T.HemisphereLight(today ? 0xdfe8ff : 0xfff1e2, 0x9a7a5c, night ? 0.08 : today ? 1.15 : 1.75);
      scene.add(hemi);
      // (by day the sun comes in at the window: from behind the back wall, high, a patch of it on the
      // floor and the desk — the rest of the room in the sky's light)
      const sun = new T.DirectionalLight(0xffe2c0, night ? 0 : today ? 2.8 : 4.2);
      if (today) sun.position.set(4.5, 5.5, 5);
      else {
        sun.position.set(-0.4, 7.2, -5.4);
        sun.target.position.set(1.6, 0, 0.6);
        scene.add(sun.target);
      }
      sun.castShadow = !night;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 5;
      sun.shadow.blurSamples = 16;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -5;
      sc.far = 30;
      sc.right = sc.top = 5;
      scene.add(sun);
      if (night) {
        const lamp = new T.PointLight(0xffc27a, 9, 9, 1.6);
        lamp.position.set(LAMP.x, 1.5, LAMP.z);
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(1024, 1024);
        lamp.shadow.radius = 4;
        scene.add(lamp);
        const glow = new T.PointLight(0x9cc4ff, 1.2, 2.5, 2);
        glow.position.set(DESK.x - 0.15, 1.0, DESK.z + 0.1);
        scene.add(glow);
        const table = new T.PointLight(0xffc98a, 2.2, 4, 1.8);
        table.position.set(SIDE.x, 0.95, SIDE.z + 0.05);
        scene.add(table);
        const ceiling = new T.PointLight(0xffd6a0, 3, 7, 1.8);
        ceiling.position.set(0.4, 2.7, 0.6);
        scene.add(ceiling);
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
      scene.environmentIntensity = today || night ? 0.5 : 0.7;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the people: the man standing by the desk, the woman sat on the sofa
      type Who = {
        root: InstanceType<typeof T.Group>;
        pose: (p: object, lift: [number, number, number]) => void;
        face: (blink: number, eyes: [number, number]) => void;
        drop: number;
      };
      const f = new C.CharFactory();
      const todays: InstanceType<typeof C.PersonModel>[] = [];
      const people: Record<string, Who> = {};
      for (const g of ["man", "woman"]) {
        if (today) {
          const m = new C.PersonModel(f, TODAY[g], 0);
          todays.push(m);
          people[g] = {
            root: m.root,
            pose: (p, lift) => m.setPose(p as never, lift),
            face: (b, e) => {
              m.setFace(b, 0);
              m.setEyes(e[0], e[1]);
            },
            drop: 0,
          };
        } else {
          const lp = await L.loadLifePerson(`/life/person-${g}-painted.glb`);
          people[g] = {
            root: lp.root,
            pose: (p, lift) => lp.setPose(p as never, lift),
            face: (b, e) => {
              lp.setFace(b, 0, 0.35);
              lp.setEyes(e[0], e[1]);
            },
            drop: lp.sitDrop(SEAT_Y),
          };
        }
        people[g].root.traverse((o) => {
          o.castShadow = true;
        });
        scene.add(people[g].root);
      }
      const man = people.man;
      const woman = people.woman;
      man.root.position.set(DESK.x + 0.75, 0, DESK.z + 0.85);
      man.root.rotation.y = -0.6;
      woman.root.position.set(SOFA.x - 0.15, 0, SOFA.z + 0.13);

      // the camera: high and three-quarter, as a life sim looks into a room
      const cam = new T.PerspectiveCamera(view === "room" ? 34 : 30, w / h, 0.05, 60);
      if (view === "close") {
        cam.position.set(-0.6, 1.55, 2.4);
        cam.lookAt(-1.8, 0.6, -0.6);
      } else if (view === "desk") {
        cam.position.set(2.9, 1.7, 1.9);
        cam.lookAt(1.35, 0.65, -0.6);
      } else {
        cam.position.set(2.9, 3.0, 5.6);
        cam.lookAt(-0.2, 0.6, -0.4);
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

      // motion: he idles (the walker's idle and gaze), she sits (the base motion, sat)
      const loco = new C.Locomotion(KH_FEEL);
      loco.seed = 3;
      const sitter = new C.Motion3(0.31);
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
        man.pose(mo.pose, mo.lift);
        const gz = loco.gazeOut;
        man.face(gz?.blink ?? 0, [gz?.eyes[0] ?? 0, gz?.eyes[1] ?? 0]);
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
        const drop = today ? (todays[1]?.sitDrop(SEAT_Y) ?? 0) : woman.drop;
        woman.pose(so.pose, [so.lift[0], so.lift[1] + drop * so.settle, so.lift[2]]);
        woman.face(so.blink, so.eyes ?? [0.3, 0.05]);
        t += dt;
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
