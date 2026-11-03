import type { WorldObjectDef } from "@yutopia/shared";
import { studio } from "@yutopia/shared/maps/studio";
import { furnishedIn, furnishRoom, isRoomPlan, planFor } from "@yutopia/shared/office";
import * as T from "three";
import { Post3 } from "../tp/post3d";
import { useFurn } from "./flag";

// The Office's plans on the bench (docs/plan/67-the-furniture.md, phase 10): the studio as the
// world draws it (World3: its floors, walls, doors and every thing), one of its rooms furnished by
// a plan (shared office.ts) — `/dev/furniture?plan=lounge&room=lounge`, `plan=` none: by its name —
// seen from over its south wall, by day or `night`.
export async function runPlan(
  el: HTMLElement,
  o: { plan: string | null; room: string; night: boolean; w: number; h: number },
): Promise<() => void> {
  useFurn("new");
  const items = await import("../art/items");
  const { World3 } = await import("../tp/build");
  const map = studio;
  const a = map.areas.find((x) => x.key === o.room) ?? map.areas[0];
  const plan = isRoomPlan(o.plan) ? o.plan : planFor(a);
  const gone = new Set(furnishedIn(map.objects, a, map).map((x) => x.id));
  const keep = map.objects.filter((x) => !gone.has(x.id));
  const objects: WorldObjectDef[] = [...keep, ...furnishRoom(plan, a, map, keep)];

  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(o.w, o.h);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  el.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color(o.night ? "#14161c" : "#cfc8bb");
  const world = new World3(items, map, objects, 8);
  scene.add(world.root);
  scene.add(new T.HemisphereLight("#f3efe6", "#6c5f50", o.night ? 0.15 : 0.9));
  const key = new T.DirectionalLight("#fff3e0", o.night ? 0.1 : 1.4);
  key.position.set(a.x - 6, 14, a.y + a.h + 8);
  key.castShadow = true;
  scene.add(key);
  const camera = new T.PerspectiveCamera(32, o.w / o.h, 0.1, 300);
  const target = new T.Vector3(a.x + a.w / 2, 0.4, a.y + a.h / 2);
  const span = Math.max(a.w, a.h * 1.4);
  camera.position.set(target.x, span * 1.05, target.z + span * 0.95);
  camera.lookAt(target);
  const post = new Post3(renderer, scene, camera);
  post.setSize(o.w, o.h, renderer.getPixelRatio());
  post.setNight(o.night ? 1 : 0);
  let stop = false;
  let frames = 0;
  const tick = () => {
    if (stop) return;
    post.render(false);
    if (++frames > 6) (window as unknown as { __shot?: boolean }).__shot = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    stop = true;
    renderer.dispose();
    el.innerHTML = "";
  };
}
