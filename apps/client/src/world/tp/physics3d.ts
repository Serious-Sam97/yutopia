import type { Grid, MapDef, WorldObjectDef } from "@yutopia/shared";
import { CHUNK, hasChunk } from "@yutopia/shared/grounds";
import type { Collider, Mover } from "@yutopia/shared/move";
import {
  type BuildingSolids,
  buildingSolids,
  CharacterMover,
  type Frame,
  JoltCollider,
  loadJolt,
  PhysicsWorld,
  passKeys,
  sizesFor,
  staticCount,
  type Through,
  WorldBuilder,
} from "@yutopia/shared/physics";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Scene } from "three";

// The browser's physics world (docs/plan/50-the-volume.md): Jolt, built from the same data as the
// server's (shared physics/build.ts) — the building, kept to the world as it's edited, and the
// Grounds' chunks round you as the view makes their land. My body moves on it in 3D (phase 3: the
// walker's mover and its questions — input/walker.ts), the server checking it on its own. The
// admins see every solid near them in amber (Powers → Physics shapes). Jolt loads with the 3D view
// (its own chunk: guardrail 5); till it's in, the grid moves me.

const NEAR = 40; // m round you, drawn
const RING = 2; // Grounds chunks each way round you, built (the land the view has made)
const EVERY_MS = 1000;
const MOVED = 6; // m you go before it's drawn again

export interface PhysicsSource {
  /** the building (the home floor, carrying the others) and every thing in it */
  world(): { building: MapDef; objects: WorldObjectDef[] };
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
  private lines: LineSegments | null = null;
  private drawn: { x: number; z: number; rev: string } | null = null;
  private rev = 0;
  private dead = false;
  // my body: one Jolt character, on whichever floor I'm on, through what I pass
  private readonly mover: CharacterMover;
  private level = 0;
  private through: Through = { mask: "all", pass: null };
  private land: Grid | null = null;

  private constructor(
    private readonly scene: Scene,
    private readonly src: PhysicsSource,
    private readonly world: PhysicsWorld,
    private readonly build: WorldBuilder,
    first: { solids: BuildingSolids; objects: WorldObjectDef[] },
  ) {
    this.solids = first.solids;
    this.seen = first.objects;
    this.mover = new CharacterMover(
      world,
      () => this.src.frameOf(this.level),
      () => this.through,
      (x, y) => !!this.land?.onLand(x, y),
    );
    this.timer = setInterval(() => this.refresh(), EVERY_MS);
    this.refresh();
  }

  static async start(scene: Scene, src: PhysicsSource): Promise<BrowserPhysics> {
    const { building, objects } = src.world();
    const solids = buildingSolids(building, objects);
    const chunks = (2 * RING + 1) ** 2 * 4; // (round wherever you go: built ones are kept)
    const world = await PhysicsWorld.create(
      loadJolt,
      sizesFor({ statics: staticCount(solids, chunks), vehicles: solids.cars.size + 16 }),
    );
    const build = new WorldBuilder(world);
    build.building(solids);
    return new BrowserPhysics(scene, src, world, build, { solids, objects });
  }

  // the building as it is now (an edit: only what changed made again)
  private keepUp(): number {
    const { building, objects } = this.src.world();
    if (objects === this.seen) return 0;
    this.seen = objects;
    this.solids = buildingSolids(building, objects);
    const made = this.build.building(this.solids);
    return made.made + made.removed;
  }

  private refresh() {
    if (this.dead) return;
    const edits = this.keepUp();
    const me = this.src.at();
    const cx = Math.floor(me.x / CHUNK);
    const cz = Math.floor(me.z / CHUNK);
    let more = 0;
    for (let dz = -RING; dz <= RING; dz++)
      for (let dx = -RING; dx <= RING; dx++)
        if (hasChunk(cx + dx, cz + dz) && !this.world.has(`land:${cx + dx},${cz + dz}`)) {
          this.build.groundChunk(cx + dx, cz + dz);
          more++;
        }
    if (more) this.world.settle();
    if (edits || more) this.rev++;
    if (this.lines) this.draw(me);
  }

  /** My body on it: the walker's mover and questions, on `level` (my floor's grid saying where the
   *  stairs and the land are), `uid` through my own locked doors, `clip` through walls (an
   *  admin's power: flying, `fly`, through the floors and ceilings too). */
  body(
    uid: number | null,
    level: number,
    clip: boolean,
    grid: Grid,
    fly = false,
  ): { collider: Collider; mover: Mover } {
    this.keepUp();
    this.level = level;
    this.land = grid;
    const mask = clip ? (fly ? "ghost" : "clip") : "all";
    this.through = { mask, pass: this.world.pass(passKeys(this.solids, uid)) };
    return { collider: new JoltCollider(this.world, grid, this.src.frameOf(level), this.through), mover: this.mover };
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
    this.showShapes(false);
    this.mover.dispose();
    this.world.destroy();
  }
}
