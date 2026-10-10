import { CLOTH_COLORS } from "@yutopia/shared";
import { fe, fr, INK, rnd, type Sketch, sh, te, tr } from "./kit";
import { K, M } from "./pal";

// Lo-fi radio: an aluminium receiver + speakers on a little walnut stand.
// props.on: the tuning VFD and the LED light up. Story: a cassette sticking
// out of the deck.
export function radio(s: Sketch, props: Record<string, unknown>) {
  const on = !!props.on;
  for (const [x, y] of [
    [0.24, 0.24],
    [0.76, 0.24],
    [0.24, 0.76],
    [0.76, 0.76],
  ])
    s.cyl({ x, y, z: 0, r: 0.025, r2: 0.035, h: 11, mat: M.walnutDark, line: 0.5 });
  s.box({ x: 0.18, y: 0.18, w: 0.64, d: 0.64, z: 11, h: 3, mat: M.walnut });
  s.box({ x: 0.12, y: 0.3, w: 0.76, d: 0.4, z: 14, h: 15, mat: M.aluminium }, (d) => {
    // speaker grilles
    for (const u of [0.25, 0.75]) {
      d.poly("s", fe("s", 0.7, u, 21, 0.1, 5.2), K.graphite, { stroke: INK, sw: 0.6 });
      d.poly("s", fe("s", 0.7, u, 21, 0.04, 2), "#4a463e");
    }
    // tuning window + LED + dials
    d.poly("s", fr("s", 0.7, 0.4, 0.6, 24, 27.5), on ? K.amber : "#3a2c1f", { glow: on, stroke: INK, sw: 0.4 });
    if (on)
      for (let i = 0; i < 4; i++)
        d.poly("s", fr("s", 0.7, 0.42 + i * 0.045, 0.45 + i * 0.045, 24.6, 26.8), K.vfd, { glow: true });
    d.poly("s", fe("s", 0.7, 0.45, 18, 0.025, 1.1, 10), on ? K.red : "#5a2a22", { glow: on });
    d.poly("s", fe("s", 0.7, 0.55, 18, 0.035, 1.6, 10), K.graphite);
    // cassette deck slot with a tape poking out (story)
    d.poly("t", tr(29, 0.36, 0.42, 0.64, 0.56), K.graphite);
    d.poly("e", fr("e", 0.88, 0.36, 0.64, 18, 26), sh(K.aluminium, 0.8), { stroke: INK, sw: 0.4 });
  });
  s.box({ x: 0.4, y: 0.44, w: 0.2, d: 0.06, z: 29, h: 4, mat: { c: K.cream }, line: 0.6 }, (d) => {
    d.poly("s", fr("s", 0.5, 0.43, 0.57, 30, 32.5), K.rust);
  });
  // antenna
  s.shape({ x: 0.16, y: 0.36, w: 0.04, d: 0.04, z: 29, h: 18 }, (d) => {
    const a = d.m(0.18, 0.38, 29);
    d.raw(
      `<path d="M${a[0]} ${a[1]} L${a[0] - 9} ${a[1] - 16}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M${a[0]} ${a[1]} L${a[0] - 9} ${a[1] - 16}" stroke="${K.aluminium}" stroke-width=".8" stroke-linecap="round"/><circle cx="${a[0] - 9}" cy="${a[1] - 16}" r="1.1" fill="${K.aluminium}" stroke="${INK}" stroke-width=".5"/>`,
    );
  });
  for (const [x, y] of [
    [0.24, 0.24],
    [0.76, 0.24],
    [0.24, 0.76],
    [0.76, 0.76],
  ])
    s.shadowDot(x, y, 0.05, 0.4);
  s.shadow(0.18, 0.18, 0.64, 0.64, 0.16, 0.5);
}

// 2×1 walnut shelf full of cassettes (spines in the cloth palette, seeded).
// Story: a framed photo and a vinyl leaning on top.
export function tapeShelf(s: Sketch) {
  s.box({ x: 0, y: 0.2, w: 2, d: 0.6, z: 0, h: 46, mat: M.walnut }, (d) => {
    // open front: dark inside, three shelves of cassettes
    d.poly("s", fr("s", 0.8, 0.06, 1.94, 3, 43), "#2a1a10");
    for (const z of [3, 16, 29]) {
      d.poly("s", fr("s", 0.8, 0.06, 1.94, z, z + 1.4), K.walnutLight);
      let x = 0.1;
      let i = 0;
      while (x < 1.84) {
        const w = 0.07;
        const col = CLOTH_COLORS[Math.floor(rnd(i, z, s.seed) * CLOTH_COLORS.length)];
        const h = rnd(i, z + 7, s.seed) > 0.8 ? 7.5 : 9.5;
        d.poly("s", fr("s", 0.8, x, x + w, z + 1.4, z + 1.4 + h), col, { stroke: "#1a100a", sw: 0.3 });
        d.poly("s", fr("s", 0.8, x + 0.015, x + w - 0.015, z + 5, z + 7), K.cream, { op: 0.85 });
        x += w + 0.012 + (rnd(i, z + 1, s.seed) > 0.88 ? 0.09 : 0);
        i++;
      }
    }
  });
  // photo frame on top
  s.box({ x: 0.3, y: 0.42, w: 0.3, d: 0.05, z: 46, h: 11, mat: M.walnutDark, line: 0.8 }, (d) => {
    d.poly("s", fr("s", 0.47, 0.34, 0.56, 48, 55), K.sage);
    d.poly("s", fr("s", 0.47, 0.38, 0.52, 48, 52), K.amberSoft);
  });
  // vinyl sleeve leaning against the wall
  s.box({ x: 1.2, y: 0.24, w: 0.56, d: 0.04, z: 46, h: 16, mat: { c: K.rust }, line: 0.8 }, (d) => {
    d.poly("s", fe("s", 0.28, 1.48, 54, 0.16, 5.5), K.graphite);
    d.poly("s", fe("s", 0.28, 1.48, 54, 0.05, 1.8), K.amberSoft);
  });
  s.shadow(0, 0.2, 2, 0.6, 0.4, 0.3);
}

// Mic stand: tripod, chrome pole, boom, a mic with a pop filter. Story: the
// cable coiled on the floor.
export function micStand(s: Sketch) {
  s.shape({ x: 0.2, y: 0.2, w: 0.8, d: 0.8, z: 0, h: 1 }, (d) => {
    const c = d.m(0.5, 0.5, 4);
    let g = "";
    // coiled cable
    const k = d.m(0.72, 0.72, 0.3);
    g += `<ellipse cx="${k[0]}" cy="${k[1]}" rx="7" ry="3.4" fill="none" stroke="${INK}" stroke-width="2.2"/><ellipse cx="${k[0]}" cy="${k[1]}" rx="7" ry="3.4" fill="none" stroke="#3a3530" stroke-width="1"/><ellipse cx="${k[0] + 1}" cy="${k[1]}" rx="4.5" ry="2" fill="none" stroke="#3a3530" stroke-width="1"/>`;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      const f = d.m(0.5 + Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.28, 0.5);
      g += `<path d="M${c.join(" ")}L${f.join(" ")}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M${c.join(" ")}L${f.join(" ")}" stroke="#46423a" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    d.raw(g);
  });
  s.cyl({ x: 0.5, y: 0.5, z: 3, r: 0.018, h: 38, mat: M.aluminium, line: 0.6 });
  s.shape({ x: 0.5, y: 0.4, w: 0.25, d: 0.15, z: 38, h: 16 }, (d) => {
    const a = d.m(0.5, 0.5, 41);
    const b = [a[0] + 11, a[1] - 9];
    d.raw(
      `<path d="M${a.join(" ")}L${b.join(" ")}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M${a.join(" ")}L${b.join(" ")}" stroke="${K.aluminium}" stroke-width="1.2" stroke-linecap="round"/>` +
        `<ellipse cx="${b[0] - 3}" cy="${b[1] + 1}" rx="4" ry="5" fill="none" stroke="${INK}" stroke-width="1"/><ellipse cx="${b[0] - 3}" cy="${b[1] + 1}" rx="3.4" ry="4.4" fill="#1a1612" opacity=".45"/>` +
        `<rect x="${b[0] - 1}" y="${b[1] - 6}" width="6" height="11" rx="3" fill="${K.graphite}" stroke="${INK}" stroke-width="1"/><rect x="${b[0] - 0.2}" y="${b[1] - 5.2}" width="4.4" height="5" rx="2.2" fill="${K.aluminium}"/><path d="M${b[0]} ${b[1] - 3.6}h4M${b[0]} ${b[1] - 2.2}h4" stroke="#6f6a5e" stroke-width=".5"/>`,
    );
  });
  s.shadowDot(0.5, 0.5, 0.22, 0.32);
}

// 3×1 mixing console: channel strips with faders and knobs, a meter bridge of
// VU LEDs (emissive). Story: a strip of masking tape with channel names.
export function mixingDesk(s: Sketch) {
  s.box({ x: 0, y: 0.15, w: 3, d: 0.8, z: 0, h: 18, mat: M.graphite }, (d) => {
    for (let i = 0; i < 14; i++) {
      const x = 0.12 + i * 0.2;
      // fader slot + cap
      d.poly("t", tr(18, x + 0.02, 0.52, x + 0.04, 0.86), "#14120f");
      const fy = 0.56 + rnd(i, 1) * 0.22;
      d.poly("t", tr(18.2, x - 0.02, fy, x + 0.08, fy + 0.06), K.cream, { stroke: INK, sw: 0.3 });
      // knobs
      for (let k = 0; k < 2; k++) d.poly("t", te(18.2, x + 0.03, 0.44 - k * 0.0, 0.025, 8), k ? K.amberSoft : K.rust);
    }
    // masking tape scribble strip (story)
    d.poly("t", tr(18.1, 0.06, 0.88, 2.94, 0.93), "#e8dbb5");
    for (let i = 0; i < 14; i++) {
      const x = 0.1 + i * 0.2;
      d.line("t", [x, 0.905, 18.2], [x + 0.08 + rnd(i, 4) * 0.06, 0.905, 18.2], "#3b2a1c", 0.6);
    }
    // front panel jacks
    for (let i = 0; i < 14; i++) d.poly("s", fe("s", 0.95, 0.15 + i * 0.2, 9, 0.025, 1.2, 8), "#14120f");
  });
  s.box({ x: 0, y: 0.15, w: 3, d: 0.26, z: 18, h: 14, mat: { c: "#2f2d28", top: "#3c3933" } }, (d) => {
    // meter bridge LEDs (emissive), lit to a fixed "mix"
    for (let i = 0; i < 14; i++) {
      const x = 0.1 + i * 0.2;
      const lit = 2 + Math.floor(rnd(i, 9) * 5);
      for (let k = 0; k < 6; k++) {
        const on = k < lit;
        const col = k >= 5 ? K.red : k >= 4 ? K.amber : K.vfd;
        d.poly("s", fr("s", 0.41, x, x + 0.1, 20 + k * 1.8, 21.2 + k * 1.8), on ? col : "#3a2c1f", { glow: on });
      }
    }
  });
  s.shadow(0, 0.15, 3, 0.8, 0.4, 0.3);
}

// Studio monitor speaker: graphite cabinet, walnut sides, woofer + tweeter.
// Story: a little Yondra sticker on the side.
export function speakerCab(s: Sketch) {
  s.box({ x: 0.1, y: 0.2, w: 0.8, d: 0.62, z: 0, h: 46, mat: M.graphite, faces: { e: M.walnut, w: M.walnut } }, (d) => {
    d.poly("s", fr("s", 0.82, 0.14, 0.86, 2, 44), "#1e1c19");
    for (const [z, r] of [
      [15, 0.24],
      [34, 0.11],
    ]) {
      d.poly("s", fe("s", 0.82, 0.5, z, r, r * 32, 24), "#14120f", { stroke: K.alumDark, sw: 1.1 });
      d.poly("s", fe("s", 0.82, 0.5, z, r * 0.62, r * 20, 20), "#2a2723");
      d.poly("s", fe("s", 0.82, 0.5, z, r * 0.25, r * 8, 12), K.alumDark);
      d.poly("s", fe("s", 0.82, 0.5 - r * 0.1, z + r * 4, r * 0.08, r * 3, 8), "#c9c3b4");
    }
    d.poly("e", fr("e", 0.9, 0.36, 0.5, 30, 35), K.amberSoft, { stroke: INK, sw: 0.4 });
  });
  s.shadow(0.1, 0.2, 0.8, 0.62, 0.42, 0.3);
}
