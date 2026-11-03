// The claw machine (docs/plan/68-more-furniture.md, phase 25): its prizes lying in the pit (by the
// machine's id, the same for everyone), the claw steered over them and dropped; it grips the one
// under it if it's close enough to the middle and the grip holds — a pet toy won, in hand.

export const CLAW_TOYS = ["ball", "frisbee", "rope", "feather"] as const;
export type ClawToy = (typeof CLAW_TOYS)[number];
export interface Prize {
  toy: ClawToy;
  /** in the pit, 0..1 across and back */
  x: number;
  z: number;
}
/** How near the middle of a prize the claw comes down to have a chance at it. */
export const CLAW_REACH = 0.11;

const rnd = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hash = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** The prizes in a machine: nine, scattered, never on top of each other. */
export function prizesOf(id: string, taken = 0): Prize[] {
  const h = hash(id);
  const out: Prize[] = [];
  for (let i = 0; out.length < 9 && i < 200; i++) {
    const x = 0.12 + rnd(h + i * 3.1) * 0.76;
    const z = 0.12 + rnd(h + i * 5.7 + 1) * 0.76;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.16)) continue;
    out.push({ toy: CLAW_TOYS[(h + i + taken) % CLAW_TOYS.length], x, z });
  }
  return out;
}

/** The claw down at (x, z): the prize it grips (its index), or −1; `roll` 0..1 the grip's luck —
 *  dead over a prize three in four hold, at the edge of its reach one in four. */
export function clawDrop(prizes: Prize[], x: number, z: number, roll: number): number {
  let best = -1;
  let d0 = CLAW_REACH;
  for (const [i, p] of prizes.entries()) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < d0) {
      d0 = d;
      best = i;
    }
  }
  if (best < 0) return -1;
  const hold = 0.75 - 0.5 * (d0 / CLAW_REACH);
  return roll < hold ? best : -1;
}
