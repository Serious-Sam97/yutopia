// The animals' models (docs/plan/126-animal-life.md, phase 1): one .glb a model (public/life/animals, made by
// tools/art/animals/build_animals.py from the CC0 packs, restyled to the life look), loaded the first time one's
// near, cloned for each animal with its own skeleton and mixer. Their clips by the shared names (CLIPS); one a model
// hasn't, the nearest it has.
import { ANIMALS, type AnimalKind, type Clip, YOUNG } from "@yutopia/shared/animals/species";
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type Bone,
  type Group,
  LoopOnce,
  LoopRepeat,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
  type WebGLRenderer,
  Euler,
  Vector3,
} from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { asset } from "@/lib/asset";
import { loadLifeGLTF } from "../look/life-assets";
import { litMaterial } from "../look/lit";

/** A model's file for an animal: its species', or a variant's (a buck's antlers, a white horse, a chick). */
export function modelOf(kind: AnimalKind, v: number, young: boolean): string {
  if (kind === "deer" && v >= 2 && !young) return "deer_buck";
  if (kind === "horse" && v === 3) return "horse_white";
  if (kind === "chicken" && young) return "chick";
  return kind;
}

/** What to play when a model hasn't a clip: the next it may have. */
const FALLBACK: Partial<Record<Clip, Clip[]>> = {
  idle2: ["idle"],
  look: ["idle2", "idle"],
  eat: ["idle"],
  trot: ["run", "walk"],
  run: ["walk"],
  jump: ["run", "walk"],
  attack: ["kick", "jump", "run"],
  kick: ["attack"],
  hitL: ["hitR", "idle"],
  hitR: ["hitL", "idle"],
  die: ["lie", "idle"],
  lie: ["sit", "idle"],
  sit: ["lie", "idle"],
  fly: ["glide", "run"],
  glide: ["fly", "idle"],
  swim: ["walk", "idle"],
  ridden: ["idle"],
  // (plan 128: its day's own — the nearest a model has, where Blender didn't make them)
  drink: ["eat", "idle"],
  sniff: ["eat", "look", "idle"],
  groom: ["idle2", "sit", "idle"],
  play: ["jump", "run", "walk"],
  howl: ["look", "idle2", "idle"],
  stamp: ["kick", "look", "idle"],
};
/** Played once (held at its end): a death, a strike, a flinch, a jump. */
const ONCE = new Set<Clip>(["die", "attack", "kick", "hitL", "hitR", "jump", "stamp"]);

interface Loaded {
  scene: Group;
  clips: Map<string, AnimationClip>;
  material: Material;
}
const loaded = new Map<string, Promise<Loaded | null>>();

function load(renderer: WebGLRenderer, model: string, patch: (m: Material) => void): Promise<Loaded | null> {
  let p = loaded.get(model);
  if (!p) {
    p = loadLifeGLTF(renderer, asset(`/life/animals/${model}.glb`))
      .then((g) => {
        // one lit material for all its meshes: its colours are the vertices' (the build bakes them)
        const material = litMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82 });
        patch(material);
        g.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          const had = m.material as Material & { map?: unknown };
          // (a model that kept a texture keeps its own material; the loader's own, replaced, let go)
          if (!had || !had.map) {
            if (had && had !== material) had.dispose();
            m.material = material;
          }
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = false;
        });
        const clips = new Map<string, AnimationClip>();
        for (const c of g.animations) clips.set(c.name, c);
        return { scene: g.scene, clips, material };
      })
      .catch((e) => {
        console.warn(`[animals] ${model} not loaded:`, e instanceof Error ? e.message : e);
        return null;
      });
    loaded.set(model, p);
  }
  return p;
}

// ── each model's clip speeds (plan 129 F5): how fast each moving clip goes at its rate 1 — the gaits made at the game's
// speeds, the rest measured (tools/art/animals: build_animals.py, audit.py) — from the models' manifest ─────────────
export type Speeds = Partial<Record<"walk" | "trot" | "run" | "swim", number>>;
let manifest: Promise<Record<string, { speeds?: Speeds; clips?: string[]; audit?: Record<string, string[]> }>> | null = null;
export function animalManifest() {
  manifest ??= fetch(asset("/life/animals/manifest.json"))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifest;
}

/** The gait for a body going `spd` m/s on the ground (plan 128 F11, plan 129 F5): past a quick walk the trot, past
 *  halfway from the trot to the run (or twice the trot, if that's sooner) the run; each clip at its own speed (its
 *  measured or made speed, else as made by its species' pace) — feet that keep up with the ground. A model with no
 *  trot (the birds) goes from its walk to its run halfway between. `was`: the gait it's in — a tenth's give before it
 *  changes down, no flicker on the line. `scale`: the size it's drawn at against its model (a young one's).
 *  Shared by the game and the bench. */
export function gaitOf(
  kind: AnimalKind,
  spd: number,
  young: boolean,
  speeds?: Speeds,
  was?: Clip | null,
  scale = young ? YOUNG.scale : 1,
): { clip: "walk" | "trot" | "run"; rate: number } {
  const d = ANIMALS[kind];
  const yk = young ? 0.75 : 1;
  const walkV = d.walk * yk;
  const runV = d.run * yk;
  const trotV = Math.min(d.run, d.walk * 2.4) * yk;
  // (its speeds known and no trot among them: walk or run)
  const noTrot = !!speeds?.walk && !speeds.trot;
  const give = (c: "walk" | "trot" | "run") => (was === c ? 0.9 : 1);
  const toRun = noTrot ? (walkV + runV) * 0.5 : Math.min((trotV + runV) * 0.5, trotV * 2);
  const clip = spd > toRun * give("run") ? "run" : !noTrot && spd > walkV * 1.7 * give("trot") ? "trot" : "walk";
  // (its own speed, a young one's model the same size-for-size: scaled with it)
  const own = speeds?.[clip] ? speeds[clip] * scale : clip === "walk" ? walkV : clip === "trot" ? trotV : runV * 0.8;
  const rate = Math.max(0.35, Math.min(2.4, spd / Math.max(0.05, own)));
  return { clip, rate };
}

/** A model made at a young one's own size (the chick): not shrunk again, no bigger head. */
export const ownYoung = (model: string) => model === "chick";

/** Its gaits (one to another on at the same point of the stride) and its lying down (a slower blend). */
const GAITS = new Set<Clip>(["walk", "trot", "run"]);
const LYING = new Set<Clip>(["lie", "sit"]);
const plantV = new Vector3();
const plantEuler = new Euler();

/** One animal's body: its model's clone, its mixer, what it's playing. */
export class AnimalBody {
  root: Object3D;
  private mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  private playing: AnimationAction | null = null;
  clip: Clip | null = null;
  head: Bone | null = null;
  /** its bounding height as made (m) */
  readonly height: number;
  /** its clips' own speeds (plan 129) */
  speeds: Speeds = {};
  /** its feet (the four-legged's IK roots) — planted on the land (plan 129) — and its length nose to tail (m) */
  feet: { bone: Bone }[] = [];
  length = 1;

  constructor(
    private readonly src: Loaded,
    young: boolean,
  ) {
    this.root = cloneSkinned(src.scene);
    this.mixer = new AnimationMixer(this.root);
    let h = 0;
    this.root.traverse((o) => {
      const b = o as Bone;
      if (b.isBone && !this.head && /head/i.test(b.name) && !/end/i.test(b.name)) this.head = b;
      // (three drops the dot from a bone's name as it loads it: IKFrontLeg.L is IKFrontLegL)
      if (b.isBone && /^IK(Front|Back)Leg\.?[LR]$/.test(b.name)) this.feet.push({ bone: b });
      const s = o as SkinnedMesh;
      if (s.isSkinnedMesh) {
        s.geometry.computeBoundingBox();
        h = Math.max(h, s.geometry.boundingBox?.max.y ?? 0);
        const bb = s.geometry.boundingBox;
        if (bb) this.length = Math.max(this.length === 1 ? 0 : this.length, bb.max.x - bb.min.x);
      }
    });
    this.height = h || 1;
    if (young && this.head) this.head.scale.setScalar(1.35);
  }

  /** The clip it has for `want` (its own, or the nearest it has). */
  private has(want: Clip): Clip | null {
    if (this.src.clips.has(want)) return want;
    for (const f of FALLBACK[want] ?? []) if (this.src.clips.has(f)) return f;
    return this.src.clips.has("idle") ? "idle" : null;
  }

  /** Play `want` (crossfaded), its speed `rate` (1 as made). */
  play(want: Clip, rate = 1, fade = 0.25, restart = false) {
    const c = this.has(want);
    if (!c) return;
    let a = this.actions.get(c);
    if (!a) {
      const clip = this.src.clips.get(c);
      if (!clip) return;
      a = this.mixer.clipAction(clip);
      this.actions.set(c, a);
    }
    a.timeScale = rate;
    // (asked from its start again — a second strike —: the clip it's on, over)
    if (restart && this.playing === a) {
      this.loopFor(a, want);
      a.reset().play();
      this.clip = want;
      return;
    }
    if (this.playing === a) {
      // (the same clip for another want — a trot played as its run —: it plays on, not started over; looped or
      // once as the want is, the action being the clip's, shared by every want that falls back to it)
      if (this.clip !== want) {
        const once = this.clip !== null && ONCE.has(this.clip);
        this.loopFor(a, want);
        // (from a once — held at its end — to a loop, or back: from its start)
        if (once !== ONCE.has(want)) a.reset().play();
        this.clip = want;
      }
      return;
    }
    this.loopFor(a, want);
    a.reset().play();
    // (plan 129 F6) from one gait to another: on at the same point of its stride (the feet where they were); lying
    // down, getting up: slower — a body lowered, not dropped
    const was = this.clip;
    if (this.playing && was && GAITS.has(was) && GAITS.has(want)) {
      const from = this.playing;
      a.time = ((from.time % from.getClip().duration) / from.getClip().duration) * a.getClip().duration;
    }
    const slow = (was && LYING.has(was)) !== LYING.has(want);
    if (this.playing) this.playing.crossFadeTo(a, slow ? Math.max(fade, 0.7) : fade, false);
    this.playing = a;
    this.clip = want;
  }

  /** Its feet on the ground under them and its body along the slope (plan 129 F5, the feet's part): the root pitched
   *  to the land between its fore and hind feet, each foot (the four-legged's IK roots: the foot and its hoof) lifted
   *  or lowered to the land under it while it's down — near the camera only. `ground` is the land's height at a spot;
   *  `yaw` the way it faces (the world's). */
  plant(ground: (x: number, z: number) => number, yaw: number, scale: number) {
    if (!this.feet.length) return;
    const root = this.root;
    const half = this.length * 0.4 * scale;
    const cx = root.position.x;
    const cz = root.position.z;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const gF = ground(cx + fx * half, cz + fz * half);
    const gB = ground(cx - fx * half, cz - fz * half);
    const pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(gF - gB, half * 2)));
    root.position.y = (gF + gB) / 2;
    plantEuler.set(0, -yaw, pitch, "YZX");
    root.quaternion.setFromEuler(plantEuler);
    root.updateMatrixWorld(true);
    // each foot: where it is now, the land under it, the gap (only a foot that's down: within its own lift of the
    // ground it'd stand on)
    for (const f of this.feet) {
      f.bone.getWorldPosition(plantV);
      const g = ground(plantV.x, plantV.z);
      const flat = root.position.y + (plantV.x - cx) * Math.sin(pitch) * fx + (plantV.z - cz) * Math.sin(pitch) * fz;
      const lift = plantV.y - flat;
      const h = this.height * scale;
      if (lift > h * 0.12) continue;
      // (a little only: three solves no IK — the foot's bone moves its hoof, not the leg above it — so a land's
      // side-slope, a hummock under one foot; the slope itself is the body's pitch)
      const dy = Math.max(-h * 0.06, Math.min(h * 0.06, g - flat));
      if (Math.abs(dy) < 0.005) continue;
      const parent = f.bone.parent;
      if (!parent) continue;
      plantV.y += dy;
      parent.worldToLocal(plantV);
      f.bone.position.copy(plantV);
    }
  }

  private loopFor(a: AnimationAction, want: Clip) {
    if (ONCE.has(want)) {
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = true;
    } else {
      a.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
      a.clampWhenFinished = false;
    }
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
    // (the clone's own skeletons: their bone textures on the GPU; the geometry and the material are the model's,
    // shared by every clone, kept)
    this.root.traverse((o) => {
      const s = o as SkinnedMesh;
      if (s.isSkinnedMesh) s.skeleton.dispose();
    });
  }
}

/** A body for this model when it's loaded (null: not yet, or there's none). */
export class AnimalModels {
  private ready = new Map<string, Loaded | null>();
  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly patch: (m: Material) => void,
  ) {}

  private speeds: Record<string, Speeds> = {};
  body(model: string, young: boolean): AnimalBody | null {
    if (!this.ready.has(model)) {
      void animalManifest().then((m) => {
        for (const [k, v] of Object.entries(m)) if (v?.speeds) this.speeds[k] = v.speeds;
      });
      this.ready.set(model, null);
      // (ready with its speeds: a body made before the manifest came would keep none — its clips at a guess)
      void Promise.all([load(this.renderer, model, this.patch), animalManifest()]).then(([l]) => this.ready.set(model, l));
      return null;
    }
    const l = this.ready.get(model);
    if (!l) return null;
    const b = new AnimalBody(l, young && !ownYoung(model));
    b.speeds = this.speeds[model] ?? {};
    return b;
  }
}
