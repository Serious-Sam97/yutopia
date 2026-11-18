import { BIKE_SPECS, BIKE_VARIANTS } from "@yutopia/shared/bike";
import {
  Group,
  type Material,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from "three";
import { asset } from "@/lib/asset";
import { AssetQueue, loadLifeGLTF } from "../../look/life-assets";
import type { BuildCar } from "../car/glb";
import { type Lights, type Sedan, skyLit, type Wheel } from "../car/model";

// A bicycle's model (docs/plan/101-the-bicycles.md, phase 1): its Blender file (tools/art/bikes → public/life/bikes/
// <variant>.glb, the manifest beside them) as a car's model is to the rest of the game (model.ts `Sedan`): the rig
// turns its wheels, the parked cars' code places it, its rider sits on it. What's only a bike's — the fork and bars
// turned on the head tube, the cranks round and the pedals kept level, the kickstand, the brake levers, the frame spun
// under the bars (a tailwhip), the bars spun (a barspin) — is its own setters, posed each frame (world/bike/pose.ts).
//
// The file's nodes are its pivots (the contract, tools/art/bikes/README.md): `steer` on the head tube with its y up
// the tube, `spin_f`/`spin_r` at the hubs turning about z, `crank` at the bottom bracket about z with `pedal_l`/`pedal_r`
// at the spindles, `kickstand` at its hinge. Frames: the file's (x forward, y up, z right, its origin on the ground
// under the bottom bracket); the model's as a car's (nose −x, +z its left, its origin under the centre of gravity).

type V3 = [number, number, number];
export interface BikeEntry {
  file: string;
  mid?: string;
  far?: string;
  body: string;
  variant: string;
  kind: string;
  name: string;
  dims: { length: number; width: number; height: number };
  wheelbase: number;
  wheel: { f: { r: number; width: number }; r: { r: number; width: number } };
  head_angle?: number;
  crank: number;
  points: Record<string, V3>;
  steer: { at: V3; axis: V3 };
  kickstand?: { axis?: string; down: number; lean?: number; lean_side?: string } | null;
  levers?: Record<string, { pull: number; brake: string }>;
  has?: {
    lamp?: string;
    bell?: boolean;
    basket?: boolean;
    rack?: boolean;
    pegs?: boolean;
    gyro?: boolean;
    studs?: boolean;
    guards?: boolean;
    gears?: number;
  };
  tris?: { near: number; mid?: number };
}
interface BikeManifest {
  version: number;
  bikes: Record<string, BikeEntry>;
}

const BASE = "/life/bikes/";
let manifest: BikeManifest | null = null;
let manifestP: Promise<BikeManifest | null> | null = null;
/** The bikes' manifest, fetched once (none: no bikes drawn). */
export function loadBikeManifest(): Promise<BikeManifest | null> {
  manifestP ??= fetch(asset(`${BASE}manifest.json`))
    .then((r) => (r.ok ? (r.json() as Promise<BikeManifest>) : null))
    .then((m) => {
      manifest = m;
      return m;
    })
    .catch(() => {
      manifestP = null;
      return null;
    });
  return manifestP;
}
export const bikeEntry = (variant: string): BikeEntry | null => manifest?.bikes[variant] ?? null;
export const isBikeVariant = (variant: string): boolean => /^(town|bmx|mtb|road)-/.test(variant);

// ── the files ──
interface Loaded {
  scene: Group;
  bytes: number;
}
const queues = new Map<WebGLRenderer, AssetQueue<Loaded>>();
function queueFor(r: WebGLRenderer): AssetQueue<Loaded> {
  let q = queues.get(r);
  if (!q) {
    q = new AssetQueue<Loaded>({
      load: async (file) => {
        const g = await loadLifeGLTF(r, asset(`${BASE}${file}`));
        let bytes = 0;
        const gone: Object3D[] = [];
        g.scene.traverse((o) => {
          if (o.name === "collider") {
            gone.push(o);
            return;
          }
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.geometry.userData.shared = true;
          for (const a of Object.values(m.geometry.attributes))
            bytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
          const mat = m.material as MeshStandardMaterial;
          if (mat && !Array.isArray(mat)) {
            mat.userData.shared = true;
            skyLit(mat);
          }
          m.castShadow = !mat?.transparent && !mat?.name?.startsWith("emit_");
          m.receiveShadow = true;
        });
        for (const o of gone) o.removeFromParent();
        return { scene: g.scene, bytes };
      },
      size: (x) => x.bytes,
      free: (x) =>
        x.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          const mat = m.material as Material;
          if (mat && !Array.isArray(mat)) mat.dispose();
        }),
      pieces: (x) => {
        let n = 0;
        x.scene.traverse((o) => {
          if ((o as Mesh).isMesh) n++;
        });
        return n;
      },
      concurrency: 2,
      budget: 24 * 1024 * 1024,
    });
    queues.set(r, q);
  }
  return q;
}

/** A bike with no file yet: its kind's sizes, roughly (the rider and the physics have what they need). */
function standIn(variant: string): BikeEntry {
  const bmx = variant.startsWith("bmx");
  const r = bmx ? 0.255 : 0.34;
  const wb = bmx ? 0.98 : 1.08;
  return {
    file: "",
    body: variant.split("-")[0],
    variant,
    kind: "bike",
    name: variant,
    dims: { length: wb + 2 * r, width: 0.6, height: 1.05 },
    wheelbase: wb,
    wheel: { f: { r, width: 0.04 }, r: { r, width: 0.04 } },
    crank: 0.17,
    points: {
      hub_f: [wb * 0.6, r, 0],
      hub_r: [-wb * 0.4, r, 0],
      bb: [0, bmx ? 0.3 : 0.28, 0],
      saddle: [-0.2, bmx ? 0.72 : 0.88, 0],
      grip_l: [wb * 0.45, bmx ? 0.95 : 1.0, -0.29],
      grip_r: [wb * 0.45, bmx ? 0.95 : 1.0, 0.29],
    },
    steer: { at: [wb * 0.42, 0.75, 0], axis: [-0.33, 0.94, 0] },
  };
}

/** What its rider needs of a bike at rest (the model's frame — nose −x, +z left — from its root, under the centre of
 *  gravity): the saddle, the grips, the drops, the bottom bracket and the cranks' length, the pegs, the kickstand's
 *  foot, the wheels' radii, a gyro under its bars. */
export interface BikeParts {
  saddle: Vector3;
  grips: [Vector3, Vector3]; // left, right
  drops: [Vector3, Vector3] | null;
  bb: Vector3;
  crank: number;
  pegs: Vector3[];
  standFoot: Vector3 | null;
  wheelR: [number, number];
  gyro: boolean;
}

const v1 = new Vector3();
const qy = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** A bicycle's model from its Blender file: made now, its geometry in when the file is (`ready`). */
export class BikeModel implements Sedan {
  readonly root = new Group();
  readonly body = new Group();
  /** the file, turned to the model's frame (half round), moved so the centre of gravity is at the root */
  private readonly glb = new Group();
  readonly wheels: Wheel[];
  readonly doors = [];
  readonly steering = new Group();
  readonly wipers = [];
  readonly freshener = new Group();
  readonly snow: Mesh[] = [];
  readonly seats: { hip: Vector3; side: 1 | -1; front: boolean; floor?: number }[];
  readonly eye: Vector3;
  readonly dims: { L: number; axleF: number; kind: string };
  readonly lamps: { head: Vector3[]; tail: Vector3[]; exhaust: Vector3 };
  readonly rearView = new Mesh();
  /** (a car's pedals: none, but its rider's full size — cars.ts scales a person by whether it has them) */
  readonly pedals: Vector3[] = [];
  /** (a car's: its parts merged when parked — a bike's few stay as they are) */
  bakeStill?: () => number;
  screen = { u0: 0, y0: 0, u1: 0, y1: 0, hw0: 0, hw1: 0, len: 0 };
  ready = false;
  readonly loaded: Promise<void>;
  readonly bike: BikeParts;
  readonly e: BikeEntry;
  private done: () => void = () => {};
  private gone = false;
  private held: string | null = null;
  private readonly mine: Material[] = [];
  private paint: MeshStandardMaterial[] = [];
  private lampMats: MeshStandardMaterial[] = [];
  private tailMats: MeshStandardMaterial[] = [];
  private envMats = new Set<MeshStandardMaterial>();
  private env: Texture | null = null;
  /** the file's own pivots, once it's in */
  private n: {
    steer: Object3D | null;
    bars: Object3D | null;
    spinF: Object3D | null;
    spinR: Object3D | null;
    crank: Object3D | null;
    pedals: (Object3D | null)[];
    stand: Object3D | null;
    levers: (Object3D | null)[];
    whip: Group | null;
  } = {
    steer: null,
    bars: null,
    spinF: null,
    spinR: null,
    crank: null,
    pedals: [],
    stand: null,
    levers: [],
    whip: null,
  };
  private rest = new Map<Object3D, Quaternion>();
  /** where each grip is on the bars (the steering node's own frame): carried with them */
  private gripLocal: (Vector3 | null)[] = [null, null];
  /** the head tube's axis in the file's root (the tailwhip's) */
  private whipAxis = new Vector3(0, 1, 0);

  constructor(private readonly o: BuildCar) {
    // (its file not made yet, or its manifest not in: a stand-in of its numbers, nothing drawn)
    const e = bikeEntry(o.variant) ?? standIn(o.variant);
    // (the centre of gravity behind the front hub: its kind's, the rider on it)
    const front = BIKE_SPECS[BIKE_VARIANTS[o.variant]?.kind ?? "bike_town"].front;
    this.e = e;
    this.loaded = new Promise((ok) => {
      this.done = ok;
    });
    const P = (k: string): V3 | undefined => e.points[k];
    const hubF = P("hub_f") ?? [e.wheelbase * 0.6, e.wheel.f.r, 0];
    // (the file's frame: the centre of gravity `front` behind the front hub)
    const cogX = hubF[0] - front;
    this.root.add(this.body);
    this.body.add(this.glb);
    this.glb.rotation.y = Math.PI;
    this.glb.position.x = cogX;
    this.root.name = `bike:${o.variant}`;
    // the rig's wheels: FL = FR the front, RL = RR the back — stand-ins it turns, copied onto the file's (tick)
    const wheel = (front: boolean, side: 1 | -1): Wheel => ({
      steer: new Group(),
      spin: new Group(),
      front,
      side,
      rest: new Vector3(),
    });
    this.wheels = [wheel(true, 1), wheel(true, -1), wheel(false, 1), wheel(false, -1)];
    // the model's frame (nose −x, +z left) from its root: a file point p → (−(p.x − cogX), p.y, −p.z)
    const M = (p: V3 | undefined) => (p ? new Vector3(-(p[0] - cogX), p[1], -p[2]) : null);
    const saddle = M(P("saddle")) ?? new Vector3(0.25, 0.88, 0);
    const gl = M(P("grip_l")) ?? new Vector3(-0.5, 1.0, 0.3);
    const gr = M(P("grip_r")) ?? new Vector3(-0.5, 1.0, -0.3);
    const dl = M(P("drop_l"));
    const dr = M(P("drop_r"));
    this.bike = {
      saddle,
      grips: [gl, gr],
      drops: dl && dr ? [dl, dr] : null,
      bb: M(P("bb") ?? [0, 0.28, 0]) as Vector3,
      crank: e.crank || 0.17,
      pegs: ["peg_fl", "peg_fr", "peg_rl", "peg_rr"].map((k) => M(P(k))).filter((p): p is Vector3 => !!p),
      standFoot: M(P("stand_foot")),
      wheelR: [e.wheel.f.r, e.wheel.r.r],
      gyro: !!e.has?.gyro,
    };
    this.seats = [{ hip: saddle.clone(), side: 1, front: true }];
    this.eye = saddle.clone().add(v1.set(-0.15, 0.72, 0));
    this.dims = { L: e.dims.length, axleF: e.dims.length / 2 - front, kind: e.kind };
    this.lamps = {
      head: [M(P("lamp_f")) ?? gl.clone()],
      tail: [M(P("lamp_r")) ?? saddle.clone()],
      exhaust: this.bike.bb.clone(),
    };
    const file = (o.level ?? "near") === "mid" && e.mid ? e.mid : e.file;
    if (!file) return;
    this.held = file;
    queueFor(o.renderer)
      .get(file, o.priority ?? 0)
      .then(
        (x) => {
          if (!this.gone) this.adopt(x.scene);
        },
        (err) => console.warn(`bike model ${file} didn't load`, err),
      );
  }

  /** The file's in: its pivots found, the frame put on a pivot of its own on the head tube (to spin under the bars),
   *  its paint and lamps its own. */
  private adopt(src: Group) {
    const scene = src.clone(true);
    this.glb.add(scene);
    scene.updateMatrixWorld(true);
    const get = (k: string) => scene.getObjectByName(k) ?? null;
    const n = this.n;
    n.steer = get("steer");
    n.bars = get("bars_spin");
    n.spinF = get("spin_f");
    n.spinR = get("spin_r");
    n.crank = get("crank");
    n.pedals = [get("pedal_l"), get("pedal_r")];
    n.stand = get("kickstand");
    n.levers = [get("lever_l"), get("lever_r")];
    for (const x of [n.steer, n.bars, n.spinF, n.spinR, n.crank, ...n.pedals, n.stand, ...n.levers])
      if (x) this.rest.set(x, x.quaternion.clone());
    // (the tailwhip's pivot: on the head tube, as the steering's; the frame, the back wheel, the cranks and the stand
    // under it — the bars and the front wheel not)
    if (n.steer?.parent) {
      // (in the file's root — the variant's node —, beside the steering)
      const top = n.steer.parent;
      const whip = new Group();
      whip.name = "whip";
      top.add(whip);
      n.steer.updateWorldMatrix(true, false);
      whip.position.copy(top.worldToLocal(n.steer.getWorldPosition(v1)));
      whip.updateMatrixWorld(true);
      for (const k of ["frame", "wheel_r", "crank", "kickstand"]) {
        const x = get(k);
        if (x && x.parent === top) whip.attach(x);
      }
      this.whipAxis.copy(UP).applyQuaternion(n.steer.quaternion);
      n.whip = whip;
      // the grips on the bars, in the steering's frame
      for (const [i, k] of (["grip_l", "grip_r"] as const).entries()) {
        const p = this.e.points[k];
        if (!p) continue;
        const at = scene.localToWorld(new Vector3(p[0], p[1], p[2]));
        this.gripLocal[i] = (n.bars ?? n.steer).worldToLocal(at);
      }
    }
    // its paint its own (the colour chosen), its lamps' light its own (lit or not)
    const look = this.o.look;
    const own = new Map<Material, MeshStandardMaterial>();
    scene.traverse((x) => {
      const m = x as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshStandardMaterial;
      if (!mat || Array.isArray(mat)) return;
      const name = mat.name ?? "";
      if (name === "paint" || name === "paint2" || name.startsWith("emit_")) {
        let c = own.get(mat);
        if (!c) {
          c = mat.clone();
          skyLit(c);
          this.mine.push(c);
          own.set(mat, c);
          if (name === "paint" && look) c.color.setHex(look.colour);
          if (name === "paint2" && look?.colour2 !== undefined) c.color.setHex(look.colour2);
          if (name === "paint") this.paint.push(c);
          if (name === "emit_head") this.lampMats.push(c);
          if (name === "emit_tail") this.tailMats.push(c);
        }
        m.material = c;
      }
      if ((m.material as MeshStandardMaterial).isMeshStandardMaterial)
        this.envMats.add(m.material as MeshStandardMaterial);
    });
    if (this.env) this.setEnv(this.env);
    this.setLights({ beams: "off", tail: false, brake: 0, reverse: false, ind: 0, dash: 0, dome: false });
    this.ready = true;
    this.done();
  }

  private turn(x: Object3D | null, axis: "x" | "y" | "z", a: number) {
    if (!x) return;
    const r = this.rest.get(x);
    if (!r) return;
    v1.set(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
    x.quaternion.copy(r).multiply(qy.setFromAxisAngle(v1, a));
  }

  // ── a bike's own ──
  /** The rig's wheels onto the file's (it turns stand-ins: the file's come a moment later). Each frame. */
  tick() {
    this.turn(this.n.spinF, "z", -this.wheels[0].spin.rotation.z);
    this.turn(this.n.spinR, "z", -this.wheels[2].spin.rotation.z);
  }
  /** The cranks turned (rad, + pedalled forward; 0 the right crank forward, level as made), the pedals kept level. */
  setCrank(a: number) {
    // (the file's z is the axle: forward, as the wheel rolls, is about −z)
    this.turn(this.n.crank, "z", -a);
    for (const p of this.n.pedals) this.turn(p, "z", a);
  }
  /** The fork and bars turned on the head tube (rad, + to the right, as the road wheel), the bars alone spun round on
   *  it (a barspin, rad — the fork's turn the same where it has no gyro of its own). */
  setBars(a: number, spin = 0) {
    // (about the head tube, its node's own y up it: a right turn is about −up)
    if (this.n.bars) {
      this.turn(this.n.steer, "y", -a);
      this.turn(this.n.bars, "y", -spin);
    } else this.turn(this.n.steer, "y", -a - spin);
  }
  /** The frame spun round under the bars (a tailwhip, rad). */
  setWhip(a: number) {
    const w = this.n.whip;
    const st = this.n.steer;
    if (!w || !st) return;
    // (about the head tube's axis, through the steering's place)
    w.quaternion.setFromAxisAngle(this.whipAxis, a);
  }
  /** The kickstand down (1) or up (0). */
  setStand(k: number) {
    const d = this.e.kickstand?.down ?? 1.3;
    const ax = (this.e.kickstand?.axis ?? "x") as "x" | "y" | "z";
    this.turn(this.n.stand, ax, d * Math.max(0, Math.min(1, k)));
  }
  /** The brake levers pulled (0..1). */
  setLevers(l: number, r: number) {
    this.turn(this.n.levers[0], "z", (this.e.levers?.lever_l?.pull ?? 0.28) * l);
    this.turn(this.n.levers[1], "z", (this.e.levers?.lever_r?.pull ?? 0.28) * r);
  }
  /** Parked: leant onto its kickstand (rad, + its left) — one with none, a touch, as against a rack. */
  get standLean(): number {
    const k = this.e.kickstand;
    return k ? (k.lean ?? 0.12) * (k.lean_side === "right" ? -1 : 1) : 0.04;
  }
  /** Where a grip is now (the root's frame): with the bars as they're turned. */
  gripAt(i: 0 | 1, out: Vector3): Vector3 {
    const g = this.gripLocal[i];
    const on = this.n.bars ?? this.n.steer;
    if (!g || !on) return out.copy(this.bike.grips[i]);
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(on.localToWorld(out.copy(g)));
  }
  /** Where a pedal's spindle is now (the root's frame): with the cranks round. */
  pedalAt(i: 0 | 1, out: Vector3): Vector3 {
    const p = this.n.pedals[i];
    if (!p) {
      // (none in yet: the crank's end, at rest)
      const c = this.bike.crank;
      return out.copy(this.bike.bb).add(v1.set(i === 1 ? -c : c, 0, i === 0 ? 0.09 : -0.09));
    }
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(p.getWorldPosition(out));
  }

  // ── a car's, as far as a bike has them ──
  rim(_phi: number, out = new Vector3()): Vector3 {
    return out.copy(this.bike.grips[0]).add(this.bike.grips[1]).multiplyScalar(0.5);
  }
  setSteer(road: number) {
    this.setBars(road);
  }
  setLights(l: Lights) {
    const on = l.beams !== "off";
    for (const m of this.lampMats) m.emissiveIntensity = on ? 2.4 : 0;
    for (const m of this.tailMats) m.emissiveIntensity = on || l.brake > 0 ? 1.6 : 0.15;
  }
  setCluster() {}
  setRadio() {}
  setScreenSnow() {}
  setEnv(t: Texture | null) {
    this.env = t;
    for (const m of this.envMats) {
      m.envMap = t;
      m.envMapIntensity = 0.6;
    }
  }
  setBeacon() {}
  setWear(grime: number) {
    for (const m of this.paint) m.roughness = 0.45 + 0.4 * Math.max(0, Math.min(1, grime));
  }
  setSnow() {}
  shell(shown: boolean) {
    this.glb.visible = shown;
  }
  dispose() {
    this.gone = true;
    if (this.held) queueFor(this.o.renderer).release(this.held);
    this.held = null;
    for (const m of this.mine) m.dispose();
    this.mine.length = 0;
    this.root.removeFromParent();
  }
}
