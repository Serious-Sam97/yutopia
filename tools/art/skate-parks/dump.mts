// Plan 104 (docs/plan/104-the-skate-again.md F6a): the board's own numbers for the art — every piece kind's
// profiles (shared skate/pieces.ts PIECES: lines and arcs, their sweeps, copings, grind lines, feet), both parks'
// layouts (skate/parks.ts TOWN_PARKS), the hall's plot and door, the shop's counter, the racks, the build menu's
// fits — written to tools/art/skate-parks/pieces.json, which the Blender kit reads: art and physics one source.
//
//   pnpm --dir packages/shared exec tsx ../../tools/art/skate-parks/dump.mts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILDINGS, insideOf } from "../../../packages/shared/src/grounds.ts";
import { GAPS } from "../../../packages/shared/src/skate/gaps.ts";
import {
  SKATE_FITS,
  SKATE_HALL,
  SKATE_SHOP,
  SKATE_YARD,
  TOWN_PARKS,
} from "../../../packages/shared/src/skate/parks.ts";
import { PIECES } from "../../../packages/shared/src/skate/pieces.ts";
import { RACK_BOARDS, RACK_SLOTS, SKATE_RACKS } from "../../../packages/shared/src/skate/racks.ts";

const pieces = Object.fromEntries(
  Object.entries(PIECES).map(([kind, d]) => [
    kind,
    {
      size: d.size,
      height: d.height,
      foot: d.foot,
      surfaces: d.surfaces.map((s) => ({
        segs: s.prof.segs,
        lens: s.prof.lens,
        total: s.prof.total,
        copings: s.prof.copings,
        edges: s.prof.edges,
        uMin: s.prof.uMin,
        uMax: s.prof.uMax,
        sweep: s.sweep,
        w0: s.w0,
        w1: s.w1,
        rIn: s.rIn ?? 0,
        inward: !!s.inward,
        du: s.du ?? 0,
        dw: s.dw ?? 0,
        turn: s.turn ?? 0,
      })),
      lines: d.lines,
    },
  ]),
);
const hall = BUILDINGS.find((b) => b.key === SKATE_HALL.key);
const out = {
  version: 1,
  note: "made by dump.mts from packages/shared/src/skate — never edit by hand",
  frame: "the floor's: x east, y south (the Grounds' z), z up, metres; a piece's yaw the plan way of its +u",
  pieces,
  parks: TOWN_PARKS,
  hall: { ...SKATE_HALL, door: hall ? insideOf(hall)?.door : null },
  yard: SKATE_YARD,
  shop: SKATE_SHOP,
  racks: SKATE_RACKS,
  rackBoards: RACK_BOARDS,
  rackSlots: RACK_SLOTS,
  fits: SKATE_FITS,
  gaps: GAPS,
};
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "pieces.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log(
  "wrote pieces.json:",
  Object.keys(pieces).length,
  "kinds,",
  TOWN_PARKS.map((p) => `${p.key} ${p.pieces.length}`).join(", "),
);
