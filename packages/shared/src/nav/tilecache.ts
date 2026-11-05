// A floor's tile cache built a few tiles at a time (recast-navigation's generateTileCache, its
// generators package, as it is in 0.44 — the same steps, the same config), but it hands the event
// loop back every few milliseconds, so a big floor (the ground floor and its land: ~0.4 s of work)
// never holds up the rooms round it; and each tile's triangles are sorted to it here, not by
// recast's chunky mesh (whose tree over the land was a third of a second in one go) — plan 72 ph 7.
import {
  allocCompactHeightfield,
  allocHeightfield,
  allocHeightfieldLayerSet,
  buildCompactHeightfield,
  buildHeightfieldLayers,
  buildTileCacheLayer,
  calcGridSize,
  cloneRcConfig,
  createHeightfield,
  createRcConfig,
  Detour,
  DetourTileCacheParams,
  erodeWalkableArea,
  filterLedgeSpans,
  filterLowHangingWalkableObstacles,
  filterWalkableLowHeightSpans,
  freeCompactHeightfield,
  freeHeightfield,
  freeHeightfieldLayerSet,
  getHeightfieldLayerAreas,
  getHeightfieldLayerCons,
  getHeightfieldLayerHeights,
  markWalkableTriangles,
  NavMesh,
  NavMeshParams,
  Raw,
  RecastBuildContext,
  type RecastConfig,
  rasterizeTriangles,
  statusFailed,
  TileCache,
  TileCacheData,
  TileCacheMeshProcess,
  TriangleAreasArray,
  TrianglesArray,
  type Vector3Tuple,
  VerticesArray,
  vec3,
} from "recast-navigation";
import { dtIlog2, dtNextPow2 } from "recast-navigation/generators";

type TileData = InstanceType<typeof TileCacheData>;

export type TileCacheConfig = Partial<RecastConfig> & { expectedLayersPerTile: number; maxObstacles: number };

/** Every polygon walkable, area 0 (the generator's default). */
export const meshProcess = () =>
  new TileCacheMeshProcess((params, areas, flags) => {
    for (let i = 0; i < params.polyCount(); ++i) {
      areas.set(i, 0);
      flags.set(i, 1);
    }
  });

/** (the event loop back, in the browser and in node) */
const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** The tile cache and its navmesh for the triangles, between `bounds`; `sliceMs` of work at a time
 *  (0: all at once). Null when it can't be made. */
export async function buildTileCache(
  positions: readonly number[],
  indices: readonly number[],
  cfg: TileCacheConfig,
  bounds: [Vector3Tuple, Vector3Tuple],
  sliceMs = 8,
): Promise<{ tileCache: TileCache; navMesh: NavMesh } | null> {
  const ctx = new RecastBuildContext();
  const tileCache = new TileCache();
  const navMesh = new NavMesh();
  const verts = new VerticesArray();
  verts.copy(positions as number[]);
  const numVertices = positions.length / 3;
  const [bbMin, bbMax] = bounds;
  const { expectedLayersPerTile, maxObstacles, ...recast } = cfg;
  const done = (ok: boolean) => {
    verts.destroy();
    ctx.destroy();
    if (ok) return { tileCache, navMesh };
    tileCache.destroy();
    navMesh.destroy();
    return null;
  };

  const config = createRcConfig(recast);
  const grid = calcGridSize(bbMin, bbMax, config.cs);
  config.minRegionArea = config.minRegionArea * config.minRegionArea;
  config.mergeRegionArea = config.mergeRegionArea * config.mergeRegionArea;
  config.detailSampleDist = config.detailSampleDist < 0.9 ? 0 : config.cs * config.detailSampleDist;
  config.detailSampleMaxError = config.ch * config.detailSampleMaxError;
  const tileSize = Math.floor(config.tileSize);
  const tilesW = Math.floor((grid.width + tileSize - 1) / tileSize);
  const tilesH = Math.floor((grid.height + tileSize - 1) / tileSize);
  config.borderSize = config.walkableRadius + 3;
  config.width = config.tileSize + config.borderSize * 2;
  config.height = config.tileSize + config.borderSize * 2;

  const params = DetourTileCacheParams.create({
    orig: bbMin,
    cs: config.cs,
    ch: config.ch,
    width: config.tileSize,
    height: config.tileSize,
    walkableHeight: config.walkableHeight * config.ch,
    walkableRadius: config.walkableRadius * config.cs,
    walkableClimb: config.walkableClimb * config.ch,
    maxSimplificationError: config.maxSimplificationError,
    maxTiles: tilesW * tilesH * expectedLayersPerTile,
    maxObstacles,
  });
  const allocator = new Raw.RecastLinearAllocator(32000);
  const compressor = new Raw.RecastFastLZCompressor();
  if (!tileCache.init(params, allocator, compressor, meshProcess())) return done(false);
  const tileBits = Math.min(Math.floor(dtIlog2(dtNextPow2(tilesW * tilesH * expectedLayersPerTile))), 14);
  const meshParams = NavMeshParams.create({
    orig: vec3.fromArray(bbMin),
    tileWidth: config.tileSize * config.cs,
    tileHeight: config.tileSize * config.cs,
    maxTiles: 1 << tileBits,
    maxPolys: 1 << (22 - tileBits),
  });
  if (!navMesh.initTiled(meshParams)) return done(false);
  // each tile's triangles (with its border round it): sorted here, not by recast's chunky mesh —
  // its tree over the ground floor's land was a third of a second at once
  const tcs = config.tileSize * config.cs;
  const border = config.borderSize * config.cs;
  const bins: number[][] = Array.from({ length: tilesW * tilesH }, () => []);
  let t0 = performance.now();
  const slice = async () => {
    if (sliceMs > 0 && performance.now() - t0 > sliceMs) {
      await pause();
      t0 = performance.now();
    }
  };
  for (let t = 0; t < indices.length; t += 3) {
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 3; k++) {
      const v = indices[t + k] * 3;
      x0 = Math.min(x0, positions[v]);
      x1 = Math.max(x1, positions[v]);
      z0 = Math.min(z0, positions[v + 2]);
      z1 = Math.max(z1, positions[v + 2]);
    }
    const tx0 = Math.max(0, Math.floor((x0 - border - bbMin[0]) / tcs));
    const tx1 = Math.min(tilesW - 1, Math.floor((x1 + border - bbMin[0]) / tcs));
    const ty0 = Math.max(0, Math.floor((z0 - border - bbMin[2]) / tcs));
    const ty1 = Math.min(tilesH - 1, Math.floor((z1 + border - bbMin[2]) / tcs));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) bins[ty * tilesW + tx].push(t);
    if (t % 30000 === 0) await slice();
  }

  // one tile's layers, compressed (empty: nothing to stand on there)
  const layersOf = (tx: number, ty: number): TileData[] => {
    const mine = bins[ty * tilesW + tx];
    if (!mine.length) return [];
    const tc = cloneRcConfig(config);
    const b = tc.borderSize * tc.cs;
    const lo: Vector3Tuple = [bbMin[0] + tx * tcs - b, bbMin[1], bbMin[2] + ty * tcs - b];
    const hi: Vector3Tuple = [bbMin[0] + (tx + 1) * tcs + b, bbMax[1], bbMin[2] + (ty + 1) * tcs + b];
    for (let i = 0; i < 3; i++) {
      tc.set_bmin(i, lo[i]);
      tc.set_bmax(i, hi[i]);
    }
    const hf = allocHeightfield();
    try {
      if (!createHeightfield(ctx, hf, tc.width, tc.height, lo, hi, tc.cs, tc.ch)) return [];
      const list: number[] = [];
      for (const t of mine) list.push(indices[t], indices[t + 1], indices[t + 2]);
      const tris = new TrianglesArray();
      tris.copy(list);
      const areas = new TriangleAreasArray();
      areas.resize(mine.length);
      markWalkableTriangles(ctx, tc.walkableSlopeAngle, verts, numVertices, tris, mine.length, areas);
      const ok = rasterizeTriangles(ctx, verts, numVertices, tris, areas, mine.length, hf, tc.walkableClimb);
      tris.destroy();
      areas.destroy();
      if (!ok) return [];
      filterLowHangingWalkableObstacles(ctx, config.walkableClimb, hf);
      filterLedgeSpans(ctx, config.walkableHeight, config.walkableClimb, hf);
      filterWalkableLowHeightSpans(ctx, config.walkableHeight, hf);
      const chf = allocCompactHeightfield();
      try {
        if (!buildCompactHeightfield(ctx, config.walkableHeight, config.walkableClimb, hf, chf)) return [];
        if (!erodeWalkableArea(ctx, config.walkableRadius, chf)) return [];
        const set = allocHeightfieldLayerSet();
        try {
          if (!buildHeightfieldLayers(ctx, chf, config.borderSize, config.walkableHeight, set)) return [];
          const out: TileData[] = [];
          for (let i = 0; i < set.nlayers(); i++) {
            const layer = set.layers(i);
            const h = new Raw.dtTileCacheLayerHeader();
            h.magic = Detour.DT_TILECACHE_MAGIC;
            h.version = Detour.DT_TILECACHE_VERSION;
            h.tx = tx;
            h.ty = ty;
            h.tlayer = i;
            const bmin = layer.bmin();
            const bmax = layer.bmax();
            h.set_bmin(0, bmin.x);
            h.set_bmin(1, bmin.y);
            h.set_bmin(2, bmin.z);
            h.set_bmax(0, bmax.x);
            h.set_bmax(1, bmax.y);
            h.set_bmax(2, bmax.z);
            h.width = layer.width();
            h.height = layer.height();
            h.minx = layer.minx();
            h.maxx = layer.maxx();
            h.miny = layer.miny();
            h.maxy = layer.maxy();
            h.hmin = layer.hmin();
            h.hmax = layer.hmax();
            const heights = getHeightfieldLayerHeights(layer);
            const areas = getHeightfieldLayerAreas(layer);
            const cons = getHeightfieldLayerCons(layer);
            const data = new TileCacheData();
            const status = buildTileCacheLayer(compressor, h, heights, areas, cons, data);
            Raw.destroy(h);
            heights.destroy();
            areas.destroy();
            cons.destroy();
            if (statusFailed(status)) {
              data.destroy();
              for (const t of out) t.destroy();
              return [];
            }
            out.push(data);
          }
          return out;
        } finally {
          freeHeightfieldLayerSet(set);
        }
      } finally {
        freeCompactHeightfield(chf);
      }
    } finally {
      freeHeightfield(hf);
    }
  };

  for (let y = 0; y < tilesH; y++)
    for (let x = 0; x < tilesW; x++) {
      for (const data of layersOf(x, y)) if (statusFailed(tileCache.addTile(data).status)) data.destroy();
      await slice();
    }
  for (let y = 0; y < tilesH; y++)
    for (let x = 0; x < tilesW; x++) {
      if (statusFailed(tileCache.buildNavMeshTilesAt(x, y, navMesh))) return done(false);
      await slice();
    }
  return done(true);
}
