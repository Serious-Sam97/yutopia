// Each car's body: the box round it, from its centre of gravity (m) — on its own so the walk
// grid (a parked car's solid, shared grid.ts) needn't carry the rest of the specs.
export const CAR_BODY = {
  sedan: { ahead: 2.32, behind: 2.58, width: 1.86, height: 1.53 },
  offroad: { ahead: 1.9, behind: 2.0, width: 1.7, height: 1.66 },
};
