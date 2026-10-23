// Each car's body: the box round it, from its centre of gravity (m) — on its own so the walk
// grid (a parked car's solid, shared grid.ts) needn't carry the rest of the specs.
export const CAR_BODY = {
  sedan: { ahead: 2.32, behind: 2.58, width: 1.86, height: 1.53 },
  offroad: { ahead: 1.9, behind: 2.0, width: 1.7, height: 1.66 },
  pickup: { ahead: 2.36, behind: 2.84, width: 1.88, height: 1.68 },
  snowmobile: { ahead: 1.3, behind: 1.7, width: 1.15, height: 1.15 },
  snowcat: { ahead: 2.2, behind: 2.4, width: 2.4, height: 2.7 },
  ploughtruck: { ahead: 3.6, behind: 3.0, width: 2.5, height: 3.0 },
  tractor: { ahead: 1.75, behind: 1.55, width: 1.9, height: 2.4 },
  toboggan: { ahead: 0.75, behind: 1.05, width: 0.6, height: 0.35 },
};

/** A car object's model (its props.model): which car it is (none: the sedan). */
export const carKindOf = (model: unknown): keyof typeof CAR_BODY =>
  typeof model === "string" && model !== "sedan" && model in CAR_BODY ? (model as keyof typeof CAR_BODY) : "sedan";
