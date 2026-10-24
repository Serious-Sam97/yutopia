// The headquarters' parking lot (docs/plan/42-the-lot.md): one layout for every
// world, in the building's coords (the studio x 0..W, z 0..H; map y → z).
//
// West to east: the plough's dump, a row nosed west, aisle W (the driveway lands
// on it), a back-to-back pair of rows, aisle E, a row nosed east, and the
// pavement along the building side. A cross aisle at each end, so the aisles
// loop. Kerbed islands cap the rows (and break the long ones in the middle);
// the lamps stand on them. Row E's middle island has the marked bays either
// side (accessible north, visitors south). Nothing moves with the studio: the
// doors (`entranceZ`) only pick which visitors' bay the visitor's car takes.
//
// A bay's `dir`: 1 noses west (−x; a car object's rot 0), −1 noses east (rot 2).

export interface LotRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export type BayKind = "plain" | "visitor" | "accessible";
export interface LotRow {
  key: "w" | "mid-w" | "mid-e" | "e";
  /** x of the row's aisle side (where a car drives in) */
  aisle: number;
  /** x of its back (the kerb, or the line between back-to-back rows) */
  back: number;
  /** 1: noses west; −1: noses east */
  dir: 1 | -1;
}
export interface LotBay {
  x: number;
  z: number;
  dir: 1 | -1;
  row: LotRow["key"];
  slot: number;
  kind: BayKind;
}
export interface LotIsland extends LotRect {
  row: LotRow["key"] | "mid";
}
export interface LotCar {
  x: number;
  z: number;
  dir: 1 | -1;
  wagon: boolean;
  colour: number;
  snowy: boolean;
  tilt: number;
}
export interface LotLayout extends LotRect {
  bayW: number;
  bayL: number;
  aisleW: number;
  rows: LotRow[];
  /** the aisles' middles (x): W, E */
  aisles: [number, number];
  /** the cross aisles: north (the mouth's), south */
  cross: [LotRect, LotRect];
  /** the slots along every row (z): from z0, `n` of them `bayW` apart */
  slots: { z0: number; n: number };
  bays: LotBay[];
  islands: LotIsland[];
  /** the accessible bays' hatched access strips */
  hatches: LotRect[];
  /** on the islands; `rot` a lamp post's (0: its arm reaches east, 2: west — over an aisle) */
  lamps: { x: number; z: number; rot: 0 | 2 }[];
  dump: LotRect;
  pavement: LotRect;
  /** where the driveway comes in: its middle (x) on the north edge, its width */
  mouth: { x: number; z: number; w: number };
  /** the stop line across the way out */
  stop: LotRect;
  /** the lot's sign by the mouth: where, which way its face looks (radians about y, 0 = +z) */
  sign: { x: number; z: number; ry: number };
  /** the seeded parked cars (car-i is cars[i]) */
  cars: LotCar[];
  /** the bay the visitor's car takes (the visitors' bay nearest the doors) */
  visitorBay: number;
  entranceZ: number;
}

export const LOT: LotRect = { x0: -56, z0: -8, x1: -10, z1: 60 };
export const LOT_BAY = { w: 2.8, l: 5.6 };
export const LOT_AISLE = 7.2;
/** The driveway's last point: the middle of aisle W, on the lot's north edge (flush: no strip of land between). */
export const LOT_MOUTH = { x: -40.6, z: -8, w: 9 };

export const CAR_COLOURS = [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a];

/** The lot's own seeded random (the same as building.ts `seeded`). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// (to a millionth: no 25.999… flooring to the tile before)
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
// the strips across it, west to east
const DUMP = 6.2;
const X_KERB_W = r6(LOT.x0 + DUMP); // −49.8
const X_ROW_W = r6(X_KERB_W + LOT_BAY.l); // −44.2: row W's aisle side
const X_MID_W = r6(X_ROW_W + LOT_AISLE); // −37.0: the pair's west aisle side
const X_MID = r6(X_MID_W + LOT_BAY.l); // −31.4: back to back
const X_MID_E = r6(X_MID + LOT_BAY.l); // −25.8
const X_ROW_E = r6(X_MID_E + LOT_AISLE); // −18.6: row E's aisle side
const X_KERB_E = r6(X_ROW_E + LOT_BAY.l); // −13.0: the pavement's kerb
// the rows along it (z): between the cross aisles, the slots centred
const Z_ROWS0 = LOT.z0 + LOT_AISLE; // −0.8
const Z_ROWS1 = LOT.z1 - LOT_AISLE; // 52.8
const N_SLOTS = Math.floor((Z_ROWS1 - Z_ROWS0) / LOT_BAY.w); // 19
const Z_SLOT0 = r6(Z_ROWS0 + (Z_ROWS1 - Z_ROWS0 - N_SLOTS * LOT_BAY.w) / 2);
const MID_SLOT = Math.floor(N_SLOTS / 2); // 9
// which slots are islands, by row
const ISLANDS: Record<LotRow["key"], number[]> = {
  w: [0, N_SLOTS - 1],
  "mid-w": [0, MID_SLOT, N_SLOTS - 1],
  "mid-e": [0, MID_SLOT, N_SLOTS - 1],
  e: [0, MID_SLOT, N_SLOTS - 1],
};
const ROWS: LotRow[] = [
  { key: "w", aisle: X_ROW_W, back: X_KERB_W, dir: 1 },
  { key: "mid-w", aisle: X_MID_W, back: X_MID, dir: -1 },
  { key: "mid-e", aisle: X_MID_E, back: X_MID, dir: 1 },
  { key: "e", aisle: X_ROW_E, back: X_KERB_E, dir: -1 },
];
const slotZ = (s: number) => r6(Z_SLOT0 + (s + 0.5) * LOT_BAY.w);
const MOUTH = { x: LOT_MOUTH.x, z: LOT.z0, w: LOT_MOUTH.w };
// (across the way out: the lane on the right of a car leaving, northbound)
const STOP: LotRect = { x0: MOUTH.x + 0.3, x1: MOUTH.x + MOUTH.w / 2 - 0.4, z0: LOT.z0 + 0.6, z1: LOT.z0 + 1.0 };

/** The lot's bays (and their kind), its islands, the accessible bays' hatched strip. */
function lotBays() {
  const bays: LotBay[] = [];
  const islands: LotIsland[] = [];
  const hatches: LotRect[] = [];
  // row E's marked slots, either side of its middle island (by the doors in every studio: they're
  // at z 16..26): north the accessible pair (two bays, the hatched strip between them), south the
  // three visitors' bays
  const accessible = [MID_SLOT - 3, MID_SLOT - 2, MID_SLOT - 1];
  const visitors = [MID_SLOT + 1, MID_SLOT + 2, MID_SLOT + 3];
  for (const row of ROWS) {
    const x0 = Math.min(row.aisle, row.back);
    const x1 = Math.max(row.aisle, row.back);
    for (let s = 0; s < N_SLOTS; s++) {
      const z = slotZ(s);
      if (ISLANDS[row.key].includes(s)) {
        // (the pair's islands are one, across both rows)
        if (row.key !== "mid-e")
          islands.push({
            row: row.key === "mid-w" ? "mid" : row.key,
            x0: row.key === "mid-w" ? X_MID_W : x0,
            x1: row.key === "mid-w" ? X_MID_E : x1,
            z0: z - LOT_BAY.w / 2,
            z1: z + LOT_BAY.w / 2,
          });
        continue;
      }
      let kind: BayKind = "plain";
      if (row.key === "e" && visitors.includes(s)) kind = "visitor";
      if (row.key === "e" && accessible.includes(s)) {
        if (s === accessible[1]) {
          hatches.push({ x0, x1, z0: z - LOT_BAY.w / 2, z1: z + LOT_BAY.w / 2 });
          continue;
        }
        kind = "accessible";
      }
      bays.push({ x: r6(row.aisle - (row.dir * LOT_BAY.l) / 2), z, dir: row.dir, row: row.key, slot: s, kind });
    }
  }
  return { bays, islands, hatches };
}

/** The lot (the same everywhere); `entranceZ`: the doors, for the visitor's car's bay. */
export function lotLayout(entranceZ = 18): LotLayout {
  const paint = lotBays();
  const bays = paint.bays;
  const islands = paint.islands;
  // the lamps: on the pair's three islands (on the line between them), row W's two, row E's three
  // (row W's reach east over aisle W, row E's west over aisle E, the pair's turn by turn)
  const lamps: LotLayout["lamps"] = [];
  let turn: 0 | 2 = 2;
  for (const i of islands) {
    const z = r6((i.z0 + i.z1) / 2);
    if (i.row === "mid") {
      turn = turn === 0 ? 2 : 0;
      lamps.push({ x: X_MID, z, rot: turn });
    } else if (i.row === "w") lamps.push({ x: X_KERB_W + 0.9, z, rot: 0 });
    else lamps.push({ x: X_KERB_E - 0.9, z, rot: 2 });
  }
  // the visitor's car: the visitors' bay nearest the doors
  let visitorBay = -1;
  for (let i = 0; i < bays.length; i++)
    if (
      bays[i].kind === "visitor" &&
      (visitorBay < 0 || Math.abs(bays[i].z - entranceZ) < Math.abs(bays[visitorBay].z - entranceZ))
    )
      visitorBay = i;
  // the parked cars: a seeded pick of the plain bays (the same whatever the doors: the marks
  // only ever take row E's middle six)
  const plain = bays
    .map((b, i) => [b, i] as const)
    .filter(([b]) => b.kind === "plain" && !(b.row === "e" && Math.abs(b.slot - MID_SLOT) <= 3));
  const rc = rng(123);
  const taken = new Set<number>();
  const cars: LotCar[] = [];
  for (let tries = 0; cars.length < 16 && tries < 400; tries++) {
    // (nearer the building more often: the doors' end of the list is row E's)
    const k = plain.length - 1 - Math.floor(rc() ** 1.7 * plain.length);
    if (taken.has(k)) continue;
    taken.add(k);
    const [b] = plain[k];
    const wagon = rc() < 0.3;
    const colour = Math.floor(rc() * CAR_COLOURS.length);
    const snowy = rc() > 0.2;
    const tilt = (rc() - 0.5) * 0.04;
    const z = b.z + (rc() - 0.5) * 0.3;
    cars.push({ x: b.x, z, dir: b.dir, wagon, colour, snowy, tilt });
  }
  const mouth = MOUTH;
  return {
    ...LOT,
    bayW: LOT_BAY.w,
    bayL: LOT_BAY.l,
    aisleW: LOT_AISLE,
    rows: ROWS,
    aisles: [r6(X_ROW_W + LOT_AISLE / 2), r6(X_MID_E + LOT_AISLE / 2)],
    cross: [
      { x0: X_KERB_W, z0: LOT.z0, x1: X_KERB_E, z1: Z_ROWS0 },
      { x0: X_KERB_W, z0: Z_ROWS1, x1: X_KERB_E, z1: LOT.z1 },
    ],
    slots: { z0: Z_SLOT0, n: N_SLOTS },
    bays,
    islands,
    hatches: paint.hatches,
    lamps,
    dump: { x0: LOT.x0, z0: LOT.z0, x1: X_KERB_W, z1: LOT.z1 },
    pavement: { x0: X_KERB_E, z0: LOT.z0, x1: LOT.x1, z1: LOT.z1 },
    mouth,
    stop: STOP,
    // (clear of the bellmouth: 17 wide where it meets the lot)
    sign: { x: mouth.x - 11, z: LOT.z0 - 3, ry: Math.PI },
    cars,
    visitorBay,
    entranceZ,
  };
}

/** The paint on the lot (`l`: its layout), as thin rectangles [x, z, w, h]: each bay's sides,
 *  the rows' backs between back-to-back bays, and the stop line. The hatches and the
 *  stencils are `l.hatches` and the bays' `kind`. */
export function lotStripes(l: LotLayout): [number, number, number, number][] {
  const t = 0.09;
  const out: [number, number, number, number][] = [];
  for (const row of l.rows) {
    const x0 = Math.min(row.aisle, row.back);
    const mine = l.bays.filter((b) => b.row === row.key);
    const edges = new Set<number>();
    for (const b of mine) {
      edges.add(Math.round((b.z - l.bayW / 2) * 100));
      edges.add(Math.round((b.z + l.bayW / 2) * 100));
    }
    for (const h of l.hatches) if (row.key === "e") for (const z of [h.z0, h.z1]) edges.add(Math.round(z * 100));
    for (const e of edges) out.push([x0, e / 100 - t / 2, l.bayL, t]);
  }
  // between the pair: their backs, where there are bays
  const mid = l.rows.find((r) => r.key === "mid-w") as LotRow;
  const zs = l.bays.filter((b) => b.row === "mid-w" || b.row === "mid-e").map((b) => b.z);
  if (zs.length) {
    const z0 = Math.min(...zs) - l.bayW / 2;
    const z1 = Math.max(...zs) + l.bayW / 2;
    out.push([mid.back - t / 2, z0, t, z1 - z0]);
  }
  const s = l.stop;
  out.push([s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0]);
  return out;
}

/** The plough's banks round the lot (`l`: its layout): the windrow along its north edge (open
 *  at the mouth) and its south edge, and the dump's heaps on its west strip (open where the
 *  pond trail goes out, z ≈ 22). Where each mound is, its size, its turn. The 3D view heaps
 *  them; a car (car/world.ts) ploughs into them. */
export function lotBanksOf(l: LotLayout): { x: number; z: number; s: number; sz: number; ry: number }[] {
  const r = rng(31);
  const out: { x: number; z: number; s: number; sz: number; ry: number }[] = [];
  const bank = (x: number, z: number, big = 0) => {
    const s = 1.1 + big + r() * (1.5 + big);
    const sz = s * (0.7 + r() * 0.6);
    out.push({ x, z, s, sz, ry: r() * Math.PI });
  };
  // the edges' windrows (a tile and a bit outside the asphalt; the dump's strip has its own)
  const open = l.mouth.w / 2 + 4.5; // (the bellmouth's corners)
  for (let x = l.dump.x1; x <= l.pavement.x0; x += 2.2) {
    if (Math.abs(x - l.mouth.x) > open) bank(x + (r() - 0.5) * 0.4, l.z0 - 1.2 + (r() - 0.5));
    bank(x + (r() - 0.5) * 0.4, l.z1 + 1.2 + (r() - 0.5));
  }
  // the dump: two staggered rows of big heaps pushed up against the west edge
  for (let z = l.z0 + 1.5; z <= l.z1 - 1.5; z += 2.6) {
    if (Math.abs(z - 22) < 3) continue;
    bank(l.x0 + 1.8 + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.8, 0.9);
    if (r() < 0.8) bank(l.x0 + 4.2 + (r() - 0.5) * 0.6, z + 1.3 + (r() - 0.5) * 0.8, 0.4);
  }
  return out;
}
