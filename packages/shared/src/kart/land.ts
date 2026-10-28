// The Kart Park's place on the land (docs/plan/46-the-karts.md): where it is, the road in, the
// ground opened for it. Only what the Grounds read (grounds.ts `KART_LAND`), kept apart from the
// circuit (park.ts): the Grounds' module is copied into several lazy chunks, and this rides along.
// Building coords (metres; x east, z south).
//
// Where (the user's pick, 2026-10-26): in the woods north of the county road, between the
// gatehouse and the river. The land there used to end in the ridges at z −580; it opens up north
// to fit the park, a clearing cut out of the woods round it.

export type P = [number, number];

/** The park's middle (the circuit's crossing) and the height its pad is levelled to. */
export const KART_PARK = { x: 54, z: -760, h: 2 };
/** The park's fence. */
export const KART_FENCE = { x0: KART_PARK.x - 154, z0: KART_PARK.z - 74, x1: KART_PARK.x + 182, z1: KART_PARK.z + 84 };
/** Its posts' height (m; docs/plan/50-the-volume.md): a rail fence you fly over. */
export const KART_FENCE_H = 1;
/** The gate, on the fence's south side by the paddock, where the road in arrives (its arch spans x). */
export const KART_GATE = { x: KART_PARK.x + 165, z: KART_FENCE.z1, w: 12 };

/** The road in: off the county road (north side, by the river), up through the woods to the gate
 *  (a park set back from the road: the user's call, 2026-10-26). */
export const KART_ROAD: P[] = [
  [KART_GATE.x, -404],
  [KART_GATE.x, -424],
  [KART_GATE.x - 8, -460],
  [KART_GATE.x - 4, -496],
  [KART_GATE.x - 10, -540],
  [KART_GATE.x - 4, -576],
  [KART_GATE.x - 10, -612],
  // (straight the last stretch, into the turning circle before the gate: KART_TURN)
  [KART_GATE.x, -640],
  [KART_GATE.x, KART_FENCE.z1 + 20],
];
/** The turning circle at the road's end, short of the gate (the cars stay out of the park: they
 *  go round its island, a kart on a plinth, and back, or into the car park). */
export const KART_TURN = { x: KART_GATE.x, z: KART_FENCE.z1 + 12, r: 10, island: 3.4 };
/** The car park west of the turning circle: one aisle in off it (along x, `aisle` its z span),
 *  a row of bays either side nosed in, `bays` each 2.7 wide from `bx`; a kerbed island at the
 *  rows' ends; a footway along its north side to the gate. */
export const KART_CARPARK = {
  x0: KART_GATE.x - 52,
  z0: KART_FENCE.z1 + 5,
  x1: KART_GATE.x - 8,
  z1: KART_FENCE.z1 + 23,
  aisle: [KART_FENCE.z1 + 10.2, KART_FENCE.z1 + 17.8] as P,
  bx: KART_GATE.x - 49,
  bays: 14,
  /** the footway's z span (x from the car park's west end to the turning circle) */
  walk: [KART_FENCE.z1 + 1.6, KART_FENCE.z1 + 4.4] as P,
};

/** The billboard at the road in's corner on the county road (its north-east corner, by the
 *  river): a V, its point to the road, each wing's face turned to the traffic coming one way
 *  (east: from the town over the bridge; west: from the campus). `fx`/`fz` the fingerpost on the
 *  corner itself. */
export const KART_SIGN = { x: KART_GATE.x + 16, z: -415, wing: 7.5, open: 0.36, fx: KART_GATE.x + 8, fz: -411.4 };
/** The verge cleared of trees round it, so it's seen down the road both ways (to the river). */
export const KART_VERGE = { x0: KART_SIGN.x - 42, z0: KART_SIGN.z - 15, x1: KART_SIGN.x + 17, z1: KART_SIGN.z + 11 };

/** The ground opened north of where the land ended (z −580), for the park and a margin of woods. */
export const KART_GROUND = { x0: KART_FENCE.x0 - 40, z0: KART_FENCE.z0 - 56, x1: KART_FENCE.x1 + 6, z1: -560 };
/** How far out of the fence the clearing round the park reaches. */
export const KART_CLEARING = 8;

/** The billboard's wings: from its point back from the road, `wing` long, turned `open` either
 *  side of north, east's first; `nx`/`nz` its face's normal (out, to its traffic). */
export function kartSignWings() {
  const S = KART_SIGN;
  return [1, -1].map((k) => {
    const dx = Math.sin(S.open) * k;
    const dz = -Math.cos(S.open);
    return { k, x0: S.x, z0: S.z, x1: S.x + dx * S.wing, z1: S.z + dz * S.wing, nx: -dz * k, nz: dx * k };
  });
}
/** Its posts (two a wing), and the fingerpost's. */
export function kartSignPosts(): P[] {
  const out: P[] = kartSignWings().flatMap((w) =>
    [0.2, 0.8].map((t): P => [w.x0 + (w.x1 - w.x0) * t, w.z0 + (w.z1 - w.z0) * t]),
  );
  out.push([KART_SIGN.fx, KART_SIGN.fz]);
  return out;
}
