"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// Plan 73, phase 4.5 — a crowd of life people as the game draws them (dev only): PersonModel with the
// life look's host (chars/life.ts), each at the game's level for their distance — the far person past
// 11 m — walking in place under the sun's shadows and the sky. What it costs: draws, triangles, the frame.
//   /dev/life/crowd               40 people, rows from 3 to ~40 m
//   ?n=80                         how many
//   ?far=0                        everyone near (the full person), to compare
//   ?near=0                       everyone far
//   ?cam=far                      the camera further back (the far ones bigger on screen)
// window.__life = { ready, calls, tris, ms, renderMs (the render with the GPU waited for), near, far } after
// 120 frames (e2e/life-bench.mts `crowd:`).

export default function LifeCrowd() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let raf = 0;
    const q = new URLSearchParams(location.search);
    const n = Number(q.get("n") ?? 40);
    const allowFar = q.get("far") !== "0";
    const allowNear = q.get("near") !== "0";
    const cleanup: (() => void)[] = [];
    (async () => {
      const T = await import("three");
      const C = await import("@/world/chars");
      const { yuLit } = await import("@/world/look/yulit");
      const { setLifeTone } = await import("@/world/look/life-tone");
      const { avatarFromSeed } = await import("@yutopia/shared");
      if (gone || !host.current) return;
      const w = host.current.clientWidth;
      const h = host.current.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      setLifeTone(renderer);
      renderer.info.autoReset = false;
      host.current.appendChild(renderer.domElement);
      cleanup.push(() => renderer.dispose());
      const scene = new T.Scene();
      scene.background = new T.Color(0xc9d6e2);
      const floor = new T.Mesh(
        new T.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
        new T.MeshStandardMaterial({ color: 0xb9ae9c, roughness: 0.92 }),
      );
      floor.receiveShadow = true;
      scene.add(floor);
      scene.add(new T.HemisphereLight(0xd8e6ff, 0x8a7560, 1.2));
      const sun = new T.DirectionalLight(0xfff0dc, 2.6);
      sun.position.set(8, 14, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.03;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -30;
      sc.right = sc.top = 30;
      sc.far = 80;
      sun.target.position.set(0, 0, -18);
      scene.add(sun, sun.target);
      const pm = new T.PMREMGenerator(renderer);
      const sky = new T.Scene();
      sky.background = new T.Color(0x9fb4cf);
      const env = pm.fromScene(sky, 0.02);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.6;
      cleanup.push(() => {
        env.dispose();
        pm.dispose();
      });

      // the people, as the game makes them: the life host first, then the factory
      C.setLifeHost({ renderer, lit: (m, base) => yuLit(m, { base }) });
      cleanup.push(() => C.setLifeHost(null));
      const f = new C.CharFactory();
      const cam = new T.PerspectiveCamera(50, w / h, 0.1, 200);
      cam.position.set(0, 1.7, q.get("cam") === "far" ? 8 : 4);
      cam.lookAt(0, 1.2, -20);
      const people: { m: InstanceType<typeof C.PersonModel>; a: ReturnType<typeof avatarFromSeed>; ph: number }[] = [];
      const PER = 8;
      for (let i = 0; i < n; i++) {
        const a = avatarFromSeed(i * 13 + 5);
        const m = new C.PersonModel(f, a, 1);
        m.seed = C.nameSeed(`crowd-${i}`);
        const row = Math.floor(i / PER);
        const col = (i % PER) - (PER - 1) / 2;
        m.root.position.set(col * (1.4 + row * 0.35), 0, 1 - row * 5);
        m.root.rotation.y = ((i * 37) % 360) * (Math.PI / 180);
        scene.add(m.root);
        people.push({ m, a, ph: (i * 0.137) % 1 });
      }
      (window as unknown as { __crowd: object }).__crowd = { scene, people };
      const at = new T.Vector3();
      let frames = 0;
      let t0 = 0;
      let readyAt = -1;
      let spent = 0;
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const frame = (now: number) => {
        if (gone) return;
        let ready = 0;
        let farN = 0;
        for (const p of people) {
          p.m.root.getWorldPosition(at);
          const d = at.distanceTo(cam.position);
          let lod: 0 | 1 | 2 = d < 3.5 ? 0 : d < 11 ? 1 : 2;
          if (!allowFar && lod === 2) lod = 1;
          if (!allowNear) lod = 2;
          p.m.set(p.a, lod);
          if (p.m.update(d)) ready++;
          if (lod === 2) farN++;
          const wp = C.walkPose((now / 1000 / 1.1 + p.ph) % 1);
          p.m.setPose(wp.pose, wp.lift);
        }
        renderer.info.reset();
        const r0 = performance.now();
        renderer.render(scene, cam);
        // (waited for: a pixel read back — the GPU's work in it, not only the CPU's)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (t0 > 0) spent += performance.now() - r0;
        if (ready === people.length && readyAt < 0) readyAt = frames;
        frames++;
        // (the frame measured once everyone's in and drawn a while: the gaps between frames, 120 of them)
        if (readyAt >= 0 && frames === readyAt + 30) t0 = now;
        if (readyAt >= 0 && frames === readyAt + 150) {
          (window as unknown as { __life: object }).__life = {
            ready: true,
            calls: renderer.info.render.calls,
            tris: renderer.info.render.triangles,
            ms: +((now - t0) / 120).toFixed(2),
            renderMs: +(spent / 120).toFixed(2),
            near: people.length - farN,
            far: farN,
          };
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      for (const c of cleanup) c();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#000" }} />;
}
