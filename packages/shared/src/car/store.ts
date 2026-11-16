// A car's own storage (docs/plan/93-the-car-in-the-world.md S4): its boot and its glove box, kept on the car (its
// object's `props.boot`, `props.glove`) — what's put in stays with it, parked or driven, saved with it. Things in
// it as the pack has them: a stack (to its own most) or a weapon with its rounds. Pure: the server keeps it, the
// clients show it.
import { type ItemId, isStack, isWeapon, STACKS, WEAPONS } from "../inventory.ts";

export type StoreKind = "boot" | "glove";
/** how many things each holds */
export const STORE: Record<StoreKind, number> = { boot: 12, glove: 3 };

export interface Stored {
  id: ItemId;
  n: number;
  loaded?: number;
}

/** A car's store from its props (anything else: empty). */
export function storeOf(props: Record<string, unknown> | null | undefined, kind: StoreKind): Stored[] {
  const raw = props?.[kind];
  if (!Array.isArray(raw)) return [];
  const out: Stored[] = [];
  for (const r of raw) {
    const id = (r as Stored)?.id;
    const n = Math.floor(Number((r as Stored)?.n));
    if (isWeapon(id))
      out.push({ id, n: 1, loaded: Math.max(0, Math.min(WEAPONS[id].mag, Number((r as Stored).loaded) || 0)) });
    else if (isStack(id) && n > 0) out.push({ id, n: Math.min(n, STACKS[id]) });
    if (out.length >= STORE[kind]) break;
  }
  return out;
}

/** Put `it` in: onto a stack of the same with room first, then a place of its own. How many went in. */
export function putIn(store: Stored[], kind: StoreKind, it: Stored): number {
  if (isWeapon(it.id)) {
    if (store.length >= STORE[kind]) return 0;
    store.push({ id: it.id, n: 1, loaded: it.loaded ?? 0 });
    return 1;
  }
  if (!isStack(it.id)) return 0;
  const most = STACKS[it.id];
  let left = it.n;
  for (const s of store) {
    if (s.id !== it.id || left <= 0) continue;
    const k = Math.min(left, most - s.n);
    s.n += k;
    left -= k;
  }
  while (left > 0 && store.length < STORE[kind]) {
    const k = Math.min(left, most);
    store.push({ id: it.id, n: k });
    left -= k;
  }
  return it.n - left;
}

/** (plan 93 S6) Chains: how long fitting one to a wheel takes, and taking it off (ms); how near its outside
 *  you kneel (m). A car's chained wheels are `props.chains` (FL FR RL RR: bits 1 2 4 8). */
export const CHAIN_ON_MS = 6000;
export const CHAIN_OFF_MS = 4000;
export const CHAIN_REACH = 1.1;
export function chainsOf(props: Record<string, unknown> | null | undefined): number {
  const n = Number(props?.chains);
  return Number.isInteger(n) ? n & 15 : 0;
}
/** Where one kneels to a wheel `i` (FL FR RL RR) of a car parked at (x, y) heading a — out from its side. */
export function chainSpot(
  spec: { front: number; wheelbase: number; track: number; body: { width: number } },
  x: number,
  y: number,
  a: number,
  i: number,
): { x: number; y: number; a: number } {
  const u = i < 2 ? spec.front : -(spec.wheelbase - spec.front);
  // (the car's right is (−sin a, cos a): the left wheels (FL, RL) out to its left)
  const side = i % 2 === 0 ? -1 : 1;
  const w = side * (spec.body.width / 2 + 0.45);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // (facing the wheel: back toward the car)
  return { x: x + c * u - s * w, y: y + s * u + c * w, a: Math.atan2(-c * side, s * side) };
}
