// Foosball (docs/plan/68-more-furniture.md, phase 22): the ball on the pitch, each side's four rods
// of little players slid across together by its player and kicked — stepped by the server from the
// players' hands. In the table's own frame, metres: x across (0..W), y along (0..L); side 0 defends
// the goal at y 0, side 1 the one at y L.

export const FOOS = { W: 0.68, L: 1.16, ball: 0.017, foot: 0.022, goal: 0.2, maxV: 5, drag: 0.35, kick: 3.2, wins: 5 };
/** Each side's rods: how far along (y, from its own end) and how many players on it. */
export const RODS: { y: number; men: number }[] = [
  { y: 0.08, men: 1 },
  { y: 0.23, men: 2 },
  { y: 0.53, men: 5 },
  { y: 0.83, men: 3 },
];
export interface Foos {
  ball: { x: number; y: number; vx: number; vy: number };
  /** each side's rods slid across, −1..1 */
  slide: [number, number];
  /** each side kicking (s since, or −1) */
  kick: [number, number];
  score: [number, number];
}

export function newFoos(): Foos {
  return { ball: { x: FOOS.W / 2, y: FOOS.L / 2, vx: 0.4, vy: 0.2 }, slide: [0, 0], kick: [-1, -1], score: [0, 0] };
}

/** Where a side's men are: [x, y] each, on the table. */
export function menOf(f: Foos, side: 0 | 1): [number, number][] {
  const { W, L } = FOOS;
  const out: [number, number][] = [];
  for (const rod of RODS) {
    const y = side === 0 ? rod.y : L - rod.y;
    const gap = W / (rod.men + 1);
    const travel = gap * 0.45;
    for (let k = 0; k < rod.men; k++) out.push([gap * (k + 1) + f.slide[side] * travel, y]);
  }
  return out;
}

/** `dt` s of play: the ball rolls, off the walls, off the men — a man kicking sends it hard up the
 *  table — into a goal: a point, and a new ball from the middle. Returns who scored, or −1. */
export function stepFoos(f: Foos, dt: number): number {
  const { W, L, ball: r, foot, goal, maxV, drag, kick } = FOOS;
  const b = f.ball;
  for (const s of [0, 1] as const)
    if (f.kick[s] >= 0) {
      f.kick[s] += dt;
      if (f.kick[s] > 0.25) f.kick[s] = -1;
    }
  const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (r * 0.5)));
  const sdt = dt / n;
  for (let k = 0; k < n; k++) {
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;
    if (b.x < r || b.x > W - r) {
      b.x = Math.max(r, Math.min(W - r, b.x));
      b.vx = -b.vx * 0.85;
    }
    const mouth = Math.abs(b.x - W / 2) < goal / 2;
    if ((b.y < r || b.y > L - r) && !mouth) {
      b.y = Math.max(r, Math.min(L - r, b.y));
      b.vy = -b.vy * 0.85;
    }
    for (const s of [0, 1] as const)
      for (const [mx, my] of menOf(f, s)) {
        const dx = b.x - mx;
        const dy = b.y - my;
        if (Math.abs(dx) > foot + r || Math.abs(dy) > foot + r) continue;
        const up = s === 0 ? 1 : -1;
        if (f.kick[s] >= 0 && f.kick[s] < 0.12) {
          // a kick: up the table, a little off where it struck the foot
          b.vy = up * kick;
          b.vx += (dx / foot) * 0.8;
          b.y = my + up * (foot + r);
        } else if (Math.abs(dy) >= Math.abs(dx)) {
          // (off its front or back)
          const sy = Math.sign(dy || up);
          b.vy = sy * Math.max(Math.abs(b.vy) * 0.8, 0.2);
          b.y = my + sy * (foot + r);
        } else {
          const sx = Math.sign(dx);
          b.vx = sx * Math.max(Math.abs(b.vx) * 0.8, 0.2);
          b.x = mx + sx * (foot + r);
        }
      }
  }
  const v = Math.hypot(b.vx, b.vy);
  if (v > maxV) {
    b.vx *= maxV / v;
    b.vy *= maxV / v;
  }
  const keep = Math.max(0, 1 - drag * dt);
  b.vx *= keep;
  b.vy *= keep;
  const scored = b.y < -r ? 1 : b.y > L + r ? 0 : -1;
  if (scored === 0 || scored === 1) {
    f.score[scored]++;
    f.ball = { x: W / 2, y: L / 2, vx: (scored ? -1 : 1) * 0.3, vy: (scored ? -1 : 1) * 0.25 };
  }
  return scored;
}

export const foosWon = (f: Foos): number => (f.score[0] >= FOOS.wins ? 0 : f.score[1] >= FOOS.wins ? 1 : -1);
