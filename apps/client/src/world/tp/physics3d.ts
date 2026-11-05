import { levelMap, liftShafts, type MapDef, shaftAt, type WorldObjectDef } from "@yutopia/shared";
import { CHUNK, hasChunk, iceHolesNow, onGroundsChanged, underfoot } from "@yutopia/shared/grounds";
import type { Collider, FlowWorld, Mover } from "@yutopia/shared/move";
import {
  type BuildingSolids,
  buildingSolids,
  CharacterMover,
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
import type { Structure } from "@yutopia/shared/structure";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Scene } from "three";

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
    this.offChanged = onGroundsChanged((cs) => {
      for (const [cx, cz] of cs) {
        if (this.world.has(`land:${cx},${cz}`)) this.stale.add(`${cx},${cz}`);
        this.flow.forget(cx, cz);
      }
    });
    this.timer = setInterval(() => this.refresh(), EVERY_MS);
    this.refresh();
  }

  /** (plan 58 5d) The world to lay a ragdoll in, and where its origin is in the scene (my floor's frame). */
  ragdollSpace(): { world: PhysicsWorld; origin: () => { x: number; y: number; z: number } } {
    return { world: this.world, origin: () => this.src.frame() };
  }
  /** (plan 58 5d) A step for what's loose in it (the ragdolls, what's worn swinging — plan 61: the
   *  walker's character moves itself). */
  step(dt: number): void {
    this.world.step(Math.min(dt, 1 / 30));
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
    this.solids = buildingSolids(building, objects, structure ?? undefined);
    this.flow.building(this.solids.flow);
    const made = this.build.building(this.solids);
    return made.made + made.removed;
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
    // (behind you: out — they're built again if you come back)
    for (const k of [...this.build.chunksBuilt()]) {
      const [x, z] = k.split(",").map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= KEEP) continue;
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
   *  lift's shaft it goes through (shared physics slabsOf — the floor from the slab under you). */
  slabUnder(level: number, x: number, y: number): boolean {
    this.keepUp();
    if (this.slabsFor !== this.seen) {
      const { building } = this.src.world();
      const seen = this.seen;
      this.slabs = slabsOf(
        this.world,
        (id) => seen.some((o) => o.id === id && o.kind === "stairs"),
        shaftAt(liftShafts(seen, building)),
      );
      this.slabsFor = seen;
    }
    return this.slabs?.(level, { x, y }) ?? false;
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
