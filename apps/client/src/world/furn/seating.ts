import { CylinderGeometry } from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type Look,
  lathe,
  type Model,
  ring,
  rod,
  roundRect,
  type Tier,
  taper,
  tube,
  type V3,
  wrap,
} from "./kit";
import { P, shade } from "./palette";

// Seating (docs/plan/67-the-furniture.md, phase 2), in the kit's frame: x across the footprint, z
// down it, y up; a seat faces +z (its rot 0). At true scale for the 1.79 m people (shared
// furniture.ts SEAT_NEXT has where each is sat on), Rich: piping, tufting, the hardware. Each kind's
// looks are its `props.variant`s (the Look picker), its story details (a cardigan on a chair's back,
// a newspaper on an arm) a seeded extra, as the iso art had them.

export type SeatLook = Look;

export const LOOKS = {
  chair: ["Mesh task chair", "Padded task chair", "Bentwood chair", "Executive chair"],
  armchair: ["Lounge chair", "Club chair"],
  sofa: ["Three-seat sofa", "Chesterfield", "Mid-century sofa"],
  beanbag: ["Bean bag"],
  bench: ["Slatted bench"],
} as const;

// ── the chair ───────────────────────────────────────────────────────────────────────────────────
export function chair(m: Model, o: SeatLook) {
  const f = o.fabric;
  if (o.look === 2) bentwood(m, f ?? P.linen, o.occupied);
  else if (o.look === 3) executive(m, f ?? P.oxblood, o.occupied);
  else taskChair(m, 2, f ?? P.fabric, { padded: o.look === 1, occupied: o.occupied });
  // (story: a cardigan over the back, one in four — the task chairs')
  if (o.look < 2 && o.seed > 0.75) cardigan(m);
}

/** The task chair, swivel and five-star base, the seat at 0.47 (Rich is the house standard: t 2;
 *  the bench shows the others). `padded`: an upholstered back for the mesh one. */
export function taskChair(
  m: Model,
  t: Tier,
  fabric: number = P.fabric,
  o: { padded?: boolean; occupied?: boolean } = {},
) {
  const cx = 0.5;
  const cz = 0.5;
  const sink = o.occupied ? 0.012 : 0;
  const seatTop = 0.47 - sink;
  starBase(m, t, cx, cz, P.plastic);
  // the gas column (chrome), a bellows over it
  const legs = t === 0 ? 8 : 12;
  m.add(cyl(0.022, 0.022, 0.24, legs), P.chrome, { at: [cx, 0.12, cz] });
  if (t > 0)
    m.add(
      lathe(
        t === 2
          ? [
              [0.034, 0],
              [0.04, 0.02],
              [0.034, 0.04],
              [0.04, 0.06],
              [0.034, 0.08],
              [0.04, 0.1],
              [0.03, 0.12],
            ]
          : [
              [0.036, 0],
              [0.03, 0.12],
            ],
        legs,
      ),
      P.rubber,
      { at: [cx, 0.13, cz] },
    );
  // the mechanism under the seat, and its lever
  m.add(box([0.18, 0.05, 0.2], t ? 0.01 : 0), P.plastic, { at: [cx, 0.37, cz] });
  if (t > 0)
    m.add(
      tube(
        [
          [0, 0, 0],
          [0.12, -0.01, 0.02],
          [0.17, -0.03, 0.05],
        ],
        0.007,
        5,
        6,
      ),
      P.plastic,
      { at: [cx + 0.08, 0.37, cz] },
    );
  // the seat: a shell and its cushion, piped round its top in the rich
  m.add(box([0.47, 0.025, 0.45], t ? 0.008 : 0), P.plastic, { at: [cx, 0.405, cz + 0.02] });
  if (t === 0) m.add(box([0.48, 0.055, 0.46], 0.015), fabric, { at: [cx, seatTop - 0.0275, cz + 0.02] });
  else
    m.add(cushion([0.48, 0.06 - sink, 0.46], 0.25, t === 2 ? 3 : 2), fabric, {
      at: [cx, seatTop - 0.035 + sink / 2, cz + 0.02],
    });
  if (t === 2)
    m.add(tube(rectLoop(0.46, 0.44, 0.06), 0.006, 4, 48), shade(fabric, 0.78), {
      at: [cx, seatTop - 0.012, cz + 0.02],
    });
  // the spine up to the back
  const backZ = cz - 0.25;
  m.add(box([0.06, 0.04, 0.2], t ? 0.01 : 0), P.plastic, { at: [cx, 0.39, cz - 0.15] });
  m.add(box([0.06, 0.3, 0.035], t ? 0.01 : 0), P.plastic, { at: [cx, 0.54, backZ - 0.01], rot: [-0.12, 0, 0] });
  // the back: a rounded panel wrapping round the sitter — a frame with a mesh and a lumbar band, or
  // upholstered with channel stitching (sat on, leant a touch further)
  const lean = -0.14 - (o.occupied ? 0.06 : 0);
  const back = (w: number, h: number, d: number, bevel: number) =>
    wrap(extrude(roundRect(w, h, Math.min(0.09, w * 0.2), t === 0 ? 1 : 3), d, bevel, t === 0 ? 1 : 2), t ? 0.5 : 0);
  if (t === 0) m.add(box([0.44, 0.46, 0.05], 0.015), fabric, { at: [cx, 0.85, backZ], rot: [lean, 0, 0] });
  else if (t === 1 || o.padded) {
    m.add(back(0.45, 0.5, 0.06, 0.012), fabric, { at: [cx, 0.86, backZ], rot: [lean, 0, 0] });
    if (t === 2)
      for (const dy of [-0.08, 0.08])
        m.add(wrap(box([0.4, 0.008, 0.006]), 0.5), shade(fabric, 0.72), {
          at: [cx, 0.86 + dy * Math.cos(lean), backZ + 0.031 - dy * Math.sin(lean)],
          rot: [lean, 0, 0],
        });
  } else {
    m.add(back(0.46, 0.52, 0.04, 0.008), P.plastic, { at: [cx, 0.86, backZ - 0.008], rot: [lean, 0, 0] });
    m.add(back(0.4, 0.46, 0.03, 0.004), P.mesh, { at: [cx, 0.86, backZ + 0.004], rot: [lean, 0, 0] });
    m.add(wrap(box([0.38, 0.07, 0.03], 0.01, 2), 0.5), fabric, { at: [cx, 0.72, backZ + 0.03], rot: [lean, 0, 0] });
  }
  // the arms (crafted and rich): a post and a pad each side
  if (t > 0)
    for (const s of [-1, 1]) {
      const x = cx + s * 0.255;
      m.add(box([0.03, 0.2, 0.05], 0.008), P.plastic, { at: [x, 0.5, cz - 0.02] });
      m.add(box([0.03, 0.03, 0.14], 0.008), P.plastic, { at: [x, 0.415, cz - 0.02] });
      m.add(t === 2 ? cushion([0.075, 0.03, 0.25], 0.15) : box([0.07, 0.03, 0.24], 0.012, 2), P.plastic, {
        at: [x, 0.615, cz - 0.01],
      });
    }
}

/** A five-star base on twin-wheel casters (the hub at y 0.075). */
function starBase(m: Model, t: Tier, cx: number, cz: number, c: number) {
  const R = 0.31;
  const legs = t === 0 ? 8 : 12;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    if (t === 0)
      m.add(box([R, 0.035, 0.05]), c, { at: [cx + (dx * R) / 2, 0.095, cz + (dz * R) / 2], rot: [0, -a, 0] });
    else {
      // tapered and sloping down to its caster, a ridge along its top
      const arm = extrude(
        [
          [0, -0.02],
          [R, -0.012],
          [R, 0.016],
          [0.04, 0.03],
          [0, 0.03],
        ],
        t === 2 ? 0.05 : 0.046,
        t === 2 ? 0.006 : 0.004,
        2,
      );
      m.add(arm, c, { at: [cx, 0.09, cz], rot: [0, -a, 0] });
    }
    const ex = cx + dx * (R - 0.02);
    const ez = cz + dz * (R - 0.02);
    if (t === 0) m.add(rod(0.028, 0.028, 0.035, "z", legs), P.rubber, { at: [ex, 0.028, ez], rot: [0, -a, 0] });
    else {
      for (const s of [-1, 1])
        m.add(new CylinderGeometry(0.028, 0.028, 0.016, legs).rotateZ(Math.PI / 2), P.rubber, {
          at: [ex + Math.cos(a + Math.PI / 2) * s * 0.012, 0.028, ez + Math.sin(a + Math.PI / 2) * s * 0.012],
          rot: [0, -a - Math.PI / 2, 0],
        });
      m.add(box([0.03, 0.035, 0.03], 0.006), c, { at: [ex, 0.06, ez] });
    }
  }
  m.add(cyl(0.05, 0.04, 0.06, legs), c, { at: [cx, 0.075, cz] });
}

/** A bentwood chair: a round seat with a pad, four splayed legs held by a ring, the back legs going
 *  on up into a hoop. */
function bentwood(m: Model, pad: number, occupied: boolean) {
  const cx = 0.5;
  const cz = 0.5;
  const wood = P.walnut;
  const seatTop = 0.47 - (occupied ? 0.008 : 0);
  // the seat: a turned disc, its rim a ring, a padded round on it
  m.add(
    lathe(
      [
        [0, 0],
        [0.215, 0],
        [0.225, 0.015],
        [0.215, 0.03],
        [0, 0.03],
      ],
      20,
    ),
    wood,
    { at: [cx, 0.42, cz + 0.02] },
  );
  m.add(ring(0.218, 0.012, 6, 28), shade(wood, 0.85), { at: [cx, 0.43, cz + 0.02] });
  m.add(
    lathe(
      [
        [0, 0],
        [0.19, 0],
        [0.195, 0.01],
        [0.17, 0.018],
        [0, 0.02],
      ],
      20,
    ),
    pad,
    { at: [cx, seatTop - 0.02, cz + 0.02] },
  );
  // the legs: splayed, turned to a point at the floor
  const legAt = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cz + 0.02 + Math.sin(a) * r];
  for (const a of [Math.PI * 0.25, Math.PI * 0.75]) {
    // (the front ones, in plan +z)
    const [tx, tz] = legAt(a, 0.17);
    const [bx, bz] = legAt(a, 0.23);
    m.add(
      tube(
        [
          [tx, 0.42, tz],
          [(tx + bx) / 2, 0.21, (tz + bz) / 2 + 0.005],
          [bx, 0.0, bz],
        ],
        0.017,
        7,
        8,
      ),
      wood,
    );
  }
  // the back legs run on up into the hoop of the back
  for (const s of [-1, 1]) {
    const [tx, tz] = legAt(-Math.PI / 2 + s * 0.6, 0.18);
    const [bx, bz] = legAt(-Math.PI / 2 + s * 0.55, 0.24);
    m.add(
      tube(
        [
          [bx, 0, bz],
          [tx, 0.42, tz],
          [cx + s * 0.17, 0.66, cz - 0.21],
          [cx + s * 0.17, 0.86, cz - 0.24],
          [cx + s * 0.1, 0.96, cz - 0.25],
          [cx, 0.975, cz - 0.255],
        ],
        0.016,
        7,
        18,
      ),
      wood,
    );
  }
  // an inner bow across the back, and the ring round the legs
  m.add(
    tube(
      [
        [cx - 0.16, 0.6, cz - 0.21],
        [cx - 0.1, 0.8, cz - 0.24],
        [cx, 0.84, cz - 0.245],
        [cx + 0.1, 0.8, cz - 0.24],
        [cx + 0.16, 0.6, cz - 0.21],
      ],
      0.011,
      6,
      16,
    ),
    wood,
  );
  m.add(ring(0.205, 0.011, 6, 28), wood, { at: [cx, 0.17, cz + 0.02] });
}

/** An executive chair: a tall buttoned leather back with its headrest, padded loop arms, a polished
 *  five-star base. */
function executive(m: Model, leather: number, occupied: boolean) {
  const cx = 0.5;
  const cz = 0.5;
  const sink = occupied ? 0.015 : 0;
  const seatTop = 0.47 - sink;
  starBase(m, 2, cx, cz, P.chrome);
  m.add(cyl(0.024, 0.024, 0.26, 12), P.chrome, { at: [cx, 0.11, cz] });
  m.add(box([0.22, 0.05, 0.22], 0.012), P.steel, { at: [cx, 0.37, cz] });
  // the seat: a deep cushion, piped
  m.add(cushion([0.52, 0.09 - sink, 0.5], 0.28, 3), leather, { at: [cx, seatTop - 0.045 + sink / 2, cz + 0.02] });
  m.add(tube(rectLoop(0.5, 0.48, 0.08), 0.007, 4, 48), shade(leather, 0.75), { at: [cx, seatTop - 0.01, cz + 0.02] });
  // the back: three buttoned rolls stacked to the headrest, leant
  const lean = -0.16 - (occupied ? 0.05 : 0);
  const backZ = cz - 0.25;
  const along = (h: number): V3 => [cx, 0.52 + h * Math.cos(lean), backZ + h * Math.sin(lean)];
  m.add(wrap(box([0.52, 0.76, 0.05], 0.015, 2), 0.4), shade(leather, 0.8), { at: along(0.38), rot: [lean, 0, 0] });
  for (const [h, hh] of [
    [0.16, 0.2],
    [0.38, 0.22],
    [0.6, 0.2],
  ]) {
    m.add(wrap(cushion([0.48, 0.08, hh], 0.3, 3).rotateX(Math.PI / 2), 0.4), leather, {
      at: [cx, along(h)[1], along(h)[2] + 0.02],
      rot: [lean, 0, 0],
    });
    for (const bx of [-0.12, 0, 0.12])
      m.add(ball(0.011, 6), shade(leather, 0.6), {
        at: [cx + bx, along(h)[1], along(h)[2] + 0.063 + bx * bx * 0.4],
      });
  }
  // the headrest
  m.add(wrap(cushion([0.36, 0.13, 0.09], 0.3, 3), 0.5), leather, {
    at: [cx, along(0.82)[1], along(0.82)[2] + 0.04],
    rot: [lean, 0, 0],
  });
  // padded loop arms: a chrome loop from the seat's side, a leather pad on it
  for (const s of [-1, 1]) {
    const x = cx + s * 0.29;
    m.add(
      tube(
        [
          [x, 0.4, cz + 0.12],
          [x, 0.56, cz + 0.16],
          [x, 0.64, cz + 0.05],
          [x, 0.62, cz - 0.15],
          [x - s * 0.02, 0.45, cz - 0.2],
        ],
        0.012,
        6,
        16,
      ),
      P.chrome,
    );
    m.add(cushion([0.08, 0.035, 0.28], 0.2, 2), leather, { at: [x, 0.655, cz - 0.02] });
  }
}

/** A cardigan hung over a chair's back (a story detail). */
function cardigan(m: Model) {
  const z = 0.24;
  m.add(cushion([0.4, 0.025, 0.16], 0.3, 2).rotateX(-0.25), P.wool, { at: [0.5, 1.0, z - 0.02] });
  for (const s of [-1, 1])
    m.add(cushion([0.11, 0.3, 0.035], 0.25, 2), shade(P.wool, 0.92), {
      at: [0.5 + s * 0.13, 0.82, z + 0.075],
      rot: [-0.14, 0, s * 0.06],
    });
  m.add(cushion([0.4, 0.28, 0.03], 0.2, 2), P.wool, { at: [0.5, 0.86, z - 0.09], rot: [-0.14, 0, 0] });
}

// ── the armchair (1×1) ───────────────────────────────────────────────────────────────────────────
export function armchair(m: Model, o: SeatLook) {
  if (o.look === 1) clubChair(m, o.fabric ?? P.cognac, o.occupied);
  else loungeChair(m, o.fabric ?? P.olive, o.occupied);
  // (story: a lace doily on the back, or the day's paper on an arm)
  if (o.seed < 0.35)
    m.add(
      lathe(
        [
          [0, 0],
          [0.11, 0],
          [0.11, 0.004],
          [0, 0.004],
        ],
        14,
      ).rotateX(Math.PI / 2 - 0.25),
      P.lace,
      {
        at: [0.5, 0.86, o.look === 1 ? 0.16 : 0.2],
      },
    );
  else if (o.seed > 0.7) {
    const x = o.look === 1 ? 0.87 : 0.86;
    m.add(box([0.12, 0.012, 0.3], 0.002), P.paper, {
      at: [x, o.look === 1 ? 0.65 : 0.615, 0.55],
      rot: [0, 0.08, 0.04],
    });
    for (let i = 0; i < 3; i++)
      m.add(box([0.1, 0.002, 0.012]), P.ink, {
        at: [x, (o.look === 1 ? 0.65 : 0.615) + 0.007, 0.47 + i * 0.06],
        rot: [0, 0.08, 0.04],
      });
  }
}

/** The 70s lounge chair: walnut legs, a plinth, a deep seat cushion, padded arms, a buttoned back
 *  cushion leant back. Its seat at 0.43, arms at 0.6. */
function loungeChair(m: Model, f: number, occupied: boolean) {
  const dark = shade(f, 0.8);
  const sink = occupied ? 0.02 : 0;
  for (const [x, z] of [
    [0.13, 0.17],
    [0.87, 0.17],
    [0.13, 0.86],
    [0.87, 0.86],
  ])
    m.add(taper(cyl(0.022, 0.022, 0.14, 10), 1.5, 0, 0.14), P.walnut, { at: [x, 0, z] });
  m.add(cushion([0.86, 0.16, 0.8], 0.06, 2), dark, { at: [0.5, 0.22, 0.52] });
  m.add(cushion([0.6, 0.15 - sink, 0.6], 0.25, 3), f, { at: [0.5, 0.355 - sink / 2, 0.6] });
  m.add(tube(rectLoop(0.56, 0.56, 0.07), 0.007, 4, 44), shade(f, 0.7), { at: [0.5, 0.425 - sink, 0.6] });
  for (const s of [-1, 1]) m.add(cushion([0.15, 0.3, 0.78], 0.12, 3), dark, { at: [0.5 + s * 0.355, 0.45, 0.52] });
  const lean = -0.24 - (occupied ? 0.04 : 0);
  m.add(cushion([0.82, 0.2, 0.56], 0.2, 3).rotateX(Math.PI / 2), dark, { at: [0.5, 0.58, 0.17], rot: [lean, 0, 0] });
  m.add(cushion([0.58, 0.16, 0.44], 0.32, 3).rotateX(Math.PI / 2), f, { at: [0.5, 0.63, 0.28], rot: [lean, 0, 0] });
  for (const [bx, by] of [
    [-0.15, 0.1],
    [0, 0.1],
    [0.15, 0.1],
    [-0.15, -0.06],
    [0, -0.06],
    [0.15, -0.06],
  ])
    m.add(ball(0.012, 6), shade(f, 0.6), {
      at: [0.5 + bx, 0.63 + by * Math.cos(lean), 0.28 + 0.095 - by * Math.sin(lean) * -1],
    });
}

/** A leather club chair: a low back curving round into its arms, a deep seat on block feet. Its
 *  seat at 0.43, arms at 0.64. */
function clubChair(m: Model, f: number, occupied: boolean) {
  const sink = occupied ? 0.02 : 0;
  for (const [x, z] of [
    [0.14, 0.16],
    [0.86, 0.16],
    [0.14, 0.86],
    [0.86, 0.86],
  ])
    m.add(box([0.06, 0.07, 0.06], 0.01, 2), P.walnutDark, { at: [x, 0.035, z] });
  m.add(cushion([0.9, 0.24, 0.84], 0.05, 2), shade(f, 0.88), { at: [0.5, 0.19, 0.51] });
  // the back and arms: one U, its top rolled
  const u: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    u.push([Math.cos(a) * 0.38, -Math.sin(a) * 0.3]);
  }
  for (let i = 16; i >= 0; i--) {
    const a = Math.PI * (i / 16);
    u.push([Math.cos(a) * 0.26, -Math.sin(a) * 0.18]);
  }
  const shell = extrude(u, 0.36, 0.02, 2).rotateX(Math.PI / 2);
  m.add(shell, f, { at: [0.5, 0.48, 0.48] });
  // straight runs of the arms to the front, rolled on top
  for (const s of [-1, 1]) {
    m.add(cushion([0.12, 0.36, 0.38], 0.08, 3), f, { at: [0.5 + s * 0.32, 0.48, 0.67] });
    m.add(rod(0.065, 0.065, 0.38, "z", 14), shade(f, 1.06), { at: [0.5 + s * 0.32, 0.64, 0.67] });
  }
  const roll: V3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    roll.push([0.5 + Math.cos(a) * 0.32, 0.64, 0.48 - Math.sin(a) * 0.24]);
  }
  m.add(tube(roll, 0.065, 12, 32), shade(f, 1.06));
  m.add(cushion([0.56, 0.15 - sink, 0.62], 0.3, 3), f, { at: [0.5, 0.36 - sink / 2, 0.6] });
  m.add(tube(rectLoop(0.52, 0.58, 0.08), 0.007, 4, 44), shade(f, 0.7), { at: [0.5, 0.43 - sink, 0.6] });
}

// ── the sofa (3×1) ───────────────────────────────────────────────────────────────────────────────
export function sofa(m: Model, o: SeatLook) {
  if (o.look === 1) chesterfield(m, o.fabric ?? P.oxblood);
  else if (o.look === 2) midCentury(m, o.fabric ?? P.rust);
  else threeSeat(m, 2, o.fabric ?? P.moss);
  // (story: a knitted blanket over an arm, one in three)
  if (o.seed > 0.66)
    m.add(cushion([0.26, 0.02, 0.62], 0.3, 2).rotateZ(-0.3), P.wool, { at: [o.look === 2 ? 2.58 : 2.55, 0.66, 0.52] });
}

/** The three-seat sofa (phase 0's): three seat and three back cushions, buttoned and piped, a throw
 *  pillow in the corner, tapered walnut legs. Its seat at 0.45. */
export function threeSeat(m: Model, t: Tier, fabric: number) {
  const x0 = 0.35;
  const x1 = 2.65;
  const z0 = 0.05;
  const z1 = 0.95;
  const W = x1 - x0;
  const cx = (x0 + x1) / 2;
  const armW = 0.19;
  const baseY = 0.13;
  const deckY = 0.33;
  const seatTop = 0.45;
  const dark = shade(fabric, 0.82);
  for (const [x, z] of [
    [x0 + 0.08, z0 + 0.08],
    [x1 - 0.08, z0 + 0.08],
    [x0 + 0.08, z1 - 0.08],
    [x1 - 0.08, z1 - 0.08],
  ]) {
    if (t === 0) m.add(box([0.05, baseY, 0.05]), P.walnutDark, { at: [x, baseY / 2, z] });
    else m.add(taper(cyl(0.025, 0.025, baseY, t === 2 ? 10 : 7), 1.45, 0, baseY), P.walnut, { at: [x, 0, z] });
  }
  m.add(box([W, deckY - baseY, z1 - z0], 0.02), dark, { at: [cx, (baseY + deckY) / 2, (z0 + z1) / 2] });
  const backH = 0.42;
  m.add(box([W, backH, 0.2], t ? 0.04 : 0.02, t === 2 ? 3 : 2), dark, { at: [cx, deckY + backH / 2, z0 + 0.1] });
  for (const s of [-1, 1]) {
    const ax = s < 0 ? x0 + armW / 2 : x1 - armW / 2;
    if (t === 0) m.add(box([armW, 0.3, z1 - z0], 0.02), fabric, { at: [ax, deckY + 0.15 - 0.01, (z0 + z1) / 2] });
    else
      m.add(cushion([armW, 0.32, z1 - z0], 0.15, t === 2 ? 3 : 2), fabric, { at: [ax, deckY + 0.15, (z0 + z1) / 2] });
  }
  const inner = W - 2 * armW;
  const n = t === 0 ? 1 : 3;
  const cw = inner / n;
  const sd = z1 - z0 - 0.22;
  const sz = z1 - sd / 2 - 0.01;
  for (let i = 0; i < n; i++) {
    const x = x0 + armW + cw * (i + 0.5);
    const seat =
      t === 0
        ? box([cw - 0.01, seatTop - deckY, sd], 0.03, 2)
        : cushion([cw - 0.012, seatTop - deckY + 0.01, sd], 0.22, t === 2 ? 3 : 2);
    m.add(seat, fabric, { at: [x, (deckY + seatTop) / 2, sz] });
    if (t === 2)
      m.add(tube(rectLoop(cw - 0.04, sd - 0.03, 0.05), 0.007, 4, 40), dark, { at: [x, seatTop - 0.008, sz] });
    const bh = 0.44;
    const back =
      t === 0
        ? box([cw - 0.01, bh, 0.16], 0.04, 2)
        : cushion([cw - 0.012, 0.17, bh], 0.3, t === 2 ? 3 : 2).rotateX(Math.PI / 2);
    m.add(back, fabric, { at: [x, seatTop + bh / 2 - 0.04, z0 + 0.27], rot: [-0.2, 0, 0] });
    if (t === 2)
      for (const [bx, by] of [
        [-0.16, 0.1],
        [0, 0.1],
        [0.16, 0.1],
        [-0.08, -0.06],
        [0.08, -0.06],
      ])
        m.add(ball(0.012, 6), dark, {
          at: [x + bx, seatTop + bh / 2 - 0.04 + by * Math.cos(0.2), z0 + 0.27 + 0.1 + by * Math.sin(0.2)],
        });
  }
  if (t > 0)
    m.add(cushion([0.4, 0.38, 0.13], 0.45, 3), P.mustard, {
      at: [x0 + armW + 0.24, seatTop + 0.18, z0 + 0.42],
      rot: [-0.32, 0.35, 0.12],
    });
}

/** A Chesterfield: rolled arms as high as its back, deep diamond buttoning, three seat cushions on
 *  turned bun feet. Its seat at 0.45. */
function chesterfield(m: Model, f: number) {
  const x0 = 0.3;
  const x1 = 2.7;
  const z0 = 0.06;
  const z1 = 0.94;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const top = 0.74;
  const dark = shade(f, 0.82);
  for (const [x, z] of [
    [x0 + 0.08, z0 + 0.08],
    [x1 - 0.08, z0 + 0.08],
    [x0 + 0.08, z1 - 0.08],
    [x1 - 0.08, z1 - 0.08],
  ])
    m.add(
      lathe(
        [
          [0, 0],
          [0.03, 0],
          [0.045, 0.03],
          [0.035, 0.07],
          [0.04, 0.09],
          [0, 0.09],
        ],
        12,
      ),
      P.walnutDark,
      { at: [x, 0, z] },
    );
  m.add(cushion([x1 - x0, 0.26, z1 - z0], 0.04, 2), f, { at: [cx, 0.22, cz] });
  // the back: a buttoned wall, its top rolled
  m.add(cushion([x1 - x0 - 0.2, top - 0.35, 0.3], 0.08, 3), f, { at: [cx, (top + 0.35) / 2, z0 + 0.2] });
  m.add(rod(0.075, 0.075, x1 - x0 - 0.2, "x", 14), shade(f, 1.05), { at: [cx, top - 0.02, z0 + 0.2] });
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 9 - (r % 2); i++) {
      const x = x0 + 0.35 + (r % 2 ? 0.125 : 0) + i * 0.25;
      if (x > x1 - 0.3) continue;
      m.add(ball(0.013, 6), dark, { at: [x, 0.5 + r * 0.075, z0 + 0.355] });
    }
  // the arms: as high as the back, rolled outwards
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 + 0.1 : x1 - 0.1;
    m.add(cushion([0.2, top - 0.35, z1 - z0], 0.06, 3), f, { at: [x, (top + 0.35) / 2 - 0.02, cz] });
    m.add(rod(0.085, 0.085, z1 - z0, "z", 16), shade(f, 1.05), { at: [x + s * 0.03, top - 0.06, cz] });
    for (let i = 0; i < 3; i++) m.add(ball(0.012, 6), dark, { at: [x - s * 0.1, 0.5 + i * 0.07, cz - 0.2 + i * 0.2] });
  }
  // three seat cushions, piped
  const cw = (x1 - x0 - 0.4) / 3;
  for (let i = 0; i < 3; i++) {
    const x = x0 + 0.2 + cw * (i + 0.5);
    m.add(cushion([cw - 0.01, 0.12, 0.5], 0.2, 3), f, { at: [x, 0.39, z1 - 0.26] });
    m.add(tube(rectLoop(cw - 0.04, 0.46, 0.05), 0.007, 4, 40), dark, { at: [x, 0.444, z1 - 0.26] });
  }
}

/** A mid-century sofa: one long seat cushion, two back cushions, slim square arms on tall splayed
 *  legs. Its seat at 0.45. */
function midCentury(m: Model, f: number) {
  const x0 = 0.25;
  const x1 = 2.75;
  const z0 = 0.08;
  const z1 = 0.92;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const dark = shade(f, 0.82);
  // the legs, splayed out, brass-capped
  for (const [x, z, sx, sz] of [
    [x0 + 0.1, z0 + 0.1, -1, -1],
    [x1 - 0.1, z0 + 0.1, 1, -1],
    [x0 + 0.1, z1 - 0.1, -1, 1],
    [x1 - 0.1, z1 - 0.1, 1, 1],
  ]) {
    m.add(taper(cyl(0.022, 0.022, 0.22, 10), 1.6, 0, 0.22), P.walnut, {
      at: [x, 0, z],
      rot: [-sz * 0.12, 0, sx * 0.12],
    });
    m.add(cyl(0.015, 0.015, 0.02, 10), P.brass, { at: [x + sx * 0.026, 0, z + sz * 0.026] });
  }
  // a walnut rail round the base, the fabric body on it
  m.add(box([x1 - x0, 0.03, z1 - z0], 0.006), P.walnut, { at: [cx, 0.225, cz] });
  m.add(box([x1 - x0 - 0.02, 0.1, z1 - z0 - 0.02], 0.02, 2), dark, { at: [cx, 0.29, cz] });
  for (const s of [-1, 1])
    m.add(box([0.1, 0.27, z1 - z0], 0.02, 2), f, { at: [s < 0 ? x0 + 0.05 : x1 - 0.05, 0.47, cz] });
  m.add(box([x1 - x0 - 0.2, 0.36, 0.12], 0.02, 2), dark, { at: [cx, 0.52, z0 + 0.06] });
  // one long seat cushion, piped; two back cushions leant back
  m.add(cushion([x1 - x0 - 0.22, 0.12, 0.54], 0.15, 3), f, { at: [cx, 0.395, z1 - 0.29] });
  m.add(tube(rectLoop(x1 - x0 - 0.26, 0.5, 0.05), 0.007, 4, 56), dark, { at: [cx, 0.448, z1 - 0.29] });
  const bw = (x1 - x0 - 0.22) / 2;
  for (const i of [0, 1])
    m.add(cushion([bw - 0.01, 0.14, 0.36], 0.25, 3).rotateX(Math.PI / 2), f, {
      at: [x0 + 0.11 + bw * (i + 0.5), 0.62, z0 + 0.26],
      rot: [-0.22, 0, 0],
    });
}

// ── the bean bag (1×1) ───────────────────────────────────────────────────────────────────────────
/** A bean bag: slumped low at the front where you sit (into 0.33), heaped up behind into a back,
 *  a dimple where you've sat, two seams over it and its label. */
export function beanbag(m: Model, o: SeatLook) {
  const f = o.fabric ?? P.rust;
  const sat = o.occupied ? 1 : 0;
  const R = 0.42;
  // its height over a point of the floor (x, z from its middle), before the dome of its sides: low
  // in front, heaped behind, dented where you sit
  const heightAt = (x: number, z: number) => {
    const heap = 0.32 + 0.3 * Math.max(0, -z / R) ** 0.8;
    const dent = (0.07 + 0.04 * sat) * Math.exp(-(x * x + (z - 0.06) ** 2) / 0.03);
    return Math.max(0.05, heap * 1.1 - dent);
  };
  const dome = (x: number, z: number) => Math.sqrt(Math.max(0, 1 - (Math.hypot(x, z) / R) ** 2));
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = (t * Math.PI) / 2;
    prof.push([R * Math.cos(a) * (1 + 0.04 * Math.sin(a * 2)), Math.sin(a)]);
  }
  prof.unshift([0, 0]);
  prof.push([0, 1]);
  const g = lathe(prof, 22);
  // (the lathe's y is 0..1 up its side; each point lifted to the height over where it stands)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const k = p.getY(i);
    p.setY(i, k * heightAt(x, z) + (k > 0 && k < 0.3 ? 0.02 * Math.sin((k / 0.3) * Math.PI) : 0));
  }
  m.add(g, f, { at: [0.5, 0, 0.5] });
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let j = 0; j <= 12; j++) {
      const z = -R + (2 * R * j) / 12;
      const x = s * 0.2 * Math.sqrt(Math.max(0, 1 - (z / R) ** 2));
      pts.push([0.5 + x, dome(x, z * 0.98) * heightAt(x, z) + 0.004, 0.5 + z * 0.98]);
    }
    m.add(tube(pts, 0.004, 4, 24), shade(f, 0.84));
  }
  m.add(box([0.06, 0.02, 0.012], 0.003), P.ink, { at: [0.5 + 0.2, 0.06, 0.5 + 0.36], rot: [0, -0.5, 0] });
}

// ── the bench (3×1) ──────────────────────────────────────────────────────────────────────────────
/** A slatted teak bench on walnut trestles. Its seat at 0.45. Story: a scarf left on one end. */
export function bench(m: Model, o: SeatLook) {
  const x0 = 0.08;
  const x1 = 2.92;
  for (const x of [x0 + 0.16, x1 - 0.16]) {
    // a trestle: two legs leaning in, a foot and a cap
    for (const s of [-1, 1])
      m.add(box([0.06, 0.4, 0.05], 0.008), P.walnutDark, { at: [x, 0.22, 0.5 + s * 0.13], rot: [-s * 0.12, 0, 0] });
    m.add(box([0.08, 0.04, 0.44], 0.01, 2), P.walnutDark, { at: [x, 0.02, 0.5] });
    m.add(box([0.08, 0.04, 0.4], 0.01, 2), P.walnutDark, { at: [x, 0.405, 0.5] });
  }
  m.add(box([x1 - x0 - 0.36, 0.04, 0.04], 0.008), P.walnutDark, { at: [1.5, 0.12, 0.5] });
  for (let i = 0; i < 5; i++)
    m.add(box([x1 - x0, 0.026, 0.074], 0.006, 2), P.teak, {
      at: [1.5, 0.437, 0.32 + i * 0.09],
      tone: 0.94 + 0.06 * Math.sin(i * 2.1),
    });
  if (o.seed > 0.5) {
    // a scarf, draped over the front edge
    m.add(cushion([0.34, 0.012, 0.3], 0.3, 2), P.rust, { at: [2.42, 0.458, 0.62], rot: [0, 0.3, 0] });
    m.add(cushion([0.18, 0.2, 0.012], 0.2, 2), P.rust, { at: [2.36, 0.36, 0.8], rot: [0.2, 0.3, 0] });
    m.add(box([0.3, 0.014, 0.025]), P.wool, { at: [2.42, 0.466, 0.62], rot: [0, 0.3, 0] });
  }
}

/** A rectangle's edge, its middle at 0 (y 0), `r` round its corners. */
export function rectLoop(w: number, d: number, r: number): V3[] {
  const out: V3[] = [];
  const seg = 4;
  const c = (x: number, z: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([x + Math.cos(a) * r, 0, z + Math.sin(a) * r]);
    }
  };
  c(w / 2 - r, d / 2 - r, 0);
  c(-w / 2 + r, d / 2 - r, Math.PI / 2);
  c(-w / 2 + r, -d / 2 + r, Math.PI);
  c(w / 2 - r, -d / 2 + r, (3 * Math.PI) / 2);
  out.push(out[0]);
  return out;
}
