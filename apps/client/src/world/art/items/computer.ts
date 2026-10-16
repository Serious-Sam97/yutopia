import { COMPUTER_GLASS } from "@yutopia/shared/computer";
import { fe, fr, INK, type Sketch, sh } from "./kit";
import { K, M } from "./pal";

type Props = Record<string, unknown>;

// A desk computer that runs VortexOS (shared/computer.ts): an all-in-one in the
// 1987 manner — a 4:3 tube in a tall case, a chin with a floppy slot, a
// power LED and a small badge, on a tilt foot. It faces −y (whoever sits at
// the desk), like the desks' old monitors. Two looks: putty beige, and black
// "pro" graphite. Off, the glass is dark with a reflection and the LED stands
// by in amber; what it shows while someone uses it is drawn live over the
// glass (world/os), exactly on COMPUTER_GLASS.
export function computer(s: Sketch, p: Props) {
  const black = Math.floor(s.seed * 2) === 1;
  const g = COMPUTER_GLASS;
  const F = g.y + 0.004; // the front face's plane (the glass sits a hair in front of it)
  const x0 = 0.28;
  const x1 = 0.72;
  const body = black ? { c: "#33312c", top: "#46433c" } : M.putty;
  const bodyC = black ? "#33312c" : K.putty;
  const back = black ? { c: "#2a2925" } : M.puttyDark;
  const seed = Number(p.seed);
  const note = Number.isFinite(seed) ? seed > 0.5 : false;

  // the tilt foot
  s.box({ x: 0.36, y: 0.38, w: 0.28, d: 0.26, z: 0, h: 1.6, mat: back, line: 0.8 });
  // the tube's housing behind the bezel, with its vents
  s.box({ x: x0 + 0.05, y: F + 0.16, w: x1 - x0 - 0.1, d: 0.22, z: 3, h: 17, mat: back, puff: 1 }, (d) => {
    for (let i = 0; i < 5; i++) {
      const x = x0 + 0.1 + i * 0.055;
      d.line("t", [x, F + 0.22, 20], [x, F + 0.34, 20], black ? "#1d1c19" : "#8e8263", 0.7);
    }
  });
  // the case: front, bezel, glass, chin
  s.box({ x: x0, y: F, w: x1 - x0, d: 0.18, z: 1.6, h: 21.4, mat: body, puff: 0.5 }, (d) => {
    // the bezel round the glass, a step in
    d.poly("n", fr("n", F, g.x1 - 0.035, g.x0 + 0.035, g.z0 - 1.6, g.z1 + 1.6), black ? "#24231f" : "#a89a76");
    d.poly("n", fr("n", F, g.x1, g.x0, g.z0, g.z1), "#161a17", { stroke: "#0d0b0a", sw: 0.5 });
    // a soft reflection across the dark glass
    d.poly(
      "n",
      [
        [g.x0 - 0.03, F - 0.001, g.z1 - 0.8],
        [g.x0 - 0.12, F - 0.001, g.z1 - 0.8],
        [g.x0 - 0.04, F - 0.001, g.z0 + 3.5],
      ],
      "#ffffff",
      { op: 0.1 },
    );
    // the chin: a floppy slot with its eject button, the badge, the power LED
    const zc = 4.2;
    d.poly("n", fr("n", F, 0.42, 0.6, zc - 0.5, zc + 0.5), black ? "#121110" : "#5d553f");
    d.poly("n", fr("n", F, 0.44, 0.47, zc - 1.4, zc - 0.8), black ? "#4a4740" : K.puttyDark);
    d.poly("n", fr("n", F, 0.62, 0.68, 2.6, 3.6), black ? K.amberSoft : "#8e8263");
    d.poly("n", fe("n", F, 0.335, 3.1, 0.012, 0.55, 10), K.amber, { glow: true });
    // a seam under the bezel
    d.line("n", [x0 + 0.02, F, 6.6], [x1 - 0.02, F, 6.6], black ? "#1d1c19" : sh(bodyC, 0.82), 0.5);
    // someone's sticky note on the bezel
    if (note)
      d.poly(
        "n",
        [
          [g.x0 + 0.01, F - 0.001, g.z1 + 4.9],
          [g.x0 - 0.11, F - 0.001, g.z1 + 4.4],
          [g.x0 - 0.11, F - 0.001, g.z1 + 1.9],
          [g.x0 + 0.01, F - 0.001, g.z1 + 2.2],
        ],
        K.amberSoft,
        { stroke: "#b07a22", sw: 0.4 },
      );
  });
  // a cable down the back
  s.shape({ x: 0.46, y: F + 0.36, w: 0.08, d: 0.12, z: 0, h: 6 }, (d) => {
    d.line("t", [0.5, F + 0.38, 5], [0.52, F + 0.46, 0.2], INK, 0.8);
  });
}
