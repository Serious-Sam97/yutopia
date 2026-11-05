import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 4 (docs/plan/68-more-furniture.md): Desks & tables — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/tables2.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).

/** What things stand on, m (a desk's 0.74; a workbench's and a drafting table's taboret higher). */
export const SURFACES: Record<string, number> = {
  corner_desk: 0.74,
  drafting_table: 0.92,
  workbench: 0.9,
  round_table: 0.74,
  dining_table: 0.75,
  nesting_tables: 0.55,
  bedside_table: 0.6,
  folding_table: 0.74,
};
const S = SURFACES;

export const CATALOG = {
  // (sat at from −z, a tile each, and from −x along its return; things stand on the −z run)
  corner_desk: {
    label: "Corner desk",
    w: 2,
    h: 2,
    solid: true,
    buildable: true,
    variants: 4,
    look: 0,
    surface: S.corner_desk,
    top: [0, 0, 8, 3],
  },
  // (things stand on its taboret; its lamp switched as a lamp)
  drafting_table: {
    label: "Drafting table",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    interact: "lamp",
    light: { color: 0xffe2b0, radius: 2.2, intensity: 0.3 },
    surface: S.drafting_table,
    top: [6, 0, 8, 4],
  },
  workbench: {
    label: "Workbench",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.workbench,
    top: [0, 0, 8, 3],
  },
  round_table: {
    label: "Round conference table",
    w: 3,
    h: 3,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.round_table,
    top: [2, 2, 10, 10],
  },
  dining_table: {
    label: "Dining table",
    w: 3,
    h: 2,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.dining_table,
  },
  // (the big one's top: the small one under it is lower)
  nesting_tables: {
    label: "Nesting tables",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.nesting_tables,
    top: [0, 0, 4, 3],
  },
  bedside_table: {
    label: "Bedside table",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.bedside_table,
    top: [1, 1, 3, 3],
  },
  folding_table: {
    label: "Folding table",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: S.folding_table,
  },
} satisfies Record<string, CatalogEntry>;

export const SHAPES = {
  corner_desk: one(
    box(0.03, 0.06, 1.97, 0.86, 0, 0.74),
    box(0.03, 0.86, 0.83, 1.97, 0, 0.74),
    box(0.04, 0.8, 1.96, 0.86, 0.74, 1.16),
    box(0.78, 0.86, 0.84, 1.96, 0.74, 1.16),
    cyl(1.42, 1.42, 0.2, 0, 0.36),
  ),
  drafting_table: one(
    box(1.5, 0.06, 1.97, 0.94, 0, 0.92),
    box(0.07, 0.06, 1.37, 0.95, 0, 1.08),
    box(0.1, 0.35, 0.6, 0.95, 1.08, 1.68),
  ),
  workbench: one(box(0.03, 0.02, 1.97, 0.86, 0, 0.9), box(0, 0.86, 2, 0.95, 0.9, 1.94)),
  round_table: one(cyl(1.5, 1.5, 1.4, 0, 0.74)),
  dining_table: one(box(0.05, 0.05, 2.95, 1.95, 0, 0.75)),
  nesting_tables: one(box(0.04, 0.04, 0.96, 0.8, 0, 0.55), box(0.13, 0.8, 0.87, 0.96, 0, 0.45)),
  bedside_table: one(box(0.21, 0.26, 0.79, 0.74, 0, 0.6)),
  folding_table: one(box(0.085, 0.1, 1.915, 0.9, 0, 0.74)),
} satisfies Record<string, KindShape>;

export const SEATS: Record<string, SeatSpec> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
