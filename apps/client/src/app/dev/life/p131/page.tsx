"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 131 phase 0 — the body mocks (dev only): three bases × three looks, the man and the woman side by
// side under /dev/life's light. Figures stand at rest (arms down); hair left off — the body is judged.
//   ?base=today|mh|bs          today's people · MakeHuman pushed · Blender Studio's CC0 base
//   ?look=sims4|inzoi|gtav     the look aimed at (the skin's finish here; the shape in the files)
//   ?view=body|face            ?who=man|woman (the face's)   ?spin=25
// Files: public/life/p131/{mh,bs}-<look>-<who>.glb (tools/art/life/mock131.py). window.__life.ready once drawn.

type Look = "sims4" | "inzoi" | "gtav";
// the skin's finish a look: its roughness, highlight, sheen, the baked relief's strength, pores
const FINISH: Record<
  Look,
  { rough: number; spec: number; sheen: number; coat: number; relief: number; pores: number; env: number }
> = {
  sims4: { rough: 0.6, spec: 0.35, sheen: 0.45, coat: 0, relief: 0.35, pores: 0, env: 0.7 },
  inzoi: { rough: 0.4, spec: 0.7, sheen: 0.3, coat: 0.12, relief: 0.6, pores: 0.18, env: 1 },
  gtav: { rough: 0.52, spec: 0.55, sheen: 0.2, coat: 0, relief: 1, pores: 0.45, env: 0.85 },
};
// today's people in the look's skin colour (the others carry their own painted skin)
const TODAY_SKIN: Record<Look, Record<string, string>> = {
  sims4: { man: "#e2b996", woman: "#5b3a27" },
  inzoi: { man: "#e9c4a6", woman: "#f0cdb6" },
  gtav: { man: "#d2a07c", woman: "#5b3a27" },
};

export default function P131() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const baseQ = q.get("base") ?? "today";
    const look = (q.get("look") ?? "sims4") as Look;
    const view = q.get("view") ?? "body";
    const whoQ = q.get("who") ?? "man";
    // (?shot=…: one figure, a framed view — the side-by-side comparisons)
    const shot = q.get("shot");
    const SHOTS: Record<
      string,
      { spin: number; fov: number; eye: (H: number) => [number, number, number]; at: (H: number) => number }
    > = {
      face: { spin: 0, fov: 18, eye: (H) => [0, H - 0.12, 0.95], at: (H) => H - 0.13 },
      face3q: { spin: 35, fov: 18, eye: (H) => [0, H - 0.12, 0.95], at: (H) => H - 0.13 },
      profile: { spin: 90, fov: 18, eye: (H) => [0, H - 0.12, 0.95], at: (H) => H - 0.13 },
      body: { spin: 0, fov: 30, eye: (H) => [0, H * 0.55, 3.6], at: (H) => H * 0.5 },
      body3q: { spin: 35, fov: 30, eye: (H) => [0, H * 0.55, 3.6], at: (H) => H * 0.5 },
      side: { spin: 90, fov: 30, eye: (H) => [0, H * 0.55, 3.6], at: (H) => H * 0.5 },
      back: { spin: 180, fov: 30, eye: (H) => [0, H * 0.55, 3.6], at: (H) => H * 0.5 },
      torso: { spin: 20, fov: 26, eye: (H) => [0, H * 0.74, 1.5], at: (H) => H * 0.7 },
      shoulders: { spin: 150, fov: 26, eye: (H) => [0, H * 0.78, 1.4], at: (H) => H * 0.76 },
      hands: { spin: 70, fov: 22, eye: (H) => [0, H * 0.46, 1.05], at: (H) => H * 0.45 },
      feet: { spin: 25, fov: 24, eye: () => [0, 0.35, 1.05], at: () => 0.08 },
    };
    const spin = (Number(q.get("spin") ?? (view === "face" ? 15 : 22)) * Math.PI) / 180;
    const F = { ...FINISH[look] };
    if (q.get("relief") !== null) F.relief = Number(q.get("relief"));
    if (q.get("pores") !== null) F.pores = Number(q.get("pores"));
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
      const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
      const { SKIN_PIECE } = await import("@/world/look/life-people");
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
      scene.background = new T.Color(0xc9d6e2);
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
      scene.add(new T.HemisphereLight(0xd8e6ff, 0x8a7560, 1.3));
      const sun = new T.DirectionalLight(0xfff0dc, 2.6);
      sun.position.set(3, 6, 4.5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.radius = 5;
      sun.shadow.blurSamples = 16;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -4;
      sc.right = sc.top = 4;
      scene.add(sun);
      const pm = new T.PMREMGenerator(renderer);
      const sky = new T.Scene();
      sky.add(
        new T.Mesh(
          new T.SphereGeometry(10, 32, 16),
          new T.ShaderMaterial({
            side: T.BackSide,
            uniforms: {
              top: { value: new T.Color(0xb8cff0).multiplyScalar(0.7) },
              ground: { value: new T.Color(0x6a5a48).multiplyScalar(0.5) },
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
      scene.environmentIntensity = 0.5;

      // pores: a tiling relief of small pits, added to the surface's own (a detail normal on the skin's UVs)
      const N = 256;
      const hgt = new Float32Array(N * N);
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 1400; i++) {
        const cx = rnd() * N;
        const cy = rnd() * N;
        const r = 1 + rnd() * 1.6;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const x = (Math.floor(cx) + dx + N) % N;
            const y = (Math.floor(cy) + dy + N) % N;
            const d = Math.hypot(dx + (cx % 1) - 0.5, dy + (cy % 1) - 0.5) / r;
            if (d < 1) hgt[y * N + x] -= (1 - d * d) * 0.8;
          }
      }
      for (let i = 0; i < N * N; i++) hgt[i] += (rnd() - 0.5) * 0.25;
      const px = new Uint8Array(N * N * 4);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const gx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)];
          const gy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
          const n = new T.Vector3(-gx, -gy, 1).normalize();
          const o = (y * N + x) * 4;
          px[o] = (n.x * 0.5 + 0.5) * 255;
          px[o + 1] = (n.y * 0.5 + 0.5) * 255;
          px[o + 2] = (n.z * 0.5 + 0.5) * 255;
          px[o + 3] = 255;
        }
      const pores = new T.DataTexture(px, N, N);
      pores.wrapS = pores.wrapT = T.RepeatWrapping;
      pores.generateMipmaps = true;
      pores.minFilter = T.LinearMipmapLinearFilter;
      pores.needsUpdate = true;
      const flat = new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
      flat.needsUpdate = true;
      const PORE_TILE = 90;

      // the skin's finish: the life look's wrap light, the look's roughness and sheen, the pores
      const skin = (m: InstanceType<typeof T.MeshStandardMaterial>) => {
        const out = new T.MeshPhysicalMaterial({
          map: m.map,
          normalMap: q.get("nmap") === "0" ? flat : (m.normalMap ?? flat),
          roughness: F.rough,
          metalness: 0,
          specularIntensity: F.spec,
          sheen: F.sheen,
          sheenColor: new T.Color(1, 0.72, 0.62),
          sheenRoughness: 0.55,
          clearcoat: F.coat,
          clearcoatRoughness: 0.4,
          envMapIntensity: F.env,
          color: m.color,
        });
        if (m.normalMap && q.get("nmap") !== "0") out.normalScale.copy(m.normalScale).multiplyScalar(F.relief);
        out.onBeforeCompile = (sh) => {
          if (q.get("wrap") !== "0") SKIN_PIECE.patch(sh, renderer);
          sh.uniforms.lifePores = { value: pores };
          sh.uniforms.lifePoreK = { value: F.pores };
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform sampler2D lifePores;\nuniform float lifePoreK;")
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 lifePd = texture2D( lifePores, vNormalMapUv * ${PORE_TILE.toFixed(1)} ).xyz * 2.0 - 1.0;
	normal = normalize( normal + tbn * vec3( lifePd.xy * lifePoreK, 0.0 ) );
#endif`,
            );
        };
        out.customProgramCacheKey = () => `p131-skin-${look}`;
        return out;
      };
      const cloth = (top: boolean) =>
        new T.MeshStandardMaterial({ color: top ? 0x6a1e22 : 0x1d2740, roughness: 0.85, side: T.DoubleSide });

      const people: InstanceType<typeof T.Object3D>[] = [];
      const heights: number[] = [];
      for (const g of view === "face" || shot ? [whoQ] : ["man", "woman"]) {
        if (baseQ === "today") {
          const L = await import("@/world/look/life-person");
          const C = await import("@/world/chars");
          await C.loadHero();
          const a: AvatarLayers = {
            ...DEFAULT_AVATAR,
            gender: g === "man" ? "masculine" : "feminine",
            skin: TODAY_SKIN[look][g],
            bottomColor: "#1d2740",
            topColor: "#6a1e22",
            shoesColor: "#2a2420",
          };
          const worn = g === "man" ? ["bottom-shorts"] : ["bottom-shorts", "top-crop"];
          const lp = await L.loadLifePerson(`/life/person-${g}-painted.glb`, renderer, a, {
            names: worn,
            pattern: "plain",
          });
          lp.setPose({});
          lp.root.traverse((o) => {
            if (/hair|shoes/.test(o.name) || /hair|shoes/.test(o.parent?.name ?? "")) o.visible = false;
          });
          for (const m of lp.meshes)
            if (m.name === "body") m.material = skin(m.material as InstanceType<typeof T.MeshStandardMaterial>);
          people.push(lp.root);
          heights.push(lp.height);
        } else {
          const gl = await new GLTFLoader().loadAsync(`/life/p131/${baseQ}-${look}-${g}.glb`);
          let top = 0;
          gl.scene.traverse((o) => {
            const m = o as InstanceType<typeof T.Mesh>;
            if (!m.isMesh) return;
            m.castShadow = m.receiveShadow = true;
            const mm = m.material as InstanceType<typeof T.MeshStandardMaterial>;
            if (/^skin/.test(mm.name))
              m.material =
                q.get("debug") === "albedo"
                  ? new T.MeshBasicMaterial({ map: mm.map })
                  : q.get("debug") === "normal"
                    ? new T.MeshNormalMaterial(
                        mm.normalMap && q.get("nmap") !== "0"
                          ? { normalMap: mm.normalMap, normalScale: mm.normalScale }
                          : {},
                      )
                    : q.get("debug") === "std"
                      ? new T.MeshStandardMaterial({ map: mm.map, roughness: 0.55 })
                      : skin(mm);
            else if (/^(bottom|top)/.test(mm.name)) m.material = cloth(/^top/.test(mm.name));
            else if (/^eye/.test(mm.name)) {
              const e = new T.MeshPhysicalMaterial({
                map: mm.map,
                roughness: 0.3,
                clearcoat: 1,
                clearcoatRoughness: 0.03,
                envMapIntensity: 1.2,
                // (MakeHuman's eye: its cornea cut out by the texture's alpha)
                alphaTest: mm.map && mm.name === "eyes" ? 0.5 : 0,
              });
              m.material = e;
            }
            m.geometry.computeBoundingBox();
            top = Math.max(top, m.geometry.boundingBox?.max.y ?? 0);
          });
          people.push(gl.scene);
          heights.push(top);
        }
      }
      people.forEach((p, i) => {
        p.position.x = view === "face" || shot ? 0 : (i - (people.length - 1) / 2) * 0.95;
        p.rotation.y = shot ? (SHOTS[shot].spin * Math.PI) / 180 : i === 0 ? spin : -spin;
        p.traverse((o) => {
          o.castShadow = true;
        });
        scene.add(p);
      });
      const cam = new T.PerspectiveCamera(shot ? SHOTS[shot].fov : view === "face" ? 20 : 30, w / h, 0.05, 60);
      if (shot) {
        const S = SHOTS[shot];
        cam.position.set(...S.eye(heights[0]));
        cam.lookAt(0, S.at(heights[0]), 0);
      } else if (view === "face") {
        const eye = heights[0] - 0.12;
        cam.position.set(0, eye, 0.95);
        cam.lookAt(0, eye - 0.01, 0);
      } else {
        cam.position.set(0, 1.0, 4.2);
        cam.lookAt(0, 0.9, 0);
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
      let drawn = 0;
      const frame = () => {
        if (gone) return;
        composer.render();
        drawn++;
        if (drawn > 20) (window as unknown as { __life: object }).__life = { ready: true, scene, T };
        raf = requestAnimationFrame(frame);
      };
      frame();
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });
    })();
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      for (const c of cleanup) c();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#000" }} />;
}
