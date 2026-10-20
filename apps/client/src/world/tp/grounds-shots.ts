import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import { groundAt, LAMPS, WAYS } from "@yutopia/shared/grounds";
import type * as THREE_NS from "three";

// The Grounds' stills — phase 0's mocks (docs/plan/27-the-grounds.md): each
// one a spot on the Grounds at an hour, built by the prototype (grounds3d.ts)
// round it, with the game's own 3D people. /dev/grounds?shot=<name>.

type THREE = typeof THREE_NS;
type Hour = "day" | "overcast" | "dusk" | "night" | "blizzard";
type V3 = [number, number, number];

interface Who {
  x: number;
  z: number;
  /** facing: a point they look towards */
  to: [number, number];
  a: AvatarLayers;
  walk?: number; // a stride's phase (frames walked); none: standing
  light?: boolean; // the phone's flashlight on, in the right hand
  sit?: number; // sitting: the seat's height
  y?: number; // standing on something
}
interface Shot {
  hour: Hour;
  cam: V3;
  look: V3;
  fov?: number;
  iso?: number; // orthographic: half the view's height in tiles
  radius?: number;
  people: Who[];
  snow?: number; // flakes
  prints?: [number, number][]; // footprints along this line
  inside?: "east-block";
}

const DARK = "#2b3138";
const A = (o: Partial<AvatarLayers>): AvatarLayers => ({
  ...DEFAULT_AVATAR,
  shoes: "boots",
  shoesColor: "#3a2c22",
  ...o,
});
const ANA = A({
  top: "jacket",
  topColor: "#6b2430",
  bottom: "jeans",
  hair: "long",
  hairColor: "#3b2a20",
  accessory: "beanie",
  accessoryColor: "#d8d2c4",
  extra: "scarf",
  extraColor: "#e8a33d",
  gender: "feminine",
  skin: "#e4b48e",
});
const BIA = A({
  top: "jacket",
  topColor: "#2f4a3b",
  bottom: "trousers",
  bottomColor: DARK,
  hair: "curly",
  hairColor: "#1c1410",
  skin: "#a8693f",
  gender: "feminine",
  extra: "scarf",
  extraColor: "#b5562f",
});
const CAI = A({
  top: "jacket",
  topColor: "#3d4a5c",
  bottom: "jeans",
  hair: "short",
  hairColor: "#6b4128",
  skin: "#f3d2b3",
  accessory: "beanie",
  accessoryColor: "#2a2420",
  gender: "masculine",
  beard: "stubble",
});
const DUDA = A({
  top: "hoodie",
  topColor: "#8b8f93",
  bottom: "joggers",
  bottomColor: "#2a2e33",
  hair: "bun",
  hairColor: "#a8692f",
  skin: "#c68a5e",
  gender: "feminine",
  extra: "backpack",
  extraColor: "#4a5a73",
});
const GUARD = A({
  top: "blazer",
  topColor: "#20262c",
  bottom: "trousers",
  bottomColor: "#20262c",
  hair: "crew",
  hairColor: "#e8e0d0",
  skin: "#e4b48e",
  gender: "masculine",
  accessory: "cap",
  accessoryColor: "#20262c",
});

/** A point along a way, near `z` (or x), its heading, and a spot behind it. */
function on(key: string, near: [number, number], back = 0, side = 0) {
  const w = WAYS.find((u) => u.key === key);
  if (!w) throw new Error(key);
  let bi = 0;
  let bd = Number.POSITIVE_INFINITY;
  w.line.forEach(([x, z], i) => {
    const d = Math.hypot(x - near[0], z - near[1]);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  const [x, z] = w.line[bi];
  const [x2, z2] = w.line[Math.min(w.line.length - 1, bi + 3)];
  const l = Math.hypot(x2 - x, z2 - z) || 1;
  const tx = (x2 - x) / l;
  const tz = (z2 - z) / l;
  const bx = w.line[Math.max(0, bi - back)][0] - tz * side;
  const bz = w.line[Math.max(0, bi - back)][1] + tx * side;
  return { x, z, tx, tz, bx, bz, ahead: (n: number) => w.line[Math.min(w.line.length - 1, bi + n)] };
}
const gy = (x: number, z: number) => groundAt(x, z);

export function shots(): Record<string, Shot> {
  const lamp = LAMPS.filter((l) => l.kind === "cobra").sort(
    (a, b) => Math.hypot(a.x + 64, a.z + 222) - Math.hypot(b.x + 64, b.z + 222),
  )[0];
  const d = on("driveway", [lamp.x, lamp.z], 16, 1.0);
  const r = on("ravine", [-262.6, -204], 15, 0);
  return {
    "driveway-night": {
      hour: "night",
      cam: [d.bx, gy(d.bx, d.bz) + 2.3, d.bz],
      look: [d.ahead(26)[0], gy(d.x, d.z) + 3.2, d.ahead(26)[1]],
      fov: 52,
      people: [{ x: d.x + 0.6, z: d.z, to: d.ahead(10), a: ANA, walk: 23 }],
      snow: 9000,
    },
    "gatehouse-dusk": {
      hour: "dusk",
      cam: [-46, gy(-46, -334) + 1.9, -334],
      look: [-36, gy(-36, -362) + 2.6, -363],
      fov: 46,
      people: [
        { x: -31.5, z: -364, to: [-40, -364], a: GUARD, y: gy(-31.5, -364) },
        { x: -38.6, z: -352, to: [-35, -364], a: CAI, walk: 11 },
      ],
      snow: 5000,
    },
    "pond-day": {
      hour: "overcast",
      cam: [-198, gy(-198, -36) + 3.4, -36],
      look: [-250, POND_Y() + 2.6, -98],
      fov: 46,
      people: [
        { x: -219, z: -55, to: [-250, -80], a: BIA, walk: 7 },
        { x: -252, z: -86.5, to: [-232, -60], a: DUDA, y: POND_Y() + 0.62 },
      ],
      snow: 1500,
    },
    "woods-flashlight": {
      hour: "night",
      cam: [r.bx, gy(r.bx, r.bz) + 2.7, r.bz],
      look: [r.ahead(30)[0], gy(r.x, r.z) + 0.9, r.ahead(30)[1]],
      fov: 46,
      people: [
        { x: r.x, z: r.z, to: r.ahead(10), a: CAI, walk: 17, light: true },
        { x: r.ahead(56)[0], z: r.ahead(56)[1], to: r.ahead(30), a: DUDA, walk: 5, light: true },
      ],
      snow: 7000,
      prints: [
        [r.x, r.z],
        [r.bx, r.bz],
        [r.ahead(-14)[0], r.ahead(-14)[1]],
      ],
    },
    "courtyard-day": {
      hour: "day",
      cam: [55.5, 1.75, 45],
      look: [53.5, 6.2, 8],
      fov: 52,
      people: [
        { x: 52.5, z: 19.8, to: [60, 18], a: BIA, walk: 9 },
        { x: 58.3, z: 18.4, to: [62, 18], a: CAI, walk: 21 },
        { x: 55.6, z: 30, to: [55, 40], a: ANA, walk: 3 },
      ],
      snow: 1200,
    },
    "block-inside": {
      hour: "overcast",
      cam: [82, 1.6, 30.2],
      look: [60, 1.4, 27.6],
      fov: 58,
      inside: "east-block",
      people: [{ x: 61.3, z: 28.6, to: [55, 28.2], a: DUDA }],
      snow: 0,
    },
    "town-dusk": {
      hour: "dusk",
      cam: [362, gy(362, -406.5) + 2.3, -406.5],
      look: [440, gy(440, -402) + 3.2, -400.5],
      fov: 52,
      people: [
        { x: 386, z: -399.6, to: [400, -399], a: BIA, walk: 13 },
        { x: 452, z: -399.8, to: [455, -397], a: CAI },
        { x: 410, z: -411.7, to: [380, -412], a: ANA, walk: 4 },
        { x: 420, z: -392, to: [420, -386], a: DUDA },
      ],
      snow: 6000,
    },
    "blizzard-lawn": {
      hour: "blizzard",
      cam: [-4, gy(-4, -52) + 2.2, -52],
      look: [-32, 14, -96],
      fov: 50,
      people: [{ x: -11.5, z: -62, to: [-30, -95], a: ANA, walk: 15 }],
      snow: 40000,
      prints: [
        [-11.5, -62],
        [-6, -50],
        [-2, -36],
      ],
    },
    "clearing-night": {
      hour: "night",
      cam: [121.5, gy(121.5, -237.5) + 1.9, -237.5],
      look: [120, gy(120, -250) + 1.7, -251],
      fov: 44,
      people: [{ x: 120.35, z: -249.72, to: [120.35, -240], a: GUARD, sit: 0.56 }],
      snow: 5000,
    },
    "iso-lot-edge": {
      hour: "day",
      cam: [0, 0, 0],
      look: [-104, 0, 8],
      iso: 28,
      people: [
        { x: -103, z: 13.2, to: [-130, 5], a: ANA, walk: 9 },
        { x: -66, z: 18.4, to: [-90, 15], a: DUDA, walk: 4 },
        { x: -48, z: 26.5, to: [-60, 22], a: CAI, walk: 19 },
        { x: -40, z: 6.3, to: [-35, 6.3], a: BIA },
      ],
      snow: 0,
    },
  };
}
// the pond's ice (from the shared Grounds, read late: the module is lazy)
let pondY = 0;
const POND_Y = () => pondY;

interface Preset {
  top: string;
  horizon: string;
  fog: string;
  density: number;
  hemi: [string, string, number];
  sun: [string, number, V3];
  night: number;
  bloom: [number, number, number]; // strength, radius, threshold
  exposure: number;
  tint: number; // people's unlit share
}
const PRESETS: Record<Hour, Preset> = {
  day: {
    top: "#8f9ca8",
    horizon: "#d5dbe0",
    fog: "#cfd6dc",
    density: 0.0045,
    hemi: ["#e8edf2", "#8d97a1", 1.5],
    sun: ["#fff4e6", 1.7, [-0.45, 0.42, 0.78]],
    night: 0,
    bloom: [0.15, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
  overcast: {
    top: "#9aa5af",
    horizon: "#d2d8dd",
    fog: "#c8d0d6",
    density: 0.0062,
    hemi: ["#e4e9ee", "#8a949e", 1.75],
    sun: ["#f2f2f2", 0.55, [-0.3, 0.6, 0.7]],
    night: 0,
    bloom: [0.12, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
  dusk: {
    top: "#1d2738",
    horizon: "#7c7480",
    fog: "#525b69",
    density: 0.0075,
    hemi: ["#7d8aa3", "#2f343c", 0.62],
    sun: ["#ffb98a", 0.28, [-0.9, 0.12, 0.2]],
    night: 0.85,
    bloom: [0.75, 0.55, 0.62],
    exposure: 1.05,
    tint: 0.5,
  },
  night: {
    top: "#04070c",
    horizon: "#141c27",
    fog: "#111924",
    density: 0.0115,
    hemi: ["#33405a", "#05070a", 0.16],
    sun: ["#a9bddc", 0.07, [0.3, 0.7, -0.5]],
    night: 1,
    bloom: [0.95, 0.6, 0.5],
    exposure: 1.1,
    tint: 0.12,
  },
  blizzard: {
    top: "#b6bec6",
    horizon: "#cbd2d8",
    fog: "#c5ccd2",
    density: 0.026,
    hemi: ["#e4e9ee", "#9aa3ab", 1.6],
    sun: ["#f2f2f2", 0.25, [-0.3, 0.6, 0.7]],
    night: 0,
    bloom: [0.12, 0.4, 0.95],
    exposure: 1.0,
    tint: 1,
  },
};

export async function runShot(
  el: HTMLElement,
  name: string,
  W: number,
  H: number,
  status: (s: string) => void,
): Promise<() => void> {
  const T3: THREE = await import("three");
  const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
  const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
  const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
  const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
  const { ShaderPass } = await import("three/addons/postprocessing/ShaderPass.js");
  const S = await import("@yutopia/shared/grounds");
  pondY = S.POND_LEVEL;
  const { Grounds3 } = await import("./grounds3d");
  const Themes = await import("../art/themes");
  const C = await import("../chars");
  const all = shots();
  const base = all[name];
  if (!base) {
    status(`no shot "${name}": ${Object.keys(all).join(", ")}`);
    return () => {};
  }
  // overrides while looking: &snow=0 &hour=night &people=0
  const q = new URLSearchParams(location.search);
  const shot: Shot = {
    ...base,
    snow: q.has("snow") ? Number(q.get("snow")) : base.snow,
    hour: (q.get("hour") as Hour) ?? base.hour,
    people: q.get("people") === "0" ? [] : base.people,
  };
  const P = PRESETS[shot.hour];
  const t0 = performance.now();

  const renderer = new T3.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.outputColorSpace = T3.SRGBColorSpace;
  renderer.toneMapping = T3.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  C.inkResolution(W, H);

  const scene = new T3.Scene();
  scene.fog = new T3.FogExp2(P.fog, shot.iso !== undefined ? P.density * 0.12 : P.density);
  scene.background = new T3.Color(P.horizon);
  // the sky: a gradient dome (overcast: no sun disc; night: a faint glow low down)
  const dome = new T3.Mesh(
    new T3.SphereGeometry(2600, 32, 16),
    new T3.ShaderMaterial({
      side: T3.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new T3.Color(P.top) }, hor: { value: new T3.Color(P.horizon) } },
      vertexShader:
        "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 hor; varying vec3 p; void main(){ float k = smoothstep(-0.02, 0.45, p.y); gl_FragColor = vec4(mix(hor, top, k), 1.0); }",
    }),
  );
  dome.renderOrder = -2;
  scene.add(dome);

  // ── the Grounds round the shot ──
  const ortho = shot.iso !== undefined;
  const tx = shot.look[0];
  const tz = shot.look[2];
  const mid = ortho ? { x: tx, z: tz } : { x: (shot.cam[0] * 2 + tx) / 3, z: (shot.cam[2] * 2 + tz) / 3 };
  const grounds = new Grounds3(Themes, {
    cx: mid.x,
    cz: mid.z,
    radius: shot.radius ?? (ortho ? 120 : 380),
    near: ortho ? 120 : 130,
    clear: ortho ? [] : [{ x: shot.cam[0], z: shot.cam[2], r: 5.5 }],
  });
  scene.add(grounds.root);
  grounds.setNight(P.night);
  // the far ridges take the horizon's colour, a little darker
  {
    const hz = new T3.Color(P.horizon);
    const fg = new T3.Color(P.fog);
    grounds.ridgeMat.color.copy(
      hz
        .clone()
        .lerp(fg, 0.5)
        .multiplyScalar(shot.hour === "night" ? 0.7 : 0.86),
    );
    if (shot.hour === "blizzard") grounds.ridgeMat.visible = false;
  }

  // ── light ──
  scene.add(new T3.HemisphereLight(P.hemi[0], P.hemi[1], P.hemi[2]));
  const sun = new T3.DirectionalLight(P.sun[0], P.sun[1]);
  const sd = new T3.Vector3(...P.sun[2]).normalize();
  const focus = ortho ? new T3.Vector3(tx, 0, tz) : new T3.Vector3(mid.x, shot.cam[1], mid.z);
  sun.position.copy(focus).addScaledVector(sd, 200);
  sun.target.position.copy(focus);
  sun.castShadow = P.sun[1] > 0.2;
  sun.shadow.mapSize.set(2048, 2048);
  const sr = ortho ? 50 : 90;
  Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 10, far: 500 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  // overcast: soft shadows; clear: full
  sun.shadow.intensity = shot.hour === "overcast" ? 0.35 : shot.hour === "day" ? 0.8 : 0.6;
  scene.add(sun, sun.target);

  // the nearest lamps lit for real (the rest: their heads, glows and pools)
  const camV = new T3.Vector3(...shot.cam);
  if (P.night > 0) {
    const near = [...grounds.lights].sort((a, b) => a.p.distanceTo(camV) - b.p.distanceTo(camV)).slice(0, 12);
    for (const l of near) {
      if (l.kind === "cobra") {
        const s = new T3.SpotLight(l.color, 55 * P.night, 30, 0.95, 0.8, 1.5);
        s.position.copy(l.p);
        s.target.position.set(l.p.x, l.p.y - 9, l.p.z);
        scene.add(s, s.target);
      } else {
        const p = new T3.PointLight(
          l.color,
          (l.kind === "porch" ? 10 : l.kind === "gate" ? 18 : 22) * P.night,
          l.r * 3,
          1.7,
        );
        p.position.copy(l.p);
        scene.add(p);
      }
    }
  }

  // ── the inside of the east block (its blank ground floor) ──
  if (shot.inside === "east-block") inside(T3, scene, grounds);

  // ── the people ──
  const f = new C.CharFactory();
  const bodyMat = new T3.MeshLambertMaterial({ vertexColors: true, emissive: "#10141b" });
  const flatMat = new T3.MeshBasicMaterial({ vertexColors: true, color: new T3.Color(P.tint, P.tint, P.tint) });
  const lit = shot.hour === "night" || shot.hour === "dusk";
  const people = shot.people.map((w) => {
    const m = new C.PersonModel(f, w.a, 0, { body: lit ? bodyMat : flatMat, ink: C.inkMaterial() });
    const y = w.y ?? groundAt(w.x, w.z);
    m.root.position.set(w.x, y, w.z);
    m.root.rotation.y = Math.atan2(w.to[0] - w.x, w.to[1] - w.z);
    scene.add(m.root);
    return { w, m, mo: new C.Motion3(0.3) };
  });
  // flashlights: a spot from the hand, its beam in the air
  const beams: { s: THREE_NS.SpotLight; cone: THREE_NS.Mesh; who: (typeof people)[number] }[] = [];
  for (const p of people) {
    if (!p.w.light) continue;
    const s = new T3.SpotLight("#fff1dc", 260, 90, 0.26, 0.55, 1.2);
    s.castShadow = false; // (the walker's own body would split the beam)
    scene.add(s, s.target);
    const L = 24;
    const geo = new T3.ConeGeometry(Math.tan(0.22) * L, L, 32, 1, true).translate(0, -L / 2, 0).rotateX(-Math.PI / 2);
    const cone = new T3.Mesh(
      geo,
      new T3.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T3.AdditiveBlending,
        side: T3.DoubleSide,
        uniforms: { len: { value: L } },
        vertexShader:
          "varying float d; varying vec3 n; varying vec3 v; void main(){ d = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); v = normalize(-mv.xyz); n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }",
        fragmentShader:
          "uniform float len; varying float d; varying vec3 n; varying vec3 v; void main(){ float k = 1.0 - smoothstep(0.0, len, d); float edge = pow(abs(dot(n, v)), 1.4); gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * 0.12 * k * edge, 1.0); }",
      }),
    );
    scene.add(cone);
    beams.push({ s, cone, who: p });
  }
  const phones = people
    .filter((p) => p.w.light)
    .map((p) => {
      const prop = C.buildProp("phone", "#2a2e33", (c: string) => new T3.MeshLambertMaterial({ color: c }));
      C.inHand(prop.root, "phone");
      return { p, prop };
    });

  // ── snow falling, footprints ──
  if (shot.snow) {
    const n = shot.snow;
    const box = shot.hour === "blizzard" ? 46 : 60;
    const pos = new Float32Array(n * 3);
    const rr = S.groundsRng(55);
    const fwd = new T3.Vector3(...shot.look).sub(camV).normalize();
    for (let i = 0; i < n; i++) {
      const k = rr();
      // more flakes ahead of the camera than behind it
      const along = k * k * box;
      pos[i * 3] = camV.x + fwd.x * along + (rr() - 0.5) * box;
      pos[i * 3 + 1] = camV.y - 3 + rr() * 22;
      pos[i * 3 + 2] = camV.z + fwd.z * along + (rr() - 0.5) * box;
    }
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.BufferAttribute(pos, 3));
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const cg = cv.getContext("2d") as CanvasRenderingContext2D;
    const grd = cg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    cg.fillStyle = grd;
    cg.fillRect(0, 0, 32, 32);
    const flakeTex = new T3.CanvasTexture(cv);
    const night = shot.hour === "night";
    const pts = new T3.Points(
      g,
      new T3.PointsMaterial({
        size: shot.hour === "blizzard" ? 0.16 : 0.11,
        map: flakeTex,
        transparent: true,
        depthWrite: false,
        color: night ? "#c9d4e4" : "#ffffff",
        opacity: night ? 0.75 : 0.9,
        fog: true,
      }),
    );
    scene.add(pts);
    if (shot.hour === "blizzard") {
      // streaks: snow driven sideways
      const m = 9000;
      const lp = new Float32Array(m * 6);
      for (let i = 0; i < m; i++) {
        const x = camV.x + (rr() - 0.5) * 50 + fwd.x * rr() * 30;
        const y = camV.y - 2 + rr() * 14;
        const z = camV.z + (rr() - 0.5) * 50 + fwd.z * rr() * 30;
        lp.set([x, y, z, x + 0.9, y - 0.25, z + 0.35], i * 6);
      }
      const lg = new T3.BufferGeometry();
      lg.setAttribute("position", new T3.BufferAttribute(lp, 3));
      scene.add(
        new T3.LineSegments(lg, new T3.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 })),
      );
    }
  }
  if (shot.prints) {
    const g = new T3.BufferGeometry();
    const pos: number[] = [];
    const line = shot.prints;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (let t = 0.6; t < len; t += 0.42) {
        const s = Math.round(t / 0.42) % 2 ? 1 : -1;
        const x = ax + ux * t - uz * s * 0.13;
        const z = az + uz * t + ux * s * 0.13;
        const y = groundAt(x, z) + 0.05;
        const a = 0.09;
        const b = 0.15;
        const P2 = (p: number, q: number) => [x + ux * q - uz * p, y, z + uz * q + ux * p];
        pos.push(...P2(-a, -b), ...P2(a, b), ...P2(a, -b), ...P2(-a, -b), ...P2(-a, b), ...P2(a, b));
      }
    }
    g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    const fm = new T3.MeshBasicMaterial({
      color: shot.hour === "night" ? "#2d3a4f" : "#8494a8",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const pm = new T3.Mesh(g, fm);
    pm.renderOrder = 1;
    scene.add(pm);
  }

  // ── the camera ──
  let cam: THREE_NS.Camera;
  if (ortho) {
    const k = shot.iso ?? 20;
    const o = new T3.OrthographicCamera((-k * W) / H, (k * W) / H, k, -k, 1, 900);
    // the iso view's angle: from the south-east, 30° down
    const yaw = Math.PI * 0.25;
    const pitch = Math.PI / 6;
    const tgt = new T3.Vector3(tx, groundAt(tx, tz), tz);
    o.position.set(
      tgt.x + Math.cos(yaw) * 300 * Math.cos(pitch),
      tgt.y + 300 * Math.sin(pitch),
      tgt.z + Math.sin(yaw) * 300 * Math.cos(pitch),
    );
    o.lookAt(tgt);
    cam = o;
  } else {
    const p = new T3.PerspectiveCamera(shot.fov ?? 50, W / H, 0.1, 5000);
    p.position.copy(camV);
    p.lookAt(new T3.Vector3(...shot.look));
    cam = p;
  }
  scene.add(cam);
  grounds.faceCards(cam.position);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  // (a stray NaN in a pixel — a degenerate normal somewhere — would be smeared
  // over the whole frame by the bloom's blur: cleared first)
  composer.addPass(
    new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(48.0)); }",
    }),
  );
  composer.addPass(new UnrealBloomPass(new T3.Vector2(W, H), P.bloom[0], P.bloom[1], P.bloom[2]));
  composer.addPass(new OutputPass());
  (window as unknown as { __g?: unknown }).__g = { scene, cam, grounds, renderer, composer };
  status(`${name}: built in ${Math.round(performance.now() - t0)} ms`);

  // ── draw once the people are in ──
  let raf = 0;
  let frames = 0;
  const v = new T3.Vector3();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    f.pump(12);
    let ready = 0;
    for (const p of people) if (p.m.update()) ready++;
    if (ready < people.length) return;
    for (const p of people) {
      const walking = p.w.walk !== undefined;
      let mo = p.mo.update(1 / 60, {
        dist: 0,
        walking: false,
        speed: 0,
        sit: false,
        typing: false,
        speaking: false,
        emote: "",
        reduced: false,
      });
      // (settled first: a figure's first pose isn't one)
      const sit = p.w.sit !== undefined;
      if (!walking)
        for (let i = 0; i < 90; i++)
          mo = p.mo.update(1 / 60, {
            dist: 0,
            walking: false,
            speed: 0,
            sit,
            typing: false,
            speaking: false,
            emote: "",
            reduced: false,
          });
      if (walking)
        for (let i = 0; i <= (p.w.walk ?? 0); i++)
          mo = p.mo.update(1 / 60, {
            dist: 4.2 / 60,
            walking: true,
            speed: 4.2,
            sit: false,
            typing: false,
            speaking: false,
            emote: "",
            reduced: false,
          });
      const pose = { ...mo.pose };
      if (p.w.light) {
        // the phone held out ahead, low, lighting the way
        pose.shoulderR = [-1.05, 0, 0.12];
        pose.elbowR = [-0.4, 0, 0];
        pose.wristR = [0.25, 0, 0];
      }
      const drop = sit ? p.m.sitDrop(p.w.sit ?? 0.5) * mo.settle : 0;
      p.m.setPose(pose, [mo.lift[0], mo.lift[1] + drop, mo.lift[2]], mo.reach);
      p.m.setFace(1, 0);
    }
    for (const ph of phones) {
      const hand = ph.p.m.bone("wristR");
      if (hand && !ph.prop.root.parent) hand.add(ph.prop.root);
    }
    for (const b of beams) {
      const m = b.who.m;
      m.root.updateMatrixWorld(true);
      const hand = m.bone("wristR");
      if (hand) hand.getWorldPosition(v);
      else v.copy(m.root.position).add(new T3.Vector3(0, 1.2, 0));
      const dir = new T3.Vector3(Math.sin(m.root.rotation.y), -0.05, Math.cos(m.root.rotation.y)).normalize();
      b.s.position.copy(v).addScaledVector(dir, 0.3);
      b.s.target.position.copy(v).addScaledVector(dir, 20);
      b.cone.position.copy(b.s.position);
      b.cone.lookAt(b.s.target.position);
    }
    composer.render();
    if (++frames === 4) {
      (window as unknown as { __shot?: boolean }).__shot = true;
      status(
        `${name}: drawn in ${Math.round(performance.now() - t0)} ms · ${renderer.info.render.triangles} tris · ${renderer.info.render.calls} calls`,
      );
      cancelAnimationFrame(raf);
    }
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    grounds.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// The east block's ground floor, blank: polished concrete, columns, the
// curtain wall from inside, a ceiling of fluorescent panels, the core with its
// lifts shut and the stairs' door marked restricted, one chair left behind.
function inside(T3: THREE, scene: THREE_NS.Scene, _g: unknown) {
  const x0 = 60;
  const x1 = 88;
  const z0 = -30;
  const z1 = 48;
  const H = 3.25;
  const grp = new T3.Group();
  const conc = new T3.MeshStandardMaterial({ color: "#a9a69f", roughness: 0.35, metalness: 0 });
  const floor = new T3.Mesh(new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), conc);
  floor.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  floor.receiveShadow = true;
  grp.add(floor);
  const ceil = new T3.Mesh(
    new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2),
    new T3.MeshLambertMaterial({ color: "#d9d8d3" }),
  );
  ceil.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
  grp.add(ceil);
  // the fluorescent panels, in a grid, a few dead
  const panel = new T3.MeshBasicMaterial({ color: "#eef4ff", toneMapped: false });
  const dead = new T3.MeshLambertMaterial({ color: "#bfc2c4" });
  let i = 0;
  for (let x = x0 + 3; x < x1 - 1; x += 4)
    for (let z = z0 + 3; z < z1 - 1; z += 4) {
      const m = new T3.Mesh(new T3.PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2), ++i % 11 === 4 ? dead : panel);
      m.position.set(x, H - 0.01, z);
      grp.add(m);
    }
  for (const [x, z] of [
    [66, 14],
    [76, 22],
    [70, 30],
    [80, 8],
    [66, 2],
  ]) {
    const l = new T3.PointLight("#e6eeff", 5, 16, 1.2);
    l.position.set(x, H - 1.1, z);
    grp.add(l);
  }
  // columns
  const colMat = new T3.MeshLambertMaterial({ color: "#c9c6bf" });
  for (let x = x0 + 8; x < x1; x += 8)
    for (let z = z0 + 8; z < z1; z += 8) {
      const c = new T3.Mesh(new T3.BoxGeometry(0.6, H, 0.6), colMat);
      c.position.set(x, H / 2, z);
      c.castShadow = true;
      grp.add(c);
    }
  // the curtain wall from inside (the west wall: mullions, transom, a band over)
  const dark = new T3.MeshLambertMaterial({ color: "#1f262c" });
  const band = new T3.MeshLambertMaterial({ color: "#c9c5bb" });
  for (const [ax, az, bx, bz] of [
    [x0, z0, x0, z1],
    [x0, z1, x1, z1],
  ]) {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let t = 0; t <= len; t += 2) {
      const m = new T3.Mesh(new T3.BoxGeometry(0.1, 2.65, 0.1), dark);
      m.position.set(ax + ux * t - uz * 0.15, 1.33, az + uz * t + ux * 0.15);
      grp.add(m);
    }
    const tr = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, 0.07, Math.abs(bz - az) + 0.1), dark);
    tr.position.set((ax + bx) / 2 - uz * 0.15, 0.95, (az + bz) / 2 + ux * 0.15);
    grp.add(tr);
    const bd = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, H - 2.65, Math.abs(bz - az) + 0.1), band);
    bd.position.set((ax + bx) / 2 - uz * 0.15, 2.65 + (H - 2.65) / 2, (az + bz) / 2 + ux * 0.15);
    grp.add(bd);
    const sill = new T3.Mesh(new T3.BoxGeometry(Math.abs(bx - ax) + 0.1, 0.1, Math.abs(bz - az) + 0.1), dark);
    sill.position.set((ax + bx) / 2 - uz * 0.15, 0.05, (az + bz) / 2 + ux * 0.15);
    grp.add(sill);
  }
  // the glass itself (a faint tint and reflection)
  const glass = new T3.MeshStandardMaterial({
    color: "#9fb3c2",
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    metalness: 0.2,
    side: T3.DoubleSide,
  });
  const gw = new T3.Mesh(new T3.PlaneGeometry(z1 - z0, 2.65).rotateY(Math.PI / 2), glass);
  gw.position.set(x0 + 0.13, 1.33, (z0 + z1) / 2);
  grp.add(gw);
  // the inner walls: east and north plaster (the other faces, beyond the view, closed)
  const plaster = new T3.MeshLambertMaterial({ color: "#e6e3dc" });
  const east = new T3.Mesh(new T3.PlaneGeometry(z1 - z0, H).rotateY(-Math.PI / 2), plaster);
  east.position.set(x1 - 0.1, H / 2, (z0 + z1) / 2);
  grp.add(east);
  const north = new T3.Mesh(new T3.PlaneGeometry(x1 - x0, H), plaster);
  north.position.set((x0 + x1) / 2, H / 2, z0 + 0.1);
  grp.add(north);
  // the core: two lift doors shut, the stairs' door — restricted
  const core = new T3.Mesh(new T3.BoxGeometry(8, H, 7), plaster);
  core.position.set(78, H / 2, 6);
  grp.add(core);
  const steel = new T3.MeshStandardMaterial({ color: "#b8bcc0", roughness: 0.3, metalness: 0.85 });
  for (const z of [3.6, 6.4]) {
    const d = new T3.Mesh(new T3.BoxGeometry(0.06, 2.3, 1.9), steel);
    d.position.set(73.97, 1.15, z);
    grp.add(d);
  }
  const fd = new T3.Mesh(new T3.BoxGeometry(0.08, 2.2, 1.1), new T3.MeshLambertMaterial({ color: "#6b2a24" }));
  fd.position.set(73.96, 1.1, 8.6);
  grp.add(fd);
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 96;
  const cg = cv.getContext("2d") as CanvasRenderingContext2D;
  cg.fillStyle = "#efe9dc";
  cg.fillRect(0, 0, 256, 96);
  cg.fillStyle = "#8b2a22";
  cg.font = "700 34px Inter, Helvetica, sans-serif";
  cg.textAlign = "center";
  cg.fillText("RESTRICTED", 128, 44);
  cg.font = "500 20px Inter, Helvetica, sans-serif";
  cg.fillText("NO ACCESS BEYOND THIS DOOR", 128, 76);
  const st = new T3.CanvasTexture(cv);
  st.colorSpace = T3.SRGBColorSpace;
  const sign = new T3.Mesh(
    new T3.PlaneGeometry(0.75, 0.28).rotateY(-Math.PI / 2),
    new T3.MeshLambertMaterial({ map: st }),
  );
  sign.position.set(73.9, 1.6, 8.6);
  grp.add(sign);
  // one office chair, left behind, turned to the window
  const chair = new T3.Group();
  const cm = new T3.MeshLambertMaterial({ color: "#2c3036" });
  const seat = new T3.Mesh(new T3.BoxGeometry(0.55, 0.08, 0.55), cm);
  seat.position.y = 0.48;
  const back = new T3.Mesh(new T3.BoxGeometry(0.5, 0.6, 0.06), cm);
  back.position.set(0, 0.85, 0.26);
  const post = new T3.Mesh(new T3.CylinderGeometry(0.03, 0.03, 0.42), cm);
  post.position.y = 0.24;
  const base = new T3.Mesh(new T3.CylinderGeometry(0.3, 0.3, 0.04, 5), cm);
  base.position.y = 0.04;
  chair.add(seat, back, post, base);
  chair.position.set(66.5, 0, 31.4);
  chair.rotation.y = 2.1;
  for (const m of chair.children) m.castShadow = true;
  grp.add(chair);
  scene.add(grp);
}
