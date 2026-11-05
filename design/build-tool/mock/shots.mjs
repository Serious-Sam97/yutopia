// The free-form build tool's mock shots (docs/plan/72-the-3d-core.md, phase 0): what capture.spec.ts draws
// into the game's 3D view for each still, in the world's metres (x, y on the plan; z up from the floor).
// node shots.mjs > shots.json
const A = 0xf1d79a; // amber: what's being drawn
const G = 0x7fc04a; // green: it fits
const PL = 0xe8e1d4; // plaster: walls already built

const F3 = { level: 3, stand: { x: 20, y: 20 }, hour: 13 };
// (the subject right of the middle: the build panel covers the left third)
const cam1 = { eye: [14.5, 25.5, 12.5], look: [14.5, 12, 0], fov: 50 };
const cam2 = { eye: [16.5, 25.5, 10.5], look: [16.5, 12.5, 0], fov: 50 };
const camM = { eye: [27, 26.5, 12.5], look: [27, 11.5, 0.5], fov: 50 };

const wall = (a, b, o = {}) => ({ t: "wall", a, b, ...o });
const built = (a, b, o = {}) => wall(a, b, { solid: true, color: PL, ...o });
const ghost = (a, b, o = {}) => wall(a, b, { opacity: 0.5, ...o });
const dot = (x, y, o = {}) => ({ t: "dot", at: [x, y, o.z ?? 0.05], ...o });
const guide = (pts, o = {}) => ({ t: "guide", pts, ...o });
const grid = (cx, cy, n, step, z = 0.02) => {
  const out = [];
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++)
      out.push(dot(cx + i * step, cy + j * step, { r: 0.045, z, color: 0xfff6dc, depth: true }));
  return out;
};
const polar = (p, deg, len) => [
  p[0] + Math.cos((deg * Math.PI) / 180) * len,
  p[1] + Math.sin((deg * Math.PI) / 180) * len,
];
const mid = (a, b, z = 0) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z];

const shots = [];

// 01 — drawing a wall: click-click, each click a corner, the next wall going on from it
{
  const p0 = [14, 8];
  const p1 = [24, 8];
  const p2 = [24, 13];
  const p3 = polar(p2, 150, 5);
  shots.push({
    name: "01-draw",
    ...F3,
    ...cam1,
    objects: [
      ghost(p0, p1, { opacity: 0.62 }),
      ghost(p1, p2, { opacity: 0.62 }),
      ghost(p2, p3, { opacity: 0.38 }),
      guide([
        [...p2, 0],
        [...polar(p2, 180, 6), 0],
      ]),
      ...grid(p3[0], p3[1], 3, 0.5),
      dot(...p0, { r: 0.12 }),
      dot(...p1, { r: 0.12 }),
      dot(...p2, { r: 0.12 }),
      dot(...p3, { r: 0.14, color: 0xffffff }),
    ],
    anchors: {
      p0: [...p0, 0],
      p1: [...p1, 0],
      p2: [...p2, 0],
      cursor: [...p3, 0],
      len: mid(p2, p3, 3.3),
      ang: [...polar(p2, 165, 1.6), 0],
    },
  });
}

// 02 — the snaps: an end, a wall's middle, square off a wall, a wall's line carried on
{
  const a = [14, 8];
  const b = [24, 8];
  const c = [24, 16];
  const m = [19, 8];
  const foot = [19, 13];
  shots.push({
    name: "02-snaps",
    ...F3,
    ...cam2,
    objects: [
      built(a, b),
      built(b, c),
      ghost(m, foot, { opacity: 0.45 }),
      guide([
        [...c, 0],
        [24, 21, 0],
      ]),
      guide(
        [
          [...foot, 0],
          [26, 13, 0],
        ],
        { color: 0xbfe39a },
      ),
      dot(...c, { r: 0.13 }),
      dot(...m, { r: 0.13 }),
      dot(...foot, { r: 0.13, color: 0xffffff }),
    ],
    anchors: { end: [...c, 0], mid: [...m, 3.4], foot: [...foot, 0], ext: [24, 19.5, 0], sq: [19.4, 9.4, 0] },
  });
}

// 03 — a curved wall: its two ends, then how far it bows
{
  const c = [20, 16];
  const r = 4;
  shots.push({
    name: "03-arc",
    ...F3,
    ...cam1,
    objects: [
      built([16, 16], [16, 21]),
      built([24, 16], [24, 21]),
      { t: "arc", c, r, a0: Math.PI, a1: 2 * Math.PI, n: 24, opacity: 0.55 },
      guide([
        [16, 16, 0],
        [24, 16, 0],
      ]),
      guide([
        [20, 16, 0],
        [20, 12, 0],
      ]),
      dot(16, 16, { r: 0.13 }),
      dot(24, 16, { r: 0.13 }),
      dot(20, 12, { r: 0.15, color: 0xffffff }),
    ],
    anchors: { a: [16, 16, 0], b: [24, 16, 0], bow: [20, 12, 3.4], r: [20, 14, 0], c: [20, 16, 0] },
  });
}

// 04 — a wall's height: its top dragged down to a rail
{
  shots.push({
    name: "04-height",
    ...F3,
    ...cam2,
    objects: [
      built([14, 8], [24, 8]),
      built([24, 8], [24, 16]),
      wall([14, 12], [20, 12], { opacity: 0.18, h: 3.27 }),
      built([14, 12], [20, 12], { h: 1.1, color: 0xf1e3bd, edges: true }),
      dot(17, 12, { z: 1.1, r: 0.16, color: 0xffffff }),
      guide([
        [17, 12, 3.27],
        [17, 12, 1.15],
      ]),
    ],
    anchors: { handle: [17, 12, 1.1], top: [17, 12, 3.27], end: [20, 12, 1.1], full: [24, 12, 3.27] },
  });
}

// 05 — closing a room: the last wall closes the face, and the room it finds is named
{
  const r = [
    [14, 8],
    [24, 8],
    [24, 16],
    [14, 16],
  ];
  shots.push({
    name: "05-room",
    ...F3,
    ...cam1,
    objects: [
      built(r[0], r[1]),
      built(r[1], r[2]),
      built(r[2], r[3]),
      ghost(r[3], r[0], { opacity: 0.55 }),
      { t: "slab", ring: r, opacity: 0.22, z: 0 },
      dot(...r[0], { r: 0.15, color: 0xffffff }),
    ],
    anchors: { close: [...r[0], 0], mid: [19, 12, 0], card: [24.5, 12, 0] },
  });
}

// 06 — a door slid along its wall
{
  shots.push({
    name: "06-door",
    ...F3,
    ...cam2,
    objects: [
      built([14, 8], [24, 8]),
      built([24, 8], [24, 16]),
      built([14, 16], [24, 16]),
      built([14, 8], [14, 16]),
      { t: "box", at: [19, 16, 0], w: 1.0, h: 2.2, d: 0.32, color: G, opacity: 0.55, edge: G },
      guide([
        [14, 16.6, 0],
        [18.5, 16.6, 0],
      ]),
      guide([
        [19.5, 16.6, 0],
        [24, 16.6, 0],
      ]),
      dot(19, 16, { z: 2.4, r: 0.12, color: 0xffffff }),
    ],
    anchors: { door: [19, 16, 2.4], left: [16.2, 16.6, 0], right: [21.8, 16.6, 0], mid: [19, 16, 0] },
  });
}

// 07 — a floor drawn: a mezzanine's slab, corner by corner, at its height
{
  const z = 1.75;
  const ring = [
    [28, 8],
    [36, 8],
    [36, 13],
    [32, 15],
    [28, 15],
  ];
  shots.push({
    name: "07-floor",
    ...F3,
    ...camM,
    objects: [
      { t: "slab", ring, z, opacity: 0.35 },
      ...ring.map(([x, y]) => dot(x, y, { z: z + 0.05, r: 0.13 })),
      ...ring.map(([x, y]) =>
        guide([
          [x, y, 0],
          [x, y, z],
        ]),
      ),
    ],
    anchors: { c0: [28, 8, z], c3: [32, 15, z], mid: [32, 11, z], h: [36, 13, z / 2] },
  });
}

// 08 — the working height: new walls go up on the mezzanine's level
{
  const z = 1.75;
  const ring = [
    [28, 8],
    [36, 8],
    [36, 13],
    [32, 15],
    [28, 15],
  ];
  shots.push({
    name: "08-level",
    ...F3,
    ...camM,
    objects: [
      { t: "prism", ring, z0: 0, z1: z, color: 0x8a5a34 },
      ghost([28, 8], [36, 8], { base: z, h: 2.2, opacity: 0.5 }),
      ghost([36, 8], [36, 13], { base: z, h: 2.2, opacity: 0.35 }),
      {
        t: "slab",
        ring: [
          [26, 6],
          [38, 6],
          [38, 17],
          [26, 17],
        ],
        z,
        opacity: 0.08,
      },
    ],
    anchors: { lvl: [26, 6, z], wall: [32, 8, z + 2.2], under: [32, 15, 0.8] },
  });
}

// 09 — stairs between two slabs: the floor and the mezzanine
{
  const z = 1.75;
  const n = 10;
  const rise = z / n;
  const run = 0.28;
  const steps = [];
  // (up along x into the mezzanine's west edge, x 28, at y 11.5)
  const x0 = 28 - run * n;
  for (let i = 0; i < n; i++)
    steps.push({
      t: "box",
      at: [x0 + run * i + run / 2, 11.5, 0],
      w: run,
      h: rise * (i + 1),
      d: 1.1,
      color: A,
      opacity: 0.55,
    });
  const ring = [
    [28, 8],
    [36, 8],
    [36, 13],
    [32, 15],
    [28, 15],
  ];
  shots.push({
    name: "09-stairs",
    ...F3,
    eye: [21.5, 23.5, 9],
    look: [24, 12.5, 0.5],
    fov: 50,
    objects: [
      { t: "prism", ring, z0: 0, z1: z, color: 0x8a5a34 },
      ...steps,
      dot(x0, 11.5, { r: 0.13 }),
      dot(28, 11.5, { z, r: 0.13 }),
    ],
    anchors: { bottom: [x0, 11.5, 0], top: [28, 11.5, z], side: [26.6, 12.4, z] },
  });
}

// 10 — a thing put down anywhere, at any turn: a desk at 23°, its edge snapping to a wall's face
{
  const yaw = (-23 * Math.PI) / 180;
  shots.push({
    name: "10-thing",
    ...F3,
    ...cam2,
    objects: [
      built([14, 8], [24, 8]),
      built([24, 8], [24, 16]),
      { t: "box", at: [19.5, 11.5, 0], w: 1.6, h: 0.74, d: 0.8, yaw, color: G, opacity: 0.6, edge: G },
      { t: "arc", c: [19.5, 11.5], r: 1.35, a0: 0, a1: 2 * Math.PI, n: 48, h: 0.02, th: 0.04, opacity: 0.9 },
      guide([
        [17.5, 11.5, 0],
        [21.5, 11.5, 0],
      ]),
    ],
    anchors: { desk: [19.5, 11.5, 0.8], ring: [20.85, 11.5, 0], snap: [21.6, 9.6, 0] },
  });
}

// 11 — the same tool outdoors, in god mode: a cabin's walls drawn on the land by the woods
{
  const r = [
    [118, -38],
    [126, -38],
    [126, -32],
    [118, -32],
  ];
  const cur = [118, -35.5];
  shots.push({
    name: "11-god",
    level: 0,
    stand: { x: 80, y: 30 },
    hour: 13,
    eye: [114.5, -19.5, 14],
    look: [120.5, -35, 0.5],
    fov: 50,
    objects: [
      ghost(r[0], r[1], { base: "ground", opacity: 0.62 }),
      ghost(r[1], r[2], { base: "ground", opacity: 0.62 }),
      ghost(r[2], r[3], { base: "ground", opacity: 0.62 }),
      ghost(r[3], cur, { base: "ground", opacity: 0.4 }),
    ],
    anchors: { first: [...r[0], 0.3], cur: [...cur, 0.3], len: [118, -33.8, 3.6], area: [122, -35, 0.3] },
  });
}

// for the decisions' sheet: posts at the joints or not; three thicknesses; a pitched roof
{
  const camC = { eye: [41.5, 4.5, 4.6], look: [35.8, 10.6, 1.4], fov: 42 };
  const corner = [built([30, 10], [36, 10]), built([36, 10], [40, 14])];
  shots.push({ name: "13-post-off", ...F3, ...camC, objects: corner, anchors: {} });
  shots.push({
    name: "13-post-on",
    ...F3,
    ...camC,
    objects: [...corner, { t: "box", at: [36, 10, 0], w: 0.32, h: 3.35, d: 0.32, solid: true, color: 0xd9d1c2 }],
    anchors: {},
  });
  shots.push({
    name: "14-thick",
    ...F3,
    eye: [36.2, 18.5, 9.5],
    look: [36.2, 12, 2.2],
    fov: 48,
    objects: [
      built([30.5, 12], [34, 12], { th: 0.1 }),
      built([34.5, 12], [38, 12], { th: 0.2 }),
      built([38.5, 12], [42, 12], { th: 0.3 }),
    ],
    anchors: { a: [32.25, 12, 3.6], b: [36.25, 12, 3.6], c: [40.25, 12, 3.6] },
  });
  // the cabin built, its roof a gable drawn over it (2 m up to its ridge)
  const r = [
    [118, -38],
    [126, -38],
    [126, -32],
    [118, -32],
  ];
  const ang = Math.atan2(2, 3);
  const len = Math.hypot(3, 2) + 0.35;
  shots.push({
    name: "15-roof",
    level: 0,
    stand: { x: 80, y: 30 },
    hour: 13,
    eye: [113, -16, 15],
    look: [122, -35, 1.5],
    fov: 50,
    objects: [
      ...r.map((a, d) => built(a, r[(d + 1) % 4], { base: "ground", color: 0x9cb0a0 })),
      { t: "box", at: [122, -36.5, "ground"], up: 3.27 + 1 - 0.07, w: 8.8, h: 0.14, d: len, pitch: -ang, opacity: 0.6 },
      { t: "box", at: [122, -33.5, "ground"], up: 3.27 + 1 - 0.07, w: 8.8, h: 0.14, d: len, pitch: ang, opacity: 0.6 },
    ],
    anchors: { ridge: [122, -35, 6.5] },
  });
}

// the reel: a room drawn wall by wall on floor 3 — each wall growing to its corner, the last closing it,
// the room it closes round found
{
  const r = [
    [14, 8],
    [24, 8],
    [24, 16],
    [14, 16],
  ];
  const N = 12; // frames a wall
  let f = 0;
  const frame = (objects, anchors, extra = {}) =>
    shots.push({ name: `reel-${String(f++).padStart(2, "0")}`, ...F3, ...cam1, objects, anchors, ...extra });
  for (let w = 0; w < 4; w++) {
    const a = r[w];
    const b = r[(w + 1) % 4];
    for (let i = 1; i <= N; i++) {
      // (eased: quick off the corner, slowing to the next — and snapped to 0.5 m as the tool would)
      const k = 1 - (1 - i / N) ** 2;
      const p = [Math.round((a[0] + (b[0] - a[0]) * k) * 2) / 2, Math.round((a[1] + (b[1] - a[1]) * k) * 2) / 2];
      const len = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const done = [];
      for (let d = 0; d < w; d++) done.push(ghost(r[d], r[(d + 1) % 4], { opacity: 0.62 }));
      frame(
        [
          ...done,
          ...(len > 0.01 ? [ghost(a, p, { opacity: 0.4 })] : []),
          ...r.slice(0, w + 1).map(([x, y]) => dot(x, y, { r: 0.12 })),
          dot(...p, { r: 0.14, color: 0xffffff }),
        ],
        { cur: [...p, 0], len: mid(a, p, 3.3) },
        { reel: { wall: w, len: len.toFixed(2) } },
      );
    }
  }
  // closed: built, the room found
  for (let i = 0; i < 10; i++)
    frame(
      [...r.map((a, d) => built(a, r[(d + 1) % 4])), { t: "slab", ring: r, opacity: 0.12 + 0.02 * i, z: 0 }],
      { mid: [19, 12, 0], cur: [14, 8, 0] },
      { reel: { found: i } },
    );
}

console.log(JSON.stringify(shots, null, 1));
