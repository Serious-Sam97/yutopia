import { TV_SCREEN } from "@yutopia/shared/games";
import { fe, fr, INK, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// The game room (docs/plan/09-game-room.md): a CRT TV on its stand, the
// consoles, the cartridge shelf. Drawn true to the originals' silhouettes,
// colours and parts — no logos or names. What changes while playing (the
// picture, the power LED, the cable, the pads) is drawn live by the engine and
// world/games; a cartridge in a console (props.cart: its label colour) is here.

type Props = Record<string, unknown>;
const cartColor = (p: Props): string | null =>
  typeof p.cartColor === "string" && /^#[0-9a-f]{6}$/i.test(p.cartColor) ? p.cartColor : p.cart ? K.cream : null;

// ── the TV ─────────────────────────────────────────────────────────────────
// A walnut stand (a VCR blinking 12:00 on the open shelf, tapes behind smoked
// glass) and on it an 80s tube TV: a woodgrain (or silver) cabinet, the glass
// bulging a little, a knob panel with a speaker grille, rabbit ears on top.
export function crtTv(s: Sketch) {
  const silver = Math.floor(s.seed * 2) === 1;
  const S = TV_SCREEN;
  // the stand
  s.box({ x: 0.06, y: 0.1, w: 1.88, d: 0.8, z: 0, h: 13, mat: M.walnut }, (d) => {
    d.poly("s", fr("s", 0.9, 0.12, 0.96, 1.5, 11.5), "#2a1a10"); // open shelf
    d.poly("s", fr("s", 0.9, 1.02, 1.88, 1.5, 11.5), "#1c1a19", { op: 0.88 }); // smoked glass
    d.line("s", [1.04, 0.901, 10.6], [1.86, 0.901, 10.6], "#ffffff", 0.5, 0.18);
    for (let i = 0; i < 6; i++) {
      const x = 1.08 + i * 0.12;
      d.poly("s", fr("s", 0.902, x, x + 0.08, 2.4, 9.5), i % 2 ? K.cream : K.rust, { op: 0.45 });
    }
    d.poly("s", fr("s", 0.9, 0.98, 1.0, 1, 12), sh(K.walnut, 0.7));
  });
  // the VCR on the open shelf: a slot, buttons, 12:00 in amber
  s.box({ x: 0.16, y: 0.24, w: 0.76, d: 0.6, z: 2, h: 3.6, mat: M.graphite, line: 0.7 }, (d) => {
    d.poly("s", fr("s", 0.84, 0.22, 0.56, 3.6, 4.6), "#0d0b0a");
    d.poly("s", fr("s", 0.841, 0.62, 0.84, 3, 4.8), K.screen);
    d.poly("s", fr("s", 0.842, 0.65, 0.81, 3.4, 4.4), K.vfd, { glow: true });
    for (let i = 0; i < 3; i++) d.poly("s", fr("s", 0.841, 0.24 + i * 0.07, 0.29 + i * 0.07, 2.6, 3.1), K.aluminium);
  });
  // the set
  const cab = silver ? { c: "#9d998f", top: "#b9b4a8", gloss: 0.6 } : { c: K.teak, top: K.teakTop, gloss: 0.5 };
  const front = silver ? "#2b2a28" : "#3a2a1f";
  s.box({ x: 0.3, y: 0.16, w: 1.4, d: 0.62, z: 13, h: 34, mat: cab, puff: 1.2 }, (d) => {
    // the bezel round the glass, then the glass (dark, a bulge of light on it)
    d.poly("s", fr("s", 0.78, S.x0 - 0.05, S.x1 + 0.05, S.z0 - 1.5, S.z1 + 1.5), front);
    d.poly("s", fr("s", 0.781, S.x0, S.x1, S.z0, S.z1), "#18201a", { stroke: "#0d0b0a", sw: 0.6 });
    d.poly(
      "s",
      [
        [S.x0 + 0.06, 0.782, S.z1 - 2],
        [S.x0 + 0.34, 0.782, S.z1 - 2],
        [S.x0 + 0.1, 0.782, S.z1 - 8],
      ],
      "#ffffff",
      { op: 0.12 },
    );
    // the knob panel: channel and volume, a power button, the speaker grille
    d.poly("s", fr("s", 0.781, 1.38, 1.64, 16, 44), sh(front, 1.15));
    for (const z of [38.5, 32]) {
      d.poly("s", fe("s", 0.782, 1.51, z, 0.07, 2.3, 14), K.aluminium, { stroke: INK, sw: 0.4 });
      d.poly("s", fe("s", 0.783, 1.51, z, 0.03, 1, 10), sh(K.aluminium, 0.7));
    }
    d.poly("s", fr("s", 0.782, 1.45, 1.57, 26, 27.6), K.cream);
    for (let i = 0; i < 6; i++) d.line("s", [1.42, 0.782, 23 - i * 1.1], [1.6, 0.782, 23 - i * 1.1], "#0d0b0a", 0.5);
    // woodgrain on the cabinet's side (a few long streaks)
    if (!silver)
      for (let i = 0; i < 4; i++)
        d.line("e", [1.7, 0.2 + i * 0.14, 16 + i * 3], [1.7, 0.7, 18 + i * 3.4], sh(K.teak, 0.8), 0.5, 0.6);
  });
  // rabbit ears on a little base
  s.cyl({ x: 1.0, y: 0.42, z: 47, r: 0.09, r2: 0.06, h: 2, mat: M.graphite, line: 0.6 });
  s.shape({ x: 0.6, y: 0.2, w: 0.8, d: 0.5, z: 49, h: 26 }, (d) => {
    const base = d.m(1.0, 0.42, 49);
    const a = d.m(0.72, 0.32, 72);
    const b = d.m(1.34, 0.36, 70);
    for (const tip of [a, b])
      d.raw(
        `<path d="M${base[0]} ${base[1]} L${tip[0]} ${tip[1]}" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/><path d="M${base[0]} ${base[1]} L${tip[0]} ${tip[1]}" stroke="${K.aluminium}" stroke-width=".6" stroke-linecap="round"/><circle cx="${tip[0]}" cy="${tip[1]}" r=".9" fill="${K.aluminium}" stroke="${INK}" stroke-width=".4"/>`,
      );
  });
  s.shadow(0.06, 0.1, 1.88, 0.8, 0.42, 0.3);
}

// ── consoles (1 × 1, on the floor in front of the TV) ───────────────────────
// Woodgrain 2600-style: a black ribbed top over a woodgrain front, six chrome
// switches, the cartridge standing up out of the slot.
export function console2600(s: Sketch, p: Props) {
  s.box({ x: 0.2, y: 0.3, w: 0.6, d: 0.42, z: 0, h: 4.5, mat: { c: "#1f1d1b", top: "#2b2926" } }, (d) => {
    d.poly("s", fr("s", 0.72, 0.2, 0.8, 0.3, 3.3), K.teak);
    for (let i = 0; i < 4; i++)
      d.line("s", [0.22, 0.721, 0.8 + i * 0.6], [0.78, 0.721, 1 + i * 0.6], sh(K.teak, 0.75), 0.4);
    // ribs on the top's back half
    for (let i = 0; i < 6; i++)
      d.line("t", [0.24, 0.33 + i * 0.03, 4.52], [0.76, 0.33 + i * 0.03, 4.52], "#0d0b0a", 0.4);
    // the switches along the front
    for (const x of [0.25, 0.33, 0.41, 0.59, 0.67, 0.75])
      d.poly("t", tr(4.56, x - 0.02, 0.62, x + 0.02, 0.68), K.aluminium, { stroke: INK, sw: 0.3 });
  });
  const c = cartColor(p);
  if (c)
    s.box({ x: 0.42, y: 0.42, w: 0.16, d: 0.06, z: 4.5, h: 5.5, mat: { c: "#1c1a18" }, line: 0.6 }, (d) => {
      d.poly("s", fr("s", 0.48, 0.44, 0.56, 5.6, 9.2), c);
    });
  s.shadow(0.2, 0.3, 0.6, 0.42, 0.4, 0.2);
}

// 8-bit: a grey front-loader (two greys, a black band with the power and
// reset buttons, the flap) or the red-and-cream top-loader with its two pads
// in their cradles and the cartridge standing up.
export function consoleNes(s: Sketch, p: Props) {
  const toploader = Math.floor(s.seed * 2) === 1;
  const c = cartColor(p);
  if (!toploader) {
    s.box({ x: 0.18, y: 0.28, w: 0.64, d: 0.48, z: 0, h: 5.5, mat: { c: "#bdb8ae", top: "#d6d1c6" } }, (d) => {
      d.poly("t", tr(5.52, 0.18, 0.28, 0.82, 0.5), "#c9c4b9");
      d.poly("s", fr("s", 0.76, 0.18, 0.82, 0.6, 2.4), "#2b2a28");
      d.poly("s", fr("s", 0.761, 0.22, 0.27, 1, 2), K.red);
      d.poly("s", fr("s", 0.761, 0.3, 0.35, 1, 2), K.red);
      d.poly("s", fr("s", 0.761, 0.42, 0.76, 2.8, 5.1), "#a8a398", { stroke: "#7d786e", sw: 0.4 }); // the flap
      for (const x of [0.6, 0.7]) d.poly("s", fr("s", 0.761, x, x + 0.06, 0.8, 2), "#1c1a18"); // pad ports
    });
  } else {
    s.box({ x: 0.2, y: 0.3, w: 0.6, d: 0.42, z: 0, h: 3.6, mat: { c: K.red, top: "#d0573f" } });
    s.box({ x: 0.22, y: 0.32, w: 0.56, d: 0.38, z: 3.6, h: 1.4, mat: { c: K.cream, top: "#f6eedb" } }, (d) => {
      d.poly("t", tr(5.02, 0.4, 0.4, 0.6, 0.5), "#3a2f24"); // the slot
      d.poly("t", tr(5.02, 0.62, 0.58, 0.7, 0.64), K.red);
    });
    // the two wired pads in their cradles on either side
    for (const x of [0.24, 0.64])
      s.box({ x, y: 0.5, w: 0.12, d: 0.16, z: 5, h: 0.8, mat: { c: K.red, top: "#d0573f" }, line: 0.5 }, (d) => {
        d.poly("t", tr(5.82, x + 0.02, 0.53, x + 0.05, 0.56), "#1c1a18");
        d.poly("t", tr(5.82, x + 0.07, 0.58, x + 0.1, 0.62), K.cream);
      });
    if (c)
      s.box({ x: 0.42, y: 0.42, w: 0.16, d: 0.06, z: 5, h: 4.5, mat: { c: "#d9cba9" }, line: 0.6 }, (d) => {
        d.poly("s", fr("s", 0.48, 0.44, 0.56, 6, 9), c);
      });
  }
  s.shadow(0.18, 0.28, 0.64, 0.48, 0.4, 0.2);
}

// 16-bit (grey): rounded light grey, the slot in a darker well, the power and
// reset sliders, eject, four coloured dots on the top.
export function consoleSnes(s: Sketch, p: Props) {
  s.box({ x: 0.17, y: 0.27, w: 0.66, d: 0.5, z: 0, h: 5, mat: { c: "#c7c3bb", top: "#dad6ce" }, puff: 0.8 }, (d) => {
    d.poly("t", tr(5.02, 0.32, 0.34, 0.68, 0.5), "#9a968e", { stroke: "#7d786e", sw: 0.3 });
    d.poly("t", tr(5.03, 0.4, 0.4, 0.6, 0.45), "#3a3733");
    for (const [x, col] of [
      [0.22, "#7a5c8a"],
      [0.72, "#7a5c8a"],
    ] as const)
      d.poly("t", tr(5.04, x, 0.4, x + 0.06, 0.46), col);
    d.poly("t", tr(5.04, 0.47, 0.55, 0.53, 0.6), "#9a968e"); // eject
    const dots = [K.red, K.amber, "#7fa34a", "#4f86c6"];
    for (const [i, col] of dots.entries()) d.poly("t", te(5.05, 0.62 + i * 0.045, 0.68, 0.014, 8), col);
    for (const x of [0.3, 0.42]) d.poly("s", fr("s", 0.77, x, x + 0.08, 1, 2.6), "#2b2a28");
  });
  const c = cartColor(p);
  if (c)
    s.box({ x: 0.4, y: 0.4, w: 0.2, d: 0.05, z: 5, h: 4.5, mat: { c: "#b1ada4" }, line: 0.6 }, (d) => {
      d.poly("s", fr("s", 0.45, 0.42, 0.58, 5.8, 8.8), c);
    });
  s.shadow(0.17, 0.27, 0.66, 0.5, 0.4, 0.2);
}

// 16-bit (black): a black wedge with the round raised top (rings), a red
// accent, the slot behind it, the cartridge standing up.
export function consoleMd(s: Sketch, p: Props) {
  s.box(
    { x: 0.16, y: 0.28, w: 0.68, d: 0.46, z: 0, h: 4.2, mat: { c: "#1c1b1a", top: "#2a2927", gloss: 0.8 } },
    (d) => {
      d.poly("s", fr("s", 0.74, 0.18, 0.4, 1.6, 2.2), K.red);
      for (const x of [0.6, 0.7]) d.poly("s", fr("s", 0.741, x, x + 0.06, 0.8, 2), "#0d0b0a");
    },
  );
  s.cyl(
    { x: 0.58, y: 0.52, z: 4.2, r: 0.17, h: 1.4, mat: { c: "#2a2927", top: "#363431", gloss: 0.8 }, line: 0.6 },
    (d) => {
      for (const r of [0.13, 0.09]) d.poly("t", te(5.62, 0.58, 0.52, r, 18), "none", { stroke: "#4a4844", sw: 0.4 });
      d.poly("t", te(5.63, 0.58, 0.52, 0.04, 10), K.red);
    },
  );
  const c = cartColor(p);
  s.box({ x: 0.24, y: 0.38, w: 0.2, d: 0.08, z: 4.2, h: 0.6, mat: { c: "#0d0b0a" }, line: 0.4 });
  if (c)
    s.box({ x: 0.25, y: 0.39, w: 0.18, d: 0.06, z: 4.8, h: 5.5, mat: { c: "#1c1a18" }, line: 0.6 }, (d) => {
      d.poly("s", fr("s", 0.45, 0.27, 0.41, 6, 9.6), c);
    });
  s.shadow(0.16, 0.28, 0.68, 0.46, 0.4, 0.2);
}

// The handheld in its TV dock: a grey cradle with a cable socket, the brick
// standing in it (green glass, the cross pad, two buttons) — its cartridge
// shows at the back.
export function consoleGb(s: Sketch, p: Props) {
  s.box({ x: 0.24, y: 0.34, w: 0.52, d: 0.36, z: 0, h: 2.6, mat: { c: "#8d877a", top: "#a39d90" } }, (d) => {
    d.poly("s", fr("s", 0.7, 0.3, 0.38, 0.8, 1.8), "#1c1a18");
    d.poly("s", fr("s", 0.701, 0.62, 0.68, 1, 1.6), "#5a2a22"); // the LED (lit live)
  });
  s.box({ x: 0.38, y: 0.42, w: 0.24, d: 0.1, z: 2.6, h: 13, mat: { c: "#c9c4b9", top: "#dad6ce" }, puff: 0.4 }, (d) => {
    d.poly("s", fr("s", 0.52, 0.4, 0.6, 8.5, 14.5), "#55534d");
    d.poly("s", fr("s", 0.521, 0.43, 0.57, 9.3, 13.7), "#8a9a3a");
    d.poly("s", fr("s", 0.521, 0.41, 0.46, 5.4, 6.2), "#2b2a28");
    d.poly("s", fr("s", 0.521, 0.43, 0.44, 4.6, 7), "#2b2a28");
    d.poly("s", fe("s", 0.521, 0.54, 6.4, 0.018, 0.7, 8), "#7a1f3a");
    d.poly("s", fe("s", 0.521, 0.58, 7, 0.018, 0.7, 8), "#7a1f3a");
  });
  const c = cartColor(p);
  if (c)
    s.box({ x: 0.42, y: 0.4, w: 0.16, d: 0.03, z: 13, h: 3.4, mat: { c: "#8d877a" }, line: 0.5 }, (d) => {
      d.poly("s", fr("s", 0.43, 0.44, 0.56, 13.6, 16), c);
    });
  s.shadow(0.24, 0.34, 0.52, 0.36, 0.4, 0.2);
}

// ── the cartridge shelf (the library) ──────────────────────────────────────
// A low walnut shelf of cartridges standing in rows, label colours seeded,
// a couple of boxed games lying on top.
export function cartShelf(s: Sketch) {
  const labels = [K.red, K.amber, "#4f86c6", "#7fa34a", K.cream, "#7a5c8a", K.rust, "#d6c9a6"];
  s.box({ x: 0.06, y: 0.24, w: 1.88, d: 0.54, z: 0, h: 30, mat: M.walnut }, (d) => {
    d.poly("s", fr("s", 0.78, 0.12, 1.88, 2.5, 28), "#2a1a10");
    for (const z of [2.5, 15]) {
      d.poly("s", fr("s", 0.78, 0.12, 1.88, z, z + 1.2), sh(K.walnut, 1.12));
      let x = 0.16;
      let i = 0;
      while (x < 1.82) {
        const grey = rnd(i, z, 0.4) > 0.5 ? "#2b2a28" : "#a8a398";
        const w = 0.09;
        d.poly("s", fr("s", 0.78, x, x + w, z + 1.2, z + 11), grey, { stroke: INK, sw: 0.3 });
        d.poly(
          "s",
          fr("s", 0.781, x + 0.015, x + w - 0.015, z + 5, z + 9.5),
          labels[Math.floor(rnd(i, z + 2, 0.7) * labels.length)],
        );
        x += w + 0.012 + (rnd(i, z + 4, 0.3) > 0.85 ? 0.06 : 0);
        i++;
      }
    }
  });
  // boxed games on top
  for (const [x, col, h] of [
    [0.3, K.red, 2.2],
    [0.36, "#4f86c6", 2.2],
  ] as const)
    s.box({
      x,
      y: 0.34,
      w: 0.5,
      d: 0.36,
      z: 30 + (col === K.red ? 0 : 2.2),
      h,
      mat: { c: K.cream, top: col },
      line: 0.6,
    });
  s.shadow(0.06, 0.24, 1.88, 0.54, 0.42, 0.3);
}
