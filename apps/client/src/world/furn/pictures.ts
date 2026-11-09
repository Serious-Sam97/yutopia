import { entry, quarterYaw, TEXT_FACE } from "@yutopia/shared";
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sphere,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { litMaterial } from "../look/lit";
import { Post3 } from "../tp/post3d";
import { LOOKS as DESK2_LOOKS } from "./fam/desktop2";
import { toon } from "./kit";
import { animateLive, liveGroup } from "./liveparts";
import { isNative, LOOK_NAMES, modelOf, wordsOf } from "./native";
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
    renderer.toneMapping = ACESFilmicToneMapping;
    const scene = new Scene();
    scene.add(new HemisphereLight("#f6f2ea", "#8a7a66", 1.6));
    const key = new DirectionalLight("#fff3e0", 2.2);
    key.position.set(3, 6, 5);
    scene.add(key);
    const camera = new PerspectiveCamera(24, 1, 0.05, 80);
    const post = new Post3(renderer, scene, camera, true);
    post.setNight(0);
    r = { renderer, scene, camera, post, size: [0, 0] };
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

/** Render a placed-to-be thing (`props`: its look, paint, what it is) turned `turn` rad, framed to
 *  fit, into the shared renderer's canvas. */
function render(kind: string, props: Record<string, unknown>, w: number, h: number, turn: number) {
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
  const face = TEXT_FACE[kind as keyof typeof TEXT_FACE];
  let words: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  if (face) {
    const c = document.createElement("canvas");
    const ticker = kind === "vfd_ticker";
    [c.width, c.height] = ticker ? TICKER_PX : FLAPS_PX;
    const text = wordsOf({ id: "catalog", kind, x: 0, y: 0, props });
    if (ticker) drawTicker(c, text, (c.width - 24) / 90);
    else drawFlaps(c, text, 99, "catalog");
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    words = new Mesh(
      new PlaneGeometry(face.x1 - face.x0, face.y1 - face.y0),
      new MeshBasicMaterial({ map, toneMapped: false }),
    );
    words.position.set((face.x0 + face.x1) / 2, (face.y0 + face.y1) / 2, face.z + 0.002);
    mesh.add(words);
  }
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
  if (words) {
    words.geometry.dispose();
    words.material.map?.dispose();
    words.material.dispose();
  }
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
