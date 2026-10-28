// The physics world (docs/plan/50-the-volume.md, B): Jolt, the same on the world server and in
// the browser, built from the same data (./build.ts). The one owner of every Jolt object
// (guardrail 3): bodies, shapes, characters and the scratch objects are made and destroyed here,
// nowhere else — feature code asks it things and never touches the Jolt module.
//
// Guardrails (docs/plan/50, "Guardrails"):
//   1. Sizes, never an abort: mMaxBodies, pairs and contacts fixed at creation from the world's
//      own counts (sizesFor: ×2 headroom); every add checked first — past the limit it's refused
//      and logged, never handed to Jolt (whose temp allocator, run out, aborts the process). And
//      its memory: this build's heap is a fixed 128 MB that never grows (a world ~14 MB empty,
//      the whole game's ~34 MB), and running out aborts Jolt for good — so a world isn't made,
//      nor an add made, without MIN_FREE left.
//   2. Continuous collision on everything that moves by itself: a thing (addThing) is always
//      EMotionQuality_LinearCast (without it 81 of 400 balls fell through the land).
//   3. One owner, scratch objects made once and reused; the long session's heap flat
//      (tools/physics-bench, `pnpm physics`).
//   4. Determinism: Jolt pinned at 1.1.1 with the bench's hashes (`pnpm physics`).
//
// Coordinates as the shapes' (shared/shapes): x, z the building's (z = map y), y up, metres.

import type Jolt from "jolt-physics";
import type { Solid3, SolidBox3 } from "../shapes/index.ts";
import type { JoltModule } from "./load.ts";

/** What the world may hold, fixed when it's made (Jolt can't grow them). */
export interface Sizes {
  maxBodies: number;
  maxPairs: number;
  maxContacts: number;
}

/** Sizes for a world of this much, with ×2 headroom (build mode adds, things get dropped). */
export function sizesFor(n: { statics: number; things?: number; vehicles?: number }): Sizes {
  const bodies = n.statics + (n.things ?? 0) + (n.vehicles ?? 0);
  const maxBodies = Math.max(1024, 2 * bodies);
  // (pairs and contacts: what moves touching what's near it — things and vehicles, a few each)
  const moving = (n.things ?? 0) + (n.vehicles ?? 0);
  const contacts = Math.max(4096, 2 * 8 * moving);
  return { maxBodies, maxPairs: contacts, maxContacts: contacts };
}

export interface PhysicsCounts {
  bodies: number;
  maxBodies: number;
  statics: number;
  things: number;
  vehicles: number;
  characters: number;
  /** adds refused for want of room (guardrail 1): anything but 0 wants bigger sizes */
  refused: number;
  /** Jolt's heap in use, bytes */
  heap: number;
}

/** A thing that falls (docs/plan/50, F): a ball or a crate, its size in m. */
export type Thing = { kind: "ball"; r: number } | { kind: "crate"; h: number };

/** A land chunk's heights: n × n samples `step` m apart from (x0, z0), row by row (z). */
export interface Land {
  x0: number;
  z0: number;
  n: number;
  step: number;
  h: Float32Array;
}

/** What a body is, for what meets it (Jolt's object layers): furniture; what moves (things falling,
 *  vehicles); the land; the floors' slabs; locked doors (passed by whoever may); walls (the
 *  building's, the Grounds' things — what sight doesn't go through). */
export const LAYER = { solid: 0, moving: 1, land: 2, floor: 3, door: 4, wall: 5 } as const;
export type Layer = keyof typeof LAYER;
const MOVING = LAYER.moving;
/** What a question or a body on the move meets: everything; through walls (an admin's power: only
 *  the floors and the land hold you); a ghost (through walls, flying: the floors too — up through
 *  a ceiling onto the next floor, docs/plan/50 D); tops (all but the land: what's stood on over
 *  it); the land; sight (walls, floors, doors, the land: not furniture, nothing moving — E). */
export type Mask = "all" | "clip" | "ghost" | "tops" | "land" | "sight";
const MEETS: Record<Mask, number[]> = {
  all: [0, 1, 2, 3, 4, 5],
  clip: [2, 3],
  ghost: [2],
  tops: [0, 1, 3, 4, 5],
  land: [2],
  sight: [2, 3, 4, 5],
};
// (a query's own layer, after the bodies' — no body is ever on one: it only says what it meets)
const QUERY: Record<Mask, number> = { all: 6, clip: 7, tops: 8, land: 9, sight: 10, ghost: 11 };
const LAYERS = 12;

/** A body's size (docs/plan/50 C): a capsule this round and tall, its feet at its position. */
export const BODY = { r: 0.25, h: 1.75 };
/** Bodies a question or a body on the move goes through (locked doors its owner may pass). */
export interface Pass {
  readonly keys: string;
}
const BLOCK = 4; // the heightfield's block size (its side a multiple of it: padded with holes)
const DT = 1 / 60;
const MB = 1024 * 1024;
const MIN_FREE = 16 * MB; // Jolt's heap kept free: an add past this is refused (guardrail 1)
const NEW_WORLD = 24 * MB; // what making a world wants free: its temp allocator (10 MB), its tables

/** Jolt's heap: what's free of it (all of it, not just what it's taken from the system yet). */
function freeOf(J: JoltModule): number {
  const used = J.JoltInterface.prototype.sGetTotalMemory() - J.JoltInterface.prototype.sGetFreeMemory();
  return J.HEAPU8.length - used;
}

interface Owned {
  body: Jolt.Body;
  id: Jolt.BodyID;
}

export class PhysicsWorld {
  private readonly statics = new Map<string, Owned>();
  private readonly things = new Map<number, Owned>();
  private readonly vehicles = new Map<string, Owned & { box: SolidBox3 }>();
  private readonly chars = new Map<number, Jolt.CharacterVirtual>();
  private nextThing = 1;
  private nextChar = 1;
  private refused = 0;
  private dead = false;
  // the one of each Jolt needs, made once
  private readonly jolt: Jolt.JoltInterface;
  private readonly system: Jolt.PhysicsSystem;
  private readonly bodies: Jolt.BodyInterface;
  private readonly charSettings: Jolt.CharacterVirtualSettings;
  private readonly walk: Jolt.ExtendedUpdateSettings;
  private readonly air: Jolt.ExtendedUpdateSettings;
  private readonly masks = {} as Record<Mask, { bp: Jolt.BroadPhaseLayerFilter; obj: Jolt.ObjectLayerFilter }>;
  private readonly bodyFilter: Jolt.BodyFilter;
  private readonly passes = new Map<string, { pass: Pass; filter: Jolt.BodyFilter }>();
  private readonly boxes = new Map<string, Jolt.Shape>();
  private readonly castSettings: Jolt.ShapeCastSettings;
  private readonly castHit: Jolt.CastShapeClosestHitCollisionCollector;
  private readonly shapeFilter: Jolt.ShapeFilter;
  // scratch, reused by every call
  private readonly v: Jolt.Vec3;
  private readonly zero: Jolt.Vec3;
  private readonly r: Jolt.RVec3;
  private readonly q: Jolt.Quat;
  private readonly ray: Jolt.RRayCast;
  private readonly hit: Jolt.CastRayClosestHitCollisionCollector;
  private readonly raySettings: Jolt.RayCastSettings;
  private readonly overlapHits: Jolt.CollideShapeAllHitCollisionCollector;
  private readonly overlapSettings: Jolt.CollideShapeSettings;
  private readonly one: Jolt.Vec3;
  private readonly spheres = new Map<number, Jolt.Shape>();

  private constructor(
    private readonly J: JoltModule,
    readonly sizes: Sizes,
    private readonly log: (msg: string) => void,
  ) {
    this.v = new J.Vec3(0, 0, 0);
    this.zero = new J.Vec3(0, 0, 0);
    this.one = new J.Vec3(1, 1, 1);
    this.r = new J.RVec3(0, 0, 0);
    this.q = new J.Quat(0, 0, 0, 1);
    const settings = new J.JoltSettings();
    settings.mMaxBodies = sizes.maxBodies;
    settings.mMaxBodyPairs = sizes.maxPairs;
    settings.mMaxContactConstraints = sizes.maxContacts;
    // what moves meets everything; each question's layer what its mask says. Two broadphase
    // layers: the still (walls, land, floors, doors) and the moving (and the questions')
    const pairs = new J.ObjectLayerPairFilterTable(LAYERS);
    for (const l of Object.values(LAYER)) pairs.EnableCollision(MOVING, l);
    for (const [m, q] of Object.entries(QUERY)) for (const l of MEETS[m as Mask]) pairs.EnableCollision(q, l);
    const bp = new J.BroadPhaseLayerInterfaceTable(LAYERS, 2);
    for (let l = 0; l < LAYERS; l++)
      bp.MapObjectToBroadPhaseLayer(l, new J.BroadPhaseLayer(l === MOVING || l >= QUERY.all ? 1 : 0));
    settings.mObjectLayerPairFilter = pairs;
    settings.mBroadPhaseLayerInterface = bp;
    settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bp, 2, pairs, LAYERS);
    this.jolt = new J.JoltInterface(settings);
    J.destroy(settings);
    this.system = this.jolt.GetPhysicsSystem();
    this.bodies = this.system.GetBodyInterface();
    for (const [m, q] of Object.entries(QUERY))
      this.masks[m as Mask] = {
        bp: new J.DefaultBroadPhaseLayerFilter(this.jolt.GetObjectVsBroadPhaseLayerFilter(), q),
        obj: new J.DefaultObjectLayerFilter(this.jolt.GetObjectLayerPairFilter(), q),
      };
    this.bodyFilter = new J.BodyFilter();
    this.castSettings = new J.ShapeCastSettings();
    this.castHit = new J.CastShapeClosestHitCollisionCollector();
    this.shapeFilter = new J.ShapeFilter();
    this.ray = new J.RRayCast();
    this.hit = new J.CastRayClosestHitCollisionCollector();
    this.raySettings = new J.RayCastSettings();
    this.overlapHits = new J.CollideShapeAllHitCollisionCollector();
    this.overlapSettings = new J.CollideShapeSettings();
    // a body (docs/plan/50 C): a capsule (BODY), its feet at its position; slopes to 45°; how high
    // it steps and how far down it's kept to the floor, each move's (shared/move's spec)
    this.walk = new J.ExtendedUpdateSettings();
    this.air = new J.ExtendedUpdateSettings();
    this.air.mWalkStairsStepUp = this.zero;
    this.air.mStickToFloorStepDown = this.zero;
    this.charSettings = new J.CharacterVirtualSettings();
    this.charSettings.mMaxSlopeAngle = (45 * Math.PI) / 180;
    const capsule = new J.CapsuleShapeSettings(BODY.h / 2 - BODY.r, BODY.r);
    this.v.Set(0, BODY.h / 2, 0);
    const up = new J.RotatedTranslatedShapeSettings(this.v, J.Quat.prototype.sIdentity(), capsule);
    const body = this.shape(up);
    if (!body) throw new Error("[physics] no body shape");
    this.charSettings.mShape = body;
    const plane = new J.Plane(J.Vec3.prototype.sAxisY(), -0.3);
    this.charSettings.mSupportingVolume = plane;
    J.destroy(plane);
    this.charSettings.mCharacterPadding = 0.02;
  }

  /** A world of these sizes; `log` hears what's refused (guardrail 1). Throws (never aborts) if
   *  Jolt's heap hasn't room for another. */
  static async create(load: () => Promise<JoltModule>, sizes: Sizes, log = (m: string) => console.warn(m)) {
    const J = await load();
    const free = freeOf(J);
    if (free < NEW_WORLD)
      throw new Error(`[physics] no room for a world: ${(free / MB).toFixed(1)} MB of Jolt's 128 MB heap free`);
    return new PhysicsWorld(J, sizes, log);
  }

  // ── what's there ──
  private room(what: string): boolean {
    if (this.dead) return false;
    const free = freeOf(this.J);
    if (this.system.GetNumBodies() < this.sizes.maxBodies && free > MIN_FREE) return true;
    this.refused++;
    if (this.refused === 1 || this.refused % 100 === 0)
      this.log(
        `[physics] full (${this.sizes.maxBodies} bodies, ${(free / MB).toFixed(1)} MB of Jolt's heap free): ${what} refused (${this.refused} so far)`,
      );
    return false;
  }

  /** A shape from its settings, the settings gone; held once (Release it when done: a body holds
   *  its own). Null if Jolt wouldn't make it (logged). */
  private shape(s: Jolt.ShapeSettings): Jolt.Shape | null {
    const res = s.Create();
    const bad = res.HasError();
    const shape = bad ? null : res.Get();
    if (bad) this.log(`[physics] a shape refused: ${res.GetError().c_str()}`);
    shape?.AddRef();
    this.J.destroy(res);
    this.J.destroy(s);
    return shape;
  }

  private solidSettings(s: Solid3): Jolt.ShapeSettings | null {
    const J = this.J;
    if (s.t === "box") {
      const m = Math.min(s.hx, s.hy, s.hz);
      if (!(m > 0.001)) return null;
      this.v.Set(s.hx, s.hy, s.hz);
      return new J.BoxShapeSettings(this.v, Math.min(0.05, m * 0.5));
    }
    const hh = (s.y1 - s.y0) / 2;
    if (!(hh > 0.001 && s.r > 0.001)) return null;
    return new J.CylinderShapeSettings(hh, s.r, Math.min(0.05, s.r * 0.5, hh * 0.5));
  }

  private middle(s: Solid3): [number, number, number] {
    return s.t === "box" ? [s.x, s.y, s.z] : [s.x, (s.y0 + s.y1) / 2, s.z];
  }

  private turn(a: number): Jolt.Quat {
    // (about y as three.js's rotation.y: shared/shapes)
    this.q.Set(0, Math.sin(a / 2), 0, Math.cos(a / 2));
    return this.q;
  }

  private settings(shape: Jolt.Shape, x: number, y: number, z: number, a: number, motion: number, layer: number) {
    this.r.Set(x, y, z);
    return new this.J.BodyCreationSettings(shape, this.r, this.turn(a), motion, layer);
  }

  private make(bcs: Jolt.BodyCreationSettings, activate: boolean): Owned {
    const body = this.bodies.CreateBody(bcs);
    this.J.destroy(bcs);
    const id = body.GetID();
    this.bodies.AddBody(id, activate ? this.J.EActivation_Activate : this.J.EActivation_DontActivate);
    return { body, id };
  }

  // (its shape goes with it: the body held the only ref — shape() gave ours up once it was made)
  private drop(o: Owned) {
    this.bodies.RemoveBody(o.id);
    this.bodies.DestroyBody(o.id);
  }

  /** Statics under a key (a chunk's Grounds, a floor's walls, a thing in the building): one body,
   *  a compound of them; again with the same key replaces them, none removes them. Each solid
   *  in world coords; the body sits at the first one's middle. False if refused. */
  setStatic(key: string, solids: Solid3[], layer: Layer = "solid"): boolean {
    this.remove(key);
    if (key.startsWith("door:")) this.dropPasses();
    if (!solids.length || !this.room(`statics ${key}`)) return false;
    const J = this.J;
    const [ox, oy, oz] = this.middle(solids[0]);
    const cs = new J.StaticCompoundShapeSettings();
    let n = 0;
    for (const s of solids) {
      const st = this.solidSettings(s);
      if (!st) continue;
      const [x, y, z] = this.middle(s);
      this.v.Set(x - ox, y - oy, z - oz);
      cs.AddShape(this.v, this.turn(s.t === "box" ? s.a : 0), st, 0);
      n++;
    }
    if (!n) {
      J.destroy(cs);
      return false;
    }
    const shape = this.shape(cs);
    if (!shape) return false;
    this.statics.set(key, this.make(this.settings(shape, ox, oy, oz, 0, J.EMotionType_Static, LAYER[layer]), false));
    shape.Release();
    return true;
  }

  /** The land under a key: a heightfield (its side padded to Jolt's block size with holes, so it
   *  ends where its chunk does — no flat skirt over the next one). */
  setLand(key: string, land: Land): boolean {
    this.remove(key);
    if (!this.room(`land ${key}`)) return false;
    const J = this.J;
    const n = Math.ceil(land.n / BLOCK) * BLOCK;
    const hs = new J.HeightFieldShapeSettings();
    this.v.Set(land.x0, 0, land.z0);
    hs.mOffset = this.v;
    this.v.Set(land.step, 1, land.step);
    hs.mScale = this.v;
    hs.mSampleCount = n;
    hs.mBlockSize = BLOCK;
    hs.mHeightSamples.resize(n * n);
    const hole = J.HeightFieldShapeConstantValues.prototype.cNoCollisionValue;
    const out = new Float32Array(J.HEAPF32.buffer, J.getPointer(hs.mHeightSamples.data()), n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) out[j * n + i] = i < land.n && j < land.n ? land.h[j * land.n + i] : hole;
    const shape = this.shape(hs);
    if (!shape) return false;
    this.statics.set(key, this.make(this.settings(shape, 0, 0, 0, 0, J.EMotionType_Static, LAYER.land), false));
    shape.Release();
    return true;
  }

  /** Statics gone (a key from setStatic or setLand). */
  remove(key: string): void {
    const o = this.statics.get(key);
    if (!o) return;
    this.drop(o);
    this.statics.delete(key);
    // (a door's body made again has another id: who passes which made again too)
    if (key.startsWith("door:")) this.dropPasses();
  }
  private dropPasses(): void {
    for (const p of this.passes.values()) this.J.destroy(p.filter);
    this.passes.clear();
  }

  has(key: string): boolean {
    return this.statics.has(key);
  }

  /** Every static key (the builders diff against it). */
  keys(): IterableIterator<string> {
    return this.statics.keys();
  }

  /** Once the statics are in (the broadphase sorted for queries). */
  settle(): void {
    this.system.OptimizeBroadPhase();
  }

  // ── things that fall (docs/plan/50 F; guardrail 2: LinearCast, always) ──
  addThing(t: Thing, x: number, y: number, z: number): number | null {
    if (!this.room(`a ${t.kind}`)) return null;
    const J = this.J;
    let st: Jolt.ShapeSettings;
    if (t.kind === "ball") st = new J.SphereShapeSettings(t.r);
    else {
      this.v.Set(t.h, t.h, t.h);
      st = new J.BoxShapeSettings(this.v, Math.min(0.05, t.h * 0.5));
    }
    const shape = this.shape(st);
    if (!shape) return null;
    const bcs = this.settings(shape, x, y, z, 0, J.EMotionType_Dynamic, MOVING);
    bcs.mMotionQuality = J.EMotionQuality_LinearCast;
    if (t.kind === "ball") bcs.mRestitution = 0.3;
    const id = this.nextThing++;
    this.things.set(id, this.make(bcs, true));
    shape.Release();
    return id;
  }

  thingAt(id: number, out: [number, number, number]): boolean {
    const o = this.things.get(id);
    if (!o) return false;
    const p = this.bodies.GetPosition(o.id);
    out[0] = p.GetX();
    out[1] = p.GetY();
    out[2] = p.GetZ();
    return true;
  }

  thingAsleep(id: number): boolean {
    const o = this.things.get(id);
    return !!o && !this.bodies.IsActive(o.id);
  }

  removeThing(id: number): void {
    const o = this.things.get(id);
    if (!o) return;
    this.drop(o);
    this.things.delete(id);
  }

  // ── vehicles: kinematic boxes the car sim moves (it stays their driver) ──
  setVehicle(id: string, box: SolidBox3): boolean {
    const J = this.J;
    const had = this.vehicles.get(id);
    if (had && had.box.hx === box.hx && had.box.hy === box.hy && had.box.hz === box.hz) {
      this.r.Set(box.x, box.y, box.z);
      this.bodies.SetPositionAndRotationWhenChanged(had.id, this.r, this.turn(box.a), J.EActivation_DontActivate);
      had.box = box;
      return true;
    }
    this.removeVehicle(id);
    if (!this.room(`vehicle ${id}`)) return false;
    const st = this.solidSettings(box);
    if (!st) return false;
    const shape = this.shape(st);
    if (!shape) return false;
    const o = this.make(this.settings(shape, box.x, box.y, box.z, box.a, J.EMotionType_Kinematic, MOVING), false);
    shape.Release();
    this.vehicles.set(id, { ...o, box });
    return true;
  }

  removeVehicle(id: string): void {
    const o = this.vehicles.get(id);
    if (!o) return;
    this.drop(o);
    this.vehicles.delete(id);
  }

  vehicleIds(): IterableIterator<string> {
    return this.vehicles.keys();
  }

  // ── bodies (docs/plan/50 C; phase 3 moves people with them) ──
  addCharacter(x: number, y: number, z: number): number | null {
    if (this.dead) return null;
    this.r.Set(x, y, z);
    const ch = new this.J.CharacterVirtual(this.charSettings, this.r, this.J.Quat.prototype.sIdentity(), this.system);
    const id = this.nextChar++;
    this.chars.set(id, ch);
    return id;
  }

  /** Moved by its velocity (m/s) for dt, sliding along what's in the way. Walking: up a step
   *  `stepUp` high without a jump and kept to the floor down to `stickDown` (`walking` false: in
   *  the air, neither). What it meets: `mask`, less what `pass` lets it through. True: on the
   *  ground after. */
  moveCharacter(
    id: number,
    vx: number,
    vy: number,
    vz: number,
    dt: number,
    walking: boolean,
    o: { stepUp?: number; stickDown?: number; mask?: Mask; pass?: Pass | null } = {},
  ): boolean {
    const ch = this.chars.get(id);
    if (!ch) return false;
    const m = this.masks[o.mask ?? "all"];
    if (walking) {
      this.v.Set(0, o.stepUp ?? 0.35, 0);
      this.walk.mWalkStairsStepUp = this.v;
      this.v.Set(0, -(o.stickDown ?? 0.5), 0);
      this.walk.mStickToFloorStepDown = this.v;
    }
    this.v.Set(vx, vy, vz);
    ch.SetLinearVelocity(this.v);
    const pass = this.passFilter(o.pass);
    const temp = this.jolt.GetTempAllocator();
    ch.ExtendedUpdate(dt, this.zero, walking ? this.walk : this.air, m.bp, m.obj, pass, this.shapeFilter, temp);
    const on = ch.GetGroundState() === this.J.EGroundState_OnGround;
    if (on || !walking) return on;
    // (off a stair's edge walking: down onto the tread, as the move steps down — Jolt's own update
    // only sticks when it was on the ground the whole update)
    this.v.Set(0, -(o.stickDown ?? 0.5), 0);
    return ch.StickToFloor(this.v, m.bp, m.obj, pass, this.shapeFilter, temp);
  }

  characterAt(id: number, out: [number, number, number]): boolean {
    const ch = this.chars.get(id);
    if (!ch) return false;
    const p = ch.GetPosition();
    out[0] = p.GetX();
    out[1] = p.GetY();
    out[2] = p.GetZ();
    return true;
  }

  placeCharacter(id: number, x: number, y: number, z: number): void {
    const ch = this.chars.get(id);
    if (!ch) return;
    this.r.Set(x, y, z);
    ch.SetPosition(this.r);
  }

  removeCharacter(id: number): void {
    const ch = this.chars.get(id);
    if (!ch) return;
    this.J.destroy(ch);
    this.chars.delete(id);
  }

  // ── time ──
  step(dt = DT): void {
    if (!this.dead) this.jolt.Step(dt, 1);
  }

  // ── who goes through what (locked doors: their owner) ──
  /** Bodies under these keys gone through (a person's own locked doors); made once a set. */
  pass(keys: string[]): Pass | null {
    if (!keys.length) return null;
    const k = [...keys].sort().join("|");
    const had = this.passes.get(k);
    if (had) return had.pass;
    const J = this.J;
    const ids = new Set<number>();
    for (const key of keys) {
      const o = this.statics.get(key);
      if (o) ids.add(o.id.GetIndexAndSequenceNumber());
    }
    const filter = new J.BodyFilterJS();
    filter.ShouldCollide = (ptr: number) => !ids.has(J.wrapPointer(ptr, J.BodyID).GetIndexAndSequenceNumber());
    filter.ShouldCollideLocked = () => true;
    const pass: Pass = { keys: k };
    this.passes.set(k, { pass, filter });
    return pass;
  }
  private passFilter(p: Pass | null | undefined): Jolt.BodyFilter {
    return (p && this.passes.get(p.keys)?.filter) || this.bodyFilter;
  }

  // ── questions (where a body fits and what's under it: the move's, the server's check; reach
  //    and sight: docs/plan/50 E) ──
  /** How far along (ox, oy, oz) + (dx, dy, dz)·t the first solid is, t ≤ max (d a unit
   *  vector), or null. */
  rayHit(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    max: number,
    mask: Mask = "all",
  ): number | null {
    if (this.dead) return null;
    const m = this.masks[mask];
    this.ray.mOrigin.Set(ox, oy, oz);
    this.ray.mDirection.Set(dx * max, dy * max, dz * max);
    this.hit.Reset();
    this.system
      .GetNarrowPhaseQuery()
      .CastRay(this.ray, this.raySettings, this.hit, m.bp, m.obj, this.bodyFilter, this.shapeFilter);
    return this.hit.HadHit() ? this.hit.mHit.mFraction * max : null;
  }

  /** Nothing that stops sight (walls, floors, doors, the land) between two points (a hand and what
   *  it reaches for: docs/plan/50 E) — `skip` m short of the far one (its own surface). */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, skip = 0.05): boolean {
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    if (d <= skip) return true;
    return this.rayHit(ax, ay, az, (bx - ax) / d, (by - ay) / d, (bz - az) / d, d - skip, "sight") === null;
  }

  // an upright box r each way across and h tall (made once a size)
  private boxOf(r: number, h: number): Jolt.Shape | null {
    const k = `${r}|${h}`;
    let b = this.boxes.get(k);
    if (!b) {
      this.v.Set(r, h / 2, r);
      b = this.shape(new this.J.BoxShapeSettings(this.v, Math.min(0.02, r * 0.5, h * 0.25))) ?? undefined;
      if (!b) return null;
      this.boxes.set(k, b);
    }
    return b;
  }

  /** Nothing in an upright box r each way across, h tall, its foot at (x, y, z) — of what `mask`
   *  meets, less what `pass` goes through: a body fits there. */
  fits(x: number, y: number, z: number, r: number, h: number, mask: Mask = "all", pass?: Pass | null): boolean {
    if (this.dead) return true;
    const shape = this.boxOf(r, h);
    if (!shape) return true;
    const m = this.masks[mask];
    this.r.Set(x, y + h / 2, z);
    const at = this.J.RMat44.prototype.sTranslation(this.r);
    this.overlapHits.Reset();
    this.r.Set(0, 0, 0);
    this.system
      .GetNarrowPhaseQuery()
      .CollideShape(
        shape,
        this.one,
        at,
        this.overlapSettings,
        this.r,
        this.overlapHits,
        m.bp,
        m.obj,
        this.passFilter(pass),
        this.shapeFilter,
      );
    return this.overlapHits.mHits.size() === 0;
  }

  /** The top of what's under a square r each way across at (x, z): the highest no higher than
   *  `top`, down to `depth` below it (a thin box let down from there) — or null, nothing. */
  groundUnder(
    x: number,
    top: number,
    z: number,
    r: number,
    depth: number,
    mask: Mask = "all",
    pass?: Pass | null,
  ): number | null {
    if (this.dead) return null;
    const T = 0.01;
    const shape = this.boxOf(r, T);
    if (!shape) return null;
    const J = this.J;
    const m = this.masks[mask];
    this.r.Set(x, top + T / 2, z);
    this.v.Set(0, -depth, 0);
    const cast = new J.RShapeCast(shape, this.one, J.RMat44.prototype.sTranslation(this.r), this.v);
    this.castHit.Reset();
    this.r.Set(0, 0, 0);
    this.system
      .GetNarrowPhaseQuery()
      .CastShape(cast, this.castSettings, this.r, this.castHit, m.bp, m.obj, this.passFilter(pass), this.shapeFilter);
    J.destroy(cast);
    return this.castHit.HadHit() ? top - this.castHit.mHit.mFraction * depth : null;
  }

  /** How many solids a sphere at (x, y, z) touches. */
  overlaps(x: number, y: number, z: number, r: number): number {
    if (this.dead) return 0;
    const J = this.J;
    let shape = this.spheres.get(r);
    if (!shape) {
      shape = this.shape(new J.SphereShapeSettings(r)) ?? undefined;
      if (!shape) return 0;
      this.spheres.set(r, shape);
    }
    this.r.Set(x, y, z);
    const at = J.RMat44.prototype.sTranslation(this.r);
    this.overlapHits.Reset();
    this.r.Set(0, 0, 0);
    this.system
      .GetNarrowPhaseQuery()
      .CollideShape(
        shape,
        this.one,
        at,
        this.overlapSettings,
        this.r,
        this.overlapHits,
        this.masks.all.bp,
        this.masks.all.obj,
        this.bodyFilter,
        this.shapeFilter,
      );
    return this.overlapHits.mHits.size();
  }

  counts(): PhysicsCounts {
    const J = this.J;
    return {
      bodies: this.dead ? 0 : this.system.GetNumBodies(),
      maxBodies: this.sizes.maxBodies,
      statics: this.statics.size,
      things: this.things.size,
      vehicles: this.vehicles.size,
      characters: this.chars.size,
      refused: this.refused,
      heap: J.JoltInterface.prototype.sGetTotalMemory() - J.JoltInterface.prototype.sGetFreeMemory(),
    };
  }

  /** Every solid near (x, z) as Jolt has it, its triangles' edges as line segments (x, y, z
   *  pairs) — the admins' debug view. At most `max` triangles. */
  debugLines(x: number, z: number, r: number, max = 400_000): Float32Array {
    const J = this.J;
    const out: number[] = [];
    let tris = 0;
    const box = J.AABox.prototype.sBiggest();
    const ids = new J.BodyIDVector();
    this.system.GetBodies(ids);
    const scale = new J.Vec3(1, 1, 1);
    const at = new J.Vec3(0, 0, 0);
    for (let i = 0; i < ids.size() && tris < max; i++) {
      const id = ids.at(i);
      // (Jolt hands these back in reused temporaries: read at once, never destroyed)
      const ts = this.bodies.GetTransformedShape(id);
      const com = ts.mShapePositionCOM;
      at.Set(com.GetX(), com.GetY(), com.GetZ());
      const bounds = ts.GetWorldSpaceBounds();
      const [x0, z0, x1, z1] = [bounds.mMin.GetX(), bounds.mMin.GetZ(), bounds.mMax.GetX(), bounds.mMax.GetZ()];
      // (by its bounds: a land chunk's or a long wall's reach)
      if (x1 < x - r || x0 > x + r || z1 < z - r || z0 > z + r) continue;
      const shape = this.bodies.GetShape(id);
      const t = new J.ShapeGetTriangles(shape, box, at, this.bodies.GetRotation(id), scale);
      const n = t.GetNumTriangles();
      // (a raw pointer into Jolt's heap: 3 vertices of 3 floats a triangle)
      const v = new Float32Array(J.HEAPF32.buffer, t.GetVerticesData() as number, n * 9);
      for (let k = 0; k < n && tris < max; k++, tris++) {
        const o = k * 9;
        for (const [a, c] of [
          [0, 3],
          [3, 6],
          [6, 0],
        ])
          out.push(v[o + a], v[o + a + 1], v[o + a + 2], v[o + c], v[o + c + 1], v[o + c + 2]);
      }
      J.destroy(t);
    }
    J.destroy(ids);
    J.destroy(scale);
    J.destroy(at);
    return Float32Array.from(out);
  }

  /** Everything gone, Jolt's memory with it. */
  destroy(): void {
    if (this.dead) return;
    const J = this.J;
    for (const id of [...this.chars.keys()]) this.removeCharacter(id);
    for (const id of [...this.things.keys()]) this.removeThing(id);
    for (const id of [...this.vehicles.keys()]) this.removeVehicle(id);
    for (const k of [...this.statics.keys()]) this.remove(k);
    for (const s of [...this.spheres.values(), ...this.boxes.values()]) s.Release();
    this.spheres.clear();
    this.boxes.clear();
    this.dropPasses();
    for (const m of Object.values(this.masks)) {
      J.destroy(m.bp);
      J.destroy(m.obj);
    }
    this.charSettings.mShape.Release();
    for (const o of [
      this.walk,
      this.air,
      this.charSettings,
      this.bodyFilter,
      this.castSettings,
      this.castHit,
      this.shapeFilter,
      this.v,
      this.zero,
      this.one,
      this.r,
      this.q,
      this.ray,
      this.hit,
      this.raySettings,
      this.overlapHits,
      this.overlapSettings,
    ])
      J.destroy(o);
    J.destroy(this.jolt);
    this.dead = true;
  }
}
