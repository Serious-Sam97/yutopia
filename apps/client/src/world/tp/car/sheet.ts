import { type CarKind, extrasOf, PART, seededLook, twoToneOf, VARIANTS, wheelsOf } from "@yutopia/shared/car";
import * as T3 from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCar, buildFar, carManifest, loadCarManifest, setCarPart } from "./glb";
import type { Sedan } from "./model";

// /dev/cars — the cars' sheet (docs/plan/92-the-cars.md, phases 5–8): every model made in Blender, as the
// game draws it — near, mid or far; its extras, its wheels, its colours, the police's and the taxi's
// liveries; by day on the snow or at night with its lamps; its doors, bonnet and boot open; dented.
// Drag to turn round it, the wheel to come nearer.

const WORK = ["snowmobile", "snowcat", "ploughtruck", "tractor", "toboggan", "shuttle-bus"];

export async function runSheet(el: HTMLElement): Promise<() => void> {
  await loadCarManifest();
  const W = el.clientWidth || innerWidth;
  const H = el.clientHeight || innerHeight;
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(W, H);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new T3.Scene();
  const pm = new T3.PMREMGenerator(renderer);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const cam = new T3.PerspectiveCamera(38, W / H, 0.05, 400);
  const ground = new T3.Mesh(
    new T3.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
    new T3.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.95 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  const sun = new T3.DirectionalLight(0xfff4e6, 2.4);
  sun.position.set(6, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, far: 30 });
  const sky = new T3.HemisphereLight(0xdfe8f2, 0xb7c0c8, 1.1);
  scene.add(sun, sky);
  const heads = [0, 1].map(() => {
    const s = new T3.SpotLight(0xfff2da, 0, 40, 0.5, 0.6, 1.3);
    scene.add(s, s.target);
    return s;
  });

  // ── what's shown ──
  const st = {
    variant: "saloon-base",
    level: "near" as "near" | "mid" | "far",
    colour: "#6b2430",
    colour2: "",
    extras: new Set<string>(),
    wheels: "",
    role: "",
    night: false,
    doors: 0,
    lids: 0,
    dent: 0,
    /** (docs/plan/92 phase 9) its broken parts: shared car/damage.ts PART */
    parts: 0,
    yaw: -0.7,
    pitch: 0.18,
    dist: 7.5,
  };
  let car: Sedan | null = null;
  let far: ReturnType<typeof buildFar> | null = null;
  const make = () => {
    car?.dispose();
    far?.dispose();
    car = null;
    far = null;
    const e = carManifest()?.cars[st.variant];
    if (!e) return;
    const kind = (VARIANTS[st.variant]?.kind ?? st.variant) as CarKind;
    if (st.level === "far") {
      far = buildFar(e.body, Number.parseInt(st.colour.slice(1), 16), renderer);
      scene.add(far.root);
      return;
    }
    const look = {
      ...seededLook("sheet", kind),
      variant: st.variant,
      colour: Number.parseInt(st.colour.slice(1), 16),
      colour2: st.colour2 && twoToneOf(st.variant) ? Number.parseInt(st.colour2.slice(1), 16) : undefined,
      extras: [...st.extras].filter((x) => (extrasOf(st.variant) as string[]).includes(x)),
      wheels: st.wheels || (e.wheel.style ?? "steel"),
    };
    car = buildCar({
      variant: st.variant,
      look,
      role: st.role || undefined,
      plate: "ESK 240",
      level: st.level,
      renderer,
    });
    car.setEnv(env);
    scene.add(car.root);
    void car.loaded?.then(() => pose());
  };
  const pose = () => {
    if (!car) return;
    for (const d of car.doors) d.open(st.doors);
    setCarPart(car, "bonnet", st.lids);
    setCarPart(car, "boot", st.lids);
    car.setWear(st.dent * 0.3, [st.dent, st.dent * 0.6, st.dent * 0.8, 0, st.dent * 0.4], st.parts);
    car.setLights({
      beams: st.night ? "low" : "off",
      tail: st.night,
      brake: 0,
      reverse: false,
      ind: 0,
      dash: st.night ? 1 : 0.4,
      dome: false,
    });
    car.setBeacon(st.night, performance.now() / 1000);
  };
  const light = () => {
    sun.intensity = st.night ? 0.02 : 2.4;
    sky.intensity = st.night ? 0.05 : 1.1;
    scene.environmentIntensity = st.night ? 0.05 : 1;
    scene.background = new T3.Color(st.night ? 0x0b0e14 : 0xdfe6ee);
    for (const [i, h] of heads.entries()) {
      h.intensity = st.night && car ? 60 : 0;
      const p = car?.lamps.head[i];
      if (p && car) {
        h.position.copy(p).applyMatrix4(car.root.matrixWorld);
        h.target.position.copy(h.position).add(new T3.Vector3(-12, -1.2, 0));
      }
    }
  };

  // ── the panel ──
  const ui = document.createElement("div");
  ui.style.cssText =
    "position:absolute;top:8px;right:8px;width:300px;max-height:calc(100% - 16px);overflow:auto;background:rgba(18,20,24,.88);color:#e8e2d4;font:12px/1.5 ui-monospace,monospace;padding:10px;border-radius:6px";
  el.appendChild(ui);
  const draw = () => {
    const m = carManifest();
    const e = m?.cars[st.variant];
    const btn = (k: string, on: boolean, label = k) =>
      `<button data-v="${k}" style="margin:1px;${on ? "background:#c9a24a;color:#111" : ""}">${label}</button>`;
    ui.innerHTML = `
      <b>CARS</b> · ${e?.name ?? ""} · ${e ? `${(e.tris.near / 1000).toFixed(1)}k near · ${((e.tris.mid ?? 0) / 1000).toFixed(1)}k mid` : ""}<br>
      ${[...Object.keys(VARIANTS), ...WORK].map((k) => btn(k, k === st.variant)).join("")}
      <hr>level ${(["near", "mid", "far"] as const).map((k) => `<button data-l="${k}" style="${k === st.level ? "background:#c9a24a;color:#111" : ""}">${k}</button>`).join("")}
      <br>paint <input type="color" data-c value="${st.colour}"> second <input type="color" data-c2 value="${st.colour2 || "#e8e6df"}"> <label><input type="checkbox" data-c2on ${st.colour2 ? "checked" : ""}>on</label>
      <br>role ${["", "police", "taxi"].map((r) => `<button data-r="${r}" style="${r === st.role ? "background:#c9a24a;color:#111" : ""}">${r || "none"}</button>`).join("")}
      <br>extras ${(extrasOf(st.variant) as string[]).map((x) => `<label><input type="checkbox" data-x="${x}" ${st.extras.has(x) ? "checked" : ""}>${x}</label>`).join(" ")}
      <br>wheels ${wheelsOf(st.variant)
        .map(
          (w) =>
            `<button data-w="${w}" style="${w === (st.wheels || e?.wheel.style) ? "background:#c9a24a;color:#111" : ""}">${w}</button>`,
        )
        .join("")}
      <br>doors <input type="range" data-d min="0" max="1.1" step="0.05" value="${st.doors}">
      <br>bonnet/boot <input type="range" data-lid min="0" max="1.2" step="0.05" value="${st.lids}">
      <br>dents <input type="range" data-dent min="0" max="1" step="0.05" value="${st.dent}">
      <br>broken ${Object.entries(PART)
        .map(([k, b]) => `<label><input type="checkbox" data-p="${b}" ${st.parts & b ? "checked" : ""}>${k}</label>`)
        .join(" ")}
      <br><label><input type="checkbox" data-n ${st.night ? "checked" : ""}> night, lamps on</label>
      <br><small>drag: turn round · wheel: nearer</small>`;
    ui.querySelectorAll<HTMLButtonElement>("button[data-v]").forEach((b) => {
      b.onclick = () => {
        st.variant = b.dataset.v ?? st.variant;
        st.wheels = "";
        make();
        draw();
      };
    });
    ui.querySelectorAll<HTMLButtonElement>("button[data-l]").forEach((b) => {
      b.onclick = () => {
        st.level = (b.dataset.l as typeof st.level) ?? "near";
        make();
        draw();
      };
    });
    ui.querySelectorAll<HTMLButtonElement>("button[data-r]").forEach((b) => {
      b.onclick = () => {
        st.role = b.dataset.r ?? "";
        make();
        draw();
      };
    });
    ui.querySelectorAll<HTMLButtonElement>("button[data-w]").forEach((b) => {
      b.onclick = () => {
        st.wheels = b.dataset.w ?? "";
        make();
        draw();
      };
    });
    ui.querySelectorAll<HTMLInputElement>("input[data-x]").forEach((i) => {
      i.onchange = () => {
        const x = i.dataset.x ?? "";
        if (i.checked) st.extras.add(x);
        else st.extras.delete(x);
        make();
      };
    });
    const q = <E extends HTMLElement>(s: string) => ui.querySelector(s) as E;
    q<HTMLInputElement>("[data-c]").oninput = (ev) => {
      st.colour = (ev.target as HTMLInputElement).value;
      make();
    };
    const c2 = () => {
      st.colour2 = q<HTMLInputElement>("[data-c2on]").checked ? q<HTMLInputElement>("[data-c2]").value : "";
      make();
    };
    q<HTMLInputElement>("[data-c2]").oninput = c2;
    q<HTMLInputElement>("[data-c2on]").onchange = c2;
    q<HTMLInputElement>("[data-d]").oninput = (ev) => {
      st.doors = Number((ev.target as HTMLInputElement).value);
      pose();
    };
    q<HTMLInputElement>("[data-lid]").oninput = (ev) => {
      st.lids = Number((ev.target as HTMLInputElement).value);
      pose();
    };
    q<HTMLInputElement>("[data-dent]").oninput = (ev) => {
      st.dent = Number((ev.target as HTMLInputElement).value);
      pose();
    };
    ui.querySelectorAll<HTMLInputElement>("input[data-p]").forEach((b) => {
      b.onchange = () => {
        const bit = Number(b.dataset.p);
        st.parts = b.checked ? st.parts | bit : st.parts & ~bit;
        pose();
      };
    });
    q<HTMLInputElement>("[data-n]").onchange = (ev) => {
      st.night = (ev.target as HTMLInputElement).checked;
      pose();
    };
  };
  const q0 = new URLSearchParams(location.search);
  if (q0.get("v")) st.variant = q0.get("v") ?? st.variant;
  if (q0.get("night") === "1") st.night = true;
  if (q0.get("level")) st.level = (q0.get("level") as typeof st.level) ?? "near";
  if (q0.get("role")) st.role = q0.get("role") ?? "";
  if (q0.get("yaw")) st.yaw = Number(q0.get("yaw"));
  if (q0.get("doors")) st.doors = Number(q0.get("doors"));
  if (q0.get("lids")) st.lids = Number(q0.get("lids"));
  if (q0.get("dist")) st.dist = Number(q0.get("dist"));
  if (q0.get("dent")) st.dent = Number(q0.get("dent"));
  for (const k of (q0.get("broken") ?? "").split(",").filter(Boolean)) st.parts |= PART[k as keyof typeof PART] ?? 0;
  for (const x of (q0.get("x") ?? "").split(",").filter(Boolean)) st.extras.add(x);
  make();
  draw();

  // ── turning round it ──
  let drag: { x: number; y: number } | null = null;
  const cv = renderer.domElement;
  cv.onpointerdown = (e) => {
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    drag = null;
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    st.yaw -= (e.clientX - drag.x) * 0.008;
    st.pitch = Math.max(-0.05, Math.min(1.2, st.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  };
  addEventListener("pointerup", up);
  addEventListener("pointermove", move);
  cv.onwheel = (e) => {
    st.dist = Math.max(1.2, Math.min(30, st.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  };

  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const h = carManifest()?.cars[st.variant]?.dims.height ?? 1.5;
    const target = new T3.Vector3(0, h * 0.45, 0);
    cam.position.set(
      Math.cos(st.yaw) * Math.cos(st.pitch) * st.dist,
      target.y + Math.sin(st.pitch) * st.dist,
      Math.sin(st.yaw) * Math.cos(st.pitch) * st.dist,
    );
    cam.lookAt(target);
    if (car && st.night) car.setBeacon(true, performance.now() / 1000);
    car?.root.updateMatrixWorld();
    light();
    renderer.render(scene, cam);
  };
  frame();
  const onResize = () => {
    const w = el.clientWidth || innerWidth;
    const hh = el.clientHeight || innerHeight;
    renderer.setSize(w, hh);
    cam.aspect = w / hh;
    cam.updateProjectionMatrix();
  };
  addEventListener("resize", onResize);
  (window as unknown as { __sheet?: unknown }).__sheet = {
    st,
    make,
    pose,
    // (the mocks' stills: plan 94 phase 0)
    cam,
    scene,
    renderer,
    sun,
    sky,
    get car() {
      return car;
    },
  };
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointerup", up);
    removeEventListener("pointermove", move);
    removeEventListener("resize", onResize);
    car?.dispose();
    far?.dispose();
    renderer.dispose();
    ui.remove();
    cv.remove();
  };
}
