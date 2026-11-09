import { entry, quarterYaw, TEXT_FACE } from "@yutopia/shared";
import {
  ACESFilmicToneMapping,
  BackSide,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  WebGLRenderer,
} from "three";
import { litMaterial, ownSky } from "../look/lit";
import { kitMaterial } from "../tp/kit-mats";
import { Out } from "../tp/kit3d";
import { Post3 } from "../tp/post3d";
import { LOOKS as DESK2_LOOKS } from "./fam/desktop2";
import { isLifeKit, toon } from "./kit";
import { KIT_MATS } from "./life-mats";
import { animateLive, liveGroup } from "./liveparts";
import { isNative, LOOK_NAMES, liveInto, modelOf, nativeInto, wordsOf } from "./native";
import { drawFlaps, drawTicker, FLAPS_PX, TICKER_PX } from "./words";

// The Furnish panel's pictures, from the models the world draws (docs/plan/67-the-furniture.md,
// phase 9): one offscreen renderer for them all, lazily made — the cel as the people's, the post's
// ink and grain as in the world, on nothing. A picture's made once a kind, look and paint and kept
// for the session (as data URLs); the held piece's turntable draws into its own 2D canvas each frame
// through the same renderer. (Every kind is the kit's: plan 72 phase 12.)

let r: {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  post: Post3;
  size: [number, number];
  /** (the life look) its own sky in the materials: the game's is the game's renderer's */
  sky: Texture | null;
} | null = null;
const mat = toon();
const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const glassMat = litMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false });
const urls = new Map<string, string>();

function rig(w: number, h: number) {
  if (!r) {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    // (the life look: its curve, Khronos PBR Neutral, and no ink — plan 73 phase 10)
    renderer.toneMapping = isLifeKit() ? NeutralToneMapping : ACESFilmicToneMapping;
    const scene = new Scene();
    scene.add(new HemisphereLight("#f6f2ea", "#8a7a66", 1.6));
    const key = new DirectionalLight("#fff3e0", 2.2);
    key.position.set(3, 6, 5);
    scene.add(key);
    const camera = new PerspectiveCamera(24, 1, 0.05, 80);
    const post = new Post3(renderer, scene, camera, true);
    post.setNight(0);
    r = { renderer, scene, camera, post, size: [0, 0], sky: isLifeKit() ? skyOf(renderer) : null };
  }
  if (r.size[0] !== w || r.size[1] !== h) {
    r.renderer.setSize(w, h, false);
    r.post.setSize(w, h, 1);
    r.camera.aspect = w / h;
    r.camera.updateProjectionMatrix();
    r.size = [w, h];
  }
  return r;
}

/** Does the kit draw this kind (so it has a picture from its model)? */
export const drawsKind = (kind: string): boolean => isNative(kind);

/** The desk things drawn facing whoever sits at them (from their side, in their pictures). */
const SITTER = new Set(["tabletop", "computer", "radio", "turntable", ...Object.keys(DESK2_LOOKS)]);

/** A kind's looks, by name (its variants), or none. */
export const looksOf = (kind: string): readonly string[] => LOOK_NAMES[kind] ?? [];

/** A board's words on its face (the ticker's from their start, the flaps settled), or none. */
function wordsMesh(kind: string, props: Record<string, unknown>): Mesh<PlaneGeometry, MeshBasicMaterial> | null {
  const face = TEXT_FACE[kind as keyof typeof TEXT_FACE];
  if (!face) return null;
  const c = document.createElement("canvas");
  const ticker = kind === "vfd_ticker";
  [c.width, c.height] = ticker ? TICKER_PX : FLAPS_PX;
  const text = wordsOf({ id: "catalog", kind, x: 0, y: 0, props });
  if (ticker) drawTicker(c, text, (c.width - 24) / 90);
  else drawFlaps(c, text, 99, "catalog");
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  const words = new Mesh(
    new PlaneGeometry(face.x1 - face.x0, face.y1 - face.y0),
    new MeshBasicMaterial({ map, toneMapped: false }),
  );
  words.position.set((face.x0 + face.x1) / 2, (face.y0 + face.y1) / 2, face.z + 0.002);
  return words;
}
const dropWords = (words: Mesh<PlaneGeometry, MeshBasicMaterial> | null) => {
  if (!words) return;
  words.geometry.dispose();
  words.material.map?.dispose();
  words.material.dispose();
};

/** Render a placed-to-be thing (`props`: its look, paint, what it is) turned `turn` rad, framed to
 *  fit, into the shared renderer's canvas. */
function render(kind: string, props: Record<string, unknown>, w: number, h: number, turn: number) {
  if (isLifeKit()) return renderLife(kind, props, w, h, turn);
  const g = rig(w, h);
  const geo = modelOf({ id: "catalog", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { _thumb: true, ...props } });
  const mesh = new Mesh(geo, mat);
  const glow = geo.userData.glow;
  if (glow) mesh.add(new Mesh(glow, glowMat));
  // (its glass: a window's panes, a door's)
  const clear = geo.userData.clear;
  if (clear) mesh.add(new Mesh(clear, glassMat));
  // (its live parts at a moment: the lava's blobs mid-rise, the flames)
  const live = liveGroup(geo, mat, glowMat, glassMat);
  if (live) {
    animateLive(live, 3.2);
    mesh.add(live);
  }
  // (a board's words on its face: the ticker's from their start, the flaps settled)
  const words = wordsMesh(kind, props);
  if (words) mesh.add(words);
  geo.computeBoundingBox();
  const bb = geo.boundingBox as Box3;
  mesh.position.set(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  g.scene.add(mesh);
  const sphere = new Box3().setFromObject(mesh).getBoundingSphere(new Sphere());
  // (a wall thing seen more from in front; the rest a little from above, as the world sees them)
  const tilt = entry(kind).wall ? 0.18 : 0.42;
  const fit = Math.min(1, w / h);
  const dist = (sphere.radius * 1.08) / Math.sin((12 * Math.PI) / 180) / fit;
  g.camera.position.set(
    sphere.center.x + Math.sin(turn) * Math.cos(tilt) * dist,
    sphere.center.y + Math.sin(tilt) * dist,
    sphere.center.z + Math.cos(turn) * Math.cos(tilt) * dist,
  );
  g.camera.lookAt(sphere.center);
  g.post.render(false);
  g.scene.remove(mesh);
  dropWords(words);
  return g.renderer.domElement;
}

// ── the life look's (plan 73 phase 10): the kit's things in their materials, as the world draws them ──

/** A sky for the pictures' renderer: a soft gradient, its light in the materials' sheen. */
function skyOf(renderer: WebGLRenderer): Texture {
  const pm = new PMREMGenerator(renderer);
  const sky = new Scene();
  sky.add(
    new Mesh(
      new SphereGeometry(10, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        uniforms: {
          top: { value: new Color(0xc0d4f0).multiplyScalar(0.7) },
          ground: { value: new Color(0x7a6048).multiplyScalar(0.5) },
        },
        vertexShader:
          "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 ground; varying vec3 vD; void main() { gl_FragColor = vec4(mix(ground, top, smoothstep(-0.2, 0.4, vD.y)), 1.0); }",
      }),
    ),
  );
  const t = pm.fromScene(sky, 0.02).texture;
  pm.dispose();
  return t;
}
/** The pictures' materials: one of each of the kit's, their sky their own. */
const lifeMats = new Map<string, Material>();
function lifeMat(name: string): Material {
  let m = lifeMats.get(name);
  if (!m) {
    m = name === "lit" ? litMaterial({ vertexColors: true }) : kitMaterial(name);
    if (m instanceof MeshStandardMaterial) ownSky(m, r?.sky ?? null, 0.7);
    lifeMats.set(name, m);
  }
  return m;
}
/** Ready to draw in the life look: every kit material's textures in (a picture's kept for the session —
 *  drawn before, it'd keep the library's flat stand-ins), or 8 s, whichever's first. */
let readyP: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (!isLifeKit()) return Promise.resolve();
  readyP ??= (async () => {
    rig(160, 160);
    const loads = KIT_MATS.map((n) => lifeMat(n).userData.loaded as Promise<unknown> | undefined).filter(Boolean);
    await Promise.race([Promise.all(loads), new Promise((res) => setTimeout(res, 8000))]);
  })();
  return readyP;
}
const meshOf = (g: { pos: number[]; nor: number[]; col: number[]; uv: number[]; empty: boolean }, m: Material) => {
  if (g.empty) return null;
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(g.pos, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(g.nor, 3));
  geo.setAttribute("color", new Float32BufferAttribute(g.col, 4));
  if (g.uv.length) geo.setAttribute("uv", new Float32BufferAttribute(g.uv, 2));
  return new Mesh(geo, m);
};
function renderLife(kind: string, props: Record<string, unknown>, w: number, h: number, turn: number) {
  const g = rig(w, h);
  const def = { id: "catalog", kind, x: 0, y: 0, yaw: quarterYaw(0), props: { _thumb: true, ...props } };
  const out = new Out(true);
  nativeInto(out, def);
  const group = new Group();
  const add = (m: Mesh | null) => {
    if (m) group.add(m);
  };
  add(meshOf(out.lit, lifeMat("lit")));
  for (const [name, b] of out.mats) add(meshOf(b, lifeMat(name)));
  add(meshOf(out.glow, glowMat));
  add(meshOf(out.clear, glassMat));
  const words = wordsMesh(kind, props);
  if (words) group.add(words);
  const live = liveInto(def, lifeMat("lit"), glowMat, glassMat);
  if (live) {
    animateLive(live, 3.2);
    group.add(live);
  }
  const bb = new Box3().setFromObject(group);
  group.position.set(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  g.scene.add(group);
  const sphere = new Box3().setFromObject(group).getBoundingSphere(new Sphere());
  const tilt = entry(kind).wall ? 0.18 : 0.42;
  const fit = Math.min(1, w / h);
  const dist = (sphere.radius * 1.08) / Math.sin((12 * Math.PI) / 180) / fit;
  g.camera.position.set(
    sphere.center.x + Math.sin(turn) * Math.cos(tilt) * dist,
    sphere.center.y + Math.sin(tilt) * dist,
    sphere.center.z + Math.cos(turn) * Math.cos(tilt) * dist,
  );
  g.camera.lookAt(sphere.center);
  g.renderer.render(g.scene, g.camera);
  g.scene.remove(group);
  if (words) group.remove(words);
  dropWords(words);
  group.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose();
  });
  return g.renderer.domElement;
}

/** The catalog's picture of a kind (its look, paint…), a data URL; null when the kit doesn't draw
 *  it. Turned a little to show its side (a sitter-facing desk thing from its front). */
export function pictureOf(kind: string, props: Record<string, unknown> = {}, size = 160): string | null {
  if (!isNative(kind)) return null;
  const key = `${kind}|${JSON.stringify(props)}|${size}`;
  let url = urls.get(key);
  if (!url) {
    const turn = SITTER.has(kind) ? 3.6 : 0.55;
    url = render(kind, props, size, size, turn).toDataURL("image/png");
    urls.set(key, url);
  }
  return url;
}

/** The held piece on its turntable: drawn into `to` (a 2D canvas) turned `turn` rad. */
export function turntable(to: HTMLCanvasElement, kind: string, props: Record<string, unknown>, turn: number): boolean {
  if (!isNative(kind)) return false;
  const c = render(kind, props, to.width, to.height, turn);
  const g = to.getContext("2d");
  if (!g) return false;
  g.clearRect(0, 0, to.width, to.height);
  g.drawImage(c, 0, 0);
  return true;
}
