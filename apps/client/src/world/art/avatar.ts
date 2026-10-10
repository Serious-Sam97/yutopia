import type { AvatarLayers } from "@yutopia/shared";
import { GraphicsContext } from "pixi.js";
import { C, hex, shade } from "./palette";

// Procedural chibi avatars. Five drawn views (S, SW, W, NW, N); the other three
// facings are mirrors. Origin (0,0) is between the feet; up is negative y.

type View = "S" | "SW" | "W" | "NW" | "N";
const VIEW_FOR_DIR: [View, boolean][] = [
  ["S", false],
  ["SW", false],
  ["W", false],
  ["NW", false],
  ["N", false],
  ["NW", true],
  ["W", true],
  ["SW", true],
];

export function viewFor(dir: number): { view: View; mirror: boolean } {
  const [view, mirror] = VIEW_FOR_DIR[((dir % 8) + 8) % 8];
  return { view, mirror };
}

export const WALK_FRAMES = 4;
const cache = new Map<string, GraphicsContext>();

export function avatarContext(a: AvatarLayers, view: View, frame: number, sitting: boolean): GraphicsContext {
  const key = `${JSON.stringify(a)}|${view}|${frame}|${sitting ? 1 : 0}`;
  let ctx = cache.get(key);
  if (!ctx) {
    ctx = draw(a, view, frame, sitting);
    cache.set(key, ctx);
    if (cache.size > 1500) {
      const first = cache.keys().next().value as string;
      cache.get(first)?.destroy();
      cache.delete(first);
    }
  }
  return ctx;
}

function draw(a: AvatarLayers, view: View, frame: number, sitting: boolean): GraphicsContext {
  const g = new GraphicsContext();
  const skin = hex(a.skin, 0xc68a5e);
  const hair = hex(a.hairColor, 0x3b2a20);
  const top = hex(a.topColor, C.rust);
  const bottom = hex(a.bottomColor, C.slate);
  const acc = hex(a.accessoryColor, C.amber);
  const ink = C.ink;
  const outline = { width: 1.2, color: 0x1a120c, alpha: 0.55 };

  const back = view === "N" || view === "NW";
  const side = view === "W";
  const diag = view === "SW" || view === "NW";
  const shift = diag ? -2.5 : side ? -1 : 0; // face/features lean towards the facing
  const tw = a.body === "broad" ? 11 : a.body === "slim" ? 7.5 : 9; // half torso width
  const torsoW = side ? tw * 0.72 : diag ? tw * 0.9 : tw;

  // walk cycle
  const phase = frame % WALK_FRAMES;
  const stride = sitting ? 0 : [3, 0, -3, 0][phase];
  const bob = sitting ? 0 : [-1, 0, -1, 0][phase];
  const lift = sitting ? 0 : [1.5, 0, 1.5, 0][phase];

  const by = bob + (sitting ? -2 : 0); // body offset
  const hipY = -14 + by;
  const shoulderY = -32 + by;
  const headY = -45 + by;

  // ── legs ─────────────────────────────────────────────────────────────────
  const legColor = a.bottom === "shorts" || a.bottom === "skirt" || a.top === "dress" ? skin : bottom;
  const shoe = shade(C.ink, 1.2);
  if (sitting) {
    // thighs forward, shins down
    const fwd = back ? -1 : 1;
    for (const lx of side ? [0] : [-4.5, 4.5]) {
      const x = lx + (side ? -6 : 0);
      g.roundRect(x - 3, hipY - 1, side ? 9 : 6, 6, 2)
        .fill(bottom)
        .stroke(outline);
      g.roundRect(x - 3 + (side ? -6 : 0), hipY + 4 * fwd, 6, 9, 2)
        .fill(legColor)
        .stroke(outline);
      g.ellipse(x + (side ? -6 : 0), hipY + 13, 3.6, 2.2).fill(shoe);
    }
  } else if (side) {
    for (const [s, dark] of [
      [stride, 0.82],
      [-stride, 1],
    ] as const) {
      g.roundRect(-3 + s, hipY, 6, 14 + (s > 0 ? -lift : 0), 2.5)
        .fill(shade(legColor, dark))
        .stroke(outline);
      g.ellipse(-1 + s, -1 - (s > 0 ? lift : 0), 4.5, 2.2).fill(shoe);
    }
  } else {
    const l = stride > 0 ? lift : 0;
    const r = stride < 0 ? lift : 0;
    g.roundRect(-5.5 + shift * 0.3, hipY - l, 5, 14, 2.5)
      .fill(legColor)
      .stroke(outline);
    g.roundRect(0.5 + shift * 0.3, hipY - r, 5, 14, 2.5)
      .fill(shade(legColor, 0.92))
      .stroke(outline);
    g.ellipse(-3 + shift * 0.3, -1 - l, 3.6, 2.2).fill(shoe);
    g.ellipse(3 + shift * 0.3, -1 - r, 3.6, 2.2).fill(shoe);
  }

  // shorts / skirt / dress bottoms
  if (a.bottom === "shorts" && a.top !== "dress" && !sitting) {
    g.roundRect(-torsoW + 1, hipY - 1, torsoW * 2 - 2, 7, 2)
      .fill(bottom)
      .stroke(outline);
  }
  if ((a.bottom === "skirt" || a.top === "dress") && !sitting) {
    const col = a.top === "dress" ? top : bottom;
    g.poly([-torsoW + 1, hipY - 2, torsoW - 1, hipY - 2, torsoW + 3, hipY + 8, -torsoW - 3, hipY + 8])
      .fill(col)
      .stroke(outline);
  }

  // ── back arm (behind torso in side views) ───────────────────────────────
  const armSwing = sitting ? 0 : stride * 0.8;
  if (side) {
    g.roundRect(-2 - armSwing, shoulderY + 2, 5, 15, 2.5)
      .fill(shade(top, 0.75))
      .stroke(outline);
  }

  // hood behind the head (front views)
  if (a.top === "hoodie" && !back) {
    g.roundRect(-torsoW + 2 + shift, shoulderY - 5, torsoW * 2 - 4, 8, 4)
      .fill(shade(top, 0.85))
      .stroke(outline);
  }
  // afro sits behind the head
  if (a.hair === "afro")
    g.circle(shift * 0.4, headY - 3, 16)
      .fill(hair)
      .stroke(outline);
  if (a.hair === "long" && !back) {
    g.roundRect(-12 + shift, headY - 4, 24, 22, 8)
      .fill(shade(hair, 0.9))
      .stroke(outline);
  }

  // ── torso ─────────────────────────────────────────────────────────────────
  const torsoH = hipY - shoulderY + 3;
  g.roundRect(-torsoW + (side ? shift : 0), shoulderY, torsoW * 2, torsoH, 5)
    .fill(top)
    .stroke(outline);
  if (!back) {
    switch (a.top) {
      case "shirt":
        g.poly([shift - 4, shoulderY, shift + 4, shoulderY, shift, shoulderY + 6]).fill(C.paper);
        for (let i = 0; i < 3; i++) g.circle(shift, shoulderY + 8 + i * 4, 0.9).fill(shade(top, 0.6));
        break;
      case "jacket":
        g.rect(shift - 2.5, shoulderY + 1, 5, torsoH - 2).fill(C.cream);
        g.moveTo(shift - 2.5, shoulderY + 1)
          .lineTo(shift - 2.5, hipY + 2)
          .stroke({ width: 1, color: shade(top, 0.55) });
        g.moveTo(shift + 2.5, shoulderY + 1)
          .lineTo(shift + 2.5, hipY + 2)
          .stroke({ width: 1, color: shade(top, 0.55) });
        break;
      case "sweater":
        g.rect(-torsoW + 1 + (side ? shift : 0), shoulderY + 7, torsoW * 2 - 2, 3).fill(shade(top, 1.25));
        g.rect(-torsoW + 1 + (side ? shift : 0), shoulderY + 11, torsoW * 2 - 2, 1.5).fill(shade(top, 0.75));
        break;
      case "hoodie":
        g.roundRect(shift - 5, hipY - 7, 10, 5, 2).fill(shade(top, 0.82));
        g.moveTo(shift - 2, shoulderY + 1)
          .lineTo(shift - 2, shoulderY + 7)
          .stroke({ width: 1, color: C.cream });
        g.moveTo(shift + 2, shoulderY + 1)
          .lineTo(shift + 2, shoulderY + 7)
          .stroke({ width: 1, color: C.cream });
        break;
      case "tee":
        g.roundRect(shift - 3.5, shoulderY - 0.5, 7, 3, 1.5).fill(shade(skin, 0.95));
        break;
    }
  } else if (a.top === "hoodie") {
    g.roundRect(-6, shoulderY - 3, 12, 9, 4)
      .fill(shade(top, 0.82))
      .stroke(outline);
  }

  // walkman on the hip
  if (a.accessory === "walkman" && !back) {
    g.roundRect(torsoW - 4 + shift, hipY - 7, 6, 8, 1.5)
      .fill(acc)
      .stroke(outline);
    g.rect(torsoW - 3 + shift, hipY - 5, 4, 2).fill(C.ink);
  }

  // ── front arms ───────────────────────────────────────────────────────────
  const sleeve = a.top === "tee" || a.top === "dress" ? 7 : 13;
  const drawArm = (x: number, swing: number, dark: number) => {
    const ax = x + swing * 0.3;
    g.roundRect(ax - 2.5, shoulderY + 1 - swing * 0.4, 5, 15, 2.5)
      .fill(skin)
      .stroke(outline);
    g.roundRect(ax - 2.5, shoulderY + 1 - swing * 0.4, 5, sleeve, 2.5).fill(shade(top, dark));
    g.circle(ax, shoulderY + 16 - swing * 0.4, 2.4).fill(skin);
  };
  if (side) drawArm(1 + shift, armSwing, 0.92);
  else if (sitting && !back) {
    // hands on the desk / lap
    g.roundRect(-torsoW - 2 + shift, shoulderY + 2, 5, 11, 2.5)
      .fill(shade(top, 0.9))
      .stroke(outline);
    g.roundRect(torsoW - 3 + shift, shoulderY + 2, 5, 11, 2.5)
      .fill(shade(top, 0.9))
      .stroke(outline);
    g.circle(-torsoW + 1 + shift, shoulderY + 14, 2.4).fill(skin);
    g.circle(torsoW - 0.5 + shift, shoulderY + 14, 2.4).fill(skin);
  } else {
    drawArm(-torsoW - 1 + shift * 0.4, armSwing, 0.9);
    drawArm(torsoW + 1 + shift * 0.4, -armSwing, 0.9);
  }

  // ── head ─────────────────────────────────────────────────────────────────
  const hx = shift;
  g.roundRect(hx - 2.5, headY + 8, 5, 4, 1).fill(shade(skin, 0.88)); // neck
  g.circle(hx, headY, 11.5).fill(skin).stroke(outline);
  if (side) g.circle(hx - 10.5, headY + 2, 2).fill(skin); // nose
  if (!back && !side) g.circle(hx + (view === "SW" ? 9 : 0), headY + 2, 0).fill(skin);
  if (!back) {
    g.circle(hx + (side ? 7 : 10.5), headY + 1, 2.4).fill(shade(skin, 0.9)); // ear
    if (!side && !diag) g.circle(hx - 10.5, headY + 1, 2.4).fill(shade(skin, 0.9));
  } else {
    g.circle(hx - 10.5, headY + 1, 2.4).fill(shade(skin, 0.9));
    if (!diag) g.circle(hx + 10.5, headY + 1, 2.4).fill(shade(skin, 0.9));
  }

  // face
  if (!back) {
    if (side) {
      g.ellipse(hx - 6, headY + 0.5, 1.4, 2).fill(ink);
      g.ellipse(hx - 6, headY + 5.5, 2.2, 1.1).fill({ color: C.rust, alpha: 0.3 });
      g.moveTo(hx - 9, headY + 6)
        .lineTo(hx - 6.5, headY + 6.5)
        .stroke({ width: 1, color: ink, alpha: 0.7 });
    } else {
      const ex = diag ? 3.5 : 4.2;
      g.ellipse(hx - ex + (diag ? -1.5 : 0), headY + 0.5, 1.5, 2.1).fill(ink);
      g.ellipse(hx + ex + (diag ? -1.5 : 0), headY + 0.5, 1.5, 2.1).fill(ink);
      g.circle(hx - ex + (diag ? -1.5 : 0) + 0.5, headY - 0.4, 0.5).fill(C.paper);
      g.circle(hx + ex + (diag ? -1.5 : 0) + 0.5, headY - 0.4, 0.5).fill(C.paper);
      g.ellipse(hx - 6.5 + (diag ? -1 : 0), headY + 4.5, 2.2, 1.2).fill({ color: C.rust, alpha: 0.28 });
      g.ellipse(hx + 6.5 + (diag ? -1 : 0), headY + 4.5, 2.2, 1.2).fill({ color: C.rust, alpha: 0.28 });
      g.moveTo(hx - 1.8 + (diag ? -1.5 : 0), headY + 5.5)
        .quadraticCurveTo(hx + (diag ? -1.5 : 0), headY + 7, hx + 1.8 + (diag ? -1.5 : 0), headY + 5.5)
        .stroke({ width: 1.1, color: ink, alpha: 0.75 });
    }
  }

  // ── hair ─────────────────────────────────────────────────────────────────
  drawHair(g, a.hair, hair, hx, headY, view, outline);

  // ── accessories ──────────────────────────────────────────────────────────
  switch (a.accessory) {
    case "glasses":
      if (!back) {
        const gx = diag ? -1.5 : 0;
        if (side) {
          g.roundRect(hx - 8.5, headY - 2, 5, 4.5, 1.5).stroke({ width: 1.3, color: ink });
          g.moveTo(hx - 3.5, headY)
            .lineTo(hx + 6, headY - 1)
            .stroke({ width: 1, color: ink });
        } else {
          g.roundRect(hx - 7 + gx, headY - 2, 5.5, 4.5, 1.5).stroke({ width: 1.3, color: ink });
          g.roundRect(hx + 1.5 + gx, headY - 2, 5.5, 4.5, 1.5).stroke({ width: 1.3, color: ink });
          g.moveTo(hx - 1.5 + gx, headY - 0.5)
            .lineTo(hx + 1.5 + gx, headY - 0.5)
            .stroke({ width: 1, color: ink });
        }
      }
      break;
    case "headphones":
    case "walkman": {
      g.arc(hx, headY - 1, 13, Math.PI * 1.08, Math.PI * 1.92).stroke({ width: 2.6, color: shade(acc, 0.7) });
      const cups = side ? [hx + 4] : back ? [hx - 11, hx + 11] : [hx - 11.5, hx + 11.5];
      if (a.accessory === "headphones")
        for (const cx of cups)
          g.roundRect(cx - 3, headY - 2, 6, 8, 2.5)
            .fill(acc)
            .stroke(outline);
      else for (const cx of cups) g.circle(cx, headY + 2, 2.2).fill(acc);
      break;
    }
    case "cap":
      g.arc(hx, headY - 2, 12, Math.PI, 0)
        .fill(acc)
        .stroke(outline);
      if (!back) {
        if (side) g.roundRect(hx - 19, headY - 4, 10, 3, 1.5).fill(shade(acc, 0.8));
        else g.ellipse(hx + (diag ? -3 : 0), headY - 3, 11, 3).fill(shade(acc, 0.8));
      } else g.rect(hx - 3, headY - 3, 6, 2).fill(shade(acc, 0.7));
      g.circle(hx, headY - 14, 1.5).fill(shade(acc, 0.7));
      break;
    case "beanie":
      g.arc(hx, headY - 1, 12.5, Math.PI, 0)
        .fill(acc)
        .stroke(outline);
      g.roundRect(hx - 12.5, headY - 4, 25, 5, 2).fill(shade(acc, 0.8));
      g.circle(hx, headY - 14.5, 3).fill(shade(acc, 1.15));
      break;
  }

  return g;
}

function drawHair(
  g: GraphicsContext,
  style: string,
  color: number,
  hx: number,
  hy: number,
  view: View,
  outline: { width: number; color: number; alpha: number },
) {
  const back = view === "N" || view === "NW";
  const side = view === "W";
  const light = shade(color, 1.25);
  switch (style) {
    case "bald":
      g.ellipse(hx - 4, hy - 7, 3, 1.6).fill({ color: 0xffffff, alpha: 0.25 });
      return;
    case "mohawk":
      g.roundRect(hx - 2.5 + (side ? 2 : 0), hy - 20, 5, 12, 2)
        .fill(color)
        .stroke(outline);
      return;
    case "curly":
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        g.circle(hx + Math.cos(a) * 10.5, hy - 2 + Math.sin(a) * 10.5, 4.6).fill(i % 2 ? color : light);
      }
      if (back) g.circle(hx, hy, 11).fill(color);
      return;
    case "afro":
      if (!back) g.arc(hx, hy - 3, 12, Math.PI * 1.05, Math.PI * 1.95).fill(color);
      else g.circle(hx, hy - 1, 12).fill(color);
      return;
  }
  // cap of hair over the skull
  if (back) {
    g.circle(hx, hy - 0.5, 12)
      .fill(color)
      .stroke(outline);
  } else if (side) {
    g.arc(hx + 1, hy - 1, 12, Math.PI * 1.1, Math.PI * 2.35)
      .fill(color)
      .stroke(outline);
    g.roundRect(hx - 6, hy - 12, 12, 6, 3).fill(color);
  } else {
    g.arc(hx, hy - 1, 12, Math.PI, 0)
      .fill(color)
      .stroke(outline);
    // fringe
    g.poly([
      hx - 11.5,
      hy - 2,
      hx - 6,
      hy - 6.5,
      hx - 1,
      hy - 3,
      hx + 4,
      hy - 7,
      hx + 11.5,
      hy - 2,
      hx + 11,
      hy - 8,
      hx - 11,
      hy - 8,
    ]).fill(color);
    g.ellipse(hx - 4, hy - 9, 4, 1.5).fill({ color: light, alpha: 0.6 });
  }
  switch (style) {
    case "long":
      if (back)
        g.roundRect(hx - 11, hy - 2, 22, 22, 7)
          .fill(color)
          .stroke(outline);
      else if (side)
        g.roundRect(hx + 2, hy - 4, 10, 22, 5)
          .fill(color)
          .stroke(outline);
      else {
        g.roundRect(hx - 13, hy - 4, 5.5, 20, 3).fill(color);
        g.roundRect(hx + 7.5, hy - 4, 5.5, 20, 3).fill(color);
      }
      break;
    case "bob":
      if (back)
        g.roundRect(hx - 12, hy - 4, 24, 12, 5)
          .fill(color)
          .stroke(outline);
      else if (side) g.roundRect(hx + 1, hy - 5, 11, 12, 4).fill(color);
      else {
        g.roundRect(hx - 13, hy - 5, 6, 12, 3).fill(color);
        g.roundRect(hx + 7, hy - 5, 6, 12, 3).fill(color);
      }
      break;
    case "bun":
      g.circle(hx + (side ? 4 : 0), hy - 13, 5.5)
        .fill(color)
        .stroke(outline);
      break;
  }
}
