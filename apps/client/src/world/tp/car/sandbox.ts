import {
  type CarSpec,
  type CarState,
  type CarWorld,
  createCar,
  GRIP,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  headingOf,
  OFFROAD,
  PAD,
  padGround,
  padHeight,
  padWorld,
  readout,
  SEDAN,
  STEP,
  setEngine,
  settle,
  stepCar,
} from "@yutopia/shared/car";
import * as T3 from "three";
import { mixer } from "../../audio";
import { CarInput } from "../../car/controls";
import { CarSound } from "../../car/sound";
import { activePad } from "../../pads";
import { CarCamera } from "./camera";
import { CarRig } from "./rig";
import { buildSedan, type Sedan } from "./sedan";

// /dev/car — the sandbox (docs/plan/28-the-car.md, phase 1): drive the car on
// the test pad (a strip of every surface, an ice skid pan, a hill, bumps,
// posts and a wall) or on the real Grounds, read every wheel's load and slip,
// tune the numbers live, copy them out as a preset.

const SURF_COL: Record<Ground, string> = {
  asphalt: "#3a3d42",
  slush: "#7f8a94",
  blackice: "#30363e",
  walk: "#9a9a96",
  path: "#d9dfe4",
  snow: "#f1f4f7",
  deep: "#fbfcfd",
  ice: "#b9cddd",
  rock: "#6c6a66",
  floor: "#a59f94",
};

export interface SandboxOpts {
  world: "pad" | "grounds";
  at?: string; // on the Grounds: where to start
  night?: boolean;
  spec?: "sedan" | "offroad";
}

export async function runSandbox(el: HTMLElement, o: SandboxOpts): Promise<() => void> {
  const W = el.clientWidth || window.innerWidth;
  const H = el.clientHeight || window.innerHeight;
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(W, H);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new T3.Scene();
  let night = !!o.night;
  const sky = new T3.Color();
  const setSky = () => {
    sky.set(night ? "#0b1119" : "#c9d1d8");
    scene.background = sky;
    scene.fog = new T3.FogExp2(sky, night ? 0.012 : 0.0035);
    hemi.intensity = night ? 0.12 : 1.5;
    sun.intensity = night ? 0.05 : 1.7;
    renderer.toneMappingExposure = night ? 1.15 : 1;
  };
  const hemi = new T3.HemisphereLight("#e8edf2", "#8d97a1", 1.5);
  const sun = new T3.DirectionalLight("#fff4e6", 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun, sun.target);
  setSky();

  // ── the world ──
  let world: CarWorld;
  let start = { x: 0, z: 250, a: -Math.PI / 2 };
  let groundsBuilt: { dispose(): void; root: T3.Object3D; setNight(k: number): void } | null = null;
  if (o.world === "grounds") {
    const G = await import("@yutopia/shared/grounds");
    const Themes = await import("../../art/themes");
    const { Grounds3 } = await import("../grounds3d");
    const spots: Record<string, { x: number; z: number; a: number }> = {
      lot: { x: -20.85, z: 30, a: -Math.PI / 2 },
      pond: { x: -215, z: -60, a: Math.PI },
      driveway: { x: -40, z: -60, a: -Math.PI / 2 },
      woods: { x: -250, z: -190, a: -Math.PI / 2 },
      town: { x: 330, z: -405, a: 0 },
    };
    start = spots[o.at ?? "lot"] ?? spots.lot;
    world = groundsWorld({ cold: () => (night ? 0.8 : 0.4) });
    const g = new Grounds3(Themes, { cx: start.x, cz: start.z, radius: 260, near: 140, clear: [] });
    scene.add(g.root);
    g.setNight(night ? 1 : 0);
    groundsBuilt = g;
    void G;
  } else {
    world = padWorld();
    scene.add(padMesh());
  }

  // ── the car ──
  let spec: CarSpec = structuredClone(o.spec === "offroad" ? OFFROAD : SEDAN);
  let car: CarState;
  let model: Sedan;
  let rig: CarRig;
  const helps: Helps = { ...HELPS };
  const place = (x: number, z: number, a: number) => {
    car = createCar(spec, x, world.height(x, z), z, a);
    settle(car, world);
    setEngine(car, true);
    car.temp = 0.4;
    if (model) {
      scene.remove(model.root);
      model.dispose();
    }
    model = buildSedan({ colour: spec.kind === "offroad" ? 0x2f4a3b : 0x6b2430, snowy: 0.2, kind: spec.kind });
    scene.add(model.root);
    rig = new CarRig(model, car);
    rig.state.beams = night ? "low" : "off";
    rig.state.dash = night ? 1 : 0.45;
    model.root.traverse((m) => {
      if ((m as T3.Mesh).isMesh) m.castShadow = true;
    });
  };
  place(start.x, start.z, start.a);
  // the headlamps, for real at night
  const heads = [0, 1].map(() => {
    const s = new T3.SpotLight("#fff2da", 0, 80, 0.5, 0.55, 1.25);
    s.castShadow = true;
    scene.add(s, s.target);
    return s;
  });

  // ── input, sound, camera ──
  const input = new CarInput();
  const camCtl = new CarCamera();
  const cam = new T3.PerspectiveCamera(62, W / H, 0.05, 3000);
  let sound: CarSound | null = null;
  const startSound = async () => {
    await mixer.resume();
    if (!sound && mixer.ctx) {
      sound = new CarSound(mixer.ctx, mixer.buses.effects);
      sound.start(1 - car.temp / 0.55);
    }
  };
  const onDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    void startSound();
    if (input.keyDown(e.code)) e.preventDefault();
    if (e.code === "KeyN") {
      night = !night;
      setSky();
      groundsBuilt?.setNight(night ? 1 : 0);
      rig.state.beams = night ? "low" : "off";
      rig.state.dash = night ? 1 : 0.45;
    }
    if (e.code === "KeyT") place(car.p.x, car.p.z, headingOf(car.q)); // (back on its wheels)
  };
  const onUp = (e: KeyboardEvent) => input.keyUp(e.code);
  addEventListener("keydown", onDown);
  addEventListener("keyup", onUp);

  // ── the readouts and the knobs ──
  const ui = panel(el, {
    spec: () => spec,
    setSpec: (s) => {
      spec = s;
      place(car.p.x, car.p.z, headingOf(car.q));
    },
    helps,
    teleport: (x, z, a) => place(x, z, a),
    swap: (k) => {
      spec = structuredClone(k === "offroad" ? OFFROAD : SEDAN);
      place(car.p.x, car.p.z, headingOf(car.q));
    },
  });

  // ── the loop: fixed steps, drawn in between ──
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let t = 0;
  const v = new T3.Vector3();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    const pad = activePad();
    const { c, switches } = input.read(pad);
    for (const sw of switches) {
      if (sw === "lights")
        rig.state.beams = rig.state.beams === "off" ? "low" : rig.state.beams === "low" ? "high" : "off";
      if (sw === "left") rig.state.ind = rig.state.ind === -1 ? 0 : -1;
      if (sw === "right") rig.state.ind = rig.state.ind === 1 ? 0 : 1;
      if (sw === "hazard") rig.state.hazard = !rig.state.hazard;
      if (sw === "wipers") rig.state.wipers = ((rig.state.wipers + 1) % 4) as 0 | 1 | 2 | 3;
      if (sw === "camera") camCtl.cycle();
      if (sw === "diff") car.lock = !car.lock;
      if (sw === "range") car.low = !car.low;
    }
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 12) {
      stepCar(car, c, world, helps);
      rig.stepped();
      acc -= STEP;
      steps++;
      ui.sample(car);
    }
    rig.state.clock = new Date().toTimeString().slice(0, 5);
    rig.pose(acc / STEP, dt, t);
    // lamps
    const lit = rig.state.beams !== "off";
    model.root.updateMatrixWorld();
    model.lamps.head.forEach((h, i) => {
      const s = heads[i];
      s.intensity = lit ? (rig.state.beams === "high" ? 220 : 120) : 0;
      s.angle = rig.state.beams === "high" ? 0.36 : 0.5;
      s.position.copy(h).applyMatrix4(model.root.matrixWorld);
      v.set(h.x - 30, h.y - (rig.state.beams === "high" ? 0.4 : 1.3), h.z).applyMatrix4(model.root.matrixWorld);
      s.target.position.copy(v);
    });
    // the sun's shadows follow the car
    sun.position.set(car.p.x - 40, car.p.y + 60, car.p.z + 50);
    sun.target.position.set(car.p.x, car.p.y, car.p.z);
    // the camera
    const rough = car.wheels.reduce((a, w) => a + GRIP[w.ground].rough, 0) / 4;
    if (car.hit) camCtl.knock(Math.min(1, car.hit.j / 8000));
    camCtl.update(cam, rig, car, dt, input.lookBack, rough * 10);
    // sound and rumble
    if (sound) {
      sound.update(
        car,
        { inside: camCtl.mode === "cockpit", gain: 1, pan: 0 },
        dt,
        rig.state.ind !== 0 && t % 0.9 < 0.45,
        true,
      );
      sound.horn(input.horn);
    }
    const slip = car.wheels.reduce((a, w) => Math.max(a, w.slip), 0);
    input.rumble(
      pad,
      (car.hit ? Math.min(1, car.hit.j / 6000) : 0) + rough * 4 * Math.min(1, readout(car).speed / 15),
      Math.min(1, slip / 8) * 0.5,
    );
    renderer.render(scene, cam);
    ui.draw(car, helps);
  };
  raf = requestAnimationFrame(frame);
  const onResize = () => {
    const w = el.clientWidth || innerWidth;
    const h = el.clientHeight || innerHeight;
    renderer.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  addEventListener("resize", onResize);
  (window as unknown as { __car?: unknown }).__car = {
    get car() {
      return car;
    },
    scene,
    cam,
    renderer,
    helps,
    place,
    get model() {
      return model;
    },
  };
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("keydown", onDown);
    removeEventListener("keyup", onUp);
    removeEventListener("resize", onResize);
    sound?.dispose();
    model.dispose();
    groundsBuilt?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    ui.dispose();
  };
}

/** The test pad drawn: the land as the sim has it, coloured by surface, marks every 50 m. */
function padMesh(): T3.Object3D {
  const g = new T3.Group();
  const x0 = -260;
  const x1 = 220;
  const z0 = -480;
  const z1 = 420;
  const step = 2;
  const nx = (x1 - x0) / step + 1;
  const nz = (z1 - z0) / step + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const c = new T3.Color();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      const k = (j * nx + i) * 3;
      pos[k] = x;
      pos[k + 1] = padHeight(x, z);
      pos[k + 2] = z;
      c.set(SURF_COL[padGround(x, z)]);
      // (a chequer every 10 m, for speed)
      if ((Math.floor(x / 10) + Math.floor(z / 10)) % 2 === 0) c.multiplyScalar(0.94);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  const geo = new T3.BufferGeometry();
  geo.setAttribute("position", new T3.BufferAttribute(pos, 3));
  geo.setAttribute("color", new T3.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new T3.Mesh(geo, new T3.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  g.add(m);
  // posts, walls, trunks (as the pad's solids)
  const post = new T3.MeshLambertMaterial({ color: "#2b2f34" });
  const solids: Parameters<ReturnType<typeof padWorld>["solids"]>[3] = [];
  padWorld().solids(0, 0, 2000, solids);
  for (const s of solids) {
    const mesh =
      s.kind === "circle"
        ? new T3.Mesh(new T3.CylinderGeometry(s.r, s.r, s.what === "tree" ? 6 : 4, 10), post)
        : new T3.Mesh(new T3.BoxGeometry((s.hx ?? 1) * 2, 1.2, (s.hz ?? 1) * 2), post);
    mesh.position.set(s.x, padHeight(s.x, s.z) + (s.kind === "circle" ? 2 : 0.6), s.z);
    mesh.castShadow = true;
    g.add(mesh);
  }
  // signs: what each band is
  for (const [name, z] of PAD.bands) g.add(label(name, -70, z + 60));
  g.add(label("ice pan", PAD.pan.x, PAD.pan.z));
  g.add(label("15% hill", 0, -360));
  g.add(label("bumps", 0, 330));
  return g;
}
function label(text: string, x: number, z: number): T3.Object3D {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "rgba(20,24,28,0.75)";
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#ffb24a";
  g.font = "700 64px Helvetica, Arial";
  g.textAlign = "center";
  g.fillText(text.toUpperCase(), 256, 86);
  const t = new T3.CanvasTexture(cv);
  t.colorSpace = T3.SRGBColorSpace;
  const s = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(16, 4, 1);
  s.position.set(x, padHeight(x, z) + 6, z);
  return s;
}

// ── the readouts and the knobs ───────────────────────────────────────────────
interface PanelCtx {
  spec: () => CarSpec;
  setSpec: (s: CarSpec) => void;
  helps: Helps;
  teleport: (x: number, z: number, a: number) => void;
  swap: (k: "sedan" | "offroad") => void;
}
function panel(host: HTMLElement, ctx: PanelCtx) {
  const tele = document.createElement("canvas");
  tele.width = 420;
  tele.height = 560;
  Object.assign(tele.style, {
    position: "fixed",
    left: "8px",
    top: "8px",
    width: "420px",
    height: "560px",
    pointerEvents: "none",
  });
  host.appendChild(tele);
  const g = tele.getContext("2d") as CanvasRenderingContext2D;
  const hist: { kmh: number; rpm: number; beta: number }[] = [];
  let sampleN = 0;

  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed",
    right: "8px",
    top: "8px",
    width: "300px",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
    background: "rgba(14,16,18,0.82)",
    color: "#ddd",
    font: "12px/1.5 monospace",
    padding: "10px",
    borderRadius: "6px",
  });
  host.appendChild(box);
  const row = (html: string) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    box.appendChild(d);
    return d;
  };
  row(
    "<b style='color:#ffb24a'>CAR SANDBOX</b><br>W/S throttle·brake (S at a stop: reverse) · A/D steer · Space handbrake · E/Q gears (manual) · H horn · L lights · , . / indicators·hazards · V wipers · C camera · B look back · N night · T reset · K diff lock · J low range",
  );
  // the helps
  const helpRow = row("<br><b>Helps</b>");
  for (const k of ["abs", "tcs", "esc", "steer", "auto", "hold"] as const) {
    const l = document.createElement("label");
    l.style.marginRight = "8px";
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = ctx.helps[k];
    c.onchange = () => {
      ctx.helps[k] = c.checked;
    };
    l.append(c, ` ${k}`);
    helpRow.appendChild(l);
  }
  slider(
    box,
    "countersteer",
    0,
    1,
    0.05,
    () => ctx.helps.counter,
    (v) => {
      ctx.helps.counter = v;
    },
  );
  // the car's numbers
  row("<br><b>Car</b> <button data-k='sedan'>sedan</button> <button data-k='offroad'>4x4</button>")
    .querySelectorAll("button")
    .forEach((b) => {
      b.onclick = () => ctx.swap(b.dataset.k as "sedan" | "offroad");
    });
  const sp = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: (s: CarSpec) => number,
    set: (s: CarSpec, v: number) => void,
  ) =>
    slider(
      box,
      label,
      min,
      max,
      step,
      () => get(ctx.spec()),
      (v) => {
        const s = structuredClone(ctx.spec());
        set(s, v);
        ctx.setSpec(s);
      },
    );
  sp(
    "mass kg",
    800,
    2000,
    10,
    (s) => s.mass,
    (s, v) => {
      s.mass = v;
    },
  );
  sp(
    "CoG height",
    0.35,
    0.8,
    0.01,
    (s) => s.cog,
    (s, v) => {
      s.cog = v;
    },
  );
  sp(
    "CoG → front axle",
    0.9,
    1.9,
    0.01,
    (s) => s.front,
    (s, v) => {
      s.front = v;
    },
  );
  sp(
    "spring front N/m",
    15000,
    60000,
    500,
    (s) => s.axles[0].k,
    (s, v) => {
      s.axles[0].k = v;
    },
  );
  sp(
    "spring rear N/m",
    15000,
    60000,
    500,
    (s) => s.axles[1].k,
    (s, v) => {
      s.axles[1].k = v;
    },
  );
  sp(
    "damper bump F",
    1000,
    8000,
    100,
    (s) => s.axles[0].bump,
    (s, v) => {
      s.axles[0].bump = v;
    },
  );
  sp(
    "damper rebound F",
    1000,
    9000,
    100,
    (s) => s.axles[0].rebound,
    (s, v) => {
      s.axles[0].rebound = v;
    },
  );
  sp(
    "anti-roll front",
    0,
    40000,
    500,
    (s) => s.axles[0].arb,
    (s, v) => {
      s.axles[0].arb = v;
    },
  );
  sp(
    "anti-roll rear",
    0,
    40000,
    500,
    (s) => s.axles[1].arb,
    (s, v) => {
      s.axles[1].arb = v;
    },
  );
  sp(
    "brake front N·m",
    600,
    3000,
    50,
    (s) => s.axles[0].brake,
    (s, v) => {
      s.axles[0].brake = v;
    },
  );
  sp(
    "brake rear N·m",
    300,
    2000,
    50,
    (s) => s.axles[1].brake,
    (s, v) => {
      s.axles[1].brake = v;
    },
  );
  sp(
    "torque ×",
    0.5,
    2.5,
    0.05,
    (s) => s.engine.curve[3][1] / 185,
    (s, v) => {
      const base = (ctx.spec().kind === "offroad" ? OFFROAD : SEDAN).engine.curve;
      s.engine.curve = base.map(([r, n]) => [r, n * v]);
    },
  );
  sp(
    "steer lock rad",
    0.3,
    0.8,
    0.01,
    (s) => s.steer.max,
    (s, v) => {
      s.steer.max = v;
    },
  );
  // the grip of each ground
  row("<br><b>Grip</b> (peak μ · slip angle at peak)");
  for (const k of Object.keys(GRIP) as Ground[]) {
    slider(
      box,
      `${k} μ`,
      0.05,
      1.2,
      0.01,
      () => GRIP[k].mu,
      (v) => {
        GRIP[k].mu = v;
      },
    );
    slider(
      box,
      `${k} α`,
      0.03,
      0.4,
      0.005,
      () => GRIP[k].alpha,
      (v) => {
        GRIP[k].alpha = v;
      },
    );
  }
  // places
  const go = row("<br><b>Go to</b> ");
  for (const [name, x, z, a] of [
    ["runway", 0, 250, -Math.PI / 2],
    ["packed", -70, -380, -Math.PI / 2],
    ["snow", -70, -260, -Math.PI / 2],
    ["deep", -70, -140, -Math.PI / 2],
    ["ice band", -70, -20, -Math.PI / 2],
    ["slush", -70, 100, -Math.PI / 2],
    ["black ice", -70, 220, -Math.PI / 2],
    ["ice pan", 130, 60, -Math.PI / 2],
    ["hill", 0, -300, -Math.PI / 2],
    ["bumps", 0, 290, Math.PI / 2],
  ] as [string, number, number, number][]) {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.margin = "2px";
    b.onclick = () => ctx.teleport(x, z, a);
    go.appendChild(b);
  }
  const out = row("<br><button>copy the car's numbers</button> <button>copy the grip</button>");
  const [cs, cg] = out.querySelectorAll("button");
  cs.onclick = () => void navigator.clipboard.writeText(JSON.stringify(ctx.spec(), null, 2));
  cg.onclick = () => void navigator.clipboard.writeText(JSON.stringify(GRIP, null, 2));

  return {
    sample(s: CarState) {
      if (++sampleN % 6) return;
      const r = readout(s);
      hist.push({ kmh: r.kmh, rpm: s.rpm, beta: r.beta });
      if (hist.length > 400) hist.shift();
    },
    draw(s: CarState, helps: Helps) {
      const r = readout(s);
      g.clearRect(0, 0, 420, 560);
      g.fillStyle = "rgba(12,14,16,0.78)";
      g.fillRect(0, 0, 420, 560);
      g.fillStyle = "#ffb24a";
      g.font = "700 34px monospace";
      g.fillText(`${Math.abs(r.kmh).toFixed(0)} km/h`, 14, 42);
      g.font = "16px monospace";
      const gear = r.gear === -1 ? "R" : r.gear === 0 ? "N" : String(r.gear);
      g.fillText(
        `gear ${gear}${r.shifting ? "…" : ""}  ${s.rpm.toFixed(0)} rpm  clutch ${s.clutch.toFixed(2)}${s.locked ? " ●" : ""}`,
        14,
        66,
      );
      g.fillStyle = "#3a3a3a";
      g.fillRect(14, 74, 392, 8);
      g.fillStyle = s.rpm > s.spec.engine.redline ? "#ff6a3a" : "#ffb24a";
      g.fillRect(14, 74, (392 * Math.min(s.rpm, 7000)) / 7000, 8);
      g.fillStyle = "#ccc";
      const acts = [s.helping & 1 ? "ABS" : "", s.helping & 2 ? "TCS" : "", s.helping & 4 ? "ESC" : ""]
        .filter(Boolean)
        .join(" ");
      g.fillText(
        `β ${(r.beta * 57.3).toFixed(0)}°  thr ${s.thr.toFixed(2)} brk ${s.brk.toFixed(2)} hb ${s.hb.toFixed(1)}  ${acts}`,
        14,
        104,
      );
      g.fillText(
        `belly ${s.belly.toFixed(2)}  temp ${((s.temp / 0.55) * 90).toFixed(0)}°C  fuel ${s.fuel.toFixed(1)} L  ${s.lock ? "LOCK " : ""}${s.low ? "LOW" : ""}`,
        14,
        124,
      );
      // the wheels: load, slip ratio, slip angle, grip used
      const names = ["FL", "FR", "RL", "RR"];
      s.wheels.forEach((w, i) => {
        const x = 14 + (i % 2) * 200;
        const y = 142 + Math.floor(i / 2) * 120;
        g.fillStyle = "#222";
        g.fillRect(x, y, 190, 110);
        g.fillStyle = w.contact ? "#ffb24a" : "#666";
        g.fillText(`${names[i]} ${w.ground}`, x + 6, y + 18);
        g.fillStyle = "#ccc";
        g.fillText(`load ${(w.load / 1000).toFixed(2)} kN`, x + 6, y + 38);
        g.fillText(`κ ${w.kappa.toFixed(2)}  α ${(w.alpha * 57.3).toFixed(0)}°`, x + 6, y + 58);
        g.fillText(`spin ${(w.w * 9.55).toFixed(0)} rpm  sink ${w.sink.toFixed(2)}`, x + 6, y + 78);
        // grip used: a bar, red past the peak
        g.fillStyle = "#333";
        g.fillRect(x + 6, y + 88, 178, 10);
        g.fillStyle = w.used > 1 ? "#ff5a3a" : "#7fd37a";
        g.fillRect(x + 6, y + 88, Math.min(178, (178 * w.used) / 2), 10);
        g.fillStyle = "#fff";
        g.fillRect(x + 6 + 89, y + 86, 1, 14);
      });
      // the g-meter
      const gx = 330;
      const gy = 430;
      g.strokeStyle = "#555";
      g.beginPath();
      g.arc(gx, gy, 60, 0, Math.PI * 2);
      g.arc(gx, gy, 30, 0, Math.PI * 2);
      g.stroke();
      const X = [
        1 - 2 * (s.q.y ** 2 + s.q.z ** 2),
        2 * (s.q.x * s.q.y + s.q.w * s.q.z),
        2 * (s.q.x * s.q.z - s.q.w * s.q.y),
      ];
      const Z = [
        2 * (s.q.x * s.q.z + s.q.w * s.q.y),
        2 * (s.q.y * s.q.z - s.q.w * s.q.x),
        1 - 2 * (s.q.x ** 2 + s.q.y ** 2),
      ];
      const lat = (Math.abs(s.w.y) * Math.hypot(s.v.x, s.v.z) * Math.sign(-s.w.y)) / 9.81;
      g.fillStyle = "#ffb24a";
      g.beginPath();
      g.arc(gx + Math.max(-1.2, Math.min(1.2, lat)) * 60, gy, 6, 0, Math.PI * 2);
      g.fill();
      void X;
      void Z;
      g.fillStyle = "#888";
      g.fillText("g", gx - 4, gy + 80);
      // history: speed (amber), β (blue)
      g.strokeStyle = "#ffb24a";
      g.beginPath();
      hist.forEach((h, i) => {
        const x = 14 + (i / 400) * 250;
        const y = 540 - (Math.abs(h.kmh) / 180) * 140;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      g.strokeStyle = "#5ab0ff";
      g.beginPath();
      hist.forEach((h, i) => {
        const x = 14 + (i / 400) * 250;
        const y = 470 - h.beta * 60;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      g.fillStyle = "#888";
      g.fillText("speed · β", 14, 396);
      void helps;
    },
    dispose() {
      tele.remove();
      box.remove();
    },
  };
}
function slider(
  host: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
) {
  const d = document.createElement("div");
  const l = document.createElement("div");
  const i = document.createElement("input");
  i.type = "range";
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  i.value = String(get());
  i.style.width = "100%";
  const show = () => {
    l.textContent = `${label}: ${Number(i.value).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}`;
  };
  show();
  i.oninput = () => {
    set(Number(i.value));
    show();
  };
  d.append(l, i);
  host.appendChild(d);
}
