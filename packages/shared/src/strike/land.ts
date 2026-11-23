// The Strike Park's place on the land (docs/plan/114-the-strike-park.md, S-M8): where it is, the road in,
// the ground opened for it. Only what the Grounds read (grounds.ts), kept apart from the maps (maps/*.ts)
// as kart/land.ts is from the circuit: the Grounds' module is copied into several lazy chunks.
// Building coords (metres; x east, z south).
//
// Where (F2, 2026-11-21: a new clearing off a road): in the woods west of the Kart Park, north of the
// county road's bend by the gatehouse. A road winds ~250 m in from the bend to the gate on the
// compound's south side. Inside: a lobby yard behind the gate, then the arena — one level pad where
// the map stands — behind the inner wall. The gallery runs along the top of the walls.

type P = [number, number];

/** The arena's middle (the maps' origin: their local (0, 0)) and the height the pad is levelled to. */
export const STRIKE_PARK = { x: -270, z: -735, h: 2 };
/** The arena's half size: a map lies within ±ARENA of the middle (its own outer walls inside that). */
export const STRIKE_ARENA = 100;
/** The compound's outer wall: the arena and the lobby yard south of it. */
export const STRIKE_WALL = {
  x0: STRIKE_PARK.x - STRIKE_ARENA - 4,
  z0: STRIKE_PARK.z - STRIKE_ARENA - 4,
  x1: STRIKE_PARK.x + STRIKE_ARENA + 4,
  z1: STRIKE_PARK.z + STRIKE_ARENA + 34,
};
/** The walls' height and thickness (concrete; the gallery walks their top). */
export const STRIKE_WALL_H = 9;
export const STRIKE_WALL_T = 2.4;
/** The inner wall between the lobby yard and the arena (z), with the two team doors in it (x, w). */
export const STRIKE_INNER = {
  z: STRIKE_PARK.z + STRIKE_ARENA + 4,
  doors: [-30, 30].map((dx) => STRIKE_PARK.x + dx),
  w: 4,
};
/** The gate on the outer wall's south side, where the road in arrives. */
export const STRIKE_GATE = { x: STRIKE_PARK.x + 60, z: STRIKE_WALL.z1, w: 10 };
/** The lobby yard (between the inner wall and the gate). */
export const STRIKE_YARD = { x0: STRIKE_WALL.x0, z0: STRIKE_INNER.z, x1: STRIKE_WALL.x1, z1: STRIKE_WALL.z1 };
/** (the user's, 2026-11-23: "a roof on the lobby, the rain gets in everywhere") The yard's roof: wall face to wall face
 *  over the whole yard, a shallow gable — its eaves 3.2 m over the gallery (the walls' tops), its ridge along the
 *  yard's middle; heights over the yard's floor. Out of the weather under it (the rain's and the snow's roofs). */
export const STRIKE_YARD_ROOF = {
  x0: STRIKE_WALL.x0 + STRIKE_WALL_T / 2,
  x1: STRIKE_WALL.x1 - STRIKE_WALL_T / 2,
  z0: STRIKE_INNER.z + STRIKE_WALL_T / 2,
  z1: STRIKE_WALL.z1 - STRIKE_WALL_T / 2,
  eaves: STRIKE_WALL_H + 3.2,
  ridge: STRIKE_WALL_H + 4.6,
};
/** The lobby: the desk (teams, mode), the Map Board, the big screen over the gate, the stairs to the gallery. */
export const STRIKE_DESK = { x: STRIKE_PARK.x + 20, z: STRIKE_INNER.z + 16, ry: 0 };
export const STRIKE_BOARD = { x: STRIKE_PARK.x - 10, z: STRIKE_INNER.z + 14, w: 6, h: 3.6 };
export const STRIKE_SCREEN = { x: STRIKE_GATE.x, z: STRIKE_WALL.z1, w: 12, h: 6.5, y: STRIKE_WALL_H + 0.4 };
/** The stairs up to the gallery: a straight flight along the inner wall's yard face, west end. */
export const STRIKE_STAIRS = {
  x0: STRIKE_WALL.x0 + 6,
  x1: STRIKE_WALL.x0 + 6 + 20,
  z: STRIKE_INNER.z + 1.2 + 1.6,
  w: 3,
};

/** The road in: off the county road's bend by the gatehouse, west and north through the woods. */
export const STRIKE_ROAD: P[] = [
  [-44, -398],
  [-66, -424],
  [-104, -452],
  [-142, -480],
  [-170, -510],
  [STRIKE_GATE.x - 4, -540],
  [STRIKE_GATE.x, -556],
  [STRIKE_GATE.x, STRIKE_WALL.z1 + 18],
];
/** The turning circle before the gate, and the lay-by of bays west of it. */
export const STRIKE_TURN = { x: STRIKE_GATE.x, z: STRIKE_WALL.z1 + 12, r: 10, island: 3.2 };
export const STRIKE_CARPARK = {
  x0: STRIKE_GATE.x - 46,
  z0: STRIKE_WALL.z1 + 4,
  x1: STRIKE_GATE.x - 8,
  z1: STRIKE_WALL.z1 + 20,
};

/** The ground opened for the park and a margin of woods round it (a region of the land). */
export const STRIKE_GROUND = { x0: STRIKE_WALL.x0 - 40, z0: STRIKE_WALL.z0 - 40, x1: -150, z1: -560 };
/** How far out of the wall the clearing round the park reaches. */
export const STRIKE_CLEARING = 10;

/** Whether (x, z) is inside the arena (its pad, the map's ground). */
export function inStrikeArena(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - STRIKE_PARK.x) <= STRIKE_ARENA - margin && Math.abs(z - STRIKE_PARK.z) <= STRIKE_ARENA - margin;
}
/** Whether (x, z) is inside the compound's walls (the arena or the lobby yard). */
export function inStrikeCompound(x: number, z: number): boolean {
  const W = STRIKE_WALL;
  return x > W.x0 && x < W.x1 && z > W.z0 && z < W.z1;
}
/** The distance from (x, z) to the compound's footprint (0 inside). */
export function strikeDist(x: number, z: number): number {
  const W = STRIKE_WALL;
  const dx = Math.max(W.x0 - x, 0, x - W.x1);
  const dz = Math.max(W.z0 - z, 0, z - W.z1);
  return Math.hypot(dx, dz);
}

/** The compound's walls as runs along their middles (the gate and the team doors left open):
 *  [ax, az, bx, bz, height]. The outer ring STRIKE_WALL_H; the inner wall the same. */
export function strikeWalls(): [number, number, number, number, number][] {
  const W = STRIKE_WALL;
  const H = STRIKE_WALL_H;
  const g0 = STRIKE_GATE.x - STRIKE_GATE.w / 2;
  const g1 = STRIKE_GATE.x + STRIKE_GATE.w / 2;
  const out: [number, number, number, number, number][] = [
    [W.x0, W.z0, W.x1, W.z0, H],
    [W.x0, W.z0, W.x0, W.z1, H],
    [W.x1, W.z0, W.x1, W.z1, H],
    [W.x0, W.z1, g0, W.z1, H],
    [g1, W.z1, W.x1, W.z1, H],
  ];
  // the inner wall, open at its two doors
  const I = STRIKE_INNER;
  const cuts = [...I.doors].sort((a, b) => a - b);
  let x = W.x0;
  for (const d of cuts) {
    out.push([x, I.z, d - I.w / 2, I.z, H]);
    x = d + I.w / 2;
  }
  out.push([x, I.z, W.x1, I.z, H]);
  return out;
}
/** Whether a walker at (x, z) is in one of the compound's walls (as walkable() asks). */
export function strikeWalkBlocked(x: number, z: number): boolean {
  if (strikeDist(x, z) > 2) return false;
  const T = STRIKE_WALL_T / 2 + 0.3;
  for (const [ax, az, bx, bz] of strikeWalls()) {
    if (az === bz) {
      if (Math.abs(z - az) < T && x > Math.min(ax, bx) - T && x < Math.max(ax, bx) + T) return true;
    } else if (Math.abs(x - ax) < T && z > Math.min(az, bz) - T && z < Math.max(az, bz) + T) return true;
  }
  return false;
}

/** The billboard where the Strike Park road leaves the county road (plan 115 phase 39, F7: two-faced and lit, as the
 *  Kart Park's): west of the county road's run up from the gatehouse, its point to the road, each wing's face to the
 *  traffic one way (north: from the town; south: from the campus). `wing` m long, `open` rad off due west. */
export const STRIKE_SIGN = { x: -55, z: -381, wing: 7.5, open: 0.42, h0: 2.8, h1: 6.6 };
/** The verge cleared of trees round it, so it's seen down the road both ways. */
export const STRIKE_VERGE = { x0: STRIKE_SIGN.x - 18, z0: STRIKE_SIGN.z - 16, x1: -42, z1: STRIKE_SIGN.z + 16 };
/** Its wings: from the point back from the road; `nx`/`nz` the face's normal (out to its traffic: toward the road). */
export function strikeSignWings() {
  const S = STRIKE_SIGN;
  return [1, -1].map((k) => {
    const dx = -Math.cos(S.open);
    const dz = Math.sin(S.open) * k;
    // (of the wing's two sides, the one facing east — to the county road and the traffic along it)
    let nx = -dz;
    let nz = dx;
    if (nx < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { k, x0: S.x, z0: S.z, x1: S.x + dx * S.wing, z1: S.z + dz * S.wing, nx, nz };
  });
}
/** Its posts (two a wing). */
export function strikeSignPosts(): [number, number][] {
  return strikeSignWings().flatMap((w) =>
    [0.2, 0.8].map((t): [number, number] => [w.x0 + (w.x1 - w.x0) * t, w.z0 + (w.z1 - w.z0) * t]),
  );
}

/** The lobby's practice range (plan 115 phase 47): targets on the outer wall's yard face between the bar and the
 *  trophy hall, shot at from the line in front of the canteen (12–16 m). Each a disc facing north, `r` its radius,
 *  its middle at `y` over the yard. */
export const STRIKE_TARGETS: { x: number; z: number; y: number; r: number }[] = [-350, -344.5, -339, -333.5, -328].map(
  (x, i) => ({
    x,
    z: STRIKE_WALL.z1 - STRIKE_WALL_T / 2 - 0.4,
    y: 1.3 + (i % 2) * 0.5,
    r: 0.45,
  }),
);
/** The range's firing line (z): stand behind it. */
export const STRIKE_FIRING_LINE = STRIKE_YARD.z0 + 1.3 + 14 + 1.0;
/** A shot's ray (from o along d, unit; building coords, y up) against the targets: the one it hits first and its
 *  ring (10 the middle, 1 the edge), or null. */
export function rangeHit(
  o: [number, number, number],
  d: [number, number, number],
  ground: number,
): { i: number; ring: number; t: number } | null {
  let best: { i: number; ring: number; t: number } | null = null;
  STRIKE_TARGETS.forEach((tg, i) => {
    // (the disc's plane: z = tg.z, facing north — the ray must come at it from the north)
    if (Math.abs(d[2]) < 1e-6) return;
    const t = (tg.z - o[2]) / d[2];
    if (t <= 0) return;
    const x = o[0] + d[0] * t;
    const y = o[1] + d[1] * t;
    const r = Math.hypot(x - tg.x, y - (ground + tg.y));
    if (r > tg.r) return;
    const ring = Math.max(1, 10 - Math.floor((r / tg.r) * 10));
    if (!best || t < best.t) best = { i, ring, t };
  });
  return best;
}

/** (plan 118, F10a) The lobby's buildings' jobs and the range's drills: where each is used (E within `r`), the
 *  prompt's words. Inside the buildings by their furnished pieces (furnish-layouts.ts STRIKE_ARMORY…: the armory's
 *  table, the briefing hall's stage, the trophy cases, the war room's desk — strike/lobby.test.ts checks they're in their
 *  rooms); the range's line in front of the canteen; the practice pad in the yard east of it, out of the range's way. */
export const STRIKE_SPOTS = {
  armory: { x: -223.2, z: -621.2, r: 2.0, label: "Your kit and loadout" },
  briefing: { x: -190, z: -625.4, r: 2.6, label: "The briefing: the map flown over" },
  trophies: { x: -310, z: -608.2, r: 2.6, label: "The park's records" },
  war: { x: -193, z: -609.8, r: 2.0, label: "Watch the match" },
  range: { x: -339, z: STRIKE_FIRING_LINE - 0.2, r: 3, label: "Aim drill: 30 s, the lit targets" },
  pad: { x: -300, z: -619, r: 2.2, label: "Plant and defuse drill" },
} as const;
export type StrikeSpot = keyof typeof STRIKE_SPOTS;
