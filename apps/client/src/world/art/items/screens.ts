import { GLASS } from "@yutopia/shared/media";
import { type Draw, fe, fr, INK, type Sketch, sh, te } from "./kit";
import { K, M } from "./pal";

// More screens (docs/plan/10-media.md): a CRT on a wall bracket, the big HD
// panel, a pull-down projector screen and its film projector, a wooden console
// TV and a portable one for desks. The art draws the set round dark glass;
// what plays (the picture, its glow, the projector's beam) is drawn live by
// world/media. Glass positions come from shared GLASS, so the picture lands
// exactly on it. Wall items: local y is measured from the wall's face.

type Props = Record<string, unknown>;
const WALL = 0.1; // WALL_FACE: GLASS y on walls is world-local, the sketch is wall-local

// dark glass with a soft reflection (the picture covers it while something plays)
function glass(d: Draw, y: number, x0: number, x1: number, z0: number, z1: number, tint = "#16191a") {
  d.poly("s", fr("s", y, x0, x1, z0, z1), tint, { stroke: "#0d0b0a", sw: 0.5 });
  const w = x1 - x0;
  d.poly(
    "s",
    [
      [x0 + w * 0.06, y + 0.001, z1 - 1.5],
      [x0 + w * 0.32, y + 0.001, z1 - 1.5],
      [x0 + w * 0.1, y + 0.001, z1 - (z1 - z0) * 0.45],
    ],
    "#ffffff",
    { op: 0.08 },
  );
}

// ── CRT on a wall bracket (1 tile): a waiting-room / bar set on a black arm ──
export function tvWall(s: Sketch) {
  const cream = Math.floor(s.seed * 2) === 1;
  const g = GLASS.tv_wall;
  const front = g.y - WALL; // the set's front face, wall-local
  // the bracket: a plate on the wall, an arm out under the set
  s.box({ x: 0.42, y: -0.04, w: 0.16, d: 0.06, z: 44, h: 12, mat: M.graphite, line: 0.8 });
  s.box({ x: 0.46, y: 0.0, w: 0.08, d: 0.2, z: 47, h: 3, mat: M.graphite, line: 0.7 });
  const cab = cream ? { c: K.putty, top: "#e4d9bb" } : { c: "#2b2a28", top: "#3a3834" };
  s.box({ x: 0.16, y: 0.02, w: 0.7, d: front - 0.02, z: 50, h: 28, mat: cab, puff: 0.8 }, (d) => {
    const bez = cream ? K.puttyDark : "#1c1b19";
    d.poly("s", fr("s", front, g.x0 - 0.04, g.x1 + 0.04, g.z0 - 2, g.z1 + 2), bez);
    glass(d, front + 0.001, g.x0, g.x1, g.z0, g.z1);
    // the knob strip on the right: two knobs and a red power light
    for (const z of [70, 64]) {
      d.poly("s", fe("s", front + 0.002, 0.78, z, 0.035, 1.8, 14), K.aluminium, { stroke: INK, sw: 0.4 });
    }
    d.poly("s", fe("s", front + 0.002, 0.78, 58, 0.012, 0.7, 10), K.red, { glow: true });
    for (let i = 0; i < 4; i++)
      d.line("s", [0.74, front + 0.002, 55.5 - i * 1.2], [0.82, front + 0.002, 55.5 - i * 1.2], "#0d0b0a", 0.4);
  });
  // the cable down the wall
  s.shape({ x: 0.6, y: -0.02, w: 0.04, d: 0.02, z: 6, h: 44 }, (d) => {
    d.line("s", [0.62, -0.01, 50], [0.62, -0.01, 6], "#15120f", 1, 0.8);
  });
}

// ── big HD TV (3 tiles): a slim black panel, a soundbar under it ─────────────
export function tvHd(s: Sketch) {
  const g = GLASS.tv_hd;
  const front = g.y - WALL;
  s.shape({ x: 0.1, y: -0.06, w: 2.8, d: 0.02, z: g.z0 - 5, h: g.z1 - g.z0 + 10 }, (d) => {
    d.poly("s", fr("s", -0.05, 0.18, 2.94, g.z0 - 7, g.z1 + 2), "#1a120c", { op: 0.2 });
  });
  s.box(
    {
      x: 0.12,
      y: -0.03,
      w: 2.76,
      d: front + 0.03,
      z: g.z0 - 3,
      h: g.z1 - g.z0 + 6,
      mat: { c: "#1b1a18", top: "#2a2825" },
      line: 1,
    },
    (d) => {
      glass(d, front + 0.001, g.x0, g.x1, g.z0, g.z1, "#121416");
      // a tiny white standby light under the glass
      d.poly("s", fe("s", front + 0.002, 1.5, g.z0 - 1.6, 0.012, 0.5, 10), "#f2efe6", { glow: true, op: 0.8 });
    },
  );
  s.box({ x: 0.9, y: 0.0, w: 1.2, d: 0.08, z: g.z0 - 11, h: 4.5, mat: M.graphite, puff: 0.6 }, (d) => {
    for (let i = 0; i < 20; i++) d.poly("s", fe("s", 0.081, 0.96 + i * 0.056, g.z0 - 8.8, 0.012, 0.6, 6), "#45413a");
  });
}

// ── pull-down projector screen (3 tiles): a roller case, the matte cloth ─────
export function projectorScreen(s: Sketch) {
  const g = GLASS.projector_screen;
  const front = g.y - WALL;
  // the roller case across the top
  s.cyl({ x: 1.5, y: 0.0, z: g.z1 + 2, r: 0.05, h: 4, mat: M.aluminium, line: 0.8 });
  s.box({ x: 0.08, y: -0.05, w: 2.84, d: 0.08, z: g.z1 + 1, h: 5, mat: M.aluminium, puff: 0.6 });
  // the cloth, a hair proud of the wall, with its black border and a pull tab
  s.box(
    {
      x: 0.12,
      y: front - 0.02,
      w: 2.76,
      d: 0.02,
      z: g.z0 - 3,
      h: g.z1 - g.z0 + 4,
      mat: { c: "#e9e5da", top: "#f2efe6" },
      line: 0.7,
    },
    (d) => {
      d.poly("s", fr("s", front + 0.001, 0.12, 2.88, g.z0 - 3, g.z1 + 1), "#1d1b18");
      d.poly("s", fr("s", front + 0.002, g.x0, g.x1, g.z0, g.z1), "#ece8dd");
      // a faint sag line
      d.line("s", [g.x0 + 0.1, front + 0.003, g.z0 + 6], [g.x1 - 0.1, front + 0.003, g.z0 + 6.6], "#c9c3b4", 0.5, 0.5);
    },
  );
  s.box({ x: 1.42, y: front - 0.01, w: 0.16, d: 0.03, z: g.z0 - 7, h: 4, mat: M.graphite, line: 0.6 });
}

// ── the film projector (on a table): two reels on arms, a lens to the side ───
export function projector(s: Sketch, p: Props) {
  const on = !!p.on;
  s.box({ x: 0.3, y: 0.34, w: 0.42, d: 0.32, z: 0, h: 7, mat: { c: "#4a4741", top: "#5c5850" }, puff: 0.6 }, (d) => {
    d.poly("s", fr("s", 0.66, 0.36, 0.56, 2, 5), "#2b2a26");
    for (let i = 0; i < 5; i++)
      d.line("s", [0.38 + i * 0.035, 0.661, 2.5], [0.38 + i * 0.035, 0.661, 4.6], "#1c1b18", 0.4);
    d.poly("s", fe("s", 0.661, 0.64, 3.5, 0.02, 0.9, 10), on ? K.amber : "#5a3a1a", { glow: on });
  });
  // the lens, pointing out of the right side
  s.cyl({ x: 0.76, y: 0.5, z: 3, r: 0.05, h: 0.6, mat: M.graphite, line: 0.6 });
  s.shape({ x: 0.7, y: 0.42, w: 0.14, d: 0.16, z: 2, h: 3 }, (d) => {
    const c = d.m(0.79, 0.5, 3.6);
    d.raw(
      `<ellipse cx="${c[0]}" cy="${c[1]}" rx="1.8" ry="1.3" fill="${on ? "#fff3cf" : "#2a3540"}" stroke="${INK}" stroke-width=".4"/>`,
      on,
    );
  });
  // reel arms and the two reels (spinning while it plays: world/media)
  for (const [x, z] of [
    [0.4, 13],
    [0.62, 12],
  ] as const) {
    s.box({ x: x - 0.01, y: 0.48, w: 0.02, d: 0.04, z: 7, h: z - 9, mat: M.graphite, line: 0.5 });
    s.shape({ x: x - 0.12, y: 0.4, w: 0.24, d: 0.2, z: z - 4, h: 8 }, (d) => {
      const c = d.m(x, 0.5, z);
      d.raw(
        `<ellipse cx="${c[0]}" cy="${c[1]}" rx="3.6" ry="3.4" fill="#2b2a26" stroke="${INK}" stroke-width=".6"/><ellipse cx="${c[0]}" cy="${c[1]}" rx="2.2" ry="2.1" fill="none" stroke="${K.aluminium}" stroke-width=".5"/><circle cx="${c[0]}" cy="${c[1]}" r=".6" fill="${K.aluminium}"/>`,
      );
    });
  }
  s.shadow(0.3, 0.34, 0.42, 0.32, 0.35, 0.2);
}

// ── console TV (2 tiles): a walnut cabinet on short legs, big glass, a grille ─
export function tvConsole(s: Sketch) {
  const teak = Math.floor(s.seed * 2) === 1;
  const g = GLASS.tv_console;
  const front = g.y - 0.01;
  for (const x of [0.16, 1.78])
    for (const y of [0.2, 0.76]) s.box({ x, y, w: 0.06, d: 0.06, z: 0, h: 5, mat: M.walnutDark, line: 0.5 });
  const mat = teak ? M.teak : { c: K.walnut, top: "#74492f", gloss: 0.5 };
  s.box({ x: 0.06, y: 0.14, w: 1.88, d: front - 0.14, z: 5, h: 41, mat, puff: 0.8 }, (d) => {
    // the bezel and the glass
    d.poly("s", fr("s", front, g.x0 - 0.06, g.x1 + 0.06, g.z0 - 2.5, g.z1 + 2.5), "#2a1e16");
    glass(d, front + 0.001, g.x0, g.x1, g.z0, g.z1);
    // the speaker grille (woven cloth) and the control strip
    d.poly("s", fr("s", front + 0.001, 1.5, 1.86, 9, 41), "#6a5038");
    for (let i = 0; i < 14; i++)
      d.line("s", [1.5, front + 0.002, 10 + i * 2.2], [1.86, front + 0.002, 10 + i * 2.2], "#3e2c1d", 0.45, 0.6);
    d.poly("s", fr("s", front + 0.001, 0.12, 0.34, 9, 41), sh(teak ? K.teak : K.walnut, 0.75));
    for (const z of [36, 30, 24])
      d.poly("s", fe("s", front + 0.002, 0.23, z, 0.05, 2, 14), K.aluminium, { stroke: INK, sw: 0.4 });
    d.poly("s", fr("s", front + 0.002, 0.16, 0.3, 13, 15), K.cream);
    // woodgrain streaks on the top and the side
    for (let i = 0; i < 5; i++)
      d.line(
        "t",
        [0.12 + i * 0.36, 0.2, 46.02],
        [0.3 + i * 0.36, front - 0.04, 46.02],
        sh(teak ? K.teakTop : "#74492f", 0.85),
        0.5,
        0.6,
      );
  });
  // a little lace doily and a plant on top: an 80s living room
  s.shape({ x: 0.3, y: 0.3, w: 0.5, d: 0.4, z: 46, h: 1 }, (d) =>
    d.poly("t", te(46.1, 0.55, 0.5, 0.18, 18), "#f3ecd9", { op: 0.9 }),
  );
  s.cyl({ x: 0.55, y: 0.5, z: 46.2, r: 0.07, r2: 0.06, h: 5, mat: { c: K.terracotta }, line: 0.6 });
  s.shape({ x: 0.42, y: 0.38, w: 0.26, d: 0.24, z: 51, h: 10 }, (d) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = d.m(0.55, 0.5, 51);
      const t = d.m(0.55 + Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.1, 57 + (i % 2) * 3);
      d.raw(
        `<path d="M${b[0]} ${b[1]} Q${(b[0] + t[0]) / 2} ${t[1] - 2} ${t[0]} ${t[1]}" stroke="${K.leaf}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      );
    }
  });
  s.shadow(0.06, 0.14, 1.88, front - 0.14, 0.4, 0.2);
}

// ── portable CRT (on a desk): silver or cream, a handle, a telescopic antenna ─
export function tvPortable(s: Sketch) {
  const cream = Math.floor(s.seed * 2) === 1;
  const g = GLASS.tv_portable;
  const front = g.y - 0.01;
  const cab = cream ? { c: K.putty, top: "#e4d9bb", gloss: 0.4 } : { c: "#a9a59b", top: "#c4bfb3", gloss: 0.7 };
  s.box({ x: 0.24, y: 0.36, w: 0.52, d: front - 0.36, z: 0, h: 15, mat: cab, puff: 0.6 }, (d) => {
    d.poly("s", fr("s", front, g.x0 - 0.03, g.x1 + 0.03, g.z0 - 1.5, g.z1 + 1.5), "#24221f");
    glass(d, front + 0.001, g.x0, g.x1, g.z0, g.z1);
    d.poly("s", fe("s", front + 0.002, 0.69, 10.5, 0.025, 1.3, 12), K.aluminium, { stroke: INK, sw: 0.35 });
    d.poly("s", fe("s", front + 0.002, 0.69, 6.5, 0.025, 1.3, 12), K.aluminium, { stroke: INK, sw: 0.35 });
    for (let i = 0; i < 3; i++)
      d.line("s", [0.66, front + 0.002, 3.6 - i], [0.72, front + 0.002, 3.6 - i], "#2b2a26", 0.35);
  });
  // the carry handle and the antenna
  s.shape({ x: 0.3, y: 0.4, w: 0.4, d: 0.2, z: 15, h: 6 }, (d) => {
    const a = d.m(0.36, 0.5, 15);
    const b = d.m(0.64, 0.5, 15);
    const top = d.m(0.5, 0.5, 19);
    d.raw(
      `<path d="M${a[0]} ${a[1]} Q${top[0]} ${top[1] - 3} ${b[0]} ${b[1]}" stroke="#2b2a26" stroke-width="1.4" fill="none"/>`,
    );
  });
  s.shape({ x: 0.6, y: 0.36, w: 0.3, d: 0.2, z: 15, h: 26 }, (d) => {
    const base = d.m(0.7, 0.42, 15);
    const tip = d.m(0.86, 0.4, 38);
    d.raw(
      `<path d="M${base[0]} ${base[1]} L${tip[0]} ${tip[1]}" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/><path d="M${base[0]} ${base[1]} L${tip[0]} ${tip[1]}" stroke="${K.aluminium}" stroke-width=".5" stroke-linecap="round"/><circle cx="${tip[0]}" cy="${tip[1]}" r=".7" fill="${K.aluminium}" stroke="${INK}" stroke-width=".3"/>`,
    );
  });
  s.box({ x: 0.3, y: 0.38, w: 0.4, d: 0.04, z: 0, h: 0.6, mat: M.graphite, line: 0.4 });
}
