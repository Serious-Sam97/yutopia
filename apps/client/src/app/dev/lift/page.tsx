"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The elevator and the stairs, made properly — phase 0's prototype
// (docs/plan/26-floor-transitions.md): the new models (world/tp/lift3d.ts,
// stairs3d.ts) in a scene of their own, with the motion and the sounds on one
// timeline. Dev only (or a build with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/lift?scene=landing|car|ride|stairs|iso|isostairs   which shot
//   &t=2.9      the timeline frozen at t seconds (a still); without it, it plays
//   &from=5     playing, from there
//   &w=&h=      the canvas' size (default: the window)
//
// The timeline (seconds): call 0.3 · the car arrives 2.0 (chime, doors open)
// · in 3.3–5.0 · "4" pressed 5.3 · doors shut 6.0–7.1 · the ride 7.3–11.5
// (G → 4) · chime 11.6, doors open 11.8–12.9 · out. Sounds are stand-ins
// (synthesised) until the CC0 samples are in. In the iso shot the walls
// towards the camera are cut, as the iso view's "cut" walls.

type Scene = "landing" | "car" | "ride" | "stairs" | "iso" | "isostairs";
const SCENES: Scene[] = ["landing", "car", "ride", "stairs", "iso", "isostairs"];
const STOREY = 3.5;
const LOOP = 15;

// what happens when (one timeline for the doors, the car, the people, the sounds)
const T = {
  call: 0.3,
  arrive: 2.0,
  open: [2.05, 3.15] as const,
  walkIn: [3.3, 5.0] as const,
  press: 5.3,
  shut: [6.0, 7.1] as const,
  ride: [7.3, 11.5] as const,
  chime: 11.6,
  open2: [11.8, 12.9] as const,
};
const between = (t: number, [a, b]: readonly [number, number]) => Math.max(0, Math.min(1, (t - a) / (b - a)));

interface State {
  doors: number; // 0..1 (eased)
  carY: number; // the car's height (floors × STOREY), G = 0
  display: string;
  lantern: -1 | 0 | 1;
  lit: string[]; // the car's panel
  called: boolean;
  walk: number; // 0..1 into the car
  riding: boolean;
}

function stateAt(t: number, ease: (k: number) => number, ride: (a: number, b: number, t: number, l: number) => number) {
  const s: State = {
    doors: 0,
    carY: 3 * STOREY,
    display: "3▼",
    lantern: 0,
    lit: [],
    called: false,
    walk: 0,
    riding: false,
  };
  // the car comes down from 3 to G for the call
  if (t >= T.call && t < T.arrive + 0.2) s.called = true;
  if (t < T.arrive) {
    s.carY = ride(3 * STOREY, 0, t - T.call, T.arrive - T.call);
    s.display = `${["G", "1", "2", "3"][Math.round(s.carY / STOREY)]}▼`;
    s.lantern = t > T.call ? -1 : 0;
  } else {
    s.carY = 0;
    s.display = "G";
    s.lantern = t < T.shut[0] ? 1 : 0;
  }
  s.doors = ease(between(t, T.open)) * (1 - ease(between(t, T.shut)));
  s.walk = between(t, T.walkIn);
  if (t >= T.press) s.lit = ["4"];
  if (t >= T.ride[0]) {
    s.riding = t < T.ride[1];
    s.carY = ride(0, 4 * STOREY, t - T.ride[0], T.ride[1] - T.ride[0]);
    const f = Math.min(4, Math.floor(s.carY / STOREY + 0.5));
    s.display = `${["G", "1", "2", "3", "4"][f]}${t < T.ride[1] ? "▲" : ""}`;
    s.lantern = t >= T.chime ? 1 : 0;
    if (t >= T.chime) s.lit = [];
  }
  if (t >= T.open2[0]) s.doors = ease(between(t, T.open2));
  return s;
}

// ── sound stand-ins (WebAudio) ──────────────────────────────────────────────
function sounds() {
  const ctx = new AudioContext();
  const out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(ctx.destination);
  const noise = (len: number) => {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  };
  const env = (g: GainNode, at: number, a: number, peak: number, d: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + a);
    g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
  };
  return {
    ctx,
    click() {
      const at = ctx.currentTime;
      const n = noise(0.05);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3200;
      const g = ctx.createGain();
      env(g, at, 0.002, 0.5, 0.04);
      n.connect(f).connect(g).connect(out);
      n.start(at);
      const o = ctx.createOscillator();
      o.frequency.value = 1760;
      const g2 = ctx.createGain();
      env(g2, at + 0.03, 0.005, 0.08, 0.12);
      o.connect(g2).connect(out);
      o.start(at + 0.03);
      o.stop(at + 0.2);
    },
    // a bell: one tone going up, two going down (the real convention)
    chime(up: boolean) {
      const at = ctx.currentTime;
      const notes = up ? [1318.5] : [1318.5, 1046.5];
      notes.forEach((hz, i) => {
        for (const [k, a] of [
          [1, 0.35],
          [2.76, 0.08],
          [5.4, 0.03],
        ]) {
          const o = ctx.createOscillator();
          o.frequency.value = hz * k;
          const g = ctx.createGain();
          env(g, at + i * 0.42, 0.004, a, 1.6);
          o.connect(g).connect(out);
          o.start(at + i * 0.42);
          o.stop(at + i * 0.42 + 1.8);
        }
      });
    },
    // the doors: a motor's whirr and the leaves' slide
    doors(len: number) {
      const at = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(70, at);
      o.frequency.linearRampToValueAtTime(110, at + len * 0.5);
      o.frequency.linearRampToValueAtTime(60, at + len);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.09, at + 0.1);
      g.gain.linearRampToValueAtTime(0.0001, at + len);
      o.connect(lp).connect(g).connect(out);
      o.start(at);
      o.stop(at + len);
      const n = noise(len);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 0.7;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, at);
      g2.gain.linearRampToValueAtTime(0.05, at + len * 0.4);
      g2.gain.linearRampToValueAtTime(0.0001, at + len);
      n.connect(bp).connect(g2).connect(out);
      n.start(at);
      // the stop: a soft thud
      const th = ctx.createOscillator();
      th.frequency.value = 55;
      const g3 = ctx.createGain();
      env(g3, at + len - 0.02, 0.005, 0.25, 0.18);
      th.connect(g3).connect(out);
      th.start(at + len - 0.02);
      th.stop(at + len + 0.3);
    },
    // the ride: a hum and air rising and falling with the speed
    ride(len: number) {
      const at = ctx.currentTime;
      const o = ctx.createOscillator();
      o.frequency.value = 48;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.12, at + len * 0.3);
      g.gain.linearRampToValueAtTime(0.12, at + len * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + len);
      const n = noise(len);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, at);
      lp.frequency.linearRampToValueAtTime(700, at + len * 0.5);
      lp.frequency.linearRampToValueAtTime(200, at + len);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, at);
      g2.gain.linearRampToValueAtTime(0.07, at + len * 0.5);
      g2.gain.linearRampToValueAtTime(0.0001, at + len);
      n.connect(lp).connect(g2).connect(out);
      n.start(at);
    },
    step() {
      const at = ctx.currentTime;
      const n = noise(0.08);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 600 + Math.random() * 200;
      const g = ctx.createGain();
      env(g, at, 0.003, 0.35, 0.07);
      n.connect(f).connect(g).connect(out);
      n.start(at);
    },
  };
}

const ANA: AvatarLayers = { ...DEFAULT_AVATAR };
const BIA: AvatarLayers = {
  ...DEFAULT_AVATAR,
  skin: "#c98d63",
  hair: "long",
  hairColor: "#3b2416",
  top: "hoodie",
  topColor: "#d9a441",
  bottom: "shorts",
  bottomColor: "#4d6b52",
} as AvatarLayers;

export default function LiftPrototype() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene>("landing");
  const [clock, setClock] = useState(0);
  const [audio, setAudio] = useState(false);
  const snd = useRef<ReturnType<typeof sounds> | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const sc = (q.get("scene") as Scene) ?? "landing";
    setScene(SCENES.includes(sc) ? sc : "landing");
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const q = new URLSearchParams(location.search);
    const frozen = q.get("t");
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      const L = await import("@/world/tp/lift3d");
      const S = await import("@/world/tp/stairs3d");
      const C = await import("@/world/chars");
      if (stop) return;
      const W = Number(q.get("w")) || window.innerWidth;
      const H = Number(q.get("h")) || window.innerHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      C.inkResolution(W, H);
      const world = new THREE.Scene();
      world.background = new THREE.Color("#d9d4cb");
      const pm = new THREE.PMREMGenerator(renderer);
      world.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      world.environmentIntensity = 1.0;
      world.add(new THREE.HemisphereLight("#f2efe8", "#6e6253", 0.9));
      const sun = new THREE.DirectionalLight("#fff4e2", 1.4);
      sun.position.set(-6, 9, -7);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
      sun.shadow.bias = -0.0005;
      world.add(sun);

      // ── the lobby: a terrazzo floor, the core's white wall with two cars and the stairs' door ──
      const sc = (q.get("scene") as Scene) ?? "landing";
      const floorTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 512;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.fillStyle = "#e7dfd0";
        g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = ["#b9ab93", "#8f8576", "#f6f1e7", "#c9a27a"][i % 4];
          g.globalAlpha = 0.5;
          g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
        }
        g.globalAlpha = 1;
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(0, 0, 512, 2);
        g.fillRect(0, 0, 2, 512);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(10, 10);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        return t;
      })();
      const lobbyFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35 }),
      );
      lobbyFloor.rotation.x = -Math.PI / 2;
      lobbyFloor.position.set(3, 0, -8);
      lobbyFloor.receiveShadow = true;
      const plaster = new THREE.MeshStandardMaterial({ color: "#f1eee8", roughness: 0.9 });
      const wallH = 3.27;
      const wall = new THREE.Group();
      // the wall at z = 0 from x −4 to 10, open where the doors are (cars at 0..2 and 2..4, the stairs' door 4.1..5.2)
      const gaps: [number, number][] = [
        [0, 2],
        [2, 4],
        [4.1, 5.25],
      ];
      let x = -4;
      for (const [a, b] of [...gaps, [12, 12] as [number, number]]) {
        if (a > x) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(a - x, wallH, 0.2), plaster);
          m.position.set((a + x) / 2, wallH / 2, 0);
          m.castShadow = m.receiveShadow = true;
          wall.add(m);
        }
        x = b;
      }
      // over the stairs' door
      const over = new THREE.Mesh(new THREE.BoxGeometry(1.15, wallH - 2.16, 0.2), plaster);
      over.position.set(4.675, 2.16 + (wallH - 2.16) / 2, 0);
      wall.add(over);
      // the signs: ELEVATORS over the bank, STAIRS over its door (Ruptura's plain lettering)
      const sign = (text: string, x: number, w: number) => {
        const c = document.createElement("canvas");
        c.width = 1024;
        c.height = 160;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.fillStyle = "#1d2328";
        g.font = '600 104px "Space Grotesk", Inter, sans-serif';
        g.textAlign = "center";
        g.fillText(text, 512, 118);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, w * 0.156),
          new THREE.MeshBasicMaterial({ map: t, transparent: true }),
        );
        m.rotation.y = Math.PI;
        m.position.set(x, wallH + 0.01, -0.16);
        return m;
      };
      const signs = new THREE.Group();
      signs.add(sign("ELEVATORS", 2, 2.2), sign("STAIRS", 4.675, 1.2));
      signs.position.y = -0.42;
      // the lobby round it: a ceiling with light panels, the far wall's windows,
      // the reception, plants (enough to read as Ruptura's lobby)
      const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 12),
        new THREE.MeshStandardMaterial({ color: "#f4f2ee", roughness: 0.95 }),
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(3, wallH, -6);
      const panelMat = new THREE.MeshBasicMaterial({ color: "#fffaf0", toneMapped: false });
      const extras = new THREE.Group();
      extras.add(ceiling);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++) {
          const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panelMat);
          pnl.rotation.x = Math.PI / 2;
          pnl.position.set(-1.5 + i * 3, wallH - 0.005, -2 - j * 4);
          extras.add(pnl);
          const pl = new THREE.PointLight("#fff3e0", 2.2, 7, 1.6);
          pl.position.set(-1.5 + i * 3, wallH - 0.3, -2 - j * 4);
          extras.add(pl);
        }
      const far = new THREE.Mesh(new THREE.BoxGeometry(20, wallH, 0.2), plaster);
      far.position.set(3, wallH / 2, -11);
      extras.add(far);
      const glassMat = new THREE.MeshBasicMaterial({ color: "#cfdbe3" });
      for (let i = 0; i < 5; i++) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glassMat);
        w.position.set(-4 + i * 3.4, 1.65, -10.89);
        extras.add(w);
      }
      const desk = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 1.05, 0.8),
        new THREE.MeshStandardMaterial({ color: "#eae6de", roughness: 0.6 }),
      );
      desk.position.set(1.4, 0.525, -6.8);
      desk.castShadow = desk.receiveShadow = true;
      const deskTop = new THREE.Mesh(
        new THREE.BoxGeometry(3.3, 0.04, 0.9),
        new THREE.MeshStandardMaterial({ color: "#5d4030", roughness: 0.4 }),
      );
      deskTop.position.set(1.4, 1.07, -6.8);
      extras.add(desk, deskTop);
      const plant = (x: number, z: number) => {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.17, 0.45, 20),
          new THREE.MeshStandardMaterial({ color: "#3b3f42", roughness: 0.5 }),
        );
        pot.position.set(x, 0.225, z);
        extras.add(pot);
        const leaf = new THREE.MeshStandardMaterial({ color: "#4f6b3a", roughness: 0.8 });
        for (let k = 0; k < 7; k++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 - k * 0.012, 12, 10), leaf);
          b.position.set(x + Math.sin(k * 2.1) * 0.12, 0.6 + k * 0.13, z + Math.cos(k * 2.1) * 0.12);
          b.castShadow = true;
          extras.add(b);
        }
      };
      plant(-1.0, -0.5);
      plant(6.1, -0.5);
      const lobby = new THREE.Group();
      lobby.add(lobbyFloor, wall, signs, extras);

      // the two stops (car B at x 0, car A at x 2) and the stairwell beside them
      const mats = L.liftMats();
      const stopA = new L.LiftLanding(mats, { floor: "G" });
      stopA.root.position.x = 2;
      const stopB = new L.LiftLanding(mats, { floor: "G" });
      const car = new L.LiftCar(["4", "3", "2", "1", "G"], mats, { cut: sc.startsWith("iso") });
      car.root.position.x = 2;
      const carGroup = new THREE.Group();
      carGroup.add(car.root);
      const shaftWalls = new THREE.Group();
      for (const xx of [0, 2, 4]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, wallH, 2), plaster);
        m.position.set(xx, wallH / 2, 1.1);
        shaftWalls.add(m);
      }
      const stairs = new S.Stairwell({
        floor: "G",
        next: "GROUND · EXIT ↑ LOT",
        storeys: sc.startsWith("iso") ? 1 : 2,
        walls: sc.startsWith("iso") ? [] : ["e", "s"],
      });
      stairs.root.position.set(4.05, 0, 0);

      // ── the people (the game's own 3D people) ──
      const f = new C.CharFactory();
      const ana = new C.PersonModel(f, ANA, 0);
      const bia = new C.PersonModel(f, BIA, 0);
      const people = [
        {
          m: ana,
          mo: new C.Motion3(0.1),
          from: new THREE.Vector3(2.65, 0, -1.3),
          to: new THREE.Vector3(2.62, 0, 0.95),
        },
        {
          m: bia,
          mo: new C.Motion3(0.6),
          from: new THREE.Vector3(3.45, 0, -1.6),
          to: new THREE.Vector3(3.42, 0, 1.12),
        },
      ];
      for (const p of people) world.add(p.m.root);

      // ── which shot ──
      const cam = new THREE.PerspectiveCamera(sc === "car" || sc === "ride" ? 74 : 38, W / H, 0.05, 200);
      let ortho: InstanceType<typeof THREE.OrthographicCamera> | null = null;
      if (sc === "landing" || sc === "car" || sc === "ride" || sc.startsWith("iso")) {
        world.add(lobby, stopA.root, stopB.root, carGroup, shaftWalls, stairs.root);
      }
      if (sc === "landing") {
        cam.position.set(4.3, 2.0, -5.6);
        cam.lookAt(2.4, 1.35, 0);
      } else if (sc === "car" || sc === "ride") {
        // the camera rides in the car: high in the back corner, past the people to the doors and the panel
        cam.position.set(3.0, 2.2, 1.86);
        cam.lookAt(3.0, 1.15, -1.6);
      } else if (sc.startsWith("iso")) {
        // the iso view: no ceiling, the walls towards the camera cut low
        extras.visible = false;
        for (const w of shaftWalls.children) {
          w.scale.y = 0.15;
          w.position.y = (wallH * 0.15) / 2;
        }
        const k = 3.9;
        ortho = new THREE.OrthographicCamera((-k * W) / H, (k * W) / H, k, -k, 0.1, 100);
        // the iso view's angle: from the south-east, 30° down
        const yaw = Math.PI * 0.25;
        const pitch = Math.PI / 6;
        // (the cars: the stairs left out — in the game they're there, in front)
        if (sc === "iso") stairs.root.visible = false;
        const tgt = sc === "iso" ? new THREE.Vector3(2.0, 0.5, 0.2) : new THREE.Vector3(5.8, 0.9, 2.6);
        ortho.position.set(
          tgt.x + Math.cos(yaw) * 20 * Math.cos(pitch),
          tgt.y + 20 * Math.sin(pitch),
          tgt.z + Math.sin(yaw) * 20 * Math.cos(pitch),
        );
        ortho.lookAt(tgt);
        // (the iso cuts the walls between you and the camera: here the lobby's
        // wall is behind, the core's own walls show as they would)
      } else if (sc === "stairs") {
        world.background = new THREE.Color("#cfcac1");
        const well = new S.Stairwell({ floor: "3", next: "FLOOR 3 · LOBBY ↓ G", storeys: 2, walls: ["w", "s"] });
        world.add(well.root);
        const fl = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 0.25, 1.2),
          new THREE.MeshStandardMaterial({ color: "#b0aca5", roughness: 0.85 }),
        );
        fl.position.set(2, -0.125, 0.45);
        world.add(fl);
        // two storeys up: the floor above's landing slab
        const up = fl.clone();
        up.position.y += STOREY;
        world.add(up);
        cam.fov = 42;
        cam.position.set(8.6, 7.6, -3.2);
        cam.lookAt(1.9, 2.3, 3.2);
        // the door's wall (north), round the fire door, a storey high
        const block = (well as unknown as { root: InstanceType<typeof THREE.Group> }).root;
        const wm = new THREE.MeshStandardMaterial({ color: "#e9e6df", roughness: 0.9 });
        const seg = (x0: number, x1: number, y0: number, y1: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.12), wm);
          m.position.set((x0 + x1) / 2, (y0 + y1) / 2, -0.06);
          m.castShadow = m.receiveShadow = true;
          block.add(m);
        };
        seg(1.16, 4.12, 0, STOREY);
        seg(0.04, 1.16, 2.16, STOREY);
        cam.updateProjectionMatrix();
        well.setDoor(0.55);
        // Ana on flight A, Bia a floor up
        people[0].from.set(3.0, 1.75 * (1.8 / 3), 2.8);
        people[1].from.set(3.05, 3.5 + 1.75 * (1.15 / 3), 2.15);
      }
      cam.aspect = W / H;
      cam.updateProjectionMatrix();

      // ── frames ──
      let t0 = performance.now();
      const from = Number(q.get("from")) || 0; // (playing: start the timeline here)
      let lastT = -1;
      let raf = 0;
      const fired = new Set<string>();
      const fire = (key: string, t: number, at: number, fn: () => void) => {
        if (t >= at && !fired.has(key)) {
          fired.add(key);
          if (lastT >= 0 && lastT <= at) fn();
        }
      };
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        f.pump(8);
        let ready = 0;
        for (const p of people) if (p.m.update()) ready++;
        const t = frozen !== null ? Number(frozen) : (from + (now - t0) / 1000) % LOOP;
        if (t < lastT) fired.clear();
        const s = stateAt(t, L.doorEase, L.rideAt);
        const inStairs = sc === "stairs";
        // the doors, the lantern, the displays, the buttons
        stopA.setDoors(s.carY < 0.01 ? s.doors : 0);
        car.setDoors(s.doors);
        stopA.setLantern(s.lantern, s.lantern !== 0);
        stopA.setCalls(false, s.called);
        stopA.display.set(s.display);
        stopB.display.set("4");
        car.display.set(s.display);
        car.setLit(s.lit);
        // the car stands at the landing; riding, it's felt, not seen:
        // (the ride is felt: a slight sway, the camera goes with it)
        carGroup.position.y = 0;
        if (sc === "ride" && s.riding) {
          const k = Math.sin(t * 31) * 0.002 + Math.sin(t * 7.3) * 0.003;
          carGroup.position.y = k;
          cam.position.y = 2.2 + k;
        }
        // the people: walk in, turn round, ride
        for (const p of people) {
          if (inStairs) {
            p.m.root.position.copy(p.from);
            p.m.root.rotation.y = 0;
          } else {
            // (a still of the landing: waiting at the doors; playing, they walk in)
            const w =
              sc === "landing"
                ? frozen !== null
                  ? 0
                  : s.walk
                : sc === "car" || sc === "ride" || sc.startsWith("iso")
                  ? 1
                  : s.walk;
            const pos = new THREE.Vector3().lerpVectors(p.from, p.to, w);
            p.m.root.position.copy(pos);
            p.m.root.rotation.y = w >= 1 ? Math.PI : 0;
          }
          const walking = !inStairs && sc === "landing" && frozen === null && s.walk > 0 && s.walk < 1;
          const mo = p.mo.update(1 / 60, {
            dist: walking ? 0.05 : 0,
            walking: walking || inStairs,
            speed: walking || inStairs ? 2.4 : 0,
            sit: false,
            typing: false,
            speaking: false,
            emote: "",
            reduced: false,
          });
          p.m.setPose(mo.pose, mo.lift, mo.reach);
          p.m.setFace(mo.blink, mo.talk);
        }
        // the sounds (playing, after a click)
        const a = snd.current;
        if (a && frozen === null) {
          fire("call", t, T.call, () => a.click());
          fire("arrive", t, T.arrive, () => a.chime(false));
          fire("open", t, T.open[0], () => a.doors(T.open[1] - T.open[0]));
          fire("press", t, T.press, () => a.click());
          fire("shut", t, T.shut[0], () => a.doors(T.shut[1] - T.shut[0]));
          fire("ride", t, T.ride[0], () => a.ride(T.ride[1] - T.ride[0]));
          fire("chime", t, T.chime, () => a.chime(true));
          fire("open2", t, T.open2[0], () => a.doors(T.open2[1] - T.open2[0]));
          for (let k = 0; k < 6; k++) fire(`step${k}`, t, T.walkIn[0] + k * 0.3, () => a.step());
        }
        lastT = t;
        renderer.render(world, ortho ?? cam);
        if (ready === people.length && frozen !== null) (window as unknown as { __shot?: boolean }).__shot = true;
        setClock(Math.round(t * 10) / 10);
      };
      raf = requestAnimationFrame(frame);
      t0 = performance.now();
      cleanup = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#111" }}>
      <div ref={host} />
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          display: "flex",
          gap: 6,
          font: "12px 'Share Tech Mono', monospace",
          color: "#efe4cc",
        }}
        data-testid="lift-proto-bar"
      >
        {SCENES.map((s) => (
          <a
            key={s}
            href={`?scene=${s}`}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: s === scene ? "#ffb347" : "rgba(30,20,12,.8)",
              color: s === scene ? "#1d1408" : "#efe4cc",
            }}
          >
            {s}
          </a>
        ))}
        <button
          type="button"
          onClick={() => {
            snd.current ??= sounds();
            void snd.current.ctx.resume();
            setAudio(true);
          }}
          style={{ padding: "4px 8px", borderRadius: 6, background: audio ? "#4d6b52" : "rgba(30,20,12,.8)" }}
        >
          {audio ? "sound on" : "▶ sound"}
        </button>
        <span style={{ padding: "4px 8px" }}>t {clock.toFixed(1)} s</span>
      </div>
    </div>
  );
}
