import { openingCut } from "@yutopia/shared";
import { type Draw, type Mat, type Sketch, sh, type V3 } from "./kit";
import { K, M } from "./pal";
import { WALL_HALF_T } from "./walls";

// Windows set into a wall (shared openings.ts), drawn like the door: rot 0 =
// edges along x from the north edge of its tile (west edges: rot 3), the wall
// line at y = 0. The wall is cut to the window's hole (openingCut) and this is
// what fills it: walnut jambs and head through the wall, a cream sill proud of
// both faces, the glass in the middle with its glazing bars, a pale
// reflection. Everything sits in the wall line and sorts (and fades) like it.
//   window         — one tile, a cross of bars, the classic
//   window_wide    — two tiles: two casements on a centre mullion, a transom
//   window_tall    — a French window nearly to the floor: a panelled base, small panes
//   window_round   — a porthole: a brass ring with rivets
//   window_arched  — a round-topped sash, a moulded arch and a keystone
//   window_high    — a ribbon of panes up under the ceiling, two tiles
//   window_stained — leaded coloured glass under a pointed arch
//   window_blinds  — the classic with cream venetian blinds half down, a cord
//   window_studio  — a control room's double glazing, two tiles, a felt reveal
const T = WALL_HALF_T;
const SILL = T + 0.07; // the sill stands out of both faces
const GLASS: Mat = { c: "#a9c2d0", top: "#a9c2d0", left: "#a9c2d0", right: "#8ea7b5", flat: true };
const J = 0.06; // jamb width, tiles
const BAR = 0.028; // glazing bar, tiles
const PX = 39.19; // iso px a tile (heights against widths)
// one colour on every face: fills read as one shape (their steps' sides would show)
const FILL: Mat = { c: K.walnut, top: K.walnut, left: K.walnut, right: K.walnut, flat: true };

export function windowItem(s: Sketch, kind: string, n: number) {
  const [z0, z1] = openingCut(kind);
  if (kind === "window_round") return porthole(s, z0, z1);
  const head = 3;
  const studio = kind === "window_studio";
  const top = z1 - head;
  // the glass first (behind the bars), through the middle of the wall; the
  // studio's twice, apart (double glazing), stained glass coloured
  const stained = kind === "window_stained";
  for (const y of studio ? [-0.06, 0.05] : [-0.01])
    s.box(
      {
        x: J,
        y,
        w: n - 2 * J,
        d: studio ? 0.012 : 0.02,
        z: z0,
        h: top - z0,
        mat: GLASS,
        line: 0.5,
        op: stained ? 0.82 : 0.32,
        capped: true,
      },
      (d) => {
        const Y = y + (studio ? 0.012 : 0.02);
        if (stained) return leaded(d, Y, n, z0, top);
        for (let i = 0; i < n; i++) {
          d.poly("s", rect(i + 0.1, i + 0.36, top - 8, top - 1, Y), "#ffffff", { op: 0.35 });
          d.poly("s", rect(i + 0.1, i + 0.2, z0 + 6, top - 8, Y), "#ffffff", { op: 0.16 });
        }
      },
    );
  // jambs through the wall (up under the head); the head a board on each face,
  // flush with it (a top inside the wall would show through the wall above)
  const jm = studio ? M.walnutDark : M.walnut;
  const jw = studio ? 0.09 : J;
  // (capped: a top through the wall must not spill into the next slice in iso,
  // where it would show over the wall above the hole)
  s.box({ x: 0, y: -T, w: jw, d: 2 * T, z: z0, h: top - z0, mat: jm, line: 0.9, capped: true });
  s.box({ x: n - jw, y: -T, w: jw, d: 2 * T, z: z0, h: top - z0, mat: jm, line: 0.9, capped: true });
  // the sill, out of both faces
  if (kind !== "window_high" || s.round)
    // (its top a px over the hole's bottom: in 3D the wall's own top there is
    // built apart from the window, and the two in one plane would flicker)
    s.box({
      x: -0.02 + J / 2,
      y: -SILL,
      w: n + 0.04 - J,
      d: 2 * SILL,
      z: z0 - 2,
      h: 3,
      mat: M.cream,
      line: 0.9,
      bevel: false,
    });
  const bar = (x: number, w = BAR, to = top) =>
    s.box({ x: x - w / 2, y: -0.025, w, d: 0.05, z: z0, h: to - z0, mat: M.walnut, line: 0.6 });
  const rail = (z: number, h = 2) =>
    s.box({ x: J, y: -0.025, w: n - 2 * J, d: 0.05, z: z - h / 2, h, mat: M.walnut, line: 0.6 });
  const mid = (z0 + top) / 2;
  body();
  // the head last, so nothing in the hole draws its top over it (iso)
  for (const y of s.round ? [T - 0.012, -T] : [T - 0.012])
    s.box({ x: 0, y, w: n, d: 0.012, z: top, h: head, mat: jm, line: 0.9, capped: true });

  function body() {
    switch (kind) {
      case "window_wide":
        bar(1, 0.06); // the mullion between the casements
        bar(0.5);
        bar(1.5);
        rail(z0 + (z1 - z0) * 0.68);
        return;
      case "window_tall": {
        // a panelled walnut base, then small panes three high
        const base = z0 + 16;
        s.box({ x: J, y: -0.04, w: n - 2 * J, d: 0.08, z: z0, h: base - z0, mat: M.walnut, line: 0.8 }, (d) => {
          d.poly("s", rect(0.16, n - 0.16, z0 + 3, base - 3, 0.04), sh(K.walnut, 0.86), {
            stroke: sh(K.walnut, 1.25),
            sw: 0.6,
          });
        });
        bar(0.5);
        const step = (top - base) / 3;
        for (let i = 1; i < 3; i++) rail(base + step * i, 1.6);
        return;
      }
      case "window_high":
        for (const x of [0.5, 1, 1.5]) bar(x, x === 1 ? 0.05 : BAR);
        return;
      case "window_studio":
        // a felt reveal round the hole (sound), between the panes; a mullion
        // (the top one only in 3D: iso can't see it behind the head, and its
        // top would show over the wall above)
        for (const [a, b, c, e] of [[jw, n - jw, z0, z0 + 3], ...(s.round ? [[jw, n - jw, top - 3, top]] : [])])
          s.box({
            x: a,
            y: -T,
            w: b - a,
            d: 2 * T,
            z: c,
            h: e - c,
            mat: { c: K.rustDark, top: "#9a4636" },
            line: 0.6,
            capped: true,
          });
        s.box({
          x: 1 - 0.035,
          y: -T,
          w: 0.07,
          d: 2 * T,
          z: z0,
          h: top - z0,
          mat: M.walnutDark,
          line: 0.8,
          capped: true,
        });
        return;
      case "window_blinds":
        blinds(s, n, z0, top);
        bar(n / 2);
        rail(mid, 1.8);
        return;
      case "window_arched":
      case "window_stained": {
        // the round (stained: pointed) top: the hole's corners filled above the curve
        const half = 0.5 - J;
        const rise = half * PX * (stained ? 1.35 : 1);
        const spring = top - rise;
        const curve = (u: number): number => {
          const t = Math.min(1, Math.abs(u - 0.5) / half);
          // a round arch: an ellipse; a pointed one: two curves meeting in a point
          return spring + rise * (stained ? (1 - t) ** 0.55 : Math.sqrt(1 - t * t));
        };
        fillOutside(s, n, z0, top, (u) => [z0, curve(u)]);
        band(
          s,
          n,
          (a) => {
            const u = 0.5 - half * Math.cos(a);
            return [u, curve(u)];
          },
          spring,
        );
        if (!stained) {
          bar(0.5, BAR, top - 1);
          rail(spring, 1.8);
          rail(z0 + (spring - z0) / 2, 1.6);
        } else bar(0.5, 0.018, top - 1);
        return;
      }
      default:
        bar(n / 2);
        rail(mid, 1.8);
    }
  }
}

// a rectangle on the +y side of the glass (or of a panel `plane` out)
function rect(u0: number, u1: number, z0: number, z1: number, plane = 0.012): V3[] {
  return [
    [u0, plane, z1],
    [u1, plane, z1],
    [u1, plane, z0],
    [u0, plane, z0],
  ];
}

// The hole filled through the wall outside an opening shape: `inside(u)` gives
// the open stretch [lo, hi] at u. Fine columns, no outlines; in iso the upper
// fills stop short of the wall above by what their top rises across the wall
// (their top fills the gap and never shows over the wall).
function fillOutside(s: Sketch, n: number, z0: number, z1: number, inside: (u: number) => [number, number] | null) {
  const cols = 40 * n;
  const top = s.round ? z1 + 0.01 : z1 - 3;
  for (let i = 0; i < cols; i++) {
    const u0 = J + ((n - 2 * J) * i) / cols;
    const u1 = J + ((n - 2 * J) * (i + 1)) / cols;
    const open = inside((u0 + u1) / 2);
    // (outside the shape altogether: one fill, up to where the upper ones stop)
    const lo = open ? open[0] : top;
    const hi = open ? open[1] : top;
    const box = (a: number, b: number) =>
      s.box({ x: u0, y: -T, w: u1 - u0, d: 2 * T, z: a, h: b - a, mat: FILL, line: 0, capped: true });
    if (lo > z0 + 0.3) box(z0, lo);
    if (top - hi > 0.3) box(hi, top);
  }
}

// A moulded band along a curve on each face, `at(a)` for a from 0 to π (u, z),
// carried by a sliver of a box the whole width (iso draws a box's details only
// in the slices the box is in). `ring`: a closed one (2π), in brass.
// `cz`: the height of the shape's middle (the band goes out from it).
function band(s: Sketch, n: number, at: (a: number) => [number, number], cz: number, ring = false, w = 0.045) {
  const steps = ring ? 36 : 20;
  const span = ring ? Math.PI * 2 : Math.PI;
  s.box({ x: 0, y: -0.001, w: n, d: 0.002, z: 50, h: 0.02, mat: FILL, line: 0 }, (d) => {
    for (const side of s.round ? [1, -1] : [1]) {
      const f = side > 0 ? "s" : "n";
      const Y = side * (T + 0.006);
      for (let i = 0; i < steps; i++) {
        const a0 = (i / steps) * span;
        const a1 = ((i + 1) / steps) * span;
        const [u0, z0] = at(a0);
        const [u1, z1] = at(a1);
        // outward: away from the middle of the shape
        const out = (u: number, z: number): V3 => {
          const du = u - n / 2;
          const dz = (z - cz) / PX;
          const l = Math.hypot(du, dz) || 1;
          return [u + (du / l) * w, Y, z + (dz / l) * w * PX];
        };
        d.poly(f, [[u0, Y, z0], [u1, Y, z1], out(u1, z1), out(u0, z0)], ring ? K.brass : i % 2 ? "#6a4430" : "#6e4732");
        d.line(f, [u0, Y, z0], [u1, Y, z1], ring ? "#7a5a24" : sh(K.walnut, 1.35), 0.5);
        if (ring && i % 4 === 0) {
          const [ru, , rz] = out((u0 + u1) / 2, (z0 + z1) / 2);
          d.poly(
            f,
            [
              [(ru + u0) / 2 - 0.008, Y, (rz + z0) / 2 - 0.6],
              [(ru + u0) / 2 + 0.008, Y, (rz + z0) / 2 - 0.6],
              [(ru + u0) / 2 + 0.008, Y, (rz + z0) / 2 + 0.6],
              [(ru + u0) / 2 - 0.008, Y, (rz + z0) / 2 + 0.6],
            ],
            sh(K.brass, 0.7),
          );
        }
      }
    }
  });
}

// A porthole: the hole filled round a circle, glass behind, a riveted brass ring.
function porthole(s: Sketch, z0: number, z1: number) {
  const cz = (z0 + z1) / 2;
  const r = 0.37;
  const rz = r * PX;
  s.box(
    { x: J, y: -0.01, w: 1 - 2 * J, d: 0.02, z: z0, h: z1 - 3 - z0, mat: GLASS, line: 0, op: 0.32, capped: true },
    (d) => {
      d.poly("s", rect(0.3, 0.42, cz + 3, cz + 10, 0.02), "#ffffff", { op: 0.35 });
    },
  );
  fillOutside(s, 1, z0, z1, (u) => {
    const t = (u - 0.5) / r;
    if (Math.abs(t) >= 1) return null;
    const h = rz * Math.sqrt(1 - t * t);
    return [cz - h, cz + h];
  });
  band(s, 1, (a) => [0.5 + r * Math.cos(a), cz + rz * Math.sin(a)], cz, true, 0.05);
  // a head board on each face over the fill's top (iso: last, over anything below it)
  for (const y of s.round ? [T - 0.012, -T] : [T - 0.012])
    s.box({ x: 0, y, w: 1, d: 0.012, z: z1 - 3, h: 3, mat: M.walnut, line: 0.9, capped: true });
}

// Leaded lights: lozenges of amber, rust, olive, slate and cream in lead.
function leaded(d: Draw, Y: number, n: number, z0: number, z1: number) {
  const cols = ["#e8a33d", "#b5562f", "#6e7b3a", "#3d4a5c", "#efe4cc", "#c4402b"];
  const du = 0.11;
  const dz = du * PX * 1.4;
  let k = 0;
  for (let z = z0; z < z1; z += dz / 2)
    for (let u = J + (Math.round((z - z0) / (dz / 2)) % 2 ? du / 2 : 0); u < n - J; u += du) {
      const c = cols[(k++ * 7 + Math.floor(u * 13)) % cols.length];
      const q: V3[] = [
        [u, Y, z - dz / 2],
        [u + du / 2, Y, z],
        [u, Y, z + dz / 2],
        [u - du / 2, Y, z],
      ];
      d.poly("s", q, c, { stroke: "#2b2724", sw: 0.55 });
      d.poly(
        "n",
        q.map(([a, , e]) => [a, -Y, e] as V3),
        c,
        { stroke: "#2b2724", sw: 0.55 },
      );
    }
}

// Venetian blinds on the room side, half down: cream slats, a head rail, a cord.
function blinds(s: Sketch, n: number, z0: number, top: number) {
  const down = top - (top - z0) * 0.58;
  const y = T - 0.035;
  s.box({ x: J + 0.01, y, w: n - 2 * J - 0.02, d: 0.025, z: top - 4, h: 4, mat: M.cream, line: 0.7 });
  s.box(
    {
      x: J + 0.015,
      y,
      w: n - 2 * J - 0.03,
      d: 0.012,
      z: down,
      h: top - 4 - down,
      mat: { c: "#e9dcc0", top: "#f3e8d0", flat: true },
      line: 0.6,
    },
    (d) => {
      for (let z = down + 2.2; z < top - 4; z += 2.4)
        d.line("s", [J + 0.02, y + 0.012, z], [n - J - 0.02, y + 0.012, z], "#b9a77f", 0.5);
      d.line("s", [n - J - 0.07, y + 0.014, top - 4], [n - J - 0.07, y + 0.014, down - 9], "#8a7a5a", 0.5);
    },
  );
  s.box({ x: J + 0.01, y, w: n - 2 * J - 0.02, d: 0.025, z: down - 1.6, h: 1.6, mat: M.cream, line: 0.6 });
}
