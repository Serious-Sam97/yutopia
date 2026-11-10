// Plan 73, phase 3 — the life look's material library in the game: `libMaterial(id, renderer, { color })`
// gives a material of the library (life-matlib-list.ts), painted by tools/art/life/materials.mts.
//
//   - A Standard material, or a Physical one where the library asks for sheen (fabrics) or a clear
//     coat (varnish, glaze). Its colour is the caller's (a picked furniture or wardrobe colour: the
//     tintables are painted near white and multiply through), or the library's default.
//   - Its maps at first are 1 × 1 stand-ins of the same kinds (a white albedo, a flat normal, full
//     roughness and no shade), so the program it's compiled with is the one it keeps: when the real
//     textures arrive they're swapped in, no recompile, no hitch.
//   - The textures come through an AssetQueue (life-assets.ts): each material's three maps loaded once,
//     shared by every material of that id, held while any is in use, let go oldest-first past a budget.
//     Their repeat is the id's own (UVs in metres, a repeat `metres` across). Low takes the half-size set.
import {
  Color,
  type ColorRepresentation,
  DataTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector2,
  type WebGLRenderer,
} from "three";
import { AssetQueue, lifeKTX2 } from "./life-assets";
import { LIBRARY, MAPS, type MapKind, type MatId, matFile } from "./life-matlib-list";

/** Where the library's files are served. */
export const MAT_BASE = "/life/mat/";

type MapSet = Record<MapKind, Texture>;

// ── the stand-ins ───────────────────────────────────────────────────────────────────────────────

let standIns: MapSet | null = null;
function stand(): MapSet {
  if (standIns) return standIns;
  const one = (r: number, g: number, b: number, srgb: boolean) => {
    const t = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.needsUpdate = true;
    return t;
  };
  standIns = { albedo: one(255, 255, 255, true), orm: one(255, 255, 0, false), normal: one(128, 128, 255, false) };
  return standIns;
}

// ── the queue of texture sets ───────────────────────────────────────────────────────────────────

// (one a renderer, kept: the game's and the pictures' — one swapped for the other each time they took
// turns, every set was loaded again as new textures and the old ones never let go: plan 73 phase 11's
// memcheck, a visitor's picture in the HUD a turn)
const queues = new Map<WebGLRenderer, AssetQueue<MapSet>>();

/** A set's key: `<id>` or `<id>/half`. */
const keyOf = (id: MatId, half: boolean) => (half ? `${id}/half` : id);

function queueFor(renderer: WebGLRenderer): AssetQueue<MapSet> {
  const had = queues.get(renderer);
  if (had) return had;
  const queue = new AssetQueue<MapSet>({
    concurrency: 3,
    // (what the library may keep loaded and unused: the rest is let go)
    budget: 96 * 1024 * 1024,
    load: async (key) => {
      const [id, half] = key.split("/") as [MatId, string | undefined];
      const def = LIBRARY[id];
      const k = await lifeKTX2(renderer);
      const maps = await Promise.all(MAPS.map((m) => k.loadAsync(MAT_BASE + matFile(id, m, half === "half"))));
      const set = {} as MapSet;
      MAPS.forEach((m, i) => {
        const t = maps[i];
        t.colorSpace = m === "albedo" ? SRGBColorSpace : NoColorSpace;
        t.wrapS = t.wrapT = RepeatWrapping;
        t.repeat.set(1 / def.metres, 1 / def.metres);
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        set[m] = t;
      });
      return set;
    },
    size: (set) =>
      MAPS.reduce((s, m) => {
        const img = set[m].image as { width?: number; height?: number };
        return s + (img.width ?? 0) * (img.height ?? 0) * (4 / 3);
      }, 0),
    free: (set) => {
      for (const m of MAPS) set[m].dispose();
    },
  });
  queues.set(renderer, queue);
  return queue;
}

/** What the library holds now (loaded sets, bytes on the GPU — for the checks): `renderer`'s, or every
 *  renderer's. */
export const libStats = (renderer?: WebGLRenderer) => {
  const qs = renderer ? [queues.get(renderer)].filter((q) => !!q) : [...queues.values()];
  if (!qs.length) return null;
  const all = qs.map((q) => (q as AssetQueue<MapSet>).stats());
  return {
    bytes: all.reduce((n, x) => n + x.bytes, 0),
    held: all.reduce((n, x) => n + x.held, 0),
    queued: all.reduce((n, x) => n + x.queued, 0),
    ready: all.reduce((n, x) => n + x.ready, 0),
    loading: all.reduce((n, x) => n + x.loading, 0),
  };
};

// ── the materials ───────────────────────────────────────────────────────────────────────────────

export interface LibOpts {
  /** its colour (a tintable's pick; a tint on a self-coloured one) — the library's default if none */
  color?: ColorRepresentation;
  /** the half-size textures (Low) */
  half?: boolean;
  /** load priority: lower sooner (a distance) */
  priority?: number;
  /** (plan 74) its weave this many times finer: copies of the textures, the same images (one upload) —
   *  a garment's knit at a tee's scale, the furniture's left as they are */
  scale?: number;
}

export type LibMaterial = MeshStandardMaterial | MeshPhysicalMaterial;

/** A material of the library: its maps stand-ins until its textures arrive (then swapped in, no
 *  recompile); disposing it lets its textures go. */
export function libMaterial(id: MatId, renderer: WebGLRenderer, o: LibOpts = {}): LibMaterial {
  const def = LIBRARY[id] as (typeof LIBRARY)[MatId] & { sheen?: number; clearcoat?: number };
  const s = stand();
  const color = new Color(o.color ?? def.color);
  const base = {
    color,
    roughness: def.roughness,
    metalness: def.metalness,
    map: s.albedo,
    roughnessMap: s.orm,
    aoMap: s.orm,
    aoMapIntensity: 1,
    normalMap: s.normal,
    normalScale: new Vector2(def.normal, def.normal),
  };
  const m: LibMaterial =
    def.sheen || def.clearcoat
      ? new MeshPhysicalMaterial({
          ...base,
          sheen: def.sheen ?? 0,
          // (the sheen a paler version of the cloth's own colour)
          sheenColor: color.clone().lerp(new Color(1, 1, 1), 0.2),
          sheenRoughness: 0.6,
          clearcoat: def.clearcoat ?? 0,
          clearcoatRoughness: 0.3,
        })
      : new MeshStandardMaterial(base);
  m.name = `lib:${id}`;
  const key = keyOf(id, o.half === true);
  const q = queueFor(renderer);
  let gone = false;
  // (when its own textures are in: userData.loaded — the benches wait on it)
  const finer: Texture[] = [];
  const fine = (t: Texture): Texture => {
    if (!o.scale || o.scale === 1) return t;
    const c = t.clone();
    c.repeat.multiplyScalar(o.scale);
    finer.push(c);
    return c;
  };
  m.userData.loaded = q.get(key, o.priority ?? 0).then(
    (set) => {
      if (gone) return;
      const orm = fine(set.orm);
      m.map = fine(set.albedo);
      m.roughnessMap = orm;
      m.aoMap = orm;
      m.normalMap = fine(set.normal);
    },
    (e) => console.warn(`life matlib: ${id} didn't load`, e),
  );
  m.addEventListener("dispose", () => {
    gone = true;
    for (const t of finer) t.dispose();
    q.release(key);
  });
  return m;
}
