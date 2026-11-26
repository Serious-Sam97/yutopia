// The animals' animation bench (docs/plan/129-animal-animations.md, F2a): every model, every clip, played as the game
// plays it — on a treadmill floor marked in metres (it scrolls under the feet at the speed it's going: a foot that
// slides shows against the lines), the gait the game would pick at that speed (models.ts gaitOf: walk, trot, run, each
// at its own speed), slowed, paused, stepped a frame; one animal, two side by side, or every model in rows. Each clip's
// own speed and what the audit found (tools/art/animals/audit.py) shown with it.
//
//   /dev/animals                         the bear, its walk at its game speed
//   /dev/animals?model=deer&speed=15     the deer at a gallop
//   /dev/animals?model=wolf&clip=howl    a clip by name (its own speed: none — it stands)
//   /dev/animals?all=1&speed=3           every model at 3 m/s (or &clip=idle)
//   &with=wolf                           another beside it; &slow=0.25 slowed; &view=free the camera free
import { ANIMALS, type AnimalKind } from "@yutopia/shared/animals/species";
import {
  AmbientLight,
  type Bone,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type AnimalBody, AnimalModels, animalManifest, gaitOf } from "./models";

const SPECIES_OF: Record<string, AnimalKind> = { deer_buck: "deer", horse_white: "horse", chick: "chicken" };
const kindOf = (model: string): AnimalKind => SPECIES_OF[model] ?? (model as AnimalKind);

interface Shown {
  model: string;
  body: AnimalBody | null;
  at: Group;
  /** its feet (the IK roots, a bird's or a hare's foot and hand) and where each was the frame before (world) */
  feet: { bone: Bone; was: Vector3 | null; lo: number }[];
  /** what it measured this second: the down feet's speed back along the floor against the floor's, m/s */
  slip: { v: number[]; out: string };
}
// (the bones the audit reads its feet by: tools/art/animals/audit.py FEET)
// (three drops the dot from a bone's name as it loads it: IKFrontLeg.L is IKFrontLegL)
const FEET = /^(IK(Front|Back)Leg\.?[LR]|foot\.?[LR]|hand\.?[LR])$/;
const fw = new Vector3();

export async function runBench(host: HTMLElement, opts: { q: URLSearchParams }): Promise<() => void> {
  const q = opts.q;
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#e6e1d6");
  scene.add(new HemisphereLight("#dfe8f5", "#8a7563", 1.4), new AmbientLight("#ffffff", 0.35));
  const sun = new DirectionalLight("#ffffff", 2.0);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const cam = new PerspectiveCamera(32, 1, 0.05, 400);
  const orbit = new OrbitControls(cam, renderer.domElement);
  orbit.enabled = q.get("view") === "free";

  // the treadmill: a floor of metre squares (bold every 5), scrolled under the feet at the speed it's going
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#d9d2c2";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i <= 10; i++) {
    g.fillStyle = i % 5 === 0 ? "#8f846f" : "#b5ab96";
    const w = i % 5 === 0 ? 4 : 2;
    g.fillRect(i * 51.2 - w / 2, 0, w, 512);
    g.fillRect(0, i * 51.2 - w / 2, 512, w);
  }
  const tex = new CanvasTexture(cv);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  const FLOOR = 60;
  tex.repeat.set(FLOOR / 10, FLOOR / 10);
  const floor = new Mesh(new PlaneGeometry(FLOOR, FLOOR), new MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const man = await animalManifest();
  const models = new AnimalModels(renderer, () => {});
  const all = Object.keys(man).filter((k) => !k.startsWith("_"));
  const state = {
    model: q.get("model") ?? "bear",
    with: q.get("with") ?? "",
    clip: q.get("clip") ?? "",
    speed: q.get("speed") !== null ? Number(q.get("speed")) : NaN,
    slow: Number(q.get("slow") ?? 1),
    paused: false,
    all: q.get("all") === "1",
  };
  let shown: Shown[] = [];
  let laidFor = "";
  const lay = () => {
    const key = `${state.all}|${state.model}|${state.with}`;
    if (key === laidFor) return;
    laidFor = key;
    for (const s of shown) {
      s.body?.dispose();
      s.at.removeFromParent();
    }
    const names = state.all ? all : [state.model, ...(state.with ? [state.with] : [])];
    shown = names.map((model, i) => {
      const at = new Group();
      // (in rows of six, a few metres apart, across the treadmill)
      const across = state.all ? (i % 6) * 2.6 - 6.5 : i * 3 - (names.length - 1) * 1.5;
      const back = state.all ? Math.floor(i / 6) * 3 : 0;
      at.position.set(-back, 0, across);
      scene.add(at);
      return { model, body: null, at, feet: [], slip: { v: [], out: "" } };
    });
  };

  // the panel
  const ui = document.createElement("div");
  ui.style.cssText =
    "position:fixed;top:12px;left:12px;z-index:5;background:rgba(250,247,240,.94);padding:10px 12px;border-radius:6px;font:12px/1.5 ui-monospace,monospace;color:#2a2620;min-width:300px";
  host.appendChild(ui);
  const info = document.createElement("pre");
  info.style.cssText = "margin:6px 0 0;white-space:pre-wrap";
  const row = (label: string, el: HTMLElement) => {
    const d = document.createElement("label");
    d.style.cssText = "display:flex;gap:8px;align-items:center;margin:2px 0";
    d.append(label, el);
    ui.append(d);
    return el;
  };
  const pick = (opts: string[], v: string, on: (v: string) => void) => {
    const s = document.createElement("select");
    for (const o of opts) s.add(new Option(o || "—", o));
    s.value = v;
    s.onchange = () => on(s.value);
    return s;
  };
  row("model", pick(all, state.model, (v) => {
    state.model = v;
    state.clip = "";
    refreshClips();
  }));
  row("beside", pick(["", ...all], state.with, (v) => (state.with = v)));
  const clipSel = row("clip", pick([""], state.clip, (v) => (state.clip = v))) as HTMLSelectElement;
  const refreshClips = () => {
    clipSel.length = 0;
    clipSel.add(new Option("— by speed (the game's gait) —", ""));
    for (const c of man[state.model]?.clips ?? []) clipSel.add(new Option(c, c));
    clipSel.value = state.clip;
  };
  refreshClips();
  const sp = document.createElement("input");
  sp.type = "range";
  sp.min = "0";
  sp.max = "16";
  sp.step = "0.1";
  const spOut = document.createElement("span");
  sp.oninput = () => (state.speed = Number(sp.value));
  row("speed m/s", sp).after(spOut);
  const sl = pick(["1", "0.5", "0.25", "0.1"], String(state.slow), (v) => (state.slow = Number(v)));
  row("slow", sl);
  const pause = document.createElement("button");
  pause.textContent = "pause / play (space)";
  pause.onclick = () => (state.paused = !state.paused);
  const step = document.createElement("button");
  step.textContent = "a frame (.)";
  let stepOnce = false;
  step.onclick = () => (stepOnce = true);
  ui.append(pause, " ", step, info);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " ") state.paused = !state.paused;
    if (e.key === ".") stepOnce = true;
  };
  addEventListener("keydown", onKey);

  const resize = () => {
    const w = host.clientWidth || innerWidth;
    const h = host.clientHeight || innerHeight;
    renderer.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  let last = performance.now();
  let raf = 0;
  let scroll = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    lay();
    if (state.paused && !stepOnce) dt = 0;
    else if (stepOnce) {
      dt = 1 / 24;
      stepOnce = false;
    } else dt *= state.slow;
    const lead = shown[0];
    const kind0 = kindOf(lead?.model ?? state.model);
    if (Number.isNaN(state.speed)) state.speed = ANIMALS[kind0]?.walk ?? 1;
    sp.value = String(state.speed);
    spOut.textContent = ` ${state.speed.toFixed(1)}`;
    const lines: string[] = [];
    const moving = !state.clip || ["walk", "trot", "run", "swim"].includes(state.clip);
    for (const s of shown) {
      if (!s.body) {
        s.body = models.body(s.model, false);
        if (s.body) {
          s.at.add(s.body.root);
          s.body.root.traverse((o) => {
            if ((o as Bone).isBone && FEET.test(o.name)) s.feet.push({ bone: o as Bone, was: null, lo: Infinity });
          });
        }
        continue;
      }
      const kind = kindOf(s.model);
      const own = man[s.model]?.speeds ?? {};
      let clip = state.clip;
      let rate = 1;
      if (!clip) {
        if (state.speed < 0.05) clip = "idle";
        else {
          const gt = gaitOf(kind, state.speed, false, s.body.speeds, s.body.clip);
          clip = gt.clip;
          rate = gt.rate;
        }
      }
      s.body.play(clip as never, rate);
      s.body.update(dt);
      // (the feet: a foot down — near the lowest it's been — goes back with the floor; what it doesn't is slip)
      if (dt > 0) {
        s.at.updateMatrixWorld(true);
        for (const f of s.feet) {
          f.bone.getWorldPosition(fw);
          f.lo = Math.min(f.lo + dt * 0.02, fw.y);
          if (f.was && fw.y < f.lo + Math.max(0.004, (s.body.height ?? 1) * 0.03) && f.was.y < f.lo + Math.max(0.004, s.body.height * 0.03)) {
            s.slip.v.push(-(fw.x - f.was.x) / dt);
          }
          (f.was ??= new Vector3()).copy(fw);
        }
      }
      // (as the audit reads it: the median of the down feet's speed — a foot landing or lifting off isn't its stride)
      if (s.slip.v.length >= 60) {
        const v = s.slip.v.sort((a, b) => a - b);
        const back = v[v.length >> 1];
        s.slip.out = `  feet ${back.toFixed(2)} slip ${Math.abs(back - (moving ? state.speed : 0)).toFixed(2)} m/s`;
        s.slip.v = [];
      }
      if (s === lead || state.all)
        lines.push(
          `${s.model.padEnd(11)} ${String(s.body.clip ?? clip).padEnd(6)} ×${rate.toFixed(2)}  own ${own[clip as "walk"] ? `${own[clip as "walk"]?.toFixed(2)} m/s` : "—"}${man[s.model]?.audit?.[clip]?.length ? `  ⚠ ${man[s.model]?.audit?.[clip]?.join(",")}` : ""}${s.slip.out}`,
        );
    }
    // the floor goes back under them at the speed they're going (a gait at its speed: the feet keep with it)
    scroll += (moving ? state.speed : 0) * dt;
    tex.offset.x = (scroll / 10) % 1;
    info.textContent = `${lines.slice(0, 40).join("\n")}\n\n${ANIMALS[kind0] ? `game: walk ${ANIMALS[kind0].walk}  run ${ANIMALS[kind0].run} m/s` : ""}`;
    // the camera: from the side, at its height
    if (!orbit.enabled) {
      // (framed by its own height: a squirrel a hand's breadth off, a moose a few metres)
      const h = Math.max(0.08, (lead?.body?.height ?? 1) * (lead?.body?.root.scale.y ?? 1));
      if (state.all) {
        cam.position.set(-3, 4, 22);
        cam.lookAt(-3, 1, 0);
      } else {
        const d = Math.max(0.6, h * 3.6) + (state.with ? 2 : 0);
        cam.position.set(0, h * 0.8, d);
        cam.lookAt(0, h * 0.45, 0);
      }
    } else orbit.update();
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(frame);
  /** A model's gait at `speed` measured off the screen (the game's clip, the game's rate — gaitOf —, stepped 240
   *  times a second for two seconds): the down feet's speed back (median; a foot down within a little of its lowest)
   *  against the speed it goes — what the eye can't time at a gallop. */
  const measure = async (model: string, speed: number) => {
    let body: AnimalBody | null = null;
    for (let i = 0; i < 200 && !body; i++) {
      body = models.body(model, false);
      if (!body) await new Promise((r) => setTimeout(r, 50));
    }
    if (!body) return null;
    const g = gaitOf(kindOf(model), speed, false, body.speeds);
    body.play(g.clip, g.rate, 0);
    const feet: Bone[] = [];
    body.root.traverse((o) => {
      if ((o as Bone).isBone && FEET.test(o.name)) feet.push(o as Bone);
    });
    const dt = 1 / 240;
    const track = feet.map(() => [] as Vector3[]);
    for (let i = 0; i < 480; i++) {
      body.update(dt);
      body.root.updateMatrixWorld(true);
      feet.forEach((f, k) => track[k].push(f.getWorldPosition(new Vector3())));
    }
    body.dispose();
    const v: number[] = [];
    for (const t of track) {
      const ys = t.map((p) => p.y);
      const lo = Math.min(...ys);
      const down = lo + Math.max(0.0005, (Math.max(...ys) - lo) * 0.12);
      for (let i = 0; i < t.length - 1; i++) if (t[i].y <= down && t[i + 1].y <= down) v.push(-(t[i + 1].x - t[i].x) / dt);
    }
    v.sort((a, b) => a - b);
    const back = v.length ? v[v.length >> 1] : 0;
    // (the median hides a foot planted late and lifted early, sliding at its stance's ends: the worst tenth's slip too)
    const off = v.map((x) => Math.abs(x - speed)).sort((a, b) => a - b);
    const p90 = off.length ? off[Math.floor(off.length * 0.9)] : 0;
    return {
      model,
      speed,
      clip: g.clip,
      rate: +g.rate.toFixed(2),
      feet: +back.toFixed(2),
      slip: +Math.abs(back - speed).toFixed(2),
      p90: +p90.toFixed(2),
      n: v.length,
    };
  };
  (window as unknown as { __animalBench: unknown }).__animalBench = {
    state,
    measure,
    shown: () => shown.map((s) => ({ model: s.model, clip: s.body?.clip ?? null, ready: !!s.body, feet: s.feet.length, slip: s.slip.out })),
  };
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("keydown", onKey);
    removeEventListener("resize", resize);
    for (const s of shown) s.body?.dispose();
    orbit.dispose();
    floor.geometry.dispose();
    (floor.material as MeshLambertMaterial).dispose();
    tex.dispose();
    delete (window as unknown as { __animalBench?: unknown }).__animalBench;
    renderer.dispose();
    ui.remove();
    renderer.domElement.remove();
  };
}
