import { TABLES } from "@yutopia/shared/tables";
import { fr, type Mat, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// The game tables (Fita 13). Both are drawn to the scale their game runs on
// (shared/tables.ts): the cloth and the blue top are exactly where the balls
// roll and bounce, so what you see is what the physics plays on. The balls,
// the cues, the rackets and the lamp over the pool table are drawn live
// (world/pool.ts, world/pong.ts) — they move, and the lamp goes see-through
// while you play.

// ── the pool table ────────────────────────────────────────────────────────────
// A 7-ft home table: turned walnut legs under a carved apron, rails with
// mother-of-pearl sights, cloth-covered cushions, six leather drop pockets
// with brass corner plates, the felt with its spots, a ball-return tray at the
// foot end and a cube of chalk on the rail.
const POOL = TABLES.pool_table;
const PT = POOL.top; // the cloth
const PCX = POOL.w / 2;
const PCY = POOL.h / 2;
const HL = (POOL.len / 2) * POOL.tpm; // cloth half-length, tiles
const HWD = (POOL.wid / 2) * POOL.tpm;
const CUSH = 0.05 * POOL.tpm; // cushion rubber, cloth edge → rail
const RAIL = 0.1 * POOL.tpm; // wood beyond it
const RAIL_TOP = PT + 2.6;
const CUSH_TOP = PT + 1.9;

// the cloths: green, blue, wine — with their wood
const POOL_LOOKS: { cloth: string; wood: Mat; woodDark: Mat }[] = [
  { cloth: "#2f6a4c", wood: M.walnut, woodDark: M.walnutDark },
  { cloth: "#2c587a", wood: { c: "#3a2a20", top: "#4d3829" }, woodDark: { c: "#2a1d15", top: "#382619" } },
  { cloth: "#7b2f3b", wood: M.teak, woodDark: { c: "#6a4128", top: "#7d4e30" } },
];

export function poolTable(s: Sketch) {
  const look = POOL_LOOKS[Math.min(POOL_LOOKS.length - 1, Math.floor(s.seed * POOL_LOOKS.length))];
  const cloth = look.cloth;
  const x0 = PCX - HL;
  const x1 = PCX + HL;
  const y0 = PCY - HWD;
  const y1 = PCY + HWD;
  const ox0 = x0 - CUSH - RAIL;
  const ox1 = x1 + CUSH + RAIL;
  const oy0 = y0 - CUSH - RAIL;
  const oy1 = y1 + CUSH + RAIL;

  s.shadow(ox0 + 0.1, oy0 + 0.1, ox1 - ox0 - 0.2, oy1 - oy0 - 0.2, 0.42, 0.3);

  // turned legs: foot, bun, a long baluster, a block under the apron
  for (const [x, y] of [
    [ox0 + 0.26, oy0 + 0.22],
    [ox1 - 0.26, oy0 + 0.22],
    [ox0 + 0.26, oy1 - 0.22],
    [ox1 - 0.26, oy1 - 0.22],
  ]) {
    s.cyl({ x, y, z: 0, r: 0.07, r2: 0.06, h: 2.2, mat: look.woodDark, line: 0.6 });
    s.cyl({ x, y, z: 2.2, r: 0.1, r2: 0.09, h: 3, mat: look.wood, line: 0.6 });
    s.cyl({ x, y, z: 5.2, r: 0.065, r2: 0.085, h: 6.5, mat: look.woodDark, line: 0.6 });
    s.cyl({ x, y, z: 11.7, r: 0.095, h: 1.4, mat: M.brass, line: 0.5 });
    s.box({ x: x - 0.1, y: y - 0.1, w: 0.2, d: 0.2, z: 13.1, h: 2.4, mat: look.wood, line: 0.6 });
  }

  // the apron: a deep walnut skirt with raised panels and brass corner plates
  const ax0 = ox0 + 0.06;
  const ax1 = ox1 - 0.06;
  const ay0 = oy0 + 0.05;
  const ay1 = oy1 - 0.05;
  s.box({ x: ax0, y: ay0, w: ax1 - ax0, d: ay1 - ay0, z: 15.5, h: PT - 15.5 - 0.4, mat: look.wood }, (d) => {
    const lo = 16.6;
    const hi = PT - 2.2;
    // long sides: two panels either side of the middle
    for (const [u0, u1] of [
      [ax0 + 0.18, PCX - 0.12],
      [PCX + 0.12, ax1 - 0.18],
    ]) {
      d.poly("s", fr("s", ay1, u0, u1, lo, hi), sh(look.wood.c, 1.12), { stroke: sh(look.wood.c, 0.7), sw: 0.45 });
      d.line("s", [u0 + 0.03, ay1, hi - 0.6], [u1 - 0.03, ay1, hi - 0.6], sh(look.wood.c, 1.4), 0.4, 0.6);
    }
    // the end: one panel, the return tray's mouth under it
    d.poly("e", fr("e", ax1, ay0 + 0.16, ay1 - 0.16, lo + 2.6, hi), sh(look.wood.c, 0.95), {
      stroke: sh(look.wood.c, 0.6),
      sw: 0.45,
    });
    // brass corner plates
    for (const u of [ax0 + 0.02, ax1 - 0.1]) d.poly("s", fr("s", ay1, u, u + 0.08, hi - 1.6, hi + 0.6), K.brass);
    for (const u of [ay0 + 0.02, ay1 - 0.1]) d.poly("e", fr("e", ax1, u, u + 0.08, hi - 1.6, hi + 0.6), K.brass);
  });

  // the ball-return tray at the foot end (the potted balls roll down to it)
  s.box({ x: ax1 - 0.02, y: PCY - 0.38, w: 0.16, d: 0.76, z: 16, h: 3.4, mat: look.woodDark, line: 0.7 }, (d) => {
    d.poly("t", tr(19.42, ax1 + 0.005, PCY - 0.34, ax1 + 0.12, PCY + 0.34), "#1a1310");
    d.poly("e", fr("e", ax1 + 0.14, PCY - 0.3, PCY + 0.3, 16.8, 18.6), sh(look.woodDark.c, 1.2));
  });

  // the bed under the cloth (slate, edge hidden by the rails)
  s.box({
    x: ox0 + 0.02,
    y: oy0 + 0.02,
    w: ox1 - ox0 - 0.04,
    d: oy1 - oy0 - 0.04,
    z: PT - 0.4,
    h: 0.4,
    mat: look.wood,
  });

  // the cloth: one gradient over it all (the lamp's pool of light is the room
  // light's), a faint nap, the spots and the head string
  s.box(
    {
      x: x0 - CUSH,
      y: y0 - CUSH,
      w: x1 - x0 + 2 * CUSH,
      d: y1 - y0 + 2 * CUSH,
      z: PT - 0.6,
      h: 0.6,
      mat: { c: sh(cloth, 0.8), top: cloth, flat: true },
      line: 0,
    },
    (d) => {
      const felt = s.gradAt(sh(cloth, 1.14), sh(cloth, 0.86), d.m(x0, y0, PT), d.m(x1, y1, PT));
      d.poly("t", tr(PT + 0.005, x0 - CUSH, y0 - CUSH, x1 + CUSH, y1 + CUSH), felt);
      // the nap: long faint streaks down the table (the cloth is brushed head to foot)
      for (let i = 0; i < 26; i++) {
        const y = y0 + 0.03 + rnd(i, 2, 0.53) * (y1 - y0 - 0.06);
        const a = x0 + rnd(i, 1, 0.53) * (x1 - x0) * 0.5;
        const b = Math.min(x1, a + 0.6 + rnd(i, 3, 0.53) * 1.4);
        d.poly("t", tr(PT + 0.01, a, y - 0.012, b, y + 0.012), i % 2 ? sh(cloth, 0.86) : sh(cloth, 1.16), { op: 0.12 });
      }
      const hs = PCX - HL / 2; // head string (the kitchen's edge), quarter of the way
      d.line("t", [hs, y0 + 0.02, PT + 0.02], [hs, y1 - 0.02, PT + 0.02], "#f4ecd8", 0.35, 0.22);
      for (const x of [hs, PCX + HL / 2, PCX])
        d.poly("t", te(PT + 0.03, x, PCY, 0.018, 10), "#f4ecd8", { op: x === PCX ? 0.35 : 0.85 });
    },
  );

  // the pockets: dark holes at the corners and halfway along, a leather cup
  // hanging under each, brass round the rail
  // (to the physics' pockets, shared/pool.ts: holes 18 / 45 mm past the cloth,
  // the jaws' noses 82 mm from a corner and 66 mm either side of a side pocket)
  const PC = 0.018 * POOL.tpm; // a corner hole's centre, out past the cloth's corner
  const PS = 0.045 * POOL.tpm; // a side hole's centre, out past the cloth's edge
  const POCKETS: { x: number; y: number; r: number; side: boolean }[] = [
    { x: x0 - PC, y: y0 - PC, r: 0.105, side: false },
    { x: PCX, y: y0 - PS, r: 0.098, side: true },
    { x: x1 + PC, y: y0 - PC, r: 0.105, side: false },
    { x: x0 - PC, y: y1 + PC, r: 0.105, side: false },
    { x: PCX, y: y1 + PS, r: 0.098, side: true },
    { x: x1 + PC, y: y1 + PC, r: 0.105, side: false },
  ];
  for (const p of POCKETS) {
    // the cup: leather, a little fringe, hanging out under the rail
    const cx = p.x + (p.x < PCX - 0.5 ? -0.03 : p.x > PCX + 0.5 ? 0.03 : 0);
    const cy = p.y + (p.y < PCY ? -0.04 : 0.04);
    s.cyl({ x: cx, y: cy, z: PT - 9, r: 0.05, r2: p.r, h: 7.4, mat: { c: "#4a2c1c", top: "#2a1a12" }, line: 0.6 });
  }

  // cushions: cloth over rubber, one a little darker than the bed, with gaps at
  // the pockets (corner mouths a little narrower than the sides)
  const cm = { c: sh(cloth, 0.78), top: sh(cloth, 1.06), flat: false } as Mat;
  const CG = 0.082 * POOL.tpm; // corner pocket: the cushion stops at the jaw's nose
  const SG = 0.066 * POOL.tpm; // side pocket half-mouth
  const cushions: [number, number, number, number][] = [
    [x0 + CG, y0 - CUSH, PCX - SG - (x0 + CG), CUSH], // far long rail, left half
    [PCX + SG, y0 - CUSH, x1 - CG - (PCX + SG), CUSH],
    [x0 + CG, y1, PCX - SG - (x0 + CG), CUSH], // near long rail
    [PCX + SG, y1, x1 - CG - (PCX + SG), CUSH],
    [x0 - CUSH, y0 + CG, CUSH, y1 - y0 - 2 * CG], // head end
    [x1, y0 + CG, CUSH, y1 - y0 - 2 * CG], // foot end
  ];
  for (const [x, y, w, dd] of cushions)
    s.box({ x, y, w, d: dd, z: PT, h: CUSH_TOP - PT, mat: cm, line: 0.5, bevel: false });

  // the rails: walnut, split at the pockets, sights inlaid along the top
  const pearl = "#f3ead8";
  const railBox = (x: number, y: number, w: number, dd: number) =>
    s.box(
      { x, y, w, d: dd, z: PT - 0.6, h: RAIL_TOP - PT + 0.6, mat: { ...look.wood, gloss: 0.7 }, line: 0.8 },
      (d) => {
        // a fine bead line round the inner edge
        const inX = x + (x < PCX - 1 ? w - 0.025 : 0.025);
        if (dd > w)
          d.line("t", [inX, y + 0.02, RAIL_TOP], [inX, y + dd - 0.02, RAIL_TOP], sh(look.wood.c, 1.5), 0.35, 0.5);
        else {
          const inY = y + (y < PCY ? dd - 0.025 : 0.025);
          d.line("t", [x + 0.02, inY, RAIL_TOP], [x + w - 0.02, inY, RAIL_TOP], sh(look.wood.c, 1.5), 0.35, 0.5);
        }
      },
    );
  const RW = CUSH + RAIL;
  const RG = 0.12; // half the side pocket block (the hole is bitten out of it)
  // (behind the cushions: the rails start where the cushions' backs are)
  railBox(x0 - 0.02, oy0, PCX - RG - (x0 - 0.02), RAIL); // far, left of the side pocket
  railBox(PCX + RG, oy0, x1 + 0.02 - (PCX + RG), RAIL);
  railBox(x0 - 0.02, oy1 - RAIL, PCX - RG - (x0 - 0.02), RAIL); // near
  railBox(PCX + RG, oy1 - RAIL, x1 + 0.02 - (PCX + RG), RAIL);
  railBox(ox0, y0 - 0.02, RAIL, y1 - y0 + 0.04); // head end
  railBox(ox1 - RAIL, y0 - 0.02, RAIL, y1 - y0 + 0.04); // foot end
  // the blocks round the pockets: brass-capped, bitten round the hole, the
  // throat dark inside; the hole itself at the cloth, under them
  for (const p of POCKETS) {
    const bx = p.side ? PCX - RG : p.x < PCX ? ox0 : x1 + 0.02;
    const by = p.side ? (p.y < PCY ? oy0 : y1) : p.y < PCY ? oy0 : y1 + 0.02;
    const bw = p.side ? 2 * RG : p.x < PCX ? x0 - 0.02 - ox0 : ox1 - (x1 + 0.02);
    const bd = p.side ? RW : p.y < PCY ? y0 - 0.02 - oy0 : oy1 - (y1 + 0.02);
    s.shape({ x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, d: 2 * p.r, z: PT, h: 0.06 }, (d) => {
      // a hole, not a black disc: the far wall inside it lit (leather), going
      // down into the dark towards the near rim, which catches a little light
      const k = p.r * Math.SQRT1_2;
      const inside = s.gradAt("#5a3825", "#070505", d.m(p.x - k, p.y - k, PT), d.m(p.x + k * 0.2, p.y + k * 0.2, PT));
      d.poly("t", te(PT + 0.03, p.x, p.y, p.r, 24), inside, { stroke: "#1a110c", sw: 0.4 });
      d.poly("t", te(PT + 0.035, p.x + k * 0.18, p.y + k * 0.18, p.r * 0.78, 20), "#070505", { op: 0.55 });
    });
    pocketBlock(s, bx, by, bw, bd, p, PT, RAIL_TOP);
  }
  // sights: mother-of-pearl diamonds, three a side between pockets, three on each end
  const diamond = (x: number, y: number) =>
    s.shape({ x: x - 0.03, y: y - 0.03, w: 0.06, d: 0.06, z: RAIL_TOP, h: 0.2 }, (d) => {
      d.poly(
        "t",
        [
          [x - 0.026, y, RAIL_TOP + 0.04],
          [x, y - 0.016, RAIL_TOP + 0.04],
          [x + 0.026, y, RAIL_TOP + 0.04],
          [x, y + 0.016, RAIL_TOP + 0.04],
        ],
        pearl,
      );
    });
  const L = x1 - x0;
  const W = y1 - y0;
  for (const k of [1, 2, 3, 5, 6, 7]) {
    diamond(x0 + (k * L) / 8, oy0 + RAIL / 2);
    diamond(x0 + (k * L) / 8, oy1 - RAIL / 2);
  }
  for (const k of [1, 2, 3]) {
    const y = y0 + (k * W) / 4;
    s.shape({ x: ox0, y: y - 0.03, w: RAIL, d: 0.06, z: RAIL_TOP, h: 0.2 }, (d) =>
      d.poly(
        "t",
        [
          [ox0 + RAIL / 2, y - 0.026, RAIL_TOP + 0.04],
          [ox0 + RAIL / 2 + 0.016, y, RAIL_TOP + 0.04],
          [ox0 + RAIL / 2, y + 0.026, RAIL_TOP + 0.04],
          [ox0 + RAIL / 2 - 0.016, y, RAIL_TOP + 0.04],
        ],
        pearl,
      ),
    );
    s.shape({ x: ox1 - RAIL, y: y - 0.03, w: RAIL, d: 0.06, z: RAIL_TOP, h: 0.2 }, (d) =>
      d.poly(
        "t",
        [
          [ox1 - RAIL / 2, y - 0.026, RAIL_TOP + 0.04],
          [ox1 - RAIL / 2 + 0.016, y, RAIL_TOP + 0.04],
          [ox1 - RAIL / 2, y + 0.026, RAIL_TOP + 0.04],
          [ox1 - RAIL / 2 - 0.016, y, RAIL_TOP + 0.04],
        ],
        pearl,
      ),
    );
  }

  // a cube of chalk on the near rail by the foot (the story detail: a worn top)
  const chx = x1 - 0.42;
  const chy = oy1 - RAIL / 2 - 0.03;
  s.box(
    { x: chx, y: chy, w: 0.06, d: 0.06, z: RAIL_TOP, h: 1.8, mat: { c: "#3d6fa8", top: "#5a8bc4" }, line: 0.5 },
    (d) => d.poly("t", te(RAIL_TOP + 1.82, chx + 0.03, chy + 0.03, 0.018, 8), "#2a4f7d"),
  );
}

// A block of rail round a pocket: its brass cap at the rail's height with the
// hole bitten out of it, its sides down to the cloth (each side minus the
// bite), and the throat — the dark wall of the hole between the cloth and the
// cap. (Boxes can't have holes; this draws one.)
function pocketBlock(
  s: Sketch,
  bx: number,
  by: number,
  bw: number,
  bd: number,
  p: { x: number; y: number; r: number },
  z0: number,
  z1: number,
) {
  const inside = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) < p.r;
  // the cap's outline: the rectangle's edge, pushed out onto the circle where it's inside it
  const ring: [number, number][] = [
    [bx, by],
    [bx + bw, by],
    [bx + bw, by + bd],
    [bx, by + bd],
  ];
  // walk the rectangle's edge; the run of it inside the circle is replaced by
  // the arc that goes round through the block (the hole's rim)
  const edge: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = ring[i];
    const [qx, qy] = ring[(i + 1) % 4];
    const n = Math.max(2, Math.ceil(Math.hypot(qx - ax, qy - ay) / 0.004));
    for (let k = 0; k < n; k++) edge.push([ax + ((qx - ax) * k) / n, ay + ((qy - ay) * k) / n]);
  }
  const k0 = edge.findIndex(([x, y]) => !inside(x, y));
  const walk = [...edge.slice(k0), ...edge.slice(0, k0)];
  const inRect = (x: number, y: number) => x > bx && x < bx + bw && y > by && y < by + bd;
  const cap: [number, number, number][] = [];
  let i = 0;
  while (i < walk.length) {
    const [x, y] = walk[i];
    if (!inside(x, y)) {
      cap.push([x, y, z1]);
      i++;
      continue;
    }
    let j = i;
    while (j < walk.length && inside(walk[j][0], walk[j][1])) j++;
    const a0 = Math.atan2(walk[i][1] - p.y, walk[i][0] - p.x);
    const [ex, ey] = walk[j % walk.length];
    const a1 = Math.atan2(ey - p.y, ex - p.x);
    // the two ways round from a0 to a1: take the one through the block
    let ccw = a1 - a0;
    while (ccw <= 0) ccw += Math.PI * 2;
    const mid = a0 + ccw / 2;
    const span = inRect(p.x + Math.cos(mid) * p.r, p.y + Math.sin(mid) * p.r) ? ccw : ccw - Math.PI * 2;
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const a = a0 + (span * k) / n;
      cap.push([p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r, z1]);
    }
    i = j;
  }
  const brass = M.brass;
  s.shape({ x: bx, y: by, w: bw, d: bd, z: z0 + 0.7, h: z1 - z0 - 0.7 }, (d) => {
    // the throat: the hole's wall, where the circle runs through the block
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const P0: [number, number] = [p.x + Math.cos(a0) * p.r, p.y + Math.sin(a0) * p.r];
      const P1: [number, number] = [p.x + Math.cos(a1) * p.r, p.y + Math.sin(a1) * p.r];
      const mid: [number, number] = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2];
      if (mid[0] < bx || mid[0] > bx + bw || mid[1] < by || mid[1] > by + bd) continue;
      // the wall faces the hole's centre
      const am = (a0 + a1) / 2;
      const nx = -Math.cos(am);
      const ny = -Math.sin(am);
      const f = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? "e" : "w") : ny > 0 ? "s" : "n";
      d.poly(
        f,
        [
          [P0[0], P0[1], z1],
          [P1[0], P1[1], z1],
          [P1[0], P1[1], z0],
          [P0[0], P0[1], z0],
        ],
        "#1d1511",
        { stroke: "#1d1511", sw: 0.3 },
      );
    }
    // the four sides, each minus the bite
    const side = (f: "n" | "e" | "s" | "w") => {
      const alongX = f === "n" || f === "s";
      const plane = f === "n" ? by : f === "s" ? by + bd : f === "w" ? bx : bx + bw;
      const u0 = alongX ? bx : by;
      const u1 = alongX ? bx + bw : by + bd;
      const off = plane - (alongX ? p.y : p.x);
      const c0 = alongX ? p.x : p.y;
      const spans: [number, number][] = [];
      if (Math.abs(off) < p.r) {
        const h = Math.sqrt(p.r * p.r - off * off);
        if (c0 - h > u0) spans.push([u0, Math.min(u1, c0 - h)]);
        if (c0 + h < u1) spans.push([Math.max(u0, c0 + h), u1]);
      } else spans.push([u0, u1]);
      for (const [a, b] of spans) d.poly(f, fr(f, plane, a, b, z0, z1), f === "s" || f === "n" ? "#b48a3e" : "#9a7432");
    };
    for (const f of ["n", "e", "s", "w"] as const) side(f);
    const top = s.gradAt(sh(brass.c, 1.25), sh(brass.c, 0.9), d.m(bx, by, z1), d.m(bx + bw, by + bd, z1));
    d.poly("t", cap, top, { stroke: "#2a1a12", sw: 0.5 });
  });
}

// ── the ping-pong table ──────────────────────────────────────────────────────
// A folding club table: the top in two halves (blue, green or the outdoor
// grey) with its white lines, a steel apron, two leg frames on casters and
// the centre supports, the net on its clamp posts.
const PP = TABLES.pingpong_table;
const TT = PP.top;
const TCX = PP.w / 2;
const TCY = PP.h / 2;
const THL = (PP.len / 2) * PP.tpm;
const THW = (PP.wid / 2) * PP.tpm;
const NET_H = 0.1525 * PP.tpm * 45.25 * Math.cos(Math.PI / 6); // true scale over the top
const NET_OUT = 0.1525 * PP.tpm; // the net runs past the sides

const PONG_LOOKS = ["#1f4f86", "#2b6a4a", "#56616c"];

export function pingpongTable(s: Sketch) {
  const top = PONG_LOOKS[Math.min(PONG_LOOKS.length - 1, Math.floor(s.seed * PONG_LOOKS.length))];
  const x0 = TCX - THL;
  const x1 = TCX + THL;
  const y0 = TCY - THW;
  const y1 = TCY + THW;
  const steel: Mat = { c: "#3a3b3d", top: "#55575a", gloss: 0.5 };

  s.shadow(x0 + 0.1, y0 + 0.1, x1 - x0 - 0.2, y1 - y0 - 0.2, 0.3, 0.3);

  // the legs: a frame under each end on two casters, and the centre supports
  const legs: [number, number][] = [
    [x0 + 0.34, y0 + 0.22],
    [x0 + 0.34, y1 - 0.22],
    [x1 - 0.34, y0 + 0.22],
    [x1 - 0.34, y1 - 0.22],
    [TCX - 0.28, y0 + 0.36],
    [TCX - 0.28, y1 - 0.36],
    [TCX + 0.28, y0 + 0.36],
    [TCX + 0.28, y1 - 0.36],
  ];
  for (const [x, y] of legs) {
    // a little caster: the wheel in its fork, then the square steel leg
    s.cyl({ x, y, z: 0, r: 0.032, h: 1.1, mat: { c: "#1c1a17", top: "#2b2a26" }, line: 0.4 });
    s.box({
      x: x - 0.03,
      y: y - 0.03,
      w: 0.06,
      d: 0.06,
      z: 1.1,
      h: 0.8,
      mat: { c: "#8d877a", top: "#b9b2a3" },
      line: 0.4,
    });
    s.box({ x: x - 0.026, y: y - 0.026, w: 0.052, d: 0.052, z: 1.9, h: TT - 4.9, mat: steel, line: 0.55 });
  }
  // crossbars low between each end's legs, and along the middle
  for (const x of [x0 + 0.34, x1 - 0.34])
    s.box({ x: x - 0.025, y: y0 + 0.22, w: 0.05, d: y1 - y0 - 0.44, z: 5.5, h: 1.2, mat: steel, line: 0.5 });
  s.box({ x: x0 + 0.34, y: TCY - 0.025, w: x1 - x0 - 0.68, d: 0.05, z: 5.5, h: 1.2, mat: steel, line: 0.5 });

  // the apron under the top (each half's frame)
  for (const [a, b] of [
    [x0 + 0.08, TCX - 0.02],
    [TCX + 0.02, x1 - 0.08],
  ])
    s.box({ x: a, y: y0 + 0.08, w: b - a, d: y1 - y0 - 0.16, z: TT - 3.2, h: 1.6, mat: steel, line: 0.6 });

  // the top: two halves meeting under the net, the lines on it
  for (const [a, b] of [
    [x0, TCX - 0.004],
    [TCX + 0.004, x1],
  ])
    s.box(
      { x: a, y: y0, w: b - a, d: y1 - y0, z: TT - 1.6, h: 1.6, mat: { c: sh(top, 0.85), top, gloss: 0.3 }, line: 0.8 },
      (d) => {
        const paint = s.gradAt(sh(top, 1.12), sh(top, 0.9), d.m(x0, y0, TT), d.m(x1, y1, TT));
        d.poly("t", tr(TT + 0.005, a, y0, b, y1), paint);
        const L = 0.02 * PP.tpm; // the white edge lines: 2 cm
        const white = "#f6f2ea";
        d.poly("t", tr(TT + 0.02, a, y0, b, y0 + L), white);
        d.poly("t", tr(TT + 0.02, a, y1 - L, b, y1), white);
        if (a === x0) d.poly("t", tr(TT + 0.02, x0, y0, x0 + L, y1), white);
        else d.poly("t", tr(TT + 0.02, x1 - L, y0, x1, y1), white);
        // the centre line (doubles), 3 mm
        d.poly("t", tr(TT + 0.02, a, TCY - 0.0025, b, TCY + 0.0025), white, { op: 0.9 });
        // the side edges painted white too
        d.poly("s", fr("s", y1, a, b, TT - 1.6, TT), sh(white, 0.92));
        d.poly("e", fr("e", b, y0, y1, TT - 1.6, TT), sh(white, 0.8));
      },
    );

  // the net: clamp posts outside the sides, the mesh, a white tape on top
  for (const y of [y0 - NET_OUT, y1 + NET_OUT]) {
    s.box({
      x: TCX - 0.03,
      y: y - 0.02,
      w: 0.06,
      d: 0.04,
      z: TT,
      h: NET_H + 0.6,
      mat: { c: "#2b2a26", top: "#3a3834" },
      line: 0.5,
    });
    s.box({
      x: TCX - 0.045,
      y: y + (y < TCY ? 0 : -0.06),
      w: 0.09,
      d: 0.08,
      z: TT - 2.6,
      h: 2.8,
      mat: { c: "#2b2a26" },
      line: 0.5,
    });
  }
  s.box(
    {
      x: TCX - 0.006,
      y: y0 - NET_OUT + 0.02,
      w: 0.012,
      d: y1 - y0 + 2 * NET_OUT - 0.04,
      z: TT + 0.25,
      h: NET_H - 0.5,
      mat: { c: "#1a2230", flat: true },
      line: 0.4,
      op: 0.62,
      bevel: false,
    },
    (d) => {
      // the mesh: a fine grid on the faces you see
      const ya = y0 - NET_OUT + 0.02;
      const yb = y1 + NET_OUT - 0.02;
      for (let y = ya + 0.04; y < yb; y += 0.04)
        for (const f of ["e", "w"] as const)
          d.line(
            f,
            [TCX + (f === "e" ? 0.006 : -0.006), y, TT + 0.3],
            [TCX + (f === "e" ? 0.006 : -0.006), y, TT + NET_H - 0.3],
            "#0c0f15",
            0.25,
            0.5,
          );
      for (let z = TT + 1.4; z < TT + NET_H - 0.4; z += 1.2)
        for (const f of ["e", "w"] as const)
          d.line(
            f,
            [TCX + (f === "e" ? 0.006 : -0.006), ya, z],
            [TCX + (f === "e" ? 0.006 : -0.006), yb, z],
            "#0c0f15",
            0.25,
            0.5,
          );
    },
  );
  s.box({
    x: TCX - 0.008,
    y: y0 - NET_OUT + 0.02,
    w: 0.016,
    d: y1 - y0 + 2 * NET_OUT - 0.04,
    z: TT + NET_H - 0.6,
    h: 0.9,
    mat: { c: "#f4f0e6", top: "#ffffff" },
    line: 0.4,
    bevel: false,
  });
}
