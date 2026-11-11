// Plan 78 phase 4 — the hand library, in a real hand's terms: each shape as the angles at a finger's three
// joints (MCP the knuckle, PIP the middle, DIP the tip; degrees, as a real hand's are measured: 0 straight
// along the palm) and the thumb's two (its MCP and IP). The rig's numbers (chars/rig.ts HandShape: one curl
// for the fingers, one for the index, the thumb's fold) pick a place along it — open, relaxed, loose, grip,
// fist — so every clip's hands are these; a held thing names its own (rig.ts HANDS: mug, pad, phone, …).
// The life body turns each knuckle about its own hinge to the angle here less its rest's (chars/model.ts).
//
// The numbers (docs/plan/78-the-hands.md, references): relaxed, hanging — knuckles ~30°, middles ~25°,
// tips ~12° (the tip about half the middle); a cylinder grip — MCP ~50°, PIP ~50°, DIP ~28°; a fist —
// MCP ~88°, PIP ~100°, DIP ~50° (a real one's tip goes to ~72°; the life body's thicker fingers met the
// palm sooner).

/** One finger's joints (degrees) */
export interface FingerAngles {
  mcp: number;
  pip: number;
  dip: number;
}

/** The fingers along the rig's curl (rad): each shape where rig.ts HANDS puts its curl. */
const FINGERS: [number, FingerAngles][] = [
  [-0.3, { mcp: -15, pip: 0, dip: 0 }], // (bent back: a hand pressed flat on a wall)
  [0.05, { mcp: 4, pip: 4, dip: 2 }], // open, flat
  [0.45, { mcp: 30, pip: 25, dip: 12 }], // relaxed
  [0.85, { mcp: 42, pip: 40, dip: 22 }], // loose
  [1.15, { mcp: 50, pip: 50, dip: 28 }], // grip: round a cylinder (a mug's body, a rail)
  // (plan 78 phase 6: the tips eased off a real fist's ~72° — on the life body's fingers the index's tip curled
  // on through the palm and out of the back of the hand, a sliver of nail on top of the fist)
  [1.5, { mcp: 88, pip: 100, dip: 50 }], // fist
  [1.8, { mcp: 95, pip: 108, dip: 58 }], // (the little finger's cascade past a fist)
];

/** The thumb's two joints along the rig's thumb fold (rad); its base keeps the rig's swing. */
const THUMB: [number, { mcp: number; ip: number }][] = [
  [-0.35, { mcp: -5, ip: -12 }], // thumbs up: straight, a little back
  [0, { mcp: 0, ip: 0 }],
  [0.2, { mcp: 6, ip: 8 }], // on top of a pad's grip
  [0.45, { mcp: 14, ip: 15 }],
  [0.7, { mcp: 20, ip: 18 }], // relaxed, by the index
  [0.95, { mcp: 40, ip: 50 }], // over a fist's fingers
];

function along<T extends object>(table: [number, T][], x: number): T {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [b, vb] = table[i];
    if (x <= b) {
      const [a, va] = table[i - 1];
      const u = (x - a) / (b - a);
      const A = va as Record<string, number>;
      const B = vb as Record<string, number>;
      const out: Record<string, number> = {};
      for (const k of Object.keys(A)) out[k] = A[k] + (B[k] - A[k]) * u;
      return out as T;
    }
  }
  return table[table.length - 1][1];
}

/** A finger's joints at a curl of the rig's (rad) */
export const fingerAt = (curl: number): FingerAngles => along(FINGERS, curl);
/** The thumb's at its fold */
export const thumbAt = (fold: number) => along(THUMB, fold);
