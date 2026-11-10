import {
  BUILDINGS,
  CHUNK,
  chunkCount,
  editsNow,
  editsVersion,
  heightAt,
  KART_LAND,
  LAMPS,
  landBounds,
  onGroundsChanged,
  overlapsLand,
  SNOW_POLES,
  STREET,
  setChunkCap,
  terrainAt,
  topAt,
  WAYS,
} from "@yutopia/shared/grounds";
import { decodeHeights } from "@yutopia/shared/grounds-edits";
import { townBounds } from "@yutopia/shared/land";
import { LONG_ROAD } from "@yutopia/shared/longroad";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  StaticDrawUsage,
  Vector3,
} from "three";
import { litMaterial } from "../look/lit";
import { BARE_LEAVES, BIRCH_LEAVES, bareTree3, crowned, snowCanvas, tinted } from "./campus";
import { FarLand } from "./far3d";
import {
  birchGeometry,
  farBareGeometry,
  farBirchGeometry,
  farPineGeometry,
  Grounds3,
  type GroundsShared,
  groundsShared,
  pineGeometry,
} from "./grounds3d";
import { type BlockData, blockData, TREE_KINDS } from "./land-block";
import { landPool } from "./land-pool";
import { lifeDress } from "./life-dress";
import {
  lifeBushGeometry,
  lifeFarLeafyGeometry,
  lifeLeafyGeometry,
  lifePineGeometry,
  lifeTreeDepth,
  lifeTreeMaterial,
  solidUV,
} from "./life-trees";
import type { Themes } from "./sky";
import { boulderGeometry, logGeometry, shrubGeometry, stoneGeometry, stumpGeometry } from "./woods3d";
import { snowShadow, wx } from "./wx3d";

// The Grounds in the game's 3D view (docs/plan/27-the-grounds.md, phase 1):
// the land and the woods streamed round you, the rest (the ways, the water,
// the other buildings, the lamps, the fence, the town) built once.
//
// The land is a quadtree of blocks — 128 tiles a side far off, 64 nearer, a
// 32-tile chunk near you — each a mesh at its own detail (a sample every 4, 2,
// 1 tiles), with skirts so the seams between details don't show. A block is
// built when it's wanted, nearest first, a few milliseconds a frame; until it
// is, what covers its ground (its parent, or its children) stays. The trees
// are pools of instances (one draw a kind of tree, however many there are),
// filled from the blocks shown; a few near you cast the sun's shadow.
//
// God mode's edits laid (docs/plan/53-the-god-mode.md, phase 4): the blocks over the chunks that
// changed are made again under the same budget, the old one shown till the new is; the rest is
// made again whole behind what's shown, and swapped in when it's all there (its steps feed what
// the lamps' step gathers — pools, glows, the night's list — so a part can't be made alone).
//
// Units are tiles in the building's coords, y up, the ground round the
// headquarters at 0 (the campus's GROUND: the root is placed by the caller).

/** The tiles the ground floor draws itself (its lobby and lot): no land over them. */
export type Covered = (bx: number, bz: number) => boolean;

const TIERS = [
  { size: 128, step: 4, near: 300 }, // shown when its middle is further than `near`, else split
  { size: 64, step: 2, near: 150 },
  { size: 32, step: 1, near: -1 },
];
const RADIUS = 440; // land out to here (the fog has it all by then)
const LOOK_S = 1.5; // going fast: what's built first is what's nearest where you'll be this soon
// the rest of the Grounds out past the rest's circle (docs/plan/69, L2): made by district, these
// squares, within DISTRICT_R of you, freed past DISTRICT_GONE
const DISTRICT = 512;
const DISTRICT_R = 900;
const DISTRICT_GONE = 1300;
const DISTRICT_WAIT = 200; // (waited for behind the loading screen: those this near you)
const BUDGET_MS = 6; // building a frame
const BOOST_MS = 40; // …and behind the loading screen, where a long frame doesn't show
const CASTERS_R = 34; // trees this near cast the sun's shadow
export const CASTER_LAYER = 1; // (seen by the sun's shadow camera only)

interface Block {
  key: string;
  tier: number;
  x0: number;
  z0: number;
  mesh: Mesh | null;
  trees: Map<number, Float32Array>; // pool → its instances' matrices
  /** a far block's trees: its own instances, a mesh a kind — culled with the view (not in the
   *  pools, drawn all round you: ~100k of them in the long road's forest, 3 of 4 behind you) */
  far: InstancedMesh[];
  shown: boolean;
}

export class GroundsStream {
  readonly root = new Group();
  statics: Grounds3;
  /** the rest made again (god mode's edits), not shown till it's all there */
  private next: Grounds3 | null = null;
  /** the rest as it was, hidden, to be freed */
  private gone: { g: Grounds3; frames: number } | null = null;
  private night = { k: 0, land: new Color() };
  // where the camera's feet were, and how fast they're going (m/s)
  private went = { x: 0, z: 0, t: 0, vx: 0, vz: 0 };
  private blocks = new Map<string, Block>();
  /** blocks over changed chunks: made again (their old shown meanwhile) */
  private stale = new Set<string>();
  private landMat: MeshLambertMaterial;
  private snowTex: CanvasTexture;
  private pools: Pool[] = [];
  private casters: Pool[] = [];
  private castersAt = new Vector3(1e9, 0, 1e9);
  private poolsDirty = true;
  /** the woods' sway: the time, and how hard (sky.ts: harder in a storm) */
  readonly wind = { value: 1 };
  /** The rime on the trees, 0 … 1 (the morning fog's: view.ts sets it — docs/plan/64-the-fog.md F6). */
  readonly rime = { value: 0 };
  private windT = { value: 0 };
  private casting = new Set<number>();
  private fade = { a: { value: new Vector3() }, b: { value: new Vector3() } };
  /** god mode's camera (docs/plan/53): the trees between it and where it looks stay (it looks at
   *  the land, not at me) */
  fadeOff = false;
  /** behind the loading screen (docs/plan/35): build with a much bigger budget a frame */
  boost = false;
  /** Lowest (a weak CPU): built one frame in three, in half the time (what covers the ground
   *  meanwhile — a coarser block — stays) */
  lite = false;
  private turn = 0;
  /** what's still to build: land blocks wanted and missing, and the rest's steps */
  readonly left = { blocks: 0, statics: 0 };

  constructor(
    T: Themes,
    private covered: Covered,
    patch: (m: Material) => void,
    hqEast?: number, // (the studio's own width: Grounds3's courtyard bridge starts past it)
  ) {
    // (the browser keeps fewer chunks than the server: ~36 MB of them — today's land, 1,184, fits)
    setChunkCap(1500);
    this.snowTex = new CanvasTexture(snowCanvas(T, 512, 43));
    this.snowTex.colorSpace = SRGBColorSpace;
    this.snowTex.wrapS = RepeatWrapping;
    this.snowTex.wrapT = RepeatWrapping;
    this.snowTex.anisotropy = 8;
    this.landMat = litMaterial({ map: this.snowTex, vertexColors: true });
    // (the land to the snow's layer: its snow is the snow; its picture the dusting's grain — wx3d.ts)
    this.landMat.userData.wx = "land";
    wx.wxTex.value = this.snowTex;
    wx.wxTexOn.value = 1;
    patch(this.landMat);
    // the trees' kinds, one pool each (and its shadow casters)
    const r = T.rng(9);
    const treeMat = litMaterial({ vertexColors: true });
    treeMat.userData.wx = "tree";
    // (the life look: new shapes, their leaves and needles cards on the atlas — plan 73 phase 8.1)
    const life = !!lifeDress.out;
    if (life) lifeTreeMaterial(treeMat);
    patch(treeMat);
    // a tree between the camera and you goes (as walls fade): its instance
    // folded to a point in the vertex shader; its shadow (the casters) stays
    const outdoors = treeMat.onBeforeCompile;
    treeMat.onBeforeCompile = (shader, r) => {
      outdoors.call(treeMat, shader, r);
      shader.uniforms.fadeA = this.fade.a;
      shader.uniforms.fadeB = this.fade.b;
      shader.uniforms.windT = this.windT;
      shader.uniforms.windK = this.wind;
      shader.uniforms.rimeK = this.rime;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 fadeA;\nuniform vec3 fadeB;\nuniform float windT;\nuniform float windK;\nuniform float rimeK;\nvarying float vFade;",
        )
        // each tree its own green and bark (docs/plan/33-the-look.md); the snow on it stays white
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
#if defined(USE_INSTANCING) && defined(USE_COLOR)
{
  vec2 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  float h1 = fract(sin(dot(ip, vec2(12.9898, 78.233))) * 43758.5453);
  float h2 = fract(sin(dot(ip, vec2(39.3468, 11.135))) * 24634.6345);
  float v = 0.84 + 0.26 * h1;
  float warm = (h2 - 0.5) * 0.14;
  vec3 t = vec3(v * (1.0 + warm), v * (1.0 + warm * 0.3), v * (1.0 - warm * 0.8));
  float l = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
  vColor.rgb *= mix(t, vec3(1.0), smoothstep(0.6, 0.85, l));
  // the rime after a freezing fog: the needles and the bark frosted pale (the snow on it as it is:
  // its pieces are tagged — wx3d.ts — the birch's white bark isn't snow)
  vColor.rgb = mix(vColor.rgb, vec3(0.8, 0.85, 0.9), rimeK * 0.6 * (wxTag.y < 0.0 ? 0.0 : 1.0));
}
#endif`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vFade = 1.0;
#ifdef USE_INSTANCING
{
  // the wind: the crown sways, the foot stays (by its height squared), each tree in its own time
  vec4 wo = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ph = wo.x * 0.37 + wo.z * 0.21;
  float hk = max(transformed.y, 0.0);
  float k = hk * hk * 0.0011 * windK;
  transformed.x += (sin(windT * 1.3 + ph) + 0.4 * sin(windT * 3.1 + ph * 2.0)) * k;
  transformed.z += sin(windT * 1.05 + ph * 1.3) * k * 0.6;
}
#endif
#ifdef USE_INSTANCING
{
  // how near its trunk is to the way from the camera to you (and to you)
  vec2 io = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  vec2 ab = fadeB.xz - fadeA.xz;
  float u = dot(io - fadeA.xz, ab) / max(dot(ab, ab), 1e-4);
  float t = clamp(u, 0.0, 1.0);
  float d = length(io - (fadeA.xz + ab * t));
  float r = u > 1.0 ? 3.4 : mix(7.0, 3.6, sqrt(t)); // (wide at the camera: a big pine's canopy round it)
  vFade = smoothstep(r * 0.62, r, d);
}
#endif`,
        );
      // see-through as walls fade: a dither, finer the more it's gone
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFade;")
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
if (vFade < 0.999) {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (n > max(vFade, 0.14)) discard;
}`,
        );
    };
    treeMat.customProgramCacheKey = () => "yutopia-outdoors-trees";
    const pine = life ? lifePineGeometry : pineGeometry;
    // (the life look: leafy trees in the birch's and the bare tree's places, a bare snag kept)
    const leafy = (i: number, col: [number, number, number], H: number) =>
      lifeLeafyGeometry(r, { col, H: H + i * 0.9, spread: 0.9 + i * 0.12, bark: i === 1 ? 0x6a5d50 : 0x564638 });
    const geos: BufferGeometry[] = [
      // spruces: three of the usual, then a young one, a tall thin one, an old broad one heavy with snow
      ...[0, 1, 2].map(() => pine(r)),
      pine(r, { tiers: 5, H: 6.5, width: 0.82, snow: 0.55 }),
      pine(r, { tiers: 9, H: 13.5, width: 0.72, snow: 0.45 }),
      pine(r, { tiers: 7, H: 11, width: 1.22, snow: 0.68 }),
      // (in leaf — docs/plan/65, W3 — but for one bare snag in three)
      ...[0, 1, 2].map((i) => (life ? leafy(i, [0.48, 0.62, 0.27], 8.5) : crowned(birchGeometry(r), ...BIRCH_LEAVES))),
      ...[0, 1, 2].map((i) =>
        life && i < 2 ? leafy(i, [0.42, 0.56, 0.24], 7) : i < 2 ? crowned(bareTree3(r), ...BARE_LEAVES) : bareTree3(r),
      ),
      farPineGeometry(),
      // (finer than it was: faceted, a coarse one was a heap of shards)
      // (the weather's: each its own, wx3d.ts gives an instance its own threshold round this)
      tinted(new SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xf6f8fb, 0.62),
      // (the life look: its own far leafy shape, a third of the triangles — plan 73)
      life
        ? lifeFarLeafyGeometry([0.48, 0.62, 0.27], 8.5)
        : crowned(farBirchGeometry(), [0.38, 0.48, 0.25], 0.62, 0.26, true),
      life ? lifeFarLeafyGeometry([0.42, 0.56, 0.24], 7) : crowned(farBareGeometry(), [0.3, 0.39, 0.2], 0.6, 0.3, true),
      // the woods' floor (woods3d.ts)
      life ? lifeBushGeometry(r) : shrubGeometry(r),
      stumpGeometry(r),
      logGeometry(r),
      stoneGeometry(r),
      boulderGeometry(r),
    ];
    // (the near trees and the boulders cast the sun's shadow; the far ones, the mounds, the rest don't)
    this.casting = new Set([...TREE_KINDS.pine, ...TREE_KINDS.birch, ...TREE_KINDS.bare, TREE_KINDS.cover.boulder]);
    // (the life look: what isn't a card reads the atlas's white — its own UVs would read the leaves)
    if (life) for (const [i, g] of geos.entries()) if (!g.userData.cards) geos[i] = solidUV(g);
    for (const [i, g] of geos.entries()) {
      const p = new Pool(g, treeMat, false);
      this.pools.push(p);
      this.root.add(p.mesh);
      // (the life look's cast their shadows from their solid parts: tp/life-trees.ts userData.shadow)
      const c = new Pool((g.userData.shadow as BufferGeometry | undefined) ?? g, treeMat, this.casting.has(i));
      c.mesh.layers.set(CASTER_LAYER);
      this.casters.push(c);
      this.root.add(c.mesh);
    }
    // everything that isn't land or woods: built once, all of it — the Kart Park on its own (never
    // edited), the rest made again with god mode's edits (`invalidate`); their pictures shared
    this.shared = groundsShared(T);
    const opts = {
      // (round today's town — what GROUNDS was — not the land's middle: with the long road that's
      // out in the gorge, and the town's street things, fence, lot and farm were never made)
      cx: (townBounds().x0 + townBounds().x1) / 2,
      cz: (townBounds().z0 + townBounds().z1) / 2,
      radius: 900,
      stream: true,
      hqEast,
      shared: this.shared,
    };
    this.makeStatics = (from) => new Grounds3(T, { ...opts, part: "rest", from });
    // the far land past the near (far3d.ts — docs/plan/69, L5, L6)
    if (LONG_ROAD) {
      this.far = new FarLand(this.pools[TREE_KINDS.far]?.mesh.geometry ?? null, () => editsNow());
      this.root.add(this.far.root);
    }
    this.restCircle = { cx: opts.cx, cz: opts.cz, r: opts.radius };
    this.makeDistrict = (r) => new Grounds3(T, { ...opts, part: "district", own: { ...r, skip: this.restCircle } });
    this.statics = this.makeStatics();
    this.root.add(this.statics.root);
    if (KART_LAND) {
      this.kart = new Grounds3(T, { ...opts, part: "kart" });
      this.root.add(this.kart.root);
    }
    this.patch = patch;
    this.fillBoxes();
    this.drawnOf = staticsOf();
    this.offChanged = onGroundsChanged((cs, why) => {
      if (why !== "edits") return;
      const of = staticsOf();
      const moved = movedUnder(this.drawnOf.height, of.height);
      this.invalidate(cs, of.lists !== this.drawnOf.lists || moved.other || moved.ways.size > 0 ? moved.ways : null);
      this.drawnOf = of;
    });
  }
  private shared: GroundsShared;
  /** the far land (null: none — the long road off) */
  far: FarLand | null = null;
  private rootAt = new Vector3();
  /** the rest's circle: what's out of it is made by district */
  private restCircle: { cx: number; cz: number; r: number };
  private makeDistrict: (r: { x0: number; z0: number; x1: number; z1: number }) => Grounds3;
  /** the districts made (and being made) round you, by their corner "x0,z0" */
  private districts = new Map<string, Grounds3>();
  /** districts as they were before god mode's edits, shown till their new ones are made */
  private oldDistricts = new Map<string, Grounds3>();
  /** the Kart Park's own part (made once) */
  private kart: Grounds3 | null = null;
  /** what the rest is made from, of god mode's edits (`staticsOf`) */
  private drawnOf: ReturnType<typeof staticsOf>;
  private offChanged: () => void;
  private makeStatics: (from?: { g: Grounds3; moved: Set<string> }) => Grounds3;
  private patch: (m: Material) => void;
  private patched = new WeakSet<Material>();
  /** Set by the view: a new thing's shaders made ready before it's drawn (a town
   *  block's, compiled the frame it first showed, was a 200 ms frame on the ride in). */
  prepare: ((o: Object3D) => void) | null = null;

  /** The buildings standing on the Grounds (building coords), to their roofs:
   *  the chase camera keeps out of them as out of walls. (Filled in place: god mode's edits.) */
  readonly boxes: { x0: number; z0: number; x1: number; z1: number; top: number; eaves: number }[] = [];
  /** How much bigger the lamps' glows are (the morning fog's halos: view.ts sets it). */
  halo = 1;
  private fillBoxes() {
    this.boxes.length = 0;
    // (not the headquarters: the office is the campus's, at the server's size — sky.ts roofsNear)
    for (const b of BUILDINGS) if (b.kind !== "hq") this.boxes.push(boxOf(b));
  }

  /** God mode's edits laid (docs/plan/53-the-god-mode.md): these chunks changed. Their blocks are
   *  made again, nearest first under the frame's budget, the old shown till then. `rest` (the ways
   *  the land moved under), the rest too (the ways, the buildings, the lamps…: anything but the
   *  land's paint and trees), its ways that didn't change taken from the one shown. */
  invalidate(chunks: [number, number][], rest: Set<string> | null) {
    const cs = new Set(chunks.map(([x, z]) => `${x},${z}`));
    for (const b of this.blocks.values()) {
      const S = TIERS[b.tier].size;
      let hit = false;
      for (let cz = Math.floor(b.z0 / CHUNK); !hit && cz * CHUNK < b.z0 + S; cz++)
        for (let cx = Math.floor(b.x0 / CHUNK); !hit && cx * CHUNK < b.x0 + S; cx++) hit = cs.has(`${cx},${cz}`);
      if (hit) this.stale.add(b.key);
    }
    if (!rest) return;
    this.fillBoxes();
    // (the districts: made again round you, each shown as it was till its new one's all there)
    for (const [k, d] of this.districts) {
      // (one still being made: gone — what it replaces stays shown)
      if (d.left) d.dispose();
      else {
        this.oldDistricts.get(k)?.dispose();
        this.oldDistricts.set(k, d);
      }
    }
    this.districts.clear();
    // (still making the first: that one goes, the new one is made in its place)
    if (this.statics.left) {
      this.statics.dispose();
      this.statics = this.made();
      return;
    }
    // (one being made again already: made after the one shown, as this one is)
    this.next?.dispose();
    this.next = this.made({ g: this.statics, moved: rest });
  }
  private made(from?: { g: Grounds3; moved: Set<string> }): Grounds3 {
    const g = this.makeStatics(from);
    g.root.visible = !from;
    this.root.add(g.root);
    g.setNight(this.night.k);
    g.ridgeMat.color.copy(this.night.land);
    return g;
  }
  /** What's made now (the long road's soak — docs/plan/69, L2): land blocks, districts, chunks kept. */
  stats(): {
    blocks: number;
    districts: number;
    chunks: number;
    statics: number;
    trees: number;
    fills: number;
    asked: number;
    made: number;
    edits: number;
  } {
    return {
      trees: this.pools.reduce((a, p) => a + p.mesh.count, 0),
      fills: this.fills,
      // (the workers': asked and not back, back and not placed; the edits they're made under)
      asked: landPool()?.asked.size ?? -1,
      made: landPool()?.made.length ?? -1,
      edits: editsVersion,
      blocks: this.blocks.size,
      districts: this.districts.size,
      chunks: chunkCount(),
      statics: this.left.statics,
    };
  }
  /** Still making the rest again (god mode's edits): its steps left. */
  get remaking(): number {
    return this.next?.left ?? 0;
  }

  /** The ground's height at (x, z) (building coords: where clicks land). */
  heightAt(x: number, z: number): number {
    return heightAt(x, z);
  }
  /** The top of what's there: the water's level over its bed (plan 66), else the ground. */
  topAt(x: number, z: number): number {
    return topAt(x, z);
  }

  setNight(k: number, land: Color) {
    // (the far ridges are painted: they take the hour as a tint)
    this.night.k = k;
    this.night.land.copy(land).multiplyScalar(1 + 0.4 * k);
    for (const s of [this.statics, this.next, this.kart, ...this.districts.values(), ...this.oldDistricts.values()]) {
      if (!s) continue;
      s.setNight(k);
      s.ridgeMat.color.copy(this.night.land);
    }
  }

  /** Round (x, z) (building coords: whose feet the camera's on): what's wanted,
   *  built a little at a time, shown. `target`: those feet (trees in front of them fade). */
  update(x: number, z: number, cam: Vector3, target?: Vector3) {
    this.windT.value = performance.now() / 1000;
    // (the far land round the camera, in the Grounds' coords)
    if (this.far) {
      this.root.getWorldPosition(this.rootAt);
      this.far.update(cam.x - this.rootAt.x, cam.z - this.rootAt.z);
    }
    this.statics.tick(this.windT.value);
    this.next?.tick(this.windT.value);
    this.kart?.tick(this.windT.value);
    this.fade.a.value.copy(cam);
    this.fade.b.value.copy(this.fadeOff ? cam : (target ?? cam));
    // (Lowest: what's wanted, built and shown worked out one frame in three — the land two frames
    // behind at most, what covers it there meanwhile)
    this.turn = (this.turn + 1) % 3;
    if (this.lite && !this.boost && this.turn) {
      if (target) this.statics.cutAt(target.x, target.y, target.z);
      this.statics.faceCards(cam, this.halo);
      this.kart?.faceCards(cam, this.halo);
      return;
    }
    const want: string[] = [];
    const visit = (tier: number, x0: number, z0: number) => {
      const T = TIERS[tier];
      const mx = x0 + T.size / 2;
      const mz = z0 + T.size / 2;
      // (a block's nearest point: no land beyond the radius, nor outside the Grounds)
      const dx = Math.max(x0 - x, 0, x - (x0 + T.size));
      const dz = Math.max(z0 - z, 0, z - (z0 + T.size));
      if (Math.hypot(dx, dz) > RADIUS) return;
      if (tier < TIERS.length - 1 && Math.hypot(mx - x, mz - z) < T.near) {
        const h = T.size / 2;
        for (const [ox, oz] of [
          [0, 0],
          [h, 0],
          [0, h],
          [h, h],
        ])
          visit(tier + 1, x0 + ox, z0 + oz);
        return;
      }
      want.push(key(tier, x0, z0));
    };
    const S = TIERS[0].size;
    // (the blocks within reach, those on the land's regions: land.ts — the land is long, docs/plan/69 L2)
    const L = landBounds();
    for (let z0 = Math.floor(Math.max(L.z0, z - RADIUS) / S) * S; z0 < Math.min(L.z1, z + RADIUS); z0 += S)
      for (let x0 = Math.floor(Math.max(L.x0, x - RADIUS) / S) * S; x0 < Math.min(L.x1, x + RADIUS); x0 += S)
        if (overlapsLand(x0, z0, x0 + S, z0 + S)) visit(0, x0, z0);
    // build the nearest missing, a few ms a frame — nearest to where you'll be soon, going fast
    const now = performance.now();
    const dt = Math.min(0.5, Math.max(1e-3, (now - this.went.t) / 1000));
    const ease = Math.min(1, dt * 2);
    this.went.vx += ((x - this.went.x) / dt - this.went.vx) * ease;
    this.went.vz += ((z - this.went.z) / dt - this.went.vz) * ease;
    // (a jump — a teleport, the god camera's — isn't a speed)
    if (Math.hypot(x - this.went.x, z - this.went.z) > 60) this.went.vx = this.went.vz = 0;
    this.went.x = x;
    this.went.z = z;
    this.went.t = now;
    const ax = x + this.went.vx * LOOK_S;
    const az = z + this.went.vz * LOOK_S;
    const missing = want.filter((k) => !this.blocks.get(k)?.mesh || this.stale.has(k));
    missing.sort((a, b) => distTo(a, ax, az) - distTo(b, ax, az));
    const wanted = new Set(want);
    const budget = this.boost ? BOOST_MS : this.lite ? BUDGET_MS / 2 : BUDGET_MS;
    const t0 = performance.now();
    let built = 0;
    // (what the workers made: put together nearest first, under the budget — one a frame at least;
    // what's not wanted now, or made under edits since laid again, dropped)
    const pool = landPool();
    if (pool?.made.length) {
      pool.made = pool.made.filter((d) => d.v === editsVersion && wanted.has(d.key));
      pool.made.sort((a, b) => distTo(a.key, ax, az) - distTo(b.key, ax, az));
      while (pool.made.length && (built === 0 || performance.now() - t0 < budget)) {
        this.place(pool.made.shift() as BlockData);
        built++;
      }
    }
    // the nearest missing: asked of the workers — two each in hand as you go (the nearest stays the
    // nearest); behind the loading screen all of them at once (what's made is only taken between
    // frames, and a frame there is a quarter to a whole second: four each, the land came a dozen
    // blocks a frame); made here with none
    if (pool) pool.ask(missing.map(askOf), this.boost ? 1e9 : 2);
    else
      for (const k of missing) {
        if (performance.now() - t0 > budget) break;
        this.place(blockData(askOf(k), editsVersion));
        built++;
      }
    this.left.blocks = 0;
    for (const k of want) if (!this.blocks.get(k)?.mesh || this.stale.has(k)) this.left.blocks++;
    // show: each wanted block, or while it isn't built what covers it
    const show = new Set<string>();
    for (const k of want) {
      if (this.blocks.get(k)?.mesh) {
        show.add(k);
        continue;
      }
      const up = this.ancestorBuilt(k);
      if (up) show.add(up);
      else for (const d of this.descendantsBuilt(k)) show.add(d);
    }
    for (const b of this.blocks.values()) {
      const on = show.has(b.key);
      if (on !== b.shown) {
        b.shown = on;
        if (b.mesh) b.mesh.visible = on;
        for (const m of b.far) m.visible = on;
        this.poolsDirty = true;
      }
      // not wanted, not covering anything: gone
      if (!on && !wanted.has(b.key)) {
        freeBlock(b);
        this.blocks.delete(b.key);
        this.stale.delete(b.key);
      }
    }
    if (this.poolsDirty) this.fillPools();
    if (target) this.statics.cutAt(target.x, target.y, target.z);
    // the rest of the Grounds (the ways, the buildings, the lamps…), a few ms a frame (made
    // again: that, then swapped in whole)
    const s0 = performance.now();
    // (made again behind what's shown: not in a frame the land's had its share — one long step
    // on top of a block is a frame missed)
    const making = this.statics.left
      ? this.statics
      : this.kart?.left
        ? this.kart
        : built && !this.boost
          ? null
          : this.next;
    const stepMs = this.boost ? BOOST_MS : this.lite ? 2 : 4;
    while (making && performance.now() - s0 < stepMs) {
      const added = making.step();
      if (!added) break;
      this.patchAdded(added, making === this.next);
    }
    // the districts round you, out past the rest's circle: the nearest being made, in what's left
    const district = this.districtsFrame(x, z, !!making || (built > 0 && !this.boost));
    while (district && performance.now() - s0 < stepMs) {
      const added = district.step();
      if (!added) break;
      this.patchAdded(added, false);
    }
    if (this.gone && --this.gone.frames <= 0) {
      this.gone.g.dispose();
      this.gone = null;
    }
    if (this.next && !this.next.left && !this.gone) {
      // (the old one hidden now, freed a little later: not in the frame the new one's first drawn)
      this.statics.root.visible = false;
      this.gone = { g: this.statics, frames: 20 };
      this.next.adopt();
      this.statics = this.next;
      this.statics.root.visible = true;
      this.next = null;
      // (a stored block's storeys: cut again in the new one)
      if (target) this.statics.cutAt(target.x, target.y, target.z);
    }
    this.left.statics = this.statics.left + (this.kart?.left ?? 0);
    // (the districts by you: those further on are made as you go, not waited for — what one draws is
    // out of the rest's circle, so no nearer than that circle's edge)
    const inner = this.restCircle.r - Math.hypot(x - this.restCircle.cx, z - this.restCircle.cz);
    for (const [k, d] of this.districts) {
      const [x0, z0] = k.split(",").map(Number);
      const D = DISTRICT;
      const box = Math.hypot(Math.max(x0 - x, 0, x - x0 - D), Math.max(z0 - z, 0, z - z0 - D));
      if (Math.max(box, inner) < DISTRICT_WAIT) this.left.statics += d.left;
    }
    if (Math.hypot(x - this.castersAt.x, z - this.castersAt.z) > 6) this.fillCasters(x, z);
    this.statics.faceCards(cam, this.halo);
    this.kart?.faceCards(cam, this.halo);
    for (const d of [...this.districts.values(), ...this.oldDistricts.values()]) d.faceCards(cam, this.halo);
  }
  /** What a step added: its materials patched (the outdoors' light, the snow), made ready. */
  private patchAdded(added: Object3D[], remade: boolean) {
    for (const o of added) {
      o.traverse((c) => {
        const m = (c as Mesh).material;
        // (the ice too: unpatched, it stayed as bright as day after dark)
        for (const x of Array.isArray(m) ? m : m ? [m] : [])
          if ((x instanceof MeshLambertMaterial || x instanceof MeshStandardMaterial) && !this.patched.has(x)) {
            this.patched.add(x);
            this.patch(x);
          }
        // (made again: its bounds worked out now, not all of them the frame it's swapped in)
        if (remade && c instanceof Mesh) {
          if (c instanceof InstancedMesh) c.boundingSphere ?? c.computeBoundingSphere();
          else c.geometry.boundingSphere ?? c.geometry.computeBoundingSphere();
        }
      });
      this.prepare?.(o);
    }
  }
  /** The districts round (x, z): those wanted made, those far freed; the nearest still being made
   *  (none while `busy`: the rest's or the land's turn this frame). */
  private districtsFrame(x: number, z: number, busy: boolean): Grounds3 | null {
    const D = DISTRICT;
    const c = this.restCircle;
    const L = landBounds();
    for (let z0 = Math.floor(Math.max(L.z0, z - DISTRICT_R) / D) * D; z0 < Math.min(L.z1, z + DISTRICT_R); z0 += D)
      for (let x0 = Math.floor(Math.max(L.x0, x - DISTRICT_R) / D) * D; x0 < Math.min(L.x1, x + DISTRICT_R); x0 += D) {
        const k = `${x0},${z0}`;
        if (this.districts.has(k)) continue;
        // (its nearest point within reach, on the land, not all of it in the rest's circle)
        if (Math.hypot(Math.max(x0 - x, 0, x - x0 - D), Math.max(z0 - z, 0, z - z0 - D)) > DISTRICT_R) continue;
        if (!overlapsLand(x0, z0, x0 + D, z0 + D)) continue;
        const far = Math.max(
          ...[
            [x0, z0],
            [x0 + D, z0],
            [x0, z0 + D],
            [x0 + D, z0 + D],
          ].map(([px, pz]) => Math.hypot(px - c.cx, pz - c.cz)),
        );
        if (far < c.r) continue;
        const g = this.makeDistrict({ x0, z0, x1: x0 + D, z1: z0 + D });
        // (hidden while the one it replaces is shown)
        g.root.visible = !this.oldDistricts.has(k);
        g.setNight(this.night.k);
        this.root.add(g.root);
        this.districts.set(k, g);
      }
    let next: Grounds3 | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [k, g] of this.districts) {
      const [x0, z0] = k.split(",").map(Number);
      const d = Math.hypot(Math.max(x0 - x, 0, x - x0 - D), Math.max(z0 - z, 0, z - z0 - D));
      if (d > DISTRICT_GONE) {
        g.dispose();
        this.districts.delete(k);
        continue;
      }
      g.tick(this.windT.value);
      const was = this.oldDistricts.get(k);
      if (was && !g.left) {
        g.root.visible = true;
        was.dispose();
        this.oldDistricts.delete(k);
      }
      if (g.left && d < best) {
        best = d;
        next = g;
      }
    }
    // (one as it was with no new one wanted there: gone)
    for (const [k, g] of this.oldDistricts) {
      if (this.districts.has(k)) g.tick(this.windT.value);
      else {
        g.dispose();
        this.oldDistricts.delete(k);
      }
    }
    return busy ? null : next;
  }

  private ancestorBuilt(k: string): string | null {
    let [t, x0, z0] = parse(k);
    while (t > 0) {
      t--;
      const S = TIERS[t].size;
      x0 = Math.floor(x0 / S) * S;
      z0 = Math.floor(z0 / S) * S;
      const a = key(t, x0, z0);
      if (this.blocks.get(a)?.mesh) return a;
    }
    return null;
  }
  private descendantsBuilt(k: string): string[] {
    const [t, x0, z0] = parse(k);
    if (t >= TIERS.length - 1) return [];
    const out: string[] = [];
    const h = TIERS[t].size / 2;
    for (const [ox, oz] of [
      [0, 0],
      [h, 0],
      [0, h],
      [h, h],
    ]) {
      const c = key(t + 1, x0 + ox, z0 + oz);
      if (this.blocks.get(c)?.mesh) out.push(c);
      else out.push(...this.descendantsBuilt(c));
    }
    return out;
  }

  // ── a block of land: its mesh and its trees ──
  /** A block's data made a mesh (the ground floor's own tiles left out: its floor is drawn there),
   *  its trees kept for the pools; in the place of one made before. */
  private place(d: BlockData) {
    const k = d.key;
    const [tier, x0, z0] = parse(k);
    const { size, step } = TIERS[tier];
    const n = size / step;
    const idx: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        if (this.covered(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
        const p = j * (n + 1) + i;
        idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2);
      }
    for (const v of d.skirt) idx.push(v);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.pos, 3));
    g.setAttribute("color", new BufferAttribute(d.col, 3));
    g.setAttribute("uv", new BufferAttribute(d.uv, 2));
    g.setAttribute("wxLand", new BufferAttribute(d.around, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // (a skirt is two-faced: its feet's normals summed to nothing — NaN in the
    // light, and after dark the bloom spread it over the whole frame. They
    // take the normal of the land above them.)
    const nrm = g.getAttribute("normal");
    for (let u = 0; u < d.under.length; u += 2) {
      const p = d.under[u + 1];
      nrm.setXYZ(d.under[u], nrm.getX(p), nrm.getY(p), nrm.getZ(p));
    }
    const mesh = new Mesh(g, this.landMat);
    mesh.position.set(x0, 0, z0);
    mesh.receiveShadow = tier === TIERS.length - 1;
    mesh.visible = false;
    this.root.add(mesh);
    // (made again: in the old one's place, shown as it was)
    const old = this.blocks.get(k);
    this.stale.delete(k);
    if (old) {
      freeBlock(old);
      mesh.visible = old.shown;
    }
    const blk: Block = { key: k, tier, x0, z0, mesh, trees: new Map(), far: [], shown: old?.shown ?? false };
    for (const t of d.trees)
      if (tier === TIERS.length - 1) blk.trees.set(t.pool, t.m);
      else {
        const pool = this.pools[t.pool].mesh;
        // (past 150 m the life look's trees without their cards — their solid parts and lumps: a card's
        // cut-out there is a few pixels and costs the frame; plan 73 phase 11)
        const far = (pool.geometry.userData.shadow as BufferGeometry | undefined) ?? pool.geometry;
        const im = snowShadow(new InstancedMesh(far, pool.material, 0));
        if (pool.customDepthMaterial && far === pool.geometry) im.customDepthMaterial = pool.customDepthMaterial;
        im.instanceMatrix = new InstancedBufferAttribute(t.m, 16);
        im.count = t.m.length / 16;
        im.visible = mesh.visible;
        this.root.add(im);
        blk.far.push(im);
      }
    this.blocks.set(k, blk);
    this.poolsDirty = true;
  }

  // the pools hold the trees of the blocks shown
  private fills = 0;
  private fillPools() {
    this.poolsDirty = false;
    this.fills++;
    // (each pool told the blocks shown now: only those come or gone uploaded — the whole of them
    // again each time a block came or went was ~5 MB a frame at speed on the long road)
    for (const [i, pool] of this.pools.entries()) {
      const shown = new Map<string, Float32Array>();
      for (const b of this.blocks.values())
        if (b.shown) {
          const t = b.trees.get(i);
          if (t) shown.set(b.key, t);
        }
      pool.show(shown);
    }
  }
  // the near trees again, casting the sun's shadow (seen by its camera only)
  private fillCasters(x: number, z: number) {
    this.castersAt.set(x, 0, z);
    for (const [i, pool] of this.casters.entries()) {
      if (!this.casting.has(i)) continue;
      const parts: Float32Array[] = [];
      for (const b of this.blocks.values()) {
        if (b.tier !== TIERS.length - 1 || !b.shown) continue;
        if (Math.hypot(b.x0 + 16 - x, b.z0 + 16 - z) > CASTERS_R + 24) continue;
        const t = b.trees.get(i);
        if (!t) continue;
        const near: number[] = [];
        for (let k = 0; k < t.length; k += 16)
          if (Math.hypot(t[k + 12] - x, t[k + 14] - z) < CASTERS_R) near.push(...t.subarray(k, k + 16));
        if (near.length) parts.push(new Float32Array(near));
      }
      pool.set(parts);
    }
  }

  dispose() {
    this.offChanged();
    this.next?.dispose();
    this.gone?.g.dispose();
    for (const b of this.blocks.values()) freeBlock(b);
    for (const p of [...this.pools, ...this.casters]) p.dispose();
    this.landMat.dispose();
    this.snowTex.dispose();
    this.statics.dispose();
    this.kart?.dispose();
    for (const d of [...this.districts.values(), ...this.oldDistricts.values()]) d.dispose();
    this.far?.dispose();
    for (const d of this.shared.disp) d.dispose();
    this.root.removeFromParent();
  }
}

// One kind of tree, instanced. Each block's trees a run of its instances: a block shown is put on the
// end, one gone blanked (a scale of nothing) — only those runs uploaded — and all of them packed
// again once a quarter's blank. (`set`: all of them at once — the shadow's casters, a few.)
class Pool {
  mesh: InstancedMesh;
  private cap = 0;
  /** the runs: a block's key → where its instances start, its matrices */
  private runs = new Map<string, { at: number; m: Float32Array }>();
  private end = 0;
  private blank = 0;
  constructor(
    private geo: BufferGeometry,
    private mat: Material,
    cast: boolean,
  ) {
    this.mesh = this.make(256);
    this.mesh.castShadow = cast;
  }
  private make(cap: number): InstancedMesh {
    this.cap = cap;
    const m = snowShadow(new InstancedMesh(this.geo, this.mat, cap));
    // (the life look's woods: their cards cut out of their shadows too)
    if (lifeDress.out && (this.mat as { alphaTest?: number }).alphaTest && this.geo.userData.cards)
      m.customDepthMaterial = lifeTreeDepth();
    m.instanceMatrix.setUsage(StaticDrawUsage as unknown as typeof DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    return m;
  }
  private grow(n: number) {
    const old = this.mesh;
    const next = this.make(Math.ceil(n * 1.3));
    next.castShadow = old.castShadow;
    next.layers.mask = old.layers.mask;
    old.parent?.add(next);
    old.removeFromParent();
    old.dispose();
    this.mesh = next;
  }
  /** These blocks' trees shown (their key → matrices), the rest not. */
  show(want: Map<string, Float32Array>) {
    const attr = this.mesh.instanceMatrix;
    let changed = false;
    for (const [k, r] of this.runs)
      if (want.get(k) !== r.m) {
        (attr.array as Float32Array).fill(0, r.at, r.at + r.m.length);
        attr.addUpdateRange(r.at, r.m.length);
        this.blank += r.m.length;
        this.runs.delete(k);
        changed = true;
      }
    let add = 0;
    for (const [k, m] of want) if (!this.runs.has(k)) add += m.length;
    if (!changed && !add) return;
    const live = this.end - this.blank;
    if (this.blank > live / 3 || (this.end + add) / 16 > this.cap) {
      // (packed again, all of it uploaded: a quarter blank, or no room on the end)
      const n = (live + add) / 16;
      if (n > this.cap) this.grow(n);
      const a = this.mesh.instanceMatrix.array as Float32Array;
      let o = 0;
      this.runs.clear();
      for (const [k, m] of want) {
        a.set(m, o);
        this.runs.set(k, { at: o, m });
        o += m.length;
      }
      this.end = o;
      this.blank = 0;
      this.mesh.instanceMatrix.clearUpdateRanges();
    } else {
      const a = attr.array as Float32Array;
      const from = this.end;
      for (const [k, m] of want)
        if (!this.runs.has(k)) {
          a.set(m, this.end);
          this.runs.set(k, { at: this.end, m });
          this.end += m.length;
        }
      if (this.end > from) attr.addUpdateRange(from, this.end - from);
    }
    this.mesh.count = this.end / 16;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** All of them, these. */
  set(parts: Float32Array[]) {
    const n = parts.reduce((a, p) => a + p.length / 16, 0);
    if (n > this.cap) this.grow(n);
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    let o = 0;
    for (const p of parts) {
      arr.set(p, o);
      o += p.length;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.dispose();
    this.geo.dispose();
  }
}

/** A block's land and its own trees freed (the pools' geometry is theirs). */
function freeBlock(b: Block) {
  b.mesh?.geometry.dispose();
  b.mesh?.removeFromParent();
  for (const m of b.far) {
    m.dispose();
    m.removeFromParent();
  }
}
const key = (t: number, x0: number, z0: number) => `${t}:${x0}:${z0}`;
const parse = (k: string) => k.split(":").map(Number) as [number, number, number];
/** What block `k` is, to make. */
function askOf(k: string) {
  const [t, x0, z0] = parse(k);
  return { key: k, x0, z0, size: TIERS[t].size, step: TIERS[t].step, near: t === TIERS.length - 1 };
}
function distTo(k: string, x: number, z: number): number {
  const [t, x0, z0] = parse(k);
  const s = TIERS[t].size;
  return Math.hypot(x0 + s / 2 - x, z0 + s / 2 - z);
}

/** What of god mode's edits the rest of the Grounds is made from: the ways, the buildings and the
 *  things as listed, and the land's heights under them (the paint and the trees are the land's own,
 *  the blocks'). */
function staticsOf() {
  const e = editsNow();
  return { lists: JSON.stringify([e.ways ?? null, e.buildings ?? null, e.things ?? null]), height: e.height ?? {} };
}
/** Did the land's heights change under anything the rest draws (a way, a building, a lamp, a
 *  thing in the street, a snow pole: each stands on it)? The ways it moved under, and whether
 *  it moved under anything else. A hill in the woods: none, no. */
function movedUnder(was: Record<string, string>, now: Record<string, string>): { ways: Set<string>; other: boolean } {
  const ways = new Set<string>();
  const N = CHUNK * 2 + 1;
  const grids = new Map<string, [Int16Array | null, Int16Array | null]>();
  for (const k of new Set([...Object.keys(was), ...Object.keys(now)]))
    if (was[k] !== now[k])
      grids.set(k, [was[k] ? decodeHeights(was[k], N * N) : null, now[k] ? decodeHeights(now[k], N * N) : null]);
  if (!grids.size) return { ways, other: false };
  // (the lift's nearest sample, every half metre: changed by more than a centimetre)
  const moved = (x: number, z: number) => {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const g = grids.get(`${cx},${cz}`);
    if (!g) return false;
    const n = Math.round((z - cz * CHUNK) * 2) * N + Math.round((x - cx * CHUNK) * 2);
    return Math.abs((g[0]?.[n] ?? 0) - (g[1]?.[n] ?? 0)) > 1;
  };
  const round = (x: number, z: number, r: number) =>
    moved(x, z) || moved(x + r, z) || moved(x - r, z) || moved(x, z + r) || moved(x, z - r);
  const plot = (b: (typeof BUILDINGS)[number]) => {
    for (let z = b.z0 - 2; z <= b.z1 + 2; z += 2)
      for (let x = b.x0 - 2; x <= b.x1 + 2; x += 2) if (moved(x, z)) return true;
    return false;
  };
  for (const w of WAYS) if (w.line.some(([x, z]) => round(x, z, w.w / 2 + w.pave + 1))) ways.add(w.key);
  return {
    ways,
    other: BUILDINGS.some(plot) || [...LAMPS, ...STREET, ...SNOW_POLES].some((t) => round(t.x, t.z, 1.5)),
  };
}

function boxOf(b: (typeof BUILDINGS)[number]) {
  const y = terrainAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  const h =
    b.kind === "block"
      ? b.floors * 3.5 + 0.7
      : b.kind === "house"
        ? 9
        : b.kind === "church"
          ? 12
          : b.kind === "gas" || b.kind === "shelter" || b.kind === "gatehouse"
            ? 3.2
            : b.kind === "boathouse" || b.kind === "shed"
              ? 5.5
              : b.floors * 3.8 + 1.1;
  // (and under its roof: what's inside is out of the weather — its pitched roof's eaves lower)
  const eaves =
    b.kind === "house" ? 5 : b.kind === "church" ? 7 : b.kind === "boathouse" || b.kind === "shed" ? 3.2 : h - 0.4;
  return { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, top: y + h, eaves: y + eaves };
}
