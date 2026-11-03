import { glyphDots } from "@yutopia/shared/glyphs";
import { type BufferGeometry, Float32BufferAttribute, BufferGeometry as Geo, TorusGeometry } from "three";
import {
  ball,
  box,
  cushion,
  cyl,
  extrude,
  type Look,
  lathe,
  type Model,
  merged,
  rod,
  roundRect,
  tube,
  type V3,
} from "../kit";
import { P, shade } from "../palette";

// Plan 68 phase 8 (docs/plan/68-more-furniture.md): Screens & TVs — the new kinds' models, in the kit's
// frame (x across the footprint, z down it toward the room, y up, metres), Rich and cel; their catalog
// entries, shapes and measures in the shared fam/screens2.ts. A floor piece faces the room (+z); a
// wall piece in its wall's frame, the wall's face at z 0.1; the projector hung from the ceiling at
// 3.27. Their pictures are their own for now (lit while on, `props.on`; dark glass when off): each
// screen's picture sits a hair behind the plane the media's picture would be drawn on — shared
// fam/screens2.ts GLASS, ready for media.ts to take up (a GLASS of their own is the media's central
// work) — and nothing stands in front of that plane but a video wall's seams.

export const LOOKS: Record<string, readonly string[]> = {
  video_wall: ["Aurora", "Vortex", "Test card"],
  ceiling_projector: ["White", "Black"],
  security_monitors: ["Steel, grey monitors", "Black, beige monitors"],
  outdoor_cinema: ["Truss frame", "Timber frame"],
  radio_tv_cabinet: ["Blond oak", "Mahogany", "Walnut"],
};

const FACE = 0.1; // a wall's face
const CEILING = 3.27;
const L = 0.001; // a picture's layer: each a millimetre in front of the one under it (no fighting close up)
/** A picture's foot behind its glass's plane: its layers (up to 14) all just behind that plane. */
const DEEP = 0.0165;

const rnd = (a: number, b: number, s: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const geo = (pos: number[]) => {
  const g = new Geo();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  return g;
};
/** Words in the shared dot face, flat on a face looking +z, from (x, y) its top-left (xmas.ts's). */
function dotText(text: string, x: number, y: number, z: number, p: number): BufferGeometry | null {
  const pos: number[] = [];
  const d = p * 0.82;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) {
      const x0 = x + (i * 6 + c) * p;
      const y1 = y - r * p;
      pos.push(x0, y1 - d, z, x0 + d, y1 - d, z, x0 + d, y1, z, x0, y1 - d, z, x0 + d, y1, z, x0, y1, z);
    }
  return pos.length ? geo(pos) : null;
}
const textW = (text: string, p: number) => (text.length * 6 - 1) * p;

/** Where a picture's pieces go: into the model lit (glow), or gathered by colour (a live part's). */
type Sink = (g: BufferGeometry, c: number) => void;
const glowInto =
  (m: Model): Sink =>
  (g, c) =>
    m.add(g, c, { glow: true });
/** A flat picture drawn on a plane facing +z at `z`: rectangles, discs, outlines, words, each on a
 *  layer a hair in front of the one under it. */
class Pic {
  constructor(
    private sink: Sink,
    private z: number,
  ) {}
  rect(x: number, y: number, w: number, h: number, c: number, layer = 0, rot = 0) {
    this.sink(
      box([w, h, 0.0002])
        .rotateZ(rot)
        .translate(x, y, this.z + layer * L),
      c,
    );
  }
  disc(x: number, y: number, r: number, c: number, layer = 0, sx = 1, sy = 1, seg = 28) {
    this.sink(
      rod(r, r, 0.0002, "z", seg)
        .scale(sx, sy, 1)
        .translate(x, y, this.z + layer * L),
      c,
    );
  }
  shape(outline: [number, number][], c: number, layer = 0) {
    this.sink(extrude(outline, 0.0002).translate(0, 0, this.z + layer * L), c);
  }
  text(t: string, x: number, y: number, p: number, c: number, layer = 0) {
    const g = dotText(t, x, y, this.z + layer * L, p);
    if (g) this.sink(g, c);
  }
}
/** A picture's pieces gathered by colour, to be live parts (each colour its own, moving together). */
function gather(): { sink: Sink; parts: Map<number, BufferGeometry[]> } {
  const parts = new Map<number, BufferGeometry[]>();
  return {
    parts,
    sink: (g, c) => {
      const list = parts.get(c) ?? [];
      list.push(g);
      parts.set(c, list);
    },
  };
}

/** Dark glass over a rectangle facing +z, and its soft reflection: a screen switched off. */
function darkGlass(m: Model, x: number, y: number, w: number, h: number, z: number) {
  m.add(box([w, h, 0.002]), P.glass, { at: [x, y, z - 0.001] });
  m.add(box([w * 0.6, Math.min(0.012, h * 0.04), 0.001]), shade(P.glass, 2.1), {
    at: [x - w * 0.1, y + h * 0.36, z + 0.0002],
    rot: [0, 0, 0.06],
  });
}

// ── the video wall (wall, 6 wide) ─────────────────────────────────────────────────────────────────
/** The array: nine panels, 3 × 3, their pictures' plane (shared GLASS.video_wall). */
export const VW = { x0: 0.6, x1: 5.4, y0: 0.34, y1: 3.04, face: 0.2 };
/** Nine thin-bezelled panels on a steel frame, the picture spread across them all (its seams between):
 *  an aurora over the snowy hills, Vortex's grin (he blinks), or the test card; dark glass when off.
 *  The aurora's curtains shimmer (sets lit in turn). */
function videoWall(m: Model, o: Look) {
  const on = o.on !== false;
  const { x0, x1, y0, y1, face } = VW;
  const W = x1 - x0;
  const H = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const gap = 0.008;
  const pw = (W - 2 * gap) / 3;
  const ph = (H - 2 * gap) / 3;
  // the frame on the wall: its back, the struts, the panels' cases
  m.add(box([W + 0.1, H + 0.08, 0.05], 0.006), 0x1b1c1f, { at: [cx, cy, FACE + 0.025] });
  for (const x of [x0 + 0.5, cx, x1 - 0.5]) m.add(box([0.08, H + 0.04, 0.02]), P.steel, { at: [x, cy, FACE + 0.06] });
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const px = x0 + pw / 2 + i * (pw + gap);
      const py = y0 + ph / 2 + j * (ph + gap);
      m.add(box([pw, ph, 0.03], 0.003), 0x141416, { at: [px, py, face - 0.035] });
      if (!on) darkGlass(m, px, py, pw - 0.006, ph - 0.006, face - 0.0015);
    }
  // its status light under the bottom right panel
  m.add(box([0.012, 0.006, 0.004]), on ? P.ledGreen : P.led, { at: [x1 - 0.05, y0 - 0.025, FACE + 0.05], glow: true });
  if (!on) return;
  const z = face - DEEP;
  const p = new Pic(glowInto(m), z);
  // (the seams over the picture, a hair in front of it: the panels' bezels)
  for (const k of [1, 2]) {
    p.rect(x0 + k * (pw + gap) - gap / 2, cy, gap, H, 0x08080a, 13);
    p.rect(cx, y0 + k * (ph + gap) - gap / 2, W, gap, 0x08080a, 13);
  }
  if (o.look === 1) vortexPicture(m, p, cx, cy, W, H, z);
  else if (o.look === 2) testCard(p, x0, y0, W, H);
  else auroraPicture(m, p, x0, y0, W, H, z);
}

function auroraPicture(m: Model, p: Pic, x0: number, y0: number, W: number, H: number, z: number) {
  const cx = x0 + W / 2;
  // the sky: bands from the deep night down to the glow over the hills
  const sky = [0x070b22, 0x0a1230, 0x0d1a3c, 0x10254a, 0x143457, 0x1a4762, 0x1f5a6a];
  sky.forEach((c, i) => {
    p.rect(cx, y0 + H - (i + 0.5) * (H / sky.length), W, H / sky.length + 0.002, c, 0);
  });
  // stars, the moon
  for (let i = 0; i < 70; i++) {
    const s = 0.008 + rnd(i, 1, 1) * 0.012;
    p.rect(
      x0 + rnd(i, 1, 2) * W,
      y0 + H * (0.45 + rnd(i, 1, 3) * 0.55),
      s,
      s,
      rnd(i, 1, 4) > 0.8 ? 0xffe9c0 : 0xdfe8ff,
      1,
    );
  }
  p.disc(x0 + W * 0.84, y0 + H * 0.82, 0.13, 0xf4f0dc, 1);
  p.disc(x0 + W * 0.84 + 0.05, y0 + H * 0.82 + 0.03, 0.11, sky[1], 2);
  // the aurora: three curtains along slow waves, their tops rayed, a violet fringe over each, lit in
  // turn (live: they shimmer, one fading as the next comes)
  for (let s = 0; s < 3; s++) {
    const N = 56;
    const base = (u: number) => y0 + H * (0.4 + 0.1 * Math.sin(u * 5.3 + s * 1.9) + 0.04 * Math.sin(u * 13 + s * 2.3));
    const tall = (u: number, i: number) =>
      (0.35 + 0.5 * (0.5 + 0.5 * Math.sin(u * 7.7 + s * 1.3))) * (i % 2 ? 0.82 : 1) * (0.85 + 0.15 * rnd(i, s, 5));
    const lo: [number, number][] = [];
    const hi: [number, number][] = [];
    const fringe: [number, number][] = [];
    const u0 = 0.04 + s * 0.06;
    const u1 = 0.96 - (2 - s) * 0.05;
    for (let i = 0; i <= N; i++) {
      const u = u0 + ((u1 - u0) * i) / N;
      const x = x0 + u * W;
      const b = base(u);
      const t = b + tall(u, i);
      lo.push([x, b]);
      hi.push([x, t]);
      fringe.push([x, t + 0.12 + 0.1 * Math.sin(u * 11 + s)]);
    }
    // (the curtain in rays: a strip a step, two thirds of it lit, the sky between)
    const rays: BufferGeometry[] = [];
    for (let i = 0; i < N; i++) {
      const [xa, ba] = lo[i];
      const [xb0, bb0] = lo[i + 1];
      const xb = xa + (xb0 - xa) * 0.66;
      const bb = ba + (bb0 - ba) * 0.66;
      const ta = hi[i][1];
      const tb = ta + (hi[i + 1][1] - ta) * 0.66;
      rays.push(
        extrude(
          [
            [xa, ba],
            [xb, bb],
            [xb, tb],
            [xa, ta],
          ],
          0.0002,
        ),
      );
    }
    const curtain = merged(rays).translate(0, 0, z + (3 + s) * L);
    const top = extrude(
      [...hi.map(([x, y]) => [x, y - 0.04] as [number, number]), ...fringe.reverse()],
      0.0002,
    ).translate(0, 0, z + (3 + s) * L);
    const blink = { kind: "blink", period: 5.4, on: 0.72, phase: s / 3 } as const;
    m.live(curtain, [0x3fe89a, 0x2fd0a0, 0x5af0b0][s], blink, { glow: true });
    m.live(top, [0x9a6cf0, 0x6a6ce0, 0xc06cd8][s], blink, { glow: true });
  }
  // the hills, their snow, the foreground firs and a cabin's lit window
  const hills: [number, number][] = [[x0, y0]];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    hills.push([x0 + u * W, y0 + H * (0.22 + 0.12 * Math.sin(u * 7.3) + 0.08 * Math.sin(u * 15.1 + 1))]);
  }
  hills.push([x0 + W, y0]);
  p.shape(hills, 0x1a2440, 7);
  // (snow on each peak)
  for (let i = 1; i < 24; i++) {
    const [hx, hy] = hills[i + 1];
    if (!(hy > hills[i][1] && hy > hills[i + 2][1])) continue;
    p.shape(
      [
        [hx - 0.12, hy - 0.06],
        [hx, hy + 0.01],
        [hx + 0.12, hy - 0.06],
      ],
      0x9fb4d8,
      8,
    );
  }
  p.rect(x0 + W / 2, y0 + H * 0.06, W, H * 0.12, 0x2a3a5c, 9);
  for (let i = 0; i < 18; i++) {
    const x = x0 + 0.08 + rnd(i, 2, 1) * (W - 0.16);
    const h = 0.18 + rnd(i, 2, 2) * 0.22;
    const b = y0 + H * 0.1;
    p.shape(
      [
        [x - h * 0.3, b],
        [x + h * 0.3, b],
        [x, b + h],
      ],
      0x060914,
      10,
    );
  }
  p.rect(x0 + W * 0.3, y0 + H * 0.14, 0.12, 0.08, 0x060914, 10);
  p.rect(x0 + W * 0.3, y0 + H * 0.14, 0.03, 0.03, 0xffc27a, 11);
}

function vortexPicture(m: Model, p: Pic, cx: number, cy: number, W: number, H: number, z: number) {
  // his night: deep violet, a glow behind him, motes
  p.rect(cx, cy, W, H, 0x12061e, 0);
  p.disc(cx, cy, 1.25, 0x2a0a40, 1, 1.15, 1);
  for (let i = 0; i < 26; i++)
    p.disc(
      cx + (rnd(i, 3, 1) - 0.5) * W * 0.95,
      cy + (rnd(i, 3, 2) - 0.5) * H * 0.9,
      0.015 + rnd(i, 3, 3) * 0.02,
      i % 2 ? 0x00e5d0 : 0xff8fd4,
      2,
      1,
      1,
      8,
    );
  // him: the orb, its rim, the sheen, the swirl
  const R = 1.08;
  p.disc(cx, cy, R + 0.035, 0xff2d95, 3, 1, 1, 48);
  p.disc(cx, cy, R, 0xe0157f, 4, 1, 1, 48);
  p.disc(cx - 0.18, cy + 0.18, R * 0.62, 0xf04aa0, 5, 1, 1, 40);
  p.disc(cx - 0.38, cy + 0.52, 0.24, 0xff9ad2, 6, 1.3, 0.7, 24);
  const arc = (r: number, a0: number, a1: number, w: number, c: number, layer: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const a = a0 + ((a1 - a0) * i) / 20;
      out.push([cx + Math.cos(a) * (r + w / 2), cy + Math.sin(a) * (r + w / 2)]);
    }
    for (let i = 20; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / 20;
      out.push([cx + Math.cos(a) * (r - w / 2), cy + Math.sin(a) * (r - w / 2)]);
    }
    p.shape(out, c, layer);
  };
  arc(0.74, 1.6, 5.4, 0.07, 0xf8b8dc, 7);
  arc(0.44, 1.7, 4.8, 0.035, 0x2ad8c8, 7);
  // the eyes, the pupils, their glints
  for (const s of [-1, 1]) {
    p.disc(cx + s * 0.27, cy + 0.12, 0.2, 0xffffff, 8, 0.82, 1.02, 28);
    p.disc(cx + s * 0.25, cy + 0.11, 0.11, 0x1a0033, 9, 0.9, 1, 20);
    p.disc(cx + s * 0.25 - 0.04, cy + 0.17, 0.03, 0xffffff, 10, 1, 1, 10);
  }
  // he blinks: his lids over his eyes for a moment
  m.live(
    merged(
      [-1, 1].map((s) =>
        rod(0.21, 0.21, 0.0002, "z", 28)
          .scale(0.84, 1.04, 1)
          .translate(cx + s * 0.27, cy + 0.12, z + 11 * L),
      ),
    ),
    0xc0207a,
    { kind: "blink", period: 4.3, on: 0.05, phase: 0 },
    { glow: true },
  );
  // the grin, its tongue
  const grin: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = -1 + (2 * i) / 16;
    grin.push([cx + t * 0.36, cy - 0.3 - (1 - t * t) * 0.3]);
  }
  for (let i = 16; i >= 0; i--) {
    const t = -1 + (2 * i) / 16;
    grin.push([cx + t * 0.36, cy - 0.3 - (1 - t * t) * 0.1]);
  }
  p.shape(grin, 0x1a0033, 8);
  p.disc(cx + 0.03, cy - 0.5, 0.11, 0xff5fa8, 9, 1, 0.45, 18);
}

function testCard(p: Pic, x0: number, y0: number, W: number, H: number) {
  const bars = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
  const bw = W / 7;
  const top = H * 0.67;
  bars.forEach((c, i) => {
    p.rect(x0 + (i + 0.5) * bw, y0 + H - top / 2, bw + 0.001, top, c, 0);
  });
  const mid = [0x0000c0, 0x111111, 0xc000c0, 0x111111, 0x00c0c0, 0x111111, 0xc0c0c0];
  mid.forEach((c, i) => {
    p.rect(x0 + (i + 0.5) * bw, y0 + H - top - H * 0.04, bw + 0.001, H * 0.08, c, 0);
  });
  const low: [number, number][] = [
    [0x00214c, 1.25],
    [0xffffff, 1.25],
    [0x32006a, 1.25],
    [0x111111, 1.25],
    [0x090909, 0.33],
    [0x111111, 0.34],
    [0x1d1d1d, 0.33],
    [0x111111, 1],
  ];
  let x = x0;
  for (const [c, k] of low) {
    p.rect(x + (k * bw) / 2, y0 + H * 0.125, k * bw + 0.001, H * 0.25, c, 0);
    x += k * bw;
  }
  // the circle over it, the name in its box
  p.disc(x0 + W / 2, y0 + H * 0.56, 1.0, 0xe8e8e8, 1, 1, 1, 48);
  p.disc(x0 + W / 2, y0 + H * 0.56, 0.97, 0x000000, 2, 1, 1, 48);
  p.rect(x0 + W / 2, y0 + H * 0.56, 1.9, 0.004, 0xe8e8e8, 3);
  p.rect(x0 + W / 2, y0 + H * 0.56, 0.004, 1.9, 0xe8e8e8, 3);
  for (let i = 0; i < 6; i++)
    p.rect(x0 + W / 2 - 0.6 + i * 0.24, y0 + H * 0.56 - 0.35, 0.12, 0.2, i % 2 ? 0xe8e8e8 : 0x404040, 3);
  const t = "YUTOPIA";
  const q = 0.034;
  p.rect(x0 + W / 2, y0 + H * 0.56 + 0.22, textW(t, q) + 0.14, 7 * q + 0.1, 0x111111, 3);
  p.text(t, x0 + W / 2 - textW(t, q) / 2, y0 + H * 0.56 + 0.22 + 3.5 * q, q, 0xffffff, 4);
}

// ── the ceiling projector ─────────────────────────────────────────────────────────────────────────
/** A projector hung from the ceiling on its pole: the ceiling plate, the telescoping pole and its
 *  cable, the cradle's arms round the case, the case (its vents, the lens out front with its focus
 *  ring, the status light), the lens lit while on. White or black. */
function ceilingProjector(m: Model, o: Look) {
  const on = o.on !== false;
  const black = o.look === 1;
  const body = black ? 0x26272b : 0xe6e3dc;
  const trim = black ? 0x3a3b40 : 0xb8b6b0;
  const PY = 2.66; // the case's middle
  m.add(cyl(0.08, 0.08, 0.016, 18), trim, { at: [0.5, CEILING - 0.016, 0.5] });
  m.add(cyl(0.022, 0.022, 0.26, 10), trim, { at: [0.5, CEILING - 0.27, 0.5] });
  m.add(cyl(0.016, 0.016, 0.24, 10), P.chrome, { at: [0.5, PY + 0.07, 0.5] });
  m.add(cyl(0.024, 0.024, 0.02, 10), trim, { at: [0.5, CEILING - 0.28, 0.5] });
  // the cradle: a plate, four arms down to the case's sides
  m.add(box([0.24, 0.012, 0.18], 0.003), trim, { at: [0.5, PY + 0.085, 0.5] });
  for (const [x, z] of [
    [0.39, 0.42],
    [0.61, 0.42],
    [0.39, 0.6],
    [0.61, 0.6],
  ])
    m.add(box([0.012, 0.05, 0.012]), trim, { at: [x, PY + 0.06, z] });
  // the case
  m.add(box([0.36, 0.11, 0.3], 0.025, 2), body, { at: [0.5, PY, 0.52] });
  m.add(box([0.37, 0.012, 0.31], 0.004), shade(body, 0.85), { at: [0.5, PY - 0.05, 0.52] });
  for (let i = 0; i < 6; i++) m.add(box([0.004, 0.05, 0.012]), shade(body, 0.6), { at: [0.681, PY, 0.42 + i * 0.03] });
  for (let i = 0; i < 6; i++) m.add(box([0.004, 0.05, 0.012]), shade(body, 0.6), { at: [0.319, PY, 0.42 + i * 0.03] });
  // the lens: its bezel, the barrel, the focus ring, the glass
  m.add(rod(0.05, 0.05, 0.012, "z", 20), shade(body, 0.8), { at: [0.42, PY, 0.675] });
  m.add(rod(0.038, 0.036, 0.04, "z", 20), 0x1d1e21, { at: [0.42, PY, 0.69] });
  m.add(new TorusGeometry(0.039, 0.004, 3, 20), P.graphite, { at: [0.42, PY, 0.7] });
  m.add(rod(0.03, 0.03, 0.002, "z", 20), on ? 0xfff6dc : P.glass, { at: [0.42, PY, 0.711], glow: on });
  if (on) m.add(rod(0.016, 0.016, 0.001, "z", 14), 0xffffff, { at: [0.42, PY, 0.7125], glow: true });
  // its buttons on top, the status light
  for (let i = 0; i < 3; i++)
    m.add(box([0.016, 0.004, 0.012], 0.002), trim, { at: [0.57 + i * 0.024, PY + 0.056, 0.6] });
  m.add(box([0.012, 0.004, 0.004]), on ? 0x6ab8ff : P.led, { at: [0.6, PY + 0.02, 0.672], glow: true });
  // the cable down the pole into its back
  m.add(
    tube(
      [
        [0.52, CEILING - 0.02, 0.5],
        [0.525, PY + 0.2, 0.505],
        [0.53, PY + 0.09, 0.39],
        [0.55, PY + 0.02, 0.365],
      ],
      0.005,
      4,
      12,
    ),
    P.rubber,
  );
}

// ── the security monitor bank (2×1) ───────────────────────────────────────────────────────────────
const CCTV = { dark: 0x1a2620, mid: 0x4e6a5a, light: 0x8fb09a, bright: 0xd8f0dc };
type Scene = (p: Pic, x: number, y: number, w: number, h: number, l: number) => void;
/** A long corridor going away: its floor, walls, the lights down its ceiling, a door each side. */
const corridor: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y, w, h, CCTV.mid, l);
  p.shape(
    [
      [x - w / 2, y - h / 2],
      [x + w / 2, y - h / 2],
      [x + w * 0.08, y - h * 0.05],
      [x - w * 0.08, y - h * 0.05],
    ],
    CCTV.light,
    l + 1,
  );
  p.rect(x, y + h * 0.02, w * 0.16, h * 0.14, CCTV.dark, l + 1);
  for (let i = 0; i < 3; i++)
    p.rect(x, y + h * (0.42 - i * 0.12), w * (0.22 - i * 0.06), h * 0.025, CCTV.bright, l + 2);
  for (const s of [-1, 1])
    p.shape(
      [
        [x + s * w * 0.32, y - h * 0.3],
        [x + s * w * 0.2, y - h * 0.18],
        [x + s * w * 0.2, y + h * 0.16],
        [x + s * w * 0.32, y + h * 0.26],
      ],
      CCTV.dark,
      l + 2,
    );
};
/** A car park: the tarmac, its lines, two cars, a lamp's pool. */
const carPark: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y, w, h, CCTV.dark, l);
  p.disc(x + w * 0.2, y + h * 0.1, w * 0.22, CCTV.mid, l + 1, 1.3, 0.8, 16);
  for (let i = 0; i < 5; i++) p.rect(x - w * 0.4 + i * w * 0.2, y - h * 0.05, 0.006, h * 0.5, CCTV.light, l + 2, 0.5);
  for (const [cx2, cy2] of [
    [-0.12, -0.08],
    [0.16, 0.0],
  ]) {
    p.rect(x + w * cx2, y + h * cy2, w * 0.16, h * 0.18, CCTV.light, l + 3, 0.5);
    p.rect(x + w * cx2, y + h * cy2, w * 0.08, h * 0.1, CCTV.dark, l + 4, 0.5);
  }
};
/** The snow outside: the white ground, the firs, the lamp post. */
const outside: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y + h * 0.25, w, h * 0.5, CCTV.mid, l);
  p.rect(x, y - h * 0.25, w, h * 0.5, CCTV.bright, l);
  for (let i = 0; i < 5; i++) {
    const tx = x - w * 0.4 + i * w * 0.2 + rnd(i, 4, 1) * 0.02;
    const th = h * (0.3 + rnd(i, 4, 2) * 0.2);
    p.shape(
      [
        [tx - th * 0.25, y],
        [tx + th * 0.25, y],
        [tx, y + th],
      ],
      CCTV.dark,
      l + 1,
    );
  }
  p.rect(x + w * 0.3, y - h * 0.05, 0.006, h * 0.5, CCTV.dark, l + 2);
  p.disc(x + w * 0.3, y + h * 0.2, 0.012, CCTV.bright, l + 3, 1, 1, 8);
};
/** A stairwell: its steps going up, the rail. */
const stairs: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y, w, h, CCTV.mid, l);
  for (let i = 0; i < 6; i++)
    p.rect(
      x - w * 0.3 + i * w * 0.1,
      y - h * 0.5 + (i + 1) * h * 0.07,
      w * 0.12,
      h * 0.14 * (i + 1) * 0.5,
      i % 2 ? CCTV.light : shade(CCTV.light, 0.9),
      l + 1,
    );
  p.rect(x, y + h * 0.05, w * 0.7, 0.006, CCTV.dark, l + 2, 0.55);
};
/** A lobby: the door and its window, the reception's desk, a plant. */
const lobby: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y, w, h, CCTV.mid, l);
  p.rect(x, y - h * 0.32, w, h * 0.36, CCTV.light, l + 1);
  p.rect(x - w * 0.2, y + h * 0.05, w * 0.2, h * 0.6, CCTV.dark, l + 2);
  p.rect(x - w * 0.2, y + h * 0.18, w * 0.12, h * 0.18, CCTV.bright, l + 3);
  p.rect(x + w * 0.18, y - h * 0.18, w * 0.34, h * 0.16, CCTV.dark, l + 2);
  p.disc(x + w * 0.4, y - h * 0.05, 0.03, CCTV.dark, l + 2, 1, 1.3, 10);
};
/** The lifts: two doors, their numbers. */
const lifts: Scene = (p, x, y, w, h, l) => {
  p.rect(x, y, w, h, CCTV.light, l);
  for (const s of [-1, 1]) {
    p.rect(x + s * w * 0.2, y - h * 0.1, w * 0.28, h * 0.62, CCTV.mid, l + 1);
    p.rect(x + s * w * 0.2, y - h * 0.1, 0.004, h * 0.62, CCTV.dark, l + 2);
    p.rect(x + s * w * 0.2, y + h * 0.3, w * 0.06, h * 0.06, CCTV.bright, l + 2);
  }
};
const SCENES: Scene[] = [corridor, lobby, carPark, outside, stairs, lifts];

/** A steel rack on castors, six CRT monitors on its shelves, each a camera's grey-green picture with its
 *  name and the time over it and a REC light blinking — the top right one cycling its cameras (live)
 *  — under them the VCR blinking 12:00, the switcher and its joystick, a mug for the night shift. */
function securityMonitors(m: Model, o: Look) {
  const on = o.on !== false;
  const black = o.look === 1;
  const rack = black ? 0x232427 : 0x8a8d90;
  const crt = black ? 0xcfc3a3 : 0x9a9a96;
  const SH = [0.1, 0.6, 1.1, 1.6]; // the shelves' tops
  for (const x of [0.06, 1.94])
    for (const z of [0.23, 0.77]) {
      m.add(box([0.03, SH[3] - 0.05, 0.03]), rack, { at: [x, 0.05 + (SH[3] - 0.05) / 2, z] });
      m.add(ball(0.025, 6), P.rubber, { at: [x, 0.025, z] });
    }
  for (const y of SH) m.add(box([1.92, 0.025, 0.58]), shade(rack, 0.9), { at: [1, y - 0.0125, 0.5] });
  // the monitors
  const sw = 0.4;
  const sh = 0.3;
  let k = 0;
  for (const row of [0, 1])
    for (const col of [0, 1, 2]) {
      const x = 0.35 + col * 0.65;
      const base = SH[1 + row];
      const cy = base + 0.235;
      m.add(box([0.54, 0.44, 0.2], 0.02, 1), crt, { at: [x, base + 0.22, 0.68] });
      m.add(box([0.42, 0.34, 0.2], 0.04, 1), shade(crt, 0.9), { at: [x, base + 0.21, 0.5] });
      m.add(box([sw + 0.04, sh + 0.04, 0.01], 0.006), shade(crt, 0.7), { at: [x, cy, 0.775] });
      // its chin: the buttons, the power light, the camera's number on tape
      for (let b = 0; b < 3; b++)
        m.add(box([0.02, 0.012, 0.006]), P.ink, { at: [x + 0.12 + b * 0.03, base + 0.035, 0.793] });
      m.add(box([0.008, 0.008, 0.004]), on ? P.ledGreen : P.led, { at: [x - 0.2, base + 0.035, 0.794], glow: on });
      m.add(box([0.06, 0.018, 0.001]), P.paperWhite, { at: [x - 0.1, base + 0.035, 0.7955] });
      const zf = 0.8;
      if (!on) {
        darkGlass(m, x, cy, sw, sh, zf - 0.001);
        k++;
        continue;
      }
      const p = new Pic(glowInto(m), zf - DEEP);
      const cyc = row === 1 && col === 2;
      if (!cyc) SCENES[k % SCENES.length](p, x, cy, sw, sh, 0);
      else {
        // (cycling its cameras: two pictures, each lit in turn — a part a colour, blinking together)
        for (const [i, scene] of [carPark, lifts].entries()) {
          const g = gather();
          scene(new Pic(g.sink, zf - DEEP), x, cy, sw, sh, 0);
          for (const [c, gs] of g.parts)
            m.live(merged(gs), c, { kind: "blink", period: 6, on: 0.5, phase: i * 0.5 }, { glow: true });
        }
      }
      // its scanlines, the camera's name, the time
      for (let s = 0; s < 7; s++) p.rect(x, cy - sh / 2 + (s + 0.5) * (sh / 7), sw, 0.004, 0x0e1612, 12);
      p.text(`CAM ${k + 1}`, x - sw / 2 + 0.015, cy - sh / 2 + 0.05, 0.0042, CCTV.bright, 13);
      const t = `0${2 + (k % 3)}:${String(10 + ((k * 17) % 50))}`;
      p.text(t, x + sw / 2 - 0.015 - textW(t, 0.0042), cy + sh / 2 - 0.015, 0.0042, CCTV.bright, 13);
      k++;
    }
  // the REC lights, blinking together
  if (on)
    m.live(
      merged(
        [0, 1].flatMap((row) =>
          [0, 1, 2].map((col) =>
            rod(0.007, 0.007, 0.0002, "z", 10).translate(
              0.35 + col * 0.65 - sw / 2 + 0.025,
              SH[1 + row] + 0.235 + sh / 2 - 0.022,
              0.8 - DEEP + 14 * L,
            ),
          ),
        ),
      ),
      0xff3a2a,
      { kind: "blink", period: 1.2, on: 0.55, phase: 0 },
      { glow: true },
    );
  // the bottom shelf: the VCR (blinking 12:00), the switcher and its joystick, a mug
  const vy = SH[0];
  m.add(box([0.44, 0.09, 0.34], 0.006, 1), 0x1d1d1f, { at: [0.4, vy + 0.045, 0.56] });
  m.add(box([0.2, 0.012, 0.004]), 0x0a0a0a, { at: [0.33, vy + 0.06, 0.732] });
  m.add(box([0.1, 0.03, 0.002]), 0x102018, { at: [0.52, vy + 0.05, 0.731] });
  for (let b = 0; b < 5; b++)
    m.add(box([0.024, 0.01, 0.006]), P.graphite, { at: [0.24 + b * 0.034, vy + 0.025, 0.732] });
  const clock = dotText("12:00", 0, 0, 0, 0.003);
  if (clock && on)
    m.live(
      clock.translate(0.52 - textW("12:00", 0.003) / 2, vy + 0.06, 0.7325),
      0x7fe0c0,
      { kind: "blink", period: 1, on: 0.5, phase: 0 },
      { glow: true },
    );
  m.add(box([0.6, 0.07, 0.3], 0.006, 1), shade(rack, 0.6), { at: [1.18, vy + 0.035, 0.6] });
  for (let b = 0; b < 8; b++) {
    m.add(box([0.04, 0.012, 0.03]), P.cream, { at: [0.94 + b * 0.068, vy + 0.075, 0.68] });
    m.add(box([0.008, 0.004, 0.008]), b === 2 && on ? 0xff3a2a : 0x3a2a22, {
      at: [0.94 + b * 0.068, vy + 0.074, 0.65],
      glow: b === 2 && on,
    });
  }
  m.add(box([0.18, 0.04, 0.16], 0.008, 1), P.graphite, { at: [1.7, vy + 0.02, 0.62] });
  m.add(cyl(0.008, 0.006, 0.07, 8), P.ink, { at: [1.7, vy + 0.04, 0.62], rot: [0.2, 0, 0.15] });
  m.add(ball(0.016, 8), 0xc8302c, { at: [1.71, vy + 0.11, 0.632] });
  if (o.seed > 0.4) {
    m.add(
      lathe(
        [
          [0.001, 0],
          [0.04, 0],
          [0.042, 0.1],
          [0.038, 0.1],
          [0.036, 0.008],
          [0.001, 0.008],
        ],
        14,
      ),
      0xe6ddcb,
      { at: [1.86, vy, 0.5] },
    );
    m.add(cyl(0.035, 0.035, 0.002, 14), 0x3a2418, { at: [1.86, vy + 0.085, 0.5] });
    m.add(new TorusGeometry(0.025, 0.006, 4, 10, Math.PI), 0xe6ddcb, {
      at: [1.86, vy + 0.05, 0.54],
      rot: [0, Math.PI / 2, -Math.PI / 2],
    });
  }
  // the sign on the top shelf's lip
  m.add(box([0.36, 0.06, 0.004]), 0xd9a441, { at: [1, SH[3] - 0.04, 0.792] });
  const sign = dotText("CCTV", 1 - textW("CCTV", 0.006) / 2, SH[3] - 0.019, 0.7945, 0.006);
  if (sign) m.add(sign, P.ink);
}

// ── the outdoor cinema screen (6×2, outside) ──────────────────────────────────────────────────────
/** Its picture's plane (shared GLASS.outdoor_cinema): the screen, facing the audience (+z). */
export const OC = { x0: 0.4, x1: 5.6, y0: 1.0, y1: 3.925, face: 0.5 };
const TRUSS = 0xc9ccd0;
/** A square truss along a line: four chords and the zig-zag lacing on its four faces. */
function truss(m: Model, a: V3, b: V3, s: number, c: number) {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  const vert = Math.abs(d[1]) > Math.abs(d[0]);
  // the two directions across it
  const u: V3 = vert ? [1, 0, 0] : [0, 1, 0];
  const v: V3 = [0, 0, 1];
  const at = (t: number, i: number, j: number): V3 => [
    a[0] + d[0] * t + (u[0] * i + v[0] * j) * (s / 2),
    a[1] + d[1] * t + (u[1] * i + v[1] * j) * (s / 2),
    a[2] + d[2] * t + (u[2] * i + v[2] * j) * (s / 2),
  ];
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [i, j] of corners) m.add(tube([at(0, i, j), at(1, i, j)], 0.02, 6, 1), c);
  const n = Math.max(2, Math.round(len / 0.3));
  for (let k = 0; k < n; k++)
    for (let f = 0; f < 4; f++) {
      const [i0, j0] = corners[f];
      const [i1, j1] = corners[(f + 1) % 4];
      const t0 = k / n;
      const t1 = (k + 1) / n;
      m.add(
        k % 2
          ? tube([at(t0, i0, j0), at(t1, i1, j1)], 0.008, 4, 1)
          : tube([at(t0, i1, j1), at(t1, i0, j0)], 0.008, 4, 1),
        c,
      );
    }
}
/** A cinema screen out on the snow: a matte screen in its black border, laced to its frame — aluminium
 *  truss towers and a truss across, braced back to sandbags; or timber posts and a beam with CINEMA
 *  on it, braced to concrete footings — showing a silent film's moon and rocket while on (its scratches
 *  flicker). */
function outdoorCinema(m: Model, o: Look) {
  const on = o.on !== false;
  const wood = o.look === 1;
  const { x0, x1, y0, y1, face } = OC;
  const W = x1 - x0;
  const H = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const TOP = 4.3;
  const timber = 0x8a6038;
  // the frame: two towers (posts), a span across their tops, braces back to the weights
  for (const x of [0.16, 5.84]) {
    if (wood) {
      m.add(box([0.2, TOP, 0.2], 0.01), timber, { at: [x, TOP / 2, 0.45] });
      m.add(box([0.26, 0.04, 0.26], 0.006), shade(timber, 0.7), { at: [x, 0.02, 0.45] });
    } else {
      truss(m, [x, 0.06, 0.45], [x, TOP - 0.24, 0.45], 0.22, TRUSS);
      m.add(box([0.3, 0.012, 0.3], 0.003), P.steel, { at: [x, 0.006, 0.45] });
      m.add(box([0.26, 0.04, 0.26], 0.004), P.steel, { at: [x, 0.04, 0.45] });
    }
    // the brace back, and its weight
    m.add(
      tube(
        [
          [x, 2.2, 0.52],
          [x, 0.4, 0.84],
        ],
        wood ? 0.05 : 0.025,
        wood ? 4 : 6,
        1,
      ),
      wood ? timber : TRUSS,
    );
    if (wood) {
      m.add(box([0.3, 0.34, 0.3], 0.01), 0xa8a49a, { at: [x, 0.17, 0.83] });
      m.add(box([0.12, 0.08, 0.12], 0.005), P.steel, { at: [x, 0.38, 0.84] });
    } else {
      for (const [dy, dz, r] of [
        [0.09, 0.78, 0],
        [0.09, 0.88, 0.1],
        [0.23, 0.83, -0.1],
        [0.37, 0.84, 0.05],
      ])
        m.add(cushion([0.3, 0.14, 0.2], 0.25, 1), 0xb8a47a, {
          at: [x + (x < 3 ? 0.04 : -0.04), dy, dz],
          rot: [0, r, 0],
        });
      m.add(box([0.06, 0.06, 0.06], 0.005), P.steel, { at: [x, 0.42, 0.84] });
    }
  }
  if (wood) {
    m.add(box([5.92, 0.26, 0.24], 0.01), timber, { at: [3, TOP - 0.13, 0.45] });
    // CINEMA on the beam, in pale dots
    const q = 0.026;
    const t = dotText("CINEMA", 3 - textW("CINEMA", q) / 2, TOP - 0.13 + 3.5 * q, 0.571, q);
    if (t) m.add(t, on ? 0xffe6b0 : 0xe9e6df, { glow: on });
    // planks behind the screen
    for (let i = 0; i < 12; i++)
      m.add(box([W + 0.2, (H + 0.2) / 12 - 0.01, 0.03]), shade(timber, 0.9 + (i % 3) * 0.06), {
        at: [cx, y0 - 0.1 + ((i + 0.5) * (H + 0.2)) / 12, face - 0.075],
      });
  } else truss(m, [0.05, TOP - 0.12, 0.45], [5.95, TOP - 0.12, 0.45], 0.22, TRUSS);
  // the screen: its black border, the cloth, the lacing round it to the frame
  const bw = 0.08;
  m.add(box([W + 2 * bw, H + 2 * bw, 0.05], 0.006), 0x111112, { at: [cx, cy, face - 0.045] });
  for (let i = 0; i <= 16; i++) {
    const x = x0 + (i / 16) * W;
    m.add(
      tube(
        [
          [x, y1 + bw, face - 0.02],
          [x, TOP - 0.24, 0.45],
        ],
        0.004,
        3,
        1,
      ),
      0x2a2a2a,
    );
  }
  for (const [x, s] of [
    [x0 - bw, -1],
    [x1 + bw, 1],
  ])
    for (let i = 0; i <= 6; i++) {
      const y = y0 + (i / 6) * H;
      m.add(
        tube(
          [
            [x, y, face - 0.02],
            [s < 0 ? 0.27 : 5.73, y, 0.45],
          ],
          0.004,
          3,
          1,
        ),
        0x2a2a2a,
      );
    }
  if (!on) {
    m.add(box([W, H, 0.002]), 0xe9e6df, { at: [cx, cy, face - 0.003] });
    return;
  }
  // the film: a silent picture's night, the moon with its craters, the rocket and its trail, the grain
  const z = face - DEEP;
  const p = new Pic(glowInto(m), z);
  const grey = [0x1a1a1a, 0x232323, 0x2e2e2e, 0x3a3a3a, 0x474747];
  grey.forEach((c, i) => {
    p.rect(cx, y1 - (i + 0.5) * (H / grey.length), W, H / grey.length + 0.002, c, 0);
  });
  for (let i = 0; i < 50; i++) {
    const s = 0.012 + rnd(i, 6, 1) * 0.018;
    p.rect(x0 + rnd(i, 6, 2) * W, y0 + rnd(i, 6, 3) * H, s, s, 0xd8d8d0, 1);
  }
  const mx = x0 + W * 0.72;
  const my = y0 + H * 0.62;
  p.disc(mx, my, 0.82, 0xbcbab2, 2, 1, 1, 40);
  for (const [dx, dy, r] of [
    [-0.3, 0.25, 0.14],
    [0.22, 0.32, 0.09],
    [0.12, -0.28, 0.17],
    [-0.36, -0.22, 0.08],
    [0.4, -0.02, 0.07],
  ])
    p.disc(mx + dx, my + dy, r, 0x98968e, 3, 1, 1, 18);
  // the rocket, flying up toward it, its trail
  const rx = x0 + W * 0.3;
  const ry = y0 + H * 0.36;
  const a = 0.62;
  const rot = (u: number, v: number): [number, number] => [
    rx + u * Math.cos(a) - v * Math.sin(a),
    ry + u * Math.sin(a) + v * Math.cos(a),
  ];
  p.shape([rot(-0.36, -0.11), rot(0.22, -0.11), rot(0.42, 0), rot(0.22, 0.11), rot(-0.36, 0.11)], 0xd2d0c8, 4);
  p.shape([rot(-0.36, 0.11), rot(-0.2, 0.11), rot(-0.44, 0.26)], 0x8a8882, 5);
  p.shape([rot(-0.36, -0.11), rot(-0.2, -0.11), rot(-0.44, -0.26)], 0x8a8882, 5);
  p.disc(...rot(0.08, 0), 0.05, 0x3a3a3a, 5, 1, 1, 14);
  for (let i = 0; i < 6; i++)
    p.disc(
      ...rot(-0.5 - i * 0.2, (rnd(i, 7, 1) - 0.5) * 0.08),
      0.06 + i * 0.03,
      shade(0xa8a8a0, 1 - i * 0.1),
      4 - (i % 2),
      1,
      1,
      12,
    );
  // the vignette
  for (const [x, y, w, h] of [
    [cx, y1 - 0.08, W, 0.16],
    [cx, y0 + 0.08, W, 0.16],
    [x0 + 0.1, cy, 0.2, H],
    [x1 - 0.1, cy, 0.2, H],
  ])
    p.rect(x, y, w, h, 0x0e0e0e, 6);
  // the scratches and specks, flickering (sets in turn)
  for (let s = 0; s < 3; s++) {
    const g: BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const x = x0 + rnd(i, s, 8) * W;
      if (i < 2)
        g.push(
          box([0.008, H * (0.3 + rnd(i, s, 9) * 0.6), 0.0002]).translate(
            x,
            cy + (rnd(i, s, 10) - 0.5) * H * 0.3,
            z + 7 * L,
          ),
        );
      else g.push(box([0.02, 0.02, 0.0002]).translate(x, y0 + rnd(i, s, 11) * H, z + 7 * L));
    }
    m.live(merged(g), 0xe8e8e0, { kind: "blink", period: 0.42, on: 0.3, phase: s / 3 }, { glow: true });
  }
}

// ── the radio-TV cabinet (2×1) ────────────────────────────────────────────────────────────────────
/** Its TV's picture plane (shared GLASS.radio_tv_cabinet): the little tube's rounded face. */
export const RTV = { x0: 0.76, x1: 1.2, y0: 0.39, y1: 0.72, face: 0.815 };
/** A 1950s combination: a long cabinet on splayed brass-tipped legs, the phonograph's lid set in its top;
 *  across its front a speaker's grille, the little round-cornered TV in its brass mask with its two
 *  knobs, the radio's lit dial and its needle, another grille under it. The TV shows the test pattern
 *  of its day while on. Blond oak, mahogany or walnut. */
function radioTvCabinet(m: Model, o: Look) {
  const on = o.on !== false;
  const wood = [0xd0a873, 0x6a2a1e, P.walnut][o.look] ?? 0xd0a873;
  const cloth = o.look === 0 ? 0x8a7a5a : 0xc9b48a;
  const FZ = 0.78;
  const B = 0.2;
  const T = 0.86;
  // the legs: tapered, splayed, their brass tips
  for (const [x, z, sx, sz] of [
    [0.16, 0.34, -1, -1],
    [1.84, 0.34, 1, -1],
    [0.16, 0.72, -1, 1],
    [1.84, 0.72, 1, 1],
  ]) {
    m.add(cyl(0.012, 0.022, B, 8), shade(wood, 0.8), {
      at: [x + sx * 0.02, 0.004, z + sz * 0.015],
      rot: [sz * 0.12, 0, -sx * 0.12],
    });
    m.add(cyl(0.011, 0.012, 0.03, 8), P.brass, {
      at: [x + sx * 0.032, 0.003, z + sz * 0.025],
      rot: [sz * 0.12, 0, -sx * 0.12],
    });
  }
  // the cabinet, its top and the phonograph's lid
  m.add(box([1.88, T - B - 0.025, 0.5], 0.012, 2), wood, { at: [1, B + (T - B - 0.025) / 2, 0.53] });
  m.add(box([1.92, 0.025, 0.54], 0.008, 2), shade(wood, 1.08), { at: [1, T - 0.0125, 0.53] });
  for (const [x, w] of [
    [1.42, 0.003],
    [1.89, 0.003],
  ])
    m.add(box([w, 0.002, 0.44]), shade(wood, 0.6), { at: [x, T + 0.0005, 0.53] });
  for (const z of [0.31, 0.75]) m.add(box([0.47, 0.002, 0.003]), shade(wood, 0.6), { at: [1.655, T + 0.0005, z] });
  m.add(box([0.06, 0.006, 0.014], 0.002), P.brass, { at: [1.655, T + 0.002, 0.75] });
  // the brass strip along its foot, the dividers
  m.add(box([1.86, 0.014, 0.006]), P.brass, { at: [1, B + 0.03, FZ + 0.001] });
  for (const x of [0.63, 1.33])
    m.add(box([0.012, T - B - 0.1, 0.006]), shade(wood, 0.8), { at: [x, (B + T) / 2 + 0.01, FZ + 0.001] });
  // the speakers' grille cloth and the slats over it
  const grille = (gx: number, gy: number, w: number, h: number) => {
    m.add(box([w, h, 0.004]), cloth, { at: [gx, gy, FZ + 0.0005] });
    for (let i = 0; i < Math.round(w / 0.05); i++)
      m.add(box([0.014, h, 0.012], 0.002), shade(wood, 0.9), {
        at: [gx - w / 2 + (i + 0.5) * (w / Math.round(w / 0.05)), gy, FZ + 0.004],
      });
  };
  grille(0.355, 0.56, 0.46, 0.5);
  grille(1.62, 0.43, 0.48, 0.3);
  // the TV: its mask, the glass (the picture's plane a hair in front), the knobs
  const tx = (RTV.x0 + RTV.x1) / 2;
  const ty = (RTV.y0 + RTV.y1) / 2;
  const tw = RTV.x1 - RTV.x0;
  const th = RTV.y1 - RTV.y0;
  m.add(extrude(roundRect(tw + 0.1, th + 0.1, 0.05, 4), 0.012, 0.003), P.brass, { at: [tx, ty, FZ + 0.008] });
  m.add(extrude(roundRect(tw + 0.02, th + 0.02, 0.045, 4), 0.006), 0x141414, { at: [tx, ty, FZ + 0.012] });
  if (!on) {
    m.add(extrude(roundRect(tw, th, 0.04, 4), 0.002), P.glass, { at: [tx, ty, RTV.face - 0.002] });
    m.add(box([tw * 0.6, 0.008, 0.001]), shade(P.glass, 2.1), {
      at: [tx - 0.04, ty + th * 0.36, RTV.face - 0.0005],
      rot: [0, 0, 0.06],
    });
  } else {
    const p = new Pic(glowInto(m), RTV.face - DEEP);
    p.shape(
      roundRect(tw, th, 0.04, 4).map(([x, y]) => [x + tx, y + ty]),
      0x9aa4b0,
      0,
    );
    p.disc(tx, ty, 0.12, 0xc4ccd6, 1, 1, 1, 32);
    p.disc(tx, ty, 0.105, 0x6a7480, 2, 1, 1, 32);
    p.disc(tx, ty, 0.07, 0xc4ccd6, 3, 1, 1, 28);
    p.disc(tx, ty, 0.058, 0x9aa4b0, 4, 1, 1, 28);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.rect(tx + Math.cos(a) * 0.16, ty + Math.sin(a) * 0.11, 0.05, 0.006, 0x2a3038, 5, a);
    }
    p.rect(tx, ty, 0.004, 0.24, 0x2a3038, 6);
    p.rect(tx, ty, 0.3, 0.004, 0x2a3038, 6);
    for (let i = 0; i < 5; i++) p.rect(tx, ty - th / 2 + (i + 0.5) * (th / 5), tw, 0.003, 0x7a8490, 7);
  }
  for (const x of [tx - 0.08, tx + 0.08]) {
    m.add(rod(0.026, 0.022, 0.025, "z", 16), P.brass, { at: [x, 0.3, FZ + 0.012] });
    m.add(rod(0.008, 0.008, 0.004, "z", 8), shade(wood, 0.6), { at: [x, 0.3, FZ + 0.026] });
  }
  // the radio: its dial lit while on, the stations' ticks, the needle, its knobs
  const dx = 1.62;
  const dy = 0.74;
  m.add(box([0.5, 0.1, 0.012], 0.004), P.brass, { at: [dx, dy, FZ + 0.004] });
  m.add(box([0.46, 0.07, 0.003]), on ? 0xffd28a : 0x8a7a5a, { at: [dx, dy, FZ + 0.011], glow: on });
  for (let i = 0; i < 15; i++)
    m.add(box([0.003, i % 2 ? 0.012 : 0.022, 0.001]), 0x3a2418, {
      at: [dx - 0.21 + i * 0.03, dy - 0.014, FZ + 0.0128],
    });
  const stations = dotText(
    "55 70 90 110 140",
    dx - textW("55 70 90 110 140", 0.0028) / 2,
    dy + 0.026,
    FZ + 0.0128,
    0.0028,
  );
  if (stations) m.add(stations, 0x3a2418);
  m.add(box([0.004, 0.06, 0.002]), 0xc8302c, { at: [dx - 0.05 + o.seed * 0.15, dy, FZ + 0.0135] });
  for (const x of [dx - 0.18, dx + 0.18])
    m.add(rod(0.024, 0.02, 0.025, "z", 16), P.brass, { at: [x, 0.62, FZ + 0.012] });
  m.add(box([0.016, 0.01, 0.004]), on ? P.led : 0x4a2a1a, { at: [dx, 0.62, FZ + 0.004], glow: on });
}

export const DRAW: Record<string, (m: Model, o: Look) => void> = {
  video_wall: videoWall,
  ceiling_projector: ceilingProjector,
  security_monitors: securityMonitors,
  outdoor_cinema: outdoorCinema,
  radio_tv_cabinet: radioTvCabinet,
};
