import type { CatalogEntry } from "../catalog.ts";
import type { SeatSpec } from "../furniture.ts";
import { box, cyl, type KindShape, one } from "./units.ts";

// Plan 68 phase 10 (docs/plan/68-more-furniture.md): Play & music — the new kinds' catalog entries, shapes
// (from their models: the client's world/furn/fam/music.ts), seats, surfaces, stand heights and hang
// sizes, spread into the shared tables (catalog.ts, shapes/index.ts, furniture.ts, hang.ts).
export const CATALOG = {
  // (played later — the drums from their stool as the piano is, the guitar picked up, the synth's keys
  // standing, the karaoke's screen and mic, the gong struck, the theremin waved: the client's
  // fam/music.ts PLAY has where)
  drum_kit: { label: "Drum kit", w: 2, h: 2, solid: true, buildable: true, variants: 3, look: 0 },
  guitar_amp: { label: "Electric guitar and amp", w: 2, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  dj_booth: {
    label: "DJ booth",
    w: 2,
    h: 2,
    solid: true,
    buildable: true,
    interact: "radio",
    variants: 3,
    look: 0,
    light: { color: 0xb07aff, radius: 3.2, intensity: 0.35 },
  },
  synth_stand: { label: "Synth keyboard", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  karaoke: {
    label: "Karaoke machine",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    look: 0,
    light: { color: 0xff8ad8, radius: 2.2, intensity: 0.25 },
  },
  gong: { label: "Gong", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  theremin: { label: "Theremin", w: 1, h: 1, solid: true, buildable: true, variants: 3, look: 0 },
  metronome: { label: "Metronome", w: 1, h: 1, solid: false, onSurface: true, buildable: true, variants: 3, look: 0 },
} satisfies Record<string, CatalogEntry>;
export const SHAPES = {
  // (the drums and their stands, the stool behind them, the rug they stand on)
  drum_kit: one(box(0.06, 0.45, 1.96, 1.56, 0, 1.45), cyl(1, 0.36, 0.2, 0, 0.5), box(0.05, 0.07, 1.95, 1.83, 0, 0.01)),
  // (the guitar on its stand and the amp, the lead and the pedal between: one low block, the guitar up
  // from it)
  guitar_amp: one(box(0.33, 0.21, 1.7, 0.74, 0, 0.54), box(0.33, 0.25, 0.67, 0.74, 0.54, 1.09)),
  // (the riser, walked up onto; the booth on it)
  dj_booth: one(box(0.02, 0.02, 1.98, 1.99, 0, 0.15), box(0.15, 1.15, 1.85, 1.86, 0.15, 1.1)),
  synth_stand: one(box(0.01, 0.27, 0.99, 0.72, 0, 1.04)),
  karaoke: one(box(0.23, 0.3, 0.77, 0.72, 0, 0.9), box(0.23, 0.38, 0.77, 0.66, 0.9, 1.43)),
  gong: one(box(0.01, 0.27, 0.99, 0.73, 0, 1.68)),
  theremin: one(box(0.05, 0.21, 0.8, 0.67, 0, 1.48)),
  metronome: one(box(0.435, 0.45, 0.565, 0.56, 0, 0.25)),
} satisfies Record<keyof typeof CATALOG, KindShape>;
export const SEATS: Record<string, SeatSpec> = {};
export const SURFACES: Record<string, number> = {};
export const STANDS: Record<string, number> = {};
export const HANGS: Record<string, [number, number, number]> = {};
