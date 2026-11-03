// Air hockey (docs/plan/68-more-furniture.md, phase 21): the puck on its air, two mallets, a goal at
// each end — stepped by the server, its own clock, from where the players hold their mallets. In
// the table's own frame, metres: x across (0..W), y along (0..L); player 0's goal at y 0, player 1's
// at y L; each keeps their mallet on their own half.

export const HOCKEY = { W: 0.9, L: 1.8, puck: 0.035, mallet: 0.05, goal: 0.28, maxV: 6, drag: 0.25, wins: 7 };
export interface Hockey {
  puck: { x: number; y: number; vx: number; vy: number };
  mallets: [{ x: number; y: number }, { x: number; y: number }];
  score: [number, number];
  /** who scored last (it's served to the other), −1 none */
  last: number;
}

export function newHockey(): Hockey {
  const { W, L } = HOCKEY;
  return {
    puck: { x: W / 2, y: L / 2, vx: 0, vy: 0 },
    mallets: [
      { x: W / 2, y: 0.2 },
      { x: W / 2, y: L - 0.2 },
    ],
    score: [0, 0],
    last: -1,
  };
}

/** A mallet held where its player wants it: on their own half, on the table. */
export function placeMallet(h: Hockey, who: 0 | 1, x: number, y: number): void {
  const { W, L, mallet } = HOCKEY;
  const y0 = who === 0 ? mallet : L / 2 + mallet;
  const y1 = who === 0 ? L / 2 - mallet : L - mallet;
  h.mallets[who] = { x: Math.max(mallet, Math.min(W - mallet, x)), y: Math.max(y0, Math.min(y1, y)) };
}

/** `dt` s of play: the puck slides, bounces off the rails and the mallets (moving from `was`, so a
 *  swing hits it), into a goal — then a point, and it's put back on the scored-on side. Returns who
 *  scored, or −1. */
export function stepHockey(h: Hockey, dt: number, was: Hockey["mallets"]): number {
  const { W, L, puck: r, mallet: R, goal, maxV, drag } = HOCKEY;
  const p = h.puck;
  const n = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / (r * 0.5)));
  const sdt = dt / n;
  for (let k = 0; k < n; k++) {
    p.x += p.vx * sdt;
    p.y += p.vy * sdt;
    if (p.x < r) {
      p.x = r;
      p.vx = Math.abs(p.vx) * 0.9;
    }
    if (p.x > W - r) {
      p.x = W - r;
      p.vx = -Math.abs(p.vx) * 0.9;
    }
    const inMouth = Math.abs(p.x - W / 2) < goal / 2;
    if (p.y < r && !inMouth) {
      p.y = r;
      p.vy = Math.abs(p.vy) * 0.9;
    }
    if (p.y > L - r && !inMouth) {
      p.y = L - r;
      p.vy = -Math.abs(p.vy) * 0.9;
    }
    for (const [i, m] of h.mallets.entries()) {
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d >= r + R || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      p.x = m.x + nx * (r + R);
      p.y = m.y + ny * (r + R);
      // (the mallet's own speed through the hit)
      const mvx = (m.x - was[i].x) / dt;
      const mvy = (m.y - was[i].y) / dt;
      const rel = (p.vx - mvx) * nx + (p.vy - mvy) * ny;
      if (rel < 0) {
        p.vx -= 1.9 * rel * nx;
        p.vy -= 1.9 * rel * ny;
      }
    }
  }
  const v = Math.hypot(p.vx, p.vy);
  if (v > maxV) {
    p.vx *= maxV / v;
    p.vy *= maxV / v;
  }
  const keep = Math.max(0, 1 - drag * dt);
  p.vx *= keep;
  p.vy *= keep;
  const scored = p.y < -r ? 1 : p.y > L + r ? 0 : -1;
  if (scored === 0 || scored === 1) {
    h.score[scored]++;
    h.last = scored;
    h.puck = { x: W / 2, y: scored === 1 ? L * 0.3 : L * 0.7, vx: 0, vy: 0 };
  }
  return scored;
}

export const hockeyWon = (h: Hockey): number => (h.score[0] >= HOCKEY.wins ? 0 : h.score[1] >= HOCKEY.wins ? 1 : -1);
