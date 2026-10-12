import { fe, fr, INK, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// Arcade cabinet facing +y: rust side art with an amber stripe, a lit marquee,
// an attract screen (little invaders + INSERT COIN), joystick and buttons.
// Story: a stack of coins on the control panel.
export function arcade(s: Sketch) {
  const side = { c: K.rust, top: "#c96a3f" };
  s.box({ x: 0.14, y: 0.18, w: 0.72, d: 0.6, z: 0, h: 56, mat: M.walnutDark, faces: { e: side, w: side } }, (d) => {
    for (const f of ["e", "w"] as const) {
      const x = f === "e" ? 0.86 : 0.14;
      d.poly(
        f,
        [
          [x, 0.22, 12],
          [x, 0.74, 34],
          [x, 0.74, 39],
          [x, 0.22, 17],
        ],
        K.amberSoft,
      );
      d.poly(
        f,
        [
          [x, 0.22, 20],
          [x, 0.74, 42],
          [x, 0.74, 44],
          [x, 0.22, 22],
        ],
        K.cream,
        { op: 0.8 },
      );
    }
    // coin door
    d.poly("s", fr("s", 0.78, 0.38, 0.62, 5, 14), "#2a1d14", { stroke: INK, sw: 0.5 });
    d.poly("s", fr("s", 0.78, 0.42, 0.47, 9, 12), K.red, { glow: true });
    d.poly("s", fr("s", 0.78, 0.53, 0.58, 9, 12), K.red, { glow: true });
    // screen bezel + attract screen (emissive)
    d.poly("s", fr("s", 0.78, 0.18, 0.82, 28, 48), "#14100c");
    d.poly("s", fr("s", 0.78, 0.22, 0.78, 30, 46), "#0f1410", { glow: true });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++) {
        const u = 0.28 + c * 0.1;
        const z = 41 - r * 3.2;
        d.poly("s", fr("s", 0.78, u, u + 0.05, z, z + 1.8), [K.red, K.amber, K.phosphor][r], { glow: true });
      }
    d.poly("s", fr("s", 0.78, 0.46, 0.54, 31, 32.6), K.phosphorHi, { glow: true });
    d.poly("s", fr("s", 0.78, 0.34, 0.66, 34, 35), K.vfd, { glow: true });
    // marquee
    d.poly("s", fr("s", 0.78, 0.16, 0.84, 49, 55), K.amber, { glow: true });
    for (let i = 0; i < 6; i++)
      d.poly("s", fr("s", 0.78, 0.25 + i * 0.09, 0.31 + i * 0.09, 50.5, 53.5), "#8a3b10", { glow: true });
  });
  // control panel
  s.box({ x: 0.14, y: 0.78, w: 0.72, d: 0.16, z: 22, h: 5, mat: M.graphite }, (d) => {
    d.poly("t", te(27, 0.3, 0.86, 0.035, 10), K.red);
    for (const [x, c] of [
      [0.5, K.amber],
      [0.6, K.red],
      [0.7, K.amberSoft],
    ] as const)
      d.poly("t", te(27, x, 0.86, 0.025, 10), c, { stroke: INK, sw: 0.3 });
  });
  s.cyl({ x: 0.3, y: 0.86, z: 27, r: 0.008, h: 4, mat: M.aluminium, line: 0.4 });
  s.shape({ x: 0.26, y: 0.82, w: 0.08, d: 0.08, z: 30, h: 3 }, (d) => {
    const [x, y] = d.m(0.3, 0.86, 31.5);
    d.raw(
      `<circle cx="${x}" cy="${y}" r="1.9" fill="${K.red}" stroke="${INK}" stroke-width=".6"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r=".6" fill="#f0a090"/>`,
    );
  });
  // coin stack (story)
  s.cyl({ x: 0.78, y: 0.84, z: 27, r: 0.025, h: 2.4, mat: M.brass, line: 0.4 });
  s.shadow(0.12, 0.16, 0.76, 0.8, 0.44, 0.3);
}

// Server rack: graphite cabinet, a smoked glass door over 8 units with blinking
// LEDs (emissive, seeded). Story: a taped note on the side ("DO NOT TOUCH — V.").
export function serverRack(s: Sketch) {
  s.box({ x: 0.1, y: 0.12, w: 0.8, d: 0.76, z: 0, h: 66, mat: M.graphite }, (d) => {
    d.poly("s", fr("s", 0.88, 0.14, 0.86, 3, 64), "#141210", { stroke: "#4a463e", sw: 0.8 });
    for (let r = 0; r < 8; r++) {
      const z = 6 + r * 7.2;
      d.poly("s", fr("s", 0.88, 0.18, 0.82, z, z + 5.4), "#2c2a26", { stroke: "#45413a", sw: 0.4 });
      for (let i = 0; i < 4; i++) {
        if (rnd(r, i, s.seed) < 0.3) continue;
        const u = 0.22 + i * 0.06;
        d.poly("s", fr("s", 0.88, u, u + 0.03, z + 2, z + 3.4), rnd(i, r) > 0.7 ? K.amber : K.red, { glow: true });
      }
      for (let i = 0; i < 4; i++)
        d.line("s", [0.5 + i * 0.07, 0.88, z + 1.2], [0.5 + i * 0.07, 0.88, z + 4.2], "#45413a", 0.6);
    }
    // glass sheen + handle
    d.poly(
      "s",
      [
        [0.16, 0.88, 64],
        [0.4, 0.88, 64],
        [0.2, 0.88, 40],
        [0.16, 0.88, 44],
      ],
      "#ffffff",
      { op: 0.05 },
    );
    d.poly("s", fr("s", 0.88, 0.8, 0.83, 28, 38), K.aluminium);
    // side vents + the note
    for (let i = 0; i < 8; i++) d.line("e", [0.9, 0.3, 10 + i * 6], [0.9, 0.7, 10 + i * 6], "#1a1916", 1);
    d.poly("e", fr("e", 0.9, 0.36, 0.64, 42, 49), "#e8dbb5", { stroke: "#a9996f", sw: 0.4 });
    d.line("e", [0.9, 0.4, 47], [0.9, 0.6, 47], K.red, 0.7);
    d.line("e", [0.9, 0.4, 44.5], [0.9, 0.56, 44.5], "#3b2a1c", 0.5);
  });
  s.shadow(0.1, 0.12, 0.8, 0.76, 0.46, 0.3);
}

// Vortex's terminal: a walnut cart with a putty terminal glowing amber text.
// Story: a cassette labelled LAST TAKE by the keyboard.
export function crtTerminal(s: Sketch) {
  for (const [x, y] of [
    [0.1, 0.2],
    [0.9, 0.2],
    [0.1, 0.86],
    [0.9, 0.86],
  ])
    s.cyl({ x, y, z: 0, r: 0.03, h: 2, mat: M.graphite, line: 0.5 });
  s.box({ x: 0.05, y: 0.15, w: 0.9, d: 0.75, z: 2, h: 18, mat: M.walnutDark }, (d) => {
    d.poly("s", fr("s", 0.9, 0.1, 0.9, 5, 9), sh(K.walnutDark, 1.2));
  });
  s.box({ x: 0.2, y: 0.24, w: 0.6, d: 0.4, z: 20, h: 6, mat: M.puttyDark, line: 0.9 });
  s.box({ x: 0.16, y: 0.3, w: 0.68, d: 0.42, z: 26, h: 22, mat: M.putty, puff: 0.6 }, (d) => {
    d.poly("s", fr("s", 0.72, 0.22, 0.78, 29, 46), "#a89a76");
    d.poly("s", fr("s", 0.72, 0.25, 0.75, 30.5, 44.5), "#1a120a", { stroke: "#3a2c1f", sw: 0.6 });
    for (let r = 0; r < 5; r++) {
      const len = 0.12 + rnd(r, 2) * 0.28;
      d.poly("s", fr("s", 0.72, 0.29, 0.29 + len, 41.5 - r * 2.4, 42.5 - r * 2.4), K.vfd, { glow: true });
    }
    d.poly("s", fr("s", 0.72, 0.29, 0.33, 30.8, 32), K.amber, { glow: true });
    d.poly("s", fe("s", 0.72, 0.72, 27.6, 0.02, 0.9, 8), K.amber, { glow: true });
  });
  s.box({ x: 0.2, y: 0.74, w: 0.5, d: 0.14, z: 20, h: 1.6, mat: M.putty, line: 0.7 }, (d) => {
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 9; k++)
        d.poly("t", tr(21.6, 0.23 + k * 0.05, 0.77 + r * 0.05, 0.27 + k * 0.05, 0.81 + r * 0.05), "#e9dfc4", {
          stroke: "#a69772",
          sw: 0.2,
        });
  });
  s.box({ x: 0.74, y: 0.72, w: 0.17, d: 0.12, z: 20, h: 1.4, mat: M.graphite, line: 0.6 }, (d) => {
    d.poly("t", tr(21.4, 0.76, 0.74, 0.89, 0.8), K.cream);
    d.line("t", [0.77, 0.77, 21.5], [0.87, 0.77, 21.5], K.red, 0.5);
  });
  s.shadow(0.05, 0.15, 0.9, 0.75, 0.36, 0.4);
}

// Espresso machine, drawn standing on z 0 (it goes on its cupboard, or any
// counter): brushed steel, an amber display, a mug under the spout. Story: a
// "descale me" note.
export function coffeeMachine(s: Sketch) {
  s.box({ x: 0.22, y: 0.18, w: 0.56, d: 0.44, z: 0, h: 20, mat: M.aluminium }, (d) => {
    d.poly("s", fr("s", 0.62, 0.28, 0.72, 14, 18), K.graphite);
    d.poly("s", fr("s", 0.62, 0.32, 0.46, 15, 17), K.amber, { glow: true });
    d.poly("s", fe("s", 0.62, 0.62, 16, 0.025, 1.2, 8), K.red, { glow: true });
    d.poly("s", fr("s", 0.62, 0.36, 0.64, 1, 3), "#4a463e");
    // descale note (story)
    d.poly("s", fr("s", 0.62, 0.58, 0.72, 4, 10), K.amberSoft, { stroke: "#a8721f", sw: 0.3 });
  });
  s.box({ x: 0.42, y: 0.62, w: 0.16, d: 0.08, z: 8, h: 3, mat: M.graphite, line: 0.6 });
  s.cyl({ x: 0.5, y: 0.7, z: 0, r: 0.05, h: 5, mat: { c: K.cream } }, (d) =>
    d.poly("t", te(5, 0.5, 0.7, 0.035), "#3b2416"),
  );
}

// A cream cupboard with a walnut top: the coffee corner's counter.
export function cupboard(s: Sketch) {
  s.box({ x: 0.08, y: 0.14, w: 0.84, d: 0.72, z: 0, h: 24, mat: M.cream, faces: { s: { c: K.creamDark } } }, (d) => {
    d.poly("s", fr("s", 0.86, 0.12, 0.49, 3, 21), sh(K.cream, 0.95), { stroke: "#b8a985", sw: 0.5 });
    d.poly("s", fr("s", 0.86, 0.51, 0.88, 3, 21), sh(K.cream, 0.95), { stroke: "#b8a985", sw: 0.5 });
    for (const u of [0.44, 0.56]) d.poly("s", fr("s", 0.86, u, u + 0.02, 10, 15), K.brass);
    d.poly("s", fr("s", 0.86, 0.06, 0.94, 0, 1.6), K.walnutDark);
  });
  s.box({ x: 0.04, y: 0.1, w: 0.92, d: 0.8, z: 24, h: 2, mat: M.walnut, line: 1 });
  s.shadow(0.08, 0.14, 0.84, 0.72, 0.42, 0.3);
}
