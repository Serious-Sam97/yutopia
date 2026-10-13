import { Sprite, Texture } from "pixi.js";

// A soft round light (white, fading to nothing at its edge) for a screen's
// glow on the floor: one sprite, tinted and squashed to the floor's ellipse —
// smooth, where stacked ellipses showed bands.
let tex: Texture | null = null;

function glowTexture(): Texture {
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  // a smooth falloff (roughly 1 − d², eased at the edge)
  for (let i = 0; i <= 8; i++) {
    const d = i / 8;
    const a = (1 - d * d) ** 1.6;
    r.addColorStop(d, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  tex = Texture.from(c);
  return tex;
}

export function glowSprite(): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.visible = false;
  return s;
}

// Over the floor at (x, y) screen px, w × h, in a colour, this strong.
export function placeGlow(s: Sprite, x: number, y: number, w: number, h: number, color: number, alpha: number) {
  s.position.set(x, y);
  s.width = w;
  s.height = h;
  s.tint = color;
  s.alpha = Math.max(0, Math.min(1, alpha));
  s.visible = alpha > 0.002;
}
