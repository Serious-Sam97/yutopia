import { levelMap, liftShafts, type MapDef, shaftAt, type WorldObjectDef } from "@yutopia/shared";
import { CHUNK, hasChunk, iceHolesNow, onGroundsChanged, underfoot } from "@yutopia/shared/grounds";
import type { Collider, FlowWorld, Mover } from "@yutopia/shared/move";
import {
  type BuildingSolids,
  buildingSolids,
  CharacterMover,
  chunksOfHoles,
  type Frame,
  GroundsFlow,
  groundsThingAt,
  loadJolt,
  PhysicsWorld,
  Place,
  passKeys,
  sizesFor,
  slabsOf,
  staticCount,
  type Through,
  WorldBuilder,
} from "@yutopia/shared/physics";
import type { Solid3 } from "@yutopia/shared/shapes";
import { solidsInSteps } from "@yutopia/shared/shapes/grounds";
import { landHoles, type Structure } from "@yutopia/shared/structure";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Scene } from "three";
import { afterFrameSteps } from "../after-frame";

// The browser's physics world (docs/plan/50-the-volume.md): Jolt, built from the same data as the
// server's (shared physics/build.ts) — the building, kept to the world as it's edited, and the
// Grounds' chunks round you as the view makes their land. My body moves on it in 3D (phase 3: the
// walker's mover and its questions — input/walker.ts), the server checking it on its own. The
// admins see every solid near them in amber (Powers → Physics shapes). Jolt loads with the 3D view
// (its own chunk: guardrail 5); till it's in, the grid moves me. A chunk that changes (the park's
// layout raced, god mode's edits laid — docs/plan/53-the-god-mode.md) is made again once its land
// is, round you; till then its old solids stay.

const NEAR = 40; // m round you, drawn
const RING = 2; // Grounds chunks each way round you, built (the land the view has made)
const KEEP = RING + 2; // …and kept till you're this many away (docs/plan/69, L2: the land is long)
const EVERY_MS = 1000;
const MOVED = 6; // m you go before it's drawn again
// (docs/plan/92 phase 3: a car going fast — the land built along where it'll be over the next AHEAD_S,
// a few chunks a call, the nearest in time first; asked again every AHEAD_MS while it's driven)
const AHEAD_S = 3;
const AHEAD_MS = 200;
// (one a call: a chunk is made here, on the main thread, ~45 ms — ~110 on a slow machine; two were a frame of ~200.
// One every 200 ms is three in the 0.6 s a chunk under the car must be in by — 180 km/h crosses one in 0.64 s.
// The heights made in a worker, as the view's are, would take it off the main thread: docs/plan/92 phase 10, left)
const AHEAD_PER = 1;

export interface PhysicsSource {
  /** the building (the home floor, carrying the others) and every thing in it */
  world(): { building: MapDef; objects: WorldObjectDef[]; structure?: Structure | null };
  /** where you are, the building's coords */
  at(): { x: number; z: number };
  /** a floor's place in the building */
  frameOf(level: number): Frame;
  /** what's added to the building's coords to put them in the scene (the floor you see) */
  frame(): { x: number; y: number; z: number };
}

export class BrowserPhysics {
  private readonly timer: ReturnType<typeof setInterval>;
  private solids: BuildingSolids;
  private seen: WorldObjectDef[];
  private seenMap: MapDef;
  private lines: LineSegments | null = null;
  private drawn: { x: number; z: number; rev: string } | null = null;
  private rev = 0;
  private dead = false;
  // my body: one Jolt character, on whichever floor I'm on, through what I pass
  private readonly mover: CharacterMover;
  // what Flowmotion moves off out on the Grounds (docs/plan/56-the-controls.md F): their solids by
  // what each is, on my floor's frame — and the building's walls and pieces with the outside on a side
  private readonly flow: GroundsFlow;
  private level = 0;
  private through: Through = { mask: "all", pass: null };
  private land: Place | null = null;
  // the places asked for lately, by who, which floor and how (made again when the building changes)
  private places = new Map<string, Place>();
  private placesOf: unknown = null;
  // the chunks changed since they were built here (made again when their land is)
  private readonly stale = new Set<string>();
  private holesSig = "[]";
  private holesWere: { x0: number; z0: number; x1: number; z1: number }[] = [];
  // (plan 92) a car driven here: where it is and goes, and when it last said so
  private ahead: { x: number; z: number; vx: number; vz: number } | null = null;
  private aheadAt = 0;
  private aheadBuilt = 0;
  private readonly offChanged: () => void;

  private constructor(
    private readonly scene: Scene,
    private readonly src: PhysicsSource,
    private readonly world: PhysicsWorld,
    private readonly build: WorldBuilder,
    first: { solids: BuildingSolids; objects: WorldObjectDef[]; building: MapDef },
  ) {
    this.solids = first.solids;
    this.seen = first.objects;
    this.seenMap = first.building;
    this.mover = new CharacterMover(
      world,
      () => this.src.frameOf(this.level),
      () => this.through,
      (x, y) => !!this.land?.onLand(x, y),
    );
    // up and down the hills at the body's own pace (docs/plan/56-the-controls.md H.3)
    this.mover.along = true;
    this.flow = new GroundsFlow(() => this.src.frameOf(this.level));
    this.flow.building(this.solids.flow);
    this.offChanged = onGroundsChanged((cs, why) => {
      for (const [cx, cz] of cs) {
        if (this.world.has(`land:${cx},${cz}`)) this.stale.add(`${cx},${cz}`);
        if (why === "edits") this.forgetSoon.push([cx, cz]);
        else this.flow.forget(cx, cz);
      }
      if (why === "edits") this.remakeSoon();
    });
    this.timer = setInterval(() => this.refresh(), EVERY_MS);
    this.refresh();
  }

  // An edit laid (god mode's publish): the Grounds' solids made again (~6 ms) a slice after each frame (after-frame.ts),
  // and only then Flowmotion's parts of the chunks it moved asked afresh: made in the frame Flowmotion first asked, on
  // top of the frame's own, they were a frame missed at every publish (docs/plan/122). Flowmotion runs on the old parts
  // there meanwhile — a few frames —: the land drawn there is the old one still.
  private forgetSoon: [number, number][] = [];
  private remaking = false;
  private remakeSoon() {
    if (this.remaking) return;
    this.remaking = true;
    const made = solidsInSteps();
    afterFrameSteps(() => {
      if (this.dead) return true;
      if (!made()) return false;
      this.remaking = false;
      for (const [cx, cz] of this.forgetSoon.splice(0)) this.flow.forget(cx, cz);
      return true;
    });
  }

  /** (plan 58 5d) The world to lay a ragdoll in, and where its origin is in the scene (my floor's frame). */
  ragdollSpace(): { world: PhysicsWorld; origin: () => { x: number; y: number; z: number } } {
    return { world: this.world, origin: () => this.src.frame() };
  }
  /** (plan 58 5d) A step for what's loose in it (the ragdolls, what's worn swinging — plan 61: the
   *  walker's character moves itself). */
  step(dt: number): void {
    // (a car on Jolt here: two collision steps a frame — 120 Hz for its wheels, docs/plan/92)
    this.world.step(Math.min(dt, 1 / 30), this.carsBusy() ? 2 : 1);
  }

  /** (plan 92 feedback) My car steps the world itself, a fixed step at a time, in the cars' frame
   *  (car/cars.ts drive): its step, and that it did this frame — the view's own step skipped. */
  carStep(h: number): void {
    this.world.step(h, 2);
  }
  carStepped = false;

  // ── cars on Jolt (docs/plan/92 phase 3) ──
  /** The world cars are made in (shared physics addCar / addPulled). */
  get carWorld(): PhysicsWorld {
    return this.world;
  }
  /** Cars here want the world stepped each frame (the view's step: while anyone's down, swings, or drives). */
  carsBusy(): boolean {
    return !this.dead && (this.world.carCount() > 0 || performance.now() - this.aheadAt < 500);
  }
  private readonly onJolt = new Set<string>();
  /** A car (`car:<object id>`) driven here on Jolt: its parked box gone from the world while it is
   *  (else the new car is made inside it, and thrown out of it); off, it's the world's again. */
  ownCar(id: string, on: boolean): void {
    if (on) {
      this.onJolt.add(id);
      this.world.removeVehicle(id);
    } else this.onJolt.delete(id);
  }
  /** My car this frame (the Grounds' coords, m/s): the land made ahead of it. */
  drivingAt(x: number, z: number, vx: number, vz: number): void {
    this.ahead = { x, z, vx, vz };
    const now = performance.now();
    this.aheadAt = now;
    if (now - this.aheadBuilt < AHEAD_MS || this.dead) return;
    this.aheadBuilt = now;
    // the chunks it'll be in over the next few seconds, and a chunk either side: the nearest in time first
    const want: [number, number, number][] = [];
    const seen = new Set<string>();
    const sp = Math.hypot(vx, vz);
    const steps = Math.max(1, Math.ceil((sp * AHEAD_S) / (CHUNK / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * AHEAD_S;
      const px = x + vx * t;
      const pz = z + vz * t;
      const cx = Math.floor(px / CHUNK);
      const cz = Math.floor(pz / CHUNK);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${cx + dx},${cz + dz}`;
          if (seen.has(k)) continue;
          seen.add(k);
          want.push([cx + dx, cz + dz, t + (dx || dz ? 0.5 : 0)]);
        }
    }
    want.sort((a, b) => a[2] - b[2]);
    let made = 0;
    for (const [cx, cz, t] of want) {
      if (made >= AHEAD_PER) break;
      if (this.world.has(`land:${cx},${cz}`)) continue;
      // (the view's land where it's made; under the car or just ahead of it, made now whatever — never
      // a car on no land)
      if (!hasChunk(cx, cz) && t > 0.6) continue;
      this.build.groundChunk(cx, cz);
      made++;
    }
    if (made) {
      this.world.settle();
      this.rev++;
    }
  }

  /** How far from a point of the scene (the floor I see) along (dx, dy, dz) the first wall, floor or
   *  the land is (sight's mask: not furniture, not what moves), or null — the camera keeping out of
   *  them (docs/plan/56-the-controls.md H.6). */
  ray(x: number, y: number, z: number, dx: number, dy: number, dz: number, max: number): number | null {
    const f = this.src.frame();
    return this.world.rayHit(x - f.x, y - f.y, z - f.z, dx, dy, dz, max, "sight");
  }
  static async start(scene: Scene, src: PhysicsSource): Promise<BrowserPhysics> {
    const { building, objects, structure } = src.world();
    const solids = buildingSolids(building, objects, structure ?? undefined);
    const chunks = (2 * KEEP + 1) ** 2 + (2 * RING + 1) ** 2; // (round you, those kept, a jump's worth)
    const world = await PhysicsWorld.create(
      loadJolt,
      // (worn: what swings on people near and their stand-ins — docs/plan/61, me and six, ~16 each)
      sizesFor({ statics: staticCount(solids, chunks), vehicles: solids.cars.size + 16, worn: 7 * 16 }),
    );
    const build = new WorldBuilder(world);
    build.building(solids);
    return new BrowserPhysics(scene, src, world, build, { solids, objects, building });
  }

  // the building as it is now (an edit: only what changed made again)
  private keepUp(): number {
    const { building, objects, structure } = this.src.world();
    // (a wall built or taken away is the map's: it too)
    if (objects === this.seen && building === this.seenMap) return 0;
    this.seen = objects;
    this.seenMap = building;
    // (plan 130: a basement dug, a pool — the land's holes: its chunks there made again)
    const holes = landHoles();
    const sig = JSON.stringify(holes);
    if (sig !== this.holesSig) {
      for (const [cx, cz] of chunksOfHoles([...this.holesWere, ...holes]))
        if (this.world.has(`land:${cx},${cz}`)) this.stale.add(`${cx},${cz}`);
      this.holesSig = sig;
      this.holesWere = [...holes];
    }
    this.solids = buildingSolids(building, objects, structure ?? undefined);
    // (a parked car driven here on Jolt: its parked box not made again under it — docs/plan/92)
    for (const id of this.onJolt) this.solids.cars.delete(id);
    this.flow.building(this.solids.flow);
    const made = this.build.building(this.solids);
    return made.made + made.removed;
  }

  /** The building's edit in Jolt now, not at the next second's refresh — and whether floor `level` has its slab
   *  there: a storey just put on, stood on before I'm taken up onto it (else the old roof under it held me, read as
   *  the land's — 2026-11-26). */
  floorReady(level: number): boolean {
    if (this.dead) return false;
    if (this.keepUp()) {
      this.world.settle();
      this.rev++;
    }
    for (const k of this.solids.statics.keys()) if (k.startsWith(`slab:${level}:`)) return true;
    return false;
  }

  private refresh() {
    if (this.dead) return;
    const edits = this.keepUp();
    // the water's ice as the room's weather has it, and its holes (W6; plan 66 S4: a hole I break
    // gives within the second)
    this.build.ice(underfoot().ice, iceHolesNow());
    const me = this.src.at();
    const cx = Math.floor(me.x / CHUNK);
    const cz = Math.floor(me.z / CHUNK);
    let more = 0;
    for (let dz = -RING; dz <= RING; dz++)
      for (let dx = -RING; dx <= RING; dx++) {
        const k = `${cx + dx},${cz + dz}`;
        if (!hasChunk(cx + dx, cz + dz)) continue;
        const again = this.stale.delete(k);
        if (again || !this.world.has(`land:${k}`)) {
          this.build.groundChunk(cx + dx, cz + dz, again);
          more++;
        }
      }
    // (behind you: out — they're built again if you come back; ahead of a car going fast: kept)
    const ah = this.ahead && performance.now() - this.aheadAt < 2000 ? this.ahead : null;
    const acx = ah ? Math.floor((ah.x + ah.vx * AHEAD_S) / CHUNK) : cx;
    const acz = ah ? Math.floor((ah.z + ah.vz * AHEAD_S) / CHUNK) : cz;
    for (const k of [...this.build.chunksBuilt()]) {
      const [x, z] = k.split(",").map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= KEEP) continue;
      if (Math.max(Math.abs(x - acx), Math.abs(z - acz)) <= KEEP) continue;
      this.build.dropChunk(x, z);
      this.stale.delete(k);
      more++;
    }
    if (more) this.world.settle();
    if (edits || more) this.rev++;
    if (this.lines) this.draw(me);
  }

  /** My body on it: the walker's mover and questions, on `level` (my floor's grid saying where the
   *  stairs and the land are), `uid` through my own locked doors, `clip` through walls (an
   *  admin's power: flying, `fly`, through the floors and ceilings too). */
  /** A floor's questions on this world for someone (shared physics Place): through their own
   *  locked doors; `clip` through walls (an admin's power: flying, `fly`, through floors too). */
  place(uid: number | null, level: number, clip = false, fly = false): Place {
    this.keepUp();
    if (this.placesOf !== this.seen) {
      this.places.clear();
      this.placesOf = this.seen;
    }
    const mask = clip ? (fly ? "ghost" : "clip") : "all";
    const key = `${uid}|${level}|${mask}`;
    let p = this.places.get(key);
    if (!p) {
      const { building, objects } = this.src.world();
      const through: Through = { mask, pass: this.world.pass(passKeys(this.solids, uid)) };
      p = new Place(this.world, levelMap(building, level) ?? building, objects, through);
      this.places.set(key, p);
    }
    return p;
  }

  /** My body on it: the walker's mover and questions, on `level`, `uid` through my own locked
   *  doors, `clip` through walls (an admin's power: flying, `fly`, through the floors and ceilings
   *  too). */
  body(
    uid: number | null,
    level: number,
    clip: boolean,
    fly = false,
  ): { collider: Collider; mover: Mover; flow: FlowWorld } {
    const place = this.place(uid, level, clip, fly);
    this.level = level;
    this.land = place;
    this.through = place.through;
    return { collider: place, mover: this.mover, flow: this.flow };
  }

  /** Floor `level` has a floor under (x, y): its slab, the stairs' treads up into its well, or a
   *  lift's shaft it goes through (shared physics slabsOf — the floor from the slab under you);
   *  `z` the feet's height in its frame (up a flight over the well: the treads under them). */
  slabUnder(level: number, x: number, y: number, z?: number): boolean {
    this.keepUp();
    if (this.slabsFor !== this.seen) {
      const { building } = this.src.world();
      const seen = this.seen;
      this.slabs = slabsOf(
        this.world,
        (id) => seen.some((o) => o.id === id && (o.kind === "stairs" || o.kind === "flight")),
        shaftAt(liftShafts(seen, building)),
      );
      this.slabsFor = seen;
    }
    return this.slabs?.(level, { x, y }, z) ?? false;
  }
  private slabs: ReturnType<typeof slabsOf> | null = null;
  private slabsFor: unknown = null;

  /** The lifts' cars where they are now (shared physics liftCarBody): moved there, whoever stands
   *  on one with it (docs/plan/72 phase 8); a shaft gone, its car with it. */
  setLifts(cars: { key: string; solids: Solid3[]; at: [number, number, number] }[]): void {
    if (this.dead) return;
    const keep = new Set<string>();
    for (const c of cars) {
      keep.add(c.key);
      this.world.setCarrier(c.key, c.solids, ...c.at);
    }
    for (const k of [...this.world.carrierKeys()]) if (!keep.has(k)) this.world.removeCarrier(k);
  }

  /** What's under (x, y) on `level`'s floor from z down: the land or the top of anything there — a
   *  roof, a wall's top — as the move core stands on it. */
  groundUnder(level: number, x: number, y: number, z: number): number {
    return this.place(null, level).groundAt(x, y, z);
  }

  /** What's under (x, y) from z down on `level`, as groundUnder finds it, and what it is (the steps':
   *  docs/plan/63-the-steps.md) — "land", Jolt's key for it (`thing:id`, `slab:L:…`, `car:id`…), a
   *  Grounds chunk's thing by its kind (`grounds:roof`); "" where Jolt can't say yet. */
  underfoot(level: number, x: number, y: number, z: number): { g: number; on: string } {
    const f = this.src.frameOf(level);
    const u = this.place(null, level).underfoot(x, y, z);
    if (!u.on.startsWith("grounds:")) return u;
    const what = groundsThingAt(u.on, x, y, f.elev + u.g);
    return { g: u.g, on: what ? `grounds:${what}` : "land" };
  }

  // ── the admins' view: every solid near me, as Jolt has it ──
  showShapes(on: boolean): void {
    if (!on) {
      if (!this.lines) return;
      this.scene.remove(this.lines);
      this.lines.geometry.dispose();
      (this.lines.material as LineBasicMaterial).dispose();
      this.lines = null;
      return;
    }
    if (this.lines) return;
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0xf1d79a, transparent: true, opacity: 0.7, depthTest: false }),
    );
    this.lines.renderOrder = 10;
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.drawn = null;
    this.draw(this.src.at());
  }
  get shapesShown(): boolean {
    return !!this.lines;
  }
  private draw(me: { x: number; z: number }) {
    const lines = this.lines;
    if (!lines) return;
    const d = this.drawn;
    const rev = String(this.rev);
    if (d && rev === d.rev && Math.hypot(me.x - d.x, me.z - d.z) < MOVED) return;
    this.drawn = { x: me.x, z: me.z, rev };
    lines.geometry.setAttribute("position", new Float32BufferAttribute(this.world.debugLines(me.x, me.z, NEAR), 3));
    lines.geometry.computeBoundingSphere();
    const f = this.src.frame();
    lines.position.set(f.x, f.y, f.z);
  }

  /** Its counts (the admin panel shows them). */
  counts() {
    return this.world.counts();
  }

  stop(): void {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.timer);
    this.offChanged();
    this.showShapes(false);
    this.mover.dispose();
    this.world.destroy();
  }
}
