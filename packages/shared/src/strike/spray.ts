// The Strike Park's spray patterns (docs/plan/118-the-strike-park-polished.md, F5a): where each round of a spray goes,
// off the crosshair — the same every time, so it can be learnt and pulled against (CS's: the AK climbs for its first
// ten or so, then swings left and right). Only in the park: the world's guns keep their own feel. The first shot goes
// where the crosshair is; a pause (the gun's recovery) and the next spray starts again from the first.

/** [yaw, pitch] off the crosshair (rad; pitch up +, yaw to the right +) of each round of a spray, from the first. */
export type Spray = readonly (readonly [number, number])[];

function build(n: number, step: (i: number) => [number, number]): Spray {
  const out: [number, number][] = [[0, 0]];
  let y = 0;
  let p = 0;
  for (let i = 1; i < n; i++) {
    const [dy, dp] = step(i);
    y += dy;
    p += dp;
    out.push([y, p]);
  }
  return out;
}

export const SPRAYS: Record<string, Spray> = {
  // (the AK: up hard for nine rounds — about 5° —, a drift left over the next eight, a swing right, back left)
  ak47: build(30, (i) => {
    if (i < 10) return [i < 4 ? 0.001 : -0.0015, 0.0135 - i * 0.0009];
    if (i < 18) return [-0.0055, 0.0012];
    if (i < 24) return [0.0085, 0.0006];
    return [-0.0045, 0.0004];
  }),
  // (the revolver fanned: each round a little higher, a touch right)
  revolver: build(6, () => [0.0012, 0.011]),
  // (the double-barrel's second barrel: up)
  shotgun: build(2, () => [0, 0.018]),
};

/** The offset of round `n` (0 the first) of a spray with `gun`; none past its pattern's end beyond the last. */
export function sprayAt(gun: string, n: number): readonly [number, number] {
  const s = SPRAYS[gun];
  if (!s || n <= 0) return [0, 0];
  return s[Math.min(n, s.length - 1)];
}

/** Seconds without a shot after which a spray starts again from its first round. */
export const sprayReset = (rate: number) => Math.max(0.32, rate * 2.2);
