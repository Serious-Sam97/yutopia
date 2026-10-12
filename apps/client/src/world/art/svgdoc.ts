import type { Box } from "./avatar-rig";

// An SVG fragment drawn in board units as its own document: the box it's
// cropped to, at `px` texture pixels per unit.
export function svgDoc(svg: string, box: Box, px: number): string {
  const [x, y, w, h] = box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * px)}" height="${Math.ceil(h * px)}" viewBox="${x} ${y} ${w} ${h}">${svg}</svg>`;
}
