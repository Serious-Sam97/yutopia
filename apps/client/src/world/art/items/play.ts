import { fe, fr, INK, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// Things to use: a water cooler (a paper cup of water), a vending machine (a
// can of soda), an upright piano (play it) and a record player (it plays the
// room's music, like the radio).

// A water cooler: a blue bottle upside down on a cream dispenser, a stack of
// paper cups on its side.
export function waterCooler(s: Sketch) {
  s.box({ x: 0.26, y: 0.28, w: 0.48, d: 0.44, z: 0, h: 30, mat: M.cream, faces: { s: { c: K.creamDark } } }, (d) => {
    d.poly("s", fr("s", 0.72, 0.32, 0.68, 20, 26), "#3d4a5c");
    // the taps: hot (red) and cold (blue)
    d.poly("s", fr("s", 0.725, 0.38, 0.46, 22, 24.5), K.red);
    d.poly("s", fr("s", 0.725, 0.54, 0.62, 22, 24.5), "#5b8fc7");
    d.poly("s", fr("s", 0.72, 0.34, 0.66, 13, 14.5), K.graphite); // drip tray
  });
  // the bottle (see-through blue, water inside)
  s.cyl({ x: 0.5, y: 0.5, z: 30, r: 0.06, h: 3, mat: { c: "#9cc4e6" }, line: 0.6 });
  s.cyl(
    { x: 0.5, y: 0.5, z: 33, r: 0.2, r2: 0.19, h: 18, mat: { c: "#8fc0ea", top: "#bcdcf4", gloss: 1 }, line: 0.9 },
    (d) => {
      d.poly("s", fe("s", 0.69, 0.5, 40, 0.16, 0.8, 16), "#ffffff", { op: 0.4 });
      d.poly("s", fe("s", 0.69, 0.5, 46, 0.16, 0.8, 16), "#ffffff", { op: 0.3 });
    },
  );
  // paper cups in a holder on the side
  s.cyl({ x: 0.8, y: 0.5, z: 14, r: 0.045, h: 12, mat: { c: K.paper, top: "#fffaf0" }, line: 0.6 });
  s.shadow(0.26, 0.28, 0.48, 0.44, 0.42, 0.3);
}

// A vending machine: a lit front with rows of cans and snacks behind glass, a
// coin slot and a flap at the bottom. Two liveries.
export function vending(s: Sketch) {
  const v = Math.floor(s.seed * 2);
  const body = v ? { c: K.rust, top: "#c96a3f" } : { c: K.slate, top: "#4e5c70" };
  s.box({ x: 0.1, y: 0.16, w: 0.8, d: 0.7, z: 0, h: 62, mat: body }, (d) => {
    // the window, lit from inside
    d.poly("s", fr("s", 0.86, 0.14, 0.66, 18, 58), "#fff3d6", { glow: true });
    for (let row = 0; row < 4; row++) {
      const z = 21 + row * 9.4;
      d.poly("s", fr("s", 0.861, 0.14, 0.66, z - 0.8, z), sh(body.c, 0.7));
      for (let i = 0; i < 4; i++) {
        const u = 0.18 + i * 0.12;
        const c = [K.red, K.amber, "#5b8fc7", K.olive, K.cream, "#7a5c8a"][Math.floor(rnd(row, i, s.seed) * 6)];
        d.poly("s", fr("s", 0.862, u, u + 0.07, z + 0.2, z + 6.4), c, { stroke: INK, sw: 0.3 });
      }
    }
    // the panel: a little display, the coin slot, the keypad
    d.poly("s", fr("s", 0.86, 0.7, 0.86, 46, 52), K.screen);
    d.poly("s", fr("s", 0.861, 0.72, 0.84, 48, 50.6), K.vfd, { glow: true });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++)
        d.poly("s", fr("s", 0.861, 0.72 + c * 0.065, 0.77 + c * 0.065, 38 - r * 3.2, 40.2 - r * 3.2), K.cream);
    d.poly("s", fr("s", 0.861, 0.76, 0.8, 26, 30), K.graphite);
    // the flap
    d.poly("s", fr("s", 0.86, 0.18, 0.62, 4, 11), K.graphite, { stroke: INK, sw: 0.6 });
    d.poly("s", fr("s", 0.861, 0.2, 0.6, 9.4, 10.6), sh(K.graphite, 1.4));
  });
  s.shadow(0.1, 0.16, 0.8, 0.7, 0.42, 0.3);
}

// An upright piano facing +y (the room): a walnut (or black lacquer) case at
// the back, the keys on a ledge in front, a sheet of music on the stand.
export function piano(s: Sketch) {
  const v = Math.floor(s.seed * 2);
  const wood = v ? { c: "#1e1c1a", top: "#2e2b28", gloss: 1 } : M.walnut;
  s.box({ x: 0.06, y: 0.08, w: 1.88, d: 0.5, z: 0, h: 44, mat: wood }, (d) => {
    // panels on the front of the upper case, the music on its stand
    d.poly("s", fr("s", 0.58, 0.2, 0.92, 26, 40), sh(wood.c, 1.18), { stroke: sh(wood.c, 0.7), sw: 0.5 });
    d.poly("s", fr("s", 0.58, 1.08, 1.8, 26, 40), sh(wood.c, 1.18), { stroke: sh(wood.c, 0.7), sw: 0.5 });
    d.poly("s", fr("s", 0.581, 0.72, 1.28, 27, 36), K.paper, { stroke: "#b8a982", sw: 0.4 });
    for (let i = 0; i < 4; i++) d.line("s", [0.76, 0.582, 29 + i * 1.9], [1.24, 0.582, 29 + i * 1.9], "#8a7a5a", 0.4);
    // the lower case under the keys
    d.poly("s", fr("s", 0.58, 0.14, 1.86, 2, 13), sh(wood.c, 0.9));
  });
  s.box({ x: 0.06, y: 0.58, w: 1.88, d: 0.26, z: 14, h: 6, mat: wood }, (d) => {
    // the keys: white, with black ones in twos and threes towards the back
    const Z = 20;
    d.poly("t", tr(Z + 0.01, 0.14, 0.62, 1.86, 0.8), "#f4ecd8", { stroke: INK, sw: 0.4 });
    for (let i = 0; i < 25; i++) {
      const x = 0.14 + i * (1.72 / 25);
      d.line("t", [x, 0.62, Z + 0.02], [x, 0.8, Z + 0.02], "#b8ab90", 0.4);
      if ([0, 1, 3, 4, 5].includes(i % 7) && i < 24)
        d.poly("t", tr(Z + 0.3, x + 0.045, 0.62, x + 0.09, 0.72), "#1a1816");
    }
  });
  // legs and pedals
  for (const x of [0.12, 1.8]) s.box({ x, y: 0.76, w: 0.08, d: 0.08, z: 0, h: 14, mat: wood, line: 0.7 });
  for (const x of [0.86, 0.98, 1.1]) s.box({ x, y: 0.58, w: 0.06, d: 0.08, z: 1, h: 0.8, mat: M.brass, line: 0.4 });
  s.shadow(0.06, 0.08, 1.88, 0.76, 0.42, 0.3);
}

// A record player standing on a surface (drawn standing on z 0): a walnut
// plinth, a vinyl on the platter, the tonearm. props.on: it's playing (the LED,
// the label lit).
export function turntable(s: Sketch, props: Record<string, unknown>) {
  const on = !!props.on;
  s.box({ x: 0.14, y: 0.18, w: 0.72, d: 0.64, z: 0, h: 4, mat: M.walnut, line: 0.9 }, (d) => {
    d.poly("s", fe("s", 0.82, 0.76, 2, 0.02, 0.8, 8), on ? K.red : "#5a2a22", { glow: on });
  });
  s.cyl({ x: 0.44, y: 0.5, z: 4, r: 0.26, h: 1, mat: M.aluminium, line: 0.6 }, (d) => {
    d.poly("t", te(5.02, 0.44, 0.5, 0.25), K.graphite);
    for (const r of [0.2, 0.15, 0.1]) d.poly("t", te(5.04, 0.44, 0.5, r), "none", { stroke: "#45423b", sw: 0.4 });
    d.poly("t", te(5.06, 0.44, 0.5, 0.06), on ? K.amber : K.rust, { glow: on });
    if (on) d.poly("t", tr(5.07, 0.3, 0.38, 0.44, 0.42), "#ffffff", { op: 0.25 });
  });
  // the tonearm: a pivot on the right, the arm across onto the record
  s.cyl({ x: 0.74, y: 0.32, z: 4, r: 0.04, h: 3, mat: M.aluminium, line: 0.5 });
  s.shape({ x: 0.4, y: 0.28, w: 0.4, d: 0.3, z: 6, h: 2 }, (d) => {
    const a = d.m(0.74, 0.32, 7);
    const b = d.m(on ? 0.56 : 0.76, on ? 0.52 : 0.62, 6.4);
    d.raw(
      `<path d="M${a.join(" ")} L${b.join(" ")}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="M${a.join(" ")} L${b.join(" ")}" stroke="${K.aluminium}" stroke-width=".7" stroke-linecap="round"/>`,
    );
  });
}
