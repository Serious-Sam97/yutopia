import { KART_BOWL, KART_FENCE, KART_PADDOCK, KART_STANDS, TRACK_W, type Track, trackAt } from "@yutopia/shared/kart";

// A layout's map, small (docs/plan/47-the-track-changer.md): the park's fence, the bowl, the
// stands and the bridge (a layout over it only), the circuit in cream on it with its start line
// and the way it runs. The paddock's board of the circuits (its face) and the board's panel's cards
// draw it. North up, as the plans.

export interface MapLook {
  /** the ground inside the fence, the road, its edge, the scenery, the start line's */
  ground: string;
  road: string;
  edge: string;
  scenery: string;
  line: string;
}
export const BOARD_LOOK: MapLook = {
  ground: "#2a3b31",
  road: "#f3ead6",
  edge: "#151515",
  scenery: "rgba(243,234,214,0.28)",
  line: "#e8a33d",
};

/** The map of `t` fitted into (x, y, w, h). */
export function drawTrackMap(
  g: CanvasRenderingContext2D,
  t: Track,
  x: number,
  y: number,
  w: number,
  h: number,
  look: MapLook = BOARD_LOOK,
) {
  const F = KART_FENCE;
  const pad = 6;
  const k = Math.min(w / (F.x1 - F.x0 + pad * 2), h / (F.z1 - F.z0 + pad * 2));
  const ox = x + (w - (F.x1 - F.x0) * k) / 2;
  const oz = y + (h - (F.z1 - F.z0) * k) / 2;
  const P = (px: number, pz: number): [number, number] => [ox + (px - F.x0) * k, oz + (pz - F.z0) * k];
  g.save();
  // the park
  g.fillStyle = look.ground;
  g.fillRect(...P(F.x0, F.z0), (F.x1 - F.x0) * k, (F.z1 - F.z0) * k);
  g.strokeStyle = look.scenery;
  g.lineWidth = Math.max(1, k * 1.2);
  g.strokeRect(...P(F.x0, F.z0), (F.x1 - F.x0) * k, (F.z1 - F.z0) * k);
  g.fillStyle = look.scenery;
  g.beginPath();
  g.arc(...P(KART_BOWL.x, KART_BOWL.z), (KART_BOWL.r + KART_BOWL.rim) * k, 0, Math.PI * 2);
  g.fill();
  for (const st of KART_STANDS)
    g.fillRect(...P(Math.min(st.x0, st.x1), st.z), Math.abs(st.x1 - st.x0) * k, st.rows * 1.2 * k);
  const D = KART_PADDOCK;
  g.fillRect(...P(Math.min(D.x0, D.x1), D.z0), Math.abs(D.x1 - D.x0) * k, (D.z1 - D.z0) * k);
  // the circuit: an edge, the road, (the bridge drawn again over the road it crosses)
  const line = (s0: number, s1: number) => {
    g.beginPath();
    for (let s = s0; s <= s1; s += 2) {
      const p = trackAt(t, s);
      s === s0 ? g.moveTo(...P(p.x, p.z)) : g.lineTo(...P(p.x, p.z));
    }
  };
  g.lineJoin = "round";
  g.lineCap = "round";
  line(0, t.len);
  g.strokeStyle = look.edge;
  g.lineWidth = (TRACK_W + 5) * k;
  g.stroke();
  g.strokeStyle = look.road;
  g.lineWidth = TRACK_W * k;
  g.stroke();
  // the bridge (a layout over it only): its span drawn again over the road under it
  const up = t.pts.filter((p) => p.y > 2);
  if (up.length) {
    g.beginPath();
    for (const [i, p] of up.entries()) i ? g.lineTo(...P(p.x, p.z)) : g.moveTo(...P(p.x, p.z));
    g.strokeStyle = look.edge;
    g.lineWidth = (TRACK_W + 5) * k;
    g.stroke();
    g.strokeStyle = look.road;
    g.lineWidth = TRACK_W * k;
    g.stroke();
  }
  // the start line, the way round
  const s0 = trackAt(t, 0);
  const a = s0.a + Math.PI / 2;
  const half = (TRACK_W / 2 + 2) * k;
  const [sx, sz] = P(s0.x, s0.z);
  g.strokeStyle = look.line;
  g.lineWidth = Math.max(2, k * 3);
  g.beginPath();
  g.moveTo(sx - Math.cos(a) * half, sz - Math.sin(a) * half);
  g.lineTo(sx + Math.cos(a) * half, sz + Math.sin(a) * half);
  g.stroke();
  g.fillStyle = look.line;
  for (let s = 60; s < t.len - 30; s += Math.max(90, t.len / 6)) {
    const p = trackAt(t, s);
    const [px, pz] = P(p.x, p.z);
    const r = Math.max(4, k * 7);
    g.beginPath();
    g.moveTo(px + Math.cos(p.a) * r, pz + Math.sin(p.a) * r);
    g.lineTo(px + Math.cos(p.a + 2.5) * r, pz + Math.sin(p.a + 2.5) * r);
    g.lineTo(px + Math.cos(p.a - 2.5) * r, pz + Math.sin(p.a - 2.5) * r);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** The board's whole face: the layout's name and length over its map, the next race under it. */
export function drawBoardFace(g: CanvasRenderingContext2D, W: number, H: number, t: Track, name: string, next: string) {
  g.fillStyle = "#1d2a23";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(243,234,214,0.35)";
  g.lineWidth = 4;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = "#f3ead6";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = "700 52px Georgia, 'Times New Roman', serif";
  g.fillText("THE CIRCUITS", 34, 56);
  g.textAlign = "right";
  g.font = "700 40px Georgia, 'Times New Roman', serif";
  g.fillText(name, W - 34, 58, W * 0.55);
  g.font = "26px 'Courier New', monospace";
  g.fillStyle = "rgba(243,234,214,0.7)";
  g.fillText(`${t.len} m${t.reverse ? " · REVERSED" : ""}`, W - 34, 98);
  drawTrackMap(g, t, 34, 122, W - 68, H - 122 - 92);
  g.fillStyle = "#120d08";
  g.fillRect(34, H - 78, W - 68, 50);
  g.fillStyle = "#ffb347";
  g.textAlign = "left";
  g.font = "700 30px 'Courier New', monospace";
  g.fillText(next, 50, H - 52, W - 100);
}
