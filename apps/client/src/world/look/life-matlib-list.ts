// Plan 73, phase 3 — the life look's material library: what each material is (data only, no imports —
// read by the game, look/life-matlib.ts, and by the generator that paints its textures,
// tools/art/life/materials.mts).
//
// Every material has three maps, built as `public/life/mat/<id>-{albedo,orm,normal}.ktx2` (and
// `-half` for Low): the albedo (sRGB), orm (R the crevices' shade, G roughness, B metal; linear) and a
// normal map. A tintable one is painted near white — its colour comes from whoever uses it (a picked
// furniture or wardrobe colour, multiplied through, as today); the others carry their own and are
// drawn with `color` white unless a caller tints them (a stain on a wood).

export type MatFamily =
  | "wood"
  | "floor"
  | "fabric"
  | "leather"
  | "metal"
  | "wall"
  | "tile"
  | "carpet"
  | "masonry"
  | "ground"
  | "plant";

export interface MatDef {
  family: MatFamily;
  /** a repeat's size in metres (the texture covers metres × metres; UVs are in metres) */
  metres: number;
  /** the texture's side in pixels (full size; Low takes half) */
  px: number;
  /** painted near white, coloured by the caller */
  tint: boolean;
  /** the colour it's shown in by default (a tintable's typical pick; white for the self-coloured) */
  color: number;
  /** what the orm's roughness (G, 0…1) is scaled by */
  roughness: number;
  metalness: number;
  /** the normal map's strength (three's normalScale) */
  normal: number;
  /** fabrics: the soft rim of light on a weave (MeshPhysical sheen) */
  sheen?: number;
  /** varnished woods, glazed tiles: a clear coat over it */
  clearcoat?: number;
  /** (plan 130's quality pass) a photo material's source: its ambientCG id (CC0; tools/art/life/photo-materials.mts
   *  makes its maps from the downloaded set — the painted ones are tools/art/life/materials.mts's) */
  photo?: string;
}

const wood = (color = 0xffffff): MatDef => ({
  family: "wood",
  metres: 1,
  px: 512,
  tint: false,
  color,
  roughness: 0.62,
  metalness: 0,
  normal: 0.2,
  clearcoat: 0.3,
});
const fabric = (color: number, metres = 0.25, normal = 0.6, sheen = 0.6): MatDef => ({
  family: "fabric",
  metres,
  px: 512,
  tint: true,
  color,
  roughness: 0.95,
  metalness: 0,
  normal,
  sheen,
});
const ground = (metres: number, roughness: number, normal: number, px = 1024): MatDef => ({
  family: "ground",
  metres,
  px,
  tint: false,
  color: 0xffffff,
  roughness,
  metalness: 0,
  normal,
});

/** (plan 130's quality pass) a CC0 photo material: its family, its ambientCG id, a repeat's metres, its roughness
 *  scale, a clear coat (a varnished floor's, a glazed tile's). */
const photo = (family: MatFamily, id: string, metres: number, roughness: number, clearcoat?: number): MatDef => ({
  family,
  metres,
  px: 512,
  tint: false,
  color: 0xffffff,
  roughness,
  metalness: 0,
  normal: 1,
  photo: id,
  ...(clearcoat ? { clearcoat } : {}),
});

export const LIBRARY = {
  // woods: furniture (the grain along u, a metre a repeat)
  oak: wood(),
  walnut: wood(),
  pine: wood(),
  cherry: wood(),
  birch: wood(),
  ash: wood(),
  // floorboards (planks along u, 2 m a repeat)
  "floor-oak": { ...wood(), family: "floor", metres: 2, px: 1024, roughness: 0.55, normal: 0.3, clearcoat: 0.45 },
  "floor-walnut": { ...wood(), family: "floor", metres: 2, px: 1024, roughness: 0.55, normal: 0.3, clearcoat: 0.45 },
  // fabrics: upholstery, curtains, clothes (tinted)
  linen: fabric(0xd9cdb8),
  twill: fabric(0x4f6a86, 0.2),
  velvet: fabric(0x6b2f3c, 0.3, 0.25, 1),
  boucle: fabric(0xe8e1d4, 0.2, 0.9, 0.5),
  tweed: fabric(0x7b6f5c, 0.25, 0.7, 0.4),
  herringbone: fabric(0x5a5f66, 0.25),
  leather: {
    family: "leather",
    metres: 0.3,
    px: 512,
    tint: true,
    color: 0x6e3f24,
    roughness: 0.62,
    metalness: 0,
    normal: 0.5,
    clearcoat: 0.15,
  },
  // metals (tinted: steel grey, brass, copper by the colour)
  "metal-brushed": {
    family: "metal",
    metres: 0.5,
    px: 512,
    tint: true,
    color: 0xc4c7cb,
    roughness: 0.42,
    metalness: 1,
    normal: 0.12,
  },
  "metal-cast": {
    family: "metal",
    metres: 0.5,
    px: 512,
    tint: true,
    color: 0x2b2c2e,
    roughness: 0.7,
    metalness: 0.6,
    normal: 0.35,
  },
  "metal-polished": {
    family: "metal",
    metres: 0.5,
    px: 256,
    tint: true,
    color: 0xd8dade,
    roughness: 0.2,
    metalness: 1,
    normal: 0.05,
  },
  // walls (tinted: the paint, the paper's colour)
  plaster: {
    family: "wall",
    metres: 2,
    px: 512,
    tint: true,
    color: 0xe9dcc6,
    roughness: 0.92,
    metalness: 0,
    normal: 0.12,
  },
  "wallpaper-stripe": {
    family: "wall",
    metres: 0.6,
    px: 512,
    tint: true,
    color: 0xb9c7b4,
    roughness: 0.85,
    metalness: 0,
    normal: 0.15,
  },
  "wallpaper-damask": {
    family: "wall",
    metres: 0.6,
    px: 512,
    tint: true,
    color: 0xc9b48f,
    roughness: 0.85,
    metalness: 0,
    normal: 0.15,
  },
  // tiles (tinted: the glaze)
  "tile-floor": {
    family: "tile",
    metres: 1.2,
    px: 512,
    tint: true,
    color: 0xe4d9c4,
    roughness: 0.5,
    metalness: 0,
    normal: 0.6,
    clearcoat: 0.25,
  },
  "tile-wall": {
    family: "tile",
    metres: 0.6,
    px: 512,
    tint: true,
    color: 0xdfe7e6,
    roughness: 0.3,
    metalness: 0,
    normal: 0.6,
    clearcoat: 0.6,
  },
  carpet: {
    family: "carpet",
    metres: 0.5,
    px: 512,
    tint: true,
    color: 0x8a8578,
    roughness: 1,
    metalness: 0,
    normal: 0.8,
  },
  // masonry and the ground outside
  brick: {
    family: "masonry",
    metres: 1.2,
    px: 1024,
    tint: false,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    normal: 0.8,
  },
  // (plan 73 phase 7) a pitched roof's slates: courses of 15 cm, four slates a course a 1.2 m repeat,
  // u along the eaves, v up the slope
  "roof-slate": {
    family: "masonry",
    metres: 1.2,
    px: 1024,
    tint: false,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    normal: 0.9,
  },
  // (plan 110's buildings: their skins and roofs, painted near white or self-coloured — a building's colour is
  // its vertices', the self-coloured ones' over their mean: kit-buildings.ts)
  clapboard: {
    family: "wall",
    metres: 1.1,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0,
    normal: 1.1,
  },
  "shingle-wall": {
    family: "wall",
    metres: 1.4,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    normal: 1.0,
  },
  batten: {
    family: "wall",
    metres: 1.8,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    normal: 1.0,
  },
  stucco: {
    family: "wall",
    metres: 2,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
    normal: 0.7,
  },
  fieldstone: {
    family: "masonry",
    metres: 2,
    px: 1024,
    tint: false,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    normal: 1.0,
  },
  limestone: {
    family: "masonry",
    metres: 2.4,
    px: 1024,
    tint: false,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    normal: 0.7,
  },
  panel: {
    family: "metal",
    metres: 3,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0,
    normal: 0.6,
  },
  corrugated: {
    family: "metal",
    metres: 0.9,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    normal: 1.2,
  },
  "roof-shingle": {
    family: "masonry",
    metres: 1.4,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
    normal: 1.0,
  },
  "roof-metal": {
    family: "metal",
    metres: 1.8,
    px: 512,
    tint: true,
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    normal: 0.8,
  },
  concrete: ground(2, 0.9, 0.35, 512),
  asphalt: ground(2, 0.95, 0.5),
  paving: ground(2.4, 0.85, 0.6),
  grass: ground(2, 1, 0.5),
  dirt: ground(2, 1, 0.7),
  // plants: a trunk's bark (around u, up v), a hedge's and a bush's leaves
  bark: { family: "plant", metres: 1, px: 512, tint: false, color: 0xffffff, roughness: 0.95, metalness: 0, normal: 1 },
  foliage: {
    family: "plant",
    metres: 1,
    px: 512,
    tint: false,
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0,
    normal: 0.7,
  },
  // (plan 130's quality pass) photo materials, CC0 from ambientCG: the house's floors, walls, roofs
  "floor-herringbone": photo("floor", "WoodFloor034", 2, 0.9, 0.25),
  "floor-parquet": photo("floor", "WoodFloor051", 2, 0.9, 0.3),
  "floor-parquet-dark": photo("floor", "WoodFloor064", 2, 0.9, 0.3),
  terrazzo: photo("tile", "Terrazzo013", 1, 0.8, 0.35),
  "terrazzo-white": photo("tile", "Tiles040", 1.5, 0.8, 0.35),
  "marble-tile": photo("tile", "Tiles074", 2.1, 0.7, 0.45),
  "marble-tile-veined": photo("tile", "Tiles078", 2, 0.7, 0.45),
  "hex-mosaic": photo("tile", "Tiles071", 0.45, 0.8, 0.4),
  // (ambientCG's "clay" set is a dark grey tile: the tar-dark roof's; clay stays the painted shingle, tinted)
  "roof-tile-dark": photo("masonry", "RoofingTiles013A", 2, 1),
  "roof-slate-photo": photo("masonry", "RoofingTiles003", 2, 1),
  "concrete-polished": photo("masonry", "Concrete048", 2, 0.75),
  "wallpaper-woodchip": { ...photo("wall", "Wallpaper001A", 1, 1), tint: true },
  "wallpaper-woodchip-fine": { ...photo("wall", "Wallpaper002A", 1, 1), tint: true },
  "wallpaper-worn": photo("wall", "Wallpaper001B", 1, 1),
  "pavers-hex": photo("ground", "PavingStones075", 2, 1),
} satisfies Record<string, MatDef>;

export type MatId = keyof typeof LIBRARY;
export const MAT_IDS = Object.keys(LIBRARY) as MatId[];
export const MAPS = ["albedo", "orm", "normal"] as const;
export type MapKind = (typeof MAPS)[number];

/** A map's file (under /life/mat/). */
export const matFile = (id: MatId, map: MapKind, half = false) => `${id}-${map}${half ? "-half" : ""}.ktx2`;
