import { CLAW_REACH, type Prize } from "@yutopia/shared/games68/claw";
import { RINGS, SEGMENTS } from "@yutopia/shared/games68/darts";
import { FOOS, menOf, RODS } from "@yutopia/shared/games68/foosball";
import { HOCKEY } from "@yutopia/shared/games68/hockey";

// The small games' panels, drawn (docs/plan/68-more-furniture.md, phases 21–25): the dartboard, the
// claw machine's pit seen from above, the air hockey table and the foosball pitch — each from its
// player's end, their own goal at the bottom.

const C = {
  board: "#1c1a18",
  cream: "#efe2c4",
  black: "#26221f",
  red: "#c0362c",
  green: "#2f7a46",
  wire: "#b8bdc4",
  dart: "#e8c25a",
  aim: "#ffd86a",
  rink: "#e9eef0",
  line: "#c0362c",
  blue: "#3b6fc4",
  puck: "#26221f",
  pitch: "#3f8a4a",
  pitchLine: "#e9f2e4",
  wood: "#7a4a2c",
  rod: "#b8bdc4",
  mine: "#c0362c",
  theirs: "#2f5fa8",
  ball: "#f4f1e8",
  pit: "#2a2234",
  glass: "#9fc6d8",
  claw: "#c4cad1",
};

/** The dartboard, its middle at the canvas's, `scale` px a metre; darts stuck in it; the aim. */
export function drawDartboard(
  g: CanvasRenderingContext2D,
  size: number,
  darts: [number, number][],
  aim: [number, number] | null,
) {
  const s = (size * 0.48) / 0.225;
  const cx = size / 2;
  const cy = size / 2;
  g.clearRect(0, 0, size, size);
  g.fillStyle = C.board;
  g.beginPath();
  g.arc(cx, cy, 0.225 * s, 0, Math.PI * 2);
  g.fill();
  const ring = (r0: number, r1: number, a0: number, a1: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx, cy, r1 * s, a0, a1);
    g.arc(cx, cy, r0 * s, a1, a0, true);
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < 20; i++) {
    // (clockwise from the top, 20 straddling it: canvas angles from +x)
    const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI / 10);
    const a1 = a0 + Math.PI / 10;
    const even = i % 2 === 0;
    ring(RINGS.outer, RINGS.trebleIn, a0, a1, even ? C.black : C.cream);
    ring(RINGS.trebleIn, RINGS.trebleOut, a0, a1, even ? C.red : C.green);
    ring(RINGS.trebleOut, RINGS.doubleIn, a0, a1, even ? C.black : C.cream);
    ring(RINGS.doubleIn, RINGS.doubleOut, a0, a1, even ? C.red : C.green);
    // its number round the rim
    const am = (a0 + a1) / 2;
    g.fillStyle = C.cream;
    g.font = `${Math.round(size * 0.04)}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(SEGMENTS[i]), cx + Math.cos(am) * 0.197 * s, cy + Math.sin(am) * 0.197 * s);
  }
  g.fillStyle = C.green;
  g.beginPath();
  g.arc(cx, cy, RINGS.outer * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.red;
  g.beginPath();
  g.arc(cx, cy, RINGS.bull * s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = C.wire;
  g.lineWidth = 1;
  for (const r of [RINGS.outer, RINGS.trebleIn, RINGS.trebleOut, RINGS.doubleIn, RINGS.doubleOut]) {
    g.beginPath();
    g.arc(cx, cy, r * s, 0, Math.PI * 2);
    g.stroke();
  }
  for (const [x, y] of darts) {
    const px = cx + x * s;
    const py = cy - y * s;
    g.fillStyle = C.dart;
    g.strokeStyle = C.black;
    g.beginPath();
    g.arc(px, py, size * 0.012, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  if (aim) {
    const px = cx + aim[0] * s;
    const py = cy - aim[1] * s;
    g.strokeStyle = C.aim;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, py, size * 0.03, 0, Math.PI * 2);
    g.moveTo(px - size * 0.05, py);
    g.lineTo(px + size * 0.05, py);
    g.moveTo(px, py - size * 0.05);
    g.lineTo(px, py + size * 0.05);
    g.stroke();
  }
}
/** A point on the dartboard's canvas → m on the board (y up). */
export const dartAt = (size: number, px: number, py: number): [number, number] => {
  const s = (size * 0.48) / 0.225;
  return [(px - size / 2) / s, -(py - size / 2) / s];
};

const TOY_ICON: Record<string, string> = { ball: "⚽", frisbee: "🥏", rope: "🪢", feather: "🪶" };
/** The claw machine's pit from above: its prizes, the claw over them (where it'll come down). */
export function drawClaw(
  g: CanvasRenderingContext2D,
  size: number,
  prizes: Prize[],
  claw: [number, number],
  down: number,
) {
  g.clearRect(0, 0, size, size);
  g.fillStyle = C.pit;
  g.fillRect(0, 0, size, size);
  g.font = `${Math.round(size * 0.09)}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const p of prizes) g.fillText(TOY_ICON[p.toy] ?? "🧸", p.x * size, p.z * size);
  const [x, z] = claw;
  g.strokeStyle = C.claw;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x * size, z * size, CLAW_REACH * size * (1 - down * 0.4), 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.moveTo(x * size, z * size);
    g.lineTo(x * size + Math.cos(a) * size * 0.05, z * size + Math.sin(a) * size * 0.05);
    g.stroke();
  }
  g.strokeStyle = C.glass;
  g.lineWidth = 6;
  g.strokeRect(3, 3, size - 6, size - 6);
}

/** A table's frame → the canvas, from `side`'s end (its own goal at the bottom). */
function view(w: number, h: number, W: number, L: number, side: number) {
  const k = Math.min(w / W, h / L) * 0.94;
  const ox = (w - W * k) / 2;
  const oy = (h - L * k) / 2;
  return {
    k,
    to: (x: number, y: number): [number, number] =>
      side === 0 ? [ox + x * k, oy + (L - y) * k] : [ox + (W - x) * k, oy + y * k],
    from: (px: number, py: number): [number, number] =>
      side === 0 ? [(px - ox) / k, L - (py - oy) / k] : [W - (px - ox) / k, (py - oy) / k],
  };
}
export const hockeyView = (w: number, h: number, side: number) => view(w, h, HOCKEY.W, HOCKEY.L, side);
export const foosView = (w: number, h: number, side: number) => view(w, h, FOOS.W, FOOS.L, side);

/** The air hockey table: the rink, its lines and goals, the puck, the two mallets (mine red). */
export function drawHockey(g: CanvasRenderingContext2D, w: number, h: number, s: number[], side: number) {
  const { W, L, puck, mallet, goal } = HOCKEY;
  const v = hockeyView(w, h, side);
  g.clearRect(0, 0, w, h);
  const [x0, y0] = v.to(0, L);
  const [x1, y1] = v.to(W, 0);
  g.fillStyle = C.rink;
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  g.strokeStyle = C.line;
  g.lineWidth = 2;
  const [mx0, my] = v.to(0, L / 2);
  const [mx1] = v.to(W, L / 2);
  g.beginPath();
  g.moveTo(mx0, my);
  g.lineTo(mx1, my);
  g.stroke();
  const [cx, cy] = v.to(W / 2, L / 2);
  g.beginPath();
  g.arc(cx, cy, 0.12 * v.k, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = C.black;
  for (const y of [0, L]) {
    const [gx0, gy] = v.to(W / 2 - goal / 2, y);
    const [gx1] = v.to(W / 2 + goal / 2, y);
    g.fillRect(Math.min(gx0, gx1), gy - 4, Math.abs(gx1 - gx0), 8);
  }
  const disc = (x: number, y: number, r: number, col: string) => {
    const [px, py] = v.to(x, y);
    g.fillStyle = col;
    g.beginPath();
    g.arc(px, py, r * v.k, 0, Math.PI * 2);
    g.fill();
  };
  disc(s[2], s[3], mallet, side === 0 ? C.mine : C.theirs);
  disc(s[4], s[5], mallet, side === 1 ? C.mine : C.theirs);
  disc(s[0], s[1], puck, C.puck);
}

/** The foosball pitch: its lines and goals, the rods and their men (mine red), the ball. */
export function drawFoos(g: CanvasRenderingContext2D, w: number, h: number, s: number[], side: number) {
  const { W, L, ball, foot, goal } = FOOS;
  const v = foosView(w, h, side);
  g.clearRect(0, 0, w, h);
  const [x0, y0] = v.to(0, L);
  const [x1, y1] = v.to(W, 0);
  g.fillStyle = C.wood;
  g.fillRect(Math.min(x0, x1) - 8, Math.min(y0, y1) - 8, Math.abs(x1 - x0) + 16, Math.abs(y1 - y0) + 16);
  g.fillStyle = C.pitch;
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  g.strokeStyle = C.pitchLine;
  g.lineWidth = 2;
  const [lx0, ly] = v.to(0, L / 2);
  const [lx1] = v.to(W, L / 2);
  g.beginPath();
  g.moveTo(lx0, ly);
  g.lineTo(lx1, ly);
  g.stroke();
  g.fillStyle = C.black;
  for (const y of [0, L]) {
    const [gx0, gy] = v.to(W / 2 - goal / 2, y);
    const [gx1] = v.to(W / 2 + goal / 2, y);
    g.fillRect(Math.min(gx0, gx1), gy - 5, Math.abs(gx1 - gx0), 10);
  }
  const state = {
    ball: { x: s[0], y: s[1], vx: 0, vy: 0 },
    slide: [s[2], s[3]] as [number, number],
    kick: [s[4], s[5]] as [number, number],
    score: [0, 0] as [number, number],
  };
  for (const sd of [0, 1] as const) {
    // the rods across, then their men
    g.strokeStyle = C.rod;
    g.lineWidth = 3;
    for (const rod of RODS) {
      const y = sd === 0 ? rod.y : L - rod.y;
      const [a, py] = v.to(-0.02, y);
      const [b] = v.to(W + 0.02, y);
      g.beginPath();
      g.moveTo(a, py);
      g.lineTo(b, py);
      g.stroke();
    }
    g.fillStyle = sd === side ? C.mine : C.theirs;
    const kicking = state.kick[sd] >= 0;
    for (const [mx, my] of menOf(state, sd)) {
      const [px, py] = v.to(mx, my + (kicking ? (sd === 0 ? 1 : -1) * foot : 0));
      g.fillRect(px - foot * v.k, py - foot * v.k * 0.7, foot * 2 * v.k, foot * 1.4 * v.k);
    }
  }
  const [bx, by] = v.to(s[0], s[1]);
  g.fillStyle = C.ball;
  g.beginPath();
  g.arc(bx, by, ball * v.k * 1.4, 0, Math.PI * 2);
  g.fill();
}
