// Snow: a severe modernist office campus in winter (Severance-style, no
// branding) — the 3D view's overcast sky that follows the clock, and its bare trees.

// hour, sky top, sky horizon, land tint. After dusk, the pitch dark (docs/plan/44-the-night.md):
// an overcast with nothing over it, all but black (the 3D view's fog takes the horizon)
export const SKY: [number, string, string, string][] = [
  [0, "#030406", "#05070a", "#07090d"],
  [5, "#030406", "#05070a", "#07090d"],
  [7, "#6e7486", "#b9b1b4", "#b9bccb"],
  [9, "#aeb8c4", "#e3e7ea", "#f4f6f8"],
  [16, "#a9b4c1", "#e1e5e8", "#ffffff"],
  [17.5, "#8d93a6", "#d8c6c0", "#e8dfe0"],
  [19, "#4d5470", "#9d8f98", "#8f93ac"],
  [20.5, "#0e1320", "#1a2232", "#2a3348"],
  [21.5, "#05070b", "#080a0f", "#0a0d13"],
  [24, "#030406", "#05070a", "#07090d"],
];

// A bare winter tree: a trunk and forking branches.
export function tree(g: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, color: string) {
  g.strokeStyle = color;
  g.lineCap = "round";
  const branch = (x0: number, y0: number, len: number, a: number, w: number, depth: number) => {
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (depth <= 0 || len < 3) return;
    const n = 2 + (r() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++)
      branch(x1, y1, len * (0.62 + r() * 0.12), a + (r() - 0.5) * 1.1, Math.max(0.6, w * 0.65), depth - 1);
  };
  branch(x, y, h * 0.42, -Math.PI / 2 + (r() - 0.5) * 0.1, Math.max(1.2, h / 22), 5);
}
