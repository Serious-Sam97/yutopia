import type { CarLook } from "@yutopia/shared/car";
import * as T3 from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCar, carManifest, forgetRenderer, loadCarManifest } from "./glb";
import type { Sedan } from "./model";

// MOTORS' stand (docs/plan/92-the-cars.md F13b): the car you're choosing, turning on a turntable in the buy
// panel — its variant, its colours, its extras and wheels as they'll be in the world. Its own small
// renderer on the panel's canvas (not the world's: nothing read back from the GPU), drawn ~30 times a
// second while the panel's open and seen, everything it loaded let go when it's closed.

export interface Stand {
  /** the car shown now (made again only when its look changed) */
  show(look: CarLook, role?: string): void;
  dispose(): void;
}

const FPS = 30;

export async function makeStand(canvas: HTMLCanvasElement): Promise<Stand> {
  await loadCarManifest();
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new T3.Scene();
  const pm = new T3.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pm.fromScene(room, 0.04).texture;
  scene.environment = env;
  const cam = new T3.PerspectiveCamera(30, 1, 0.1, 100);
  // the turntable: a dark disc on a softer ground, a sun and the sky
  const floorGeo = new T3.CircleGeometry(4.2, 72).rotateX(-Math.PI / 2);
  const floorMat = new T3.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.55, metalness: 0.1 });
  const floor = new T3.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  const ringGeo = new T3.RingGeometry(4.2, 4.32, 72).rotateX(-Math.PI / 2);
  const ringMat = new T3.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.4, metalness: 0.6 });
  const ring = new T3.Mesh(ringGeo, ringMat);
  ring.position.y = 0.002;
  const turn = new T3.Group();
  turn.add(floor, ring);
  scene.add(turn);
  const sun = new T3.DirectionalLight(0xfff1de, 2.2);
  sun.position.set(5, 8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, far: 25 });
  const sky = new T3.HemisphereLight(0xe6edf5, 0x3a3128, 0.9);
  scene.add(sun, sky);

  let car: Sedan | null = null;
  let key = "";
  let size = 4.6; // the car's length (framing)
  let raf = 0;
  let last = 0;
  let dead = false;
  const t0 = performance.now();

  const fit = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // (the whole car in as it turns, a little room round it; low, as you'd look at it on a forecourt)
    const fov = (cam.fov * Math.PI) / 180;
    const across = size * 1.08; // (its length, and a bit, whichever way it's turned)
    const dv = across / 2 / Math.tan(fov / 2) / Math.min(1, cam.aspect);
    const d = Math.max(dv * 0.62, 3.2);
    cam.position.set(d * 0.8, d * 0.2 + 0.55, d * 0.6);
    cam.lookAt(0, 0.55, 0);
    cam.updateProjectionMatrix();
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS - 2 || document.hidden) return;
    last = now;
    // (a slow turn: a full one in ~24 s)
    turn.rotation.y = ((now - t0) / 1000) * ((Math.PI * 2) / 24);
    if (car) car.root.rotation.y = turn.rotation.y;
    fit();
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(frame);

  return {
    show(look, role) {
      const k = JSON.stringify([look, role ?? ""]);
      if (k === key || dead) return;
      key = k;
      car?.dispose();
      car = null;
      const e = carManifest()?.cars[look.variant];
      if (!e) return;
      size = Math.max(e.dims?.length ?? 4.6, 2.4);
      // (the turntable a little longer than the car)
      turn.scale.setScalar((size * 0.62) / 4.2);
      const c = buildCar({ variant: look.variant, look, role, plate: "MOTORS", level: "near", renderer, priority: 0 });
      c.setEnv(env);
      c.setLights({ beams: "off", tail: false, brake: 0, reverse: false, ind: 0, dash: 0.3, dome: false });
      scene.add(c.root);
      car = c;
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      car?.dispose();
      car = null;
      floorGeo.dispose();
      floorMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      env.dispose();
      pm.dispose();
      room.dispose();
      forgetRenderer(renderer);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
