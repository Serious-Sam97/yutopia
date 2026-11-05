import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, type KindShape, one } from "./units.ts";

// Plan 68 phase 8 (docs/plan/68-more-furniture.md): Screens & TVs — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/screens2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts). Each shows
// a picture of its own while on (switched as a lamp is: `props.on`, the room's switch too) and lights
// the room a little; the media's YouTube and Jellyfin on them is GLASS below, for media.ts to take up.
export const CATALOG = {
  // (a wall piece: nine panels across 4.8 m, from 0.3 m up to 3.1)
  video_wall: {
    label: "Video wall",
    w: 6,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    interact: "media",
    variants: 3,
    light: { color: 0xa8c0ff, radius: 4.5, intensity: 0.32 },
  },
  ceiling_projector: {
    label: "Ceiling projector",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    interact: "lamp",
    variants: 2,
    look: 0,
  },
  security_monitors: {
    label: "Security monitor bank",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    interact: "lamp",
    variants: 2,
    look: 0,
    light: { color: 0xa8d8b8, radius: 2.5, intensity: 0.28 },
  },
  outdoor_cinema: {
    label: "Outdoor cinema screen",
    w: 6,
    h: 1,
    solid: true,
    buildable: true,
    outdoor: true,
    interact: "media",
    variants: 2,
    look: 0,
    light: { color: 0xe8eeff, radius: 7, intensity: 0.4, h: 2.5 },
  },
  radio_tv_cabinet: {
    label: "Radio-TV cabinet",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    interact: "media",
    variants: 3,
    surface: 0.86,
    top: [0, 1, 8, 3], // (its top, over the cabinet 0.26–0.8 m in)
    light: { color: 0xbfd0ff, radius: 2.2, intensity: 0.22 },
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  // (on its wall: the frame's back on the wall's face to the panels' fronts)
  video_wall: one(box(0.55, 0.1, 5.45, 0.2, 0.3, 3.08)),
  ceiling_projector: { parts: [box(0.315, 0.36, 0.685, 0.713, 2.6, 3.27)], odd: "hung from the ceiling, over heads" },
  security_monitors: one(box(0.035, 0.208, 1.965, 0.8, 0, 1.6)),
  outdoor_cinema: {
    parts: [
      box(0.32, 0.4, 5.68, 0.5, 0.92, 4.0),
      box(0.04, 0.33, 0.28, 0.57, 0, 4.3),
      box(5.72, 0.33, 5.96, 0.57, 0, 4.3),
      box(0.04, 0.33, 5.96, 0.57, 4.04, 4.3),
      box(0.01, 0.66, 0.33, 0.99, 0, 0.45),
      box(5.67, 0.66, 5.99, 0.99, 0, 0.45),
      // (the braces down from the towers to the weights, where they're lower than a head)
      box(0.04, 0.57, 0.28, 0.82, 0, 1.7),
      box(5.72, 0.57, 5.96, 0.82, 0, 1.7),
    ],
    odd: "the screen and its two towers, the span over them, the weights its braces go back to, the braces' low ends",
  },
  radio_tv_cabinet: one(box(0.04, 0.26, 1.96, 0.815, 0, 0.86)),
} satisfies Record<string, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = { radio_tv_cabinet: 0.86 };
export const STANDS: Record<string, number> = { security_monitors: 1.6 };
export const HANGS: Record<string, [number, number, number]> = {
  // (5 m of the wall's 6: the frame round the nine panels)
  video_wall: [20, 0.3011, 3.0801],
};

/** Where the media's picture would be drawn on each (as shared media.ts GLASS: x0/x1 across the
 *  footprint in tiles, `y` the picture's plane in the kind's frame — out from the wall for a wall
 *  piece, z for a floor one — z0/z1 its foot and head in m): each model's own picture sits a hair
 *  behind it. Spread into media.ts GLASS: YouTube and Jellyfin on them (`interact: "media"`) — the video
 *  wall's across all nine panels. (The
 *  client's fam/screens2.ts VW, OC and RTV are the same planes, drawn to.) */
export const GLASS = {
  video_wall: { x0: 0.6, x1: 5.4, y: 0.19, z0: 0.34, z1: 3.04, aspect: 16 / 9, look: "hd", wall: true },
  outdoor_cinema: { x0: 0.4, x1: 5.6, y: 0.49, z0: 1.0, z1: 3.925, aspect: 16 / 9, look: "screen" },
  radio_tv_cabinet: { x0: 0.76, x1: 1.2, y: 0.805, z0: 0.39, z1: 0.72, aspect: 4 / 3, look: "crt" },
} as const;
