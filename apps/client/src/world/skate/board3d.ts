// A skateboard drawn (docs/plan/103-the-skate.md): the Blender GLBs (tools/art/skate → public/life/skate/, their
// contract in its README: x to the nose, y up, z to the right, the origin on the ground under the axles' middle;
// pivots deck › hanger_f/r › wheel_*) — or, till one's in, a plain one made here at the same measures. Its
// pose: the deck leant on its trucks for a carve, the wheels turning, the flips' turns about the deck's middle.
import type { BoardVariant } from "@yutopia/shared/skate";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { asset } from "@/lib/asset";
import { loadLifeGLTF } from "../look/life-assets";

/** The measures the game reads (the manifest's, or these till it's loaded). */
export interface BoardMeasures {
  length: number;
  width: number;
  /** the deck's top over the ground */
  deckY: number;
  wheelbase: number;
  wheelR: number;
  truck: number;
  /** points (the board's frame) */
  points: Record<string, [number, number, number]>;
}
const DEFAULT: BoardMeasures = {
  length: 0.8,
  width: 0.205,
  deckY: 0.11,
  wheelbase: 0.36,
  wheelR: 0.026,
  truck: 0.2,
  points: {
    foot_f: [0.19, 0.11, 0],
    foot_r: [-0.3, 0.12, 0],
    nose: [0.4, 0.14, 0],
    tail: [-0.4, 0.14, 0],
    grab_nose: [0.38, 0.12, 0],
    grab_tail: [-0.38, 0.12, 0],
    grab_toe: [0, 0.105, 0.1],
    grab_heel: [0, 0.105, -0.1],
    grab_toe_f: [0.24, 0.105, 0.1],
    grab_heel_f: [0.24, 0.105, -0.1],
    grab_toe_r: [-0.24, 0.105, 0.1],
    grab_heel_r: [-0.24, 0.105, -0.1],
    axle_f: [0.18, 0.026, 0],
    axle_r: [-0.18, 0.026, 0],
  },
};

let renderer: WebGLRenderer | null = null;
/** The view's renderer, for the GLBs' textures (KTX2). */
export function setBoardRenderer(r: WebGLRenderer) {
  renderer = r;
}

interface Manifest {
  boards: Record<
    string,
    {
      file: string;
      mid?: string;
      dims: { length: number; width: number; height: number };
      wheelbase: number;
      truck_width: number;
      wheel: { r: number };
      points: Record<string, [number, number, number]>;
    }
  >;
}
let manifest: Promise<Manifest | null> | null = null;
const measures = new Map<string, BoardMeasures>();
function loadManifest(): Promise<Manifest | null> {
  manifest ??= fetch(asset("/life/skate/manifest.json"))
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null)
    .then((m) => {
      if (m)
        for (const [v, b] of Object.entries(m.boards))
          measures.set(v, {
            length: b.dims.length,
            width: b.dims.width,
            deckY: b.points.deck?.[1] ?? b.dims.height,
            wheelbase: b.wheelbase,
            wheelR: b.wheel.r,
            truck: b.truck_width,
            points: { ...DEFAULT.points, ...b.points },
          });
      return m;
    });
  return manifest;
}
/** A board's measures (the default ones till the manifest's in). */
export function boardMeasures(v: BoardVariant): BoardMeasures {
  void loadManifest();
  return measures.get(v) ?? DEFAULT;
}

const scenes = new Map<string, Promise<Group | null>>();
function sceneOf(v: BoardVariant, mid: boolean): Promise<Group | null> {
  const key = `${v}${mid ? "-mid" : ""}`;
  let p = scenes.get(key);
  if (!p) {
    const r = renderer;
    p = !r
      ? Promise.resolve(null)
      : loadManifest().then(async (m) => {
          const b = m?.boards[v];
          if (!b) return null;
          try {
            const g = await loadLifeGLTF(r, asset(`/life/skate/${mid && b.mid ? b.mid : b.file}`));
            const out: Object3D[] = [];
            g.scene.traverse((o) => {
              if (o.name === "collider") out.push(o);
              const mm = o as Mesh;
              if (mm.isMesh) {
                mm.castShadow = true;
                mm.receiveShadow = true;
                mm.geometry.userData.shared = true;
                const mat = mm.material as Material;
                if (mat && !Array.isArray(mat)) mat.userData.shared = true;
              }
            });
            for (const o of out) o.removeFromParent();
            return g.scene as Group;
          } catch {
            return null;
          }
        });
    scenes.set(key, p);
  }
  return p;
}

// ── the plain one ────────────────────────────────────────────────────────────────────────────────────────
const mats: Record<string, MeshStandardMaterial> = {};
const mat = (k: string, c: number, rough = 0.7, metal = 0) => {
  mats[k] ??= new MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  mats[k].userData.shared = true;
  return mats[k];
};
function plainBoard(m: BoardMeasures): Group {
  const root = new Group();
  root.name = "board";
  const deck = new Group();
  deck.name = "deck";
  deck.position.set(0, m.deckY, 0);
  root.add(deck);
  const top = new Mesh(new BoxGeometry(m.length * 0.62, 0.012, m.width), mat("grip", 0x1c1c1e, 0.95));
  top.position.y = -0.006;
  deck.add(top);
  // the kicks
  for (const s of [1, -1]) {
    const k = new Mesh(new BoxGeometry(m.length * 0.2, 0.012, m.width * 0.96), mat("grip", 0x1c1c1e, 0.95));
    k.position.set(s * m.length * 0.4, 0.02, 0);
    k.rotation.z = s * 0.3;
    deck.add(k);
  }
  for (const [name, x] of [
    ["hanger_f", m.wheelbase / 2],
    ["hanger_r", -m.wheelbase / 2],
  ] as const) {
    const h = new Group();
    h.name = name;
    h.position.set(x, m.wheelR - m.deckY, 0);
    deck.add(h);
    const axle = new Mesh(new BoxGeometry(0.03, 0.035, m.truck * 0.9), mat("alloy", 0xb8bcc2, 0.4, 0.8));
    axle.position.y = 0.02;
    h.add(axle);
    for (const z of [1, -1]) {
      const w = new Group();
      w.name = `wheel_${name.endsWith("f") ? "f" : "r"}${z > 0 ? "r" : "l"}`;
      w.position.z = (z * m.truck) / 2;
      const wm = new Mesh(new CylinderGeometry(m.wheelR, m.wheelR, 0.032, 14), mat("urethane", 0xe9e2cf, 0.5));
      wm.rotation.x = Math.PI / 2;
      w.add(wm);
      h.add(w);
    }
  }
  return root;
}

/** One board in the scene: its parts found by name, posed. */
export class BoardObj {
  readonly root = new Group();
  private body: Group;
  private deck: Object3D | null = null;
  private hangers: Object3D[] = [];
  private wheels: Object3D[] = [];
  private spin = 0;
  variant: BoardVariant;
  m: BoardMeasures;
  constructor(variant: BoardVariant) {
    this.variant = variant;
    this.m = boardMeasures(variant);
    this.body = plainBoard(this.m);
    this.root.add(this.body);
    this.find();
    void this.swap(variant);
  }
  private find() {
    this.deck = this.body.getObjectByName("deck") ?? null;
    this.hangers = ["hanger_f", "hanger_r"].map((n) => this.body.getObjectByName(n)).filter((o): o is Object3D => !!o);
    this.wheels = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]
      .map((n) => this.body.getObjectByName(n))
      .filter((o): o is Object3D => !!o);
  }
  private async swap(v: BoardVariant) {
    const s = await sceneOf(v, false);
    if (!s || this.variant !== v) return;
    this.m = boardMeasures(v);
    this.root.remove(this.body);
    this.body = s.clone(true) as Group;
    this.root.add(this.body);
    this.find();
  }
  set(v: BoardVariant) {
    if (v === this.variant) return;
    this.variant = v;
    void this.swap(v);
  }
  /** Its pose: the carve's lean (−1..1), the speed (the wheels), a flip's turns (rad: about the long axis, the up,
   *  across), lifted `up` m (the ollie's pop to the feet). */
  pose(lean: number, speed: number, dt: number, roll = 0, yaw = 0, pitch = 0, up = 0) {
    this.spin += (speed / Math.max(0.01, this.m.wheelR)) * dt;
    for (const w of this.wheels) w.rotation.z = -this.spin;
    const tilt = lean * 0.16;
    if (this.deck) this.deck.rotation.x = tilt;
    for (const [i, h] of this.hangers.entries()) {
      // (the hangers stay on the ground, turned into the carve: the front one way, the back the other)
      h.rotation.x = -tilt;
      h.rotation.y = (i === 0 ? 1 : -1) * lean * 0.22;
    }
    // the flips: about the deck's middle
    const c = this.m.deckY;
    this.body.position.set(0, c + up, 0);
    this.body.rotation.set(roll, yaw, pitch, "YXZ");
    this.body.updateMatrix();
    // (back to the ground's origin under the deck's middle)
    this.body.translateY(-c);
  }
  dispose() {
    this.root.removeFromParent();
  }
}

/** (F13a) A board thrown off in a bail: where it's got to `t` s after (the floor's plan: from (x0, y0) at
 *  (vx, vy) m/s, rolling to a stop), the same for me and for the others. */
export const AWAY_K = 1.1;
export function awayAt(
  x0: number,
  y0: number,
  vx: number,
  vy: number,
  t: number,
): { x: number; y: number; moving: boolean } {
  const f = (1 - Math.exp(-AWAY_K * t)) / AWAY_K;
  return { x: x0 + vx * f, y: y0 + vy * f, moving: Math.hypot(vx, vy) * Math.exp(-AWAY_K * t) > 0.15 };
}
