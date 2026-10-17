import type { AvatarLayers } from "@yutopia/shared";
import { GraphicsContext } from "pixi.js";
import { C, hex } from "./palette";

// Someone for the moment before their real figure is in (the 3D model's
// sprite, or the drawing where WebGL can't draw it): a simple pawn in their
// own colours — skin, hair, top, bottom — standing or seated. Origin between
// the feet, up is −y; drawn at the engine's 1.35 like the figure it stands in for.
const cache = new Map<string, GraphicsContext>();

export function pawnContext(a: AvatarLayers, sitting: boolean): GraphicsContext {
  const key = `${a.skin}|${a.hairColor}|${a.topColor}|${a.bottomColor}|${sitting ? 1 : 0}`;
  let g = cache.get(key);
  if (g) return g;
  g = new GraphicsContext();
  const line = { width: 1.4, color: C.ink, alpha: 0.85 };
  const drop = sitting ? 9 : 0;
  // legs (folded forward when seated), body, head with its hair
  if (sitting) g.roundRect(-8, -24, 16, 12, 4).fill(hex(a.bottomColor, C.slate)).stroke(line);
  else g.roundRect(-7, -27, 14, 27, 4).fill(hex(a.bottomColor, C.slate)).stroke(line);
  g.roundRect(-10, -50 + drop, 20, 26, 7)
    .fill(hex(a.topColor, C.rust))
    .stroke(line);
  g.circle(0, -61 + drop, 10.5)
    .fill(hex(a.hairColor, 0x3b2a20))
    .stroke(line);
  g.circle(0, -58 + drop, 8).fill(hex(a.skin, 0xc68a5e));
  cache.set(key, g);
  if (cache.size > 400) {
    const first = cache.keys().next().value as string;
    cache.get(first)?.destroy();
    cache.delete(first);
  }
  return g;
}
