import { DEFAULT_AVATAR, parseAvatar } from "@yutopia/shared";
import { carKindOf, lookFor, SEATS_OF } from "@yutopia/shared/car";
import {
  AmbientLight,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildCar, loadCarManifest } from "../tp/car/glb";
import type { Sedan } from "../tp/car/model";
import { carFit } from "../tp/car/seatfit";
import { actFaults, gripPoint } from "./act-faults";
import { doorMarksOn, doorwayOf, handsOnGrips, stepOf } from "./act-pose";
import { actAt, ENTER_FAST_S, ENTER_S, EXIT_S, newActPose, roofGrip, seatGrip, straddleAt, thighGrip } from "./getin";

// Plan 100 phase 0: the get-in act's bench (/dev/getin) — a car, a seat, her body in the act at a scrubbed moment (the
// game's own posing: act-pose.ts), played, slowed, looped; seen from beside the door, the front, behind, above, or
// turned about by hand; the grips and the feet marked, and the act's faults (act-faults.ts) listed as they happen.
//   /dev/getin?car=sedan&seat=0&out=1&fast=1

export interface BenchOpts {
  car: string;
  seat: number;
}

export async function runBench(el: HTMLElement, o: BenchOpts): Promise<() => void> {
  const C = await import("../chars");
  await C.loadHero();
  await loadCarManifest();
  const W = el.clientWidth || window.innerWidth;
  const H = el.clientHeight || window.innerHeight;
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H);
  renderer.setClearColor("#e6e1d6");
  el.appendChild(renderer.domElement);
  C.inkResolution(W, H);
  const { yuLit } = await import("../look/yulit");
  const { setLifeTone } = await import("../look/life-tone");
  C.setLifeHost({ renderer, lit: (m, base) => yuLit(m, { base }) });
  setLifeTone(renderer);
  const scene = new Scene();
  scene.add(new HemisphereLight("#dfe8f5", "#8a7563", 1.3), new AmbientLight("#ffffff", 0.3));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(-4, 7, 5);
  scene.add(sun, sun.target);
  const grid = new GridHelper(20, 40, "#9c917c", "#cfc5b0");
  scene.add(grid);
  const cam = new PerspectiveCamera(38, W / H, 0.05, 100);
  const orbit = new OrbitControls(cam, renderer.domElement);
  orbit.enableDamping = true;

  // the car
  const kind = carKindOf(o.car);
  const look = lookFor(`bench-${o.car}`, kind, {});
  const r = renderer;
  const mod: Sedan = buildCar({ variant: look.variant, look, level: "near", renderer: r, pad: SEATS_OF[kind] });
  scene.add(mod.root);
  await mod.loaded;
  // her
  const f = new C.CharFactory();
  const m = new C.PersonModel(f, parseAvatar(DEFAULT_AVATAR), 0);
  for (let i = 0; i < 400 && !m.update(); i++) {
    f.pump(20);
    await new Promise((res) => setTimeout(res, 16));
  }
  mod.body.add(m.root);
  m.root.scale.setScalar(mod.pedals ? 1 : 0.92);

  // marks: the grips (blue), the feet (green), a fault (red)
  const ball = (c: string, r0 = 0.03) => {
    const b = new Mesh(new SphereGeometry(r0, 12, 8), new MeshBasicMaterial({ color: c, depthTest: false }));
    b.renderOrder = 9;
    mod.body.add(b);
    return b;
  };
  const gripBalls = [ball("#2b6fd6"), ball("#2b6fd6"), ball("#2b6fd6")];
  const footBalls = [ball("#2b9a4b", 0.025), ball("#2b9a4b", 0.025)];

  // the controls
  const ui = document.createElement("div");
  ui.style.cssText =
    "position:absolute;left:12px;top:12px;right:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:13px system-ui;color:#1d1b17";
  const q = new URLSearchParams(location.search);
  let leaving = q.get("out") === "1";
  let fast = q.get("fast") === "1";
  let playing = true;
  let speed = 1;
  let t = 0;
  const len = () => (leaving ? EXIT_S : fast ? ENTER_FAST_S : ENTER_S);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1000";
  slider.style.width = "320px";
  slider.oninput = () => {
    playing = false;
    t = (Number(slider.value) / 1000) * len();
  };
  const btn = (label: string, on: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "padding:4px 8px;border:1px solid #8a8070;background:#f4efe4;border-radius:4px;cursor:pointer";
    b.onclick = on;
    ui.appendChild(b);
    return b;
  };
  const play = btn("pause", () => {
    playing = !playing;
    play.textContent = playing ? "pause" : "play";
  });
  btn("in / out", () => {
    leaving = !leaving;
    t = 0;
  });
  btn("hurried", () => {
    fast = !fast;
    t = 0;
  });
  btn("½×", () => {
    speed = speed === 1 ? 0.5 : speed === 0.5 ? 0.25 : 1;
  });
  const views: Record<string, [number, number, number]> = {
    side: [0.3, 1.7, 4.8],
    front: [-4.2, 1.9, 2.6],
    back: [4.6, 2.1, 2.6],
    top: [0.3, 6.5, 1.5],
  };
  for (const v of Object.keys(views)) btn(v, () => view(v));
  ui.appendChild(slider);
  const clock = document.createElement("span");
  ui.appendChild(clock);
  el.appendChild(ui);
  const faultsEl = document.createElement("pre");
  faultsEl.style.cssText =
    "position:absolute;left:12px;bottom:12px;margin:0;font:12px ui-monospace,monospace;color:#9a1b12;background:#f4efe4cc;padding:6px 8px;border-radius:4px;max-width:70%;white-space:pre-wrap";
  el.appendChild(faultsEl);

  const door = mod.doorOf ? mod.doorOf(o.seat) : -1;
  const marks: Parameters<typeof doorMarksOn>[3] = {};
  const act = newActPose();
  const at = new Vector3();
  const side = () => Math.sign(mod.seats[o.seat]?.hip.z ?? 1) || 1;
  const view = (v: string) => {
    const p = views[v];
    const s = side();
    // (about the door's opening: its middle, a little out from the car's side)
    const op = door >= 0 ? mod.openingOf?.(door) : null;
    const cx = op ? (op.x0 + op.x1) / 2 + 0.2 : (mod.seats[o.seat]?.hip.x ?? 0);
    const cy = op ? Math.max(0.9, (op.y0 + op.y1) / 2 - 0.2) : 0.9;
    const cz = op ? op.out + 0.3 : 1;
    mod.body.updateWorldMatrix(true, false);
    cam.position.copy(mod.body.localToWorld(at.set(cx + p[0], cy + p[1] - 0.9, (cz - 0.6 + p[2]) * s)));
    orbit.target.copy(mod.body.localToWorld(at.set(cx, cy, cz * s)));
    orbit.update();
  };
  view("side");

  let last = performance.now();
  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      t += dt * speed;
      if (t > len() + 0.6) t = 0;
      slider.value = String(Math.round((Math.min(t, len()) / len()) * 1000));
    }
    const tt = Math.min(t, len());
    clock.textContent = `${leaving ? "out" : fast ? "in (hurried)" : "in"} ${tt.toFixed(2)} / ${len().toFixed(1)} s`;
    const way = doorwayOf(mod, m, o.seat, door, null);
    const A = C.actsNow();
    if (way && A && m.update()) {
      const k = way.k;
      // (the act's own clock: a hurried one run faster)
      const at0 = leaving ? tt : tt * (ENTER_S / len());
      if (door >= 0) actAt(way, at0, leaving, null, null, act);
      else straddleAt(way, at0, leaving, null, act);
      if (door >= 0) {
        doorMarksOn(mod, door, way, marks, 0);
        mod.doors[door].open(act.door >= 0 ? Math.min(1.05, act.door * 1.05) : 0);
      }
      m.root.position.set(act.hips.x, 0, act.hips.z);
      m.root.rotation.y = act.yaw;
      const seat = mod.seats[o.seat];
      const fit = carFit(m, seat, o.seat === 0, mod, k, -1);
      const sat = A.car3(fit, now / 1000, 0);
      const step = A.carStep(stepOf(act, k, side()), now / 1000);
      const kk = act.sat;
      const l3 = sat.lift ?? [0, 0, 0];
      const ly = act.hips.y / k - fit.stand;
      m.setPose(kk > 0 ? C.blend(step.pose, sat.pose, kk) : step.pose, [
        l3[0] * kk,
        ly + (l3[1] + fit.drop - ly) * kk,
        l3[2] * kk,
      ]);
      if (kk > 0 && sat.hands)
        m.handsTo({ L: sat.hands.L && { ...sat.hands.L, w: kk }, R: sat.hands.R && { ...sat.hands.R, w: kk } });
      const where = (g: string, S: "L" | "R") =>
        g === "thigh"
          ? mod.body.localToWorld(thighGrip(act, S, k, new Vector3()))
          : g === "roof"
            ? mod.body.localToWorld(roofGrip(way, new Vector3()))
            : g === "seat"
              ? mod.body.localToWorld(seatGrip(way, new Vector3()))
              : g === "wheel"
                ? mod.body.localToWorld(mod.rim(way.s * 0.75, new Vector3()))
                : ((marks as Record<string, { getWorldPosition(v: Vector3): Vector3 } | undefined>)[
                    g
                  ]?.getWorldPosition(new Vector3()) ?? null);
      handsOnGrips(m, act, where as never);
      // the marks and the faults
      act.hands.slice(0, 3).forEach((h, i) => {
        const g = gripPoint(way, h.at, Math.max(0, act.door) * 1.05, new Vector3(), act, h.S);
        gripBalls[i].visible = !!g && h.w > 0.2;
        if (g) gripBalls[i].position.copy(g);
      });
      for (let i = act.hands.length; i < 3; i++) gripBalls[i].visible = false;
      footBalls[0].position.copy(act.feet[0]);
      footBalls[1].position.copy(act.feet[1]);
      const fs = actFaults(way, act, +tt.toFixed(2));
      faultsEl.textContent = fs.length
        ? fs.map((x) => `${x.what} — ${x.part}, ${(x.by * 100).toFixed(0)} cm`).join("\n")
        : "";
      faultsEl.style.display = fs.length ? "block" : "none";
    }
    orbit.update();
    renderer.render(scene, cam);
  };
  frame();
  return () => {
    cancelAnimationFrame(raf);
    orbit.dispose();
    mod.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    ui.remove();
    faultsEl.remove();
  };
}
