import {
  BUILDINGS,
  CHUNK,
  GROUNDS,
  groundSurfaceAt,
  groundsChunk,
  heightAt,
  KART_FENCE,
  missingLand,
  type Tree,
  terrainAt,
  treesIn,
} from "@yutopia/shared/grounds";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  type DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  StaticDrawUsage,
  Vector3,
} from "three";
import { bareTree3, snowCanvas, tinted } from "./campus";
import {
  birchGeometry,
  farBareGeometry,
  farBirchGeometry,
  farPineGeometry,
  Grounds3,
  pineGeometry,
  SURF,
} from "./grounds3d";
import type { Themes } from "./sky";
import { boulderGeometry, COVERS, coverIn, logGeometry, shrubGeometry, stoneGeometry, stumpGeometry } from "./woods3d";

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
  shown: boolean;
}

// a vertex of the land's colour: its surface's, the snow a little blue in long waves. (The Kart Park's
// asphalt is its circuit's own meshes': under them the land's snow — its layout changes, the land's
// made once — docs/plan/47-the-track-changer.md)
const BLUE = new Color(0xdbe5f0);
function landColour(x: number, z: number, near: boolean, c: Color) {
  const F = KART_FENCE;
  const g = groundSurfaceAt(x, z, !near);
  const s = g === "asphalt" && x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1 ? "snow" : g;
  c.setHex(SURF[s]);
  if (s === "snow" || s === "deep") c.lerp(BLUE, 0.35 + 0.35 * Math.sin(x * 0.05 + z * 0.031));
}

export class GroundsStream {
  readonly root = new Group();
  readonly statics: Grounds3;
  private blocks = new Map<string, Block>();
  private landMat: MeshLambertMaterial;
  private snowTex: CanvasTexture;
  private pools: Pool[] = [];
  private casters: Pool[] = [];
  private castersAt = new Vector3(1e9, 0, 1e9);
  private poolsDirty = true;
  private kinds: {
    pine: number[];
    birch: number[];
    bare: number[];
    far: number;
    mound: number;
    farBirch: number;
    farBare: number;
    cover: Record<string, number>;
  };
  /** the woods' sway: the time, and how hard (sky.ts: harder in a storm) */
  readonly wind = { value: 1 };
  private windT = { value: 0 };
  private casting = new Set<number>();
  private fade = { a: { value: new Vector3() }, b: { value: new Vector3() } };
  /** behind the loading screen (docs/plan/35): build with a much bigger budget a frame */
  boost = false;
  /** what's still to build: land blocks wanted and missing, and the rest's steps */
  readonly left = { blocks: 0, statics: 0 };

  constructor(
    T: Themes,
    private covered: Covered,
    patch: (m: Material) => void,
    hqEast?: number, // (the studio's own width: Grounds3's courtyard bridge starts past it)
  ) {
    this.snowTex = new CanvasTexture(snowCanvas(T, 512, 43));
    this.snowTex.colorSpace = SRGBColorSpace;
    this.snowTex.wrapS = RepeatWrapping;
    this.snowTex.wrapT = RepeatWrapping;
    this.snowTex.anisotropy = 8;
    this.landMat = new MeshLambertMaterial({ map: this.snowTex, vertexColors: true });
    patch(this.landMat);
    // the trees' kinds, one pool each (and its shadow casters)
    const r = T.rng(9);
    const treeMat = new MeshLambertMaterial({ vertexColors: true });
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
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 fadeA;\nuniform vec3 fadeB;\nuniform float windT;\nuniform float windK;\nvarying float vFade;",
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
    const geos: BufferGeometry[] = [
      // spruces: three of the usual, then a young one, a tall thin one, an old broad one heavy with snow
      ...[0, 1, 2].map(() => pineGeometry(r)),
      pineGeometry(r, { tiers: 5, H: 6.5, width: 0.82, snow: 0.55 }),
      pineGeometry(r, { tiers: 9, H: 13.5, width: 0.72, snow: 0.45 }),
      pineGeometry(r, { tiers: 7, H: 11, width: 1.22, snow: 0.68 }),
      ...[0, 1, 2].map(() => birchGeometry(r)),
      ...[0, 1, 2].map(() => bareTree3(r)),
      farPineGeometry(),
      // (finer than it was: faceted, a coarse one was a heap of shards)
      tinted(new SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xf6f8fb),
      farBirchGeometry(),
      farBareGeometry(),
      // the woods' floor (woods3d.ts)
      shrubGeometry(r),
      stumpGeometry(r),
      logGeometry(r),
      stoneGeometry(r),
      boulderGeometry(r),
    ];
    this.kinds = {
      pine: [0, 1, 2, 3, 4, 5],
      birch: [6, 7, 8],
      bare: [9, 10, 11],
      far: 12,
      mound: 13,
      farBirch: 14,
      farBare: 15,
      cover: Object.fromEntries(COVERS.map((c, i) => [c, 16 + i])),
    };
    // (the near trees and the boulders cast the sun's shadow; the far ones, the mounds, the rest don't)
    this.casting = new Set([...this.kinds.pine, ...this.kinds.birch, ...this.kinds.bare, this.kinds.cover.boulder]);
    for (const [i, g] of geos.entries()) {
      const p = new Pool(g, treeMat, false);
      this.pools.push(p);
      this.root.add(p.mesh);
      const c = new Pool(g, treeMat, this.casting.has(i));
      c.mesh.layers.set(CASTER_LAYER);
      this.casters.push(c);
      this.root.add(c.mesh);
    }
    // everything that isn't land or woods: built once, all of it
    this.statics = new Grounds3(T, {
      cx: (GROUNDS.x0 + GROUNDS.x1) / 2,
      cz: (GROUNDS.z0 + GROUNDS.z1) / 2,
      radius: 900,
      stream: true,
      hqEast,
    });
    this.root.add(this.statics.root);
    this.patch = patch;
  }
  private patch: (m: Material) => void;
  private patched = new WeakSet<Material>();
  /** Set by the view: a new thing's shaders made ready before it's drawn (a town
   *  block's, compiled the frame it first showed, was a 200 ms frame on the ride in). */
  prepare: ((o: Object3D) => void) | null = null;

  /** The buildings standing on the Grounds (building coords), to their roofs:
   *  the chase camera keeps out of them as out of walls. */
  readonly boxes = BUILDINGS.filter((b) => b.kind !== "hq").map((b) => {
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
    return { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, top: y + h };
  });

  /** The ground's height at (x, z) (building coords: where clicks land). */
  heightAt(x: number, z: number): number {
    return heightAt(x, z);
  }

  setNight(k: number, land: Color) {
    this.statics.setNight(k);
    // (the far ridges are painted: they take the hour as a tint)
    this.statics.ridgeMat.color.copy(land).multiplyScalar(1 + 0.4 * k);
  }

  /** Round (x, z) (building coords: whose feet the camera's on): what's wanted,
   *  built a little at a time, shown. `target`: those feet (trees in front of them fade). */
  update(x: number, z: number, cam: Vector3, target?: Vector3) {
    this.windT.value = performance.now() / 1000;
    this.statics.tick(this.windT.value);
    this.fade.a.value.copy(cam);
    this.fade.b.value.copy(target ?? cam);
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
    for (let z0 = Math.floor(GROUNDS.z0 / S) * S; z0 < GROUNDS.z1; z0 += S)
      for (let x0 = Math.floor(GROUNDS.x0 / S) * S; x0 < GROUNDS.x1; x0 += S) visit(0, x0, z0);
    // build the nearest missing, a few ms a frame
    const missing = want.filter((k) => !this.blocks.get(k)?.mesh);
    missing.sort((a, b) => distTo(a, x, z) - distTo(b, x, z));
    this.left.blocks = missing.length;
    const budget = this.boost ? BOOST_MS : BUDGET_MS;
    const t0 = performance.now();
    for (const k of missing) {
      if (performance.now() - t0 > budget) break;
      // a near block reads its chunk's land and, for its slopes, the
      // neighbours': made a chunk at a time (~7 ms each) before it
      const [tier, x0, z0] = parse(k);
      if (tier === TIERS.length - 1) {
        const need = missingLand(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK));
        if (need) {
          groundsChunk(need[0], need[1]);
          if (!this.boost) break;
          // (covered by the loading screen: all it needs now, then the block)
          let more = missingLand(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK));
          while (more) {
            groundsChunk(more[0], more[1]);
            more = missingLand(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK));
          }
        }
      }
      this.build(k);
      this.left.blocks--;
    }
    // show: each wanted block, or while it isn't built what covers it
    const wanted = new Set(want);
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
        this.poolsDirty = true;
      }
      // not wanted, not covering anything: gone
      if (!on && !wanted.has(b.key)) {
        b.mesh?.geometry.dispose();
        b.mesh?.removeFromParent();
        this.blocks.delete(b.key);
      }
    }
    if (this.poolsDirty) this.fillPools();
    if (target) this.statics.cutAt(target.x, target.z);
    // the rest of the Grounds (the ways, the buildings, the lamps…), a few ms a frame
    const s0 = performance.now();
    while (performance.now() - s0 < (this.boost ? BOOST_MS : 4)) {
      const added = this.statics.step();
      if (!added) break;
      for (const o of added) {
        o.traverse((c) => {
          const m = (c as Mesh).material;
          // (the ice too: unpatched, it stayed as bright as day after dark)
          for (const x of Array.isArray(m) ? m : m ? [m] : [])
            if ((x instanceof MeshLambertMaterial || x instanceof MeshStandardMaterial) && !this.patched.has(x)) {
              this.patched.add(x);
              this.patch(x);
            }
        });
        this.prepare?.(o);
      }
    }
    this.left.statics = this.statics.left;
    if (Math.hypot(x - this.castersAt.x, z - this.castersAt.z) > 6) this.fillCasters(x, z);
    this.statics.faceCards(cam);
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
  private build(k: string) {
    const [tier, x0, z0] = parse(k);
    const { size, step } = TIERS[tier];
    const near = tier === TIERS.length - 1;
    const n = size / step;
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const c = new Color();
    // near: the walking chunk's own heights (the same the feet are on)
    const chunk = near ? groundsChunk(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK)) : null;
    const height = (i: number, j: number) =>
      chunk ? chunk.h[j * 2 * (CHUNK * 2 + 1) + i * 2] : terrainAt(x0 + i * step, z0 + j * step);
    const vert = (x: number, y: number, z: number) => {
      pos.push(x - x0, y, z - z0);
      landColour(x, z, near, c);
      col.push(c.r, c.g, c.b);
      uv.push(x / 14, z / 14);
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) vert(x0 + i * step, height(i, j), z0 + j * step);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        // (the ground floor's own tiles: its floor is drawn there)
        if (this.covered(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
        const p = j * (n + 1) + i;
        idx.push(p, p + n + 1, p + 1, p + 1, p + n + 1, p + n + 2);
      }
    // skirts down from the edges (no cracks where the detail changes)
    const under: [number, number][] = []; // a skirt's foot, the edge vertex over it
    const edge = (list: number[]) => {
      const base = pos.length / 3;
      for (const [i, p] of list.entries()) {
        under.push([base + i, p]);
        pos.push(pos[p * 3], pos[p * 3 + 1] - 1.6 - step * 0.4, pos[p * 3 + 2]);
        col.push(col[p * 3], col[p * 3 + 1], col[p * 3 + 2]);
        uv.push(uv[p * 2], uv[p * 2 + 1]);
      }
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        idx.push(a, base + i, b, b, base + i, base + i + 1, a, b, base + i, b, base + i + 1, base + i);
      }
    };
    edge(Array.from({ length: n + 1 }, (_, a) => a));
    edge(Array.from({ length: n + 1 }, (_, a) => n * (n + 1) + a));
    edge(Array.from({ length: n + 1 }, (_, b) => b * (n + 1)));
    edge(Array.from({ length: n + 1 }, (_, b) => b * (n + 1) + n));
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // (a skirt is two-faced: its feet's normals summed to nothing — NaN in the
    // light, and after dark the bloom spread it over the whole frame. They
    // take the normal of the land above them.)
    const nrm = g.getAttribute("normal");
    for (const [f, p] of under) nrm.setXYZ(f, nrm.getX(p), nrm.getY(p), nrm.getZ(p));
    const mesh = new Mesh(g, this.landMat);
    mesh.position.set(x0, 0, z0);
    mesh.receiveShadow = near;
    mesh.visible = false;
    this.root.add(mesh);
    // its trees, by kind
    const trees: Tree[] = [];
    for (let cz = Math.floor(z0 / CHUNK); cz < (z0 + size) / CHUNK; cz++)
      for (let cx = Math.floor(x0 / CHUNK); cx < (x0 + size) / CHUNK; cx++)
        trees.push(...(near && chunk ? chunk.trees : treesIn(cx, cz)));
    const by = new Map<number, number[]>();
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const tilt = new Quaternion();
    const axis = new Vector3();
    // each tree its own lean and girth (a hash of where it stands: the same for everyone)
    const hash = (x: number, z: number, k: number) => {
      const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };
    const put = (pool: number, t: Tree, s: number, sy = s, dy = -0.25, lean = true) => {
      q.setFromAxisAngle(up, t.ry);
      let sx = s;
      let sz = s;
      if (lean) {
        const a = hash(t.x, t.z, 1) * Math.PI * 2;
        axis.set(Math.cos(a), 0, Math.sin(a));
        q.premultiply(tilt.setFromAxisAngle(axis, (hash(t.x, t.z, 2) - 0.5) * 0.09));
        sx = s * (0.9 + 0.2 * hash(t.x, t.z, 3));
        sz = s * (0.9 + 0.2 * hash(t.x, t.z, 4));
      }
      m.compose(new Vector3(t.x, t.y + dy, t.z), q, new Vector3(sx, sy, sz));
      const l = by.get(pool) ?? [];
      by.set(pool, l);
      l.push(...m.elements);
    };
    const K = this.kinds;
    for (const t of trees) {
      const v = Math.floor(t.ry * 10) % 3;
      const sy = 0.9 + (t.s % 0.2);
      if (t.kind === "pine") {
        // (mostly the usual three; now and then a young one, a tall one, an old broad one)
        const h = hash(t.x, t.z, 5);
        const pv = h < 0.6 ? v : h < 0.75 ? 3 : h < 0.88 ? 4 : 5;
        put(near ? K.pine[pv] : K.far, t, t.s * 1.45, t.s * 1.45 * sy);
        if (near) put(K.mound, t, 2.2 * t.s, 0.45, -0.2, false);
      } else if (near) {
        put(t.kind === "birch" ? K.birch[v] : K.bare[v], t, t.s * (t.kind === "bare" ? 1.7 : 1), t.s * sy);
        put(K.mound, t, 1.1 * t.s, 0.3, -0.2, false);
      } else put(t.kind === "birch" ? K.farBirch : K.farBare, t, t.s * (t.kind === "bare" ? 1.7 : 1), t.s * sy);
    }
    // the woods' floor, near you
    if (near && chunk)
      for (const c of coverIn(Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK), trees))
        put(K.cover[c.kind], { x: c.x, y: c.y, z: c.z, ry: c.ry, s: c.s, kind: "pine" } as Tree, c.s, c.s, 0, false);
    const blk: Block = { key: k, tier, x0, z0, mesh, trees: new Map(), shown: false };
    for (const [p, l] of by) blk.trees.set(p, new Float32Array(l));
    this.blocks.set(k, blk);
    this.poolsDirty = true;
  }

  // the pools hold the trees of the blocks shown
  private fillPools() {
    this.poolsDirty = false;
    for (const [i, pool] of this.pools.entries()) {
      const parts: Float32Array[] = [];
      for (const b of this.blocks.values())
        if (b.shown) {
          const t = b.trees.get(i);
          if (t) parts.push(t);
        }
      pool.set(parts);
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
    for (const b of this.blocks.values()) b.mesh?.geometry.dispose();
    for (const p of [...this.pools, ...this.casters]) p.dispose();
    this.landMat.dispose();
    this.snowTex.dispose();
    this.statics.dispose();
    this.root.removeFromParent();
  }
}

// One kind of tree, instanced: its instances replaced as blocks come and go.
class Pool {
  mesh: InstancedMesh;
  private cap = 0;
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
    const m = new InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(StaticDrawUsage as unknown as typeof DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    return m;
  }
  set(parts: Float32Array[]) {
    const n = parts.reduce((a, p) => a + p.length / 16, 0);
    if (n > this.cap) {
      const old = this.mesh;
      const next = this.make(Math.ceil(n * 1.3));
      next.castShadow = old.castShadow;
      next.layers.mask = old.layers.mask;
      old.parent?.add(next);
      old.removeFromParent();
      old.dispose();
      this.mesh = next;
    }
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

const key = (t: number, x0: number, z0: number) => `${t}:${x0}:${z0}`;
const parse = (k: string) => k.split(":").map(Number) as [number, number, number];
function distTo(k: string, x: number, z: number): number {
  const [t, x0, z0] = parse(k);
  const s = TIERS[t].size;
  return Math.hypot(x0 + s / 2 - x, z0 + s / 2 - z);
}
