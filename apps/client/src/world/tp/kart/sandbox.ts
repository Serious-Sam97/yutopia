import { DEFAULT_AVATAR } from "@yutopia/shared";
import {
  createKart,
  GO_MS,
  gridRevs,
  KART,
  KART_STEP,
  type KartGround,
  type KartInput,
  type KartSpec,
  type KartState,
  kartSlip,
  kartSpeed,
  kartStart,
  kartTrack,
  kartTrackWorld,
  LapCounter,
  NO_INPUT,
  spinOut,
  stepKart,
  type TrackWorld,
  trackAt,
} from "@yutopia/shared/kart";
import * as T3 from "three";
import { mixer } from "../../audio";
import { KartControls } from "../../kart/input";
import { KartSound } from "../../kart/sound";
import { activePad } from "../../pads";
import { KartFx } from "./fx";
import { buildKart, type Kart, type KartDriver, kartDriver } from "./kart3d";

// /dev/kart — the sandbox (docs/plan/46-the-karts.md, phase 1): drive the kart round the real
// circuit in the Kart Park, read what it's doing, tune its numbers live and copy them out. The
// start lights (R) for a rocket start, practice laps on the clock, a ghost of your best lap.
// The feel is signed off here before anything is built on it.

const SPARK = ["#d9dee3", "#9fd0ff", "#ffc060", "#d9a6ff"];

export interface KartSandboxOpts {
  night?: boolean;
  surface?: KartGround;
}

export async function runKartSandbox(el: HTMLElement, o: KartSandboxOpts): Promise<() => void> {
  const W = el.clientWidth || innerWidth;
  const H = el.clientHeight || innerHeight;
  const night = !!o.night;
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(W, H);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.1 : 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const C = await import("../../chars");
  C.inkResolution(W, H);

  // ── the sky, the light (the stills' day; or the night, the floods doing the work) ──
  const scene = new T3.Scene();
  const horizon = new T3.Color(night ? "#0d131b" : "#d5dbe0");
  scene.background = horizon;
  scene.fog = new T3.FogExp2(night ? "#0b1016" : "#cfd6dc", night ? 0.006 : 0.0035);
  const dome = new T3.Mesh(
    new T3.SphereGeometry(2600, 32, 16),
    new T3.ShaderMaterial({
      side: T3.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new T3.Color(night ? "#05080d" : "#8f9ca8") }, hor: { value: horizon } },
      vertexShader:
        "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 hor; varying vec3 p; void main(){ float k = smoothstep(-0.02, 0.45, p.y); gl_FragColor = vec4(mix(hor, top, k), 1.0); }",
    }),
  );
  dome.renderOrder = -2;
  scene.add(dome);
  scene.add(new T3.HemisphereLight("#e8edf2", "#8d97a1", night ? 0.08 : 1.5));
  const sun = new T3.DirectionalLight("#fff4e6", night ? 0.04 : 1.7);
  const sunDir = new T3.Vector3(-0.45, 0.42, 0.78).normalize();
  sun.castShadow = !night;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.intensity = 0.8;
  scene.add(sun, sun.target);

  // ── the Grounds round the park, the park itself ──
  const track = kartTrack();
  const mid = trackAt(track, 0);
  const Themes = await import("../../art/themes");
  const { Grounds3 } = await import("../grounds3d");
  const grounds = new Grounds3(Themes, { cx: track.cross.x, cz: track.cross.z, radius: 320, near: 70, clear: [] });
  scene.add(grounds.root);
  grounds.setNight(night ? 1 : 0);
  grounds.ridgeMat.color.set(night ? "#0e141b" : "#bcc5cc");
  const f = new C.CharFactory();
  const flatMat = new T3.MeshBasicMaterial({ vertexColors: true });
  const bodyMat = new T3.MeshLambertMaterial({ vertexColors: true, emissive: "#10141b" });
  const camV = new T3.Vector3(mid.x, 10, mid.z);
  const { stageKarts } = await (await import("../grounds3d")).loadKarts();
  const park = stageKarts(
    T3,
    scene,
    { karts: [], crowd: 0.55, rack: true, lap: "—" },
    {
      night: night ? 1 : 0,
      lit: night,
      f,
      C,
      bodyMat,
      flatMat,
      cam: camV,
    },
  );

  // ── the kart, you in it ──
  const ink = C.inkMaterial();
  const look = {
    ...DEFAULT_AVATAR,
    top: "jacket",
    topColor: "#6b2430",
    hair: "long",
    hairColor: "#3b2a20",
    skin: "#e4b48e",
    extra: "scarf",
    extraColor: "#e8a33d",
  };
  const kart: Kart = buildKart({ colour: "#b5562f", number: 1 }, ink);
  scene.add(kart.root);
  const driver: KartDriver = kartDriver(C, f, kart, look, "#b5562f", { body: night ? bodyMat : flatMat, ink });
  kart.lampMat.emissive.set(night ? "#ffd890" : "#000000");
  kart.lampMat.emissiveIntensity = night ? 3 : 0;
  const lamp = new T3.SpotLight("#ffe6b8", night ? 60 : 0, 30, 0.55, 0.6, 1.5);
  scene.add(lamp, lamp.target);
  // the ghost: your best lap, see-through
  const ghost = buildKart({ colour: "#9fd0ff", number: 0 }, ink);
  ghost.root.traverse((m) => {
    const mesh = m as T3.Mesh;
    if (mesh.isMesh && mesh.material === ink) mesh.visible = false;
    else if (mesh.isMesh)
      mesh.material = new T3.MeshBasicMaterial({
        color: "#bfe0ff",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
  });
  ghost.root.visible = false;
  scene.add(ghost.root);

  // ── what it gives off: sparks, flame, smoke, spray (the game's particles: fx.ts) ──
  const fx = new KartFx(scene);
  let lastTier = 0;
  let smokeAt = 0;
  let wasAir = false;
  const glow = new T3.PointLight("#c48cff", 0, 6, 2);
  scene.add(glow);

  // ── the sim ──
  const spec: KartSpec = structuredClone(KART);
  let surface: KartGround | undefined = o.surface;
  let world: TrackWorld = kartTrackWorld(track, { surface });
  let k: KartState;
  let prev = { x: 0, y: 0, z: 0, a: 0 };
  let laps = new LapCounter(track);
  const place = (x: number, z: number, a: number) => {
    const u = world.under(x, z, 50);
    k = createKart(x, u.y, z, a);
    prev = { x, y: u.y, z, a };
    laps = new LapCounter(track);
  };
  const g0 = track.grid[0];
  place(g0.x, g0.z, g0.a);

  // start lights: 5 lit a second apart, out a second after the fifth; the throttle down on the fourth
  // or fifth, a rocket start (shared kartStart), the engine revving where it stands meanwhile
  const lights = { on: false, t: 0, go: 0, firstThrottle: -1, beeped: 0, bog: 0, rev: 0 };
  const restart = () => {
    place(g0.x, g0.z, g0.a);
    Object.assign(lights, { on: true, t: 0, go: 1 + GO_MS / 1000, firstThrottle: -1, beeped: 0, bog: 0, rev: 0 });
  };
  /** back on the road where you are (or where you left it) */
  const reset = () => {
    const on = world.locate(k.x, k.z, k.y) ?? world.locate(prev.x, prev.z, prev.y);
    const p = on ? trackAt(track, on.s) : trackAt(track, 0);
    const u = world.under(p.x, p.z, 50);
    k = createKart(p.x, u.y, p.z, p.a);
    prev = { x: p.x, y: u.y, z: p.z, a: p.a };
  };

  // the ghost's record (30 a second) and the best lap's
  let rec: number[] = [];
  let best: number[] | null = null;
  let ghostOn = true;

  // ── input, sound ──
  const ctl = new KartControls();
  let sound: KartSound | null = null;
  const startSound = () => {
    const ctx = mixer.ensure();
    void ctx.resume();
    if (!sound) sound = new KartSound(ctx, mixer.buses.effects);
  };
  const onDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
    startSound();
    if (ctl.keyDown(e.code)) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => ctl.keyUp(e.code);
  addEventListener("keydown", onDown);
  addEventListener("keyup", onUp);

  // ── the HUD and the tuning panel ──
  const hud = buildHud(el);
  const panel = buildPanel(el, spec, (s) => {
    surface = s;
    world = kartTrackWorld(track, { surface });
  });

  let drive: ((k: KartState, w: TrackWorld) => KartInput) | null = null;

  // ── the camera ──
  const cam = new T3.PerspectiveCamera(68, W / H, 0.1, 3000);
  let camYaw = g0.a;
  let fov = 68;
  let shake = 0;
  const camPos = new T3.Vector3();
  const lookAt = new T3.Vector3();

  // every shader the drive will need, compiled before it starts (the sparks, the flame, the ghost:
  // their first frame would hitch otherwise)
  ghost.root.visible = true;
  for (const p of [fx.glow, fx.puff, fx.chip]) p.emit({ x: g0.x, y: 1, z: g0.z, life: 1, size: 0.1, col: "#fff" });
  fx.update(0);
  cam.position.set(g0.x - Math.cos(g0.a) * 5, 4, g0.z - Math.sin(g0.a) * 5);
  cam.lookAt(g0.x, 2, g0.z);
  await renderer.compileAsync(scene, cam);
  fx.glow.clear();
  fx.puff.clear();
  fx.chip.clear();
  ghost.root.visible = false;

  // ── the loop: fixed steps, drawn in between ──
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let roll = 0;
  let pitch = 0;
  let lastSpeed = 0;
  let spin = 0;
  let callout = { text: "", until: 0 };
  let clock = 0;
  const say = (text: string, secs = 1.4) => {
    callout = { text, until: clock + secs };
  };
  const v = new T3.Vector3();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    f.pump(4);
    const pad = activePad();
    const { i: raw, buttons } = ctl.read(pad);
    for (const b of buttons) {
      startSound();
      if (b === "restart") restart();
      if (b === "reset") reset();
      if (b === "ghost") ghostOn = !ghostOn;
      if (b === "panel") panel.toggle();
      if (b === "spin") spinOut(k, spec);
    }
    // the lights: held still till GO; the throttle's first press timed (a script may drive: __kart.drive)
    let input: KartInput = drive ? drive(k, world) : raw;
    if (lights.on) {
      lights.t += dt;
      const lit = Math.min(5, Math.floor(lights.t));
      if (lit > lights.beeped && lights.t < lights.go) {
        lights.beeped = lit;
        sound?.beep(false);
      }
      if (raw.throttle > 0.5 && lights.firstThrottle < 0) lights.firstThrottle = lights.t;
      if (raw.throttle < 0.2) lights.firstThrottle = -1;
      lights.rev = gridRevs(lights.firstThrottle >= 0 ? lights.t - lights.firstThrottle : -1, clock);
      if (lights.t >= lights.go) {
        lights.on = false;
        lights.rev = 0;
        sound?.beep(true);
        const st = kartStart(lights.firstThrottle >= 0 ? lights.go - lights.firstThrottle : -1);
        if (st === "rocket" || st === "good") {
          k.boost = spec.turbo[st === "rocket" ? 1 : 0];
          sound?.whoosh(st === "rocket" ? 2 : 1);
          say(st === "rocket" ? "ROCKET START!" : "GOOD START");
        } else if (st === "flooded") {
          lights.bog = 0.9;
          say("FLOODED!", 1);
        } else say("GO!", 0.9);
      }
      hud.lights(lights.on ? lit : -1);
      input = NO_INPUT;
    } else hud.lights(-1);
    if (lights.bog > 0) {
      lights.bog -= dt;
      input = { ...input, throttle: 0 };
    }

    acc += dt;
    let steps = 0;
    while (acc >= KART_STEP && steps < 14) {
      prev = { x: k.x, y: k.y, z: k.z, a: k.a };
      stepKart(k, input, world, spec);
      acc -= KART_STEP;
      steps++;
      if (k.fired) {
        sound?.whoosh(k.fired);
        if (k.fired === 3) say("PURPLE TURBO", 0.7);
      }
      if (k.hit > 2) {
        sound?.thud(k.hit);
        shake = Math.max(shake, Math.min(1, k.hit / 10));
        ctl.rumble(pad, Math.min(1, k.hit / 10), 0.2, 90);
      }
      // laps, and the ghost's record
      const on = world.locate(k.x, k.z, k.y);
      if (on) {
        const ev = laps.update(on.s, k.t);
        if (ev === "start") rec = [];
        if (ev === "lap") {
          const isBest = laps.best === laps.last;
          say(`LAP ${fmt(laps.last ?? 0)}${isBest ? " · BEST" : ""}`, 2);
          if (isBest) best = rec;
          rec = [];
        }
      }
      if (laps.started !== null && Math.round(k.t * 120) % 4 === 0) rec.push(k.x, k.y, k.z, k.a);
    }
    // off the circuit altogether (it shouldn't be): back on it
    if (!world.locate(k.x, k.z, k.y)) reset();

    // ── the kart drawn between its last two steps ──
    const al = acc / KART_STEP;
    let da = k.a - prev.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const x = prev.x + (k.x - prev.x) * al;
    const y = prev.y + (k.y - prev.y) * al;
    const z = prev.z + (k.z - prev.z) * al;
    const a = prev.a + da * al;
    kart.root.position.set(x, y + 0.02, z);
    kart.root.rotation.y = -a;
    const speed = kartSpeed(k);
    const accel = (speed - lastSpeed) / Math.max(dt, 1e-3);
    lastSpeed = speed;
    // (leaning out of a turn, squatting under the throttle; a drift leans more)
    const wantRoll = Math.max(-0.14, Math.min(0.14, -k.w * Math.abs(speed) * 0.006 * (k.drift ? 1.4 : 1)));
    roll += (wantRoll - roll) * Math.min(1, dt * 8);
    pitch += (Math.max(-0.06, Math.min(0.06, -accel * 0.004)) - pitch) * Math.min(1, dt * 6);
    kart.body.rotation.x = roll;
    kart.body.rotation.z = -pitch;
    kart.setSteer(-k.steer * 0.45);
    spin -= (speed * dt) / 0.19;
    for (const w of kart.wheels) w.spin.rotation.z = spin * (w.front ? 0.19 / w.r : 0.19 / w.r);
    if (driver.ready()) driver.pose(-roll * 4, k.spin > 0);
    // the lamp at night
    if (night) {
      kart.root.updateMatrixWorld(true);
      v.copy(kart.lamp);
      kart.body.localToWorld(v);
      lamp.position.copy(v);
      lamp.target.position.set(v.x + Math.cos(a) * 12, v.y - 0.8, v.z + Math.sin(a) * 12);
    }
    // sparks off the rear tyres while drifting, in the tier's colour; a pop as each tier comes in
    kart.root.updateMatrixWorld(true);
    const bx = -Math.cos(a);
    const bz = -Math.sin(a);
    const tyre = (side: number) => kart.body.localToWorld(v.set(-0.72, 0.06, side));
    if (k.drift !== 0 && !k.air) {
      for (const side of [0.66, -0.66]) {
        const p = tyre(side);
        fx.sparks(p.x, p.y, p.z, bx, bz, k.tier, k.tier ? 2 : 1);
        if (surface && surface !== "asphalt") fx.spray(p.x, p.y, p.z, bx, bz, 0.5);
      }
      if (k.tier > lastTier) {
        const p = tyre(0);
        fx.tierPop(p.x, p.y + 0.2, p.z, k.tier);
      }
    }
    lastTier = k.drift ? k.tier : 0;
    // the boost's flame and smoke out of the exhaust
    if (k.boost > 0) {
      const p = kart.body.localToWorld(v.copy(kart.exhaust.p));
      fx.flame(p.x, p.y, p.z, bx, bz, 1.2, 3);
      smokeAt -= dt;
      if (smokeAt <= 0) {
        smokeAt = 0.06;
        fx.smoke(p.x, p.y, p.z, bx, bz, 0.8);
      }
    }
    // a bump of snow where it lands
    if (wasAir && !k.air) fx.land(k.x, k.y, k.z, 1);
    wasAir = k.air;
    fx.update(dt);
    glow.intensity = k.drift && k.tier ? 3 + k.tier * 2 : 0;
    glow.color.set(SPARK[k.tier]);
    v.set(-0.8, 0.2, 0);
    kart.body.localToWorld(v);
    glow.position.copy(v);
    // the ghost: your best lap, at the same time into this one
    ghost.root.visible = false;
    if (ghostOn && best && laps.started !== null) {
      const n = Math.floor((k.t - laps.started) * 30) * 4;
      if (n + 3 < best.length) {
        ghost.root.visible = true;
        ghost.root.position.set(best[n], best[n + 1] + 0.02, best[n + 2]);
        ghost.root.rotation.y = -best[n + 3];
      }
    }

    // ── the camera: behind, swinging round after the kart (its path, in a drift) ──
    const path = Math.hypot(k.vx, k.vz) > 3 ? Math.atan2(k.vz, k.vx) : a;
    let want = k.drift !== 0 ? a + angleTo(a, path) * 0.55 : a;
    if (speed < -1) want = a;
    if (ctl.lookBack) want += Math.PI;
    camYaw += angleTo(camYaw, want) * Math.min(1, dt * (ctl.lookBack ? 20 : 5));
    const dist = 4.4 + Math.min(1.4, Math.abs(speed) * 0.04);
    camPos.set(x - Math.cos(camYaw) * dist, y + 1.75, z - Math.sin(camYaw) * dist);
    shake = Math.max(0, shake - dt * 3);
    if (shake > 0)
      camPos.add(new T3.Vector3((Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.3, 0));
    lookAt.set(x + Math.cos(camYaw) * 4, y + 0.85, z + Math.sin(camYaw) * 4);
    cam.position.copy(camPos);
    cam.lookAt(lookAt);
    fov += ((k.boost > 0 ? 80 : 66 + Math.abs(speed) * 0.15) - fov) * Math.min(1, dt * 4);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    sun.position.set(x, y, z).addScaledVector(sunDir, 200);
    sun.target.position.set(x, y, z);
    // sound, rumble
    sound?.update({
      speed,
      throttle: input.throttle,
      drift: k.drift !== 0,
      tier: k.tier,
      boost: k.boost > 0,
      air: k.air,
      ground: k.ground,
      spin: k.spin > 0,
      rev: lights.rev,
    });
    if (k.drift && k.tier) ctl.rumble(pad, 0, 0.12 * k.tier, 40);

    renderer.render(scene, cam);
    hud.draw(k, laps, callout.until > clock ? callout.text : "", spec);
    panel.draw(k, world);
  };
  raf = requestAnimationFrame(frame);
  const onResize = () => {
    const w = el.clientWidth || innerWidth;
    const h = el.clientHeight || innerHeight;
    renderer.setSize(w, h);
    C.inkResolution(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  addEventListener("resize", onResize);
  (window as unknown as { __kart?: unknown }).__kart = {
    get k() {
      return k;
    },
    spec,
    track,
    trackAt,
    restart,
    reset,
    place,
    scene,
    cam,
    renderer,
    get laps() {
      return laps;
    },
    set drive(f: ((k: KartState, w: TrackWorld) => KartInput) | null) {
      drive = f;
    },
    get best() {
      return best;
    },
  };
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("keydown", onDown);
    removeEventListener("keyup", onUp);
    removeEventListener("resize", onResize);
    sound?.dispose();
    driver.dispose();
    kart.dispose();
    ghost.dispose();
    park.dispose();
    grounds.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    hud.dispose();
    panel.dispose();
  };
}

function angleTo(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

// ── the HUD: in the game's own look (docs/plan/45-the-ui.md) ──
const HUD_CSS = `
.kh{position:absolute;pointer-events:none;color:var(--cream);font-family:var(--font-body)}
.kh .lbl{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream-dim)}
.kh .lcd{font-family:var(--font-lcd);color:var(--vfd);text-shadow:0 0 8px rgba(241,215,154,.35)}
.kh .big{font-family:var(--font-title);font-weight:600;letter-spacing:.12em;color:var(--amber);text-transform:uppercase;
  text-shadow:0 3px 0 #2a1b11,0 0 30px rgba(241,215,154,.45)}
.kh .lamp{width:28px;height:28px;border-radius:50%;background:#2a1612;border:2px solid #120a08;box-shadow:inset 0 2px 4px #000}
.kh .lamp.on{background:radial-gradient(#ffb08f,#c8553f 60%,#7a2a1e);box-shadow:0 0 18px #c8553f}
.kh i{display:block;width:44px;height:10px;border-radius:2px;background:var(--meter-off)}
`;
function buildHud(host: HTMLElement) {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5";
  root.innerHTML = `<style>${HUD_CSS}</style>
  <div class="kh cabinet" style="left:24px;top:22px;padding:10px 14px;display:grid;grid-template-columns:auto auto;gap:3px 16px;align-items:baseline">
    <span class="lbl">Lap</span><span class="lcd" data-k="lap" style="font-size:26px">–</span>
    <span class="lbl">Time</span><span class="lcd" data-k="time" style="font-size:22px">–</span>
    <span class="lbl">Last</span><span class="lcd" data-k="last" style="font-size:18px;color:var(--cream-dim)">–</span>
    <span class="lbl">Best</span><span class="lcd" data-k="best" style="font-size:18px;color:var(--cream-dim)">–</span>
  </div>
  <div class="kh cabinet" data-k="lights" style="left:50%;top:26px;transform:translateX(-50%);padding:10px 16px;display:none;gap:12px">
    ${[0, 1, 2, 3, 4].map(() => '<div class="lamp"></div>').join("")}
  </div>
  <div class="kh big" data-k="call" style="left:50%;top:120px;transform:translateX(-50%);font-size:40px;white-space:nowrap"></div>
  <div class="kh" style="left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:22px">
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <div style="display:flex;gap:4px" data-k="meter"><i></i><i></i><i></i></div>
      <div class="lbl" style="font-size:10px" data-k="drift">Drift</div>
    </div>
    <div class="cabinet" style="padding:6px 14px;text-align:center"><div class="lcd" data-k="speed" style="font-size:34px;line-height:1">0</div><div class="lbl" style="font-size:9px">km/h</div></div>
  </div>
  <div class="kh lbl" style="left:24px;bottom:22px;line-height:1.7;font-size:10px;max-width:330px">
    W S go · brake &nbsp; A D steer &nbsp; SPACE hop &amp; drift<br/>C look back &nbsp; R the lights &nbsp; T back on the road<br/>G ghost &nbsp; X spin out &nbsp; TAB tuning &nbsp; pad: RT LT stick RB
  </div>`;
  host.appendChild(root);
  const q = (k: string) => root.querySelector(`[data-k="${k}"]`) as HTMLElement;
  const meter = [...q("meter").children] as HTMLElement[];
  const cols = ["#8fc0ff", "#e8a33d", "#c48cff"];
  return {
    lights(lit: number) {
      const el = q("lights");
      el.style.display = lit < 0 ? "none" : "flex";
      [...el.children].forEach((c, i) => {
        c.classList.toggle("on", i < lit);
      });
    },
    draw(k: KartState, laps: LapCounter, call: string, _s: KartSpec) {
      q("lap").textContent = laps.started === null ? "–" : String(laps.lap + 1);
      q("time").textContent = laps.started === null ? "–" : fmt(k.t - laps.started);
      q("last").textContent = laps.last === null ? "–" : fmt(laps.last);
      q("best").textContent = laps.best === null ? "–" : fmt(laps.best);
      q("call").textContent = call;
      q("speed").textContent = String(Math.round(Math.abs(kartSpeed(k)) * 3.6));
      for (const [i, m] of meter.entries()) {
        const on = k.drift !== 0 && k.tier > i;
        m.style.background = on ? cols[i] : "var(--meter-off)";
        m.style.boxShadow = on ? `0 0 10px ${cols[i]}` : "none";
      }
      q("drift").textContent = k.drift
        ? k.tier === 3
          ? "Purple · let go"
          : "Drifting"
        : k.boost > 0
          ? "Boost"
          : "Drift";
    },
    dispose() {
      root.remove();
    },
  };
}

// ── the tuning panel: what it's doing, and every number on a slider ──
const KNOBS: [keyof KartSpec | `${"tiers" | "turbo"}.${0 | 1 | 2}`, number, number, number, string][] = [
  ["vmax", 12, 40, 0.5, "top speed m/s"],
  ["accel", 0.4, 3, 0.05, "pick-up 1/s"],
  ["brake", 8, 60, 1, "brake m/s²"],
  ["coast", 0, 6, 0.1, "coast m/s²"],
  ["yaw", 0.8, 4, 0.05, "turn rad/s"],
  ["yawFade", 0, 0.9, 0.02, "turn fade at top"],
  ["steerRate", 2, 20, 0.5, "wheel speed (keys)"],
  ["grip", 2, 20, 0.5, "grip 1/s"],
  ["driftGrip", 0.5, 8, 0.1, "drift grip 1/s"],
  ["driftYaw", 0.3, 2.5, 0.05, "drift turn rad/s"],
  ["driftSteer", 0, 1.5, 0.05, "drift tighten/open"],
  ["driftMin", 3, 15, 0.5, "drift needs m/s"],
  ["hop", 0.5, 6, 0.1, "hop m/s"],
  ["tiers.0", 0.2, 2, 0.05, "blue at s"],
  ["tiers.1", 0.5, 3, 0.05, "amber at s"],
  ["tiers.2", 0.8, 4, 0.05, "purple at s"],
  ["turbo.0", 0.1, 2, 0.05, "blue turbo s"],
  ["turbo.1", 0.2, 3, 0.05, "amber turbo s"],
  ["turbo.2", 0.3, 4, 0.05, "purple turbo s"],
  ["boostTop", 1, 1.8, 0.01, "boost top ×"],
  ["boostKick", 1, 1.5, 0.01, "boost kick ×"],
  ["padBoost", 0.2, 3, 0.05, "pad boost s"],
  ["gravity", 8, 40, 0.5, "gravity m/s²"],
  ["bounce", 0, 0.9, 0.02, "wall bounce"],
  ["scrape", 0.6, 1, 0.01, "wall scrape keeps"],
  ["spinFor", 0.3, 3, 0.05, "spin-out s"],
];
function buildPanel(host: HTMLElement, spec: KartSpec, setSurface: (s: KartGround | undefined) => void) {
  const root = document.createElement("div");
  root.className = "cabinet";
  root.style.cssText =
    "position:absolute;right:16px;top:16px;bottom:16px;width:330px;overflow:auto;padding:14px 16px;z-index:6;display:none;font-size:12px;color:var(--cream)";
  const get = (k: string): number => {
    const [a, b] = k.split(".");
    const v = (spec as unknown as Record<string, number | number[]>)[a];
    return b === undefined ? (v as number) : (v as number[])[Number(b)];
  };
  const set = (k: string, x: number) => {
    const [a, b] = k.split(".");
    const r = spec as unknown as Record<string, number | number[]>;
    if (b === undefined) r[a] = x;
    else (r[a] as number[])[Number(b)] = x;
  };
  root.innerHTML = `
    <div class="title" style="font-size:20px">The kart · tuning</div>
    <div class="zigzag" style="margin:6px 0 10px"></div>
    <div class="grp" style="margin-bottom:6px">Now</div>
    <pre data-k="tele" style="font-family:var(--font-mono);font-size:11px;line-height:1.5;color:var(--vfd);margin:0 0 10px"></pre>
    <div class="grp" style="margin-bottom:6px">Underfoot</div>
    <select data-k="surf" class="field" style="width:100%;margin-bottom:10px">
      <option value="">the circuit (asphalt, kerbs)</option><option>snow</option><option>deep</option><option>ice</option><option>blackice</option>
    </select>
    <div class="grp" style="margin-bottom:6px">Numbers</div>
    <div data-k="knobs"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="deck-btn" data-k="copy" style="flex:1">Copy the numbers</button>
      <button class="deck-btn" data-k="reset">Defaults</button>
    </div>`;
  const knobs = root.querySelector('[data-k="knobs"]') as HTMLElement;
  const inputs: { k: string; i: HTMLInputElement; out: HTMLElement }[] = [];
  for (const [k, lo, hi, step, label] of KNOBS) {
    const row = document.createElement("label");
    row.style.cssText = "display:grid;grid-template-columns:1fr 46px;gap:2px 8px;margin:6px 0";
    row.innerHTML = `<span style="color:var(--cream-dim)">${label}</span><span class="mono" style="text-align:right;color:var(--vfd)"></span>`;
    const i = document.createElement("input");
    i.type = "range";
    i.className = "slider";
    i.min = String(lo);
    i.max = String(hi);
    i.step = String(step);
    i.value = String(get(k));
    i.style.gridColumn = "1 / 3";
    const out = row.children[1] as HTMLElement;
    out.textContent = String(get(k));
    i.oninput = () => {
      set(k, Number(i.value));
      out.textContent = i.value;
    };
    row.appendChild(i);
    knobs.appendChild(row);
    inputs.push({ k, i, out });
  }
  (root.querySelector('[data-k="surf"]') as HTMLSelectElement).onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    setSurface(v ? (v as KartGround) : undefined);
  };
  (root.querySelector('[data-k="copy"]') as HTMLButtonElement).onclick = () => {
    const txt = JSON.stringify(spec, null, 2);
    console.log("kart spec", txt);
    void navigator.clipboard?.writeText(txt).catch(() => {});
  };
  (root.querySelector('[data-k="reset"]') as HTMLButtonElement).onclick = () => {
    Object.assign(spec, structuredClone(KART));
    for (const x of inputs) {
      x.i.value = String(get(x.k));
      x.out.textContent = x.i.value;
    }
  };
  host.appendChild(root);
  const tele = root.querySelector('[data-k="tele"]') as HTMLElement;
  let shown = false;
  return {
    toggle() {
      shown = !shown;
      root.style.display = shown ? "block" : "none";
    },
    draw(k: KartState, world: TrackWorld) {
      if (!shown) return;
      const on = world.locate(k.x, k.z, k.y);
      tele.textContent = [
        `speed   ${(kartSpeed(k) * 3.6).toFixed(0).padStart(4)} km/h  ${kartSpeed(k).toFixed(1)} m/s`,
        `slip    ${((kartSlip(k) * 180) / Math.PI).toFixed(0).padStart(4)}°   yaw ${k.w.toFixed(2)} rad/s`,
        `drift   ${k.drift === 0 ? "—" : k.drift > 0 ? "right" : "left"}  charge ${k.charge.toFixed(2)} s  tier ${k.tier}`,
        `boost   ${k.boost.toFixed(2)} s   ${k.air ? (k.hopping ? "hop" : "AIR") : "ground"}`,
        `under   ${k.ground}   ${on ? `s ${on.s.toFixed(0)}  off ${on.lat.toFixed(1)} m` : "off the circuit"}`,
      ].join("\n");
    },
    dispose() {
      root.remove();
    },
  };
}
