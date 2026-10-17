"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";
import type { PadLook } from "@/world/tp/pads3d";

// Dev only: the game pads' 3D models up close (docs/plan/23-disc-console.md
// P1): the disc console's pad lying flat, tipped up as it's held, and from the
// side — under the same Lambert lighting the world uses. ?analog=1 lights its LED.
export default function PadsDev() {
  if (process.env.NODE_ENV === "production") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    let dispose = () => {};
    void (async () => {
      const THREE = await import("three");
      const { ps1Pad } = await import("@/world/tp/pads3d");
      const el = host.current;
      if (!el || stop) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x3b281b);
      scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4030, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-1, 2, 1.4);
      sun.castShadow = true;
      scene.add(sun);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshLambertMaterial({ color: 0x8a5a36 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const lit = (c: number) => new THREE.MeshLambertMaterial({ color: c });
      const analog = new URLSearchParams(location.search).has("analog");
      const look = {
        body: lit(0xb9b6af),
        dark: lit(0x2a2826),
        colors: [lit(0x5fae8a), lit(0xd0524a), lit(0x6f8fd0), lit(0xd889b8)] as PadLook["colors"],
        led: new THREE.MeshBasicMaterial({ color: analog ? 0xff3a2a : 0x5a1d18, toneMapped: false }),
      };
      const W1 = 1; // a pad 1 unit wide, to look at
      const flat = ps1Pad(look, W1);
      flat.position.set(-1.3, 0, 0);
      const held = ps1Pad(look, W1);
      held.position.set(0, 0.5, 0);
      held.rotation.set(0.5, 0, 0, "YXZ"); // as games3d holds it (tipped up, facing the camera)
      const side = ps1Pad(look, W1);
      side.position.set(1.3, 0, 0);
      side.rotation.y = Math.PI / 2 + 0.5;
      scene.add(flat, held, side);
      const cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 50);
      cam.position.set(0, 2.2, 3.4);
      cam.lookAt(0, 0.15, 0);
      renderer.render(scene, cam);
      (window as unknown as { __padsDev: unknown }).__padsDev = { ready: true };
      dispose = () => {
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      stop = true;
      dispose();
    };
  }, []);
  return <div ref={host} style={{ width: "100vw", height: "100vh" }} />;
}
