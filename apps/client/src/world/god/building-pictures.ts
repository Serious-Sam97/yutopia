// Plan 110 (docs/plan/110-the-buildings.md F10a) — God mode's style pictures: each style of each kind drawn from
// the kit itself (shared building-styles.ts → tp/kit-buildings.ts), three-quarter on, its own colours (or the ones
// picked), on nothing. One offscreen renderer for them all, made the first time one's asked for; a picture a frame
// (toDataURL waits on the GPU: memory, webgl-readback-hitch), kept for the session as a data URL.

import { coloursOf, KINDS, type KitKind, layoutOf } from "@yutopia/shared/building-styles";
import type { Building } from "@yutopia/shared/grounds";
import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { kitBatches, kitMaterial, loadKit } from "../tp/kit-buildings";
import { roomUse } from "../tp/kit-rooms";

const urls = new Map<string, string>();
const want: { key: string; b: Building }[] = [];
const subs = new Set<() => void>();
let rig: { r: WebGLRenderer; scene: Scene; cam: PerspectiveCamera } | null = null;
let ticking = false;

/** What changes the pictures (one's come): the panel redraws. */
export function onPictures(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
const keyOf = (kind: KitKind, style: string, c?: Building["colours"]) => JSON.stringify([kind, style, c ?? null]);

/** A style's picture (its URL), or null while it's being drawn (`onPictures` says when). */
export function buildingPicture(kind: KitKind, style: string, colours?: Building["colours"]): string | null {
  const key = keyOf(kind, style, colours);
  const u = urls.get(key);
  if (u) return u;
  if (!want.some((w) => w.key === key)) want.push({ key, b: sample(kind, style, colours) });
  if (!ticking) {
    ticking = true;
    void loadKit().then(() => requestAnimationFrame(tick));
  }
  return null;
}
/** The building a style's drawn as: a middling one of its kind, door to the camera. */
function sample(kind: KitKind, style: string, colours?: Building["colours"]): Building {
  const kd = KINDS[kind];
  const w = Math.round(Math.min(kd.max, Math.max(kd.min, kd.min + (kd.max - kd.min) * 0.35)));
  const d = Math.round(Math.max(kd.min, w * 0.8));
  const floors = Math.max(kd.floors[0], Math.min(kd.floors[1], 2));
  return {
    key: `picture-${kind}-${style}-${JSON.stringify(colours ?? null)}`,
    kind,
    name: kd.name,
    x0: 0,
    z0: 0,
    x1: w,
    z1: d,
    floors,
    face: "s",
    style,
    ...(colours && { colours }),
    ...(kd.sign && { sign: kd.name.toUpperCase().slice(0, 10) }),
  };
}
function tick() {
  const next = want.shift();
  if (!next) {
    ticking = false;
    return;
  }
  try {
    urls.set(next.key, draw(next.b));
  } catch (e) {
    console.warn("a building's picture", e);
    urls.set(next.key, "");
  }
  for (const f of subs) f();
  requestAnimationFrame(tick);
}
function draw(b: Building): string {
  if (!rig) {
    const r = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(240, 168, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    const scene = new Scene();
    scene.add(new HemisphereLight("#f4f0e6", "#7d7466", 2.2));
    const key = new DirectionalLight("#fff2dc", 2.4);
    key.position.set(-4, 8, 6);
    scene.add(key);
    rig = { r, scene, cam: new PerspectiveCamera(26, 240 / 168, 0.5, 500) };
  }
  const L = layoutOf(b);
  if (!L) return "";
  const { near } = kitBatches(L, 0, coloursOf(b), roomUse(b.kind));
  const g = new Group();
  for (const [k, a] of near) {
    if (a.empty) continue;
    g.add(
      new Mesh(
        a.build(),
        kitMaterial(k, () => {}),
      ),
    );
  }
  rig.scene.add(g);
  const box = new Box3().setFromObject(g);
  const c = box.getCenter(new Vector3());
  const s = box.getSize(new Vector3());
  const R = Math.max(s.x, s.y * 1.3, s.z) * 0.62 + 2;
  const dist = R / Math.tan((rig.cam.fov * Math.PI) / 360);
  rig.cam.position.set(c.x + dist * 0.55, c.y + dist * 0.42, c.z + dist * 0.8);
  rig.cam.lookAt(c.x, c.y - s.y * 0.05, c.z);
  rig.r.render(rig.scene, rig.cam);
  const url = rig.r.domElement.toDataURL("image/png");
  rig.scene.remove(g);
  g.traverse((o) => (o as Mesh).isMesh && (o as Mesh).geometry.dispose());
  return url;
}
