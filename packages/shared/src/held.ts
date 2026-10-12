// Things people carry: a mug from the coffee machine (later a cup of water, a
// soda, a snack). Held in the right hand and used little by little — sips on
// a schedule that follows from when it was taken (`heldAt`), so everyone sees
// the same sip at the same moment and the same coffee level.

export interface HeldDef {
  label: string;
  uses: number; // sips (or bites)
  first: number; // ms before the first one
  every: number; // ms between them
  linger: number; // ms it's kept once finished, before it's put away
  from: string[]; // the interactions that hand one out
}

export const HELD = {
  mug: { label: "Coffee", uses: 8, first: 2500, every: 7000, linger: 6000, from: ["coffee"] },
  cup: { label: "Water", uses: 5, first: 2000, every: 6000, linger: 4000, from: ["water"] },
  soda: { label: "Soda", uses: 6, first: 2200, every: 6500, linger: 5000, from: ["vending"] },
} as const satisfies Record<string, HeldDef>;

export type HeldKind = keyof typeof HELD;
export const isHeld = (k: unknown): k is HeldKind => typeof k === "string" && Object.hasOwn(HELD, k);

export const SIP_MS = 1500; // a sip: up to the mouth, a drink, back down

export interface HeldState {
  used: number; // sips taken (started)
  level: number; // 1 full … 0 empty (drops when a sip ends)
  sip: number; // progress through the current sip 0..1, or −1 between sips
  done: boolean; // finished and lingered: put away
}

// Where someone is with what they hold, `now − heldAt` ms after taking it.
export function heldState(kind: HeldKind, since: number): HeldState {
  const d: HeldDef = HELD[kind];
  const t = since - d.first;
  const started = t < 0 ? 0 : Math.min(d.uses, Math.floor(t / d.every) + 1);
  const into = t < 0 ? -1 : t - (started - 1) * d.every; // ms into the latest sip
  const sip = started > 0 && into < SIP_MS ? into / SIP_MS : -1;
  // a sip counts once it's been drunk (past its middle)
  const drunk = started - (sip >= 0 && sip < 0.55 ? 1 : 0);
  const end = d.first + (d.uses - 1) * d.every + SIP_MS;
  return { used: started, level: 1 - drunk / d.uses, sip, done: since > end + d.linger };
}
